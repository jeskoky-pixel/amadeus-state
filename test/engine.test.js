import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeConfig } from '../src/config.js';
import {
  advanceState,
  applyEvent,
  describeState,
  initialState,
  previewEvent,
  tendencyText,
} from '../src/engine.js';
import { T0 } from './helpers.js';

const cfg = normalizeConfig({});

function stateAt(overrides = {}) {
  return {
    ...initialState(cfg, T0),
    ...overrides,
  };
}

test('initial state uses configured baselines and is bounded', () => {
  const state = initialState(normalizeConfig({ moodBaseline: 20, energyBaseline: 70, curiosityBaseline: 30 }), T0);
  assert.equal(state.mood, 20);
  assert.equal(state.energy, 70);
  assert.equal(state.curiosity, 30);
  assert.equal(state.baselineMood, 20);
  assert.equal(state.updatedAt, new Date(T0).toISOString());
});

test('same state, event, and time produce the same result', () => {
  const state = stateAt({ mood: 30, energy: 50, curiosity: 70 });
  const left = applyEvent(state, cfg, {
    type: 'exploration_completed',
    occurredAt: new Date(T0 + 60_000).toISOString(),
    source: 'life',
    appraisal: { valence: 0.6, intensity: 0.8 },
  });
  const right = applyEvent(state, cfg, {
    type: 'exploration_completed',
    occurredAt: new Date(T0 + 60_000).toISOString(),
    source: 'life',
    appraisal: { valence: 0.6, intensity: 0.8 },
  });
  assert.deepEqual(left, right);
});

test('short-term state recovers halfway at its half-life', () => {
  const state = stateAt({ mood: 40, energy: 80, curiosity: 80, updatedAt: new Date(T0).toISOString() });
  const advanced = advanceState(state, cfg, T0 + cfg.moodHalfLifeMinutes * 60_000);
  assert.ok(Math.abs(advanced.mood - 20) < 0.001);
  const energy = advanceState(state, cfg, T0 + cfg.energyHalfLifeMinutes * 60_000);
  assert.ok(Math.abs(energy.energy - 70) < 0.001);
});

test('baseline recovers much more slowly than short-term state', () => {
  const state = stateAt({
    mood: 40,
    baselineMood: 40,
    updatedAt: new Date(T0).toISOString(),
  });
  const afterDay = advanceState(state, cfg, T0 + 86_400_000);
  const afterHalfBaseline = advanceState(state, cfg, T0 + 14 * 86_400_000);
  assert.ok(afterDay.baselineMood > 38, 'baseline should barely move in one day');
  assert.ok(Math.abs(afterHalfBaseline.baselineMood - 20) < 0.01, 'baseline should halve after its 14-day half-life');
});

test('clock rollback never moves state backward', () => {
  const state = stateAt({ mood: 20, updatedAt: new Date(T0 + 3_600_000).toISOString() });
  const advanced = advanceState(state, cfg, T0);
  assert.equal(advanced.mood, 20);
  assert.equal(advanced.clockAnomaly, true);
  assert.equal(advanced.updatedAt, state.updatedAt);
});

test('a very long offline period approaches but never crosses the baseline', () => {
  const state = stateAt({ mood: 100, energy: 100, curiosity: 0, updatedAt: new Date(T0).toISOString() });
  const advanced = advanceState(state, cfg, T0 + 3650 * 86_400_000);
  assert.ok(advanced.mood >= cfg.moodBaseline && advanced.mood < 0.01);
  assert.ok(advanced.energy >= cfg.energyBaseline && advanced.energy < 60.01);
  assert.ok(advanced.curiosity <= cfg.curiosityBaseline && advanced.curiosity > 54.99);
});

test('automatic recovery can be disabled without changing stored values', () => {
  const state = stateAt({ mood: 40, updatedAt: new Date(T0).toISOString() });
  const advanced = advanceState(state, normalizeConfig({ autoRecovery: false }), T0 + 86_400_000);
  assert.equal(advanced.mood, 40);
  assert.equal(advanced.updatedAt, state.updatedAt);
});

test('event effects are bounded by per-event caps and state ranges', () => {
  const state = stateAt({ mood: 99, energy: 99, curiosity: 99 });
  const result = applyEvent(state, cfg, {
    type: 'exploration_completed',
    occurredAt: new Date(T0 + 1000).toISOString(),
    source: 'life',
    appraisal: { valence: 1, intensity: 1, curiosity: 1 },
  });
  assert.ok(result.state.mood <= 100);
  assert.ok(result.state.energy <= 100);
  assert.ok(result.state.curiosity <= 100);
  assert.ok(Math.abs(result.deltas.mood) <= cfg.maxEventDeltaMood + 0.001);
  assert.ok(Math.abs(result.deltas.curiosity) <= cfg.maxEventDeltaCuriosity + 0.001);
});

test('saturation makes a second identical event smaller near a bound', () => {
  const base = stateAt({ mood: 0 });
  const first = applyEvent(base, cfg, {
    type: 'exploration_completed',
    occurredAt: new Date(T0 + 1000).toISOString(),
    source: 'life',
    appraisal: { valence: 1, intensity: 1 },
  });
  const second = applyEvent(first.state, cfg, {
    type: 'exploration_completed',
    occurredAt: new Date(T0 + 2000).toISOString(),
    source: 'life',
    appraisal: { valence: 1, intensity: 1 },
  });
  assert.ok(first.deltas.mood > 0);
  assert.ok(second.deltas.mood > 0);
  assert.ok(second.deltas.mood < first.deltas.mood * 1.1);
});

test('sensitivity scales raw effects while caps still apply', () => {
  const low = normalizeConfig({ eventSensitivity: 0.25 });
  const high = normalizeConfig({ eventSensitivity: 3 });
  const state = stateAt({ mood: 0, energy: 60, curiosity: 55 });
  const event = { type: 'meaningful_interaction', occurredAt: new Date(T0 + 1000).toISOString(), source: 'host', appraisal: {} };
  const lowResult = applyEvent(state, low, event);
  const highResult = applyEvent(state, high, event);
  assert.ok(highResult.deltas.mood > lowResult.deltas.mood);
});

test('description, direction, and tendency stay explanatory and non-coercive', () => {
  const state = stateAt({ mood: 50, energy: 10, curiosity: 80 });
  const explanation = describeState(state, cfg);
  assert.match(explanation.summary, /倾向|测量/);
  const text = tendencyText(state, cfg);
  assert.match(text, /不覆盖 Persona|不覆盖/);
  assert.doesNotMatch(text, /必须|命令/);
  const subtle = tendencyText(state, normalizeConfig({ influenceStrength: 'subtle' }));
  const strong = tendencyText(state, normalizeConfig({ influenceStrength: 'strong' }));
  assert.notEqual(subtle, strong);
  assert.match(tendencyText(state, normalizeConfig({ influenceStrength: 'off' })), /不改变行为倾向/);
});

test('preview is pure and does not move the source snapshot', () => {
  const state = stateAt({ mood: 10, energy: 40, curiosity: 50 });
  const before = JSON.stringify(state);
  const preview = previewEvent(state, cfg, 'exploration_completed');
  assert.equal(JSON.stringify(state), before);
  assert.equal(preview.eventType, 'exploration_completed');
  assert.ok(preview.after.curiosity >= preview.before.curiosity);
});
