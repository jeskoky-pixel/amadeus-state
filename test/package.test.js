import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_FIELDS } from '../src/config-fields.js';

const root = process.cwd();

test('bundle patch inserts exactly the State package', () => {
  const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8');
  const ids = [...patch.matchAll(/- id:\s*(\S+)/g)].map((match) => match[1]);
  assert.deepEqual(ids, ['amadeus-state']);
  assert.match(patch, /name: '@amadeus\/state'/);
});

test('documentation and icon are present in the distributable package', () => {
  for (const file of [
    'README.md',
    'icon.svg',
    'docs/USER_GUIDE.zh.md',
    'docs/INSTALL.md',
    'docs/BACKUP_ROLLBACK.md',
    'docs/ARCHITECTURE.md',
    'locale/zh.json',
    'locale/en.json',
  ]) {
    assert.ok(existsSync(join(root, file)), `missing ${file}`);
  }
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  for (const file of ['README.md', 'icon.svg', 'docs', 'locale', 'src', 'lib', 'scripts', 'test', 'cordis.patch.yml']) {
    assert.ok(pkg.files.includes(file), `package files must include ${file}`);
  }
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
