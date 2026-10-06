# Backend database architecture

`src-tauri/src/db.rs` is a small facade. It owns connection opening, pragmas, the migration lock, and a handful of shared helpers, and it re-exports every feature module with `pub use` / `pub(crate) use`. Commands and other crates keep calling `db::something`, so moving code between modules never changes a call site.

## Module map

| Module | Owns |
| --- | --- |
| `lifecycle`, `settings`, `backups` | Connection pool, settings persistence, backup and restore |
| `migrations`, `schema` | The migration ladder and the idempotent `ensure_*` schema steps it runs |
| `search` | Browse/search SQL, filter building, key normalization |
| `stats`, `timelines` | Statistics, library profile, rating history, chart debut timelines |
| `artists_genres` | Artist and genre summaries, timelines, highlights |
| `chart_imports`, `chart_reconcile` | Billboard, VG-lista, Official UK, Ti i skuddet, and Norsktoppen CSV imports and chart-to-library matching |
| `discovery`, `discovery_snapshots`, `discovery_mixer`, `discovery_missions` | Daily Edition, shelves, mixer, and missions |
| `tools`, `tools_fix`, `tools_musicbrainz` | Music Tools catalog, whitespace repair and undo, MusicBrainz preparation |
| `playlists`, `saved_views`, `ai_snapshots` | Playlists and Smart rules, saved searches and charts, Luna snapshots |
| `provider_cache` | Last.fm, biography, album review, and artist portrait caches |
| `inspection` | Bounded current-view and research inspection for Luna |
| `exports` | CSV/XLSX/Markdown export writers |
| `diagnostics` | Library status and the Performance Proof probe |

Items shared between feature modules are `pub(super)`, which keeps them visible inside `db` and nowhere else. A feature module starts with `use super::*;` to reach the shared imports and its siblings.

## Tests

Each module's tests sit in a `#[cfg(test)] mod tests` at the bottom of its file. Fixtures used by several modules (temporary databases, `insert_test_album`, MusicBrainz cache builders) live in `db/test_support.rs`; tests that do not belong to one feature live in `db/tests.rs`.

## Migrations

`db/migrations.rs` holds `MIGRATIONS`, one ordered list of `Migration { version, description, up, verify }` entries.

- Each step runs exactly once, in its own `IMMEDIATE` transaction. The runner writes `PRAGMA user_version` after the step succeeds, so a step never sets the version itself and a failed step leaves the previous version in place.
- Steps are idempotent (`CREATE ... IF NOT EXISTS`, column probes), so replaying one is safe.
- `verify` checks that the tables and columns a version promises actually exist. If a database claims a version its schema does not support (a restore or a manual edit), the runner steps back to the highest verified version and replays from there.
- A database written by a newer build is left untouched.

To change the schema:

1. Write an idempotent `ensure_*` function in `db/schema.rs` (or a focused data migration in `db/migrations.rs`).
2. Add a `Migration` with the next version number at the end of `MIGRATIONS`, and raise `LATEST_SCHEMA_VERSION`.
3. Add a `verify` function if the step creates tables or columns that later code relies on.
4. Add an upgrade test that rewinds a migrated database to the previous version and checks the new schema appears.

Never edit or reorder a released step.
