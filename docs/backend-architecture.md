# Backend database architecture

`src-tauri/src/db.rs` is a small facade. It owns connection opening, pragmas, the migration lock, and a handful of shared helpers, and it re-exports every feature module with `pub use` / `pub(crate) use`. Commands and other crates keep calling `db::something`, so moving code between modules never changes a call site.

## Module map

| Module | Owns |
| --- | --- |
| `lifecycle`, `settings`, `backups` | Connection pool, settings persistence, backup and restore |
| `migrations`, `schema` | The migration ladder and the idempotent `ensure_*` schema steps it runs |
| `search` | Browse/search SQL and filter building |
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

Name keys (catalog artist keys, chart and Wish List keys, title keys) are not part of `db`; they live in `src-tauri/src/identity/`, described in [Name identity](#name-identity).

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

## Name identity

`src-tauri/src/identity/` holds every rule that decides whether two names are the same. Each matching feature calls one named level instead of its own copy:

| Level | Folds | Used by |
| --- | --- | --- |
| `display_key` | case, whitespace | genres, import history, folder sync |
| `artist_key` (SQL: `artist_key_sql`) | + typographic dashes; empty is `unknown` | Artists, artist filters, MusicBrainz overlay, portraits |
| `strict_key` | + NFKC, typographic apostrophes | Last.fm caches, biographies |
| `loose_key` | + accents, Nordic letters, `&`/`and`, punctuation | charts, Wish List, Artist Completion, Discogs, Discovery, Deemix, album reviews |
| `loose_artist_key` | + leading "The", "and" | chart artist grouping |
| `credit_keys` | splits co-leads, drops "feat."/"with"/"x" guests | chart and artist credit matching |
| `edition_title_key` | + reissue decorations ("Remastered", "Deluxe Edition") | "already owned" album checks |

Three of these are stored, which makes them data contracts:

- `artist_key_sql` is the expression behind `idx_albums_artist_key`. SQLite only uses an expression index when a query repeats the expression verbatim, so a test pins its text. It may only call built-in functions and `unicode_lower`, because older builds keep writing to a newer database synced from another PC.
- `loose_key`, `loose_artist_key`, and `credit_keys` are stored in chart tables and copied in Aurora (as `chart_identity`). Keep both copies byte-identical.
- `loose_key` is also stored in `wish_list_items.identity_key` and the Artist Completion tables. Schema 61 rebuilt those keys when they moved from the old Wish List copy to `loose_key`.

`identity/golden_corpus.csv` lists tricky names (`Hall & Oates`, `Sigur Rós`, `Røyksopp`, `AC/DC`, `P!nk`, `feat.`/`ft.`/`with`, `[NO]` suffixes, reissue titles) with the expected result per level, including known limitations. `identity/tests.rs` runs it, compares `artist_key_sql` with `artist_key` in SQLite, and runs property tests (idempotence, looser levels never splitting what stricter levels join). The frontend's `recommendationIdentityKey` mirrors `loose_key` and runs the same corpus. Add a corpus row with every matching fix.
