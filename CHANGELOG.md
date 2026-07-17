# Changelog

## [0.63.0] - 2026-07-17
### Added
- Added bounded follow-up questions to Search and Charts Ask Luna, with inherited query scope for references such as `Can you list the albums I haven't rated 100% yet?`.
- Added a dedicated local **Not fully rated** filter that includes both partially rated and unrated albums without rounding the condition to 100%.
- Added one-to-five-turn Search/Chart conversations to local snapshots, readable in-app restores, and Markdown exports.
- Added deterministic, interaction, SQLite boundary, persistence, and opt-in live Luna coverage for the Billboard follow-up flow.

### Changed
- Expanded explicitly requested current-view named lists from 20 to 50 rows while keeping grouped values capped at 20 and all file paths, filenames, and database contents local.
- Ask Luna clears a completed direct-answer prompt and immediately offers a follow-up field while keeping the prior questions and answers visible.
- Bumped synchronized app metadata to `0.63.0`.

## [0.62.0] - 2026-07-17
### Added
- Added direct answer intent to Search and Charts Ask Luna, so count, comparison, total, average, summary, and similar questions automatically apply their local cohort filters and run the bounded current-view answer flow in one submission.
- Added combined Search/Chart snapshots and Markdown exports that retain the exact direct answer alongside its original prompt, compiled local request, model usage, and recorded library state.
- Added deterministic, interaction, persistence, and opt-in live Luna coverage for multi-part Billboard rating-progress questions.

### Fixed
- Opened direct Ask Luna answers immediately instead of showing only `Applied · saved` until the new snapshot was clicked.
- Kept comparison fields out of the cohort filters, preventing a question about fully rated versus remaining albums from filtering away the unfinished group.
- Defined `left to rate` and `left to finish` as partially rated plus unrated albums, so Luna reports the requested combined remainder instead of only its interpretation or separate components.

### Changed
- Search and Chart query plans now explicitly distinguish filter intent from answer intent while remaining backward-compatible with existing saved snapshots.
- Bumped synchronized app metadata to `0.62.0`.

## [0.61.0] - 2026-07-17
### Added
- Added a readable in-app document when reopening Ask Luna Search and Chart snapshots, including the original request, interpretation, active filters, applied view/sort limits, chart setup, and recorded library state.
- Added automatic absolute-path copying after every successful file export, with a compact filename, explicit `Path copied` confirmation, and an in-place retry when clipboard writing is unavailable.
- Added a least-privilege Tauri clipboard integration that can write exported paths but cannot read clipboard contents.

### Changed
- Export success messages no longer expose long, obscured paths as their primary text; the full path remains available in the tooltip and clipboard.
- Preserved the exact submitted prompt/question for Search/Chart and current-view Markdown exports even if the visible input is edited afterward.
- Bumped synchronized app metadata to `0.61.0`.

## [0.60.0] - 2026-07-17
### Added
- Added automatic local snapshot history for Music Research conversations, including the selected page context, exact Markdown answers, citations, tool disclosures, token usage, and the latest five exchanges.
- Added one-click Markdown export to Ask Luna Search/Charts, Ask about this view, Library analyst, Music Research, Playlist Builder, and outside-library Discovery, including reopened snapshots and saved playlists/discovery lists.
- Added safe GitHub-flavored Markdown rendering for Music Research headings, emphasis, lists, tables, quotations, code, and HTTPS links while ignoring raw HTML and preventing remote image loading.
- Added frontend and Rust coverage for Markdown rendering, exact snapshot reopen/delete/export behavior, export validation, and newline normalization.

### Changed
- Reopening a Music Research snapshot restores its exact context and bounded conversation without calling Luna or spending tokens.
- Bumped synchronized app metadata to `0.60.0`.

## [0.59.0] - 2026-07-17
### Added
- Added a fixed global Luna button that stays visible in the top-right corner whether the details sidebar is open or hidden and opens a compact Music Research conversation from every workspace.
- Added selected-album, selected-artist, and selected-genre context with contextual starter questions; Search and Charts intentionally open in general-research mode instead of inheriting their separate Ask Luna state.
- Added Responses API web search with visible HTTPS citations plus a strict local `inspect_selected_library_context` tool that can share only a selected entity's summary and at most 20 relevant track or album names.
- Added bounded in-memory follow-up history, automatic conversation reset when the workspace or selection changes, explicit clear/close controls, and token, web-search, and local-inspection disclosures.
- Added frontend, Rust contract, SQLite privacy-boundary, opt-in live Luna, and rendered collapsed-sidebar coverage for Music Research.

### Changed
- Reserved top-right workspace space when the details sidebar is hidden so the fixed Luna and sidebar controls remain accessible without covering page actions.
- Bumped synchronized app metadata to `0.59.0`.

## [0.58.2] - 2026-07-17
### Fixed
- Allowed Playlist Builder track candidates to sort by their album's effective rating, so requests such as `Discover unrated deep cuts from highly rated albums` no longer fail validation.
- Restricted the strict playlist response schema to executable track sort fields and added deterministic plus opt-in live coverage for the reported request.
- Included the rejected sort field in validation errors to make any future planner-contract mismatch diagnosable without exposing library data.

### Changed
- Bumped synchronized app metadata to `0.58.2`.

## [0.58.1] - 2026-07-16
### Added
- Added track year, numeric rating when available, and a loved-heart indicator to every Playlist Builder draft and reopened saved playlist.

### Changed
- Kept playlist metadata visible in the compact responsive row layout while preserving fixed space for duration and reorder/remove controls.
- Bumped synchronized app metadata to `0.58.1`.

## [0.58.0] - 2026-07-16
### Added
- Added an outside-library Discovery panel for natural-language artist, album, and song requests, including explicit count, release/formation-year interpretation, genre, country, and keyword recipes from Luna.
- Added one-request bounded MusicBrainz artist, release-group, and recording searches with visible source evidence and HTTPS links to the verified catalog records.
- Added a process-wide 1.1-second MusicBrainz request-start gate so repeated Discovery searches respect the catalog service's per-IP request-rate guidance.
- Added local SQLite ownership exclusion using MusicBrainz IDs where available plus normalized artist, artist/album, and artist/song identities; no library rows or owned-name lists are sent to Luna or MusicBrainz.
- Added SQLite schema version 23 for explicitly saved Discovery lists containing the exact verified result order, recipe, evidence, and source library import/count state so lists reopen without AI or catalog calls.
- Added web-preview artist/album/song fixtures, React save/reopen interaction coverage, Rust recipe/schema/ownership/persistence tests, and opt-in live Luna and MusicBrainz contract tests.

### Changed
- Expanded the external-link allowlist from MusicBrainz artist pages to artist, release-group, and recording pages while retaining the HTTPS and hostname restrictions.
- Bumped synchronized app metadata to `0.58.0`.

## [0.57.2] - 2026-07-16
### Fixed
- Kept playlist row duration and up, down, and remove controls in their intended columns when a track is not loved, preventing the action buttons from being clipped by the review panel.
- Added an unloved-track regression state to the web preview and Playlist Builder interaction coverage.

### Changed
- Bumped synchronized app metadata to `0.57.2`.

## [0.57.1] - 2026-07-16
### Added
- Added an amber download badge to the Windows taskbar icon and app system tray icon while a newer signed app version is known to be available.
- Added an always-available system tray icon whose tooltip names the available version and whose left-click restores and focuses the main window.
- Added deterministic icon-artwork coverage for the transparent taskbar overlay and non-mutating tray-icon badge composition.

### Changed
- Kept the update badge visible through later checks or install progress until a successful check confirms that no update is available.
- Enabled the scoped Tauri tray and window-icon capabilities required for runtime update indicators.
- Bumped synchronized app metadata to `0.57.1`.

## [0.57.0] - 2026-07-16
### Added
- Added a dedicated Playlist Builder workspace where Luna converts a natural-language request into a strict bounded track-filter recipe and local SQLite selects the actual tracks.
- Added ranked, variety, discovery, and random selection strategies, duration/track targets, per-artist and per-album repeat caps, a 500-candidate ceiling, and a 200-track result ceiling.
- Added review-first draft controls for renaming, reordering, and removing tracks plus explicit UTF-8 M3U8 export using local file paths.
- Added SQLite schema version 22 with exact ordered saved playlists, their Luna recipe, and source library import/count state so playlists can reopen, update, delete, and participate in normal backups without another AI call.
- Added strict recipe/schema tests, local-selection and saved-playlist round-trip tests, M3U8 coverage, a live Luna contract test, and Playlist workspace interaction coverage.

### Changed
- Kept track, album, artist, filename, and path rows out of Playlist Builder model context; only the user's request is sent to Luna and local rows remain inside SQLite/the desktop UI.
- Added `P` as the Playlist workspace shortcut without changing the established numbered workspace shortcuts.
- Bumped synchronized app metadata to `0.57.0`.

## [0.56.1] - 2026-07-16
### Fixed
- Changed Library analyst useful-next-question buttons to run the selected follow-up immediately instead of only copying it into the Focus question field.
- Cleared the Focus question after a manual or suggested analysis starts while preserving the submitted question in Luna's request and the saved snapshot.
- Disabled follow-up buttons while an analysis is running to prevent duplicate Luna requests and snapshots.
- Added React regression coverage for the automatic follow-up analysis and snapshot flow.

### Changed
- Bumped synchronized app metadata to `0.56.1`.

## [0.56.0] - 2026-07-16
### Added
- Added automatic local snapshot history for Ask Luna Search and Charts queries, Ask about this view answers, and Statistics Library analyst reports.
- Added one-click reopening without another OpenAI request, including reapplying saved Search/Chart filters, restoring exact current-view answers and analyst narratives, and deleting individual snapshots.
- Added SQLite schema version 21 with typed snapshot payloads, creation timestamps, and the source library import/count state for historical context.
- Added React restore-flow coverage and Rust migration, validation, round-trip, filtering, and deletion coverage for Luna snapshots.

### Changed
- Changed successful Luna filter compilations and analyst reports to save automatically in the local app database and therefore participate in normal SQLite backups.
- Clarified that reopened Search/Chart snapshots rerun the stored filters against the current library, while analyst snapshots preserve the report produced from the recorded library state.
- Bumped synchronized app metadata to `0.56.0`.

## [0.55.0] - 2026-07-16
### Added
- Added a Statistics Library analyst with Overview, Rating backlog, Taste profile, Catalog balance, and Metadata health lenses plus an optional focus question.
- Added a strict `inspect_library_profile` Luna function tool that selects one to four compact local aggregate sections and a strict typed report with evidence, interpretation, and useful next questions.
- Added per-report disclosure of profile sections, aggregate points, combined input/cached/output token usage, and the zero-name privacy boundary.
- Added Rust projection/privacy/schema tests, a live two-request Luna contract test, React interaction coverage, and rendered desktop/mobile QA.

### Changed
- Reused the established Statistics calculations for collection-wide AI analysis instead of creating a second analytics system or sending the Statistics payload wholesale.
- Kept Library analyst reports stateless and excluded raw rows, album/track/artist names, paths, filenames, covers, saved objects, source paths, and arbitrary SQL results from model context.
- Bumped synchronized app metadata to `0.55.0`.

## [0.54.0] - 2026-07-16
### Added
- Added Ask about this view panels to Search and Charts for questions about the active filtered album or track results.
- Added a strict `inspect_current_view` Luna function tool backed by exact local SQLite overviews, bounded groups, and lists capped at 20 names.
- Added per-answer disclosure of matching rows, local analysis count, names shared, and combined input/cached/output token usage.
- Added Rust, React, live-model, desktop, and mobile coverage for the bounded current-view question flow.

### Changed
- Changed the AI privacy boundary to distinguish row-free filter compilation from explicit current-view questions, which can share only the requested compact aggregates, groups, or bounded names while excluding paths and filenames.
- Kept current-view questions stateless and limited to one strict tool call with one to three analyses to bound cost and context.
- Bumped synchronized app metadata to `0.54.0`.

## [0.53.2] - 2026-07-16
### Added
- Added true local random ordering for Search, including a visible Random sort option and SQLite `RANDOM()` execution without sending library rows to Luna.
- Added deterministic and live-model coverage for random unrated albums and random albums from Swedish musicians.

### Fixed
- Fixed natural-language requests such as `10 random albums from 1989 that I haven't rated yet` by giving Luna a typed missing-fields array whose accepted values match the app's filter vocabulary.
- Changed unrated phrases to compile to the existing missing-rating filter instead of an unsupported field, zero rating, or completeness range.

### Changed
- Bumped synchronized app metadata to `0.53.2`.

## [0.53.1] - 2026-07-16
### Fixed
- Fixed Ask Luna numeric ranges such as `artists who died between 1985 and 1989` by replacing nullable generic conditions with typed Structured Output groups whose numeric values and range endpoints are required.
- Added regression coverage for artist death-year ranges and live-model coverage for both the reported prompt and the original AOR query.

### Changed
- Changed death-year and dissolution-year ranges to activate their corresponding lifecycle filters automatically.
- Bumped synchronized app metadata to `0.53.1`.

## [0.53.0] - 2026-07-16
### Added
- Added Ask Luna panels to Search and Charts using `gpt-5.6-luna`, strict Structured Outputs, and the existing local browse/chart request types.
- Added secure OpenAI key management in Settings backed by Windows Credential Manager, including connection testing, replacement, removal, and a debug-only `OPENAI_API_KEY` fallback.
- Added per-query input, cached-input, and output token reporting plus Rust and React coverage for the natural-language query flow.

### Changed
- Changed natural-language queries to send only the user's request, target workspace, and fixed query schema to OpenAI; validated filters are executed against local SQLite without sending library rows.
- Added `.env` and `.env.*` to `.gitignore` and the release/security guard while preserving a keyless `.env.example` path.
- Bumped synchronized app metadata to `0.53.0`.

## [0.52.0] - 2026-07-10
### Added
- Added accessible Local albums, Artist info, MusicBrainz discography, and Cover view tabs to the selected-artist details area, including keyboard navigation.
- Added focused frontend coverage for artist tab selection, keyboard behavior, and deferred-request routing.

### Changed
- Changed Artists so Local albums is the default tab and MusicBrainz plus cover-track work starts only after its corresponding tab is selected.
- Changed artist selection to return the detail area to Local albums and discard deferred data from the previously selected artist.
- Bumped synchronized app metadata to `0.52.0`.

## [0.51.0] - 2026-07-09
### Added
- Added Vitest, React Testing Library, jest-dom, and jsdom with focused coverage for browse request creation/serialization, saved search/chart normalization, settings normalization, workspace navigation/shortcuts, and MusicBrainz review-state rendering.
- Added focused Search, Artists, and Settings workspace presentation components without introducing a global state library.
- Added SQLite schema version 20 to migrate the legacy developer-specific MusicBrainz overlay-sync default to an unconfigured portable state.

### Changed
- Split frontend backend responsibilities into Tauri client wrappers, web-preview fixtures/mock state, and shared normalization helpers.
- Split Rust migration helpers, settings persistence/normalization, and database backup/restore behavior into focused `src-tauri/src/db/` modules while preserving command payloads.
- Updated the full local check to run frontend tests and `cargo check` in addition to security checks, the TypeScript/Vite build, and Rust tests.
- Bumped synchronized app metadata to `0.51.0`.

### Fixed
- Fixed workspace navigation so a newly selected workspace opens at the top.
- Removed the hardcoded `C:\Users\jtill\OneDrive\_musicbackup\musicbrainz-overlay-sync.sqlite3` default; manual and automatic overlay sync now require a user-configured path.

## [0.50.0] - 2026-07-09
### Added
- Added Search and Charts filters for MusicBrainz artist type, gender, born/founded year ranges, dead/dissolved status, and died/dissolved year ranges.
- Added Rust coverage for MusicBrainz artist-info browse filters.

### Changed
- Bumped synchronized app metadata to `0.50.0`.

## [0.49.0] - 2026-07-09
### Added
- Added a selected-artist MusicBrainz Artist Info box above Discography with MBID review/linking, manual MBID entry, Origin Country editing, and imported type, gender, sort name, life-span, and begin/end area details.

### Changed
- Changed the selected-artist MusicBrainz Update action to persist artist-info rows from the live MusicBrainz artist payload alongside refreshed release groups and Origin Country.
- Moved selected-artist MBID and Origin Country controls out of MusicBrainz Discography so the discography panel focuses on release scope and exports.
- Bumped synchronized app metadata to `0.49.0`.

## [0.48.0] - 2026-07-08
### Added
- Added a Settings MusicBrainz Artist Information import tool with preview, import, cancel/resume behavior, live progress counters, recent activity, and a searchable report for artist type, gender, born/founded, and died/dissolved data.
- Added SQLite schema version 19 with app-owned MusicBrainz artist-info rows and artist-info import-run logging.
- Added web-preview mock artist-info rows for David Bowie, The Chordettes, Def Leppard, and Madonna.
- Added Rust coverage for MusicBrainz artist-info life-span extraction and verified-link artist-info imports.

### Changed
- Bumped synchronized app metadata to `0.48.0`.

## [0.47.0] - 2026-07-08
### Added
- Added global number-key navigation shortcuts: `1` through `9` open Search through Imports in sidebar order, and `0` opens Settings while preserving normal typing in editable controls.

### Changed
- Bumped synchronized app metadata to `0.47.0`.

## [0.46.1] - 2026-07-08
### Fixed
- Fixed Artist MusicBrainz Origin Country suggestions so code-only country rows display derived country names, such as `AE - United Arab Emirates`, and choosing a known code auto-fills the matching country name.

### Changed
- Bumped synchronized app metadata to `0.46.1`.

## [0.46.0] - 2026-07-08
### Added
- Added a Billboard table-column option to Search, enabled by default for album and track result tables.

### Changed
- Changed Charts table rows to use the dedicated Billboard column by default instead of also showing the inline album-title Billboard badge.
- Bumped synchronized app metadata to `0.46.0`.

## [0.45.0] - 2026-07-08
### Added
- Added bundled SVG country flags from `flag-icons` for Origin Country displays across Search, Charts, Albums, Artists, MusicBrainz review panels, filter chips, and country suggestions.
- Added a Settings preference to render Origin Countries as flag plus country name, country name only, or flag only.
- Added SQLite schema version 18 with a persisted `country_flag_display` app setting.

### Changed
- Bumped synchronized app metadata to `0.45.0`.

## [0.44.2] - 2026-07-08
### Fixed
- Fixed Origin Countries include/exclude inputs and active filter chips to show known country codes with names, such as `RO - Romania`, while keeping saved filters keyed by two-letter codes.

### Changed
- Bumped synchronized app metadata to `0.44.2`.

## [0.44.1] - 2026-07-08
### Fixed
- Fixed Origin Country labels so MusicBrainz city/raw-area details such as `Indonesia (Jakarta)` and `Norway (Oslo)` display and update as country names only.
- Fixed MusicBrainz artist origin-country saves to strip trailing town parentheticals from stored country names.

### Changed
- Bumped synchronized app metadata to `0.44.1`.

## [0.44.0] - 2026-07-08
### Added
- Added Search and Charts Exclude origin countries filters backed by the shared browse request model and SQLite country joins.
- Added token-aware live Origin Country suggestions so comma-separated country filters keep suggesting matches after the first country.

### Changed
- Bumped synchronized app metadata to `0.44.0`.

## [0.43.0] - 2026-07-08
### Added
- Added selected-artist Origin Country refresh to the Artist MusicBrainz Update action, saving MusicBrainz artist country/area data into the app-owned origin tables.
- Added manual Origin Country code/name saves in the Artist MusicBrainz panel, with immediate Artist page refresh and Rust coverage for manual origin persistence.

### Changed
- Bumped synchronized app metadata to `0.43.0`.

## [0.42.3] - 2026-07-08
### Changed
- Origin Countries import now trusts attached or cached MusicBrainz MBIDs even when the cache mapping is duplicate-heavy, leaving later corrections to the Artist review flow.
- Bumped synchronized app metadata to `0.42.3`.

## [0.42.2] - 2026-07-08
### Added
- Added a filterable MusicBrainz Origin Countries coverage report in Settings for skipped, unresolved, eligible, imported, and all preview rows.

### Fixed
- Fixed Origin Countries preview/import eligibility so exact cache matches with large release-group counts are no longer skipped solely for having broad discographies.

### Changed
- Bumped synchronized app metadata to `0.42.2`.

## [0.42.1] - 2026-07-07
### Added
- Added live MusicBrainz Origin Countries import progress with done/left/succeeded/skipped/unresolved/failed counters and a recent activity log in Settings.
- Added a web-preview simulation for the Origin Countries progress stream.

### Changed
- Bumped synchronized app metadata to `0.42.1`.

## [0.42.0] - 2026-07-07
### Added
- Added SQLite schema version 17 with app-owned MusicBrainz origin-country tables and import-run logging.
- Added Settings preview/import/cancel workflow for MusicBrainz artist Origin Country enrichment.
- Added Search and Charts Origin Country and missing-origin filters, local browse joins, optional columns, and exports.
- Added origin-country display for Search, Albums, Artists, Charts, and web-preview mock states.
- Added Rust coverage for schema migration, country derivation, suspect-link skipping, manual override precedence, browse filtering, and filter serialization defaults.

### Changed
- Bumped synchronized app metadata to `0.42.0`.
- Documented the remaining sync gap for reviewed/manual Origin Country overlay rows; local import, display, filtering, and export behavior is complete.

## [0.41.0] - 2026-07-07
### Added
- Added Album rating min/max and Loved max filters to Charts.
- Added a Loved max filter to Search, including exact track loved filtering in web preview mode.

### Changed
- Bumped synchronized app metadata to `0.41.0`.

## [0.40.0] - 2026-07-07
### Added
- Added Search export controls for adding IDs, cover metadata, and representative album filename/path columns to exported result files.
- Added Rust coverage for optional album file columns in Search exports.

### Changed
- Bumped synchronized app metadata to `0.40.0`.

## [0.39.1] - 2026-07-06
### Fixed
- Fixed selected-artist fuzzy MusicBrainz candidate suggestions so they start at the SPEC-defined 85/100 confidence gate instead of 68/100.

### Changed
- Bumped synchronized app metadata to `0.39.1`.

## [0.39.0] - 2026-07-06
### Added
- Added a High-confidence missing MusicBrainz albums validator in Tools that reports collection-wide pure official MusicBrainz album gaps from trusted artist matches.
- Added Rust coverage for cache-backed missing albums, suspect cache mapping exclusion, and verified refreshed overlay release groups in the new collection report.

### Changed
- Bumped synchronized app metadata to `0.39.0`.

## [0.38.0] - 2026-07-06
### Added
- Added an Artists without MusicBrainz data validator in Tools that compares local album artists against the configured `musicbrainz_cache.db` and app-owned verified/refreshed MusicBrainz overlay rows.
- Added Rust coverage for missing MusicBrainz artist rows, normalized cache-name matches, and verified overlay release-group matches.

### Changed
- Tools now supports artist-scoped validators with affected-artist labels in the index, issue table, and detail panel.
- Bumped synchronized app metadata to `0.38.0`.

## [0.37.2] - 2026-07-06
### Added
- Added a Save paths action in Imports so custom TSV, cover-art, Billboard album, and Billboard singles source paths persist across app restarts.
- Added SQLite schema version 16 with persisted Imports workspace source paths.

### Changed
- Bumped synchronized app metadata to `0.37.2`.

## [0.37.1] - 2026-07-06
### Fixed
- Fixed release asset preparation so installer filenames are normalized before upload and the updater `latest.json` URL matches the published GitHub Release asset.

### Changed
- Bumped synchronized app metadata to `0.37.1`.

## [0.37.0] - 2026-07-06
### Added
- Added Tauri in-app update checks on startup, from Settings with a manual Check now button, and on a configurable automatic interval in minutes.
- Added an in-app update banner with Update now, signed updater download/install progress, and automatic app relaunch after installation.
- Added SQLite schema version 15 with persisted app update auto-check settings.
- Added Tauri updater/process plugins, signed updater artifact generation, GitHub Release `latest.json` manifest preparation, and release workflow signing-secret checks.

### Changed
- Release automation now uploads installer assets, updater signature assets, and the updater `latest.json` manifest.
- Bumped synchronized app metadata to `0.37.0`.

## [0.36.2] - 2026-07-06
### Fixed
- Fixed Windows release builds so launching the installed app opens only the desktop window and no persistent terminal window.

### Changed
- Bumped synchronized app metadata to `0.36.2`.

## [0.36.1] - 2026-07-06
### Fixed
- Updated GitHub Actions official action pins to current major versions to avoid deprecated Node.js action runtime warnings.

### Changed
- Bumped synchronized app metadata to `0.36.1`.

## [0.36.0] - 2026-07-06
### Added
- Added GitHub Actions CI for pushes and pull requests that runs the release/security guard, frontend build, and Rust tests on Windows.
- Added a version-triggered GitHub release workflow that builds Tauri Windows installers when the package version changes on `master`, extracts the matching changelog section, creates a `v<version>` GitHub Release, and uploads `.exe` and `.msi` installer assets.
- Added release helper scripts for detecting package version changes and extracting release notes from `CHANGELOG.md`.

### Changed
- Documented the Phase 26 release automation workflow.
- Bumped synchronized app metadata to `0.36.0`.

## [0.35.4] - 2026-07-06
### Fixed
- Fixed Settings saves so the MusicBrainz overlay Auto minutes value is preserved after blur or Enter even when another settings save is still finishing.

### Changed
- Bumped synchronized app metadata to `0.35.4`.

## [0.35.3] - 2026-07-06
### Fixed
- Fixed the Settings MusicBrainz overlay Auto minutes field so typing is not interrupted by saving on every keystroke; the value now saves on blur or Enter.

### Changed
- Bumped synchronized app metadata to `0.35.3`.

## [0.35.2] - 2026-07-06
### Fixed
- Fixed MusicBrainz overlay autosync so missing or invalid autosync settings are treated as disabled instead of creating a zero-delay sync loop.
- Stopped background autosync from holding the manual Sync button in the syncing state or logging no-op runs.

### Changed
- Bumped synchronized app metadata to `0.35.2`.

## [0.35.1] - 2026-07-06
### Fixed
- Fixed Settings MusicBrainz overlay sync saves so older cached settings without the new sync path field fall back to the default path instead of crashing.

### Changed
- Bumped synchronized app metadata to `0.35.1`.

## [0.35.0] - 2026-07-06
### Added
- Added MusicBrainz overlay sync through `C:\Users\jtill\OneDrive\_musicbackup\musicbrainz-overlay-sync.sqlite3` so app-owned artist links, release decisions, release-status cache rows, and refreshed release-group overlays can move between machines without syncing the main app database.
- Added SQLite schema version 14 with MusicBrainz overlay sync settings, artist-link tombstones, release-decision tombstones, and a local sync log.
- Added Settings controls for manual MusicBrainz overlay sync, autosync interval in minutes, and recent sync log entries with import/export counts.
- Added Rust coverage for shared overlay row copying and unlink tombstone application.

### Changed
- MusicBrainz verify, ignore, unlink, not-in-scope/include, and selected-artist refresh actions now run overlay sync after saving local app-owned rows.
- Bumped synchronized app metadata to `0.35.0`.

## [0.34.0] - 2026-07-06
### Added
- Added a selected-artist MusicBrainz update action that fetches release groups from MusicBrainz by the reviewed MBID and reloads the Artist MusicBrainz panel.
- Added SQLite schema version 13 with an app-owned `musicbrainz_artist_release_groups` overlay table so refreshed artist release groups do not mutate the recovered `musicbrainz_cache.db`.
- Added source/timestamp indicators for selected-artist MusicBrainz release groups and Rust coverage for overlay rows overriding stale cache rows.

### Changed
- Bumped synchronized app metadata to `0.34.0`.

## [0.33.0] - 2026-07-06
### Added
- Added CSV/XLSX export for the currently visible selected-artist MusicBrainz owned/missing album rows.
- Added MusicBrainz artist export columns for status, year, MusicBrainz title, local match, confidence, release/artist MBIDs and links, match method, cached name, and artist-link trust state.
- Added Rust coverage for excluding hidden MusicBrainz rows from selected-artist export tables.

### Changed
- Bumped synchronized app metadata to `0.33.0`.

## [0.32.0] - 2026-07-06
### Added
- Added selected-artist MusicBrainz candidate review rows for unmatched artists using fuzzy local `artist_cache` matching.
- Added candidate review rows for suspect MusicBrainz cache matches using alternate cached names and fuzzy alternate MBIDs.
- Added Rust coverage for fuzzy candidate generation and suspect-match alternate cached-name candidates.

### Changed
- Candidate rows in the Artists MusicBrainz panel can now be saved as verified `musicbrainz_artist_links` rows.
- Bumped synchronized app metadata to `0.32.0`.

## [0.31.4] - 2026-07-06
### Fixed
- Fixed MusicBee TSV imports so date-like `Year` and `Release Year` values such as `2019-06-28` are stored as canonical years such as `2019` instead of empty database years.

### Changed
- Bumped synchronized app metadata to `0.31.4`.

## [0.31.3] - 2026-07-06
### Fixed
- Fixed desktop startup so the main window restores the last saved position, size, and maximized state when the app is reopened.

### Changed
- Bumped synchronized app metadata to `0.31.3`.

## [0.31.2] - 2026-07-06
### Fixed
- Fixed artist grouping so common Unicode dash variants in album artist names collapse to the same artist key, preventing visually identical artists such as The All-American Rejects from splitting in Artists, Search filters, Discovery, Music Tools, and MusicBrainz local-album matching.
- Inferred Album Artist from Display Artist during import when an album has blank Album Artist values and exactly one normalized Display Artist, while leaving mixed-artist albums uninferred.

### Changed
- Bumped synchronized app metadata to `0.31.2`.

## [0.31.1] - 2026-07-06
### Fixed
- Fixed selected-artist MusicBrainz MBID links so they open the matched artist page in the system default web browser from the Tauri desktop app.

### Changed
- Added the Tauri opener plugin with an explicit main-window permission and bumped synchronized app metadata to `0.31.1`.

## [0.31.0] - 2026-07-05
### Added
- Added MusicBrainz artist match review controls in Artists with Verify, Ignore, Unlink, and manual MBID correction actions.
- Added a Tauri command for persisting selected-artist MusicBrainz match decisions in the app-owned `musicbrainz_artist_links` table.
- Added Rust coverage for ignored artist suppression and manual MusicBrainz artist-link decisions.

### Changed
- Verified MusicBrainz artist links now override raw cache lookup, and ignored artist links suppress selected-artist MusicBrainz album rows.
- Bumped synchronized app metadata to `0.31.0`.

## [0.30.3] - 2026-07-05
### Changed
- Hid excluded MusicBrainz release rows from the selected-artist owned/missing table and renamed the summary count to `Filtered`.
- Bumped synchronized app metadata to `0.30.3`.

## [0.30.2] - 2026-07-05
### Fixed
- Excluded MusicBrainz release groups with no official releases from selected-artist missing-album counts after app-owned official-status verification, fixing bootleg-only rows such as Def Leppard's `Yeah! Unfinished and Unreleased` and `Retromania`.

### Added
- Added SQLite schema version 12 with an app-owned MusicBrainz release-status cache.
- Added bounded MusicBrainz release-status verification for selected artists when the local app status cache is missing.
- Added Rust coverage for automatic non-official MusicBrainz release-group exclusion.

### Changed
- Bumped synchronized app metadata to `0.30.2`.

## [0.30.1] - 2026-07-05
### Added
- Added MusicBrainz release not-in-scope controls in Artists so cache-only bootlegs or other out-of-scope rows can be excluded from missing counts and restored later.
- Added a Tauri command for persisting MusicBrainz release decisions in the app-owned `musicbrainz_release_decisions` table.
- Added Rust coverage for excluding release decisions from MusicBrainz missing-album counts.

### Changed
- Bumped synchronized app metadata to `0.30.1`.

## [0.30.0] - 2026-07-05
### Added
- Added a MusicBrainz Discography panel in Artists for the selected artist, showing cache state, suspect mapping warnings, pure official album counts, owned/missing totals, completion, and release rows.
- Added a read-only Tauri MusicBrainz artist discography command that matches verified app-owned artist links first, then exact and normalized cache names, and compares pure official album release groups against local artist albums.
- Added web-preview MusicBrainz artist discography mock data for frontend layout work without a local cache.
- Added Rust coverage for deterministic owned/missing MusicBrainz comparison and suspicious artist mapping warnings.

### Changed
- Bumped synchronized app metadata to `0.30.0`.

## [0.29.0] - 2026-07-05
### Added
- Added a MusicBrainz Cache panel in Settings for saving and checking the local `MusicBrainz/musicbrainz_cache.db` path.
- Added a read-only Tauri MusicBrainz cache status command that validates the cache schema and reports counts, year/date ranges, and suspicious artist mapping examples.
- Added SQLite schema version 11 with a persisted MusicBrainz cache path plus app-owned artist-link and release-decision tables for later verified MusicBrainz matching.
- Added web-preview MusicBrainz cache status data for frontend layout work without a local cache.

### Changed
- Updated release/security checks to require `MusicBrainz/` to remain ignored by git.
- Bumped synchronized app metadata to `0.29.0`.

## [0.28.1] - 2026-07-05
### Changed
- Expanded the MusicBrainz roadmap in `SPEC.md` with the local cache strategy, cache quality checks, app-owned verification/ignore decisions, and explicit artist refresh guidance.
- Ignored the local `MusicBrainz/` cache folder so large MusicBrainz databases and backups stay out of git.

## [0.28.0] - 2026-07-04
### Added
- Added `npm run security:check`, `npm run check`, and `npm run release:check` for release/security verification.
- Added a release/security guard that checks CSP hardening, inline HTML restrictions, explicit Tauri capabilities, ignored local data, and version alignment across package, Tauri, and Cargo metadata.

### Changed
- Enabled explicit Tauri production and development CSP values instead of leaving CSP disabled.
- Moved startup theme bootstrapping out of inline HTML and into the bundled TypeScript entrypoint.
- Synced the app version across `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`.

## [0.27.0] - 2026-07-04
### Added
- Added an on-demand Performance Proof panel in Settings that runs representative Search, Charts, Music Tools, Statistics, and Discovery probes against the active SQLite database and reports timings, counts, and sampled query details.
- Added a Tauri performance probe command plus Rust coverage for the structured diagnostics report.

## [0.26.0] - 2026-07-04
### Added
- Added the first Music Tools fix action for Whitespace Anomalies, with preview/apply controls that compact visible track metadata rows and affected album display fields.
- Added pre-fix SQLite safety backups for desktop Music Tools apply actions and a Rust test covering preview, apply, and validator cleanup behavior.

### Changed
- Expanded Whitespace Anomalies detection to include raw genre and file path whitespace so it matches the fields cleaned by the fix action.

## [0.25.0] - 2026-07-04
### Added
- Added database backup inventory and restore support in Settings, including schema validation, restore confirmation, success/failure messaging, and a pre-restore safety backup before replacing the active SQLite database.
- Added Rust backup lifecycle tests for metadata-enriched backup listing, backup path validation, and restore behavior.

## [0.24.4] - 2026-07-04
### Changed
- Reworked `SPEC.md` into a living product spec and roadmap covering current capabilities, data contracts, architecture boundaries, phase history, and Now/Next/Later planning.
- Updated the README roadmap section to point to the living spec instead of duplicating a stale short roadmap.

## [0.24.3] - 2026-07-04
### Changed
- Split frontend app constants, request factories, chart presets, display helpers, genre suggestion logic, and input helpers out of `App.tsx` into focused `src/app` modules.

## [0.24.2] - 2026-07-04
### Fixed
- Fixed Windows Rust unit tests for the Tauri app by excluding desktop-only Tauri/Wry command glue from lib test builds, avoiding the Common Controls v6 loader failure that surfaced as `STATUS_ENTRYPOINT_NOT_FOUND`.

## [0.24.1] - 2026-07-03
### Fixed
- Fixed upgrades from existing databases so the Billboard singles rank index is created only after the new track columns are added.

## [0.24.0] - 2026-07-03
### Added
- Added Billboard year-end singles CSV imports from `CSV_SINGLES/`, matching `Yearly Rank`, `Artist`, optional `Featured`, and `Track` against library track display artists and titles.
- Added track-level Billboard singles rank/year fields, Search track badges, Single Billboard sorting and min/max filters, export columns, and a Missing Billboard Singles tool backed by persisted singles chart rows.

### Changed
- Local `CSV_SINGLES/` chart data is now ignored by git and Vite file watching alongside the existing album `CSV/` folder.

## [0.23.2] - 2026-07-01
### Fixed
- Fixed Missing Billboard Albums to collapse overlapping chart-year entries for the same imported Billboard artist/title and keep only the earliest year in the tool results.

## [0.23.1] - 2026-07-01
### Fixed
- Fixed Missing Billboard Albums so selecting it prepares comparison rows from the default `CSV/` folder when the new chart-entry table is empty, making upgraded databases work without a separate manual re-import first.
- Clarified the Missing Billboard Albums empty state when no rows are returned.

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
