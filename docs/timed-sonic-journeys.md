# A journey that fits your time

Shipped in Music Library 0.199.0, Aurora 0.44.0 and Tonehavn 0.52.0 (2026-10-23).

In **Playlist Builder → Sonic journey**, select **Fit my time**. Set 1–720
minutes and optionally an audio limit in MiB. Choose 2–10 ordered tracks:
the first opens the session, the last closes it, and interior tracks define
the sounds to visit along the way. Choose a contrasting middle example for
an adventurous detour. No semantic mood is inferred from the audio features.

An interior stop can expand to its **complete catalog album** (up to 120 tracks).
The block stays together in disc/track order, including the chosen stop.
Beginning and ending tracks stay outside that block. All required tracks need
current analysis, positive catalog durations, available files and distinct
identical-audio identities. A required block that overlaps another stop, contains
a repeated recording, is partly analyzed or exceeds the budget produces an
actionable error; it is never silently shortened.

The preview shows actual playing time, unused time, source-audio bytes, track
start times and the ending track. Whole tracks are never truncated. Changing
the route, filters, album choice or budget invalidates the preview. Saving uses
the exact reviewed track keys and revalidates current catalog IDs, duration,
file freshness, bans, connector filters, recording identity, stop order and
album contiguity. Saving does not rerun the planner or make a Smart playlist.

Aurora offers the same controls and planner in the track sidebar, and plays
the reviewed sequence through its existing playback route. Timed saves require
Music Library's advertised `timedSonicJourneysV1` capability. Older count-based
journeys retain their existing contract and behavior.

## Carry the approved version in Tonehavn

1. Save the journey in Music Library or Aurora.
2. Publish/refresh the linked catalog playlists in Tonehavn.
3. On the web, open **Trip Tape → Carry a reviewed journey**, find the linked
   playlist, choose it as the source, and set the time/storage limits.
4. Prepare, review and save. On iPhone, open **Downloads → Prepare a Trip Tape**,
   select this saved tape and use its existing Download control.

Trip Tape retains every position, the endpoint and the actual favourites share
by duration. It does not call Jev, add an album, refill or trim a reviewed
sequence. Its existing generated tapes retain their favourite-target behavior.
An over-budget or unavailable sequence is rejected before saving. New publication
evidence records the original playlist membership count before missing catalog
tracks are filtered, so an incomplete journey cannot pass as a complete one.
Older publications without this evidence need a playlist refresh/republication.
Trip Tape keeps its existing 15–720 minute and 32–16384 MiB input ranges;
a shorter journey can be carried within the minimum limit.

## Planner and limits

`music-sonic-core::timed_journey` is independent of SQLite and the decoder.
The adapter retrieves neighbors around nine interpolated points per leg from
the existing exact weighted index (128 neighbors per point). If the index is
unavailable, a bounded streaming fallback retains 64 candidates per nearest
point. Filters and freshness checks apply before the final pool. The planner
keeps up to eight distinct recordings per nearest point and at most 256 total
connectors, excludes required recording hashes, then packs complete catalog
seconds with a deterministic 0/1 knapsack. It maximizes used seconds within
that shortlist. Without a byte limit, sonic cost breaks duration ties; with a
byte limit, smaller byte totals dominate states, then sonic cost breaks ties.
Selected connectors follow their positions along each leg; required groups
remain indivisible.

This is a bounded sonic approximation, not the closest possible duration across
the entire library or a global minimum-jump path. Small or heavily filtered
pools can leave substantial unused time, including a route containing only
the required stops. Catalog durations have whole-second precision; player gaps,
crossfades and overhead can change wall-clock listening time. Storage totals
cover source audio, with extra space needed for download metadata/artwork.

The second report's idea 28 is applied only to **identical payload hashes**
already present in the current analysis store. Re-encodings, remasters and
near-twins remain unknown. No files or ratings are changed. Idea 27's calibrated
level estimate is separate work: existing ReplayGain/R128 player settings still
control gain. No new LUFS, beat, key, intro/outro or seamless-mixing claim is made.
Tonehavn's native timed authoring is separate; this release carries approved
desktop plans through the existing native saved-tape download path.

## Verification

Regression coverage checks packing against exhaustive small candidate sets,
exact and under-budget lengths, storage limits, preserved required stops and
album blocks, duplicate recording exclusion, unknown durations, stale media,
unchanged reviewed save/play order and preview invalidation. Tonehavn tests
cover complete imported order, idempotent save, over-budget rejection, missing
files and a source playlist member lost during publication. Browser validation
uses sample catalogs; these fixtures do not establish listening quality or
iPhone offline playback. Real listening comparisons and device acceptance remain
manual validation.
