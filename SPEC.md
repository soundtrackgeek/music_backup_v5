# Music Library App Specification

Date: 2026-06-26
Status: Draft, current implementation through Phase 9

## 1. Product Goal

Build a fast, attractive, local-first music library application for browsing, searching, filtering, charting, exporting, and analyzing a MusicBee TSV library export.

The app should make it easy to answer questions such as:

- Which Synthpop albums from 1987 do I own?
- Which 1983-1985 post-punk albums are 20-25 minutes long?
- What are my top rated Britpop albums?
- What are the top 1980s Hard Rock and AOR albums between 30 and 40 minutes long?
- How many albums from 1987 have I fully rated?
- Which albums were newly rated since the last import?

Speed is the highest priority. The UI should also be polished and functional, with real cover art views where artwork has been imported.

## 2. Source Data

The current source file is `musicbee-library.tsv`.

Current observed TSV profile:

- Track rows: 1,130,882
- Album keys by `<Album Unique Id>`: 76,789
- Time values currently parse cleanly in observed data.
- Most track ratings are currently blank, so chart eligibility must be based on calculated rating completeness, not only the `Album Rating` field.
- `Love` currently appears as `L` when set and blank otherwise.
- `Year` is the canonical year for filtering, charting, and statistics. `Release Year` is secondary reference metadata.
- Each album should have one canonical genre. If a field contains multiple genres, use the first genre as the canonical album genre and flag the rest through Music Tools.

Current columns:

| Column | Meaning / Use |
| --- | --- |
| `Display Artist` | Track display artist. Use this when identifying tracks. |
| `Album Rating` | MusicBee album rating. Use as an input to Album Score, but do not use alone to decide whether an album is chart eligible. |
| `Disc#` | Disc number. Used for ordering and validation. |
| `Album` | Album title. |
| `Genre` | Track/album genre text. Use the first genre as the canonical album genre. Needs normalized searchable facets. |
| `Love` | Loved-track marker. Only exact value `L` counts as loved. |
| `Publisher` | Label/publisher metadata. |
| `Rating` | Track rating. Used for rating completeness and TMOE. |
| `Title` | Track title. |
| `Track#` | Track number. Used for ordering and validation. |
| `Year` | Primary and canonical year field for filtering and charts. |
| `Release Year` | Secondary release-year field for reference and comparison. |
| `<Album Unique Id>` | Preferred album identity key. |
| `<File Path>` | Source folder path. |
| `<Filename>` | Track filename. |
| `Album Artist (display)` | Album artist display value. Use this when identifying albums. |
| `Time` | Track duration, currently formatted like `m:ss`; should also support `h:mm:ss`. |

## 3. Recommended Tech Stack

### Application Shell

Use a local desktop app built with:

- Tauri 2
- React
- TypeScript
- Vite

Why:

- Tauri keeps the app lightweight and fast compared with Electron.
- React and TypeScript are a strong fit for a rich filtering/charting UI.
- Vite gives quick local development.
- Tauri can safely access local files, run local import jobs, and manage the SQLite database.

### Database

Use SQLite with:

- WAL mode enabled for responsive reads during imports.
- FTS5 virtual tables for fast text search over album, artist, title, genre, publisher, and paths.
- Indexed normalized columns for year, genre, rating completeness, total minutes, album score, loved-track count, and album artist.
- Optional DuckDB later if ad hoc analytics become much heavier, but SQLite is the best first database for a fast local app.

### Backend Runtime

Use Rust inside Tauri for:

- TSV import.
- Database migrations.
- Backup/restore.
- Incremental sync.
- Export generation.

Use TypeScript for:

- UI state.
- Query builder state.
- Presentation formatting.
- Chart configuration.

### UI and Visualization

Use:

- TanStack Table for fast tabular browsing.
- TanStack Virtual for virtualized large result lists.
- Zustand or TanStack Store for lightweight app state.
- Recharts, ECharts, or Observable Plot for statistics and chart views.
- shadcn/ui or a small custom component layer on top of Radix UI for accessible controls.

Recommended visualization choice: ECharts, because it handles large datasets, interactive charts, and export-friendly charting well.

### Exports

Support:

- CSV
- TSV
- XLSX
- JSON
- TXT

Implementation options:

- CSV/TSV/JSON/TXT from Rust or TypeScript.
- XLSX via a Rust crate or a small dedicated export module. The export should use the exact current query/chart result set, including visible columns and sorting.
- Calculated fields such as Album Score should be optional export columns and off by default unless they are already visible in the current view.

## 4. Core Concepts

### Track

A single TSV row.

Important fields:

- Album identity
- Artist metadata
- Title
- Disc and track numbers
- Time
- Track rating
- Love marker
- Genre
- Year/release year
- File path and filename
- Use `Display Artist` for track identity and track-level browsing.
- Do not use `Album Artist (display)` to identify individual tracks.

### Album

An aggregate built from all tracks sharing the same album key.

Preferred identity:

1. `<Album Unique Id>`
2. Fallback only when the unique id is missing: normalized album artist + normalized album title + year + file path root

Albums with different `<Album Unique Id>` values remain separate database albums, even if they appear to be alternate versions, remasters, or duplicates. A later Music Tool should flag likely duplicate album versions because the preferred library state is one kept copy of an album.

Album-level calculated fields:

- Total tracks
- Rated tracks
- Rating completeness percent
- Total time in seconds and minutes
- Loved tracks
- TMOE
- AE
- Album Score
- Canonical normalized genre
- First/last year values
- Missing/invalid metadata flags
- Use `Album Artist (display)` for album identity and album-level browsing.

### Chart

A ranked album list based on a saved query plus a ranking formula.

Default chart rule:

- Include only albums where 100% of tracks have valid ratings.
- If `Album Rating` is missing or `-1` but every track is validly rated, calculate the album rating and allow the album into charts.

Override:

- A rating completeness slider may lower the threshold, such as 90%, 80%, or any chosen percentage.
- Albums included through a threshold below 100% should clearly display their rating completeness.
- Albums without an effective album rating cannot receive an Album Score and should be excluded from Album Score-ranked charts unless a future chart mode explicitly supports unranked/incomplete albums.

## 5. Calculations

### Total Album Time

`total_album_seconds = sum(track.time_seconds)`

`total_album_minutes = total_album_seconds / 60`

Store seconds for precision. Display minutes with sensible rounding.

### Rated Track

A track is rated when `Rating` is a valid numeric value in the accepted rating range.

Initial accepted values:

- `0`
- `1`
- `2`
- `3`
- `4`
- `5`
- whole-number decimal equivalents, such as `5.0`, which should normalize to `5`

Values outside the accepted range should be flagged by Music Tools. Decimal half ratings such as `3.5` or `4.5` are anomalies and should not count as valid ratings.

Track ratings must be normalized to the 0-100 album-rating scale:

| Track Rating | Normalized Points |
| --- | ---: |
| `0` | 0 |
| `1` | 20 |
| `2` | 40 |
| `3` | 60 |
| `4` | 80 |
| `5` / `5.0` | 100 |

This is required when calculating an album rating from tracks. Album rating calculations must always use the 0-100 scale.

### Effective Album Rating

Album Score should use an effective album rating:

1. Use MusicBee `Album Rating` when it is present and not `-1`.
2. If MusicBee `Album Rating` is missing or `-1`, and every track on the album is validly rated, calculate album rating from the normalized track ratings.
3. If MusicBee `Album Rating` is missing or `-1`, and the album is not fully rated, the album has no effective album rating and cannot receive an Album Score.

Initial calculated album rating formula:

```text
calculated_album_rating = average(normalized_track_rating_points)
```

Round calculated album rating to the nearest whole number for display and chart scoring.

### Rating Completeness

`rating_completeness = rated_track_count / total_track_count`

Display as a percentage.

Chart default eligibility:

`rating_completeness >= 1.0`

Slider override:

`rating_completeness >= selected_threshold`

### Loved Tracks

`loved_tracks = count(tracks where Love == "L")`

Only exact `Love = "L"` means loved.

### TMOE: Total Minutes Of Excellence

TMOE is the total duration of tracks rated `5`.

`tmoe_seconds = sum(time_seconds for tracks where normalized Rating == 5)`

`tmoe_minutes = tmoe_seconds / 60`

Display TMOE in minutes.

### AE: Album Excellence

AE is the share of album duration made up by tracks rated `5`.

`ae_ratio = tmoe_seconds / total_album_seconds`

Display:

`ae_percent = ae_ratio * 100`

Round displayed AE to 2 decimals.

For scoring, use the unrounded ratio where possible, then multiply by 100 in the formula.

### Album Score

Inputs:

- `effective_album_rating`: MusicBee `Album Rating` or calculated album rating fallback
- `ae_ratio`: TMOE divided by total album time
- `tmoe_minutes`: total minutes of tracks rated `5`
- `loved_tracks`: count of loved tracks

Formula:

```text
album_score = ((effective_album_rating * 0.5) + (ae_ratio * 100) + (tmoe_minutes * 0.3)) / 10 + (loved_tracks * 100)
```

Example:

- Effective Album Rating: `65`
- TMOE: `14` minutes
- AE: `29.78%`, stored as `0.2978`
- Loved Tracks: `2`

```text
album_score = ((65 * 0.5) + (0.2978 * 100) + (14 * 0.3)) / 10 + (2 * 100)
album_score = 206.648
```

Display Album Score with 2 or 3 decimals depending on chart density.

## 6. Search and Filtering

The app needs a composable query builder that can mix and match fields.

Required filters:

- Album title contains / equals / starts with
- Track title contains / equals / starts with
- Album artist, using `Album Artist (display)`
- Display artist, using `Display Artist`
- Canonical genre includes / excludes
- Year equals / range
- Release year equals / range
- Album total time range
- Track count range
- Album rating range
- Track rating conditions
- Rating completeness threshold
- Loved-track count
- Has at least one track matching text
- Publisher
- File path
- Filename
- Missing metadata flags

Example queries:

- Synthpop albums from 1987.
- Synthpop albums from 1987 with at least one track title containing `Love`.
- Albums from 1983-1985 in Post-Punk between 20 and 25 minutes long.
- Albums from the 1980s in Hard Rock or AOR between 30 and 40 minutes long.

Every result set should support:

- Sorting
- Column selection
- Saving as a named view
- Exporting to CSV, TSV, XLSX, JSON, and TXT
- Optional inclusion of calculated fields such as Album Score

## 7. Charts and Statistics

### Default Charts

Initial built-in chart templates:

- Top Albums of a selected year
- Top Albums of a selected decade
- Top Albums by canonical genre
- Top Albums by album artist
- Top loved albums
- Albums with highest AE
- Albums with highest TMOE
- Recently added albums, after import history exists
- Recently rated albums, after rating history exists

### Custom Charts

A custom chart is a saved filtered query plus:

- Ranking metric, defaulting to Album Score
- Rating completeness threshold
- Sort direction
- Result limit
- Visible columns
- Optional export columns
- View mode

View modes:

- Table
- Compact list
- Cover grid with real artwork when available and placeholders otherwise
- Album detail drill-down

### Statistics Dashboards

Initial dashboards:

- Library overview: tracks, albums, artists, canonical genres, years, total duration
- Rating progress: rated albums, unrated albums, partially rated albums
- Year progress: albums owned and rated per year
- Genre progress: albums owned and rated per canonical genre
- Rating distribution: track ratings and album ratings
- Loved-track stats
- Import history: added/deleted/changed tracks and albums per import

## 8. Album Details

Album detail pages should show:

- Album title
- Album artist
- Year and release year
- Canonical genre
- Publisher
- Total time
- Track count
- Rated-track count
- Rating completeness
- Album Rating
- TMOE
- AE
- Loved tracks
- Album Score
- Track list with disc/track order, title, time, rating, love marker, filename, and path
- Cover artwork area with placeholder fallback
- Export action for the album track list

Current note:

- Cover discovery and image rendering are implemented through the Phase 9 cover import flow.

## 9. Import, Sync, and Backups

### Initial Import

The app should:

1. Read `musicbee-library.tsv` as a streaming import.
2. Validate the header.
3. Load raw track rows into a staging table.
4. Normalize values into typed track tables.
5. Normalize canonical album genre by taking the first genre value when multiple values are present.
6. Build or refresh album aggregates.
7. Rebuild search indexes.
8. Record an import run with counts and timing.
9. Create a database backup before replacing production data.

### Incremental Updates

The TSV may be updated occasionally. Updates should be fast.

Recommended strategy:

- Store a row hash for each track based on stable source fields.
- Store an album aggregate hash.
- On import, stream the TSV into staging.
- Compare staging hashes with the current database.
- Insert new tracks.
- Update changed tracks.
- Mark missing tracks as removed.
- Recompute only affected albums.
- Refresh FTS rows only for affected tracks/albums.

Track identity should initially use:

- `<File Path>` + `<Filename>`

Album identity should use:

- `<Album Unique Id>` when present.

### Backups

Before any database-changing operation:

- Create a timestamped SQLite backup.
- Store backup metadata: date, operation, source TSV path, source TSV size, row count, album count.
- Keep the last 3 backups by default.
- Allow the backup retention policy to be changed from Settings.

Required operations that trigger backup:

- Import/update from TSV
- Manual metadata edits, if added later
- Bulk fixes, if added later
- Database migrations

## 10. Database Design

Initial tables:

- `import_runs`
- `source_files`
- `tracks`
- `albums`
- `album_artists`
- `track_search_fts`
- `album_search_fts`
- `saved_queries`
- `saved_charts`
- `exports`
- `database_backups`
- `album_snapshots`
- `rating_events`

Important indexes:

- `tracks(album_id)`
- `tracks(year)`
- `tracks(rating)`
- `tracks(love)`
- `tracks(file_path, filename)`
- `albums(album_unique_id)`
- `albums(year)`
- `albums(album_artist_sort)`
- `albums(genre_normalized)`
- `albums(total_seconds)`
- `albums(rating_completeness)`
- `albums(album_score)`

## 11. Music Tools Workspace

The Tools navigation item is enabled as a validation and cleanup workspace. Phase 8 provides query-backed issue lists, severity, filtering, sorting, pagination, affected album/track counts, and exports. Safe fix actions remain future work.

Planned validation and cleanup tools:

- Duplicate albums
- Duplicates within an album
- Invalid time values
- Non-numeric ratings
- Missing tags
- Non-MP3 files
- Year anomalies
- Ratings out of range
- Track/disc number issues
- Inconsistent album metadata
- Whitespace anomalies
- Genre normalization issues
- Albums with conflicting album artist values
- Albums with multiple years across tracks

Each tool provides:

- Issue count
- Filterable affected rows/albums
- Severity
- Export option
- Later: safe fix actions for selected issue types

## 12. Future AI and External Data Features

Planned later features:

- Playlist suggestions based on loved tracks, 5-star tracks, genres, years, and album scores.
- Listening recommendations based on rating history and underexplored genres/years.
- MusicBrainz lookup to identify missing albums from artists.
- Metadata enrichment with clear review/approval before applying changes.
- Natural-language query creation, such as "show me top AOR albums from 1984 under 45 minutes."

AI and external API features should be optional and isolated from the core local library workflow.

## 13. UX Requirements

The UI should optimize for repeated use:

- Fast startup.
- Fast search-as-you-type.
- Keyboard-friendly filtering.
- Clear filter chips and saved views.
- Table virtualization for large result sets.
- No blocking UI during import.
- Visible import progress.
- Export actions available from searches, charts, dashboards, and album details.
- Real cover images render in album and chart layouts when available, with placeholders preserved for albums without imported artwork.

Recommended main navigation:

| Navigation item | Status | Phase | Purpose |
| --- | --- | --- | --- |
| Search | Implemented | Phase 2 | Primary album and track browsing, filters, saved searches, and exports. |
| Charts | Implemented | Phase 3 | Built-in and custom ranked album views. |
| Statistics | Implemented | Phase 4 | Library overview, rating progress, year/genre progress, and import/rating history. |
| Albums | Implemented | Phase 5 | Dedicated album index and album detail drill-down. |
| Artists | Implemented | Phase 6 | Dedicated album-artist index with artist-level album lists and stats. |
| Genres | Implemented | Phase 7 | Dedicated canonical-genre index with genre-level album lists and stats. |
| Tools | Implemented | Phase 8 | Music Tools validation and cleanup issue lists. |
| Imports | Implemented | Phase 1 | TSV import, progress, import history, and backup visibility. |
| Settings | Implemented | Phase 4 | App preferences such as backup retention and theme. |

## 14. Performance Targets

Initial targets:

- Open app shell: under 2 seconds after warm start.
- Search/filter interaction: under 150 ms for common indexed filters.
- Load first page of a chart: under 300 ms.
- Initial import of the current 1.13M-row TSV: target under 2-5 minutes on a normal desktop.
- Incremental import with small changes: target under 30 seconds.
- Exports up to 100,000 rows should stream without freezing the UI.

These are targets, not hard guarantees. They should be measured once implementation starts.

## 15. Development Phases

### Phase 1: Data Foundation (implemented)

- Create Tauri + React + TypeScript app.
- Add SQLite database and migrations.
- Implement TSV import.
- Store raw tracks and calculated albums.
- Implement backup before import.
- Implement album calculations: total time, rated count, rating completeness, loved tracks, TMOE, AE, Album Score.

### Phase 2: Search and Browse (implemented)

- Album table.
- Track table.
- Full-text search.
- Query builder.
- Filter chips.
- Saved searches.
- CSV/TSV/JSON/TXT export.

### Phase 3: Charts (implemented)

- Built-in charts.
- Custom chart builder.
- Rating completeness slider.
- Album Score ranking.
- XLSX export.
- Chart/list/table view modes.

### Phase 4: Statistics and Settings (implemented)

- Library overview dashboard.
- Rating progress dashboard.
- Year and genre progress.
- Import history.
- Rating history.
- Settings workspace.
- Configurable backup retention.
- Persisted light/dark theme preference.

### Phase 5: Albums Workspace (implemented)

- Enable the Albums navigation item with a dedicated album index.
- Add album detail pages with track lists, calculations, and album-level export.
- Reuse the current album filtering, sorting, pagination, and export behavior from Search where it fits.
- Keep cover placeholders in album layouts until real cover art support is added in Phase 9.

### Phase 6: Artists Workspace (implemented)

- Enable the Artists navigation item with album-artist index pages, artist album lists, and artist-level summary stats.
- Add searchable, sortable, paginated artist index pages.
- Add selected artist album lists filtered by normalized album-artist identity.
- Add artist-level exports for selected artist album lists.

### Phase 7: Genres Workspace (implemented)

- Enable the Genres navigation item with canonical-genre index pages, genre album lists, and genre-level summary stats.

### Phase 8: Music Tools Workspace (implemented)

- Enable the Tools navigation item.
- Music Tools validation suite.
- Issue counts, filterable affected rows/albums, severity, and exports.
- Later safe fix actions for selected issue types.

### Phase 9: Cover Art Support (implemented)

- Discover real album cover images from a local `AlbumCovers` archive by matching each album's `<File Path>` folder name to image filenames.
- Optionally discover embedded MP3 cover art by combining `<File Path>` and `<Filename>` for a representative track when no archive image is found.
- Link archive cover images directly to their source files to avoid duplicating large cover collections.
- Cache only extracted embedded MP3 artwork when no standalone archive image is available.
- Serve cover image data safely through the local app runtime.
- Skip albums that already have imported cover art unless replacement is explicitly enabled.
- Relink older cache-copy entries back to source archive files and remove stale app-cache copies when cover import is run again.
- Show live scan progress, percentage complete, new-cover counts, imported counts, relinked counts, skipped-existing counts, and missing-cover counts.
- Replace chart and album placeholder covers with real artwork when available.
- Preserve useful placeholders for albums without available artwork.

### Phase 10: External Enrichment and AI (future)

- MusicBrainz integration.
- AI playlist/recommendation features.

## 16. Resolved Product Decisions

The following decisions are part of the first implementation unless changed later:

- Use `Year` as the canonical year for filtering, charts, and statistics.
- Treat `Release Year` as secondary metadata.
- Use one canonical genre per album. If multiple genres are present, use the first genre.
- Use `Album Artist (display)` for album identity and album-level browsing.
- Use `Display Artist` for track identity and track-level browsing.
- Use exact `Love = "L"` for loved-track counting.
- Treat only whole-number track ratings from `0` to `5` as valid, including whole-number decimal equivalents such as `5.0`.
- Treat half-step ratings such as `3.5` and `4.5` as Music Tools anomalies.
- Count both `5` and `5.0` as rating `5` for TMOE.
- If `Album Rating` is missing or `-1`, calculate album rating from tracks when every track is rated.
- Keep albums separate by `<Album Unique Id>`, but flag likely duplicate versions/remasters through Music Tools.
- Keep the last 3 database backups by default.
- Keep backup retention configurable from Settings.
- Export only visible/default columns by default.
- Let users opt into calculated export columns such as Album Score.
