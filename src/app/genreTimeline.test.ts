import { describe, expect, it } from "vitest";
import type { GenreSummary } from "../types";
import {
  genreTimelineColor,
  genreTimelineExtent,
  genreTimelineTicks,
  observedGenreSpan,
  selectGenreTimelineRows,
  summarizeGenreTimeline,
  type GenreTimelineOptions,
} from "./genreTimeline";

function genre(
  name: string,
  firstYear: number | null,
  lastYear: number | null,
  albumCount = 1,
): GenreSummary {
  return {
    id: name.toLowerCase(),
    name,
    albumCount,
    ratedAlbumCount: 0,
    partialAlbumCount: 0,
    unratedAlbumCount: albumCount,
    trackCount: albumCount * 10,
    totalSeconds: 0,
    lovedTracks: 0,
    tmoeSeconds: 0,
    averageRatingCompleteness: 0,
    averageAlbumRating: null,
    averageAlbumScore: null,
    firstYear,
    lastYear,
    topArtist: null,
  };
}

const rows = [
  genre("Rock", 1970, 1999, 20),
  genre("Ambient", 1985, 2024, 12),
  genre("One Year", 1990, 1990, 2),
  genre("Synthpop", 2001, 2005, 8),
  genre("Unknown", null, null, 50),
];

function options(
  values: Partial<GenreTimelineOptions> = {},
): GenreTimelineOptions {
  return {
    searchText: "",
    yearFrom: 1990,
    yearTo: 2000,
    rangeMode: "overlaps",
    minimumAlbums: 0,
    sort: "earliest",
    limit: "all",
    ...values,
  };
}

describe("genre timeline selection", () => {
  it("derives the observed extent and excludes genres without years", () => {
    expect(genreTimelineExtent(rows)).toEqual({ minimum: 1970, maximum: 2024 });
    expect(selectGenreTimelineRows(rows, options()).datedTotal).toBe(4);
  });

  it("supports overlap, start, end, and contained range matching", () => {
    expect(
      selectGenreTimelineRows(rows, options()).rows.map((row) => row.name),
    ).toEqual(["Rock", "Ambient", "One Year"]);
    expect(
      selectGenreTimelineRows(rows, options({ rangeMode: "starts" })).rows.map(
        (row) => row.name,
      ),
    ).toEqual(["One Year"]);
    expect(
      selectGenreTimelineRows(rows, options({ rangeMode: "ends" })).rows.map(
        (row) => row.name,
      ),
    ).toEqual(["Rock", "One Year"]);
    expect(
      selectGenreTimelineRows(
        rows,
        options({ rangeMode: "contained" }),
      ).rows.map((row) => row.name),
    ).toEqual(["One Year"]);
  });

  it("combines album thresholds, longest-span sorting, and limits", () => {
    const selection = selectGenreTimelineRows(
      rows,
      options({
        yearFrom: 1970,
        yearTo: 2030,
        minimumAlbums: 10,
        sort: "longest",
        limit: 1,
      }),
    );

    expect(selection.matchedRows.map((row) => row.name)).toEqual([
      "Ambient",
      "Rock",
    ]);
    expect(selection.rows.map((row) => row.name)).toEqual(["Ambient"]);
  });

  it("uses inclusive observed spans and summarizes the filtered rows", () => {
    expect(observedGenreSpan(rows[2])).toBe(1);
    expect(summarizeGenreTimeline(rows)).toEqual({
      earliestStart: 1970,
      latestRelease: 2024,
      longestSpan: 40,
    });
  });

  it("creates bounded axis guides and stable metric colors", () => {
    expect(genreTimelineTicks(1984, 2012)).toEqual([
      1984, 1990, 2000, 2010,
    ]);
    expect(genreTimelineTicks(1986, 1987)).toEqual([1986, 1987]);
    expect(genreTimelineColor(rows[0], rows, "none")).toBe(
      "hsl(175 78% 25%)",
    );
    expect(genreTimelineColor(rows[0], rows, "albums")).toMatch(
      /^hsl\(175 68% /,
    );
  });
});
