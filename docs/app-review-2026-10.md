# Music Library: Improvement & Feature Review

**Reviewed version:** 0.157.3 · **Date:** 2026-10-03

This review covers 20 existing features that can be improved, 20 features worth adding, and external services, APIs, and libraries that could improve the app.

---

## How this review was done

I read `README.md` (172 KB), `SPEC.md` (roadmap and open questions), and the recent `CHANGELOG.md`, then went through the Rust and React sources and ran the web-preview UI. Every improvement below names the file and line it is based on, so you can check it.

**The project at a glance**

| Metric | Value |
| --- | --- |
| Library scale (per SPEC) | ~1,130,882 tracks · ~76,789 albums |
| Source size | ~225K lines (Rust + TS + CSS) |
| Largest files | `db.rs` 32,758 · `styles.css` 26,848 · `App.tsx` 21,888 · `importer.rs` 8,707 · `backend.ts` 8,511 |
| Tauri commands | 266 (all `async`, 180 `spawn_blocking` call sites) |
| Tests | 552 Rust `#[test]` · 74 frontend test files |
| SQLite schema | v58, ~75 tables |
| Release cadence | ~130 versions released in Aug–Sep 2026 |
| Bundled data | 88 MB Published Charts resources in every installer |

**Overall:** the app is ambitious and carefully built. Its safety engineering is unusually strong: reviewed imports, atomic applies, rollback backups, strict AI tool boundaries, and secrets kept in the OS keychain. Most of the opportunities below are therefore not missing basics. They fall into four groups:

1. Per-call costs that were fine at small scale but now repeat hundreds of times per screen.
2. Duplicated infrastructure that has drifted apart (HTTP clients, rate limiters, normalization).
3. Background work that runs from React timers instead of the backend.
4. Feature areas that would get much richer with **listening data** and **audio analysis**. The app has neither today.

**Scope note:** I did not propose enhancements to the Deemix, Soulseek, or Usenet download integrations. Feature 13 suggests legitimate purchase and availability links for the Wish List instead.

Effort: **S** ≈ under a day · **M** ≈ a few days · **L** ≈ a week or more.

---

## Part 1: 20 existing features that can be improved

### Quick index

| # | Area | Improvement | Effort | Impact |
| --- | --- | --- | --- | --- |
| 1 | External providers | One shared HTTP and MusicBrainz client (single rate gate, compliant User-Agent, 503 backoff) | S–M | High |
| 2 | Cover art | Thumbnails served by a custom protocol instead of full-size base64 data URLs | M | High |
| 3 | Database | Run migrations once per process; reuse connections; tune pragmas | M | High |
| 4 | Large lists | Virtualize the 5,000-row Workbench, playlists, Updates, and big tables | M | High |
| 5 | Background tasks | Move timers into Rust; fix the overlay-sync timer bug; push events instead of polling | M | Med–High |
| 6 | Long-running work | One persistent job queue with a global Activity Center | L | High |
| 7 | Frontend architecture | Break up `App.tsx`, add state stores, error boundaries, and feature-scoped CSS | L | High |
| 8 | Backend architecture | Break up `db.rs`; declarative migration ladder | L | Med–High |
| 9 | IPC contract | Generate TypeScript bindings from Rust (tauri-specta) | M | Med–High |
| 10 | Matching | One identity/normalization module plus a golden test corpus | M | High |
| 11 | Diagnostics | `tracing` logs and an "Export diagnostics" bundle | S–M | Med |
| 12 | Test suite | Parallel Rust tests, end-to-end smoke tests, perf benchmarks | M | Med |
| 13 | Search | Better FTS5: prefix, trigram, bm25 ranking, typo tolerance | M | High |
| 14 | Navigation | Group the 19-item sidebar into sections; let users customize it | S–M | Med |
| 15 | Luna (AI) | Configurable provider/model (OpenRouter, local Ollama), budgets, caching | M | Med |
| 16 | Folder sync / Aurora intake | Support FLAC/M4A/Opus via `lofty`; watch library folders for incremental sync | L | High |
| 17 | Published Charts / releases | Ship chart data as a separate data pack; add release channels | M | Med |
| 18 | macOS parity | Use the macOS Keychain; make hard-coded Windows roots configurable | S–M | Med |
| 19 | Music Map | Offline basemap fallback (PMTiles) | M | Low–Med |
| 20 | Documentation | Restructure the 172 KB README into a user guide; in-app "What's new" | M | Med |

---

### 1. One shared HTTP and MusicBrainz client - DONE

**Current state**
- Three independent MusicBrainz rate gates exist:
  - `MUSICBRAINZ_REQUEST_GATE` in [`musicbrainz.rs:50`](../src-tauri/src/musicbrainz.rs#L50)
  - `MUSICBRAINZ_LAST_REQUEST` in [`wishlist.rs:32`](../src-tauri/src/wishlist.rs#L32)
  - `LAST_MUSICBRAINZ_REQUEST` in [`external_discovery.rs:25`](../src-tauri/src/external_discovery.rs#L25)

  Each enforces 1.1 s spacing on its own. If a Wish List artist add, an outside-library Discovery search, and a biography/Library Completion lookup run at the same time, the app can send roughly 3 requests per second.
- MusicBrainz's published rule is **an average of 1 request/second per IP**. When you exceed it, it answers HTTP 503 to *all* requests from that IP until the rate drops. None of the MusicBrainz modules handle `503` or `Retry-After`.
- Every User-Agent is hard-coded to `music-backup-v5/0.145.3 (...)` ([`musicbrainz.rs:46`](../src-tauri/src/musicbrainz.rs#L46), [`wishlist.rs:28`](../src-tauri/src/wishlist.rs#L28), [`discogs.rs:14`](../src-tauri/src/discogs.rs#L14), [`lastfm.rs:29`](../src-tauri/src/lastfm.rs#L29), [`music_map.rs:19`](../src-tauri/src/music_map.rs#L19), …). The version is 12 minor versions stale. MusicBrainz also requires a contact URL or email in the UA (`App/1.2 ( contact )`), which these strings don't have.
- 13 modules each build their own `ureq::AgentBuilder`, so there is no shared connection pool, timeout policy, or proxy setting.

**How to improve**
1. Create `src-tauri/src/http/` with one lazily initialized `ureq::Agent` and a per-host token-bucket rate limiter:
   - `musicbrainz.org`: 1 req/s
   - `api.discogs.com`: driven by the `X-Discogs-Ratelimit-Remaining` header the app already reads
   - Last.fm, Deezer, and others: configured per host
2. Build the User-Agent once: `concat!("MusicLibrary/", env!("CARGO_PKG_VERSION"), " ( https://github.com/soundtrackgeek/music_backup_v5 )")`.
3. Add retries with exponential backoff and jitter on 429/503. Honor `Retry-After`. Add a short circuit breaker so a provider outage doesn't stall every queue.
4. Delete the per-module gates and route every MusicBrainz call through `http::musicbrainz()`.
5. Later, consider `ureq` 3.x (better timeouts, shared config) as a separate step.

---

### 2. Cover art delivery: thumbnails and a custom protocol - DONE

**Current state:** every `<AlbumCover>` makes one IPC call, `getAlbumCoverDataUrl(albumId)` ([`AlbumCover.tsx:219-238`](../src/components/AlbumCover.tsx#L219)). On the Rust side, [`covers.rs:159-197`](../src-tauri/src/covers.rs#L159) then:
1. opens a new SQLite connection, which also re-runs the migration check (see #3),
2. reads the **full-size** image file,
3. base64-encodes it (about +33%),
4. returns it as a JSON string that becomes a `data:` URL in the DOM.

A 100-cover grid therefore means 100 database opens and potentially hundreds of MB of base64 strings in JS memory. The browser can't cache any of it, and a grid only needs 150–300 px images.

**How to improve**
1. Register an async URI scheme with `register_asynchronous_uri_scheme_protocol("cover", …)`. Serve URLs like `cover://album/<id>?size=300` (Windows WebView2 exposes this as `http://cover.localhost/...`) and add that origin to the CSP `img-src`.
2. On first request, generate WebP or JPEG thumbnails at a few sizes (96 / 300 / 600) into `appData/thumbs/`. Key them by `album_id + source mtime + size`. Use the `image` and `fast_image_resize` crates, and serve with `Cache-Control: max-age=31536000, immutable`.
3. Use `<img loading="lazy" decoding="async">` and keep the existing 300×300 hover preview on the 300 size.
4. Pre-warm thumbnails in the background after a cover import.
5. Apply the same approach to Last.fm portraits (`artist_image_data_url`, [`lastfm.rs:2392`](../src-tauri/src/lastfm.rs#L2392)) and Library Completion covers.

---

### 3. SQLite connection lifecycle - DONE

**Current state:** `db::open()` ([`db.rs:629-636`](../src-tauri/src/db.rs#L629)) is called from about 170 sites. Each call:
- opens a new connection,
- registers the `unicode_lower` function,
- sets pragmas,
- calls `migrate()`.

On an up-to-date database, `migrate()` still enters `migrate_through_57`. That path starts a transaction and runs `migrate_uk_origin_country_alias` ([`db.rs:681-690`](../src-tauri/src/db.rs#L681), [`migrations.rs:75`](../src-tauri/src/db/migrations.rs#L75)), which uses non-indexable `UPPER(TRIM(country_code))` scans across three tables. In other words, every command pays for a small migration and a fresh page cache. With 1.13M tracks, the cold cache costs more than the migration.

**How to improve**
1. Gate migrations with a process-wide `OnceLock<PathBuf>` (or an `AtomicBool` per database path). Run them once at startup and in bridge mode, not per command. Make the UK-alias repair a real one-time migration (bump to schema 59) instead of an idempotent check on every open.
2. Keep a small pool of read connections (`r2d2_sqlite`, or a simple `Mutex<Vec<Connection>>`) plus one writer, so connections keep their cache.
3. Add `PRAGMA mmap_size` (e.g. 256 MB–1 GB), a larger `cache_size`, and `PRAGMA optimize` on clean exit, which the app already hooks for the WAL checkpoint.
4. Re-run the existing **Performance Proof** probe before and after; it gives you a ready-made benchmark.

---

### 4. Virtualize large lists - DONE

**Implemented in 0.157.8 (2026-10-06):** `VirtualList` uses TanStack React Virtual 3.14.13 for lists over 40 items, with six overscan rows in each direction and measured heights for wrapped/responsive content. `ResizableTable` enables it automatically and accepts data plus a row renderer; all nine app table renderers now create only mounted row JSX. Sticky headers, column widths, horizontal scrolling, and logical row indexes remain available. Album and artist Completion queues, Playlist Builder review, and Updates activity/artist lists use the shared virtualizer. Playlist review scrolls across the full draft instead of revealing 500-track batches. Workbench rows are memoized by candidate identity and duplicate progress events preserve unchanged candidate objects. Focused rows stay mounted; Tab/Shift+Tab cross virtual boundaries, and review jumps use data keys. Existing data limits, backend paging, exports, batch selection, playlist saves, and edits retain the complete loaded arrays.

**Current state:** no virtualization is used anywhere in `src/`.
- The Library Completion Workbench returns up to `MAX_RETURNED_CANDIDATES = 5_000` rows ([`library_completion.rs:16`](../src-tauri/src/library_completion.rs#L16)) and renders all of them with `.map` ([`LibraryCompletionWorkspace.tsx:1069`](../src/workspaces/LibraryCompletionWorkspace.tsx#L1069)).
- While verification runs, a 1.5 s timer ([line 411](../src/workspaces/LibraryCompletionWorkspace.tsx#L411)) rebuilds the candidate array, which re-renders all 5,000 rows every 1.5 s.
- Playlist review reveals rows in 500-track batches, and Updates and other tables have similar patterns.

**How to improve**
1. Adopt `@tanstack/react-virtual` (use ≥ 3.14.13, which fixes a React 19 `flushSync` warning). Wire it into `ResizableTable` so every table gets it automatically.
2. Fixed row heights make this simple for most tables.
3. Pair it with #5 so progress updates patch individual rows instead of replacing the whole array. Rows should be `React.memo` components keyed by candidate ID.

---

### 5. Move background timers into Rust (and fix a timer bug) - DONE

**Current state:** recurring jobs run as `window.setInterval` in React effects in `App.tsx`:
- Music Doctor sync every 5 min ([`App.tsx:9079`](../src/App.tsx#L9079))
- update checks ([`13705`](../src/App.tsx#L13705))
- MusicBrainz overlay auto-sync ([`13724`](../src/App.tsx#L13724))
- a 1 s catalog-revision poll ([`9045`](../src/App.tsx#L9045)). This one is cheap: it uses a read-only connection ([`db.rs:7129`](../src-tauri/src/db.rs#L7129)).

**Concrete bug:** the overlay auto-sync effect lists `musicBrainzOverlaySyncPathDraft` and `selectedArtist?.id` as dependencies. Every time you select a different artist, the interval is torn down and recreated. With a 60-minute auto-sync, the sync only fires after 60 minutes with no artist selection change. Also, `runMusicBrainzOverlaySync` reads the **unsaved draft** path ([`App.tsx:13527`](../src/App.tsx#L13527)), so an auto-sync can target a half-typed path.

**How to improve**
1. Add a small scheduler in Rust (a `tokio::time::interval` task per job, started in `setup`) that reads saved settings and emits a Tauri event when work completes. The UI only listens and renders.
2. Short-term fix: remove `selectedArtist?.id` and the draft from the effect dependencies, and have auto-sync use `settings.musicBrainzOverlaySyncPath`.
3. For progress (Library and Artist Completion queues), stream updates through Tauri `Channel`s or events. The app already has 43 `emit` sites, so the pattern exists; polling every 1.5 s is no longer needed.

---

### 6. One job system and Activity Center - DONE

**Implemented in 0.158.0 (2026-10-06):** persistent local `jobs.sqlite3` registry, a two-worker Rust pool, shared rate-gated provider handlers, and a global Activity Center. Verification keeps its item checkpoints and pause/resume/retry controls; other operations expose controls only at supported safe boundaries. Doctor and overlay schedules share the pool, and interrupted non-checkpoint writes require explicit retry. Plex integration was subsequently removed in 0.159.0 (2026-10-06). See [Activity Center](../README.md#activity-center).

**Current state:** long work runs through at least seven separate mechanisms:
- Library Completion verification (a persistent queue with pause/resume and ETA, which is good),
- Artist discovery verification,
- Wish List MusicBrainz verification (synchronous),
- Origin Country and Artist Info imports (each with its own cancel `AtomicBool`),
- cover import,
- Last.fm portrait sync,
- Music Doctor sync.

Each has its own progress UI in its own workspace, so you can't see "everything that's running" in one place.

**How to improve:** generalize the Library Completion queue design into a `jobs` table with:
- `kind`, `state`, `progress`, `eta`, `error`, `payload_json`, `created_at`, `resumable`
- a Rust worker pool where each job kind registers a handler
- the shared rate limiter from #1

Then add a global **Activity Center**: a top-bar icon with a count badge and a drawer listing running, paused, failed, and finished jobs with pause/resume/retry/cancel. Restart recovery comes for free, because the Library Completion queue already recovers "interrupted checks".

---

### 7. Break up `App.tsx`, add state stores, error boundaries, and scoped CSS - DONE

**Implemented in 0.160.0 (2026-10-06):** `App.tsx` mounts a small shell and 13 typed React reducer/context stores. Workspace workflow hooks, views, details, and catalog panels live in feature modules; Settings has dedicated General, Updates, Data, Diagnostics, and MusicBrainz panels. Catalog events, ordered settings saves, request cancellation, import review/apply, and cross-workspace launches retain their existing contracts. Workspace/details/Luna boundaries provide **Reload this view** and **Copy error details** while stores and backend jobs remain mounted, with bounded session diagnostics ready for a later combined export. The stylesheet is a manifest for co-located feature/component styles and shared tokens/primitives. ESLint warns at 1,500 nonblank, noncomment lines and runs in the check workflow. New regression tests cover state updates, navigation retention, and render recovery. See [Frontend architecture](frontend-architecture.md). Subscription/render optimization and unproven dead-CSS removal remain separate work.

**Original state**
- `App.tsx` is 21,888 lines with **275 `useState`**, 59 `useEffect`, and **zero `useReducer`**.
- Only 3 contexts exist and there are **no React error boundaries**, so a render error in any panel (say the Music Map) can blank the whole app.
- `styles.css` is 26,848 lines with only 84 CSS custom properties.
- SPEC Phase 19 already lists this as "Now". The question is how to make it go faster.

**How to improve**
1. **Settle the state approach first.** Use one store per workspace, either `zustand` (tiny, works well with selectors) or `useReducer` plus context. Move each workspace's state and effects into a `useXWorkspace()` hook beside the component. Extract the largest areas first: Settings, Imports, Statistics, Discovery, Charts.
2. **Error boundaries:** wrap each workspace (and the Luna panel) in a boundary with a "Reload this view" button and an "Copy error details" action that feeds the diagnostics bundle from #11.
3. **CSS:** move workspace styles into co-located files, as `MixtapeBuilder.css`, `ResizableTable.css`, and `YearLedger.css` already do. Promote repeated colors, spacing, and radii to tokens. A coverage pass (Chrome DevTools "Coverage" while clicking through each workspace) will likely find a lot of dead CSS after this many redesigns.
4. Add an ESLint `max-lines` warning so a new catch-all file can't grow back.

---

### 8. Break up `db.rs` and make migrations declarative - DONE

**Implemented in 0.162.0 (2026-10-06):** `db.rs` is a ~400-line facade over 21 feature modules in `src-tauri/src/db/` (`search`, `stats`, `timelines`, `artists_genres`, `chart_imports`, `chart_reconcile`, `discovery*`, `tools*`, `playlists`, `saved_views`, `ai_snapshots`, `provider_cache`, `inspection`, `exports`, `diagnostics`, `schema`), re-exported so command call sites are unchanged. Tests moved next to the code they cover, with shared fixtures in `db/test_support.rs`. Migrations are one ordered `MIGRATIONS` list of `(version, up, verify)` steps in `db/migrations.rs`; the runner owns `user_version`, applies each step once in its own transaction, and replays only unverified steps. The old branching also skipped schema 45–57 when upgrading a schema 43 database; that is fixed and tested. New tests cover ladder ordering, a schema 20 upgrade, repair of missing tables, a newer database, and the 43 upgrade. See [Backend database architecture](backend-architecture.md). Splitting `search` and `tools` SQL further, and a `rusqlite_migration` dependency, were not needed.

**Original state:** `db.rs` is 32,758 lines and contains migration code, browse SQL, statistics, Music Tools, exports, and charts. The migration ladder has many branches that each write `PRAGMA user_version = 57` ([`db.rs:699-956`](../src-tauri/src/db.rs#L699)), which is hard to reason about.

**How to improve**
1. Split by feature (`db/browse.rs`, `db/stats.rs`, `db/tools.rs`, `db/exports.rs`, `db/discovery.rs`, `db/charts.rs`), following the existing `db/settings.rs` and `db/backups.rs` precedent. Re-export the public API so command call sites don't change.
2. Turn migrations into an ordered list of `(version, fn(&Transaction))` steps, using `rusqlite_migration` or a hand-rolled equivalent. Each step runs exactly once and the runner owns `user_version`. Keep the existing "repair" functions as explicitly versioned steps.
3. Keep the 141 `db.rs` tests with their modules. Add a migration test that upgrades a schema-20 fixture to the latest version.

---

### 9. Generated TypeScript bindings (tauri-specta) - IN PROGRESS

**Started in 0.163.0 (2026-10-06):** `specta` and `tauri-specta` are pinned at `2.0.0-rc.25`. The 24 AI, Jev, saved-playlist, and outside-library commands, plus the 14 Library/Artist Completion commands (0.164.0) 18 Discogs, Last.fm, and Wish List commands (0.165.0), 14 Deemix and Published Charts commands (0.166.0), 8 updater, biography, review, Music Doctor, Jev, and saved-discovery commands (0.167.0), and 34 Usenet and Soulseek commands (0.168.0), are annotated with `#[specta::specta]` and exported to `src/bindings.ts` (`npm run bindings`); `npm run check:bindings` fails CI when the file drifts. `src-tauri/src/bindings.rs` routes migrated commands to tauri-specta and the rest to `generate_handler!`, so the remaining ~151 commands can move domain by domain. Bigints are exported as `number`, errors still reject the promise, and `backend.ts` casts results to the existing narrower hand-written types (the generated types use `string` where Rust uses `String`). Commands returning raw `serde_json::Value` cannot be exported by specta rc.25 (it recurses forever), so job-backed commands need typed results first. Remaining: other domains, replacing hand-written types with generated ones, and typed web-preview mocks.

**Current state:** 266 commands are mirrored by hand in `types.ts` (3,602 lines), `backend.ts` (8,511), `tauriClient.ts`, and a 3,811-line `webPreview.ts` mock. Every Rust struct change requires three manual TypeScript edits, and a missed edit only fails at runtime.

**How to improve:** add `specta` and `tauri-specta` v2 (currently an RC, so pin the exact version):
- Annotate commands with `#[specta::specta]`.
- Export `src/bindings.ts` in debug builds.
- Fail CI if the generated file differs.

Migrate one domain at a time (AI first, since its types are strict already). Generated types can also seed typed web-preview mocks, which shrinks `webPreview.ts`.

---

### 10. One identity and normalization module

**Current state**
- `normalize_key` is copy-pasted in [`discogs.rs:343`](../src-tauri/src/discogs.rs#L343), [`external_discovery.rs:395`](../src-tauri/src/external_discovery.rs#L395), and [`wishlist.rs:502`](../src-tauri/src/wishlist.rs#L502). These versions fold diacritics with NFKD and turn `&` into `and`.
- `db.rs` ([`24574-24600`](../src-tauri/src/db.rs#L24574)) and `importer.rs` ([`5281-5294`](../src-tauri/src/importer.rs#L5281)) define a **different** `normalize_artist_key`: lowercase plus whitespace only, with no diacritic folding and no `&`.
- `chart_identity.rs` adds a third set of rules.
- There are 82 `normalize*` functions in total.

The same artist can therefore match in one feature (Wish List auto-complete) and miss in another (artist summary). The changelog shows a steady stream of matching fixes (0.156.5, 0.157.0, 0.157.1).

**How to improve**
1. Create `src-tauri/src/identity/` with named, documented key levels:
   - `display_key`: case and whitespace only
   - `loose_key`: NFKD, `&`/`and`, punctuation, "The " handling
   - `credit_keys`: split collaborations and featured artists
   - `title_key`: parenthetical, remaster, and live suffix rules
2. Every feature picks a level explicitly.
3. Add a **golden corpus**, a CSV of tricky pairs with expected results ("Hall & Oates", "KISS"/"Kiss", "Sigur Rós", "AC/DC", "P!nk", "Beyoncé", "Björk", "Röyksopp", "feat."/"ft."/"with", Norwegian `[NO]` suffixes). Run it from a single test file. Add property tests (e.g. `loose_key` is idempotent).
4. Store the computed keys in indexed columns so SQL never has to recompute `unicode_lower(...)` at query time.

---

### 11. Logging and an "Export diagnostics" bundle

**Current state:** there is no logging framework, only about 30 `println!`/`eprintln!` calls. Settings has a Diagnostics section, and SPEC Phase 21 asks for "developer log export" and "surface slow operation details".

**How to improve**
1. Add `tracing` with a rolling daily file appender (or `tauri-plugin-log`, which also forwards frontend logs).
2. Instrument import phases, provider requests (host, status, latency), and any SQL statement slower than ~200 ms using `#[instrument]` spans.
3. Add **Settings → Diagnostics → Export diagnostics** that zips:
   - the last N log files,
   - app version and schema version,
   - `PRAGMA integrity_check` (opt-in, because it is slow),
   - the latest Performance Proof result,
   - provider connection status.

   Keep the existing secret-redaction guarantees: no keys, no paths unless the user opts in.

---

### 12. Faster tests, end-to-end smoke tests, and perf benchmarks

**Current state:** `npm run check` runs `cargo test -- --test-threads=1` because tests share the process-wide import workflow guard (README). All 552 Rust tests therefore run serially. There are no end-to-end tests of the packaged app (the `.playwright-mcp/` folder suggests ad-hoc manual checks), and no benchmark for the 1.13M-row import that SPEC Phase 20 asks for.

**How to improve**
1. Make the import guard injectable (pass a guard handle or use a per-test app-data directory) so most tests run in parallel. Only a tagged `#[serial]` subset (`serial_test` crate) needs to be serialized.
2. Add a Playwright smoke suite against the web preview for layout and navigation regressions. Add a small `tauri-driver` (WebDriver) suite for the golden flows: import preview → apply → rollback, Aurora bridge `capabilities`, and export.
3. Add a synthetic data generator that writes a 1.1M-row TSV with realistic distributions. Run `criterion` benchmarks for staging, delta analysis, and the top 10 Search/Charts queries, and track them across releases.

---

### 13. Search quality

**Current state:** FTS5 tables exist ([`db.rs:1388`](../src-tauri/src/db.rs#L1388), [`1396`](../src-tauri/src/db.rs#L1396)) but use the default tokenizer, no prefix index, and no ranking customization. "Contains" text filters likely fall back to `LIKE '%…%'`. There's no typo tolerance, so "Siouxie" won't find "Siouxsie".

**How to improve**
1. Add `prefix='2 3'` to the FTS tables so search-as-you-type is indexed.
2. Add trigram companion tables (`tokenize='trigram'`, available in the bundled SQLite) so **Contains** and **Does not contain** are index-backed.
3. Rank global search with `bm25()` and column weights (artist > album > title > genre > publisher).
4. Add "Did you mean…" over artist and album names, using Levenshtein distance with a length cutoff, or SQLite's `spellfix1` extension.
5. Index file paths only in a separate optional table. Today `track_search_fts` includes `file_path` and `filename`, which inflates the index and causes noisy matches.

---

### 14. Sidebar navigation structure

**Current state:** 19 flat sidebar destinations (Search, Charts, Published Charts, Timelines, Discovery, Music Map, Completion, Wish List, Playlists, Statistics, Updates, Albums, Artists, Genres, Tools, Imports, Settings, …) plus number and letter shortcuts. Everything is reachable, but the list is getting hard to scan.

**How to improve**
- Group the items into collapsible sections:
  - **Library:** Search, Albums, Artists, Genres, Playlists
  - **Explore:** Charts, Published Charts, Timelines, Discovery, Music Map, Statistics
  - **Grow:** Completion, Wish List, Updates
  - **Maintain:** Tools, Imports, Settings
- Let users pin, hide, and reorder items (stored in `AppSettings`).
- Pair this with the command palette (Part 2, #14) so nobody needs the long list to navigate.

---

### 15. Luna (AI) provider flexibility

**Current state:** Luna is hard-wired to one endpoint and model (`OPENAI_API_URL`, `OPENAI_MODEL = "gpt-5.6-luna"`, [`ai.rs:11-12`](../src-tauri/src/ai.rs#L11)). Jev separately uses OpenRouter ([`jev.rs:13-14`](../src-tauri/src/jev.rs#L13)). Token usage is shown per answer, but there is no running total or budget.

**How to improve**
1. Make **base URL and model** settings, with a provider dropdown: OpenAI, OpenRouter (key already stored for Jev), and Local. Ollama now serves an OpenAI-compatible `/v1/responses` endpoint (v0.13.3+) and supports JSON-schema structured outputs. Filter compilation (Search/Charts/Playlist recipes) is a good fit for a free, fully local model. Music Research still needs a provider with web search.
2. Keep the strict schema validation already in `ai.rs`. Local models follow schemas less reliably, so fall back to the cloud provider when local validation fails.
3. Add a **usage ledger** (a table of tokens and estimated cost per day and per feature) plus an optional monthly soft cap.
4. Cache filter compilations keyed by `(prompt, catalog_revision, model)` so repeated prompts cost nothing.

---

### 16. Folder sync and Aurora intake: more formats, watching, true incremental sync

**Current state:** folder import and Aurora intake read MP3 ID3 only and **reject non-MP3 audio** (README "Tagged album folder sync"), even though the app's own Deemix/Usenet flows produce FLAC. The README describes the folder bridge as "deliberately a whole-catalog operation", and SPEC Phase 20 (incremental sync) is still "Next".

**How to improve**
1. Replace the MP3-specific scanner core with `lofty`, which gives one API for ID3v2/v1/APE (MP3), Vorbis comments (FLAC/Ogg/Opus), and iTunes `ilst` (M4A). Keep the MusicBee-specific POPM, LOVE RATING, and DISPLAY ARTIST rules as a mapping layer on top.
2. Add an optional `notify`-based watcher on configured library roots. It wouldn't apply anything automatically. It would mark changed album folders "dirty" and offer **Review changes** using the existing scoped-sync transaction, which Aurora `syncExistingFolders` already proves out.
3. For true incremental intake, extend the scoped album transaction (already used for Remove Album and rating edits) to cover add and replace without whole-catalog staging. Keep a full-staging path as an explicit "Deep reconcile" action.

---

### 17. Published Charts as a data pack; release channels

**Current state:** `src-tauri/resources/published-charts` is **88 MB** (86 per-year gzipped CSVs) and ships inside every installer. With about 130 releases in two months, each in-app update re-downloads that payload even though the chart data almost never changes.

**How to improve**
1. Publish the chart bundle as a separately versioned GitHub release asset: `charts-<date>.tar.zst` plus a signed `manifest.json` with a SHA-256 for each file. On first use (Published Charts and Chart Busters already "prepare automatically on first use"), download it, verify it, and import it. Updates then shrink to the app binary.
2. Add **Stable** and **Beta** update channels (two `latest.json` endpoints). Batch most patch releases into Beta and promote weekly. The `check:version` and release-notes scripts can stay as they are.
3. Show an in-app **What's new** popover with the CHANGELOG section after each update (the release workflow already extracts it).

---

### 18. macOS parity

**Current state**
- `keyring` is compiled with only `windows-native-keyring-store` ([`Cargo.toml:29`](../src-tauri/Cargo.toml#L29)), but universal macOS DMGs ship. Saving OpenAI, OpenRouter, Last.fm, Discogs, and other keys on a Mac is therefore unlikely to work. The error text also says "Windows Credential Manager" ([`ai.rs:796`](../src-tauri/src/ai.rs#L796)).
- The Aurora intake roots are compile-time constants: `D:\MUSIC`, `G:\_BACKUP\SCORES`, `H:\Synthwave`, and `D:\MUSIC_NOT_ALBUMS` ([`aurora_bridge.rs:831`](../src-tauri/src/aurora_bridge.rs#L831), [`2689-2699`](../src-tauri/src/aurora_bridge.rs#L2689)). Env var overrides exist only for tests.

**How to improve**
1. Enable the Apple Keychain store for `keyring`. Check the v4 feature or companion-store name; the store crates were reorganized in v4. Use platform-neutral wording ("system keychain").
2. Move the category roots into **Settings → Data & Backups → Library roots**, validated with the same canonicalization and verbatim-path logic the bridge already uses. Expose them through the bridge `capabilities` response so Aurora can display them.

---

### 19. Music Map offline basemap

**Current state:** the map depends on `tiles.openfreemap.org` (CSP in `tauri.conf.json`). Offline, the country and area aggregates have no basemap, which goes against the "local-first" principle.

**How to improve:** bundle or download once a small low-zoom world basemap as a **PMTiles** file (Protomaps; z0–z6 is a few MB) and load it with the `pmtiles` MapLibre protocol. Use OpenFreeMap when online for higher zoom levels and the local file otherwise. Keep the OpenStreetMap attribution.

---

### 20. Documentation structure

**Current state:** `README.md` is 172 KB. Its first ~35 lines are version-specific release notes, followed by deep protocol detail (Aurora bridge, SMB sync, chart parsing) and "Phase N" history. It is hard to tell how to use a feature from what changed in a given version. `CHANGELOG.md` is 192 KB.

**How to improve**
1. Keep `README.md` to about 2 pages: what the app is, install, run, and links.
2. Move the user guide into `docs/guide/` with one page per workspace, ideally rendered with mdBook or VitePress and linked from the app's **Help** menu.
3. Move protocol specs (Aurora bridge, database sync script) to `docs/reference/`, and phase history to SPEC.
4. Change the AGENTS.md rule from "update README" to "update the relevant guide page", which keeps release-note prose out of the README.

---

## Part 2: 20 features worth adding

### Quick index

| # | Feature | Builds on | Effort |
| --- | --- | --- | --- |
| 1 | Listening history (Tonehavn, Last.fm, ListenBrainz, Aurora) | Last.fm credentials and Aurora bridge already exist | M |
| 2 | Year in Review and taste drift | `rating_events`, `rating_snapshots`, `library_updates` | M |
| 3 | Loudness (ReplayGain/R128), BPM, and key | Music Doctor quality tables, `symphonia` | M |
| 4 | "Sounds like" similarity and sonic-path playlists | Playlist Builder, Mixtape | L |
| 5 | Audio-based genre/mood suggestions | Music Tools review flow | L |
| 6 | Acoustic fingerprints: duplicates and identity checks | Music Tools, Aurora intake | M |
| 7 | Synced lyrics and lyrics search | Album and track panes, FTS5 | M |
| 8 | New-release radar | Wish List, Daily Edition | S–M |
| 9 | Concert and setlist insights | Artist pages, playlists | M |
| 10 | Better artist imagery (Wikidata, fanart.tv) | Biography's MBID → Wikidata resolution | S–M |
| 11 | Critic and canon list completion | Library Completion | M |
| 12 | Physical collection (formats, Discogs collection) | Discogs credentials | M |
| 13 | Wish List prices and legitimate purchase links | Discogs, Wish List | M |
| 14 | Command palette (Ctrl/⌘+K) | Navigation, saved searches, Luna | S–M |
| 15 | "Play in…" handoff and deep links | Aurora, Tonehavn | S–M |
| 16 | OS notifications and tray quick actions | Tray icon, job system | S |
| 17 | Personal listening diary: notes, tags, reviews | Album and Artist pages | M |
| 18 | Your library as an MCP server | Luna's bounded inspection tools | M |
| 19 | Playlist sync to Navidrome/Jellyfin; M3U8 import | Saved playlists and local exports | M |
| 20 | Off-machine verified backups | `db/backups.rs` | S–M |

---

### 1. Listening history

**Why:** the app knows what you **own** and how you **rated** it, but not what you **play**. That is the biggest missing signal in a ratings-and-discovery app. It would enable:
- most and least played lists,
- "rated 5★ but not played in 3 years",
- play-weighted Album Score,
- "rediscover" shelves in the Daily Edition.

**How to build it**
- **Last.fm:** `user.getRecentTracks` (the API key is already stored). Match on artist/title with the identity module (Part 1 #10).
- **ListenBrainz:** `GET /1/user/{user}/listens` (min_ts/max_ts paging), often with MBID mapping.
- **Aurora:** add a `recordPlays` bridge operation, or have Aurora write a small plays file that Music Library ingests.
- Store everything in a `plays(track_key, played_at, source)` table with dedupe across sources.

### 2. Year in Review and taste drift

**Why:** `rating_events`, `rating_snapshots`, and `library_updates` already hold a time series of your taste: albums added, ratings given, genres growing. Nothing surfaces it as a story yet.

**How:** add a **Year in Review** page (any year or a rolling 12 months):
- albums added, new artists, ratings given, completion gained, top genres,
- biggest rating changes,
- with listening data (#1): most played and "discovery of the year".

Also add a **taste drift** chart (genre share of 4★+ ratings by year). Export as Markdown (an exporter exists) and as a shareable PNG card.

### 3. Loudness, BPM, and key analysis

**Why:** the README says the mixtape sequencer works "without audio analysis or beat-matching", and Music Doctor reports only format and bitrate.

**How**
- Decode with `symphonia` (already a dependency).
- Measure EBU R128 integrated loudness and true peak with the `ebur128` crate. Album gain comes from `loudness_global_multiple`; use ReplayGain 2.0's −18 LUFS reference.
- Add BPM and key estimation, either local or seeded from Deezer's free public `/track/{id}` `bpm` field. Deezer's values can be halved or doubled, so treat them as hints.
- Use it to:
  - flag clipped or over-compressed releases in Music Tools ("Loudness war" view),
  - enable tempo-aware and loudness-matched mixtape transitions,
  - optionally write ReplayGain tags for Aurora and Tonehavn.

### 4. "Sounds like" similarity

**How**
- Compute a per-track audio embedding locally:
  - `bliss-audio` is pure Rust and fits directly. It is **GPL-3.0**, so check that against how you distribute the app.
  - Alternatively, run Essentia's Discogs-EffNet ONNX model through the `ort` crate.
- Store vectors in SQLite with `sqlite-vec` (`vec0` virtual table, KNN via `MATCH … ORDER BY distance`).
- Features this enables:
  - "More like this track/album" from library items only,
  - **sonic paths** (a playlist that walks from track A to track B),
  - "similar albums I haven't rated",
  - a sonic signal blended into Discovery shelves alongside Last.fm similarity.
- Run analysis as a resumable background job (Part 1 #6); 1.1M tracks is a multi-day first pass, so prioritize rated and loved albums first.

### 5. Audio-based genre and mood suggestions

**Why:** canonical genre drives most of the app's filters, and Music Tools already has a reviewed-repair workflow.

**How:** Essentia's Discogs-EffNet embeddings plus classification heads (400 Discogs styles; mood heads like happy/aggressive/relaxed; danceability; voice/instrumental). Show the top-3 suggestions per album as **review-only** findings ("albums tagged *Misc* whose audio scores 0.8 *Synth-pop*"). Never apply them automatically. Model weights are CC BY-NC-SA, which is fine for personal use.

### 6. Acoustic fingerprints: duplicates and identity checks

**How:** compute Chromaprint fingerprints locally (`rusty-chromaprint`, or the newer `chromaprint-next`, which claims bit-identical output to the C library) and use them to:
- find the **same recording** across albums (compilation, remaster, and soundtrack duplicates) to inform Library Trimmer decisions,
- detect **mislabeled files**, where tags say one song and the audio is another,
- optionally look up AcoustID to get recording MBIDs, which strengthens MusicBrainz matching.

### 7. Synced lyrics and lyrics search

**How:** LRCLIB is free and needs no key. Look up by artist, title, album, and duration (within ±2 s); the service can return synced LRC. It also publishes **full SQLite dumps**, which fits "local-first": import the dump once and do lyric lookups offline.

You get:
- a lyrics tab on the track and album panes,
- a local **lyrics full-text search** in FTS5 ("which of my songs mention *Oslo*?"),
- optional `.lrc` sidecar export for Aurora, Tonehavn, and Navidrome.

### 8. New-release radar

**How:** for artists you own (or rate highly) and artists on the Wish List, check:
- ListenBrainz **fresh releases**: `/1/explore/fresh-releases/` (up to 90 days), or the per-user endpoint,
- or MusicBrainz release-group browse by artist, sorted by first-release date.

Show a **New & upcoming** shelf in the Daily Edition and a weekly digest, with one-click **Add to Wish List**. Note that ListenBrainz started requiring auth tokens on some endpoints in Sept 2026, so support an optional user token.

### 9. Concert and setlist insights

**How:** setlist.fm's API is keyed by MusicBrainz MBID, which the app already stores; it is free for non-commercial use with a key and requires attribution. Per artist you can show:
- which of your owned songs they actually play live (ranked by frequency, compared with your ratings),
- "first and last performed",
- a **"Live-show prep" playlist** built from recent setlists matched to your library.

### 10. Better artist imagery

**Why:** Last.fm stopped serving real artist photos years ago. The app correctly rejects its placeholder hash ([`lastfm.rs:48`](../src-tauri/src/lastfm.rs#L48)), so many artists probably fall back to album covers.

**How**
1. **Wikidata `P18` (image):** the biography feature already resolves MBID → Wikidata, so fetching the Commons image (with its license and attribution) is a small addition.
2. **fanart.tv:** keyed by MBID; offers artist thumbnails, HD logos, and backgrounds. A free personal API key bypasses project rate limits.

HD logos and backgrounds would also look good in Career Peaks and on Artist pages.

### 11. Critic and canon list completion

**Why:** Library Completion is built around charts. Collectors also chase canon lists such as "1001 Albums…", Rolling Stone 500, Grammy winners, Spellemann (Norwegian awards), and Mercury Prize.

**How:** MusicBrainz models curated lists as **Series** entities, and Wikidata holds awards (`P166` award received, `P1411` nominated for). Import a list as a new "source" in the existing Coverage Atlas and Workbench. The decision, verification, and Wish List handoff flows already exist.

### 12. Physical collection

**How:** add an optional per-album **formats owned** field (digital, CD, vinyl, cassette) with notes. Import your **Discogs collection** (`/users/{user}/collection/folders/0/releases`) and match it to library albums. Reports:
- "on vinyl but not digital",
- "digital-only favorites you might want on vinyl",
- collection value (Discogs `collection/value`).

### 13. Wish List prices and legitimate purchase links

**How**
- For Wish List albums with a Discogs master or release, show Discogs `GET /marketplace/stats/{release_id}` (lowest price, number for sale) and community have/want counts. Add optional price-drop notifications (#16).
- Use Odesli/song.link to turn one known link into Bandcamp, Apple Music, Amazon, and other store links.

### 14. Command palette (Ctrl/⌘+K)

**What:** one fuzzy-search box that jumps to any workspace, album, artist, genre, saved search, saved chart, playlist, or setting, and runs actions ("Import covers", "Check for updates", "Rebuild chart links"). Typing `?` passes the text to Luna.

**How:** the FTS5 index plus a small static action registry; render with a lightweight list (or `cmdk`). Show recent items when the box is empty.

### 15. "Play in…" handoff and deep links

**Why:** Music Library has no audio playback. When you find something you want to hear, you leave the app and search again.

**How**
- Add **Play in Aurora / Tonehavn** buttons on album, track, and playlist rows: an Aurora bridge request, a Tonehavn handoff, or the system default handler.
- Register a `musiclibrary://album/<id>` URL scheme (`tauri-plugin-deep-link`, plus `tauri-plugin-single-instance` so links reuse the running window). Aurora, Markdown exports, and Luna answers can then link straight into the app.

### 16. OS notifications and tray quick actions

**How:** `tauri-plugin-notification` for "Import ready to review", "Verification finished: 214 verified", "Update installed", and wish/price alerts. Give the existing tray icon a menu: Open, Quick search, Check for updates, Activity, Quit. Notifications only work for installed builds on Windows, which suits a release-installed app.

### 17. Personal listening diary

**What:** something like Letterboxd for albums:
- dated "listened" entries,
- free-text personal reviews and notes,
- custom personal tags ("road trip", "rainy day", "to revisit") that work as Search filters.

Store everything in app-owned tables (the same pattern as the MusicBrainz overlay), include them in backups, make them full-text searchable, and export them as Markdown. Luna's current-view tools could summarize your own notes on request.

### 18. Your library as an MCP server

**What:** a `music-library.exe --mcp` mode (like the existing `--aurora-bridge` mode) that exposes **read-only** tools over stdio using the official Rust SDK (`rmcp`). Any MCP client (Claude Desktop, IDE agents) could then answer questions with your real library.

**Why it fits:** `ai.rs` already defines bounded local tools (`inspect_current_view`, `inspect_library_profile`, `inspect_selected_library_context`) with the right privacy limits: no paths, no raw SQL, capped name lists. Wrap those same functions as MCP tools; don't open the database more widely.

### 19. Playlist sync to more targets; M3U8 import

**How:** build a `PlaylistTarget` trait around saved playlists, with a managed-playlist marker and add/remove/reorder operations limited to playlists owned by Music Library. Add:
- **Navidrome/OpenSubsonic** (`createPlaylist` / `updatePlaylist`),
- **Jellyfin**.

Also add **Import M3U8**: match paths to catalog tracks and save the result as a playlist. This opens up playlists made in MusicBee, Aurora, or elsewhere.

### 20. Off-machine verified backups

**Why:** rolling backups and pre-import snapshots are excellent, but they live under app data on the **same disk**, and the README itself notes the disk-failure risk. The multi-PC SMB copy script shows how valuable this catalog is.

**How:** add a second backup destination (another drive, a NAS share, or a Syncthing folder):
- write each backup with `VACUUM INTO` (a consistent copy without holding a long lock),
- compress with zstd, with optional encryption (age/rage),
- verify by opening the copy and running `PRAGMA quick_check`,
- keep the existing retention policy, and add a scheduled "restore drill" that test-opens the latest offsite copy.

### Also worth considering

- **Library Trimmer inside the app:** the Python Trimmer reads the app's database and produces approval CSVs (several trim manifests are currently in the repo root). A Music Tools "Trim review" view using the same reviewed, journaled, undoable pattern would replace the CSV round-trip.
- **Read-only phone view over Tailscale:** the web-preview frontend already exists. A read-only LAN or Tailscale endpoint with auth would let you browse the catalog from a phone.
- **Rating sprint mode:** a keyboard-driven queue of partially rated albums, combined with "Play in Aurora" (#15), to work through the Year Ledger backlog.

---

## Part 3: Online services, APIs, and libraries

I checked the current status of each item below online in October 2026. Each entry says how it helps this app and any caveats.

### A. Data services and APIs

| Service | What it gives this app | Access and caveats |
| --- | --- | --- |
| **[ListenBrainz API](https://listenbrainz.readthedocs.io/en/latest/users/api/core.html)** | Listening history import (Part 2 #1); fresh releases (#8); open similar-artist and similar-recording data on the [Labs API](https://labs.api.listenbrainz.org/), an alternative or supplement to Last.fm similarity | Free and open. As of Sept 2026 [some endpoints reject anonymous callers](https://github.com/famesjranko/musicmeta/pull/339), so support an optional user token |
| **[LRCLIB](https://lrclib.net/docs)** | Synced and plain lyrics (#7); **full SQLite dumps** for offline use | No key, generous rate limit; send a descriptive User-Agent ([HN launch post](https://news.ycombinator.com/item?id=39480390)) |
| **[setlist.fm API](https://api.setlist.fm/docs/1.0/resource__1.0_search_setlists.html)** | MBID-keyed setlists (#9) | Free API key for non-commercial use; requires attribution with a followable link |
| **[fanart.tv API](https://github.com/fanart-tv/fanart.tv-api)** | Artist thumbnails, HD logos, backgrounds, album and CD art by MBID (#10) | Project key required; a personal key bypasses project rate limits ([npm client](https://www.npmjs.com/package/@fanart-tv/api)) |
| **[Discogs API](https://www.discogs.com/developers)** (marketplace, collection) | `marketplace/stats` lowest price and number for sale (#13); collection import and value (#12) | The app already has a Discogs credential flow; collection endpoints need user auth (OAuth or a personal token) |
| **[Deezer public API](https://deezer-python.readthedocs.io/en/stable/api_reference/resources/track.html)** | Per-track `bpm` and `gain` without auth (#3), plus ISRC and contributors | Only on `/track/{id}`, not on list responses; [BPM can be halved or doubled](https://octogene.github.io/deezer-bpm/) |
| **[Odesli / song.link](https://github.com/icco/odesli)** | Cross-store purchase and listen links (#13) | Free tier about 10 req/min; API key for more |
| **MusicBrainz [JSON dumps](https://musicbrainz.org/doc/Development/JSON_Data_Dumps) / [musicbrainz-docker mirror](https://github.com/metabrainz/musicbrainz-docker)** | Rebuild and refresh the local `musicbrainz_cache.db` from dumps instead of thousands of 1 req/s API calls; a replicated mirror removes rate limits entirely | Core data is CC0. A mirror needs about 100 GB of disk without search; [dumps are updated regularly](https://data.metabrainz.org/pub/musicbrainz/data/) |
| **MusicBrainz API (already used)** | — | Follow the [rate-limit rules](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting): 1 req/s per IP average, User-Agent with contact info, and **503 to all requests while over the limit** (see Part 1 #1) |
| **Wikidata (already used for biographies)** | `P18` artist images (#10); `P166`/`P1411` awards for canon lists (#11) | Free; Commons images carry per-file licenses that need attribution |
| **Cover Art Archive (already used)** | Fill **missing covers** for library albums with a known release-group MBID (Music Tools already lists albums with no cover) | Free; ready-made 250/500/1200 px thumbnails |
| **Apple Music API** *(worth a look)* | Album editorial notes and high-resolution artwork | Needs an Apple Developer Program membership, which you already have for notarization, and a MusicKit token. I did not verify specific fields; check before building on it |

**Avoid, or don't rely on**

- **Spotify Web API.** Developer Mode now [requires the app owner to have Premium, allows 5 users, and has removed more endpoints](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide) ([TechCrunch](https://techcrunch.com/2026/02/06/spotify-changes-developer-mode-api-to-require-premium-accounts-limits-test-users/)). Audio features, recommendations, and related artists have returned 403 for new apps since Nov 2024, and extended quota requires 250k+ monthly users. The app's current Spotify-free design is the right call; for audio features use local analysis (Essentia, bliss, ebur128) instead.
- **AcousticBrainz.** It stopped collecting data in 2022; only static historical dumps remain.

### B. Rust libraries

| Crate | Use in this app | Notes |
| --- | --- | --- |
| **[`lofty`](https://docs.rs/lofty)** | One tag reader for MP3/FLAC/M4A/Opus/WAV (Part 1 #16); could replace `id3` + `metaflac` | MIT/Apache-2.0; ID3v2-in-FLAC is read-only |
| **[`ebur128`](https://crates.io/crates/ebur128)** | R128 loudness, true peak, album gain (Part 2 #3) | Pure-Rust port of libebur128; passes EBU TECH 3341/3342 tests |
| **[`bliss-audio`](https://docs.rs/bliss-audio/)** | Song similarity and sonic-path playlists (Part 2 #4) | **GPL-3.0**; supports a Symphonia decoder feature; includes a `Library` helper that stores analyses |
| **[`rusty-chromaprint`](https://github.com/darksv/rusty-chromaprint) / [`chromaprint-next`](https://github.com/attilagyorffy/chromaprint-next)** | Acoustic fingerprints and duplicate detection (Part 2 #6) | Both pure Rust; chromaprint-next is newer and claims bit-identical output to the C library |
| **`ort`** (ONNX Runtime) | Run Essentia Discogs-EffNet [ONNX models](https://essentia.upf.edu/models/music-style-classification/discogs-effnet/) for embeddings and genre/mood heads (Part 2 #4, #5) | Model weights are CC BY-NC-SA 4.0 (non-commercial) |
| **[`sqlite-vec`](https://alexgarcia.xyz/sqlite-vec/rust.html)** | Vector KNN inside the existing SQLite database (Part 2 #4) | Pre-v1; brute-force KNN. [`sqlite-vector-rs`](https://lib.rs/crates/sqlite-vector-rs) adds HNSW if needed |
| **[`tauri-specta`](https://github.com/specta-rs/tauri-specta)** | Generated TypeScript bindings for 266 commands (Part 1 #9) | v2 is still an RC, so pin exact versions; [tauri-typed-ipc](https://github.com/johncarmack1984/tauri-typed-ipc) is an alternative |
| **[`rmcp`](https://github.com/modelcontextprotocol/rust-sdk)** | `--mcp` stdio server mode (Part 2 #18) | Official MCP Rust SDK; read its 3.x migration notes |
| **`tracing`** + `tracing-appender` | Structured logs and slow-operation spans (Part 1 #11) | Or use `tauri-plugin-log` |
| **`image`** + **`fast_image_resize`** | Cover thumbnail cache (Part 1 #2) | — |
| **`notify`** | Library folder watching (Part 1 #16) | — |
| **`r2d2_sqlite`** | Connection pooling (Part 1 #3) | Or a hand-rolled pool |
| **`rusqlite_migration`** | Declarative migrations (Part 1 #8) | — |
| **`serial_test`**, **`criterion`** | Selective test serialization and benchmarks (Part 1 #12) | — |

### C. Tauri plugins (official)

All of these are in [tauri-apps/plugins-workspace](https://github.com/tauri-apps/plugins-workspace) ([plugin index](https://v2.tauri.app/plugin/)):

- **[notification](https://v2.tauri.app/plugin/notification/):** job completion and price alerts (Part 2 #16). On Windows it only works in installed builds.
- **[deep-link](https://v2.tauri.app/plugin/deep-linking/)** + **single-instance:** `musiclibrary://` links (Part 2 #15). Register single-instance first, with its `deep-link` feature.
- **[global-shortcut](https://v2.tauri.app/plugin/global-shortcut/):** a system-wide "Quick search the library" hotkey.
- **[log](https://v2.tauri.app/plugin/logging/):** unified Rust and JS logging (Part 1 #11).

### D. Frontend libraries

| Library | Use |
| --- | --- |
| **[@tanstack/react-virtual](https://tanstack.com/virtual/latest/docs/framework/react/react-virtual)** | Table virtualization (Part 1 #4). Use ≥ 3.14.13 for the [React 19 `flushSync` fix](https://github.com/TanStack/virtual/pull/1282) |
| **zustand** (or `useReducer` + context) | Per-workspace stores (Part 1 #7) |
| **cmdk** | Command palette (Part 2 #14) |
| **pmtiles** + Protomaps basemap | Offline Music Map (Part 1 #19) |
| **Playwright** | Web-preview end-to-end tests (Part 1 #12) |

### E. AI providers

- **[Ollama](https://docs.ollama.com/api/openai-compatibility)** now exposes OpenAI-compatible `/v1/chat/completions` and `/v1/responses` (v0.13.3+) and supports [JSON-schema structured outputs](https://docs.ollama.com/capabilities/structured-outputs). Pointing Luna's filter compilation at a local model would cost nothing and keep everything on the machine (Part 1 #15). Keep the existing strict validation; local models follow schemas less reliably.
- **OpenRouter** is already integrated for Jev. Reusing its key for Luna would let you choose models per task from one account.

---

## Suggested order

| Phase | Items | Why |
| --- | --- | --- |
| **Quick wins (1–2 days)** | Part 1: #1 (shared MusicBrainz gate + User-Agent), #5 short-term timer fix, #18 Keychain feature. Part 2: #16 notifications, #10 Wikidata `P18` images | Small changes that fix real reliability issues or noticeably improve the UI |
| **Performance pass** | Part 1: #3 connections, #2 covers, #4 virtualization, #13 search | The app feels fast at 1.1M tracks; benchmark with Performance Proof |
| **Foundations** | Part 1: #6 job system, #10 identity, #9 bindings, #11 logs, then #7/#8 decomposition step by step | Makes every later feature cheaper and reduces regressions |
| **New signal** | Part 2: #1 listening history, #2 Year in Review, #3 loudness/BPM, #7 lyrics, #8 release radar | Large user-visible value, mostly reusing existing integrations |
| **Ambitious** | Part 2: #4/#5 audio embeddings, #6 fingerprints, #18 MCP server, Part 1 #16 multi-format intake | The most differentiated features; build them on the job system |
