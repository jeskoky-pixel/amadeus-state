import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Config } from '../src/config-schema.js';
import { configDefaults } from '../src/config.js';
import { CONFIG_FIELDS } from '../src/config-fields.js';

/**
 * Load the actual official Schemastery when it is available. The test also
 * accepts an explicit `DSH_SCHEMASTER_PATH` so a review environment can point
 * at the installed official library without adding a runtime dependency.
 * @returns {Promise<any|null>} official Schema constructor, or null.
 */
async function loadOfficial() {
  if (process.env.DSH_SCHEMASTER_PATH) {
    let candidate = resolve(process.env.DSH_SCHEMASTER_PATH);
    if (!candidate.endsWith('.mjs') && !candidate.endsWith('.js')) {
      candidate = join(candidate, 'lib', 'index.mjs');
    }
    const module = await import(pathToFileURL(candidate).href);
    return module.default ?? module.Schema ?? module;
  }
  try {
    const module = await import('@deepseek-ai/schemastery');
    return module.default ?? module.Schema ?? module;
  } catch {
    return null;
  }
}

/**
 * Assert every nested schema position is a uid that exists in `refs`.
 * @param {Record<string, any>} envelope - serialized schema envelope.
 */
function assertEnvelope(envelope) {
  assert.equal(typeof envelope, 'object');
  assert.equal(typeof envelope.uid, 'number');
  assert.equal(typeof envelope.refs, 'object');
  const root = envelope.refs[envelope.uid];
  assert.ok(root, 'root uid must exist in refs');
  assert.equal(root.type, 'object');
  assert.equal(Object.keys(root.dict).length, CONFIG_FIELDS.length + 1);
  for (const [uid, body] of Object.entries(envelope.refs)) {
    assert.equal(typeof body, 'object', `ref ${uid} must be an object`);
    assert.equal(typeof body.type, 'string', `ref ${uid} must have a type`);
    if (body.dict) {
      for (const [key, child] of Object.entries(body.dict)) {
        assert.equal(typeof child, 'number', `dict ${uid}.${key} must be a uid reference`);
        assert.ok(envelope.refs[child], `dict ${uid}.${key} points at missing ref ${child}`);
      }
    }
    if (body.list) {
      for (const [index, child] of body.list.entries()) {
        assert.equal(typeof child, 'number', `list ${uid}[${index}] must be a uid reference`);
        assert.ok(envelope.refs[child], `list ${uid}[${index}] points at missing ref ${child}`);
      }
    }
    if (body.inner !== undefined) {
      assert.equal(typeof body.inner, 'number', `inner ${uid} must be a uid reference`);
      assert.ok(envelope.refs[body.inner], `inner ${uid} points at missing ref ${body.inner}`);
    }
    if (body.sKey !== undefined) {
      assert.equal(typeof body.sKey, 'number', `sKey ${uid} must be a uid reference`);
      assert.ok(envelope.refs[body.sKey], `sKey ${uid} points at missing ref ${body.sKey}`);
    }
  }
}

test('Config.toJSON emits a real Schemastery uid/refs envelope with no inline schemas', () => {
  const envelope = Config.toJSON();
  assertEnvelope(envelope);
  const root = envelope.refs[envelope.uid];
  const influence = envelope.refs[root.dict.influenceStrength];
  assert.equal(influence.type, 'union');
  assert.equal(influence.list.length, 4);
  assert.deepEqual(
    influence.list.map((uid) => envelope.refs[uid].value),
    ['off', 'subtle', 'standard', 'strong'],
  );
  const contextMode = envelope.refs[root.dict.contextInjectionMode];
  assert.equal(contextMode.type, 'union');
  assert.deepEqual(
    contextMode.list.map((uid) => envelope.refs[uid].value),
    ['off', 'brief', 'state_interests', 'detailed'],
  );
  // A fresh call must not leak refs from a previous serialization.
  const second = Config.toJSON();
  assertEnvelope(second);
  assert.notEqual(second, envelope);
});

/**
 * Faithful local fixture of the official Schemastery `new Schema({uid,refs})`
 * rehydration: construct each ref, connect child uids, return the root. This
 * runs even when the official package is not installed, so an inline-schema
 * regression cannot pass silently.
 * @param {Record<string, any>} envelope - serialized schema envelope.
 * @returns {Record<string, any>} rehydrated root schema.
 */
function rehydrateFaithfully(envelope) {
  const refs = {};
  for (const [uid, raw] of Object.entries(envelope.refs)) refs[uid] = { ...raw, meta: { ...(raw.meta ?? {}) } };
  const get = (uid) => {
    if (uid === undefined) return undefined;
    if (refs[uid] === undefined) throw new Error(`serialized schema points at missing ref ${String(uid)}`);
    return refs[uid];
  };
  for (const body of Object.values(refs)) {
    body.sKey = get(body.sKey);
    body.inner = get(body.inner);
    if (body.list !== undefined) body.list = body.list.map(get);
    if (body.dict !== undefined) {
      body.dict = Object.fromEntries(Object.entries(body.dict).map(([key, uid]) => [key, get(uid)]));
    }
  }
  return get(envelope.uid);
}

/**
 * Minimal faithful resolver for the subset State's Config uses.
 * @param {Record<string, any>} node - rehydrated schema node.
 * @param {unknown} value - input.
 * @returns {unknown} validated value.
 */
function resolveFaithfully(node, value) {
  const target = value === undefined ? node.meta?.default : value;
  if (target === undefined) {
    if (node.meta?.required === false) return undefined;
    throw new Error(`missing value at ${node.type}`);
  }
  if (node.type === 'object') {
    if (target === null || typeof target !== 'object' || Array.isArray(target)) throw new Error('expected object');
    return Object.fromEntries(
      Object.entries(node.dict ?? {}).map(([key, child]) => [key, resolveFaithfully(child, target[key])]),
    );
  }
  if (node.type === 'union') {
    for (const child of node.list ?? []) {
      try {
        return resolveFaithfully(child, target);
      } catch {
        // try the next branch
      }
    }
    throw new Error('no union branch matched');
  }
  if (node.type === 'const') {
    if (target !== node.value) throw new Error('const mismatch');
    return target;
  }
  if (node.type === 'string') {
    if (typeof target !== 'string') throw new Error('expected string');
    return target;
  }
  if (node.type === 'number') {
    if (typeof target !== 'number' || !Number.isFinite(target)) throw new Error('expected number');
    return target;
  }
  if (node.type === 'boolean') {
    if (typeof target !== 'boolean') throw new Error('expected boolean');
    return target;
  }
  return target;
}

test('faithful rehydrator consumes the JSON wire envelope and validates the full default config', () => {
  const envelope = JSON.parse(JSON.stringify(Config.toJSON()));
  const root = rehydrateFaithfully(envelope);
  const defaults = configDefaults();
  const parsed = resolveFaithfully(root, defaults);
  for (const [key, expected] of Object.entries(defaults)) {
    assert.deepEqual(parsed[key], expected, `faithful rehydration/default mismatch for ${key}`);
  }
  assert.equal(parsed.influenceStrength, 'standard');
  assert.equal(parsed.contextInjectionMode, 'brief');
});

test('official Schemastery rehydrates the exact Config.toJSON envelope and full defaults', async (t) => {
  const Official = await loadOfficial();
  if (!Official) {
    t.skip('official @deepseek-ai/schemastery is unavailable; structural envelope regression still ran');
    return;
  }
  const envelope = JSON.parse(JSON.stringify(Config.toJSON()));
  const schema = new Official(envelope);
  assert.equal(schema.type, 'object');
  const defaults = configDefaults();
  assert.equal(Object.keys(defaults).length, CONFIG_FIELDS.length + 1);
  const parsed = schema(defaults);
  for (const [key, expected] of Object.entries(defaults)) {
    const value = parsed[key];
    const actual = value && typeof value.get === 'function' ? value.get() : value;
    assert.deepEqual(actual, expected, `official rehydration/default mismatch for ${key}`);
  }
  assert.equal(parsed.influenceStrength.get(), 'standard');
  assert.equal(parsed.contextInjectionMode.get(), 'brief');
  assert.equal(parsed.stateEvolutionEnabled.get(), true);
});
