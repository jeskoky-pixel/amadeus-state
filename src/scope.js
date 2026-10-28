/**
 * Trusted identity and scope resolution.
 *
 * Model arguments never participate.  A DSH Session id comes from the live
 * tool execution context or prompt context.  When Life is available and
 * configured, its public binding/scene service is the authority; an inactive
 * binding or an unexpected lookup failure is fail-closed.  Without Life, State
 * uses a private local scene keyed by the DSH Session id, which is safe by
 * construction but cannot claim Life's persona/scene facts.
 */

import { StateUnauthorizedError } from './model.js';

/**
 * @param {unknown} workspaceId - candidate DSH Workspace id.
 * @returns {string} validated opaque Workspace id.
 */
export function requireWorkspaceId(workspaceId) {
  if (
    typeof workspaceId !== 'string' ||
    workspaceId.trim().length === 0 ||
    workspaceId.length > 200 ||
    /[\r\n\u0000]/.test(workspaceId)
  ) {
    throw new StateUnauthorizedError('a valid DSH Workspace id is required');
  }
  return workspaceId;
}

/**
 * Identity of the one Workspace-wide shared state.  It is deliberately not a
 * Session scope: membership is verified against the live DSH registry on every
 * read, injection, and event, never inferred from a display title or path.
 * @param {string} workspaceId - DSH Workspace id.
 * @returns {Record<string, unknown>} identity.
 */
export function workspaceIdentity(workspaceId) {
  const id = requireWorkspaceId(workspaceId);
  return {
    kind: 'local',
    scopeKind: 'workspace',
    workspaceId: id,
    personaId: 'amadeus:workspace',
    sceneId: `workspace:${id}`,
    privacy: 'shared',
    scopeId: `workspace:${id}`,
    ownerSessionId: null,
    sessionId: null,
    bindingRevision: null,
    authorizationRef: 'workspace:binding',
    identitySource: 'workspace',
  };
}

/**
 * One Session's independent state.  It is a private local scope and can never
 * read or write the Workspace main scope.
 * @param {string} sessionId - DSH Session id.
 * @returns {Record<string, unknown>} identity.
 */
export function isolatedIdentity(sessionId) {
  return { ...localIdentity(sessionId), identitySource: 'isolated_session' };
}

/**
 * @param {unknown} error - Life error.
 * @returns {boolean} whether Life answered "not found".
 */
export function isLifeNotFound(error) {
  return error?.code === 'LIFE_NOT_FOUND' || /\bnot found\b/i.test(String(error?.message ?? ''));
}

/**
 * @param {unknown} sessionId - untrusted candidate.
 * @returns {string} validated DSH Session id.
 */
export function requireSessionId(sessionId) {
  if (typeof sessionId !== 'string' || sessionId.trim().length === 0 || sessionId.length > 200) {
    throw new StateUnauthorizedError('a DSH Session is required for State');
  }
  return sessionId;
}

/**
 * Local private identity.  It never claims a Persona or Scene from Life.
 * @param {string} sessionId - DSH Session id.
 * @returns {Record<string, unknown>} identity.
 */
export function localIdentity(sessionId) {
  const id = requireSessionId(sessionId);
  return {
    kind: 'local',
    personaId: 'local:default',
    sceneId: `local:session:${id}`,
    privacy: 'private',
    scopeId: `local:${id}`,
    ownerSessionId: id,
    sessionId: id,
    bindingRevision: null,
    authorizationRef: 'local:session',
    identitySource: 'local_private',
  };
}

/**
 * Resolve the trusted identity of a DSH Session.
 * @param {{sessionId: string, life?: Record<string, any>, config?: Record<string, any>}} input - context.
 * @returns {Record<string, unknown>} identity.
 */
export function resolveSessionIdentity({ sessionId, life, config }) {
  const id = requireSessionId(sessionId);
  const integration = config?.lifeIntegrationEnabled !== false;
  if (!integration || !life) return localIdentity(id);

  if (typeof life.getSessionBinding !== 'function') {
    // Life exists but does not expose the required public contract.  Local
    // private state remains safe; no cross-scope claim is made.
    return { ...localIdentity(id), lifeContract: 'unsupported' };
  }

  let binding;
  try {
    binding = life.getSessionBinding(id);
  } catch (error) {
    if (isLifeNotFound(error)) {
      return { ...localIdentity(id), identitySource: 'life_unbound' };
    }
    throw new StateUnauthorizedError('Life identity lookup failed; refusing to read or write State', {
      cause: String(error?.code ?? error?.message ?? error),
    });
  }
  if (!binding || typeof binding !== 'object') {
    throw new StateUnauthorizedError('Life returned no usable Session binding; refusing to continue');
  }
  if (binding.active !== true) {
    throw new StateUnauthorizedError('this Session binding was revoked; State access is closed', {
      sessionId: id,
      bindingRevision: binding.revision,
    });
  }
  if (typeof binding.personaId !== 'string' || typeof binding.sceneId !== 'string') {
    throw new StateUnauthorizedError('Life returned an incomplete Session binding; refusing to continue');
  }

  let scene;
  try {
    scene = typeof life.getScene === 'function' ? life.getScene(binding.sceneId) : undefined;
  } catch (error) {
    throw new StateUnauthorizedError('Life Scene lookup failed; refusing to read or write State', {
      cause: String(error?.code ?? error?.message ?? error),
    });
  }
  const privacy = scene?.privacy === 'shared' ? 'shared' : 'private';
  return {
    kind: 'life',
    personaId: binding.personaId,
    sceneId: binding.sceneId,
    privacy,
    scopeId: `life:${binding.sceneId}`,
    ownerSessionId: id,
    sessionId: id,
    bindingRevision: typeof binding.revision === 'number' ? binding.revision : null,
    authorizationRef: typeof binding.authorizationRef === 'string' ? binding.authorizationRef : 'life:binding',
    identitySource: 'life',
    scene,
  };
}

/**
 * Whether a DSH connection admission represents the authenticated owner.
 * A loopback socket alone is not proof; Connection has already applied its
 * Host/Origin fence and browser authentication before returning a peer.
 * @param {Record<string, any>|undefined} admission - `connection.admit()` result.
 * @returns {boolean} true only for an owner principal.
 */
export function isOwnerAdmission(admission) {
  return admission?.peer?.principal?.kind === 'owner';
}

/**
 * Shape a scope row for the admin selector without exposing private evidence.
 * @param {Record<string, any>} row - scope row.
 * @returns {Record<string, unknown>} safe view.
 */
export function scopeView(row) {
  return {
    id: row.id,
    kind: row.scope_kind === 'workspace' ? 'workspace' : 'session',
    workspaceId: row.workspace_id ?? null,
    personaId: row.persona_id,
    sceneId: row.scene_id,
    privacy: row.privacy,
    source: row.scope_kind === 'workspace' ? 'workspace' : row.source,
    ownerSessionId: row.owner_session_id,
    bindingRevision: row.binding_revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
