/**
 * Authoritative Workspace membership.
 *
 * The official DSH `workspaceRegistry` is the only source of Workspace identity
 * and Session membership.  Display titles and filesystem paths are never used
 * to decide identity.  Every caller re-reads the live registry, so a removed
 * Session or an unavailable/deleted Workspace fails closed without a cache.
 *
 * This module is pure with respect to State storage; it only reads the public
 * Host service it is given.
 */

import { requireSessionId, requireWorkspaceId } from './scope.js';

/** @typedef {{workspaceId: string, title: string, sessionIds: string[], archivedSessionIds: string[]}} WorkspaceRecord */

/**
 * Read the public registry service without requiring a hard dependency.
 * @param {Record<string, any>|undefined} ctx - Cordis context.
 * @returns {Record<string, any>|undefined} registry when available and usable.
 */
export function workspaceRegistryOf(ctx) {
  let registry;
  try {
    registry = ctx?.get?.('workspaceRegistry') ?? ctx?.workspaceRegistry;
  } catch {
    return undefined;
  }
  if (!registry || typeof registry.get !== 'function' || typeof registry.list !== 'function') return undefined;
  return registry;
}

/**
 * @param {unknown} entity - registry workspace entity.
 * @returns {WorkspaceRecord|null} safe projection, or null when malformed.
 */
export function safeWorkspace(entity) {
  if (!entity || typeof entity !== 'object') return null;
  const workspaceId = entity.id ?? entity.workspaceId;
  if (typeof workspaceId !== 'string' || workspaceId.length === 0) return null;
  if (!Array.isArray(entity.sessionIds)) return null;
  return {
    workspaceId,
    title: typeof entity.title === 'string' ? entity.title.slice(0, 120) : '',
    sessionIds: entity.sessionIds.filter((id) => typeof id === 'string'),
    archivedSessionIds: [],
  };
}

/**
 * List Workspaces for the owner picker.  Paths are deliberately omitted.
 * @param {Record<string, any>|undefined} registry - registry service.
 * @returns {{available: boolean, workspaces: {workspaceId: string, title: string, sessionCount: number}[]}} safe list.
 */
export function listWorkspaces(registry) {
  if (!registry || typeof registry.list !== 'function') return { available: false, workspaces: [] };
  let entities;
  try {
    entities = registry.list();
  } catch {
    return { available: false, workspaces: [] };
  }
  if (!Array.isArray(entities)) return { available: false, workspaces: [] };
  const workspaces = [];
  for (const entity of entities) {
    const record = safeWorkspace(entity);
    if (record === null) continue;
    workspaces.push({
      workspaceId: record.workspaceId,
      title: record.title,
      sessionCount: record.sessionIds.length,
    });
  }
  return { available: true, workspaces };
}

/**
 * Live archived Session ids.  An archived Session remains a Workspace member
 * internally, but State must fail closed for it.
 * @param {Record<string, any>|undefined} registry - registry service.
 * @returns {Set<string>} archived ids.
 */
export function archivedSessionIds(registry) {
  const ids = registry?.archivedSessionIds;
  if (!Array.isArray(ids)) return new Set();
  return new Set(ids.filter((id) => typeof id === 'string'));
}

/**
 * Resolve one Session against the currently bound Workspace.
 *
 * @param {{registry: Record<string, any>|undefined, workspaceId: string, sessionId: string}} input - authority input.
 * @returns {{state: 'member'|'registry_unavailable'|'workspace_missing'|'archived'|'other_workspace'|'not_member', workspace?: WorkspaceRecord, archived?: boolean}} decision.
 */
export function resolveWorkspaceSession({ registry, workspaceId, sessionId }) {
  const workspace = requireWorkspaceId(workspaceId);
  const session = requireSessionId(sessionId);
  if (!registry || typeof registry.get !== 'function') return { state: 'registry_unavailable' };
  let entity;
  try {
    entity = registry.get(workspace);
  } catch {
    return { state: 'registry_unavailable' };
  }
  if (!entity) return { state: 'workspace_missing' };
  const record = safeWorkspace(entity);
  if (record === null || record.workspaceId !== workspace) return { state: 'workspace_missing' };
  if (archivedSessionIds(registry).has(session)) return { state: 'archived', workspace: record, archived: true };
  if (!record.sessionIds.includes(session)) {
    // Distinguish "belongs to another Workspace" from "not a member of any
    // Workspace" for diagnostics, without exposing another Workspace's data.
    let other = false;
    try {
      other = registry
        .list()
        .some((candidate) => {
          const safe = safeWorkspace(candidate);
          return safe !== null && safe.workspaceId !== workspace && safe.sessionIds.includes(session);
        });
    } catch {
      other = false;
    }
    return { state: other ? 'other_workspace' : 'not_member', workspace: record };
  }
  return { state: 'member', workspace: record };
}

/**
 * Verify that one Workspace still exists in the live registry.
 * @param {Record<string, any>|undefined} registry - registry service.
 * @param {string} workspaceId - Workspace id.
 * @returns {Record<string, any>|null} live entity, or null.
 */
export function liveWorkspace(registry, workspaceId) {
  if (!registry || typeof registry.get !== 'function') return null;
  try {
    return registry.get(requireWorkspaceId(workspaceId)) ?? null;
  } catch {
    return null;
  }
}

/** Exported for tests. */
export const __workspaceInternals = {};
