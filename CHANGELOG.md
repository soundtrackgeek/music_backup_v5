# Changelog

## [0.23.0] - 2026-07-01
### Added
- Added a Missing Billboard Albums tool that lists imported Billboard chart rows not linked to any library album, with filtering, sorting, pagination, and existing Music Tools exports.
- Persisted imported Billboard chart rows in SQLite so missing Billboard albums can be compared from the database after running the Billboard import.

## [0.22.4] - 2026-07-01
### Fixed
- Fixed Charts grid album cards so Billboard badges always render below the artist line and above the ranking metric, preventing long title rows from making individual cards taller.

## [0.22.3] - 2026-07-01
### Fixed
- Fixed Charts grid cards so long album titles, artist names, cover art, and Billboard badges stay contained within each album tile.

## [0.22.2] - 2026-07-01
### Fixed
- Fixed Billboard CSV matching so library artists and albums with diacritics can match plain ASCII chart text such as `Mötley Crüe` to `MOTLEY CRUE`.

## [0.22.1] - 2026-07-01
### Fixed
- Fixed upgrades from existing databases so the Billboard rank index is created only after the new album columns are added.

## [0.22.0] - 2026-07-01
### Added
- Added Billboard year-end CSV imports from the `CSV/` folder, storing each matched album's best year-end rank and chart year.
- Added Billboard badges, filters, sorting, chart ranking support, chart columns, detail-panel display, and exports for album rows across the app.

### Changed
- Ignored local Billboard CSV data in git and Vite file watching alongside the MusicBee TSV and cover archive.

## [0.21.0] - 2026-06-30
### Added
- Added an Artist page album cover board with clickable covers and inline track detail showing rating stars, loved status, and clock time.

## [0.20.0] - 2026-06-30
### Added
- Added direct export controls to the Music Tools issue result panel for CSV, TSV, XLSX, JSON, and TXT exports.

### Changed
- Music Tools exports now preserve the active validator, text filter, and sort order from the visible issue result set.

## [0.19.0] - 2026-06-30
### Added
- Added a Music Tools validator for albums missing imported archive or embedded cover image records, with affected album rows and exports.

## [0.18.0] - 2026-06-27
### Added
- Added a second batch of Statistics dashboards: Library Shape by Time, Loved Density, Catalog Concentration / Long Tail, Duration Analytics, and Outlier Stats.
- Added statistics API payloads for library shape, loved-density groups, catalog concentration, duration analytics, and aggregate outlier summaries, with web-preview mock data.

## [0.17.1] - 2026-06-27
### Fixed
- Fixed MusicBee TSV imports so quote characters in titles and tags are treated as literal text instead of collapsing later rows into one parsed record.

## [0.17.0] - 2026-06-27
### Added
- Added a first batch of expanded Statistics dashboards: Library Health Score, Rating Completion Burndown, Decade Progress Timeline, Genre Portfolio Matrix, Import Delta Timeline, and Metadata Coverage.
- Added statistics API payloads for library health scoring, decade progress, and metadata coverage, with web-preview mock data for the new panels.

## [0.16.0] - 2026-06-27
### Added
- Added on-demand layout controls for collapsing the left navigation sidebar, switching it to icon-only mode, and hiding or showing the right detail sidebar.
- Added Settings defaults for full, icon-only, or hidden left navigation and shown or hidden right detail panels.

## [0.15.2] - 2026-06-27
### Fixed
- Fixed Discovery heatmap aggregation performance on large libraries so the Discovery page populates instead of appearing empty while the backend query runs.
- Improved Discovery loading states so initial startup shows loading copy instead of misleading zero-count empty states.

## [0.15.1] - 2026-06-27
### Fixed
- Fixed startup hydration so slow or failed Discovery aggregates cannot block core Search summary metrics, library status, statistics, settings, saved searches, or saved charts from loading.

## [0.15.0] - 2026-06-27
### Added
- Added the Phase 10 Discovery workspace with a completion heatmap, backlog quest board, smart missions, love-vs-rating scatter, genre universe bubbles, artist constellation bubbles, and clickable album-result drilldowns.
- Added a desktop `get_discovery` aggregate command and web-preview mock discovery data for exploration dashboards.

## [0.14.0] - 2026-06-27
### Added
- Added Search min/max filters for rated track counts so album results can be limited to ranges such as 3-5 rated tracks.

## [0.13.0] - 2026-06-27
### Added
- Added min/max rating completeness range sliders to Search, Albums, and Charts so albums can be filtered to intervals such as 30-70%.

## [0.12.3] - 2026-06-27
### Fixed
- Fixed album detail track rating counts to show `rated / total rated` instead of `total / rated rated`.

## [0.12.2] - 2026-06-27
### Fixed
- Fixed desktop genre suggestions to load from a dedicated canonical genre-name command before falling back to the heavier genre summary query.

## [0.12.1] - 2026-06-27
### Fixed
- Fixed desktop genre suggestions so Search, Albums, and Charts retry loading the canonical genre index independently of startup data loading instead of falling back to only the built-in `scores` alias.

## [0.12.0] - 2026-06-27
### Added
- Added five-result in-place genre suggestions to Search, Albums, and Charts include/exclude genre filters, with keyboard navigation and substring matching across canonical genre names.

### Changed
- Raised the desktop genre-list request cap so the suggestion cache can load the full canonical genre index.

## [0.11.1] - 2026-06-27
### Fixed
- Fixed the Charts builder to expose the existing Exclude genres filter, including saved chart configurations and exports.

## [0.11.0] - 2026-06-27
### Added
- Added a `scores` genre group alias for Search, Albums, Charts, and exports, expanding to Action, Animation, Comedy, Documentary, Drama, Fantasy, Horror, Sci-Fi, Thriller, TV, Video Game, Western, and Anime in include/exclude genre filters.
- Added a built-in Scores chart template backed by the new genre group.

## [0.10.12] - 2026-06-26
### Fixed
- Fixed Search, Albums, and Charts genre filter fields so comma-separated genre lists can be typed without the comma being stripped mid-entry.

## [0.10.11] - 2026-06-26
### Changed
- Clarified Search missing-field checkboxes and active-filter chips with album- or track-specific labels.

### Fixed
- Fixed web-preview Search missing-field filters so track view follows the same missing track metadata rules as the desktop backend.

## [0.10.10] - 2026-06-26
### Fixed
- Fixed Search track-view Loved min/max filters to match each track's exact `Love = "L"` marker instead of the album's loved-track total.

## [0.10.9] - 2026-06-26
### Fixed
- Fixed Search track Minutes min/max filters to compare against each track's duration instead of the album's total duration.

## [0.10.8] - 2026-06-26
### Added
- Added a chart grid cover-size slider for resizing album artwork in Grid view.

### Fixed
- Fixed chart grid album covers to render as uniform square thumbnails regardless of source artwork dimensions.

## [0.10.7] - 2026-06-26
### Fixed
- Fixed artist and genre detail sidebars to show fully rated albums as `rated / total` instead of `total / rated`.

## [0.10.6] - 2026-06-26
### Fixed
- Improved dark-mode artist detail stat value contrast so compact totals such as total time remain readable.

## [0.10.5] - 2026-06-26
### Added
- Added album cover thumbnails to Search album results, Search track album cells, chart compact rows, and chart table rows.

### Changed
- Reused one cover/title cell across album-bearing tables so album, artist, genre, search, and chart result surfaces render artwork consistently.

## [0.10.4] - 2026-06-26
### Changed
- Changed embedded MP3 cover fallback to save missing artwork into the configured `AlbumCovers` source folder instead of the app data cover cache.
- The cover import panel now defaults embedded fallback on and clarifies that missing embedded art is extracted into `AlbumCovers`.

### Fixed
- Albums with embedded MP3 artwork but no standalone archive image can now populate `AlbumCovers/<folder name>.<ext>` during cover import.

## [0.10.3] - 2026-06-26
### Changed
- Changed cover archive imports to link directly to `AlbumCovers` source files instead of copying every archive image into the app data folder.
- Cover rendering now loads image data through a local backend command, so the app can read configured cover source paths without broad Tauri asset protocol access.

### Fixed
- Re-running cover import now relinks existing cache-copy entries back to source archive images and removes stale app-cache cover copies for those albums.

## [0.10.2] - 2026-06-26
### Fixed
- Ignored the local MusicBee TSV export, cover archive, Tauri sources, and built assets in Vite's dev watcher so `npm run tauri:dev` can serve the UI instead of hanging on large local library data.

## [0.10.1] - 2026-06-26
### Fixed
- Matched the Tauri dev URL to Vite's `127.0.0.1:1420` loopback server so `npm run tauri:dev` no longer opens a blank desktop window when `localhost` resolves differently.

## [0.10.0] - 2026-06-26
### Added
- Added Phase 9 cover art support with a cover import panel in the Imports workspace.
- Added folder-name matching against the local `AlbumCovers` archive with live scan percentage, new-cover, imported, skipped-existing, and missing-cover counts.
- Added optional embedded MP3 artwork fallback, local cover caching, and Tauri asset rendering for cached images.
- Added real cover rendering in album indexes, album detail, artist/genre album lists, and chart cover grids with placeholder fallback.

### Changed
- Ignored the local `AlbumCovers/` archive so cover image collections stay out of git.

## [0.9.4] - 2026-06-26
### Changed
- Changed Charts table header sorting to reorder only the current ranked result set while preserving each album's original rank number.
- Chart result queries now continue to use the selected ranking metric and limit even when the table is display-sorted by Album, Artist, Year, or another visible column.

## [0.9.3] - 2026-06-26
### Added
- Added clickable sortable column headers to Search, Charts, and the dedicated Albums table.

### Changed
- Saved chart configurations now retain the selected chart table sort field separately from the displayed ranking metric.

## [0.9.2] - 2026-06-26
### Added
- Added live percentage progress for selected Music Tools validation counts and issue row loading.

### Changed
- Updated the Tools workspace to show selected-tool progress in the summary metric, validator list, issue panel, and detail panel.

## [0.9.1] - 2026-06-26
### Fixed
- Made the Music Tools catalog render immediately instead of waiting for every validation count query to finish.
- Updated the Tools workspace to load selected-tool counts and affected rows on demand.

## [0.9.0] - 2026-06-26
### Added
- Added the Phase 8 Music Tools workspace with validation issue counts, affected album/track rows, severity, filtering, pagination, sorting, and exports.
- Added Tauri commands for listing Music Tools, listing selected tool issues, and exporting selected tool issue rows.
- Added the initial validation suite for duplicate albums, duplicate tracks within albums, invalid times, rating anomalies, missing tags, non-MP3 files, year issues, track/disc numbering issues, inconsistent metadata, whitespace anomalies, genre normalization issues, conflicting album artists, and multiple years per album.
- Added web-preview mock data for the Tools workspace.

## [0.8.0] - 2026-06-25
### Added
- Added the Phase 7 Genres workspace with a searchable canonical-genre index, selected genre album lists, genre-level summary stats, and genre album-list exports.
- Added a Tauri `list_genres` command backed by normalized canonical-genre grouping.
- Added web-preview mock data for the Genres workspace.

## [0.7.0] - 2026-06-25
### Added
- Added the Phase 6 Artists workspace with a searchable album-artist index, selected artist album lists, artist-level summary stats, and artist album-list exports.
- Added normalized artist-key filtering for album searches so artist album lists are not split by display casing differences.
- Added web-preview mock data for the Artists workspace.

## [0.6.0] - 2026-06-25
### Added
- Added the Phase 5 Albums workspace with a dedicated album index, album detail drill-down, ordered track lists, cover placeholders, and album-level track-list export.
- Added exact album-id filtering for album detail and export flows so alternate versions remain distinct.

### Fixed
- Exported track rows now use per-track duration instead of album total duration for the Time column.

## [0.5.3] - 2026-06-25
### Changed
- Split the future sidebar roadmap into separate Albums, Artists, Genres, Tools, cover art, and enrichment phases.
- Clarified that current cover UI is placeholder-only and real cover art support remains future Phase 9 work.

## [0.5.2] - 2026-06-25
### Changed
- Updated the spec and README roadmap to document current sidebar workspace status and move dedicated Albums, Artists, Genres, and Tools work into future Phase 5.

## [0.5.1] - 2026-06-25
### Fixed
- Applied the cached dark mode preference before React starts so the app no longer flashes light mode on startup.

## [0.5.0] - 2026-06-25
### Added
- Added a Settings workspace for app preferences.
- Added configurable rolling database backup retention with a default of 3 backups.
- Added persisted dark mode support for the desktop app and web preview.
- Added SQLite schema version 5 with persisted app settings.

## [0.4.0] - 2026-06-25
### Added
- Added the Phase 4 Statistics workspace with library overview, rating progress, year progress, genre progress, rating distribution, loved-track, import history, and rating history dashboards.
- Added SQLite schema version 4 with import delta counters, rating snapshots, and rating events.
- Added import-time tracking for added, changed, and removed tracks and albums.
- Added rating event tracking for newly rated, completed, changed, and removed rated albums.

## [0.3.0] - 2026-06-25
### Added
- Added the Phase 3 Charts workspace with built-in chart templates, a custom chart builder, rating completeness thresholding, and Album Score, loved-track, AE, and TMOE rankings.
- Added saved chart configurations backed by SQLite schema version 3.
- Added ranked table, compact list, and cover-grid-ready chart view modes.
- Added XLSX export support for Search and Charts.

## [0.2.2] - 2026-06-25
### Fixed
- Avoided rerunning no-op SQLite schema migrations on every search when the Phase 2 database schema is already current.
- Serialized real migration work and added a SQLite busy timeout so overlapping startup/search commands do not surface transient migration errors.
- Included the underlying SQLite error detail in migration failures.

## [0.2.1] - 2026-06-25
### Fixed
- Moved search, saved-search, export, and library status database work off the Tauri UI thread so the desktop app stays responsive while large FTS indexes are prepared.
- Stopped background search refreshes when the user switches away from the Search workspace.

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
