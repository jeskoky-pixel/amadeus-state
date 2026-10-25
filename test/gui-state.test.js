import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acceptedValues,
  buildSetOps,
  buildUnsetAllOps,
  clampFieldValue,
  clampPage,
  dirtyFields,
  draftConfig,
  draftFromSnapshot,
  hasRevisionConflict,
  isDirty,
  pageCount,
  previewText,
  setDraftValue,
  sourceLabel,
  trustLabel,
  validateAll,
  validateField,
} from '../src/client/logic.js';
import { CONFIG_FIELDS } from '../src/config-fields.js';

const initial = {
  status: 'ready',
  writable: true,
  revision: 4,
  value: {
    stateEvolutionEnabled: true,
    influenceStrength: 'standard',
    eventSensitivity: 1,
    autoRecovery: true,
    recoverySpeed: 1,
    modelAppraisalEnabled: false,
    contextInjectionMode: 'brief',
    autoInterestUpdate: true,
  },
};

const fields = CONFIG_FIELDS.filter((field) => Object.hasOwn(initial.value, field.key));

test('a draft starts clean and cancel restores accepted values', () => {
  const draft = draftFromSnapshot(initial);
  assert.equal(isDirty(draft, initial, fields), false);
  const changed = setDraftValue(draft, 'eventSensitivity', 2);
  assert.equal(isDirty(changed, initial, fields), true);
  const cancelled = draftFromSnapshot(initial);
  assert.deepEqual(cancelled.values, acceptedValues(initial));
  assert.equal(isDirty(cancelled, initial, fields), false);
});

test('a newer revision conflicts only when the local draft is dirty', () => {
  const draft = draftFromSnapshot(initial);
  const newer = { ...initial, revision: 5 };
  assert.equal(hasRevisionConflict(draft, newer, fields, true), false);
  const dirty = setDraftValue(draft, 'eventSensitivity', 2);
  assert.equal(hasRevisionConflict(dirty, newer, fields, true), true);
  assert.equal(hasRevisionConflict(dirty, newer, fields, false), false, 'initial loading is not a conflict');
  const loadingDraft = { ...dirty, status: 'loading' };
  assert.equal(hasRevisionConflict(loadingDraft, newer, fields, true), false);
});

test('save operations include only changed fields, in field order', () => {
  let draft = draftFromSnapshot(initial);
  draft = setDraftValue(draft, 'eventSensitivity', 1.5);
  draft = setDraftValue(draft, 'contextInjectionMode', 'state_interests');
  const ops = buildSetOps(draft, initial, fields);
  assert.deepEqual(
    ops.map((op) => op.path[0]),
    ['eventSensitivity', 'contextInjectionMode'],
  );
  assert.deepEqual(ops[0], { op: 'set', path: ['eventSensitivity'], value: 1.5 });
  assert.equal(ops.every((op) => op.op === 'set'), true);
});

test('restoring defaults unsets every public field and keeps databasePath out', () => {
  const ops = buildUnsetAllOps(fields);
  assert.equal(ops.length, fields.length);
  assert.equal(ops.every((op) => op.op === 'unset' && op.path.length === 1), true);
  assert.equal(ops.some((op) => op.path[0] === 'databasePath'), false);
});

test('field validation rejects wrong ranges and types', () => {
  const sensitivity = fields.find((field) => field.key === 'eventSensitivity');
  assert.equal(validateField(sensitivity, 1), null);
  assert.equal(validateField(sensitivity, 0), 'belowMin');
  assert.equal(validateField(sensitivity, 9), 'aboveMax');
  assert.equal(validateField(sensitivity, '1'), 'invalidNumber');
  const toggle = fields.find((field) => field.key === 'autoRecovery');
  assert.equal(validateField(toggle, 'true'), 'invalidBoolean');
  const errors = validateAll({ ...initial.value, eventSensitivity: 99 }, fields);
  assert.equal(errors.eventSensitivity, 'aboveMax');
});

test('range inputs clamp to metadata bounds', () => {
  const field = fields.find((item) => item.key === 'eventSensitivity');
  assert.equal(clampFieldValue(field, 99), 3);
  assert.equal(clampFieldValue(field, -1), 0.25);
  assert.equal(clampFieldValue(field, 'not a number'), 1);
});

test('draft config and preview text are read-only descriptions', () => {
  const draft = setDraftValue(draftFromSnapshot(initial), 'eventSensitivity', 2);
  const config = draftConfig(draft.values, fields);
  assert.equal(config.eventSensitivity, 2);
  assert.equal(config.databasePath, undefined);
  const text = previewText(
    {
      before: { mood: 0, energy: 60, curiosity: 55 },
      after: { mood: 4, energy: 57, curiosity: 60 },
    },
    'zh',
  );
  assert.match(text, /不会写入数据库/);
  assert.match(text, /4/);
});

test('audit pagination is clamped and never requests page zero', () => {
  assert.equal(pageCount(0, 20), 1);
  assert.equal(pageCount(41, 20), 3);
  assert.equal(clampPage(0, 41, 20), 1);
  assert.equal(clampPage(99, 41, 20), 3);
  assert.equal(clampPage(2, 0, 20), 1);
});

test('source and trust labels are bilingual and never leak raw objects', () => {
  assert.equal(sourceLabel('life', 'zh'), 'Life 活动');
  assert.equal(sourceLabel('memory', 'en'), 'Memory reference');
  assert.equal(trustLabel('bounded', 'zh'), '受限低信任');
  assert.equal(trustLabel('trusted', 'en'), 'Trusted source');
});
