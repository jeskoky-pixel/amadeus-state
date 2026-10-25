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
  EVENT_EFFECTS,
  EVENT_TYPES,
  StateConflictError,
  StateDisabledError,
  StateIntegrationError,
  StateNotFoundError,
  StateUnauthorizedError,
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
import { isLifeNotFound, resolveSessionIdentity, scopeView } from './scope.js';

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
  constructor({ store, getConfig, getLife = () => undefined, memory, clock = () => Date.now(), logger, version, startedAt }) {
    this.store = store;
    this.getConfig = getConfig;
    this.getLife = getLife;
    this.memory = memory;
    this.clock = clock;
    this.logger = logger;
    this.version = version;
    this.startedAt = startedAt;
    this.lastError = null;
    this.lastEventAt = null;
    this.lastIntegrityError = null;
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
    const identity = this.identityForSession(sessionId);
    this.ensureScope(identity);
    return this.buildView(identity, { includeInterests, includeAudit });
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
    return this.buildView(
      {
        kind: row.source,
        personaId: row.persona_id,
        sceneId: row.scene_id,
        privacy: row.privacy,
        scopeId: row.id,
        ownerSessionId: row.owner_session_id,
        bindingRevision: row.binding_revision,
        authorizationRef: 'admin',
        identitySource: 'admin',
      },
      { includeInterests, includeAudit },
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
  buildView(identity, { includeInterests = true, includeAudit = false } = {}) {
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
        personaId: identity.personaId,
        sceneId: identity.sceneId,
        privacy: identity.privacy,
        source: identity.kind,
        bindingRevision: identity.bindingRevision ?? null,
        authorization: 'session',
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
        summary: event.summary,
        deltas: event.deltas,
        baselineDeltas: event.baselineDeltas,
        before: event.before,
        after: event.after,
        interestChanges: event.interestChanges.map((change) => ({
          name: change.name,
          applied: change.applied,
          baselineApplied: change.baselineApplied,
        })),
        evidenceRefs: Array.isArray(event.evidence) ? event.evidence.map((ref) => String(ref).slice(0, 160)) : [],
      })),
      total: result.total,
      limit,
      offset,
    };
  }

  /**
   * Apply one event atomically.  Identity and authorization are supplied by
   * the caller; model arguments never reach this method as trust claims.
   * @param {Record<string, any>} input - event input.
   * @returns {Promise<Record<string, any>>} result.
   */
  async recordEvent(input) {
    const cfg = this.config();
    if (!cfg.stateEvolutionEnabled && input.source !== 'admin') {
      throw new StateDisabledError('state evolution is disabled; the event was not applied');
    }
    const identity = input.identity;
    if (!identity || typeof identity.scopeId !== 'string') throw new StateUnauthorizedError('trusted identity is required');
    if (!EVENT_TYPES.includes(input.type) && input.type !== 'admin_reset') {
      throw new StateValidationError(`unsupported event type: ${String(input.type)}`);
    }
    if (input.source === 'model_appraisal' && !MODEL_UNREFERENCED_EVENT_TYPES.includes(input.type)) {
      throw new StateValidationError('model appraisals cannot claim completion-shaped event types');
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
      });
      const interestChanges = [];
      let nextState = applied.state;
      const interestDelta = Number(input.interestDelta ?? 0);
      if (
        cfg.autoInterestUpdate &&
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
        sessionId: identity.sessionId ?? null,
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
    const identity = this.identityForSession(sessionId);
    this.ensureScope(identity);

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
      return this.appraiseLifeActivity({ exec, args, identity, appraisal, summary, cfg });
    }
    if (args.memoryId !== undefined) {
      return this.appraiseMemoryReference({ exec, args, identity, appraisal, summary, cfg });
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
    if (recent >= MODEL_RATE_LIMIT) {
      throw new StateValidationError('too many model appraisals in a short window; no state change applied');
    }
    const turn = turnOf(exec);
    const idempotencyKey = `model:${identity.scopeId}:turn:${turn}`;
    const effect = EVENT_EFFECTS[args.eventType];
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
      occurredAt: iso(this.clock()),
      exec,
    });
    return { accepted: true, duplicate: result.duplicate, event: result.event, state: result.state };
  }

  /**
   * @param {{exec: Record<string, any>, args: Record<string, any>, identity: Record<string, any>, appraisal: Record<string, any>, summary: string, cfg: Record<string, any>}} input - call.
   * @returns {Promise<Record<string, any>>} outcome.
   */
  async appraiseLifeActivity({ exec, args, identity, appraisal, summary, cfg }) {
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
    if (activity.personaId && activity.personaId !== identity.personaId) {
      throw new StateUnauthorizedError('Life activity belongs to another Persona; refused');
    }
    if (activity.sceneId && activity.sceneId !== identity.sceneId) {
      throw new StateUnauthorizedError('Life activity belongs to another Scene; refused');
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
      occurredAt: activity.updatedAt ?? iso(this.clock()),
      exec,
    });
    return { accepted: true, duplicate: result.duplicate, event: result.event, state: result.state };
  }

  /**
   * @param {{exec: Record<string, any>, args: Record<string, any>, identity: Record<string, any>, appraisal: Record<string, any>, summary: string, cfg: Record<string, any>}} input - call.
   * @returns {Promise<Record<string, any>>} outcome.
   */
  async appraiseMemoryReference({ exec, args, identity, appraisal, summary, cfg }) {
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
   * Model-safe health for one trusted Session. It exposes only static plugin
   * and integration availability plus this Session's own scope metadata and
   * last-event time. It deliberately omits global counts, global last-event
   * time, private errors, and configuration values.
   * @param {string} sessionId - trusted DSH Session id.
   * @returns {Record<string, unknown>} scoped health.
   */
  healthForSession(sessionId) {
    const cfg = this.config();
    const identity = this.identityForSession(sessionId);
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
        source: identity.kind,
        authorization: 'session',
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
