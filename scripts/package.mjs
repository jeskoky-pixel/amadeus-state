/**
 * Build and produce a distributable tarball plus its SHA-256.
 *
 * The tarball is written under dist/ (gitignored); the installed package does
 * not depend on this source worktree.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist');
mkdirSync(dist, { recursive: true });

execFileSync(process.execPath, [join(root, 'scripts', 'build-client.mjs')], { cwd: root, stdio: 'inherit' });

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('npm_execpath is unavailable; run this script through `npm run package`');
for (const name of readdirSync(dist)) {
  if (name.endsWith('.tgz')) unlinkSync(join(dist, name));
}
// Inherited stdio keeps this compatible with confined desktop sandboxes that
// deny captured child pipes. npm writes its JSON receipt to the console.
execFileSync(process.execPath, [npmCli, 'pack', '--pack-destination', dist, '--json'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, npm_config_cache: join(root, '.npm-cache') },
});
const tarballs = readdirSync(dist).filter((name) => name.endsWith('.tgz')).sort();
if (tarballs.length !== 1) throw new Error(`expected exactly one packed tarball, found ${tarballs.length}`);
const file = join(dist, tarballs[0]);
const bytes = readFileSync(file);
const sha256 = createHash('sha256').update(bytes).digest('hex');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const info = {
  name: pkg.name,
  version: pkg.version,
  file: `dist/${tarballs[0]}`,
  bytes: statSync(file).size,
  sha256,
  files: pkg.files,
  createdAt: new Date().toISOString(),
};
writeFileSync(join(dist, 'PACKAGE_INFO.json'), `${JSON.stringify(info, null, 2)}\n`, 'utf8');
process.stdout.write(`packed ${pkg.name}@${pkg.version}\n  file: dist/${tarballs[0]}\n  size: ${info.bytes}\n  sha256: ${sha256}\n`);
for (const entry of readdirSync(dist).filter((name) => name.endsWith('.tgz'))) {
  process.stdout.write(`  tarball: ${entry}\n`);
}
