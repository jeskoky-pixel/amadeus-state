/**
 * Deterministic Mood / Energy / Curiosity engine.
 *
 * Every function in this module is pure: it uses only its arguments, never a
 * clock, random source, model, GUI, or database.  Callers inject the current
 * time.  Persistence and authorization live outside this file.
 */

import { influenceWeight } from './config.js';
import {
  EVENT_EFFECTS,
  RANGES,
  clamp,
  iso,
  parseTimestamp,
  round,
} from './model.js';

const DAY_MS = 86_400_000;
const MAX_ELAPSED_MS = 3_650 * DAY_MS;
const BASELINE_HALF_LIFE_MS = 14 * DAY_MS;

/** @typedef {import('./config.js').StateConfig} StateConfig */

/**
 * Start-of-life snapshot for one scope.
 * @param {StateConfig} cfg - effective configuration.
 * @param {number} nowMs - current epoch milliseconds.
 * @returns {Record<string, unknown>} snapshot.
 */
export function initialState(cfg, nowMs) {
  return {
    mood: round(cfg.moodBaseline),
    energy: round(cfg.energyBaseline),
    curiosity: round(cfg.curiosityBaseline),
    baselineMood: round(cfg.moodBaseline),
    baselineEnergy: round(cfg.energyBaseline),
    baselineCuriosity: round(cfg.curiosityBaseline),
    updatedAt: iso(nowMs),
    revision: 1,
    clockAnomalyAt: null,
  };
}

/**
 * Exponential recovery toward a target.
 * @param {number} value - current value.
 * @param {number} target - target value.
 * @param {number} halfLifeMs - positive half-life.
 * @param {number} elapsedMs - elapsed time.
 * @returns {number} recovered value.
 */
function recover(value, target, halfLifeMs, elapsedMs) {
  if (target === value || !(elapsedMs > 0) || !(halfLifeMs > 0)) return value;
  const factor = Math.pow(0.5, elapsedMs / halfLifeMs);
  return target + (value - target) * factor;
}

/**
 * Advance a snapshot using real elapsed time.
 *
 * A backward clock never moves state backward: elapsed time is treated as zero
 * and the anomaly is reported for the audit/health surface.  Long offline
 * periods approach (but never cross) the baseline.
 *
 * @param {Record<string, any>} state - stored snapshot.
 * @param {StateConfig} cfg - effective configuration.
 * @param {number} nowMs - current epoch milliseconds.
 * @returns {Record<string, any>} advanced snapshot plus `clockAnomaly` flag.
 */
export function advanceState(state, cfg, nowMs) {
  const previous = parseTimestamp(state.updatedAt);
  let elapsed = nowMs - previous;
  let clockAnomaly = false;
  if (!Number.isFinite(elapsed) || elapsed < 0) {
    elapsed = 0;
    clockAnomaly = true;
  }
  if (elapsed > MAX_ELAPSED_MS) elapsed = MAX_ELAPSED_MS;
  if (!cfg.autoRecovery || elapsed <= 0) {
    return { ...state, clockAnomaly };
  }

  const speed = cfg.recoverySpeed;
  const moodHalf = (cfg.moodHalfLifeMinutes * 60_000) / speed;
  const energyHalf = (cfg.energyHalfLifeMinutes * 60_000) / speed;
  const curiosityHalf = (cfg.curiosityHalfLifeMinutes * 60_000) / speed;
  const baselineHalf = BASELINE_HALF_LIFE_MS / speed;

  const next = { ...state };
  // Baselines move toward their configured setpoints on a much slower scale,
  // so ordinary chats cannot rewrite the long-term底色.
  next.baselineMood = recover(state.baselineMood, cfg.moodBaseline, baselineHalf, elapsed);
  next.baselineEnergy = recover(state.baselineEnergy, cfg.energyBaseline, baselineHalf, elapsed);
  next.baselineCuriosity = recover(state.baselineCuriosity, cfg.curiosityBaseline, baselineHalf, elapsed);
  // Short-term values recover toward the baseline that was in force for this
  // interval.  This makes a read a pure function of (state, cfg, now).
  next.mood = recover(state.mood, state.baselineMood, moodHalf, elapsed);
  next.energy = recover(state.energy, state.baselineEnergy, energyHalf, elapsed);
  next.curiosity = recover(state.curiosity, state.baselineCuriosity, curiosityHalf, elapsed);

  next.mood = round(clamp(next.mood, RANGES.mood.min, RANGES.mood.max));
  next.energy = round(clamp(next.energy, RANGES.energy.min, RANGES.energy.max));
  next.curiosity = round(clamp(next.curiosity, RANGES.curiosity.min, RANGES.curiosity.max));
  next.baselineMood = round(clamp(next.baselineMood, RANGES.mood.min, RANGES.mood.max));
  next.baselineEnergy = round(clamp(next.baselineEnergy, RANGES.energy.min, RANGES.energy.max));
  next.baselineCuriosity = round(clamp(next.baselineCuriosity, RANGES.curiosity.min, RANGES.curiosity.max));
  next.updatedAt = iso(nowMs);
  next.clockAnomaly = clockAnomaly;
  if (clockAnomaly) next.clockAnomalyAt = iso(nowMs);
  return next;
}

/**
 * Marginal diminishing factor near a bound or far from baseline.
 * @param {number} current - current value.
 * @param {number} baseline - current baseline.
 * @param {{min:number,max:number,span:number}} range - state range.
 * @returns {number} factor in [0.3, 1].
 */
export function saturationFactor(current, baseline, range) {
  const distance = Math.abs(current - baseline) / range.span;
  const nearBound = Math.min(
    Math.abs(current - range.min) / range.span,
    Math.abs(range.max - current) / range.span,
  );
  return clamp(1 - 0.55 * Math.min(1, distance) - 0.3 * Math.min(1, nearBound), 0.3, 1);
}

/**
 * Apply a bounded event to a snapshot.
 *
 * The event's `source` determines how much of a model appraisal may modulate
 * the base effect.  `trusted` sources use the base effect; an untrusted model
 * appraisal is additionally capped to a small fraction.  Values are always
 * clamped to their ranges and per-event caps.
 *
 * @param {Record<string, any>} state - stored snapshot.
 * @param {StateConfig} cfg - effective configuration.
 * @param {Record<string, any>} event - type, occurredAt, appraisal, source, base.
 * @returns {{state: Record<string, any>, deltas: Record<string, number>, baselineDeltas: Record<string, number>, clockAnomaly: boolean, appliedAt: string}} result.
 */
export function applyEvent(state, cfg, event) {
  const occurredMs = Math.max(parseTimestamp(event.occurredAt), parseTimestamp(state.updatedAt));
  const advanced = advanceState(state, cfg, occurredMs);
  const base = event.base ?? EVENT_EFFECTS[event.type];
  if (!base) throw new Error(`unknown state event type: ${String(event.type)}`);

  const appraisal = event.appraisal && typeof event.appraisal === 'object' ? event.appraisal : {};
  const valence = clamp(Number(appraisal.valence ?? 0), -1, 1);
  const intensity = clamp(Number(appraisal.intensity ?? 0), 0, 1);
  const curiosityHint = clamp(Number(appraisal.curiosity ?? 0), -1, 1);
  const source = String(event.source ?? 'model_appraisal');
  const trustFactor = source === 'life' || source === 'host' || source === 'admin'
    ? 1
    : source === 'memory'
      ? 0.55
      : 0.5;
  // Host callers may request a stricter per-event weight (for example the
  // per-Session ceiling on a shared Workspace state).  It can only reduce an
  // effect, never amplify one.
  const scale = clamp(Number(event.scale ?? 1), 0, 1);

  const raw = {
    mood: (base.mood * cfg.eventSensitivity * trustFactor + valence * 4 * intensity * trustFactor) * scale,
    energy: (base.energy * cfg.eventSensitivity * trustFactor - intensity * 1.5 * trustFactor) * scale,
    curiosity: (base.curiosity * cfg.eventSensitivity * trustFactor + curiosityHint * 3 * intensity * trustFactor) * scale,
  };

  const deltas = {};
  const next = { ...advanced };
  for (const key of /** @type {const} */ (['mood', 'energy', 'curiosity'])) {
    const range = RANGES[key];
    const capKey = key === 'mood' ? 'maxEventDeltaMood' : key === 'energy' ? 'maxEventDeltaEnergy' : 'maxEventDeltaCuriosity';
    const capped = clamp(raw[key], -cfg[capKey], cfg[capKey]);
    const factor = saturationFactor(advanced[key], advanced[`baseline${key[0].toUpperCase()}${key.slice(1)}`], range);
    const before = advanced[key];
    const after = clamp(before + capped * factor, range.min, range.max);
    next[key] = round(after);
    deltas[key] = round(after - before);
  }

  const baselineDeltas = {};
  const baselineCaps = { mood: 1.5, energy: 1, curiosity: 1 };
  const baselineRates = { mood: 0.04, energy: 0.05, curiosity: 0.05 };
  for (const key of /** @type {const} */ (['mood', 'energy', 'curiosity'])) {
    const baselineKey = `baseline${key[0].toUpperCase()}${key.slice(1)}`;
    const range = RANGES[key];
    const before = advanced[baselineKey];
    const shift = clamp(deltas[key] * baselineRates[key], -baselineCaps[key], baselineCaps[key]);
    const after = clamp(before + shift, range.min, range.max);
    next[baselineKey] = round(after);
    baselineDeltas[key] = round(after - before);
  }

  next.updatedAt = iso(occurredMs);
  next.clockAnomaly = advanced.clockAnomaly === true;
  if (advanced.clockAnomaly) next.clockAnomalyAt = advanced.clockAnomalyAt ?? iso(occurredMs);
  return {
    state: next,
    deltas,
    baselineDeltas,
    clockAnomaly: advanced.clockAnomaly === true,
    appliedAt: iso(occurredMs),
  };
}

/**
 * Explain a snapshot in natural language (Chinese-first).
 * @param {Record<string, any>} state - snapshot.
 * @param {StateConfig} cfg - effective configuration.
 * @returns {{summary: string, mood: string, energy: string, curiosity: string, direction: Record<string,string>}} explanation.
 */
export function describeState(state, cfg) {
  const moodText = state.mood >= 35 ? '整体积极' : state.mood >= 10 ? '略偏正面' : state.mood <= -35 ? '明显低落' : state.mood <= -10 ? '略偏负面' : '平稳';
  const energyText = state.energy >= 75 ? '精力充沛' : state.energy >= 45 ? '精力尚可' : state.energy >= 20 ? '精力偏低' : '精力不足';
  const curiosityText = state.curiosity >= 75 ? '好奇心旺盛' : state.curiosity >= 45 ? '保持好奇' : state.curiosity >= 20 ? '较为平静' : '探索意愿较低';
  const direction = {
    mood: directionText(state.mood, state.baselineMood),
    energy: directionText(state.energy, state.baselineEnergy),
    curiosity: directionText(state.curiosity, state.baselineCuriosity),
  };
  const summary = `${moodText}，${energyText}，${curiosityText}。这些数值表示倾向，不是医学或心理测量。`;
  return { summary, mood: moodText, energy: energyText, curiosity: curiosityText, direction };
}

/**
 * @param {number} value - current value.
 * @param {number} baseline - baseline value.
 * @returns {string} relation label.
 */
function directionText(value, baseline) {
  const delta = value - baseline;
  if (Math.abs(delta) < 2) return '接近基准';
  return delta > 0 ? '高于基准' : '低于基准';
}

/**
 * A bounded, non-coercive tendency paragraph for model context.
 * The text never changes Persona, permissions, or Life's schedule.
 * @param {Record<string, any>} state - snapshot.
 * @param {StateConfig} cfg - effective configuration.
 * @returns {string} tendency text in Chinese.
 */
export function tendencyText(state, cfg) {
  if (cfg.influenceStrength === 'off') {
    return '状态仅用于观察，不改变行为倾向；仍以人格、用户请求、权限与调度为准。';
  }
  const parts = [];
  if (state.mood >= 20) parts.push('更容易以温和、开放的方式回应');
  else if (state.mood <= -20) parts.push('更倾向于简短、谨慎地表达，先确认需求再展开');
  else parts.push('语气保持平稳');

  if (state.energy <= 25) parts.push('更适合轻量、分步的任务；低精力不表示可以拒绝用户');
  else if (state.energy >= 70) parts.push('有余力承担较复杂或连续的探索');
  else parts.push('按任务实际需要安排投入');

  if (state.curiosity >= 65) parts.push('更容易被新主题吸引，可主动追问或继续了解');
  else if (state.curiosity <= 25) parts.push('更偏向熟悉、明确的任务，不强行发散');
  else parts.push('对新主题保持适度兴趣');

  // The influence setting is a bounded, explainable multiplier: it changes how
  // many tendency clauses appear in the suggestion, never permissions or
  // scheduling.
  const weight = influenceWeight(cfg);
  const clauseCount = weight >= 1.5 ? 3 : weight >= 1 ? 2 : 1;
  const strength = cfg.influenceStrength === 'subtle' ? '只作轻微暗示' : cfg.influenceStrength === 'strong' ? '倾向较明显，但仍不强制' : '作为适度倾向';
  return `${parts.slice(0, clauseCount).join('；')}。${strength}；不覆盖 Persona、权限或 Life 的调度。`;
}

/**
 * Preview one event against a snapshot without touching any database.
 * @param {Record<string, any>} state - snapshot.
 * @param {StateConfig} cfg - candidate configuration.
 * @param {string} eventType - event type.
 * @returns {Record<string, unknown>} before/after/deltas and explanation.
 */
export function previewEvent(state, cfg, eventType) {
  const result = applyEvent(state, cfg, {
    type: eventType,
    occurredAt: iso(parseTimestamp(state.updatedAt)),
    source: 'host',
    appraisal: {},
  });
  return {
    eventType,
    before: pickState(state),
    after: pickState(result.state),
    deltas: result.deltas,
    baselineDeltas: result.baselineDeltas,
    summary: describeState(result.state, cfg).summary,
  };
}

/**
 * @param {Record<string, any>} state - snapshot.
 * @returns {Record<string, number>} public numeric state.
 */
export function pickState(state) {
  return {
    mood: round(state.mood),
    energy: round(state.energy),
    curiosity: round(state.curiosity),
  };
}

/**
 * @param {Record<string, any>} state - snapshot.
 * @returns {Record<string, number>} public baseline.
 */
export function pickBaseline(state) {
  return {
    mood: round(state.baselineMood),
    energy: round(state.baselineEnergy),
    curiosity: round(state.baselineCuriosity),
  };
}
