import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeConfig } from '../src/config.js';
import { StateService } from '../src/service.js';
import { localIdentity } from '../src/scope.js';
import { registerTools } from '../src/tools.js';
import { renderStateContext } from '../src/context.js';
import { T0, execFor, fakeLife, fakeMemory, makeService, toolContext } from './helpers.js';

test('two local sessions keep private state and reasons separate', async () => {
  const h = makeService();
  try {
    const a = h.identity('session-private-a');
    const b = h.identity('session-private-b');
    assert.notEqual(a.scopeId, b.scopeId);
    await h.service.recordEvent({
      identity: a,
      type: 'exploration_completed',
      source: 'host',
      trust: 'trusted',
      summary: 'A 的私密探索',
      idempotencyKey: 'scope:a',
      topic: '私密主题 A',
      interestDelta: 5,
    });
    const viewA = h.service.viewForSession('session-private-a');
    const viewB = h.service.viewForSession('session-private-b');
    assert.equal(viewA.state.mood > 0, true);
    assert.equal(viewB.state.mood, 0);
    assert.equal(viewA.interests[0].name, '私密主题 A');
    assert.equal(viewB.interests.length, 0);
    const context = renderStateContext({ agent: { session: { id: 'session-private-b' } } }, h.service, () => normalizeConfig({}));
    assert.doesNotMatch(context, /私密主题 A/);
  } finally {
    h.close();
  }
});

test('Life identity supplies persona and scene; a revoked binding fails closed', async () => {
  const life = fakeLife({ sessionId: 'session-life', sceneId: 'scene-life', personaId: 'persona-life' });
  const h = makeService({ life });
  try {
    const view = h.service.viewForSession('session-life');
    assert.equal(view.scope.source, 'life');
    assert.equal(view.scope.personaId, 'persona-life');
    assert.equal(view.scope.sceneId, 'scene-life');
    const row = h.store.getScope(view.scope.id);
    assert.equal(h.service.scopeAuthorization(row).authorized, true);
    life.revoke();
    assert.throws(() => h.service.viewForSession('session-life'), /revoked|closed/);
    assert.equal(h.service.scopeAuthorization(row).authorized, false);
  } finally {
    h.close();
  }
});

test('an unexpected Life lookup failure fails closed instead of silently using a local scope', async () => {
  const life = fakeLife();
  life.getSessionBinding = () => {
    throw new Error('identity store unavailable');
  };
  const h = makeService({ life });
  try {
    assert.throws(() => h.service.viewForSession('session-test-1'), /lookup failed|refusing/);
  } finally {
    h.close();
  }
});

test('model appraisal cannot forge source, scope, trust, evidence, or admin rights', async () => {
  const h = makeService({ config: { modelAppraisalEnabled: true } });
  const tools = toolContext();
  try {
    registerTools(tools.ctx, h.service);
    for (const reserved of ['scope', 'scene', 'sessionId', 'source', 'trust', 'admin', 'authorizationRef', 'trustedEvidence']) {
      await assert.rejects(
        tools.call('state_appraise', { summary: 'forged', eventType: 'meaningful_interaction', [reserved]: 'x' }),
        /reserved/,
      );
    }
    const result = await tools.call('state_get', {}, execFor('session-exec'));
    assert.equal(result.scope.authorization, 'session');
    assert.equal(Object.hasOwn(result, 'session'), false);
  } finally {
    tools.ctx.tools = undefined;
    h.close();
  }
});

test('an idempotency key cannot be reused by another scope', async () => {
  const h = makeService();
  try {
    await h.service.recordEvent({
      identity: h.identity('session-key-a'),
      type: 'meaningful_interaction',
      source: 'host',
      trust: 'trusted',
      summary: 'scope A',
      idempotencyKey: 'cross-scope:key',
    });
    await assert.rejects(
      h.service.recordEvent({
        identity: h.identity('session-key-b'),
        type: 'meaningful_interaction',
        source: 'host',
        trust: 'trusted',
        summary: 'scope B',
        idempotencyKey: 'cross-scope:key',
      }),
      /another State scope/,
    );
    assert.equal(h.store.health().counts.events, 1);
  } finally {
    h.close();
  }
});

test('model appraisal is disabled by default and changes nothing', async () => {
  const h = makeService();
  const tools = toolContext();
  try {
    registerTools(tools.ctx, h.service);
    await assert.rejects(
      tools.call('state_appraise', { summary: 'hello', eventType: 'meaningful_interaction' }),
      /disabled/,
    );
    assert.equal(h.store.health().counts.events, 0);
  } finally {
    h.close();
  }
});

test('unreferenced model appraisal cannot claim a completed exploration', async () => {
  const h = makeService({ config: { modelAppraisalEnabled: true } });
  const tools = toolContext();
  try {
    registerTools(tools.ctx, h.service);
    await assert.rejects(
      tools.call('state_appraise', {
        summary: 'I completed an exploration',
        eventType: 'exploration_completed',
      }),
      /not accepted|trusted|activityId/i,
    );
    assert.equal(h.store.health().counts.events, 0);
    assert.equal(h.service.viewForSession('session-claim-check').state.mood, 0);
  } finally {
    h.close();
  }
});

test('the same completed Life activity at two revisions applies exactly once', async () => {
  const life = fakeLife({ sessionId: 'session-life-stable', sceneId: 'scene-life-stable', personaId: 'persona-life-stable' });
  const h = makeService({ life, config: { modelAppraisalEnabled: true, lifeIntegrationEnabled: true } });
  try {
    const activity = life.addActivity('act-stable', { status: 'completed', revision: 1 });
    const first = await h.service.appraiseModel({
      exec: execFor('session-life-stable'),
      args: { summary: 'completed once', activityId: 'act-stable' },
    });
    assert.equal(first.duplicate, false);
    const stateAfterFirst = first.state;
    activity.revision = 2;
    activity.updatedAt = new Date(T0 + 60_000).toISOString();
    const second = await h.service.appraiseModel({
      exec: execFor('session-life-stable'),
      args: { summary: 'same activity projected again', activityId: 'act-stable' },
    });
    assert.equal(second.duplicate, true);
    assert.equal(h.store.health().counts.events, 1);
    assert.deepEqual(second.state, stateAfterFirst);
  } finally {
    h.close();
  }
});

test('private State events are not auto-written to Memory; no write setting exists', async () => {
  const life = fakeLife({ sessionId: 'session-memory-private', sceneId: 'scene-memory-private', personaId: 'persona-memory-private' });
  const memory = fakeMemory();
  const h = makeService({ life, memory, config: { memoryIntegrationEnabled: true, lifeIntegrationEnabled: true } });
  try {
    const identity = h.service.identityForSession('session-memory-private');
    await h.service.recordEvent({
      identity,
      type: 'exploration_completed',
      source: 'life',
      trust: 'trusted',
      summary: 'private scene detail',
      idempotencyKey: 'private-memory:1',
      exec: execFor('session-memory-private'),
    });
    assert.equal(memory.calls.filter((call) => call.op === 'save').length, 0);
    assert.equal(h.service.config().memoryWriteEnabled, undefined);
    const health = h.service.health();
    assert.equal(health.integrations.memory.writeEnabled, false);
    assert.equal(health.integrations.memory.writeAvailable, false);
    assert.equal(Object.hasOwn(health.integrations.memory, 'writeConfigured'), false);
    assert.match(String(health.integrations.memory.writeReason ?? ''), /scene|contract|unavailable/i);
  } finally {
    h.close();
  }
});

test('only a provider-confirmed completed Life activity counts; running/unknown do not', async () => {
  const life = fakeLife({ sessionId: 'session-life-2', sceneId: 'scene-life-2', personaId: 'persona-life-2' });
  const h = makeService({ life, config: { modelAppraisalEnabled: true, lifeIntegrationEnabled: true } });
  try {
    const exec = execFor('session-life-2');
    life.addActivity('act-completed', { status: 'completed' });
    const first = await h.service.appraiseModel({
      exec,
      args: { summary: '完成了探索', eventType: 'life_completed', activityId: 'act-completed', valence: 0.5, intensity: 0.8 },
    });
    assert.equal(first.duplicate, false);
    assert.equal(first.event.source, 'life');
    assert.equal(first.event.trust, 'trusted');
    assert.ok(first.event.evidence.length > 0);
    const again = await h.service.appraiseModel({
      exec,
      args: { summary: '重复回执', eventType: 'life_completed', activityId: 'act-completed' },
    });
    assert.equal(again.duplicate, true);
    assert.equal(h.store.health().counts.events, 1);

    life.addActivity('act-running', { status: 'running' });
    await assert.rejects(
      h.service.appraiseModel({
        exec,
        args: { summary: '还没完成', activityId: 'act-running' },
      }),
      /not completed or failed/,
    );
    life.addActivity('act-unknown', { status: 'unknown' });
    await assert.rejects(
      h.service.appraiseModel({
        exec,
        args: { summary: '未知', activityId: 'act-unknown' },
      }),
      /not completed or failed/,
    );
    assert.equal(h.store.health().counts.events, 1);
  } finally {
    h.close();
  }
});

test('a revoked Life binding rejects activity appraisal', async () => {
  const life = fakeLife({ sessionId: 'session-life-3', sceneId: 'scene-life-3', personaId: 'persona-life-3' });
  life.addActivity('act-1');
  const h = makeService({ life, config: { modelAppraisalEnabled: true, lifeIntegrationEnabled: true } });
  try {
    life.revoke();
    await assert.rejects(
      h.service.appraiseModel({
        exec: execFor('session-life-3'),
        args: { summary: 'revoked', activityId: 'act-1' },
      }),
      /revoked|closed/,
    );
  } finally {
    h.close();
  }
});

test('Memory references are optional, verified, and idempotent per memory id', async () => {
  const memory = fakeMemory({
    entries: new Map([
      [
        'mem-1',
        { id: 'mem-1', title: '记忆主题', type: 'history', updated_at: new Date().toISOString(), agent_scope: 'global', workspace_scope: 'global' },
      ],
    ]),
  });
  const h = makeService({ memory, config: { modelAppraisalEnabled: true, memoryIntegrationEnabled: true } });
  try {
    const exec = execFor('session-memory');
    const first = await h.service.appraiseModel({
      exec,
      args: { summary: '关联记忆', memoryId: 'mem-1', valence: 0.3 },
    });
    assert.equal(first.duplicate, false);
    assert.equal(first.event.source, 'memory');
    const second = await h.service.appraiseModel({
      exec,
      args: { summary: '再次检索同一记忆', memoryId: 'mem-1' },
    });
    assert.equal(second.duplicate, true);
    assert.equal(h.store.health().counts.events, 1);
    await assert.rejects(
      h.service.appraiseModel({ exec, args: { summary: 'missing', memoryId: 'missing' } }),
      /not found/,
    );
  } finally {
    h.close();
  }
});

test('Memory integration degrades cleanly when disabled or unavailable', async () => {
  const h = makeService({ config: { modelAppraisalEnabled: true, memoryIntegrationEnabled: false } });
  try {
    await assert.rejects(
      h.service.appraiseModel({ exec: execFor('session-memory-off'), args: { summary: 'x', memoryId: 'mem-1' } }),
      /disabled/,
    );
  } finally {
    h.close();
  }
});

test('a Memory adapter failure becomes an explicit integration error, not a state write', async () => {
  const memory = fakeMemory({ fail: true });
  const h = makeService({ memory, config: { modelAppraisalEnabled: true, memoryIntegrationEnabled: true } });
  try {
    await assert.rejects(
      h.service.appraiseModel({ exec: execFor('session-memory-fail'), args: { summary: 'x', memoryId: 'mem-1' } }),
      /Memory reference lookup failed/,
    );
    assert.equal(h.store.health().counts.events, 0);
  } finally {
    h.close();
  }
});

test('unreferenced model appraisals are idempotent per turn and rate-limited', async () => {
  const h = makeService({ config: { modelAppraisalEnabled: true } });
  try {
    const exec = execFor('session-model-turn', 1);
    const first = await h.service.appraiseModel({
      exec,
      args: { summary: 'turn one', eventType: 'meaningful_interaction', valence: 0.4 },
    });
    assert.equal(first.duplicate, false);
    const repeat = await h.service.appraiseModel({
      exec,
      args: { summary: 'same turn again', eventType: 'meaningful_interaction' },
    });
    assert.equal(repeat.duplicate, true);
    const next = await h.service.appraiseModel({
      exec: execFor('session-model-turn', 2),
      args: { summary: 'turn two', eventType: 'knowledge_gained' },
    });
    assert.equal(next.duplicate, false);
    assert.equal(h.store.health().counts.events, 2);
  } finally {
    h.close();
  }
});

test('admin-only management refuses a scope with revoked authorization', async () => {
  const life = fakeLife({ sessionId: 'session-life-4', sceneId: 'scene-life-4', personaId: 'persona-life-4' });
  const h = makeService({ life, config: { lifeIntegrationEnabled: true } });
  try {
    const view = h.service.viewForSession('session-life-4');
    life.revoke();
    assert.throws(
      () => h.service.resetState({ scopeId: view.scope.id, expectedRevision: view.state.revision, confirm: 'RESET' }),
      /authorization/,
    );
  } finally {
    h.close();
  }
});

test('a previously Life-bound Session fails closed when Life becomes unavailable', () => {
  const life = fakeLife({ sessionId: 'session-life-gone', sceneId: 'scene-life-gone', personaId: 'persona-life-gone' });
  const h = makeService({ life, config: { lifeIntegrationEnabled: true } });
  try {
    h.service.viewForSession('session-life-gone');
    const withoutLife = new StateService({
      store: h.store,
      getConfig: () => normalizeConfig({ lifeIntegrationEnabled: true }),
      getLife: () => undefined,
      version: '1.0.0',
      startedAt: new Date().toISOString(),
    });
    assert.throws(() => withoutLife.viewForSession('session-life-gone'), /refusing to downgrade/);
  } finally {
    h.close();
  }
});

test('local identity remains private even without Life', () => {
  const id = localIdentity('session-local-only');
  assert.equal(id.kind, 'local');
  assert.equal(id.privacy, 'private');
  assert.match(id.scopeId, /^local:/);
  assert.throws(() => localIdentity(''), /Session is required/);
});
