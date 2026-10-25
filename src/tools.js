/**
 * Model-facing tools.
 *
 * The model never supplies a Persona, Scene, Session, source trust, evidence,
 * or administrator flag.  Scope and authority come from the live execution
 * context; Life/Memory references are verified through their public seams.
 */

import {
  EVENT_TYPES,
  StateError,
  StateUnauthorizedError,
  StateValidationError,
  isPlainObject,
} from './model.js';

const RESERVED = new Set([
  'scope',
  'scopeId',
  'session',
  'sessionId',
  'scene',
  'sceneId',
  'persona',
  'personaId',
  'ownerScope',
  'contextScope',
  'authorizationRef',
  'trust',
  'source',
  'trustedEvidence',
  'admin',
  'principalId',
]);

const TEXT_OUTPUT = (text) => [{ type: 'text', text }];

/**
 * @param {unknown} value - candidate.
 * @param {string} name - field.
 * @param {number} min - minimum.
 * @param {number} max - maximum.
 * @returns {number} validated number.
 */
function numberArg(value, name, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new StateValidationError(`${name} must be a finite number between ${min} and ${max}`);
  }
  return value;
}

/**
 * @param {unknown} value - candidate.
 * @param {string} name - field.
 * @param {number} max - maximum length.
 * @returns {string|undefined} trimmed string.
 */
function optionalText(value, name, max) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new StateValidationError(`${name} must be a string`);
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > max) throw new StateValidationError(`${name} exceeds ${max} characters`);
  return trimmed;
}

/**
 * @param {unknown} args - model arguments.
 * @param {string[]} allowed - allowed keys.
 * @returns {Record<string, unknown>} validated plain object.
 */
function objectArgs(args, allowed) {
  if (!isPlainObject(args)) throw new StateValidationError('tool arguments must be a plain object');
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(args)) {
    if (RESERVED.has(key)) throw new StateValidationError(`argument "${key}" is reserved and derived from the Session`);
    if (!allowedSet.has(key)) throw new StateValidationError(`unexpected argument "${key}"`);
  }
  return args;
}

/**
 * @param {Record<string, any>} service - State service.
 * @param {Record<string, any>} exec - execution context.
 * @returns {string} trusted Session id.
 */
function sessionIdOf(exec) {
  const id = exec?.agent?.session?.id;
  if (typeof id !== 'string' || !id) throw new StateUnauthorizedError('State tools require an Agent Session');
  return id;
}

/**
 * @param {import('./service.js').StateService} service - service.
 * @param {unknown} error - thrown value.
 */
function toolError(service, error) {
  if (error instanceof StateError) {
    service.noteError(error);
    return new Error(`${error.code}: ${error.message}`);
  }
  return error;
}

/**
 * Register State's model tools.
 * @param {Record<string, any>} ctx - Cordis context.
 * @param {import('./service.js').StateService} service - service.
 */
export function registerTools(ctx, service) {
  ctx.tools.register({
    name: 'state_get',
    description:
      'Read the current authorized Mood, Energy, and Curiosity for this Session, with baselines, a plain-language explanation, a tendency hint, and a few interests. Scope comes from the live Session; State only supplies tendencies and never overrides Persona or Life scheduling.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        includeInterests: { type: 'boolean', description: 'Include up to five interests (default true).' },
      },
      required: [],
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => TEXT_OUTPUT(JSON.stringify(value, null, 2)),
    },
    isConcurrencySafe: () => true,
    execute: async (rawArgs, exec) => {
      try {
        const args = objectArgs(rawArgs ?? {}, ['includeInterests']);
        if (args.includeInterests !== undefined && typeof args.includeInterests !== 'boolean') {
          throw new StateValidationError('includeInterests must be a boolean');
        }
        const sessionId = sessionIdOf(exec);
        const view = service.viewForSession(sessionId, {
          includeInterests: args.includeInterests !== false,
        });
        return {
          scope: {
            source: view.scope.source,
            privacy: view.scope.privacy,
            authorization: view.scope.authorization,
          },
          state: view.state,
          baseline: view.baseline,
          explanation: view.explanation,
          tendency: view.tendency,
          interests: view.interests.slice(0, 5).map((interest) => ({
            name: interest.name,
            baseline: interest.baseline,
            activity: interest.activity,
            manual: interest.manual,
          })),
          updatedAt: view.updatedAt,
          lastEventAt: view.lastEventAt,
          note: 'Values are tendencies, not medical measurements. State cannot read another Scene and cannot change permissions.',
        };
      } catch (error) {
        throw toolError(service, error);
      }
    },
  });

  ctx.tools.register({
    name: 'state_appraise',
    description:
      'Submit one bounded, low-trust subjective appraisal of a real event for this Session. Use a Life activityId only for an activity Life reports as completed or failed; use a memoryId only when Memory integration is enabled. Unreferenced eventType is limited to meaningful_interaction, knowledge_gained, or difficulty; completion cannot be claimed without a verified Life activity. Repeated calls with the same reference are idempotent. Model text can never claim a trusted source, evidence, Scene, Persona, or admin right. Requires model event appraisal to be enabled in settings.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        summary: { type: 'string', description: 'Short reason for this appraisal (1-280 characters).' },
        eventType: {
          type: 'string',
          enum: EVENT_TYPES,
          description: 'Event kind. Omit only when activityId or memoryId supplies the event.',
        },
        valence: { type: 'number', description: 'Subjective pleasantness from -1 to 1.' },
        intensity: { type: 'number', description: 'Subjective intensity from 0 to 1.' },
        curiosity: { type: 'number', description: 'Subjective curiosity pull from -1 to 1.' },
        topic: { type: 'string', description: 'Optional short topic for recent interests (1-60 characters).' },
        activityId: { type: 'string', description: 'Optional Life activity id. Life must report it completed or failed.' },
        memoryId: { type: 'string', description: 'Optional Memory id to verify through native memory_get.' },
      },
      required: ['summary'],
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => TEXT_OUTPUT(JSON.stringify(value, null, 2)),
    },
    isConcurrencySafe: () => false,
    execute: async (rawArgs, exec) => {
      try {
        const args = objectArgs(rawArgs ?? {}, [
          'summary',
          'eventType',
          'valence',
          'intensity',
          'curiosity',
          'topic',
          'activityId',
          'memoryId',
        ]);
        const summary = optionalText(args.summary, 'summary', 280);
        if (!summary) throw new StateValidationError('summary is required');
        if (args.eventType !== undefined && !EVENT_TYPES.includes(args.eventType)) {
          throw new StateValidationError(`eventType must be one of ${EVENT_TYPES.join(', ')}`);
        }
        if (args.activityId !== undefined && args.memoryId !== undefined) {
          throw new StateValidationError('use either activityId or memoryId, not both');
        }
        const activityId = optionalText(args.activityId, 'activityId', 200);
        const memoryId = optionalText(args.memoryId, 'memoryId', 200);
        if (!activityId && !memoryId && !args.eventType) {
          throw new StateValidationError('eventType is required when no trusted reference is supplied');
        }
        if (activityId && /[\r\n\u0000]/.test(activityId)) throw new StateValidationError('activityId is invalid');
        if (memoryId && /[\r\n\u0000]/.test(memoryId)) throw new StateValidationError('memoryId is invalid');
        const topic = optionalText(args.topic, 'topic', 60);
        const result = await service.appraiseModel({
          exec,
          args: {
            summary,
            eventType: args.eventType,
            valence: args.valence === undefined ? 0 : numberArg(args.valence, 'valence', -1, 1),
            intensity: args.intensity === undefined ? 0.4 : numberArg(args.intensity, 'intensity', 0, 1),
            curiosity: args.curiosity === undefined ? 0 : numberArg(args.curiosity, 'curiosity', -1, 1),
            topic,
            activityId,
            memoryId,
          },
        });
        return {
          accepted: true,
          duplicate: result.duplicate === true,
          state: result.state
            ? {
                mood: result.state.mood,
                energy: result.state.energy,
                curiosity: result.state.curiosity,
                updatedAt: result.state.updatedAt,
              }
            : null,
          event: {
            id: result.event.id,
            type: result.event.type,
            source: result.event.source,
            trust: result.event.trust,
            occurredAt: result.event.occurredAt,
            deltas: result.event.deltas,
          },
          note: result.duplicate
            ? 'This event reference was already applied; idempotency prevented a second change.'
            : 'Applied as a bounded tendency update; it cannot override Persona, permissions, or Life scheduling.',
        };
      } catch (error) {
        throw toolError(service, error);
      }
    },
  });

  ctx.tools.register({
    name: 'state_interests',
    description:
      'Read interests authorized for this Session. Long-term baseline and recent activity are separate; recent activity decays and saturates. Results never include another Scene or raw Memory content.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        limit: { type: 'integer', description: 'Maximum entries (1-20, default 10).' },
      },
      required: [],
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => TEXT_OUTPUT(JSON.stringify(value, null, 2)),
    },
    isConcurrencySafe: () => true,
    execute: async (rawArgs, exec) => {
      try {
        const args = objectArgs(rawArgs ?? {}, ['limit']);
        const limit = args.limit === undefined ? 10 : Number(args.limit);
        if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
          throw new StateValidationError('limit must be an integer between 1 and 20');
        }
        const view = service.viewForSession(sessionIdOf(exec), { includeInterests: true });
        return {
          interests: view.interests.slice(0, limit).map((interest) => ({
            name: interest.name,
            baseline: interest.baseline,
            activity: interest.activity,
            source: interest.source,
            manual: interest.manual,
          })),
          updatedAt: view.updatedAt,
          note: 'Baseline is the slow preference; activity is recent and decays. Manual entries are not overwritten by events.',
        };
      } catch (error) {
        throw toolError(service, error);
      }
    },
  });

  ctx.tools.register({
    name: 'state_health',
    description:
      'Read State health visible to this Session only. Returns static plugin/integration availability and this Session\'s own scope metadata; never global counts, cross-scene last-event times, private errors, paths, credentials, or configuration. Never changes state.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {},
      required: [],
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => TEXT_OUTPUT(JSON.stringify(value, null, 2)),
    },
    isConcurrencySafe: () => true,
    execute: async (rawArgs, exec) => {
      try {
        objectArgs(rawArgs ?? {}, []);
        return service.healthForSession(sessionIdOf(exec));
      } catch (error) {
        throw toolError(service, error);
      }
    },
  });
}
