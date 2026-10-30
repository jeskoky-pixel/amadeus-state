/**
 * Build the browser half as a DSH lazy-CJS module.
 *
 * The source template is deliberately readable; this script combines it with
 * the pure form logic, injects the shared field metadata, wraps it in the
 * official `window.__ModuleLoader__.load({id,factory})` format, and verifies
 * the generated bundle parses before writing lib/client.js.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { publicFieldMetadata } from '../src/config-fields.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const templatePath = join(root, 'src', 'client', 'factory.template.js');
const logicPath = join(root, 'src', 'client', 'logic.js');
const outputPath = join(root, 'lib', 'client.js');

const template = readFileSync(templatePath, 'utf8');
const logic = readFileSync(logicPath, 'utf8').replace(/^export\s+/gm, '');
const fields = JSON.stringify(publicFieldMetadata(), null, 2);

let body = template.replace('__STATE_FIELDS__', fields).replace('__CLIENT_LOGIC__', logic);
if (body.includes('__STATE_FIELDS__') || body.includes('__CLIENT_LOGIC__')) {
  throw new Error('client template placeholders were not fully replaced');
}
if (/^\s*(import|export)\s/m.test(body)) {
  throw new Error('client factory must not contain ESM import/export statements');
}

const bundle = `window.__ModuleLoader__.load({
  id: '@fg-lab/amadeus-state',
  factory: (require) => {
    const React = require('react');
    const h = React.createElement;
${body}
  }
});
`;

// Compile, do not execute: catches syntax errors and accidental top-level await.
new vm.Script(bundle, { filename: 'lib/client.js' });

for (const required of ['settings.section', 'configForms', 'amadeus-state', 'Amadeus 状态']) {
  if (!bundle.includes(required)) throw new Error(`client bundle is missing required marker: ${required}`);
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, bundle, 'utf8');
process.stdout.write(`built lib/client.js (${Buffer.byteLength(bundle)} bytes, ${publicFieldMetadata().length} fields)\n`);
