# Changelog

## [0.2.0] - 2026-06-25
### Added
- Added a Search workspace with album and track table browsing.
- Added SQLite FTS5 indexes for album and track search fields.
- Added a composable query builder with text, genre, year, duration, rating, completeness, loved-track, file, publisher, and missing metadata filters.
- Added active filter chips and saved searches backed by SQLite.
- Added CSV, TSV, JSON, and TXT export for filtered result sets with optional calculated columns.

## [0.1.0] - 2026-06-25
### Added
- Scaffolded the Tauri 2, React, TypeScript, Rust, and SQLite music library app.
- Added streaming MusicBee TSV import with required header validation.
- Added SQLite migrations for import runs, backups, raw tracks, normalized tracks, and calculated album aggregates.
- Added database backup creation before imports with retention of the last 3 backups.
- Added album calculations for total time, rated-track count, rating completeness, loved tracks, TMOE, AE, effective album rating, and Album Score.
- Added an imports dashboard with progress, summary metrics, import history, and phase 1 calculation status.
- Added a web-only mock runtime state so the Vite UI can be previewed without Tauri.
