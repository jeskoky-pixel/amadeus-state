import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeConfig } from '../src/config.js';
import { renderStateContext, registerStateContext } from '../src/context.js';
import { registerTools } from '../src/tools.js';
import { execFor, makeService, toolContext } from './helpers.js';

test('four model tools are registered with stable names', () => {
  const h = makeService();
  const tools = toolContext();
  try {
    registerTools(tools.ctx, h.service);
    assert.deepEqual([...tools.tools.keys()].sort(), ['state_appraise', 'state_get', 'state_health', 'state_interests']);
    for (const definition of tools.tools.values()) {
      assert.equal(definition.parameters.type, 'object');
      assert.equal(typeof definition.execute, 'function');
      assert.equal(typeof definition.output.render, 'function');
    }
  } finally {
    h.close();
  }
});

test('state_get reads only its own scope and returns bounded explanation', async () => {
  const h = makeService({ config: { modelAppraisalEnabled: true } });
  const tools = toolContext();
  try {
    registerTools(tools.ctx, h.service);
    await h.service.recordEvent({
      identity: h.identity('session-tool-get'),
      type: 'knowledge_gained',
      source: 'host',
      trust: 'trusted',
      summary: 'read an article',
      idempotencyKey: 'tool:get:1',
      topic: '状态工具',
      interestDelta: 3,
    });
    const result = await tools.call('state_get', {}, execFor('session-tool-get'));
    assert.equal(result.scope.privacy, 'private');
    assert.equal(result.scope.authorization, 'session');
    assert.ok(result.state.mood >= 0);
    assert.ok(result.interests.length >= 1);
    assert.match(result.note, /tendenc|tendenc/i);
    assert.equal(Object.hasOwn(result, 'config'), false);
    assert.equal(JSON.stringify(result).includes('session-tool-get'), false);
  } finally {
    h.close();
  }
});

test('state_appraise rejects a Life reference when Life is absent', async () => {
  const h = makeService({ config: { modelAppraisalEnabled: true, lifeIntegrationEnabled: true } });
  const tools = toolContext();
  try {
    registerTools(tools.ctx, h.service);
    await assert.rejects(
      tools.call('state_appraise', { summary: 'x', activityId: 'missing-activity' }),
      /Life is not available|LIFE/,
    );
  } finally {
    h.close();
  }
});

test('state_appraise rejects an event type that requires a trusted reference', async () => {
  const h = makeService({ config: { modelAppraisalEnabled: true } });
  const tools = toolContext();
  try {
    registerTools(tools.ctx, h.service);
    await assert.rejects(
      tools.call('state_appraise', { summary: 'x', eventType: 'life_completed' }),
      /not accepted/,
    );
    await assert.rejects(
      tools.call('state_appraise', { summary: 'x', eventType: 'meaningful_interaction', activityId: 'a', memoryId: 'm' }),
      /either activityId or memoryId/,
    );
  } finally {
    h.close();
  }
});

test('state_health is scoped and never exposes another private Scene last event', async () => {
  const h = makeService();
  const tools = toolContext();
  try {
    registerTools(tools.ctx, h.service);
    await h.service.recordEvent({
      identity: h.identity('session-health-a'),
      type: 'meaningful_interaction',
      source: 'host',
      trust: 'trusted',
      summary: 'scene A private event',
      idempotencyKey: 'health:scene-a',
    });
    const result = await tools.call('state_health', {}, execFor('session-health-b'));
    assert.equal(result.lastEventAt ?? null, null);
    assert.equal(Object.hasOwn(result, 'database'), false);
    assert.equal(Object.hasOwn(result, 'config'), false);
    assert.equal(Object.hasOwn(result, 'lastError'), false);
    assert.equal(Object.hasOwn(result, 'counts'), false);
  } finally {
    h.close();
  }
});

test('state_interests validates its bounded limit', async () => {
  const h = makeService();
  const tools = toolContext();
  try {
    registerTools(tools.ctx, h.service);
    await assert.rejects(tools.call('state_interests', { limit: 0 }), /between 1 and 20/);
    await assert.rejects(tools.call('state_interests', { limit: 21 }), /between 1 and 20/);
    const result = await tools.call('state_interests', { limit: 1 }, execFor('session-tool-interests'));
    assert.deepEqual(result.interests, []);
  } finally {
    h.close();
  }
});

test('state_health is safe and excludes paths and secrets', async () => {
  const h = makeService();
  const tools = toolContext();
  try {
    registerTools(tools.ctx, h.service);
    const result = await tools.call('state_health', {}, execFor('session-tool-health'));
    assert.equal(result.state, 'ready');
    assert.equal(result.version, '1.2.0');
    assert.equal(JSON.stringify(result).includes(h.temp.dir), false);
    assert.equal(JSON.stringify(result).includes('state.sqlite'), false);
  } finally {
    h.close();
  }
});

test('dynamic context is off, brief, or state+interests, and bounded', async () => {
  const h = makeService({ config: { contextInjectionMode: 'brief', contextMaxChars: 180 } });
  try {
    await h.service.recordEvent({
      identity: h.identity('session-context'),
      type: 'exploration_completed',
      source: 'host',
      trust: 'trusted',
      summary: 'private reason',
      idempotencyKey: 'context:1',
      topic: '上下文主题',
      interestDelta: 4,
    });
    const assemblyContext = { agent: { session: { id: 'session-context' } } };
    const off = renderStateContext(assemblyContext, h.service, () => normalizeConfig({ contextInjectionMode: 'off' }));
    assert.equal(off, '');
    const brief = renderStateContext(assemblyContext, h.service, () => normalizeConfig({}));
    assert.match(brief, /Amadeus 状态/);
    assert.ok(brief.length <= 420);
    assert.doesNotMatch(brief, /private reason/);
    const rich = renderStateContext(assemblyContext, h.service, () =>
      normalizeConfig({ contextInjectionMode: 'state_interests', contextMaxChars: 120 }),
    );
    assert.ok(rich.length <= 120);
    assert.match(rich, /当前兴趣/);
  } finally {
    h.close();
  }
});

test('registerStateContext uses the native systemPrompt context seam', () => {
  const h = makeService();
  let registration;
  const child = {
    systemPrompt: {
      context(value) {
        registration = value;
        return () => {};
      },
    },
    effect(fn) {
      return fn();
    },
  };
  const ctx = {
    inject(names, callback) {
      assert.deepEqual(names, ['systemPrompt']);
      return callback(child);
    },
  };
  try {
    registerStateContext(ctx, h.service, () => normalizeConfig({}));
    assert.equal(registration.name, 'amadeus-state');
    assert.equal(typeof registration.text, 'function');
    assert.equal(registration.text({ agent: { session: { id: 'session-context-2' } } }).length > 0, true);
  } finally {
    h.close();
  }
});

test('state evolution disabled refuses new automatic events but keeps reads working', async () => {
  const h = makeService({ config: { stateEvolutionEnabled: false } });
  try {
    await assert.rejects(
      h.service.recordEvent({
        identity: h.identity('session-disabled'),
        type: 'meaningful_interaction',
        source: 'model_appraisal',
        trust: 'bounded',
        summary: 'x',
        idempotencyKey: 'disabled:1',
      }),
      /disabled/,
    );
    const view = h.service.viewForSession('session-disabled');
    assert.equal(view.state.mood, 0);
  } finally {
    h.close();
  }
});
