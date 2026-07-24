import type { BrowseFilters, BrowseView, TextFilter } from "../types";

function hasText(filter: TextFilter) {
  return filter.value.trim().length > 0;
}

function hasRange(min: number | null, max: number | null) {
  return min != null || max != null;
}

export function countAdvancedSearchFilters(
  filters: BrowseFilters,
  view: BrowseView,
) {
  const advancedGroups = [
    view === "albums"
      ? hasText(filters.trackTitle)
      : hasText(filters.albumTitle),
    view === "albums"
      ? hasText(filters.displayArtist)
      : hasText(filters.albumArtist),
    hasText(filters.publisher),
    filters.hasTrackText.trim().length > 0,
    hasRange(filters.billboardRankMin, filters.billboardRankMax),
    view === "tracks" &&
      hasRange(
        filters.billboardSingleRankMin,
        filters.billboardSingleRankMax,
      ),
    hasRange(filters.releaseYearFrom, filters.releaseYearTo),
    hasRange(filters.totalMinutesMin, filters.totalMinutesMax),
    hasRange(filters.trackCountMin, filters.trackCountMax),
    hasRange(filters.ratedTracksMin, filters.ratedTracksMax),
    hasRange(filters.albumRatingMin, filters.albumRatingMax),
    hasRange(filters.trackRatingMin, filters.trackRatingMax),
    hasRange(
      filters.ratingCompletenessMin,
      filters.ratingCompletenessMax,
    ),
    filters.notFullyRated,
    hasRange(filters.lovedTracksMin, filters.lovedTracksMax),
    filters.originCountryCodes.length > 0,
    filters.excludedOriginCountryCodes.length > 0,
    filters.missingOriginCountry,
    filters.artistType.trim().length > 0,
    filters.artistGender.trim().length > 0,
    hasRange(filters.artistBornYearFrom, filters.artistBornYearTo),
    filters.artistDied ||
      hasRange(filters.artistDiedYearFrom, filters.artistDiedYearTo),
    hasRange(filters.artistFoundedYearFrom, filters.artistFoundedYearTo),
    filters.artistDissolved ||
      hasRange(
        filters.artistDissolvedYearFrom,
        filters.artistDissolvedYearTo,
      ),
    hasText(filters.filePath),
    hasText(filters.filename),
    filters.missingFields.length > 0,
  ];

  return advancedGroups.filter(Boolean).length;
}
