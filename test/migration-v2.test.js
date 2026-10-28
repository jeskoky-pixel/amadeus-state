/**
 * Safe v1.0 → v1.1 (schema 1 → 2) migration regressions.
 * Fixtures are synthetic and written to a temporary directory.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { StateStore } from '../src/store.js';
import { tempDir, T0 } from './helpers.js';

const V1_SQL = `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE scopes (
  id TEXT PRIMARY KEY, persona_id TEXT NOT NULL, scene_id TEXT NOT NULL,
  privacy TEXT NOT NULL CHECK (privacy IN ('private', 'shared')),
  source TEXT NOT NULL CHECK (source IN ('life', 'local')),
  owner_session_id TEXT, binding_revision INTEGER,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_scopes_identity ON scopes (persona_id, scene_id);
CREATE TABLE state_snapshots (
  scope_id TEXT PRIMARY KEY REFERENCES scopes(id) ON DELETE CASCADE,
  mood REAL NOT NULL, energy REAL NOT NULL, curiosity REAL NOT NULL,
  baseline_mood REAL NOT NULL, baseline_energy REAL NOT NULL, baseline_curiosity REAL NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL, clock_anomaly_at TEXT
);
CREATE TABLE events (
  id TEXT PRIMARY KEY, scope_id TEXT NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL UNIQUE, type TEXT NOT NULL, source TEXT NOT NULL, trust TEXT NOT NULL,
  source_ref TEXT, summary TEXT NOT NULL, appraisal_json TEXT NOT NULL, delta_json TEXT NOT NULL,
  baseline_delta_json TEXT NOT NULL, before_json TEXT NOT NULL, after_json TEXT NOT NULL,
  interest_changes_json TEXT NOT NULL, evidence_json TEXT NOT NULL,
  session_id TEXT, persona_id TEXT, scene_id TEXT, occurred_at TEXT NOT NULL, recorded_at TEXT NOT NULL
);
CREATE INDEX idx_events_scope_time ON events (scope_id, recorded_at DESC);
CREATE INDEX idx_events_session_time ON events (session_id, recorded_at DESC);
CREATE INDEX idx_events_source_time ON events (scope_id, source, recorded_at DESC);
CREATE TABLE interests (
  id TEXT PRIMARY KEY, scope_id TEXT NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
  name TEXT NOT NULL, normalized_name TEXT NOT NULL, aliases_json TEXT NOT NULL DEFAULT '[]',
  baseline REAL NOT NULL, activity REAL NOT NULL, last_event_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL, source_ref TEXT, manual INTEGER NOT NULL DEFAULT 0, disabled INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX idx_interests_scope_name ON interests (scope_id, normalized_name);
CREATE INDEX idx_interests_scope_activity ON interests (scope_id, activity DESC);
CREATE TABLE interest_aliases (
  scope_id TEXT NOT NULL, alias TEXT NOT NULL,
  interest_id TEXT NOT NULL REFERENCES interests(id) ON DELETE CASCADE,
  PRIMARY KEY (scope_id, alias)
);
CREATE TABLE scope_shares (
  scope_id TEXT NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
  data_scope TEXT NOT NULL, granted_at TEXT NOT NULL, revoked_at TEXT,
  PRIMARY KEY (scope_id, data_scope)
);
CREATE TABLE runtime_leases (key TEXT PRIMARY KEY, owner_id TEXT NOT NULL, pid INTEGER NOT NULL, acquired_at TEXT NOT NULL);
`;

const NOW = new Date(T0).toISOString();

/**
 * Build a v1 database with one private scope, event, and interest.
 * @param {string} path - database path.
 * @param {{badMigrationTable?: boolean}} [options] - injected corruption.
 */
function createV1Database(path, { badMigrationTable = false } = {}) {
  const db = new DatabaseSync(path);
  try {
    db.exec(V1_SQL);
    db.prepare("INSERT INTO meta (key, value) VALUES ('schema_version', '1')").run();
    db.prepare("INSERT INTO meta (key, value) VALUES ('created_at', ?)").run(NOW);
    db.prepare(
      `INSERT INTO scopes (id, persona_id, scene_id, privacy, source, owner_session_id, binding_revision, created_at, updated_at)
       VALUES ('local:legacy-session', 'local:default', 'local:session:legacy-session', 'private', 'local', 'legacy-session', NULL, ?, ?)`,
    ).run(NOW, NOW);
    db.prepare(
      `INSERT INTO state_snapshots
         (scope_id, mood, energy, curiosity, baseline_mood, baseline_energy, baseline_curiosity, revision, updated_at, clock_anomaly_at)
       VALUES ('local:legacy-session', 21, 73, 86, 10, 60, 55, 3, ?, NULL)`,
    ).run(NOW);
    db.prepare(
      `INSERT INTO events
         (id, scope_id, idempotency_key, type, source, trust, source_ref, summary, appraisal_json, delta_json,
          baseline_delta_json, before_json, after_json, interest_changes_json, evidence_json,
          session_id, persona_id, scene_id, occurred_at, recorded_at)
       VALUES ('legacy-event', 'local:legacy-session', 'legacy:1', 'meaningful_interaction', 'host', 'trusted', NULL,
          'legacy event must survive', '{}', '{"mood":1}', '{}', '{}', '{}', '[]', '[]',
          'legacy-session', 'local:default', 'local:session:legacy-session', ?, ?)`,
    ).run(NOW, NOW);
    db.prepare(
      `INSERT INTO interests
         (id, scope_id, name, normalized_name, aliases_json, baseline, activity, last_event_at,
          created_at, updated_at, revision, source, source_ref, manual, disabled)
       VALUES ('legacy-interest', 'local:legacy-session', 'Legacy Topic', 'legacy topic', '[]', 70, 20, ?,
          ?, ?, 2, 'manual', 'admin:test', 1, 0)`,
    ).run(NOW, NOW, NOW);
    if (badMigrationTable) db.exec('CREATE TABLE migration_log (x TEXT)');
  } finally {
    db.close();
  }
}

test('v1 migrates to v2 additively with a consistent pre-migration backup', () => {
  const temp = tempDir('state-migrate-ok-');
  try {
    createV1Database(temp.path);
    const store = new StateStore({ databasePath: temp.path, clock: () => T0 });
    try {
      assert.equal(store.health().schemaVersion, '2');
      assert.equal(store.health().counts.events, 1);
      assert.equal(store.health().counts.interests, 1);
      assert.equal(store.getState('local:legacy-session').mood, 21);
      assert.equal(store.getScope('local:legacy-session').scope_kind, 'session');
      assert.equal(store.listInterests('local:legacy-session')[0].name, 'Legacy Topic');
      const log = store.migrationInfo();
      assert.equal(log.length, 1);
      assert.equal(log[0].fromVersion, '1');
      assert.equal(log[0].toVersion, '2');
      assert.ok(log[0].backupFile);
      const backups = readdirSync(join(temp.dir, 'backups'));
      assert.ok(backups.some((name) => name.startsWith('state-before-v2-migration-')));
      const snapshot = new DatabaseSync(join(temp.dir, 'backups', log[0].backupFile), { readOnly: true });
      try {
        assert.equal(String(snapshot.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get().value), '1');
        assert.equal(Number(snapshot.prepare('SELECT COUNT(*) AS n FROM events').get().n), 1);
      } finally {
        snapshot.close();
      }
    } finally {
      store.close();
    }
  } finally {
    temp.cleanup();
  }
});

test('a failed v2 migration rolls back every DDL step and keeps the v1 file usable', () => {
  const temp = tempDir('state-migrate-fail-');
  try {
    createV1Database(temp.path, { badMigrationTable: true });
    assert.throws(() => new StateStore({ databasePath: temp.path, clock: () => T0 }), /rolled back|migration/i);
    const raw = new DatabaseSync(temp.path, { readOnly: true });
    try {
      assert.equal(String(raw.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get().value), '1');
      const columns = raw.prepare('PRAGMA table_info(scopes)').all().map((row) => String(row.name));
      assert.equal(columns.includes('scope_kind'), false, 'the failed ALTER must be rolled back');
      assert.equal(columns.includes('workspace_id'), false);
      assert.equal(Number(raw.prepare('SELECT COUNT(*) AS n FROM events').get().n), 1);
      assert.equal(Number(raw.prepare('SELECT COUNT(*) AS n FROM interests').get().n), 1);
    } finally {
      raw.close();
    }
    const backups = readdirSync(join(temp.dir, 'backups'));
    assert.ok(backups.some((name) => name.startsWith('state-before-v2-migration-')));
  } finally {
    temp.cleanup();
  }
});

test('a v1 backup remains preflight-readable and restore migrates it after opening', () => {
  const temp = tempDir('state-restore-v1-');
  try {
    createV1Database(temp.path);
    mkdirSync(join(temp.dir, 'backups'), { recursive: true });
    copyFileSync(temp.path, join(temp.dir, 'backups', 'state-v1-manual.sqlite'));
    const store = new StateStore({ databasePath: temp.path, clock: () => T0 });
    try {
      const preflight = store.preflightBackup('state-v1-manual.sqlite');
      assert.equal(preflight.schemaVersion, '1');
      assert.equal(preflight.counts.events, 1);
      const restored = store.restoreBackup('state-v1-manual.sqlite');
      assert.equal(restored.restored.schemaVersion, '1');
      assert.equal(store.health().schemaVersion, '2');
      assert.equal(store.getState('local:legacy-session').mood, 21);
      assert.ok(existsSync(join(temp.dir, 'backups', restored.safetyBackup.file)));
    } finally {
      store.close();
    }
  } finally {
    temp.cleanup();
  }
});
