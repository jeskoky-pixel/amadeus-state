# Changelog

All notable product changes to Amadeus State are recorded here. The package
version is the release identity; the SQLite schema has its own version in
`meta.schema_version`.

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
