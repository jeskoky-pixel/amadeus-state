/**
 * Offline release-artifact verifier.
 *
 * It checks that the generated tarball:
 * - matches PACKAGE_INFO's size/SHA-256 and actual file list,
 * - contains the current worktree bytes for every packaged file,
 * - includes the required release documents and client markers,
 * - has no database, backup, log, credential, node_modules, or dist payload.
 *
 * The small tar reader below handles the ustar/pax files npm produces without
 * adding a runtime dependency. It is also exported for focused tests.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { STATE_VERSION } from '../src/model.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist');

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function readCString(buffer, start, length) {
  let end = start;
  while (end < start + length && buffer[end] !== 0) end += 1;
  return buffer.toString('utf8', start, end);
}

/**
 * Read a gzipped tar into `{ path, type, data }` entries.
 * @param {string|Buffer} input - tarball path or gzip bytes.
 * @returns {{path: string, type: string, data: Buffer}[]} entries.
 */
export function readTarGz(input) {
  const compressed = typeof input === 'string' ? readFileSync(input) : input;
  const buffer = gunzipSync(compressed);
  const entries = [];
  let offset = 0;
  while (offset + 512 <= buffer.length) {
    const block = buffer.subarray(offset, offset + 512);
    if (block.every((value) => value === 0)) break;
    const name = readCString(block, 0, 100);
    const prefix = readCString(block, 345, 155);
    const path = (prefix ? `${prefix}/${name}` : name).replace(/^\.\/+/, '');
    const sizeText = readCString(block, 124, 12).trim();
    const size = Number.parseInt(sizeText || '0', 8);
    if (!Number.isInteger(size) || size < 0) throw new Error(`invalid tar size for ${path}`);
    const type = String.fromCharCode(block[156] || 48);
    const dataStart = offset + 512;
    const data = buffer.subarray(dataStart, dataStart + size);
    entries.push({ path, type, data });
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  return entries;
}

function fail(message) {
  throw new Error(`package verification failed: ${message}`);
}

/**
 * Verify the latest tarball and its metadata.
 * @param {{root?: string}} [options] - repository root override for tests.
 * @returns {Record<string, unknown>} verification summary.
 */
export function verifyPackage({ root: repositoryRoot = root } = {}) {
  const infoPath = join(repositoryRoot, 'dist', 'PACKAGE_INFO.json');
  if (!existsSync(infoPath)) fail('dist/PACKAGE_INFO.json is missing; run npm run package');
  const info = JSON.parse(readFileSync(infoPath, 'utf8'));
  if (typeof info.file !== 'string' || !info.file.startsWith('dist/')) fail('PACKAGE_INFO.file must be dist/<name>.tgz');
  const tarballPath = join(repositoryRoot, info.file);
  if (!existsSync(tarballPath)) fail(`tarball ${info.file} is missing`);
  const bytes = readFileSync(tarballPath);
  if (bytes.length !== info.bytes) fail(`tarball size ${bytes.length} != PACKAGE_INFO ${info.bytes}`);
  if (sha256(bytes) !== info.sha256) fail('tarball SHA-256 != PACKAGE_INFO');
  if (info.reproducible !== true) fail('PACKAGE_INFO.reproducible must be true');

  const entries = readTarGz(bytes).filter((entry) => entry.type === '0' || entry.type === '\0');
  const files = entries.map((entry) => entry.path);
  if (new Set(files).size !== files.length) fail('tarball contains duplicate paths');
  if (!Array.isArray(info.files)) fail('PACKAGE_INFO.files must be an array');
  const actualFiles = files.map((path) => path.replace(/^package\//, ''));
  const sortedActual = [...actualFiles].sort();
  const sortedRecorded = [...info.files].sort();
  if (JSON.stringify(sortedActual) !== JSON.stringify(sortedRecorded)) {
    fail('PACKAGE_INFO.files does not match the tarball file list');
  }

  const packageEntry = entries.find((entry) => entry.path === 'package/package.json');
  if (packageEntry === undefined) fail('package/package.json is missing');
  const packageJson = JSON.parse(packageEntry.data.toString('utf8'));
  if (packageJson.name !== '@fg-lab/amadeus-state') fail('package name is not @fg-lab/amadeus-state');
  if (packageJson.version !== info.version) fail('package version != PACKAGE_INFO.version');
  if (packageJson.version !== STATE_VERSION) fail(`package version ${packageJson.version} != STATE_VERSION ${STATE_VERSION}`);
  if (packageJson.type !== 'module') fail('package must be an ES module');
  if (packageJson.dsh?.bundle?.patch !== './cordis.patch.yml') fail('dsh.bundle.patch is missing');
  if (!Array.isArray(packageJson.dsh?.client?.inject)) fail('dsh.client.inject is missing');
  if (!packageJson.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-settings')) fail('client inject lacks settings module');
  if (!packageJson.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-plugin-manager')) fail('client inject lacks Plugin Manager module');

  const required = [
    'package/package.json',
    'package/src/index.js',
    'package/lib/client.js',
    'package/cordis.patch.yml',
    'package/README.md',
    'package/CHANGELOG.md',
    'package/icon.svg',
    'package/locale/zh.json',
    'package/locale/en.json',
    'package/docs/RELEASE_NOTES.md',
    'package/docs/COMPATIBILITY.md',
    'package/docs/UPGRADE.md',
    'package/docs/BUILD.md',
    'package/docs/PERFORMANCE.md',
    'package/docs/verification/STATE_V1_ACCEPTANCE_2026-10-25.md',
  ];
  for (const path of required) {
    if (!files.includes(path)) fail(`required package file missing: ${path}`);
  }

  for (const entry of entries) {
    const relativePath = entry.path.replace(/^package\//, '');
    if (relativePath === '') continue;
    if (/(^|\/)(node_modules|\.git|dist|coverage|backups)(\/|$)/.test(relativePath)) fail(`forbidden package path: ${relativePath}`);
    if (/\.(sqlite|sqlite-wal|sqlite-shm|log)$/i.test(relativePath)) fail(`forbidden runtime file: ${relativePath}`);
    if (/(^|\/)\.env(\.|$)/.test(relativePath)) fail(`forbidden environment file: ${relativePath}`);
    const currentPath = join(repositoryRoot, relativePath);
    if (!existsSync(currentPath) || !statSync(currentPath).isFile()) fail(`packaged file is not in the worktree: ${relativePath}`);
    const current = readFileSync(currentPath);
    if (sha256(current) !== sha256(entry.data)) fail(`packaged bytes differ from worktree: ${relativePath}`);
    if (/\.(?:js|mjs|json|md|ya?ml|txt)$/i.test(relativePath)) {
      const text = entry.data.toString('utf8');
      if (/[A-Za-z]:\\Users\\/i.test(text)) fail(`absolute Windows user path in ${relativePath}`);
      if (/\b(?:sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|Bearer\s+[A-Za-z0-9._-]{20,})\b/.test(text)) {
        fail(`credential-like text in ${relativePath}`);
      }
      if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) fail(`private key material in ${relativePath}`);
    }
  }

  const clientEntry = entries.find((entry) => entry.path === 'package/lib/client.js');
  if (clientEntry === undefined) fail('lib/client.js is missing');
  const client = clientEntry.data.toString('utf8');
  for (const marker of ['window.__ModuleLoader__.load', "id: '@fg-lab/amadeus-state'", 'settings.section', 'plugins.detail.section', 'configForms']) {
    if (!client.includes(marker)) fail(`client bundle missing marker: ${marker}`);
  }

  let buildInfo = null;
  const buildInfoPath = join(repositoryRoot, 'dist', 'BUILD_INFO.json');
  if (existsSync(buildInfoPath)) {
    buildInfo = JSON.parse(readFileSync(buildInfoPath, 'utf8'));
    if (buildInfo.package?.sha256 !== info.sha256) fail('BUILD_INFO package hash != PACKAGE_INFO');
    if (buildInfo.clientSha256 !== sha256(clientEntry.data)) fail('BUILD_INFO client hash != packaged client');
    if (buildInfo.sourceHash !== sourceManifestHash(repositoryRoot, packageJson.files)) fail('BUILD_INFO source hash != worktree');
    if (buildInfo.reproducible !== true) fail('BUILD_INFO.reproducible must be true');
  }

  return {
    package: packageJson.name,
    version: packageJson.version,
    file: info.file,
    bytes: info.bytes,
    sha256: info.sha256,
    files: actualFiles.length,
    buildInfo,
    sourceFiles: packageJson.files,
  };
}

/**
 * @param {string} repositoryRoot - repository root.
 * @param {string[]} packageFiles - package.json files entries.
 * @returns {string} aggregate source hash.
 */
export function sourceManifestHash(repositoryRoot, packageFiles) {
  const manifest = collectSourceManifest(repositoryRoot, packageFiles);
  return sha256(Buffer.from(JSON.stringify(manifest)));
}

/**
 * @param {string} repositoryRoot - repository root.
 * @param {string[]} packageFiles - package.json files entries.
 * @returns {Record<string,string>} sorted path -> sha256.
 */
export function collectSourceManifest(repositoryRoot, packageFiles) {
  const files = [];
  const visit = (path) => {
    const absolute = join(repositoryRoot, path);
    if (!existsSync(absolute)) fail(`package manifest path missing: ${path}`);
    const stat = statSync(absolute);
    if (stat.isDirectory()) {
      for (const name of [...readdirSync(absolute)].sort()) visit(`${path}/${name}`);
    } else if (stat.isFile()) {
      files.push(path.replace(/\\/g, '/'));
    }
  };
  for (const entry of packageFiles) visit(entry);
  files.sort();
  return Object.fromEntries(files.map((path) => [path, sha256(readFileSync(join(repositoryRoot, path)))]));
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const result = verifyPackage();
    process.stdout.write(
      `package verified: ${result.package}@${result.version}, ${result.files} files, ${result.bytes} bytes, sha256 ${result.sha256}\n`,
    );
  } catch (error) {
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    process.exitCode = 1;
  }
}
