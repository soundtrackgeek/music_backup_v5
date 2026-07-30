import { describe, expect, it } from "vitest";

import type { GenreTimelineResponse } from "../types";
import {
  buildGenreConstellationLayout,
  createGenreTimelineRequest,
  genreConstellationAlbumPosition,
  genreTimelineTicks,
} from "./genreTimeline";

const response: GenreTimelineResponse = {
  genres: [
    {
      id: "rock",
      name: "Rock",
      albumCount: 8,
      firstYear: 1970,
      lastYear: 1973,
      peakYear: 1972,
      peakAlbumCount: 4,
    },
    {
      id: "jazz",
      name: "Jazz",
      albumCount: 4,
      firstYear: 1970,
      lastYear: 1973,
      peakYear: 1971,
      peakAlbumCount: 2,
    },
  ],
  yearCounts: [
    { genreId: "rock", year: 1970, albumCount: 1 },
    { genreId: "rock", year: 1971, albumCount: 2 },
    { genreId: "rock", year: 1972, albumCount: 4 },
    { genreId: "rock", year: 1973, albumCount: 1 },
    { genreId: "jazz", year: 1970, albumCount: 1 },
    { genreId: "jazz", year: 1971, albumCount: 2 },
    { genreId: "jazz", year: 1972, albumCount: 1 },
  ],
  albums: [
    {
      albumId: "album-1",
      album: "First",
      albumArtistDisplay: "Artist",
      genreId: "rock",
      genre: "Rock",
      year: 1972,
    },
  ],
  matchingAlbumCount: 12,
  matchingGenreCount: 2,
  datedAlbumCount: 12,
  availableYearFrom: 1970,
  availableYearTo: 1973,
};

describe("genre constellation helpers", () => {
  it("creates a filtered timeline request with album points", () => {
    expect(
      createGenreTimelineRequest({
        yearFrom: 1980,
        yearTo: 2000,
        includedGenres: ["Scores"],
        excludedGenres: ["Horror"],
        genreLimit: 12,
      }),
    ).toEqual({
      yearFrom: 1980,
      yearTo: 2000,
      genres: ["Scores"],
      excludedGenres: ["Horror"],
      genreLimit: 12,
      albumPointLimit: 3600,
    });
  });

  it("builds smooth density clouds for each visible genre", () => {
    const layout = buildGenreConstellationLayout(response, {
      width: 800,
      height: 400,
    });

    expect(layout.yearFrom).toBe(1970);
    expect(layout.yearTo).toBe(1973);
    expect(layout.bands).toHaveLength(2);
    const rockBand = layout.bands.find((band) => band.genre.id === "rock");
    expect(rockBand?.outerPath).toMatch(/^M /);
    expect(rockBand?.outerPath).toContain(" C ");
    expect(rockBand?.contourPaths).toHaveLength(4);
    expect(rockBand?.amplitudeByYear).toHaveLength(4);
    expect(rockBand?.amplitudeByYear[2]).toBeGreaterThan(1);
  });

  it("places an album deterministically inside its genre cloud", () => {
    const layout = buildGenreConstellationLayout(response);
    const band = layout.bands.find((item) => item.genre.id === "rock");
    expect(band).toBeDefined();
    const album = response.albums[0];
    const first = genreConstellationAlbumPosition(album, band!, layout);
    const second = genreConstellationAlbumPosition(album, band!, layout);

    expect(first).toEqual(second);
    expect(first.x).toBeGreaterThanOrEqual(layout.plotLeft);
    expect(first.x).toBeLessThanOrEqual(layout.plotRight);
    expect(first.y).toBeGreaterThan(
      band!.centerY - band!.amplitudeByYear[2],
    );
    expect(first.y).toBeLessThan(
      band!.centerY + band!.amplitudeByYear[2],
    );
  });

  it("normalizes an inverted year range", () => {
    expect(
      createGenreTimelineRequest({
        yearFrom: 2005,
        yearTo: 1990,
        includedGenres: [],
        excludedGenres: [],
        genreLimit: 12,
      }),
    ).toEqual(
      expect.objectContaining({
        yearFrom: 1990,
        yearTo: 2005,
      }),
    );
  });

  it("chooses readable year ticks", () => {
    expect(genreTimelineTicks(1984, 2012)).toEqual([
      1984, 1985, 1990, 1995, 2000, 2005, 2010, 2012,
    ]);
    expect(genreTimelineTicks(1986, 1987)).toEqual([1986, 1987]);
  });
});
