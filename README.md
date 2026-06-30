# Music Library

A local-first desktop app for importing, searching, browsing, and analyzing a MusicBee TSV library export.

The current Phase 10 build runs on a Tauri, React, TypeScript, Rust, and SQLite foundation. The app can stream `musicbee-library.tsv`, store raw track rows, calculate album aggregates, keep configurable rolling SQLite backups before replacing imported data, import and display real album cover art, browse sortable album and track tables, save searches, filter Search albums by rated-track ranges, build ranked album charts with include/exclude genre filters, min/max rating-completeness ranges, and in-place genre suggestions, display-only table-header sorting inside the current ranked set, and resizable square cover-grid artwork, save chart configurations, expand the `scores` genre group in include/exclude genre filters, export filtered result sets, explore discovery dashboards for rating backlogs, loved outliers, genre clusters, artist constellations, and smart missions, analyze library health, rating burndown, time shape, loved density, catalog concentration, duration, outlier, decade progress, genre portfolio, metadata coverage, rating, and import dashboards, manage settings, switch between light and dark mode, choose default sidebar visibility, drill into dedicated album detail pages with ordered track lists, browse album artists with artist-level summary stats and album lists, browse canonical genres with genre-level summary stats and album lists, and review Music Tools validation issue lists, including albums missing imported cover image records, with exports.

The sidebar currently enables Search, Charts, Discovery, Statistics, Albums, Artists, Genres, Tools, Imports, and Settings. The left navigation can be shown in full, icon-only, or hidden mode, while the right detail sidebar can be shown or hidden so the main workspace expands into the available page width. The Imports workspace can scan an `AlbumCovers` folder for folder-named images, link matching source images directly, skip covers that are already imported, and extract missing embedded MP3 artwork into the same `AlbumCovers` folder.

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

The desktop dev shell loads Vite from `http://127.0.0.1:1420/`, matching the loopback host used by `npm run dev`. Vite ignores the local `musicbee-library.tsv` export and `AlbumCovers/` archive during development so large library data cannot stall the dev server watcher. If the Tauri window opens but stays blank, make sure port `1420` is free and restart `npm run tauri:dev`.

The import screen defaults to `musicbee-library.tsv`. Relative paths are resolved from the app process directory and its parent, so the repo-root TSV works during local development. MusicBee TSV quote characters are treated as literal tag text during import, matching plain TSV exports where titles can contain unpaired quotes. The TSV and local `AlbumCovers/` archive are intentionally ignored by git.

## Build

```powershell
npm run build
npm run tauri:build
```

## Roadmap

- Phase 11: External enrichment and AI features.

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
- Initial validation suite for duplicate albums, albums without embedded cover image records, duplicates within an album, invalid times, non-numeric ratings, missing tags, non-MP3 files, year anomalies, ratings outside accepted values, track/disc numbering issues, inconsistent album metadata, whitespace anomalies, genre normalization issues, conflicting album artists, and multiple years per album.
- Tool-level severity, issue counts, affected album counts, affected track counts, filterable issue rows, pagination, sorting, and direct issue-result exports to CSV, TSV, XLSX, JSON, and TXT that preserve the active filter and sort.
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
