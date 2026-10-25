/**
 * The Config schema DSH exposes in the Plugin Manager and Settings service.
 *
 * Every public field is volatile, so a Settings write is committed into the
 * running plugin's stable references without remounting the Host plugin.  The
 * dedicated settings page and the Plugin Manager form therefore edit exactly
 * the same authority.  `databasePath` is an ordinary field read only at mount;
 * it is intentionally absent from the user-facing form.
 */

import { Schema } from './schema.js';
import { CONFIG_FIELDS } from './config-fields.js';

/**
 * Build one field schema from its public metadata.
 * @param {import('./config-fields.js').ConfigField} field - field metadata.
 * @returns {import('./schema.js').Node} schema node.
 */
function fieldSchema(field) {
  let schema;
  if (field.type === 'boolean') {
    schema = Schema.boolean();
  } else if (field.type === 'enum') {
    schema = Schema.union((field.enum ?? []).map((value) => Schema.const(value)));
  } else {
    schema = Schema.number();
    if (field.min !== undefined) schema.min(field.min);
    if (field.max !== undefined) schema.max(field.max);
    if (field.step !== undefined) schema.step(field.step);
  }
  schema.default(field.default);
  schema.description(`${field.zh.label} — ${field.zh.help}`);
  return schema.volatile();
}

const dict = Object.fromEntries(CONFIG_FIELDS.map((field) => [field.key, fieldSchema(field)]));

dict.databasePath = Schema.string()
  .default('')
  .description('可选 SQLite 路径；留空使用 DSH_HOME/amadeus-state/state.sqlite。修改后需要重启插件。');

export const Config = Schema.object(dict).default({});
