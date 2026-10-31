import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_FIELDS } from '../src/config-fields.js';
import { STATE_VERSION } from '../src/model.js';

const root = process.cwd();

test('bundle patch inserts exactly the State package', () => {
  const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8');
  const ids = [...patch.matchAll(/- id:\s*(\S+)/g)].map((match) => match[1]);
  assert.deepEqual(ids, ['amadeus-state']);
  assert.match(patch, /name: '@fg-lab\/amadeus-state'/);
});

test('documentation, release notes, upgrade docs and icon are present', () => {
  for (const file of [
    'README.md',
    'CHANGELOG.md',
    'icon.svg',
    'docs/USER_GUIDE.zh.md',
    'docs/INSTALL.md',
    'docs/UPGRADE.md',
    'docs/BACKUP_ROLLBACK.md',
    'docs/ARCHITECTURE.md',
    'docs/RELEASE_NOTES.md',
    'docs/COMPATIBILITY.md',
    'docs/BUILD.md',
    'docs/PERFORMANCE.md',
    'docs/verification/STATE_V1_ACCEPTANCE_2026-10-25.md',
    'locale/zh.json',
    'locale/en.json',
  ]) {
    assert.ok(existsSync(join(root, file)), `missing ${file}`);
  }
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  for (const file of [
    'README.md', 'CHANGELOG.md', 'icon.svg', 'locale', 'src', 'lib', 'scripts', 'test',
    'cordis.patch.yml', 'docs/RELEASE_NOTES.md', 'docs/COMPATIBILITY.md', 'docs/UPGRADE.md',
    'docs/BUILD.md', 'docs/PERFORMANCE.md', 'docs/assets', 'docs/verification',
  ]) {
    assert.ok(pkg.files.includes(file), `package files must include ${file}`);
  }
  assert.equal(pkg.files.includes('docs'), false, 'developer-only docs must be listed explicitly');
  assert.equal(pkg.files.includes('docs/CREATOR_FINAL_PRODUCTIZATION.md'), false, 'creator report is not an install artifact');
});

test('release identity and compatibility are consistent', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.version, '1.2.0');
  assert.equal(pkg.version, STATE_VERSION);
  assert.equal(pkg.engines.node, '>=22.13.0');
  assert.equal(pkg.engines.dsh, '>=0.2.1-rc.3 <0.3.0');
  assert.equal(pkg.dsh.manifestVersion, 1);
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml');
  assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-settings'));
  assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-plugin-manager'));
  assert.ok(existsSync(join(root, 'scripts', 'verify-package.mjs')));
  assert.ok(pkg.scripts['verify:package']);
});

test('locale files provide Plugin Manager meta title and description', () => {
  for (const lang of ['zh', 'en']) {
    const locale = JSON.parse(readFileSync(join(root, 'locale', `${lang}.json`), 'utf8'));
    assert.equal(typeof locale.meta?.title, 'string', `${lang} meta.title`);
    assert.equal(typeof locale.meta?.description, 'string', `${lang} meta.description`);
    assert.ok(locale.meta.title.length > 0);
    assert.ok(locale.meta.description.length > 0);
    assert.equal(typeof locale.settings, 'object');
    assert.equal(typeof locale.config, 'object');
  }
});

test('config defaults are conservative for optional and high-risk features', () => {
  const byKey = Object.fromEntries(CONFIG_FIELDS.map((field) => [field.key, field.default]));
  assert.equal(byKey.modelAppraisalEnabled, false);
  assert.equal(byKey.memoryIntegrationEnabled, false);
  assert.equal(Object.hasOwn(byKey, 'memoryWriteEnabled'), false);
  assert.equal(byKey.stateEvolutionEnabled, true);
  assert.equal(byKey.contextInjectionMode, 'brief');
  assert.equal(byKey.influenceStrength, 'standard');
});

test('no generated database or backup is tracked in the worktree', () => {
  const forbidden = ['state.sqlite', 'state.sqlite-wal', 'state.sqlite-shm', 'backups'];
  for (const name of forbidden) {
    assert.equal(existsSync(join(root, name)), false, `${name} must not be tracked/generated at the repository root`);
  }
});
