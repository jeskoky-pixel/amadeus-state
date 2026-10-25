/**
 * Local, isolated performance probe for the ordinary read/write/context path.
 * It creates only a fresh OS temp database and removes it afterwards.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { StateStore } from '../src/store.js';
import { StateService } from '../src/service.js';
import { normalizeConfig } from '../src/config.js';
import { renderStateContext } from '../src/context.js';
import { localIdentity } from '../src/scope.js';

const dir = mkdtempSync(join(tmpdir(), 'state-bench-'));
const databasePath = join(dir, 'state.sqlite');
const config = normalizeConfig({});
const clock = () => Date.now();
let store;
try {
  store = new StateStore({ databasePath, clock, backupLimit: 2 });
  const service = new StateService({
    store,
    getConfig: () => config,
    clock,
    version: '1.0.0',
    startedAt: new Date().toISOString(),
  });
  const identity = localIdentity('bench-session');
  // Warm-up: open, ensure scope, and first render are excluded from read timing.
  service.viewForSession('bench-session');
  renderStateContext({ agent: { session: { id: 'bench-session' } } }, service, () => config);

  const readIterations = 1000;
  let start = performance.now();
  for (let i = 0; i < readIterations; i += 1) service.viewForSession('bench-session');
  const readMs = performance.now() - start;

  const writeIterations = 200;
  start = performance.now();
  for (let i = 0; i < writeIterations; i += 1) {
    await service.recordEvent({
      identity,
      type: 'meaningful_interaction',
      source: 'host',
      trust: 'trusted',
      summary: `benchmark synthetic event ${i}`,
      idempotencyKey: `bench:${i}`,
      topic: i % 2 === 0 ? 'synthetic astronomy' : 'synthetic maps',
      interestDelta: 1,
    });
  }
  const writeMs = performance.now() - start;
  const brief = renderStateContext({ agent: { session: { id: 'bench-session' } } }, service, () => config);
  const interests = renderStateContext(
    { agent: { session: { id: 'bench-session' } } },
    service,
    () => normalizeConfig({ contextInjectionMode: 'state_interests' }),
  );
  const counts = store.health().counts;
  process.stdout.write(JSON.stringify({
    database: 'fresh temp file',
    readIterations,
    readMs: Number(readMs.toFixed(1)),
    readUsPerCall: Number(((readMs * 1000) / readIterations).toFixed(1)),
    writeIterations,
    writeMs: Number(writeMs.toFixed(1)),
    writeMsPerEvent: Number((writeMs / writeIterations).toFixed(2)),
    contextBriefChars: brief.length,
    contextInterestsChars: interests.length,
    contextMaxChars: config.contextMaxChars,
    counts,
    note: 'Single-process local measurement; SQLite and OS cache affect results. Token count is tokenizer-dependent; the context is character-bounded.',
  }, null, 2));
  process.stdout.write('\n');
} finally {
  try { store?.close(); } catch { /* ignore */ }
  rmSync(dir, { recursive: true, force: true });
}
