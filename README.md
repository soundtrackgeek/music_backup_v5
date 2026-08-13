# Music Library

A local-first desktop app for importing, searching, browsing, and analyzing a MusicBee TSV library export.

The current build runs on a Tauri, React, TypeScript, Rust, and SQLite foundation with hardened release/security checks and automated GitHub release operations. The app can stage `musicbee-library.tsv` into durable 5,000-row checkpoints while the active library remains untouched, use indexed whole-library comparisons to show added/changed/removed track and album deltas plus suspicious rated/loved removals or metadata regressions before apply, safely interrupt staging or final analysis and resume from the saved TSV byte offset, atomically apply the reviewed snapshot after generating a rollback backup, reclaim completed staging space, roll back the exact completed import in one click, store raw track rows, calculate album aggregates with single-artist Album Artist inference when MusicBee exports a blank album artist, keep configurable rolling SQLite backups, list and restore local database backups with a pre-restore safety copy, run a Performance Proof probe against the active SQLite database, validate a local read-only MusicBrainz cache from Settings, preview and import app-owned MusicBrainz artist Origin Country rows from attached or cached MusicBrainz MBIDs with live progress counters, an activity log, and a filterable coverage report, preview and import app-owned MusicBrainz artist information rows for type, gender, life-span dates, and begin/end areas with the same live import workflow, compare a selected artist against MusicBrainz pure official albums with cached official-release verification, artist match review, app-owned not-in-scope release decisions, explicit MBID-based MusicBrainz artist updates stored in an app-owned overlay with selected-artist Origin Country refresh, manual Artist-page Origin Country saves, sync app-owned MusicBrainz overlay rows through a user-selected shared SQLite file with manual/auto sync and local sync logs, and CSV/XLSX export of the visible selected-artist MusicBrainz rows, import and display real album cover art, import Billboard year-end, Official UK weekly, and Norwegian weekly album and singles chart data, save custom Imports source paths, browse sortable album and track tables, save searches, filter Search albums by rated-track, album-rating, loved-track, source-specific chart rank/debut, Origin Country include/exclude lists, missing-origin ranges, and MusicBrainz artist type/gender/lifecycle fields, filter Search tracks by imported chart rankings and entry dates, exact loved min/max ranges, Origin Country include/exclude lists, and MusicBrainz artist type/gender/lifecycle fields, build ranked album or track charts with include/exclude genre filters, album/track-rating and loved-track ranges, min/max rating-completeness ranges, MusicBrainz Origin Country include/exclude filters, MusicBrainz artist type/gender/lifecycle filters, source-specific chart ranking and entry controls, and in-place genre suggestions, explore album and track arrivals in the standalone seasonal/fullscreen Timeline, display-only table-header sorting inside the current ranked set, resizable square cover-grid artwork, and smooth 300×300 hover previews for compact album covers throughout Search, Charts, Timeline, and related album lists, save chart configurations, expand the `scores` genre group in include/exclude genre filters, export filtered result sets with optional Search export columns for IDs, cover metadata, Origin Country, and representative album filename/path data, find verified MusicBrainz artists, albums, and songs that are absent from the local library and save exact Discovery lists, keep wanted artists and albums in a persistent Wish List with MusicBrainz links, automatic post-import collection reconciliation, and authenticated Deemix/Deezer album availability searches, read a story-driven **Your Daily Edition** whose anniversary lead rotates through five chart-ranked owned albums every ten seconds, supports direct thumbnail selection and 10-to-100-year milestones, separates five artist birthdays and five memorials into tabs, and uses a smooth scroll-and-flash contents rail for every story shelf, alongside imported chart matches, unrated deep cuts on highly rated albums, MusicBrainz collection gaps, and rating-event recommendations, explore the earlier discovery dashboards for rating backlogs, loved outliers, genre clusters, artist constellations, and smart missions, analyze library health, rating burndown, time shape, loved density, catalog concentration, duration, outlier, decade progress, genre portfolio, metadata coverage, rating, and import dashboards, manage settings, switch between light and dark mode, remember the desktop window position and size between launches, choose default sidebar visibility and Origin Country flag/name display, drill into dedicated album detail pages with ordered track lists and origin-country provenance, browse album artists with artist-level summary stats, a MusicBrainz Artist Info box for MBID, origin country, type, gender, life-span, and area details, album lists, MusicBrainz owned/missing pure album status, and cover boards, browse canonical genres with genre-level summary stats and album lists, and review Music Tools validation issue lists, including high-confidence collection-wide missing MusicBrainz albums, local albums absent from comparable pure official MusicBrainz album lists, library artists without usable MusicBrainz cache or overlay data, albums missing imported cover image records, and imported Billboard albums or singles missing from the library, with exports and a guarded whitespace cleanup action.

Search and Charts table views expose album, artist, and genre values as keyboard-focusable drill-down controls that open the corresponding dedicated page.

Music Tools includes **Owned MusicBrainz special releases**, which finds locally owned compilation, live, interview, and EP release-group types that are absent from each artist's pure Album list and shows the matched MusicBrainz type in the issue table and exports.

The repository also includes a standalone Python **Music Library Trimmer** under `Tools/library_trimmer`. It reads the app database and MusicBrainz cache without modifying either, limits work to an optional library root such as `D:\MUSIC`, excludes repeatable canonical genres with exact `scores` group expansion, enriches only MusicBrainz official-list candidates through cached and resumable Discogs searches, exports a human approval CSV, moves exact approved audio files into an external quarantine, and writes a per-file journal for undo. It never moves complete source directories or sidecar files.

The desktop app checks GitHub Releases for signed updates when it starts. Settings also has a manual Check now button, an Update now action when a version is available, and an Auto minutes interval for recurring background checks; installing an update closes, updates, and relaunches the app. An amber download badge appears on both the Windows taskbar icon and system tray icon while an update is available. The tray tooltip includes the available version, and left-clicking the tray icon restores and focuses the app.

The sidebar currently enables Search, Charts, Timelines, Discovery, Music Map, Completion, Wish List, Playlists, Statistics, Updates, Albums, Artists, Genres, Tools, Imports, and Settings. Press `1` through `9` to jump through the established numbered sections, `0` for Settings, `C` for Completion, `M` for Music Map, `P` for Playlists, `U` for Updates, `W` for Wish List, or `Y` for Timelines; keys still type normally while focus is inside text fields or other editable controls. Selecting a workspace by click or shortcut opens it at the top. The left navigation can be shown in full, icon-only, or hidden mode. On wide desktops the contextual detail sidebar follows the user's shown/hidden preference; at 1280px and below it becomes a closed overlay drawer so metrics and tables retain the full workspace width. The drawer closes on Escape, outside click, or workspace changes, and restores focus to its toggle. Details are omitted entirely when the current workspace or selection has no distinct contextual content, including Music Map, Completion, Playlists, Wish List, Timelines, Settings, and selection-based views before an item is selected. The Imports workspace requires a pre-import MusicBee delta review, supports safe cancellation and checkpoint resume during TSV staging, applies the staged snapshot atomically, exposes the generated import backup for immediate rollback, saves custom source paths, scans an `AlbumCovers` folder for folder-named images, links matching source images directly, skips covers that are already imported, extracts missing embedded MP3 artwork into the same `AlbumCovers` folder, imports yearly Billboard album chart CSV files with first-appearance month and ISO week data from `CSV_ALBUMS/`, and imports yearly Billboard singles chart CSV files with normalized `Date Entered` dates and ISO weeks from `CSV_SINGLES/`. Singles imports also use the CSV `Album` and `Label/Number` fields to select one canonical library copy: the official artist album is preferred, catalog suffixes such as ` - Columbia 38710` are removed only for matching, artist-owned releases are the next fallback, and a compilation remains eligible when it is the only copy. The Settings workspace can save and check a local MusicBrainz cache path, defaulting to `MusicBrainz/musicbrainz_cache.db`, preview/import app-owned MusicBrainz artist Origin Country rows with live done/left/succeeded/skipped/unresolved/failed feedback and a searchable coverage report, preview/import MusicBrainz artist information rows for type, gender, born/founded, and died/dissolved data with a live import window, sync app-owned MusicBrainz overlay rows after the user chooses a shared `.sqlite3` path, configure optional Last.fm portrait enrichment, and manage app update checks.

Official UK albums and singles import from weekly CSV rows in `CSV_ALBUMS_UK/` and `CSV_SINGLES_UK/`, retaining exact chart dates, rank movement, peak, weeks on chart, and source/item links. Norwegian VG Lista albums and singles import from `CSV_ALBUMS_NO/` and `CSV_SINGLES_NO/`. The unofficial Norwegian Ti i Skuddet singles list imports from `CSV_TIISKUDDET_NO/`, while the Norwegian-language Norsktoppen singles chart imports from `CSV_NORSKTOPPEN_NO/`; original ranged rank text, points or voting details, notes, chart details, exact dates, and source links are retained alongside normalized searchable ranks. Album imports select Billboard, Official UK, and VG Lista by default, while singles imports also select Ti i Skuddet and Norsktoppen; each source can be toggled independently and a failed source does not stop the others. Every weekly row is retained in its own chart table, and matching library rows receive the best rank and earliest chart week for fast Search, Charts, Timeline, and Luna use.

Settings is split into **General**, **Providers**, **AI**, **Data & Backups**, **MusicBrainz**, **Updates**, and **Diagnostics**. A sticky section switcher keeps the active area close at hand, supports click and arrow-key navigation, and changes to a three-column layout at the supported 1040px minimum width. Only the selected section is shown, while every section remains mounted so unsaved drafts and live operation state survive switching between areas.

## Album reviews

Selecting an album in **Albums** resolves its CritiqueBrainz release group from an app-owned MusicBrainz decision when one exists, otherwise by an exact MusicBrainz album-title and artist match. The review panel loads the strongest available community review, preferring English and then Norwegian text, and shows the contributor, optional one-to-five rating, language, exact Creative Commons license, and a direct CritiqueBrainz link. Long reviews expand in place and **Refresh** bypasses the local cache.

SQLite schema version 51 caches available reviews for 30 days and unavailable results for seven days; a failed refresh keeps the last usable text visible. Review text and its attribution are stored together so cached display retains the original author and license. No provider key is required. These are openly licensed CritiqueBrainz community reviews, not Plex's commercially licensed AllMusic/TiVo editorial copy.

## Artist biographies

Opening an artist's **Overview** resolves its saved MusicBrainz MBID to a Wikidata item and then an English Wikipedia article, with Norwegian Wikipedia as the fallback. If the saved identity is missing or produces no usable biography, the app searches MusicBrainz by the library artist name and accepts only one exact, case-insensitive, score-100 match before following the same verified Wikidata/Wikipedia path. This covers display variants such as `KISS` and `Kiss` without guessing from a loose Wikipedia title; ambiguous names remain unavailable until linked from **Artist info**. The biography loads automatically, can be refreshed explicitly, expands in place when long, and always shows the Wikipedia article link plus CC BY-SA 4.0 attribution.

SQLite schema version 50 caches the biography text, MusicBrainz MBID, Wikidata ID, Wikipedia language/title, source URL, state, and refresh times by normalized local artist key. Available text is refreshed after 30 days, unavailable results after seven days, and a failed refresh keeps displaying the last usable cached biography. No provider credential is required; only public MusicBrainz, Wikidata, and Wikipedia requests leave the device.

## Last.fm popularity, similar artists, and related albums

**Settings → Providers → Last.fm metadata** stores a read-only API key in Windows Credential Manager; the Last.fm shared secret is not used. Opening an artist's **Overview** loads `artist.getTopTracks`, matches the result against tracks that are actually in the local library, and shows the first five Popular Tracks with visible Last.fm attribution. **Show more** expands the list to as many as ten owned matches, while **Refresh** explicitly requests a new artist snapshot. Artist lookups prefer a saved MusicBrainz ID and fall back to the library artist name with Last.fm autocorrection when the ID result fails, is empty, or does not match an owned track; Last.fm's canonical spelling is retained in the cached provider rows.

The same Overview also loads `artist.getSimilar` and presents up to 12 listener-related artists in **In your library** and **Explore** groups. Local matches prefer MusicBrainz MBIDs and fall back to normalized artist names; owned cards reuse local portraits or representative album covers and open the local Artist page, while missing artists and the complete result link open Last.fm. Match percentages are Last.fm relationship scores, not local play counts. Discovery reuses these cached relationships for its **Because You Played / Loved** shelf and falls back to canonical genre links when an anchor has not been enriched yet.

Album pages derive up to 12 **Related Albums** from documented Last.fm API data: `album.getTopTags`, `tag.getTopAlbums`, and the existing `artist.getSimilar` relationship signal. Results are ranked by shared album tags with a similar-artist boost, then split into **In your library** and **Explore**. Each card shows the tags and artist relationship that support it; owned albums open locally and missing albums open on Last.fm. This is an API-derived recommendation, not a copy of Last.fm's private website ranking.

Opening an album track list reuses that artist snapshot and requests `track.getInfo` only for album tracks whose popularity is missing or stale. Tracks with positive listener evidence are ranked by listeners, then play count and track order; the leading three receive a 🔥 marker in both Albums and the Artist Cover view. A track without usable listening evidence is not given a flame.

SQLite schema version 49 stores artist refresh state and normalized track popularity independently of transient imported track IDs. Schema version 52 stores directed similar-artist snapshots and their ranked relationship scores. Schema version 53 stores API-derived related-album snapshots and local album matches. Successful responses honor provider cache headers with a seven-day fallback, unavailable tracks are retained for 30 days, and stale cached data remains usable when a refresh fails. Text is cached; Last.fm credentials are never stored in SQLite, logs, browser storage, or backups.

## Artist Loved Tracks and Chart Busters

Artist pages include two deferred local-data tabs alongside Overview. **Loved Tracks** lists every local track marked loved, with album, year, rating, duration, and oldest/newest, title, or rating sorting. **Chart Busters** lists each matched song once and combines its imported singles-chart histories from Billboard Hot 100, Official UK Singles, VG-lista, Ti i Skuddet, and Norsktoppen.

Each Chart Busters row initially shows one source in this order: Billboard, Official UK, VG-lista, Ti i Skuddet, then Norsktoppen. Songs present on more than one chart expose the remaining sources through **Show more charts**. Weekly sources report entry date, final imported chart date, distinct weeks on chart, and peak; the Billboard year-end source reports its stored entry date and best imported rank but leaves end date and weeks blank because those values are not present in the imported Billboard files. Charted songs default to their earliest entry from oldest to newest and can instead sort newest-first, by best peak, longest weekly run, or title.

## Music Doctor quality integration

**Settings → Data & Backups → Music Doctor** connects to `%APPDATA%\com.musicdoctor.desktop\music-doctor.db` by default. The source database is opened read-only and is never migrated or modified by Music Library. **Save and check** validates its schema, **Sync now** refreshes the app-owned cache immediately, and **Sync new Music Doctor scans automatically** checks at startup and every five minutes while the app is open. A sync runs only after Music Doctor reports a completed scan; changing the MusicBee import or Music Doctor scan makes the cache stale and eligible for refresh.

The sync matches MusicBee rows to Music Doctor audio by a Unicode-lowercased, normalized full Windows path rather than by transient track IDs. This keeps quality data attached when an import rebuilds the track table and also handles non-ASCII path casing. The app stores only a materialized cache of matched quality, album summaries, unmatched Music Doctor audio, file problems, and aggregate format/bitrate statistics in its own SQLite database (schema version 48).

Albums and Search expose measured format and bitrate, support min/max bitrate filters, mixed-quality-only filtering, and bitrate sorting. Music Tools adds **Audio below 320 kbps**, **Albums with mixed audio quality**, **Music Doctor audio not in library**, and **Music Doctor file problems**. Re-run Music Doctor after adding or upgrading albums; the next background or manual sync replaces the cache with the newest completed scan.

## Updates

The standalone **Updates** workspace is a permanent, searchable audit trail of meaningful library changes detected when an import is applied. Its **Activity** view keeps the chronological event ledger, while **Artists** rolls the complete filtered history up by normalized artist rather than only summarizing the current 50-row event page. Artist rows separate track impact from album impact—for example, `34 tracks removed · 3 albums removed` or `12 tracks added · 1 album added`—and mixed metadata/rating activity is reported as an overall change count. A dedicated **New artists** section shows true first appearances and the date each artist was added; adding another album to an artist that already existed does not classify that artist as new.

New albums, removed albums, metadata changes, track-count changes, and track-rating changes receive distinct icons, labels, and colors. Summary cards and controls filter either view by status, date, artist, album, field, value, description, or import source, while selecting an Activity entry opens its exact old value, new value, source import, timestamp, and event ID. Artist names and artist-summary rows open the Artists workspace with that artist searched and selected. Newly recorded album additions and removals preserve the album's track count so artist totals can report exact track impact; older ledger entries created before version `0.112.0` still show their known album count without inventing a missing track total.

SQLite schema version 45 stores these events in the append-only `library_updates` table. Applying another MusicBee export rebuilds the current track and album snapshot without clearing this history. The history is part of the app database, so the rolling SQLite backups remain the disaster-recovery copy if the disk containing the database itself fails.

MusicBee can generate new `<Album Unique Id>` values after a disk recovery or full rescan. During import comparison the app first uses the exact ID, then falls back to a normalized artist, album title, and year identity only when that identity occurs exactly once in the previous library. This preserves continuity instead of reporting an unambiguous 40,000-album rescan as removals and additions. Duplicate editions or otherwise ambiguous identities are never merged by guesswork.

## Timelines

The **Timelines** workspace now groups Charts, Genres, and Artists. The Artists tab presents the chosen **Career Peaks** design: each row combines a circular artist portrait, a year-spanning career line, and album peaks whose height represents either imported chart performance or the user's own Album Score. Every peak carries a small square album marker; hovering it opens the app's 300×300 cover preview with the album title and year. Selecting an artist illuminates that career while gently fading the others, reveals the strongest albums as larger cover markers, and opens a compact summary in a dedicated side rail so late-year peaks remain unobstructed. The artist, genre, year, and display-size filters use the same framed control treatment as the Genre timeline, while the overview strip keeps the complete time range visible.

**Charts** mode gives Billboard and Official UK the greatest and equal influence at 42% each, with VG Lista supplying the remaining 16%. **My Scores** mode normalizes saved Album Scores within the visible cohort. Both modes support artists that can be added or removed, canonical genre include/exclude filters including the `scores` umbrella, exact From/To years, and Top 7/12/20 display sizes.

Optional artist portraits are configured under **Settings → Providers → Last.fm metadata**. Only a Last.fm API key is required; the API secret is not used by the read-only artist lookup. **Sync 50 portraits** deliberately enriches one bounded batch, caches the downloaded images locally and records them in SQLite, and can be repeated until coverage is complete. Career Peaks, Artist Index, and Artist detail reuse the same cache. If enrichment is unavailable, the UI falls back to a representative album cover and then the artist's initial. SQLite schema version 46 stores this shared portrait cache.

## Music Map

Music Map visualizes the local library's app-owned MusicBrainz origin data without using Spotify. At world scale it shows country totals, including artists whose available origin is only a country. As the map zooms in, exact MusicBrainz begin-area IDs appear as a separate clustered area layer; country-only artists are never assigned to a made-up city or region.

Each country and area is colored by its album-weighted biggest canonical genre. Circle size can represent artists, albums, or loved tracks, and the map can be forced to Countries or Areas instead of the automatic zoom-aware layer transition. Search accepts country, area, and genre names. Selecting a location opens its genre share, counts, and representative local artists; selecting an artist continues into the existing Artists workspace.

Music Map includes a collapsed **Luna commands** area scoped to the selected country or precise MusicBrainz area. Country questions use the stored origin-country cohort; area questions use every locally mapped artist for that exact area, not only the 24 representative artists shown in the inspector. Luna receives the place label and can request the same bounded local summaries, groups, or up to 50 names used by current-view questions; paths and the rest of the library remain local.

The first **Enrich places** run resolves exact MusicBrainz area IDs and ISO country codes against Wikidata coordinates and stores the results in the app-owned SQLite map cache (schema version 28). Later map loads use that local cache. Refresh preserves previously resolved coordinates when Wikidata does not return a candidate. The OpenFreeMap basemap and coordinate refresh require internet access; local country/area aggregates and cached coordinates remain in SQLite. Basemap data is attributed to OpenFreeMap and OpenStreetMap contributors.

## Library Completion

Library Completion is the command centre for finding charted albums that are missing from the imported collection. Its local scan compares normalized artist and album keys across Billboard 200, Official UK Albums, and VG Lista data, merges the evidence for albums found in more than one source, and ranks candidates without making any provider requests. Chart evidence only proves that an album is absent locally, so every new row remains explicitly **Unverified** until a provider confirms its album type. The **Workbench** combines the queue with an evidence dossier, persistent **Wanted**, **Needs review**, and **Not for me** decisions, and direct handoffs to the existing Wish List and Deemix search flow. Its **Charts**, **From**, and **To** controls scope the complete local chart dataset before the 5,000-row Workbench cap, so source- or era-specific searches are not limited to whichever candidates happened to rank globally first. Each provider row has its own explicit **Not checked**, **Checking**, **Checked · verified**, **Checked · no exact match**, **Checked · multiple matches**, or **Failed** badge, so MusicBrainz and Discogs outcomes remain visible independently.

The **Artist discovery** view expands that mission across both album and singles charts. It merges artists from Billboard 200, Billboard Hot 100, Official UK Albums, Official UK Singles, VG Lista Albums, VG Lista Singles, Ti i Skuddet, and Norsktoppen, then removes normalized matches found in local album artists, track album artists, or track artists. A trailing Norwegian chart marker such as `[NO]` is discarded before artist matching and display. Dedicated **Show**, **Charts**, **From**, and **To** filters can focus the queue by workflow state—including only rows still marked **Unverified**—or scope the full local candidate set to any individual album or singles chart and overlapping year range before the 5,000-row display cap. The **Unverified** view keeps its original membership and ordering while verification results update row classifications and actions in place; **Scan local charts**, changing the source/year request, or re-entering the view rebuilds the snapshot and removes artists that no longer qualify. Repeated weekly rows and raw artist-key variants are collapsed into one summary per chart, such as `Peak #34 · 44 appearances · 2017–2023`. The resulting queue is entirely local until you select artists for verification. Its slow, persistent background worker resolves an exact MusicBrainz artist, caches only official primary Album release groups without secondary types, and independently asks a configured Discogs provider for an accepted studio-album master. Provider outcomes, chart provenance, progress, ETA, pause/resume, failure retry, and manual MusicBrainz identity review remain visible. Every manual identity candidate includes a direct **MusicBrainz** link to its exact artist page alongside the separate **Check identity** action. The queue preserves both the selected artist and the scroll position when completed verification data refreshes. Nothing is added automatically: **Add artist to Wish List** is enabled only after MusicBrainz confirms official studio albums, and the existing Wish List Artists card receives the cached missing-album summary. SQLite schema version 44 stores artist verification results, decisions, and resumable queue batches without replacing any imported chart table.

The **Coverage Atlas** summarizes owned albums, verified missing albums, and open gaps by chart source and decade. Selecting a cell and choosing **Review candidates** fetches the complete source-and-decade cohort directly from SQLite, outside the global 5,000-row Workbench cap, and opens it as a focused campaign with separate loaded, awaiting-verification, and verified counts. **Verify this cohort**, **Verify selected**, and the dossier's **Verify album** action add work to one persistent provider queue. Explicit selections are resolved against the complete local candidate set even when an album sits outside the globally loaded top 5,000 rows. The queue checks MusicBrainz first; a configured Discogs fallback runs only after MusicBrainz returns no exact match or an ambiguous result. MusicBrainz requests remain spaced by at least 1.1 seconds, while Discogs calls are serialized 1.2 seconds apart. The queue survives app restarts, recovers interrupted checks, and exposes the active provider, progress, ETA, pause, resume, and failed-item retry controls. Results are cached by candidate identity so completed albums are not requested again, while Workbench refreshes preserve the selected album and queue position.

MusicBrainz verification searches with structured album-title and artist fields, accepts only an exact normalized artist/title match, excludes release groups carrying Live, Compilation, or another secondary type, and rechecks the pure Album for at least one Official release. Discogs fallback requires one exact master match whose key release is accepted, preserves the exact artist and title, includes an Album format marker, and carries none of the Compilation, Live, Mixtape, Unofficial Release, Bootleg, DJ Mix, Single, or EP markers. A Discogs ambiguity remains **Manual review** instead of being promoted. Each item ends as **Verified**, **Manual review**, or **Failed** with separate locally stored provider evidence; the dossier states which provider verified it and the queue reports how many confirmations came from Discogs. Verification never adds an album to the Wish List automatically. A completed run offers **Review verified**, every verified dossier provides **Add to Wanted**, and MusicBrainz no-match rows retain both manual MusicBrainz review and **Try fallback** when Discogs is configured.

Phase 2C adds an on-demand **Find cover** action after an album is verified. MusicBrainz-verified albums request the release group's 500-pixel front image from Cover Art Archive; Discogs-verified albums request the primary image attached to the confirmed master. JPEG and PNG responses are limited to 5 MB, accepted only from trusted provider/archive hosts, and cached under the app data directory. Artwork state is stored independently as checking, cached, unavailable, or failed, and **Check again** retries only the image request—an unavailable cover never changes the album's verified status. SQLite schema version 43 adds the persisted cover provider, source, cache, MIME type, message, and check time.

## Requirements

- Node.js 20 or newer
- Rust toolchain compatible with Tauri 2
- Python 3.10 or newer for the optional Music Library Trimmer companion CLI
- A MusicBee TSV export with the columns listed in `SPEC.md`
- Internet access is required to load Music Map tiles, enrich new MusicBrainz area/country coordinates, load or refresh album reviews from MusicBrainz/CritiqueBrainz or artist biographies from Wikidata/Wikipedia, verify Library Completion candidates or Wish List additions through MusicBrainz or Discogs, enrich verified covers, search artist discographies, validate/search a configured Deemix connection, connect/search/download/share through Soulseek, or download articles from a Usenet provider; local Prowlarr access is also required for Usenet searches, while cached reviews and biographies, the Library Completion album and artist chart scans, and Coverage Atlas remain local
- An OpenAI API key is optional and only required for Ask Luna search, chart, current-view and Music Map place questions, Library analyst reports, Playlist Builder recipes, outside-library Discovery recipes, and global Music Research
- A Deezer ARL is optional and only required for the Deemix proof-of-concept connection and Wish List album searches; no Deemix GUI or separate service is required
- A Soulseek username and password are optional and only required for Soulseek Wish List searches, downloads, and sharing; the client runs inside this app, so `soulseek_forever`, Nicotine+, or SoulseekQt does not need to be running
- Prowlarr with an enabled Usenet Audio indexer is optional and required only for Usenet Wish List searches; the default URL is `http://127.0.0.1:9696`
- A Usenet provider account is optional and required only for native NZB downloads; Newsgroup Ninja defaults to `news.newsgroup.ninja` on encrypted port 563, and UnRAR is required to unpack RAR-based releases automatically

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

The desktop dev shell loads Vite from `http://127.0.0.1:1420/`, matching the loopback host used by `npm run dev`. Vite ignores the local `musicbee-library.tsv` export, `AlbumCovers/` archive, US, UK, and Norwegian chart folders, and `MusicBrainz/` cache folder during development so large library data cannot stall the dev server watcher. If the Tauri window opens but stays blank, make sure port `1420` is free and restart `npm run tauri:dev`.

## Music Library Trimmer

The companion CLI uses only Python's standard library. Validate the real app database and configured MusicBrainz cache without making any changes:

```powershell
py Tools\library_trimmer\library_trimmer.py --json doctor
```

Preview the candidate count for the intended cleanup scope without calling Discogs:

```powershell
py Tools\library_trimmer\library_trimmer.py --json candidates `
  --library-root "D:\MUSIC" `
  --exclude-genre scores `
  --exclude-genre soundtrack `
  --exclude-genre synthwave
```

Run or resume the first 500-candidate Discogs batch with the same scope:

```powershell
py Tools\library_trimmer\library_trimmer.py scan `
  --library-root "D:\MUSIC" `
  --exclude-genre scores `
  --exclude-genre soundtrack `
  --exclude-genre synthwave `
  --out trim-manifest.json

py Tools\library_trimmer\library_trimmer.py scan `
  --library-root "D:\MUSIC" `
  --exclude-genre scores `
  --exclude-genre soundtrack `
  --exclude-genre synthwave `
  --out trim-manifest.json `
  --resume
```

Public Discogs reads work without credentials. For authenticated limits, set `DISCOGS_TOKEN`, or set both `DISCOGS_CONSUMER_KEY` and `DISCOGS_CONSUMER_SECRET`; credentials remain in environment variables and are never saved in repository files, manifests, caches, CSV files, journals, or output. The personal token takes precedence when both methods are present.

Every trimmer command reports what it is currently doing to stderr. Long stages show live counts, percentage, processing rate, and ETA; Discogs rows also identify cache versus network work, and file operations identify preflight, hashing, move, verification, journal, and undo stages. Interactive terminals reuse one live status line where practical, while redirected logs receive periodic checkpoints. `--json` remains clean on stdout. Review imports automatically accept UTF-8, Excel UTF-16/UTF-32, and Excel Windows-1252 files with comma, semicolon, or tab delimiters.

The complete review, apply, undo, credential, JSON-output, and raw read-only request workflow is documented in [Tools/library_trimmer/README.md](Tools/library_trimmer/README.md). `apply` previews by default; moving files additionally requires imported CSV approvals, `--execute`, and `--confirm MOVE_APPROVED`. The quarantine must be outside the selected library root. After accepting the result, rescan in MusicBee, export a fresh TSV, and use the app's normal import preview/apply workflow.

## Luna Search, Charts, Current-view Questions, Library Analyst, Playlists, Discovery, and Music Research

Search is organized as a progressive, results-first workflow. Its global text search, Album/Track switch, title, artist, included/excluded genres, and library year range stay visible while the result table begins in the first screen. Rating, lifecycle, MusicBrainz, metadata, file, scoring, sort, row-limit, and table-column controls remain available in a collapsed **Advanced filters** drawer, whose summary reports active hidden filter groups. A nested **Chart filters** disclosure groups source-specific Billboard, Official UK, VG Lista, and track-only Ti i Skuddet and Norsktoppen rank/debut controls so future charts can be added without lengthening the main form. The two track-only source cards remain visible in Albums mode and provide a one-click switch to Tracks, where their rank and debut fields become available. Optional album and track columns distinguish each source's peak rank and debut; every chart column can be removed from the table. The right sidebar's **Make a Playlist** action immediately creates a local draft from the current Search filters and ordering, resets pagination, loads up to 500 matching tracks, and opens the populated review surface without calling Luna. Search's filter-building and current-result Luna tasks share one collapsed **Luna commands** area with **Find and filter** and **Ask these results** modes.

Charts follows the same progressive pattern. Search, Table/List/Grid, ranking, direction, included and excluded genres, and library year stay visible while the current ranking begins in the first screen. Result limit, built-in presets, lifecycle, MusicBrainz, scoring, completeness, source-specific columns, cover size, and export controls live in a collapsed **Advanced chart controls** drawer with an active hidden-control count. Its nested **Chart filters** disclosure groups Billboard, Official UK, VG Lista, and track-only Ti i Skuddet and Norsktoppen ranges; in Albums mode the two singles-only cards stay visible with a one-click switch to Tracks. Charts can rank albums or tracks by Official UK or VG Lista peak rank/debut, and tracks by Ti i Skuddet or Norsktoppen peak rank/debut. Chart-building and current-ranking Luna tasks share one collapsed **Luna commands** area with **Build a chart** and **Ask this chart** modes.

Discovery, Playlist Builder, and Statistics use the same collapsed **Luna commands** treatment for outside-library discovery, playlist planning, and Library analyst controls. Reopening a saved discovery or analyst report, or launching Playlist Builder from a Luna/cohort action, expands the relevant command area automatically; the page's results and dashboards remain visible while the large input surface stays out of the way by default.

Timelines is a dedicated dark workspace with **Charts**, **Genres**, and an **Artists** placeholder for the next timeline. Charts opens **Albums through the years** and **Tracks through the years**. A source switch chooses **US · Billboard**, **UK · Official Charts**, or **NO · VG Lista** in either mode, plus track-only **NO · Ti i Skuddet** and **NO · Norsktoppen**; the selected source drives the available years, dated cohort, rank ordering, badges, and playlist handoff. It lets you move among chart years and Spring, Summer, Fall, Winter, Christmas, New Year, and full-year presets, or build a custom period from one month or a month range that can wrap across December. Every item in the chosen period appears as an artwork card with its title and artist always visible; track cards also name the chosen source album, so missing artwork remains identifiable. A newly selected period starts in an explicit **All weeks** view; choosing a week filters the artwork, counts, selected item, custom-order scope, and playlist handoff to that week, while choosing **All weeks** or another period restores the complete snapshot. The strip defaults to chronological first chart appearance and can instead be ordered in either direction by score/rating, selected-source rank, title, or artist. Track mode shows one canonical library copy per charted song. **Custom order** starts from the visible order and lets you select a card, move it earlier or later, and reset it. The visible order is handed to Playlist Builder with the exact period or selected-week cohort. You can also select individual cards, open the chosen item, jump to Search, and enter true fullscreen mode with 300×300 hover artwork. The cinematic decade ribbon uses luminous decade nodes, long cover connectors, and a subtly animated selected-year light stage; reduced-motion preferences keep the lighting static. Narrow windows switch to a compact focus view with scrollable artwork and responsive period and order controls. Chart appearance is used as the historical marker and is not presented as a verified retail release date.

Genres opens the **Genre constellation**, where each horizontal cloud is built from real album dots and smoothed density contours. **Dots** keeps individual albums prominent, while **Density** emphasizes the overall shape of each genre through time. Selecting a cloud or its left-hand label illuminates that genre, gently fades the others, and opens a compact card with its observed span, peak year, and album count; selecting an album dot opens the album itself. The overview strip preserves the complete temporal silhouette, while the filter drawer provides include and exclude tokens, the **Scores** umbrella (film, TV, animation, anime, and video-game scores), editable year bounds, and Top 7/12/20 controls. Large result sets evenly sample album dots for legibility without changing the density counts.

Search and Charts include Ask Luna query controls powered by the exact `gpt-5.6-luna` model. A filter request such as `Top AOR albums from 1984 under 45 minutes` is translated into the app's existing typed filters (`Genres: AOR`, `Year: 1984`, `Minutes max: 45`) and Album Score descending sort. The desktop app validates that structured plan and runs the resulting query against local SQLite. Filter compilation sends no album or track rows to OpenAI.

Ask Luna also recognizes direct questions. For example, `How many Billboard No. 1 albums have I rated with 100% completeness, and how many do I have left to rate?` applies only the Billboard-rank cohort filter, then automatically uses the same bounded local inspection as Ask about this view. The exact answer opens after that one submission; `left to rate` combines partially rated and unrated albums instead of filtering them away. Multi-part count and comparison questions do not need to be split into separate prompts.

Chart-source wording stays source-specific. For example, `Give me all the nr. 3 albums in the VG Lista charts from 1980 to 1989` applies VG Lista rank 3 rather than Billboard rank 3, while `Find albums that were on VG Lista but not Billboard` combines a VG Lista presence filter with missing Billboard data. Track requests such as `Find Norsktoppen number-one singles that debuted in summer 1989` use Norsktoppen rank and ISO debut-week fields without substituting Ti i Skuddet, VG Lista, or Billboard. Luna supports source-specific presence/missing checks, ranges, sorting, chart ranking, and Playlist Builder recipes, and rejects Ti i Skuddet and Norsktoppen fields in album view because both lists are singles-only.

Bounded numeric requests are supported as typed ranges. For example, `Albums from artists who died between 1985 and 1989` activates the artist-death filter and applies `Died year: 1985–1989` before searching locally.

Billboard debut-time requests compile to the same local ISO-week range used by Search, Charts, and Playlist Builder. For example, `Relive the summer of 1989` covers June through August 1989 using album chart-debut weeks; this is first Billboard appearance data, not an asserted retail release date.

Unrated and random requests are also explicit local operations. For example, `10 random albums from 1989 that I haven't rated yet` applies `Missing: Album rating`, `Year: 1989`, and the Random sort; SQLite selects the random sample locally.

Search and Charts also include **Ask about this view**. Questions such as `Which artists appear most often?`, `How many are unrated?`, or `What stands out about these albums?` operate on a snapshot of the active filters. Luna must call one strict `inspect_current_view` tool; the desktop app then executes only validated local SQLite operations. A question can request one to three compact inspections: an exact overview, up to 20 grouped values, and/or up to 50 named albums or tracks. File paths, filenames, database files, covers, saved objects, the complete result set, and arbitrary SQL are never sent. Album, track, and artist names are sent only when the user explicitly asks a question whose answer needs a bounded named list.

After Ask Luna answers a Search or Chart question, the same field becomes a follow-up prompt. References such as `Can you list the albums I haven't rated 100% yet?` inherit the previous query scope; the app sends Luna only the preceding question, its concise query summary, and its bounded answer. Luna returns a new standalone filter plan, SQLite applies it locally, and the resulting one-to-five-turn conversation is stored in the local snapshot and included in Markdown exports. A dedicated **Not fully rated** filter includes both partially rated and unrated albums without rounding the condition to 100%.

Each current-view answer reports the number of matching rows, local analyses, names shared, and combined token usage. Questions are stateless rather than an accumulating chat history, which keeps context and cost bounded. The two-step tool flow normally makes two paid API requests: one to choose the local inspection and one to answer from its compact result.

Statistics includes **Library analyst** for collection-wide insight without using the library as a prompt. Choose Overview, Rating backlog, Taste profile, Catalog balance, or Metadata health, then optionally add a focus question. Luna must call one strict `inspect_library_profile` tool and can request no more than four compact sections from overview, rating progress, catalog shape, taste signals, metadata health, and recent change. SQLite calculates those sections locally by reusing the Statistics aggregates.

The Statistics page also includes **Countries in your library**, a scrollable horizontal bar chart over every stored MusicBrainz origin country. **Artists** ranks current-library album artists by country, while **Albums** ranks their local albums; both views sort descending and keep the exact count, full country name, and flag visible on every row, resolving code-only stored names such as `RO` to their canonical English country names.

Statistics and the in-library Discovery dashboards are operational rather than read-only. Select an actionable mission, heatmap cell, artist, genre, album, decade, year, rating band, metadata gap, loved-density group, duration/track-count group, catalog leader, outlier, or rating event to activate one consistent dock. The dock labels its result count explicitly as albums or tracks; a genre row in **Loved density** opens the individual loved tracks while retaining the contributing album count and total track count as aggregate context. **Open in Search** carries the exact typed cohort request into Search, **Save view** stores it immediately with the saved searches, and **Build playlist** opens Playlist Builder with the same request locked as its local source. Luna can plan targets and sequencing but cannot widen that source unless **Clear cohort source** is used.

Library analyst context contains bounded counts, percentages, rating buckets, timestamps, genre labels, and decade groups only. It never contains raw album or track rows, album/track/artist names, paths, filenames, covers, saved objects, source paths, or arbitrary SQL results. The structured report shows one to five evidence-backed findings, up to three useful next questions, the profile-section and aggregate-point counts, and combined token usage. Selecting a useful next question runs that follow-up analysis immediately. The Focus question clears when any analysis starts, while the submitted question is retained in the request and saved snapshot. It is stateless and normally makes two paid API requests: one to choose aggregate sections and one to produce the strict report.

The fixed sparkle button beside the global top-right controls opens one contextual **Luna** command center from every workspace. Its six explicit modes are Plan & filter, Ask this view, Analyze library, Build playlist, Discover outside, and Research music. The selected mode always shows an **Attached context** badge and a mode-specific **Privacy boundary** before the user continues. Plan/Ask launches the appropriate Search or Chart command area, analysis opens Library Analyst, playlist/discovery modes open their workspaces, and Music Research runs inside the shared panel.

Successful Ask Luna Search/Chart queries, Ask about this view answers, Library analyst reports, and Music Research conversations are saved automatically to one local **Snapshot history** in the Luna panel. Explicitly saved playlists and outside-library discoveries appear in the same chronological timeline without becoming automatic saves. Each AI entry stores the original prompt, exact typed AI output, creation time, and the current library import/count state in SQLite schema version 21; a direct Search/Chart question stores its exact answer with the compiled local request, current-view answer snapshots retain the filtered request they were based on, and research snapshots retain their selected page context, citations, usage, and latest five exchanges. Reopening costs no tokens and makes no OpenAI request. Search and Chart query snapshots reapply their saved filters to the current library, so result rows can reflect later imports, and open a readable saved-snapshot document with the original request, direct answer when present, Luna interpretation, active filters, view/sort limits, chart setup, and recorded library state. Current-view answers, Library analyst reports, Music Research conversations, saved playlists, and saved discovery lists reopen in their owning workflow. Individual history items can be deleted, and they are included in normal SQLite database backups. The OpenAI key is never stored with them.

**Playlist Builder** turns a natural-language request such as `A 45-minute AOR mix from the 1980s with no artist repeated` into one strict track-filter recipe. Only the request is sent to Luna. SQLite searches at most 500 matching local candidates and selects at most 200 tracks using the requested ranked, variety, discovery, or random strategy plus bounded per-artist and per-album repeat caps. A request such as `Discover unrated deep cuts from highly rated albums` combines a missing track-rating filter with album-rating ordering and local discovery selection. Launching it from an insight carries the exact typed cohort request locally and displays a removable source badge; that source is never sent to Luna. Search's **Make a Playlist** path is separate: the matching local tracks are loaded directly in Search order and no OpenAI request is made. Track, album, artist, path, and filename rows are never sent to OpenAI.

The result is a reviewable draft: every track row shows its year, numeric rating when present, and a heart when loved; rename the draft, reorder or remove tracks, then explicitly save the exact ordered playlist for later use. Luna-planned drafts remain capped at 200 selected tracks, while direct Search drafts can save and export up to 500 tracks. Saved playlists reopen without an OpenAI call or token cost, record the source library import/count state, participate in normal database backups, and can be updated or deleted. Export writes a UTF-8 `.m3u8` file containing the selected local paths. SQLite schema version 22 adds this saved-playlist storage.

Discovery includes **Find what your library is missing** for requests such as `Find me 5 artists with releases from 1992 that I don't have`, `Show me 8 AOR albums from the 80s missing from my library`, or `Find 10 synthpop songs from 1984 I don't own`. Luna receives only the request and returns a strict recipe containing the entity, count, exact year or inclusive year range, year interpretation, and explicit genre/country/keyword filters. Decade wording such as `1980s`, `80s`, `'80s`, and `’80s` becomes the inclusive 1980–1989 range; bounded wording such as `from 1982 through 1987` is also supported. For a request such as `artists from 1992`, the default interpretation is artists with a verified 1992 release; `formed in 1992` is treated separately.

The desktop backend makes one bounded MusicBrainz search, spaces request starts by at least 1.1 seconds, keeps the source and evidence visible, enforces the exact year or inclusive year range against every returned item, and excludes owned candidates against local SQLite using MusicBrainz IDs where available plus normalized artist, album, and song identities. No library rows, owned-name lists, paths, filenames, covers, or database files are sent to Luna or MusicBrainz. MusicBrainz may return fewer unowned results than requested, which the UI reports rather than inventing candidates. Result links are limited to HTTPS MusicBrainz artist, release-group, and recording pages.

Outside-library lists are saved explicitly rather than automatically. A saved list retains the exact verified result order, Luna recipe, MusicBrainz evidence, creation time, and source library import/count state. **Add missing items to Wish List** stores every still-unlisted artist or album in the verified cohort in one action; songs remain outside the artist/album Wish List model. Reopening does not call Luna or MusicBrainz, saved lists can be updated or deleted, and they participate in normal SQLite backups. SQLite schema version 23 adds this storage.

## Wish List

Use **Wish List** to keep wanted artists and albums separate from the music already in your collection. **Add artist or album** searches MusicBrainz directly from this workspace and lets you choose the correct catalog match before anything is saved. Artist additions verify the selected artist's official pure Album releases—primary type Album with no Compilation, Live, Remix, DJ-mix, Soundtrack, or other secondary type—against imported albums and completed downloads; an artist with no missing official albums—or no official albums at all—is explained and not added. Album additions re-confirm that the selected MusicBrainz release group still exists, is a pure primary Album with no secondary type, and has at least one Official release before saving it. You can also add an album from a selected artist's **MusicBrainz Discography** when its status is Missing, or add an artist/album from a **Find what your library is missing** result. Duplicate MusicBrainz entries are ignored, each item can be removed manually, and MusicBrainz artist/release-group links remain available from the list.

The list is local SQLite data included in normal database backups. Whenever Wish List opens—and immediately after a successful MusicBee import—the app compares album wishes against the current library and removes albums you have acquired. Artist wishes now remain as persistent discography trackers after the artist enters the library: each card shows its current missing official-album count, and an eye control reveals the missing album titles and years on hover or keyboard focus. This viewport-aware panel opens above or below the control as space permits, escapes card clipping, and scrolls internally for long discographies. The count includes normalized albums already imported into the library plus completed Deemix receipts. Completed Deemix downloads also retain local receipts so album wishes and artist-discography rows can show a persistent **Downloaded** badge. SQLite schema version 24 adds Wish List storage, while schema version 31 adds the download receipts.

Configure Deemix under **Settings → Providers** by choosing a download folder and pasting the ARL from your own Deezer session. The folder is selected through the bundled native Windows picker and stored as the ordinary `deemixDownloadPath` app preference; it can be cleared at any time. Choose FLAC lossless, MP3 320 kbps, or MP3 128 kbps as the preferred output and one of two album-folder layouts: flat `Artist - Album (Year)` folders (the default) or nested `Artist/Album (Year)` folders. **Quality fallback** is enabled by default and accepts the best available format per track in the order FLAC → MP3 320 → MP3 128; choose **Exact quality only** to reject lower-quality substitutions. The Rust backend validates the account before storing the ARL as a generic credential in Windows Credential Manager. The frontend receives only configured status, account name, Deezer user ID, country, and reported high-quality/lossless capability; the ARL is not written to SQLite, settings JSON, browser storage, logs, exports, or backups and cannot be revealed by the UI. SQLite schema version 29 adds the folder preference, schema version 30 adds the quality and organization preferences, and schema version 32 adds the fallback preference.

Configure Soulseek in the same **Settings → Providers** section. Enter a username, password, and download folder, then choose **Save & connect**. Soulseek has no separate sign-up form: the network creates an account when an unused username connects with its password for the first time. The app connects directly from its Rust backend, automatically reconnects when enabled, persists download state across restarts, and keeps the password in Windows Credential Manager. Account settings contain only the username, server, download path, and connection preferences.

Configure Usenet under **Settings → Providers**. Keep the Prowlarr URL at `http://127.0.0.1:9696` when it runs on the same PC, then copy the API key from **Prowlarr → Settings → General → Security**. Enter the username and password issued by the Usenet provider, choose a download folder, and select the connection count; Newsgroup Ninja is prefilled as `news.newsgroup.ninja`, encrypted port 563, with eight of the provider's available connections. **Save & test** checks both the Prowlarr system API and NNTP authentication before reporting the setup ready. The Prowlarr API key and news password are stored separately in Windows Credential Manager and are never returned to the frontend, written to SQLite or JSON settings, logged, exported, or included in backups.

Album wishes expose a separate **Search with Usenet** action. The backend asks Prowlarr only for Audio-category results, keeps NZB/Usenet rows, and ranks them against the wanted artist, album, and year. Results show their indexer, age, size, grab count, category, and title-match score. **Download NZB** retrieves the NZB through the authenticated local Prowlarr proxy, connects directly to the configured news server over TLS, downloads article segments across the selected number of connections, decodes yEnc data, verifies advertised per-segment CRCs, and reports live NZB, article, verification, extraction, completion, and failure states in the persistent Wish List transfer queue.

Usenet work happens in an app-owned hidden staging folder beneath the selected download directory. Install `par2cmdline-turbo` and make `par2.exe` available on `PATH`; the app also detects `C:\Tools\par2cmdline-turbo\par2.exe` and the corresponding Program Files location directly. For an NZB with PAR2 data, the downloader separates the payload, optional metadata, base PAR2 index, and recovery volumes. It downloads the small index with the payload, verifies the staged release, and only when recovery is needed downloads PAR2 volumes from smallest to largest, retrying repair after each volume and stopping as soon as the release is complete. Missing `.nfo`, playlist, artwork, or other optional metadata is not by itself treated as a failed audio download when the NZB has no usable recovery set.

A completed direct-file release is moved into `Artist - Album (Year)` after verification; a RAR release is extracted only after the PAR2 stage succeeds, using an installed UnRAR executable such as `C:\Tools\UnRAR\UnRAR.exe` or a standard WinRAR location. Existing album folders are never overwritten and completed copies receive numbered sibling folders. Missing articles and yEnc checksum failures preserve their sparse partial files and downloaded recovery data in stable staging, so retrying the same Prowlarr result can verify or repair that work before downloading again. **Clear finished** removes the history rows and any retained recovery staging for those releases; completed downloads are unaffected.

Soulseek sharing is opt-in. **Add folder** opens the native directory picker and indexes only that selected root; each root can be disabled without removing it, removed completely, or rescanned after the files change. The app advertises the enabled directory/file counts, answers bounded search and folder-list requests, and serves exact indexed files through one to three configurable upload slots. Nothing outside an enabled root is exposed, hidden/temporary files are skipped, changed files are rejected until the next rescan, and local share paths remain in the app's private Soulseek settings rather than SQLite or database backups. Sharing at least one useful music folder can make additional peers willing to return results or permit downloads.

Configure Discogs under **Settings → Providers** with the Consumer Key and Consumer Secret from your Discogs application. **Save & test** makes one authenticated database request before saving both values as a single generic credential in Windows Credential Manager; **Test connection** checks the stored credential and reports the current Discogs request allowance, while **Remove** deletes it. The key and secret are never returned to the frontend after saving and are not written to SQLite, browser storage, logs, exports, or backups. Consumer credentials are used only for public database verification; this phase does not request access to a Discogs user account or collection.

Album wishes expose **Search with Deemix**. Each search revalidates the stored ARL, queries Deezer directly over HTTPS, ranks album candidates against the wish's artist, title, and year, and labels them Exact, Likely, or Possible. Candidate links are constructed from numeric Deezer album IDs. **Download album** authorizes the selected release through the connected Deezer account, keeps Deezer-issued session cookies in an ephemeral in-memory cookie jar, refreshes a rejected CSRF/API token once, renews expiring track tokens, follows Deezer's alternate regional track source when the catalog entry cannot provide media, requests each track in the configured preferred format with the saved fallback policy, decrypts each media stream locally, and reports live metadata/artwork/download/tagging progress. Alternate track sources still honor **Exact quality only**; a lower bitrate is accepted only when **Quality fallback** is enabled. Deezer artwork is optional: when no image is supplied or its image request fails, the audio still downloads with all available non-picture tags, the job completes, and the queue reports **Downloaded without artwork** as a warning rather than a failure.

Album wishes also expose **Search with Soulseek**. A 15-second live network search collects public audio results and groups them by peer and remote folder so a release appears as one source instead of a loose track list. Sources show format, file count, total size, free-slot or queue state, reported speed, sample rate, and bit depth. **Download release** queues every audio file in the folder into an app-owned album directory, retains the queue across restarts, resumes partial files where the peer supports it, validates the completed file size and audio contents, and streams live state back into Wish List. The selected source remains visibly attached to that transfer and distinguishes **Queued locally**, **Requesting peer**, **Peer queue #…**, **Connecting**, **Retrying automatically**, **Downloading**, **Paused**, **Downloaded**, and **Download failed**. Its progress panel shows completed files, aggregate bytes, percentage, current speed, ETA, and local transfer-slot use, while the detailed queue gives readable activity for each file. Newly searched **Albums found** stay above the global transfer history, and **Clear completed** removes finished Soulseek releases from that persistent history without affecting their downloaded files.

Before a download starts, the app checks its local receipt and expected destination folder. An existing album produces an inline warning with the exact path; **Download another copy** remains available and creates a numbered sibling folder without overwriting files. Artist wishes with a MusicBrainz ID expose one official-album search: the backend keeps only pure primary Album release groups with no secondary type and at least one Official MusicBrainz release, persists that verified snapshot for fast Wish List summaries, and matches each bounded result with Deemix. The initial artist search makes no Soulseek or Usenet requests. Once **Albums found** appears, every release has separate **Search Soulseek** and **Search Usenet** actions that run only when selected and show that provider's sources inline beneath the release. Each missing album also offers **Download with Deemix** when a Deezer match exists, while **Download all with Deemix** keeps the sequential bulk workflow.

Downloads are built in an app-owned staging folder beneath the configured destination. Generated artist, album, and track names are sanitized for Windows; existing destination album folders are never overwritten; and the finished album folder appears only after every track is complete. Single-disc files use `01 Title.mp3` or `01 Title.flac`; multi-disc files use `1-01 Title.mp3` or `1-01 Title.flac`. MP3 files receive ID3v2.4 metadata and FLAC files receive equivalent Vorbis comments for title, artist, album artist, album, publisher, genre, release date/year, disc/track number and total, ISRC, copyright, composer/production credits when Deezer supplies them, barcode, explicit status, and Deezer source tags. The verified front cover is embedded in every track and also saved in the album folder as `cover.jpg` or `cover.png` according to its actual image format. Exact FLAC and MP3 320 kbps require the corresponding Deezer account capability; an unavailable accepted quality fails clearly and leaves no staged album behind.

The Luna command center stays visible whether the right details sidebar is open or hidden. In **Research music** mode on Albums, Artists, and Genres, the panel attaches the currently selected album, artist, or genre as a context clue and shows that attachment before anything is sent. The selection guides the question without restricting it: a question can be directly about the selection, use it as a starting point, compare it with something else, or move into wider music research. Other workspaces deliberately open in General music research mode and do not silently inherit their filters, chart rows, or current-view analysis state.

Music Research uses the Responses web-search tool for factual history, discography, credits, chronology, reception, influence, comparisons, niche claims, and current facts. Cited HTTPS sources are shown under the answer and open in the system browser. If a question needs the user's collection, Luna may call one strict `inspect_selected_library_context` function. SQLite then returns exact summary counts plus at most 20 track names for a selected album or 20 album names for a selected artist/genre, ordered by chronology, rating, Album Score, or loved-track count. Paths, filenames, covers, saved objects, raw SQL, unrelated rows, and the database never leave the machine.

The compact conversation retains at most five completed exchanges and sends no more than the latest eight validated turns. Changing the workspace or selected entity clears the active conversation so facts from one selection cannot bleed into another. Every successful answer automatically saves the exact bounded conversation and page context in local Snapshot history. Reopening restores that context, Markdown answer, citations, and usage without calling Luna; entries can be deleted individually. Luna answers render safe GitHub-flavored Markdown, including headings, emphasis, lists, tables, quotations, and code. Raw HTML is ignored, remote images are not loaded, and only HTTPS answer links can be opened.

Every AI result surface includes **Export Markdown**: Ask Luna Search/Charts, Ask about this view, Library analyst, Music Research, Playlist Builder, and outside-library Discovery. The export includes the prompt, answer/report/plan, visible evidence and citations, relevant typed local request metadata, model/token metadata, and recorded library state when exporting a reopened snapshot or saved item. Reopened snapshots and saved playlists/discovery lists can be exported without another AI or catalog call. UTF-8 `.md` files are written to the app data `exports` folder; local audio paths and the OpenAI key are never included.

After any successful export—AI Markdown, Search/Chart data, album/artist/genre rows, Music Tools issues, MusicBrainz releases, or an M3U8 playlist—the app automatically copies the absolute output path to the Windows clipboard and confirms **Path copied** beside the readable filename. Paste it into File Explorer or another Windows dialog to reach the file directly. If clipboard writing is unavailable, the export still succeeds and the same confirmation provides a **Copy path** retry button. The desktop capability is write-only: the app cannot read clipboard contents.

Configure the OpenAI key in **Settings → Luna & OpenAI**. The desktop backend stores it as a generic credential in Windows Credential Manager and returns only configured/source status to the frontend. The key is not part of `AppSettings`, SQLite, browser storage, logs, exports, or database backups. Settings can test the connection and remove or replace the stored credential without displaying the existing key.

For temporary local development, a repo-root `.env` file containing `OPENAI_API_KEY=...` is supported by debug builds only. Secure Settings storage takes precedence over that fallback. `.env` and `.env.*` are gitignored, while `.env.example` remains allowed; `npm run security:check` enforces those rules. Production builds do not load the project `.env` file.

Each Ask Luna result shows input, cached-input, and output token usage when the API returns it. Requests use strict schemas, low reasoning effort, bounded outputs, and `store: false` instead of passing the database as context. Filter compilation, Playlist Builder planning, outside-library recipe planning, and Settings connection tests each make one small paid API request. A direct answer in the Search/Chart Ask Luna panel uses three paid requests total: one to compile the cohort and two for the bounded local tool-and-answer flow. Current-view questions and Library analyst reports use the bounded two-request tool flows described above. Music Research makes one API request when it can answer with web/general context and two when Luna first requests the bounded local selection; web-search tool calls add their separate tool charge. The panel reports whether web and local-library tools were used. Outside-library discovery additionally makes one MusicBrainz catalog request, which does not use the OpenAI key.

The import screen defaults to `musicbee-library.tsv`, `AlbumCovers`, US `CSV_ALBUMS` and `CSV_SINGLES`, UK `CSV_ALBUMS_UK` and `CSV_SINGLES_UK`, and Norwegian `CSV_ALBUMS_NO`, `CSV_SINGLES_NO`, `CSV_TIISKUDDET_NO`, and `CSV_NORSKTOPPEN_NO`. When a US chart source is a full path and a country-specific source still has its bare default name, the corresponding UK and Norwegian sources expand to sibling paths automatically—for example, `C:\Music\CSV_SINGLES` produces `C:\Music\CSV_SINGLES_UK`, `C:\Music\CSV_SINGLES_NO`, `C:\Music\CSV_TIISKUDDET_NO`, and `C:\Music\CSV_NORSKTOPPEN_NO`. Editing any Imports source path saves it automatically after a short pause; **Save paths** remains available to save immediately or retry a failed write. The saved-state indicator reflects the last path values confirmed by the backend, and exact Windows paths—including a trailing backslash such as `C:\Music\AlbumCovers\`—are restored across app restarts. Existing settings that still contain the old exact `CSV` default migrate automatically to `CSV_ALBUMS`. SQLite schema version 20 stores the original Imports workspace paths, app-owned MusicBrainz artist origin-country and artist-info tables, the Origin Country flag/name display preference, and the portable unconfigured overlay-sync default; schema version 33 adds Billboard album first-appearance month/week data and indexed canonical ISO-week keys; schema version 34 adds Billboard single chart-entry dates, calendar parts, ISO weeks, source-date quality, and lookup indexes; schema version 35 adds Billboard single source-album provenance and normalized album matching keys; schema version 36 adds the two VG Lista paths, dedicated Norwegian weekly album and single tables, and indexed summary fields on matched library rows; schema version 37 adds the Ti i Skuddet path, dedicated weekly singles table, and indexed track summary fields; schema version 38 adds the Norsktoppen path, dedicated weekly singles table, and indexed track summary fields; schema version 39 adds the Official UK paths, dedicated weekly album and singles tables, matched-row summaries, and indexes; schema version 40 adds persistent Library Completion decisions and provider links; schema version 41 adds persistent Library Completion verification outcomes, resumable batches, and queue items; schema version 42 adds provider-specific MusicBrainz and Discogs evidence; schema version 43 adds independent Library Completion cover-enrichment state and cache metadata; schema version 44 adds persisted missing-chart-artist verification, decisions, and resumable batches. Relative paths are resolved from the app process directory and its parent, so repo-root source folders work during local development. MusicBee TSV quote characters are treated as literal tag text during preparation, matching plain TSV exports where titles can contain unpaired quotes. Date-like MusicBee `Year` and `Release Year` values such as `2019-06-28` are normalized to `2019`. Preparation writes resumable checkpoint rows into the app database but does not replace the active `tracks`, `albums`, or `raw_tracks` snapshot, so the SQLite file can temporarily grow by roughly the staged snapshot size. Cancel interrupts staging or the final delta analysis and keeps the last durable checkpoint for resume. Apply creates the rollback backup immediately before its atomic replacement transaction; after a successful Apply, the app removes the checkpoint rows and compacts substantial freed staging space. A cancelled preparation can resume only while the source path, size, and modification time still match the saved checkpoint; changed sources must be prepared again. The final Apply phase cannot be cancelled because it is one short SQLite transaction: success replaces the active snapshot, while any error rolls the whole transaction back. The TSV, local `AlbumCovers/` archive, all eight local chart source folders, and local `MusicBrainz/` cache folder are intentionally ignored by git.

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

Run the standalone Music Library Trimmer tests:

```powershell
npm run test:tools
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
- `src-tauri/src/ai.rs` owns OpenAI calls, strict query-plan/current-view/library-profile/playlist/external-discovery/music-research validation, bounded web-search and selected-context tool orchestration, typed reports and recipes, debug-only environment fallback, and Windows Credential Manager access; the frontend never receives the key.
- `src-tauri/src/deemix.rs` owns ARL validation and Windows Credential Manager access, authenticated Deezer account checks, bounded album catalog searches, candidate parsing, and artist/title/year match scoring; the frontend never receives the ARL.
- `src-tauri/src/soulseek/` owns the embedded Soulseek protocol, account lifecycle, peer/distributed search handling, persistent downloads, explicit local share indexing, and bounded uploads; the frontend never receives the Soulseek password.
- `src-tauri/src/usenet.rs` owns secure Prowlarr/Newsgroup Ninja configuration, Audio NZB search, TLS NNTP sessions, parallel article retrieval, yEnc validation, persistent transfers, staging, and UnRAR extraction; the frontend never receives either provider secret.
- `src-tauri/src/external_discovery.rs` owns MusicBrainz artist/release-group/recording search, local ownership exclusion, source evidence, and exact saved Discovery list persistence.
- `src-tauri/src/wishlist.rs` owns persistent artist/album wishes, MusicBrainz references, duplicate prevention, and local-library reconciliation.
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
- Tools also includes Albums not on MusicBrainz official list, the inverse report of local database albums absent from a comparable artist's pure official MusicBrainz album list.
- Tools includes **Owned MusicBrainz special releases**, which positively matches local albums to `Album + Compilation`, `Album + Compilation + Live`, `Album + Interview`, `Album + Live`, `EP`, `EP + Compilation`, `EP + Compilation + Live`, or `EP + Live`, then excludes titles that also match a pure Album release group.
- The special-release report shows one local row with a **MusicBrainz type** value, combines multiple matching special types, includes the type in CSV/TSV/XLSX/JSON/TXT exports, prefers refreshed data independently for Album and EP, and falls back to the configured cache when a refreshed type is unavailable.
- The report trusts verified artist links and non-suspect exact/normalized cache-name matches, skipping broad or ambiguous cache mappings.
- The inverse report requires a usable official-album snapshot before comparing an artist, matches normalized album titles, and includes album genre plus representative filename/path data in the existing searchable, sortable, exportable issue list.
- Missing album rows respect app-owned MusicBrainz not-in-scope decisions, cached non-official release status rows, and refreshed release-group overlays before falling back to the local cache.
- Selected-artist MusicBrainz refreshes now fetch both Album and EP release groups; web-only preview mode includes mock rows for both collection-comparison directions and the owned special-release report.

## Phase 28 MusicBrainz Artist Coverage Tool Features

- Tools includes Artists without MusicBrainz data, which compares distinct local album artists against the saved MusicBrainz cache path and app-owned verified/refreshed overlay rows.
- The tool flags artists with no cache/verified MBID match or a matched MBID with no cached/refreshed release groups, with search, sort, and export support through the existing Music Tools issue lists. Its CSV, TSV, XLSX, JSON, and TXT exports include the artist-level **Top Genre** used by Artist index.
- MusicBrainz collection preparation reports its current database stage, live elapsed time, animated activity, and scaled progress. Artist top genres are calculated in one grouped album pass so large libraries do not stall on repeated per-artist scans.
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

- Whitespace Anomalies is a three-step guided repair: choose the visible issue rows, preview exact field-level before/after changes, then apply the reviewed set.
- Every proposed row carries a high-confidence label and an explicit source-vs-local warning. The repair changes app-local SQLite only; MusicBee TSV rows and audio tags remain unchanged, so re-importing the same source can reintroduce the issue.
- Applying the cleanup compacts repeated whitespace in selected track metadata fields and affected album display fields, rebuilds search indexes, and creates a pre-fix SQLite backup.
- SQLite schema version 26 records repair counts, timestamps, status, backup path, and the exact field diffs in Fix history.
- One-click Undo creates a pre-undo safety backup and restores only the recorded fields. Undo stops with a conflict instead of overwriting a field changed after the repair.
- Validators without a deterministic safe fix remain report-only and guide the user back to MusicBee or audio-tag sources.

## Phase 12 Restore Features

- Settings lists available local SQLite backups from the app backup folder, including operation, timestamp, row counts, album counts, file size, and schema version when available.
- Restore is available only for readable backup files from the app backup folder with a supported schema version.
- Restoring asks for confirmation, creates a pre-restore safety backup of the active database, replaces the active SQLite database, refreshes app data, and reports restored track/album counts plus the safety-copy path.
- The restore path removes stale SQLite WAL sidecar files and reopens/migrates the restored database before returning success.

## Phase 11 US, UK, and Norwegian Chart Features

- Billboard year-end chart import in the Imports workspace from yearly CSV files such as `CSV_ALBUMS/1987.csv`.
- CSV matching requires `EOY Rank`, `Artist`, `Title`, `First Appearance`, and `First Appearance Week`; normalizes case/punctuation; resolves January/December ISO-year crossings; stores every imported chart row; links matched rows to library albums; and stores both the best rank and earliest chart debut when an album appears in multiple chart years.
- Billboard year-end singles import in the Imports workspace from yearly CSV files such as `CSV_SINGLES/1987.csv`.
- Official UK weekly album and singles imports from `CSV_ALBUMS_UK/` and `CSV_SINGLES_UK/` with `Year,ISO Week,Chart Date,Chart End Date,Rank,Last Week,Movement,Peak,Artist,Title,Weeks on Chart,Source URL,Item URL` headers. The importer retains every complete row from the 1952–2026 singles and 1956–2026 album datasets, matches normalized artist/title keys, and enriches the library with peak rank and earliest exact chart appearance.
- VG Lista weekly album and single imports from CSV files in `CSV_ALBUMS_NO/` and `CSV_SINGLES_NO/` with `Year,Week,Rank,Last Week,Movement,Artist,Title,Weeks on Chart,Source URL` headers. The combined album and single import controls select US, UK, and Norway by default.
- Ti i Skuddet weekly single imports from `CSV_TIISKUDDET_NO/` with `Year,ISO Week,Chart Date,Rank,Title,Artist,Score / Votes,Note,Chart Details,Source URL` headers. Ranged positions such as `11-14` retain their original text and use the leading position for matching, filters, and ordering.
- Norsktoppen weekly single imports from `CSV_NORSKTOPPEN_NO/` with `Year,ISO Week,Chart Date,Rank,Title,Artist,Points,Note,Chart Details,Source URL` headers. Raw ranged positions, points, exact dates, notes, details, and links are retained; 24 incomplete rows are reported and skipped, and declared year-boundary weeks are preserved.
- Singles CSV matching uses `Yearly Rank`, `Artist`, optional `Featured`, `Track`, and optional `Date Entered`; matches against library track `Display Artist` and `Title`; stores the best rank and earliest plausible chart-entry date independently across repeated chart years; accepts ISO and US slash dates plus historically qualified trailing-`+` dates; and reports malformed or missing source dates without inventing release dates.
- Album rows now carry Billboard ranks such as `#103 1987` plus first-appearance labels such as `Sep 1987 · Week 36` in Search, Charts, album details, and exports.
- Track rows carry compact Billboard singles badges and exact chart-entry dates in Search, Charts, Timeline, and exports, with separate Album Billboard, Single Billboard, and Single Billboard Debut columns for track exports.
- Matched album and track rows also carry Official UK and VG Lista peak ranks and first chart ISO weeks; every raw weekly UK and Norwegian row remains in a dedicated country-and-chart-type table so future weekly analysis does not depend on the summary fields.
- Search and Charts support Billboard, Official UK, VG Lista, and track-only Ti i Skuddet and Norsktoppen rank/debut ranges, sorting, columns, and ranking metrics. A nested **Chart filters** disclosure keeps every source inside the existing advanced drawer; optional columns label each chart explicitly.
- The standalone **Timeline** workspace provides **Albums through the years** and **Tracks through the years** with Billboard, Official UK, and VG Lista sources plus track-only Ti i Skuddet and Norsktoppen, built-in seasons, Christmas, New Year, full-year, custom month periods, fullscreen presentation, titled artwork cards, metric/custom ordering, canonical single-copy track selection, and exact playlist handoff. Luna Search, Chart, and Playlist Builder recipes understand all source-specific rank/debut fields, including prompts such as `Official UK singles that debuted in summer 1995`.
- The Tools workspace includes High-confidence missing MusicBrainz albums, Artists without MusicBrainz data, Missing Billboard Albums, and Missing Billboard Singles, which list trusted MusicBrainz album gaps, local artists without usable MusicBrainz cache/overlay data, and imported Billboard chart rows not linked to any library album or track. Overlapping album chart-year entries collapse to the earliest year; overlapping singles chart-year entries collapse to the best rank. If the chart-entry tables are empty after upgrading, selecting each Billboard tool prepares it from the default `CSV_ALBUMS/` or `CSV_SINGLES/` folder.
- SQLite schema version 10 adds persisted Billboard singles chart entries alongside nullable Billboard singles rank/year track fields; schema version 34 adds normalized `Date Entered` values, calendar/ISO-week fields, quality markers, and indexed track debut fields; schema version 35 adds raw and normalized source-album fields for canonical track matching; schema version 36 adds country-specific VG Lista weekly chart tables, match summaries, indexes, and saved source paths; schema version 37 adds Ti i Skuddet weekly entries, match summaries, indexes, and its saved source path; schema version 38 adds the equivalent Norsktoppen weekly entries, track summaries, indexes, and saved source path; schema version 39 adds Official UK weekly album and singles entries, matched-library summaries, indexes, and both saved UK source paths.

## Phase 10 Discovery Features

- **Your Daily Edition** turns Discovery into an editorial story front page sourced only from local evidence: 10-to-100-year owned-album anniversaries with up to five chart-ranked stories, synchronized ten-second cover rotation that restarts after era or thumbnail selection, exact MusicBrainz artist birthdays and memorials, an interactive owned-album chart shelf with Billboard year-end plus Official UK/VG-lista weekly source, year, week, and random snapshot controls, randomized Deep Cuts with one unrated, unloved, non-single track per highly rated album plus exact year, decade, genre, and refresh controls, and a randomized **Complete the Collection** shelf with Artists and Albums modes, exact year/decade/genre filters, MusicBrainz official-release gaps across the full eligible artist catalog, and owned albums that still contain unrated tracks. **Because You Played / Loved** mixes up to eight recent-rating or high-score/loved album anchors into six refreshable recommendations, prioritizes cached Last.fm related-album and similar-artist evidence, excludes every recent album and anchor artist, and only suggests albums with less than 50% of their tracks rated. Rating a track means it was played here, so conventional play counts are not required.
- Daily Editions are stored as dated SQLite snapshots: date controls revisit retained editions without reshuffling them, today can still be explicitly regenerated, and an inclusive rolling 90-day archive is pruned automatically. Upgrades create the snapshot store without inventing historical editions; the first post-upgrade visit saves that day's edition. Archived shelf controls and live **See all** explorers are locked so later library or chart imports cannot silently rewrite their evidence.
- Album-chart links are reconciled automatically after every MusicBee snapshot import and during the schema 55 upgrade, so the retained Billboard, Official UK, and VG-lista corpora remain connected to rebuilt local album rows. Chart Random only chooses populated owned periods; disabled selectors use a normal cursor rather than implying that the app is busy.
- Every compact shelf opens its underlying album, track, or artist and exposes concise evidence. Each shelf also has a paginated **See all** explorer that preserves the shelf's selection rules and explanation evidence: anniversary milestone and chart-source evidence filters; birthday/memorial filters; chart source/year/week controls; Deep Cuts and completion period/genre filters; Artist/Album completion modes; Played/Loved and Last.fm/genre connection filters; shelf-specific sorting; and local search. Returning restores the original Daily Edition scroll position and keyboard focus. The previous analytical Discovery tools and outside-library Luna workflow remain available under **More discovery tools**.
- Discovery workspace for exploration-oriented library views separate from Statistics.
- Completion heatmap with Top 12, 25, 50, and 100 genre-row presets; all-year and decade jumps; an exact dual-ended year range; genre include/exclude filters; and horizontally scrollable year columns. Rows are ranked by album population inside the selected range, and each populated cell opens its matching albums. The special `scores` genre group matches the same film, TV, animation, anime, and video-game score genres available in Search and Charts.
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
- Whitespace Anomalies includes guided preview/apply repair with exact diffs, confidence and source warnings, persistent fix history, and conflict-aware undo.
- Web-only preview mock data covers Tools alongside Search, Charts, Statistics, Albums, Artists, Genres, and Imports.

## Phase 7 Genres Features

- Genres workspace with a searchable, sortable, paginated canonical-genre index.
- Genre Timeline below the index with first/last release years observed in the local library, earliest/latest/longest-span summaries, genre search, exact year-window matching modes, minimum-album filtering, sorting, row limits, optional album/completeness/loved-track color encoding, and direct selection into the existing genre albums and detail views. Observed ranges are explicitly presented as library coverage rather than historical genre origins or endings.
- Genre-level summary stats for album counts, rating progress, year span, top artist, track totals, loved tracks, TMOE, average completeness, average album rating, and average Album Score.
- Selected genre album lists backed by normalized canonical-genre filtering.
- Genre album-list export to CSV, TSV, XLSX, JSON, and TXT with optional calculated columns.
- Web-only preview mock data covers Genres alongside Search, Charts, Statistics, Albums, Artists, and Imports.

## Phase 6 Artists Features

- Artists workspace with a searchable, sortable, paginated album-artist index.
- Artist Overview with five initially visible Last.fm Popular Tracks, Show more/Show less expansion to as many as ten locally owned matches, and a Similar Artists shelf split between locally owned artists and missing artists to explore, all with cached provider attribution and explicit refresh.
- Artist-level summary stats for album counts, rating progress, year span, top genre, track totals, loved tracks, TMOE, average completeness, average album rating, and average Album Score.
- Selected artist album lists backed by normalized artist-key filtering so casing differences do not split album lists.
- Selected-artist details are grouped into Overview, Local albums, Artist info, MusicBrainz discography, and Cover view tabs; Overview opens automatically, while MusicBrainz and cover/track data wait until their relevant tab is selected.
- The Cover view tab provides a clickable artist album cover board with inline track detail showing ratings, loved status, clock time, and Last.fm-backed 🔥 markers for the album's three most-listened tracks when evidence is available.
- Artist album-list export to CSV, TSV, XLSX, JSON, and TXT with optional calculated columns.
- Web-only preview mock data covers Artists alongside Search, Charts, Statistics, Albums, and Imports.

## Phase 5 Albums Features

- Albums workspace with a dedicated filterable, sortable, paginated album index and min/max rating-completeness range filtering.
- Selected albums load an attributed, refreshable CritiqueBrainz community review through exact MusicBrainz release-group identity, with durable positive/unavailable caching and stale-text fallback.
- Album pages show refreshable Last.fm Related Albums, split into locally owned albums and missing releases to explore, with visible tag and artist-relationship evidence.
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

- Statistics workspace with an aggregate-only Luna Library analyst plus library overview, health score, rating completion burndown, library shape by time, loved density, catalog concentration, duration analytics, aggregate outlier stats, decade progress timeline, genre portfolio matrix, a full origin-country Artists/Albums ranking with flags, metadata coverage, rating progress, genre progress, rating distributions, loved-track stats, import delta timeline, import history, and rating history dashboards. Year progress includes an exact dual-ended year range, decade jumps, canonical genre include/exclude filters with the `scores` group, oldest-first auto-growing results, and a fully rated album percentage for every year. Genre progress adds the same exact year and oldest-first decade controls, canonical include/exclude filters with `scores`, Top 12/25/50/100/all display counts, popularity/name sorting, an auto-growing result table, and the fully rated album percentage for every genre.
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
