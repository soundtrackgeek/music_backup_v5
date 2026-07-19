import type { GenreProgressStats } from "../types";

export const genreProgressLimits = [12, 25, 50, 100, "all"] as const;

export type GenreProgressLimit = (typeof genreProgressLimits)[number];
export type GenreProgressSort = "popularity" | "name";

export function fullyRatedGenreRatio(row: GenreProgressStats) {
  return row.albumCount > 0 ? row.ratedAlbumCount / row.albumCount : 0;
}

export function selectGenreProgressRows(
  rows: GenreProgressStats[],
  limit: number | "all",
  sort: GenreProgressSort,
) {
  const selected = rows.slice().sort((left, right) => {
    const byName = left.genre.localeCompare(right.genre, undefined, {
      sensitivity: "base",
    });
    return sort === "name"
      ? byName
      : right.albumCount - left.albumCount || byName;
  });

  return limit === "all"
    ? selected
    : selected.slice(0, Math.max(0, Math.floor(limit)));
}
