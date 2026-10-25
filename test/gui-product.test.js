import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_FIELDS } from '../src/config-fields.js';

const root = process.cwd();
const template = readFileSync(join(root, 'src', 'client', 'factory.template.js'), 'utf8');
const bundle = readFileSync(join(root, 'lib', 'client.js'), 'utf8');

function luminance(hex) {
  const channels = hex.match(/../g).map((part) => Number.parseInt(part, 16) / 255);
  const linear = channels.map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(a, b) {
  const left = luminance(a);
  const right = luminance(b);
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
}

test('selected tabs and primary buttons use an explicit theme-safe accessible accent', () => {
  assert.match(bundle, /--am-state-accent:#2f5bea/);
  assert.match(bundle, /--am-state-accent-strong:#2447c7/);
  assert.match(bundle, /--am-state-on-accent:#ffffff/);
  assert.ok(contrast('2f5bea', 'ffffff') >= 4.5, 'accent/on-accent contrast must meet WCAG AA');
  assert.ok(contrast('2447c7', 'ffffff') >= 4.5, 'hover accent/on-accent contrast must meet WCAG AA');

  const primary = bundle.match(/button\.primary\{([^}]*)\}/);
  assert.ok(primary, 'primary button rule must exist');
  assert.match(primary[1], /background:var\(--am-state-accent\)/);
  assert.match(primary[1], /color:var\(--am-state-on-accent\)/);
  assert.doesNotMatch(primary[1], /brand-primary/);

  const selected = bundle.match(/\.tabs button\[aria-selected=true\]\{([^}]*)\}/);
  assert.ok(selected, 'selected tab rule must exist');
  assert.match(selected[1], /background:var\(--am-state-accent\)/);
  assert.match(selected[1], /color:var\(--am-state-on-accent\)/);
  assert.doesNotMatch(selected[1], /brand-primary/);

  assert.match(bundle, /button:focus-visible[^}]*outline:3px solid var\(--am-state-accent\)/);
});

test('interest deletion notice is neutral until an actual delete', () => {
  assert.match(bundle, /interestDeleteHint/);
  assert.doesNotMatch(template, /h\('small', null, t\('interestDeleted'\)\)/);
  // The success-only message remains in the delete action.
  assert.match(template, /showMessage\(t\('interestDeleted'\)\)/);
});

test('plugin-manager detail card uses the same config form and basic fields', () => {
  assert.match(bundle, /plugins\.detail\.section/);
  assert.match(bundle, /configForms\.get\(NS\)/);
  assert.match(bundle, /form\.mutate\(ops, current\.revision\)/);
  assert.match(bundle, /amadeus-state-basic-config/);
  for (const key of ['stateEvolutionEnabled', 'influenceStrength', 'eventSensitivity', 'contextInjectionMode', 'autoInterestUpdate']) {
    assert.match(bundle, new RegExp(`"${key}"`));
  }
  assert.match(bundle, /detailRestart/);
  assert.match(bundle, /detailHealth/);
});

test('ordinary-user backup restore, guidance, responsive and focus affordances are present', () => {
  assert.match(bundle, /restoreBackupTitle/);
  assert.match(bundle, /restoreBackupBody/);
  assert.match(bundle, /confirmRestore/);
  assert.match(bundle, /confirm: 'RESTORE'/);
  assert.match(bundle, /api\('\/restore'/);
  assert.match(bundle, /restoreBackupHint/);
  assert.match(bundle, /@media \(max-width:640px\)/);
  assert.match(bundle, /focus-visible/);
  assert.match(bundle, /\.tableWrap\{overflow:auto/);
  assert.match(bundle, /field\.default/);
  assert.match(bundle, /field\.unit/);
  assert.match(bundle, /aria-label/);
  assert.match(bundle, /role: 'alert'/);
  assert.match(bundle, /disabled/);
});

test('Memory write is not a user-facing Config field and has no UI toggle', () => {
  assert.equal(CONFIG_FIELDS.some((field) => field.key === 'memoryWriteEnabled'), false);
  assert.equal(bundle.includes('memoryWriteEnabled'), false);
  assert.match(bundle, /memoryWriteUnavailable/);
  assert.match(bundle, /memoryWriteReason|scene-scoped contract|Scene 级契约/);
  assert.doesNotMatch(bundle, /向 Memory 写入状态摘要/);
});
