/**
 * Build a deterministic, verifiable release tarball.
 *
 * The pack is performed twice into two isolated destinations and the SHA-256
 * values must match. The second copy is deleted after comparison. PACKAGE_INFO
 * records the actual tarball member list, while BUILD_INFO records the source
 * manifest and client bundle hash so a later verifier can detect stale bytes.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTarGz, collectSourceManifest, sourceManifestHash } from './verify-package.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist');
const releaseEpoch = String(Math.floor(Date.parse('2026-10-25T00:00:00Z') / 1000));
const env = {
  ...process.env,
  TZ: 'UTC',
  SOURCE_DATE_EPOCH: releaseEpoch,
  npm_config_cache: join(root, '.npm-cache'),
};
mkdirSync(dist, { recursive: true });

execFileSync(process.execPath, [join(root, 'scripts', 'build-client.mjs')], { cwd: root, stdio: 'inherit' });
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('npm_execpath is unavailable; run this script through `npm run package`');

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function pack(destination) {
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });
  execFileSync(process.execPath, [npmCli, 'pack', '--pack-destination', destination, '--json'], {
    cwd: root,
    stdio: 'inherit',
    env,
  });
  const files = readdirSync(destination).filter((name) => name.endsWith('.tgz'));
  if (files.length !== 1) throw new Error(`expected exactly one packed tarball in ${destination}, found ${files.length}`);
  return join(destination, files[0]);
}

// Remove the previous release tarball before packing, but keep BUILD_INFO only
// until the new build is complete.
for (const name of readdirSync(dist)) {
  if (name.endsWith('.tgz')) unlinkSync(join(dist, name));
}
const first = pack(dist);
const firstBytes = readFileSync(first);
const firstHash = sha256(firstBytes);

const reproDir = join(dist, '.repro');
try {
  const second = pack(reproDir);
  const secondHash = sha256(readFileSync(second));
  if (firstHash !== secondHash) {
    throw new Error(`package is not reproducible: first ${firstHash}, second ${secondHash}`);
  }
} finally {
  rmSync(reproDir, { recursive: true, force: true });
}

const tarballName = basename(first);
const entries = readTarGz(firstBytes).filter((entry) => entry.type === '0' || entry.type === '\0');
const packageFiles = entries.map((entry) => entry.path.replace(/^package\//, '')).sort();
const clientPath = join(root, 'lib', 'client.js');
const clientSha256 = sha256(readFileSync(clientPath));
const sourceManifest = collectSourceManifest(root, pkg.files);
const sourceHash = sourceManifestHash(root, pkg.files);
const info = {
  name: pkg.name,
  version: pkg.version,
  file: `dist/${tarballName}`,
  bytes: firstBytes.length,
  sha256: firstHash,
  reproducible: true,
  files: packageFiles,
  createdAt: new Date().toISOString(),
  sourceDateEpoch: releaseEpoch,
};
writeFileSync(join(dist, 'PACKAGE_INFO.json'), `${JSON.stringify(info, null, 2)}\n`, 'utf8');
const buildInfo = {
  schemaVersion: 1,
  package: { name: pkg.name, version: pkg.version, file: info.file, bytes: info.bytes, sha256: info.sha256 },
  releaseDate: '2026-10-25',
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  engines: pkg.engines,
  dsh: pkg.dsh,
  clientSha256,
  sourceHash,
  sourceFileCount: Object.keys(sourceManifest).length,
  sourceManifest,
  reproducible: true,
  sourceDateEpoch: releaseEpoch,
  generatedAt: new Date().toISOString(),
};
writeFileSync(join(dist, 'BUILD_INFO.json'), `${JSON.stringify(buildInfo, null, 2)}\n`, 'utf8');

// Fail the release if the tarball is stale, leaks a forbidden file, or lacks a
// required release document.
execFileSync(process.execPath, [join(root, 'scripts', 'verify-package.mjs')], { cwd: root, stdio: 'inherit' });

process.stdout.write(
  `packed ${pkg.name}@${pkg.version}\n  file: dist/${tarballName}\n  size: ${info.bytes}\n  sha256: ${info.sha256}\n  files: ${packageFiles.length}\n  reproducible: true\n`,
);
