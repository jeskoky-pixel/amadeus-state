/**
 * State service: trusted identity, bounded events, interests, audit, reset,
 * and the scoped views consumed by tools, context, and the settings page.
 *
 * There is deliberately no timer, no model call, no outbound action, and no
 * second scheduler here.  Evolution is computed from stored state plus the
 * injected clock and persists only when a legitimate event or admin operation
 * occurs.
 */

import { randomUUID } from 'node:crypto';
import {
  DEFAULT_SESSION_MODE,
  EVENT_EFFECTS,
  EVENT_TYPES,
  HOST_TURN_EVENT_TYPE,
  SESSION_MODES,
  StateConflictError,
  StateDisabledError,
  StateIntegrationError,
  StateNotFoundError,
  StateUnauthorizedError,
  StateUnavailableError,
  StateValidationError,
  clamp,
  iso,
  parseTimestamp,
  round,
  safeError,
} from './model.js';
import { normalizeConfig, publicConfig, validateDraftConfig } from './config.js';
import {
  advanceState,
  applyEvent,
  describeState,
  initialState,
  pickBaseline,
  pickState,
  previewEvent,
  tendencyText,
} from './engine.js';
import {
  applyInterestEvent,
  interestIdFor,
  interestView,
  normalizeAliases,
  normalizeInterestName,
  rankInterests,
  requireTopic,
} from './interests.js';
import {
  isLifeNotFound,
  requireSessionId,
  requireWorkspaceId,
  resolveSessionIdentity,
  scopeView,
  workspaceIdentity,
  isolatedIdentity,
} from './scope.js';
import {
  listWorkspaces as listRegistryWorkspaces,
  liveWorkspace,
  resolveWorkspaceSession,
  safeWorkspace,
} from './workspace.js';

const MODEL_RATE_LIMIT = 6;
const INTEGRATION_TIMEOUT_MS = 5_000;
/**
 * Completion-shaped events are only accepted from a verified Life activity.
 * A model may submit bounded subjective context but cannot assert that real
 * work completed.
 */
const MODEL_UNREFERENCED_EVENT_TYPES = Object.freeze([
  'meaningful_interaction',
  'knowledge_gained',
  'difficulty',
]);

/**
 * Bound an optional integration call so a hung adapter cannot hold a model
 * turn.  The underlying promise may finish later; its result is ignored.
 * @template T
 * @param {Promise<T>} promise - adapter work.
 * @param {string} message - timeout error message.
 * @returns {Promise<T>} resolved value or a StateIntegrationError.
 */
function withTimeout(promise, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new StateIntegrationError(message)), INTEGRATION_TIMEOUT_MS);
    if (typeof timer.unref === 'function') timer.unref();
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

/**
 * @param {Record<string, any>} exec - DSH tool execution context.
 * @returns {number|string} current turn or a stable fallback.
 */
function turnOf(exec) {
  const turn = exec?.agent?.phase?.turn;
  if (Number.isInteger(turn) && turn >= 0) return turn;
  const seq = exec?.agent?.session?.seq;
  if (Number.isInteger(seq) && seq >= 0) return seq;
  return 'unknown';
}

export class StateService {
  /**
   * @param {{store: import('./store.js').StateStore, getConfig: () => Record<string, any>, getLife?: () => Record<string, any>|undefined, memory?: Record<string, any>, clock?: () => number, logger?: Record<string, any>, version: string, startedAt: string}} options - service options.
   */
  constructor({
    store,
    getConfig,
    getLife = () => undefined,
    getRegistry = () => undefined,
    memory,
    clock = () => Date.now(),
    logger,
    version,
    startedAt,
  }) {
    this.store = store;
    this.getConfig = getConfig;
    this.getLife = getLife;
    this.getRegistry = getRegistry;
    this.memory = memory;
    this.clock = clock;
    this.logger = logger;
    this.version = version;
    this.startedAt = startedAt;
    this.lastError = null;
    this.lastEventAt = null;
    this.lastIntegrityError = null;
    this.turnObservations = new Map();
    // Diagnostics should show the last durable event after a restart too. This
    // is a bounded startup scan; per-turn reads remain a single snapshot read.
    try {
      for (const row of this.store.listScopes()) {
        const event = this.store.lastEvent(row.id);
        if (event && (this.lastEventAt === null || event.recordedAt > this.lastEventAt)) {
          this.lastEventAt = event.recordedAt;
        }
      }
    } catch {
      // A degraded store still exposes health; do not fail construction here.
    }
  }

  /** @returns {Record<string, any>} effective normalized config. */
  config() {
    return this.getConfig();
  }

  /** @returns {Record<string, any>} live Workspace registry when available. */
  registry() {
    try {
      return this.getRegistry();
    } catch {
      return undefined;
    }
  }

  /** @returns {{workspaceId: string, boundAt: string|null}|null} durable binding. */
  binding() {
    try {
      return this.store.getWorkspaceBinding();
    } catch {
      return null;
    }
  }

  /**
   * Safe live binding diagnostics.  It never exposes paths and never binds a
   * replacement Workspace automatically.
   * @returns {Record<string, unknown>} status.
   */
  bindingStatus() {
    const binding = this.binding();
    if (binding === null) {
      return {
        bound: false,
        state: 'unbound',
        legacyPrivateMode: true,
        message: '未绑定 Workspace；保持 v1 的每会话私有状态。',
      };
    }
    const registry = this.registry();
    const list = listRegistryWorkspaces(registry);
    if (!list.available) {
      return {
        bound: true,
        workspaceId: binding.workspaceId,
        boundAt: binding.boundAt,
        state: 'registry_unavailable',
        legacyPrivateMode: false,
        message: '已绑定 Workspace，但当前 DSH 没有可用的 workspaceRegistry；所有工作区会话失败关闭。',
      };
    }
    const entity = liveWorkspace(registry, binding.workspaceId);
    if (entity === null) {
      return {
        bound: true,
        workspaceId: binding.workspaceId,
        boundAt: binding.boundAt,
        state: 'workspace_missing',
        legacyPrivateMode: false,
        message: '已绑定的 Workspace 已删除或失效；不会自动绑定其他 Workspace。',
      };
    }
    const record = safeWorkspace(entity);
    return {
      bound: true,
      workspaceId: binding.workspaceId,
      boundAt: binding.boundAt,
      title: record?.title ?? '',
      state: 'ready',
      sessionCount: record?.sessionIds.length ?? 0,
      legacyPrivateMode: false,
    };
  }

  /** @returns {{available: boolean, workspaces: {workspaceId: string, title: string, sessionCount: number}[]}} picker list. */
  workspaces() {
    return listRegistryWorkspaces(this.registry());
  }

  /**
   * Bind one Workspace explicitly.  A different existing binding needs a
   * separate confirmation and is never replaced silently.
   * @param {{workspaceId: string, confirm?: string}} input - binding request.
   * @returns {Record<string, unknown>} status.
   */
  bindWorkspace(input) {
    const workspaceId = requireWorkspaceId(input?.workspaceId);
    const registry = this.registry();
    if (!registry) throw new StateUnavailableError('workspaceRegistry is unavailable in this DSH build');
    const entity = liveWorkspace(registry, workspaceId);
    if (entity === null) throw new StateNotFoundError('the selected DSH Workspace does not exist');
    const current = this.binding();
    if (current !== null && current.workspaceId !== workspaceId && input?.confirm !== 'REBIND') {
      throw new StateValidationError('rebinding to a different Workspace requires confirm: REBIND');
    }
    const identity = workspaceIdentity(workspaceId);
    this.ensureScope(identity);
    this.store.setWorkspaceBinding(workspaceId, iso(this.clock()));
    this.turnObservations.clear();
    return this.bindingStatus();
  }

  /**
   * Explicitly unbind.  Old Workspace and Session data stays intact; the
   * plugin returns to the legacy per-Session private behavior.
   * @param {{confirm?: string}} input - confirmation.
   * @returns {Record<string, unknown>} status.
   */
  unbindWorkspace(input = {}) {
    if (input.confirm !== 'UNBIND') throw new StateValidationError('explicit UNBIND confirmation is required');
    this.store.clearWorkspaceBinding();
    this.turnObservations.clear();
    return this.bindingStatus();
  }

  /**
   * Resolve the effective policy and state identity for one trusted Session.
   * This runs on every tool call, injection, and event; no access decision is
   * cached.  Unbound installations preserve v1 private behavior.
   * @param {string} sessionId - trusted DSH Session id.
   * @returns {Record<string, any>} effective access.
   */
  effectiveForSession(sessionId) {
    const session = requireSessionId(sessionId);
    const binding = this.binding();
    if (binding === null) {
      let identity;
      try {
        identity = this.identityForSession(session);
      } catch (error) {
        return {
          allowed: false,
          state: 'legacy_denied',
          mode: 'legacy',
          reason: safeError(error),
          detail: String(error?.message ?? error).slice(0, 300),
          identity: null,
        };
      }
      return {
        allowed: true,
        state: 'legacy_private',
        mode: 'legacy',
        writable: true,
        workspaceId: null,
        identity,
        scopeKind: 'session',
        note: 'unbound legacy private scope',
      };
    }
    const registry = this.registry();
    const resolved = resolveWorkspaceSession({ registry, workspaceId: binding.workspaceId, sessionId: session });
    if (resolved.state === 'registry_unavailable') {
      return { allowed: false, state: resolved.state, mode: 'denied', writable: false, workspaceId: binding.workspaceId, reason: 'workspace_registry_unavailable' };
    }
    if (resolved.state === 'workspace_missing') {
      return { allowed: false, state: resolved.state, mode: 'denied', writable: false, workspaceId: binding.workspaceId, reason: 'workspace_missing' };
    }
    if (resolved.state === 'archived') {
      return { allowed: false, state: resolved.state, mode: 'denied', writable: false, workspaceId: binding.workspaceId, reason: 'session_archived' };
    }
    if (resolved.state !== 'member') {
      return {
        allowed: false,
        state: resolved.state,
        mode: 'denied',
        writable: false,
        workspaceId: binding.workspaceId,
        reason: resolved.state === 'other_workspace' ? 'session_in_other_workspace' : 'session_not_in_workspace',
      };
    }
    const rule = this.store.getSessionRule(binding.workspaceId, session);
    const mode = rule?.mode ?? DEFAULT_SESSION_MODE;
    if (mode === 'disabled') {
      return {
        allowed: false,
        state: 'disabled_by_rule',
        mode,
        writable: false,
        workspaceId: binding.workspaceId,
        reason: 'session_rule_disabled',
        rule: rule ?? null,
      };
    }
    if (mode === 'isolated') {
      return {
        allowed: true,
        state: 'active',
        mode,
        writable: true,
        workspaceId: binding.workspaceId,
        identity: isolatedIdentity(session),
        scopeKind: 'session',
        rule: rule ?? null,
      };
    }
    return {
      allowed: true,
      state: 'active',
      mode,
      writable: mode === 'shared',
      readOnly: mode === 'read_only',
      workspaceId: binding.workspaceId,
      identity: workspaceIdentity(binding.workspaceId),
      scopeKind: 'workspace',
      rule: rule ?? null,
    };
  }

  /**
   * Fail closed when the current effective policy does not allow the action.
   * @param {Record<string, any>} effective - resolved access.
   * @param {'read'|'write'} action - requested action.
   */
  requireAccess(effective, action) {
    if (!effective?.allowed) {
      const reason = String(effective?.reason ?? effective?.state ?? 'not_authorized');
      const detail = effective?.detail ? `: ${String(effective.detail).slice(0, 300)}` : '';
      throw action === 'read'
        ? new StateUnauthorizedError(`State is not available for this Session${detail}`, { reason })
        : new StateDisabledError(`State writes are not allowed for this Session${detail}`, { reason });
    }
    if (action === 'write' && !effective.writable) {
      throw new StateDisabledError('this Session is read-only for State; the shared state was not changed', {
        mode: effective.mode,
      });
    }
  }

  /** @param {string} sessionId - trusted Session id. */
  effectiveForWrite(sessionId) {
    const effective = this.effectiveForSession(sessionId);
    this.requireAccess(effective, 'write');
    return effective;
  }

  /** @param {unknown} error - thrown value. */
  noteError(error) {
    this.lastError = { at: new Date(this.clock()).toISOString(), message: safeError(error) };
    this.logger?.warn?.(`amadeus-state: ${safeError(error)}`);
  }

  /**
   * Ensure a scope and its initial snapshot exist.
   * @param {Record<string, any>} identity - trusted identity.
   * @returns {Record<string, any>} scope row.
   */
  ensureScope(identity) {
    const row = this.store.ensureScope(identity);
    if (this.store.getState(identity.scopeId) === undefined) {
      this.store.insertState({ ...initialState(this.config(), this.clock()), scopeId: identity.scopeId });
    }
    return row;
  }

  /**
   * Resolve the current Session identity, failing closed on revoked/unknown.
   * @param {string} sessionId - trusted Session id.
   * @returns {Record<string, any>} identity.
   */
  identityForSession(sessionId) {
    const cfg = this.config();
    const life = this.getLife();
    if (!life && cfg.lifeIntegrationEnabled) {
      const known = this.store.findLifeScopeForSession(sessionId);
      if (known !== undefined) {
        throw new StateUnauthorizedError(
          'Life is unavailable and this Session previously used a Life-bound scope; refusing to downgrade to a local identity',
        );
      }
    }
    return resolveSessionIdentity({ sessionId, life, config: cfg });
  }

  /**
   * Advance a stored snapshot in memory.  Reads never write SQLite.
   * @param {string} scopeId - scope id.
   * @returns {Record<string, any>} advanced snapshot.
   */
  currentState(scopeId) {
    const stored = this.store.getState(scopeId);
    if (stored === undefined) throw new StateNotFoundError('state scope has no snapshot', { scopeId });
    return advanceState(stored, this.config(), this.clock());
  }

  /**
   * Build a scoped view for the current Session.
   * @param {string} sessionId - trusted Session id.
   * @param {{includeInterests?: boolean, includeAudit?: boolean}} [options] - view options.
   * @returns {Record<string, any>} scoped view.
   */
  viewForSession(sessionId, { includeInterests = true, includeAudit = false } = {}) {
    const effective = this.effectiveForSession(sessionId);
    this.requireAccess(effective, 'read');
    this.ensureScope(effective.identity);
    return this.buildView(effective.identity, {
      includeInterests,
      includeAudit,
      access: {
        mode: effective.mode,
        writable: effective.writable === true,
        readOnly: effective.readOnly === true,
        scopeKind: effective.scopeKind,
        workspaceBound: effective.workspaceId !== null,
      },
    });
  }

  /**
   * Build an admin view only after re-verifying the scope's source authority.
   * @param {string} scopeId - scope id.
   * @param {{includeInterests?: boolean, includeAudit?: boolean}} [options] - options.
   * @returns {Record<string, any>} view.
   */
  adminView(scopeId, { includeInterests = true, includeAudit = false } = {}) {
    const row = this.store.getScope(scopeId);
    if (row === undefined) throw new StateNotFoundError('state scope was not found', { scopeId });
    const authorization = this.scopeAuthorization(row);
    if (!authorization.authorized) {
      return {
        scope: scopeView(row),
        authorization,
        state: null,
        baseline: null,
        explanation: null,
        tendency: null,
        interests: [],
        lastEventAt: null,
        updatedAt: row.updated_at,
        unavailableReason: authorization.reason,
      };
    }
    const isWorkspace = row.scope_kind === 'workspace';
    return this.buildView(
      {
        kind: row.source,
        scopeKind: isWorkspace ? 'workspace' : 'session',
        workspaceId: row.workspace_id ?? null,
        personaId: row.persona_id,
        sceneId: row.scene_id,
        privacy: row.privacy,
        scopeId: row.id,
        ownerSessionId: row.owner_session_id,
        bindingRevision: row.binding_revision,
        authorizationRef: 'admin',
        identitySource: 'admin',
      },
      {
        includeInterests,
        includeAudit,
        access: {
          mode: isWorkspace ? 'workspace_admin' : 'session_admin',
          writable: true,
          scopeKind: isWorkspace ? 'workspace' : 'session',
          workspaceBound: this.binding() !== null,
        },
      },
    );
  }

  /**
   * Verify a Life-backed scope still has an active binding to the same Scene.
   * Local scopes need no external authorization.  Unknown Life state fails
   * closed for derived reads.
   * @param {Record<string, any>} row - scope row.
   * @returns {{authorized: boolean, reason: string, source: string}} decision.
   */
  scopeAuthorization(row) {
    if (row.scope_kind === 'workspace') {
      const binding = this.binding();
      if (binding === null) return { authorized: false, reason: 'workspace_not_bound', source: 'workspace' };
      if (binding.workspaceId !== row.workspace_id) {
        return { authorized: false, reason: 'workspace_binding_changed', source: 'workspace' };
      }
      if (liveWorkspace(this.registry(), row.workspace_id) === null) {
        return { authorized: false, reason: 'workspace_missing', source: 'workspace' };
      }
      return { authorized: true, reason: 'active_workspace_binding', source: 'workspace' };
    }
    if (row.source === 'local') return { authorized: true, reason: 'local_private', source: 'local' };
    const cfg = this.config();
    const life = this.getLife();
    if (!cfg.lifeIntegrationEnabled) {
      return { authorized: false, reason: 'life_integration_disabled', source: 'life' };
    }
    if (!life || typeof life.getSessionBinding !== 'function') {
      return { authorized: false, reason: 'life_unavailable', source: 'life' };
    }
    if (typeof row.owner_session_id !== 'string' || !row.owner_session_id) {
      return { authorized: false, reason: 'binding_identity_unknown', source: 'life' };
    }
    try {
      const binding = life.getSessionBinding(row.owner_session_id);
      if (!binding || binding.active !== true) return { authorized: false, reason: 'binding_revoked', source: 'life' };
      if (binding.sceneId !== row.scene_id || binding.personaId !== row.persona_id) {
        return { authorized: false, reason: 'binding_changed', source: 'life' };
      }
      return { authorized: true, reason: 'active_binding', source: 'life' };
    } catch (error) {
      if (isLifeNotFound(error)) return { authorized: false, reason: 'binding_missing', source: 'life' };
      return { authorized: false, reason: 'authorization_unavailable', source: 'life' };
    }
  }

  /**
   * @param {Record<string, any>} identity - trusted identity.
   * @param {{includeInterests?: boolean, includeAudit?: boolean}} options - options.
   * @returns {Record<string, any>} view.
   */
  buildView(identity, { includeInterests = true, includeAudit = false, access } = {}) {
    const cfg = this.config();
    const state = this.currentState(identity.scopeId);
    const explanation = describeState(state, cfg);
    const interests = includeInterests
      ? rankInterests(this.store.listInterests(identity.scopeId), 20)
          .filter((interest) => !interest.disabled)
          .map((interest) => interestView(interest, this.clock(), cfg.interestActivityHalfLifeMinutes))
      : [];
    const last = this.store.lastEvent(identity.scopeId);
    const view = {
      scope: {
        id: identity.scopeId,
        kind: identity.scopeKind === 'workspace' ? 'workspace' : 'session',
        workspaceId: identity.workspaceId ?? null,
        personaId: identity.personaId,
        sceneId: identity.sceneId,
        privacy: identity.privacy,
        source: identity.scopeKind === 'workspace' ? 'workspace' : identity.kind,
        bindingRevision: identity.bindingRevision ?? null,
        authorization: 'session',
      },
      access: access ?? {
        mode: 'legacy',
        writable: true,
        scopeKind: identity.scopeKind === 'workspace' ? 'workspace' : 'session',
        workspaceBound: false,
      },
      state: {
        ...pickState(state),
        revision: state.revision,
        updatedAt: state.updatedAt,
        clockAnomalyAt: state.clockAnomalyAt ?? null,
        autoRecovery: cfg.autoRecovery,
      },
      baseline: pickBaseline(state),
      explanation,
      tendency: tendencyText(state, cfg),
      interests,
      lastEventAt: last?.recordedAt ?? null,
      updatedAt: state.updatedAt,
      generatedAt: new Date(this.clock()).toISOString(),
      config: publicConfig(cfg),
    };
    if (includeAudit) {
      view.audit = this.auditPage(identity.scopeId, { limit: cfg.auditPageSize, offset: 0 });
    }
    return view;
  }

  /**
   * Admin: all interest rows for one scope, including disabled entries.
   * @param {string} scopeId - scope.
   * @returns {Record<string, any>[]} interest views.
   */
  listAllInterests(scopeId) {
    this.assertScopeAuthorized(scopeId);
    return this.store
      .listInterests(scopeId)
      .map((interest) => interestView(interest, this.clock(), this.config().interestActivityHalfLifeMinutes));
  }

  /**
   * Resolve a scope and require current authorization before any admin read or
   * write that derives or edits its data.
   * @param {string} scopeId - scope.
   * @returns {Record<string, any>} scope row.
   */
  assertScopeAuthorized(scopeId) {
    const row = this.store.getScope(scopeId);
    if (row === undefined) throw new StateNotFoundError('state scope was not found');
    const authorization = this.scopeAuthorization(row);
    if (!authorization.authorized) {
      throw new StateUnauthorizedError('scope authorization is not valid', { reason: authorization.reason });
    }
    return row;
  }

  /**
   * Page an audit log.  Evidence references are identifiers only; raw private
   * content is never stored or returned.
   * @param {string} scopeId - scope.
   * @param {{limit?: number, offset?: number}} page - page.
   * @returns {Record<string, any>} page.
   */
  auditPage(scopeId, page = {}) {
    const cfg = this.config();
    const row = this.store.getScope(scopeId);
    const sharedWorkspace = row?.scope_kind === 'workspace';
    const limit = Math.floor(clamp(Number(page.limit ?? cfg.auditPageSize), 1, 100));
    const offset = Math.max(0, Math.floor(Number(page.offset ?? 0)));
    const result = this.store.listEvents(scopeId, { limit, offset });
    return {
      items: result.items.map((event) => ({
        id: event.id,
        type: event.type,
        source: event.source,
        trust: event.trust,
        occurredAt: event.occurredAt,
        recordedAt: event.recordedAt,
        // A Workspace-shared audit may be read from another Session's surface:
        // show aggregated deltas, never the originating Session's raw reason.
        summary: sharedWorkspace && event.source !== 'admin'
          ? '工作区共享事件（已汇总，不显示原始会话原因）'
          : event.summary,
        sessionId: sharedWorkspace ? null : event.sessionId,
        deltas: event.deltas,
        baselineDeltas: event.baselineDeltas,
        before: event.before,
        after: event.after,
        interestChanges: event.interestChanges.map((change) => ({
          name: sharedWorkspace ? '兴趣活跃度' : change.name,
          applied: change.applied,
          baselineApplied: change.baselineApplied,
        })),
        evidenceRefs: sharedWorkspace ? [] : Array.isArray(event.evidence) ? event.evidence.map((ref) => String(ref).slice(0, 160)) : [],
      })),
      total: result.total,
      limit,
      offset,
      redacted: sharedWorkspace,
    };
  }

  /**
   * Apply one event atomically.  Identity and authorization are supplied by
   * the caller; model arguments never reach this method as trust claims.
   * @param {Record<string, any>} input - event input.
   * @returns {Promise<Record<string, any>>} result.
   */
  recordEventSync(input) {
    const cfg = this.config();
    if (!cfg.stateEvolutionEnabled && input.source !== 'admin') {
      throw new StateDisabledError('state evolution is disabled; the event was not applied');
    }
    const identity = input.identity;
    if (!identity || typeof identity.scopeId !== 'string') throw new StateUnauthorizedError('trusted identity is required');
    const internalTypes = [...EVENT_TYPES, HOST_TURN_EVENT_TYPE];
    if (!internalTypes.includes(input.type) && input.type !== 'admin_reset') {
      throw new StateValidationError(`unsupported event type: ${String(input.type)}`);
    }
    if (input.type === HOST_TURN_EVENT_TYPE && input.source !== 'host' && input.source !== 'admin') {
      throw new StateValidationError('host work events can only come from a trusted Host turn');
    }
    if (input.source === 'model_appraisal' && !MODEL_UNREFERENCED_EVENT_TYPES.includes(input.type)) {
      throw new StateValidationError('model appraisals cannot claim completion-shaped event types');
    }
    // A cancellation or a degraded policy decision can arrive while an
    // asynchronous integration call settles.  Re-check the live policy again
    // immediately before any durable write.
    const actorSessionId = input.identity?.sessionId ?? input.originSessionId;
    if (actorSessionId && input.source !== 'admin') {
      const current = this.effectiveForSession(actorSessionId);
      if (!current.allowed || !current.writable) {
        throw new StateDisabledError('State policy changed before this event was applied; nothing was written', {
          mode: current.mode,
          state: current.state,
        });
      }
      if (current.identity.scopeId !== identity.scopeId) {
        throw new StateUnauthorizedError('State policy resolved to a different scope before this event was applied');
      }
    }
    const occurredAt = input.occurredAt ? iso(parseTimestamp(input.occurredAt)) : iso(this.clock());
    const summary = typeof input.summary === 'string' ? input.summary.trim().slice(0, 280) : '';
    if (!summary) throw new StateValidationError('event summary is required');
    const idempotencyKey = String(input.idempotencyKey ?? '').trim();
    if (!idempotencyKey) throw new StateValidationError('idempotency key is required');
    if (idempotencyKey.length > 300) throw new StateValidationError('idempotency key is too long');

    this.ensureScope(identity);
    const result = this.store.transaction(() => {
      const existing = this.store.findEventByKey(idempotencyKey);
      if (existing !== undefined) {
        if (existing.scopeId !== identity.scopeId) {
          throw new StateConflictError('idempotency key is owned by another State scope');
        }
        return { event: existing, duplicate: true, state: this.store.getState(identity.scopeId) };
      }
      const stored = this.store.getState(identity.scopeId);
      const before = stored === undefined ? initialState(cfg, this.clock()) : stored;
      const advanced = advanceState(before, cfg, parseTimestamp(occurredAt));
      const applied = applyEvent(advanced, cfg, {
        type: input.type,
        occurredAt,
        source: input.source,
        appraisal: input.appraisal ?? {},
        base: input.base,
        scale: input.scale,
      });
      const interestChanges = [];
      let nextState = applied.state;
      const interestDelta = Number(input.interestDelta ?? 0) * clamp(Number(input.scale ?? 1), 0, 1);
      // A Workspace-shared scope is visible to every member.  An event topic
      // from one private Session (model appraisal, Life description, Memory
      // title) must not be promoted into a global interest without an explicit
      // trusted public-visibility contract, which this DSH build does not
      // provide.  Numeric state deltas may still aggregate; manual Owner
      // interests are managed separately and are not affected.
      const sharedScope = identity.scopeKind === 'workspace';
      if (
        cfg.autoInterestUpdate &&
        !sharedScope &&
        input.topic !== undefined &&
        Number.isFinite(interestDelta) &&
        interestDelta !== 0 &&
        input.type !== 'admin_reset'
      ) {
        const change = this.applyInterestChange(identity.scopeId, {
          topic: input.topic,
          delta: interestDelta,
          nowMs: parseTimestamp(occurredAt),
          source: input.source,
          sourceRef: input.sourceRef,
          halfLifeMinutes: cfg.interestActivityHalfLifeMinutes,
        });
        if (change !== undefined) interestChanges.push(change);
      }
      const event = {
        id: `state-event:${randomUUID()}`,
        scopeId: identity.scopeId,
        idempotencyKey,
        type: input.type,
        source: input.source,
        trust: input.trust,
        sourceRef: input.sourceRef ?? null,
        summary,
        appraisal: input.appraisal ?? {},
        deltas: applied.deltas,
        baselineDeltas: applied.baselineDeltas,
        before: pickState(advanced),
        after: pickState(nextState),
        interestChanges,
        evidence: Array.isArray(input.evidence) ? input.evidence.slice(0, 20) : [],
        sessionId: identity.sessionId ?? input.originSessionId ?? null,
        personaId: identity.personaId,
        sceneId: identity.sceneId,
        occurredAt,
        recordedAt: iso(this.clock()),
      };
      const inserted = this.store.insertEvent(event);
      if (inserted.duplicate) {
        if (inserted.event.scopeId !== identity.scopeId) {
          throw new StateConflictError('idempotency key is owned by another State scope');
        }
        return { event: inserted.event, duplicate: true, state: this.store.getState(identity.scopeId) };
      }
      const saved = this.store.saveState(
        { ...nextState, scopeId: identity.scopeId },
        Number(stored?.revision ?? 1),
      );
      return { event: inserted.event, duplicate: false, state: saved };
    });
    this.lastEventAt = result.event.recordedAt;
    if (!result.duplicate) {
      try {
        this.store.pruneEvents(identity.scopeId, cfg.auditRetentionDays);
      } catch (error) {
        this.noteError(error);
      }
      // Automatic Memory writes are hard-disabled: no user setting and no
      // hidden event path may call memory_save without a verified Scene-scoped
      // Memory contract.
    }
    return result;
  }

  /**
   * Async public spelling used by tools/integrations.  The write itself is
   * synchronous so the trusted `session/event` observer never starts a second
   * scheduling loop or leaves a floating promise.
   * @param {Record<string, any>} input - event input.
   * @returns {Promise<Record<string, any>>} result.
   */
  async recordEvent(input) {
    return this.recordEventSync(input);
  }

  /**
   * Apply one interest event inside the caller's transaction.
   * @param {string} scopeId - scope.
   * @param {{topic: string, delta: number, nowMs: number, source: string, sourceRef?: string, halfLifeMinutes: number}} input - change.
   * @returns {Record<string, any>|undefined} description of the change.
   */
  applyInterestChange(scopeId, input) {
    let topic;
    try {
      topic = requireTopic(input.topic);
    } catch {
      return undefined;
    }
    const normalized = normalizeInterestName(topic);
    let interest = this.store.findInterestByAlias(scopeId, normalized);
    const nowIso = new Date(input.nowMs).toISOString();
    if (interest === undefined) {
      interest = {
        id: interestIdFor(scopeId, topic),
        scopeId,
        name: topic,
        normalizedName: normalized,
        aliases: [],
        baseline: 0,
        activity: 0,
        lastEventAt: null,
        createdAt: nowIso,
        updatedAt: nowIso,
        revision: 1,
        source: input.source,
        sourceRef: input.sourceRef ?? null,
        manual: false,
        disabled: false,
      };
    }
    const result = applyInterestEvent(interest, {
      delta: input.delta,
      nowMs: input.nowMs,
      source: input.source,
      sourceRef: input.sourceRef,
      halfLifeMinutes: input.halfLifeMinutes,
    });
    this.store.upsertInterest(result.interest);
    this.enforceInterestLimit(scopeId);
    return {
      id: result.interest.id,
      name: result.interest.name,
      applied: result.applied,
      baselineApplied: result.baselineApplied,
    };
  }

  /** @param {string} scopeId - scope. Keep manual entries first. */
  enforceInterestLimit(scopeId) {
    const cfg = this.config();
    const list = this.store.listInterests(scopeId);
    if (list.length <= cfg.maxInterests) return;
    const ranked = rankInterests(list, cfg.maxInterests);
    const keep = new Set(ranked.map((entry) => entry.id));
    for (const interest of list) {
      if (!keep.has(interest.id) && !interest.manual) this.store.deleteInterest(interest.id);
    }
  }

  /**
   * Model-facing appraisal.  The model supplies only subjective, bounded data;
   * Life/Memory references are verified through their public contracts.
   * @param {{exec: Record<string, any>, args: Record<string, any>}} input - call.
   * @returns {Promise<Record<string, any>>} outcome.
   */
  async appraiseModel({ exec, args }) {
    const cfg = this.config();
    if (!cfg.modelAppraisalEnabled) {
      throw new StateDisabledError('model event appraisal is disabled in State settings');
    }
    const sessionId = exec?.agent?.session?.id;
    if (typeof sessionId !== 'string' || !sessionId) throw new StateUnauthorizedError('State tools require an Agent Session');
    const effective = this.effectiveForSession(sessionId);
    this.requireAccess(effective, 'write');
    const identity = effective.identity;
    this.ensureScope(identity);
    const shared = effective.mode === 'shared';

    const appraisal = {
      valence: clamp(Number(args.valence ?? 0), -1, 1),
      intensity: clamp(Number(args.intensity ?? 0.4), 0, 1),
      curiosity: clamp(Number(args.curiosity ?? 0), -1, 1),
    };
    const summary = typeof args.summary === 'string' ? args.summary.trim().slice(0, 280) : '';
    if (!summary) throw new StateValidationError('summary is required');
    if (args.topic !== undefined) {
      try {
        args.topic = requireTopic(args.topic, 'topic');
      } catch (error) {
        throw new StateValidationError(String(error?.message ?? error));
      }
    }

    if (args.activityId !== undefined) {
      return this.appraiseLifeActivity({ exec, args, identity, appraisal, summary, cfg, effective });
    }
    if (args.memoryId !== undefined) {
      return this.appraiseMemoryReference({ exec, args, identity, appraisal, summary, cfg, effective });
    }

    if (!MODEL_UNREFERENCED_EVENT_TYPES.includes(args.eventType)) {
      throw new StateValidationError(
        'eventType is not accepted for an unreferenced model appraisal; completion must be verified through a Life activityId',
      );
    }
    // The visible "duplicate cooldown" is also the bounded rate window for
    // unreferenced model appraisals. It never suppresses a trusted Life or
    // Memory reference (those are idempotent by reference instead).
    const rateWindowMs = Math.max(60_000, cfg.duplicateCooldownMinutes * 60_000);
    const recent = this.store.countEventsSince(identity.scopeId, 'model_appraisal', iso(this.clock() - rateWindowMs));
    // A shared Workspace scope must not let one busy Session monopolize the
    // global state; the per-Session ceiling is stricter than the scope ceiling.
    const sessionRecent = shared
      ? this.store.countSessionEventsSince(identity.scopeId, sessionId, iso(this.clock() - rateWindowMs))
      : 0;
    const limit = shared ? Math.min(MODEL_RATE_LIMIT, 3) : MODEL_RATE_LIMIT;
    if (recent >= MODEL_RATE_LIMIT || sessionRecent >= limit) {
      throw new StateValidationError('too many model appraisals in a short window; no state change applied');
    }
    const turn = turnOf(exec);
    // A shared Workspace scope is addressed by many Sessions.  Session ids must
    // separate turn-scoped idempotency keys; otherwise s1 turn 1 and s2 turn 1
    // would collide and the second legitimate appraisal would be dropped.
    const idempotencyKey = `model:${identity.scopeId}:session:${sessionId}:turn:${turn}`;
    const effect = EVENT_EFFECTS[args.eventType];
    const scale = shared ? clamp(Number(cfg.sharedEventWeight), 0.05, 1) : 1;
    const result = await this.recordEvent({
      identity,
      type: args.eventType,
      source: 'model_appraisal',
      trust: 'bounded',
      summary,
      appraisal,
      idempotencyKey,
      sourceRef: `session:${sessionId}:turn:${turn}`,
      topic: args.topic,
      interestDelta: effect.interest * 0.5,
      scale,
      originSessionId: sessionId,
      occurredAt: iso(this.clock()),
      exec,
    });
    return { accepted: true, duplicate: result.duplicate, event: result.event, state: result.state };
  }

  /**
   * @param {{exec: Record<string, any>, args: Record<string, any>, identity: Record<string, any>, appraisal: Record<string, any>, summary: string, cfg: Record<string, any>}} input - call.
   * @returns {Promise<Record<string, any>>} outcome.
   */
  async appraiseLifeActivity({ exec, args, identity, appraisal, summary, cfg, effective }) {
    if (!cfg.lifeIntegrationEnabled) throw new StateIntegrationError('Life integration is disabled');
    const life = this.getLife();
    if (!life || typeof life.getActivityStatus !== 'function') {
      throw new StateIntegrationError('Life is not available; the activity was not treated as completed');
    }
    const sessionId = exec.agent.session.id;
    let status;
    try {
      status = await withTimeout(
        life.getActivityStatus(String(args.activityId), `session:${sessionId}`),
        'Life activity verification timed out; no state change applied',
      );
    } catch (error) {
      if (isLifeNotFound(error)) throw new StateValidationError('Life activity was not found for this Session');
      throw new StateIntegrationError('Life activity verification failed; no state change applied', {
        cause: safeError(error),
      });
    }
    if (!status || status.revoked === true) {
      throw new StateUnauthorizedError('Life authorization was revoked; no state change applied');
    }
    const activity = status.activity;
    if (!activity || typeof activity !== 'object') {
      throw new StateIntegrationError('Life returned no activity record');
    }
    const activityStatus = activity.status;
    if (activityStatus !== 'completed' && activityStatus !== 'failed') {
      throw new StateValidationError(
        `Life activity is ${String(activityStatus)}, not completed or failed; nothing was counted`,
      );
    }
    // A Workspace-shared or isolated State identity is not a Life Persona
    // identity.  The activity is already verified against this Session by
    // `getActivityStatus(..., session:<id>)`; comparing it with the aggregate
    // Workspace persona would reject every valid activity.
    if (identity.kind === 'life') {
      if (activity.personaId && activity.personaId !== identity.personaId) {
        throw new StateUnauthorizedError('Life activity belongs to another Persona; refused');
      }
      if (activity.sceneId && activity.sceneId !== identity.sceneId) {
        throw new StateUnauthorizedError('Life activity belongs to another Scene; refused');
      }
    }
    const type = activityStatus === 'completed' ? 'life_completed' : 'life_failed';
    const effect = EVENT_EFFECTS[type];
    // One State effect per trusted Life activity in this scope. A later
    // revision/status projection must not apply the same activity again.
    const idempotencyKey = `life:${identity.scopeId}:${activity.id}`;
    const topic = args.topic ?? (activityStatus === 'completed' ? activity.description : undefined);
    const result = await this.recordEvent({
      identity,
      type,
      source: 'life',
      trust: 'trusted',
      summary,
      appraisal,
      idempotencyKey,
      sourceRef: `life:activity:${activity.id}`,
      evidence: Array.isArray(status.evidenceRefs)
        ? status.evidenceRefs.map((ref) => String(ref).slice(0, 160))
        : Array.isArray(activity.evidenceRefs)
          ? activity.evidenceRefs.map((ref) => String(ref).slice(0, 160))
          : [],
      topic,
      interestDelta: effect.interest,
      scale: effective?.mode === 'shared' ? clamp(Number(cfg.sharedEventWeight), 0.05, 1) : 1,
      originSessionId: sessionId,
      occurredAt: activity.updatedAt ?? iso(this.clock()),
      exec,
    });
    return { accepted: true, duplicate: result.duplicate, event: result.event, state: result.state };
  }

  /**
   * @param {{exec: Record<string, any>, args: Record<string, any>, identity: Record<string, any>, appraisal: Record<string, any>, summary: string, cfg: Record<string, any>}} input - call.
   * @returns {Promise<Record<string, any>>} outcome.
   */
  async appraiseMemoryReference({ exec, args, identity, appraisal, summary, cfg, effective }) {
    if (!cfg.memoryIntegrationEnabled) throw new StateIntegrationError('Memory integration is disabled');
    if (!this.memory || typeof this.memory.getMemory !== 'function') {
      throw new StateIntegrationError('Memory is not available; the reference was not accepted');
    }
    let memory;
    try {
      memory = await withTimeout(
        this.memory.getMemory(exec, String(args.memoryId)),
        'Memory reference lookup timed out; no state change applied',
      );
    } catch (error) {
      throw new StateIntegrationError('Memory reference lookup failed; no state change applied', {
        cause: safeError(error),
      });
    }
    if (!memory) throw new StateValidationError('memory reference was not found or is not visible to this Session');
    const type = 'memory_reference';
    const effect = EVENT_EFFECTS[type];
    const idempotencyKey = `memory:${identity.scopeId}:${String(args.memoryId)}`;
    const result = await this.recordEvent({
      identity,
      type,
      source: 'memory',
      trust: 'bounded',
      summary,
      appraisal,
      idempotencyKey,
      sourceRef: `memory:${String(memory.id ?? args.memoryId)}`,
      evidence: ['memory:reference'],
      topic: args.topic ?? memory.title,
      interestDelta: effect.interest,
      scale: effective?.mode === 'shared' ? clamp(Number(cfg.sharedEventWeight), 0.05, 1) : 1,
      originSessionId: exec?.agent?.session?.id,
      occurredAt: iso(this.clock()),
      exec,
    });
    return { accepted: true, duplicate: result.duplicate, event: result.event, state: result.state, memoryId: String(memory.id ?? args.memoryId) };
  }

  /**
   * Admin: add or update a manual interest.
   * @param {{scopeId: string, name: string, baseline?: number, aliases?: string[], note?: string}} input - interest.
   * @returns {Record<string, any>} saved view.
   */
  addInterest(input) {
    const scopeId = String(input.scopeId ?? '');
    this.assertScopeAuthorized(scopeId);
    const name = requireTopic(input.name, 'name');
    const normalized = normalizeInterestName(name);
    const existing = this.store.findInterestByAlias(scopeId, normalized);
    if (existing !== undefined) throw new StateConflictError('an interest with this name or alias already exists', { id: existing.id });
    const baseline = clamp(Number(input.baseline ?? 60), 0, 100);
    const maxInterests = this.config().maxInterests;
    if (this.store.listInterests(scopeId).length >= maxInterests) {
      throw new StateConflictError('State already holds the maximum number of interests', { maxInterests });
    }
    const aliases = normalizeAliases(input.aliases);
    for (const alias of aliases) {
      const conflict = this.store.findInterestByAlias(scopeId, alias);
      if (conflict !== undefined) throw new StateConflictError('an alias conflicts with another interest', { alias });
    }
    const now = iso(this.clock());
    const interest = {
      id: interestIdFor(scopeId, name),
      scopeId,
      name,
      normalizedName: normalized,
      aliases,
      baseline: round(baseline),
      activity: 0,
      lastEventAt: null,
      createdAt: now,
      updatedAt: now,
      revision: 1,
      source: 'manual',
      sourceRef: 'admin:settings',
      manual: true,
      disabled: false,
    };
    this.store.transaction(() => {
      this.store.upsertInterest(interest);
      this.enforceInterestLimit(scopeId);
    });
    return interestView(this.store.getInterest(interest.id), this.clock(), this.config().interestActivityHalfLifeMinutes);
  }

  /**
   * Admin: adjust the manual baseline or aliases without rewriting activity.
   * @param {{scopeId: string, id: string, baseline?: number, aliases?: string[], name?: string}} input - change.
   * @returns {Record<string, any>} saved view.
   */
  updateInterest(input) {
    this.assertScopeAuthorized(String(input.scopeId ?? ''));
    const current = this.store.getInterest(String(input.id));
    if (current === undefined || current.scopeId !== input.scopeId) throw new StateNotFoundError('interest was not found');
    const aliases = input.aliases === undefined ? current.aliases : normalizeAliases(input.aliases);
    for (const alias of aliases) {
      const conflict = this.store.findInterestByAlias(input.scopeId, alias);
      if (conflict !== undefined && conflict.id !== current.id) {
        throw new StateConflictError('an alias conflicts with another interest', { alias });
      }
    }
    const name = input.name === undefined ? current.name : requireTopic(input.name, 'name');
    const normalizedName = normalizeInterestName(name);
    const sameName = this.store.findInterestByAlias(input.scopeId, normalizedName);
    if (sameName !== undefined && sameName.id !== current.id) {
      throw new StateConflictError('another interest already uses this name', { id: sameName.id });
    }
    const interest = {
      ...current,
      name,
      normalizedName,
      aliases,
      baseline: input.baseline === undefined ? current.baseline : round(clamp(Number(input.baseline), 0, 100)),
      updatedAt: iso(this.clock()),
      revision: current.revision + 1,
      manual: true,
      source: 'manual',
    };
    this.store.transaction(() => {
      this.store.upsertInterest(interest);
    });
    return interestView(this.store.getInterest(current.id), this.clock(), this.config().interestActivityHalfLifeMinutes);
  }

  /**
   * @param {{scopeId: string, id: string, disabled?: boolean, delete?: boolean}} input - operation.
   * @returns {Record<string, any>} outcome.
   */
  manageInterest(input) {
    this.assertScopeAuthorized(String(input.scopeId ?? ''));
    const current = this.store.getInterest(String(input.id));
    if (current === undefined || current.scopeId !== input.scopeId) throw new StateNotFoundError('interest was not found');
    if (input.delete === true) {
      const deleted = this.store.transaction(() => this.store.deleteInterest(current.id));
      return { deleted, id: current.id, memoryUnaffected: true };
    }
    const disabled = input.disabled !== false;
    this.store.transaction(() => this.store.setInterestDisabled(current.id, disabled));
    return { id: current.id, disabled, memoryUnaffected: true };
  }

  /**
   * Admin reset to configured baselines.  Creates a backup and keeps the audit
   * record; it never deletes interests or Memory.
   * @param {{scopeId: string, expectedRevision: number, confirm: string}} input - reset.
   * @returns {Record<string, any>} result.
   */
  resetState(input) {
    if (input.confirm !== 'RESET') throw new StateValidationError('explicit RESET confirmation is required');
    const row = this.store.getScope(String(input.scopeId));
    if (row === undefined) throw new StateNotFoundError('state scope was not found');
    const authorization = this.scopeAuthorization(row);
    if (!authorization.authorized) throw new StateUnauthorizedError('scope authorization is not valid for reset');
    const backup = this.store.backup('before-reset');
    const cfg = this.config();
    const now = iso(this.clock());
    const result = this.store.transaction(() => {
      const stored = this.store.getState(row.id);
      if (stored === undefined) throw new StateNotFoundError('state scope has no snapshot');
      if (Number(input.expectedRevision) !== stored.revision) {
        throw new StateConflictError('state changed since it was read; refresh before resetting', {
          expectedRevision: input.expectedRevision,
          actualRevision: stored.revision,
        });
      }
      const reset = {
        ...initialState(cfg, this.clock()),
        scopeId: row.id,
        revision: stored.revision + 1,
        clockAnomalyAt: stored.clockAnomalyAt ?? null,
      };
      const beforeBaseline = pickBaseline(stored);
      const afterBaseline = pickBaseline(reset);
      const event = {
        id: `state-event:${randomUUID()}`,
        scopeId: row.id,
        idempotencyKey: `admin-reset:${row.id}:${randomUUID()}`,
        type: 'admin_reset',
        source: 'admin',
        trust: 'admin',
        sourceRef: 'admin:settings',
        summary: '管理员将当前状态重置为配置基准（历史未被删除）',
        appraisal: {},
        deltas: { mood: 0, energy: 0, curiosity: 0 },
        baselineDeltas: {
          mood: round(afterBaseline.mood - beforeBaseline.mood),
          energy: round(afterBaseline.energy - beforeBaseline.energy),
          curiosity: round(afterBaseline.curiosity - beforeBaseline.curiosity),
        },
        before: pickState(stored),
        after: pickState(reset),
        interestChanges: [],
        evidence: ['admin-confirmed'],
        sessionId: row.owner_session_id,
        personaId: row.persona_id,
        sceneId: row.scene_id,
        occurredAt: now,
        recordedAt: now,
      };
      this.store.insertEvent(event);
      const saved = this.store.saveState(reset, stored.revision);
      return { state: saved, event: this.store.findEventByKey(event.idempotencyKey), backup };
    });
    return result;
  }

  /**
   * Read-only preview of an event with a candidate config.
   * @param {{scopeId: string, eventType: string, config?: Record<string, unknown>}} input - preview.
   * @returns {Record<string, any>} preview.
   */
  preview(input) {
    const row = this.assertScopeAuthorized(String(input.scopeId ?? ''));
    const cfg = input.config === undefined ? this.config() : validateDraftConfig(input.config);
    const eventType = String(input.eventType ?? '');
    if (!EVENT_TYPES.includes(eventType)) throw new StateValidationError('eventType is not a known state event');
    const state = this.currentState(row.id);
    return { ...previewEvent(state, cfg, eventType), scopeId: row.id, config: publicConfig(cfg) };
  }

  /**
   * Owner overview for the 会话规则 page.  It reads the live registry each
   * time; archived or removed Sessions are never re-authorized from a cache.
   * @returns {Record<string, any>} workspace and session policy view.
   */
  sessionRulesOverview() {
    const status = this.bindingStatus();
    const output = {
      binding: status,
      sessions: [],
      rules: [],
      defaultMode: DEFAULT_SESSION_MODE,
      modes: SESSION_MODES,
      registryAvailable: this.registry() !== undefined,
      archivedCount: 0,
      note: 'Session ids and membership come from the official DSH workspaceRegistry. Display titles never decide identity. QQ scene mapping is unavailable without a public trusted resolver, so only stable Session ids are accepted.',
    };
    if (!status.bound || status.state !== 'ready') return output;
    const entity = liveWorkspace(this.registry(), status.workspaceId);
    const record = safeWorkspace(entity);
    if (record === null) return output;
    const rules = this.store.listSessionRules(status.workspaceId);
    const ruleMap = new Map(rules.map((rule) => [rule.sessionId, rule]));
    const archived = new Set();
    try {
      const ids = this.registry()?.archivedSessionIds;
      if (Array.isArray(ids)) for (const id of ids) if (typeof id === 'string') archived.add(id);
    } catch {
      // A failing archived getter is treated as no archived ids only for this
      // display projection; authorization still resolves membership live.
    }
    output.rules = rules;
    output.archivedCount = [...archived].filter((id) => record.sessionIds.includes(id)).length;
    output.sessions = record.sessionIds.slice(0, 500).map((sessionId) => {
      const rule = ruleMap.get(sessionId);
      return {
        sessionId,
        mode: archived.has(sessionId) ? 'archived' : rule?.mode ?? DEFAULT_SESSION_MODE,
        explicit: rule !== undefined,
        archived: archived.has(sessionId),
        updatedAt: rule?.updatedAt ?? null,
      };
    });
    return output;
  }

  /**
   * Set or replace one stable-Session exception in the bound Workspace.
   * @param {{sessionId: string, mode: string}} input - rule.
   * @returns {Record<string, any>} refreshed overview.
   */
  setSessionRule(input) {
    const status = this.bindingStatus();
    if (!status.bound || status.state !== 'ready') {
      throw new StateUnavailableError('a live bound Workspace is required before setting Session rules');
    }
    const sessionId = requireSessionId(input?.sessionId);
    const mode = String(input?.mode ?? '');
    if (!SESSION_MODES.includes(mode)) {
      throw new StateValidationError(`mode must be one of ${SESSION_MODES.join(', ')}`);
    }
    const resolved = resolveWorkspaceSession({
      registry: this.registry(),
      workspaceId: status.workspaceId,
      sessionId,
    });
    if (resolved.state === 'archived') {
      throw new StateConflictError('archived Sessions cannot receive a policy exception');
    }
    if (resolved.state !== 'member') {
      throw new StateValidationError('the Session is not a member of the bound Workspace');
    }
    this.store.transaction(() => {
      this.store.upsertSessionRule(status.workspaceId, sessionId, mode);
    });
    return this.sessionRulesOverview();
  }

  /**
   * Remove an exception, returning the Session to the Workspace default.
   * @param {{sessionId: string}} input - session.
   * @returns {Record<string, any>} refreshed overview.
   */
  clearSessionRule(input) {
    const status = this.bindingStatus();
    if (!status.bound) throw new StateUnavailableError('no Workspace is bound');
    const sessionId = requireSessionId(input?.sessionId);
    this.store.transaction(() => {
      this.store.deleteSessionRule(status.workspaceId, sessionId);
    });
    return this.sessionRulesOverview();
  }

  /**
   * Observe one trusted DSH Session event.  Only a completed real model turn
   * with structured tool-work evidence can produce a small automatic change;
   * plain greetings and text-only turns produce none.  No model call and no
   * text/token heuristic participates.
   * @param {Record<string, any>} session - live Session.
   * @param {Record<string, any>} event - immutable Session event.
   * @returns {Record<string, any>} outcome.
   */
  observeSessionEvent(session, event) {
    try {
      const sessionId = session?.id ?? session?.header?.id;
      if (typeof sessionId !== 'string' || !sessionId) return { applied: false, reason: 'unknown_session' };
      const type = String(event?.type ?? '');
      if (type === 'turn/start') {
        this.rememberTurn(sessionId, { turn: Number(event?.data?.turn), toolCalls: 0 });
        return { applied: false, reason: 'turn_started' };
      }
      if (type === 'assistant/message') {
        const turn = Number(event?.data?.turn);
        const current = this.turnObservations.get(sessionId);
        const observation = current && (!Number.isInteger(turn) || current.turn === turn)
          ? current
          : { turn: Number.isInteger(turn) ? turn : current?.turn, toolCalls: 0 };
        const content = event?.data?.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block && block.type === 'tool-call') observation.toolCalls += 1;
          }
        }
        this.rememberTurn(sessionId, observation);
        return { applied: false, reason: 'assistant_message_observed' };
      }
      if (type !== 'turn/end') return { applied: false, reason: 'ignored_event' };
      const observation = this.turnObservations.get(sessionId);
      this.turnObservations.delete(sessionId);
      const turn = Number(event?.data?.turn);
      const reason = event?.data?.reason?.kind;
      if (reason !== 'completed') {
        // A missing or non-completed reason is unknown evidence, not a
        // completed real model turn.  Fail closed instead of guessing.
        return { applied: false, reason: 'turn_not_completed' };
      }
      if (!Number.isInteger(turn) || turn < 0) return { applied: false, reason: 'turn_unknown' };
      if (!observation || observation.toolCalls < 1) return { applied: false, reason: 'no_work_evidence' };
      return this.evolveCompletedTurn({
        sessionId,
        turn,
        toolCalls: observation.toolCalls,
        endSeq: Number.isInteger(Number(event?.seq)) ? Number(event.seq) : null,
        endedAt: event?.time,
      });
    } catch (error) {
      this.noteError(error);
      return { applied: false, reason: 'observer_error', error: safeError(error) };
    }
  }

  /** @param {string} sessionId - session. @param {Record<string, any>} observation - bounded state. */
  rememberTurn(sessionId, observation) {
    if (this.turnObservations.size > 200) {
      const oldest = this.turnObservations.keys().next().value;
      if (oldest !== undefined) this.turnObservations.delete(oldest);
    }
    this.turnObservations.set(sessionId, {
      turn: Number.isInteger(observation.turn) ? observation.turn : 0,
      toolCalls: Math.min(100, Number(observation.toolCalls) || 0),
    });
  }

  /**
   * Apply the one bounded Host event for a completed tool-bearing turn.
   * @param {{sessionId: string, turn: number, toolCalls: number, endSeq: number|null, endedAt?: string}} input - evidence.
   * @returns {Record<string, any>} outcome.
   */
  evolveCompletedTurn({ sessionId, turn, toolCalls, endSeq, endedAt }) {
    const cfg = this.config();
    const effective = this.effectiveForSession(sessionId);
    if (!effective.allowed) return { applied: false, reason: effective.reason ?? effective.state };
    if (effective.mode === 'read_only') return { applied: false, reason: 'read_only' };
    if (effective.mode === 'disabled') return { applied: false, reason: 'disabled' };
    if (effective.mode === 'legacy' || cfg.autoEventProcessingEnabled !== true) {
      return { applied: false, reason: 'auto_evolution_disabled' };
    }
    if (cfg.autoEventMaxPerHour <= 0) return { applied: false, reason: 'hourly_cap_zero' };
    const scopeId = effective.identity.scopeId;
    const nowMs = this.clock();
    const idempotencyKey = `host:${scopeId}:session:${sessionId}:turn:${turn}`;
    // Idempotency outranks rate limiting: a redelivered turn/end must report
    // the original application, never a misleading rate-limit outcome.
    const existing = this.store.findEventByKey(idempotencyKey);
    if (existing !== undefined) return { applied: false, reason: 'duplicate_turn', duplicate: true };
    const last = this.store.lastHostEventForSession(scopeId, sessionId);
    if (last !== null && cfg.autoEventMinIntervalSeconds > 0) {
      const elapsed = nowMs - parseTimestamp(last);
      if (elapsed >= 0 && elapsed < cfg.autoEventMinIntervalSeconds * 1000) {
        return { applied: false, reason: 'rate_limited' };
      }
    }
    const hourly = this.store.countHostEventsSince(scopeId, iso(nowMs - 3_600_000));
    if (hourly >= cfg.autoEventMaxPerHour) return { applied: false, reason: 'hourly_cap' };
    const scale = effective.mode === 'shared' ? clamp(Number(cfg.sharedEventWeight), 0.05, 1) : 1;
    const base = {
      mood: 0,
      // Tool work says "effort", never "pleasant" or "unpleasant".  More tool
      // calls cost a little more energy, capped so one turn stays small.
      energy: -Math.min(1.6, 0.5 + toolCalls * 0.15),
      curiosity: 0.3,
      interest: 0,
    };
    const result = this.recordEventSync({
      identity: effective.identity,
      type: HOST_TURN_EVENT_TYPE,
      source: 'host',
      trust: 'trusted',
      summary: '已完成回合的结构化工具工作证据（不保存原始会话内容）',
      idempotencyKey,
      sourceRef: `session:${sessionId}:turn:${turn}:end:${endSeq ?? 'unknown'}`,
      evidence: [`session/turn:end#${endSeq ?? 'unknown'}`],
      base,
      scale,
      originSessionId: sessionId,
      occurredAt: iso(endedAt ? parseTimestamp(endedAt) : nowMs),
    });
    if (result.duplicate) return { applied: false, reason: 'duplicate_turn', duplicate: true };
    return { applied: true, reason: 'applied', eventId: result.event.id, mode: effective.mode };
  }

  /** @returns {boolean} whether the optional Memory adapter is healthy. */
  memoryAvailable() {
    try {
      return Boolean(this.memory && typeof this.memory.available === 'function' && this.memory.available());
    } catch {
      return false;
    }
  }

  /**
   * Model-safe health for one trusted Session. It exposes only static plugin
   * and integration availability plus this Session's own scope metadata and
   * last-event time. It deliberately omits global counts, global last-event
   * time, private errors, and configuration values.
   * @param {string} sessionId - trusted DSH Session id.
   * @returns {Record<string, unknown>} scoped health.
   */
  healthForSession(sessionId) {
    const cfg = this.config();
    const effective = this.effectiveForSession(sessionId);
    if (!effective.allowed) {
      return {
        version: this.version,
        state: 'unavailable',
        startedAt: this.startedAt,
        schemaVersion: null,
        scope: { known: false, privacy: 'private', source: 'unknown', authorization: 'denied' },
        access: { allowed: false, mode: effective.mode, reason: effective.reason ?? effective.state },
        lastEventAt: null,
        integrations: {
          life: { available: Boolean(this.getLife()), enabled: cfg.lifeIntegrationEnabled },
          memory: {
            available: this.memoryAvailable(),
            enabled: cfg.memoryIntegrationEnabled,
            writeEnabled: false,
            writeAvailable: false,
            writeReason: 'scene_scoped_memory_contract_unavailable',
          },
        },
        note: 'State is not available for this Session; no state, counts, or reasons are exposed.',
      };
    }
    const identity = effective.identity;
    let storeHealth;
    try {
      storeHealth = this.store.health();
    } catch (error) {
      storeHealth = { ok: false, schemaVersion: null };
    }
    let scopeKnown = false;
    let lastEventAt = null;
    let privacy = identity.privacy;
    try {
      const row = this.store.getScope(identity.scopeId);
      scopeKnown = row !== undefined;
      if (row !== undefined) privacy = row.privacy;
      const last = this.store.lastEvent(identity.scopeId);
      lastEventAt = last?.recordedAt ?? null;
    } catch {
      scopeKnown = false;
      lastEventAt = null;
    }
    const life = this.getLife();
    let memoryAvailable = false;
    try {
      memoryAvailable = Boolean(this.memory && typeof this.memory.available === 'function' && this.memory.available());
    } catch {
      memoryAvailable = false;
    }
    return {
      version: this.version,
      state: storeHealth.ok ? 'ready' : 'degraded',
      startedAt: this.startedAt,
      schemaVersion: storeHealth.schemaVersion ?? null,
      scope: {
        known: scopeKnown,
        privacy,
        source: effective.scopeKind === 'workspace' ? 'workspace' : identity.kind,
        authorization: 'session',
        kind: effective.scopeKind,
      },
      access: {
        allowed: true,
        mode: effective.mode,
        writable: effective.writable === true,
        readOnly: effective.readOnly === true,
        workspaceBound: effective.workspaceId !== null,
      },
      lastEventAt,
      integrations: {
        life: {
          available: Boolean(life),
          enabled: cfg.lifeIntegrationEnabled,
          contract: life && typeof life.getActivityStatus === 'function' ? 'activity+identity' : life ? 'identity or unknown' : 'absent',
        },
        memory: {
          available: memoryAvailable,
          enabled: cfg.memoryIntegrationEnabled,
          writeEnabled: false,
          writeAvailable: this.memory?.supportsSceneScopedWrite === true,
          writeReason: this.memory?.supportsSceneScopedWrite === true
            ? null
            : 'scene_scoped_memory_contract_unavailable',
          contract: this.memory?.contract ?? 'absent',
        },
      },
      note: 'Only this Session\'s scope is reported. Cross-scene event times, global counts, errors, and private configuration are not exposed.',
    };
  }

  /**
   * One owner-only payload for the workspace, rules, and data pages.  It
   * combines live registry membership, persisted rules, and the main state
   * without including another Workspace's sessions or any raw event reason.
   * @returns {Record<string, any>} overview.
   */
  workspaceOverview() {
    const binding = this.bindingStatus();
    const sessions = this.sessionRulesOverview();
    let main = null;
    if (binding.bound && binding.state === 'ready') {
      try {
        const scopeId = workspaceIdentity(binding.workspaceId).scopeId;
        const view = this.adminView(scopeId, { includeInterests: true, includeAudit: false });
        if (view && view.state) {
          delete view.config;
          main = view;
        }
      } catch (error) {
        main = { unavailableReason: safeError(error) };
      }
    }
    let schema = null;
    try {
      schema = this.store.inspect();
    } catch (error) {
      schema = { error: safeError(error) };
    }
    return {
      binding,
      workspaces: this.workspaces(),
      defaultMode: DEFAULT_SESSION_MODE,
      modes: SESSION_MODES,
      rules: sessions.rules,
      sessions: sessions.sessions,
      archivedCount: sessions.archivedCount,
      registryAvailable: sessions.registryAvailable,
      main,
      migration: this.store.migrationInfo(),
      schema,
      legacyNote: '旧 v1 私有 Scope、事件和审计原样保留，不会自动汇总到工作区主状态。',
      qqSceneRules: {
        implemented: false,
        reason: 'no_public_trusted_scene_mapping',
        note: '当前 DSH 未提供可公开验证的 QQ Scene 映射；仅支持稳定 Session ID 例外，避免按显示名称授权。',
      },
    };
  }

  /** @param {string} reason - label. */
  backup(reason = 'manual') {
    return this.store.backup(reason);
  }

  /** @returns {{file: string, bytes: number, createdAt: string}[]} safe backups. */
  listBackups() {
    return this.store.listBackups();
  }

  /**
   * Restore one preflighted backup over the live database. A safety backup is
   * created first; a failure restores and reopens the original file.
   * @param {{file?: string, confirm?: string}} input - explicit restore.
   * @returns {Record<string, any>} restored metadata and fresh health.
   */
  restoreBackup(input = {}) {
    if (String(input.confirm ?? '') !== 'RESTORE') {
      throw new StateValidationError('explicit RESTORE confirmation is required');
    }
    const result = this.store.restoreBackup(input.file);
    this.lastError = null;
    this.lastIntegrityError = null;
    this.lastEventAt = null;
    // Restored history invalidates in-memory turn observations; a later
    // turn/end must not combine with pre-restore evidence.
    this.turnObservations.clear();
    try {
      for (const row of this.store.listScopes()) {
        const event = this.store.lastEvent(row.id);
        if (event && (this.lastEventAt === null || event.recordedAt > this.lastEventAt)) {
          this.lastEventAt = event.recordedAt;
        }
      }
    } catch {
      // Health still reports the store; a scan failure is not a restore failure.
    }
    return { ...result, health: this.health(), backups: this.store.listBackups() };
  }

  /**
   * Safe diagnostics.  No paths, credentials, raw event reasons, or private
   * evidence are included.
   * @returns {Record<string, unknown>} health.
   */
  health() {
    const cfg = this.config();
    let storeHealth;
    try {
      storeHealth = this.store.health();
    } catch (error) {
      storeHealth = { ok: false, database: 'unavailable', error: safeError(error) };
    }
    const life = this.getLife();
    const memory = this.memory;
    let memoryAvailable = false;
    let backups = [];
    try {
      memoryAvailable = Boolean(memory && typeof memory.available === 'function' && memory.available());
    } catch {
      memoryAvailable = false;
    }
    try {
      backups = this.store.listBackups();
    } catch {
      backups = [];
    }
    return {
      version: this.version,
      state: storeHealth.ok ? 'ready' : 'degraded',
      startedAt: this.startedAt,
      database: storeHealth,
      schemaVersion: storeHealth.schemaVersion ?? null,
      backups,
      lastEventAt: this.lastEventAt,
      lastError: this.lastError,
      contextInjectionMode: cfg.contextInjectionMode,
      evolutionEnabled: cfg.stateEvolutionEnabled,
      modelAppraisalEnabled: cfg.modelAppraisalEnabled,
      autoEventProcessingEnabled: cfg.autoEventProcessingEnabled,
      workspace: this.bindingStatus(),
      migration: this.store.migrationInfo(),
      modelTools: {
        state_get: { implemented: true, modeAware: true },
        state_appraise: { implemented: true, enabled: cfg.modelAppraisalEnabled, extraLlmPerTurn: false },
        state_interests: { implemented: true, modeAware: true },
        state_health: { implemented: true, modeAware: true },
        automaticExtraAppraisal: { implemented: false, enabled: false, note: '未实现；不会每轮额外调用模型' },
      },
      integrations: {
        life: {
          available: Boolean(life && typeof life.getSessionBinding === 'function'),
          enabled: cfg.lifeIntegrationEnabled,
          contract: life && typeof life.getActivityStatus === 'function' ? 'activity+identity' : life ? 'identity or unknown' : 'absent',
        },
        memory: {
          available: memoryAvailable,
          enabled: cfg.memoryIntegrationEnabled,
          writeEnabled: false,
          writeAvailable: memory?.supportsSceneScopedWrite === true,
          writeReason: memory?.supportsSceneScopedWrite === true
            ? null
            : 'scene_scoped_memory_contract_unavailable',
          contract: memory?.contract ?? 'absent',
        },
      },
      config: publicConfig(cfg),
    };
  }
}
