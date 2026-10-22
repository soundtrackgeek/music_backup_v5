# An album’s many sides

Available in Music Library 0.197.0 (shared calculation and native query) and
Aurora 0.42.0 (album inspector). This implements idea 03 from the
[sonic opportunities report](sonic-analysis-opportunities-2026-10.md).

Open an album in Aurora’s Albums, Publishers, Ratings or Years view. In its
inspector, choose **Explore its sound**. Each sound group has an actual
representative track, a track count, **Play track**, **Play this side**, and an
expandable list of the tracks close to that representative. Playback reloads
the album and keeps its program order. The strongest contrast is the track
furthest from the central representative; it may also represent a group.

Choose **Find this sound on other albums** on a representative or the contrast.
Results name the matching cue and let you hear it or open its album. They rank
albums by a close **track**, rather than their mean, so a few restrained cues
can lead into an otherwise vigorous score. Identical audio to the chosen seed
is excluded. This is acoustic similarity, not a prediction of enjoyment.

## Coverage and freshness

- The source and suggested albums need complete usable current-profile analysis.
  Coverage counts every catalog track, including unsupported formats, instead of
  silently calling an MP3 subset the whole album.
- Banned tracks (including pending Aurora ban edits), absent files, changed file
  signatures, malformed vectors and older analysis profiles cannot contribute.
  Such an album remains incomplete for this first version. Finish analysis or
  resolve those files before exploring it.
- The panel reports usable/total counts and has explicit loading, error, retry
  and no-match states. Moving to another album invalidates pending results.
- Native queries use a read transaction and only existing analysis. They never
  decode audio, change ratings, rewrite tags or persist invented metadata.
- Browser preview is explicitly illustrative; its few demonstration tracks do
  not stand in for a live library or a native playback test.

## Shared algorithm and query contract

`music-sonic-core::album_sides` owns `album-sides-v1`, reused verbatim by Aurora’s
vendored contract. The catalog adapter is aligned in both applications.
Music Library exposes `sonic_album_sides` through its generated native bindings:
`{ albumId, strandKey: null }` describes the album;
`{ albumId, strandKey: representative.trackKey }` also discovers other albums.
Responses contain the derivation version, coverage, readiness, group members,
representatives, contrast, selected key, matching tracks and search boundaries.
These are derived on demand, so catalog and analysis changes require no separate
cache migration or reanalysis.

For up to 5,000 tracks, deterministic refinement starts with the track nearest
the equal-weight album mean, adds farthest seeds, assigns nearest-center groups,
and chooses the real track nearest each group mean. It performs at most 24
refinements per proposed split, with up to three seed attempts when an isolated
outlier would otherwise hide supported groups. Every track still belongs to a
group. Stable catalog identity order breaks ties.
A second group needs at least six tracks, two members per group, representatives
at least 0.15 weighted profile-distance apart, and a 25% reduction in squared
spread. A third needs at least nine tracks and another 20% reduction. Short,
uniform and isolated-outlier albums retain one representative. Contrast also
requires at least 0.15 distance. These conservative heuristics are versioned;
they do not establish semantic personalities or optimal clustering.

Discovery reuses the track index’s 4,096-neighbor prefix plus current dirty
identities. When no compatible index is ready, it asks you to open Music Library
and retry shortly while the shared index is prepared. It never falls back to a
million-track scan during interactive discovery. Album groups remain available
without the index. A streamed baseline is retained for regression comparisons.
It shortlists by each album’s closest candidate, checks files in at most 120
candidate albums, recomputes their closest eligible tracks, and stops when the
12-album shelf is full. Coverage failures do not weaken the rules. A bounded result is
identified as a shortlist; it does not promise exhaustive nearest-album order.
Album-mean similarity and radio remain separate existing controls.

## Verification and limits

Regression coverage checks real representative membership, deterministic ties,
complete disjoint groups, short/uniform/outlier behavior, invalid vectors and
metrics, stale/missing/banned files, partial and incompatible analysis, read-only
access, foreign strand rejection, and a matching cue hidden by its album mean.
UI tests cover group playback, matching-cue actions, errors/retry, coverage and
late-result navigation. Browser inspection verifies the rendered preview;
native audio and subjective listening quality need listening in the installed app.

A read-only native probe on 2026-10-22 exercised the production adapter and
shared algorithm on the live catalog/results stores. *Interstellar* (Hans
Zimmer) had 30/30 usable tracks and one representative, *The Dark Knight*
(Hans Zimmer & James Newton Howard) had 28/28 and two groups (25 and 3 tracks),
and *The Matrix* (Don Davis) had 30/30 and two groups (24 and 6 tracks).
The Dark Knight’s smaller group was represented by a remix. This verifies
real-library coverage and structure, not listening quality or semantic labels.

The groups may support later **Score suite** (34) and **Album shape** (35), as
the companion report suggests. Those features are not included here. Neither
are within-track sections, mood/instrument labels, or Tonehavn’s simpler card;
Tonehavn needs a versioned publication contract for this new evidence first.
