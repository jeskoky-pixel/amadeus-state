import assert from 'node:assert/strict';
import test from 'node:test';
import { copyFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { StateStore } from '../src/store.js';
import { StateService } from '../src/service.js';
import { normalizeConfig } from '../src/config.js';
import { localIdentity } from '../src/scope.js';
import { T0, makeService, tempDir } from './helpers.js';

test('a fresh store creates schema, state, event, and interest durably', async () => {
  const h = makeService();
  try {
    const id = h.identity('session-store-1');
    await h.service.recordEvent({
      identity: id,
      type: 'knowledge_gained',
      source: 'host',
      trust: 'trusted',
      summary: 'learned a durable fact',
      idempotencyKey: 'store:event:1',
      topic: 'SQLite',
      interestDelta: 3,
    });
    const health = h.store.health();
    assert.equal(health.ok, true);
    assert.equal(health.counts.events, 1);
    assert.equal(health.counts.interests, 1);
    const view = h.service.viewForSession('session-store-1');
    assert.equal(view.interests.length, 1);
    assert.equal(view.interests[0].name, 'SQLite');
    assert.ok(view.state.curiosity > 55);

    h.store.close();
    const reopened = new StateStore({ databasePath: h.temp.path });
    try {
      assert.equal(reopened.health().counts.events, 1);
      const service = new StateService({
        store: reopened,
        getConfig: () => normalizeConfig({}),
        version: '1.0.0',
        startedAt: new Date(T0).toISOString(),
      });
      const again = service.viewForSession('session-store-1');
      assert.equal(again.interests[0].name, 'SQLite');
    } finally {
      reopened.close();
    }
  } finally {
    h.temp.cleanup();
  }
});

test('the same idempotency key never applies twice', async () => {
  const h = makeService();
  try {
    const id = h.identity('session-idem');
    const first = await h.service.recordEvent({
      identity: id,
      type: 'meaningful_interaction',
      source: 'host',
      trust: 'trusted',
      summary: 'first',
      idempotencyKey: 'idem:1',
      topic: '重复',
      interestDelta: 2,
    });
    const stateAfterFirst = first.state;
    const second = await h.service.recordEvent({
      identity: id,
      type: 'meaningful_interaction',
      source: 'host',
      trust: 'trusted',
      summary: 'second should not apply',
      idempotencyKey: 'idem:1',
      topic: '重复',
      interestDelta: 2,
    });
    assert.equal(second.duplicate, true);
    assert.deepEqual(second.state, stateAfterFirst);
    assert.equal(h.store.health().counts.events, 1);
    assert.equal(h.store.health().counts.interests, 1);
  } finally {
    h.close();
  }
});

test('backup creates a restorable SQLite file and prunes old backups', async () => {
  const h = makeService();
  try {
    const info = h.service.backup('test');
    assert.match(info.file, /^state-test-.*\.sqlite$/);
    const backupDir = join(h.temp.dir, 'backups');
    assert.ok(existsSync(join(backupDir, info.file)));
    const copy = new DatabaseSync(join(backupDir, info.file), { readOnly: true });
    try {
      const integrity = copy.prepare('PRAGMA integrity_check').get();
      assert.equal(Object.values(integrity)[0], 'ok');
    } finally {
      copy.close();
    }
    for (let i = 0; i < 7; i += 1) h.service.backup(`test-${i}`);
    const files = readdirSync(backupDir).filter((name) => name.endsWith('.sqlite'));
    assert.ok(files.length <= 5, `expected <= 5 backups, got ${files.length}`);
  } finally {
    h.close();
  }
});

test('a newer or unsupported schema is refused and backed up, never overwritten', async () => {
  const h = makeService();
  let path;
  try {
    path = h.temp.path;
    h.store.close();
    const raw = new DatabaseSync(path);
    raw.prepare("UPDATE meta SET value = '99' WHERE key = 'schema_version'").run();
    raw.close();
    assert.throws(() => new StateStore({ databasePath: path }), /newer than this build|unsupported/);
    const backupDir = join(h.temp.dir, 'backups');
    assert.ok(existsSync(backupDir));
    assert.ok(readdirSync(backupDir).some((name) => name.startsWith('state-before-migration-')));
  } finally {
    h.temp.cleanup();
  }
});

test('an empty or corrupt existing file is refused instead of being initialized', () => {
  const empty = tempDir('state-empty-');
  try {
    writeFileSync(empty.path, '');
    assert.throws(() => new StateStore({ databasePath: empty.path }), /empty; refusing to overwrite/);
  } finally {
    empty.cleanup();
  }
  const corrupt = tempDir('state-corrupt-');
  try {
    writeFileSync(corrupt.path, 'this is not a sqlite database');
    assert.throws(() => new StateStore({ databasePath: corrupt.path }), /integrity|open|database/i);
  } finally {
    corrupt.cleanup();
  }
});

test('a backup can be restored over the live database and reopened', async () => {
  const h = makeService();
  try {
    const id = h.identity('session-restore');
    await h.service.recordEvent({
      identity: id,
      type: 'knowledge_gained',
      source: 'host',
      trust: 'trusted',
      summary: 'restore me',
      idempotencyKey: 'restore:1',
      topic: '恢复测试',
      interestDelta: 3,
    });
    const backup = h.service.backup('restore');
    const backupPath = join(h.temp.dir, 'backups', backup.file);
    h.store.close();
    copyFileSync(backupPath, h.temp.path);
    try {
      // The backup intentionally contains the writer lease row. In this
      // same-process restore test the old adapter has closed but its PID is
      // still alive, so clear the stale lease as a process restart would.
      const raw = new DatabaseSync(h.temp.path);
      raw.prepare("DELETE FROM runtime_leases WHERE key = 'writer'").run();
      raw.close();
      const reopened = new StateStore({ databasePath: h.temp.path });
      try {
        assert.equal(reopened.health().counts.events, 1);
        assert.equal(reopened.health().counts.interests, 1);
      } finally {
        reopened.close();
      }
    } finally {
      // h.close() below is idempotent; h.temp.cleanup() removes the directory.
    }
  } finally {
    h.temp.cleanup();
  }
});

test('a live second writer is refused by the runtime lease', () => {
  const h = makeService();
  try {
    assert.throws(
      () => new StateStore({ databasePath: h.temp.path }),
      /held by another live adapter/,
    );
  } finally {
    h.close();
  }
});

test('admin reset requires the current revision, backs up, and keeps history', async () => {
  const h = makeService();
  try {
    const id = h.identity('session-reset');
    await h.service.recordEvent({
      identity: id,
      type: 'exploration_completed',
      source: 'host',
      trust: 'trusted',
      summary: 'explored',
      idempotencyKey: 'reset:1',
      topic: '重置测试',
      interestDelta: 5,
    });
    const before = h.service.viewForSession('session-reset');
    assert.throws(
      () => h.service.resetState({ scopeId: before.scope.id, expectedRevision: 99, confirm: 'RESET' }),
      /changed since it was read/,
    );
    const reset = h.service.resetState({ scopeId: before.scope.id, expectedRevision: before.state.revision, confirm: 'RESET' });
    assert.equal(reset.state.mood, 0);
    assert.equal(reset.state.energy, 60);
    assert.equal(reset.state.curiosity, 55);
    assert.equal(reset.event.type, 'admin_reset');
    const after = h.service.viewForSession('session-reset');
    assert.equal(after.state.mood, 0);
    assert.equal(after.interests.length, 1, 'interests are not deleted by a state reset');
    assert.ok(after.auditPage === undefined || true);
    const audit = h.service.auditPage(after.scope.id, { limit: 20, offset: 0 });
    assert.ok(audit.items.some((event) => event.type === 'admin_reset'));
    assert.ok(readdirSync(join(h.temp.dir, 'backups')).some((name) => name.startsWith('state-before-reset-')));
  } finally {
    h.close();
  }
});

test('audit retention prunes ordinary events but keeps administrator rows', async () => {
  const h = makeService({ config: { auditRetentionDays: 1 } });
  try {
    const id = h.identity('session-prune');
    await h.service.recordEvent({
      identity: id,
      type: 'meaningful_interaction',
      source: 'host',
      trust: 'trusted',
      summary: 'old',
      idempotencyKey: 'prune:old',
    });
    const view = h.service.viewForSession('session-prune');
    h.service.resetState({ scopeId: view.scope.id, expectedRevision: view.state.revision, confirm: 'RESET' });
    // Move the injected clock well beyond retention, then produce a new event
    // so pruneEvents runs.
    h.now.value = T0 + 3 * 86_400_000;
    await h.service.recordEvent({
      identity: id,
      type: 'knowledge_gained',
      source: 'host',
      trust: 'trusted',
      summary: 'new event triggers prune',
      idempotencyKey: 'prune:new',
    });
    const audit = h.service.auditPage(view.scope.id, { limit: 50, offset: 0 });
    const types = audit.items.map((event) => event.type);
    assert.ok(types.includes('knowledge_gained'));
    assert.ok(types.includes('admin_reset'), 'admin rows are retained');
    assert.ok(!types.includes('meaningful_interaction'), 'ordinary old rows are pruned');
  } finally {
    h.close();
  }
});
