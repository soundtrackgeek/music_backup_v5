# Music Library

A local-first desktop app for importing, searching, browsing, and analyzing a MusicBee TSV library export.

Phase 5 adds a Settings workspace on top of the Tauri, React, TypeScript, Rust, and SQLite foundation. The app can stream `musicbee-library.tsv`, store raw track rows, calculate album aggregates, keep configurable rolling SQLite backups before replacing imported data, browse album and track tables, save searches, build ranked album charts, save chart configurations, export filtered result sets, analyze library/rating/import progress dashboards, and switch between light and dark mode.

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

## Phase 5 Features

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
