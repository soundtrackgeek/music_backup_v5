# Local sonic analysis

Music Library owns analysis and Aurora reads completed results. MP3 files and
the music catalog are never rewritten by analysis. Start with an album's
**Analyze this album** button, or **Tools → Audio analysis → Analyze favorites**.
Favorites means loved tracks or tracks rated at least four stars. **Analyze
library** queues every cataloged MP3. New imports need a new analysis batch.

## Idle time and scheduling

Windows defaults to starting new files only after five minutes without keyboard
or mouse input. Save a different threshold (1–120 minutes) or disable idle-only
analysis. Optionally restrict work to local hours, for example 22:00–08:00;
midnight-spanning windows are supported and the ending hour is exclusive.
Both conditions must be satisfied when both are enabled. Starting album,
favorites, or library analysis saves the settings shown on screen before
queueing the job. Use **Save schedule** to apply changes to an existing job.
If saving fails, analysis is not queued. Settings are durable and a running job
checks them before its next file; Activity Center changes from **Waiting** to
**Analyzing** before processing that file. A file already being
analyzed can finish when you return to the computer.

Keep Music Library running (minimized is fine) and the computer awake. This
release does not install a Windows service, wake sleeping computers, or change
power settings. Windows idle detection measures keyboard/mouse input; watching
a video without input can count as idle. On macOS, use the time window or manual
Activity Center controls; automatic input-idle detection is Windows-only.

One file runs at a time in an isolated analyzer process; its DSP stages can use
multiple cores. Windows gives that process below-normal priority. Music Library
continues to handle other Activity Center jobs while analysis waits. Pause,
resume, cancel, and retry in Activity Center. Completed files survive pauses,
restarts, cancellation, and failed batches; retry retains completed checkpoints.

### Remaining time and failures

The estimate measures successful new analysis in the current run. Cached skips,
failed files and previous checkpoints do not increase the measured processing
rate. It appears after three successful samples and clears while waiting for
idle/scheduled hours or after a failure. Resume starts a fresh measurement.
The estimate describes active processing time; it does not predict when the
computer will next be idle. Remaining queued files are conservatively treated
as needing analysis until checked, so more cached results can shorten the run.

Ten failed attempts without successful new analysis stop the job with the last
file/error in Activity Center. Completed results and unprocessed checkpoints
remain saved. Check the analyzer or affected files, then **Retry** the same job.
Music Library 0.185.1 enables MP3 metadata readers for ID3 tags and large covers;
this fix reuses existing features and does not require a full reanalysis.

## Results you can use immediately

In Music Library's **Discovery → Because You Played / Loved**, sound neighbors
blend with cached Last.fm and genre evidence. The **Similar unrated albums** tab
uses high-score or loved albums as anchors and requires zero rated tracks on
every suggestion. Played/Loved continue to accept albums under 50% rated.
Recommendations exclude recent albums and every anchor artist, and rotate across
anchors and candidate artists. Agreements between sound and Last.fm rank first;
every third mixed suggestion slot starting with the second prefers a sound link
when the current anchor has one. **See all → Connection → Sonic similarity**
filters sound links, including recommendations also supported by Last.fm.

Sound evidence requires the current analysis profile, current local files, at
least 50% MP3 coverage and at least three analyzed tracks (all tracks for smaller
albums). Imported fingerprints alone are insufficient until local paths have
been verified. Up to eight anchors share one analyzed-path scan, with 12 nearest
eligible neighbors each and a maximum 48-album verification shortlist per anchor;
overlapping shortlists share file verification. Distances are used for ordering,
not presented as similarity percentages. These are a bounded discovery pool,
not an exhaustive list of all analyzed albums.

The shelf reports coverage or an unavailable-cache explanation. Start or resume
analysis in Tools, then refresh suggestions to use newly completed work. Today's
Daily Edition stays saved until explicit refresh; older snapshot formats upgrade
once for today, while archived editions keep their original evidence.

Each successful file is published to `music-analysis.sqlite3` beside the Music
Library catalog. `sonic-work.sqlite3` keeps batches, per-file errors, and schedule
settings. `sonic-worker.lock` enforces one writer across GUI and headless bridge
processes; its OS lock is automatically released after a crash.

**Sounds like** lists recently analyzed seeds, finds similar current library
tracks, and saves a playlist in the existing Playlists workspace. Album Artist
and Track Artist stay distinct. Aurora's Track sidebar has **More like this**,
rating/genre filters, and **Start sonic radio**. Radio excludes Ban tracks and
current Aurora pending rating/Love edits, limits each refill to three tracks per
artist and two per album, and refills before the queue runs out. The seed,
filters, and queued identities persist across restarts. Start a new station after
the bounded 1,900-track session. Starting another playback queue ends the station.

In Aurora Songs search, `sonic:yes` selects tracks with saved results for the
current profile; `sonic:no` selects tracks without them. They combine with other
search fields and boolean operators. Albums/Artists qualify through matching
tracks; `sonic:no` includes albums with any unanalyzed track. Counts and searches
describe saved coverage, rather than scanning every music file for freshness.
Similarity checks seed and shortlisted candidate file size/time observations
and excludes missing or changed files until they are reanalyzed.

## Album similarity

In **Albums**, select an album and use **Sounds like this album → Find similar
albums**. Open a result to inspect it. Music Library 0.179.0 and Aurora 0.30.0
reuse the existing compatible MP3 features: no reanalysis is needed for this
feature. Every usable track has equal weight in the album's mean feature vector,
and the same profile-specific distance matrix ranks albums by that mean.

Choose at least **50%**, **80%**, or **Complete albums only**. Both seed and
matches must meet the chosen threshold and have at least three usable analyzed
tracks, or every track for one- and two-track releases. Counts are relative to
all cataloged MP3 tracks in the album. Banned, missing, changed, malformed, and
incompatible results do not contribute; results clearly label partial coverage.
Album IDs keep editions and identically named albums separate, including multi-disc
albums whose tracks share one catalog album ID. Album Artist supplies the label.

Rollups use a consistent read snapshot of the current catalog and saved results;
they are rebuilt on each request and become available as checkpoints accumulate.
Ranking streams one album at a time and retains a bounded shortlist. The seed
and every contributing file in shortlisted albums are checked for freshness,
and those album means are recalculated before final ranking. The displayed pool
count describes albums with enough saved analysis before these freshness checks.

Aurora's Album sidebar adds **More like this album**, with open/play actions and
**Start album sonic radio** after finding matches. Radio ranks individual tracks
against the seed album's mean, excludes the seed album's tracks, retains the
existing rating/genre/Ban filters and diversity limits, and persists the album
seed and coverage threshold. A running station refreshes its mean when it refills,
so further analysis of a partial seed is included. It remains anchored to that
album. Pending Aurora Ban edits also apply to album comparisons.

## Sonic journey playlists

Music Library **Playlist Builder → Sonic journey** and Aurora **Track sidebar →
Sonic journey** connect **2–10 ordered track stops**. Search analyzed tracks by
artist/title; Aurora can also add the currently selected track while you browse.
Add, remove, or reorder stops, then choose **1–10 connecting tracks between each
pair**. Five stops and three connectors per leg produce 17 tracks. Every chosen
stop remains in its original position relative to the other stops; tracks never
repeat across the journey. The maximum is 100 tracks.

Minimum rating and **first stop's genre** apply to connecting tracks. Explicitly
chosen stops can have other ratings/genres, but every stop and connector must
have compatible current MP3 analysis and must not be banned. Partial-library
analysis is enough; missing stop analysis and insufficient eligible connectors
are reported separately. The builder returns a complete journey or no playlist,
so it never silently drops a stop or reduces the requested length.

The shared math interpolates sound-feature waypoints between each stop, streams
analyzed candidates into bounded shortlists, and uses a bounded beam search to
balance adjacent sound changes and waypoint proximity. It is an approximation,
not a global shortest path or a promise of matched BPM/key or seamless mixing.
Only stops and shortlisted files are checked for freshness, keeping memory and
filesystem work bounded as the library grows. No decoding or full reanalysis is
required. Browser previews use sample analysis rather than real music files.

Review the complete numbered playlist, name it, and choose **Save journey
playlist**. The exact reviewed sequence is revalidated and saved as an ordinary
Music Library playlist, not regenerated at save time. Changed/missing/banned
tracks require a new preview. Aurora honors pending Ban/rating edits when
building and revalidating; the companion also checks its catalog on save, so
pending changes may need to finish syncing first. Aurora can **Play journey**
with shuffle disabled and radio stopped. Its draft survives track selection
changes in the running app. Music Library 0.180.0 is required for Aurora's save
bridge; Aurora 0.31.0 adds the journey controls.

## Reuse and reproducibility

Saved journeys keep their reviewed order. Smart refresh is unavailable for these
playlists because rebuilding from ordinary catalog filters would lose their
chosen stops and sonic connections.

Audio identity is SHA-256 over the MP3 payload, excluding leading ID3v2 and
trailing ID3v1/APE tags. Retagging does not require decoding again. Current file
observations avoid even hashing unchanged paths. Changed paths are hashed again;
identical audio can reuse saved features. Numeric catalog IDs are resolved at
query time, so reimporting does not bind results to another track. A moved file
can reuse its audio after it is queued at its new cataloged path.

The fixed profile is `bliss-0.13.0-symphonia-0.6.1-v2-full-mp3`: full-file
Symphonia 0.6.1 decoding and Bliss 0.13.0 feature version 2 (23 values), with
Bliss's profile-specific weight matrix stored alongside results. Profile
mismatches are excluded. This is musical similarity, not an acoustic duplicate
fingerprint. MP3s over 512 MiB and analyses exceeding three minutes per file are
reported as failures; failed files do not stop the remaining batch.

Nearest-track ranking currently streams analyzed vectors and keeps a bounded
candidate list. It does not load the million-track catalog into memory. This
release loads track display metadata only for final matches, counts album
coverage only in albums with analyzed paths, and clones journey metadata only
when shortlisted. All MP3s in a candidate album still count toward its coverage.
See [the native performance proof](sonic-performance.md) for measurements and
repeatable snapshot checks. This
release does not yet implement an approximate nearest-neighbor index.

## Backup and cross-PC reuse

Music Library 0.181.0 adds **Tools → Audio analysis → Backup and cross-PC reuse**.
The default destination is **OneDrive\\_musicbackup\\sonic-analysis**, beside the
other shared backups. OneDrive's configured Windows root is detected; if it is
unavailable, or on macOS, choose your synced folder using **Choose backup folder**.
You can also choose another drive or a share. Each backup has a unique name;
earlier backups and backups made by another computer are preserved.

1. On the source computer, select **Back up analysis**. The analyzer may remain
   running: the SQLite backup API pins one read view including committed WAL
   data. A self-contained `.sonic-backup` file is published only after snapshot
   validation and checksum calculation. Wait for OneDrive to finish uploading.
2. On the receiving computer, install Music Library 0.181.0 or newer and make
   your catalog and MP3s available at the cataloged paths. Download the archive
   in OneDrive (make it available offline). Choose **Choose backup to restore**
   and review its date, size and reusable audio count.
3. Pause any running analysis in Activity Center, then select **Merge this
   backup**. Restore checks the full archive again, including the reviewed
   checksum. Existing feature results are preserved, identical results are
   skipped, and conflicting features/weights abort and roll back the merge.
   Existing compatible features get a safety archive under the local app-data
   `backups/sonic-analysis` folder before merging.
4. Select **Verify reused analysis**. It saves the visible idle/hours settings
   and scans cataloged MP3s using the same pause/resume/cancel/retry controls as
   analysis. It fingerprints files and binds matching cached features to the
   current local path, catalog identity, size and timestamp. Each completed
   checkpoint immediately supports `sonic:yes`, similarity, radio and journeys
   in Aurora. Refresh coverage or rerun an Aurora search to see new results.

Verification has its own Activity Center entry, so an extraction job can remain
paused. The two jobs share one writer slot; resuming extraction while verification
runs queues it safely until verification finishes. Coverage reports the active
batch when an older extraction job resumes. Verification refuses an empty cache
before preparing a large queue.

Archives contain only compatible audio hashes, feature vectors and weights:
no music, catalog, device paths, numeric IDs, schedule, queues or credentials.
The format has an explicit archive/schema/profile version, 23 dimensions,
SHA-256, row/size bounds and integrity checks; unsupported, unsafe, truncated or
corrupt archives are rejected before merge. Hashing uses the MP3 audio payload,
so tag-only differences and different catalog IDs/root paths can reuse results.
Imported paths/timestamps are never trusted as proof of local analysis.

Verification still reads local audio, so a large library can require substantial
disk/network I/O. It never decodes or analyzes files missing from the restored
cache. Those remain unanalyzed; use normal favorites/album/library analysis when
ready. Normal analysis also uses the cache, so an existing paused job can simply
resume after restore. Cancel leaves merged features and verified checkpoints
intact. A cloud upload or real second-computer transfer is not confirmed merely
by successful local export. Use these archives instead of copying live SQLite
or WAL files.

### Automatic backups (0.182.0)

In the same panel, enable **Automatic backups**, set **Backup every (hours)**
(1–168, default **6**) and **Backups to keep** (1–1000, default **7**), and
select **Save automatic backup settings**. They use the folder shown above,
normally **OneDrive\\_musicbackup\\sonic-analysis**. Save again after choosing
a different folder. Automatic backup is initially off until you enable it.

Music Library must be open. The native scheduler checks once a minute;
enabling it or changing its folder/interval makes the first backup due immediately.
After a successful backup, the next deadline is the configured number of hours
after that run started. Deadlines survive restarts and sleep: an overdue backup
runs once when the app is available, rather than replaying every missed interval.
There is no Windows scheduled task or background service while the app is closed.
The analyzer can continue running during export, independently of its idle/hours
settings. Export failures (including no completed results or an unavailable
destination) keep existing archives and retry after five minutes; last/next backup
and errors are visible here. Disabling automatic backups stops future runs;
an export already in progress may finish.

After a new archive succeeds, retention keeps the newest configured number of
**this computer's automatic archives in the saved folder**. Ownership receipts
and full checksum/schema validation are required before pruning. Changed,
manual and other computers' archives are preserved, as are backups in previous
folders. Lowering retention takes effect after the next successful backup.
Modified or unreadable archives are released from automatic management and
preserved; the panel reports this so they do not block future retention.
Settings, deadlines and ownership records live in device-local
`sonic-backup-state.sqlite3`, excluded from portable archives. Manual backups
remain available and do not reset the automatic deadline. OneDrive's own client
performs upload; a locally saved backup still does not confirm cloud upload.

## Development and licensing

Similarity requests in Music Library 0.184.0 and Aurora 0.32.0 use a local
persistent index of completed vectors and album means. The first request builds
it in the background; recent checkpoints remain usable through a bounded delta
and full-scan fallback. Portable backups omit this disposable cache and receiving
PCs rebuild it. See [index operation and scale proof](sonic-index-performance.md).

`npm run sonic:prepare` builds the standalone `Tools/sonic-analyzer` executable
and copies a target-suffixed binary into `src-tauri/binaries` for Tauri bundling.
Universal macOS builds prepare both Apple Silicon and Intel sidecars as well as
the combined universal binary: Tauri validates the architecture-specific
sidecar during each Cargo build before packaging the universal app.
`npm run sonic:test` checks the independent MIT result/math contract against
Bliss's weighted distance and verifies analyzer packaging for macOS and Windows.
The applications use that small contract without
linking Bliss. The analyzer is GPL-3.0-only; its license and source notice ship
with Music Library. Its corresponding source, exact dependency lock, and build
script are available in the same release's GitHub source archive. See
[the analyzer notice](../Tools/sonic-analyzer/NOTICE.md). The process boundary is
an architectural choice, not a claim that it removes license obligations.

A 16-file pilot on the Ryzen 5 7600X computer averaged 0.454 seconds per file
(average catalog duration approximately 178 seconds) with compilation idle:
about 5.8 days of raw extraction for 1.1 million MP3s. Allow roughly 7–10 days of
continuous work, or 2–3 weeks at eight hours daily. This small, warm-cache sample
does not measure the full job's hashing/checkpoint overhead or the duration
distribution of the whole library; it is a planning estimate.
