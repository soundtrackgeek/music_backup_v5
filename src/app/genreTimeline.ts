import type { GenreSummary } from "../types";

export const genreTimelineLimits = [12, 25, 50, "all"] as const;

export type GenreTimelineLimit = number | "all";
export type GenreTimelineRangeMode =
  | "overlaps"
  | "starts"
  | "ends"
  | "contained";
export type GenreTimelineSort =
  | "earliest"
  | "latest"
  | "longest"
  | "albums"
  | "name";
export type GenreTimelineColorMetric =
  | "none"
  | "albums"
  | "completeness"
  | "loved";

export type GenreTimelineOptions = {
  searchText: string;
  yearFrom: number;
  yearTo: number;
  rangeMode: GenreTimelineRangeMode;
  minimumAlbums: number;
  sort: GenreTimelineSort;
  limit: GenreTimelineLimit;
};

export type GenreTimelineSelection = {
  rows: GenreSummary[];
  matchedRows: GenreSummary[];
  datedTotal: number;
};

export type GenreTimelineSummary = {
  earliestStart: number | null;
  latestRelease: number | null;
  longestSpan: number;
};

export function hasObservedGenreYears(
  genre: GenreSummary,
): genre is GenreSummary & { firstYear: number; lastYear: number } {
  return Number.isFinite(genre.firstYear) && Number.isFinite(genre.lastYear);
}

export function genreTimelineExtent(rows: GenreSummary[]) {
  const datedRows = rows.filter(hasObservedGenreYears);
  if (datedRows.length === 0) return null;

  return {
    minimum: Math.min(...datedRows.map((row) => row.firstYear)),
    maximum: Math.max(...datedRows.map((row) => row.lastYear)),
  };
}

export function observedGenreSpan(genre: GenreSummary) {
  if (!hasObservedGenreYears(genre)) return 0;
  return Math.max(1, genre.lastYear - genre.firstYear + 1);
}

function matchesRange(
  genre: GenreSummary & { firstYear: number; lastYear: number },
  from: number,
  to: number,
  mode: GenreTimelineRangeMode,
) {
  switch (mode) {
    case "starts":
      return genre.firstYear >= from && genre.firstYear <= to;
    case "ends":
      return genre.lastYear >= from && genre.lastYear <= to;
    case "contained":
      return genre.firstYear >= from && genre.lastYear <= to;
    default:
      return genre.firstYear <= to && genre.lastYear >= from;
  }
}

export function selectGenreTimelineRows(
  rows: GenreSummary[],
  options: GenreTimelineOptions,
): GenreTimelineSelection {
  const searchText = options.searchText.trim().toLocaleLowerCase();
  const from = Math.min(options.yearFrom, options.yearTo);
  const to = Math.max(options.yearFrom, options.yearTo);
  const minimumAlbums = Math.max(0, Math.floor(options.minimumAlbums));
  const datedRows = rows.filter(hasObservedGenreYears);
  const matchedRows = datedRows
    .filter(
      (row) =>
        (!searchText || row.name.toLocaleLowerCase().includes(searchText)) &&
        row.albumCount >= minimumAlbums &&
        matchesRange(row, from, to, options.rangeMode),
    )
    .sort((left, right) => {
      const byName = left.name.localeCompare(right.name, undefined, {
        sensitivity: "base",
      });
      switch (options.sort) {
        case "latest":
          return (
            (right.lastYear ?? 0) - (left.lastYear ?? 0) ||
            (left.firstYear ?? 0) - (right.firstYear ?? 0) ||
            byName
          );
        case "longest":
          return observedGenreSpan(right) - observedGenreSpan(left) || byName;
        case "albums":
          return right.albumCount - left.albumCount || byName;
        case "name":
          return byName;
        default:
          return (
            (left.firstYear ?? 0) - (right.firstYear ?? 0) ||
            (right.lastYear ?? 0) - (left.lastYear ?? 0) ||
            byName
          );
      }
    });

  return {
    rows:
      options.limit === "all"
        ? matchedRows
        : matchedRows.slice(0, Math.max(0, options.limit)),
    matchedRows,
    datedTotal: datedRows.length,
  };
}

export function summarizeGenreTimeline(
  rows: GenreSummary[],
): GenreTimelineSummary {
  const datedRows = rows.filter(hasObservedGenreYears);
  if (datedRows.length === 0) {
    return { earliestStart: null, latestRelease: null, longestSpan: 0 };
  }

  return {
    earliestStart: Math.min(...datedRows.map((row) => row.firstYear)),
    latestRelease: Math.max(...datedRows.map((row) => row.lastYear)),
    longestSpan: Math.max(...datedRows.map(observedGenreSpan)),
  };
}

export function genreTimelineTicks(yearFrom: number, yearTo: number) {
  const from = Math.min(yearFrom, yearTo);
  const to = Math.max(yearFrom, yearTo);
  if (from === to) return [from];

  const span = to - from;
  const step = span > 160 ? 50 : span > 80 ? 20 : 10;
  const firstGuide = Math.ceil(from / step) * step;
  const ticks = [from];
  for (let year = firstGuide; year < to; year += step) {
    if (year !== from) ticks.push(year);
  }
  if (ticks.length === 1 || to - ticks[ticks.length - 1] >= step / 2) {
    ticks.push(to);
  }
  return ticks;
}

export function genreTimelineColor(
  genre: GenreSummary,
  rows: GenreSummary[],
  metric: GenreTimelineColorMetric,
) {
  if (metric === "none") return "hsl(175 78% 25%)";

  const values = rows.map((row) => {
    switch (metric) {
      case "albums":
        return row.albumCount;
      case "completeness":
        return row.averageRatingCompleteness ?? 0;
      default:
        return row.lovedTracks;
    }
  });
  const maximum = Math.max(1, ...values);
  const value =
    metric === "albums"
      ? genre.albumCount
      : metric === "completeness"
        ? genre.averageRatingCompleteness ?? 0
        : genre.lovedTracks;
  const strength = Math.min(1, Math.max(0, value / maximum));
  const lightness = 43 - strength * 20;
  return `hsl(175 68% ${lightness.toFixed(1)}%)`;
}
