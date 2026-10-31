window.__ModuleLoader__.load({
  id: '@fg-lab/amadeus-state',
  factory: (require) => {
    const React = require('react');
    const h = React.createElement;
const FIELDS = [
  {
    "key": "stateEvolutionEnabled",
    "type": "boolean",
    "default": true,
    "restart": false,
    "group": "common",
    "zh": {
      "label": "启用状态演化",
      "help": "关闭后不再接受新的自动状态事件，但不会删除已有状态、兴趣或记录。"
    },
    "en": {
      "label": "Enable state evolution",
      "help": "When off, new automatic state events are refused; existing state, interests, and history are kept."
    }
  },
  {
    "key": "influenceStrength",
    "type": "enum",
    "default": "standard",
    "enum": [
      "off",
      "subtle",
      "standard",
      "strong"
    ],
    "restart": false,
    "group": "common",
    "zh": {
      "label": "状态对行为的影响强度",
      "help": "只改变动态上下文中的倾向措辞；不会覆盖 Persona、权限或 Life 的调度。"
    },
    "en": {
      "label": "Behavioural influence",
      "help": "Changes only the tendency wording in dynamic context; it never overrides Persona, permissions, or Life scheduling."
    }
  },
  {
    "key": "eventSensitivity",
    "type": "number",
    "default": 1,
    "min": 0.25,
    "max": 3,
    "step": 0.05,
    "restart": false,
    "group": "common",
    "zh": {
      "label": "状态变化敏感度",
      "help": "缩放普通事件造成的状态变化；1 为标准。仍受单事件上限与饱和限制。"
    },
    "en": {
      "label": "Event sensitivity",
      "help": "Scales ordinary event changes; 1 is standard. Per-event caps and saturation still apply."
    }
  },
  {
    "key": "autoRecovery",
    "type": "boolean",
    "default": true,
    "restart": false,
    "group": "common",
    "zh": {
      "label": "自动时间恢复",
      "help": "按真实经过时间向基准恢复；只在读取或事件时计算，不运行高频定时任务。"
    },
    "en": {
      "label": "Automatic recovery",
      "help": "Recovers toward baseline using real elapsed time; computed on reads or events, never by a high-frequency timer."
    }
  },
  {
    "key": "recoverySpeed",
    "type": "number",
    "default": 1,
    "min": 0.25,
    "max": 3,
    "step": 0.05,
    "restart": false,
    "group": "common",
    "zh": {
      "label": "恢复速度",
      "help": "缩放各状态半衰期；数值越大恢复越快。"
    },
    "en": {
      "label": "Recovery speed",
      "help": "Scales each state half-life; larger values recover faster."
    }
  },
  {
    "key": "modelAppraisalEnabled",
    "type": "boolean",
    "default": false,
    "restart": false,
    "group": "common",
    "zh": {
      "label": "模型事件评价",
      "help": "允许模型主动提交受限的低信任主观评价。不会每轮额外调用模型；关闭时 state_appraise 不改变状态。"
    },
    "en": {
      "label": "Model event appraisal",
      "help": "Allows a bounded low-trust appraisal, only when the model explicitly calls state_appraise. No extra model call is made per turn; when off, state_appraise changes nothing."
    }
  },
  {
    "key": "contextInjectionMode",
    "type": "enum",
    "default": "brief",
    "enum": [
      "off",
      "brief",
      "state_interests",
      "detailed"
    ],
    "restart": false,
    "group": "common",
    "zh": {
      "label": "动态上下文注入",
      "help": "关闭、简短状态、详细状态（含相关兴趣），或旧版的 state_interests。内容有字符上限，并只读取当前会话获授权的作用域。"
    },
    "en": {
      "label": "Dynamic context",
      "help": "Off, a brief state line, a detailed state plus relevant interests, or legacy state_interests. Content is length-capped and reads only the current Session's authorized scope."
    }
  },
  {
    "key": "autoInterestUpdate",
    "type": "boolean",
    "default": true,
    "restart": false,
    "group": "common",
    "zh": {
      "label": "兴趣自动更新",
      "help": "允许合法事件更新近期兴趣活跃度；人工设定的长期偏好不会被普通事件覆盖。"
    },
    "en": {
      "label": "Automatic interest updates",
      "help": "Lets legitimate events update recent activity; manual long-term preferences are not overwritten by ordinary events."
    }
  },
  {
    "key": "autoEventProcessingEnabled",
    "type": "boolean",
    "default": true,
    "restart": false,
    "group": "common",
    "zh": {
      "label": "回合完成后自动演化",
      "help": "只处理可信的已完成真实模型回合；仅有工具工作证据的回合产生很小的精力/好奇变化，普通寒暄保持零变化。不会额外调用模型。"
    },
    "en": {
      "label": "Automatic post-turn evolution",
      "help": "Processes only completed real model turns from trusted Host events. Turns with tool-work evidence produce a tiny energy/curiosity change; ordinary greetings stay unchanged. No extra model call is made."
    }
  },
  {
    "key": "sharedEventWeight",
    "type": "number",
    "default": 0.35,
    "min": 0.05,
    "max": 1,
    "step": 0.05,
    "restart": false,
    "group": "common",
    "zh": {
      "label": "单会话对共享主状态的最大影响",
      "help": "缩放工作区共享模式下单个会话事件的影响，防止高频群聊无限控制主状态；独立状态不受此限。"
    },
    "en": {
      "label": "Per-Session effect on shared state",
      "help": "Scales one Session's event effect on the Workspace main state so a busy group cannot dominate it. Isolated state is not scaled by this."
    }
  },
  {
    "key": "autoEventMinIntervalSeconds",
    "type": "number",
    "default": 180,
    "min": 0,
    "max": 3600,
    "step": 30,
    "unit": "seconds",
    "restart": false,
    "group": "advanced",
    "zh": {
      "label": "自动演化最小间隔",
      "help": "同一会话两次自动状态演化之间的最小秒数；0 表示不设间隔，仍受每小时上限约束。"
    },
    "en": {
      "label": "Minimum auto-evolution interval",
      "help": "Minimum seconds between two automatic evolutions from one Session; 0 disables the interval, while the hourly cap still applies."
    }
  },
  {
    "key": "autoEventMaxPerHour",
    "type": "number",
    "default": 12,
    "min": 0,
    "max": 120,
    "step": 1,
    "unit": "events",
    "restart": false,
    "group": "advanced",
    "zh": {
      "label": "自动演化每小时上限",
      "help": "每个状态作用域每小时最多接受的宿主自动事件数；0 表示完全停用自动回合演化。"
    },
    "en": {
      "label": "Hourly auto-evolution cap",
      "help": "Maximum Host automatic events per state scope per hour; 0 disables automatic post-turn evolution entirely."
    }
  },
  {
    "key": "moodBaseline",
    "type": "number",
    "default": 0,
    "min": -100,
    "max": 100,
    "step": 1,
    "restart": false,
    "group": "advanced",
    "zh": {
      "label": "心情基准",
      "help": "长期心情底色，范围 -100 至 +100。改动后当前心情会随时间缓慢靠拢。"
    },
    "en": {
      "label": "Mood baseline",
      "help": "Long-term mood setpoint, -100 to +100. Current mood drifts toward it over time."
    }
  },
  {
    "key": "energyBaseline",
    "type": "number",
    "default": 60,
    "min": 0,
    "max": 100,
    "step": 1,
    "restart": false,
    "group": "advanced",
    "zh": {
      "label": "精力基准",
      "help": "长期精力底色，范围 0 至 100。"
    },
    "en": {
      "label": "Energy baseline",
      "help": "Long-term energy setpoint, 0 to 100."
    }
  },
  {
    "key": "curiosityBaseline",
    "type": "number",
    "default": 55,
    "min": 0,
    "max": 100,
    "step": 1,
    "restart": false,
    "group": "advanced",
    "zh": {
      "label": "好奇心基准",
      "help": "长期好奇心底色，范围 0 至 100。"
    },
    "en": {
      "label": "Curiosity baseline",
      "help": "Long-term curiosity setpoint, 0 to 100."
    }
  },
  {
    "key": "moodHalfLifeMinutes",
    "type": "number",
    "default": 240,
    "min": 15,
    "max": 10080,
    "step": 15,
    "unit": "minutes",
    "restart": false,
    "group": "advanced",
    "zh": {
      "label": "心情半衰期",
      "help": "心情向基准恢复一半所需时间，单位分钟。"
    },
    "en": {
      "label": "Mood half-life",
      "help": "Minutes for mood to recover halfway toward its baseline."
    }
  },
  {
    "key": "energyHalfLifeMinutes",
    "type": "number",
    "default": 720,
    "min": 15,
    "max": 10080,
    "step": 15,
    "unit": "minutes",
    "restart": false,
    "group": "advanced",
    "zh": {
      "label": "精力半衰期",
      "help": "精力向基准恢复一半所需时间，单位分钟。"
    },
    "en": {
      "label": "Energy half-life",
      "help": "Minutes for energy to recover halfway toward its baseline."
    }
  },
  {
    "key": "curiosityHalfLifeMinutes",
    "type": "number",
    "default": 360,
    "min": 15,
    "max": 10080,
    "step": 15,
    "unit": "minutes",
    "restart": false,
    "group": "advanced",
    "zh": {
      "label": "好奇心半衰期",
      "help": "好奇心向基准恢复一半所需时间，单位分钟。"
    },
    "en": {
      "label": "Curiosity half-life",
      "help": "Minutes for curiosity to recover halfway toward its baseline."
    }
  },
  {
    "key": "maxEventDeltaMood",
    "type": "number",
    "default": 12,
    "min": 1,
    "max": 50,
    "step": 1,
    "restart": false,
    "group": "advanced",
    "zh": {
      "label": "单事件心情最大变化",
      "help": "单个事件对心情的最大原始增量；饱和后实际变化更小。"
    },
    "en": {
      "label": "Max mood change per event",
      "help": "Maximum raw mood delta from one event; saturation makes the actual change smaller."
    }
  },
  {
    "key": "maxEventDeltaEnergy",
    "type": "number",
    "default": 10,
    "min": 1,
    "max": 50,
    "step": 1,
    "restart": false,
    "group": "advanced",
    "zh": {
      "label": "单事件精力最大变化",
      "help": "单个事件对精力的最大原始增量。"
    },
    "en": {
      "label": "Max energy change per event",
      "help": "Maximum raw energy delta from one event."
    }
  },
  {
    "key": "maxEventDeltaCuriosity",
    "type": "number",
    "default": 14,
    "min": 1,
    "max": 50,
    "step": 1,
    "restart": false,
    "group": "advanced",
    "zh": {
      "label": "单事件好奇心最大变化",
      "help": "单个事件对好奇心的最大原始增量。"
    },
    "en": {
      "label": "Max curiosity change per event",
      "help": "Maximum raw curiosity delta from one event."
    }
  },
  {
    "key": "duplicateCooldownMinutes",
    "type": "number",
    "default": 30,
    "min": 0,
    "max": 1440,
    "step": 1,
    "unit": "minutes",
    "restart": false,
    "group": "advanced",
    "zh": {
      "label": "模型评价冷却窗口",
      "help": "无引用模型评价的速率窗口，单位分钟；0 时仍使用最小 1 分钟窗口。可信 Life/Memory 引用只按引用幂等。"
    },
    "en": {
      "label": "Model appraisal cooldown",
      "help": "Rate window in minutes for unreferenced model appraisals; 0 still uses a one-minute floor. Trusted Life/Memory references are idempotent by reference."
    }
  },
  {
    "key": "interestActivityHalfLifeMinutes",
    "type": "number",
    "default": 4320,
    "min": 60,
    "max": 43200,
    "step": 60,
    "unit": "minutes",
    "restart": false,
    "group": "advanced",
    "zh": {
      "label": "兴趣活跃度半衰期",
      "help": "近期兴趣活跃度衰减一半所需时间，单位分钟。长期偏好不受此影响。"
    },
    "en": {
      "label": "Interest activity half-life",
      "help": "Minutes for recent interest activity to halve. Long-term preference is unaffected."
    }
  },
  {
    "key": "maxInterests",
    "type": "number",
    "default": 30,
    "min": 1,
    "max": 200,
    "step": 1,
    "restart": false,
    "group": "advanced",
    "zh": {
      "label": "最大兴趣条目数",
      "help": "每个状态场景最多保留的兴趣数量；人工条目优先保留。"
    },
    "en": {
      "label": "Maximum interests",
      "help": "Maximum interests per state scene; manual entries are retained first."
    }
  },
  {
    "key": "contextMaxChars",
    "type": "number",
    "default": 420,
    "min": 80,
    "max": 1200,
    "step": 20,
    "unit": "characters",
    "restart": false,
    "group": "advanced",
    "zh": {
      "label": "动态上下文长度上限",
      "help": "注入文本的最大字符数，用于控制 Token 与前缀缓存影响。"
    },
    "en": {
      "label": "Context character cap",
      "help": "Maximum injected characters, bounding token cost and prefix-cache impact."
    }
  },
  {
    "key": "auditRetentionDays",
    "type": "number",
    "default": 90,
    "min": 1,
    "max": 3650,
    "step": 1,
    "unit": "days",
    "restart": false,
    "group": "advanced",
    "zh": {
      "label": "变化记录保留天数",
      "help": "超过期限的普通审计记录会被清理；人工重置记录保留。"
    },
    "en": {
      "label": "Audit retention",
      "help": "Ordinary audit rows older than this are pruned; manual reset rows are kept."
    }
  },
  {
    "key": "auditPageSize",
    "type": "number",
    "default": 20,
    "min": 5,
    "max": 100,
    "step": 5,
    "restart": false,
    "group": "advanced",
    "zh": {
      "label": "变化记录每页条数",
      "help": "设置页变化记录的默认分页大小。"
    },
    "en": {
      "label": "Audit page size",
      "help": "Default page size for the change-history table."
    }
  },
  {
    "key": "lifeIntegrationEnabled",
    "type": "boolean",
    "default": true,
    "restart": false,
    "group": "advanced",
    "zh": {
      "label": "Life 联动",
      "help": "通过 Life 的公开 Host 服务校验会话身份和已完成活动；Life 不存在时自动降级。"
    },
    "en": {
      "label": "Life integration",
      "help": "Uses Life's public Host service to verify Session identity and completed activities; degrades when Life is absent."
    }
  },
  {
    "key": "memoryIntegrationEnabled",
    "type": "boolean",
    "default": false,
    "restart": false,
    "group": "advanced",
    "zh": {
      "label": "Memory 引用联动",
      "help": "允许通过 Memory 原生工具验证一个记忆引用；重复读取同一记忆不会重复影响状态。默认关闭。"
    },
    "en": {
      "label": "Memory reference integration",
      "help": "Verifies a memory reference through native Memory tools; repeated reads of the same memory never add effect again. Default off."
    }
  }
];
const DETAIL_FIELD_KEYS = [
  'stateEvolutionEnabled',
  'influenceStrength',
  'eventSensitivity',
  'contextInjectionMode',
  'autoInterestUpdate',
];
const DETAIL_FIELDS = FIELDS.filter((field) => DETAIL_FIELD_KEYS.includes(field.key));
/**
 * Pure browser-side form logic, shared by the built lazy-CJS bundle and tests.
 *
 * No React and no Host import lives here, so the staged-draft, dirty, cancel,
 * conflict, reset, and preview transitions can be tested without a browser.
 */

/**
 * @param {Record<string, any>|undefined} snapshot - config form snapshot.
 * @returns {Record<string, any>} accepted effective values.
 */
function acceptedValues(snapshot) {
  return snapshot && snapshot.value && typeof snapshot.value === 'object' ? snapshot.value : {};
}

/**
 * @param {Record<string, any>|undefined} snapshot - config form snapshot.
 * @returns {Record<string, any>} initial draft.
 */
function draftFromSnapshot(snapshot) {
  return {
    values: { ...acceptedValues(snapshot) },
    revision: snapshot?.revision,
    writable: snapshot?.writable === true,
    status: snapshot?.status ?? 'loading',
  };
}

/**
 * @param {Record<string, any>} draft - staged draft.
 * @param {number|undefined} revision - accepted revision.
 * @returns {Record<string, any>} next draft.
 */
function rebaseDraft(draft, revision) {
  return { ...draft, revision };
}

/**
 * @param {Record<string, any>} values - current values.
 * @param {Record<string, any>} accepted - accepted values.
 * @param {Array<Record<string, any>>} fields - field metadata.
 * @returns {string[]} dirty field keys.
 */
function dirtyFields(values, accepted, fields) {
  const dirty = [];
  for (const field of fields) {
    if (values[field.key] !== accepted[field.key]) dirty.push(field.key);
  }
  return dirty;
}

/**
 * @param {Record<string, any>} draft - draft.
 * @param {Record<string, any>} snapshot - accepted form snapshot.
 * @param {Array<Record<string, any>>} fields - metadata.
 * @returns {boolean} whether the draft differs from accepted values.
 */
function isDirty(draft, snapshot, fields) {
  return dirtyFields(draft.values, acceptedValues(snapshot), fields).length > 0;
}

/**
 * Whether a newer accepted revision conflicts with a dirty local draft.
 * @param {Record<string, any>|null} previousDraft - draft before the update.
 * @param {Record<string, any>} nextSnapshot - newly accepted snapshot.
 * @param {Array<Record<string, any>>} fields - metadata.
 * @param {boolean} initialized - whether a ready form has been observed.
 * @returns {boolean} true when the draft must not silently overwrite new data.
 */
function hasRevisionConflict(previousDraft, nextSnapshot, fields, initialized) {
  return Boolean(
    initialized &&
      previousDraft &&
      previousDraft.status === 'ready' &&
      nextSnapshot?.status === 'ready' &&
      nextSnapshot.revision !== previousDraft.revision &&
      isDirty(previousDraft, nextSnapshot, fields),
  );
}

/**
 * Build the ordered set operations for a save.
 * @param {Record<string, any>} draft - draft.
 * @param {Record<string, any>} snapshot - accepted snapshot.
 * @param {Array<Record<string, any>>} fields - metadata.
 * @returns {Array<{op: 'set', path: string[], value: unknown}>} operations.
 */
function buildSetOps(draft, snapshot, fields) {
  const accepted = acceptedValues(snapshot);
  return dirtyFields(draft.values, accepted, fields).map((key) => ({
    op: 'set',
    path: [key],
    value: draft.values[key],
  }));
}

/**
 * Build unset operations for restoring inherited defaults.
 * @param {Array<Record<string, any>>} fields - metadata.
 * @returns {Array<{op: 'unset', path: string[]}>} operations.
 */
function buildUnsetAllOps(fields) {
  return fields.map((field) => ({ op: 'unset', path: [field.key] }));
}

/**
 * Set one draft value without mutating the previous object.
 * @param {Record<string, any>} draft - draft.
 * @param {string} key - field.
 * @param {unknown} value - value.
 * @returns {Record<string, any>} next draft.
 */
function setDraftValue(draft, key, value) {
  return { ...draft, values: { ...draft.values, [key]: value } };
}

/**
 * Validate one draft field with the metadata ranges.
 * @param {Record<string, any>} field - metadata.
 * @param {unknown} value - value.
 * @returns {string|null} error key or null.
 */
function validateField(field, value) {
  if (field.type === 'boolean') return typeof value === 'boolean' ? null : 'invalidBoolean';
  if (field.type === 'enum') return field.enum.includes(value) ? null : 'invalidChoice';
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'invalidNumber';
  if (field.min !== undefined && value < field.min) return 'belowMin';
  if (field.max !== undefined && value > field.max) return 'aboveMax';
  return null;
}

/**
 * Validate every draft field.
 * @param {Record<string, any>} values - values.
 * @param {Array<Record<string, any>>} fields - metadata.
 * @returns {Record<string, string>} key -> error key.
 */
function validateAll(values, fields) {
  const errors = {};
  for (const field of fields) {
    const error = validateField(field, values[field.key]);
    if (error) errors[field.key] = error;
  }
  return errors;
}

/**
 * Coerce and clamp a number input from a range control.
 * @param {Record<string, any>} field - metadata.
 * @param {unknown} input - input.
 * @returns {number} clamped number.
 */
function clampFieldValue(field, input) {
  const value = Number(input);
  if (!Number.isFinite(value)) return Number(field.default);
  const min = field.min ?? Number.NEGATIVE_INFINITY;
  const max = field.max ?? Number.POSITIVE_INFINITY;
  return Math.min(max, Math.max(min, value));
}

/**
 * Full plain config for a read-only preview request.
 * @param {Record<string, any>} values - draft values.
 * @param {Array<Record<string, any>>} fields - metadata.
 * @returns {Record<string, unknown>} config.
 */
function draftConfig(values, fields) {
  const output = {};
  for (const field of fields) output[field.key] = values[field.key];
  return output;
}

/**
 * @param {number} total - total rows.
 * @param {number} pageSize - page size.
 * @returns {number} page count, at least 1.
 */
function pageCount(total, pageSize) {
  return Math.max(1, Math.ceil(Number(total) / Math.max(1, Number(pageSize))));
}

/**
 * @param {number} page - requested page.
 * @param {number} total - rows.
 * @param {number} pageSize - size.
 * @returns {number} clamped page.
 */
function clampPage(page, total, pageSize) {
  return Math.min(pageCount(total, pageSize), Math.max(1, Math.floor(Number(page) || 1)));
}

/**
 * @param {number} value - number.
 * @returns {string} signed one-decimal display.
 */
function signed(value) {
  const n = Math.round(Number(value) * 10) / 10;
  return n > 0 ? `+${n}` : String(n);
}

/**
 * @param {Record<string, unknown>} deltas - state deltas.
 * @returns {string} compact delta text.
 */
function deltaText(deltas, lang = 'zh') {
  if (!deltas || typeof deltas !== 'object') return '—';
  const labels = lang === 'en'
    ? { mood: 'Mood', energy: 'Energy', curiosity: 'Curiosity', none: 'No material change' }
    : { mood: '心情', energy: '精力', curiosity: '好奇', none: '无明显变化' };
  return ['mood', 'energy', 'curiosity']
    .filter((key) => Number(deltas[key]) !== 0)
    .map((key) => `${labels[key]} ${signed(deltas[key])}`)
    .join(' / ') || labels.none;
}

/**
 * Human source label.
 * @param {string} source - source.
 * @param {'zh'|'en'} lang - language.
 * @returns {string} label.
 */
function sourceLabel(source, lang) {
  const zh = {
    model_appraisal: '模型评价',
    life: 'Life 活动',
    memory: 'Memory 引用',
    admin: '管理员',
    host: '宿主',
    manual: '人工',
  };
  const en = {
    model_appraisal: 'Model appraisal',
    life: 'Life activity',
    memory: 'Memory reference',
    admin: 'Administrator',
    host: 'Host',
    manual: 'Manual',
  };
  return (lang === 'en' ? en : zh)[source] ?? String(source);
}

/**
 * Human trust label.
 * @param {string} trust - trust.
 * @param {'zh'|'en'} lang - language.
 * @returns {string} label.
 */
function trustLabel(trust, lang) {
  const zh = { trusted: '可信来源', bounded: '受限低信任', admin: '管理员确认', untrusted: '不可信' };
  const en = { trusted: 'Trusted source', bounded: 'Bounded, low trust', admin: 'Admin confirmed', untrusted: 'Untrusted' };
  return (lang === 'en' ? en : zh)[trust] ?? String(trust);
}

/**
 * A stable preview explanation from a Host preview response.
 * @param {Record<string, any>} preview - preview response.
 * @param {'zh'|'en'} lang - language.
 * @returns {string} text.
 */
function previewText(preview, lang) {
  if (!preview) return '';
  const before = preview.before ?? {};
  const after = preview.after ?? {};
  if (lang === 'en') {
    return `Predicted after one event: Mood ${signed(before.mood)} → ${signed(after.mood)}, Energy ${before.energy} → ${after.energy}, Curiosity ${before.curiosity} → ${after.curiosity}. This preview does not write the database.`;
  }
  return `单个事件后的预计变化：心情 ${signed(before.mood)} → ${signed(after.mood)}，精力 ${before.energy} → ${after.energy}，好奇 ${before.curiosity} → ${after.curiosity}。预览不会写入数据库。`;
}


const NS = 'amadeus-state';
const API_ROOT = '/api/amadeus-state';
const EVENT_TYPES = [
  'meaningful_interaction',
  'exploration_completed',
  'knowledge_gained',
  'difficulty',
  'life_completed',
  'life_failed',
  'memory_reference',
];

const CSS = `
[data-amadeus-state]{--am-state-accent:#2f5bea;--am-state-accent-strong:#2447c7;--am-state-on-accent:#ffffff;box-sizing:border-box;max-width:100%;min-width:0;color:var(--dsw-alias-label-primary,#1f2329);font-size:13px;line-height:1.65;padding:0 0 24px;container-type:inline-size;container-name:amadeus-state-console}
[data-amadeus-state] *{box-sizing:border-box}
[data-amadeus-state] h2{margin:0;font-size:22px;line-height:1.3;font-weight:600;letter-spacing:-.2px}
[data-amadeus-state] h3{margin:0 0 8px;font-size:15px;line-height:1.4;font-weight:600}
[data-amadeus-state] p{margin:8px 0}
[data-amadeus-state] small{display:block;opacity:.72;font-size:12px;line-height:1.55}
[data-amadeus-state] button{font:inherit;border:1px solid var(--dsw-alias-border-secondary,#8c8c8c55);border-radius:9px;padding:7px 12px;background:var(--dsw-alias-bg-layer-2,#8c8c8c18);color:inherit;cursor:pointer;max-width:100%}
[data-amadeus-state] button:hover:not(:disabled){border-color:var(--dsw-alias-border-primary,#8c8c8c99)}
[data-amadeus-state] button:focus-visible,[data-amadeus-state] input:focus-visible,[data-amadeus-state] select:focus-visible,[data-amadeus-state] summary:focus-visible{outline:3px solid var(--am-state-accent);outline-offset:2px}
[data-amadeus-state] button:disabled{opacity:.45;cursor:not-allowed}
[data-amadeus-state] button.primary{background:var(--am-state-accent);border-color:var(--am-state-accent);color:var(--am-state-on-accent)}
[data-amadeus-state] button.primary:hover:not(:disabled){background:var(--am-state-accent-strong);border-color:var(--am-state-accent-strong);color:var(--am-state-on-accent)}
[data-amadeus-state] button.danger{border-color:#d9534f99;color:#c9302c}
[data-amadeus-state] button.ghost{background:transparent}
[data-amadeus-state] .topbar{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;margin-bottom:10px}
[data-amadeus-state] .topbar .sub{opacity:.72;margin-top:2px}
[data-amadeus-state] .chips,[data-amadeus-state] .actions,[data-amadeus-state] .tabs{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
[data-amadeus-state] .chips{margin:8px 0 14px}
[data-amadeus-state] .chip{display:inline-flex;gap:5px;align-items:center;padding:3px 8px;border-radius:999px;background:var(--dsw-alias-bg-layer-2,#8c8c8c20);font-size:12px;max-width:100%;overflow-wrap:anywhere}
[data-amadeus-state] .chip.ok{background:#2e9e5b22;color:inherit}
[data-amadeus-state] .chip.warn{background:#d99a2b26}
[data-amadeus-state] .chip.bad{background:#d9534f26}
[data-amadeus-state] .tabs{padding-bottom:10px;border-bottom:1px solid var(--dsw-alias-border-secondary,#8c8c8c33);margin-bottom:16px}
[data-amadeus-state] .tabs button{border-radius:999px;padding:5px 12px}
[data-amadeus-state] .tabs button[aria-selected=true]{background:var(--am-state-accent);border-color:var(--am-state-accent);color:var(--am-state-on-accent)}
[data-amadeus-state] .tabs button[aria-selected=true]:hover:not(:disabled){background:var(--am-state-accent-strong);border-color:var(--am-state-accent-strong);color:var(--am-state-on-accent)}
[data-amadeus-state] .shell{display:grid;grid-template-columns:208px minmax(0,1fr);gap:22px;align-items:start}
[data-amadeus-state] .side{position:sticky;top:12px;border:1px solid var(--dsw-alias-border-secondary,#8c8c8c33);border-radius:16px;padding:16px 12px;background:var(--dsw-alias-bg-layer-1,#ffffff08)}
[data-amadeus-state] .brand{display:flex;gap:10px;align-items:center;padding:0 4px 14px;border-bottom:1px solid var(--dsw-alias-border-secondary,#8c8c8c28);margin-bottom:14px}
[data-amadeus-state] .brandMark{display:grid;place-items:center;width:34px;height:34px;border-radius:11px;background:linear-gradient(145deg,#dbe7ff,#eef3ff);color:var(--am-state-accent);font-weight:700}
[data-amadeus-state] .brand strong{display:block;line-height:1.25}
[data-amadeus-state] .brand small{padding-top:2px}
[data-amadeus-state] .sideTag{display:inline-flex;margin:0 4px 12px;padding:3px 8px;border-radius:999px;background:#2f5bea12;color:var(--am-state-accent);font-size:11px;font-weight:600}
[data-amadeus-state] .sideLabel{padding:10px 8px 5px;font-size:10px;letter-spacing:.12em;text-transform:uppercase;opacity:.5}
[data-amadeus-state] .navList{display:flex;flex-direction:column;gap:2px}
[data-amadeus-state] .navButton{display:flex;gap:9px;align-items:center;text-align:left;border:0;background:transparent;padding:9px 10px;border-radius:10px;color:inherit;font-weight:500}
[data-amadeus-state] .navButton .navIcon{width:18px;text-align:center;opacity:.65;font-size:13px}
[data-amadeus-state] .navButton[aria-selected=true]{background:#2f5bea12;color:var(--am-state-accent);font-weight:600}
[data-amadeus-state] .navButton[aria-selected=true] .navIcon{opacity:1}
[data-amadeus-state] .navButton:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2,#8c8c8c14)}
[data-amadeus-state] .contentArea{min-width:0}
[data-amadeus-state] .pageHead{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap;margin:0 0 4px}
[data-amadeus-state] .pageHead h2{font-size:28px;letter-spacing:-.5px}
[data-amadeus-state] .eyebrow{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--am-state-accent);font-weight:700;margin-bottom:4px}
[data-amadeus-state] .workspaceBanner{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;border:1px solid var(--dsw-alias-border-secondary,#8c8c8c33);border-radius:14px;padding:13px 15px;margin:12px 0;background:var(--dsw-alias-bg-layer-1,#ffffff08)}
[data-amadeus-state] .workspaceBanner strong{display:block}
[data-amadeus-state] .modeGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:10px 0}
[data-amadeus-state] .modeCard{border:1px solid var(--dsw-alias-border-secondary,#8c8c8c38);border-radius:11px;padding:10px 11px;background:var(--dsw-alias-bg-layer-1,#ffffff06)}
[data-amadeus-state] .modeCard.active{border-color:var(--am-state-accent);background:#2f5bea0d}
[data-amadeus-state] .modeCard strong{display:block;margin-bottom:2px}
[data-amadeus-state] .sessionRow{display:grid;grid-template-columns:minmax(0,1fr) 150px auto;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid var(--dsw-alias-border-secondary,#8c8c8c24)}
[data-amadeus-state] .sessionRow:last-child{border-bottom:0}
[data-amadeus-state] .mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px;overflow-wrap:anywhere}
[data-amadeus-state] .hintCard{border:1px dashed var(--dsw-alias-border-secondary,#8c8c8c55);border-radius:11px;padding:10px 12px;background:#d99a2b0d;margin:10px 0}
[data-amadeus-state] .dataTable{min-width:460px}
@media (max-width:900px){[data-amadeus-state] .shell{grid-template-columns:1fr}[data-amadeus-state] .side{position:static}[data-amadeus-state] .navList{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr))}[data-amadeus-state] .sideLabel,.dataTable{display:none}}
@container amadeus-state-console (max-width:820px){
  [data-amadeus-state] .shell{grid-template-columns:1fr;gap:14px}
  [data-amadeus-state] .side{position:static}
  [data-amadeus-state] .navList{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:4px}
  [data-amadeus-state] .sideLabel{display:none}
  [data-amadeus-state] .brand{padding-bottom:10px;margin-bottom:10px}
  [data-amadeus-state] .sessionRow{grid-template-columns:minmax(0,1fr) 150px;align-items:start}
  [data-amadeus-state] .sessionRow>.actions{grid-column:1 / -1;justify-content:flex-end}
}
@container amadeus-state-console (max-width:640px){
  [data-amadeus-state] .field{grid-template-columns:1fr;gap:5px}
  [data-amadeus-state] .interestRow{grid-template-columns:1fr 1fr;gap:6px}
  [data-amadeus-state] .interestRow .interestActions{grid-column:1 / -1}
  [data-amadeus-state] .topbar{align-items:stretch}
  [data-amadeus-state] .modeGrid{grid-template-columns:1fr}
  [data-amadeus-state] .sessionRow{grid-template-columns:1fr}
  [data-amadeus-state] .sessionRow>.actions{grid-column:auto}
  [data-amadeus-state] .pageHead h2{font-size:24px}
}
@media (max-width:640px){
  [data-amadeus-state] .field{grid-template-columns:1fr;gap:5px}
  [data-amadeus-state] .interestRow{grid-template-columns:1fr 1fr;gap:6px}
  [data-amadeus-state] .interestRow .interestActions{grid-column:1 / -1}
  [data-amadeus-state] .topbar{align-items:stretch}
  [data-amadeus-state] .modeGrid{grid-template-columns:1fr}
  [data-amadeus-state] .sessionRow{grid-template-columns:1fr}
}
[data-amadeus-state] .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:10px 0 16px}
[data-amadeus-state] .card{border:1px solid var(--dsw-alias-border-secondary,#8c8c8c40);border-radius:12px;padding:13px;background:var(--dsw-alias-bg-layer-1,#ffffff08);min-width:0}
[data-amadeus-state] .card .value{font-size:26px;font-weight:600;line-height:1.2;margin:2px 0}
[data-amadeus-state] .card .base{opacity:.75;font-size:12px}
[data-amadeus-state] .bar{height:8px;border-radius:999px;background:var(--dsw-alias-bg-layer-3,#8c8c8c2e);margin:8px 0 4px;overflow:hidden}
[data-amadeus-state] .bar span{display:block;height:100%;border-radius:999px;background:var(--am-state-accent)}
[data-amadeus-state] .panel{border:1px solid var(--dsw-alias-border-secondary,#8c8c8c40);border-radius:12px;padding:14px;margin:0 0 12px;min-width:0}
[data-amadeus-state] .field{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(150px,.8fr);gap:14px;align-items:start;padding:11px 0;border-bottom:1px solid var(--dsw-alias-border-secondary,#8c8c8c24)}
[data-amadeus-state] .field:last-child{border-bottom:0}
[data-amadeus-state] .field .label{font-weight:500;overflow-wrap:anywhere}
[data-amadeus-state] .field .control{min-width:0;display:flex;flex-direction:column;gap:6px}
[data-amadeus-state] input[type=number],[data-amadeus-state] input[type=text],[data-amadeus-state] select,[data-amadeus-state] textarea{font:inherit;width:100%;min-width:0;padding:7px 9px;border:1px solid var(--dsw-alias-border-secondary,#8c8c8c66);border-radius:8px;background:var(--dsw-alias-bg-layer-2,#8c8c8c14);color:inherit}
[data-amadeus-state] input[type=range]{width:100%;accent-color:var(--am-state-accent)}
[data-amadeus-state] textarea{resize:vertical;min-height:64px}
[data-amadeus-state] .inline{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
[data-amadeus-state] .inline input[type=range]{flex:1 1 130px;min-width:90px}
[data-amadeus-state] .inline input[type=number]{width:90px;flex:0 0 90px}
[data-amadeus-state] .switch{display:flex;gap:9px;align-items:flex-start;cursor:pointer}
[data-amadeus-state] .switch input{margin-top:3px;width:18px;height:18px;accent-color:var(--am-state-accent)}
[data-amadeus-state] .message{padding:10px 12px;border-radius:9px;background:var(--dsw-alias-bg-layer-2,#8c8c8c22);overflow-wrap:anywhere;margin:10px 0}
[data-amadeus-state] .message.error{background:#d9534f20;color:inherit;border:1px solid #d9534f66}
[data-amadeus-state] .message.success{background:#2e9e5b20;border:1px solid #2e9e5b66}
[data-amadeus-state] .tableWrap{overflow:auto;max-width:100%;border:1px solid var(--dsw-alias-border-secondary,#8c8c8c33);border-radius:10px}
[data-amadeus-state] table{border-collapse:collapse;width:100%;min-width:560px;font-size:12px}
[data-amadeus-state] th,[data-amadeus-state] td{padding:8px 9px;text-align:left;vertical-align:top;border-bottom:1px solid var(--dsw-alias-border-secondary,#8c8c8c26);overflow-wrap:anywhere}
[data-amadeus-state] th{font-weight:600;opacity:.8;white-space:nowrap}
[data-amadeus-state] tr:last-child td{border-bottom:0}
[data-amadeus-state] details summary{cursor:pointer;font-weight:500}
[data-amadeus-state] .interestRow{display:grid;grid-template-columns:minmax(120px,1fr) minmax(120px,1fr) minmax(120px,1fr) auto;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid var(--dsw-alias-border-secondary,#8c8c8c24);overflow-wrap:anywhere}
[data-amadeus-state] .interestRow:last-child{border-bottom:0}
[data-amadeus-state] .errorText{color:#c9302c;font-size:12px;overflow-wrap:anywhere}
[data-amadeus-state] .overlay{position:fixed;inset:0;background:#0008;display:flex;align-items:center;justify-content:center;padding:18px;z-index:10000}
[data-amadeus-state] .dialog{width:min(460px,100%);max-height:85vh;overflow:auto;background:var(--dsw-alias-bg-overlay,#fff);color:var(--dsw-alias-label-primary,#1f2329);border:1px solid var(--dsw-alias-border-secondary,#8c8c8c55);border-radius:14px;padding:18px;box-shadow:0 18px 50px #0005}
[data-amadeus-state] .dialog h3{margin-top:0}
[data-amadeus-state] .dialog .actions{justify-content:flex-end;margin-top:16px}
[data-amadeus-state] .muted{opacity:.7}
[data-amadeus-state] .stack{display:flex;flex-direction:column;gap:10px;min-width:0}
[data-amadeus-state] .scopeRow{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
[data-amadeus-state] .scopeRow select{flex:1 1 240px}
[data-amadeus-state].am-detail{padding:0;max-width:100%}
[data-amadeus-state] .am-detail .field{padding:8px 0}
[data-amadeus-state] .am-detail .field .label{font-weight:500}
[data-amadeus-state] .am-detail .actions{margin-top:10px}
@media (max-width:640px){
  [data-amadeus-state] .field{grid-template-columns:1fr;gap:5px}
  [data-amadeus-state] .interestRow{grid-template-columns:1fr 1fr;gap:6px}
  [data-amadeus-state] .interestRow .interestActions{grid-column:1 / -1}
  [data-amadeus-state] .topbar{align-items:stretch}
}
`;

const DICT = {
  zh: {
    nav: 'Amadeus 状态',
    title: 'Amadeus 状态',
    subtitle: '心情、精力、好奇心与兴趣的持久状态。这里只是管理与观察层，行为倾向不会覆盖人格、权限或 Life 调度。',
    refresh: '刷新',
    save: '保存设置',
    saving: '保存中…',
    cancel: '取消修改',
    saved: '设置已保存，引擎会立即读取新值。',
    saveFailed: '保存失败，草稿已保留。',
    conflict: '设置已在别处修改。请先载入最新值，或保留草稿后再保存。',
    reloadAccepted: '载入最新值',
    noChanges: '没有需要保存的修改。',
    unsaved: '有未保存的修改。',
    readOnly: '当前部署的设置为只读。',
    loading: '正在读取…',
    loadingScopes: '正在读取状态场景…',
    noScopes: '还没有状态场景。先进行一次合法事件，或打开一个已经绑定身份的会话。',
    scope: '当前场景',
    privacy: '范围',
    private: '私有',
    shared: '已授权共享',
    source: '来源',
    local: '本地私有',
    life: 'Life 绑定',
    authorized: '授权有效',
    unauthorized: '授权无效',
    overview: '总览',
    settings: '状态演化',
    context: '上下文与模型工具',
    rules: '会话规则',
    data: '数据与诊断',
    interests: '兴趣管理',
    audit: '事件与审计',
    advanced: '高级设置',
    diagnostics: '诊断',
    mood: '心情',
    energy: '精力',
    curiosity: '好奇心',
    baseline: '长期基准',
    lastUpdate: '最后更新',
    lastEvent: '最近事件',
    tendency: '倾向说明',
    stateHealthy: '状态引擎正常',
    stateDegraded: '状态引擎不可用',
    injection: '动态上下文',
    contextOff: '关闭',
    contextBrief: '简短状态',
    contextStateInterests: '状态与兴趣',
    normal: '正常运行',
    unavailable: '不可用',
    disconnected: '未连接',
    enabled: '已启用',
    disabled: '已关闭',
    noState: '此场景当前没有可读取的状态。',
    noInterests: '暂无兴趣。手动添加一个，或让合法事件形成近期兴趣。',
    addInterest: '添加兴趣',
    name: '名称',
    aliases: '别名（逗号分隔）',
    manualBaseline: '人工长期偏好',
    activity: '近期活跃',
    add: '添加',
    update: '保存修改',
    edit: '调整',
    disable: '停用',
    enable: '启用',
    delete: '删除',
    interestDeleted: '兴趣已从 State 中删除；Memory 记忆与历史审计不受影响。',
    interestDeleteHint: '删除只影响 State 中的兴趣配置与近期活跃度，不会删除 Memory 记忆或历史审计；确认后才会执行。',
    interestDisabled: '兴趣已停用，历史数据保留。',
    confirmDeleteTitle: '删除兴趣？',
    confirmDeleteBody: '只删除 State 中的兴趣名称与近期活跃度。不会删除 Memory 中的记忆，也不会删除审计历史。',
    confirmResetTitle: '重置当前状态到基准？',
    confirmResetBody: '这是独立的高影响操作。会先创建数据库备份，并把当前心情、精力、好奇心恢复到配置基准。兴趣和历史记录不会删除。',
    confirm: '确认',
    close: '取消',
    reset: '重置当前状态到基准',
    resetDone: '当前状态已重置，并写入一条管理员审计记录。',
    backup: '创建数据库备份',
    backupConfirmTitle: '创建备份？',
    backupConfirmBody: '在当前数据目录的 backups 子目录创建一致性备份，不会修改状态。',
    backupDone: '备份已创建：',
    backups: '数据库备份与恢复',
    noBackups: '暂无备份。先创建一份备份，再从这里选择恢复。',
    selectBackup: '选择备份',
    restoreBackup: '从备份恢复',
    restoreBackupTitle: '从备份恢复数据库？',
    restoreBackupBody: '会先验证备份完整性、schema 和必需表，创建恢复前安全备份，然后替换当前 State 数据库并重新打开。失败会自动恢复原数据库；只影响 State 数据，不删除 Memory。',
    restoreBackupHint: '恢复前请确认备份版本与当前插件兼容；成功后页面会重新读取 State 数据。',
    restoreBackupDone: '已从备份恢复，State 数据库已重新打开。',
    selectBackupRequired: '请先选择一个备份。',
    confirmRestore: '确认恢复',
    restoreDefaults: '恢复默认参数',
    restoreConfirmTitle: '恢复默认参数？',
    restoreConfirmBody: '只清除插件配置覆盖并恢复默认值，不会删除状态、兴趣或审计历史。',
    restoreDone: '配置已恢复默认值。',
    preview: '预览调整效果',
    previewEvent: '预览事件类型',
    previewHint: '预览使用当前草稿参数，但不会写入数据库。',
    advancedHint: '这些参数影响演化速度、上限与保留策略。修改会立即生效，不需要重启插件。',
    default: '默认',
    range: '范围',
    restart: '修改后需要重启插件',
    live: '修改后立即生效',
    page: '第',
    pageOf: '页，共',
    prev: '上一页',
    next: '下一页',
    total: '条记录',
    noEvents: '暂无变化记录。',
    time: '时间',
    type: '类型',
    delta: '影响',
    reason: '原因',
    sourceTrust: '来源 / 信任',
    details: '详情',
    beforeAfter: '变化前后',
    evidence: '证据引用',
    version: '版本',
    database: '数据库',
    schema: 'Schema 版本',
    lifeIntegration: 'Life 接口',
    memoryIntegration: 'Memory 接口',
    memoryWrite: 'Memory 写入',
    memoryWriteUnavailable: '不可用（缺少 Scene 级契约）',
    memoryWriteSafe: '可用（Scene 级契约已验证）',
    lastError: '最近错误',
    counts: '数据量',
    configSource: '配置来源',
    sameSource: '插件管理器与独立设置页共用 DSH 权威配置和修订号。',
    settingsUnavailable: '设置命名空间当前不可用；插件可能被停用。',
    requestFailed: '请求失败：',
    noPermission: '只有已认证的 DSH 所有者可以管理 State。',
    scopes: '状态场景',
    workspace: '工作区',
    noWorkspace: '未绑定工作区',
    bindWorkspace: '绑定工作区',
    unbindWorkspace: '解除绑定',
    workspaceBound: '已绑定工作区',
    workspaceUnbound: '未绑定（保持 v1 私有模式）',
    workspaceMissing: '工作区已失效',
    workspaceRegistryUnavailable: 'workspaceRegistry 不可用',
    workspacePick: '选择一个 DSH Workspace',
    workspaceHint: '使用官方 DSH workspaceRegistry 的稳定 ID 与实时 sessionIds；显示名称和路径不参与身份判断。',
    workspaceRebind: '绑定到其他工作区？',
    workspaceRebindBody: '这会切换工作区主状态；旧工作区的状态、规则与审计原样保留，不会合并。',
    unbindTitle: '解除工作区绑定？',
    unbindBody: '解除后回到 v1 的每会话私有状态；旧数据、规则和审计不会被删除，也不会自动合并。',
    workspaceDefaultMode: '默认会话策略',
    workspaceDefaultHint: '工作区成员默认共享主状态；可在下方为单个会话设置例外。',
    workspaceMain: '工作区共享主状态',
    workspaceLegacy: '旧私有 Scope 与审计被保留，不会自动汇总。',
    workspaceNoBinding: '绑定工作区后，工作区内的合法会话共享一份主状态。',
    sessionRules: '会话规则',
    sessionRulesHint: '规则只接受稳定 Session ID，并从实时工作区成员中验证。撤权后下一次工具、注入或事件立即生效。',
    session: '会话',
    mode: '模式',
    modeShared: '共享主状态',
    modeReadOnly: '只读共享',
    modeIsolated: '独立状态',
    modeDisabled: '完全停用',
    modeSharedHelp: '读取主状态；本会话的合法事件可小幅影响全局。',
    modeReadOnlyHelp: '读取主状态，但不会修改它。适合高频群聊和观察。',
    modeIsolatedHelp: '使用本会话独立的状态和兴趣，不读写主状态。',
    modeDisabledHelp: '不注入、不处理事件、不开放有效模型读写；数据保留。',
    saveRule: '应用规则',
    clearRule: '恢复默认',
    ruleSaved: '会话规则已保存，立即生效。',
    ruleCleared: '已恢复工作区默认策略。',
    archivedSession: '已归档',
    noSessions: '工作区没有可管理的会话。',
    qqSceneUnavailable: 'QQ 群号/私聊号规则未实现：当前 DSH 没有可公开验证的 Scene 映射。仅接受稳定 Session ID，避免按显示名称授权。',
    noExtraModel: '未实现额外模型评价；不会每轮另开 LLM。',
    autoEvolution: '回合后自动演化',
    autoEvolutionHelp: '只处理已完成的真实模型回合，并使用稳定 Session/turn/seq 去重与限流。',
    injectionLevel: '注入等级',
    injectionBrief: '简短',
    injectionDetailed: '详细',
    toolStatus: '模型工具状态',
    toolGet: 'state_get',
    toolAppraise: 'state_appraise（可选低信任）',
    toolInterests: 'state_interests',
    toolHealth: 'state_health',
    toolDisabledNote: '完全停用模式下，模型工具不返回有效状态。',
    dataHint: '数据库、迁移、备份与诊断。所有恢复仍需二次确认。',
    migration: 'Schema 迁移',
    migrationNone: '没有迁移记录。',
    migrationBackup: '迁移前备份',
    storage: '本地存储',
    legacyPreserved: '旧 v1 私有 Scope 与审计保留；不会自动合并到工作区主状态。',
    contextPageHint: '每次真正组装模型上下文时读取最新状态；不注入完整事件历史，也不调用额外模型生成文本。',
    evolutionPageHint: '调整状态影响、恢复与回合后演化；所有设置立即生效。',
    eventStored: '状态事件已记录。',
    interestAdded: '兴趣已添加。',
    interestUpdated: '兴趣已更新。',
    invalidField: '数值超出合法范围。',
    lang: 'EN',
    back: '返回',
    notAvailable: '不可用',
    notConnected: '未连接',
    optional: '可选',
    yes: '是',
    no: '否',
    scopePrivateNote: '当前读取只使用此会话获授权的场景；不会合并其他私有场景的数值或原因。',
    adminNote: '页面请求需要 DSH 已认证所有者；仅本机回环地址不算管理员授权。',
    detailTitle: 'State 基本配置',
    detailIntro: '与独立 Amadeus 状态页共用同一 DSH 配置和修订号。',
    detailHealth: '引擎',
    detailUnavailable: '状态不可读取',
    detailSaved: '已保存，Amadeus 状态页会立即反映。',
    detailNoChanges: '没有修改。',
    detailRestart: '这些字段修改后立即生效；此卡片不包含数据库路径。若 DSH 提示需要重启，请按提示操作。',
  },
  en: {
    nav: 'Amadeus State',
    title: 'Amadeus State',
    subtitle: 'Persistent Mood, Energy, Curiosity, and interests. This is a management and observation layer; tendencies never override Persona, permissions, or Life scheduling.',
    refresh: 'Refresh',
    save: 'Save settings',
    saving: 'Saving…',
    cancel: 'Discard changes',
    saved: 'Settings saved. The engine reads the new values immediately.',
    saveFailed: 'Save failed; your draft was preserved.',
    conflict: 'Settings changed elsewhere. Reload the latest values, or keep your draft and save again.',
    reloadAccepted: 'Reload latest',
    noChanges: 'Nothing to save.',
    unsaved: 'You have unsaved changes.',
    readOnly: 'Settings are read-only in this deployment.',
    loading: 'Loading…',
    loadingScopes: 'Loading state scenes…',
    noScopes: 'No state scenes yet. Produce a legitimate event or open an identity-bound session first.',
    scope: 'Scene',
    privacy: 'Scope',
    private: 'Private',
    shared: 'Authorized shared',
    source: 'Source',
    local: 'Local private',
    life: 'Life binding',
    authorized: 'Authorization valid',
    unauthorized: 'Authorization invalid',
    overview: 'Overview',
    settings: 'Evolution',
    context: 'Context & tools',
    rules: 'Session rules',
    data: 'Data & diagnostics',
    interests: 'Interests',
    audit: 'Events & audit',
    advanced: 'Advanced',
    diagnostics: 'Diagnostics',
    mood: 'Mood',
    energy: 'Energy',
    curiosity: 'Curiosity',
    baseline: 'Baseline',
    lastUpdate: 'Last update',
    lastEvent: 'Last event',
    tendency: 'Tendency',
    stateHealthy: 'State engine ready',
    stateDegraded: 'State engine unavailable',
    injection: 'Dynamic context',
    contextOff: 'Off',
    contextBrief: 'Brief state',
    contextStateInterests: 'State and interests',
    normal: 'Ready',
    unavailable: 'Unavailable',
    disconnected: 'Not connected',
    enabled: 'Enabled',
    disabled: 'Disabled',
    noState: 'This scene has no readable state.',
    noInterests: 'No interests yet. Add one manually, or let legitimate events form recent interests.',
    addInterest: 'Add interest',
    name: 'Name',
    aliases: 'Aliases (comma separated)',
    manualBaseline: 'Manual preference',
    activity: 'Recent activity',
    add: 'Add',
    update: 'Save changes',
    edit: 'Adjust',
    disable: 'Disable',
    enable: 'Enable',
    delete: 'Delete',
    interestDeleted: 'Interest removed from State; Memory and audit history are unaffected.',
    interestDeleteHint: 'Deleting affects only State interest configuration and recent activity; it does not delete Memory or audit history. It runs only after confirmation.',
    interestDisabled: 'Interest disabled; historical data is kept.',
    confirmDeleteTitle: 'Delete this interest?',
    confirmDeleteBody: 'This removes only State\'s interest name and recent activity. Memory entries and audit history are not deleted.',
    confirmResetTitle: 'Reset current state to baseline?',
    confirmResetBody: 'This is a separate high-impact operation. A database backup is created first, then Mood, Energy, and Curiosity return to their configured baselines. Interests and history are kept.',
    confirm: 'Confirm',
    close: 'Cancel',
    reset: 'Reset current state to baseline',
    resetDone: 'Current state was reset and one admin audit row was written.',
    backup: 'Create database backup',
    backupConfirmTitle: 'Create a backup?',
    backupConfirmBody: 'Creates a consistent backup under the data directory\'s backups folder without changing state.',
    backupDone: 'Backup created: ',
    backups: 'Database backup and restore',
    noBackups: 'No backups yet. Create one first, then select it here to restore.',
    selectBackup: 'Select backup',
    restoreBackup: 'Restore from backup',
    restoreBackupTitle: 'Restore database from backup?',
    restoreBackupBody: 'The backup is checked for integrity, schema, and required tables; a safety backup is made, then the current State database is replaced and reopened. Failure restores the original; only State data is affected, never Memory.',
    restoreBackupHint: 'Confirm the backup version matches this plugin. After success the page reloads State data.',
    restoreBackupDone: 'Restored from backup; the State database was reopened.',
    selectBackupRequired: 'Select a backup first.',
    confirmRestore: 'Restore',
    restoreDefaults: 'Restore default parameters',
    restoreConfirmTitle: 'Restore default parameters?',
    restoreConfirmBody: 'Clears plugin configuration overrides and restores defaults only; state, interests, and audit history are kept.',
    restoreDone: 'Configuration restored to defaults.',
    preview: 'Preview effect',
    previewEvent: 'Preview event type',
    previewHint: 'The preview uses the current draft parameters but never writes the database.',
    advancedHint: 'These parameters affect recovery speed, caps, and retention. Changes take effect immediately; no restart is required.',
    default: 'Default',
    range: 'Range',
    restart: 'Requires a plugin restart',
    live: 'Takes effect immediately',
    page: 'Page ',
    pageOf: ' of ',
    prev: 'Previous',
    next: 'Next',
    total: 'records',
    noEvents: 'No state changes recorded yet.',
    time: 'Time',
    type: 'Type',
    delta: 'Effect',
    reason: 'Reason',
    sourceTrust: 'Source / trust',
    details: 'Details',
    beforeAfter: 'Before / after',
    evidence: 'Evidence references',
    version: 'Version',
    database: 'Database',
    schema: 'Schema version',
    lifeIntegration: 'Life interface',
    memoryIntegration: 'Memory interface',
    memoryWrite: 'Memory write',
    memoryWriteUnavailable: 'Unavailable (no scene-scoped contract)',
    memoryWriteSafe: 'Available (scene-scoped contract verified)',
    lastError: 'Last error',
    counts: 'Counts',
    configSource: 'Configuration source',
    sameSource: 'The Plugin Manager and this page share DSH\'s authoritative settings document and revision.',
    settingsUnavailable: 'The settings namespace is unavailable; the plugin may be disabled.',
    requestFailed: 'Request failed: ',
    noPermission: 'Only the authenticated DSH owner may manage State.',
    scopes: 'State scenes',
    workspace: 'Workspace',
    noWorkspace: 'No Workspace bound',
    bindWorkspace: 'Bind Workspace',
    unbindWorkspace: 'Unbind',
    workspaceBound: 'Workspace bound',
    workspaceUnbound: 'Unbound (legacy v1 private mode)',
    workspaceMissing: 'Workspace missing',
    workspaceRegistryUnavailable: 'workspaceRegistry unavailable',
    workspacePick: 'Choose a DSH Workspace',
    workspaceHint: 'Uses the official DSH workspaceRegistry stable id and live sessionIds; titles and paths never decide identity.',
    workspaceRebind: 'Bind a different Workspace?',
    workspaceRebindBody: 'This switches the Workspace main state. The old Workspace state, rules, and audit are kept and never merged.',
    unbindTitle: 'Unbind Workspace?',
    unbindBody: 'After unbinding, State returns to v1 per-Session private behavior. Old data, rules, and audit are kept and never merged.',
    workspaceDefaultMode: 'Default Session policy',
    workspaceDefaultHint: 'Workspace members share the main state by default; add exceptions below.',
    workspaceMain: 'Workspace shared main state',
    workspaceLegacy: 'Legacy private scopes and audit are retained, never auto-merged.',
    workspaceNoBinding: 'Bind a Workspace to share one main state across its legitimate Sessions.',
    sessionRules: 'Session rules',
    sessionRulesHint: 'Rules accept stable Session ids only and are verified against live Workspace membership. Revocation applies to the next tool call, injection, or event.',
    session: 'Session',
    mode: 'Mode',
    modeShared: 'Shared',
    modeReadOnly: 'Read-only',
    modeIsolated: 'Isolated',
    modeDisabled: 'Disabled',
    modeSharedHelp: 'Reads the main state; legitimate events from this Session may affect it slightly.',
    modeReadOnlyHelp: 'Reads the main state without modifying it. Suitable for busy group chats and observation.',
    modeIsolatedHelp: 'Uses this Session\'s own state and interests; never reads or writes the main state.',
    modeDisabledHelp: 'No injection, no event processing, no effective model read/write; data is retained.',
    saveRule: 'Apply rule',
    clearRule: 'Use default',
    ruleSaved: 'Session rule saved and effective immediately.',
    ruleCleared: 'Workspace default policy restored.',
    archivedSession: 'Archived',
    noSessions: 'This Workspace has no manageable Sessions.',
    qqSceneUnavailable: 'QQ group/private-number rules are not implemented: this DSH exposes no publicly verifiable Scene mapping. Only stable Session ids are accepted, never display names.',
    noExtraModel: 'No additional model appraisal is implemented; no extra LLM is started per turn.',
    autoEvolution: 'Post-turn evolution',
    autoEvolutionHelp: 'Processes only completed real model turns, deduplicated and rate-limited by stable Session/turn/seq evidence.',
    injectionLevel: 'Injection level',
    injectionBrief: 'Brief',
    injectionDetailed: 'Detailed',
    toolStatus: 'Model tool status',
    toolGet: 'state_get',
    toolAppraise: 'state_appraise (optional low trust)',
    toolInterests: 'state_interests',
    toolHealth: 'state_health',
    toolDisabledNote: 'In disabled mode, model tools return no effective state.',
    dataHint: 'Database, migration, backup, and diagnostics. Restore still needs explicit confirmation.',
    migration: 'Schema migration',
    migrationNone: 'No migration records.',
    migrationBackup: 'Pre-migration backup',
    storage: 'Local storage',
    legacyPreserved: 'Legacy v1 private scopes and audit are retained and never auto-merged into the Workspace main state.',
    contextPageHint: 'Reads the latest state each time a model context is actually assembled; it never injects full event history or calls another model.',
    evolutionPageHint: 'Adjust influence, recovery, and post-turn evolution; every setting applies immediately.',
    eventStored: 'State event recorded.',
    interestAdded: 'Interest added.',
    interestUpdated: 'Interest updated.',
    invalidField: 'Value is outside the allowed range.',
    lang: '中文',
    back: 'Back',
    notAvailable: 'Unavailable',
    notConnected: 'Not connected',
    optional: 'Optional',
    yes: 'Yes',
    no: 'No',
    scopePrivateNote: 'Reads use only this Session\'s authorized scene; private values and reasons from other scenes are never merged.',
    adminNote: 'Page requests require an authenticated DSH owner; a loopback address alone is not administrator authorization.',
    detailTitle: 'State basic configuration',
    detailIntro: 'Shares the same DSH settings document and revision as the Amadeus State page.',
    detailHealth: 'Engine',
    detailUnavailable: 'State unavailable',
    detailSaved: 'Saved; the Amadeus State page reflects it immediately.',
    detailNoChanges: 'No changes.',
    detailRestart: 'These fields take effect immediately; the database path is not in this card. If DSH asks for a restart, follow that prompt.',
  },
};

async function api(path, options) {
  const init = {
    credentials: 'same-origin',
    headers: { 'x-amadeus-state': '1' },
    ...(options ?? {}),
  };
  if (init.body !== undefined && typeof init.body !== 'string') {
    init.headers = { ...init.headers, 'content-type': 'application/json' };
    init.body = JSON.stringify(init.body);
  }
  const res = await fetch(API_ROOT + path, init);
  let payload;
  try {
    payload = await res.json();
  } catch {
    throw new Error('宿主接口未就绪（HTTP ' + res.status + '）');
  }
  if (!res.ok || !payload || payload.ok !== true) {
    throw new Error(payload && payload.error ? payload.error : 'HTTP ' + res.status);
  }
  return payload.data;
}

function fmt(value) {
  const n = Math.round(Number(value) * 10) / 10;
  return Number.isFinite(n) ? n : 0;
}

function scopeLabel(scope, t, lang) {
  if (!scope) return '';
  const privacy = scope.privacy === 'shared' ? t('shared') : t('private');
  const authorization = scope.authorized === false ? ' · ' + t('unauthorized') : '';
  return (scope.source === 'life' ? t('life') : scope.source === 'workspace' ? t('workspaceMain') : t('local')) + ' · ' + privacy + ' · ' + String(scope.sceneId || scope.id).slice(0, 34) + authorization;
}

function eventLabel(type, lang) {
  const zh = {
    meaningful_interaction: '有意义的互动',
    exploration_completed: '探索完成',
    knowledge_gained: '获得新知识',
    difficulty: '遇到困难',
    memory_reference: '记忆引用',
    life_completed: 'Life 活动完成',
    life_failed: 'Life 活动失败',
    admin_reset: '管理员重置',
    clock_anomaly: '时间异常',
  };
  const en = {
    meaningful_interaction: 'Meaningful interaction',
    exploration_completed: 'Exploration completed',
    knowledge_gained: 'Knowledge gained',
    difficulty: 'Difficulty',
    memory_reference: 'Memory reference',
    life_completed: 'Life activity completed',
    life_failed: 'Life activity failed',
    admin_reset: 'Admin reset',
    clock_anomaly: 'Clock anomaly',
  };
  return (lang === 'en' ? en : zh)[type] ?? String(type);
}

function ConfirmDialog({ open, title, body, confirmLabel, cancelLabel, danger, onConfirm, onCancel }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const timer = setTimeout(() => ref.current?.focus(), 0);
    const onKey = (event) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', onKey);
      if (previous && typeof previous.focus === 'function') previous.focus();
    };
  }, [open, onCancel]);
  if (!open) return null;
  return h(
    'div',
    { className: 'overlay', onMouseDown: (event) => { if (event.target === event.currentTarget) onCancel(); } },
    h(
      'div',
      { className: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('h3', null, title),
      typeof body === 'string' ? h('p', null, body) : body,
      h(
        'div',
        { className: 'actions' },
        h('button', { type: 'button', onClick: onCancel }, cancelLabel),
        h('button', { type: 'button', className: danger ? 'danger' : 'primary', ref, onClick: onConfirm }, confirmLabel),
      ),
    ),
  );
}

function StateCard({ label, value, baseline, unit, min, max, direction, t }) {
  const percent = Math.min(100, Math.max(0, ((Number(value) - min) / (max - min)) * 100));
  return h(
    'div',
    { className: 'card' },
    h('div', { className: 'muted' }, label),
    h('div', { className: 'value' }, fmt(value) + (unit ? ' / ' + unit : '')),
    h('div', { className: 'bar', 'aria-hidden': 'true' }, h('span', { style: { width: percent + '%' } })),
    h('div', { className: 'base' }, t('baseline') + ' ' + fmt(baseline) + ' · ' + direction),
    h('small', null, t('range') + ' ' + min + '…' + max),
  );
}

function NumberControl({ field, value, error, disabled, onChange, t, lang }) {
  const help = field[lang] || field.zh;
  return h(
    'div',
    { className: 'control' },
    h(
      'div',
      { className: 'inline' },
      h('input', {
        type: 'range',
        min: field.min,
        max: field.max,
        step: field.step ?? 1,
        value: Number(value),
        disabled,
        'aria-label': help.label,
        onChange: (event) => onChange(clampFieldValue(field, event.target.value)),
      }),
      h('input', {
        type: 'number',
        min: field.min,
        max: field.max,
        step: field.step ?? 1,
        value: Number(value),
        disabled,
        'aria-label': help.label + ' (' + t('range') + ' ' + field.min + '–' + field.max + ')',
        onChange: (event) => onChange(clampFieldValue(field, event.target.value)),
      }),
    ),
    h('small', null, t('range') + ' ' + field.min + '–' + field.max + (field.unit ? ' ' + field.unit : '') + ' · ' + t('default') + ' ' + field.default + ' · ' + (field.restart ? t('restart') : t('live'))),
    error ? h('div', { className: 'errorText' }, t(error)) : null,
  );
}

function FieldRow({ field, draft, snapshot, errors, disabled, onChange, t, lang }) {
  const help = field[lang] || field.zh;
  const value = draft.values[field.key];
  let control;
  if (field.type === 'boolean') {
    control = h(
      'label',
      { className: 'switch' },
      h('input', {
        type: 'checkbox',
        checked: value === true,
        disabled,
        onChange: (event) => onChange(event.target.checked),
      }),
      h('span', null, value === true ? t('enabled') : t('disabled')),
    );
  } else if (field.type === 'enum') {
    control = h(
      'select',
      {
        value,
        disabled,
        'aria-label': help.label,
        onChange: (event) => onChange(event.target.value),
      },
      ...field.enum.filter((option) => option !== 'state_interests' || value === 'state_interests').map((option) => {
        const labels = {
          off: t('contextOff'),
          subtle: lang === 'en' ? 'Subtle' : '轻微',
          standard: lang === 'en' ? 'Standard' : '标准',
          strong: lang === 'en' ? 'Noticeable' : '明显',
          brief: t('contextBrief'),
          state_interests: t('contextStateInterests'),
          detailed: t('injectionDetailed'),
        };
        return h('option', { key: option, value: option }, labels[option] || option);
      }),
    );
  } else {
    control = h(NumberControl, {
      field,
      value,
      error: errors[field.key],
      disabled,
      onChange,
      t,
      lang,
    });
  }
  return h(
    'div',
    { className: 'field' },
    h(
      'div',
      { className: 'label' },
      help.label,
      h('small', null, help.help),
      h('small', null, (field.type === 'number'
        ? t('range') + ' ' + field.min + '–' + field.max + (field.unit ? ' ' + field.unit : '') + ' · '
        : '') + t('default') + ' ' + String(field.default) + ' · ' + (field.restart ? t('restart') : t('live'))),
    ),
    h('div', { className: 'control' }, control),
  );
}

function Panel({ ctx }) {
  const [lang, setLang] = React.useState('zh');
  const langRef = React.useRef(lang);
  langRef.current = lang;
  const t = React.useCallback((key) => {
    const active = langRef.current;
    return (DICT[active] && DICT[active][key]) || (DICT.zh && DICT.zh[key]) || key;
  }, []);
  const [tab, setTab] = React.useState('overview');
  const [snapshot, setSnapshot] = React.useState(null);
  const [draft, setDraft] = React.useState(null);
  const [scopes, setScopes] = React.useState([]);
  const [scopeId, setScopeId] = React.useState('');
  const [overview, setOverview] = React.useState(null);
  const [interests, setInterests] = React.useState([]);
  const [audit, setAudit] = React.useState({ items: [], total: 0, limit: 20, offset: 0 });
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState(null);
  const [diagnostics, setDiagnostics] = React.useState(null);
  const [workspaceData, setWorkspaceData] = React.useState(null);
  const [workspacePick, setWorkspacePick] = React.useState('');
  const [ruleDrafts, setRuleDrafts] = React.useState({});
  const [backups, setBackups] = React.useState([]);
  const [selectedBackup, setSelectedBackup] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [previewEventType, setPreviewEventType] = React.useState('meaningful_interaction');
  const [preview, setPreview] = React.useState('');
  const [confirm, setConfirm] = React.useState(null);
  const [newInterest, setNewInterest] = React.useState({ name: '', baseline: 60, aliases: '' });
  const [editing, setEditing] = React.useState(null);
  const alive = React.useRef(true);
  const formRef = React.useRef(null);
  const initialized = React.useRef(false);
  const draftRef = React.useRef(null);
  const conflictRef = React.useRef(false);
  draftRef.current = draft;

  const formSnapshot = React.useCallback(() => formRef.current?.getSnapshot(), []);
  const accepted = acceptedValues(snapshot);
  const dirty = draft && snapshot ? isDirty(draft, snapshot, FIELDS) : false;
  const errors = draft ? validateAll(draft.values, FIELDS) : {};
  const hasErrors = Object.keys(errors).length > 0;

  const showError = React.useCallback((value) => {
    setError(value instanceof Error ? value.message : String(value));
    setMessage('');
  }, []);
  const showMessage = React.useCallback((value) => {
    setMessage(value);
    setError('');
  }, []);

  const loadStatus = React.useCallback(async () => {
    try {
      const data = await api('/status');
      if (alive.current) setStatus(data);
    } catch (e) {
      if (alive.current) showError(t('requestFailed') + e.message);
    }
  }, [showError]);

  const loadScopes = React.useCallback(async () => {
    try {
      const data = await api('/scopes');
      if (!alive.current) return;
      const list = Array.isArray(data.scopes) ? data.scopes : [];
      setScopes(list);
      setScopeId((current) => {
        if (current && list.some((scope) => scope.id === current)) return current;
        return list[0]?.id ?? '';
      });
    } catch (e) {
      if (alive.current) showError(t('requestFailed') + e.message);
    }
  }, [showError]);

  const loadOverview = React.useCallback(async (id) => {
    if (!id) {
      setOverview(null);
      return;
    }
    try {
      const data = await api('/overview?scope=' + encodeURIComponent(id));
      if (alive.current) setOverview(data);
    } catch (e) {
      if (alive.current) {
        setOverview(null);
        showError(t('requestFailed') + e.message);
      }
    }
  }, [showError]);

  const loadInterests = React.useCallback(async (id) => {
    if (!id) {
      setInterests([]);
      return;
    }
    try {
      const data = await api('/interests?scope=' + encodeURIComponent(id));
      if (alive.current) setInterests(Array.isArray(data.interests) ? data.interests : []);
    } catch (e) {
      if (alive.current) showError(t('requestFailed') + e.message);
    }
  }, [showError]);

  const loadAudit = React.useCallback(async (id, targetPage, pageSize) => {
    if (!id) {
      setAudit({ items: [], total: 0, limit: pageSize, offset: 0 });
      return;
    }
    try {
      const data = await api('/events?scope=' + encodeURIComponent(id) + '&page=' + targetPage + '&pageSize=' + pageSize);
      if (!alive.current) return;
      setAudit(data);
      const safePage = clampPage(targetPage, data.total, pageSize);
      if (safePage !== targetPage) setPage(safePage);
    } catch (e) {
      if (alive.current) showError(t('requestFailed') + e.message);
    }
  }, [showError]);

  const loadDiagnostics = React.useCallback(async () => {
    try {
      const data = await api('/diagnostics');
      if (!alive.current) return;
      setDiagnostics(data);
      const list = Array.isArray(data.backups) ? data.backups : [];
      setBackups(list);
      setSelectedBackup((current) => (list.some((item) => item.file === current) ? current : (list[0]?.file ?? '')));
    } catch (e) {
      if (alive.current) showError(t('requestFailed') + e.message);
    }
  }, [showError, t]);

  const loadWorkspace = React.useCallback(async () => {
    try {
      const data = await api('/workspace');
      if (!alive.current) return;
      setWorkspaceData(data);
      const list = Array.isArray(data.workspaces?.workspaces) ? data.workspaces.workspaces : [];
      setWorkspacePick((current) => {
        if (current && list.some((item) => item.workspaceId === current)) return current;
        return data.binding?.workspaceId ?? list[0]?.workspaceId ?? '';
      });
    } catch (e) {
      if (alive.current) showError(t('requestFailed') + e.message);
    }
  }, [showError, t]);

  React.useEffect(() => {
    alive.current = true;
    let form;
    try {
      form = ctx.configForms.get(NS);
      formRef.current = form;
    } catch (e) {
      showError(t('settingsUnavailable'));
    }
    if (form) {
      const sync = () => {
        const next = form.getSnapshot();
        if (!alive.current) return;
        const previousDraft = draftRef.current;
        if (hasRevisionConflict(previousDraft, next, FIELDS, initialized.current)) {
          conflictRef.current = true;
          setError(t('conflict'));
        }
        setSnapshot(next);
        setDraft((previous) => {
          if (previous === null) return draftFromSnapshot(next);
          if (initialized.current && next.status === 'ready' && next.revision !== previous.revision && isDirty(previous, next, FIELDS)) {
            return { ...previous, revision: next.revision, writable: next.writable, status: next.status };
          }
          if (!isDirty(previous, next, FIELDS)) return draftFromSnapshot(next);
          return { ...previous, revision: next.revision, writable: next.writable, status: next.status };
        });
        if (next.status === 'ready') initialized.current = true;
      };
      sync();
      const unsubscribe = form.subscribe(sync);
      loadStatus();
      loadScopes();
      loadDiagnostics();
      loadWorkspace();
      return () => {
        alive.current = false;
        initialized.current = false;
        unsubscribe();
        // configForms.get() returns a Host-owned shared controller. Only unsubscribe this view.
      };
    }
    loadStatus();
    loadScopes();
    loadDiagnostics();
    loadWorkspace();
    return () => { alive.current = false; };
  }, [ctx, loadDiagnostics, loadScopes, loadStatus, loadWorkspace, showError]);

  React.useEffect(() => {
    if (!scopeId) {
      setOverview(null);
      setInterests([]);
      setAudit({ items: [], total: 0, limit: 20, offset: 0 });
      return;
    }
    setPage(1);
    loadOverview(scopeId);
    loadInterests(scopeId);
    loadAudit(scopeId, 1, Number(snapshot?.value?.auditPageSize ?? 20));
  }, [scopeId, loadAudit, loadInterests, loadOverview, snapshot?.value?.auditPageSize]);

  React.useEffect(() => {
    if (tab === 'data' || tab === 'context') loadDiagnostics();
    if (tab === 'rules' || tab === 'overview') loadWorkspace();
    if (tab === 'audit' && scopeId) loadAudit(scopeId, page, Number(snapshot?.value?.auditPageSize ?? 20));
  }, [tab, page, scopeId, snapshot?.value?.auditPageSize, loadAudit, loadDiagnostics, loadWorkspace]);

  React.useEffect(() => {
    if (workspaceData?.binding?.state !== 'ready') return;
    const workspaceScope = 'workspace:' + workspaceData.binding.workspaceId;
    if (scopes.some((scope) => scope.id === workspaceScope)) setScopeId(workspaceScope);
  }, [workspaceData?.binding?.state, workspaceData?.binding?.workspaceId, scopes]);

  React.useEffect(() => {
    if (tab !== 'overview' || !scopeId) return undefined;
    const timer = setInterval(() => {
      if (!document.hidden) loadOverview(scopeId);
    }, 30000);
    return () => clearInterval(timer);
  }, [tab, scopeId, loadOverview]);

  const refreshAll = React.useCallback(async () => {
    await Promise.all([loadStatus(), loadScopes(), loadDiagnostics(), loadWorkspace()]);
    if (scopeId) {
      await Promise.all([
        loadOverview(scopeId),
        loadInterests(scopeId),
        loadAudit(scopeId, page, Number(snapshot?.value?.auditPageSize ?? 20)),
      ]);
    }
  }, [loadAudit, loadDiagnostics, loadInterests, loadOverview, loadScopes, loadStatus, loadWorkspace, page, scopeId, snapshot?.value?.auditPageSize]);

  const changeField = (key, value) => {
    setDraft((previous) => setDraftValue(previous, key, value));
    setMessage('');
    setPreview('');
  };

  const save = async () => {
    const form = formRef.current;
    const current = formSnapshot();
    if (!form || !current) return;
    if (conflictRef.current) {
      setError(t('conflict'));
      return;
    }
    if (hasErrors) {
      setError(t('invalidField'));
      return;
    }
    const ops = buildSetOps(draft, current, FIELDS);
    if (ops.length === 0) {
      showMessage(t('noChanges'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const ok = await form.mutate(ops, current.revision);
      if (!ok) {
        conflictRef.current = true;
        setError(t('conflict'));
        setMessage('');
        return;
      }
      conflictRef.current = false;
      showMessage(t('saved'));
      setPreview('');
      await refreshAll();
    } catch (e) {
      showError(t('saveFailed') + ' ' + e.message);
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    const current = formSnapshot();
    if (current) setDraft(draftFromSnapshot(current));
    conflictRef.current = false;
    setError('');
    setPreview('');
    setMessage('');
  };

  const restoreDefaults = () => {
    setConfirm({
      title: t('restoreConfirmTitle'),
      body: t('restoreConfirmBody'),
      confirmLabel: t('confirm'),
      action: async () => {
        const form = formRef.current;
        const current = formSnapshot();
        if (!form || !current) return;
        setBusy(true);
        try {
          const ok = await form.mutate(buildUnsetAllOps(FIELDS), current.revision);
          if (!ok) {
            conflictRef.current = true;
            setError(t('conflict'));
            return;
          }
          conflictRef.current = false;
          showMessage(t('restoreDone'));
          await refreshAll();
        } catch (e) {
          showError(e.message);
        } finally {
          setBusy(false);
          setConfirm(null);
        }
      },
    });
  };

  const doPreview = async () => {
    if (!scopeId || !draft) return;
    setBusy(true);
    try {
      const data = await api('/preview', {
        method: 'POST',
        body: { scope: scopeId, eventType: previewEventType, config: draftConfig(draft.values, FIELDS) },
      });
      setPreview(previewText(data, lang));
      setError('');
    } catch (e) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const doReset = () => {
    if (!overview || !overview.state) return;
    setConfirm({
      title: t('confirmResetTitle'),
      body: t('confirmResetBody'),
      confirmLabel: t('confirm'),
      danger: true,
      action: async () => {
        setBusy(true);
        try {
          await api('/reset', {
            method: 'POST',
            body: { scope: scopeId, expectedRevision: overview.state.revision, confirm: 'RESET' },
          });
          showMessage(t('resetDone'));
          await refreshAll();
        } catch (e) {
          showError(e.message);
        } finally {
          setBusy(false);
          setConfirm(null);
        }
      },
    });
  };

  const doBackup = () => {
    setConfirm({
      title: t('backupConfirmTitle'),
      body: t('backupConfirmBody'),
      confirmLabel: t('confirm'),
      action: async () => {
        setBusy(true);
        try {
          const data = await api('/backup', { method: 'POST', body: { confirm: 'BACKUP' } });
          showMessage(t('backupDone') + (data.file || ''));
          await loadDiagnostics();
        } catch (e) {
          showError(e.message);
        } finally {
          setBusy(false);
          setConfirm(null);
        }
      },
    });
  };

  const doRestore = () => {
    if (!selectedBackup) {
      showError(t('selectBackupRequired'));
      return;
    }
    const selected = backups.find((item) => item.file === selectedBackup);
    setConfirm({
      title: t('restoreBackupTitle'),
      body: t('restoreBackupBody') + (selected ? `\n\n${selected.file}` : ''),
      confirmLabel: t('confirmRestore'),
      danger: true,
      action: async () => {
        setBusy(true);
        try {
          await api('/restore', {
            method: 'POST',
            body: { file: selectedBackup, confirm: 'RESTORE' },
          });
          showMessage(t('restoreBackupDone'));
          setSelectedBackup('');
          await refreshAll();
        } catch (e) {
          showError(e.message);
        } finally {
          setBusy(false);
          setConfirm(null);
        }
      },
    });
  };

  const requestBind = () => {
    if (!workspacePick) {
      showError(t('workspacePick'));
      return;
    }
    const rebind = workspaceData?.binding?.bound === true && workspaceData.binding.workspaceId !== workspacePick;
    setConfirm({
      title: rebind ? t('workspaceRebind') : t('bindWorkspace'),
      body: rebind ? t('workspaceRebindBody') : t('workspaceHint'),
      confirmLabel: t('bindWorkspace'),
      danger: rebind,
      action: async () => {
        setBusy(true);
        try {
          await api('/workspace', {
            method: 'POST',
            body: { action: 'bind', workspaceId: workspacePick, ...(rebind ? { confirm: 'REBIND' } : {}) },
          });
          showMessage(t('workspaceBound') + '：' + workspacePick);
          await refreshAll();
        } catch (e) {
          showError(e.message);
        } finally {
          setBusy(false);
          setConfirm(null);
        }
      },
    });
  };

  const requestUnbind = () => {
    setConfirm({
      title: t('unbindTitle'),
      body: t('unbindBody'),
      confirmLabel: t('unbindWorkspace'),
      danger: true,
      action: async () => {
        setBusy(true);
        try {
          await api('/workspace', { method: 'POST', body: { action: 'unbind', confirm: 'UNBIND' } });
          showMessage(t('workspaceUnbound'));
          await refreshAll();
        } catch (e) {
          showError(e.message);
        } finally {
          setBusy(false);
          setConfirm(null);
        }
      },
    });
  };

  const applyRule = async (sessionId, mode) => {
    setBusy(true);
    try {
      await api('/session-rules', { method: 'POST', body: { action: 'set', sessionId, mode } });
      setRuleDrafts((previous) => {
        const next = { ...previous };
        delete next[sessionId];
        return next;
      });
      showMessage(t('ruleSaved'));
      await loadWorkspace();
    } catch (e) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const clearRule = async (sessionId) => {
    setBusy(true);
    try {
      await api('/session-rules', { method: 'POST', body: { action: 'clear', sessionId } });
      setRuleDrafts((previous) => {
        const next = { ...previous };
        delete next[sessionId];
        return next;
      });
      showMessage(t('ruleCleared'));
      await loadWorkspace();
    } catch (e) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const addInterest = async () => {
    if (!scopeId || !newInterest.name.trim()) return;
    setBusy(true);
    try {
      await api('/interests', {
        method: 'POST',
        body: {
          action: 'add',
          scope: scopeId,
          name: newInterest.name,
          baseline: Number(newInterest.baseline),
          aliases: newInterest.aliases.split(/[,，]/).map((part) => part.trim()).filter(Boolean),
        },
      });
      setNewInterest({ name: '', baseline: 60, aliases: '' });
      showMessage(t('interestAdded'));
      await loadInterests(scopeId);
      await loadOverview(scopeId);
    } catch (e) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const saveInterest = async (interest) => {
    setBusy(true);
    try {
      await api('/interests', {
        method: 'POST',
        body: {
          action: 'update',
          scope: scopeId,
          id: interest.id,
          baseline: Number(interest.baseline),
          aliases: String(interest.aliases ?? '').split(/[,，]/).map((part) => part.trim()).filter(Boolean),
        },
      });
      setEditing(null);
      showMessage(t('interestUpdated'));
      await loadInterests(scopeId);
      await loadOverview(scopeId);
    } catch (e) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleInterest = async (interest) => {
    setBusy(true);
    try {
      await api('/interests', {
        method: 'POST',
        body: { action: 'disable', scope: scopeId, id: interest.id, disabled: !interest.disabled },
      });
      showMessage(t('interestDisabled'));
      await loadInterests(scopeId);
    } catch (e) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const deleteInterest = (interest) => {
    setConfirm({
      title: t('confirmDeleteTitle'),
      body: t('confirmDeleteBody'),
      confirmLabel: t('delete'),
      danger: true,
      action: async () => {
        setBusy(true);
        try {
          await api('/interests', { method: 'POST', body: { action: 'delete', scope: scopeId, id: interest.id } });
          showMessage(t('interestDeleted'));
          await loadInterests(scopeId);
          await loadOverview(scopeId);
        } catch (e) {
          showError(e.message);
        } finally {
          setBusy(false);
          setConfirm(null);
        }
      },
    });
  };

  if (!draft || !snapshot || !snapshot.value || snapshot.status === 'loading') {
    return h(
      'div',
      { 'data-amadeus-state': 'true' },
      h('style', null, CSS),
      h('h2', null, t('title')),
      h('p', { role: 'status' }, t('loading')),
      error ? h('div', { className: 'message error', role: 'alert' }, error) : null,
    );
  }
  if (snapshot.status === 'unavailable') {
    return h(
      'div',
      { 'data-amadeus-state': 'true' },
      h('style', null, CSS),
      h('h2', null, t('title')),
      h('p', { role: 'alert' }, t('settingsUnavailable')),
      error ? h('div', { className: 'message error', role: 'alert' }, error) : null,
    );
  }

  const disabled = busy || !draft.writable;
  const evolutionKeys = ['stateEvolutionEnabled', 'eventSensitivity', 'autoRecovery', 'recoverySpeed', 'autoInterestUpdate', 'autoEventProcessingEnabled', 'sharedEventWeight', 'autoEventMinIntervalSeconds', 'autoEventMaxPerHour'];
  const contextKeys = ['influenceStrength', 'contextInjectionMode', 'contextMaxChars', 'modelAppraisalEnabled'];
  const settingsFields = FIELDS.filter((field) => evolutionKeys.includes(field.key));
  const advancedFields = FIELDS.filter((field) => !evolutionKeys.includes(field.key) && !contextKeys.includes(field.key));
  const pageSize = Number(snapshot?.value?.auditPageSize ?? 20);
  const currentPage = clampPage(page, audit.total, pageSize);
  const totalPages = pageCount(audit.total, pageSize);

  const workspaceStatusChip = (() => {
    const binding = workspaceData?.binding;
    if (!binding) return h('span', { className: 'chip' }, t('workspace') + ' …');
    if (binding.state === 'ready') return h('span', { className: 'chip ok' }, t('workspaceBound') + ' · ' + (binding.title || binding.workspaceId).slice(0, 28));
    if (binding.state === 'workspace_missing') return h('span', { className: 'chip bad' }, t('workspaceMissing'));
    if (binding.state === 'registry_unavailable') return h('span', { className: 'chip bad' }, t('workspaceRegistryUnavailable'));
    return h('span', { className: 'chip warn' }, t('workspaceUnbound'));
  })();

  const header = h(
    'div',
    null,
    h(
      'div',
      { className: 'topbar' },
      h(
        'div',
        null,
        h('div', { className: 'eyebrow' }, 'AMADEUS / STATE / ' + t(tab)),
        h('h2', null, t('title')),
        h('div', { className: 'sub' }, t('subtitle')),
      ),
      h(
        'div',
        { className: 'actions' },
        h('button', { type: 'button', className: 'ghost', onClick: () => setLang(lang === 'zh' ? 'en' : 'zh') }, t('lang')),
        h('button', { type: 'button', onClick: () => { setError(''); refreshAll(); }, disabled: busy }, t('refresh')),
      ),
    ),
    h(
      'div',
      { className: 'chips' },
      h('span', { className: 'chip ' + (status?.state === 'ready' ? 'ok' : 'bad') }, t('version') + ' ' + (status?.version ?? '…')),
      h('span', { className: 'chip ' + (status?.state === 'ready' ? 'ok' : 'bad') }, status?.state === 'ready' ? t('stateHealthy') : t('stateDegraded')),
      workspaceStatusChip,
      h('span', { className: 'chip' }, t('injection') + '：' + (snapshot.value.contextInjectionMode === 'off' ? t('contextOff') : snapshot.value.contextInjectionMode === 'state_interests' ? t('contextStateInterests') : snapshot.value.contextInjectionMode === 'detailed' ? t('injectionDetailed') : t('contextBrief'))),
      h('span', { className: 'chip' }, t('schema') + ' ' + (status?.schemaVersion ?? '—')),
      draft.writable ? null : h('span', { className: 'chip warn' }, t('readOnly')),
    ),
    h(
      'div',
      { className: 'scopeRow' },
      h('span', { className: 'muted' }, t('scope')),
      h(
        'select',
        {
          value: scopeId,
          disabled: busy || scopes.length === 0,
          onChange: (event) => setScopeId(event.target.value),
          'aria-label': t('scopes'),
        },
        ...(scopes.length === 0 ? [h('option', { key: 'none', value: '' }, t('loadingScopes'))] : scopes.map((scope) => h('option', { key: scope.id, value: scope.id }, scopeLabel(scope, t, lang)))),
      ),
      h('span', { className: 'chip' }, t('scopePrivateNote')),
    ),
  );

  const notice = h(
    'div',
    null,
    error
      ? h(
          'div',
          { className: 'message error', role: 'alert' },
          error,
          error === t('conflict')
            ? h('div', { className: 'actions' }, h('button', { type: 'button', onClick: cancel }, t('reloadAccepted')))
            : null,
        )
      : null,
    message ? h('div', { className: 'message success', role: 'status' }, message) : null,
    dirty ? h('div', { className: 'message', role: 'status' }, t('unsaved')) : null,
    preview ? h('div', { className: 'message', role: 'status' }, preview) : null,
  );

  const PAGES = [
    ['overview', '▦'],
    ['settings', '♡'],
    ['interests', '☆'],
    ['audit', '≡'],
    ['context', '◌'],
    ['rules', '⚙'],
    ['data', '▤'],
  ];
  const nav = h(
    'div',
    { className: 'navList', role: 'tablist', 'aria-label': t('title') },
    ...PAGES.map(([key, icon]) =>
      h(
        'button',
        { type: 'button', key, className: 'navButton', role: 'tab', 'aria-selected': tab === key, onClick: () => setTab(key) },
        h('span', { className: 'navIcon', 'aria-hidden': 'true' }, icon),
        h('span', null, t(key)),
      ),
    ),
  );
  let content = null;
  if (tab === 'overview') {
    if (!scopeId) {
      content = h('div', { className: 'panel' }, h('p', null, t('noScopes')));
    } else if (!overview) {
      content = h('div', { className: 'panel', role: 'status' }, t('loading'));
    } else if (!overview.state) {
      content = h(
        'div',
        { className: 'panel' },
        h('h3', null, t('unauthorized')),
        h('p', { className: 'errorText' }, String(overview.unavailableReason ?? overview.authorization?.reason ?? '')),
        h('small', null, t('scopePrivateNote')),
      );
    } else {
      content = h(
        React.Fragment,
        null,
        h(
          'div',
          { className: 'workspaceBanner' },
          h(
            'div',
            null,
            h('strong', null, t('workspaceMain')),
            h('small', null, workspaceData?.binding?.state === 'ready'
              ? (workspaceData.binding.title || workspaceData.binding.workspaceId) + ' · ' + (workspaceData.binding.sessionCount ?? 0) + ' ' + t('session')
              : t('workspaceNoBinding')),
          ),
          h('div', { className: 'actions' },
            h('button', { type: 'button', onClick: () => setTab('rules') }, t('rules')),
          ),
        ),
        h(
          'div',
          { className: 'grid' },
          h(StateCard, { label: t('mood'), value: overview.state.mood, baseline: overview.baseline.mood, min: -100, max: 100, direction: overview.explanation.direction.mood, t }),
          h(StateCard, { label: t('energy'), value: overview.state.energy, baseline: overview.baseline.energy, min: 0, max: 100, direction: overview.explanation.direction.energy, t }),
          h(StateCard, { label: t('curiosity'), value: overview.state.curiosity, baseline: overview.baseline.curiosity, min: 0, max: 100, direction: overview.explanation.direction.curiosity, t }),
        ),
        h(
          'div',
          { className: 'panel' },
          h('h3', null, overview.explanation.summary),
          h('p', null, h('strong', null, t('tendency') + '：'), overview.tendency),
          h('small', null, t('source') + '：' + (overview.scope.kind === 'workspace' ? t('workspaceMain') : overview.scope.source === 'life' ? t('life') : t('local')) + ' · ' + t('mode') + ' ' + (overview.access?.mode ?? '—') + ' · Persona ' + String(overview.scope.personaId ?? '—').slice(0, 40)),
          h('small', null, t('lastUpdate') + '：' + new Date(overview.updatedAt).toLocaleString() + ' · ' + t('lastEvent') + '：' + (overview.lastEventAt ? new Date(overview.lastEventAt).toLocaleString() : '—')),
        ),
        overview.interests.length > 0
          ? h(
              'div',
              { className: 'panel' },
              h('h3', null, t('interests')),
              ...overview.interests.slice(0, 6).map((interest) =>
                h(
                  'div',
                  { className: 'interestRow', key: interest.id },
                  h('div', null, h('strong', null, interest.name), interest.manual ? h('span', { className: 'chip' }, t('manualBaseline')) : null),
                  h('div', null, h('small', null, t('baseline') + ' ' + fmt(interest.baseline) + ' / ' + t('activity') + ' ' + fmt(interest.activity)), h('div', { className: 'bar' }, h('span', { style: { width: Math.max(0, Math.min(100, Number(interest.activity))) + '%' } }))),
                  h('div', { className: 'muted' }, sourceLabel(interest.source, lang)),
                ),
              ),
            )
          : h('div', { className: 'panel' }, h('p', null, t('noInterests'))),
      );
    }
  } else if (tab === 'settings') {
    content = h(
      'div',
      { className: 'panel' },
      h('h3', null, t('settings')),
      h('small', null, t('evolutionPageHint')),
      ...settingsFields.map((field) =>
        h(FieldRow, {
          key: field.key,
          field,
          draft,
          snapshot,
          errors,
          disabled,
          onChange: (value) => changeField(field.key, value),
          t,
          lang,
        }),
      ),
      h(
        'small',
        null,
        lang === 'en'
          ? `Local estimate at sensitivity ${Number(draft.values.eventSensitivity).toFixed(2)}: an ordinary interaction ≈ ${signed(3 * Number(draft.values.eventSensitivity))} mood / ${signed(-1 * Number(draft.values.eventSensitivity))} energy / ${signed(1 * Number(draft.values.eventSensitivity))} curiosity before saturation. Exact preview is available under Advanced.`
          : `按当前敏感度 ${Number(draft.values.eventSensitivity).toFixed(2)} 估算：普通互动约 ${signed(3 * Number(draft.values.eventSensitivity))} 心情 / ${signed(-1 * Number(draft.values.eventSensitivity))} 精力 / ${signed(1 * Number(draft.values.eventSensitivity))} 好奇（未计饱和）。高级设置提供精确宿主预览。`,
      ),
      h('small', null, t('sameSource')),
    );
  } else if (tab === 'interests') {
    content = h(
      React.Fragment,
      null,
      h(
        'div',
        { className: 'panel' },
        h('h3', null, t('addInterest')),
        h(
          'div',
          { className: 'stack' },
          h('label', null, t('name'), h('input', { type: 'text', value: newInterest.name, maxLength: 60, disabled, onChange: (event) => setNewInterest({ ...newInterest, name: event.target.value }) })),
          h('label', null, t('manualBaseline'), h('input', { type: 'number', min: 0, max: 100, value: newInterest.baseline, disabled, onChange: (event) => setNewInterest({ ...newInterest, baseline: Number(event.target.value) }) }), h('small', null, t('range') + ' 0–100 · ' + t('default') + ' 60')),
          h('label', null, t('aliases'), h('input', { type: 'text', value: newInterest.aliases, disabled, onChange: (event) => setNewInterest({ ...newInterest, aliases: event.target.value }) })),
          h('div', { className: 'actions' }, h('button', { type: 'button', className: 'primary', disabled: disabled || !newInterest.name.trim(), onClick: addInterest }, t('add'))),
        ),
      ),
      h(
        'div',
        { className: 'panel' },
        h('h3', null, t('interests')),
        ...(interests.length === 0
          ? [h('p', null, t('noInterests'))]
          : interests.map((interest) =>
              h(
                'div',
                { key: interest.id, className: 'interestRow' },
                h(
                  'div',
                  null,
                  h('strong', null, interest.name),
                  interest.manual ? h('span', { className: 'chip' }, t('manualBaseline')) : null,
                  interest.disabled ? h('span', { className: 'chip warn' }, t('disabled')) : null,
                  h('small', null, (interest.aliases ?? []).join('、')),
                ),
                h(
                  'div',
                  null,
                  h('small', null, t('baseline') + ' ' + fmt(interest.baseline) + ' / ' + t('activity') + ' ' + fmt(interest.activity)),
                  h('div', { className: 'bar' }, h('span', { style: { width: Math.max(0, Math.min(100, Number(interest.activity))) + '%' } })),
                ),
                h('div', { className: 'muted' }, sourceLabel(interest.source, lang)),
                h(
                  'div',
                  { className: 'actions interestActions' },
                  editing && editing.id === interest.id
                    ? h(
                        React.Fragment,
                        null,
                        h('input', { type: 'number', min: 0, max: 100, value: editing.baseline, 'aria-label': t('manualBaseline'), disabled, onChange: (event) => setEditing({ ...editing, baseline: Number(event.target.value) }) }),
                        h('input', { type: 'text', value: editing.aliases, 'aria-label': t('aliases'), disabled, onChange: (event) => setEditing({ ...editing, aliases: event.target.value }) }),
                        h('button', { type: 'button', className: 'primary', disabled, onClick: () => saveInterest(editing) }, t('update')),
                        h('button', { type: 'button', onClick: () => setEditing(null) }, t('close')),
                      )
                    : h(
                        React.Fragment,
                        null,
                        h('button', { type: 'button', disabled, onClick: () => setEditing({ id: interest.id, baseline: interest.baseline, aliases: (interest.aliases ?? []).join(', ') }) }, t('edit')),
                        h('button', { type: 'button', disabled, onClick: () => toggleInterest(interest) }, interest.disabled ? t('enable') : t('disable')),
                        h('button', { type: 'button', className: 'danger', disabled, onClick: () => deleteInterest(interest) }, t('delete')),
                      ),
                ),
              ),
            )),
        h('small', null, t('interestDeleteHint')),
      ),
    );
  } else if (tab === 'audit') {
    content = h(
      'div',
      { className: 'panel' },
      h('h3', null, t('audit')),
      h(
        'div',
        { className: 'tableWrap' },
        h(
          'table',
          null,
          h('thead', null, h('tr', null, h('th', null, t('time')), h('th', null, t('type')), h('th', null, t('delta')), h('th', null, t('reason')), h('th', null, t('sourceTrust')), h('th', null, t('details')))),
          h(
            'tbody',
            null,
            ...(audit.items.length === 0
              ? [h('tr', { key: 'empty' }, h('td', { colSpan: 6 }, t('noEvents')))]
              : audit.items.map((event) =>
                  h(
                    'tr',
                    { key: event.id },
                    h('td', null, new Date(event.occurredAt).toLocaleString()),
                    h('td', null, eventLabel(event.type, lang)),
                    h('td', null, deltaText(event.deltas, lang)),
                    h('td', null, event.summary),
                    h('td', null, sourceLabel(event.source, lang) + ' · ' + trustLabel(event.trust, lang)),
                    h(
                      'td',
                      null,
                      h(
                        'details',
                        null,
                        h('summary', null, t('details')),
                        h('small', null, t('beforeAfter') + '：' + JSON.stringify(event.before) + ' → ' + JSON.stringify(event.after)),
                        h('small', null, t('evidence') + '：' + ((event.evidenceRefs ?? []).join('、') || '—')),
                        (event.interestChanges ?? []).length > 0
                          ? h('small', null, t('interests') + '：' + event.interestChanges.map((change) => change.name + ' ' + signed(change.applied)).join('、'))
                          : null,
                      ),
                    ),
                  ),
                )),
          ),
        ),
      ),
      h(
        'div',
        { className: 'actions' },
        h('button', { type: 'button', disabled: busy || currentPage <= 1, onClick: () => setPage(Math.max(1, currentPage - 1)) }, t('prev')),
        h('span', { className: 'muted' }, t('page') + currentPage + t('pageOf') + totalPages + ' · ' + audit.total + ' ' + t('total')),
        h('button', { type: 'button', disabled: busy || currentPage >= totalPages, onClick: () => setPage(currentPage + 1) }, t('next')),
        h('button', { type: 'button', onClick: () => loadAudit(scopeId, currentPage, pageSize), disabled: busy }, t('refresh')),
      ),
    );
  } else if (tab === 'context') {
    const contextFields = FIELDS.filter((field) => contextKeys.includes(field.key));
    content = h(
      React.Fragment,
      null,
      h(
        'div',
        { className: 'panel' },
        h('h3', null, t('context')),
        h('small', null, t('contextPageHint')),
        ...contextFields.map((field) =>
          h(FieldRow, {
            key: field.key,
            field,
            draft,
            snapshot,
            errors,
            disabled,
            onChange: (value) => changeField(field.key, value),
            t,
            lang,
          }),
        ),
      ),
      h(
        'div',
        { className: 'panel' },
        h('h3', null, t('toolStatus')),
        h('div', { className: 'sessionRow' }, h('div', null, h('strong', null, t('toolGet')), h('small', null, t('toolDisabledNote'))), h('span', { className: 'chip ok' }, t('enabled'))),
        h('div', { className: 'sessionRow' }, h('div', null, h('strong', null, t('toolAppraise')), h('small', null, t('noExtraModel'))), h('span', { className: 'chip ' + (snapshot.value.modelAppraisalEnabled ? 'ok' : 'warn') }, snapshot.value.modelAppraisalEnabled ? t('enabled') : t('disabled'))),
        h('div', { className: 'sessionRow' }, h('div', null, h('strong', null, t('toolInterests')), h('small', null, t('contextPageHint'))), h('span', { className: 'chip ok' }, t('enabled'))),
        h('div', { className: 'sessionRow' }, h('div', null, h('strong', null, t('toolHealth'))), h('span', { className: 'chip ok' }, t('enabled'))),
        h('div', { className: 'hintCard' }, h('small', null, t('noExtraModel'))),
      ),
    );
  } else if (tab === 'rules') {
    const data = workspaceData;
    const binding = data?.binding;
    const workspaces = Array.isArray(data?.workspaces?.workspaces) ? data.workspaces.workspaces : [];
    const sessions = Array.isArray(data?.sessions) ? data.sessions : [];
    const modeHelp = {
      shared: t('modeSharedHelp'),
      read_only: t('modeReadOnlyHelp'),
      isolated: t('modeIsolatedHelp'),
      disabled: t('modeDisabledHelp'),
    };
    content = h(
      React.Fragment,
      null,
      h(
        'div',
        { className: 'panel' },
        h('h3', null, t('workspaceDefaultMode')),
        h('small', null, t('workspaceHint')),
        binding?.state === 'ready'
          ? h('div', { className: 'workspaceBanner' },
              h('div', null, h('strong', null, binding.title || binding.workspaceId), h('small', null, t('workspaceBound') + ' · ' + (binding.sessionCount ?? 0) + ' ' + t('session') + ' · ' + t('modeShared'))),
              h('div', { className: 'actions' },
                h('button', { type: 'button', disabled: busy, onClick: requestUnbind }, t('unbindWorkspace')),
              ),
            )
          : h('div', null,
              h('div', { className: 'message', role: 'status' }, binding?.state === 'unbound' ? t('workspaceNoBinding') : binding?.message || t('workspaceRegistryUnavailable')),
              h('div', { className: 'actions' },
                h('label', null, t('workspacePick'),
                  h('select', { value: workspacePick, disabled: busy || workspaces.length === 0, onChange: (event) => setWorkspacePick(event.target.value), 'aria-label': t('workspacePick') },
                    ...(workspaces.length === 0
                      ? [h('option', { key: 'none', value: '' }, data?.workspaces?.available === false ? t('workspaceRegistryUnavailable') : t('workspacePick'))]
                      : workspaces.map((item) => h('option', { key: item.workspaceId, value: item.workspaceId }, (item.title || item.workspaceId) + ' · ' + item.sessionCount + ' ' + t('session')))),
                  ),
                ),
                h('button', { type: 'button', className: 'primary', disabled: busy || !workspacePick, onClick: requestBind }, t('bindWorkspace')),
              ),
            ),
        h('div', { className: 'hintCard' }, h('small', null, t('workspaceLegacy'))),
      ),
      h(
        'div',
        { className: 'panel' },
        h('h3', null, t('sessionRules')),
        h('small', null, t('sessionRulesHint')),
        binding?.state !== 'ready'
          ? h('p', { className: 'muted' }, t('workspaceNoBinding'))
          : sessions.length === 0
            ? h('p', { className: 'muted' }, t('noSessions'))
            : h('div', null, ...sessions.map((entry) => {
                const value = ruleDrafts[entry.sessionId] ?? entry.mode;
                return h(
                  'div',
                  { className: 'sessionRow', key: entry.sessionId },
                  h('div', null,
                    h('div', { className: 'mono' }, entry.sessionId),
                    h('small', null, entry.archived ? t('archivedSession') : entry.explicit ? t('sessionRules') : t('workspaceDefaultMode')),
                  ),
                  entry.archived
                    ? h('span', { className: 'chip warn' }, t('archivedSession'))
                    : h('select', {
                        value,
                        disabled: busy,
                        'aria-label': t('mode'),
                        onChange: (event) => setRuleDrafts({ ...ruleDrafts, [entry.sessionId]: event.target.value }),
                      }, ...(data?.modes ?? ['shared', 'read_only', 'isolated', 'disabled']).map((mode) => h('option', { key: mode, value: mode }, t('mode' + mode.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(''))))),
                  h('div', { className: 'actions' },
                    h('button', { type: 'button', disabled: busy || entry.archived || value === entry.mode, onClick: () => applyRule(entry.sessionId, value) }, t('saveRule')),
                    entry.explicit ? h('button', { type: 'button', disabled: busy || entry.archived, onClick: () => clearRule(entry.sessionId) }, t('clearRule')) : null,
                  ),
                );
              })),
        h('div', { className: 'hintCard' }, h('small', null, t('qqSceneUnavailable'))),
      ),
    );
  } else if (tab === 'data') {
    const migrations = Array.isArray(workspaceData?.migration) ? workspaceData.migration : Array.isArray(diagnostics?.migration) ? diagnostics.migration : [];
    content = h(
      React.Fragment,
      null,
      h(
        'div',
        { className: 'panel' },
        h('h3', null, t('advanced')),
        h('small', null, t('advancedHint')),
        ...advancedFields.map((field) =>
          h(FieldRow, {
            key: field.key,
            field,
            draft,
            snapshot,
            errors,
            disabled,
            onChange: (value) => changeField(field.key, value),
            t,
            lang,
          }),
        ),
        h(
          'div',
          { className: 'actions' },
          h('label', null, t('previewEvent'), h('select', { value: previewEventType, disabled, onChange: (event) => setPreviewEventType(event.target.value) }, ...EVENT_TYPES.map((type) => h('option', { key: type, value: type }, eventLabel(type, lang))))),
          h('button', { type: 'button', disabled: busy || hasErrors || !scopeId, onClick: doPreview }, t('preview')),
        ),
        h('small', null, t('previewHint')),
      ),
      h(
        'div',
        { className: 'panel' },
        h('h3', null, t('restoreDefaults')),
        h('p', null, t('restoreConfirmBody')),
        h('div', { className: 'actions' }, h('button', { type: 'button', disabled, onClick: restoreDefaults }, t('restoreDefaults'))),
      ),
      h(
        'div',
        { className: 'panel' },
        h('h3', null, t('reset')),
        h('p', null, t('confirmResetBody')),
        h('div', { className: 'actions' }, h('button', { type: 'button', className: 'danger', disabled: disabled || !overview?.state, onClick: doReset }, t('reset'))),
      ),
      h(
        'div',
        { className: 'panel' },
        h('h3', null, t('migration')),
        migrations.length === 0
          ? h('p', { className: 'muted' }, t('migrationNone'))
          : h('div', { className: 'tableWrap' },
              h('table', { className: 'dataTable' },
                h('thead', null, h('tr', null, h('th', null, t('version')), h('th', null, t('time')), h('th', null, t('migrationBackup')))),
                h('tbody', null, ...migrations.map((entry) => h('tr', { key: entry.id },
                  h('td', null, entry.fromVersion + ' → ' + entry.toVersion + ' · ' + entry.status),
                  h('td', null, entry.completedAt ? new Date(entry.completedAt).toLocaleString() : '—'),
                  h('td', { className: 'mono' }, entry.backupFile || '—'),
                ))),
              ),
            ),
        h('small', null, t('legacyPreserved')),
      ),
      h(
        'div',
        { className: 'panel' },
        h('h3', null, t('data')),
        h('div', { className: 'grid' },
          h('div', { className: 'card' }, h('small', null, t('version')), h('div', { className: 'value' }, diagnostics?.version ?? status?.version ?? '—')),
          h('div', { className: 'card' }, h('small', null, t('schema')), h('div', { className: 'value' }, diagnostics?.schemaVersion ?? status?.schemaVersion ?? '—')),
          h('div', { className: 'card' }, h('small', null, t('counts')), h('div', { className: 'value' }, diagnostics?.database?.counts ? (diagnostics.database.counts.events ?? 0) + ' / ' + (diagnostics.database.counts.interests ?? 0) : '—')),
        ),
        h('p', null, t('lifeIntegration') + '：' + (diagnostics?.integrations?.life?.available ? (diagnostics.integrations.life.enabled ? t('enabled') : t('disabled')) : t('notConnected'))),
        h('p', null, t('memoryIntegration') + '：' + (diagnostics?.integrations?.memory?.available ? (diagnostics.integrations.memory.enabled ? t('enabled') : t('disabled')) : t('notConnected'))),
        h('p', null, t('memoryWrite') + '：' + (diagnostics?.integrations?.memory?.writeAvailable ? t('memoryWriteSafe') : t('memoryWriteUnavailable'))),
        h('p', null, t('database') + '：' + (diagnostics?.database?.database ?? '—')),
        h('p', null, t('lastError') + '：' + (diagnostics?.lastError?.message ?? '—')),
        h('small', null, t('dataHint')),
        h('div', { className: 'actions' },
          h('button', { type: 'button', onClick: loadDiagnostics, disabled: busy }, t('refresh')),
          h('button', { type: 'button', onClick: doBackup, disabled: busy }, t('backup')),
        ),
      ),
      h(
        'div',
        { className: 'panel' },
        h('h3', null, t('backups')),
        backups.length === 0
          ? h('p', null, t('noBackups'))
          : h('div', { className: 'actions' },
              h('label', null, t('selectBackup'),
                h('select', { value: selectedBackup, disabled: busy, onChange: (event) => setSelectedBackup(event.target.value) },
                  ...backups.map((item) => h('option', { key: item.file, value: item.file }, item.file + ' · ' + (item.bytes ?? 0) + ' B · ' + (item.createdAt ?? ''))),
                ),
              ),
              h('button', { type: 'button', className: 'danger', onClick: doRestore, disabled: busy || !selectedBackup }, t('restoreBackup')),
            ),
        h('small', null, t('restoreBackupHint')),
      ),
    );
  } else if (tab === 'diagnostics') {
    content = h(
      React.Fragment,
      null,
      h(
        'div',
        { className: 'panel' },
        h('h3', null, t('diagnostics')),
        h('div', { className: 'grid' },
          h('div', { className: 'card' }, h('small', null, t('version')), h('div', { className: 'value' }, diagnostics?.version ?? status?.version ?? '—')),
          h('div', { className: 'card' }, h('small', null, t('stateHealthy')), h('div', { className: 'value' }, diagnostics?.state ?? status?.state ?? '—')),
          h('div', { className: 'card' }, h('small', null, t('schema')), h('div', { className: 'value' }, diagnostics?.schemaVersion ?? status?.schemaVersion ?? '—')),
          h('div', { className: 'card' }, h('small', null, t('counts')), h('div', { className: 'value' }, diagnostics?.database?.counts ? (diagnostics.database.counts.events ?? 0) + ' / ' + (diagnostics.database.counts.interests ?? 0) : '—')),
        ),
        h('p', null, t('lifeIntegration') + '：' + (diagnostics?.integrations?.life?.available ? (diagnostics.integrations.life.enabled ? t('enabled') : t('disabled')) : t('notConnected'))),
        h('p', null, t('memoryIntegration') + '：' + (diagnostics?.integrations?.memory?.available ? (diagnostics.integrations.memory.enabled ? t('enabled') : t('disabled')) : t('notConnected'))),
        h('p', null, t('memoryWrite') + '：' + (diagnostics?.integrations?.memory?.writeAvailable ? t('memoryWriteSafe') : t('memoryWriteUnavailable'))),
        h('p', null, t('database') + '：' + (diagnostics?.database?.database ?? '—')),
        h('p', null, t('lastError') + '：' + (diagnostics?.lastError?.message ?? '—')),
        h('p', null, t('configSource') + '：' + t('sameSource')),
        h('div', { className: 'actions' },
          h('button', { type: 'button', onClick: loadDiagnostics, disabled: busy }, t('refresh')),
          h('button', { type: 'button', onClick: doBackup, disabled: busy }, t('backup')),
        ),
      ),
      h(
        'div',
        { className: 'panel' },
        h('h3', null, t('backups')),
        backups.length === 0
          ? h('p', null, t('noBackups'))
          : h(
              'div',
              { className: 'actions' },
              h('label', null, t('selectBackup'),
                h(
                  'select',
                  {
                    value: selectedBackup,
                    disabled: busy,
                    onChange: (event) => setSelectedBackup(event.target.value),
                  },
                  ...backups.map((item) => h('option', { key: item.file, value: item.file }, item.file + ' · ' + (item.bytes ?? 0) + ' B · ' + (item.createdAt ?? ''))),
                ),
              ),
              h('button', { type: 'button', className: 'danger', onClick: doRestore, disabled: busy || !selectedBackup }, t('restoreBackup')),
            ),
        h('small', null, t('restoreBackupHint')),
      ),
    );
  }

  return h(
    'div',
    { 'data-amadeus-state': 'true' },
    h('style', null, CSS),
    h(
      'div',
      { className: 'shell' },
      h(
        'aside',
        { className: 'side' },
        h('div', { className: 'brand' },
          h('div', { className: 'brandMark', 'aria-hidden': 'true' }, 'A'),
          h('div', null, h('strong', null, t('title')), h('small', null, lang === 'en' ? 'Independent DSH plugin' : '独立 DSH 插件')),
        ),
        h('span', { className: 'sideTag' }, '@fg-lab/amadeus-state'),
        h('div', { className: 'sideLabel' }, 'State'),
        nav,
      ),
      h(
        'div',
        { className: 'contentArea' },
        header,
        notice,
        content,
        h(
          'div',
          { className: 'actions', style: { marginTop: '14px' } },
          h('button', { type: 'button', className: 'primary', disabled: disabled || hasErrors || !dirty || conflictRef.current, onClick: save }, busy ? t('saving') : t('save')),
          h('button', { type: 'button', disabled: busy || (!dirty && !conflictRef.current), onClick: cancel }, t('cancel')),
          h('small', null, t('adminNote')),
        ),
      ),
    ),
    h(ConfirmDialog, {
      open: confirm !== null,
      title: confirm?.title ?? '',
      body: confirm?.body ?? '',
      confirmLabel: confirm?.confirmLabel ?? t('confirm'),
      cancelLabel: t('close'),
      danger: confirm?.danger === true,
      onConfirm: () => confirm?.action?.(),
      onCancel: () => setConfirm(null),
    }),
  );
}

function isStateSubject(subject) {
  if (!subject || typeof subject !== 'object' || subject.pkg?.name !== '@fg-lab/amadeus-state') return false;
  if (subject.kind === 'bundle') return true;
  if (subject.kind === 'row') {
    return subject.row?.moduleName === '@fg-lab/amadeus-state' || subject.row?.rowId === 'amadeus-state';
  }
  return false;
}

function DetailOptionLabel(option, lang) {
  const zh = {
    off: '关闭',
    subtle: '轻微',
    standard: '标准',
    strong: '明显',
    brief: '简短状态',
    state_interests: '状态与兴趣',
  };
  const en = {
    off: 'Off',
    subtle: 'Subtle',
    standard: 'Standard',
    strong: 'Noticeable',
    brief: 'Brief state',
    state_interests: 'State and interests',
  };
  return (lang === 'en' ? en : zh)[option] || option;
}

function DetailSection({ ctx, subject }) {
  const navigatorLanguage = typeof navigator !== 'undefined' ? String(navigator.language ?? 'zh') : 'zh';
  const lang = navigatorLanguage.toLowerCase().startsWith('zh') ? 'zh' : 'en';
  const t = React.useCallback((key) => (DICT[lang] && DICT[lang][key]) || DICT.zh[key] || key, [lang]);
  const [snapshot, setSnapshot] = React.useState(null);
  const [draft, setDraft] = React.useState(null);
  const [health, setHealth] = React.useState(null);
  const [healthError, setHealthError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [error, setError] = React.useState('');
  const formRef = React.useRef(null);
  const draftRef = React.useRef(null);
  const conflictRef = React.useRef(false);
  draftRef.current = draft;

  const loadHealth = React.useCallback(async () => {
    try {
      const data = await api('/status');
      setHealth(data);
      setHealthError('');
    } catch (e) {
      setHealth(null);
      setHealthError(e.message);
    }
  }, []);

  React.useEffect(() => {
    let alive = true;
    let form;
    try {
      form = ctx.configForms.get(NS);
      formRef.current = form;
    } catch {
      setError(t('settingsUnavailable'));
    }
    if (!form) return () => { alive = false; };
    const sync = () => {
      if (!alive) return;
      const next = form.getSnapshot();
      const previousDraft = draftRef.current;
      if (hasRevisionConflict(previousDraft, next, DETAIL_FIELDS, previousDraft?.status === 'ready')) {
        conflictRef.current = true;
        setError(t('conflict'));
      }
      setSnapshot(next);
      setDraft((previous) => {
        if (previous === null || previous.status !== 'ready') return draftFromSnapshot(next);
        if (!isDirty(previous, next, DETAIL_FIELDS)) return draftFromSnapshot(next);
        return { ...previous, revision: next.revision, writable: next.writable, status: next.status };
      });
    };
    sync();
    const unsubscribe = form.subscribe(sync);
    loadHealth();
    return () => {
      alive = false;
      unsubscribe();
      // configForms.get() returns a Host-owned shared controller. Only unsubscribe this view.
    };
  }, [ctx, loadHealth, t]);

  if (!draft || !snapshot || !snapshot.value || snapshot.status === 'loading') {
    return h(
      'div',
      { 'data-amadeus-state': 'true', className: 'am-detail' },
      h('style', null, CSS),
      h('h3', null, t('detailTitle')),
      h('p', { role: 'status' }, t('loading')),
      error ? h('div', { className: 'message error', role: 'alert' }, error) : null,
    );
  }
  if (snapshot.status === 'unavailable') {
    return h(
      'div',
      { 'data-amadeus-state': 'true', className: 'am-detail' },
      h('style', null, CSS),
      h('h3', null, t('detailTitle')),
      h('p', { role: 'alert' }, t('settingsUnavailable')),
    );
  }

  const errors = validateAll(draft.values, DETAIL_FIELDS);
  const hasErrors = Object.keys(errors).length > 0;
  const dirty = isDirty(draft, snapshot, DETAIL_FIELDS);
  const disabled = busy || !draft.writable;

  const change = (key, value) => {
    setDraft((previous) => setDraftValue(previous, key, value));
    setMessage('');
    setError('');
  };

  const save = async () => {
    const form = formRef.current;
    const current = form?.getSnapshot();
    if (!form || !current) return;
    if (conflictRef.current) {
      setError(t('conflict'));
      return;
    }
    if (hasErrors) {
      setError(t('invalidField'));
      return;
    }
    const ops = buildSetOps(draft, current, DETAIL_FIELDS);
    if (ops.length === 0) {
      setMessage(t('detailNoChanges'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const ok = await form.mutate(ops, current.revision);
      if (!ok) {
        conflictRef.current = true;
        setError(t('conflict'));
        return;
      }
      conflictRef.current = false;
      setMessage(t('detailSaved'));
      await loadHealth();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    const current = formRef.current?.getSnapshot();
    if (current) setDraft(draftFromSnapshot(current));
    conflictRef.current = false;
    setError('');
    setMessage('');
  };

  const fieldControl = (field) => {
    const help = field[lang] || field.zh;
    const value = draft.values[field.key];
    if (field.type === 'boolean') {
      return h(
        'label',
        { className: 'switch' },
        h('input', {
          type: 'checkbox',
          checked: value === true,
          disabled,
          onChange: (event) => change(field.key, event.target.checked),
        }),
        h('span', null, value === true ? t('enabled') : t('disabled')),
      );
    }
    if (field.type === 'enum') {
      return h(
        'select',
        {
          value,
          disabled,
          'aria-label': help.label,
          onChange: (event) => change(field.key, event.target.value),
        },
        ...field.enum.map((option) => h('option', { key: option, value: option }, DetailOptionLabel(option, lang))),
      );
    }
    return h(
      'div',
      { className: 'inline' },
      h('input', {
        type: 'range',
        min: field.min,
        max: field.max,
        step: field.step ?? 1,
        value: Number(value),
        disabled,
        'aria-label': help.label,
        onChange: (event) => change(field.key, clampFieldValue(field, event.target.value)),
      }),
      h('input', {
        type: 'number',
        min: field.min,
        max: field.max,
        step: field.step ?? 1,
        value: Number(value),
        disabled,
        'aria-label': help.label,
        onChange: (event) => change(field.key, clampFieldValue(field, event.target.value)),
      }),
    );
  };

  return h(
    'div',
    { 'data-amadeus-state': 'true', className: 'am-detail' },
    h('style', null, CSS),
    h(
      'div',
      { className: 'panel' },
      h('h3', null, t('detailTitle')),
      h('small', null, t('detailIntro')),
      h(
        'div',
        { className: 'chips' },
        h('span', { className: 'chip ' + (health?.state === 'ready' ? 'ok' : 'warn') }, t('detailHealth') + '：' + (health?.state === 'ready' ? t('stateHealthy') : healthError || t('detailUnavailable'))),
        health?.version ? h('span', { className: 'chip' }, 'v' + health.version) : null,
        h('button', { type: 'button', className: 'ghost', disabled: busy, onClick: loadHealth }, t('refresh')),
      ),
      ...DETAIL_FIELDS.map((field) =>
        h(
          'div',
          { className: 'field', key: field.key },
          h('div', { className: 'label' },
            (field[lang] || field.zh).label,
            h('small', null, (field[lang] || field.zh).help),
            h('small', null, (field.type === 'number'
              ? t('range') + ' ' + field.min + '–' + field.max + (field.unit ? ' ' + field.unit : '') + ' · '
              : '') + t('default') + ' ' + String(field.default) + ' · ' + (field.restart ? t('restart') : t('live'))),
          ),
          h('div', { className: 'control' }, fieldControl(field)),
        ),
      ),
      error
        ? h(
            'div',
            { className: 'message error', role: 'alert' },
            error,
            error === t('conflict') ? h('div', { className: 'actions' }, h('button', { type: 'button', onClick: cancel }, t('reloadAccepted'))) : null,
          )
        : null,
      message ? h('div', { className: 'message success', role: 'status' }, message) : null,
      h(
        'div',
        { className: 'actions' },
        h('button', { type: 'button', className: 'primary', disabled: disabled || hasErrors || !dirty || conflictRef.current, onClick: save }, busy ? t('saving') : t('save')),
        h('button', { type: 'button', disabled: busy || (!dirty && !conflictRef.current), onClick: cancel }, t('cancel')),
        h('small', null, t('detailRestart')),
      ),
    ),
  );
}

return {
  inject: ['slots', 'configForms'],
  apply(ctx) {
    let settingsActive;
    let detailActive;
    // whileServed keeps `off = register(...)` and releases it only when the
    // namespace stops being served. Returning a disposer (and being idempotent
    // across repeated watch syncs) prevents a second registration with the same
    // slot id. A fire-and-forget register leaves `off` undefined and duplicates
    // the entry after disable/re-enable, HMR or a mirror refresh.
    const activate = () => {
      if (settingsActive) return settingsActive.dispose;
      let dispose = () => {};
      try {
        dispose = ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            {
              name: 'settings.section',
              id: 'amadeus-state',
              order: 25,
              label: () => 'Amadeus 状态',
            },
            () => h(Panel, { ctx }),
          ),
        ) || (() => {});
      } catch (error) {
        console.error('[amadeus-state] settings.section unavailable', error);
      }
      const disposal = () => {
        if (!settingsActive || settingsActive.dispose !== disposal) return;
        settingsActive = undefined;
        try { dispose(); } catch { /* already disposed */ }
      };
      settingsActive = { dispose: disposal };
      return disposal;
    };
    const activateDetail = () => {
      if (detailActive) return detailActive.dispose;
      let dispose = () => {};
      try {
        dispose = ctx.slots.inject('plugins.detail.section', () =>
          ctx.slots.register(
            {
              name: 'plugins.detail.section',
              id: 'amadeus-state-basic-config',
              order: 30,
            },
            (props) => (isStateSubject(props?.subject) ? h(DetailSection, { ctx, subject: props.subject }) : null),
          ),
        ) || (() => {});
      } catch (error) {
        console.error('[amadeus-state] plugins.detail.section unavailable', error);
      }
      const disposal = () => {
        if (!detailActive || detailActive.dispose !== disposal) return;
        detailActive = undefined;
        try { dispose(); } catch { /* already disposed */ }
      };
      detailActive = { dispose: disposal };
      return disposal;
    };
    if (ctx.configForms && typeof ctx.configForms.whileServed === 'function') {
      ctx.effect(() => ctx.configForms.whileServed([NS], activate), 'amadeus-state: settings page');
      ctx.effect(() => ctx.configForms.whileServed([NS], activateDetail), 'amadeus-state: plugin detail');
    } else {
      ctx.effect(() => activate(), 'amadeus-state: settings page');
      ctx.effect(() => activateDetail(), 'amadeus-state: plugin detail');
    }
  },
};

  }
});
