import type { ArtistChartRequest } from "../types";
import { createFilters } from "./requests";

export const artistChartMetricOptions = [
  { value: "albums", label: "Most albums" },
  { value: "tracks", label: "Most tracks" },
  { value: "fiveStarTracks", label: "Most 5 star tracks" },
  { value: "lovedTracks", label: "Most loved tracks" },
  { value: "chartedAlbums", label: "Most charted albums" },
  { value: "chartedTracks", label: "Most charted tracks" },
  { value: "completeAlbums", label: "Most 100% rated albums" },
  { value: "averageAlbumScore", label: "Highest average album score" },
];

export const albumChartSourceOptions = [
  { value: "billboard", label: "Billboard" },
  { value: "officialUk", label: "UK" },
  { value: "vgLista", label: "VG Lista" },
];

export const singleChartSourceOptions = [
  { value: "billboard", label: "Billboard" },
  { value: "officialUk", label: "UK" },
  { value: "vgLista", label: "VG Lista" },
  { value: "tiISkuddet", label: "Ti i Skuddet" },
  { value: "norsktoppen", label: "Norsktoppen" },
];

export function artistChartMetricLabel(metric: string) {
  return (
    artistChartMetricOptions.find((option) => option.value === metric)?.label ??
    metric
  );
}

export function createArtistChartRequest(): ArtistChartRequest {
  return {
    metric: "albums",
    direction: "desc",
    searchText: "",
    filters: createFilters(),
    excludedYearFrom: null,
    excludedYearTo: null,
    albumChartSources: albumChartSourceOptions.map((option) => option.value),
    singleChartSources: singleChartSourceOptions.map((option) => option.value),
    minAlbums: null,
    includeVariousArtists: false,
    limit: 100,
    offset: 0,
  };
}

/** Which artist chart filters differ from the defaults, for the "N active" badge. */
export function countArtistChartFilters(request: ArtistChartRequest) {
  const filters = request.filters;
  const defaults = createArtistChartRequest();
  const sameSources = (left: string[], right: string[]) =>
    left.length === right.length && right.every((item) => left.includes(item));
  return [
    filters.genres.length > 0,
    filters.excludedGenres.length > 0,
    filters.yearFrom != null || filters.yearTo != null,
    request.excludedYearFrom != null || request.excludedYearTo != null,
    filters.originCountryCodes.length > 0,
    filters.excludedOriginCountryCodes.length > 0,
    filters.artistType !== "",
    filters.artistGender !== "",
    filters.artistBornYearFrom != null || filters.artistBornYearTo != null,
    filters.artistDiedYearFrom != null || filters.artistDiedYearTo != null,
    filters.artistFoundedYearFrom != null || filters.artistFoundedYearTo != null,
    filters.artistDissolvedYearFrom != null ||
      filters.artistDissolvedYearTo != null,
    filters.artistDied,
    filters.artistDissolved,
    request.minAlbums != null,
    request.includeVariousArtists,
    !sameSources(request.albumChartSources, defaults.albumChartSources),
    !sameSources(request.singleChartSources, defaults.singleChartSources),
  ].filter(Boolean).length;
}
