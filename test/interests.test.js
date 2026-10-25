import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyInterestEvent,
  decayedActivity,
  evolveInterests,
  interestView,
  normalizeAliases,
  normalizeInterestName,
  rankInterests,
  requireTopic,
} from '../src/interests.js';
import { T0 } from './helpers.js';

function interest(overrides = {}) {
  return {
    id: 'interest:1',
    name: '编程',
    normalizedName: '编程',
    aliases: ['coding', 'programming'],
    baseline: 60,
    activity: 20,
    lastEventAt: new Date(T0).toISOString(),
    createdAt: new Date(T0).toISOString(),
    updatedAt: new Date(T0).toISOString(),
    revision: 1,
    source: 'manual',
    manual: true,
    disabled: false,
    ...overrides,
  };
}

test('topic and alias normalization is deterministic', () => {
  assert.equal(normalizeInterestName('  #Coding!! '), 'coding');
  assert.equal(normalizeInterestName('  ＣＯＤＩＮＧ  '), 'coding');
  assert.deepEqual(normalizeAliases(['Coding', 'coding', ' Programming ']), ['coding', 'programming']);
  assert.equal(requireTopic('  SQLite  '), 'SQLite');
  assert.throws(() => requireTopic('https://example.com'), /URL/);
  assert.throws(() => requireTopic(''), /1-60/);
});

test('recent activity decays on its own half-life while baseline is unchanged', () => {
  const item = interest({ activity: 80, lastEventAt: new Date(T0).toISOString() });
  const afterHalf = decayedActivity(item, T0 + 4320 * 60_000, 4320);
  assert.ok(Math.abs(afterHalf - 40) < 0.001);
  assert.equal(item.baseline, 60);
});

test('manual baseline is not overwritten by event activity', () => {
  const item = interest({ baseline: 80, activity: 0, manual: true });
  const result = applyInterestEvent(item, {
    delta: 10,
    nowMs: T0 + 1000,
    source: 'life',
    halfLifeMinutes: 4320,
  });
  assert.equal(result.interest.baseline, 80);
  assert.ok(result.interest.activity > 0);
  assert.ok(result.applied > 0);
});

test('automatic interest learning shifts baseline only slightly', () => {
  const item = interest({ baseline: 20, activity: 0, manual: false, source: 'event' });
  const result = applyInterestEvent(item, {
    delta: 10,
    nowMs: T0 + 1000,
    source: 'life',
    halfLifeMinutes: 4320,
  });
  assert.ok(result.interest.baseline > 20);
  assert.ok(result.interest.baseline - 20 < 1);
});

test('a backward clock never moves an interest last-event time backward', () => {
  const last = new Date(T0 + 3_600_000).toISOString();
  const result = applyInterestEvent(interest({ activity: 10, lastEventAt: last }), {
    delta: 3,
    nowMs: T0,
    source: 'event',
    halfLifeMinutes: 4320,
  });
  assert.equal(result.interest.lastEventAt, last);
  assert.ok(result.interest.activity > 10);
});

test('activity saturates instead of growing without bound', () => {
  let item = interest({ activity: 0, baseline: 60, manual: true });
  let lastApplied = Infinity;
  for (let i = 0; i < 20; i += 1) {
    const result = applyInterestEvent(item, {
      delta: 12,
      nowMs: T0 + i * 60_000,
      source: 'event',
      halfLifeMinutes: 4320,
    });
    item = result.interest;
    assert.ok(item.activity <= 100);
    lastApplied = result.applied;
  }
  assert.ok(lastApplied < 12);
});

test('aliases merge into the canonical interest and new topics are created', () => {
  const result = evolveInterests([interest({ activity: 0 })], {
    topic: 'Coding',
    delta: 5,
    nowMs: T0 + 1000,
    source: 'event',
    halfLifeMinutes: 4320,
    maxInterests: 30,
  });
  assert.equal(result.interests.length, 1);
  assert.equal(result.matched.name, '编程');
  assert.ok(result.matched.activity > 0);

  const added = evolveInterests(result.interests, {
    topic: '音乐',
    delta: 4,
    nowMs: T0 + 2000,
    source: 'event',
    halfLifeMinutes: 4320,
    maxInterests: 30,
  });
  assert.equal(added.interests.length, 2);
});

test('max entries keeps manual and higher-scored interests', () => {
  const list = [
    interest({ id: 'manual', name: '手动', normalizedName: '手动', baseline: 90, activity: 0, manual: true }),
    interest({ id: 'low', name: '低', normalizedName: '低', baseline: 5, activity: 0, manual: false }),
    interest({ id: 'high', name: '高', normalizedName: '高', baseline: 70, activity: 0, manual: false }),
  ];
  const ranked = rankInterests(list, 2);
  assert.equal(ranked.length, 2);
  assert.ok(ranked.some((item) => item.id === 'manual'));
  assert.ok(ranked.some((item) => item.id === 'high'));
});

test('public interest views separate baseline and decayed activity', () => {
  const view = interestView(interest({ activity: 40 }), T0 + 4320 * 60_000, 4320);
  assert.equal(view.baseline, 60);
  assert.ok(Math.abs(view.activity - 20) < 0.001);
  assert.equal(view.manual, true);
  assert.equal(view.source, 'manual');
});
