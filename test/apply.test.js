import assert from 'node:assert/strict';
import test from 'node:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { apply, Config, name, inject } from '../src/index.js';
import { tempDir } from './helpers.js';

function fakeContext(services) {
  const provided = new Map();
  const effects = [];
  const childFor = (names) => {
    const child = {
      get(serviceName) {
        return names.includes(serviceName) ? services[serviceName] : undefined;
      },
      effect(fn) {
        const disposer = fn();
        effects.push(disposer);
        return disposer;
      },
      logger: { info() {}, warn() {}, error() {} },
    };
    for (const service of names) child[service] = services[service];
    return child;
  };
  return {
    provided,
    effects,
    ctx: {
      logger: { info() {}, warn() {}, error() {} },
      provide(serviceName, value) {
        if (provided.has(serviceName)) throw new Error(`duplicate service: ${serviceName}`);
        provided.set(serviceName, value);
      },
      effect(fn) {
        const disposer = fn();
        effects.push(disposer);
        return disposer;
      },
      inject(names, callback) {
        return callback(childFor(names));
      },
      get(serviceName) {
        return services[serviceName];
      },
      on() {},
      tools: services.tools,
      systemPrompt: services.systemPrompt,
      webServer: services.webServer,
      connection: services.connection,
    },
  };
}

test('apply mounts tools, context, HTTP, and the host service with live config', () => {
  const temp = tempDir('state-apply-');
  const tools = new Map();
  const provided = new Map();
  const effects = [];
  let contextRegistration;
  let httpRegistration;
  const services = {
    tools: {
      register(definition) {
        tools.set(definition.name, definition);
      },
      get() {
        return undefined;
      },
      async execute() {
        throw new Error('not used');
      },
    },
    systemPrompt: {
      context(value) {
        contextRegistration = value;
        return () => {};
      },
    },
    webServer: {
      register(route) {
        httpRegistration = route;
        return () => {};
      },
    },
    connection: {
      admit() {
        return { peer: { principal: { kind: 'owner' } } };
      },
    },
  };
  const childFor = (names) => {
    const child = {
      get(service) {
        return names.includes(service) ? services[service] : undefined;
      },
      effect(fn) {
        const disposer = fn();
        effects.push(disposer);
        return disposer;
      },
      logger: { info() {}, warn() {}, error() {} },
    };
    for (const service of names) child[service] = services[service];
    return child;
  };
  const ctx = {
    logger: { info() {}, warn() {}, error() {} },
    provide(serviceName, value) {
      provided.set(serviceName, value);
    },
    effect(fn) {
      const disposer = fn();
      effects.push(disposer);
      return disposer;
    },
    inject(names, callback) {
      return callback(childFor(names));
    },
    get(service) {
      return services[service];
    },
    on() {},
    tools: services.tools,
    systemPrompt: services.systemPrompt,
    webServer: services.webServer,
    connection: services.connection,
  };
  try {
    const parsed = Config['~standard'].validate({ databasePath: temp.path });
    assert.equal(parsed.issues, undefined);
    apply(ctx, parsed.value);
    assert.equal(name, 'amadeus-state');
    assert.deepEqual(inject, ['tools']);
    assert.equal(provided.has('amadeusState'), true);
    assert.deepEqual([...tools.keys()].sort(), ['state_appraise', 'state_get', 'state_health', 'state_interests']);
    assert.equal(contextRegistration.name, 'amadeus-state');
    assert.equal(httpRegistration.kind, 'prefix');
    assert.equal(httpRegistration.path, '/api/amadeus-state');
    const host = provided.get('amadeusState');
    const health = host.getHealth();
    assert.equal(health.state, 'ready');
    assert.equal(health.contextInjectionMode, 'brief');

    // A volatile Config write is visible to the next health/tool/context read.
    parsed.value.contextInjectionMode[Symbol.for('cosmokit.volatile.write')]('off');
    assert.equal(host.getHealth().contextInjectionMode, 'off');
    assert.equal(contextRegistration.text({ agent: { session: { id: 'session-live' } } }), '');

    const view = host.getScopedState('session-live');
    assert.equal(view.state.mood, 0);
  } finally {
    for (const disposer of effects.reverse()) {
      try {
        if (typeof disposer === 'function') disposer();
      } catch {
        // cleanup only
      }
    }
    temp.cleanup();
  }
});

test('apply disposal and re-apply on the same database preserves state for re-enable/reinstall', () => {
  const temp = tempDir('state-apply-reinstall-');
  const tools = new Map();
  const services = {
    tools: {
      register(definition) {
        tools.set(definition.name, definition);
      },
      get() {
        return undefined;
      },
      async execute() {
        throw new Error('not used');
      },
    },
    systemPrompt: { context() { return () => {}; } },
    webServer: { register() { return () => {}; } },
    connection: { admit() { return { peer: { principal: { kind: 'owner' } } }; } },
  };
  const parsed = Config['~standard'].validate({ databasePath: temp.path });
  const first = fakeContext(services);
  let second;
  try {
    apply(first.ctx, parsed.value);
    const view = first.provided.get('amadeusState').getScopedState('session-reinstall');
    assert.equal(view.state.revision, 1);
    for (const disposer of first.effects.reverse()) {
      try { if (typeof disposer === 'function') disposer(); } catch { /* cleanup */ }
    }
    second = fakeContext(services);
    apply(second.ctx, parsed.value);
    const host = second.provided.get('amadeusState');
    assert.equal(host.getHealth().state, 'ready');
    const again = host.getScopedState('session-reinstall');
    assert.equal(again.scope.id, view.scope.id);
    assert.equal(again.state.revision, 1);
  } finally {
    for (const disposer of (second?.effects ?? []).reverse()) {
      try { if (typeof disposer === 'function') disposer(); } catch { /* cleanup */ }
    }
    temp.cleanup();
  }
});

test('an unavailable database yields an observable degraded service instead of a Host crash', () => {
  const temp = tempDir('state-apply-degraded-');
  const blocker = join(temp.dir, 'blocker');
  writeFileSync(blocker, 'not a directory');
  const tools = new Map();
  const services = {
    tools: {
      register(definition) {
        tools.set(definition.name, definition);
      },
      get() {
        return undefined;
      },
      async execute() {
        throw new Error('not used');
      },
    },
    systemPrompt: { context() { return () => {}; } },
    webServer: { register() { return () => {}; } },
    connection: { admit() { return { peer: { principal: { kind: 'owner' } } }; } },
  };
  try {
    const parsed = Config['~standard'].validate({ databasePath: join(blocker, 'state.sqlite') });
    const harness = fakeContext(services);
    assert.doesNotThrow(() => apply(harness.ctx, parsed.value));
    const host = harness.provided.get('amadeusState');
    assert.equal(host.getHealth().state, 'degraded');
    assert.ok(tools.has('state_health'));
    assert.throws(() => host.getScopedState('session-degraded'), /unavailable/);
  } finally {
    temp.cleanup();
  }
});
