# Music Library

A local-first desktop app for importing, searching, browsing, and analyzing a MusicBee TSV library export.

The current build runs on a Tauri, React, TypeScript, Rust, and SQLite foundation with hardened release/security checks and automated GitHub release operations. The app can stream `musicbee-library.tsv`, store raw track rows, calculate album aggregates with single-artist Album Artist inference when MusicBee exports a blank album artist, keep configurable rolling SQLite backups before replacing imported data, list and restore local database backups with a pre-restore safety copy, run a Performance Proof probe against the active SQLite database, validate a local read-only MusicBrainz cache from Settings, preview and import app-owned MusicBrainz artist Origin Country rows from attached or cached MusicBrainz MBIDs with live progress counters, an activity log, and a filterable coverage report, preview and import app-owned MusicBrainz artist information rows for type, gender, life-span dates, and begin/end areas with the same live import workflow, compare a selected artist against MusicBrainz pure official albums with cached official-release verification, artist match review, app-owned not-in-scope release decisions, explicit MBID-based MusicBrainz artist updates stored in an app-owned overlay with selected-artist Origin Country refresh, manual Artist-page Origin Country saves, sync app-owned MusicBrainz overlay rows through a user-selected shared SQLite file with manual/auto sync and local sync logs, and CSV/XLSX export of the visible selected-artist MusicBrainz rows, import and display real album cover art, import Billboard year-end album and singles CSV rankings, save custom Imports source paths, browse sortable album and track tables, save searches, filter Search albums by rated-track, album-rating, loved-track, Billboard rank, Origin Country include/exclude lists, missing-origin ranges, and MusicBrainz artist type/gender/lifecycle fields, filter Search tracks by imported Billboard singles rank ranges, exact loved min/max ranges, Origin Country include/exclude lists, and MusicBrainz artist type/gender/lifecycle fields, build ranked album charts with include/exclude genre filters, album-rating and loved-track ranges, min/max rating-completeness ranges, MusicBrainz Origin Country include/exclude filters, MusicBrainz artist type/gender/lifecycle filters, Billboard rank templates, and in-place genre suggestions, display-only table-header sorting inside the current ranked set, and resizable square cover-grid artwork, save chart configurations, expand the `scores` genre group in include/exclude genre filters, export filtered result sets with optional Search export columns for IDs, cover metadata, Origin Country, and representative album filename/path data, find verified MusicBrainz artists, albums, and songs that are absent from the local library and save exact Discovery lists, explore discovery dashboards for rating backlogs, loved outliers, genre clusters, artist constellations, and smart missions, analyze library health, rating burndown, time shape, loved density, catalog concentration, duration, outlier, decade progress, genre portfolio, metadata coverage, rating, and import dashboards, manage settings, switch between light and dark mode, remember the desktop window position and size between launches, choose default sidebar visibility and Origin Country flag/name display, drill into dedicated album detail pages with ordered track lists and origin-country provenance, browse album artists with artist-level summary stats, a MusicBrainz Artist Info box for MBID, origin country, type, gender, life-span, and area details, album lists, MusicBrainz owned/missing pure album status, and cover boards, browse canonical genres with genre-level summary stats and album lists, and review Music Tools validation issue lists, including high-confidence collection-wide missing MusicBrainz albums, library artists without usable MusicBrainz cache or overlay data, albums missing imported cover image records, and imported Billboard albums or singles missing from the library, with exports and a guarded whitespace cleanup action.

The desktop app checks GitHub Releases for signed updates when it starts. Settings also has a manual Check now button, an Update now action when a version is available, and an Auto minutes interval for recurring background checks; installing an update closes, updates, and relaunches the app. An amber download badge appears on both the Windows taskbar icon and system tray icon while an update is available. The tray tooltip includes the available version, and left-clicking the tray icon restores and focuses the app.

The sidebar currently enables Search, Charts, Discovery, Playlists, Statistics, Albums, Artists, Genres, Tools, Imports, and Settings. Press `1` through `9` to jump through the established numbered sections, `0` for Settings, or `P` for Playlists; keys still type normally while focus is inside text fields or other editable controls. Selecting a workspace by click or shortcut opens it at the top. The left navigation can be shown in full, icon-only, or hidden mode, while the right detail sidebar can be shown or hidden so the main workspace expands into the available page width. The Imports workspace can save custom source paths, scan an `AlbumCovers` folder for folder-named images, link matching source images directly, skip covers that are already imported, extract missing embedded MP3 artwork into the same `AlbumCovers` folder, import yearly Billboard album chart CSV files from `CSV/`, and import yearly Billboard singles chart CSV files from `CSV_SINGLES/`. The Settings workspace can save and check a local MusicBrainz cache path, defaulting to `MusicBrainz/musicbrainz_cache.db`, preview/import app-owned MusicBrainz artist Origin Country rows with live done/left/succeeded/skipped/unresolved/failed feedback and a searchable coverage report, preview/import MusicBrainz artist information rows for type, gender, born/founded, and died/dissolved data with a live import window, sync app-owned MusicBrainz overlay rows after the user chooses a shared `.sqlite3` path, and manage app update checks.

## Requirements

- Node.js 20 or newer
- Rust toolchain compatible with Tauri 2
- A MusicBee TSV export with the columns listed in `SPEC.md`
- An OpenAI API key is optional and only required for Ask Luna search, chart, current-view questions, Library analyst reports, Playlist Builder recipes, and outside-library Discovery recipes

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

## Luna Search, Charts, Current-view Questions, Library Analyst, Playlists, and Discovery

Search and Charts include an Ask Luna filter panel powered by the exact `gpt-5.6-luna` model. A request such as `Top AOR albums from 1984 under 45 minutes` is translated into the app's existing typed filters (`Genres: AOR`, `Year: 1984`, `Minutes max: 45`) and Album Score descending sort. The desktop app validates that structured plan and runs the resulting query against local SQLite. Filter compilation sends no album or track rows to OpenAI.

Bounded numeric requests are supported as typed ranges. For example, `Albums from artists who died between 1985 and 1989` activates the artist-death filter and applies `Died year: 1985–1989` before searching locally.

Unrated and random requests are also explicit local operations. For example, `10 random albums from 1989 that I haven't rated yet` applies `Missing: Album rating`, `Year: 1989`, and the Random sort; SQLite selects the random sample locally.

Search and Charts also include **Ask about this view**. Questions such as `Which artists appear most often?`, `How many are unrated?`, or `What stands out about these albums?` operate on a snapshot of the active filters. Luna must call one strict `inspect_current_view` tool; the desktop app then executes only validated local SQLite operations. A question can request one to three compact inspections: an exact overview, up to 20 grouped values, and/or up to 20 named albums or tracks. File paths, filenames, database files, covers, saved objects, the complete result set, and arbitrary SQL are never sent. Album, track, and artist names are sent only when the user explicitly asks a question whose answer needs a bounded named list.

Each current-view answer reports the number of matching rows, local analyses, names shared, and combined token usage. Questions are stateless rather than an accumulating chat history, which keeps context and cost bounded. The two-step tool flow normally makes two paid API requests: one to choose the local inspection and one to answer from its compact result.

Statistics includes **Library analyst** for collection-wide insight without using the library as a prompt. Choose Overview, Rating backlog, Taste profile, Catalog balance, or Metadata health, then optionally add a focus question. Luna must call one strict `inspect_library_profile` tool and can request no more than four compact sections from overview, rating progress, catalog shape, taste signals, metadata health, and recent change. SQLite calculates those sections locally by reusing the Statistics aggregates.

Library analyst context contains bounded counts, percentages, rating buckets, timestamps, genre labels, and decade groups only. It never contains raw album or track rows, album/track/artist names, paths, filenames, covers, saved objects, source paths, or arbitrary SQL results. The structured report shows one to five evidence-backed findings, up to three useful next questions, the profile-section and aggregate-point counts, and combined token usage. Selecting a useful next question runs that follow-up analysis immediately. The Focus question clears when any analysis starts, while the submitted question is retained in the request and saved snapshot. It is stateless and normally makes two paid API requests: one to choose aggregate sections and one to produce the strict report.

Successful Ask Luna Search/Chart compilations, Ask about this view answers, and Library analyst reports are saved automatically to a local **Snapshot history**. Each entry stores the original prompt, exact typed AI output, creation time, and the current library import/count state in SQLite schema version 21; current-view answer snapshots also retain the filtered request they were based on. Reopening costs no tokens and makes no OpenAI request. Search and Chart query snapshots reapply their saved filters to the current library, so result rows can reflect later imports; current-view answers and Library analyst reports reopen as exact historical output. Individual snapshots can be deleted, and they are included in normal SQLite database backups. The OpenAI key is never stored with them.

**Playlist Builder** turns a natural-language request such as `A 45-minute AOR mix from the 1980s with no artist repeated` into one strict track-filter recipe. Only the request is sent to Luna. SQLite searches at most 500 matching local candidates and selects at most 200 tracks using the requested ranked, variety, discovery, or random strategy plus bounded per-artist and per-album repeat caps. Track, album, artist, path, and filename rows are never sent to OpenAI.

The result is a reviewable draft: rename it, reorder or remove tracks, then explicitly save the exact ordered playlist for later use. Saved playlists reopen without an OpenAI call or token cost, record the source library import/count state, participate in normal database backups, and can be updated or deleted. Export writes a UTF-8 `.m3u8` file containing the selected local paths. SQLite schema version 22 adds this saved-playlist storage.

Discovery includes **Find what your library is missing** for requests such as `Find me 5 artists with releases from 1992 that I don't have`, `Show me 8 AOR albums from 1986 missing from my library`, or `Find 10 synthpop songs from 1984 I don't own`. Luna receives only the request and returns a strict recipe containing the entity, count, year interpretation, and explicit genre/country/keyword filters. For a request such as `artists from 1992`, the default interpretation is artists with a verified 1992 release; `formed in 1992` is treated separately.

The desktop backend makes one bounded MusicBrainz search, spaces request starts by at least 1.1 seconds, keeps the source and evidence visible, and excludes owned candidates against local SQLite using MusicBrainz IDs where available plus normalized artist, album, and song identities. No library rows, owned-name lists, paths, filenames, covers, or database files are sent to Luna or MusicBrainz. MusicBrainz may return fewer unowned results than requested, which the UI reports rather than inventing candidates. Result links are limited to HTTPS MusicBrainz artist, release-group, and recording pages.

Outside-library lists are saved explicitly rather than automatically. A saved list retains the exact verified result order, Luna recipe, MusicBrainz evidence, creation time, and source library import/count state. Reopening does not call Luna or MusicBrainz, saved lists can be updated or deleted, and they participate in normal SQLite backups. SQLite schema version 23 adds this storage.

Configure the OpenAI key in **Settings → Luna & OpenAI**. The desktop backend stores it as a generic credential in Windows Credential Manager and returns only configured/source status to the frontend. The key is not part of `AppSettings`, SQLite, browser storage, logs, exports, or database backups. Settings can test the connection and remove or replace the stored credential without displaying the existing key.

For temporary local development, a repo-root `.env` file containing `OPENAI_API_KEY=...` is supported by debug builds only. Secure Settings storage takes precedence over that fallback. `.env` and `.env.*` are gitignored, while `.env.example` remains allowed; `npm run security:check` enforces those rules. Production builds do not load the project `.env` file.

Each Ask Luna result shows input, cached-input, and output token usage when the API returns it. Requests use strict schemas, low reasoning effort, bounded outputs, and `store: false` instead of passing the database as context. Filter compilation, Playlist Builder planning, outside-library recipe planning, and Settings connection tests each make one small paid API request; current-view questions and Library analyst reports use the bounded two-request tool flows described above. Outside-library discovery additionally makes one MusicBrainz catalog request, which does not use the OpenAI key.

The import screen defaults to `musicbee-library.tsv`, `AlbumCovers`, `CSV`, and `CSV_SINGLES`. Use Save paths after editing those fields to persist custom source locations across app restarts; SQLite schema version 20 stores those Imports workspace paths, app-owned MusicBrainz artist origin-country and artist-info tables, the Origin Country flag display preference, and the portable unconfigured overlay-sync default, schema version 21 adds local Luna snapshots, schema version 22 adds saved playlists, and schema version 23 adds saved outside-library discoveries. Relative paths are resolved from the app process directory and its parent, so repo-root source folders work during local development. MusicBee TSV quote characters are treated as literal tag text during import, matching plain TSV exports where titles can contain unpaired quotes. Date-like MusicBee `Year` and `Release Year` values such as `2019-06-28` are normalized to `2019` during import. The TSV, local `AlbumCovers/` archive, local `CSV/` chart folder, local `CSV_SINGLES/` chart folder, and local `MusicBrainz/` cache folder are intentionally ignored by git.

## Build

```powershell
npm run build
npm run tauri:build
```

Run the full release gate, including security checks, frontend build, Rust tests, and Tauri packaging:

```powershell
npm run release:check
```

## Release Automation

GitHub Actions runs the CI workflow on pushes to `master`, pull requests, and manual dispatches. CI installs Node and Rust on `windows-latest`, restores dependency caches, and runs `npm run check`.

The Release workflow runs on pushes to `master` and detects whether `package.json` changed to a new semantic version compared with the previous pushed revision. When the version changes, it runs `npm run release:check`, builds the Tauri Windows bundle, extracts the matching `CHANGELOG.md` section, creates a `v<version>` GitHub Release, and uploads installer assets, updater signature assets, and `latest.json` updater metadata from `src-tauri/target/release/bundle`. Release asset filenames are normalized before upload so the updater manifest points at the exact published GitHub asset URL.

To publish a release, keep `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock` on the same version, add a matching `CHANGELOG.md` entry, and push to `master`. Updater-enabled builds require the `TAURI_SIGNING_PRIVATE_KEY` repository secret; `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` is optional when the signing key has a password. For local packaging, set `TAURI_SIGNING_PRIVATE_KEY` before running `npm run tauri:build` or `npm run release:check`; set `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` to the key password or an empty string for a no-password key.

## Test

Run the frontend unit/component tests:

```powershell
npm run test:run
```

Use `npm test` for Vitest watch mode during frontend development.

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

## Architecture Safety Net

- Vitest, React Testing Library, jest-dom, and jsdom cover browse request serialization, saved search/chart compatibility normalization, settings defaults, workspace shortcuts/top reset, and MusicBrainz review-state rendering.
- Search, Artists, and Settings have focused workspace presentation boundaries; shared state remains in `App.tsx`, with no global state library.
- `backend.ts` dispatches through separate Tauri-client, web-preview, and normalization modules.
- `src-tauri/src/ai.rs` owns OpenAI calls, strict query-plan/current-view/library-profile/playlist/external-discovery validation, typed Library analyst reports and bounded recipes, debug-only environment fallback, and Windows Credential Manager access; the frontend never receives the key.
- `src-tauri/src/external_discovery.rs` owns MusicBrainz artist/release-group/recording search, local ownership exclusion, source evidence, and exact saved Discovery list persistence.
- Rust database migrations, settings, and backup/restore behavior live under `src-tauri/src/db/`.
- The remaining oversized modules are `App.tsx`, `src/backend/webPreview.ts`, `src-tauri/src/db.rs`, `src-tauri/src/musicbrainz.rs`, and `src/styles.css`. Recommended next slices are Search query/results panels, individual Settings panels, Artists MusicBrainz panels, browse/saved/export SQL, Music Tools SQL, statistics/discovery SQL, and feature-scoped CSS.

## Roadmap and Spec

`SPEC.md` is the living product spec and roadmap. It tracks the current implementation, data contracts, architecture map, open decisions, and the Now/Next/Later roadmap. The current next focus is deeper backend and frontend modularization plus import safety work.

## Phase 31 MusicBrainz Artist Information Features

- Settings includes a MusicBrainz Artist Information panel with status, preview, import, and cancel actions plus live progress and a recent activity log.
- Artist Information preview renders a searchable report for needs-attention, eligible, imported, people, groups, and all artist rows.
- Artists shows a selected-artist MusicBrainz Artist Info box above Discography with MBID review, manual MBID entry, Origin Country editing, type, gender, sort name, life-span dates, and begin/end areas.
- Search and Charts can filter album artists by MusicBrainz type, gender, born/founded year ranges, dead/dissolved status, and died/dissolved year ranges.
- The selected-artist Update action now stores MusicBrainz artist information from the live artist payload as well as refreshed release groups and Origin Country.
- SQLite schema version 19 adds app-owned `musicbrainz_artist_infos` and `musicbrainz_artist_info_import_runs` tables for MusicBrainz artist type, gender, life-span dates/years, ended state, and begin/end/current area details.
- The importer reuses verified/unverified MusicBrainz artist links and local cache matches, skips rows that already have usable artist information, and leaves unresolved rows eligible for retry on the next run.
- Web-only preview mode includes mock David Bowie, The Chordettes, Def Leppard, and Madonna artist-information rows for Settings layout work.

## Phase 30 MusicBrainz Artist Origin Country Features

- Settings includes a MusicBrainz Origin Countries panel with status, preview, import, and cancel actions plus live progress and a recent activity log.
- Origin Countries preview now renders a filterable coverage report for skipped, unresolved, eligible, imported, and all artist rows.
- SQLite schema version 17 adds app-owned origin-country reference rows, one local album-artist origin row per normalized artist key, and import-run logging; schema version 18 adds the persisted Origin Country display preference.
- Origin-country import trusts verified or unverified attached MusicBrainz MBIDs first, then cache MBIDs; duplicate-heavy cache mappings are imported and can be corrected later from the Artist page.
- The Artist MusicBrainz Artist Info box refreshes selected-artist Origin Country from MusicBrainz and includes manual Origin Country code/name saves.
- Search and Charts support Origin Country include/exclude and missing-origin filters using local SQLite joins, token-aware live country suggestions for comma-separated lists, code-and-name labels such as `RO - Romania`, plus optional Origin Country exports and chart columns.
- Artists, Albums, Search results, Charts, MusicBrainz review panels, filter chips, country suggestions, and web-preview mocks show country-level imported, reviewed/manual, skipped, unresolved, and missing origin states without appending town/raw-area parentheticals to the country label.
- Settings can render Origin Country values as bundled SVG flag plus country name, country name only, or flag only.
- Reviewed/manual origin-country overlay sync is not included yet; local import, display, filtering, and exports are complete.

## Phase 29 MusicBrainz Collection Missing Album Tool Features

- Tools includes High-confidence missing MusicBrainz albums, a collection-wide report of pure official MusicBrainz albums missing from the local library.
- The report trusts verified artist links and non-suspect exact/normalized cache-name matches, skipping broad or ambiguous cache mappings.
- Missing album rows respect app-owned MusicBrainz not-in-scope decisions, cached non-official release status rows, and refreshed release-group overlays before falling back to the local cache.
- Web-only preview mode includes a mock high-confidence missing MusicBrainz album row for Tools layout work.

## Phase 28 MusicBrainz Artist Coverage Tool Features

- Tools includes Artists without MusicBrainz data, which compares distinct local album artists against the saved MusicBrainz cache path and app-owned verified/refreshed overlay rows.
- The tool flags artists with no cache/verified MBID match or a matched MBID with no cached/refreshed release groups, with search, sort, and export support through the existing Music Tools issue lists.
- Web-only preview mode includes a mock missing MusicBrainz artist row for Tools layout work.

## Phase 18 MusicBrainz Overlay Sync Features

- Settings includes a MusicBrainz Overlay Sync panel with a shared sync database path, a manual Sync now action, an autosync interval in minutes, and recent sync log entries.
- Overlay sync starts unconfigured. Choose a shared `.sqlite3` path that is safe for the current machine before using manual or automatic sync.
- MusicBrainz artist verify, ignore, unlink, release not-in-scope/include decisions, refreshed release-group overlays, and official-release status cache rows are merged into the shared overlay database.
- Artist unlinks and cleared release decisions use app-owned tombstone rows so deletion-style choices sync between machines.
- The main app database remains local; only app-owned MusicBrainz overlay rows are copied to the shared sync database.
- SQLite schema version 14 adds MusicBrainz overlay sync settings, tombstone tables, and a local sync log.

## Phase 26 Release Operations Features

- GitHub Actions CI runs `npm run check` on Windows for pushes to `master`, pull requests, and manual dispatches.
- GitHub Actions Release detects package version changes on `master`, runs the full release gate, builds Tauri Windows installers, creates a `v<version>` GitHub Release, and uploads `.exe`, `.msi`, `.sig`, and `latest.json` updater metadata files.
- Release notes are extracted from the matching `CHANGELOG.md` version section so published releases stay tied to the local changelog.
- Windows release builds launch as a desktop GUI app without opening a persistent terminal window.

## Phase 27 App Update Features

- The desktop app checks for GitHub Release updates on startup and shows an in-app update banner when a signed newer version is available.
- Settings includes Check now, Update now, last-check status, installed/available versions, and a configurable Auto minutes interval for recurring update checks.
- Windows shows an amber download overlay on the taskbar icon and app system tray icon while an update is available; the tray tooltip includes the version, and its left-click restores/focuses the app.
- Update now downloads and installs the signed updater artifact, then relaunches the app through Tauri's process plugin.
- SQLite schema version 15 adds persisted app update auto-check settings.

## Phase 17 MusicBrainz Artist Features

- Artists includes a MusicBrainz Discography panel for the selected album artist.
- The desktop backend matches the selected local artist to the local MusicBrainz cache by verified link, exact cache name, then normalized cache name.
- The Artist page shows the current cached MusicBrainz artist match, MBID link, match method, and verification state in the MusicBrainz Artist Info box.
- The MBID link opens the matched artist page in the system default web browser from the Tauri desktop app.
- Artist matches can be verified, ignored, unlinked, or corrected by pasting a MusicBrainz artist MBID.
- Unmatched and suspect artist matches show local-cache candidate rows that can be reviewed and saved as verified MusicBrainz links; fuzzy artist candidates are gated at about 85/100 confidence to keep review lists focused.
- Verified artist links override raw cache lookup, while ignored artist links suppress MusicBrainz album rows for that artist.
- The artist comparison lists pure official MusicBrainz album release groups as owned or missing based on deterministic normalized-title matching against local albums.
- The app verifies which cached release groups have official MusicBrainz releases when the app-owned status cache is missing, then caches that status locally so bootleg-only groups are excluded automatically on later visits.
- Missing MusicBrainz rows can be marked not in scope, and filtered rows are hidden from the main owned/missing album list.
- The Artist page can explicitly update MusicBrainz info for the selected MBID; refreshed artist information and release groups are stored in the app database overlay, with release groups shown ahead of stale `musicbrainz_cache.db` rows.
- Visible selected-artist MusicBrainz rows can be exported to CSV or XLSX with owned/missing status, MusicBrainz/local match data, MBID links, match method, and artist-link trust state.
- Suspect artist cache mappings are shown as warnings when a matched MBID has multiple cached names or unusually high release-group counts.
- Web-only preview mode includes mock owned/missing MusicBrainz rows for Artists layout work.

## Phase 16 MusicBrainz Cache Features

- Settings includes a MusicBrainz Cache panel for saving and checking a local cache path, defaulting to `MusicBrainz/musicbrainz_cache.db`.
- The desktop backend opens the MusicBrainz cache read-only, validates the expected `artist_cache` and `release_groups` tables, and reports file size, artist counts, MBID counts, release counts, pure official album counts, release-year range, cache-date range, and mapping warnings.
- SQLite schema version 11 adds the persisted MusicBrainz cache path plus app-owned artist-link and release-decision tables for future verified/ignored MusicBrainz matching; schema version 12 adds app-owned MusicBrainz release-status caching; schema version 13 adds app-owned refreshed artist release-group overlays; schema version 14 adds MusicBrainz overlay sync settings, tombstones, and sync logs.
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
- Album rows now carry Billboard ranks such as `#103 1987` in dedicated Search and Charts table columns, with compact badges in Discovery album results, Albums, Artists, Genres, detail panels, and exports.
- Track rows carry compact Billboard singles badges in Search track results and exports, with separate Album Billboard and Single Billboard columns for track exports.
- Search, Albums, and Charts support Billboard album min/max rank filters; Search track mode adds Billboard singles min/max rank filters and Single Billboard sorting; Search and Charts add visible Billboard table columns; Charts adds a Billboard ranking metric and built-in Billboard template.
- The Tools workspace includes High-confidence missing MusicBrainz albums, Artists without MusicBrainz data, Missing Billboard Albums, and Missing Billboard Singles, which list trusted MusicBrainz album gaps, local artists without usable MusicBrainz cache/overlay data, and imported Billboard chart rows not linked to any library album or track. Overlapping album chart-year entries collapse to the earliest year; overlapping singles chart-year entries collapse to the best rank. If the chart-entry tables are empty after upgrading, selecting each Billboard tool prepares it from the default `CSV/` or `CSV_SINGLES/` folder.
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
- Selected-artist details are grouped into Local albums, Artist info, MusicBrainz discography, and Cover view tabs; Local albums opens automatically, while MusicBrainz and cover/track data wait until their relevant tab is selected.
- The Cover view tab provides a clickable artist album cover board with inline track detail showing ratings, loved status, and clock time.
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

- Statistics workspace with an aggregate-only Luna Library analyst plus library overview, health score, rating completion burndown, library shape by time, loved density, catalog concentration, duration analytics, aggregate outlier stats, decade progress timeline, genre portfolio matrix, metadata coverage, rating progress, year progress, genre progress, rating distributions, loved-track stats, import delta timeline, import history, and rating history dashboards.
- SQLite schema version 4 with import delta counters, rating snapshots, and rating events recorded during imports.
- Import history now tracks added, changed, and removed tracks and albums for each import.
- Rating history captures completed, changed, added, and removed rated albums as import-time events.
- Web-only preview mock data covers Statistics alongside Search, Charts, and Imports.

## Phase 3 Features

- Charts workspace with built-in templates for year, decade, genre, scores, album artist, loved albums, AE, and TMOE rankings.
- Custom chart builder for album filters, include/exclude genre lists with five-result in-place suggestions, MusicBrainz artist type/gender/lifecycle filters, album rating min/max, loved-track min/max, ranking metric, display-only sortable table headers, sort direction, result limit, rating completeness min/max range, visible metric columns, and chart view mode.
- Ranked table, compact list, and resizable square cover-grid chart result views, with table headers preserving the current ranked result set and original rank numbers.
- Saved chart configurations stored in SQLite.
- XLSX export for Search and Charts, alongside CSV, TSV, JSON, and TXT.

## Phase 2 Features

- Search workspace with album and track table views with clickable sortable column headers.
- SQLite FTS5 indexes over album, artist, title, genre, publisher, path, and filename fields.
- Composable query builder for text filters, comma-separated genre and exclude-genre lists with five-result in-place suggestions loaded from the canonical genre index and matched anywhere in genre names, MusicBrainz artist type/gender/lifecycle filters, years, release years, album duration in album views, track duration in track views, track count, rated-track count, album rating, track rating, rating completeness min/max ranges, loved-track min/max count in album views, exact track `Love = "L"` min/max filtering in track views, publisher, file path, filename, and view-specific missing metadata flags.
- Genre and exclude-genre lists expand `scores` to Action, Animation, Comedy, Documentary, Drama, Fantasy, Horror, Sci-Fi, Thriller, TV, Video Game, Western, and Anime.
- Active filter chips with one-click removal.
- Saved searches stored in SQLite.
- CSV, TSV, XLSX, JSON, and TXT exports for the current filtered result set, with optional calculated columns and Search export controls for adding IDs, cover metadata, and representative album filename/path columns.

## Phase 1 Features

- Tauri 2 desktop shell with React and TypeScript.
- Desktop launches restore the last saved main-window position, size, and maximized state.
- SQLite database in the app data directory with WAL mode enabled.
- Initial migrations for import runs, backups, raw tracks, normalized tracks, and album aggregates.
- Streaming TSV import with required MusicBee header validation.
- Database backup before each import, retaining the configured rolling backup count.
- Album calculations for total time, rated-track count, rating completeness, loved tracks, TMOE, AE, effective album rating, and Album Score.
- Import progress events surfaced in the UI.

## Album Calculation Rules

- `Year` is the canonical year; MusicBee date-like values such as `2019-06-28` are stored as `2019`.
- `Release Year` is stored as secondary metadata and uses the same date-like year normalization.
- `Album Artist (display)` identifies albums.
- If an album has no `Album Artist (display)` but all tracks share one normalized `Display Artist`, that display artist is used as the album artist; mixed-display-artist albums stay blank.
- Artist grouping treats common Unicode dash variants as a normal hyphen so visually identical artist names stay together.
- `Display Artist` identifies tracks.
- Only exact `Love = "L"` counts as loved.
- Track ratings must be whole-number values from `0` to `5`, including whole-number decimals such as `5.0`.
- Track ratings are normalized to the `0-100` album-rating scale.
- If MusicBee `Album Rating` is missing or `-1`, fully rated albums get a calculated album rating from normalized track ratings.
