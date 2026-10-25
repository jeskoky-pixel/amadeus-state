import assert from 'node:assert/strict';
import test from 'node:test';
import { Config } from '../src/config-schema.js';
import { CONFIG_FIELDS, publicFieldMetadata } from '../src/config-fields.js';
import { configDefaults, normalizeConfig, publicConfig, readField, validateDraftConfig } from '../src/config.js';
import { createVolatile, isVolatile } from '../src/schema.js';

test('public field metadata is unique and covers every config field', () => {
  const keys = CONFIG_FIELDS.map((field) => field.key);
  assert.equal(new Set(keys).size, keys.length);
  const metadata = publicFieldMetadata();
  assert.equal(metadata.length, CONFIG_FIELDS.length);
  assert.ok(metadata.every((field) => field.zh.label && field.en.label));
  assert.ok(metadata.every((field) => typeof field.default !== 'undefined'));
});

test('Config serializes to a Schemastery-compatible uid/refs envelope and validates defaults', () => {
  const json = Config.toJSON();
  assert.equal(typeof json.uid, 'number');
  assert.equal(typeof json.refs, 'object');
  const root = json.refs[json.uid];
  assert.equal(root.type, 'object');
  assert.equal(Object.keys(root.dict).length, CONFIG_FIELDS.length + 1);
  // Nested schema positions must be numeric uid references, never inline
  // schema objects. This is what the official rehydrator consumes.
  assert.equal(typeof root.dict.stateEvolutionEnabled, 'number');
  assert.ok(Object.hasOwn(json.refs, root.dict.stateEvolutionEnabled));
  const result = Config['~standard'].validate({});
  assert.equal(result.issues, undefined);
  assert.equal(result.value.stateEvolutionEnabled.get(), true);
  assert.equal(result.value.energyBaseline.get(), 60);
  assert.equal(typeof result.value.databasePath, 'string');
  assert.ok(isVolatile(result.value.eventSensitivity));
});

test('Config rejects an out-of-range or wrongly typed field', () => {
  const range = Config['~standard'].validate({ eventSensitivity: 99 });
  assert.ok(Array.isArray(range.issues));
  assert.match(range.issues[0].message, /out of range/);
  const type = Config['~standard'].validate({ modelAppraisalEnabled: 'yes' });
  assert.ok(Array.isArray(type.issues));
  const enumResult = Config['~standard'].validate({ influenceStrength: 'extreme' });
  assert.ok(Array.isArray(enumResult.issues));
});

test('volatile references are live and update in place', () => {
  const ref = createVolatile(1);
  assert.equal(ref.get(), 1);
  ref[Symbol.for('cosmokit.volatile.write')](2);
  assert.equal(ref.get(), 2);
  assert.equal(readField({ value: ref }, 'value'), 2);
});

test('normalizeConfig applies defaults and rejects illegal drafts', () => {
  const defaults = configDefaults();
  assert.equal(defaults.eventSensitivity, 1);
  assert.equal(defaults.modelAppraisalEnabled, false);
  assert.equal(defaults.contextInjectionMode, 'brief');
  assert.equal(defaults.lifeIntegrationEnabled, true);
  assert.equal(defaults.memoryIntegrationEnabled, false);
  assert.equal(Object.hasOwn(defaults, 'memoryWriteEnabled'), false);
  assert.equal(CONFIG_FIELDS.some((field) => field.key === 'memoryWriteEnabled'), false);
  assert.throws(() => normalizeConfig({ eventSensitivity: 0 }), />= 0.25/);
  assert.throws(() => normalizeConfig({ influenceStrength: 'loud' }), /must be one of/);
  const safe = publicConfig(defaults);
  assert.equal(Object.hasOwn(safe, 'databasePath'), false);
});

test('validateDraftConfig keeps preview configuration safe', () => {
  assert.equal(validateDraftConfig({ autoRecovery: false }).autoRecovery, false);
  assert.throws(() => validateDraftConfig([]), /must be an object/);
  assert.throws(() => validateDraftConfig({ maxInterests: 9999 }), /<= 200/);
});
