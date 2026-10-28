# Changelog

All notable product changes to Amadeus State are recorded here. The package
version is the release identity; the SQLite schema has its own version in
`meta.schema_version`.

## 1.1.0 — 2026-10-28

Workspace-bound shared State, per-Session policy, trusted post-turn evolution,
safe schema 1 → 2 migration, and a seven-page independent console.

### Added

- Explicit binding to one official DSH Workspace by stable `workspaceRegistry`
  id; live `get(id).sessionIds` membership, archived-Session refusal, late-join
  support, failure-closed behavior for other/deleted/unavailable Workspaces, and
  restart persistence. Display titles and paths never decide identity.
- New Workspace main-state scope, separate from every legacy v1 private scope.
  Legacy scopes, events, interests and audit remain untouched and are never
  auto-merged.
- Four Session modes (`shared`, `read_only`, `isolated`, `disabled`) stored as
  stable-Session exceptions, re-evaluated on every tool call, injection and
  event. Revocation is hot; isolated state never reads or writes the main state.
- Trusted `session/event` observer subscribed with `{ global: true }`: only a
  completed `turn/end` with structured tool-work evidence can produce a small,
  valence-neutral energy/curiosity change. Idempotent per Session turn, bounded
  by a minimum interval and hourly cap, weighted per Session on shared state.
  Greetings and text-only turns produce zero change; no text/token sentiment
  heuristic and no extra LLM call.
- Context injection levels `off` / `brief` / `detailed` (legacy
  `state_interests` remains accepted) with shared/isolated/read-only wording and
  the same character budget.
- Seven-page console visual refresh: Overview, Evolution, Interests, Events &
  Audit, Context & Model Tools, Session Rules, Data & Diagnostics. Workspace
  picker/binding, main-state visualization, Session rules, migration log,
  diagnostics and backup/restore are wired to real Host APIs.
- Owner API: `GET /workspace`, `GET /workspaces`, `POST /workspace` (bind /
  unbind with explicit confirmation), `POST /session-rules` (set / clear).
- Schema 2 migration: additive columns/tables, consistent pre-migration
  `VACUUM INTO` snapshot, integrity/schema/row-count checks, transactional
  rollback, migration audit log, and v1 backup preflight/restore compatibility.
- `VACUUM INTO` replaces copy-based backups, so committed WAL rows are always
  included; backups are verified before success is reported.
- Regression coverage for workspace isolation, late join/revocation, four
  modes, cross-session sharing, shared-audit redaction, turn dedupe/limits,
  zero-change conversation, v1 migration/failed rollback, WAL-consistent
  backup, and listener global/disposal behavior.

### Changed

- `contextInjectionMode` adds `detailed`; old `state_interests` remains valid.
- New conservative limits: `sharedEventWeight` 0.35,
  `autoEventMinIntervalSeconds` 180, `autoEventMaxPerHour` 12.
- `state_health` is policy-aware and never exposes global counts, reasons,
  Workspace ids or cross-session times to the model.
- Shared Workspace audit redacts raw Session reasons and evidence.

### Fixed

- Backup filenames now include a unique suffix, so a failed second backup in the
  same clock tick cannot replace or delete an earlier verified backup.
- Shared Workspace events no longer promote a private Session topic (model
  summary, Life description, or Memory title) into a global interest without an
  explicit trusted public-visibility contract. Numeric deltas and Owner-authored
  manual global interests are preserved.
- Model appraisal idempotency keys include the trusted Session id, so different
  Sessions in one shared Workspace can each use turn 1 without collision while
  retries within one Session stay deduplicated.

### Compatibility

- Package schema version is now `2`; v1 databases and v1 backups are migrated
  on open with a pre-migration snapshot and automatic rollback on failure.
- Still optional: Life and Memory. State core runs when either is absent.

## 1.0.0 — 2026-10-25

First packaged State v1 release for the isolated DSH Desktop productization
pass.

### Added

- Independent `@amadeus/state` DSH Cordis package with bundle patch, Host entry,
  lazy-CJS browser bundle, Config schema, icon and locale metadata.
- Deterministic Mood / Energy / Curiosity engine with short-term state, slowly
  moving baselines, real-time recovery, bounds, saturation, clock-rollback
  protection and long-offline handling.
- Event/appraisal separation, idempotency keys, trusted Life completed/failed
  verification, bounded model appraisal and bounded Memory reference usage.
- SQLite persistence with WAL, transactions, runtime lease, integrity checks,
  schema versioning, backups, retention and paged audit.
- Interest baseline/activity separation, decay, saturation, alias normalization,
  manual management and per-scope isolation.
- Native `settings.section` page: overview, common settings, interests, paged
  audit, advanced parameters, preview, restore-defaults, separately confirmed
  reset, health and optional integration diagnostics.
- `plugins.detail.section` Plugin Manager basic configuration card using the
  same `amadeus-state` configForms namespace and revision as the full page.
- Theme-safe high-contrast controls, Chinese-first/English UI, narrow layout,
  keyboard focus, loading/disabled/error/success states.
- Authenticated owner-only management HTTP API; browser never reads SQLite.
- Release tooling: source/client/tarball consistency verification, Build Info,
  two-pack reproducibility check, SHA-256 package receipt and release docs.
- Safe in-process backup restore from the diagnostics page: basename-only
  selectors, integrity/schema/table preflight, automatic safety backup, atomic
  replace, data-preserving rollback and automatic reopen.
- Isolated performance/token measurement (`npm run bench`) and user-facing
  runtime overhead documentation.

### Fixed

- Backup restore now preserves the live `state.sqlite` + WAL/SHM file set under a
  unique old-set name before installing the candidate. It never unlinks live
  sidecars before rollback is possible; injected failures at every replacement
  phase restore the old set or fail closed with forensic artifacts.
- `settings.section` and `plugins.detail.section` now return their registration
  disposer to `configForms.whileServed` and guard against repeated mirror syncs.
  Disable/re-enable, HMR, namespace withdrawal and re-serve release the old slot
  entry before registering again; no priority change or swallowed duplicate
  error is used.

### Security

- Model-supplied source, scope, scene, persona, trust, evidence and admin
  claims are rejected.
- Private scopes do not contribute values or reasons to other scopes or public
  context; revoked authorization fails closed.
- Automatic Memory summary writes are hard-disabled until a Scene-scoped Memory
  contract can be verified; no write setting or adapter write method exists.
- Optional Life/Memory adapters use only public Host services and native tools;
  no private module or database import.

### Known limitations

- Life has no public completed-activity push contract; a model must supply an
  activity id on a real turn, then State verifies it through Life.
- Mneme has no public persona/scene Host authorization contract; Memory
  references default off and automatic writes are unavailable.
- Interest aliases are local to State; Mneme entity aliases are not imported.
- Schema v1 has no released older schema to migrate yet; newer/unknown schemas
  are backed up and refused rather than overwritten.
- License remains owner-decided (`UNLICENSED` in this repository).
