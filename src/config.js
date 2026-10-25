/**
 * Effective configuration helpers.
 *
 * DSH provides validated Config objects containing live volatile references.
 * Every read goes through `readField`, so a Settings write is visible to the
 * next tool call or context assembly without remounting the plugin.
 */

import { CONFIG_DEFAULTS, CONFIG_FIELD_BY_KEY, CONFIG_FIELDS } from './config-fields.js';
import { StateValidationError } from './model.js';

/** @typedef {Record<string, any>} StateConfig */

/**
 * @param {unknown} value - candidate.
 * @returns {boolean} whether it looks like a cosmokit volatile reference.
 */
function hasGet(value) {
  return typeof value === 'object' && value !== null && typeof value.get === 'function';
}

/**
 * Read one field from a live or plain config object.
 * @param {Record<string, unknown>} config - plugin config.
 * @param {string} key - field key.
 * @returns {unknown} current value.
 */
export function readField(config, key) {
  const value = config?.[key];
  return hasGet(value) ? value.get() : value;
}

/**
 * Normalize and validate the complete effective configuration.
 * @param {Record<string, unknown>} [config] - live or plain config.
 * @returns {StateConfig} detached plain configuration.
 */
export function normalizeConfig(config = {}) {
  const output = {};
  for (const field of CONFIG_FIELDS) {
    const raw = readField(config, field.key);
    const value = raw === undefined ? field.default : raw;
    if (field.type === 'boolean') {
      if (typeof value !== 'boolean') throw new StateValidationError(`${field.key} must be a boolean`);
      output[field.key] = value;
    } else if (field.type === 'enum') {
      if (typeof value !== 'string' || !field.enum.includes(value)) {
        throw new StateValidationError(`${field.key} must be one of ${field.enum.join(', ')}`);
      }
      output[field.key] = value;
    } else {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new StateValidationError(`${field.key} must be a finite number`);
      }
      if (field.min !== undefined && value < field.min) {
        throw new StateValidationError(`${field.key} must be >= ${field.min}`);
      }
      if (field.max !== undefined && value > field.max) {
        throw new StateValidationError(`${field.key} must be <= ${field.max}`);
      }
      output[field.key] = value;
    }
  }
  const databasePath = readField(config, 'databasePath');
  if (databasePath !== undefined && typeof databasePath !== 'string') {
    throw new StateValidationError('databasePath must be a string');
  }
  output.databasePath = typeof databasePath === 'string' ? databasePath : '';
  return output;
}

/**
 * Defaults as a plain detached object.
 * @returns {StateConfig} defaults.
 */
export function configDefaults() {
  return normalizeConfig(CONFIG_DEFAULTS);
}

/**
 * Safe, path-free configuration summary for health/status and the GUI.
 * @param {StateConfig} cfg - effective config.
 * @returns {Record<string, unknown>} public values.
 */
export function publicConfig(cfg) {
  const output = {};
  for (const field of CONFIG_FIELDS) output[field.key] = cfg[field.key];
  return output;
}

/**
 * Field metadata for the page and for validation messages.
 * @param {string} key - field key.
 * @returns {import('./config-fields.js').ConfigField|undefined} metadata.
 */
export function fieldMeta(key) {
  return CONFIG_FIELD_BY_KEY[key];
}

/**
 * Map a named influence strength to a bounded multiplier used only by the
 * context wording.  It never grants permissions or overrides Persona.
 * @param {StateConfig} cfg - effective config.
 * @returns {number} 0 to 1.6.
 */
export function influenceWeight(cfg) {
  switch (cfg.influenceStrength) {
    case 'off':
      return 0;
    case 'subtle':
      return 0.4;
    case 'strong':
      return 1.6;
    default:
      return 1;
  }
}

/**
 * Check a candidate config with the same rules as the Host.
 * @param {Record<string, unknown>} candidate - draft config.
 * @returns {StateConfig} normalized config.
 */
export function validateDraftConfig(candidate) {
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new StateValidationError('config must be an object');
  }
  return normalizeConfig(candidate);
}
