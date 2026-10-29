/**
 * Shared test harness.  No DSH packages are imported; fake Host surfaces are
 * intentionally small so the State contract is exercised, not the harness.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateStore } from '../src/store.js';
import { StateService } from '../src/service.js';
import { normalizeConfig } from '../src/config.js';
import { localIdentity } from '../src/scope.js';

export const T0 = Date.parse('2026-01-01T00:00:00.000Z');

export function tempDir(prefix = 'state-test-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return {
    dir,
    path: join(dir, 'state.sqlite'),
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * @param {{config?: Record<string, unknown>, now?: {value: number}, life?: Record<string, any>, memory?: Record<string, any>, registry?: Record<string, any>}} [options] - harness.
 */
export function makeService(options = {}) {
  const temp = tempDir();
  const now = options.now ?? { value: T0 };
  const clock = () => now.value;
  const store = new StateStore({ databasePath: temp.path, clock });
  const config = options.config ?? {};
  const service = new StateService({
    store,
    getConfig: () => normalizeConfig(config),
    getLife: () => options.life,
    getRegistry: () => options.registry,
    memory: options.memory,
    clock,
    version: '1.2.0',
    startedAt: new Date(T0).toISOString(),
  });
  return {
    temp,
    store,
    service,
    clock,
    now,
    identity: (sessionId = 'session-test-1') => localIdentity(sessionId),
    close() {
      store.close();
      temp.cleanup();
    },
  };
}

export function toolContext() {
  const tools = new Map();
  let registrations = 0;
  const ctx = {
    tools: {
      register(definition) {
        registrations += 1;
        tools.set(definition.name, definition);
      },
      get(name) {
        return tools.get(name);
      },
      async execute() {
        throw new Error('not implemented in this harness');
      },
    },
    logger: { info() {}, warn() {}, error() {} },
    effect(fn) {
      return fn;
    },
    on() {},
    get() {
      return undefined;
    },
  };
  return {
    ctx,
    tools,
    get registrations() {
      return registrations;
    },
    call(name, args = {}, exec = execFor()) {
      const definition = tools.get(name);
      if (!definition) throw new Error(`tool not registered: ${name}`);
      return definition.execute(args, exec);
    },
  };
}

export function execFor(sessionId = 'session-test-1', turn = 1, seq = 10) {
  return {
    agent: { session: { id: sessionId, seq }, phase: { turn } },
    callId: `call-${turn}`,
    token: `token-${turn}`,
    signal: undefined,
  };
}

export function fakeLife({ sessionId = 'session-test-1', sceneId = 'scene-1', personaId = 'persona-1', privacy = 'private', revoked = false, errors = {} } = {}) {
  const binding = {
    targetSessionId: sessionId,
    personaId,
    sceneId,
    principalId: 'principal-1',
    authorizationRef: 'life:test',
    active: !revoked,
    revision: 2,
  };
  const activities = new Map();
  const life = {
    getSessionBinding(id) {
      if (errors.binding) throw errors.binding;
      if (id !== sessionId) throw Object.assign(new Error('not found'), { code: 'LIFE_NOT_FOUND' });
      return { ...binding, active: revoked ? false : binding.active };
    },
    getScene(id) {
      if (errors.scene) throw errors.scene;
      if (id !== sceneId) throw Object.assign(new Error('not found'), { code: 'LIFE_NOT_FOUND' });
      return { id: sceneId, personaId, privacy, revision: 1 };
    },
    async getActivityStatus(id, scope) {
      if (errors.activity) throw errors.activity;
      const activity = activities.get(id);
      if (!activity) throw Object.assign(new Error('not found'), { code: 'LIFE_NOT_FOUND' });
      if (scope !== `session:${sessionId}`) throw Object.assign(new Error('not found'), { code: 'LIFE_NOT_FOUND' });
      return { activity, providerStatus: activity.status, evidenceRefs: activity.evidenceRefs ?? [] };
    },
    addActivity(id, overrides = {}) {
      const activity = {
        id,
        status: 'completed',
        revision: 1,
        personaId,
        sceneId,
        description: '阅读一篇技术文章',
        evidenceRefs: [`provider:${id}:complete`],
        updatedAt: new Date(T0).toISOString(),
        ...overrides,
      };
      activities.set(id, activity);
      return activity;
    },
    revoke() {
      revoked = true;
    },
    binding,
    activities,
  };
  return life;
}

export function fakeMemory({ fail = false, entries = new Map() } = {}) {
  const calls = [];
  return {
    calls,
    contract: 'test-memory',
    available: () => !fail,
    async getMemory(exec, id) {
      calls.push({ op: 'get', id });
      if (fail) throw new Error('memory unavailable');
      return entries.get(id) ?? null;
    },
    async saveSummary(input) {
      calls.push({ op: 'save', title: input.title });
      if (fail) throw new Error('memory write failed');
      return { action: 'created', id: 'mem-1' };
    },
  };
}

/**
 * Fake official workspaceRegistry surface used by the authority tests.
 * @param {{workspaces?: Array<{id: string, title?: string, sessionIds?: string[]}>, archived?: string[]}} [options] - synthetic registry.
 */
export function fakeWorkspaceRegistry({ workspaces = [], archived = [] } = {}) {
  let items = workspaces.map((workspace) => ({
    id: workspace.id,
    title: workspace.title ?? workspace.id,
    sessionIds: [...(workspace.sessionIds ?? [])],
  }));
  let archivedIds = [...archived];
  return {
    get(id) {
      const entity = items.find((workspace) => workspace.id === id);
      return entity;
    },
    list() {
      return items;
    },
    get archivedSessionIds() {
      return archivedIds;
    },
    addSession(workspaceId, sessionId) {
      const entity = items.find((workspace) => workspace.id === workspaceId);
      if (entity && !entity.sessionIds.includes(sessionId)) entity.sessionIds.unshift(sessionId);
    },
    removeSession(workspaceId, sessionId) {
      const entity = items.find((workspace) => workspace.id === workspaceId);
      if (entity) entity.sessionIds = entity.sessionIds.filter((id) => id !== sessionId);
    },
    archive(sessionId) {
      if (!archivedIds.includes(sessionId)) archivedIds.unshift(sessionId);
    },
    unarchive(sessionId) {
      archivedIds = archivedIds.filter((id) => id !== sessionId);
    },
    removeWorkspace(workspaceId) {
      items = items.filter((workspace) => workspace.id !== workspaceId);
    },
  };
}

/**
 * Build a fake HTTP harness around mountHttp without loading DSH.
 * @param {Record<string, any>} service - State service.
 * @param {{owner?: boolean, connection?: Record<string, any>}} [options] - harness.
 */
export async function httpHarness(service, { owner = true, connection } = {}) {
  const { mountHttp } = await import('../src/http.js');
  let handler;
  const fakeConnection = connection ?? {
    admit() {
      return { peer: { principal: { kind: owner ? 'owner' : 'remote' } } };
    },
  };
  const child = {
    webServer: {
      register(route) {
        handler = route.handler;
        return () => {};
      },
    },
    connection: fakeConnection,
    get(name) {
      return name === 'connection' ? fakeConnection : undefined;
    },
    effect(fn) {
      return fn();
    },
    logger: { warn() {}, error() {}, info() {} },
  };
  const ctx = {
    inject(names, callback) {
      return callback(child);
    },
    get(name) {
      return name === 'connection' ? fakeConnection : undefined;
    },
  };
  mountHttp(ctx, service);
  if (!handler) throw new Error('HTTP route was not registered');

  async function request(method, path, body, headers = {}) {
    const reqHeaders = {
      host: '127.0.0.1:1234',
      origin: 'http://127.0.0.1:1234',
      'sec-fetch-site': 'same-origin',
      ...(body === undefined ? {} : { 'content-type': 'application/json', 'x-amadeus-state': '1' }),
      ...headers,
    };
    const req = {
      method,
      url: `/api/amadeus-state${path}`,
      headers: reqHeaders,
      async *[Symbol.asyncIterator]() {
        if (body !== undefined) yield Buffer.from(JSON.stringify(body));
      },
    };
    let status = 0;
    let responseHeaders = {};
    let text = '';
    const res = {
      writeHead(code, values) {
        status = code;
        responseHeaders = values;
      },
      end(value) {
        text = String(value ?? '');
      },
    };
    await handler(req, res);
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
    return { status, headers: responseHeaders, body: parsed, text };
  }

  return { request, handler };
}
