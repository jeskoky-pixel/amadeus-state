/**
 * Bounded optional adapters for Life and Memory.
 *
 * Both adapters use only public seams that exist in the installed packages:
 * - Life: `ctx.get('life')` and its documented identity/activity methods.
 * - Memory (Mneme): native read-only `memory_get` model tool executed
 *   under the same trusted tool execution context.
 *
 * No private module, database, or file of either package is imported.
 */

import { randomUUID } from 'node:crypto';
import { safeError } from './model.js';

/**
 * Life adapter.  Every method fails cleanly when Life is absent; callers decide
 * whether that is degradation or an error for the requested operation.
 * @param {Record<string, any>} ctx - Cordis context.
 * @returns {Record<string, any>} adapter.
 */
export function createLifeAdapter(ctx) {
  const service = () => {
    try {
      return ctx.get?.('life');
    } catch {
      return undefined;
    }
  };
  return {
    contract: 'life-host-service',
    available() {
      const life = service();
      return Boolean(life && typeof life.getSessionBinding === 'function');
    },
    health() {
      const life = service();
      return {
        available: Boolean(life),
        identity: Boolean(life && typeof life.getSessionBinding === 'function'),
        activity: Boolean(life && typeof life.getActivityStatus === 'function'),
      };
    },
    getSessionBinding(sessionId) {
      const life = service();
      if (!life || typeof life.getSessionBinding !== 'function') {
        throw Object.assign(new Error('Life identity service is unavailable'), { code: 'LIFE_UNAVAILABLE' });
      }
      return life.getSessionBinding(sessionId);
    },
    getScene(sceneId) {
      const life = service();
      if (!life || typeof life.getScene !== 'function') return undefined;
      return life.getScene(sceneId);
    },
    async getActivityStatus(activityId, scope) {
      const life = service();
      if (!life || typeof life.getActivityStatus !== 'function') {
        throw Object.assign(new Error('Life activity service is unavailable'), { code: 'LIFE_UNAVAILABLE' });
      }
      return life.getActivityStatus(activityId, scope);
    },
    getSharedLifeView(options) {
      const life = service();
      if (!life || typeof life.getSharedLifeView !== 'function') return undefined;
      return life.getSharedLifeView(options);
    },
    sceneVisibleTo(options) {
      const life = service();
      if (!life || typeof life.sceneVisibleTo !== 'function') return false;
      return life.sceneVisibleTo(options);
    },
  };
}

/**
 * Memory adapter over native Mneme tools.
 * @param {Record<string, any>} ctx - Cordis context.
 * @returns {Record<string, any>} adapter.
 */
export function createMemoryAdapter(ctx) {
  const tools = () => {
    try {
      return ctx.get?.('tools');
    } catch {
      return undefined;
    }
  };
  const getTool = (name, agent) => {
    try {
      return tools()?.get?.(name, agent);
    } catch {
      return undefined;
    }
  };
  const execute = async (name, args, exec) => {
    const runtime = tools();
    if (!runtime || typeof runtime.execute !== 'function') {
      throw Object.assign(new Error('Memory tools are unavailable'), { code: 'MEMORY_UNAVAILABLE' });
    }
    return runtime.execute({
      name,
      arguments: args,
      callId: `state-memory-${randomUUID()}`,
      agent: exec?.agent,
      ...(exec?.token === undefined ? {} : { parent: exec.token }),
      ...(exec?.signal === undefined ? {} : { signal: exec.signal }),
    });
  };
  return {
    contract: 'mneme-native-tools:memory_get',
    // No current Mneme Host contract proves that a write is readable only
    // inside the exact originating Life Scene. The adapter intentionally has
    // no write method and no hidden memory_save path.
    supportsSceneScopedWrite: false,
    available() {
      return Boolean(getTool('memory_get'));
    },
    health() {
      return {
        available: Boolean(getTool('memory_get')),
        read: Boolean(getTool('memory_get')),
        write: false,
        writeReason: 'scene_scoped_memory_contract_unavailable',
      };
    },
    /**
     * Verify one memory reference under the caller's trusted execution.
     * Returns only stable metadata; private content stays in Memory.
     * @param {Record<string, any>} exec - tool execution context.
     * @param {string} id - memory id.
     * @returns {Promise<Record<string, any>|null>} safe metadata.
     */
    async getMemory(exec, id) {
      if (!getTool('memory_get', exec?.agent)) return null;
      const result = await execute('memory_get', { id }, exec);
      if (!result || result.isError === true) return null;
      const memory = result.value?.memory ?? result.value;
      if (!memory || typeof memory !== 'object' || typeof memory.id !== 'string') return null;
      return {
        id: memory.id,
        title: typeof memory.title === 'string' ? memory.title.slice(0, 120) : '',
        type: typeof memory.type === 'string' ? memory.type.slice(0, 40) : 'unknown',
        updatedAt: typeof memory.updated_at === 'string' ? memory.updated_at : null,
        agentScope: typeof memory.agent_scope === 'string' ? memory.agent_scope : null,
        workspaceScope: typeof memory.workspace_scope === 'string' ? memory.workspace_scope : null,
      };
    },
    /** Redact adapter failures before they reach health or logs. */
    safe(error) {
      return safeError(error);
    },
  };
}
