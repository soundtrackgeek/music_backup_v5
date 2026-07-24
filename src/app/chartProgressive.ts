import { chartGridCoverSize, completenessRange } from "./config";
import {
  chartCompletenessRange,
  normalizeChartGridCoverSize,
} from "./requests";
import type { ChartConfig, TextFilter } from "../types";

const defaultVisibleColumns = [
  "billboard",
  "rating",
  "complete",
  "score",
  "loved",
];
const defaultExportColumns = ["calculated"];
const defaultResultLimit = 50;

function hasText(filter: TextFilter) {
  return filter.value.trim().length > 0;
}

function hasRange(min: number | null, max: number | null) {
  return min != null || max != null;
}

function hasSameValues(current: string[], defaults: string[]) {
  return (
    current.length === defaults.length &&
    defaults.every((value) => current.includes(value))
  );
}

export function countAdvancedChartControls(config: ChartConfig) {
  const filters = config.request.filters;
  const completeness = chartCompletenessRange(config);
  const advancedGroups = [
    config.resultLimit !== defaultResultLimit,
    hasRange(filters.billboardRankMin, filters.billboardRankMax),
    filters.originCountryCodes.length > 0,
    filters.excludedOriginCountryCodes.length > 0,
    filters.artistType.trim().length > 0,
    filters.artistGender.trim().length > 0,
    hasText(filters.albumArtist),
    hasText(filters.albumTitle),
    hasText(filters.publisher),
    hasRange(filters.artistBornYearFrom, filters.artistBornYearTo),
    filters.artistDied ||
      hasRange(filters.artistDiedYearFrom, filters.artistDiedYearTo),
    hasRange(filters.artistFoundedYearFrom, filters.artistFoundedYearTo),
    filters.artistDissolved ||
      hasRange(
        filters.artistDissolvedYearFrom,
        filters.artistDissolvedYearTo,
      ),
    hasRange(filters.totalMinutesMin, filters.totalMinutesMax),
    hasRange(filters.albumRatingMin, filters.albumRatingMax),
    hasRange(filters.lovedTracksMin, filters.lovedTracksMax),
    completeness.min > completenessRange.min ||
      completeness.max < completenessRange.max,
    filters.missingOriginCountry,
    !hasSameValues(config.visibleColumns, defaultVisibleColumns),
    !hasSameValues(config.exportColumns, defaultExportColumns),
    config.viewMode === "grid" &&
      normalizeChartGridCoverSize(config.gridCoverSize) !==
        chartGridCoverSize.default,
  ];

  return advancedGroups.filter(Boolean).length;
}
