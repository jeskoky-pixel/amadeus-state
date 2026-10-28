import assert from 'node:assert/strict';
import test from 'node:test';
import { sameOrigin } from '../src/http.js';
import { fakeLife, fakeWorkspaceRegistry, httpHarness, makeService } from './helpers.js';

function req(headers = {}) {
  return {
    headers: {
      host: '127.0.0.1:1234',
      origin: 'http://127.0.0.1:1234',
      'sec-fetch-site': 'same-origin',
      ...headers,
    },
  };
}

test('same-origin fence rejects cross-site, foreign origin, and missing host', () => {
  assert.equal(sameOrigin(req()), true);
  assert.equal(sameOrigin(req({ 'sec-fetch-site': 'cross-site' })), false);
  assert.equal(sameOrigin(req({ origin: 'http://evil.example' })), false);
  assert.equal(sameOrigin(req({ origin: 'null' })), false);
  assert.equal(sameOrigin(req({ origin: undefined })), true);
  assert.equal(sameOrigin({ headers: {} }), false);
});

test('admin API requires an authenticated owner, marker header, and same-origin JSON', async () => {
  const h = makeService();
  try {
    const owner = await httpHarness(h.service);
    const remote = await httpHarness(h.service, { owner: false });
    assert.equal((await owner.request('GET', '/status')).status, 200);
    assert.equal((await remote.request('GET', '/status')).status, 403);
    assert.equal(
      (await remote.request('POST', '/restore', { file: 'state-x.sqlite', confirm: 'RESTORE' })).status,
      403,
    );
    assert.equal(
      (await owner.request('GET', '/status', undefined, { 'sec-fetch-site': 'cross-site' })).status,
      403,
    );
    assert.equal(
      (await owner.request('POST', '/backup', { confirm: 'BACKUP' }, { 'x-amadeus-state': '' })).status,
      403,
    );
    assert.equal(
      (await owner.request('POST', '/backup', { confirm: 'BACKUP' }, { 'content-type': 'text/plain' })).status,
      400,
    );
    const noConnection = await httpHarness(h.service, { connection: {} });
    assert.equal((await noConnection.request('GET', '/status')).status, 503);
  } finally {
    h.close();
  }
});

test('status, scopes, overview, interests, events, and diagnostics are scoped and safe', async () => {
  const h = makeService();
  try {
    const id = h.identity('session-http');
    await h.service.recordEvent({
      identity: id,
      type: 'exploration_completed',
      source: 'host',
      trust: 'trusted',
      summary: 'http event reason',
      idempotencyKey: 'http:1',
      topic: 'HTTP 兴趣',
      interestDelta: 5,
    });
    const view = h.service.viewForSession('session-http');
    const api = await httpHarness(h.service);
    const status = await api.request('GET', '/status');
    assert.equal(status.status, 200);
    assert.equal(status.body.data.admin, true);
    assert.equal(status.body.data.state, 'ready');
    assert.equal(JSON.stringify(status.body).includes('state.sqlite'), false);

    const scopes = await api.request('GET', '/scopes');
    assert.equal(scopes.status, 200);
    assert.equal(scopes.body.data.scopes.length, 1);
    const scope = scopes.body.data.scopes[0];
    assert.equal(scope.authorized, true);

    const overview = await api.request('GET', `/overview?scope=${encodeURIComponent(scope.id)}`);
    assert.equal(overview.status, 200);
    assert.equal(overview.body.data.state.mood > 0, true);
    assert.equal(overview.body.data.config, undefined);

    const interests = await api.request('GET', `/interests?scope=${encodeURIComponent(scope.id)}`);
    assert.equal(interests.status, 200);
    assert.equal(interests.body.data.interests[0].name, 'HTTP 兴趣');

    const events = await api.request('GET', `/events?scope=${encodeURIComponent(scope.id)}&page=1&pageSize=5`);
    assert.equal(events.status, 200);
    assert.equal(events.body.data.items.length, 1);
    assert.equal(events.body.data.items[0].summary, 'http event reason');

    const diagnostics = await api.request('GET', '/diagnostics');
    assert.equal(diagnostics.status, 200);
    assert.equal(JSON.stringify(diagnostics.body).includes(h.temp.dir), false);
    assert.equal(diagnostics.body.data.schema.schemaVersion, '2');

    assert.equal(view.scope.id, scope.id);
  } finally {
    h.close();
  }
});

test('preview is read-only, interests can be managed, reset conflicts are handled, and backup works', async () => {
  const h = makeService();
  try {
    const api = await httpHarness(h.service);
    const view = h.service.viewForSession('session-http-mutate');
    const scope = view.scope.id;
    const beforeEvents = h.store.health().counts.events;
    const preview = await api.request('POST', '/preview', {
      scope,
      eventType: 'exploration_completed',
      config: { eventSensitivity: 2 },
    });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.data.before.mood, 0);
    assert.equal(h.store.health().counts.events, beforeEvents, 'preview must not write events');

    const added = await api.request('POST', '/interests', {
      action: 'add',
      scope,
      name: '手工兴趣',
      baseline: 77,
      aliases: ['手工', 'manual'],
    });
    assert.equal(added.status, 200);
    assert.equal(added.body.data.interest.baseline, 77);
    const list = await api.request('GET', `/interests?scope=${encodeURIComponent(scope)}`);
    assert.equal(list.body.data.interests.length, 1);

    const updated = await api.request('POST', '/interests', {
      action: 'update',
      scope,
      id: added.body.data.interest.id,
      baseline: 42,
      aliases: ['新的别名'],
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.interest.baseline, 42);

    const disabled = await api.request('POST', '/interests', {
      action: 'disable',
      scope,
      id: added.body.data.interest.id,
    });
    assert.equal(disabled.status, 200);
    assert.equal(disabled.body.data.disabled, true);
    const enabled = await api.request('POST', '/interests', {
      action: 'disable',
      scope,
      id: added.body.data.interest.id,
      disabled: false,
    });
    assert.equal(enabled.status, 200);
    assert.equal(enabled.body.data.disabled, false);

    const badReset = await api.request('POST', '/reset', {
      scope,
      expectedRevision: 999,
      confirm: 'RESET',
    });
    assert.equal(badReset.status, 409);
    const current = await api.request('GET', `/overview?scope=${encodeURIComponent(scope)}`);
    const reset = await api.request('POST', '/reset', {
      scope,
      expectedRevision: current.body.data.state.revision,
      confirm: 'RESET',
    });
    assert.equal(reset.status, 200);
    assert.equal(reset.body.data.state.mood, 0);

    const backup = await api.request('POST', '/backup', { confirm: 'BACKUP' });
    assert.equal(backup.status, 200);
    assert.match(backup.body.data.file, /^state-manual-.*\.sqlite$/);

    const deleted = await api.request('POST', '/interests', {
      action: 'delete',
      scope,
      id: added.body.data.interest.id,
    });
    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.data.memoryUnaffected, true);
    assert.equal((await api.request('GET', `/interests?scope=${encodeURIComponent(scope)}`)).body.data.interests.length, 0);
  } finally {
    h.close();
  }
});

test('backups can be listed and restored only with explicit confirmation', async () => {
  const h = makeService();
  try {
    const id = h.identity('session-http-restore');
    await h.service.recordEvent({
      identity: id,
      type: 'knowledge_gained',
      source: 'host',
      trust: 'trusted',
      summary: 'before backup',
      idempotencyKey: 'http-restore:1',
      topic: '恢复 HTTP',
      interestDelta: 4,
    });
    const backup = h.service.backup('http');
    await h.service.recordEvent({
      identity: id,
      type: 'knowledge_gained',
      source: 'host',
      trust: 'trusted',
      summary: 'after backup',
      idempotencyKey: 'http-restore:2',
    });
    const api = await httpHarness(h.service);
    const list = await api.request('GET', '/backups');
    assert.equal(list.status, 200);
    assert.ok(list.body.data.backups.some((item) => item.file === backup.file));
    assert.equal(JSON.stringify(list.body).includes(h.temp.dir), false);
    assert.equal((await api.request('POST', '/restore', { file: backup.file, confirm: 'NO' })).status, 400);
    assert.equal((await api.request('POST', '/restore', { file: '../state.sqlite', confirm: 'RESTORE' })).status, 400);
    const restored = await api.request('POST', '/restore', { file: backup.file, confirm: 'RESTORE' });
    assert.equal(restored.status, 200);
    assert.equal(restored.body.data.health.database.counts.events, 1);
    assert.ok(restored.body.data.backups.some((item) => item.file === backup.file));
    assert.equal(h.store.health().counts.events, 1);
    const status = await api.request('GET', '/status');
    assert.equal(status.status, 200);
    assert.equal(status.body.data.state, 'ready');
  } finally {
    h.close();
  }
});

test('a revoked Life scope is shown as unauthorized and refuses derived admin reads', async () => {
  const life = fakeLife({ sessionId: 'session-http-life', sceneId: 'scene-http-life', personaId: 'persona-http-life' });
  const h = makeService({ life, config: { lifeIntegrationEnabled: true } });
  try {
    const view = h.service.viewForSession('session-http-life');
    const api = await httpHarness(h.service);
    const overview = await api.request('GET', `/overview?scope=${encodeURIComponent(view.scope.id)}`);
    assert.equal(overview.status, 200);
    assert.notEqual(overview.body.data.state, null);
    life.revoke();
    const revoked = await api.request('GET', `/overview?scope=${encodeURIComponent(view.scope.id)}`);
    assert.equal(revoked.status, 200);
    assert.equal(revoked.body.data.state, null);
    assert.equal(revoked.body.data.authorization.authorized, false);
    assert.equal((await api.request('GET', `/events?scope=${encodeURIComponent(view.scope.id)}`)).status, 403);
    assert.equal((await api.request('GET', `/interests?scope=${encodeURIComponent(view.scope.id)}`)).status, 403);
  } finally {
    h.close();
  }
});

test('invalid scope, page, and confirmation values are rejected without writes', async () => {
  const h = makeService();
  try {
    const api = await httpHarness(h.service);
    assert.equal((await api.request('GET', '/overview?scope=missing')).status, 404);
    const view = h.service.viewForSession('session-http-invalid');
    assert.equal(
      (await api.request('GET', `/events?scope=${encodeURIComponent(view.scope.id)}&page=0`)).status,
      400,
    );
    assert.equal(
      (await api.request('POST', '/reset', { scope: view.scope.id, expectedRevision: 1, confirm: 'yes' })).status,
      400,
    );
    assert.equal(
      (await api.request('POST', '/interests', { action: 'explode', scope: view.scope.id })).status,
      400,
    );
    assert.equal(
      (await api.request('POST', '/preview', {
        scope: view.scope.id,
        eventType: 'meaningful_interaction',
        config: { eventSensitivity: 99 },
      })).status,
      400,
    );
    assert.equal(
      (await api.request('POST', '/preview', {
        scope: view.scope.id,
        eventType: 'not-an-event',
        config: {},
      })).status,
      400,
    );
    assert.equal(h.store.health().counts.events, 0);
  } finally {
    h.close();
  }
});

test('Workspace binding and Session rules are owner API operations with live membership checks', async () => {
  const registry = fakeWorkspaceRegistry({
    workspaces: [
      { id: 'ws-alpha', title: 'Alpha', sessionIds: ['s1', 's2'] },
      { id: 'ws-beta', title: 'Beta', sessionIds: ['s3'] },
    ],
  });
  const h = makeService({ registry });
  try {
    const api = await httpHarness(h.service);
    const list = await api.request('GET', '/workspaces');
    assert.equal(list.status, 200);
    assert.equal(list.body.data.binding.state, 'unbound');
    assert.equal(list.body.data.workspaces.length, 2);
    assert.equal(JSON.stringify(list.body).includes(h.temp.dir), false);

    const bind = await api.request('POST', '/workspace', { action: 'bind', workspaceId: 'ws-alpha' });
    assert.equal(bind.status, 200);
    assert.equal(bind.body.data.state, 'ready');

    const workspace = await api.request('GET', '/workspace');
    assert.equal(workspace.status, 200);
    assert.equal(workspace.body.data.binding.workspaceId, 'ws-alpha');
    assert.equal(workspace.body.data.sessions.length, 2);
    assert.equal(workspace.body.data.sessions[0].mode, 'shared');
    assert.equal(workspace.body.data.qqSceneRules.implemented, false);

    const rule = await api.request('POST', '/session-rules', { action: 'set', sessionId: 's2', mode: 'read_only' });
    assert.equal(rule.status, 200);
    assert.equal(rule.body.data.sessions.find((entry) => entry.sessionId === 's2').mode, 'read_only');

    const rejected = await api.request('POST', '/session-rules', { action: 'set', sessionId: 's3', mode: 'disabled' });
    assert.equal(rejected.status, 400);

    const cleared = await api.request('POST', '/session-rules', { action: 'clear', sessionId: 's2' });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.data.sessions.find((entry) => entry.sessionId === 's2').explicit, false);

    const noConfirm = await api.request('POST', '/workspace', { action: 'unbind' });
    assert.equal(noConfirm.status, 400);
    const unbound = await api.request('POST', '/workspace', { action: 'unbind', confirm: 'UNBIND' });
    assert.equal(unbound.status, 200);
    assert.equal(unbound.body.data.state, 'unbound');
  } finally {
    h.close();
  }
});

test('a non-owner cannot bind or change Session rules', async () => {
  const registry = fakeWorkspaceRegistry({ workspaces: [{ id: 'ws-alpha', sessionIds: ['s1'] }] });
  const h = makeService({ registry });
  try {
    const remote = await httpHarness(h.service, { owner: false });
    assert.equal((await remote.request('GET', '/workspace')).status, 403);
    assert.equal((await remote.request('POST', '/workspace', { action: 'bind', workspaceId: 'ws-alpha' })).status, 403);
    assert.equal((await remote.request('POST', '/session-rules', { action: 'set', sessionId: 's1', mode: 'disabled' })).status, 403);
  } finally {
    h.close();
  }
});
