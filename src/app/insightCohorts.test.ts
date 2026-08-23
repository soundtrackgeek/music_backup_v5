import { describe, expect, it } from "vitest";

import {
  decadeCohort,
  lovedDensityCohort,
  missingMetadataCohort,
  ratingBucketCohort,
  searchRequestCohort,
  yearCohort,
} from "./insightCohorts";
import { createRequest } from "./requests";

describe("insight cohort requests", () => {
  it("turns the complete current Search scope into a playlist cohort", () => {
    const request = createRequest("albums");
    request.searchText = "Bowie";
    request.filters.genres = ["Art Rock"];
    request.offset = 100;

    const cohort = searchRequestCohort(request, 143);

    expect(cohort).toMatchObject({
      title: "Search: Bowie",
      description: "143 matching albums from Search.",
      count: 143,
      request: {
        view: "albums",
        searchText: "Bowie",
        offset: 0,
        filters: { genres: ["Art Rock"] },
      },
    });
    expect(cohort.playlistPrompt).toContain(
      "using only tracks from the Search: Bowie cohort",
    );
  });

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
      ratingBucketCohort({ label: "4.5", count: 12 }, "tracks")?.request
        .filters,
    ).toMatchObject({ trackRatingMin: 4.5, trackRatingMax: 4.5 });
    expect(
      lovedDensityCohort({
        scope: "Genre",
        label: "Boy Band",
        albumCount: 11,
        trackCount: 139,
        lovedTracks: 8,
        lovedPer100Tracks: 5.76,
      }),
    ).toMatchObject({
      title: "Boy Band loved tracks",
      description:
        "11 albums and 139 total tracks in the density calculation.",
      count: 8,
      request: {
        view: "tracks",
        filters: { genres: ["Boy Band"], lovedTracksMin: 1 },
      },
    });
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
