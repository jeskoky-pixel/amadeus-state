/**
 * Deterministic post-turn evolution regressions.  The observer only consumes
 * trusted structured Session events; no model/provider is loaded.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { makeService, fakeWorkspaceRegistry, T0 } from './helpers.js';
import { registerSessionObserver } from '../src/index.js';

function bind(h) {
  return h.service.bindWorkspace({ workspaceId: 'ws-alpha' });
}

function observeToolTurn(h, sessionId, turn, seq = turn * 10) {
  h.service.observeSessionEvent({ id: sessionId }, { type: 'turn/start', data: { turn }, seq: seq + 1 });
  h.service.observeSessionEvent(
    { id: sessionId },
    { type: 'assistant/message', data: { turn, message: { content: [{ type: 'text', text: 'work' }, { type: 'tool-call', id: 'call-1' }] } }, seq: seq + 2 },
  );
  return h.service.observeSessionEvent(
    { id: sessionId },
    { type: 'turn/end', data: { turn, reason: { kind: 'completed' } }, seq: seq + 3 },
  );
}

test('a completed tool-bearing turn applies one small, valence-neutral change', () => {
  const registry = fakeWorkspaceRegistry({ workspaces: [{ id: 'ws-alpha', sessionIds: ['s1'] }] });
  const h = makeService({ registry });
  try {
    bind(h);
    const before = h.service.viewForSession('s1').state;
    const outcome = observeToolTurn(h, 's1', 1);
    assert.equal(outcome.applied, true);
    const after = h.service.viewForSession('s1').state;
    assert.equal(after.mood, before.mood, 'work evidence must not infer a pleasant or unpleasant mood');
    assert.ok(after.energy < before.energy, 'tool work may cost a little energy');
    assert.ok(after.curiosity > before.curiosity, 'tool work may raise curiosity slightly');
    assert.ok(before.energy - after.energy <= 1.6, 'single-turn energy effect stays bounded');
  } finally {
    h.close();
  }
});

test('plain greetings and text-only turns produce exactly zero change', () => {
  const registry = fakeWorkspaceRegistry({ workspaces: [{ id: 'ws-alpha', sessionIds: ['s1'] }] });
  const h = makeService({ registry });
  try {
    bind(h);
    const before = h.service.viewForSession('s1');
    // No observation at all.
    assert.equal(h.service.observeSessionEvent({ id: 's1' }, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } }, seq: 5 }).reason, 'no_work_evidence');
    // A text-only assistant message with a very long body is still zero.
    h.service.observeSessionEvent({ id: 's1' }, { type: 'turn/start', data: { turn: 2 }, seq: 10 });
    h.service.observeSessionEvent(
      { id: 's1' },
      { type: 'assistant/message', data: { turn: 2, message: { content: [{ type: 'text', text: 'x'.repeat(20_000) }] } }, seq: 11 },
    );
    assert.equal(
      h.service.observeSessionEvent({ id: 's1' }, { type: 'turn/end', data: { turn: 2, reason: { kind: 'completed' } }, seq: 12 }).reason,
      'no_work_evidence',
    );
    const after = h.service.viewForSession('s1');
    assert.deepEqual(after.state, before.state);
    assert.equal(h.store.health().counts.events, 0);
  } finally {
    h.close();
  }
});

test('an aborted or failed turn is not treated as a completed real model turn', () => {
  const registry = fakeWorkspaceRegistry({ workspaces: [{ id: 'ws-alpha', sessionIds: ['s1'] }] });
  const h = makeService({ registry });
  try {
    bind(h);
    h.service.observeSessionEvent({ id: 's1' }, { type: 'turn/start', data: { turn: 1 }, seq: 1 });
    h.service.observeSessionEvent(
      { id: 's1' },
      { type: 'assistant/message', data: { turn: 1, message: { content: [{ type: 'tool-call', id: 'call-1' }] } }, seq: 2 },
    );
    assert.equal(
      h.service.observeSessionEvent({ id: 's1' }, { type: 'turn/end', data: { turn: 1, reason: { kind: 'aborted' } }, seq: 3 }).reason,
      'turn_not_completed',
    );
    assert.equal(h.store.health().counts.events, 0);
  } finally {
    h.close();
  }
});

test('the same Session turn is idempotent and never applied twice', () => {
  const registry = fakeWorkspaceRegistry({ workspaces: [{ id: 'ws-alpha', sessionIds: ['s1'] }] });
  const h = makeService({ registry });
  try {
    bind(h);
    const first = h.service.evolveCompletedTurn({ sessionId: 's1', turn: 7, toolCalls: 2, endSeq: 70 });
    assert.equal(first.applied, true);
    const second = h.service.evolveCompletedTurn({ sessionId: 's1', turn: 7, toolCalls: 2, endSeq: 70 });
    assert.equal(second.applied, false);
    assert.equal(second.duplicate, true);
    const again = h.service.evolveCompletedTurn({ sessionId: 's1', turn: 7, toolCalls: 5, endSeq: 99 });
    assert.equal(again.duplicate, true, 'turn identity wins over a later sequence or retry');
    assert.equal(h.store.health().counts.events, 1);
  } finally {
    h.close();
  }
});

test('rate limits bound repeated turns, and read-only Sessions never evolve the shared state', () => {
  const registry = fakeWorkspaceRegistry({ workspaces: [{ id: 'ws-alpha', sessionIds: ['s1', 's2'] }] });
  const h = makeService({ registry, config: { autoEventMinIntervalSeconds: 60 } });
  try {
    bind(h);
    assert.equal(observeToolTurn(h, 's1', 1).applied, true);
    h.now.value = T0 + 5_000;
    h.service.observeSessionEvent({ id: 's1' }, { type: 'turn/start', data: { turn: 2 }, seq: 21 });
    h.service.observeSessionEvent(
      { id: 's1' },
      { type: 'assistant/message', data: { turn: 2, message: { content: [{ type: 'tool-call', id: 'call-2' }] } }, seq: 22 },
    );
    assert.equal(
      h.service.observeSessionEvent({ id: 's1' }, { type: 'turn/end', data: { turn: 2, reason: { kind: 'completed' } }, seq: 23 }).reason,
      'rate_limited',
    );
    h.service.setSessionRule({ sessionId: 's2', mode: 'read_only' });
    h.now.value = T0 + 120_000;
    assert.equal(observeToolTurn(h, 's2', 1).reason, 'read_only');
    assert.equal(h.store.health().counts.events, 1);
  } finally {
    h.close();
  }
});

test('an isolated Session evolves only its own state; the shared main state is untouched', () => {
  const registry = fakeWorkspaceRegistry({ workspaces: [{ id: 'ws-alpha', sessionIds: ['s1', 's2'] }] });
  const h = makeService({ registry });
  try {
    bind(h);
    const main = h.service.viewForSession('s1').state;
    h.service.setSessionRule({ sessionId: 's2', mode: 'isolated' });
    assert.equal(observeToolTurn(h, 's2', 1).mode, 'isolated');
    const isolated = h.service.viewForSession('s2').state;
    assert.ok(isolated.energy < 60);
    assert.deepEqual(h.service.viewForSession('s1').state, main);
  } finally {
    h.close();
  }
});

test('shared event weight limits one Session without suppressing a second Session', () => {
  const registry = fakeWorkspaceRegistry({ workspaces: [{ id: 'ws-alpha', sessionIds: ['s1', 's2'] }] });
  const full = makeService({ registry, config: { sharedEventWeight: 1, autoEventMinIntervalSeconds: 0 } });
  const small = makeService({ registry, config: { sharedEventWeight: 0.05, autoEventMinIntervalSeconds: 0 } });
  try {
    full.service.bindWorkspace({ workspaceId: 'ws-alpha' });
    small.service.bindWorkspace({ workspaceId: 'ws-alpha' });
    const fullBefore = full.service.viewForSession('s1').state;
    const smallBefore = small.service.viewForSession('s1').state;
    assert.equal(observeToolTurn(full, 's1', 1).applied, true);
    assert.equal(observeToolTurn(small, 's1', 1).applied, true);
    const fullDelta = fullBefore.energy - full.service.viewForSession('s1').state.energy;
    const smallDelta = smallBefore.energy - small.service.viewForSession('s1').state.energy;
    assert.ok(smallDelta > 0);
    assert.ok(smallDelta < fullDelta, 'the shared per-Session weight must reduce the effect');
    // A different Session is still eligible after the first one applies.
    assert.equal(observeToolTurn(small, 's2', 1).applied, true);
  } finally {
    full.close();
    small.close();
  }
});

test('automatic evolution can be disabled without disabling reads or manual appraisal surfaces', () => {
  const registry = fakeWorkspaceRegistry({ workspaces: [{ id: 'ws-alpha', sessionIds: ['s1'] }] });
  const h = makeService({ registry, config: { autoEventProcessingEnabled: false } });
  try {
    bind(h);
    assert.equal(observeToolTurn(h, 's1', 1).reason, 'auto_evolution_disabled');
    assert.equal(h.store.health().counts.events, 0);
    assert.equal(h.service.viewForSession('s1').state.mood, 0);
  } finally {
    h.close();
  }
});

test('the Host observer subscribes globally, sees another Workspace Session, and disposes', () => {
  const registry = fakeWorkspaceRegistry({ workspaces: [{ id: 'ws-alpha', sessionIds: ['s1', 's2'] }] });
  const h = makeService({ registry });
  try {
    bind(h);
    let handler;
    let options;
    let disposedByEffect;
    const ctx = {
      on(name, listener, eventOptions) {
        assert.equal(name, 'session/event');
        handler = listener;
        options = eventOptions;
        return () => {
          if (handler === listener) handler = undefined;
          return true;
        };
      },
      effect(fn) {
        const disposer = fn();
        disposedByEffect = typeof disposer === 'function' ? disposer : undefined;
        return disposer;
      },
      logger: { warn() {}, info() {}, error() {} },
    };
    registerSessionObserver(ctx, h.service);
    assert.deepEqual(options, { global: true }, 'the subscription must bypass another Session context filter');
    assert.equal(typeof handler, 'function');
    // Events delivered for a second Workspace Session are still observed.
    handler({ id: 's2' }, { type: 'turn/start', data: { turn: 1 }, seq: 1 });
    handler({ id: 's2' }, {
      type: 'assistant/message',
      data: { turn: 1, message: { content: [{ type: 'tool-call', id: 'call-1' }] } },
      seq: 2,
    });
    handler({ id: 's2' }, { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } }, seq: 3 });
    assert.equal(h.store.health().counts.events, 1);
    const before = h.store.health().counts.events;
    // Plugin disposal removes the listener; no later event can write.
    disposedByEffect();
    assert.equal(handler, undefined);
    void before;
  } finally {
    h.close();
  }
});
