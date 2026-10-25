/**
 * In-process test entry.
 *
 * `node --test` spawns one child per file; some confined desktop sandboxes deny
 * captured child stdio.  Importing the test modules in one Node process keeps
 * `npm test` usable there while using the same `node:test` assertions and TAP
 * output in ordinary environments.
 */

import './config.test.js';
import './schema-serialization.test.js';
import './engine.test.js';
import './interests.test.js';
import './store.test.js';
import './security.test.js';
import './tools.test.js';
import './http.test.js';
import './gui-state.test.js';
import './gui-product.test.js';
import './client.test.js';
import './package.test.js';
import './apply.test.js';
