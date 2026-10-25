/**
 * Authenticated admin API for the native settings page.
 *
 * Browser code never sees SQLite.  Every request must:
 * 1. be same-origin (Host/Origin fence plus no cross-site fetch metadata),
 * 2. carry the State marker header (a CSRF defence for writes),
 * 3. pass DSH Connection authentication,
 * 4. resolve to the authenticated owner principal.
 *
 * Loopback alone is never treated as administrator authorization.
 */

import {
  StateConflictError,
  StateDisabledError,
  StateError,
  StateIntegrationError,
  StateNotFoundError,
  StateStorageError,
  StateUnauthorizedError,
  StateUnavailableError,
  StateValidationError,
  safeError,
} from './model.js';
import { isOwnerAdmission, scopeView } from './scope.js';

const PREFIX = '/api/amadeus-state';
const MAX_BODY_BYTES = 64 * 1024;

/**
 * @param {Record<string, any>} req - Node request.
 * @returns {boolean} whether the request is same-origin and not cross-site.
 */
export function sameOrigin(req) {
  const host = String(req.headers?.host ?? '');
  if (!host) return false;
  if (req.headers?.['sec-fetch-site'] === 'cross-site') return false;
  const origin = req.headers?.origin;
  if (origin !== undefined) {
    try {
      const parsed = new URL(String(origin));
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
      if (parsed.host !== host) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * @param {unknown} error - thrown.
 * @returns {number} HTTP status.
 */
function statusFor(error) {
  if (error instanceof StateUnauthorizedError) return 403;
  if (error instanceof StateNotFoundError) return 404;
  if (error instanceof StateConflictError) return 409;
  if (error instanceof StateValidationError) return 400;
  if (error instanceof StateDisabledError) return 409;
  if (error instanceof StateIntegrationError) return 424;
  if (error instanceof StateStorageError) return 503;
  if (error instanceof StateUnavailableError) return 503;
  return 500;
}

/**
 * @param {import('node:http').ServerResponse} res - response.
 * @param {number} status - status.
 * @param {Record<string, unknown>} payload - JSON body.
 */
function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'none'",
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * @param {import('node:http').IncomingMessage} req - request.
 * @returns {Promise<Record<string, unknown>>} parsed JSON.
 */
async function readBody(req) {
  const contentType = String(req.headers?.['content-type'] ?? '');
  if (!contentType.toLowerCase().startsWith('application/json')) {
    throw new StateValidationError('POST requests require application/json');
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new StateValidationError('request body is too large');
    chunks.push(chunk);
  }
  if (size === 0) throw new StateValidationError('request body is required');
  let parsed;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new StateValidationError('request body must be valid JSON');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new StateValidationError('request body must be a JSON object');
  }
  return parsed;
}

/**
 * @param {Record<string, any>} connection - DSH Connection service.
 * @param {Record<string, any>} req - request.
 * @returns {{ok: true}|{ok: false, status: number, message: string}} decision.
 */
export function authorizeRequest(connection, req) {
  if (!connection || typeof connection.admit !== 'function') {
    return { ok: false, status: 503, message: 'this DSH version cannot verify an owner session for settings' };
  }
  let admission;
  try {
    admission = connection.admit(req);
  } catch {
    return { ok: false, status: 403, message: 'request authentication failed' };
  }
  if (!admission || admission.rejection !== undefined) {
    return { ok: false, status: Number(admission?.rejection ?? 403), message: 'DSH authentication is required' };
  }
  if (!isOwnerAdmission(admission)) {
    return { ok: false, status: 403, message: 'only the authenticated owner may manage State settings' };
  }
  return { ok: true };
}

/**
 * @param {URL} url - parsed request URL.
 * @param {string} name - parameter.
 * @returns {string} required non-empty value.
 */
function query(url, name) {
  const value = url.searchParams.get(name);
  if (typeof value !== 'string' || !value) throw new StateValidationError(`${name} is required`);
  return value;
}

/**
 * Mount the admin route under an optional webServer child.
 * @param {Record<string, any>} ctx - Cordis context.
 * @param {import('./service.js').StateService} service - service.
 */
export function mountHttp(ctx, service) {
  ctx.inject(['webServer', 'connection'], (child) => {
    if (!child.webServer || typeof child.webServer.register !== 'function') return;
    child.effect(
      () =>
        child.webServer.register({
          kind: 'prefix',
          path: PREFIX,
          handler: async (req, res) => {
            const url = new URL(String(req.url ?? '/'), 'http://localhost');
            if (!url.pathname.startsWith(PREFIX)) return send(res, 404, { ok: false, error: 'not found' });
            if (!sameOrigin(req)) return send(res, 403, { ok: false, error: 'same-origin request required' });
            if (req.method === 'POST' && req.headers?.['x-amadeus-state'] !== '1') {
              return send(res, 403, { ok: false, error: 'missing State request marker' });
            }
            let connection = child.connection;
            if (connection === undefined) {
              try {
                connection = typeof child.get === 'function' ? child.get('connection') : undefined;
              } catch {
                connection = undefined;
              }
            }
            const auth = authorizeRequest(connection, req);
            if (!auth.ok) return send(res, auth.status, { ok: false, error: auth.message });
            try {
              const path = url.pathname.slice(PREFIX.length) || '/';
              if (req.method === 'GET') {
                if (path === '/status') {
                  const health = service.health();
                  return send(res, 200, {
                    ok: true,
                    data: {
                      ...health,
                      admin: true,
                      now: new Date().toISOString(),
                    },
                  });
                }
                if (path === '/scopes') {
                  const scopes = service.store.listScopes().map((row) => {
                    const authorization = service.scopeAuthorization(row);
                    return {
                      ...scopeView(row),
                      authorized: authorization.authorized,
                      authorizationReason: authorization.reason,
                    };
                  });
                  return send(res, 200, { ok: true, data: { scopes } });
                }
                if (path === '/overview') {
                  const scope = query(url, 'scope');
                  const view = service.adminView(scope, { includeInterests: true, includeAudit: false });
                  delete view.config;
                  return send(res, 200, { ok: true, data: view });
                }
                if (path === '/interests') {
                  const scope = query(url, 'scope');
                  const row = service.store.getScope(scope);
                  if (row === undefined) throw new StateNotFoundError('state scope was not found');
                  const authorization = service.scopeAuthorization(row);
                  if (!authorization.authorized) throw new StateUnauthorizedError('scope authorization is not valid');
                  return send(res, 200, {
                    ok: true,
                    data: { interests: service.listAllInterests(scope), scope: scopeView(row) },
                  });
                }
                if (path === '/events') {
                  const scope = query(url, 'scope');
                  const row = service.store.getScope(scope);
                  if (row === undefined) throw new StateNotFoundError('state scope was not found');
                  const authorization = service.scopeAuthorization(row);
                  if (!authorization.authorized) throw new StateUnauthorizedError('scope authorization is not valid');
                  const page = Number(url.searchParams.get('page') ?? 1);
                  const pageSize = Number(url.searchParams.get('pageSize') ?? service.config().auditPageSize);
                  if (!Number.isInteger(page) || page < 1) throw new StateValidationError('page must be a positive integer');
                  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
                    throw new StateValidationError('pageSize must be between 1 and 100');
                  }
                  return send(res, 200, {
                    ok: true,
                    data: service.auditPage(scope, { limit: pageSize, offset: (page - 1) * pageSize }),
                  });
                }
                if (path === '/backups') {
                  return send(res, 200, { ok: true, data: { backups: service.listBackups() } });
                }
                if (path === '/diagnostics') {
                  const health = service.health();
                  let schema = null;
                  try {
                    schema = service.store.inspect();
                  } catch (error) {
                    schema = { error: safeError(error) };
                  }
                  return send(res, 200, {
                    ok: true,
                    data: {
                      ...health,
                      schema,
                      effectiveConfig: service.config(),
                    },
                  });
                }
                return send(res, 404, { ok: false, error: 'unknown State endpoint' });
              }
              if (req.method === 'POST') {
                const body = await readBody(req);
                if (path === '/preview') {
                  const data = service.preview({
                    scopeId: String(body.scope ?? ''),
                    eventType: String(body.eventType ?? 'meaningful_interaction'),
                    config: body.config,
                  });
                  return send(res, 200, { ok: true, data });
                }
                if (path === '/interests') {
                  const action = String(body.action ?? '');
                  const scopeId = String(body.scope ?? '');
                  if (action === 'add') {
                    return send(res, 200, {
                      ok: true,
                      data: {
                        interest: service.addInterest({
                          scopeId,
                          name: body.name,
                          baseline: body.baseline,
                          aliases: body.aliases,
                          note: body.note,
                        }),
                      },
                    });
                  }
                  if (action === 'update') {
                    return send(res, 200, {
                      ok: true,
                      data: {
                        interest: service.updateInterest({
                          scopeId,
                          id: String(body.id ?? ''),
                          name: body.name,
                          baseline: body.baseline,
                          aliases: body.aliases,
                        }),
                      },
                    });
                  }
                  if (action === 'disable' || action === 'delete') {
                    return send(res, 200, {
                      ok: true,
                      data: service.manageInterest({
                        scopeId,
                        id: String(body.id ?? ''),
                        disabled: body.disabled === undefined ? action === 'disable' : body.disabled === true,
                        delete: action === 'delete',
                      }),
                    });
                  }
                  throw new StateValidationError('action must be add, update, disable, or delete');
                }
                if (path === '/reset') {
                  return send(res, 200, {
                    ok: true,
                    data: service.resetState({
                      scopeId: String(body.scope ?? ''),
                      expectedRevision: Number(body.expectedRevision),
                      confirm: String(body.confirm ?? ''),
                    }),
                  });
                }
                if (path === '/backup') {
                  if (body.confirm !== 'BACKUP') throw new StateValidationError('explicit BACKUP confirmation is required');
                  return send(res, 200, { ok: true, data: service.backup('manual') });
                }
                if (path === '/restore') {
                  return send(res, 200, {
                    ok: true,
                    data: service.restoreBackup({
                      file: body.file,
                      confirm: body.confirm,
                    }),
                  });
                }
                return send(res, 404, { ok: false, error: 'unknown State endpoint' });
              }
              return send(res, 405, { ok: false, error: 'method not allowed' });
            } catch (error) {
              if (!(error instanceof StateError)) service.noteError(error);
              return send(res, statusFor(error), {
                ok: false,
                error: safeError(error),
                code: error instanceof StateError ? error.code : 'STATE_INTERNAL',
              });
            }
          },
        }),
      'amadeus-state: admin HTTP',
    );
  });
}

/** Exported for tests. */
export const __httpInternals = { statusFor, readBody, PREFIX };
