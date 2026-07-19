import { describe, expect, it } from "vitest";

import type { YearProgressStats } from "../types";
import {
  fullyRatedAlbumRatio,
  selectYearProgressRows,
  yearProgressExtent,
} from "./yearProgress";

function yearRow(
  year: number,
  albumCount: number,
  ratedAlbumCount: number,
): YearProgressStats {
  return {
    year,
    albumCount,
    ratedAlbumCount,
    partialAlbumCount: 0,
    unratedAlbumCount: albumCount - ratedAlbumCount,
    trackCount: albumCount * 10,
    totalSeconds: albumCount * 2400,
    lovedTracks: 0,
    averageAlbumScore: null,
  };
}

describe("year progress selection", () => {
  const rows = [
    yearRow(2026, 10, 4),
    yearRow(1987, 8, 2),
    yearRow(2004, 6, 3),
  ];

  it("finds the complete available year extent", () => {
    expect(yearProgressExtent(rows)).toEqual({ min: 1987, max: 2026 });
  });

  it("keeps the selected range inclusive and puts the oldest year first", () => {
    expect(selectYearProgressRows(rows, 1987, 2004).map((row) => row.year)).toEqual([
      1987,
      2004,
    ]);
  });

  it("calculates the fully rated share from all albums in the year", () => {
    expect(fullyRatedAlbumRatio(rows[0])).toBe(0.4);
    expect(fullyRatedAlbumRatio(yearRow(1900, 0, 0))).toBe(0);
  });
});
