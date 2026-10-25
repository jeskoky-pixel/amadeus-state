/**
 * Offline release checks: syntax, manifest consistency, no private imports,
 * no generated state in the worktree, and a coherent client bundle.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicFieldMetadata } from '../src/config-fields.js';
import { STATE_VERSION } from '../src/model.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const fields = publicFieldMetadata();
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

check(packageJson.name === '@amadeus/state', 'package name must be @amadeus/state');
check(packageJson.version === STATE_VERSION, `package version ${packageJson.version} must match STATE_VERSION ${STATE_VERSION}`);
check(packageJson.type === 'module', 'package must be an ES module');
check(packageJson.engines?.node === '>=22.13.0', 'Node engine must be >=22.13.0');
check(packageJson.engines?.dsh === '>=0.2.1-rc.3 <0.3.0', 'DSH engine range must match tested compatibility');
check(packageJson.dsh?.bundle?.patch === './cordis.patch.yml', 'dsh.bundle.patch must point at cordis.patch.yml');
check(packageJson.dsh?.client?.platform === 'web', 'dsh.client.platform must be web');
check(Array.isArray(packageJson.dsh?.client?.inject), 'dsh.client.inject must be an array');
for (const module of ['@deepseek-ai/dsh-client-ui-settings', '@deepseek-ai/dsh-client-ui-plugin-manager']) {
  check(packageJson.dsh?.client?.inject?.includes(module), `dsh.client.inject must include ${module}`);
}
check(packageJson.exports?.['./client'] === './lib/client.js', 'exports["./client"] must point at lib/client.js');
check(packageJson.exports?.['./locale/*.json'] === './locale/*.json', 'locale export must be present');
check(existsSync(join(root, 'lib/client.js')), 'lib/client.js must exist; run npm run build');
check(existsSync(join(root, 'cordis.patch.yml')), 'cordis.patch.yml must exist');
check(packageJson.files?.includes('CHANGELOG.md'), 'package files must include CHANGELOG.md');
for (const doc of [
  'CHANGELOG.md',
  'docs/RELEASE_NOTES.md',
  'docs/COMPATIBILITY.md',
  'docs/UPGRADE.md',
  'docs/BUILD.md',
  'docs/verification/STATE_V1_ACCEPTANCE_2026-10-25.md',
]) {
  check(existsSync(join(root, doc)), `${doc} must exist`);
}
check(fields.length >= 20, 'public config field count looks too small');
check(!fields.some((field) => field.key === 'memoryWriteEnabled'), 'Memory write must not be exposed as a Config field');

const markdownFiles = ['README.md', 'CHANGELOG.md'];
const collectMarkdown = (directory) => {
  for (const name of readdirSync(join(root, directory), { withFileTypes: true })) {
    const relative = `${directory}/${name.name}`;
    if (name.isDirectory()) collectMarkdown(relative);
    else if (name.isFile() && name.name.endsWith('.md')) markdownFiles.push(relative);
  }
};
collectMarkdown('docs');
for (const file of markdownFiles) {
  const text = readFileSync(join(root, file), 'utf8');
  for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0].trim();
    if (!target || /^(?:[a-z][a-z0-9+.-]*:|#)/i.test(target)) continue;
    check(existsSync(join(root, dirname(file), target)), `${file} has a broken relative link: ${target}`);
  }
}

const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8');
check(/- id: amadeus-state/.test(patch), 'bundle patch must insert amadeus-state');
check(/name: '@amadeus\/state'/.test(patch), 'bundle patch must reference @amadeus/state');

const client = readFileSync(join(root, 'lib/client.js'), 'utf8');
check(client.includes('window.__ModuleLoader__.load'), 'client must use the lazy-CJS loader');
check(client.includes("id: '@amadeus/state'"), 'client loader id must be the package name');
check(client.includes('settings.section'), 'client must register settings.section');
check(client.includes('plugins.detail.section'), 'client must register plugins.detail.section');
check(client.includes('configForms'), 'client must use the authoritative config form');
check(client.includes('amadeus-state-basic-config'), 'client must register the Plugin Manager basic config card');
check(!client.includes('memoryWriteEnabled'), 'client must not expose a Memory write setting');
for (const field of fields) {
  check(client.includes(`"${field.key}"`), `client metadata missing field ${field.key}`);
}

const sourceFiles = [
  'src/index.js',
  'src/config.js',
  'src/config-fields.js',
  'src/config-schema.js',
  'src/schema.js',
  'src/engine.js',
  'src/interests.js',
  'src/model.js',
  'src/scope.js',
  'src/store.js',
  'src/service.js',
  'src/tools.js',
  'src/context.js',
  'src/http.js',
  'src/adapters.js',
  'src/client/logic.js',
];
for (const file of sourceFiles) {
  const text = readFileSync(join(root, file), 'utf8');
  // The Host may use Node builtins, but it must not import Life/Memory private
  // code or absolute local paths.
  check(!/from\s+['"](?:\.\.\/)*(?:amadeus-life|amadeus-memory|dsh-mneme|@modusensus\/dsh-mneme)['"]/.test(text), `${file} imports a private module`);
  check(!/[A-Za-z]:\\\\Users\\\\/.test(text), `${file} contains an absolute Windows user path`);
  check(!/\b(?:sk-[A-Za-z0-9]{10,}|Bearer\s+[A-Za-z0-9._-]{12,})/.test(text), `${file} contains a credential-like string`);
}

for (const file of ['src/index.js', 'src/service.js', 'src/store.js', 'src/http.js', 'lib/client.js']) {
  try {
    // Inherited stdio avoids the confined-workspace named-pipe restriction on
    // captured child stdout while still surfacing the parser's diagnostic.
    execFileSync(process.execPath, ['--check', join(root, file)], { stdio: 'inherit' });
  } catch (error) {
    failures.push(`${file} failed node --check: ${String(error.message).slice(0, 300)}`);
  }
}

// dist/, node_modules/, and coverage/ are intentionally allowed to exist; the
// .gitignore prevents them from being tracked. The checks above already fail if
// lib/client.js or the required package metadata is missing.

if (failures.length > 0) {
  process.stderr.write(`State release checks failed:\n- ${failures.join('\n- ')}\n`);
  process.exit(1);
}
process.stdout.write(`State release checks passed (${sourceFiles.length} source files, ${fields.length} fields).\n`);
