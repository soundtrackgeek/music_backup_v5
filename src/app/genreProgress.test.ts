import { describe, expect, it } from "vitest";

import type { GenreProgressStats } from "../types";
import {
  fullyRatedGenreRatio,
  selectGenreProgressRows,
} from "./genreProgress";

function genreRow(
  genre: string,
  albumCount: number,
  ratedAlbumCount = 0,
): GenreProgressStats {
  return {
    genre,
    albumCount,
    ratedAlbumCount,
    partialAlbumCount: 0,
    unratedAlbumCount: albumCount,
    trackCount: 0,
    totalSeconds: 0,
    lovedTracks: 0,
    averageAlbumScore: null,
  };
}

describe("genre progress selection", () => {
  const rows = [
    genreRow("Rock", 30),
    genreRow("Ambient", 12),
    genreRow("Synthpop", 30),
  ];

  it("sorts popularity by album count with a stable name tie-breaker", () => {
    expect(
      selectGenreProgressRows(rows, "all", "popularity").map(
        (row) => row.genre,
      ),
    ).toEqual(["Rock", "Synthpop", "Ambient"]);
  });

  it("sorts names alphabetically and applies the selected display limit", () => {
    expect(
      selectGenreProgressRows(rows, 2, "name").map((row) => row.genre),
    ).toEqual(["Ambient", "Rock"]);
  });

  it("does not mutate the aggregation rows supplied by Statistics", () => {
    selectGenreProgressRows(rows, 2, "popularity");
    expect(rows.map((row) => row.genre)).toEqual([
      "Rock",
      "Ambient",
      "Synthpop",
    ]);
  });

  it("calculates the fully rated share from every album in the genre", () => {
    expect(fullyRatedGenreRatio(genreRow("Rock", 30, 12))).toBe(0.4);
    expect(fullyRatedGenreRatio(genreRow("Unknown", 0, 0))).toBe(0);
  });
});
