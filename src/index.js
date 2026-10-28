/**
 * Amadeus State — Cordis Host plugin.
 *
 * Public Host surface:
 * - `ctx.provide('amadeusState', …)` for trusted host integration.
 * - model tools `state_get`, `state_appraise`, `state_interests`, `state_health`.
 * - bounded dynamic runtime context controlled by the same Config as the GUI.
 * - an authenticated admin HTTP route used only by the native settings page.
 *
 * There is no timer, no autonomous wake, no outbound sender, and no second
 * agent loop.  State suggests tendencies; Persona and Life remain authoritative.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { Config } from './config-schema.js';
import { normalizeConfig, publicConfig } from './config.js';
import { createLifeAdapter, createMemoryAdapter } from './adapters.js';
import { registerStateContext } from './context.js';
import { mountHttp } from './http.js';
import { StateService } from './service.js';
import { StateStorageError, StateUnavailableError, safeError } from './model.js';
import { StateStore } from './store.js';
import { registerTools } from './tools.js';
import { STATE_VERSION } from './model.js';

/** Cordis plugin name. */
export const name = 'amadeus-state';

/** Required Host services. */
export const inject = ['tools'];

export { Config };

/**
 * Default database path under the isolated DSH home.  The absolute path is
 * never sent to a browser or model.
 * @returns {string} database path.
 */
function defaultDatabasePath() {
  const base = process.env.DSH_HOME && process.env.DSH_HOME.length > 0 ? process.env.DSH_HOME : join(homedir(), '.dsh');
  return join(base, 'amadeus-state', 'state.sqlite');
}

/**
 * Mount the plugin.
 * @param {Record<string, any>} ctx - Cordis context.
 * @param {Record<string, any>} [rawConfig] - live Config object.
 */
export function apply(ctx, rawConfig = {}) {
  const startedAt = new Date().toISOString();
  const getConfig = () => normalizeConfig(rawConfig);
  const initial = getConfig();
  const life = createLifeAdapter(ctx);
  const getLife = () => (life.available() ? life : undefined);
  const memory = createMemoryAdapter(ctx);

  let store;
  let service;
  let provided = false;
  try {
    store = new StateStore({
      databasePath: initial.databasePath || defaultDatabasePath(),
      logger: ctx.logger,
    });
    service = new StateService({
      store,
      getConfig,
      getLife,
      getRegistry: () => {
        try {
          return ctx.get?.('workspaceRegistry') ?? ctx.workspaceRegistry;
        } catch {
          return undefined;
        }
      },
      memory,
      logger: ctx.logger,
      version: STATE_VERSION,
      startedAt,
    });
    registerTools(ctx, service);
    registerStateContext(ctx, service, getConfig);
    registerSessionObserver(ctx, service);
    mountHttp(ctx, service);
    ctx.provide('amadeusState', {
      getHealth: () => service.health(),
      getScopedState: (sessionId) => service.viewForSession(String(sessionId)),
      getEffectiveConfig: () => publicConfig(getConfig()),
    });
    provided = true;
    ctx.effect(
      () => () => {
        try {
          store.close();
        } catch {
          // Disposal must not throw into Cordis.
        }
      },
      'amadeus-state: close SQLite',
    );
    ctx.logger?.info?.(`amadeus-state: ready (schema=${store.health().schemaVersion})`);
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    try {
      store?.close();
    } catch {
      // Preserve the startup failure.
    }
    ctx.logger?.error?.(`amadeus-state: unavailable: ${safeError(failure)}`);
    if (provided) return;
    const degraded = degradedService({ ctx, getConfig, life, memory, failure, startedAt });
    try {
      ctx.provide('amadeusState', {
        getHealth: () => degraded.health(),
        getScopedState: () => {
          throw new StateUnavailableError('State storage is unavailable');
        },
        getEffectiveConfig: () => publicConfig(getConfig()),
      });
    } catch {
      // A duplicate service name must not crash the Host; status is logged.
    }
    try {
      registerTools(ctx, degraded);
      registerStateContext(ctx, degraded, getConfig);
      mountHttp(ctx, degraded);
    } catch (secondary) {
      ctx.logger?.error?.(`amadeus-state: degraded surface incomplete: ${safeError(secondary)}`);
    }
  }
}

/**
 * Subscribe to the trusted Session event feed.  This is an observer on the
 * existing DSH event-sourced log, never a second agent loop: it performs one
 * bounded, idempotent write on a completed tool-bearing turn and does nothing
 * for plain conversation.  The subscription is optional; State still works
 * when the Session service is absent.
 * @param {Record<string, any>} ctx - Cordis context.
 * @param {import('./service.js').StateService} service - State service.
 */
export function registerSessionObserver(ctx, service) {
  if (typeof ctx.on !== 'function') return undefined;
  try {
    // `session/event` is dispatched in the emitting Session's context. Without
    // `{ global: true }` Cordis's context filter can hide events from Sessions
    // outside the plugin's own context, which would make automatic Workspace
    // evolution silently miss most conversations.
    const dispose = ctx.on(
      'session/event',
      (session, event) => {
        try {
          service.observeSessionEvent(session, event);
        } catch (error) {
          ctx.logger?.warn?.(`amadeus-state: session event observer failed: ${safeError(error)}`);
        }
      },
      { global: true },
    );
    if (typeof ctx.effect === 'function') {
      ctx.effect(() => (typeof dispose === 'function' ? dispose : undefined), 'amadeus-state: session event observer');
    }
    return dispose;
  } catch (error) {
    ctx.logger?.warn?.(`amadeus-state: session event observer unavailable: ${safeError(error)}`);
    return undefined;
  }
}

/**
 * Fail-closed service used when SQLite cannot be opened or verified.  Status
 * and diagnostics remain observable; every mutation and private read refuses.
 * @param {{ctx: Record<string, any>, getConfig: () => Record<string, any>, life: Record<string, any>, memory: Record<string, any>, failure: Error, startedAt: string}} options - degraded options.
 * @returns {Record<string, any>} service-shaped object.
 */
function degradedService({ ctx, getConfig, life, memory, failure, startedAt }) {
  const unavailable = () => {
    throw new StateUnavailableError('State storage is unavailable; no state was read or changed');
  };
  let memoryAvailable = false;
  try {
    memoryAvailable = Boolean(memory && typeof memory.available === 'function' && memory.available());
  } catch {
    memoryAvailable = false;
  }
  return {
    store: {
      listScopes: () => [],
      getScope: () => undefined,
      inspect: () => ({ error: safeError(failure) }),
    },
    config: getConfig,
    noteError: () => {},
    health: () => ({
      version: STATE_VERSION,
      state: 'degraded',
      startedAt,
      database: { ok: false, database: 'unavailable', error: safeError(failure) },
      schemaVersion: null,
      backups: [],
      lastEventAt: null,
      lastError: { at: new Date().toISOString(), message: safeError(failure) },
      contextInjectionMode: getConfig().contextInjectionMode,
      evolutionEnabled: false,
      modelAppraisalEnabled: false,
      integrations: {
        life: { available: life.available(), enabled: getConfig().lifeIntegrationEnabled },
        memory: {
          available: memoryAvailable,
          enabled: getConfig().memoryIntegrationEnabled,
          writeEnabled: false,
          writeAvailable: false,
          writeReason: 'scene_scoped_memory_contract_unavailable',
        },
      },
      config: publicConfig(getConfig()),
    }),
    healthForSession: () => ({
      version: STATE_VERSION,
      state: 'degraded',
      startedAt,
      schemaVersion: null,
      scope: { known: false, privacy: 'private', source: 'unknown', authorization: 'session' },
      lastEventAt: null,
      integrations: {
        life: { available: life.available(), enabled: getConfig().lifeIntegrationEnabled },
        memory: {
          available: memoryAvailable,
          enabled: getConfig().memoryIntegrationEnabled,
          writeEnabled: false,
          writeAvailable: false,
          writeReason: 'scene_scoped_memory_contract_unavailable',
        },
      },
      note: 'State storage is unavailable; only static degraded health is reported.',
    }),
    scopeAuthorization: () => ({ authorized: false, reason: 'storage_unavailable', source: 'unknown' }),
    binding: () => null,
    bindingStatus: () => ({
      bound: false,
      state: 'degraded',
      legacyPrivateMode: true,
      message: 'State storage is unavailable; no binding can be read.',
    }),
    workspaces: () => ({ available: false, workspaces: [] }),
    sessionRulesOverview: () => ({
      binding: { bound: false, state: 'degraded' },
      sessions: [],
      rules: [],
      defaultMode: 'shared',
      modes: ['shared', 'read_only', 'isolated', 'disabled'],
      registryAvailable: false,
      archivedCount: 0,
    }),
    workspaceOverview: () => ({
      binding: { bound: false, state: 'degraded' },
      workspaces: { available: false, workspaces: [] },
      rules: [],
      sessions: [],
      main: null,
      migration: [],
      schema: { error: safeError(failure) },
      legacyNote: 'State storage is unavailable.',
      qqSceneRules: { implemented: false, reason: 'storage_unavailable' },
      defaultMode: 'shared',
      modes: ['shared', 'read_only', 'isolated', 'disabled'],
      registryAvailable: false,
      archivedCount: 0,
    }),
    bindWorkspace: unavailable,
    unbindWorkspace: unavailable,
    setSessionRule: unavailable,
    clearSessionRule: unavailable,
    effectiveForSession: () => ({ allowed: false, state: 'degraded', mode: 'denied', writable: false, reason: 'storage_unavailable' }),
    effectiveForWrite: unavailable,
    observeSessionEvent: () => ({ applied: false, reason: 'storage_unavailable' }),
    viewForSession: unavailable,
    adminView: unavailable,
    listAllInterests: unavailable,
    auditPage: unavailable,
    appraiseModel: unavailable,
    recordEvent: unavailable,
    addInterest: unavailable,
    updateInterest: unavailable,
    manageInterest: unavailable,
    resetState: unavailable,
    preview: unavailable,
    listBackups: () => [],
    backup: () => {
      throw new StateStorageError('State storage is unavailable; no backup was created');
    },
    restoreBackup: unavailable,
    ensureScope: unavailable,
    identityForSession: unavailable,
    currentState: unavailable,
  };
}
