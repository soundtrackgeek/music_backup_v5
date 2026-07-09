# Frontend safety architecture refactor

## Goal

Reduce architectural risk and establish a frontend safety net while preserving all current user-visible behavior and command payload contracts.

## Success Criteria

- SPEC.md reflects the real package version, SQLite schema version, MusicBrainz artist-information implementation, and roadmap state.
- Vitest and React Testing Library cover request creation/serialization, saved search/chart normalization, settings normalization, workspace navigation/shortcuts, and practical MusicBrainz review-state rendering.
- Search, Artists, and Settings render through focused workspace components without adding a global state library.
- Backend frontend code separates Tauri command wrappers, web-preview fixtures/mock behavior, and shared normalization helpers.
- Rust database code starts a stable module split with migrations and settings/backups extracted while public commands and payloads remain compatible.
- Workspace switches reset the newly selected workspace to its intended top position.
- Overlay sync defaults to an unconfigured portable state instead of a developer-specific OneDrive path.
- Frontend tests, TypeScript/Vite build, security checks, cargo test, and cargo check pass.
- README, CHANGELOG, package/Tauri/Cargo versions, oversized-module guidance, Git commit/push, and cargo clean requirements are complete.

## Current Context

- Git started clean on `master` tracking `origin/master`.
- Released metadata is `0.50.0`; SPEC.md still reports `0.45.0` and schema 18.
- README and db.rs report SQLite schema 19 and implemented MusicBrainz artist-information import/review/filter features.
- App.tsx, backend.ts, and db.rs are the main oversized architectural hotspots.

## Constraints

- Preserve behavior and existing backend payload contracts.
- No global state library unless extraction proves a concrete need.
- No unrelated visual redesign or feature additions.
- Follow AGENTS.md: docs, semantic version, synchronized metadata, commit, push, and `cargo clean`.
- Work directly in the shared repository; preserve any unrelated concurrent edits.

## Risks

- Large JSX extraction can subtly break closure/state behavior; mitigate with typed prop contracts, focused tests, build checks, and minimal markup changes.
- backend.ts and db.rs splits can break imports or Rust visibility; mitigate with re-exports and narrow module boundaries.
- Existing tests may be absent; introduce deterministic web/DOM tests without requiring Tauri.
- Push is an external write explicitly required by the user; no additional approval is needed.

## Approval Required

None beyond the user's explicit authorization to change, commit, and push this repository. No destructive migration, force push, production data access, or credential changes are planned.

## Work Packets

1. `01-discovery`: map versions, schema, feature state, module seams, commands, and existing behavior.
2. `02-frontend-safety`: install/configure Vitest + Testing Library and extract/test pure normalizers and navigation helpers.
3. `03-workspaces`: extract Search, Artists, and Settings components and fix top-position navigation.
4. `04-backend-rust`: split frontend backend layers and extract Rust migrations plus settings/backups modules.
5. `05-docs-release`: synchronize SPEC/README/CHANGELOG/version metadata and document next slices.
6. `06-verification`: run focused-to-broad checks, inspect diff/security, clean Rust artifacts, commit, and push.

These packets are executed as isolated local passes. The invoked workflow requires clear packet ownership, but subagent spawning is not assumed without separate authorization for delegation.

## Integration Policy

The primary agent owns integration. Preserve exported APIs through re-exports, inspect authoritative code/tests when packet assumptions conflict, and reject any unrelated behavior or design change.

## Verification

- `npm test -- --run`
- `npm run build`
- `npm run security:check`
- `cargo test` from `src-tauri`
- `cargo check` from `src-tauri`
- workflow artifact verification and final diff/status audit
- `cargo clean` from `src-tauri` after all Rust verification

## Reusable Artifacts

Keep this workflow run as an auditable recipe for future App/backend/db extraction work; do not store logs, secrets, or local data.
