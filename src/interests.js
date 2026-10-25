/**
 * Deterministic interest normalization and evolution.
 *
 * Long-term preference (`baseline`) changes slowly and is never overwritten by
 * ordinary events; recent activity (`activity`) decays quickly and saturates so
 * a high-frequency group chat cannot promote one topic without bound.
 */

import { clamp, round, stableHash } from './model.js';

const MAX_TOPIC_LENGTH = 60;
const MIN_TOPIC_LENGTH = 1;

/**
 * Normalize a topic or alias for matching.
 * @param {string} input - user/model text.
 * @returns {string} canonical lookup key.
 */
export function normalizeInterestName(input) {
  return String(input ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[\s#@、，,.;；:：!！?？'"“”‘’()（）[\]{}<>《》]+|[\s#@、，,.;；:：!！?？'"“”‘’()（）[\]{}<>《》]+$/g, '')
    .trim();
}

/**
 * Validate a topic without inventing one.
 * @param {unknown} input - candidate.
 * @param {string} [name] - field label.
 * @returns {string} trimmed topic.
 */
export function requireTopic(input, name = 'topic') {
  if (typeof input !== 'string') throw new Error(`${name} must be a string`);
  const topic = input.trim();
  if (topic.length < MIN_TOPIC_LENGTH || topic.length > MAX_TOPIC_LENGTH) {
    throw new Error(`${name} must be 1-${MAX_TOPIC_LENGTH} characters`);
  }
  if (/[\u0000-\u001f\u007f]/.test(topic)) throw new Error(`${name} contains control characters`);
  if (/https?:\/\//i.test(topic)) throw new Error(`${name} must not be a URL`);
  if (!normalizeInterestName(topic)) throw new Error(`${name} must contain letters or numbers`);
  return topic;
}

/**
 * @param {unknown} aliases - alias candidate.
 * @returns {string[]} unique normalized aliases.
 */
export function normalizeAliases(aliases) {
  if (aliases === undefined || aliases === null) return [];
  if (!Array.isArray(aliases)) throw new Error('aliases must be an array');
  const result = [];
  for (const entry of aliases) {
    if (typeof entry !== 'string') throw new Error('each alias must be a string');
    const alias = normalizeInterestName(entry);
    if (!alias || alias.length > 60) throw new Error('alias must be 1-60 characters');
    if (!result.includes(alias)) result.push(alias);
  }
  return result.slice(0, 20);
}

/**
 * Stable interest id for a scope and canonical name.
 * @param {string} scopeId - owning scope.
 * @param {string} name - canonical name.
 * @returns {string} id.
 */
export function interestIdFor(scopeId, name) {
  return `interest:${stableHash(`${scopeId}\u0000${normalizeInterestName(name)}`)}`;
}

/**
 * Recent-activity decay since the last update.
 * @param {Record<string, any>} interest - interest row/view.
 * @param {number} nowMs - current time.
 * @param {number} halfLifeMinutes - activity half-life.
 * @returns {number} decayed activity.
 */
export function decayedActivity(interest, nowMs, halfLifeMinutes) {
  const last = Date.parse(interest.lastEventAt ?? interest.updatedAt);
  if (!Number.isFinite(last) || nowMs <= last) return round(Number(interest.activity ?? 0));
  const halfLife = Math.max(1, Number(halfLifeMinutes)) * 60_000;
  const factor = Math.pow(0.5, (nowMs - last) / halfLife);
  return round(clamp(Number(interest.activity ?? 0) * factor, 0, 100));
}

/**
 * Apply one event to an interest with saturation and slow baseline learning.
 * @param {Record<string, any>} interest - existing interest (or a fresh shell).
 * @param {{delta: number, nowMs: number, source: string, sourceRef?: string, halfLifeMinutes: number, manual?: boolean}} change - change.
 * @returns {{interest: Record<string, any>, applied: number, baselineApplied: number}} updated interest.
 */
export function applyInterestEvent(interest, change) {
  const previous = Date.parse(interest.lastEventAt ?? interest.updatedAt);
  const nowMs = Number.isFinite(previous) ? Math.max(change.nowMs, previous) : change.nowMs;
  const activityBefore = decayedActivity(interest, nowMs, change.halfLifeMinutes);
  const raw = clamp(Number(change.delta) || 0, -20, 20);
  const headroom = 1 - clamp(activityBefore / 100, 0, 1) * 0.6;
  const applied = round(raw * headroom);
  const activity = round(clamp(activityBefore + applied, 0, 100));
  const manual = interest.manual === true || interest.source === 'manual' || change.manual === true;
  const baselineBefore = round(clamp(Number(interest.baseline ?? 0), 0, 100));
  const baselineApplied = manual ? 0 : round(clamp(applied * 0.02, -2, 2));
  const baseline = round(clamp(baselineBefore + baselineApplied, 0, 100));
  return {
    interest: {
      ...interest,
      activity,
      baseline,
      lastEventAt: new Date(nowMs).toISOString(),
      updatedAt: new Date(nowMs).toISOString(),
      revision: Number(interest.revision ?? 1) + 1,
      source: interest.source ?? change.source ?? 'event',
      sourceRef: change.sourceRef ?? interest.sourceRef ?? null,
      manual,
    },
    applied: round(activity - activityBefore),
    baselineApplied,
  };
}

/**
 * Score used only for deterministic ordering and max-entry pruning.
 * @param {Record<string, any>} interest - interest.
 * @returns {number} score.
 */
export function interestScore(interest) {
  return Number(interest.baseline ?? 0) + Number(interest.activity ?? 0) * 0.8 + (interest.manual ? 12 : 0);
}

/**
 * Top interests by score, with deterministic name tie-break.
 * @param {Record<string, any>[]} interests - interests.
 * @param {number} limit - maximum.
 * @returns {Record<string, any>[]} sorted slice.
 */
export function rankInterests(interests, limit) {
  return [...interests]
    .sort((a, b) => {
      const diff = interestScore(b) - interestScore(a);
      if (diff !== 0) return diff;
      return String(a.normalizedName ?? a.name).localeCompare(String(b.normalizedName ?? b.name));
    })
    .slice(0, Math.max(0, limit));
}

/**
 * Merge a new event topic into an existing interest list in memory.
 * The store is the writer; this helper only computes the result and exposes
 * deterministic behavior to tests and the preview path.
 * @param {Record<string, any>[]} interests - existing interests.
 * @param {{topic: string, delta: number, nowMs: number, source: string, sourceRef?: string, halfLifeMinutes: number, maxInterests: number}} input - event.
 * @returns {{interests: Record<string, any>[], matched: Record<string, any>|null, applied: number}} result.
 */
export function evolveInterests(interests, input) {
  const topic = requireTopic(input.topic);
  const normalized = normalizeInterestName(topic);
  const list = interests.map((interest) => ({
    ...interest,
    activity: decayedActivity(interest, input.nowMs, input.halfLifeMinutes),
  }));
  let matched = list.find(
    (interest) =>
      !interest.disabled &&
      (interest.normalizedName === normalized ||
        (Array.isArray(interest.aliases) && interest.aliases.includes(normalized))),
  );
  if (!matched) {
    matched = {
      id: interestIdFor('preview', topic),
      name: topic,
      normalizedName: normalized,
      aliases: [],
      baseline: 0,
      activity: 0,
      lastEventAt: null,
      createdAt: new Date(input.nowMs).toISOString(),
      updatedAt: new Date(input.nowMs).toISOString(),
      revision: 1,
      source: input.source,
      sourceRef: input.sourceRef ?? null,
      manual: false,
      disabled: false,
    };
    list.push(matched);
  }
  const result = applyInterestEvent(matched, {
    delta: input.delta,
    nowMs: input.nowMs,
    source: input.source,
    sourceRef: input.sourceRef,
    halfLifeMinutes: input.halfLifeMinutes,
  });
  matched = result.interest;
  const index = list.findIndex((entry) => entry.id === matched.id);
  if (index >= 0) list[index] = matched;
  else list.push(matched);
  if (list.length > input.maxInterests) {
    const ranked = rankInterests(list, input.maxInterests);
    const keep = new Set(ranked.map((entry) => entry.id));
    return {
      interests: list.filter((entry) => keep.has(entry.id)),
      matched,
      applied: result.applied,
    };
  }
  return { interests: list, matched, applied: result.applied };
}

/**
 * A compact public view. No source evidence beyond a bounded label.
 * @param {Record<string, any>} interest - interest.
 * @param {number} nowMs - current time.
 * @param {number} halfLifeMinutes - activity half-life.
 * @returns {Record<string, unknown>} view.
 */
export function interestView(interest, nowMs, halfLifeMinutes) {
  return {
    id: interest.id,
    name: interest.name,
    baseline: round(clamp(Number(interest.baseline ?? 0), 0, 100)),
    activity: decayedActivity(interest, nowMs, halfLifeMinutes),
    source: interest.manual ? 'manual' : interest.source ?? 'event',
    manual: interest.manual === true || interest.source === 'manual',
    disabled: interest.disabled === true,
    aliases: Array.isArray(interest.aliases) ? [...interest.aliases] : [],
    updatedAt: interest.updatedAt,
    lastEventAt: interest.lastEventAt ?? null,
    revision: Number(interest.revision ?? 1),
  };
}
