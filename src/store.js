/**
 * SQLite persistence for Amadeus State.
 *
 * Design choices:
 * - Node's built-in `node:sqlite` (no external dependency).
 * - WAL + busy_timeout; every write runs inside `BEGIN IMMEDIATE`.
 * - State, events, interests, aliases, scope shares, and idempotency keys are
 *   durable.  Existing files are verified before use and never replaced.
 * - A small runtime lease prevents two live adapters from writing one file.
 * - Migrations are transactional and preceded by a backup.
 */

import { existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync, copyFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  STATE_SCHEMA_VERSION,
  StateClosedError,
  StateConflictError,
  StateNotFoundError,
  StateStorageError,
  StateValidationError,
} from './model.js';

const V1_TABLES = [
  'meta',
  'scopes',
  'state_snapshots',
  'events',
  'interests',
  'interest_aliases',
  'scope_shares',
  'runtime_leases',
];

const V2_TABLES = [...V1_TABLES, 'session_rules', 'migration_log'];

const REQUIRED_TABLES = V2_TABLES;

/** Columns added by the v2 migration. */
const V2_SCOPE_COLUMNS = ['scope_kind', 'workspace_id'];

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scopes (
  id TEXT PRIMARY KEY,
  persona_id TEXT NOT NULL,
  scene_id TEXT NOT NULL,
  privacy TEXT NOT NULL CHECK (privacy IN ('private', 'shared')),
  source TEXT NOT NULL CHECK (source IN ('life', 'local')),
  owner_session_id TEXT,
  binding_revision INTEGER,
  scope_kind TEXT NOT NULL DEFAULT 'session' CHECK (scope_kind IN ('session', 'workspace')),
  workspace_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_scopes_identity ON scopes (persona_id, scene_id);
CREATE INDEX IF NOT EXISTS idx_scopes_workspace ON scopes (workspace_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS state_snapshots (
  scope_id TEXT PRIMARY KEY REFERENCES scopes(id) ON DELETE CASCADE,
  mood REAL NOT NULL,
  energy REAL NOT NULL,
  curiosity REAL NOT NULL,
  baseline_mood REAL NOT NULL,
  baseline_energy REAL NOT NULL,
  baseline_curiosity REAL NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  updated_at TEXT NOT NULL,
  clock_anomaly_at TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  scope_id TEXT NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  source TEXT NOT NULL,
  trust TEXT NOT NULL,
  source_ref TEXT,
  summary TEXT NOT NULL,
  appraisal_json TEXT NOT NULL,
  delta_json TEXT NOT NULL,
  baseline_delta_json TEXT NOT NULL,
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  interest_changes_json TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  session_id TEXT,
  persona_id TEXT,
  scene_id TEXT,
  occurred_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_scope_time ON events (scope_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_session_time ON events (session_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_source_time ON events (scope_id, source, recorded_at DESC);

CREATE TABLE IF NOT EXISTS interests (
  id TEXT PRIMARY KEY,
  scope_id TEXT NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  aliases_json TEXT NOT NULL DEFAULT '[]',
  baseline REAL NOT NULL,
  activity REAL NOT NULL,
  last_event_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  source TEXT NOT NULL,
  source_ref TEXT,
  manual INTEGER NOT NULL DEFAULT 0,
  disabled INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_interests_scope_name ON interests (scope_id, normalized_name);
CREATE INDEX IF NOT EXISTS idx_interests_scope_activity ON interests (scope_id, activity DESC);

CREATE TABLE IF NOT EXISTS interest_aliases (
  scope_id TEXT NOT NULL,
  alias TEXT NOT NULL,
  interest_id TEXT NOT NULL REFERENCES interests(id) ON DELETE CASCADE,
  PRIMARY KEY (scope_id, alias)
);

CREATE TABLE IF NOT EXISTS scope_shares (
  scope_id TEXT NOT NULL REFERENCES scopes(id) ON DELETE CASCADE,
  data_scope TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  revoked_at TEXT,
  PRIMARY KEY (scope_id, data_scope)
);

CREATE TABLE IF NOT EXISTS runtime_leases (
  key TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  pid INTEGER NOT NULL,
  acquired_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_rules (
  workspace_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('shared', 'read_only', 'isolated', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, session_id)
);

CREATE TABLE IF NOT EXISTS migration_log (
  id TEXT PRIMARY KEY,
  from_version TEXT NOT NULL,
  to_version TEXT NOT NULL,
  backup_file TEXT,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  detail TEXT
);
`;

/** @param {Record<string, any>} row - DB row. */
function parseJson(value, fallback) {
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

/** @param {Record<string, any>} row - DB row. */
function eventView(row) {
  return {
    id: row.id,
    scopeId: row.scope_id,
    type: row.type,
    source: row.source,
    trust: row.trust,
    sourceRef: row.source_ref ?? null,
    summary: row.summary,
    appraisal: parseJson(row.appraisal_json, {}),
    deltas: parseJson(row.delta_json, {}),
    baselineDeltas: parseJson(row.baseline_delta_json, {}),
    before: parseJson(row.before_json, {}),
    after: parseJson(row.after_json, {}),
    interestChanges: parseJson(row.interest_changes_json, []),
    evidence: parseJson(row.evidence_json, []),
    sessionId: row.session_id ?? null,
    personaId: row.persona_id ?? null,
    sceneId: row.scene_id ?? null,
    occurredAt: row.occurred_at,
    recordedAt: row.recorded_at,
  };
}

/** @param {Record<string, any>} row - DB row. */
function interestView(row) {
  return {
    id: row.id,
    scopeId: row.scope_id,
    name: row.name,
    normalizedName: row.normalized_name,
    aliases: parseJson(row.aliases_json, []),
    baseline: Number(row.baseline),
    activity: Number(row.activity),
    lastEventAt: row.last_event_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revision: Number(row.revision),
    source: row.source,
    sourceRef: row.source_ref ?? null,
    manual: Number(row.manual) === 1,
    disabled: Number(row.disabled) === 1,
  };
}

/** @param {Record<string, any>} row - DB row. */
function stateView(row) {
  return {
    scopeId: row.scope_id,
    mood: Number(row.mood),
    energy: Number(row.energy),
    curiosity: Number(row.curiosity),
    baselineMood: Number(row.baseline_mood),
    baselineEnergy: Number(row.baseline_energy),
    baselineCuriosity: Number(row.baseline_curiosity),
    revision: Number(row.revision),
    updatedAt: row.updated_at,
    clockAnomalyAt: row.clock_anomaly_at ?? null,
  };
}

export class StateStore {
  /**
   * @param {{databasePath: string, clock?: () => number, backupLimit?: number, logger?: Record<string, any>}} options - store options.
   */
  constructor({ databasePath, clock = () => Date.now(), backupLimit = 5, logger }) {
    if (typeof databasePath !== 'string' || !databasePath) throw new StateStorageError('databasePath is required');
    this.databasePath = databasePath;
    this.clock = clock;
    this.backupLimit = backupLimit;
    this.logger = logger;
    this.closed = false;
    this.inTransaction = false;
    this.ownerId = `state_${randomUUID()}`;
    this.db = undefined;
    this.open();
  }

  /** Open, verify/migrate, and acquire the writer lease. */
  open() {
    if (this.databasePath !== ':memory:') mkdirSync(dirname(this.databasePath), { recursive: true, mode: 0o700 });
    const existed = this.databasePath !== ':memory:' && existsSync(this.databasePath);
    const size = existed ? statSync(this.databasePath).size : 0;
    if (existed && size === 0) {
      throw new StateStorageError('existing State database is empty; refusing to overwrite it', {
        reason: 'empty_existing_store',
      });
    }
    let db;
    try {
      db = new DatabaseSync(this.databasePath);
      db.exec('PRAGMA busy_timeout = 5000');
      db.exec('PRAGMA foreign_keys = ON');
    } catch (error) {
      throw new StateStorageError(`could not open State database: ${String(error?.message ?? error)}`, {
        reason: 'open_failed',
      });
    }
    this.db = db;
    try {
      if (existed) this.verifyOrMigrate();
      else this.initialize();
      this.acquireLease();
      this.db.exec('PRAGMA journal_mode = WAL');
      this.db.exec('PRAGMA synchronous = NORMAL');
    } catch (error) {
      try {
        this.db?.close();
      } catch {
        // Preserve the original failure.
      }
      this.db = undefined;
      throw error;
    }
  }

  /** Create a fresh schema and metadata. */
  initialize() {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.exec(SCHEMA_SQL);
      this.db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('schema_version', STATE_SCHEMA_VERSION);
      this.db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('created_at', new Date(this.clock()).toISOString());
      this.db.exec('COMMIT');
    } catch (error) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // Preserve the original failure.
      }
      throw new StateStorageError(`could not initialize State schema: ${String(error?.message ?? error)}`, {
        reason: 'initialize_failed',
      });
    }
  }

  /** Verify an existing file and apply known migrations. Never silently replaces. */
  verifyOrMigrate() {
    const integrity = this.db.prepare('PRAGMA integrity_check').get();
    const verdict = Object.values(integrity ?? {})[0];
    if (verdict !== 'ok') {
      throw new StateStorageError('State database integrity check failed; refusing to use it', {
        reason: 'integrity_check_failed',
      });
    }
    const hasMeta = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta'")
      .get();
    if (hasMeta === undefined) {
      throw new StateStorageError('existing State database has no schema metadata; refusing to overwrite it', {
        reason: 'missing_schema',
      });
    }
    const version = this.db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get();
    if (version === undefined) {
      throw new StateStorageError('existing State database has no schema version; refusing to overwrite it', {
        reason: 'missing_schema_version',
      });
    }
    const found = String(version.value);
    if (found === STATE_SCHEMA_VERSION) {
      this.assertTables();
      this.assertColumns('scopes', ['id', 'persona_id', 'scene_id', 'privacy', 'source', 'updated_at', ...V2_SCOPE_COLUMNS]);
      this.assertColumns('state_snapshots', ['scope_id', 'mood', 'energy', 'curiosity', 'revision', 'updated_at']);
      this.assertColumns('events', ['id', 'scope_id', 'idempotency_key', 'source', 'trust', 'delta_json', 'recorded_at']);
      this.assertColumns('interests', ['id', 'scope_id', 'normalized_name', 'baseline', 'activity', 'revision']);
      this.assertColumns('session_rules', ['workspace_id', 'session_id', 'mode', 'updated_at']);
      return;
    }
    if (found === '1') {
      this.migrateV1ToV2();
      return;
    }
    if (Number(found) > Number(STATE_SCHEMA_VERSION)) {
      this.backup('before-migration', { verify: false });
      throw new StateStorageError(`State schema version ${found} is newer than this build (${STATE_SCHEMA_VERSION})`, {
        reason: 'unsupported_schema',
        found,
      });
    }
    this.backup('before-migration', { verify: false });
    throw new StateStorageError(`unsupported State schema version ${found}; this build supports ${STATE_SCHEMA_VERSION}`, {
      reason: 'unsupported_schema',
      found,
    });
  }

  /**
   * Incrementally migrate a v1 database to v2.
   *
   * The migration is deliberately additive: v1 scopes keep their ids and all
   * rows, and only two nullable/defaulted columns plus two new tables are
   * added. It runs inside one immediate transaction after a consistent backup.
   * Any failure rolls the transaction back, leaving the v1 file untouched; the
   * startup path then refuses to use it instead of partially upgrading it.
   */
  migrateV1ToV2() {
    // Verify the v1 shape before taking the snapshot so a corrupt file is never
    // presented as a migratable database.
    this.assertTables(V1_TABLES);
    this.assertColumns('scopes', ['id', 'persona_id', 'scene_id', 'privacy', 'source', 'updated_at']);
    let backup;
    try {
      backup = this.backup('before-v2-migration');
    } catch (error) {
      throw new StateStorageError(`State schema migration could not create its safety backup: ${String(error?.message ?? error)}`, {
        reason: 'migration_backup_failed',
      });
    }
    const before = {
      scopes: Number(this.db.prepare('SELECT COUNT(*) AS n FROM scopes').get().n),
      events: Number(this.db.prepare('SELECT COUNT(*) AS n FROM events').get().n),
      interests: Number(this.db.prepare('SELECT COUNT(*) AS n FROM interests').get().n),
    };
    const startedAt = new Date(this.clock()).toISOString();
    try {
      this.transaction(() => {
        this.db.exec('ALTER TABLE scopes ADD COLUMN scope_kind TEXT NOT NULL DEFAULT \'session\' CHECK (scope_kind IN (\'session\', \'workspace\'))');
        this.db.exec('ALTER TABLE scopes ADD COLUMN workspace_id TEXT');
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_scopes_workspace ON scopes (workspace_id, updated_at DESC)');
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS session_rules (
            workspace_id TEXT NOT NULL,
            session_id TEXT NOT NULL,
            mode TEXT NOT NULL CHECK (mode IN ('shared', 'read_only', 'isolated', 'disabled')),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (workspace_id, session_id)
          );
        `);
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS migration_log (
            id TEXT PRIMARY KEY,
            from_version TEXT NOT NULL,
            to_version TEXT NOT NULL,
            backup_file TEXT,
            status TEXT NOT NULL,
            started_at TEXT NOT NULL,
            completed_at TEXT,
            detail TEXT
          );
        `);
        this.db.prepare('UPDATE meta SET value = ? WHERE key = \'schema_version\'').run(STATE_SCHEMA_VERSION);
        this.db
          .prepare(
            `INSERT INTO migration_log
               (id, from_version, to_version, backup_file, status, started_at, completed_at, detail)
             VALUES (?, '1', ?, ?, 'completed', ?, ?, ?)`,
          )
          .run(
            `migration:${randomUUID()}`,
            STATE_SCHEMA_VERSION,
            backup.file,
            startedAt,
            new Date(this.clock()).toISOString(),
            JSON.stringify({ before, preserved: true }),
          );
        const after = {
          scopes: Number(this.db.prepare('SELECT COUNT(*) AS n FROM scopes').get().n),
          events: Number(this.db.prepare('SELECT COUNT(*) AS n FROM events').get().n),
          interests: Number(this.db.prepare('SELECT COUNT(*) AS n FROM interests').get().n),
        };
        if (JSON.stringify(after) !== JSON.stringify(before)) {
          throw new StateStorageError('State migration row-count check failed; rolling back', {
            reason: 'migration_row_count_changed',
          });
        }
        const integrity = this.db.prepare('PRAGMA integrity_check').get();
        if (Object.values(integrity ?? {})[0] !== 'ok') {
          throw new StateStorageError('State migration integrity check failed; rolling back', {
            reason: 'migration_integrity_failed',
          });
        }
      });
    } catch (error) {
      throw new StateStorageError(
        `State schema migration 1 → ${STATE_SCHEMA_VERSION} failed and was rolled back; the v1 database and its backup are unchanged: ${String(error?.message ?? error)}`,
        { reason: 'migration_failed', backup: backup.file },
      );
    }
    this.assertTables();
    this.assertColumns('scopes', ['id', 'persona_id', 'scene_id', 'privacy', 'source', 'updated_at', ...V2_SCOPE_COLUMNS]);
  }

  /**
   * @param {string} table - table name.
   * @param {string[]} columns - required columns.
   */
  assertColumns(table, columns) {
    const rows = this.db.prepare(`PRAGMA table_info(${table})`).all();
    const have = new Set(rows.map((row) => String(row.name)));
    const missing = columns.filter((name) => !have.has(name));
    if (missing.length > 0) {
      throw new StateStorageError(`State database table ${table} is missing columns: ${missing.join(', ')}`, {
        reason: 'missing_columns',
        table,
        missing,
      });
    }
  }

  /** @param {string[]} [tables] - expected tables. */
  assertTables(tables = REQUIRED_TABLES) {
    const rows = this.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
    const have = new Set(rows.map((row) => String(row.name)));
    const missing = tables.filter((name) => !have.has(name));
    if (missing.length > 0) {
      throw new StateStorageError(`State database is missing tables: ${missing.join(', ')}`, {
        reason: 'missing_tables',
        missing,
      });
    }
  }

  /** Acquire the single-writer lease. A live foreign pid is fail-closed. */
  acquireLease() {
    const now = new Date(this.clock()).toISOString();
    this.transaction(() => {
      const existing = this.db.prepare("SELECT * FROM runtime_leases WHERE key = 'writer'").get();
      if (existing !== undefined && existing.owner_id !== this.ownerId) {
        const pid = Number(existing.pid);
        let alive = false;
        if (Number.isInteger(pid) && pid > 0) {
          try {
            process.kill(pid, 0);
            alive = true;
          } catch (error) {
            if (error?.code !== 'ESRCH') throw error;
          }
        }
        if (alive) {
          throw new StateStorageError('State database is held by another live adapter', {
            reason: 'runtime_lease_held',
            pid,
          });
        }
        this.db.prepare("DELETE FROM runtime_leases WHERE key = 'writer'").run();
      }
      this.db
        .prepare('INSERT OR REPLACE INTO runtime_leases (key, owner_id, pid, acquired_at) VALUES (?, ?, ?, ?)')
        .run('writer', this.ownerId, process.pid, now);
    });
  }

  releaseLease() {
    try {
      this.db?.prepare("DELETE FROM runtime_leases WHERE key = 'writer' AND owner_id = ?").run(this.ownerId);
    } catch {
      // Closing a broken connection must not hide the original failure.
    }
  }

  /**
   * Run a synchronous write transaction.
   * @template T
   * @param {() => T} fn - body.
   * @returns {T} body result.
   */
  transaction(fn) {
    this.assertOpen();
    if (this.inTransaction) return fn();
    this.inTransaction = true;
    try {
      this.db.exec('BEGIN IMMEDIATE');
      const result = fn();
      if (result && typeof result.then === 'function') {
        throw new StateStorageError('State transactions must be synchronous');
      }
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // Preserve the original failure.
      }
      if (error instanceof StateStorageError || error instanceof StateConflictError) throw error;
      throw new StateStorageError(`State write failed: ${String(error?.message ?? error)}`, {
        reason: 'write_failed',
      });
    } finally {
      this.inTransaction = false;
    }
  }

  /** @param {string} id - scope id. */
  getScope(id) {
    this.assertOpen();
    return this.db.prepare('SELECT * FROM scopes WHERE id = ?').get(id);
  }

  /** @returns {Record<string, any>[]} all scopes, newest first. */
  listScopes() {
    this.assertOpen();
    return this.db.prepare('SELECT * FROM scopes ORDER BY updated_at DESC, id ASC').all();
  }

  /**
   * Find a Life-bound scope previously created for one Session.  Used to fail
   * closed when Life is temporarily unavailable instead of quietly creating a
   * local scope with weaker identity facts.
   * @param {string} sessionId - DSH Session id.
   * @returns {Record<string, any>|undefined} scope row.
   */
  findLifeScopeForSession(sessionId) {
    this.assertOpen();
    return this.db
      .prepare("SELECT * FROM scopes WHERE source = 'life' AND owner_session_id = ? ORDER BY updated_at DESC LIMIT 1")
      .get(sessionId);
  }

  /** @param {string} key - meta key. @returns {string|undefined} stored value. */
  getMeta(key) {
    this.assertOpen();
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(String(key));
    return row === undefined ? undefined : String(row.value);
  }

  /**
   * @param {string} key - meta key.
   * @param {string} value - value.
   * @param {boolean} [transactional] - wrap in a write transaction.
   */
  setMeta(key, value, transactional = true) {
    this.assertOpen();
    const write = () =>
      this.db
        .prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
        .run(String(key), String(value));
    if (transactional) this.transaction(write);
    else write();
  }

  /** @param {string} key - meta key. */
  deleteMeta(key) {
    this.assertOpen();
    this.transaction(() => {
      this.db.prepare('DELETE FROM meta WHERE key = ?').run(String(key));
    });
  }

  /**
   * Read the durable Workspace binding.  The Workspace id is an opaque DSH id;
   * no path or display name is stored as identity.
   * @returns {{workspaceId: string, boundAt: string}|null} binding.
   */
  getWorkspaceBinding() {
    const workspaceId = this.getMeta('workspace.binding.id');
    if (typeof workspaceId !== 'string' || workspaceId.length === 0) return null;
    return { workspaceId, boundAt: this.getMeta('workspace.binding.at') ?? null };
  }

  /**
   * Persist one explicit binding.  Existing workspace scopes, events, and
   * interests are never touched by this write.
   * @param {string} workspaceId - validated DSH Workspace id.
   * @param {string} boundAt - ISO timestamp.
   */
  setWorkspaceBinding(workspaceId, boundAt) {
    this.transaction(() => {
      this.setMeta('workspace.binding.id', workspaceId, false);
      this.setMeta('workspace.binding.at', boundAt, false);
    });
  }

  clearWorkspaceBinding() {
    this.transaction(() => {
      this.db.prepare("DELETE FROM meta WHERE key IN ('workspace.binding.id', 'workspace.binding.at')").run();
    });
  }

  /**
   * @param {string} workspaceId - Workspace id.
   * @param {string} sessionId - Session id.
   * @returns {Record<string, any>|undefined} exception row.
   */
  getSessionRule(workspaceId, sessionId) {
    const row = this.db
      .prepare('SELECT * FROM session_rules WHERE workspace_id = ? AND session_id = ?')
      .get(workspaceId, sessionId);
    return row === undefined
      ? undefined
      : { workspaceId: row.workspace_id, sessionId: row.session_id, mode: row.mode, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  /** @param {string} workspaceId - Workspace id. @returns {Record<string, any>[]} rules. */
  listSessionRules(workspaceId) {
    return this.db
      .prepare('SELECT * FROM session_rules WHERE workspace_id = ? ORDER BY updated_at DESC, session_id ASC')
      .all(workspaceId)
      .map((row) => ({
        workspaceId: row.workspace_id,
        sessionId: row.session_id,
        mode: row.mode,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
  }

  /**
   * Insert or replace one Session exception.
   * @param {string} workspaceId - Workspace id.
   * @param {string} sessionId - Session id.
   * @param {string} mode - one of shared, read_only, isolated, disabled.
   * @returns {Record<string, any>} saved row.
   */
  upsertSessionRule(workspaceId, sessionId, mode) {
    const now = new Date(this.clock()).toISOString();
    this.db
      .prepare(
        `INSERT INTO session_rules (workspace_id, session_id, mode, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(workspace_id, session_id)
         DO UPDATE SET mode = excluded.mode, updated_at = excluded.updated_at`,
      )
      .run(workspaceId, sessionId, mode, now, now);
    return this.getSessionRule(workspaceId, sessionId);
  }

  /** @param {string} workspaceId - Workspace id. @param {string} sessionId - Session id. */
  deleteSessionRule(workspaceId, sessionId) {
    const result = this.db
      .prepare('DELETE FROM session_rules WHERE workspace_id = ? AND session_id = ?')
      .run(workspaceId, sessionId);
    return Number(result.changes) === 1;
  }

  /** @param {string} workspaceId - Workspace id. */
  countSessionRules(workspaceId) {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM session_rules WHERE workspace_id = ?').get(workspaceId);
    return Number(row.n);
  }

  /**
   * Most recent Host automatic event for one Session inside one scope.
   * @param {string} scopeId - state scope.
   * @param {string} sessionId - Session id.
   * @returns {string|null} recorded-at ISO.
   */
  lastHostEventForSession(scopeId, sessionId) {
    const row = this.db
      .prepare("SELECT recorded_at FROM events WHERE scope_id = ? AND session_id = ? AND source = 'host' ORDER BY recorded_at DESC LIMIT 1")
      .get(scopeId, sessionId);
    return row === undefined ? null : String(row.recorded_at);
  }

  /** @param {string} scopeId - state scope. @param {string} sinceIso - lower bound. */
  countHostEventsSince(scopeId, sinceIso) {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM events WHERE scope_id = ? AND source = 'host' AND recorded_at >= ?")
      .get(scopeId, sinceIso);
    return Number(row.n);
  }

  /** @returns {Record<string, any>[]} migration log newest-first, bounded. */
  migrationInfo() {
    try {
      const rows = this.db.prepare('SELECT * FROM migration_log ORDER BY started_at DESC, id DESC LIMIT 20').all();
      return rows.map((row) => ({
        id: row.id,
        fromVersion: row.from_version,
        toVersion: row.to_version,
        backupFile: row.backup_file ?? null,
        status: row.status,
        startedAt: row.started_at,
        completedAt: row.completed_at ?? null,
        detail: parseJson(row.detail, {}),
      }));
    } catch {
      return [];
    }
  }

  /**
   * Ensure a scope exists and refresh its authorization metadata.
   * @param {Record<string, any>} identity - trusted identity.
   * @returns {Record<string, any>} stored row.
   */
  ensureScope(identity) {
    this.assertOpen();
    const now = new Date(this.clock()).toISOString();
    const existing = this.db.prepare('SELECT * FROM scopes WHERE id = ?').get(identity.scopeId);
    if (existing !== undefined) {
      if (existing.persona_id !== identity.personaId || existing.scene_id !== identity.sceneId) {
        throw new StateConflictError('scope identity collision; refusing to rebind history', {
          scopeId: identity.scopeId,
        });
      }
      const ownerChanged = existing.owner_session_id === null && identity.ownerSessionId !== undefined;
      const privacyChanged = existing.privacy !== identity.privacy;
      const revisionChanged =
        identity.bindingRevision !== null &&
        identity.bindingRevision !== undefined &&
        existing.binding_revision !== identity.bindingRevision;
      // Ordinary reads leave a stable scope row untouched; only a real
      // authorization/privacy change writes.
      if (!ownerChanged && !privacyChanged && !revisionChanged) return existing;
      return this.transaction(() => {
        this.db
          .prepare(
            `UPDATE scopes SET privacy = ?, owner_session_id = COALESCE(owner_session_id, ?),
               binding_revision = ?, updated_at = ? WHERE id = ?`,
          )
          .run(
            identity.privacy,
            identity.ownerSessionId ?? null,
            identity.bindingRevision ?? null,
            now,
            identity.scopeId,
          );
        return this.db.prepare('SELECT * FROM scopes WHERE id = ?').get(identity.scopeId);
      });
    }
    return this.transaction(() => {
      this.db
        .prepare(
          `INSERT OR IGNORE INTO scopes
             (id, persona_id, scene_id, privacy, source, owner_session_id, binding_revision,
              scope_kind, workspace_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          identity.scopeId,
          identity.personaId,
          identity.sceneId,
          identity.privacy,
          identity.kind,
          identity.ownerSessionId ?? null,
          identity.bindingRevision ?? null,
          identity.scopeKind ?? 'session',
          identity.workspaceId ?? null,
          now,
          now,
        );
      const inserted = this.db.prepare('SELECT * FROM scopes WHERE id = ?').get(identity.scopeId);
      if (inserted === undefined) {
        throw new StateConflictError('scope identity is already owned by a different id', {
          scopeId: identity.scopeId,
          personaId: identity.personaId,
          sceneId: identity.sceneId,
        });
      }
      return inserted;
    });
  }

  /** @param {string} scopeId - scope. */
  getState(scopeId) {
    const row = this.db.prepare('SELECT * FROM state_snapshots WHERE scope_id = ?').get(scopeId);
    return row === undefined ? undefined : stateView(row);
  }

  /**
   * Save a snapshot with optimistic concurrency.
   * @param {Record<string, any>} state - snapshot.
   * @param {number} expectedRevision - revision read before the change.
   * @returns {Record<string, any>} saved snapshot.
   */
  saveState(state, expectedRevision) {
    const now = new Date(this.clock()).toISOString();
    const result = this.db
      .prepare(
        `UPDATE state_snapshots SET mood = ?, energy = ?, curiosity = ?,
           baseline_mood = ?, baseline_energy = ?, baseline_curiosity = ?,
           revision = revision + 1, updated_at = ?, clock_anomaly_at = ?
         WHERE scope_id = ? AND revision = ?`,
      )
      .run(
        state.mood,
        state.energy,
        state.curiosity,
        state.baselineMood,
        state.baselineEnergy,
        state.baselineCuriosity,
        state.updatedAt ?? now,
        state.clockAnomalyAt ?? null,
        state.scopeId,
        expectedRevision,
      );
    if (Number(result.changes) !== 1) {
      throw new StateConflictError('State snapshot changed concurrently; retry the read', {
        scopeId: state.scopeId,
        expectedRevision,
      });
    }
    return this.getState(state.scopeId);
  }

  /** @param {Record<string, any>} state - initial snapshot. */
  insertState(state) {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO state_snapshots
           (scope_id, mood, energy, curiosity, baseline_mood, baseline_energy, baseline_curiosity,
            revision, updated_at, clock_anomaly_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        state.scopeId,
        state.mood,
        state.energy,
        state.curiosity,
        state.baselineMood,
        state.baselineEnergy,
        state.baselineCuriosity,
        state.revision ?? 1,
        state.updatedAt,
        state.clockAnomalyAt ?? null,
      );
    return this.getState(state.scopeId);
  }

  /** @param {string} scopeId - scope. @returns {Record<string, any>|undefined} last event. */
  lastEvent(scopeId) {
    const row = this.db
      .prepare('SELECT * FROM events WHERE scope_id = ? ORDER BY recorded_at DESC, id DESC LIMIT 1')
      .get(scopeId);
    return row === undefined ? undefined : eventView(row);
  }

  /** @param {string} idempotencyKey - key. @returns {Record<string, any>|undefined} event. */
  findEventByKey(idempotencyKey) {
    const row = this.db.prepare('SELECT * FROM events WHERE idempotency_key = ?').get(idempotencyKey);
    return row === undefined ? undefined : eventView(row);
  }

  /**
   * Insert an event; a duplicate key returns the existing event unchanged.
   * @param {Record<string, any>} event - event record.
   * @returns {{event: Record<string, any>, duplicate: boolean}} result.
   */
  insertEvent(event) {
    const existing = this.findEventByKey(event.idempotencyKey);
    if (existing !== undefined) return { event: existing, duplicate: true };
    try {
      this.db
        .prepare(
          `INSERT INTO events
             (id, scope_id, idempotency_key, type, source, trust, source_ref, summary,
              appraisal_json, delta_json, baseline_delta_json, before_json, after_json,
              interest_changes_json, evidence_json, session_id, persona_id, scene_id,
              occurred_at, recorded_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          event.id,
          event.scopeId,
          event.idempotencyKey,
          event.type,
          event.source,
          event.trust,
          event.sourceRef ?? null,
          event.summary,
          JSON.stringify(event.appraisal ?? {}),
          JSON.stringify(event.deltas ?? {}),
          JSON.stringify(event.baselineDeltas ?? {}),
          JSON.stringify(event.before ?? {}),
          JSON.stringify(event.after ?? {}),
          JSON.stringify(event.interestChanges ?? []),
          JSON.stringify(event.evidence ?? []),
          event.sessionId ?? null,
          event.personaId ?? null,
          event.sceneId ?? null,
          event.occurredAt,
          event.recordedAt,
        );
    } catch (error) {
      // A concurrent writer may have won the unique key; read it back.
      const raced = this.findEventByKey(event.idempotencyKey);
      if (raced !== undefined) return { event: raced, duplicate: true };
      throw error;
    }
    const row = this.db.prepare('SELECT * FROM events WHERE id = ?').get(event.id);
    return { event: eventView(row), duplicate: false };
  }

  /**
   * Page one scope's audit newest-first.
   * @param {string} scopeId - scope.
   * @param {{limit?: number, offset?: number}} [page] - page.
   * @returns {{items: Record<string, any>[], total: number}} page.
   */
  listEvents(scopeId, { limit = 20, offset = 0 } = {}) {
    const total = Number(this.db.prepare('SELECT COUNT(*) AS n FROM events WHERE scope_id = ?').get(scopeId).n);
    const rows = this.db
      .prepare('SELECT * FROM events WHERE scope_id = ? ORDER BY recorded_at DESC, id DESC LIMIT ? OFFSET ?')
      .all(scopeId, limit, offset);
    return { items: rows.map(eventView), total };
  }

  /** @param {string} scopeId @param {string} source @param {string} sinceIso */
  countEventsSince(scopeId, source, sinceIso) {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM events WHERE scope_id = ? AND source = ? AND recorded_at >= ?')
      .get(scopeId, source, sinceIso);
    return Number(row.n);
  }

  /** @param {string} scopeId @param {string} sessionId @param {string} sinceIso */
  countSessionEventsSince(scopeId, sessionId, sinceIso) {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM events WHERE scope_id = ? AND session_id = ? AND recorded_at >= ?')
      .get(scopeId, sessionId, sinceIso);
    return Number(row.n);
  }

  /** @param {string} scopeId - scope. @returns {Record<string, any>[]} interests. */
  listInterests(scopeId) {
    return this.db
      .prepare('SELECT * FROM interests WHERE scope_id = ? ORDER BY baseline DESC, activity DESC, normalized_name ASC')
      .all(scopeId)
      .map(interestView);
  }

  /** @param {string} id - interest id. */
  getInterest(id) {
    const row = this.db.prepare('SELECT * FROM interests WHERE id = ?').get(id);
    return row === undefined ? undefined : interestView(row);
  }

  /** @param {string} scopeId @param {string} alias - normalized alias. */
  findInterestByAlias(scopeId, alias) {
    const row = this.db
      .prepare(
        `SELECT i.* FROM interests i
         JOIN interest_aliases a ON a.interest_id = i.id AND a.scope_id = i.scope_id
         WHERE i.scope_id = ? AND a.alias = ?`,
      )
      .get(scopeId, alias);
    if (row !== undefined) return interestView(row);
    const direct = this.db.prepare('SELECT * FROM interests WHERE scope_id = ? AND normalized_name = ?').get(scopeId, alias);
    return direct === undefined ? undefined : interestView(direct);
  }

  /**
   * Insert or update one interest and its aliases.
   * @param {Record<string, any>} interest - interest view.
   * @returns {Record<string, any>} saved interest.
   */
  upsertInterest(interest) {
    const existing = this.db.prepare('SELECT * FROM interests WHERE id = ?').get(interest.id);
    const aliases = Array.isArray(interest.aliases) ? interest.aliases : [];
    if (existing === undefined) {
      this.db
        .prepare(
          `INSERT INTO interests
             (id, scope_id, name, normalized_name, aliases_json, baseline, activity,
              last_event_at, created_at, updated_at, revision, source, source_ref, manual, disabled)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          interest.id,
          interest.scopeId,
          interest.name,
          interest.normalizedName,
          JSON.stringify(aliases),
          interest.baseline,
          interest.activity,
          interest.lastEventAt ?? null,
          interest.createdAt,
          interest.updatedAt,
          interest.revision ?? 1,
          interest.source,
          interest.sourceRef ?? null,
          interest.manual ? 1 : 0,
          interest.disabled ? 1 : 0,
        );
    } else {
      this.db
        .prepare(
          `UPDATE interests SET name = ?, normalized_name = ?, aliases_json = ?, baseline = ?,
             activity = ?, last_event_at = ?, updated_at = ?, revision = ?, source = ?,
             source_ref = ?, manual = ?, disabled = ? WHERE id = ?`,
        )
        .run(
          interest.name,
          interest.normalizedName,
          JSON.stringify(aliases),
          interest.baseline,
          interest.activity,
          interest.lastEventAt ?? null,
          interest.updatedAt,
          interest.revision ?? Number(existing.revision) + 1,
          interest.source,
          interest.sourceRef ?? null,
          interest.manual ? 1 : 0,
          interest.disabled ? 1 : 0,
          interest.id,
        );
    }
    this.db.prepare('DELETE FROM interest_aliases WHERE interest_id = ?').run(interest.id);
    const insertAlias = this.db.prepare('INSERT OR IGNORE INTO interest_aliases (scope_id, alias, interest_id) VALUES (?, ?, ?)');
    for (const alias of aliases) insertAlias.run(interest.scopeId, alias, interest.id);
    return this.getInterest(interest.id);
  }

  /** @param {string} id - interest id. */
  deleteInterest(id) {
    const result = this.db.prepare('DELETE FROM interests WHERE id = ?').run(id);
    return Number(result.changes) === 1;
  }

  /** @param {string} id - interest id. @param {boolean} disabled - target. */
  setInterestDisabled(id, disabled) {
    const result = this.db
      .prepare('UPDATE interests SET disabled = ?, updated_at = ?, revision = revision + 1 WHERE id = ?')
      .run(disabled ? 1 : 0, new Date(this.clock()).toISOString(), id);
    return Number(result.changes) === 1;
  }

  /** @param {string} scopeId - scope. @param {string} dataScope - audience. */
  grantShare(scopeId, dataScope) {
    this.db
      .prepare('INSERT OR IGNORE INTO scope_shares (scope_id, data_scope, granted_at, revoked_at) VALUES (?, ?, ?, NULL)')
      .run(scopeId, dataScope, new Date(this.clock()).toISOString());
  }

  /** @param {string} scopeId - scope. @param {string} dataScope - audience. */
  revokeShare(scopeId, dataScope) {
    this.db
      .prepare('UPDATE scope_shares SET revoked_at = ? WHERE scope_id = ? AND data_scope = ? AND revoked_at IS NULL')
      .run(new Date(this.clock()).toISOString(), scopeId, dataScope);
  }

  /** @param {string} scopeId - scope. @param {string} dataScope - audience. */
  isSharedTo(scopeId, dataScope) {
    return (
      this.db
        .prepare('SELECT 1 AS found FROM scope_shares WHERE scope_id = ? AND data_scope = ? AND revoked_at IS NULL')
        .get(scopeId, dataScope) !== undefined
    );
  }

  /**
   * Prune ordinary audit rows beyond retention. Reset/admin rows are kept.
   * @param {string} scopeId - scope.
   * @param {number} retentionDays - days.
   * @returns {number} removed rows.
   */
  pruneEvents(scopeId, retentionDays) {
    const cutoff = new Date(this.clock() - Math.max(1, retentionDays) * 86_400_000).toISOString();
    const result = this.db
      .prepare("DELETE FROM events WHERE scope_id = ? AND recorded_at < ? AND source != 'admin'")
      .run(scopeId, cutoff);
    return Number(result.changes);
  }

  /**
   * Create a consistent online backup with `VACUUM INTO`.
   *
   * A plain file copy of a WAL-mode database can omit committed rows that are
   * still in `-wal`.  `VACUUM INTO` asks SQLite itself to serialize a
   * transactionally consistent database, then the new file is verified for
   * integrity, schema version, required tables, and row counts before it is
   * reported as a successful backup.  Restore keeps its existing preflight,
   * safety-backup, atomic-replace, and rollback guarantees.
   * @param {string} reason - label for the file name.
   * @returns {{file: string, createdAt: string}} verified backup info.
   */
  backup(reason = 'manual', { verify = true } = {}) {
    if (this.databasePath === ':memory:') throw new StateStorageError('in-memory State databases cannot be backed up');
    this.assertOpen();
    const safeReason = String(reason).replace(/[^a-z0-9-]+/gi, '-').slice(0, 40) || 'manual';
    const dir = join(dirname(this.databasePath), 'backups');
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const stamp = new Date(this.clock()).toISOString().replace(/[:.]/g, '-');
    // A fixed clock can produce the same reason+timestamp twice.  The unique
    // suffix makes every generated backup its own file, so a later failed
    // attempt can never replace or delete an earlier verified backup.
    let base;
    let target;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      base = `state-${safeReason}-${stamp}-${randomUUID()}.sqlite`;
      target = join(dir, base);
      if (!existsSync(target)) break;
      base = undefined;
      target = undefined;
    }
    if (base === undefined || target === undefined) {
      throw new StateStorageError('State backup could not allocate a unique filename', {
        reason: 'backup_name_collision',
      });
    }
    const temp = `${target}.vacuum-${randomUUID()}.tmp`;
    let installed = false;
    try {
      if (existsSync(temp)) unlinkSync(temp);
      // SQLite writes a complete, checkpoint-independent snapshot into `temp`.
      // This includes committed WAL frames but excludes uncommitted writes.
      this.db.prepare('VACUUM INTO ?').run(temp);
      if (!existsSync(temp) || statSync(temp).size === 0) {
        throw new StateStorageError('SQLite produced an empty backup', { reason: 'backup_empty' });
      }
      renameSync(temp, target);
      installed = true;
      // Verification happens before success is reported.  A failed check
      // removes only this candidate rather than leaving a misleading backup
      // entry, and never touches an earlier successful file.
      // The unsupported-schema refusal path asks for the consistent snapshot
      // without this build's preflight because it cannot validate a future
      // schema; it never reports that backup as a successful restore target.
      if (verify) this.preflightBackup(base);
      this.pruneBackups(dir);
      return { file: base, createdAt: new Date(this.clock()).toISOString() };
    } catch (error) {
      try { if (existsSync(temp)) unlinkSync(temp); } catch { /* best effort */ }
      if (installed) {
        try { if (existsSync(target)) unlinkSync(target); } catch { /* best effort */ }
      }
      if (error instanceof StateStorageError) throw error;
      throw new StateStorageError(`State backup failed: ${String(error?.message ?? error).slice(0, 300)}`, {
        reason: 'backup_failed',
      });
    }
  }

  /** @param {string} dir - backup directory. */
  pruneBackups(dir) {
    try {
      const files = readdirSync(dir)
        .filter((name) => /^state-.*\.sqlite$/.test(name))
        .map((name) => ({ name, time: statSync(join(dir, name)).mtimeMs }))
        .sort((a, b) => b.time - a.time);
      for (const file of files.slice(this.backupLimit)) unlinkSync(join(dir, file.name));
    } catch {
      // Backup pruning is best-effort and must not fail a durable write.
    }
  }

  /** @returns {string} backup directory; never sent to the browser. */
  backupDirectory() {
    return join(dirname(this.databasePath), 'backups');
  }

  /**
   * Resolve a backup basename inside the owned backup directory.
   * @param {unknown} file - generated backup name.
   * @returns {{name: string, path: string, stat: import('node:fs').Stats}} backup.
   */
  resolveBackup(file) {
    if (this.databasePath === ':memory:') throw new StateStorageError('in-memory State databases have no backups');
    const name = safeBackupName(file);
    if (basename(name) !== name) throw new StateValidationError('backup must be a basename, not a path');
    const path = join(this.backupDirectory(), name);
    if (!existsSync(path)) throw new StateNotFoundError('State backup was not found');
    const stat = statSync(path);
    if (!stat.isFile() || stat.size === 0) throw new StateStorageError('State backup is empty or not a file');
    return { name, path, stat };
  }

  /**
   * List backup basenames with safe metadata. Paths never leave the Host.
   * @returns {{file: string, bytes: number, createdAt: string}[]} backups.
   */
  listBackups() {
    if (this.databasePath === ':memory:') return [];
    const dir = this.backupDirectory();
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((name) => /^state-.*\.sqlite$/.test(name))
      .map((name) => {
        const stat = statSync(join(dir, name));
        return { file: name, bytes: stat.size, createdAt: new Date(stat.mtimeMs).toISOString() };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.file.localeCompare(a.file));
  }

  /**
   * Verify a backup before any live file is touched: bounded basename,
   * integrity_check, schema version, required tables/columns, and row counts.
   * @param {unknown} file - generated backup name.
   * @returns {Record<string, any>} preflight result.
   */
  preflightBackup(file) {
    const resolved = this.resolveBackup(file);
    let db;
    try {
      db = new DatabaseSync(resolved.path, { readOnly: true });
      const integrity = db.prepare('PRAGMA integrity_check').get();
      if (Object.values(integrity ?? {})[0] !== 'ok') {
        throw new StateStorageError('State backup failed SQLite integrity_check', {
          reason: 'backup_integrity_failed',
        });
      }
      const version = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get();
      if (version === undefined) {
        throw new StateStorageError('State backup has no schema version', { reason: 'backup_missing_schema' });
      }
      const found = String(version.value);
      if (found !== '1' && found !== STATE_SCHEMA_VERSION) {
        throw new StateStorageError(`State backup schema ${found} is not supported by this build (${STATE_SCHEMA_VERSION})`, {
          reason: 'backup_unsupported_schema',
          found,
        });
      }
      const tables = new Set(
        db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => String(row.name)),
      );
      const expectedTables = found === '1' ? V1_TABLES : V2_TABLES;
      const missing = expectedTables.filter((name) => !tables.has(name));
      if (missing.length > 0) {
        throw new StateStorageError('State backup is missing tables', {
          reason: 'backup_missing_tables',
          missing,
        });
      }
      const requiredColumns = {
        scopes: ['id', 'persona_id', 'scene_id', 'privacy', 'source', 'updated_at', ...(found === '1' ? [] : V2_SCOPE_COLUMNS)],
        state_snapshots: ['scope_id', 'mood', 'energy', 'curiosity', 'revision', 'updated_at'],
        events: ['id', 'scope_id', 'idempotency_key', 'source', 'trust', 'delta_json', 'recorded_at'],
        interests: ['id', 'scope_id', 'normalized_name', 'baseline', 'activity', 'revision'],
      };
      for (const [table, columns] of Object.entries(requiredColumns)) {
        const have = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => String(row.name)));
        const absent = columns.filter((name) => !have.has(name));
        if (absent.length > 0) {
          throw new StateStorageError(`State backup table ${table} is missing columns`, {
            reason: 'backup_missing_columns',
            table,
            missing: absent,
          });
        }
      }
      return {
        file: resolved.name,
        bytes: resolved.stat.size,
        schemaVersion: found,
        counts: {
          scopes: Number(db.prepare('SELECT COUNT(*) AS n FROM scopes').get().n),
          events: Number(db.prepare('SELECT COUNT(*) AS n FROM events').get().n),
          interests: Number(db.prepare('SELECT COUNT(*) AS n FROM interests').get().n),
        },
      };
    } catch (error) {
      if (error instanceof StateStorageError || error instanceof StateValidationError) throw error;
      throw new StateStorageError(`State backup verification failed: ${String(error?.message ?? error)}`, {
        reason: 'backup_preflight_failed',
      });
    } finally {
      try { db?.close(); } catch { /* ignore */ }
    }
  }

  /**
   * Test-only phase hook. Production is a no-op; regression tests override it
   * to inject a failure after each filesystem replacement step.
   * @param {string} _phase - phase name.
   */
  _restorePhase(_phase) {}

  /**
   * Replace the live database with a verified backup. The live DB and any
   * WAL/SHM sidecars are moved as one preserved set only after the connection
   * is closed; they are never unlinked before rollback can use them. A safety
   * backup is also made first. Any failure restores the exact old file set and
   * reopens it; a failed rollback preserves the old set and staged artifacts
   * instead of deleting them.
   * @param {unknown} file - generated backup basename.
   * @returns {{restored: Record<string, any>, safetyBackup: Record<string, any>}} result.
   */
  restoreBackup(file) {
    if (this.databasePath === ':memory:') throw new StateStorageError('in-memory State databases cannot be restored');
    const candidate = this.preflightBackup(file);
    const resolved = this.resolveBackup(file);
    const safety = this.backup('before-restore');
    const databasePath = this.databasePath;
    const tempPath = `${databasePath}.restore-${randomUUID()}.tmp`;
    const previousPath = `${databasePath}.restore-${randomUUID()}.previous`;
    const previousWal = `${previousPath}-wal`;
    const previousShm = `${previousPath}-shm`;
    let closed = false;
    let movedDatabase = false;
    let movedWal = false;
    let movedShm = false;
    let installed = false;
    let keepArtifacts = false;
    try {
      this._restorePhase('before-copy');
      copyFileSync(resolved.path, tempPath);
      // A backup contains the writer lease from the process that made it. Clear
      // it before opening the staged file so a same-process restore does not
      // fail closed on its own stale lease.
      clearRuntimeLease(tempPath);
      this._restorePhase('before-close');
      this.close();
      closed = true;
      this._restorePhase('after-close');
      if (!existsSync(databasePath)) {
        throw new StateStorageError('live State database disappeared during restore', { reason: 'restore_live_missing' });
      }
      // Preserve the live database and sidecars as a set. Do not unlink a live
      // WAL/SHM: close may checkpoint on this runtime, but correctness must not
      // depend on that checkpoint having happened.
      renameSync(databasePath, previousPath);
      movedDatabase = true;
      if (existsSync(`${databasePath}-wal`)) {
        renameSync(`${databasePath}-wal`, previousWal);
        movedWal = true;
      }
      if (existsSync(`${databasePath}-shm`)) {
        renameSync(`${databasePath}-shm`, previousShm);
        movedShm = true;
      }
      this._restorePhase('after-preserve');
      renameSync(tempPath, databasePath);
      installed = true;
      this._restorePhase('after-install');
      this.closed = false;
      this.inTransaction = false;
      this.open();
      this._restorePhase('after-open');
      for (const path of [previousPath, previousWal, previousShm]) {
        try { if (existsSync(path)) unlinkSync(path); } catch { /* retain forensic copy */ }
      }
      return { restored: candidate, safetyBackup: safety };
    } catch (error) {
      // A failure after a successful open (e.g. the injected after-open phase)
      // leaves the candidate connection open; close it before touching files.
      if (this.db !== undefined && !this.closed) {
        try { this.close(); closed = true; } catch { /* continue to fail closed */ }
      }
      // Remove only the staged candidate that was installed at the live path.
      // The preserved old set is never touched here.
      if (installed) {
        try {
          removeSidecars(databasePath);
          if (existsSync(databasePath)) unlinkSync(databasePath);
        } catch { /* rollback below may still fail closed */ }
      }
      try {
        this._restorePhase('before-rollback');
        if (movedDatabase) {
          if (existsSync(databasePath)) unlinkSync(databasePath);
          renameSync(previousPath, databasePath);
        }
        if (movedWal) renameSync(previousWal, `${databasePath}-wal`);
        if (movedShm) renameSync(previousShm, `${databasePath}-shm`);
        if (closed) {
          this.closed = false;
          this.inTransaction = false;
          this.open();
        }
      } catch (rollbackError) {
        // Preserve the old DB/WAL/SHM set and staged candidate for forensic
        // recovery. Never delete them to make the error look clean.
        keepArtifacts = true;
        throw new StateStorageError('backup restore failed and the original database file set could not be restored; files are preserved', {
          reason: 'restore_rollback_failed',
          cause: String(rollbackError?.message ?? rollbackError).slice(0, 300),
        });
      }
      throw new StateStorageError(`backup restore failed; original database file set restored: ${String(error?.message ?? error).slice(0, 300)}`, {
        reason: 'restore_failed',
      });
    } finally {
      if (!keepArtifacts) {
        try { if (existsSync(tempPath)) unlinkSync(tempPath); } catch { /* ignore */ }
      }
      // On success the old set was removed above. On a successful rollback the
      // old files were renamed back. On rollback failure keep every artifact.
    }
  }

  /** @returns {Record<string, unknown>} safe health facts. */
  health() {
    this.assertOpen();
    const counts = {
      scopes: Number(this.db.prepare('SELECT COUNT(*) AS n FROM scopes').get().n),
      workspaceScopes: Number(this.db.prepare("SELECT COUNT(*) AS n FROM scopes WHERE scope_kind = 'workspace'").get().n),
      events: Number(this.db.prepare('SELECT COUNT(*) AS n FROM events').get().n),
      interests: Number(this.db.prepare('SELECT COUNT(*) AS n FROM interests').get().n),
      sessionRules: Number(this.db.prepare('SELECT COUNT(*) AS n FROM session_rules').get().n),
    };
    const version = this.db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get();
    return {
      ok: true,
      database: 'ready',
      schemaVersion: String(version?.value ?? STATE_SCHEMA_VERSION),
      counts,
    };
  }

  /** @returns {Record<string, unknown>} schema inspection without a path. */
  inspect() {
    const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all();
    return {
      tables: tables.map((row) => String(row.name)),
      schemaVersion: String(this.db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get()?.value ?? ''),
    };
  }

  /** Close the connection and release the lease. */
  close() {
    if (this.closed) return;
    this.closed = true;
    this.releaseLease();
    try {
      this.db?.close();
    } finally {
      this.db = undefined;
    }
  }

  assertOpen() {
    if (this.closed || this.db === undefined) throw new StateClosedError('State store is closed');
  }
}

/**
 * Validate a backup basename. Restore accepts a name, never an arbitrary path.
 * @param {unknown} file - candidate basename.
 * @returns {string} safe basename.
 */
function safeBackupName(file) {
  const value = String(file ?? '');
  if (!/^state-[A-Za-z0-9._-]+\.sqlite$/.test(value) || value.includes('..')) {
    throw new StateValidationError('backup must be a generated state-*.sqlite filename');
  }
  return value;
}

function removeSidecars(databasePath) {
  for (const suffix of ['-wal', '-shm']) {
    const path = `${databasePath}${suffix}`;
    if (existsSync(path)) {
      try { unlinkSync(path); } catch { /* best effort after close */ }
    }
  }
}

function clearRuntimeLease(databasePath) {
  const db = new DatabaseSync(databasePath);
  try {
    db.prepare("DELETE FROM runtime_leases WHERE key = 'writer'").run();
  } finally {
    db.close();
  }
}

/**
 * Read `meta` without opening a full store; used by maintenance scripts.
 * @param {string} databasePath - path.
 * @returns {Record<string, unknown>} metadata.
 */
export function readStateMeta(databasePath) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return Object.fromEntries(db.prepare('SELECT key, value FROM meta').all().map((row) => [row.key, row.value]));
  } finally {
    db.close();
  }
}

/** Exported for tests. */
export const STATE_STORE_TABLES = REQUIRED_TABLES;
