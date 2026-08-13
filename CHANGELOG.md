# Changelog

## [0.133.0] - 2026-08-13
### Added
- Added dated SQLite snapshots for Daily Editions with older/newer navigation, a saved-date picker, a Today return action, restart persistence, and an inclusive rolling 90-day retention policy.

### Changed
- Today's generated shelf selection is now reused until an explicit refresh; archived editions remain immutable and lock live shelf controls and explorers so changed library or chart data cannot reshuffle their evidence.
- Added schema version 54 for snapshot storage, with a migration that starts saving editions on first post-upgrade use without fabricating historical dates.
- Synchronized app metadata and provider user agents to `0.133.0`.

### Fixed
- Fixed **Chart Toppers From…** retaining or randomly choosing a chart source with no owned matches, which could leave the shelf empty and the Year selector unusable.

## [0.132.0] - 2026-08-13
### Added
- Added a paginated **See all** explorer to every Daily Edition shelf, with shelf-specific filters and sorting for anniversaries, life events, charts, Deep Cuts, collection completion, and Played/Loved recommendations.
- Added visible per-result explanation evidence, anniversary selection reasons, direct album/artist/track navigation, stable seeded paging, and search within each shelf explorer.

### Changed
- Preserved the compact Daily Edition shelf layout while replacing the old Completion-only link with one consistent drill-down and restoring the exact originating shelf position and keyboard focus on return.
- Synchronized app metadata and provider user agents to `0.132.0`.

## [0.131.0] - 2026-08-12
### Added
- Added direct Album, Artist, and Genre navigation from the corresponding Search and Charts table cells, with visible link styling, keyboard focus, and descriptive accessible names.

### Changed
- Synchronized app metadata and provider user agents to `0.131.0`.

## [0.130.0] - 2026-08-12
### Added
- Added **Played** and **Loved** modes plus Refresh to the Discovery recommendation shelf, with up to six randomized albums mixed across as many as eight recent-rating or high-score/loved anchors.
- Added explainable cached Last.fm related-album and similar-artist matching with a canonical-genre fallback and visible source-album evidence on every recommendation.

### Fixed
- Stopped recently rated albums, albums with 50% or more tracks rated, and albums by any anchor artist from being recommended; this prevents nearly completed releases and same-artist floods from returning in **Because You Played**.
- Ignored rating-removal events when choosing recent listening anchors, so the shelf follows affirmative rating activity instead of treating deleted ratings as plays.

### Changed
- Replaced the single-album recommendation anchor with a mixed multi-album snapshot and synchronized app metadata and provider user agents to `0.130.0`.

## [0.129.0] - 2026-08-12
### Added
- Added API-derived Last.fm Related Albums to Album pages using shared album tags plus similar-artist evidence, with separate **In your library** and **Explore** groups, local navigation, provider links, explicit refresh, and responsive layouts.
- Added SQLite schema version 53 for cached related-album snapshots and MusicBrainz-MBID-first local matching with normalized artist-and-title fallback and stale-result recovery.

### Changed
- Synchronized app metadata and provider user agents to `0.129.0`.

## [0.128.0] - 2026-08-12
### Added
- Added a Last.fm Similar Artists shelf to Artist Overview with relationship scores, separate **In your library** and **Explore** groups, local Artist navigation, provider links, and responsive light/dark layouts.
- Added SQLite schema version 52 for cached directed artist relationships, with MusicBrainz-MBID-first local matching, normalized-name fallback, provider cache handling, and stale-result fallback.

### Changed
- Documented rating events as listening evidence for future Discovery recommendations: rating a track means it was played, so conventional play counts are not required.
- Synchronized app metadata and provider user agents to `0.128.0`.

## [0.127.0] - 2026-08-12
### Added
- Added Artists and Albums modes to **Complete the Collection**, with five randomized suggestions, Refresh, and exact year, decade, and genre filters.
- Added album-completion suggestions for owned albums that still contain unrated tracks, including progress, tracks remaining, and direct album navigation.

### Fixed
- Fixed the artist-completion shelf incorrectly appearing empty after a successful MusicBrainz sync by removing the premature 36-artist limit and checking every well-represented artist across all app-owned MBID sources and cached official album groups.

### Changed
- Artist completion filters now apply the selected period to missing official album release years and the genre to the artist's owned catalog footprint.
- Renamed the shelf and contents-rail entry from **Complete the Artist** to **Complete the Collection**.
- Synchronized app metadata and provider user agents to `0.127.0`.

## [0.126.0] - 2026-08-12
### Added
- Added Deep Cuts period and genre filters with exact year, decade, and canonical genre choices, plus a Refresh action that preserves the active filters.

### Changed
- Deep Cuts now randomizes whenever Discovery opens or refreshes and shows at most one unrated, unloved, non-single track per highly rated album, preventing one release from taking over the shelf.
- Deep Cut rows now explain their release year and genre, and the shelf reports both the randomized four-track display and the full matching album pool.
- Synchronized app metadata and provider user agents to `0.126.0`.

## [0.125.1] - 2026-08-12
### Fixed
- Made the Discovery memorial-date regression test follow the runner's active locale instead of assuming day-first formatting, restoring Windows release builds.
- Gave the full two-turn natural-language interaction test enough time under parallel release-suite load, preventing an unrelated intermittent timeout.

## [0.125.0] - 2026-08-12
### Added
- Added interactive source, year, and week selectors to **Chart Toppers From…**, plus a Random action that chooses a populated snapshot from the owned catalog.
- Added exact album-chart snapshot queries for Billboard year-end, Official UK weekly, and VG-lista weekly imports, including source-specific available years and weeks.

### Fixed
- Removed singles from the album chart shelf and stopped matching one week number across unrelated years, so every displayed rank now belongs to the visible source and period.
- Labeled Billboard accurately as a year-end chart without a fabricated weekly selector.

### Changed
- Synchronized app metadata and provider user agents to `0.125.0`.

## [0.124.1] - 2026-08-12
### Fixed
- Fixed anniversary autoplay remaining paused after a thumbnail click or milestone selection; each interaction now starts a fresh ten-second cycle and keeps the cover, story copy, active thumbnail, and progress indicator synchronized.
- Paused the anniversary timer only while replacement milestone data is loading, then restarted it for the new era.

### Changed
- Synchronized app metadata and provider user agents to `0.124.1`.

## [0.124.0] - 2026-08-12
### Added
- Added separate **Birthdays** and **Memorials** tabs to the Daily Edition Today panel, each showing up to five locally represented artists whose MusicBrainz birth or death date matches today.
- Added functional contents-rail navigation that smoothly scrolls, moves keyboard focus, updates the active marker, and briefly flashes the selected story shelf.

### Changed
- Removed the inert **View all birthdays & memorials** link and compacted the life-event rows to fit five artists without hiding the surrounding edition.
- Synchronized app metadata and provider user agents to `0.124.0`.

## [0.123.0] - 2026-08-12
### Added
- Added an anniversary carousel with up to five owned albums, automatic ten-second rotation, direct artwork thumbnails, hover/focus pause behavior, and reduced-motion support.
- Added a 10-to-100-year anniversary selector backed by a focused local query, so changing the milestone replaces only the anniversary stories.
- Added explainable anniversary selection evidence from imported Billboard, Official UK, and VG-lista album matches.

### Changed
- Anniversary albums now rank by best imported album-chart position, then number of matched chart sources; local Album Score and loved tracks break ties and fill any remaining carousel slots.
- Removed the inert additional-anniversary count and synchronized app metadata and provider user agents to `0.123.0`.

## [0.122.0] - 2026-08-12
### Added
- Added the editorial **Your Daily Edition** Discovery front page with owned-album 50-year anniversaries, exact MusicBrainz artist birthdays and memorials, locally matched weekly chart stories, deep cuts, artist collection gaps, and rating-anchored recommendations.
- Added explicit per-story evidence, responsive editorial shelves, direct album/track/artist/Completion navigation, web-preview story fixtures, and focused frontend and SQLite coverage.

### Changed
- Discovery now treats recent rating activity and loved tracks as listening evidence without requiring play counts; the previous dashboard and outside-library workflow remain available under **More discovery tools**.
- Removed the redundant Discovery details sidebar because the edition includes its own story index.
- Synchronized app metadata and provider user agents to `0.122.0`.

## [0.121.0] - 2026-08-11
### Added
- Added **Owned MusicBrainz special releases** to Tools for positively matched local `Album + Compilation`, `Album + Compilation + Live`, `Album + Interview`, `Album + Live`, `EP`, `EP + Compilation`, `EP + Compilation + Live`, and `EP + Live` release groups that are absent from the pure Album list.
- Added a contextual **MusicBrainz type** result/export column with combined type labels when one local title matches multiple selected release-group categories.

### Changed
- MusicBrainz collection preparation now retains selected primary and secondary release-group types, keeps pure-album comparisons isolated, and prefers refreshed data independently for Album and EP so cached EPs remain available for older overlays.
- Selected-artist MusicBrainz refreshes now fetch both Album and EP release groups.
- Synchronized app metadata and provider user agents to `0.121.0`.

## [0.120.0] - 2026-08-11
### Added
- Added **Loved Tracks** and **Chart Busters** tabs to Artist pages with deferred local loading and responsive oldest-first track lists.
- Added one-row-per-song chart histories across Billboard Hot 100, Official UK Singles, VG-lista, Ti i Skuddet, and Norsktoppen, including source-priority summaries, expandable secondary charts, entry/end dates, weeks, peaks, and alternate sorting.

### Changed
- Scoped artist chart aggregation to the selected artist's indexed track cohort before reading weekly chart histories.
- Synchronized app metadata and provider user agents to `0.120.0`.

### Fixed
- Popular Tracks preview rows now use stable rank-qualified React keys when one fallback track represents multiple mock positions.

## [0.119.0] - 2026-08-11
### Added
- Added attributed Album Review panels to the Albums workspace using exact MusicBrainz release-group identity and openly licensed CritiqueBrainz community reviews.
- Added contributor, rating, language, per-review Creative Commons license, source links, explicit refresh, long-text expansion, unavailable states, and stale-cache fallback.
- Added schema version 51 with 30-day available-review caching and seven-day unavailable-result caching.

### Changed
- Synchronized app metadata and provider user agents to `0.119.0`.

## [0.118.0] - 2026-08-11
### Added
- Added Show more/Show less controls to Artist Overview Popular Tracks, keeping the initial five-row summary while allowing up to ten locally owned Last.fm matches.

### Changed
- Increased the Artist Overview popularity response from five to ten locally matched tracks.
- Synchronized app metadata and provider user agents to `0.118.0`.

### Fixed
- Last.fm artist popularity now retries a MusicBrainz-ID lookup with the library artist name and provider autocorrection when the ID lookup fails, returns no tracks, or produces no owned-track matches, covering display-name differences such as `KISS` and `Kiss`.
- Artist biographies now fall back from a missing or unusable saved MusicBrainz identity to one exact, case-insensitive, score-100 MusicBrainz artist-name match before resolving Wikidata and Wikipedia, while rejecting ambiguous matches.

## [0.117.0] - 2026-08-11
### Added
- Added an Artist Overview biography panel resolved through verified MusicBrainz links, Wikidata sitelinks, and Wikipedia summaries, with explicit refresh, expand/collapse, source links, and CC BY-SA attribution.
- Added schema version 50 with durable artist biography caching, separate positive and unavailable refresh windows, and stale-text fallback when a provider refresh fails.

### Changed
- Serialized MusicBrainz API calls behind the provider's application-wide one-request-per-second limit.
- Synchronized app metadata and provider user agents to `0.117.0`.

## [0.116.0] - 2026-08-11
### Added
- Added an Artist Overview with up to five locally owned tracks matched against Last.fm `artist.getTopTracks`, explicit refresh, cached/stale states, and visible provider attribution.
- Added Last.fm-backed 🔥 markers for the three album tracks with the strongest positive listener evidence in Albums and Artist Cover View.
- Added schema version 49 with durable artist and normalized track popularity caches that survive MusicBee track-table rebuilds.

### Changed
- Expanded the Last.fm provider settings from portrait-only enrichment to popularity metadata and portrait caching.
- Synchronized app metadata and provider user agents to `0.116.0`.

## [0.115.0] - 2026-08-11
### Added
- Added selected-place Luna questions to Music Map, using exact local country or MusicBrainz area cohorts with bounded current-view inspection and an explicit place label.

### Changed
- Discovery, Playlist Builder, Statistics, and Music Map now keep their large Luna controls in the same collapsed **Luna commands** area used by Search and Charts, while launched commands still open automatically.
- Synchronized app metadata and provider user agents to `0.115.0`.

## [0.114.0] - 2026-08-11
### Added
- Added a read-only Music Doctor connector with a configurable database path, manual synchronization, five-minute background checks for completed scans, source/format/bitrate status, and an app-owned quality cache keyed by Unicode-normalized full file paths.
- Added Music Doctor bitrate and mixed-quality fields to Album and Search results, bitrate range and mixed-quality filters, and quality sorting.
- Added Music Tools reports for audio below 320 kbps, albums with mixed bitrate quality, Music Doctor audio not present in the imported library, and empty/missing/unreadable files.

### Changed
- Upgraded the app database to schema version 48 for Music Doctor sync history, matched track and album quality summaries, unmatched audio, file issues, and aggregate format/bitrate statistics.
- Synchronized app metadata and provider user agents to `0.114.0`.

## [0.113.2] - 2026-08-03
### Changed
- Synchronized app metadata and provider user agents to `0.113.2`.

### Fixed
- Statistics country rankings now replace code-only stored names with canonical English country names in row labels, sorting, flag titles, and accessible descriptions.

## [0.113.1] - 2026-08-03
### Changed
- Synchronized app metadata and provider user agents to `0.113.1`.

### Fixed
- Search now displays library track and album totals as soon as library status loads, without waiting for Statistics or MusicBrainz startup requests.
- Reworked country catalog statistics around a normalized album-artist index and a single pre-aggregated album scan, preventing large libraries from stalling startup with repeated full album scans.

## [0.113.0] - 2026-08-02
### Added
- Added a responsive **Countries in your library** horizontal bar chart to Statistics, with Artists and Albums views, descending country rankings, direct counts, country names, and flags for every stored origin country.

### Changed
- Statistics now calculates current-library artist and album totals for all stored MusicBrainz origin countries in one local aggregate query, retaining zero-count countries at the end of the chart.
- Synchronized app metadata and provider user agents to `0.113.0`.

## [0.112.5] - 2026-08-02
### Changed
- Synchronized app metadata and provider user agents to `0.112.5`.

### Fixed
- Made canonical artist keys Unicode-aware so artists with uppercase non-ASCII letters, including **Östro 430**, load their local albums correctly from Artist details.

## [0.112.4] - 2026-08-02
### Changed
- MusicBrainz collection validators now show named preparation stages, animated activity, live elapsed time, and a continuously updated progress treatment while long scans run.
- Synchronized app metadata and provider user agents to `0.112.4`.

### Fixed
- Replaced the **Artists without MusicBrainz data** Top Genre correlated album scan with a single grouped pass, avoiding prolonged 50% preparation stalls on large libraries.

## [0.112.3] - 2026-08-02
### Changed
- Renamed the **Artists without MusicBrainz data** export's **Genre** column to **Top Genre** and populated it with the same artist-level album genre used by Artist index.
- Synchronized app metadata and provider user agents to `0.112.3`.

## [0.112.2] - 2026-08-02
### Changed
- The Completion Artists **Unverified** view now keeps its membership and ordering fixed while verification results update row statuses and actions in place; an explicit chart scan, source/year change, or view re-entry rebuilds the filtered snapshot.
- Synchronized app metadata and provider user agents to `0.112.2`.

### Fixed
- Prevented completed artist verification from removing the active artist or moving the Artist Queue back to the top, including failed lookups that need another verification attempt.

## [0.112.1] - 2026-08-02
### Added
- Added an **Unverified** Show filter to Completion's Artists queue so it can be limited to artists that have not entered verification or another review state.

### Changed
- Synchronized app metadata and provider user agents to `0.112.1`.

## [0.112.0] - 2026-07-31
### Added
- Added an **Artists** view to Updates with full-history artist rollups, separate track-added/removed and album-added/removed impact, filtering, pagination, and direct links to each Artists page.
- Added a dedicated **New artists** section that records true first appearances and their added dates without treating a new album for an existing artist as a new artist.

### Changed
- Library import history now records the track count on new and removed album events so future artist rollups can report exact track impact; older events remain album-count-only when their track total was not recorded.
- Synchronized app metadata and provider user agents to `0.112.0`.

## [0.111.3] - 2026-07-31
### Changed
- Changed Search's **Make a Playlist** action to create a populated local draft immediately from the current filters and ordering without calling Luna, while keeping natural-language Playlist Builder and insight-cohort planning unchanged.
- Raised the saved/exported playlist limit to 500 tracks for direct Search playlists while retaining Luna's 200-track planning cap.
- Synchronized app metadata and provider user agents to `0.111.3`.

## [0.111.2] - 2026-07-31
### Added
- Added a **Make a Playlist** action to the Search sidebar that carries the complete current album or track search into Playlist Builder as a locked local source instead of limiting the playlist to the visible page.

### Changed
- Synchronized app metadata and provider user agents to `0.111.2`.

## [0.111.1] - 2026-07-31
### Changed
- Synchronized app metadata and provider user agents to `0.111.1`.

### Fixed
- Reconciled Completion's **Wanted** count and Artist Discovery's **In Wish List** labels with live Wish List rows, so deleting albums or artists immediately clears orphaned wanted state, including stale decisions saved by earlier versions.

## [0.111.0] - 2026-07-30
### Added
- Added Ti i Skuddet and Norsktoppen singles evidence to Completion → Artist Discovery.

### Changed
- Split the Artist Discovery chart filter into individual album and singles options for Billboard, Official UK, and VG Lista, with dedicated Ti i Skuddet and Norsktoppen options.
- Synchronized app metadata and provider user agents to `0.111.0`.

### Fixed
- Ignored the trailing Norwegian `[NO]` chart marker when matching and displaying Artist Discovery candidates, preventing false missing artists such as `The Act [NO]`.

## [0.110.1] - 2026-07-30
### Changed
- Added a small square album-cover marker to every Career Peaks summit and replaced native text tooltips with the shared 300×300 cover preview labeled with album title and year.
- Restyled the artist, genre, year, and display-size filters as compact framed controls consistent with the Genre timeline.
- Synchronized app metadata and provider user agents to `0.110.1`.

### Fixed
- Restored readable Career Peaks year labels and filter borders in the dark theme by defining the timeline's missing local color tokens and explicit SVG text colors.
- Moved the selected-artist summary into a dedicated side rail so it no longer covers late-year peaks or album markers.

## [0.110.0] - 2026-07-30
### Added
- Added the Career Peaks artist timeline with circular artist portraits, album-derived peak shapes, selected album covers, an overview strip, focused-artist dimming, artist add/remove controls, include/exclude genre filters with the `scores` umbrella, editable year bounds, and Top 7/12/20 views.
- Added separate **Charts** and **My Scores** peak modes. Chart peaks weight Billboard and Official UK equally at 42% each, with VG Lista contributing the remaining 16%; My Scores derives each peak from the user's saved Album Score.
- Added optional Last.fm artist-image enrichment in Settings → Providers, including secure Windows Credential Manager storage for the API key, explicit 50-artist sync batches, local image caching, retryable failures, and shared portraits in Career Peaks, Artist Index, and Artist detail views.

### Changed
- Replaced the Timelines workspace's Artists placeholder with the complete Career Peaks experience and synchronized app metadata and provider user agents to `0.110.0`.
- Added representative album-cover and artist-initial fallbacks so artist portraits remain useful without a Last.fm key or network access.

## [0.109.0] - 2026-07-30
### Added
- Added a luminous Genre constellation to the Timelines workspace with real album-dot clouds, density contours, Dots/Density modes, focused-genre highlighting, overview strip, per-genre summaries, include/exclude filters, the Scores umbrella, editable year bounds, and Top 7/12/20 views.
- Added Charts, Genres, and Artists timeline tabs, with Artists clearly marked as a later follow-up.

### Changed
- Moved the genre timeline out of the Genres workspace and renamed the main Timeline navigation destination to Timelines.
- Synchronized app metadata and provider user agents to `0.109.0`.

## [0.108.2] - 2026-07-30
### Changed
- Synchronized app metadata and provider user agents to `0.108.2`.

### Fixed
- Fixed unreadable Timeline Order menu choices by giving the native dropdown an explicit dark palette with high-contrast option text.

## [0.108.1] - 2026-07-30
### Changed
- Made artist names in the Updates ledger and selected-change details open the Artists workspace with the matching normalized artist selected.
- Synchronized app metadata and provider user agents to `0.108.1`.

### Fixed
- Fixed unreadable Type and Time dropdown options in the Updates workspace by giving native light- and dark-theme option menus explicit high-contrast colors.

## [0.108.0] - 2026-07-30
### Added
- Added native PAR2 verification and repair for Usenet releases, including installed `par2cmdline-turbo` detection, dedicated verifying/repairing transfer states, and live readiness details in provider settings.
- Added selective recovery-volume downloads that try the smallest PAR2 volume first and stop as soon as repair succeeds.

### Changed
- Preserved sparse partial payloads and PAR2 data after failed downloads so retries of the same NZB can reuse recovery staging; clearing finished transfers now also removes that retained staging.
- Treated unavailable optional Usenet metadata separately from missing payload segments and synchronized app metadata and provider user agents to `0.108.0`.

### Fixed
- Prevented missing `.nfo` and similar optional articles from aborting otherwise usable downloads, and repaired missing or checksum-failed payload segments before RAR extraction or final delivery.

## [0.107.0] - 2026-07-30
### Added
- Added a standalone Updates workspace with searchable, date-filtered, and status-filtered album change history, semantic new/changed/removed/rating icons and colors, old/new value details, and import provenance.
- Added the append-only SQLite `library_updates` ledger in schema version 45 so meaningful album, metadata, track-count, and rating changes survive later library imports.

### Changed
- Reconciled regenerated MusicBee album IDs through an unambiguous normalized artist/title/year fallback, preventing full rescans from appearing as mass album removals and additions while leaving duplicate-edition matches safely unresolved.
- Synchronized app metadata and provider user agents to `0.107.0`.

## [0.106.0] - 2026-07-30
### Added
- Added manual per-release Usenet search actions and inline NZB results to artist Wish List discovery.

### Changed
- Changed artist Wish List discovery to search only Deemix initially; Soulseek and Usenet searches now run only when their button is selected on a release.
- Synchronized app metadata and provider user agents to `0.106.0`.

## [0.105.0] - 2026-07-30
### Added
- Added secure Usenet provider settings with a Prowlarr default of `http://127.0.0.1:9696`, Newsgroup Ninja defaults for encrypted port 563, configurable connection count and download folder, live connection tests, and Windows Credential Manager storage for both provider secrets.
- Added Prowlarr Audio-category NZB search to album wishes with title-match ranking, age, indexer, size, grab count, and category details.
- Added a native multi-connection NNTP downloader with TLS authentication, persistent transfer status, yEnc decoding and CRC validation, safe staging, collision-free album folders, installed-UnRAR discovery, automatic RAR verification/extraction, and readable failure reporting for unavailable or incomplete posts.

### Changed
- Expanded Settings → Providers and Wish List transfer feedback to treat Usenet as a first-class search and download source alongside Deemix and Soulseek.
- Synchronized app metadata and provider user agents to `0.105.0`.

## [0.104.2] - 2026-07-29
### Changed
- Synchronized app metadata and provider user agents to `0.104.2`.

### Fixed
- Fixed intermittent Deemix track failures by renewing expiring Deezer track tokens and following Deezer's bounded alternate track-source chain when the first media token is rejected.
- Preserved the configured download-quality policy across alternate sources, so exact MP3 320/FLAC requests remain exact and lower-quality substitution still requires **Quality fallback**.

## [0.104.1] - 2026-07-29
### Added
- Added a direct MusicBrainz artist-page link to every candidate in Artist Discovery's manual identity review, while preserving **Check identity** as a separate verification action.
- Added **Clear completed** to the Wish List Soulseek transfer history so finished releases can be dismissed without deleting downloaded files.

### Changed
- Synchronized app metadata and provider user agents to `0.104.1`.

### Fixed
- Preserved the selected artist and Artist Queue scroll position when a verification result refreshes the candidate data for manual review.
- Kept newly searched artist albums above the persistent Soulseek transfer history instead of forcing users to scroll past old downloads.

## [0.104.0] - 2026-07-29
### Added
- Added live release-level Soulseek feedback directly beneath the selected Wish List source, including local queue and peer queue distinction, file and byte progress, speed, ETA, transfer-slot use, completion, pause, retry, and failure states.
- Added readable per-file Soulseek transfer activity so the background queue explains whether each file is waiting for an app slot, requesting a peer, remotely queued, connecting, downloading, completed, paused, retrying, or failed.

### Changed
- Added an interactive Soulseek transfer simulation to the browser preview so queued and downloading states can be visually tested without the native runtime.
- Synchronized app metadata and provider user agents to `0.104.0`.

## [0.103.1] - 2026-07-29
### Fixed
- Fixed Wish List Soulseek searches being rejected before reaching the network by generating session identifiers that satisfy the native client's validation contract.

### Changed
- Synchronized app metadata and provider user agents to `0.103.1`.

## [0.103.0] - 2026-07-29
### Added
- Added automatic Soulseek searches to artist Wish List discovery so every still-missing MusicBrainz album receives peer release-folder options alongside its Deemix match.
- Added inline per-album Soulseek waiting, searching, source, empty, error, retry, and queued-download states, with six-search concurrency that preserves two native search slots for other app activity.

### Changed
- Renamed artist download actions to identify Deemix explicitly and kept **Download all with Deemix** as the bulk-provider action while Soulseek remains a deliberate per-source choice.
- Synchronized app metadata and provider user agents to `0.103.0`.

## [0.102.0] - 2026-07-29
### Added
- Added an in-process native Soulseek client, adapted from the standalone Forever client, with secure account storage, automatic reconnect, live peer search, persistent release downloads, queue progress, file verification, retry support, and direct Wish List integration.
- Added **Search with Soulseek** to album wishes. Results are grouped into peer release folders, ranked by free slots, track count, speed, and queue length, and can be queued as complete multi-file releases without launching another application.
- Added opt-in Soulseek sharing under **Settings → Providers**, including native folder selection, enabled/disabled shared roots, bounded local indexing, manual rescans, upload-slot controls, live upload totals, and peer upload handling.

### Changed
- Expanded provider settings and Wish List download feedback to show Soulseek connection, source quality, queue, transfer, and sharing state alongside the existing Deemix workflow.
- Kept Soulseek passwords in Windows Credential Manager and made sharing explicit per folder; credentials, peer addresses, and remote share lists are excluded from SQLite and app backups.
- Synchronized app metadata and provider user agents to `0.102.0`.

## [0.101.0] - 2026-07-29
### Added
- Added independent **Charts**, **From**, and **To** filters to Library Completion Workbench and Artist Discovery, including Billboard, Official UK, and VG Lista source scopes.
- Added clear-filter actions and synchronized Coverage Atlas campaign filters so the active chart and decade remain visible when a cohort opens in Workbench.

### Changed
- Moved album and artist source/year filtering into the backend query path before the normal 5,000-row display cap, while preserving complete Coverage Atlas decade campaigns.
- Collapsed Artist Discovery provenance into one aggregate row per chart and chart type, combining peak rank, appearances, and first/last chart years even when imported rows carry equivalent raw artist keys.
- Synchronized app metadata and provider user agents to `0.101.0`.

### Fixed
- Fixed low-contrast native **Show** and **Charts** dropdown menus in the dark Library Completion theme by explicitly styling popup options and selecting the correct browser color scheme.

## [0.100.0] - 2026-07-29
### Added
- Added **Artist discovery** inside Library Completion, combining missing artists from Billboard, Official UK, and VG Lista album and singles charts while excluding normalized album artists, track album artists, and track artists already in the imported library.
- Added a persistent, restart-safe artist verification queue with selection, progress, ETA, pause/resume, failed-check retry, per-provider activity, cached results, and manual MusicBrainz identity review.
- Added exact MusicBrainz artist verification with cached official studio-album release groups, plus independent Discogs corroboration through accepted studio-album masters.
- Added an explicit **Add artist to Wish List** handoff that creates or refreshes the existing Artist Wish List item with its verified missing official-album summary.

### Changed
- Added explicit MusicBrainz and Discogs outcome badges, album/singles provenance, local-absence evidence, official-album counts, and provider guidance to the artist dossier.
- Advanced SQLite to schema version 44 and synchronized app metadata and provider user agents to `0.100.0`.

### Fixed
- Prevented a paused artist verification batch from repeatedly restarting its idle worker.
- Added migration regression coverage proving that the schema 44 upgrade preserves every imported album and singles chart table.

## [0.99.0] - 2026-07-29
### Added
- Added Phase 2C on-demand cover enrichment for verified Library Completion albums: MusicBrainz confirmations use Cover Art Archive release-group artwork, while Discogs confirmations use the primary master image.
- Added independent persisted artwork states, local image caching, trusted-provider URL and content limits, cover retrieval after restart, and visible find, retry, unavailable, failed, and cached states in the candidate dossier.

### Changed
- Replaced ambiguous MusicBrainz and Discogs ledger labels with explicit per-provider badges for not checked, queued, checking, verified, no exact match, multiple matches, and failed outcomes.
- Advanced SQLite to schema version 43 and synchronized app metadata and provider user agents to `0.99.0`.

### Fixed
- Kept cover enrichment isolated from album verification so a missing or temporarily unavailable image cannot change a confirmed studio-album result.
- Extended the provider-schema migration regression to prove that all eight imported chart tables retain their rows while upgrading through the Discogs and cover-enrichment schemas.
- Fixed Wish List Deemix jobs failing before audio download when Deezer omits artwork; the album now downloads and receives all non-picture tags, completes successfully, and shows a non-blocking artwork warning.

## [0.98.1] - 2026-07-29
### Fixed
- Fixed Discogs credential testing and album lookup when the database search response encodes its `year` field as a JSON string instead of a number.
- Restricted the schema 41 to 42 upgrade to one transaction that only adds the Discogs verification columns, with regression coverage proving that all eight imported chart tables retain their rows.

### Changed
- Synchronized app metadata and provider user agents to `0.98.1`.

## [0.98.0] - 2026-07-29
### Added
- Added Discogs as a rate-limited fallback when MusicBrainz returns no exact album match or an ambiguous result, with exact master matching and conservative accepted-Album classification that rejects live, compilation, EP, single, mixtape, DJ-mix, bootleg, and unofficial markers.
- Added secure Discogs Consumer Key and Secret validation, Windows Credential Manager storage, connection testing with request-limit status, credential replacement, and removal under **Settings → Providers**.
- Added separate MusicBrainz and Discogs evidence, Discogs master identifiers, active-provider queue feedback, Discogs verification counts, and a **Try fallback** path for existing MusicBrainz no-match rows.

### Changed
- Advanced SQLite to schema version 42 and synchronized app metadata to `0.98.0`.
- Verification queue estimates now allow for the slower three-request Discogs master/key-release classification path while keeping MusicBrainz as the primary verifier.

## [0.97.1] - 2026-07-29
### Changed
- Completed verification runs now explain that **Verified** means MusicBrainz confirmed an official studio album, provide a **Review verified** filter, and expose a direct **Add to Wanted** action in the candidate dossier.
- Coverage Atlas campaign badges now distinguish the complete loaded cohort from albums still awaiting verification and albums already verified.
- Synchronized app metadata to `0.97.1`.

### Fixed
- Preserved the selected candidate and its list position while verification completion refreshes the Workbench instead of resetting the queue to its first album.
- Explicit album and multi-selection verification now searches the complete local candidate set rather than only the globally loaded top 5,000 rows, eliminating false “already checked” errors for albums opened through larger Atlas cohorts.

## [0.97.0] - 2026-07-29
### Added
- Added a persistent, single-worker MusicBrainz verification queue for individual albums, selected Workbench rows, and complete Coverage Atlas cohorts.
- Added locally cached verification outcomes, resumable queue batches, restart recovery, progress and ETA reporting, pause/resume controls, and failed-item retry.
- Added **Verified missing** Coverage Atlas counts and explicit candidate states for queued, checking, verified, no-match, ambiguous, and failed checks.

### Changed
- MusicBrainz requests in the Library Completion and Wish List verification path now share a 1.1-second request gate, and automatic verification requires one exact normalized artist/title match before official-release validation.
- Verification remains separate from Wanted: background checks never add an album to the acquisition queue without an explicit user decision.
- Advanced SQLite to schema version 41 and synchronized app metadata to `0.97.0`.

## [0.96.1] - 2026-07-29
### Changed
- Library Completion now labels chart-derived rows as unverified until MusicBrainz confirms a pure primary Album release group with at least one official release; live albums and compilations are excluded from MusicBrainz album choices.
- Improved dark-theme contrast and type sizing throughout the Candidate Queue, Provenance Ledger, provider results, and supporting metadata.

### Fixed
- Coverage Atlas campaigns now fetch the complete selected chart-source and decade cohort from SQLite instead of filtering the globally capped 5,000-row queue, so the Workbench open count reconciles with the Atlas cell.
- MusicBrainz album checks now use structured title and artist fields, rank matches near the chart year, and keep visible found, empty, error, retry, and verified states after the request completes.
- Synchronized app metadata to `0.96.1`.

## [0.96.0] - 2026-07-29
### Added
- Added the **Library Completion** command centre, which scans local Billboard 200, Official UK Albums, and VG Lista album entries against the imported library and merges repeated chart evidence into a prioritized missing-album queue.
- Added a practical candidate Workbench with local-absence evidence, on-demand MusicBrainz verification, persistent **Wanted**, **Needs review**, and **Not for me** decisions, Wish List handoff, and Deemix availability searches for wanted albums.
- Added the **Coverage Atlas** as a first-class view of owned and missing chart albums by source and decade; any cell can start a focused Workbench campaign.

### Changed
- Advanced SQLite to schema version 40 for persistent Library Completion decisions and synchronized app metadata to `0.96.0`.
- Reserved Discogs verification as an explicit next-phase provider instead of making automatic network requests during local chart scans.

## [0.95.1] - 2026-07-28
### Changed
- Synchronized app metadata to `0.95.1`.

### Fixed
- Kept the track-only Ti i Skuddet and Norsktoppen source cards visible in Album Search and Charts, with a clear one-click switch to Tracks, so the singles filters no longer appear to have disappeared.
- Increased the chart-source card minimum width so rank and debut controls remain contained when the expanded source list wraps across rows.

## [0.95.0] - 2026-07-28
### Added
- Added Official UK weekly album imports from 71 annual CSV files in `CSV_ALBUMS_UK`, preserving 278,293 chart rows from 1956 through 2026 with exact dates, rank movement, peak and weeks-on-chart details, source links, and item links.
- Added Official UK weekly singles imports from 75 annual CSV files in `CSV_SINGLES_UK`, preserving 298,194 chart rows from 1952 through 2026 and selecting one canonical matching library track per charted recording.
- Added Official UK peak-rank and debut-week filters, missing-data checks, sorting, optional columns, ranking metrics, album and track Timeline sources, and Luna Search, Charts, and Playlist Builder support.

### Changed
- Expanded the combined album and singles imports with independently selectable Official UK sources enabled by default; one source failure does not stop the other selected chart imports.
- Added automatic sibling-path expansion for the UK chart folders, ignored all large local chart datasets in Vite development watching, and synchronized app metadata to `0.95.0`.
- Advanced SQLite to schema version 39 with saved UK source paths, dedicated weekly album and singles tables, matched-library summary fields, and rank/debut indexes.

## [0.94.0] - 2026-07-28
### Added
- Added track-only Norsktoppen imports from 36 annual CSV files in `CSV_NORSKTOPPEN_NO`, retaining 22,888 valid weekly rows in a dedicated SQLite table with raw ranged ranks, points, notes, chart details, source links, and exact chart dates.
- Added Norsktoppen best-rank and debut-week filters, missing-data checks, sorting, optional columns, chart ranking metrics, and a dedicated Track Timeline source.
- Added Norsktoppen support to Luna Search, Charts, and Playlist Builder for source-specific presence, rank, debut week, missing data, sorting, and ranking requests.

### Changed
- Expanded the combined singles import to select Billboard, VG Lista, Ti i Skuddet, and Norsktoppen independently, with all four sources selected by default.
- Added Norsktoppen to the nested track-only chart-filter groups in Search and Charts and synchronized app metadata to `0.94.0`.
- Advanced the SQLite schema to version 38 for the Norsktoppen source path, weekly entry table, track summary fields, and indexes.

### Fixed
- Preserved Norsktoppen's declared chart year/week for historical year-boundary rows such as `1988-W53` while retaining the exact source chart date, instead of failing the complete import on the source inconsistency.
- Norsktoppen album Timeline and Luna requests are rejected as singles-only rather than being mapped to another chart source.

## [0.93.1] - 2026-07-28
### Changed
- Renamed the generic Search and Charts `Single` labels to **Billboard single** so the source is distinct from VG Lista and Ti i Skuddet.
- Synchronized app metadata to `0.93.1`.

### Fixed
- Added the missing **Billboard single** Search table-column control and made the column fully optional in Tracks mode.

## [0.93.0] - 2026-07-28
### Added
- Added Ti i Skuddet weekly singles imports from `CSV_TIISKUDDET_NO`, preserving all valid source rows in a dedicated SQLite table while enriching matched tracks with best rank and first chart week.
- Added track-only Ti i Skuddet rank and debut-week filters, sorting, columns, chart rankings, Timeline source selection, and Luna Search/Chart/Playlist query fields.

### Changed
- Grouped Billboard, VG Lista, and Ti i Skuddet controls into a nested **Chart filters** disclosure inside Search's **Advanced filters** and Charts' **Advanced chart controls** so more chart sources can be added without expanding the primary filter layout.
- Expanded the combined singles import to select Billboard, VG Lista, and Ti i Skuddet independently, with all three selected by default.
- Bumped SQLite schema to version 37 and synchronized app metadata to `0.93.0`.

### Fixed
- Stabilized the authenticated Deemix gateway mock so its request assertions cannot reset the local connection during parallel Rust test runs.

## [0.92.2] - 2026-07-28
### Changed
- Extended Luna's structured query plan with VG Lista rank, debut-week, missing-data, sorting, and chart-ranking fields.
- Synchronized app metadata to `0.92.2`.

### Fixed
- Fixed Luna interpreting an explicitly named VG Lista position as a Billboard rank.
- Fixed Luna dropping the required VG Lista presence condition from requests for albums that charted in Norway but not on Billboard.

## [0.92.1] - 2026-07-28
### Changed
- Moved the Billboard album, Billboard single, and VG Lista chart-debut ranges into Search's **Advanced filters** and Charts' **Advanced chart controls**, including their active-control counts.
- Synchronized app metadata to `0.92.1`.

### Fixed
- Expanded bare Norwegian chart-folder defaults into full sibling paths whenever the corresponding US chart folder is configured with a full path.

## [0.92.0] - 2026-07-28
### Added
- Added Norwegian VG Lista weekly album and single imports from `CSV_ALBUMS_NO` and `CSV_SINGLES_NO`, preserving every weekly chart row in country-specific tables while enriching matched library albums and one canonical track copy with peak rank and first chart week.
- Added VG Lista rank and debut-week filters, sorting metrics, and optional table columns to Search and Charts for both album and track views.
- Added a US Billboard / NO VG Lista source selector to Album and Track Timeline views.

### Changed
- Consolidated chart imports into **Year-end album charts** and **Year-end singles charts**, with independent US and Norway checkboxes selected by default and both countries handled in one import action.
- Added persistent Norwegian album and single source paths, defaulting to the repo-local VG Lista folders.
- Bumped SQLite schema to version 36 and synchronized app metadata to `0.92.0`.

## [0.91.1] - 2026-07-28
### Added
- Added an explicit **All weeks** Timeline state so a season or custom period opens as a complete snapshot instead of highlighting the first visible item's week.

### Changed
- Individual week buttons now filter the Album and Track Timeline artwork, counts, selected item, ordering scope, and exact playlist handoff to that week.
- Choosing **All weeks**, another period, another chart year, or another Timeline mode restores the complete period cohort.
- Synchronized app metadata to `0.91.1`.

### Fixed
- Fixed Timeline week buttons changing only the selected-item text while leaving the full season's artwork visible.

## [0.91.0] - 2026-07-28
### Added
- Added persistent Billboard single source-album provenance and normalized album keys from the `CSV_SINGLES` `Album` column.
- Added always-visible title and artist information below every Album and Track Timeline cover, plus the selected library album on track cards so missing artwork stays identifiable.

### Changed
- Billboard singles now enrich one canonical library track per charted song, preferring the CSV's official artist album, then an artist-owned period-appropriate copy, while retaining a compilation fallback when no better copy exists.
- Catalog notation such as ` - Columbia 38710` is removed only from the matching key when its label agrees with `Label/Number`; raw CSV album text remains preserved and legitimate hyphenated album titles remain intact.
- Existing chart rows without source-album metadata refresh automatically from the configured `CSV_SINGLES` path when the Track Timeline first opens.
- Bumped SQLite schema to version 35 and synchronized app metadata to `0.91.0`.

### Fixed
- Removed duplicate soundtrack, compilation, remake, and reissue copies of the same charted song from Track Timeline cohorts and playlist handoff.

## [0.90.1] - 2026-07-28
### Fixed
- Fixed startup upgrades from databases created before Billboard singles chart-entry dates were added by deferring the new date index until after the legacy table receives its date columns.

### Changed
- Bumped synchronized app metadata to `0.90.1`.

## [0.90.0] - 2026-07-28
### Added
- Added Billboard singles `Date Entered` import from `CSV_SINGLES`, with exact calendar dates, ISO weeks, qualified historical-date handling, and independent earliest-debut selection when a track appears in multiple chart years.
- Added a Tracks mode to the standalone Timeline with the same seasonal and custom periods, fullscreen stage, exact track playlist handoff, track rating/Billboard/custom ordering, and direct track navigation as the album experience.
- Added exact single chart-debut date ranges, sorting, missing-date filters, and columns to Search and Charts, plus true track charts ranked by track rating, Billboard singles rank, or chart debut.
- Added Luna support for track chart-entry date ranges, named seasons, track chart ranking, and playlist recipes without confusing chart entry with release year.

### Changed
- Track exports now include the normalized Billboard single debut date and ISO week, and the singles import summary reports dated tracks plus exact, qualified, missing, and malformed source dates.
- Bumped SQLite schema to version 34 and synchronized app metadata to `0.90.0`.

### Fixed
- Correctly infers the century for qualified two-digit historical dates such as `12/31/21+` while rejecting implausible date typos.

## [0.89.1] - 2026-07-28
### Changed
- Restored the Timeline proposal's cinematic selected-year treatment with a warm breathing light stage, luminous decade rail and nodes, a glowing year beam, and longer cover connectors aligned to the central axis.
- Kept the selected-year beam visually clear by omitting its redundant representative cover marker while preserving year selection through the interactive axis.
- Bumped synchronized app metadata to `0.89.1`.

## [0.89.0] - 2026-07-28
### Added
- Added Timeline album-strip ordering by Billboard first-appearance week, Album Score, Billboard rank, album title, artist, or a manual custom order.
- Added contextual score and Billboard-rank badges, reversible sort directions, custom earlier/later controls, reset, and exact visible-order handoff to Playlist Builder.

### Changed
- Timeline still defaults to chronological first appearance; missing scores and unranked albums remain at the end in either direction.
- Bumped synchronized app metadata to `0.89.0`.

## [0.88.0] - 2026-07-27
### Added
- Added Spring, Summer, Fall, Winter, Christmas, New Year, and full-year Timeline presets plus custom single-month and wrapping month-range periods such as January or November through February.
- Added responsive period-picker presentation and exact custom-period handoff to Playlist Builder.

### Fixed
- Fixed 300×300 album artwork hover previews disappearing in true fullscreen by mounting the preview inside the active fullscreen surface.

### Changed
- Expanded the browser preview data across every month and bumped synchronized app metadata to `0.88.0`.

## [0.87.0] - 2026-07-27
### Added
- Added a standalone dark **Timeline** workspace inspired by the selected cinematic design, with a decade-spanning album ribbon, chart-year navigation, season views, week-level album selection, real cover art, fullscreen mode, and responsive mobile presentation.
- Added exact season-album handoff to Playlist Builder plus direct album and library-search entry points from the timeline.

### Changed
- Moved **Albums through the years** out of Charts and promoted it to a first-class sidebar destination; legacy saved Chart timeline view modes now open in Grid view.
- Added a dedicated aggregate timeline query so the experience loads year counts and representative covers without running a full ranked chart request.
- Added self-hosted Cormorant Garamond and Manrope typography, Phosphor interface icons, and generated abstract cover fallbacks for the browser preview.
- Bumped synchronized app metadata to `0.87.0`.

## [0.86.0] - 2026-07-27
### Added
- Added Billboard album first-appearance month and week import from `CSV_ALBUMS`, including correct ISO-year handling at January and December boundaries.
- Added Billboard chart-debut week ranges, columns, sorting, exports, album details, and an interactive **Albums through the years** Chart timeline.
- Added Luna Search, Chart, and Playlist Builder support for chart-debut periods and named seasons such as `summer 1989`.

### Changed
- Replaced the legacy default album chart folder `CSV` with `CSV_ALBUMS`; existing exact-default settings migrate automatically.
- Bumped the SQLite schema to version 33 and synchronized app metadata at `0.86.0`.

## [0.85.0] - 2026-07-27
### Added
- Added lossless FLAC as a Deemix audio-quality option, including Vorbis metadata and embedded front-cover artwork.
- Added a persisted quality-fallback preference. When enabled, each track uses the best available format in the order FLAC, MP3 320 kbps, then MP3 128 kbps; exact-quality mode remains available.

### Changed
- Bumped the SQLite schema to version 32 for the Deemix fallback preference and synchronized app metadata at `0.85.0`.

## [0.84.1] - 2026-07-27
### Fixed
- Fixed Wish List missing-album panels being clipped by artist cards or the bottom of the app window. The panel now renders in a viewport-level layer, flips above the eye control when needed, stays within the horizontal viewport, and scrolls internally for long album lists.

### Changed
- Bumped synchronized app metadata to `0.84.1`.

## [0.84.0] - 2026-07-26
### Added
- Added inclusive year-range recipes to outside-library Discovery, including natural decade wording such as `1980s`, `80s`, `'80s`, and `’80s` plus bounded requests such as `from 1982 through 1987`.

### Fixed
- Fixed decade Discovery requests retaining the decade only in their title and summary while silently querying MusicBrainz without a year constraint. MusicBrainz now receives the inclusive range, every returned item is checked against it locally, and the active range appears in the verified-result badge.

### Changed
- Bumped synchronized app metadata to `0.84.0`.

## [0.83.1] - 2026-07-26
### Fixed
- Fixed Wish List artist summaries and Deezer discovery including MusicBrainz Album release groups with secondary types such as Compilation, Live, Remix, DJ-mix, or Soundtrack. Only official pure Album release groups now count, including when an existing cached snapshot is used.

### Changed
- Bumped synchronized app metadata to `0.83.1`.

## [0.83.0] - 2026-07-26
### Added
- Added per-artist official-album completion summaries to the Wish List, including singular/plural missing counts and an eye control that reveals missing titles and years on hover or keyboard focus.
- Added persisted MusicBrainz official-album snapshots with sequential background loading for artists that do not have a cached summary yet.
- Added an **Add artist or album** flow directly on the Wish List page with MusicBrainz artist and Album release-group search, catalog-match selection, selected-album existence/type confirmation, and accessible result states.

### Changed
- Artist wishes now remain as persistent discography trackers after any of the artist's music enters the library; automatic reconciliation continues to remove acquired album wishes only.
- Missing counts now combine normalized albums in the imported library with completed Deemix receipts, update immediately after a queued download completes, and prevent **Download all albums** from queueing releases already in the library.
- Artist additions now verify the full official-album snapshot before saving and explain without adding when the collection already contains every official album or MusicBrainz has no official albums for the artist.
- Bumped synchronized app metadata to `0.83.0`.

## [0.82.0] - 2026-07-26
### Added
- Added persistent Deemix download receipts and **Downloaded** badges for album wishes and artist-discography results.
- Added a fast duplicate-folder preflight with the existing destination path plus an explicit **Download another copy** action that chooses a numbered sibling folder without overwriting files.
- Added artist Wish List discovery that verifies primary Album release groups with at least one Official MusicBrainz release, searches Deezer for each bounded album, and renders an **Albums found** panel.
- Added a sequential Deemix album queue with per-album queue states, individual enqueue actions, and **Download all albums** for missing matched artist releases.

### Changed
- Bumped the SQLite schema to version 31 and synchronized app metadata at `0.82.0`.

## [0.81.1] - 2026-07-26
### Fixed
- Fixed Deemix album downloads failing during authenticated metadata loading by retaining the ARL and Deezer-issued session cookies in one ephemeral cookie jar for account, album, track-list, and media requests.
- Added one bounded CSRF/API-token refresh retry for Deezer gateway responses and clearer sanitized messages for expired sessions, rate limits, album-detail failures, and track-list failures.

### Changed
- Bumped synchronized app metadata to `0.81.1`.

## [0.81.0] - 2026-07-26
### Added
- Added direct Deemix album downloads from Wish List matches with authenticated Deezer media authorization, exact MP3 320/128 quality selection, striped-stream decryption, live per-track progress, and a completed destination summary without requiring the Deemix GUI or a separate service.
- Added comprehensive ID3v2.4 tagging for title, track artists, album artist, album, publisher, genres, release date/year, disc and track numbers/totals, ISRC, copyright, duration, composer/production credits, barcode, explicit status, and Deezer source identifiers.
- Added embedded front-cover artwork plus a sibling `cover.jpg` or `cover.png`, determined from the verified image content.
- Added persisted folder-organization preferences for flat `Artist - Album (Year)` folders and nested `Artist/Album (Year)` folders, with the flat layout as the default and SQLite schema version 30.

### Changed
- Deemix album jobs now write into an app-owned staging folder, sanitize generated Windows names, reject unexpected CDN hosts, avoid silent bitrate fallback and existing-folder overwrite, and publish the completed album folder only after every track is downloaded and tagged.
- Bumped synchronized app metadata to `0.81.0`.

## [0.80.0] - 2026-07-26
### Added
- Added a Providers settings section with Deemix ARL validation, secure Windows Credential Manager storage, connection testing, account capability status, credential replacement, and removal without returning the ARL to the frontend.
- Added authenticated Deemix/Deezer searches for album wishes, including exact/likely/possible artist-title-year scoring, bounded results, constructed Deezer album links, and empty/error states.
- Added a self-contained Rust provider boundary with HTTPS-only requests, zeroized credential buffers, sanitized service failures, input validation, and focused backend/frontend tests; no Deemix GUI or separate service is required for this proof of concept.
- Added a persisted Deemix download-folder preference with a native Windows folder picker, clear action, and SQLite schema version 29 so later download work has an explicit destination.

### Changed
- Bumped synchronized app metadata to `0.80.0`.

## [0.79.2] - 2026-07-25
### Fixed
- Made Music Library Trimmer review imports accept Excel-saved Windows-1252 CSV files in addition to UTF-8 with or without BOM and UTF-16/UTF-32 Excel exports.
- Added automatic comma, semicolon, and tab delimiter detection, including Excel `sep=` directives, and report the detected review format before validation.
- Converted review-file decoding, read, and CSV parsing failures into normal safe CLI errors instead of Python tracebacks.

### Changed
- Bumped synchronized app metadata to `0.79.2` and the standalone trimmer version to `1.1.1`.

## [0.79.1] - 2026-07-25
### Added
- Added continuous stderr progress across every Music Library Trimmer command and long-running stage, including elapsed time, item counts, percentages, rates, ETAs, cache/network source, checkpoints, CSV review work, move preflight, hashing, verified moves, and undo.

### Fixed
- Fixed Windows library-root and quarantine containment checks when temporary paths use different short-name and long-name forms, which caused the `0.79.0` GitHub CI and release workflows to fail despite passing locally.
- Kept the million-track library-root pass fast by using lexical path checks normally and cached filesystem canonicalization only for Windows path aliases.
- Kept `--json` stdout machine-readable while all status and progress output remains on stderr.

### Changed
- Bumped synchronized app metadata to `0.79.1`.

## [0.79.0] - 2026-07-25
### Added
- Added a standard-library Python Music Library Trimmer under `Tools/library_trimmer` with read-only app/MusicBrainz candidate discovery, cached and resumable Discogs classification, editable CSV review decisions, manifest-driven quarantine moves, and journal-based undo.
- Added optional `D:\MUSIC`-style library-root scoping that requires every album track path to remain beneath the selected root, reports mixed/outside locations, and prevents quarantine destinations inside the scanned root.
- Added repeatable canonical-genre exclusions with exact expansion of the app's `scores` umbrella plus explicit `Soundtrack` and `Synthwave` support before any MusicBrainz or Discogs work.
- Added Discogs personal-token and Consumer Key/Consumer Secret authentication through environment variables, anonymous fallback, throttling, response caching, resumable 500-album batches, a read-only raw request command, stable JSON output, and focused Python tests.

### Changed
- Bumped synchronized app metadata to `0.79.0`.

## [0.78.1] - 2026-07-25
### Fixed
- Bundled MapLibre's GeoJSON worker explicitly and start it through a WebView-compatible classic Blob URL so country circles, area clusters, precise-area dots, and their labels render in the packaged Tauri app.
- Made location drill-down load only artists from the selected country or area and resolve representative covers only for the top 24 artists, removing the minute-long inspector delay on large places such as London.
- Showed an immediate loading state when changing locations and prevented stale or initial detail requests from replacing the latest selection.

### Changed
- Bumped synchronized app metadata to `0.78.1`.

## [0.78.0] - 2026-07-25
### Added
- Added a Music Map workspace backed by the local MusicBrainz origin-country and begin-area data, with country aggregates at world scale and exact MusicBrainz areas revealed as the map zooms in.
- Added album-weighted dominant-genre colors for every resolved country and area, circle sizing by artists, albums, or loved tracks, location/genre search, clustered area markers, and a country/area layer override.
- Added location drill-down with genre shares, library counts, representative artists, and handoff to the existing Artists workspace.
- Added an app-owned SQLite coordinate cache in schema version 28 plus explicit Wikidata enrichment by exact MusicBrainz area ID and ISO country code; unresolved refreshes preserve previously resolved coordinates.
- Added an OpenFreeMap/OpenStreetMap basemap, responsive light/dark layouts, the `M` workspace shortcut, web-preview fixtures, focused frontend helpers, and Rust aggregation/cache tests.

### Changed
- Bumped synchronized app metadata to `0.78.0`.

## [0.77.1] - 2026-07-24
### Fixed
- Fixed Imports source paths so edits save automatically and exact Windows paths, including trailing backslashes, survive an app restart without reintroducing stale or doubled folder segments.
- Kept the Imports saved-state indicator tied to backend-confirmed values, leaving **Save paths** available for retry when persistence fails instead of incorrectly reporting success.
- Prevented a completed settings write from overwriting newer path text entered while that write was in flight.

### Changed
- Bumped synchronized app metadata to `0.77.1`.

## [0.77.0] - 2026-07-24
### Added
- Added 300×300 floating hover previews for compact album covers in Search, Charts table/list/grid views, and the shared album lists used by Albums, Artists, Genres, and Discovery.
- Added viewport-aware preview placement, smooth row-to-row artwork handoff, animated entrance/exit treatment, and reduced-motion support without changing list row dimensions.

### Changed
- Bumped synchronized app metadata to `0.77.0`.

## [0.76.2] - 2026-07-24
### Fixed
- Fixed the final pre-import track delta comparisons so the existing `(file_path, filename)` index is used instead of repeatedly scanning the entire active track table for every staged row.
- Made cancellation interrupt an in-flight SQLite staging or analysis statement and return the last durable checkpoint as resumable instead of remaining on **Stopping safely**.
- Showed the final comparison and completed-stage compaction phases as **Analyzing** and **Optimizing** instead of leaving the workflow labeled **Preparing**.
- Reclaimed large completed import staging allocations after Apply so the main SQLite file does not permanently retain the temporary checkpoint growth.

### Changed
- Removed the redundant second active-track identity index in SQLite schema version 27.
- Clarified that preparation writes only resumable checkpoint rows, can temporarily grow the SQLite file, leaves the active snapshot untouched, and creates the rollback backup immediately before Apply.
- Bumped synchronized app metadata to `0.76.2`.

## [0.76.1] - 2026-07-24
### Changed
- Promoted **Exclude genres** into the six always-visible Search filters and moved the displaced rating minimum controls into **Advanced filters**.
- Matched Charts to the Search layout with **Genres** in the top-right, **Year from**, **Year to**, and **Exclude genres** on the second row, and **Limit** in **Advanced chart controls**.
- Updated hidden-control summaries and synchronized app metadata at `0.76.1`.

## [0.76.0] - 2026-07-24
### Added
- Added guided Whitespace Anomalies repair with exact affected-row before/after diffs, per-repair high-confidence labels, and an explicit warning that MusicBee TSV rows and audio tags remain unchanged.
- Added persistent Music Tools fix history in SQLite schema version 26, including repair counts, generated backup paths, timestamps, status, and the exact field changes needed for undo.
- Added one-click, conflict-aware undo that creates a fresh pre-undo database backup and restores only fields that still match the reviewed repair.

### Changed
- Reframed report-only Music Tools with source-review guidance instead of offering unsafe inferred fixes.
- Required a fresh preview before repair apply and kept the reviewed affected-row set fixed between preview and apply.
- Bumped synchronized app metadata to `0.76.0`.

## [0.75.0] - 2026-07-24
### Added
- Added six focused Settings sections: General, AI, Data & Backups, MusicBrainz, Updates, and Diagnostics.
- Added a sticky, keyboard-operable section switcher that keeps all section state mounted while showing only the selected controls.
- Added responsive section navigation that changes from one row on wide desktops to a readable three-by-two grid at the supported 1040px minimum width.

### Changed
- Moved the Settings summary into General and grouped cache, origin-country, artist-information, and overlay-sync tools under MusicBrainz.
- Reduced the default web-preview Settings height from roughly 3,580px to about 950px while preserving drafts and in-progress panel state across section changes.
- Bumped synchronized app metadata to `0.75.0`.

## [0.74.0] - 2026-07-24
### Added
- Added one contextual Luna command center with explicit Plan & filter, Ask this view, Analyze library, Build playlist, Discover outside, and Research music modes.
- Added a visible attached-context badge and mode-specific privacy boundary so users can see what Luna will receive before launching a task.
- Added one local Luna timeline that combines automatic AI snapshots with explicitly saved playlists and outside-library discoveries and reopens each item in its owning workflow.

### Changed
- Embedded Music Research inside the shared Luna panel and routed Search, Charts, Statistics, Playlist Builder, and Discovery launches through the same mental model.
- Removed duplicate inline AI snapshot histories while keeping saved playlist and discovery libraries available as explicitly managed artifacts.
- Added programmatic workspace handoffs for exact Search/Chart filters and answers, Library Analyst reports, saved playlists, and saved discovery lists.
- Bumped synchronized app metadata to `0.74.0`.

## [0.73.1] - 2026-07-24
### Fixed
- Opened genre rows from Statistics **Loved density** in the Tracks view with the genre and loved-track filters applied, using the loved-track count as the cohort result count.
- Replaced ambiguous action-dock “items” counts with explicit album or track labels and clarified that Loved Density album/track totals describe the aggregate behind the selected cohort.

### Changed
- Bumped synchronized app metadata to `0.73.1`.

## [0.73.0] - 2026-07-24
### Added
- Added a consistent action dock for actionable Statistics and Discovery cohorts with **Open in Search**, **Save view**, and **Build playlist** handoffs.
- Added operational cohort mappings for missions, heatmap cells, artists, genres, albums, decades, years, rating bands, rating progress, loved-density groups, metadata gaps, duration/track-count groups, catalog leaders, outliers, and rating events.
- Added one-click bulk **Add missing items to Wish List** for verified outside-library artist and album results.
- Added missing-metadata Search support for release year, publisher, track title, display artist, track/disc number, filename, and cover art so every metadata-coverage gap can open as a real cohort.

### Changed
- Locked Playlist Builder launches to the exact selected cohort request while still letting Luna plan targets and sequencing; users can explicitly clear the source badge before building.
- Added keyboard-operable cohort selection, focused action/request coverage, and synchronized app metadata at `0.73.0`.

## [0.72.0] - 2026-07-24
### Added
- Added a required pre-import MusicBee delta with added, changed, and removed track/album counts plus suspicious rated/loved album removals, material track-count drops, and disappearing identity metadata.
- Added durable 5,000-row staging checkpoints with TSV byte offsets and partial album aggregates, safe cancellation, restart-safe resume when the source fingerprint still matches, and stale-source protection.
- Added one-click rollback for the exact backup generated by a completed import, with the existing pre-restore safety copy retained.
- Added Rust coverage for checkpoint resume without duplicate rows and transaction rollback after a simulated final-apply failure, plus focused rendered workflow coverage.

### Changed
- Kept the active library untouched during preparation and reduced final replacement to a reviewed, staged, atomic SQLite transaction after backup creation.
- Removed the legacy direct-import Tauri command so imports cannot bypass delta review.
- Added SQLite schema version 25 import-session staging tables and synchronized app metadata at `0.72.0`.

## [0.71.0] - 2026-07-24
### Changed
- Reworked Charts into a ranking-first workflow with search, view mode, ranking, direction, limit, genre, and year controls visible while the current chart begins in the first screen at desktop and the supported 1040px minimum width.
- Consolidated chart-building and current-ranking Luna tools into one closed-by-default command area with task switching that preserves each panel's state.
- Moved built-in presets, lifecycle, MusicBrainz, scoring, completeness, column, cover-size, and export controls into a closed-by-default Advanced drawer with an active hidden-control count.
- Added focused progressive-disclosure and hidden-control summary coverage and synchronized app metadata at `0.71.0`.

## [0.70.1] - 2026-07-24
### Fixed
- Reserved header-only space for Luna and details controls whenever the contextual sidebar is collapsed or drawer-based, preventing them from covering workspace actions without narrowing metrics or tables.
- Kept the single Luna control aligned to the window edge on workspaces without useful detail content and separated both shell controls at compact widths.

### Changed
- Bumped synchronized app metadata to `0.70.1`.

## [0.70.0] - 2026-07-24
### Changed
- Reworked Search into a results-first workflow with six view-aware common filters and the album or track result table visible in the first screen at desktop and the supported 1040px minimum width.
- Consolidated Search's filter-building and current-result Luna tools into one closed-by-default command area with task switching that preserves each panel's state.
- Moved lifecycle, MusicBrainz, metadata, file, scoring, sort, row-limit, and table-column controls into a closed-by-default Advanced drawer with an active hidden-filter count.
- Added focused disclosure and filter-summary coverage and synchronized app metadata at `0.70.0`.

## [0.69.2] - 2026-07-23
### Changed
- Made the shell adaptive at 1280px and below by replacing the fixed details column with an accessible, closed-by-default overlay drawer that supports outside click, Escape, focus restoration, focus trapping, and page scroll locking.
- Reclaimed the details column automatically when a workspace has no distinct contextual content, including static duplicate panels and selection-based views without an active selection.
- Added focused layout-state coverage and synchronized app metadata at `0.69.2`.

## [0.69.1] - 2026-07-22
### Fixed
- Fixed **Albums not on MusicBrainz official list** appearing to stop at 58% on large libraries by normalizing temporary MBIDs once, restoring indexed release/status joins, batching temporary-table writes in one transaction, and materializing the expensive comparison once per request.
- Kept MusicBrainz preparation progress moving through the real work phases and added regression coverage for case-insensitive MBID matching plus indexable comparison SQL.

### Changed
- Bumped synchronized app metadata to `0.69.1`.

## [0.69.0] - 2026-07-22
### Added
- Added an **Albums not on MusicBrainz official list** validator to Tools, listing local database albums absent from pure official MusicBrainz album lists for trusted artist matches.
- Added normalized title comparison, refreshed-snapshot precedence, representative album file metadata, existing search/sort/export support, web-preview data, and focused Rust coverage.

### Changed
- Limited the inverse MusicBrainz audit to artists with trusted matches and usable official-album snapshots so unresolved or empty-cache artists are not mislabeled as missing.
- Bumped synchronized app metadata to `0.69.0`.

## [0.68.0] - 2026-07-19
### Added
- Added a responsive Genre Timeline directly below the Genre Index, with interval rows for every canonical genre's first and last release years observed in the local library.
- Added filtered earliest-start, latest-release, and longest-span summaries plus genre search, year from/to, overlap/start/end/contained range matching, minimum albums, sorting, row limits, and optional album/completeness/loved-track color encoding.
- Added keyboard-selectable timeline rows that update the existing genre albums and detail views, explicit library-coverage caveats, dark-mode styling, and focused selection/component tests.

### Changed
- Loaded the existing bounded full canonical-genre result set independently for timeline exploration while preserving the paginated Genre Index request.
- Bumped synchronized app metadata to `0.68.0`.

## [0.67.1] - 2026-07-19
### Added
- Added a fully rated album percentage column to every Genre progress row.

### Changed
- Reused the filtered Genre progress album totals for the percentage calculation, including zero-album safety and focused rendered and unit coverage.
- Bumped synchronized app metadata to `0.67.1`.

## [0.67.0] - 2026-07-19
### Added
- Added Genre progress controls for an exact dual-ended year range, oldest-first decade jumps, canonical include/exclude genre filters, and the shared `scores` group for film, TV, animation, anime, and video-game score genres.
- Added Top 12, Top 25, Top 50, Top 100, and all-genre display choices plus popularity and alphabetical sorting.

### Changed
- Genre progress now recomputes album, rating, loved-track, and score totals for the active filters and grows vertically with the selected genre count.
- Added a bounded SQLite Genre progress command, full web-preview data, focused frontend/Rust coverage, and responsive rendered QA.
- Bumped synchronized app metadata to `0.67.0`.

## [0.66.0] - 2026-07-19
### Added
- Added Year progress controls for exact from/to selection with a dual-ended slider, decade jumps, and canonical genre include/exclude filters using the shared `scores` group for film, TV, animation, anime, and video-game score genres.
- Added a fully rated album percentage column to every Year progress row.

### Changed
- Year progress now renders every selected year in oldest-first order and grows vertically with the result set instead of limiting the table to 14 years.
- Added filtered SQLite Year progress aggregation, focused frontend/Rust coverage, and a long-range web preview dataset for rendered QA.
- Bumped synchronized app metadata to `0.66.0`.

## [0.65.1] - 2026-07-19
### Fixed
- Added the shared `scores` genre-group suggestion and expansion to Completion heatmap include/exclude filters, matching Search and Charts behavior for film, TV, animation, anime, and video-game score genres.

### Changed
- Centralized the frontend score-genre group definition so Search, Charts, the web preview, and the Completion heatmap use the same members.
- Bumped synchronized app metadata to `0.65.1`.

## [0.65.0] - 2026-07-19
### Added
- Added Completion heatmap controls for Top 12, Top 25, Top 50, and Top 100 genre rows, decade jumps, exact from/to year selection with a dual-ended slider, and genre include/exclude filters.
- Added horizontally scrollable consecutive year columns with sticky genre labels, allowing custom ranges such as 1945–1959 without dropping lower-population years.

### Changed
- Ranked heatmap genres by album population inside the active year range and expanded the Discovery query from 12 genres across 16 popularity-selected years to every populated year for the library's top 100 genres.
- Bumped synchronized app metadata to `0.65.0`.

## [0.64.0] - 2026-07-19
### Added
- Added a dedicated **Wish List** workspace with separate artist and album sections, persistent SQLite storage, manual removal, and MusicBrainz links when available.
- Added one-click Wish List actions to missing albums in the selected artist's MusicBrainz Discography and to artist/album results in **Find what your library is missing**.
- Added automatic Wish List reconciliation after MusicBee imports and whenever the workspace opens, using MusicBrainz IDs and normalized local artist/album identities to remove newly acquired music.
- Added web-preview behavior plus React and Rust coverage for adding, deduplicating, listing, linking, removing, and reconciling Wish List items.

### Changed
- Added the `W` workspace shortcut and SQLite schema version 24 for persistent Wish List items.
- Bumped synchronized app metadata to `0.64.0`.

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
