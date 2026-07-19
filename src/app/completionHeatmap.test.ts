import { describe, expect, it } from "vitest";
import type { DiscoveryHeatmapCell } from "../types";
import {
  completionHeatmapDecades,
  completionHeatmapYearExtent,
  selectCompletionHeatmap,
} from "./completionHeatmap";

function heatmapCell(
  genreId: string,
  genre: string,
  year: number,
  albumCount: number,
): DiscoveryHeatmapCell {
  return {
    genreId,
    genre,
    year,
    albumCount,
    ratedAlbumCount: 0,
    partialAlbumCount: 0,
    unratedAlbumCount: albumCount,
    trackCount: albumCount * 10,
    lovedTracks: 0,
    averageRatingCompleteness: 0,
    averageAlbumScore: null,
  };
}

describe("completion heatmap selection", () => {
  const cells = [
    heatmapCell("rock", "Rock", 1945, 6),
    heatmapCell("rock", "Rock", 1959, 4),
    heatmapCell("soul", "Soul", 1945, 12),
    heatmapCell("soul", "Soul", 1959, 3),
    heatmapCell("jazz", "Jazz", 1959, 8),
  ];

  it("builds every year column in the requested inclusive range", () => {
    const selection = selectCompletionHeatmap(cells, {
      yearFrom: 1945,
      yearTo: 1959,
      genreLimit: 12,
      includedGenres: [],
      excludedGenres: [],
    });

    expect(selection.years).toHaveLength(15);
    expect(selection.years[0]).toBe(1945);
    expect(selection.years[selection.years.length - 1]).toBe(1959);
  });

  it("ranks genres by album population inside the active year range", () => {
    const selection = selectCompletionHeatmap(cells, {
      yearFrom: 1945,
      yearTo: 1959,
      genreLimit: 2,
      includedGenres: [],
      excludedGenres: [],
    });

    expect(selection.genres.map((genre) => genre.genre)).toEqual([
      "Soul",
      "Rock",
    ]);
    expect(selection.cells.every((cell) => cell.genreId !== "jazz")).toBe(
      true,
    );
  });

  it("applies exact case-insensitive include and exclude genre filters", () => {
    const selection = selectCompletionHeatmap(cells, {
      yearFrom: 1945,
      yearTo: 1959,
      genreLimit: 100,
      includedGenres: ["ROCK", "Soul"],
      excludedGenres: ["soul"],
    });

    expect(selection.genres.map((genre) => genre.genre)).toEqual(["Rock"]);
  });

  it("expands the scores group for include and exclude filters", () => {
    const scoreCells = [
      heatmapCell("action", "Action", 1999, 8),
      heatmapCell("tv", "TV", 1999, 6),
      heatmapCell("video game", "Video Game", 1999, 4),
      heatmapCell("rock", "Rock", 1999, 10),
    ];
    const included = selectCompletionHeatmap(scoreCells, {
      yearFrom: 1999,
      yearTo: 1999,
      genreLimit: 100,
      includedGenres: ["scores"],
      excludedGenres: [],
    });
    const excluded = selectCompletionHeatmap(scoreCells, {
      yearFrom: 1999,
      yearTo: 1999,
      genreLimit: 100,
      includedGenres: [],
      excludedGenres: ["score"],
    });

    expect(included.genres.map((genre) => genre.genre)).toEqual([
      "Action",
      "TV",
      "Video Game",
    ]);
    expect(excluded.genres.map((genre) => genre.genre)).toEqual(["Rock"]);
  });

  it("reports the full data extent and available decades", () => {
    expect(completionHeatmapYearExtent(cells)).toEqual({
      min: 1945,
      max: 1959,
    });
    expect(completionHeatmapDecades(1945, 1959)).toEqual([1940, 1950]);
  });
});
