import { describe, expect, it } from "vitest";

import {
  decadeCohort,
  lovedDensityCohort,
  missingMetadataCohort,
  ratingBucketCohort,
  yearCohort,
} from "./insightCohorts";

describe("insight cohort requests", () => {
  it("preserves the selected Statistics dimensions in Search", () => {
    const decade = decadeCohort({
      decade: 1980,
      albumCount: 120,
      ratedAlbumCount: 40,
      partialAlbumCount: 20,
      unratedAlbumCount: 60,
      trackCount: 1400,
      totalSeconds: 3000,
      lovedTracks: 80,
      averageAlbumScore: 90,
    });
    const year = yearCohort(
      {
        year: 1987,
        albumCount: 25,
        ratedAlbumCount: 10,
        partialAlbumCount: 5,
        unratedAlbumCount: 10,
        trackCount: 250,
        totalSeconds: 1000,
        lovedTracks: 20,
        averageAlbumScore: 100,
      },
      ["Synthpop"],
      ["Comedy"],
    );

    expect(decade.request.filters).toMatchObject({
      yearFrom: 1980,
      yearTo: 1989,
    });
    expect(year.request.filters).toMatchObject({
      yearFrom: 1987,
      yearTo: 1987,
      genres: ["Synthpop"],
      excludedGenres: ["Comedy"],
    });
  });

  it("maps ratings, loved density, and missing metadata to exact filters", () => {
    expect(
      ratingBucketCohort({ label: "80-89", count: 40 }, "albums")?.request
        .filters,
    ).toMatchObject({ albumRatingMin: 80, albumRatingMax: 89 });
    expect(
      lovedDensityCohort({
        scope: "Decade",
        label: "1990s",
        albumCount: 90,
        trackCount: 900,
        lovedTracks: 50,
        lovedPer100Tracks: 5.5,
      })?.request.filters,
    ).toMatchObject({ yearFrom: 1990, yearTo: 1999, lovedTracksMin: 1 });
    expect(
      missingMetadataCohort({
        id: "track-rating",
        label: "Track rating",
        scope: "Tracks",
        coveredCount: 80,
        totalCount: 100,
      })?.request,
    ).toMatchObject({
      view: "tracks",
      filters: { missingFields: ["rating"] },
    });
    expect(
      missingMetadataCohort({
        id: "cover-art",
        label: "Cover art",
        scope: "Artwork",
        coveredCount: 25,
        totalCount: 100,
      })?.request.filters.missingFields,
    ).toEqual(["coverArt"]);
  });
});
