# Music Library

A local-first desktop app for importing, searching, browsing, and analyzing a MusicBee TSV library export.

The current Phase 17 build runs on a Tauri, React, TypeScript, Rust, and SQLite foundation with hardened release/security checks. The app can stream `musicbee-library.tsv`, store raw track rows, calculate album aggregates, keep configurable rolling SQLite backups before replacing imported data, list and restore local database backups with a pre-restore safety copy, run a Performance Proof probe against the active SQLite database, validate a local read-only MusicBrainz cache from Settings, compare a selected artist against MusicBrainz pure official albums, import and display real album cover art, import Billboard year-end album and singles CSV rankings, browse sortable album and track tables, save searches, filter Search albums by rated-track and Billboard rank ranges, filter Search tracks by imported Billboard singles rank ranges, build ranked album charts with include/exclude genre filters, min/max rating-completeness ranges, Billboard rank templates, and in-place genre suggestions, display-only table-header sorting inside the current ranked set, and resizable square cover-grid artwork, save chart configurations, expand the `scores` genre group in include/exclude genre filters, export filtered result sets, explore discovery dashboards for rating backlogs, loved outliers, genre clusters, artist constellations, and smart missions, analyze library health, rating burndown, time shape, loved density, catalog concentration, duration, outlier, decade progress, genre portfolio, metadata coverage, rating, and import dashboards, manage settings, switch between light and dark mode, choose default sidebar visibility, drill into dedicated album detail pages with ordered track lists, browse album artists with artist-level summary stats, album lists, MusicBrainz owned/missing pure album status, and cover boards, browse canonical genres with genre-level summary stats and album lists, and review Music Tools validation issue lists, including albums missing imported cover image records and imported Billboard albums or singles missing from the library, with exports and a guarded whitespace cleanup action.

The sidebar currently enables Search, Charts, Discovery, Statistics, Albums, Artists, Genres, Tools, Imports, and Settings. The left navigation can be shown in full, icon-only, or hidden mode, while the right detail sidebar can be shown or hidden so the main workspace expands into the available page width. The Imports workspace can scan an `AlbumCovers` folder for folder-named images, link matching source images directly, skip covers that are already imported, extract missing embedded MP3 artwork into the same `AlbumCovers` folder, import yearly Billboard album chart CSV files from `CSV/`, and import yearly Billboard singles chart CSV files from `CSV_SINGLES/`. The Settings workspace can save and check a local MusicBrainz cache path, defaulting to `MusicBrainz/musicbrainz_cache.db`.

## Requirements

- Node.js 20 or newer
- Rust toolchain compatible with Tauri 2
- A MusicBee TSV export with the columns listed in `SPEC.md`

## Install

```powershell
npm install
```

## Development

Run the web UI only:

```powershell
npm run dev
```

The web-only Vite view uses a mock runtime state for layout work. Start the Tauri desktop app to import local TSV files, access SQLite, save searches and settings, and write exports.

Run the full desktop app:

```powershell
npm run tauri:dev
```

The desktop dev shell loads Vite from `http://127.0.0.1:1420/`, matching the loopback host used by `npm run dev`. Vite ignores the local `musicbee-library.tsv` export, `AlbumCovers/` archive, `CSV/` album chart folder, `CSV_SINGLES/` singles chart folder, and `MusicBrainz/` cache folder during development so large library data cannot stall the dev server watcher. If the Tauri window opens but stays blank, make sure port `1420` is free and restart `npm run tauri:dev`.

The import screen defaults to `musicbee-library.tsv`, `AlbumCovers`, `CSV`, and `CSV_SINGLES`. Relative paths are resolved from the app process directory and its parent, so repo-root source folders work during local development. MusicBee TSV quote characters are treated as literal tag text during import, matching plain TSV exports where titles can contain unpaired quotes. The TSV, local `AlbumCovers/` archive, local `CSV/` chart folder, local `CSV_SINGLES/` chart folder, and local `MusicBrainz/` cache folder are intentionally ignored by git.

## Build

```powershell
npm run build
npm run tauri:build
```

Run the full release gate, including security checks, frontend build, Rust tests, and Tauri packaging:

```powershell
npm run release:check
```

## Test

Run the Rust backend unit tests:

```powershell
cd src-tauri
cargo test
```

Run the full local verification gate without packaging:

```powershell
npm run check
```

Run only the release/security guardrails:

```powershell
npm run security:check
```

## Roadmap and Spec

`SPEC.md` is the living product spec and roadmap. It tracks the current implementation, data contracts, architecture map, open decisions, and the Now/Next/Later roadmap. The current next focus is deeper backend and frontend modularization plus import safety work.

## Phase 17 MusicBrainz Artist Features

- Artists includes a MusicBrainz Discography panel for the selected album artist.
- The desktop backend matches the selected local artist to the local MusicBrainz cache by verified link, exact cache name, then normalized cache name.
- The artist comparison lists pure official MusicBrainz album release groups as owned or missing based on deterministic normalized-title matching against local albums.
- Suspect artist cache mappings are shown as warnings when a matched MBID has multiple cached names or unusually high release-group counts.
- Web-only preview mode includes mock owned/missing MusicBrainz rows for Artists layout work.

## Phase 16 MusicBrainz Cache Features

- Settings includes a MusicBrainz Cache panel for saving and checking a local cache path, defaulting to `MusicBrainz/musicbrainz_cache.db`.
- The desktop backend opens the MusicBrainz cache read-only, validates the expected `artist_cache` and `release_groups` tables, and reports file size, artist counts, MBID counts, release counts, pure official album counts, release-year range, cache-date range, and mapping warnings.
- SQLite schema version 11 adds the persisted MusicBrainz cache path plus app-owned artist-link and release-decision tables for future verified/ignored MusicBrainz matching.
- Web-only preview mode includes a mock MusicBrainz cache warning state for layout work without a local cache.
- `npm run security:check` now verifies that `MusicBrainz/` remains ignored by git.

## Phase 15 Release/Security Features

- Production Tauri builds now use an explicit CSP that disallows inline scripts/styles, object sources, embedding, base URI injection, and form submissions.
- Development builds use a separate dev CSP that permits the local Vite server and HMR websocket.
- The Tauri config explicitly selects the default capability file, and the capability description documents the local-only main-window intent.
- `npm run security:check` verifies CSP invariants, no inline HTML script/style blocks, explicit Tauri capabilities, ignored local library/cache data, and version sync across package, Tauri, and Cargo metadata.
- `npm run check` runs the release/security guard, frontend build, and Rust tests; `npm run release:check` adds Tauri packaging.
- The startup theme bootstrap now runs through the bundled TypeScript entrypoint instead of inline HTML.

## Phase 14 Performance Proof Features

- Settings includes an on-demand Performance Proof panel for the active local database.
- The probe records timings, returned rows, and total counts for representative Search, Charts, Music Tools, Statistics, and Discovery operations.
- Sampled text searches use existing album and track titles from the database so the timings reflect real query work.
- Web-only preview mode returns mock timing rows for layout work; desktop mode runs against SQLite.

## Phase 13 Music Tools Fix Features

- Whitespace Anomalies can preview and apply a local cleanup for the currently visible issue rows.
- Applying the cleanup compacts repeated whitespace in selected track metadata fields and affected album display fields, then rebuilds search indexes.
- Desktop apply actions create a pre-fix SQLite backup before mutating the local database.
- The cleanup is app-local: re-importing a TSV with the same source whitespace can reintroduce those issues.

## Phase 12 Restore Features

- Settings lists available local SQLite backups from the app backup folder, including operation, timestamp, row counts, album counts, file size, and schema version when available.
- Restore is available only for readable backup files from the app backup folder with a supported schema version.
- Restoring asks for confirmation, creates a pre-restore safety backup of the active database, replaces the active SQLite database, refreshes app data, and reports restored track/album counts plus the safety-copy path.
- The restore path removes stale SQLite WAL sidecar files and reopens/migrates the restored database before returning success.

## Phase 11 Billboard Features

- Billboard year-end chart import in the Imports workspace from yearly CSV files such as `CSV/1987.csv`.
- CSV matching uses `EOY Rank`, `Artist`, and `Title`, normalizes case/punctuation, stores every imported chart row, links matched rows to library albums, and stores the best rank when an album appears in multiple chart years.
- Billboard year-end singles import in the Imports workspace from yearly CSV files such as `CSV_SINGLES/1987.csv`.
- Singles CSV matching uses `Yearly Rank`, `Artist`, optional `Featured`, and `Track`; matches against library track `Display Artist` and `Title`; and stores the best rank when the same artist/title appears in multiple chart years.
- Album rows now carry a compact Billboard badge such as `#103 1987` across Search, Charts, Discovery album results, Albums, Artists, Genres, detail panels, and exports.
- Track rows carry compact Billboard singles badges in Search track results and exports, with separate Album Billboard and Single Billboard columns for track exports.
- Search, Albums, and Charts support Billboard album min/max rank filters; Search track mode adds Billboard singles min/max rank filters and Single Billboard sorting; Charts adds a Billboard ranking metric, visible column, and built-in Billboard template.
- The Tools workspace includes Missing Billboard Albums and Missing Billboard Singles, which list imported Billboard chart rows not linked to any library album or track. Overlapping album chart-year entries collapse to the earliest year; overlapping singles chart-year entries collapse to the best rank. If the chart-entry tables are empty after upgrading, selecting each tool prepares it from the default `CSV/` or `CSV_SINGLES/` folder.
- SQLite schema version 10 adds persisted Billboard singles chart entries alongside nullable Billboard singles rank/year track fields.

## Phase 10 Discovery Features

- Discovery workspace for exploration-oriented library views separate from Statistics.
- Completion heatmap for top genre/year intersections, with each populated cell opening matching albums.
- Backlog quest board for high-score partial albums, neglected decades, high-potential genre pockets, loved-track backlogs, artist deep dives, and unfinished high-TMOE albums.
- Smart missions for generated shortcuts such as high-score partial decades, loved incomplete genres, unrated high-potential genres, loved decade cleanup, artist score sprints, and loved outliers.
- Love-vs-rating scatter, Genre universe bubble chart, and Artist constellation bubble chart, with clickable points opening album result sets.
- Web-only preview mock data covers Discovery alongside Search, Charts, Statistics, Albums, Artists, Genres, Tools, and Imports.

## Phase 9 Cover Art Features

- Cover art import in the Imports workspace with live album scan progress, percentage complete, new-cover counts, imported counts, skipped-existing counts, and missing-cover counts.
- Folder-named cover archive matching from `AlbumCovers`, using each album's `<File Path>` folder name and supported image files such as JPG, PNG, GIF, and BMP.
- Archive matches are linked directly to the source image path instead of duplicated into app data.
- Optional embedded MP3 artwork fallback using `<File Path>` plus `<Filename>` when no archive image is found; extracted embedded artwork is written into `AlbumCovers` as `<File Path>` folder name plus the detected image extension.
- Re-running cover import relinks older cache-copy entries back to source archive files and removes stale app-cache copies for those albums.
- Real artwork replaces album cover placeholders in search results, album indexes, album detail, artist/genre album lists, and chart table/list/grid views while preserving initials placeholders for missing artwork.

## Phase 8 Music Tools Features

- Tools workspace with query-backed validation issue counts and affected album/track rows.
- Tool catalog renders immediately; selected validator counts show live percentage progress while affected rows load on demand.
- Initial validation suite for duplicate albums, albums without embedded cover image records, imported Billboard albums missing from the library, duplicates within an album, invalid times, non-numeric ratings, missing tags, non-MP3 files, year anomalies, ratings outside accepted values, track/disc numbering issues, inconsistent album metadata, whitespace anomalies, genre normalization issues, conflicting album artists, and multiple years per album.
- Tool-level severity, issue counts, affected album counts, affected track counts, filterable issue rows, pagination, sorting, and direct issue-result exports to CSV, TSV, XLSX, JSON, and TXT that preserve the active filter and sort.
- Whitespace Anomalies includes a guarded preview/apply action for compacting local database whitespace issues.
- Web-only preview mock data covers Tools alongside Search, Charts, Statistics, Albums, Artists, Genres, and Imports.

## Phase 7 Genres Features

- Genres workspace with a searchable, sortable, paginated canonical-genre index.
- Genre-level summary stats for album counts, rating progress, year span, top artist, track totals, loved tracks, TMOE, average completeness, average album rating, and average Album Score.
- Selected genre album lists backed by normalized canonical-genre filtering.
- Genre album-list export to CSV, TSV, XLSX, JSON, and TXT with optional calculated columns.
- Web-only preview mock data covers Genres alongside Search, Charts, Statistics, Albums, Artists, and Imports.

## Phase 6 Artists Features

- Artists workspace with a searchable, sortable, paginated album-artist index.
- Artist-level summary stats for album counts, rating progress, year span, top genre, track totals, loved tracks, TMOE, average completeness, average album rating, and average Album Score.
- Selected artist album lists backed by normalized artist-key filtering so casing differences do not split album lists.
- Artist album cover board below the selected album list, with clickable covers and inline track detail showing ratings, loved status, and clock time.
- Artist album-list export to CSV, TSV, XLSX, JSON, and TXT with optional calculated columns.
- Web-only preview mock data covers Artists alongside Search, Charts, Statistics, Albums, and Imports.

## Phase 5 Albums Features

- Albums workspace with a dedicated filterable, sortable, paginated album index and min/max rating-completeness range filtering.
- Album include/exclude genre filters use the same five-result in-place genre suggestions as Search and Charts.
- Album detail drill-down with cover placeholders, album metadata, rating completeness, TMOE, AE, loved tracks, and Album Score.
- Ordered album track lists with disc/track positions, track durations, ratings, love markers, filenames, and paths.
- Album-level track-list export to CSV, TSV, XLSX, JSON, and TXT with optional calculated columns.
- Exact album-id filtering for detail/export flows, keeping alternate album versions separate.

## Phase 4 Settings Features

- Settings workspace for app preferences.
- Configurable rolling database backup retention, defaulting to 3 backups.
- Persisted dark mode for the desktop app and web-only preview.
- Persisted layout defaults for full, icon-only, or hidden left navigation and shown or hidden right detail panels.
- SQLite schema version 7 with persisted app settings.

## Phase 4 Features

- Statistics workspace with library overview, health score, rating completion burndown, library shape by time, loved density, catalog concentration, duration analytics, aggregate outlier stats, decade progress timeline, genre portfolio matrix, metadata coverage, rating progress, year progress, genre progress, rating distributions, loved-track stats, import delta timeline, import history, and rating history dashboards.
- SQLite schema version 4 with import delta counters, rating snapshots, and rating events recorded during imports.
- Import history now tracks added, changed, and removed tracks and albums for each import.
- Rating history captures completed, changed, added, and removed rated albums as import-time events.
- Web-only preview mock data covers Statistics alongside Search, Charts, and Imports.

## Phase 3 Features

- Charts workspace with built-in templates for year, decade, genre, scores, album artist, loved albums, AE, and TMOE rankings.
- Custom chart builder for album filters, include/exclude genre lists with five-result in-place suggestions, ranking metric, display-only sortable table headers, sort direction, result limit, rating completeness min/max range, visible metric columns, and chart view mode.
- Ranked table, compact list, and resizable square cover-grid chart result views, with table headers preserving the current ranked result set and original rank numbers.
- Saved chart configurations stored in SQLite.
- XLSX export for Search and Charts, alongside CSV, TSV, JSON, and TXT.

## Phase 2 Features

- Search workspace with album and track table views with clickable sortable column headers.
- SQLite FTS5 indexes over album, artist, title, genre, publisher, path, and filename fields.
- Composable query builder for text filters, comma-separated genre and exclude-genre lists with five-result in-place suggestions loaded from the canonical genre index and matched anywhere in genre names, years, release years, album duration in album views, track duration in track views, track count, rated-track count, album rating, track rating, rating completeness min/max ranges, loved-track count in album views, exact track `Love = "L"` filtering in track views, publisher, file path, filename, and view-specific missing metadata flags.
- Genre and exclude-genre lists expand `scores` to Action, Animation, Comedy, Documentary, Drama, Fantasy, Horror, Sci-Fi, Thriller, TV, Video Game, Western, and Anime.
- Active filter chips with one-click removal.
- Saved searches stored in SQLite.
- CSV, TSV, JSON, and TXT exports for the current filtered result set, with optional calculated columns.

## Phase 1 Features

- Tauri 2 desktop shell with React and TypeScript.
- SQLite database in the app data directory with WAL mode enabled.
- Initial migrations for import runs, backups, raw tracks, normalized tracks, and album aggregates.
- Streaming TSV import with required MusicBee header validation.
- Database backup before each import, retaining the configured rolling backup count.
- Album calculations for total time, rated-track count, rating completeness, loved tracks, TMOE, AE, effective album rating, and Album Score.
- Import progress events surfaced in the UI.

## Album Calculation Rules

- `Year` is the canonical year.
- `Release Year` is stored as secondary metadata.
- `Album Artist (display)` identifies albums.
- `Display Artist` identifies tracks.
- Only exact `Love = "L"` counts as loved.
- Track ratings must be whole-number values from `0` to `5`, including whole-number decimals such as `5.0`.
- Track ratings are normalized to the `0-100` album-rating scale.
- If MusicBee `Album Rating` is missing or `-1`, fully rated albums get a calculated album rating from normalized track ratings.
