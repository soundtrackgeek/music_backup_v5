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

## Results you can use immediately

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

## Reuse and reproducibility

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
release does not yet implement sonic A-to-B paths, an
approximate nearest-neighbor index, or cross-PC analysis snapshot publication.
Do not copy a live SQLite/WAL database to another computer; those snapshots need
a separate coordinated backup/export step.

## Development and licensing

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
