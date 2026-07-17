# Music Library Living Specification and Roadmap

Last updated: 2026-07-17
Status: Living product and implementation contract
Current implementation: Natural-language Search and Charts, bounded questions about the active filtered view, an aggregate-only Statistics Library analyst, a reviewable local Playlist Builder, and verified outside-library artist/album/song Discovery are implemented through Luna-generated typed recipes/function calls, bounded MusicBrainz search, and local SQLite execution, with secure Windows API-key storage and the existing MusicBrainz/test architecture slices complete
Current package version: 0.58.2
SQLite schema version: 23

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
- Which artists with verified 1992 releases are not represented in my library?
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
| Search | Implemented | Primary album and track browsing, composable filters, Ask Luna natural-language filter creation and bounded current-view questions, saved searches, and exports. |
| Charts | Implemented | Built-in and saved ranked album views with Ask Luna natural-language chart creation and bounded current-view questions plus table, compact list, and cover grid modes. |
| Discovery | Implemented | Verified outside-library artist/album/song discovery plus exploration dashboards for rating backlogs, loved outliers, genre clusters, artist constellations, and smart missions. |
| Playlists | Implemented | Luna-planned, SQLite-selected track playlists with year/rating/loved metadata, review/reorder/remove, exact local saved copies, and M3U8 export. |
| Statistics | Implemented | Aggregate-only Luna Library analyst plus library health, rating progress, metadata coverage, import history, time shape, duration, concentration, and outlier dashboards. |
| Albums | Implemented | Album index, album filters, detail drill-down, track lists, and album-level exports. |
| Artists | Implemented | Album-artist index, artist summary stats, album lists, cover board, MusicBrainz pure-official-album discography status, and exports. |
| Genres | Implemented | Canonical-genre index, genre summary stats, album lists, and exports. |
| Tools | Implemented | Query-backed validation issue lists, severity, progress, pagination, sorting, counts, exports, and guarded whitespace cleanup. |
| Imports | Implemented | MusicBee TSV import, cover art import, Billboard album CSV import, Billboard singles CSV import, progress, and import history. |
| Settings | Implemented | Secure Windows OpenAI key storage, theme, backup retention, backup restore, Performance Proof diagnostics, MusicBrainz cache status, country flag display, and default left/right sidebar visibility. |

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
- The cache foundation made zero MusicBrainz network API calls. The selected-artist discography slice may perform bounded MusicBrainz release-status verification when the app-owned status cache is missing, and the explicit selected-artist update action may fetch release groups for the reviewed MBID into an app-owned overlay table.
- If the cache or matching utilities are unavailable, the app should show a clear unavailable state and all core library features should continue working.
- Cache status should be inspectable, including path, availability, file size, artist count, distinct MBID count, release count, release year range, cache date range, duplicate-MBID count, suspicious high-release mapping count, and matching capability.
- Cache counts are dynamic. The v3 reference cache documented roughly 483,675 official releases from 20,208 artists, but v5 should display counts from the actual selected cache.
- The current recovered cache is useful but imperfect: some cached query names point at incorrect MusicBrainz MBIDs. v5 should treat the cache as a fast candidate source and add a trust layer before presenting broad missing-album results as authoritative.

Minimum expected cache tables:

| Table | Required columns | Purpose |
| --- | --- | --- |
| `artist_cache` | `name`, `mbid` | Find a MusicBrainz artist candidate for a local album artist. |
| `release_groups` | `artist_mbid`, `release_mbid`, `title`, `year`, `type`, `secondary_types`, `track_count`, `status` | Load a MusicBrainz artist's release-group discography. |

Origin country enrichment rules:

- Treat MusicBrainz artist `area` and derived artist country as optional enrichment for local album artists, not as source metadata that overwrites MusicBee fields.
- Store both the raw MusicBrainz area evidence and the derived country-level value so the UI can show provenance when the final `Origin Country` is surprising.
- Prefer reviewed app-owned artist links before cache-derived MBIDs. Broad import may use high-confidence, non-suspect cache matches, but suspect/ignored artist mappings must be skipped until reviewed.
- Use an explicit import action to fetch missing artist origin data by MBID. Normal Search, Charts, Artists, and Statistics rendering must never trigger broad MusicBrainz network calls.
- Prefer a country-level MusicBrainz/ISO value when available. If the artist area is a subdivision such as England, preserve that raw area and derive the country-level value separately when possible.
- Keep unresolved, ambiguous, historical, worldwide, and multi-area cases reviewable instead of forcing a country.

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
- Do not mutate local library data or the recovered `musicbrainz_cache.db` from MusicBrainz matches.
- Treat MusicBrainz as discovery evidence, not source-of-truth replacement metadata.
- Always expose source, match confidence, and whether a row is exact, fuzzy, missing, or manually linked.

App-owned trust layer:

- Persist local artist to MusicBrainz artist decisions in the app database, not in the external cache.
- Store local artist key, display artist, selected MusicBrainz MBID, canonical MusicBrainz artist name when known, match method, confidence, verification state, ignored state, and timestamps.
- Persist per-release decisions for manual link, unlink, ignore, and not-in-scope states.
- A verified manual artist link should override `artist_cache.name -> mbid` lookup results.
- An ignored or suspect artist mapping should suppress broad batch missing-album results until reviewed.
- Broad collection-wide missing-album reports should have a minimum quality gate: verified artist link or high-confidence non-suspect cache match.
- Shared MusicBrainz overlay sync starts unconfigured. The user must choose a portable shared SQLite path before manual or automatic sync can run.

## Architecture Map

### Frontend

Core files:

- `src/App.tsx`: top-level app composition, shared state wiring, and cross-workspace user workflows.
- `src/backend.ts`: runtime-neutral backend facade and command dispatch.
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
- `src/app/navigation.ts`: workspace shortcut handling and top-position reset behavior.
- `src/backend/tauriClient.ts`: direct Tauri invoke, event, opener, and runtime wrappers.
- `src/backend/webPreview.ts`: web-preview fixtures, mutable preview state, and mock behavior.
- `src/backend/normalization.ts`: portable settings defaults, local cache handling, and shared settings normalization.
- `src/components/AiSettingsPanel.tsx`: transient API-key entry and configured/source status without persisting or displaying the secret.
- `src/components/NaturalLanguageQueryPanel.tsx`: shared Search/Charts prompt, compiled-plan summary, and token-usage surface.
- `src/workspaces/SearchWorkspace.tsx`, `ArtistsWorkspace.tsx`, and `SettingsWorkspace.tsx`: focused workspace presentation boundaries without a global state layer.

Expected next frontend modularization:

- Move Search query/results sections, Artists feature panels, and the individual Settings panels behind the new workspace boundaries, then extract Charts, Discovery, Statistics, Albums, Genres, Tools, and Imports.
- Keep shared pure helpers in `src/app`.
- Avoid moving state into a global store until duplication or cross-workspace coupling proves it is needed.

### Tauri and Rust

Core files:

- `src-tauri/tauri.conf.json`: app identity, build settings, release CSP, development CSP, and explicit capability selection.
- `src-tauri/capabilities/default.json`: selected main-window Tauri permission boundary.
- `src-tauri/src/lib.rs`: Tauri command registration and desktop runtime glue.
- `src-tauri/src/main.rs`: app entrypoint.
- `src-tauri/src/models.rs`: Rust payload models shared by commands, database logic, and import logic.
- `src-tauri/src/db.rs`: remaining SQLite search, charts, statistics, discovery, Billboard imports, Music Tools, saved objects, and exports.
- `src-tauri/src/db/migrations.rs`: current schema version and focused data migrations.
- `src-tauri/src/db/settings.rs`: settings persistence, defaults, and normalization.
- `src-tauri/src/db/backups.rs`: backup inventory, validation, creation, and restore behavior.
- `src-tauri/src/musicbrainz.rs`: Read-only MusicBrainz cache validation, status reporting, selected-artist discography comparison, explicit selected-artist refresh, and app-owned artist/release review decisions against the optional local `musicbrainz_cache.db`.
- `src-tauri/src/musicbrainz_sync.rs`: Two-way sync for app-owned MusicBrainz overlay rows through a shared SQLite database, including tombstone handling and local sync-log recording.
- `src-tauri/src/importer.rs`: MusicBee TSV parsing, normalization, import run handling, album aggregation, backup retention, and rating event capture.
- `src-tauri/src/covers.rs`: cover image import, relinking, embedded-art extraction, and local image serving.
- `src-tauri/src/ai.rs`: Windows Credential Manager access, debug-only environment fallback, OpenAI Responses calls, strict Structured Outputs/function-call validation, conversion to local browse/chart requests, bounded current-view tool orchestration, and typed Library analyst reports.

AI boundary:

- Filter compilation sends only the user's request, target workspace, current album/track view, fixed planner instructions, and a strict query-plan schema with separate text, list, missing-field, numeric, numeric-range, and boolean condition groups so field vocabularies and required numeric values cannot be omitted.
- Search supports a typed Random sort. Luna selects that mode, while SQLite performs `RANDOM()` ordering locally; unrated phrases map to the existing missing-rating filter.
- Current-view questions send the question and album/track view first, then require exactly one strict function call containing one to three validated overview/group/list requests. The active `BrowseRequest` and SQLite database stay inside the app.
- The local current-view tool can return exact aggregate summaries, no more than 20 groups, and no more than 20 named rows. It excludes paths, filenames, covers, saved objects, and arbitrary columns; named metadata leaves the machine only after the user's explicit Ask action.
- Library analyst sends only the selected lens and optional focus first, then requires exactly one strict `inspect_library_profile` call containing one to four validated aggregate sections. SQLite reuses the existing Statistics calculations and returns only bounded overview, rating-progress, catalog-shape, taste-signal, metadata-health, and recent-change points.
- Library analyst never sends album, track, or artist names, raw rows, file/source paths, filenames, covers, saved objects, or arbitrary SQL results. Genre labels, decades, fixed metadata fields, rating buckets, and timestamps may leave the machine only after the user's explicit Analyze action; the UI reports the section count, aggregate-point count, and combined token usage.
- Successful Search/Chart compilations, current-view answers, and Library analyst reports save automatically as typed local SQLite snapshots containing the prompt, exact AI output, creation time, and source library import/count state. Current-view answer snapshots also retain their filtered request. Reopening never calls OpenAI; query snapshots reapply filters to the current library, while answer and analyst snapshots preserve the exact historical output.
- Never send the database, full result sets, unbounded raw rows, file paths, filenames, covers, saved objects, unrelated statistics payloads, or the OpenAI key as model context.
- Validate every model-produced field, operator, numeric range, sort, limit, target, and chart metric before executing the existing local SQLite search tool.
- Store the production key outside `AppSettings`, SQLite, localStorage, logs, exports, and backups. Windows Credential Manager is the primary source; `OPENAI_API_KEY` and repo-root `.env` are debug-only fallbacks.
- Use the exact `gpt-5.6-luna` model, Structured Outputs, `store: false`, low reasoning effort, and bounded output. Surface token usage so cost remains visible.

Expected MusicBrainz boundary:

- Keep MusicBrainz cache reads in a dedicated backend module instead of folding them into general search/chart query code.
- Use a separate read-only SQLite connection for `musicbrainz_cache.db`.
- Persist only app-owned MusicBrainz settings, country flag display preference, artist link decisions, artist origin-country rows and review decisions, release link/ignore decisions, release-status verification cache, refreshed artist release-group overlays, cache quality snapshots, and refresh metadata in the app SQLite database.
- Sync only app-owned MusicBrainz overlay rows through the configured shared overlay database; do not place the main app database or recovered MusicBrainz cache under cloud-file sync.
- Keep MusicBrainz source rows separate from MusicBee source rows and calculated album aggregates.
- The first implemented slice persists `musicbrainz_cache_path`, opens the cache read-only, validates expected tables, reports cache quality/status, and creates app-owned artist-link/release-decision tables for later matching workflows.
- The second implemented slice compares the selected Artist workspace artist against pure official MusicBrainz album release groups, using verified artist links first, cache matches second, and deterministic local title matching for owned/missing status.
- The third implemented slice exposes selected-artist match review controls, persists verify/ignore/unlink/manual MBID decisions in `musicbrainz_artist_links`, lets verified links override raw cache lookup, and suppresses selected-artist results for ignored links.
- Keep core Artist workspace rendering local and fast; the MusicBrainz Discography panel may verify official release status against MusicBrainz when local status cache rows are missing, using rate-limit-aware requests and app-owned persistence.
- Explicit selected-artist refresh fetches MusicBrainz release groups by reviewed MBID, writes them into the app-owned overlay table, and must not mutate the recovered `musicbrainz_cache.db`.
- Reuse the same export, pagination, sorting, and issue-list conventions used by Artists and Music Tools where possible.
- Provide web-preview mock payloads so the Artist workspace can be developed without a local cache.

Release and security boundary:

- Production CSP is explicit and disallows inline scripts/styles, object sources, embedding, base URI injection, and form submissions.
- Development CSP is separate and permits the local Vite host plus HMR websocket.
- Local source data, SQLite databases, backup sidecars, cover archives, chart CSV folders, and MusicBrainz cache folders remain ignored by git.
- App version metadata must stay synchronized across `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock`.
- `npm run security:check` is the fast guard for these invariants; `npm run check` adds frontend build and Rust tests; `npm run release:check` adds Tauri packaging.
- GitHub Actions CI runs `npm run check` on Windows for pushes, pull requests, and manual dispatches.
- GitHub Actions Release detects package-version changes on `master`, runs `npm run release:check`, builds Tauri Windows installers, creates a `v<version>` GitHub Release, and uploads `.exe` and `.msi` installer assets.
- Windows release builds use the GUI subsystem so the installed app opens without a terminal window.

Important test boundary:

- Vitest and React Testing Library cover frontend request serialization, saved-object/settings normalization, navigation shortcuts/top reset, and MusicBrainz review-state rendering.
- Desktop-only Tauri/Wry command glue is excluded from Rust lib unit-test builds with `#[cfg(not(test))]`.
- Pure Rust database/import logic remains testable through `cargo test`.
- This avoids the Windows Common Controls v6 manifest issue that can surface as `STATUS_ENTRYPOINT_NOT_FOUND` before tests run.

Expected next backend modularization:

- Continue splitting `db.rs` into focused modules for browse queries, saved objects, exports, statistics, discovery, Billboard, and Music Tools.
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
- SQLite schema version 13 adds the app-owned refreshed artist release-group overlay used by explicit selected-artist MusicBrainz updates.
- SQLite schema version 14 adds MusicBrainz overlay sync settings, artist/release-decision tombstones, and a local sync log for the shared overlay database.
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
- Explicit selected-artist MusicBrainz updates fetch release groups from MusicBrainz by reviewed MBID, store them in the app-owned `musicbrainz_artist_release_groups` overlay, and reload the panel from those rows ahead of stale cache rows.
- The currently visible selected-artist MusicBrainz rows can be exported to CSV/XLSX with owned/missing status, year, MusicBrainz title, local match, confidence, MBID links, match method, and artist-link trust state.
- Web-only preview mode includes representative owned/missing MusicBrainz artist discographies.
- Rust tests cover selected-artist owned/missing comparison, suspicious cache mapping warnings, fuzzy artist candidates, artist-link override behavior, ignored artist suppression, manual artist-link decisions, and hidden-row export filtering.

### Phase 30: MusicBrainz Artist Origin Countries

- Settings provides preview/import/cancel workflows, live progress, activity history, and a searchable coverage report.
- Local artist origin rows retain raw MusicBrainz area evidence, derived country, review state, and manual Artist-page corrections.
- Search and Charts support include/exclude countries and missing-origin filters; result, detail, export, and flag/name display surfaces use the local app-owned rows.
- Reviewed/manual origin rows are preserved during re-import. Synchronizing those origin overrides through the shared overlay remains future work.

### Phase 31: MusicBrainz Artist Information

- Settings provides preview/import/cancel workflows and a searchable report for artist type, gender, life-span, ended state, and begin/end/current areas.
- SQLite schema version 19 stores app-owned artist-information rows and import-run history.
- Artists shows a MusicBrainz Artist Info panel with MBID review, manual MBID and Origin Country controls, imported artist metadata, and explicit selected-artist refresh.
- Search and Charts filter by artist type, gender, born/founded ranges, dead/dissolved state, and died/dissolved ranges.
- Web-preview fixtures and Rust tests cover representative artist-information states and browse filters.

### Phase 25: Natural-language Search and Charts

- Search and Charts include Ask Luna prompt panels that compile natural language into existing `BrowseRequest` and `ChartConfig` payloads.
- The model has no database context or direct database tool. Rust validates the structured plan, then the app's existing local search command executes it against SQLite.
- Settings stores the OpenAI key in Windows Credential Manager and exposes only configured/source/model status to the frontend.
- Debug builds can use an ignored `OPENAI_API_KEY` environment or `.env` fallback; production builds do not load the project `.env` file.
- Query summaries and input/cached/output token usage remain visible and generated filters stay editable before anything is saved.
- SQLite schema version 21 keeps an automatic local Snapshot history for successful Search/Chart compilations, current-view answers, and Library analyst reports. Users can reopen or delete entries; snapshots are part of normal database backups and never contain the OpenAI key.
- Playlist Builder sends Luna only the natural-language request and receives a strict track-filter recipe with a strategy, target, and repeat caps. SQLite owns candidate search and selection; raw library rows and file paths never enter model context.
- SQLite schema version 22 stores explicitly saved exact playlist order, the validated recipe, and its source library state. Saved playlists reopen without Luna and export as UTF-8 M3U8 files.
- Discovery sends Luna only a natural-language outside-library request and receives a strict artist/album/song recipe. One bounded MusicBrainz search supplies attributed candidates, then local SQLite excludes owned identities without exporting library rows or owned-name lists.
- SQLite schema version 23 stores explicitly saved exact outside-library result order, recipe, source evidence, and source library state. Saved lists reopen without Luna or MusicBrainz.

### Phase 26: Release Operations Automation

- GitHub Actions CI verifies pushes to `master`, pull requests, and manual dispatches on `windows-latest`.
- The release workflow detects semantic `package.json` version changes on `master`, verifies the release tag is unused, runs `npm run release:check`, builds the Tauri Windows installers, extracts release notes from `CHANGELOG.md`, creates a `v<version>` GitHub Release, and uploads `.exe` and `.msi` installer assets.
- Windows release binaries are built with the GUI subsystem so installed launches do not keep a console window open.
- Release helper scripts keep version-change detection and changelog note extraction reusable outside the workflow.

## Roadmap

### Now

#### Phase 19: Backend Modularization

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

Progress in 0.51.0:

- Extracted migration coordination/data migration helpers, settings persistence/normalization, and database backup/restore behavior into `src-tauri/src/db/` modules.
- Preserved the existing command entry points through module re-exports.
- Remaining highest-value slices are browse queries, Music Tools, statistics/discovery, saved objects, and exports.

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

Progress in 0.51.0:

- Added Search, Artists, and Settings workspace presentation components while keeping shared state local to `App.tsx`.
- Split direct Tauri access, web-preview fixtures/mock state, and settings normalization out of `backend.ts`.
- Added the Vitest/React Testing Library safety net before continuing deeper panel/state extraction.

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

Completed in 0.33.0:

- Add CSV/XLSX export for currently visible selected-artist MusicBrainz owned/missing rows.
- Include owned/missing status, year, MusicBrainz title, local match, confidence, release/artist MBIDs and links, match method, cached name, and artist-link trust state in selected-artist MusicBrainz exports.
- Keep ignored artist mappings and hidden/not-in-scope rows out of selected-artist MusicBrainz exports by default.
- Add Rust coverage for excluding hidden MusicBrainz rows from selected-artist export tables.

Completed in 0.34.0:

- Add explicit selected-artist MusicBrainz update by reviewed MBID.
- Store refreshed MusicBrainz release groups in app-owned SQLite schema version 13 instead of mutating `musicbrainz_cache.db`.
- Prefer refreshed app-owned release-group rows over stale recovered-cache rows for the selected artist.
- Show selected-artist release-group source/timestamp in the MusicBrainz panel.
- Add Rust coverage for refreshed release-group overlays overriding stale cache rows.

Completed in 0.35.0 and made portable in 0.51.0:

- Add a shared MusicBrainz overlay sync database. It now starts unconfigured and requires a user-selected shared `.sqlite3` path; schema version 20 clears the obsolete developer-specific default on upgrade.
- Sync verified/ignored/unlinked artist links, not-in-scope/include release decisions, official-release status cache rows, and refreshed release-group overlays without moving the main app database.
- Use tombstone rows so artist unlinks and cleared release decisions propagate between machines.
- Add Settings controls for manual MusicBrainz overlay sync, autosync interval in minutes, and recent sync log entries.
- Add Rust coverage for copying overlay rows and applying unlink tombstones.

Implemented slice: MusicBrainz artist origin countries:

Implemented in 0.42.0:

- SQLite schema version 17 adds `musicbrainz_origin_countries`, `musicbrainz_artist_origin_countries`, and `musicbrainz_artist_origin_import_runs` with local artist key, country code, and MBID indexes.
- SQLite schema version 18 adds `app_settings.country_flag_display`, defaulting to `flagAndName`, so Origin Country rendering can use flag-plus-name, name-only, or flag-only display across restarts.
- Settings exposes MusicBrainz Origin Countries status, preview, import, and cancel actions. The importer resolves verified artist links first, then high-confidence non-suspect cache matches, fetches artist country/area data explicitly, and logs skipped, unresolved, failed, and last-processed rows.
- Version 0.42.1 adds live Settings import telemetry for done/left/succeeded/skipped/unresolved/failed counts, current artist fetches, terminal status, and a bounded recent activity log.
- Version 0.45.0 bundles MIT-licensed SVG flags through `flag-icons` and applies the country display preference to Search, Charts, Albums, Artists, MusicBrainz review surfaces, filter chips, and country suggestions.
- The app stores derived `Origin Country` separately from raw MusicBrainz area and begin-area evidence, preserving manual/reviewed rows during re-import.
- Search and Charts include `originCountryCodes` and `missingOriginCountry` filters, saved-config serialization defaults, local SQLite joins through normalized album-artist keys, optional chart/search export columns, and web-preview mock states.
- Search, Albums, Artists, Charts, and the selected-artist MusicBrainz panel can display the derived country with raw-area provenance when available.
- Origin Country UI can render bundled SVG flags with country names, country names only, or flags only without runtime network requests.
- Reviewed/manual Origin Country overlay sync and tombstones for manual clears remain future work. Manual Artist-page country editing is implemented; local import, display, filtering, and export behavior is complete without the sync extension.

Expected outcome:

- Each local album artist can have an app-owned `Origin Country` derived from MusicBrainz artist area/country data.
- Search and Charts can filter by `Origin Country` using local SQLite data only.
- Artists can show origin country with MusicBrainz provenance, review state, and an easy path to fix ambiguous cases.

Implemented data model:

- Add SQLite schema version 17 tables for `musicbrainz_origin_countries`, `musicbrainz_artist_origin_countries`, and `musicbrainz_artist_origin_import_runs`.
- `musicbrainz_origin_countries` stores the canonical country list used by filters: country code, display name, MusicBrainz area MBID when known, ISO source, historical/special flags, and timestamps.
- `musicbrainz_artist_origin_countries` stores one row per local album artist key: display artist, MusicBrainz artist MBID, country code/name snapshot, raw area MBID/name/type, begin-area MBID/name/type when returned, derived-from field (`artist-country`, `artist-area`, `area-lookup`, `manual`, or `unresolved`), confidence/review state, source, fetched timestamp, and updated timestamp.
- `musicbrainz_artist_origin_import_runs` records batch progress, selected scope, fetched/skipped/failed counts, last processed artist key, started/completed timestamps, and error summary so imports can resume cleanly.
- Add indexes on `musicbrainz_artist_origin_countries(local_artist_key)`, `musicbrainz_artist_origin_countries(country_code)`, and `musicbrainz_artist_origin_countries(mbid)`.
- Include reviewed/manual origin-country rows in the shared MusicBrainz overlay sync. Imported rows may be refreshed locally, but manual overrides and cleared/ignored decisions need tombstones.

Implemented import workflow:

- Settings gets an explicit `Import Artist Origin Countries` action under MusicBrainz. It first previews eligible local album artists, linked MBIDs, already imported rows, skipped suspect mappings, unresolved artists, and estimated runtime.
- Eligibility starts from distinct local album artists in the `albums` table, using the same normalized artist key rules as Artists, Search filters, and MusicBrainz discography matching.
- MBID resolution order is verified app-owned `musicbrainz_artist_links`, then high-confidence non-suspect cache matches. Ignored, suspect, blank, duplicate-heavy, and unlinked mappings are skipped and reported for review.
- The importer fetches MusicBrainz artist data by reviewed/resolved MBID with a meaningful user agent, one-request-per-second pacing, retry/backoff, cancel support, and resumable checkpoints.
- Country derivation prefers an explicit artist country code when returned by MusicBrainz. If that is missing, use a country-type artist area with ISO 3166-1 data. If the raw area is a subdivision, preserve the subdivision and derive the parent country from MusicBrainz area data or ISO 3166-2 prefix when reliable. If derivation is not reliable, leave `Origin Country` empty and keep the row reviewable.
- Store raw JSON-relevant evidence only as structured fields needed for audit and display; do not store broad API response blobs unless a debug setting is added.
- Manual review can set country, mark unresolved/ignored, clear a bad import row, or re-fetch a single artist by MBID.

Search, Charts, and UI work:

- Add `originCountryCodes` and `missingOriginCountry` to `BrowseFilters`; saved searches and saved charts must preserve these fields.
- Add an `Origin Country` filter control to Search and Charts with searchable country options, active filter chips, and export support.
- Browse queries join album and track rows through normalized album-artist key to `musicbrainz_artist_origin_countries`; filters must use indexed local data and work when no country rows exist.
- Add optional `Origin Country` columns to Search, Charts, Albums, Artists, and exports. Defaults should keep current tables familiar, but saved visible/export column settings should support the new field.
- The Artists workspace should show origin country in the artist summary, including the raw MusicBrainz area as provenance when different from the derived country.
- Add Settings status for total album artists, imported origins, verified origins, unresolved origins, skipped suspect mappings, and last import run.
- Web-preview mocks should include several origin-country states: verified country, subdivision-derived country, unresolved area, skipped suspect match, and no MusicBrainz data.

Edge cases:

- `Various Artists`, soundtrack-style collection artists, blank artists, and ignored MusicBrainz links should default to no origin country unless manually reviewed.
- Multi-person collaborations and groups should use the MusicBrainz artist MBID's main associated area/country, not the countries of individual members.
- Country names can change; filters should key by country code or MusicBrainz area MBID and display the latest app-owned country name.
- Historical countries, worldwide/Europe areas, and non-country regions should remain visible as raw area evidence but should not be forced into normal country filters without manual mapping.
- Import must not block or mutate library imports, album aggregation, or core browsing.

Done criteria:

- App works normally with no MusicBrainz cache, no origin import, or a partially completed origin import.
- Origin-country import is explicit, rate-limited, resumable, cancellable, and reports skipped/suspect/unresolved artists.
- Search and Charts can filter by origin country from local SQLite only, including saved search/chart round trips.
- Artist, album, search, chart, and export rows can include origin country without changing MusicBee source metadata.
- Rust tests cover schema migration, country derivation, suspect-link skipping, manual override precedence, browse filtering, saved config serialization, and overlay sync behavior for reviewed origin rows.
- Frontend/web-preview mocks cover imported, unresolved, skipped, verified, manually overridden, and missing-origin states.

Remaining candidate work:

- Add matcher availability and cache staleness checks once the matching utilities are wired into the app.
- Add release-type breakdown progress for combined MusicBrainz types.
- Add optional secondary-type filters for MusicBrainz release rows.
- Add a complete discography timeline that shows owned vs missing releases by year and release type.
- Add broader artist-link review workflows for collection-wide reports after selected-artist review is stable.
- Consider a Music Tool that lists high-confidence missing MusicBrainz albums across favorite or high-coverage artists after artist-link quality gates exist.

Constraints:

- Never require external lookup for core browsing.
- Review all enrichment before applying.
- Keep source and confidence visible.
- Core browsing must use local data only. Selected-artist MusicBrainz release-status verification may use a bounded MusicBrainz API call when local status cache rows are missing, and explicit selected-artist update may fetch release groups by reviewed MBID.
- Batch or collection-wide MusicBrainz reports must hide suspect artist mappings until reviewed or verified.
- Do not overwrite MusicBee source metadata automatically.
- Cache data may be stale or incomplete; UI copy and exports should make that visible.
- Broad live MusicBrainz refreshes must never run during normal page rendering; selected-artist release-status verification is allowed only for missing app-owned status-cache rows, and selected-artist release-group refresh must require an explicit user action.

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

#### Phase 25.5: Additional Optional AI Assistance

Expected outcome:

- AI extends the implemented natural-language Search and Charts foundation into bounded questions about the current filtered view and reviewable local playlists, followed later by recommendations.

Implemented in version `0.54.0`:

- Search and Charts expose an Ask about this view panel over the active `BrowseRequest` snapshot.
- Luna uses a strict `inspect_current_view` function call instead of receiving the request or database directly.
- SQLite can return an exact overview, bounded groups, and/or at most 20 named rows; paths and filenames are excluded.
- Answers are stateless, show matching-row/inspection/name-sharing metadata, and combine token usage across the tool and answer calls.

Implemented in version `0.55.0`:

- Statistics exposes a Library analyst with Overview, Rating backlog, Taste profile, Catalog balance, and Metadata health lenses plus an optional focus question.
- Luna uses one strict `inspect_library_profile` call to choose up to four locally calculated aggregate sections, then returns a strict typed report with one to five evidence-backed findings and up to three next questions.
- Reports are stateless and disclose profile sections, aggregate points, and combined token usage. No album, track, artist, path, filename, or source-path rows are shared.

Implemented in version `0.56.0`:

- Successful Ask Luna Search/Chart compilations, Ask about this view answers, and Library analyst reports save automatically in a shared typed local Snapshot history.
- Reopening a Search/Chart snapshot reapplies its compiled filters against the current library without another API call; reopening an analyst snapshot restores the exact report generated from its recorded library state.
- Snapshot rows include created time, source import identifier/timestamp, and album/track counts, can be deleted individually, and participate in normal SQLite backups.

Implemented in version `0.56.1`:

- Selecting a Library analyst useful next question immediately runs the follow-up through the current analysis lens without requiring a second button click.
- Starting a manual or suggested analysis clears the Focus question while retaining the submitted value in the request and automatic snapshot.
- Follow-up question controls remain disabled while Luna is analyzing, preventing duplicate requests and snapshots.

Implemented in version `0.57.0`:

- Playlists exposes a dedicated review-first builder that asks Luna for one strict bounded track recipe and executes it against local SQLite.
- Selection supports ranked, variety, discovery, and random strategies, up to 500 local candidates and 200 selected tracks, duration or count targets, and repeat caps per artist and album.
- The draft shows each track's year, numeric rating when present, and loved-heart state, and can be renamed, reordered, and trimmed before it affects saved state. Saving is explicit and stores the exact order plus source library state in SQLite schema version 22.
- Saved playlists reopen and update without token cost, participate in normal database backups, and export to UTF-8 M3U8 using paths that never leave the device.

Implemented in version `0.57.1`:

- A known available app update adds an amber download overlay to the Windows taskbar icon and the app's system tray icon until a successful check reports that the installed version is current.
- The tray tooltip includes the available update version, and left-clicking the tray icon restores and focuses the main app window.

Implemented in version `0.58.0`:

- Discovery exposes Find what your library is missing for artist, album, and song requests with counts from 1 to 25, optional year/genre/country/keyword filters, and separate release-year versus explicit artist formation-year semantics.
- Luna receives only the request and returns a strict recipe. The desktop app makes one bounded MusicBrainz search (maximum 100 candidates), spaces request starts by at least 1.1 seconds, attributes each result, and locally excludes owned artists by MBID/name, albums by release-group MBID or artist/title, and songs by artist/title.
- The result can be named and saved explicitly with its exact order, MusicBrainz evidence, Luna recipe, timestamp, and library import/count state in SQLite schema version 23. Reopening or deleting a saved list requires no OpenAI or MusicBrainz request.
- External links remain restricted to HTTPS `musicbrainz.org` artist, release-group, and recording pages. Requests can return fewer results than requested; the UI discloses this instead of inventing candidates.

Implemented in version `0.58.2`:

- Playlist track recipes may order local candidates by their album's effective rating. `Discover unrated deep cuts from highly rated albums` therefore compiles to missing track rating, album rating descending, and discovery selection instead of being rejected as an unsupported track sort.
- The playlist response schema exposes only locally supported track sort fields, preventing Luna from returning other album-only ordering fields that SQLite cannot execute for track candidates.

Candidate prompts:

- "Which artists appear most often in these results?"
- "How many of these albums are unrated, and what is their average length?"
- "Build a playlist from loved tracks in underexplored genres."
- "Explain why these albums rank highly without sending the full library."

Constraints:

- AI features must be optional.
- No bounded view metadata should leave the machine without the user's explicit Ask action.
- Generated actions should remain reviewable before they affect saved state.
- Search and chart query compilation is implemented in version `0.53.0`; future slices must reuse the same secure key and strict local-tool boundary.

#### Phase 26: Packaging and Release Operations

Expected outcome:

- The app is easier to install, update, diagnose, and recover.

Candidate work:

- Automated unsigned GitHub Releases with Windows installer assets. Implemented in version `0.36.0`.
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
