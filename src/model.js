/**
 * Shared vocabulary, errors, bounds, and validation helpers.
 *
 * This module imports nothing.  The engine and the persistence layer must be
 * testable without DSH, Cordis, Life, Memory, or a GUI.
 */

/** Schema version written into `meta.schema_version`. */
export const STATE_SCHEMA_VERSION = '1';

/** Plugin version reported by health/status. */
export const STATE_VERSION = '1.0.0';

/** Short-term state ranges. */
export const RANGES = Object.freeze({
  mood: Object.freeze({ min: -100, max: 100, span: 200 }),
  energy: Object.freeze({ min: 0, max: 100, span: 100 }),
  curiosity: Object.freeze({ min: 0, max: 100, span: 100 }),
});

export const STATE_KEYS = Object.freeze(['mood', 'energy', 'curiosity']);

/** Accepted model appraisal event types. */
export const EVENT_TYPES = Object.freeze([
  'meaningful_interaction',
  'exploration_completed',
  'knowledge_gained',
  'difficulty',
  'memory_reference',
  'life_completed',
  'life_failed',
]);

/** Source labels stored in the audit log. */
export const SOURCES = Object.freeze(['model_appraisal', 'life', 'memory', 'admin', 'host']);

/** Trust labels. Model-supplied data is never `trusted`. */
export const TRUST = Object.freeze(['untrusted', 'bounded', 'trusted', 'admin']);

export const INTEREST_SOURCES = Object.freeze(['manual', 'event', 'life', 'memory']);

/** Base event effects before sensitivity, appraisal, and saturation. */
export const EVENT_EFFECTS = Object.freeze({
  meaningful_interaction: Object.freeze({ mood: 3, energy: -1, curiosity: 1, interest: 1 }),
  exploration_completed: Object.freeze({ mood: 4, energy: -4, curiosity: 5, interest: 6 }),
  knowledge_gained: Object.freeze({ mood: 2, energy: -1, curiosity: 3, interest: 4 }),
  difficulty: Object.freeze({ mood: -4, energy: -3, curiosity: -1, interest: 0 }),
  memory_reference: Object.freeze({ mood: 1, energy: 0, curiosity: 2, interest: 2 }),
  life_completed: Object.freeze({ mood: 3, energy: -3, curiosity: 2, interest: 5 }),
  life_failed: Object.freeze({ mood: -5, energy: -3, curiosity: -1, interest: 0 }),
});

/** Base class for explicit State failures. */
export class StateError extends Error {
  /**
   * @param {string} message - human-readable message.
   * @param {string} code - stable code.
   * @param {Record<string, unknown>} [details] - non-secret details.
   */
  constructor(message, code, details = {}) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
  }
}

export class StateValidationError extends StateError {
  constructor(message, details) {
    super(message, 'STATE_VALIDATION', details);
  }
}

export class StateUnauthorizedError extends StateError {
  constructor(message, details) {
    super(message, 'STATE_UNAUTHORIZED', details);
  }
}

export class StateNotFoundError extends StateError {
  constructor(message, details) {
    super(message, 'STATE_NOT_FOUND', details);
  }
}

export class StateConflictError extends StateError {
  constructor(message, details) {
    super(message, 'STATE_CONFLICT', details);
  }
}

export class StateStorageError extends StateError {
  constructor(message, details) {
    super(message, 'STATE_STORAGE', details);
  }
}

export class StateIntegrationError extends StateError {
  constructor(message, details) {
    super(message, 'STATE_INTEGRATION', details);
  }
}

export class StateDisabledError extends StateError {
  constructor(message, details) {
    super(message, 'STATE_DISABLED', details);
  }
}

export class StateUnavailableError extends StateError {
  constructor(message, details) {
    super(message, 'STATE_UNAVAILABLE', details);
  }
}

export class StateClosedError extends StateError {
  constructor(message = 'State store is closed', details) {
    super(message, 'STATE_CLOSED', details);
  }
}

/** @param {number} value - candidate. @param {number} min - lower. @param {number} max - upper. */
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Round to six decimals to keep snapshots deterministic and compact. */
export function round(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1_000_000) / 1_000_000;
}

/** @param {unknown} value - candidate. @returns {boolean} whether it is a plain object. */
export function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** @param {unknown} value - candidate. @param {string} name - field name. @param {number} max - max length. */
export function requireString(value, name, max = 500) {
  if (typeof value !== 'string') throw new StateValidationError(`${name} must be a string`);
  const trimmed = value.trim();
  if (!trimmed) throw new StateValidationError(`${name} must not be empty`);
  if (trimmed.length > max) throw new StateValidationError(`${name} exceeds ${max} characters`);
  return trimmed;
}

/** @param {unknown} value - candidate. @param {string} name - field name. @param {{min?: number, max?: number}} range - bounds. */
export function requireNumber(value, name, range = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new StateValidationError(`${name} must be a finite number`);
  }
  if (range.min !== undefined && value < range.min) throw new StateValidationError(`${name} must be >= ${range.min}`);
  if (range.max !== undefined && value > range.max) throw new StateValidationError(`${name} must be <= ${range.max}`);
  return value;
}

/** @param {unknown} value - candidate. @param {string} name - field name. */
export function requireBoolean(value, name) {
  if (typeof value !== 'boolean') throw new StateValidationError(`${name} must be a boolean`);
  return value;
}

/** @param {unknown} value - candidate. @param {string[]} allowed - allowed values. @param {string} name - field name. */
export function requireEnum(value, allowed, name) {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new StateValidationError(`${name} must be one of ${allowed.join(', ')}`);
  }
  return value;
}

/** @param {unknown} value - candidate. @param {number} max - max length. */
export function optionalString(value, max = 500) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new StateValidationError('value must be a string');
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > max) throw new StateValidationError(`value exceeds ${max} characters`);
  return trimmed;
}

/** @param {unknown} value - timestamp candidate. @returns {number} epoch milliseconds. */
export function parseTimestamp(value) {
  const ms = typeof value === 'number' ? value : Date.parse(String(value));
  if (!Number.isFinite(ms)) throw new StateValidationError('invalid timestamp');
  return ms;
}

/** @param {number} ms - epoch milliseconds. @returns {string} ISO-8601 UTC. */
export function iso(ms) {
  return new Date(ms).toISOString();
}

/** @param {number} ms - epoch milliseconds. @returns {string} canonical ISO. */
export function normalizeTimestamp(ms) {
  return iso(ms);
}

/**
 * Redact URLs, local paths, and credential-like text from a diagnostic string.
 * @param {unknown} error - thrown value.
 * @param {number} [limit] - maximum output length.
 * @returns {string} safe one-line text.
 */
export function safeError(error, limit = 300) {
  return String(error?.message ?? error)
    .replace(/https?:\/\/\S+/gi, '[address]')
    .replace(/[A-Za-z]:[\\/][^\r\n，；]+/g, '[local path]')
    .replace(/(?:token|cookie|authorization|password|secret)\s*[:=]\s*\S+/gi, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

/**
 * Stable hash for deriving compact IDs without external crypto imports.
 * This is a non-cryptographic identifier only; callers needing collision
 * resistance use random UUIDs.
 * @param {string} text - input.
 * @returns {string} 16 hex characters.
 */
export function stableHash(text) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ code, 0x85ebca6b) >>> 0;
  }
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).slice(0, 16);
}


