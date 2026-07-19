import type { YearProgressStats } from "../types";

export function yearProgressExtent(rows: YearProgressStats[]) {
  if (rows.length === 0) return null;

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  rows.forEach((row) => {
    min = Math.min(min, row.year);
    max = Math.max(max, row.year);
  });

  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null;
}

export function selectYearProgressRows(
  rows: YearProgressStats[],
  yearFrom: number,
  yearTo: number,
) {
  const firstYear = Math.min(yearFrom, yearTo);
  const lastYear = Math.max(yearFrom, yearTo);
  return rows
    .filter((row) => row.year >= firstYear && row.year <= lastYear)
    .slice()
    .sort((left, right) => left.year - right.year);
}

export function fullyRatedAlbumRatio(row: YearProgressStats) {
  return row.albumCount > 0 ? row.ratedAlbumCount / row.albumCount : 0;
}
