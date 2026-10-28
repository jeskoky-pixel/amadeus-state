/**
 * Bounded dynamic context for the current Session.
 *
 * The contribution is a runtime context, not a Persona section.  It is short,
 * reads only the current Session's authorized scene, and is length-capped so a
 * changing few numbers cannot dominate the prompt or rewrite the fixed
 * Persona.  Failures and unknown identity contribute nothing.
 */

import { safeError } from './model.js';

/**
 * @param {Record<string, any>} context - prompt assembly context.
 * @returns {string|undefined} trusted Session id.
 */
function sessionIdOf(context) {
  const id = context?.agent?.session?.id ?? context?.session?.id;
  return typeof id === 'string' && id ? id : undefined;
}

/**
 * Render the context body without any database write.
 * @param {Record<string, any>} context - prompt assembly context.
 * @param {import('./service.js').StateService} service - service.
 * @param {() => Record<string, any>} getConfig - effective config getter.
 * @returns {string} bounded text, possibly empty.
 */
export function renderStateContext(context, service, getConfig) {
  const cfg = getConfig();
  if (cfg.contextInjectionMode === 'off') return '';
  const sessionId = sessionIdOf(context);
  if (!sessionId) return '';
  try {
    const detailed = cfg.contextInjectionMode === 'detailed' || cfg.contextInjectionMode === 'state_interests';
    const view = service.viewForSession(sessionId, { includeInterests: detailed });
    const state = view.state;
    const baseline = view.baseline;
    const explanation = view.explanation;
    const scopeLabel = view.access?.scopeKind === 'workspace'
      ? '工作区共享主状态'
      : view.access?.mode === 'isolated'
        ? '本会话独立状态'
        : '当前状态';
    let text = `【Amadeus 状态】${scopeLabel}：心情 ${signed(state.mood)}（基准 ${signed(baseline.mood)}，${explanation.direction.mood}）｜精力 ${format(state.energy)}/100（基准 ${format(baseline.energy)}）｜好奇 ${format(state.curiosity)}/100（基准 ${format(baseline.curiosity)}，${explanation.direction.curiosity}）。`;
    if (detailed && view.interests.length > 0) {
      const interests = view.interests
        .slice(0, 4)
        .map((interest) => `${interest.name}（活跃 ${format(interest.activity)}）`)
        .join('、');
      text += `\n当前兴趣：${interests}。`;
    }
    if (cfg.influenceStrength !== 'off') {
      text += `\n倾向：${view.tendency}`;
    } else {
      text += '\n倾向：状态仅用于观察，不改变行为；以 Persona、用户请求、权限与调度为准。';
    }
    text += view.access?.mode === 'read_only'
      ? '\n（只读共享：本会话不会修改主状态。仅为有界倾向，不覆盖 Persona、权限或 Life 调度。）'
      : '\n（仅为有界倾向，不覆盖 Persona、权限或 Life 调度，也不读取其他会话的原始事件原因。）';
    return bound(text, cfg.contextMaxChars);
  } catch (error) {
    // A policy denial (disabled Session, foreign Workspace, missing registry)
    // is an expected empty contribution, not a health error to log each turn.
    if (!['STATE_UNAUTHORIZED', 'STATE_DISABLED', 'STATE_UNAVAILABLE'].includes(error?.code)) {
      service.noteError(error);
    }
    return '';
  }
}

/**
 * @param {number} value - number.
 * @returns {string} signed display.
 */
function signed(value) {
  const n = Math.round(Number(value) * 10) / 10;
  return n > 0 ? `+${n}` : String(n);
}

/**
 * @param {number} value - number.
 * @returns {string} compact display.
 */
function format(value) {
  return String(Math.round(Number(value) * 10) / 10);
}

/**
 * @param {string} text - text.
 * @param {number} max - maximum characters.
 * @returns {string} bounded text.
 */
function bound(text, max) {
  if (text.length <= max) return text;
  const cut = Math.max(0, max - 1);
  return `${text.slice(0, cut).replace(/[\s，；。]+$/g, '')}…`;
}

/**
 * Register the runtime context on an optional systemPrompt child.
 * @param {Record<string, any>} ctx - Cordis context.
 * @param {import('./service.js').StateService} service - service.
 * @param {() => Record<string, any>} getConfig - config getter.
 */
export function registerStateContext(ctx, service, getConfig) {
  ctx.inject(['systemPrompt'], (child) => {
    if (!child.systemPrompt || typeof child.systemPrompt.context !== 'function') return;
    child.effect(
      () =>
        child.systemPrompt.context({
          name: 'amadeus-state',
          order: 95,
          interpolate: false,
          text: (assemblyContext) => renderStateContext(assemblyContext, service, getConfig),
        }),
      'amadeus-state: dynamic context',
    );
  });
}

/** Exported for tests. */
export const __contextInternals = { bound, sessionIdOf, safeError };
