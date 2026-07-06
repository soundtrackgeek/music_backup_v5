# Music Library Living Specification and Roadmap

Last updated: 2026-07-06
Status: Living product and implementation contract
Current implementation: Phase 17 complete
Current package version: 0.32.0
SQLite schema version: 12

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
| Artists | Implemented | Album-artist index, artist summary stats, album lists, cover board, MusicBrainz pure-official-album discography status, and exports. |
| Genres | Implemented | Canonical-genre index, genre summary stats, album lists, and exports. |
| Tools | Implemented | Query-backed validation issue lists, severity, progress, pagination, sorting, counts, exports, and guarded whitespace cleanup. |
| Imports | Implemented | MusicBee TSV import, cover art import, Billboard album CSV import, Billboard singles CSV import, progress, and import history. |
| Settings | Implemented | Theme, backup retention, backup restore, Performance Proof diagnostics, MusicBrainz cache status, and default left/right sidebar visibility. |

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
| `Album Artist (display)` | Album artist display value. Use this for album identity and album browsing. If missing for an album whose tracks have one normalized `Display Artist`, infer that display artist as the album artist. |
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

For album artist grouping and artist-key filters, normalize common Unicode dash variants to ASCII `-`. If `Album Artist (display)` is blank across an album and there is exactly one normalized `Display Artist`, use that display artist as the album artist in normalized track and album rows. Do not infer an album artist for mixed-display-artist albums.

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

### MusicBrainz Local Cache Data

The v3 MusicBrainz integration used a local read-only `musicbrainz_cache.db` plus local matching utilities instead of live API calls. The v5 implementation should start from that shape.

Default cache path: `MusicBrainz/musicbrainz_cache.db`

Expected cache behavior:

- The cache is optional and user-configured or discovered locally; it is not committed to git.
- The local `MusicBrainz/` folder is ignored by git and may hold large cache databases, backups, and generated MusicBrainz artifacts.
- The cache foundation made zero MusicBrainz network API calls. The selected-artist discography slice may perform a bounded MusicBrainz release-status verification call when the app-owned status cache is missing, then persist the result locally.
- If the cache or matching utilities are unavailable, the app should show a clear unavailable state and all core library features should continue working.
- Cache status should be inspectable, including path, availability, file size, artist count, distinct MBID count, release count, release year range, cache date range, duplicate-MBID count, suspicious high-release mapping count, and matching capability.
- Cache counts are dynamic. The v3 reference cache documented roughly 483,675 official releases from 20,208 artists, but v5 should display counts from the actual selected cache.
- The current recovered cache is useful but imperfect: some cached query names point at incorrect MusicBrainz MBIDs. v5 should treat the cache as a fast candidate source and add a trust layer before presenting broad missing-album results as authoritative.

Minimum expected cache tables:

| Table | Required columns | Purpose |
| --- | --- | --- |
| `artist_cache` | `name`, `mbid` | Find a MusicBrainz artist candidate for a local album artist. |
| `release_groups` | `artist_mbid`, `release_mbid`, `title`, `year`, `type`, `secondary_types`, `track_count`, `status` | Load a MusicBrainz artist's release-group discography. |

Discography query rules:

- Match local album artists with app-owned verified links first, then `artist_cache.name`, starting with exact lowercase lookup and then normalized lookup.
- Prefer exact normalized artist matches before fuzzy matching.
- Default fuzzy threshold should start at 85 on a 0-100 confidence scale, matching v3.
- Load releases by matched `artist_mbid`.
- Start with `status = 'Official'` releases only.
- Keep MusicBrainz primary and secondary release types visible, combined as labels such as `Album`, `Album + Compilation`, `Album + Live`, or `EP`.
- Default missing-album views should begin with pure official `Album` release groups with no secondary types, because regional variants, compilations, live albums, soundtracks, and soundtrack-heavy artists can otherwise create noisy results.
- Allow users to opt into secondary types such as Compilation, Live, Soundtrack, Remix, EP, and Single after the basic view is understandable.

Collection comparison rules:

- Compare MusicBrainz release titles against the local artist's album titles with deterministic normalized-title matching first; fuzzy album matching should be added only as reviewable evidence.
- Start with local albums where the selected artist is the album artist, then decide whether featured/collaboration albums should participate.
- Record both owned and missing matches with confidence, local matched album title, MusicBrainz release MBID, year, combined type, track count, and status.
- Flag suspect artist mappings before comparison when a single MBID is associated with many cached query names, when the artist has an unusually large release count, or when the cached lookup only matched through a weak normalized/fuzzy path.
- Do not mutate local library data from MusicBrainz matches in the first implementation.
- Treat MusicBrainz as discovery evidence, not source-of-truth replacement metadata.
- Always expose source, match confidence, and whether a row is exact, fuzzy, missing, or manually linked.

App-owned trust layer:

- Persist local artist to MusicBrainz artist decisions in the app database, not in the external cache.
- Store local artist key, display artist, selected MusicBrainz MBID, canonical MusicBrainz artist name when known, match method, confidence, verification state, ignored state, and timestamps.
- Persist per-release decisions for manual link, unlink, ignore, and not-in-scope states.
- A verified manual artist link should override `artist_cache.name -> mbid` lookup results.
- An ignored or suspect artist mapping should suppress broad batch missing-album results until reviewed.
- Broad collection-wide missing-album reports should have a minimum quality gate: verified artist link or high-confidence non-suspect cache match.

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
- `src/app/themeBootstrap.ts`: startup theme hint loaded through the bundled TypeScript entrypoint so production CSP can disallow inline scripts.

Expected next frontend modularization:

- Split `App.tsx` by workspace after behavior is stable.
- Keep shared pure helpers in `src/app`.
- Avoid moving state into a global store until duplication or cross-workspace coupling proves it is needed.

### Tauri and Rust

Core files:

- `src-tauri/tauri.conf.json`: app identity, build settings, release CSP, development CSP, and explicit capability selection.
- `src-tauri/capabilities/default.json`: selected main-window Tauri permission boundary.
- `src-tauri/src/lib.rs`: Tauri command registration and desktop runtime glue.
- `src-tauri/src/main.rs`: app entrypoint.
- `src-tauri/src/models.rs`: Rust payload models shared by commands, database logic, and import logic.
- `src-tauri/src/db.rs`: SQLite migrations, search, charts, statistics, discovery, Billboard imports, Music Tools, settings, saved objects, and exports.
- `src-tauri/src/musicbrainz.rs`: Read-only MusicBrainz cache validation, status reporting, selected-artist discography comparison, and app-owned artist/release review decisions against the optional local `musicbrainz_cache.db`.
- `src-tauri/src/importer.rs`: MusicBee TSV parsing, normalization, import run handling, album aggregation, backup retention, and rating event capture.
- `src-tauri/src/covers.rs`: cover image import, relinking, embedded-art extraction, and local image serving.

Expected MusicBrainz boundary:

- Keep MusicBrainz cache reads in a dedicated backend module instead of folding them into general search/chart query code.
- Use a separate read-only SQLite connection for `musicbrainz_cache.db`.
- Persist only app-owned MusicBrainz settings, artist link decisions, release link/ignore decisions, release-status verification cache, cache quality snapshots, and refresh metadata in the app SQLite database.
- Keep MusicBrainz source rows separate from MusicBee source rows and calculated album aggregates.
- The first implemented slice persists `musicbrainz_cache_path`, opens the cache read-only, validates expected tables, reports cache quality/status, and creates app-owned artist-link/release-decision tables for later matching workflows.
- The second implemented slice compares the selected Artist workspace artist against pure official MusicBrainz album release groups, using verified artist links first, cache matches second, and deterministic local title matching for owned/missing status.
- The third implemented slice exposes selected-artist match review controls, persists verify/ignore/unlink/manual MBID decisions in `musicbrainz_artist_links`, lets verified links override raw cache lookup, and suppresses selected-artist results for ignored links.
- Keep core Artist workspace rendering local and fast; the MusicBrainz Discography panel may verify official release status against MusicBrainz when local status cache rows are missing, using rate-limit-aware requests and app-owned persistence.
- If a refresh/update path is added, isolate it from read-only lookup code, back up the cache first, and require MusicBrainz user-agent/contact configuration.
- Reuse the same export, pagination, sorting, and issue-list conventions used by Artists and Music Tools where possible.
- Provide web-preview mock payloads so the Artist workspace can be developed without a local cache.

Release and security boundary:

- Production CSP is explicit and disallows inline scripts/styles, object sources, embedding, base URI injection, and form submissions.
- Development CSP is separate and permits the local Vite host plus HMR websocket.
- Local source data, SQLite databases, backup sidecars, cover archives, chart CSV folders, and MusicBrainz cache folders remain ignored by git.
- App version metadata must stay synchronized across `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock`.
- `npm run security:check` is the fast guard for these invariants; `npm run check` adds frontend build and Rust tests; `npm run release:check` adds Tauri packaging.

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

### Phase 14: Performance Proof

- Settings includes an on-demand Performance Proof panel.
- The desktop probe runs against the active SQLite database and records timings for representative Search, Charts, Music Tools, Statistics, and Discovery operations.
- Sampled text probes use existing album and track titles from the database.
- Each probe row reports duration, total count, returned row count, detail text, and per-operation failure status.
- Web-only preview mode returns mock probe rows for layout work.
- Rust tests cover the structured probe report on a seeded database.

### Phase 15: Release and Security Polish

- Tauri production CSP is enabled and hardened instead of disabled.
- Tauri development CSP permits the local Vite server and HMR websocket without weakening production policy.
- Tauri capability selection is explicit in config and points at the selected main-window capability file.
- Startup theme bootstrap moved from inline HTML into the bundled TypeScript entrypoint.
- App version metadata is synchronized across package, Tauri, and Cargo files.
- `npm run security:check`, `npm run check`, and `npm run release:check` provide repeatable release verification.

### Phase 16: MusicBrainz Cache Foundation

- Settings includes a MusicBrainz Cache panel for the saved local cache path.
- The default cache path is `MusicBrainz/musicbrainz_cache.db`.
- The desktop backend opens the cache read-only and validates the expected `artist_cache` and `release_groups` tables.
- Cache status reports file size, artist counts, distinct MBID counts, release counts, pure official album counts, release-year range, cache-date range, duplicate-MBID count, suspicious mapping count, and warning examples.
- SQLite schema version 11 adds the persisted MusicBrainz cache path plus app-owned artist-link and release-decision tables for future verified/ignored matching.
- SQLite schema version 12 adds the app-owned MusicBrainz release-status cache used to exclude bootleg-only release groups from selected-artist missing-album counts.
- Web-only preview mode includes a mock MusicBrainz cache warning state.
- The release/security guard verifies that `MusicBrainz/` remains ignored by git.

### Phase 17: MusicBrainz Artist Discography

- The Artists workspace includes a MusicBrainz Discography panel for the selected artist when a cache is configured.
- The desktop backend loads pure official MusicBrainz album release groups only and compares them against the selected local artist's albums.
- Artist matching checks verified app-owned links first, exact cache-name matches second, and normalized cache-name matches third.
- Local owned/missing matching is deterministic by normalized album title, with matching year increasing confidence when available.
- The panel shows cache/artist state, suspect mapping warnings, cached name, MBID link, match method, artist link review state, local album count, pure album count, owned/missing totals, completion percentage, and owned/missing release rows.
- The MBID link opens the matched MusicBrainz artist page in the system default web browser from the Tauri desktop app.
- Selected-artist MusicBrainz matches can be verified, ignored, unlinked, or corrected by pasting a MusicBrainz artist MBID.
- Unmatched and suspect selected-artist matches show local-cache candidate rows built from fuzzy `artist_cache` matching and alternate cached names/MBIDs.
- Verified artist links override raw cache lookup, and ignored artist links suppress selected-artist MusicBrainz results and future broad reports.
- Missing release rows can be marked not in scope; filtered rows are hidden from the main owned/missing album list and do not count as missing or lower completion.
- Cached release groups with no official MusicBrainz releases are automatically excluded when release-status verification has succeeded for the selected artist.
- Web-only preview mode includes representative owned/missing MusicBrainz artist discographies.
- Rust tests cover selected-artist owned/missing comparison, suspicious cache mapping warnings, fuzzy artist candidates, artist-link override behavior, ignored artist suppression, and manual artist-link decisions.

## Roadmap

### Now

#### Phase 18: Backend Modularization

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

#### Phase 19: Frontend Workspace Modularization

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

#### Phase 20: Import Safety and Incremental Sync

Expected outcome:

- Imports are easier to reason about, faster for small changes, and safer when source data changes unexpectedly.

Candidate work:

- Track and album hash comparison.
- Changed/new/removed album summary before final replacement.
- More visible import delta previews.
- Better failure recovery when source files disappear mid-import.
- Import benchmarks for the 1.13M-row library.

#### Phase 21: Performance and Observability

Expected outcome:

- Search, chart, import, export, and tool performance are measured rather than guessed.

Candidate work:

- Persist or export performance probe reports.
- Surface slow operation details in development logs.
- Benchmark common indexed filters and chart loads.
- Audit indexes after Billboard and Discovery growth.
- Add developer log export.

#### Phase 22: Expanded Music Tools Fix Actions

Expected outcome:

- Music Tools can move from detection to guided cleanup without risking the library.

Candidate work:

- More dry-run fix plans.
- Backups before every mutating fix action.
- Reviewable affected-row lists.
- Fix history.
- Undo/restore path.
- Safe fixes for duplicate position reports and metadata normalization suggestions.

#### Phase 23: Local MusicBrainz Discography Enrichment

Expected outcome:

- Optional local MusicBrainz lookup helps discover missing artist releases and understand collection completeness without requiring live external API access.

Reference implementation:

- v3 `musicbrainz_integration.py` queried a local `musicbrainz_cache.db`.
- v3 matched artists and albums with local `musicbrainz_tools` normalizers and matchers.
- v3 surfaced the feature inside artist details as an overview, missing-albums table, CSV export, and complete discography timeline.
- The standalone `C:\_code\musicbrainz` tools add cache building, cache-only missing-album exports, artist browser views, release radar, statistics, backups, resume behavior, and MusicBrainz rate-limit handling.

Completed in 0.29.0:

- Add a Settings control for selecting or validating a local MusicBrainz cache, defaulting to `MusicBrainz/musicbrainz_cache.db`.
- Add a backend availability/status command with cache path, table checks, file size, artist count, distinct MBID count, release count, year range, cache date range, duplicate-MBID count, and suspicious mapping count.
- Add a cache quality panel that explains suspect mappings and lets the user inspect examples before enabling broad reports.
- Add app-owned MusicBrainz artist link and release-decision tables for verified, ignored, and suspect mappings in later workflows.

Completed in 0.30.0:

- Add selected-artist MusicBrainz discography status in the Artists workspace.
- Add artist discography lookup by album artist with manual verified links first, exact lowercase cache lookup second, and normalized lookup third.
- Add artist detail totals for MusicBrainz pure album count, local album count, owned count, missing count, completion percentage, and match confidence.
- Add a missing/owned releases table with default pure-official-album filtering, year/title sorting, confidence/source columns, and quality warnings.
- Add Rust coverage for deterministic owned/missing comparison and suspicious duplicate-MBID/high-release-count detection.

Completed in 0.30.1:

- Add per-release not-in-scope decisions for selected artist MusicBrainz rows, backed by the app-owned `musicbrainz_release_decisions` table.
- Exclude not-in-scope and ignored MusicBrainz rows from missing counts and completion while keeping them visible and restorable.
- Add Rust coverage for release decisions excluding rows from missing counts.

Completed in 0.30.2:

- Add app-owned MusicBrainz release-status caching in SQLite schema version 12.
- Verify selected-artist official album release-group IDs through the MusicBrainz release endpoint when status cache rows are missing.
- Automatically exclude cached release groups that have no official MusicBrainz releases, covering bootleg-only rows such as Def Leppard's `Yeah! Unfinished and Unreleased` and `Retromania`.
- Keep manual include/not-in-scope controls as review overrides after automatic status verification.
- Add Rust coverage for automatic release-status exclusion.

Completed in 0.30.3:

- Hide excluded MusicBrainz release rows from the selected-artist owned/missing table by default.
- Rename the selected-artist summary count from `Excluded` to `Filtered`.

Completed in 0.31.0:

- Show the current selected-artist MusicBrainz match with cached name, MBID link, match method, and artist-link review state.
- Add Verify, Ignore, Unlink, and manual MBID correction actions in the selected-artist MusicBrainz panel.
- Persist selected-artist match decisions in `musicbrainz_artist_links`.
- Let verified artist links override raw cache lookup, and suppress selected-artist MusicBrainz rows when an artist link is ignored.
- Add Rust coverage for ignored artist suppression and manual artist-link decisions.

Fixed in 0.31.1:

- Open the selected-artist MusicBrainz MBID link in the system default web browser from the Tauri desktop app.

Fixed in 0.31.2:

- Infer Album Artist from a single Display Artist when MusicBee exports blank album-artist values for an album.
- Normalize common dash variants in artist keys so visually identical album artists stay grouped together in Artists, Search filters, Discovery, Music Tools, and MusicBrainz local-album matching.

Completed in 0.32.0:

- Add selected-artist local-cache candidate rows for unmatched MusicBrainz artist lookups using fuzzy `artist_cache` matching.
- Add selected-artist candidate rows for suspect cache matches using alternate cached names and fuzzy alternate MBIDs.
- Let selected-artist candidates be saved as verified `musicbrainz_artist_links` rows while keeping manual MBID correction available.
- Add Rust coverage for fuzzy candidate generation and suspect-match alternate cached-name candidates.

Remaining candidate work:

- Add matcher availability and cache staleness checks once the matching utilities are wired into the app.
- Add release-type breakdown progress for combined MusicBrainz types.
- Add optional secondary-type filters and CSV/XLSX export for MusicBrainz release rows.
- Add a complete discography timeline that shows owned vs missing releases by year and release type.
- Add broader artist-link review workflows for collection-wide reports after selected-artist review is stable.
- Add an explicit "refresh this artist" action after cache-only reads are stable; the action should back up the cache, use MusicBrainz rate limiting, require user-agent/contact configuration, and update only the selected artist.
- Consider a Music Tool that lists high-confidence missing MusicBrainz albums across favorite or high-coverage artists after artist-link quality gates exist.

Constraints:

- Never require external lookup for core browsing.
- Review all enrichment before applying.
- Keep source and confidence visible.
- Core browsing must use local data only. Selected-artist MusicBrainz release-status verification may use a bounded MusicBrainz API call when local status cache rows are missing, and must fall back to cache-only rows if the network is unavailable.
- Batch or collection-wide MusicBrainz reports must hide suspect artist mappings until reviewed or verified.
- Do not overwrite MusicBee source metadata automatically.
- Cache data may be stale or incomplete; UI copy and exports should make that visible.
- Broad live MusicBrainz refreshes must never run during normal page rendering; selected-artist release-status verification is allowed only for missing app-owned status-cache rows.

Done criteria:

- App works normally when no MusicBrainz cache is configured.
- Cache status accurately reports unavailable, invalid, available, and quality-warning states. Stale detection remains pending matcher/refresh metadata.
- `MusicBrainz/` remains ignored by git so large cache databases and backups stay local.
- Artist lookup returns deterministic owned/missing results for a seeded cache fixture.
- Tests cover suspicious duplicate-MBID/high-release-count detection.
- Verified artist links override raw cache mappings; ignored artist links suppress selected-artist results and future broad reports.
- Missing releases can be filtered, sorted, paginated, and exported.
- Artist refresh is explicit, backed up, progress-reporting, and rate-limit aware if it is included in the first implementation.
- Confidence/source fields are visible in the UI and export formats.
- Rust tests cover cache validation, artist matching, release filtering, and local collection comparison.
- Frontend/web-preview mocks cover available, unavailable, invalid-cache, quality-warning, fuzzy-match, verified-link, ignored-link, no-missing, and many-missing states.

### Later

#### Phase 24: Optional Broader External Enrichment

Expected outcome:

- Optional sources beyond the first local MusicBrainz cache can enrich discovery, artwork, identifiers, and metadata audits without changing core library ownership.

Candidate work:

- Discogs or other catalog comparison as a separate source.
- Lightweight user-maintained CSV enrichment workflow.
- Artist images and biographies, if they can be cached and attributed cleanly.
- Shared manual link/unlink review across Billboard, MusicBrainz, and future sources.

Constraints:

- Never require external lookup for core browsing.
- Keep every external source optional and visibly attributed.
- Review all enrichment before applying.
- No library data should leave the machine without explicit user action.

#### Phase 25: Optional AI Assistance

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

#### Phase 26: Packaging and Release Operations

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
- Should MusicBrainz Settings expose only the default local cache path at first, or allow selecting an arbitrary cache file immediately?
- Should featured/collaboration albums count as owned MusicBrainz releases for an artist, or remain separate from primary album-artist completion?

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
- Keep production Tauri CSP enabled and keep startup code out of inline HTML.
- Keep Tauri capabilities explicitly selected in config so permission boundaries are reviewable.
- Keep app versions synchronized across package, Tauri, and Cargo metadata.
- Export only visible/default columns by default.
- Let users opt into calculated export columns such as Album Score.
- Use MusicBrainz as the first external enrichment source.
- Start MusicBrainz from a local cache, not live API calls.
- Use `MusicBrainz/musicbrainz_cache.db` as the default local cache path.
- Keep `MusicBrainz/` ignored by git.
- Treat MusicBrainz matches as reviewable discovery evidence, not automatic source metadata replacements.
- Add app-owned MusicBrainz artist/release link decisions instead of trusting the external cache directly.
- Exclude suspect MusicBrainz cache mappings from broad reports until reviewed or manually verified.
- Use normalized album title as the first MusicBrainz owned/missing comparison key; use matching year to raise confidence, not to decide ownership alone.
- Treat legacy cache `release_groups.status` values as weak evidence because the recovered cache builder hardcoded `Official`; use app-owned not-in-scope decisions until a richer cache stores real release-status metadata.
- Verify official release-group status from MusicBrainz release data and cache it app-side before treating legacy cache-only album rows as in-scope.
- Keep external enrichment and AI optional.
