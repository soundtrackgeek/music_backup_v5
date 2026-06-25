# Music Library

A local-first desktop app for importing and analyzing a MusicBee TSV library export.

Phase 1 creates the Tauri, React, TypeScript, Rust, and SQLite foundation. The app can stream `musicbee-library.tsv`, store raw track rows, calculate album aggregates, keep a SQLite backup before replacing imported data, and show import history in the desktop shell.

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

The web-only Vite view uses a mock runtime state for layout work. Start the Tauri desktop app to import local TSV files and access SQLite.

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

## Phase 1 Features

- Tauri 2 desktop shell with React and TypeScript.
- SQLite database in the app data directory with WAL mode enabled.
- Initial migrations for import runs, backups, raw tracks, normalized tracks, and album aggregates.
- Streaming TSV import with required MusicBee header validation.
- Database backup before each import, retaining the last 3 backups.
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
