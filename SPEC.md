# Music Library Living Specification and Roadmap

Last updated: 2026-07-04
Status: Living product and implementation contract
Current implementation: Phase 13 complete
Current package version: 0.26.0
SQLite schema version: 10

This document is the source of truth for what the app is, what is already implemented, and what should happen next. Keep `README.md` focused on how to install, run, test, and understand the released feature set. Keep `CHANGELOG.md` focused on dated release changes. Keep this file focused on product intent, behavioral contracts, architecture boundaries, and the roadmap.

## Maintenance Rules

Update this spec when any of these change:

- A workspace, import path, export format, chart mode, filter, or Music Tool is added or removed.
- A data contract changes, including source columns, identity rules, rating rules, score formulas, or schema version.
- A roadmap item moves between Now, Next, Later, or Done.
- A product decision is made that would otherwise live only in chat, code comments, or memory.
- A module boundary changes in a way future work should respect.

Each roadmap item should have:

- A short problem statement.
- The expected user-facing outcome.
- The main implementation areas.
- Clear done criteria.

## Product Goal

Build a fast, polished, local-first desktop app for importing, browsing, searching, charting, validating, exporting, and analyzing a large MusicBee TSV library export.

The app should make it easy to answer questions like:

- Which Synthpop albums from 1987 do I own?
- Which 1983-1985 Post-Punk albums are 20-25 minutes long?
- What are my top rated Britpop albums?
- Which albums are only partly rated but worth finishing?
- Which imported Billboard albums or singles are missing from the library?
- Which artists, genres, years, or decades need more attention?

Core principles:

- Local-first by default: library data, covers, CSV rankings, SQLite, exports, and settings stay on the machine.
- Speed first: searches, charts, filters, and validation tools should feel instant on normal desktop hardware.
- Explainable calculations: rating completeness, TMOE, AE, Album Score, and Billboard matches must be inspectable and exportable.
- Reversible operations: anything destructive or bulk-editing should have a backup, preview, and recovery path.
- Optional enrichment: external APIs and AI can help later, but they must not be required for the core library workflow.

## Current Capability Map

| Workspace | Status | Purpose |
| --- | --- | --- |
| Search | Implemented | Primary album and track browsing, composable filters, saved searches, and exports. |
| Charts | Implemented | Built-in and saved ranked album views with table, compact list, and cover grid modes. |
| Discovery | Implemented | Exploration dashboards for rating backlogs, loved outliers, genre clusters, artist constellations, and smart missions. |
| Statistics | Implemented | Library health, rating progress, metadata coverage, import history, time shape, duration, concentration, and outlier dashboards. |
| Albums | Implemented | Album index, album filters, detail drill-down, track lists, and album-level exports. |
| Artists | Implemented | Album-artist index, artist summary stats, album lists, cover board, and exports. |
| Genres | Implemented | Canonical-genre index, genre summary stats, album lists, and exports. |
| Tools | Implemented | Query-backed validation issue lists, severity, progress, pagination, sorting, counts, exports, and guarded whitespace cleanup. |
| Imports | Implemented | MusicBee TSV import, cover art import, Billboard album CSV import, Billboard singles CSV import, progress, and import history. |
| Settings | Implemented | Theme, backup retention, backup restore, and default left/right sidebar visibility. |

The left sidebar supports full, icon-only, and hidden modes. The right detail sidebar supports shown and hidden modes.

## Source Data Contracts

### MusicBee TSV

Default path: `musicbee-library.tsv`

The current observed library scale is roughly:

- Track rows: 1,130,882
- Album keys by `<Album Unique Id>`: 76,789

Required columns:

| Column | Meaning |
| --- | --- |
| `Display Artist` | Track display artist. Use this for track identity and track browsing. |
| `Album Artist (display)` | Album artist display value. Use this for album identity and album browsing. |
| `Album` | Album title. |
| `<Album Unique Id>` | Preferred album identity key. |
| `Title` | Track title. |
| `Disc#` | Disc number for ordering and validation. |
| `Track#` | Track number for ordering and validation. |
| `Time` | Track duration. Support `m:ss` and `h:mm:ss`. |
| `Rating` | Track rating. Used for rating completeness, calculated album rating, TMOE, and AE. |
| `Album Rating` | MusicBee album rating. Used as the first effective album rating source. |
| `Love` | Loved-track marker. Only exact `L` counts as loved. |
| `Genre` | Track/album genre text. The first value is the canonical album genre. |
| `Publisher` | Label/publisher metadata. |
| `Year` | Canonical year for filtering, charting, and statistics. |
| `Release Year` | Secondary reference metadata. |
| `<File Path>` | Source folder path. Used with filename for track identity. |
| `<Filename>` | Track filename. Used with file path for track identity. |

TSV quote characters are treated as literal tag text, matching plain MusicBee TSV exports where titles can contain unpaired quotes.

### Album Identity

Preferred identity:

1. `<Album Unique Id>`
2. Fallback only when missing: normalized album artist + normalized album title + year + file path root

Albums with different `<Album Unique Id>` values remain separate albums, even if they look like alternate versions, remasters, or duplicates. Music Tools should flag likely duplicates instead of merging them automatically.

### Track Identity

Track identity is based on:

- `<File Path>` + `<Filename>`

Use `Display Artist` for track-level identity and browsing. Do not use `Album Artist (display)` to identify individual tracks.

### Genre Rules

- Each album has one canonical genre.
- If a field contains multiple genres, use the first genre as the canonical album genre.
- Flag multi-value genre strings through Music Tools.
- The `scores` genre alias expands to Action, Animation, Comedy, Documentary, Drama, Fantasy, Horror, Sci-Fi, Thriller, TV, Video Game, Western, and Anime in include/exclude genre filters.

### Rating Rules

A valid track rating is a whole-number value from `0` to `5`, including whole-number decimals such as `5.0`.

Invalid or anomalous ratings include:

- Non-numeric values.
- Values outside `0` to `5`.
- Half-step or decimal ratings such as `3.5` or `4.5`.

Track ratings normalize to the 0-100 album-rating scale:

| Track rating | Normalized points |
| --- | ---: |
| `0` | 0 |
| `1` | 20 |
| `2` | 40 |
| `3` | 60 |
| `4` | 80 |
| `5` / `5.0` | 100 |

### Album Calculations

```text
total_album_seconds = sum(track.time_seconds)
rating_completeness = rated_track_count / total_track_count
loved_tracks = count(tracks where Love == "L")
tmoe_seconds = sum(time_seconds for tracks where normalized Rating == 5)
tmoe_minutes = tmoe_seconds / 60
ae_ratio = tmoe_seconds / total_album_seconds
```

Effective album rating:

1. Use MusicBee `Album Rating` when present and not `-1`.
2. If MusicBee `Album Rating` is missing or `-1`, and every track is validly rated, calculate the album rating from normalized track ratings.
3. If neither source is available, the album has no effective album rating and cannot receive an Album Score.

Album Score:

```text
album_score = ((effective_album_rating * 0.5) + (ae_ratio * 100) + (tmoe_minutes * 0.3)) / 10 + (loved_tracks * 100)
```

### Cover Art

Default path: `AlbumCovers`

Cover import:

- Matches local archive images by comparing each album's `<File Path>` folder name to supported image filenames.
- Links archive matches directly to the source image path.
- Optionally extracts embedded MP3 artwork when no archive match exists.
- Writes extracted embedded art back into `AlbumCovers`.
- Skips albums that already have imported cover art unless replacement is enabled.
- Relinks older cache-copy entries back to source archive files when possible.

### Billboard CSV Data

Default album chart path: `CSV`

Album chart files:

- Named by year, for example `CSV/1987.csv`.
- Required columns: `EOY Rank`, `Artist`, `Title`.
- Matching normalizes case, punctuation, and diacritics.
- Imported rows are persisted, linked to albums when possible, and collapsed to the best stored album rank.

Default singles chart path: `CSV_SINGLES`

Singles chart files:

- Named by year, for example `CSV_SINGLES/1987.csv`.
- Required columns: `Yearly Rank`, `Artist`, `Track`.
- Optional column: `Featured`.
- Matching uses library track `Display Artist` and `Title`.
- Imported rows are persisted, linked to tracks when possible, and collapsed to the best stored single rank.

## Architecture Map

### Frontend

Core files:

- `src/App.tsx`: top-level app composition, workspace rendering, state wiring, and user workflows.
- `src/backend.ts`: Tauri command wrapper, web-preview mocks, local settings cache, and event listeners.
- `src/types.ts`: shared TypeScript contracts that mirror Rust model payloads.
- `src/styles.css`: app layout, themes, workspace styling, and responsive behavior.

Focused frontend modules:

- `src/app/config.tsx`: navigation, app constants, option lists, default progress objects, and Music Tool catalog fallback.
- `src/app/requests.ts`: request factories, filter defaults, chart config normalization, completeness range handling, and sort helpers.
- `src/app/chartTemplates.tsx`: built-in chart templates.
- `src/app/display.ts`: formatting, labels, rating stars support, Billboard labels, chart metric labels, and browse-row sorting.
- `src/app/genreSuggestions.ts`: comma-list parsing, genre token replacement, normalization, and suggestion ranking.
- `src/app/input.ts`: small input parsing and clamping helpers.

Expected next frontend modularization:

- Split `App.tsx` by workspace after behavior is stable.
- Keep shared pure helpers in `src/app`.
- Avoid moving state into a global store until duplication or cross-workspace coupling proves it is needed.

### Tauri and Rust

Core files:

- `src-tauri/src/lib.rs`: Tauri command registration and desktop runtime glue.
- `src-tauri/src/main.rs`: app entrypoint.
- `src-tauri/src/models.rs`: Rust payload models shared by commands, database logic, and import logic.
- `src-tauri/src/db.rs`: SQLite migrations, search, charts, statistics, discovery, Billboard imports, Music Tools, settings, saved objects, and exports.
- `src-tauri/src/importer.rs`: MusicBee TSV parsing, normalization, import run handling, album aggregation, backup retention, and rating event capture.
- `src-tauri/src/covers.rs`: cover image import, relinking, embedded-art extraction, and local image serving.

Important test boundary:

- Desktop-only Tauri/Wry command glue is excluded from Rust lib unit-test builds with `#[cfg(not(test))]`.
- Pure Rust database/import logic remains testable through `cargo test`.
- This avoids the Windows Common Controls v6 manifest issue that can surface as `STATUS_ENTRYPOINT_NOT_FOUND` before tests run.

Expected next backend modularization:

- Split `db.rs` into focused modules for migrations, queries, exports, statistics, discovery, Billboard, Music Tools, settings, and saved objects.
- Keep schema migrations and SQL helpers boring and explicit.
- Add regression tests before or alongside each split.

## Implemented Phase History

### Phase 1: Data Foundation

- Tauri 2, React, TypeScript, Rust, SQLite, and Vite foundation.
- SQLite database in app data directory with WAL mode.
- MusicBee TSV streaming import.
- Required header validation.
- Raw track storage and calculated album aggregates.
- Database backup before import with configurable retention.
- Import progress events surfaced in the UI.

### Phase 2: Search and Browse

- Album and track search views.
- SQLite FTS5 indexes.
- Composable text, genre, year, duration, count, rating, completeness, loved, publisher, path, filename, and missing-field filters.
- Active filter chips.
- Saved searches.
- CSV, TSV, JSON, and TXT exports.

### Phase 3: Charts

- Built-in chart templates for year, decade, genre, scores, artist, loved, AE, and TMOE.
- Custom chart builder.
- Rating completeness min/max range.
- Ranking metric and display-only table-header sorting.
- Table, compact list, and cover-grid modes.
- Saved chart configurations.
- XLSX export.

### Phase 4: Statistics and Settings

- Library overview, health score, rating progress, rating distributions, year/genre progress, rating history, and import history.
- Later statistics expansions for time shape, loved density, catalog concentration, duration analytics, metadata coverage, decade progress, genre portfolio, and outlier summaries.
- Settings workspace with theme, backup retention, and layout defaults.
- Persisted app settings.

### Phase 5: Albums

- Dedicated album index.
- Album detail panel with ordered track list and calculated album metrics.
- Album filters, pagination, sorting, cover placeholders/artwork, and album-level export.
- Exact album-id filtering for detail/export flows.

### Phase 6: Artists

- Dedicated album-artist index.
- Artist-level summary stats.
- Selected artist album lists.
- Artist album cover board with clickable covers and inline track detail.
- Artist-level exports.

### Phase 7: Genres

- Dedicated canonical-genre index.
- Genre-level summary stats.
- Selected genre album lists.
- Genre-level exports.

### Phase 8: Music Tools

- Validation workspace with immediate tool catalog.
- Query-backed issue counts and affected rows.
- Severity, progress, filtering, sorting, pagination, affected album/track counts, and exports.
- Validators for duplicate albums, missing cover image records, missing Billboard albums/singles, duplicates within album, invalid times, non-numeric ratings, missing tags, non-MP3 files, year anomalies, ratings out of range, track/disc issues, inconsistent metadata, whitespace anomalies, genre normalization issues, conflicting album artists, and multiple years per album.
- Whitespace Anomalies can preview and apply a guarded local database cleanup for visible issue rows.

### Phase 9: Cover Art

- Archive image matching from `AlbumCovers`.
- Direct source-image linking.
- Optional embedded MP3 fallback extraction.
- Reimport relinking from stale cache-copy entries.
- Live scan progress and counts.
- Real artwork across search, chart, album, artist, and genre layouts.

### Phase 10: Discovery

- Discovery workspace separate from Statistics.
- Completion heatmap for genre/year intersections.
- Backlog and smart missions.
- Love-vs-rating scatter.
- Genre universe and Artist constellation bubble charts.
- Clickable discovery points opening matching albums.

### Phase 11: Billboard Albums and Singles

- Billboard album CSV import from `CSV`.
- Billboard singles CSV import from `CSV_SINGLES`.
- Persisted chart-entry tables.
- Album and track Billboard badges.
- Search, Albums, Charts, Discovery, Artists, Genres, details, and exports surface Billboard ranks.
- Billboard album and single rank filters.
- Billboard chart ranking metric and template.
- Missing Billboard Albums and Missing Billboard Singles tools.

### Phase 11.5: Maintainability

- Windows Rust unit tests fixed by excluding desktop-only Tauri/Wry command glue from lib test builds.
- Frontend app helper layer split into focused `src/app` modules.
- This living specification is the current roadmap/spec source of truth.

### Phase 12: Backup Restore and Recovery

- Settings lists available local SQLite backups from the app backup directory.
- Backup rows show operation, timestamp, file size, schema version, and import row/album counts when metadata is available.
- Restore is limited to `.sqlite3` files inside the app backup directory.
- Backup schema version is inspected before restore.
- Restore asks for confirmation from the UI.
- The current active database is copied to a `before-restore` safety backup before replacement.
- Stale SQLite WAL sidecar files are removed around restore.
- The restored database is reopened, migrated if needed, counted, and reported back to the UI.
- Rust tests cover metadata-enriched backup listing, path validation, and restore behavior.

### Phase 13: Initial Music Tools Fix Actions

- Whitespace Anomalies is the first automated fix action.
- Preview mode reports how many visible rows are still fixable without changing the database.
- Apply mode creates a pre-fix SQLite backup in the desktop app, compacts repeated whitespace in selected track metadata fields, compacts affected album display fields, and rebuilds search indexes.
- The fix action mutates only the app-local SQLite database. Re-importing unchanged source TSV data can reintroduce the same whitespace issues.
- Rust tests cover preview, apply, and post-fix validator cleanup behavior.

## Roadmap

### Now

#### Phase 14: Backend Modularization

Problem:

- `src-tauri/src/db.rs` is large enough that unrelated features compete for the same file.

Expected outcome:

- Database behavior is split into modules that map to feature ownership while preserving current behavior.

Implementation areas:

- Migrations.
- Search/browse queries.
- Saved searches and charts.
- Exports.
- Statistics.
- Discovery.
- Billboard imports.
- Music Tools.
- Settings and library status.

Done criteria:

- No behavior changes unless separately documented.
- `cargo test` and `cargo check` pass after each slice.
- New module names make future feature work easier to locate.
- Shared SQL helpers stay small and explicit.

#### Phase 15: Frontend Workspace Modularization

Problem:

- `App.tsx` still owns most workspace rendering and workflow state.

Expected outcome:

- Workspace components can evolve independently without turning `App.tsx` back into a catch-all file.

Implementation areas:

- Search workspace.
- Charts workspace.
- Discovery workspace.
- Statistics workspace.
- Albums, Artists, Genres workspaces.
- Tools workspace.
- Imports and Settings workspaces.

Done criteria:

- Extract one workspace at a time.
- Keep pure helpers in `src/app`.
- Avoid broad state architecture changes unless a repeated cross-workspace problem appears.
- `npm run build` passes after each slice.

### Next

#### Phase 16: Import Safety and Incremental Sync

Expected outcome:

- Imports are easier to reason about, faster for small changes, and safer when source data changes unexpectedly.

Candidate work:

- Track and album hash comparison.
- Changed/new/removed album summary before final replacement.
- More visible import delta previews.
- Better failure recovery when source files disappear mid-import.
- Import benchmarks for the 1.13M-row library.

#### Phase 17: Performance and Observability

Expected outcome:

- Search, chart, import, export, and tool performance are measured rather than guessed.

Candidate work:

- Record query timing for major backend operations.
- Surface slow operation details in development logs.
- Benchmark common indexed filters and chart loads.
- Audit indexes after Billboard and Discovery growth.
- Add lightweight diagnostics view or developer log export.

#### Phase 18: Expanded Music Tools Fix Actions

Expected outcome:

- Music Tools can move from detection to guided cleanup without risking the library.

Candidate work:

- More dry-run fix plans.
- Backups before every mutating fix action.
- Reviewable affected-row lists.
- Fix history.
- Undo/restore path.
- Safe fixes for duplicate position reports and metadata normalization suggestions.

### Later

#### Phase 19: External Enrichment

Expected outcome:

- Optional MusicBrainz or similar lookup helps find missing albums and improve metadata.

Constraints:

- Never require external lookup for core browsing.
- Review all enrichment before applying.
- Keep source and confidence visible.

#### Phase 20: Optional AI Assistance

Expected outcome:

- AI helps create queries, charts, playlists, or recommendations from natural language.

Candidate prompts:

- "Show me top AOR albums from 1984 under 45 minutes."
- "Find high-score partial albums I should finish rating."
- "Build a playlist from loved tracks in underexplored genres."

Constraints:

- AI features must be optional.
- No library data should leave the machine without explicit user action.
- Generated actions should remain reviewable before they affect saved state.

#### Phase 21: Packaging and Release Polish

Expected outcome:

- The app is easier to install, update, diagnose, and recover.

Candidate work:

- Signed release builds.
- Installer/update strategy.
- Import/export troubleshooting guide.
- Database diagnostics.
- Sample fixture data for demos and screenshots.

## Open Questions

- Should later Music Tools fixes ever write back to MusicBee source files, or should all fixes remain app-local?
- Should Billboard matching expose manual link/unlink review for misses and ambiguous matches?
- Should Discovery missions become saveable views or remain generated shortcuts?
- What is the preferred first external enrichment source: MusicBrainz, Discogs, or a lightweight local CSV workflow?

## Resolved Decisions

- Use `Year` as the canonical year for filtering, charts, and statistics.
- Treat `Release Year` as secondary metadata.
- Use `Album Artist (display)` for album identity and album browsing.
- Use `Display Artist` for track identity and track browsing.
- Use exact `Love = "L"` for loved-track counting.
- Treat only whole-number track ratings from `0` to `5` as valid, including whole-number decimal equivalents.
- Treat half-step ratings such as `3.5` and `4.5` as Music Tools anomalies.
- Count `5` and `5.0` as rating `5` for TMOE.
- If `Album Rating` is missing or `-1`, calculate album rating from tracks only when every track is rated.
- Keep albums separate by `<Album Unique Id>`, but flag likely duplicate versions through Music Tools.
- Keep the last 3 database backups by default.
- Keep backup retention configurable from Settings.
- Keep backup restore in Settings until there is enough lifecycle surface area to justify a dedicated Maintenance workspace.
- Keep the initial Whitespace Anomalies fix app-local to SQLite; re-importing unchanged source TSV data may reintroduce the same issue.
- Export only visible/default columns by default.
- Let users opt into calculated export columns such as Album Score.
- Keep external enrichment and AI optional.
