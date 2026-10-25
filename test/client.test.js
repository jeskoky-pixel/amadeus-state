import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { publicFieldMetadata } from '../src/config-fields.js';

const root = process.cwd();
const bundle = readFileSync(join(root, 'lib', 'client.js'), 'utf8');

test('client bundle is a lazy-CJS module with the real package id', () => {
  assert.match(bundle, /window\.__ModuleLoader__\.load\(\{/);
  assert.match(bundle, /id:\s*'@amadeus\/state'/);
  assert.match(bundle, /factory:\s*\(require\)\s*=>/);
  assert.doesNotMatch(bundle, /^\s*import\s/m);
  assert.doesNotMatch(bundle, /^\s*export\s/m);
  assert.equal(bundle.includes('node:sqlite'), false);
});

test('factory materializes with only the React baseline module', () => {
  let loaded;
  const fakeReact = {
    createElement(type, props, ...children) {
      return { type, props, children };
    },
    useState(value) {
      return [value, () => {}];
    },
    useRef(value) {
      return { current: value };
    },
    useEffect() {},
    useCallback(fn) {
      return fn;
    },
  };
  const sandbox = {
    window: { __ModuleLoader__: { load(spec) { loaded = spec; } } },
    console,
    document: { hidden: false, activeElement: null, addEventListener() {}, removeEventListener() {} },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    URL,
    fetch: async () => ({ ok: false, status: 503, json: async () => ({ ok: false, error: 'offline' }) }),
  };
  vm.runInNewContext(bundle, sandbox, { filename: 'lib/client.js' });
  assert.equal(loaded.id, '@amadeus/state');
  const module = loaded.factory((name) => {
    if (name === 'react') return fakeReact;
    throw new Error(`unexpected module request: ${name}`);
  });
  assert.deepEqual(Array.from(module.inject), ['slots', 'configForms']);
  assert.equal(typeof module.apply, 'function');
});

test('apply registers one settings.section and one scoped plugin-manager detail section', () => {
  let loaded;
  const fakeReact = {
    createElement(type) {
      return { type };
    },
    useState(value) {
      return [value, () => {}];
    },
    useRef(value) {
      return { current: value };
    },
    useEffect() {},
    useCallback(fn) {
      return fn;
    },
  };
  vm.runInNewContext(bundle, {
    window: { __ModuleLoader__: { load(spec) { loaded = spec; } } },
    console,
    document: { hidden: false, activeElement: null, addEventListener() {}, removeEventListener() {} },
    navigator: { language: 'zh-CN' },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    URL,
    fetch: async () => ({ ok: false, status: 503, json: async () => ({ ok: false, error: 'offline' }) }),
  });
  const module = loaded.factory(() => fakeReact);
  const registrations = [];
  const injectedNames = [];
  const effects = [];
  let disposed = 0;
  const ctx = {
    configForms: {
      whileServed(namespaces, register) {
        assert.deepEqual(Array.from(namespaces), ['amadeus-state']);
        const disposer = register(new Set(namespaces));
        return () => {
          disposed += 1;
          if (typeof disposer === 'function') disposer();
        };
      },
    },
    slots: {
      inject(name, register) {
        injectedNames.push(name);
        return register();
      },
      register(spec, render) {
        registrations.push({ spec, render });
        return () => {};
      },
    },
    effect(fn) {
      const disposer = fn();
      effects.push(disposer);
      return disposer;
    },
  };
  module.apply(ctx);
  assert.deepEqual(injectedNames, ['settings.section', 'plugins.detail.section']);
  const settings = registrations.find((entry) => entry.spec.name === 'settings.section');
  const detail = registrations.find((entry) => entry.spec.name === 'plugins.detail.section');
  assert.ok(settings, 'settings.section registration is required');
  assert.ok(detail, 'plugins.detail.section registration is required');
  assert.equal(settings.spec.id, 'amadeus-state');
  assert.equal(settings.spec.order, 25);
  assert.equal(typeof settings.spec.label, 'function');
  assert.match(settings.spec.label(), /Amadeus/);
  assert.equal(detail.spec.id, 'amadeus-state-basic-config');
  assert.equal(detail.spec.order, 30);
  assert.equal(typeof detail.render, 'function');
  assert.ok(detail.render({ subject: { kind: 'bundle', pkg: { name: '@amadeus/state' } } }));
  assert.equal(detail.render({ subject: { kind: 'bundle', pkg: { name: '@other/plugin' } } }), null);
  assert.ok(detail.render({ subject: { kind: 'row', pkg: { name: '@amadeus/state' }, row: { moduleName: '@amadeus/state' } } }));
  assert.equal(disposed, 0);
  assert.equal(effects.length, 2);
  for (const dispose of effects) dispose();
  assert.equal(disposed, 2);
});

test('injected metadata covers every public field with both languages', () => {
  const fields = publicFieldMetadata();
  for (const field of fields) {
    assert.match(bundle, new RegExp(`"key": "${field.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
    assert.ok(field.zh.label);
    assert.ok(field.en.help);
  }
});

test('package manifest is independent and includes the built client', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.name, '@amadeus/state');
  assert.equal(pkg.version, '1.0.0');
  assert.equal(pkg.private, true);
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.peerDependencies, undefined);
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml');
  assert.equal(pkg.dsh.client.platform, 'web');
  assert.deepEqual(pkg.dsh.client.inject, [
    '@deepseek-ai/dsh-client-ui-settings',
    '@deepseek-ai/dsh-client-ui-plugin-manager',
  ]);
  assert.ok(pkg.files.includes('lib'));
  assert.ok(pkg.files.includes('src'));
  assert.ok(pkg.engines.node);
  assert.ok(pkg.engines.dsh);
});
