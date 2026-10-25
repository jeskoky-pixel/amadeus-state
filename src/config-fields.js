/**
 * One source of truth for user-visible State configuration.
 *
 * The Host schema, the validation layer, the settings page metadata, and the
 * tests all derive from this table.  Keeping the labels, defaults, ranges and
 * restart semantics here prevents the Plugin Manager form and the dedicated
 * page from drifting apart.
 */

/** @typedef {'boolean'|'number'|'enum'} FieldType */

/**
 * @typedef {object} ConfigField
 * @property {string} key
 * @property {FieldType} type
 * @property {boolean|number|string} default
 * @property {number} [min]
 * @property {number} [max]
 * @property {number} [step]
 * @property {string[]} [enum]
 * @property {string} [unit]
 * @property {boolean} restart
 * @property {'common'|'advanced'} group
 * @property {{label: string, help: string}} zh
 * @property {{label: string, help: string}} en
 */

/** @type {ConfigField[]} */
export const CONFIG_FIELDS = [
  {
    key: 'stateEvolutionEnabled',
    type: 'boolean',
    default: true,
    restart: false,
    group: 'common',
    zh: {
      label: '启用状态演化',
      help: '关闭后不再接受新的自动状态事件，但不会删除已有状态、兴趣或记录。',
    },
    en: {
      label: 'Enable state evolution',
      help: 'When off, new automatic state events are refused; existing state, interests, and history are kept.',
    },
  },
  {
    key: 'influenceStrength',
    type: 'enum',
    enum: ['off', 'subtle', 'standard', 'strong'],
    default: 'standard',
    restart: false,
    group: 'common',
    zh: {
      label: '状态对行为的影响强度',
      help: '只改变动态上下文中的倾向措辞；不会覆盖 Persona、权限或 Life 的调度。',
    },
    en: {
      label: 'Behavioural influence',
      help: 'Changes only the tendency wording in dynamic context; it never overrides Persona, permissions, or Life scheduling.',
    },
  },
  {
    key: 'eventSensitivity',
    type: 'number',
    default: 1,
    min: 0.25,
    max: 3,
    step: 0.05,
    restart: false,
    group: 'common',
    zh: {
      label: '状态变化敏感度',
      help: '缩放普通事件造成的状态变化；1 为标准。仍受单事件上限与饱和限制。',
    },
    en: {
      label: 'Event sensitivity',
      help: 'Scales ordinary event changes; 1 is standard. Per-event caps and saturation still apply.',
    },
  },
  {
    key: 'autoRecovery',
    type: 'boolean',
    default: true,
    restart: false,
    group: 'common',
    zh: {
      label: '自动时间恢复',
      help: '按真实经过时间向基准恢复；只在读取或事件时计算，不运行高频定时任务。',
    },
    en: {
      label: 'Automatic recovery',
      help: 'Recovers toward baseline using real elapsed time; computed on reads or events, never by a high-frequency timer.',
    },
  },
  {
    key: 'recoverySpeed',
    type: 'number',
    default: 1,
    min: 0.25,
    max: 3,
    step: 0.05,
    restart: false,
    group: 'common',
    zh: {
      label: '恢复速度',
      help: '缩放各状态半衰期；数值越大恢复越快。',
    },
    en: {
      label: 'Recovery speed',
      help: 'Scales each state half-life; larger values recover faster.',
    },
  },
  {
    key: 'modelAppraisalEnabled',
    type: 'boolean',
    default: false,
    restart: false,
    group: 'common',
    zh: {
      label: '模型事件评价',
      help: '允许模型主动提交受限的低信任主观评价。不会每轮额外调用模型；关闭时 state_appraise 不改变状态。',
    },
    en: {
      label: 'Model event appraisal',
      help: 'Allows a bounded low-trust appraisal, only when the model explicitly calls state_appraise. No extra model call is made per turn; when off, state_appraise changes nothing.',
    },
  },
  {
    key: 'contextInjectionMode',
    type: 'enum',
    enum: ['off', 'brief', 'state_interests'],
    default: 'brief',
    restart: false,
    group: 'common',
    zh: {
      label: '动态上下文注入',
      help: '关闭、简短状态，或状态加相关兴趣。内容有字符上限，并只读取当前会话获授权的场景。',
    },
    en: {
      label: 'Dynamic context',
      help: 'Off, a brief state line, or state plus relevant interests. Content is length-capped and reads only the current Session\'s authorized scene.',
    },
  },
  {
    key: 'autoInterestUpdate',
    type: 'boolean',
    default: true,
    restart: false,
    group: 'common',
    zh: {
      label: '兴趣自动更新',
      help: '允许合法事件更新近期兴趣活跃度；人工设定的长期偏好不会被普通事件覆盖。',
    },
    en: {
      label: 'Automatic interest updates',
      help: 'Lets legitimate events update recent activity; manual long-term preferences are not overwritten by ordinary events.',
    },
  },
  {
    key: 'moodBaseline',
    type: 'number',
    default: 0,
    min: -100,
    max: 100,
    step: 1,
    restart: false,
    group: 'advanced',
    zh: {
      label: '心情基准',
      help: '长期心情底色，范围 -100 至 +100。改动后当前心情会随时间缓慢靠拢。',
    },
    en: {
      label: 'Mood baseline',
      help: 'Long-term mood setpoint, -100 to +100. Current mood drifts toward it over time.',
    },
  },
  {
    key: 'energyBaseline',
    type: 'number',
    default: 60,
    min: 0,
    max: 100,
    step: 1,
    restart: false,
    group: 'advanced',
    zh: {
      label: '精力基准',
      help: '长期精力底色，范围 0 至 100。',
    },
    en: {
      label: 'Energy baseline',
      help: 'Long-term energy setpoint, 0 to 100.',
    },
  },
  {
    key: 'curiosityBaseline',
    type: 'number',
    default: 55,
    min: 0,
    max: 100,
    step: 1,
    restart: false,
    group: 'advanced',
    zh: {
      label: '好奇心基准',
      help: '长期好奇心底色，范围 0 至 100。',
    },
    en: {
      label: 'Curiosity baseline',
      help: 'Long-term curiosity setpoint, 0 to 100.',
    },
  },
  {
    key: 'moodHalfLifeMinutes',
    type: 'number',
    default: 240,
    min: 15,
    max: 10080,
    step: 15,
    unit: 'minutes',
    restart: false,
    group: 'advanced',
    zh: {
      label: '心情半衰期',
      help: '心情向基准恢复一半所需时间，单位分钟。',
    },
    en: {
      label: 'Mood half-life',
      help: 'Minutes for mood to recover halfway toward its baseline.',
    },
  },
  {
    key: 'energyHalfLifeMinutes',
    type: 'number',
    default: 720,
    min: 15,
    max: 10080,
    step: 15,
    unit: 'minutes',
    restart: false,
    group: 'advanced',
    zh: {
      label: '精力半衰期',
      help: '精力向基准恢复一半所需时间，单位分钟。',
    },
    en: {
      label: 'Energy half-life',
      help: 'Minutes for energy to recover halfway toward its baseline.',
    },
  },
  {
    key: 'curiosityHalfLifeMinutes',
    type: 'number',
    default: 360,
    min: 15,
    max: 10080,
    step: 15,
    unit: 'minutes',
    restart: false,
    group: 'advanced',
    zh: {
      label: '好奇心半衰期',
      help: '好奇心向基准恢复一半所需时间，单位分钟。',
    },
    en: {
      label: 'Curiosity half-life',
      help: 'Minutes for curiosity to recover halfway toward its baseline.',
    },
  },
  {
    key: 'maxEventDeltaMood',
    type: 'number',
    default: 12,
    min: 1,
    max: 50,
    step: 1,
    restart: false,
    group: 'advanced',
    zh: {
      label: '单事件心情最大变化',
      help: '单个事件对心情的最大原始增量；饱和后实际变化更小。',
    },
    en: {
      label: 'Max mood change per event',
      help: 'Maximum raw mood delta from one event; saturation makes the actual change smaller.',
    },
  },
  {
    key: 'maxEventDeltaEnergy',
    type: 'number',
    default: 10,
    min: 1,
    max: 50,
    step: 1,
    restart: false,
    group: 'advanced',
    zh: {
      label: '单事件精力最大变化',
      help: '单个事件对精力的最大原始增量。',
    },
    en: {
      label: 'Max energy change per event',
      help: 'Maximum raw energy delta from one event.',
    },
  },
  {
    key: 'maxEventDeltaCuriosity',
    type: 'number',
    default: 14,
    min: 1,
    max: 50,
    step: 1,
    restart: false,
    group: 'advanced',
    zh: {
      label: '单事件好奇心最大变化',
      help: '单个事件对好奇心的最大原始增量。',
    },
    en: {
      label: 'Max curiosity change per event',
      help: 'Maximum raw curiosity delta from one event.',
    },
  },
  {
    key: 'duplicateCooldownMinutes',
    type: 'number',
    default: 30,
    min: 0,
    max: 1440,
    step: 1,
    unit: 'minutes',
    restart: false,
    group: 'advanced',
    zh: {
      label: '模型评价冷却窗口',
      help: '无引用模型评价的速率窗口，单位分钟；0 时仍使用最小 1 分钟窗口。可信 Life/Memory 引用只按引用幂等。',
    },
    en: {
      label: 'Model appraisal cooldown',
      help: 'Rate window in minutes for unreferenced model appraisals; 0 still uses a one-minute floor. Trusted Life/Memory references are idempotent by reference.',
    },
  },
  {
    key: 'interestActivityHalfLifeMinutes',
    type: 'number',
    default: 4320,
    min: 60,
    max: 43200,
    step: 60,
    unit: 'minutes',
    restart: false,
    group: 'advanced',
    zh: {
      label: '兴趣活跃度半衰期',
      help: '近期兴趣活跃度衰减一半所需时间，单位分钟。长期偏好不受此影响。',
    },
    en: {
      label: 'Interest activity half-life',
      help: 'Minutes for recent interest activity to halve. Long-term preference is unaffected.',
    },
  },
  {
    key: 'maxInterests',
    type: 'number',
    default: 30,
    min: 1,
    max: 200,
    step: 1,
    restart: false,
    group: 'advanced',
    zh: {
      label: '最大兴趣条目数',
      help: '每个状态场景最多保留的兴趣数量；人工条目优先保留。',
    },
    en: {
      label: 'Maximum interests',
      help: 'Maximum interests per state scene; manual entries are retained first.',
    },
  },
  {
    key: 'contextMaxChars',
    type: 'number',
    default: 420,
    min: 80,
    max: 1200,
    step: 20,
    unit: 'characters',
    restart: false,
    group: 'advanced',
    zh: {
      label: '动态上下文长度上限',
      help: '注入文本的最大字符数，用于控制 Token 与前缀缓存影响。',
    },
    en: {
      label: 'Context character cap',
      help: 'Maximum injected characters, bounding token cost and prefix-cache impact.',
    },
  },
  {
    key: 'auditRetentionDays',
    type: 'number',
    default: 90,
    min: 1,
    max: 3650,
    step: 1,
    unit: 'days',
    restart: false,
    group: 'advanced',
    zh: {
      label: '变化记录保留天数',
      help: '超过期限的普通审计记录会被清理；人工重置记录保留。',
    },
    en: {
      label: 'Audit retention',
      help: 'Ordinary audit rows older than this are pruned; manual reset rows are kept.',
    },
  },
  {
    key: 'auditPageSize',
    type: 'number',
    default: 20,
    min: 5,
    max: 100,
    step: 5,
    restart: false,
    group: 'advanced',
    zh: {
      label: '变化记录每页条数',
      help: '设置页变化记录的默认分页大小。',
    },
    en: {
      label: 'Audit page size',
      help: 'Default page size for the change-history table.',
    },
  },
  {
    key: 'lifeIntegrationEnabled',
    type: 'boolean',
    default: true,
    restart: false,
    group: 'advanced',
    zh: {
      label: 'Life 联动',
      help: '通过 Life 的公开 Host 服务校验会话身份和已完成活动；Life 不存在时自动降级。',
    },
    en: {
      label: 'Life integration',
      help: 'Uses Life\'s public Host service to verify Session identity and completed activities; degrades when Life is absent.',
    },
  },
  {
    key: 'memoryIntegrationEnabled',
    type: 'boolean',
    default: false,
    restart: false,
    group: 'advanced',
    zh: {
      label: 'Memory 引用联动',
      help: '允许通过 Memory 原生工具验证一个记忆引用；重复读取同一记忆不会重复影响状态。默认关闭。',
    },
    en: {
      label: 'Memory reference integration',
      help: 'Verifies a memory reference through native Memory tools; repeated reads of the same memory never add effect again. Default off.',
    },
  },
];

/** Fields shown on the dedicated settings page (all except the DB path). */
export const PUBLIC_FIELDS = CONFIG_FIELDS;

/** @type {Record<string, unknown>} */
export const CONFIG_DEFAULTS = Object.freeze(
  Object.fromEntries(CONFIG_FIELDS.map((field) => [field.key, field.default])),
);

/** Field lookup by key. */
export const CONFIG_FIELD_BY_KEY = Object.freeze(
  Object.fromEntries(CONFIG_FIELDS.map((field) => [field.key, field])),
);

/**
 * Safe metadata for the browser page.  No paths, secrets, or runtime objects.
 * @returns {Array<Record<string, unknown>>} JSON-serializable field metadata.
 */
export function publicFieldMetadata() {
  return PUBLIC_FIELDS.map((field) => ({
    key: field.key,
    type: field.type,
    default: field.default,
    min: field.min,
    max: field.max,
    step: field.step,
    enum: field.enum,
    unit: field.unit,
    restart: field.restart,
    group: field.group,
    zh: field.zh,
    en: field.en,
  }));
}
