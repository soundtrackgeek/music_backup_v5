import type { DiscoveryHeatmapCell } from "../types";
import { scoreGenreGroup } from "./genreGroups";

export const completionHeatmapGenreLimits = [12, 25, 50, 100] as const;

export type CompletionHeatmapGenreLimit =
  (typeof completionHeatmapGenreLimits)[number];

export type CompletionHeatmapGenre = {
  genreId: string;
  genre: string;
  albumCount: number;
};

export type CompletionHeatmapSelection = {
  cells: DiscoveryHeatmapCell[];
  genres: CompletionHeatmapGenre[];
  years: number[];
};

function normalizeGenre(value: string) {
  return value.trim().toLocaleLowerCase();
}

function expandGenreFilters(values: string[]) {
  const expanded = new Set<string>();
  values.forEach((value) => {
    const normalized = normalizeGenre(value);
    if (!normalized) return;
    if (normalized === "score" || normalized === "scores") {
      scoreGenreGroup.forEach((genre) => expanded.add(genre));
    } else {
      expanded.add(normalized);
    }
  });
  return expanded;
}

function genreMatches(
  cell: DiscoveryHeatmapCell,
  normalizedGenres: Set<string>,
) {
  return (
    normalizedGenres.has(normalizeGenre(cell.genreId)) ||
    normalizedGenres.has(normalizeGenre(cell.genre))
  );
}

export function completionHeatmapYearExtent(
  cells: DiscoveryHeatmapCell[],
) {
  if (cells.length === 0) return null;

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  cells.forEach((cell) => {
    min = Math.min(min, cell.year);
    max = Math.max(max, cell.year);
  });

  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null;
}

export function completionHeatmapDecades(minYear: number, maxYear: number) {
  const min = Math.min(minYear, maxYear);
  const max = Math.max(minYear, maxYear);
  const firstDecade = Math.floor(min / 10) * 10;
  const lastDecade = Math.floor(max / 10) * 10;
  const decades: number[] = [];

  for (let decade = firstDecade; decade <= lastDecade; decade += 10) {
    decades.push(decade);
  }

  return decades;
}

export function selectCompletionHeatmap(
  cells: DiscoveryHeatmapCell[],
  options: {
    yearFrom: number;
    yearTo: number;
    genreLimit: number;
    includedGenres: string[];
    excludedGenres: string[];
  },
): CompletionHeatmapSelection {
  const yearFrom = Math.min(options.yearFrom, options.yearTo);
  const yearTo = Math.max(options.yearFrom, options.yearTo);
  const includedGenres = expandGenreFilters(options.includedGenres);
  const excludedGenres = expandGenreFilters(options.excludedGenres);
  const genreTotals = new Map<string, CompletionHeatmapGenre>();
  const filteredCells = cells.filter((cell) => {
    if (cell.year < yearFrom || cell.year > yearTo) return false;
    if (includedGenres.size > 0 && !genreMatches(cell, includedGenres)) {
      return false;
    }
    if (genreMatches(cell, excludedGenres)) return false;

    const existing = genreTotals.get(cell.genreId);
    if (existing) {
      existing.albumCount += cell.albumCount;
    } else {
      genreTotals.set(cell.genreId, {
        genreId: cell.genreId,
        genre: cell.genre,
        albumCount: cell.albumCount,
      });
    }
    return true;
  });
  const limit = Math.max(0, Math.floor(options.genreLimit));
  const genres = Array.from(genreTotals.values())
    .sort(
      (left, right) =>
        right.albumCount - left.albumCount ||
        left.genre.localeCompare(right.genre),
    )
    .slice(0, limit);
  const selectedGenreIds = new Set(genres.map((genre) => genre.genreId));
  const selectedCells = filteredCells.filter((cell) =>
    selectedGenreIds.has(cell.genreId),
  );
  const years: number[] = [];

  for (let year = yearFrom; year <= yearTo; year += 1) {
    years.push(year);
  }

  return { cells: selectedCells, genres, years };
}
