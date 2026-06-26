# Music Library

A local-first desktop app for importing, searching, browsing, and analyzing a MusicBee TSV library export.

The current Phase 8 build runs on a Tauri, React, TypeScript, Rust, and SQLite foundation. The app can stream `musicbee-library.tsv`, store raw track rows, calculate album aggregates, keep configurable rolling SQLite backups before replacing imported data, browse album and track tables, save searches, build ranked album charts, save chart configurations, export filtered result sets, analyze library/rating/import progress dashboards, manage settings, switch between light and dark mode, drill into dedicated album detail pages with ordered track lists, browse album artists with artist-level summary stats and album lists, browse canonical genres with genre-level summary stats and album lists, and review Music Tools validation issue lists with exports.

The sidebar currently enables Search, Charts, Statistics, Albums, Artists, Genres, Tools, Imports, and Settings. Cover placeholders and cover-grid-ready layouts exist today, but real cover image discovery, caching, and rendering are planned for Phase 9.

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

The import screen defaults to `musicbee-library.tsv`. Relative paths are resolved from the app process directory and its parent, so the repo-root TSV works during local development. The TSV is intentionally ignored by git.

## Build

```powershell
npm run build
npm run tauri:build
```

## Roadmap

- Phase 9: Real cover art support. Current cover UI is placeholder-only.
- Phase 10: External enrichment and AI features.

## Phase 8 Music Tools Features

- Tools workspace with query-backed validation issue counts and affected album/track rows.
- Tool catalog renders immediately; selected validator counts and affected rows load on demand.
- Initial validation suite for duplicate albums, duplicates within an album, invalid times, non-numeric ratings, missing tags, non-MP3 files, year anomalies, ratings outside accepted values, track/disc numbering issues, inconsistent album metadata, whitespace anomalies, genre normalization issues, conflicting album artists, and multiple years per album.
- Tool-level severity, issue counts, affected album counts, affected track counts, filterable issue rows, pagination, sorting, and exports to CSV, TSV, XLSX, JSON, and TXT.
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

- Albums workspace with a dedicated filterable, sortable, paginated album index.
- Album detail drill-down with cover placeholders, album metadata, rating completeness, TMOE, AE, loved tracks, and Album Score.
- Ordered album track lists with disc/track positions, track durations, ratings, love markers, filenames, and paths.
- Album-level track-list export to CSV, TSV, XLSX, JSON, and TXT with optional calculated columns.
- Exact album-id filtering for detail/export flows, keeping alternate album versions separate.

## Phase 4 Settings Features

- Settings workspace for app preferences.
- Configurable rolling database backup retention, defaulting to 3 backups.
- Persisted dark mode for the desktop app and web-only preview.
- SQLite schema version 5 with persisted app settings.

## Phase 4 Features

- Statistics workspace with library overview, rating progress, year progress, genre progress, rating distributions, loved-track stats, import history, and rating history dashboards.
- SQLite schema version 4 with import delta counters, rating snapshots, and rating events recorded during imports.
- Import history now tracks added, changed, and removed tracks and albums for each import.
- Rating history captures completed, changed, added, and removed rated albums as import-time events.
- Web-only preview mock data covers Statistics alongside Search, Charts, and Imports.

## Phase 3 Features

- Charts workspace with built-in templates for year, decade, genre, album artist, loved albums, AE, and TMOE rankings.
- Custom chart builder for album filters, ranking metric, sort direction, result limit, rating completeness threshold, visible metric columns, and chart view mode.
- Ranked table, compact list, and cover-grid-ready chart result views.
- Saved chart configurations stored in SQLite.
- XLSX export for Search and Charts, alongside CSV, TSV, JSON, and TXT.

## Phase 2 Features

- Search workspace with album and track table views.
- SQLite FTS5 indexes over album, artist, title, genre, publisher, path, and filename fields.
- Composable query builder for text filters, genres, years, release years, album duration, track count, album rating, track rating, rating completeness, loved-track count, publisher, file path, filename, and missing metadata flags.
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
