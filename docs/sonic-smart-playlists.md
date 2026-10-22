# Sonic Smart playlists

Music Library 0.198.0 and Aurora 0.43.0 implement opportunity 04 using the existing
whole-track analysis. No audio scan, provider call or tag write is required.

## Make a recipe

1. Open **Playlists → Create Smart playlist** (or **Edit rules**).
2. Enable **Sounds like these examples** and search by artist or song title.
   Add 1–8 current analyzed MP3 songs as positive examples.
3. Set **Maximum acoustic distance** (default 0.2) and **Maximum songs per track
   artist** (default 2). Lower distance means closer sound. It is not a percentage,
   mood, musical key or a reliable tempo label. A useful radius varies by seed.
4. Add native rules such as **Unrated only**, original years 1980–1989, genres,
   artist exclusions or ratings. Existing advanced rules survive editing. Original
   year stays separate from release/reissue year. Conflicting rules can return zero.
5. Choose the song limit (1–10,000) and **Manual** or **When the library changes /
   on open**, then save. The saved result opens for review and ordinary M3U8 export.

Matches must be within the radius of **at least one** example and satisfy **all**
native filters. This is a union of sound neighborhoods, not an averaged seed or
a requirement to resemble every seed. Examples are excluded from membership.
Artist caps use Track Artist, falling back to Album Artist when empty; one cap
applies across all examples. Results are nearest-example first, with stable file
identity breaking ties. The metadata Sort/Direction controls are disabled while
sound rules are active. Removing the sound option restores ordinary metadata rules.

## Refresh and failure behavior

Music Library is the only writer. Its automatic rules refresh after supported
library changes and in the background when its Playlists workspace opens or
regains focus. New analysis can enter on the next such refresh. **Refresh rules**
in either desktop app explicitly reevaluates even a manual recipe. Analysis
completion alone does not schedule a new playlist evaluation. Aurora needs the
Windows companion bridge for authoring; read-only catalogs retain published songs.

Saving or refreshing updates only the saved recipe/result. It does not call
playback or replace a playing queue. Aurora's existing revision guards still
apply if a consumer later requests another page of an older playlist revision.
Tonehavn can consume the published membership through its existing linked-playlist
workflow; this change does not add Tonehavn recipe editing or native sonic selection.

Every seed must still be present, unbanned, bound to the same audio payload and
have current compatible analysis. A seed failure stops the entire evaluation,
retains the last published membership/revision, and reports which example needs
attention. Repair/verify its analysis, or remove and choose a replacement explicitly.
Automatic refresh errors appear in Music Library and Aurora playlist details.

Candidate tracks with missing, invalid, stale or incompatible analysis are omitted,
as are banned songs and missing/changed files. Short results, including an empty
playlist, are valid and explicitly described as insufficient current matches.
The radius, filters and caps are never relaxed to fill the target.

## Versioned contract and selection

`smartSettings.sonic` contains `version: 1`, the exact `profile`, positive `seeds`
(`trackKey`, display title/artist and owner-bound `audioHash`), `maxDistance`,
`maxPerArtist` and `ordering: "nearest"`. Song limit and refresh policy remain in
the existing Smart settings. The profile is
`bliss-0.13.0-symphonia-0.6.1-v2-full-mp3`; distances use its published weights.
Unknown recipe fields, versions/profiles, invalid bounds and album-mode sound
recipes are rejected. Edit revision checks remain transactional.

Native filters use the same SQL predicates and joins as catalog browsing. The
exact shared index retrieves eligible neighbors around each example. Retrieval
expands until the frontier proves no unseen track can precede the last winner
(including deterministic ties), or all unseen tracks are beyond the radius.
Artist caps and freshness checks are applied before that proof. Sparse cases,
cold indexes and large expansions use the exact eligible baseline. Only winners
are hydrated through the native browse path. Analysis is attached read-only.

Aurora checks `sonicSmartPlaylistsV1` before sending `playlistSaveSmart`; older
companions cannot silently save a metadata-only substitute. Update both apps
before editing these recipes. Browser preview demonstrates the controls and
search, but explicitly requires desktop analysis for evaluation and saving.

Negative examples are deferred until their effect is understandable. Nudged seeds
(second-report 22), learned tags (26), alternate metrics, album seeds, duration
targets and automatic analysis-completion refresh are outside this version.

## Verification

Regression fixtures cover multi-seed union, native year/unrated rules, artist
caps, banned/stale exclusion, newly analyzed/imported membership, empty results,
manual policy, failed-seed result retention and revision conflicts. A warm-index
fixture with a dense same-artist neighborhood compares adaptive retrieval with
the exact full eligible scan, including ban/freshness changes. Editor tests cover
recipe persistence, preserved audio identities and discarded stale searches;
Aurora tests verify refresh never calls playback.

An opt-in read-only live probe on 2026-10-22 selected 30 unrated 1980s songs
from 27 track artists around a current Pet Shop Boys example, with the cap of two
per artist intact and zero catalog changes. The exact uncached baseline took
46.2 seconds under concurrent release checks; this is validation of constraints,
not an interactive performance promise. The indexed production path is separately
checked against exact selection in regression fixtures. No live playlist was saved.

After the catalog-first search change, the same native read-only probe found
current examples in 1.07 seconds and reproduced the same 30-song/27-artist
result (42.9 seconds for the deliberately unindexed selection baseline).
