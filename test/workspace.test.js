/**
 * Deterministic v1.1 Workspace authority and four-mode policy regressions.
 * Every test uses synthetic Workspace/Session ids and a temporary database.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { makeService, fakeWorkspaceRegistry, tempDir, T0, execFor, toolContext, fakeLife, fakeMemory } from './helpers.js';
import { StateStore } from '../src/store.js';
import { StateService } from '../src/service.js';
import { registerTools } from '../src/tools.js';
import { renderStateContext } from '../src/context.js';
import { normalizeConfig } from '../src/config.js';

function bind(h, workspaceId = 'ws-alpha') {
  return h.service.bindWorkspace({ workspaceId });
}

test('unbound installations keep the v1 private per-Session behavior', () => {
  const registry = fakeWorkspaceRegistry({ workspaces: [{ id: 'ws-alpha', sessionIds: ['s1'] }] });
  const h = makeService({ registry });
  try {
    assert.equal(h.service.bindingStatus().state, 'unbound');
    const one = h.service.viewForSession('s1');
    const two = h.service.viewForSession('s2');
    assert.notEqual(one.scope.id, two.scope.id);
    assert.equal(one.access.mode, 'legacy');
    assert.equal(one.scope.kind, 'session');
  } finally {
    h.close();
  }
});

test('binding uses the stable Workspace id and shares one main state across members', () => {
  const registry = fakeWorkspaceRegistry({
    workspaces: [
      { id: 'ws-alpha', title: 'Alpha', sessionIds: ['s1', 's2'] },
      { id: 'ws-beta', title: 'Beta', sessionIds: ['s3'] },
    ],
  });
  const h = makeService({ registry });
  try {
    const status = bind(h);
    assert.equal(status.state, 'ready');
    assert.equal(status.workspaceId, 'ws-alpha');
    const one = h.service.viewForSession('s1');
    const two = h.service.viewForSession('s2');
    assert.equal(one.scope.id, two.scope.id);
    assert.equal(one.scope.kind, 'workspace');
    assert.equal(one.scope.workspaceId, 'ws-alpha');
    assert.equal(one.access.mode, 'shared');
    assert.equal(one.access.writable, true);
    // Live membership: a late Session joins without re-binding.
    registry.addSession('ws-alpha', 's4');
    assert.equal(h.service.viewForSession('s4').scope.id, one.scope.id);
    // Another Workspace and a removed Session fail closed.
    assert.throws(() => h.service.viewForSession('s3'), /not available/);
    registry.removeSession('ws-alpha', 's2');
    assert.throws(() => h.service.viewForSession('s2'), /not available/);
  } finally {
    h.close();
  }
});

test('archived, missing, unavailable Workspace and unavailable registry all fail closed', () => {
  const registry = fakeWorkspaceRegistry({ workspaces: [{ id: 'ws-alpha', sessionIds: ['s1', 's2'] }] });
  let available = true;
  const temp = tempDir('state-workspace-unavailable-');
  const store = new StateStore({ databasePath: temp.path, clock: () => T0 });
  const service = new StateService({
    store,
    getConfig: () => normalizeConfig({}),
    getRegistry: () => (available ? registry : undefined),
    clock: () => T0,
    version: '1.1.0',
    startedAt: new Date(T0).toISOString(),
  });
  try {
    service.bindWorkspace({ workspaceId: 'ws-alpha' });
    assert.equal(service.viewForSession('s1').scope.kind, 'workspace');
    registry.archive('s1');
    assert.throws(() => service.viewForSession('s1'), /not available/);
    registry.unarchive('s1');
    registry.removeWorkspace('ws-alpha');
    assert.equal(service.bindingStatus().state, 'workspace_missing');
    assert.throws(() => service.viewForSession('s1'), /not available/);
    available = false;
    assert.equal(service.bindingStatus().state, 'registry_unavailable');
    assert.throws(() => service.viewForSession('s1'), /not available/);
  } finally {
    store.close();
    temp.cleanup();
  }
});

test('binding and rules survive a reopen; no v1 scope is auto-merged', async () => {
  const registry = fakeWorkspaceRegistry({ workspaces: [{ id: 'ws-alpha', sessionIds: ['s1', 's2'] }] });
  const h = makeService({ registry });
  try {
    await h.service.recordEvent({
      identity: h.identity('s1'),
      type: 'knowledge_gained',
      source: 'host',
      trust: 'trusted',
      summary: 'legacy private event',
      idempotencyKey: 'legacy-private:1',
    });
    bind(h);
    h.service.setSessionRule({ sessionId: 's2', mode: 'read_only' });
    const path = h.temp.path;
    h.store.close();
    const { StateStore } = await import('../src/store.js');
    const { StateService } = await import('../src/service.js');
    const reopened = new StateStore({ databasePath: path });
    try {
      const service = new StateService({
        store: reopened,
        getConfig: () => normalizeConfig({}),
        getRegistry: () => registry,
        version: '1.1.0',
        startedAt: new Date(T0).toISOString(),
      });
      assert.equal(service.bindingStatus().workspaceId, 'ws-alpha');
      assert.equal(service.sessionRulesOverview().sessions.find((entry) => entry.sessionId === 's2').mode, 'read_only');
      const main = service.viewForSession('s1');
      assert.equal(main.scope.kind, 'workspace');
      assert.equal(main.state.mood, 0, 'legacy mood must not be merged into the new main scope');
      assert.equal(service.viewForSession('s2').access.writable, false);
    } finally {
      reopened.close();
    }
  } finally {
    h.temp.cleanup();
  }
});

test('read-only and disabled rules take effect immediately when changed', async () => {
  const registry = fakeWorkspaceRegistry({ workspaces: [{ id: 'ws-alpha', sessionIds: ['s1'] }] });
  const h = makeService({ registry, config: { modelAppraisalEnabled: true } });
  const tools = toolContext();
  try {
    bind(h);
    registerTools(tools.ctx, h.service);
    h.service.setSessionRule({ sessionId: 's1', mode: 'read_only' });
    const read = await tools.call('state_get', {}, execFor('s1'));
    assert.equal(read.access.readOnly, true);
    await assert.rejects(
      tools.call('state_appraise', { summary: 'read only attempt', eventType: 'meaningful_interaction' }, execFor('s1')),
      /read-only/,
    );
    h.service.setSessionRule({ sessionId: 's1', mode: 'disabled' });
    await assert.rejects(tools.call('state_get', {}, execFor('s1')), /not available/);
    assert.equal(
      renderStateContext({ agent: { session: { id: 's1' } } }, h.service, () => normalizeConfig({})),
      '',
    );
  } finally {
    h.close();
  }
});

test('isolated state neither reads nor writes the shared main scope', async () => {
  const registry = fakeWorkspaceRegistry({ workspaces: [{ id: 'ws-alpha', sessionIds: ['s1', 's2'] }] });
  const h = makeService({ registry });
  try {
    bind(h);
    const main = h.service.viewForSession('s1');
    // Move the main state via a shared event from s1.
    h.service.recordEventSync({
      identity: h.service.effectiveForWrite('s1').identity,
      type: 'knowledge_gained',
      source: 'host',
      trust: 'trusted',
      summary: 'shared work',
      idempotencyKey: 'shared:1',
      topic: 'shared topic',
      interestDelta: 4,
      originSessionId: 's1',
    });
    const changed = h.service.viewForSession('s1');
    assert.ok(changed.state.curiosity > main.state.curiosity);
    h.service.setSessionRule({ sessionId: 's2', mode: 'isolated' });
    const isolated = h.service.viewForSession('s2');
    assert.notEqual(isolated.scope.id, changed.scope.id);
    assert.equal(isolated.scope.kind, 'session');
    assert.equal(isolated.state.curiosity, 55, 'isolated starts from configured baseline, not the main value');
    assert.equal(isolated.interests.length, 0, 'shared interests are not readable from isolated state');
    h.service.recordEventSync({
      identity: h.service.effectiveForWrite('s2').identity,
      type: 'meaningful_interaction',
      source: 'host',
      trust: 'trusted',
      summary: 'isolated work',
      idempotencyKey: 'isolated:1',
      originSessionId: 's2',
    });
    const afterIsolated = h.service.viewForSession('s2');
    assert.ok(afterIsolated.state.curiosity > isolated.state.curiosity);
    const mainStill = h.service.viewForSession('s1');
    assert.equal(mainStill.scope.id, changed.scope.id);
    assert.equal(mainStill.state.curiosity, changed.state.curiosity, 'isolated event must not touch main state');
  } finally {
    h.close();
  }
});

test('Workspace audit hides cross-Session raw reasons while keeping deltas', () => {
  const registry = fakeWorkspaceRegistry({ workspaces: [{ id: 'ws-alpha', sessionIds: ['s1', 's2'] }] });
  const h = makeService({ registry });
  try {
    bind(h);
    h.service.recordEventSync({
      identity: h.service.effectiveForWrite('s1').identity,
      type: 'meaningful_interaction',
      source: 'host',
      trust: 'trusted',
      summary: 'private group chat reason',
      idempotencyKey: 'private:1',
      originSessionId: 's1',
      evidence: ['private:evidence'],
    });
    const page = h.service.auditPage(h.service.viewForSession('s2').scope.id, { limit: 20, offset: 0 });
    assert.equal(page.redacted, true);
    assert.equal(page.items[0].summary.includes('private group chat reason'), false);
    assert.equal(page.items[0].sessionId, null);
    assert.deepEqual(page.items[0].evidenceRefs, []);
    assert.equal(typeof page.items[0].deltas.curiosity, 'number');
  } finally {
    h.close();
  }
});

test('shared numeric evolution never exposes one Session private topic as a global interest', () => {
  const registry = fakeWorkspaceRegistry({ workspaces: [{ id: 'ws-alpha', sessionIds: ['s1', 's2'] }] });
  const h = makeService({ registry });
  try {
    bind(h);
    const before = h.service.viewForSession('s2');
    h.service.recordEventSync({
      identity: h.service.effectiveForWrite('s1').identity,
      type: 'meaningful_interaction',
      source: 'model_appraisal',
      trust: 'bounded',
      summary: 's1 private conversation',
      idempotencyKey: 'private-topic:1',
      topic: '仅私聊s1知晓的私人标题',
      interestDelta: 5,
      originSessionId: 's1',
    });
    const other = h.service.viewForSession('s2');
    assert.ok(other.state.mood > before.state.mood, 'numeric influence should still apply');
    assert.equal(other.interests.some((interest) => interest.name === '仅私聊s1知晓的私人标题'), false);
  } finally {
    h.close();
  }
});

test('different Sessions with the same turn number each get one shared appraisal', async () => {
  const registry = fakeWorkspaceRegistry({ workspaces: [{ id: 'ws-alpha', sessionIds: ['s1', 's2'] }] });
  const h = makeService({ registry, config: { modelAppraisalEnabled: true } });
  try {
    bind(h);
    const args = { summary: 'bounded appraisal', eventType: 'meaningful_interaction', valence: 0.2, intensity: 0.5 };
    const first = await h.service.appraiseModel({ exec: execFor('s1', 1), args: { ...args } });
    const second = await h.service.appraiseModel({ exec: execFor('s2', 1), args: { ...args } });
    assert.equal(first.duplicate, false);
    assert.equal(second.duplicate, false, 'Session ids must separate turn-scoped idempotency keys');
    assert.notEqual(first.event.id, second.event.id);
  } finally {
    h.close();
  }
});

test('Life and Memory references cannot promote private topics into shared interests', async () => {
  const registry = fakeWorkspaceRegistry({ workspaces: [{ id: 'ws-alpha', sessionIds: ['s1', 's2'] }] });
  const life = fakeLife({ sessionId: 's1' });
  life.addActivity('activity-private', { description: '仅私聊s1知晓的 Life 标题' });
  const memory = fakeMemory({ entries: new Map([['memory-private', { id: 'memory-private', title: '仅私聊s1知晓的 Memory 标题' }]]) });
  const h = makeService({
    registry,
    life,
    memory,
    config: { modelAppraisalEnabled: true, lifeIntegrationEnabled: true, memoryIntegrationEnabled: true },
  });
  try {
    bind(h);
    const before = h.service.viewForSession('s2');
    await h.service.appraiseModel({
      exec: execFor('s1'),
      args: { summary: 'life reference', activityId: 'activity-private', valence: 0.5, intensity: 0.5 },
    });
    await h.service.appraiseModel({
      exec: execFor('s1'),
      args: { summary: 'memory reference', memoryId: 'memory-private', valence: 0.3, intensity: 0.4 },
    });
    const after = h.service.viewForSession('s2');
    assert.ok(after.state.mood > before.state.mood, 'numeric influence from trusted references still applies');
    assert.equal(after.interests.some((interest) => interest.name.includes('私聊s1')), false);
    // Owner-authored global interests are explicit and remain available.
    const manual = h.service.addInterest({ scopeId: after.scope.id, name: 'Owner 公开兴趣', baseline: 70 });
    assert.equal(manual.name, 'Owner 公开兴趣');
    const visible = h.service.viewForSession('s2').interests.some((interest) => interest.name === 'Owner 公开兴趣');
    assert.equal(visible, true);
  } finally {
    h.close();
  }
});

test('a verified Life activity still applies to shared Workspace state', async () => {
  const registry = fakeWorkspaceRegistry({ workspaces: [{ id: 'ws-alpha', sessionIds: ['s1'] }] });
  const life = fakeLife({ sessionId: 's1' });
  const activity = life.addActivity('activity-1');
  const h = makeService({ registry, life, config: { modelAppraisalEnabled: true, lifeIntegrationEnabled: true } });
  try {
    bind(h);
    const result = await h.service.appraiseModel({
      exec: execFor('s1'),
      args: {
        summary: 'verified Life work',
        activityId: 'activity-1',
        valence: 0.4,
        intensity: 0.5,
        curiosity: 0.2,
      },
    });
    assert.equal(result.accepted, true);
    assert.equal(result.event.source, 'life');
    const main = h.service.viewForSession('s1');
    assert.equal(main.scope.kind, 'workspace');
    assert.equal(main.scope.workspaceId, 'ws-alpha');
    assert.ok(main.state.energy < 60);
    assert.ok(activity.id);
  } finally {
    h.close();
  }
});

test('rules reject non-members and archived Sessions; rebinding requires explicit confirmation', () => {
  const registry = fakeWorkspaceRegistry({
    workspaces: [
      { id: 'ws-alpha', sessionIds: ['s1'] },
      { id: 'ws-beta', sessionIds: ['s2'] },
    ],
  });
  const h = makeService({ registry });
  try {
    bind(h);
    assert.throws(() => h.service.setSessionRule({ sessionId: 's2', mode: 'read_only' }), /not a member/);
    registry.archive('s1');
    assert.throws(() => h.service.setSessionRule({ sessionId: 's1', mode: 'read_only' }), /archived/);
    assert.throws(() => h.service.bindWorkspace({ workspaceId: 'ws-beta' }), /REBIND/);
    const rebound = h.service.bindWorkspace({ workspaceId: 'ws-beta', confirm: 'REBIND' });
    assert.equal(rebound.workspaceId, 'ws-beta');
    assert.throws(() => h.service.viewForSession('s1'), /not available/);
    assert.equal(h.service.viewForSession('s2').scope.workspaceId, 'ws-beta');
    assert.throws(() => h.service.unbindWorkspace({ confirm: 'NO' }), /UNBIND/);
    assert.equal(h.service.unbindWorkspace({ confirm: 'UNBIND' }).state, 'unbound');
  } finally {
    h.close();
  }
});
