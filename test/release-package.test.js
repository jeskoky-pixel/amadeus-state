import assert from 'node:assert/strict';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { collectSourceManifest, readTarGz, sourceManifestHash } from '../scripts/verify-package.mjs';

const block = 512;

function octal(value, width) {
  return `${value.toString(8).padStart(width - 1, '0')}\0`;
}

function header(name, size) {
  const buffer = Buffer.alloc(block, 0);
  buffer.write(name, 0, 100, 'utf8');
  buffer.write(octal(0o644, 8), 100, 8, 'ascii');
  buffer.write(octal(0, 8), 108, 8, 'ascii');
  buffer.write(octal(0, 8), 116, 8, 'ascii');
  buffer.write(octal(size, 12), 124, 12, 'ascii');
  buffer.write(octal(0, 12), 136, 12, 'ascii');
  buffer.write('        ', 148, 8, 'ascii');
  buffer.write('0', 156, 1, 'ascii');
  buffer.write('ustar\0', 257, 6, 'ascii');
  buffer.write('00', 263, 2, 'ascii');
  let checksum = 0;
  for (const byte of buffer) checksum += byte;
  buffer.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return buffer;
}

function tarGz(files) {
  const chunks = [];
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content, 'utf8');
    chunks.push(header(name, data.length), data, Buffer.alloc((block - (data.length % block)) % block));
  }
  chunks.push(Buffer.alloc(block * 2));
  return gzipSync(Buffer.concat(chunks));
}

test('tarball reader extracts package paths and bytes without external tools', () => {
  const entries = readTarGz(
    tarGz({
      'package/README.md': '# release\n',
      'package/lib/client.js': 'window.__ModuleLoader__.load({});\n',
    }),
  );
  assert.deepEqual(entries.map((entry) => entry.path), ['package/README.md', 'package/lib/client.js']);
  assert.equal(entries[0].data.toString('utf8'), '# release\n');
  assert.equal(entries[1].data.toString('utf8'), 'window.__ModuleLoader__.load({});\n');
});

test('source manifest is deterministic and covers package files', () => {
  const root = process.cwd();
  const manifest = collectSourceManifest(root, ['README.md', 'package.json']);
  assert.deepEqual(Object.keys(manifest), ['README.md', 'package.json']);
  assert.match(manifest['README.md'], /^[0-9a-f]{64}$/);
  assert.equal(sourceManifestHash(root, ['README.md', 'package.json']), sourceManifestHash(root, ['package.json', 'README.md']));
});
