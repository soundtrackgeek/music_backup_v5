# Hidden favorites

Shipped in Music Library 0.195.0 and Aurora 0.40.0 on 2026-10-22.
This implements opportunity **01** with the thin-history correction from the
second October sonic report. The first version recommends tracks, not albums.

Open **Discovery → Hidden favorites** in Music Library or **Ratings → Hidden
favorites**, next to Tonight's Album, in Aurora. Choose **Find hidden favorites**.
Use the title or either named anchor to inspect a track. Aurora also offers
**Play**, through its normal playback queue and tag projection.

**Keep for later** adds a track to the shared shortlist. **Not today** hides it
until the Music Library computer's next local calendar day; it does not change
ratings or teach the model that you dislike the track. Kept tracks survive
restarts and new shelves. **Save kept tracks as a playlist** creates a regular
Music Library playlist from the exact visible, reviewed shortlist, in that order.
The list supports up to 200 kept tracks; remove tracks after saving as desired.
Music Library remains the sole playlist writer. Existing playlist export and
Tonehavn publication can be used, but no Tonehavn-native shelf is included.

## Selection and evidence

- Up to eight current five-star or loved examples, from distinct reviewed album
  artist identities, supply sound anchors. Anchor choices rotate on explicit refresh.
- Reuse the current profile and its existing exact index to retrieve up to 512
  neighbors per anchor. Add a rotating sample of up to 12,000 eligible catalog
  tracks. A cold or incompatible index uses this sample while the existing
  index rebuild runs; it does not wait for a full-library analysis join.
- Sample up to 20,000 rated/loved catalog identities before fetching analysis,
  avoiding a full analysis/catalog join just to choose training examples. The
  analyzed members of this deterministic sample supply training and anchors.
  Training uses saved current-profile vectors without statting every training
  file; stale cache data can therefore affect the ranking prior until analysis
  catches up. Chosen anchors and suggestions receive filesystem freshness checks.
  Five-star tracks are positive examples;
  one-to-three-star tracks are negative examples; four-star tracks are not
  negative labels. Features are standardized, clipped and fitted with a
  class-balanced regularized logistic model (`hidden-logistic-v1`).
- Hold out approximately one fifth of album artists, using reviewed identities
  and a stable hash. Require at least five artists in each split, at least
  30 examples of each label in training, ten in validation, and held-out AUC
  of at least 0.60. Otherwise use favorite neighborhoods. All music families
  are pooled: this is a small ranking prior, not the complete opportunity 24
  model or a calibrated predictor. Strong/Possible/Stretch bands use internal
  score cutoffs of 0.65 and 0.40. They do not predict stars or enjoyment probabilities.
- Fit and distance to the nearest two anchors rank the four fit slots. Cover
  different anchors first, then fill remaining slots. Reserve the fifth slot
  for a rotating sample outside the selected fit slots. It is a broader
  selection policy, not a promise of greater acoustic distance.
- Allow unrated and four/five-star tracks. Require distinct album artists,
  albums, audio hashes, and normalized credited-artist/title/two-second duration
  buckets within a shelf. Exclude anchor audio copies and tracks sharing exact
  analyzed audio with a recent matched play. This is conservative repeat control,
  not full acoustic twin detection across encodings.
- Exclude matched plays in the last 90 days using Listening's reviewed identity
  links. Display the available play count and earliest recorded date. Missing
  history never means the listener has never heard a track. Unmatched plays
  cannot reliably exclude a recording.
- Suggestions and anchors must still have current file signatures and current
  profile analysis. Bind saved suggestions, anchors and keeps to their analyzed
  audio hashes, so replacing and reanalyzing a file cannot retain old evidence.
  Reload removes missing, changed, banned, newly low-rated or
  recently played suggestions and invalid anchors. Aurora additionally applies
  pending tag edits before display and blocks saves containing a pending ban.

## Ownership and persistence

Music Library owns `hidden-favorites.sqlite3` beside its catalog. The versioned
store contains the current shelf, its fitted model and metrics, kept identities,
and calendar-day dismissals. Completed audio analysis is read-only. The catalog
is used only through existing identity-link maintenance and reviewed playlist
writing; MP3 bytes and ratings are not modified by shelf feedback.

Music Library exposes `hidden_favorites` and Aurora uses bridge protocol 1's
`hiddenFavorites` operation, gated by `supports.hiddenFavoritesV1`. Older Music
Library builds show an update instruction. The shelf has a revision; mutations
against a superseded shelf are rejected. Playlist saving requires the exact kept
keys reviewed by the caller and validates current catalog identities again.
Store mutations serialize in an immediate SQLite transaction across processes.

Opening a shelf reloads saved state. Selection/model training only runs on
**Find hidden favorites / Find five more**, so navigation does not reshuffle
suggestions or repeatedly scan the library. A busy scan can take longer when
the index is cold or file storage is slow. Reload explicitly to see feedback
from the other app. Browser previews use labeled sample data in local storage;
they do not access the installed catalog or share feedback across origins.

Validation covers held-out ranking, tied AUC, model fallback, diverse selection,
current files, duplicate suppression, recency, persistent feedback, shelf revision
guards, reviewed playlist identities, UI actions and async unmount behavior.
Recommendation quality still needs repeated listening and keep/replay feedback;
automated ranking tests do not establish musical enjoyment. The opt-in ignored
Rust test `live_readonly_shelf` accepts `HIDDEN_FAVORITES_LIVE_DIR` and verifies
five suggestions using read-only live catalog/analysis connections, a temporary
recommendation store, and no derived-index writes.

The 2026-10-22 live check returned five current tracks by distinct artists in
39.4 seconds in a debug build using the bounded fallback sample. It trained on
15,133 cached examples, held out 4,843 tracks by other album artists, and measured
AUC 0.748. Available history contained 7,418 plays. These are observed ranking
and execution checks, not listening-quality results or a release-build latency
guarantee. The probe left the live catalog, analysis and index unchanged.
