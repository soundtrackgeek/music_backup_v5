import type {
  ArtistListRequest,
  ArtistSummary,
  BrowseFilters,
  BrowseRequest,
  BrowseSort,
  BrowseView,
  ChartConfig,
  DiscoveryAlbumPoint,
  DiscoveryArtistPoint,
  DiscoveryGenrePoint,
  DiscoveryHeatmapCell,
  DiscoveryMission,
  GenreListRequest,
  GenreSummary,
  MusicToolIssueRequest,
  SavedChart,
  SavedSearch,
  TextFilter,
} from "../types";
import { chartGridCoverSize, completenessRange, genreSuggestionPageSize } from "./config";

export function createTextFilter(): TextFilter {
  return { operator: "contains", value: "" };
}

export function createFilters(): BrowseFilters {
  return {
    albumIds: [],
    artistKeys: [],
    albumTitle: createTextFilter(),
    trackTitle: createTextFilter(),
    albumArtist: createTextFilter(),
    displayArtist: createTextFilter(),
    publisher: createTextFilter(),
    filePath: createTextFilter(),
    filename: createTextFilter(),
    hasTrackText: "",
    genres: [],
    excludedGenres: [],
    missingFields: [],
    billboardRankMin: null,
    billboardRankMax: null,
    billboardSingleRankMin: null,
    billboardSingleRankMax: null,
    yearFrom: null,
    yearTo: null,
    releaseYearFrom: null,
    releaseYearTo: null,
    totalMinutesMin: null,
    totalMinutesMax: null,
    trackCountMin: null,
    trackCountMax: null,
    ratedTracksMin: null,
    ratedTracksMax: null,
    albumRatingMin: null,
    albumRatingMax: null,
    trackRatingMin: null,
    trackRatingMax: null,
    ratingCompletenessMin: null,
    ratingCompletenessMax: null,
    lovedTracksMin: null,
    lovedTracksMax: null,
    originCountryCodes: [],
    excludedOriginCountryCodes: [],
    missingOriginCountry: false,
    artistType: "",
    artistGender: "",
    artistBornYearFrom: null,
    artistBornYearTo: null,
    artistDied: false,
    artistDiedYearFrom: null,
    artistDiedYearTo: null,
    artistFoundedYearFrom: null,
    artistFoundedYearTo: null,
    artistDissolved: false,
    artistDissolvedYearFrom: null,
    artistDissolvedYearTo: null,
  };
}

export function defaultSort(view: BrowseView): BrowseSort {
  return { field: view === "tracks" ? "title" : "album", direction: "asc" };
}

export function createRequest(view: BrowseView = "albums"): BrowseRequest {
  return {
    view,
    searchText: "",
    filters: createFilters(),
    sort: defaultSort(view),
    limit: 50,
    offset: 0,
  };
}

export function normalizeBrowseRequestForClient(request: BrowseRequest): BrowseRequest {
  const view = request.view === "tracks" ? "tracks" : "albums";
  return {
    ...createRequest(view),
    ...request,
    view,
    filters: {
      ...createFilters(),
      ...(request.filters ?? {}),
    },
    sort: request.sort ?? defaultSort(view),
    limit: request.limit ?? 50,
    offset: request.offset ?? 0,
  };
}

export function serializeBrowseRequest(request: BrowseRequest) {
  return JSON.stringify(normalizeBrowseRequestForClient(request));
}

export function deserializeBrowseRequest(value: string) {
  return normalizeBrowseRequestForClient(JSON.parse(value) as BrowseRequest);
}

export function normalizeSavedSearchForClient(search: SavedSearch): SavedSearch {
  const request = normalizeBrowseRequestForClient(search.request);
  return { ...search, view: request.view, request };
}

export function normalizeSavedSearchesForClient(searches: SavedSearch[]) {
  return searches.map(normalizeSavedSearchForClient);
}

export function createAlbumTracksRequest(albumId: string): BrowseRequest {
  const request = createRequest("tracks");
  request.filters.albumIds = [albumId];
  request.sort = { field: "trackNumber", direction: "asc" };
  request.limit = 500;
  return request;
}

export function createArtistListRequest(): ArtistListRequest {
  return {
    searchText: "",
    sort: { field: "name", direction: "asc" },
    limit: 50,
    offset: 0,
  };
}

export function createArtistAlbumsRequest(artist: ArtistSummary): BrowseRequest {
  const request = createRequest("albums");
  request.filters.artistKeys = [artist.id];
  request.sort = { field: "year", direction: "asc" };
  request.limit = 100;
  return request;
}

export function createGenreListRequest(): GenreListRequest {
  return {
    searchText: "",
    sort: { field: "name", direction: "asc" },
    limit: 50,
    offset: 0,
  };
}

export function createGenreSuggestionRequest(offset = 0): GenreListRequest {
  return {
    searchText: "",
    sort: { field: "name", direction: "asc" },
    limit: genreSuggestionPageSize,
    offset,
  };
}

export function createGenreAlbumsRequest(genre: GenreSummary): BrowseRequest {
  const request = createRequest("albums");
  request.filters.genres = [genre.id];
  request.sort = { field: "year", direction: "asc" };
  request.limit = 100;
  return request;
}

export type DiscoverySelection = {
  title: string;
  caption: string;
};

export function createDiscoveryAlbumRequest(
  filters: Partial<BrowseFilters>,
  sort: BrowseSort = { field: "albumScore", direction: "desc" },
  limit = 50,
) {
  const request = createRequest("albums");
  request.filters = { ...request.filters, ...filters };
  request.sort = sort;
  request.limit = limit;
  return request;
}

export function createDiscoveryMissionRequest(mission: DiscoveryMission) {
  return createDiscoveryAlbumRequest(
    {
      genres: mission.genreId ? [mission.genreId] : [],
      artistKeys: mission.artistId ? [mission.artistId] : [],
      yearFrom: mission.yearFrom,
      yearTo: mission.yearTo,
      ratedTracksMin: mission.ratedTracksMin,
      ratingCompletenessMin: mission.ratingCompletenessMin,
      ratingCompletenessMax: mission.ratingCompletenessMax,
      lovedTracksMin: mission.lovedTracksMin,
    },
    { field: mission.sortField, direction: mission.sortDirection },
    mission.limit,
  );
}

export function createDiscoveryHeatmapRequest(cell: DiscoveryHeatmapCell) {
  return createDiscoveryAlbumRequest(
    { genres: [cell.genreId], yearFrom: cell.year, yearTo: cell.year },
    { field: "albumScore", direction: "desc" },
    50,
  );
}

export function createDiscoveryGenreRequest(point: DiscoveryGenrePoint) {
  return createDiscoveryAlbumRequest({ genres: [point.genreId] }, { field: "albumScore", direction: "desc" }, 100);
}

export function createDiscoveryArtistRequest(point: DiscoveryArtistPoint) {
  return createDiscoveryAlbumRequest(
    { artistKeys: [point.artistId] },
    { field: "albumScore", direction: "desc" },
    100,
  );
}

export function createDiscoveryAlbumPointRequest(point: DiscoveryAlbumPoint) {
  return createDiscoveryAlbumRequest({ albumIds: [point.albumId] }, { field: "albumScore", direction: "desc" }, 20);
}

function createMusicToolIssueRequestId(toolId: string) {
  return `${toolId}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createMusicToolIssueRequest(toolId = "duplicate-albums"): MusicToolIssueRequest {
  return {
    toolId,
    requestId: createMusicToolIssueRequestId(toolId),
    searchText: "",
    sort: { field: "album", direction: "asc" },
    limit: 50,
    offset: 0,
  };
}

export function renewMusicToolIssueRequest(
  previous: MusicToolIssueRequest,
  values: Omit<Partial<MusicToolIssueRequest>, "requestId">,
): MusicToolIssueRequest {
  const toolId = values.toolId ?? previous.toolId;
  return {
    ...previous,
    ...values,
    toolId,
    requestId: createMusicToolIssueRequestId(toolId),
  };
}

export function createChartConfig(): ChartConfig {
  const request = createRequest("albums");
  request.sort = { field: "albumScore", direction: "desc" };
  request.limit = 50;
  request.filters.ratingCompletenessMin = 100;

  return {
    request,
    rankingMetric: "albumScore",
    sortField: "albumScore",
    ratingCompletenessMin: 100,
    ratingCompletenessMax: 100,
    sortDirection: "desc",
    resultLimit: 50,
    visibleColumns: ["billboard", "rating", "complete", "score", "loved"],
    exportColumns: ["calculated"],
    viewMode: "table",
    gridCoverSize: chartGridCoverSize.default,
  };
}

export function normalizeChartGridCoverSize(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return chartGridCoverSize.default;
  }
  return Math.min(chartGridCoverSize.max, Math.max(chartGridCoverSize.min, value));
}

export function chartRequestFromConfig(config: ChartConfig): BrowseRequest {
  const { min, max } = chartCompletenessRange(config);
  return {
    ...config.request,
    view: "albums",
    offset: 0,
    limit: config.resultLimit,
    sort: {
      field: config.rankingMetric,
      direction: config.sortDirection,
    },
    filters: {
      ...createFilters(),
      ...config.request.filters,
      ...toCompletenessFilterRange(min, max),
    },
  };
}

export type ChartTemplateConfigOverrides = Omit<Partial<ChartConfig>, "request"> & {
  request?: Partial<Omit<BrowseRequest, "filters">> & { filters?: Partial<BrowseFilters> };
};

export function createChartTemplateConfig(values: ChartTemplateConfigOverrides) {
  const base = createChartConfig();
  const rankingMetric = values.rankingMetric ?? base.rankingMetric;
  const filters = {
    ...base.request.filters,
    ...(values.request?.filters ?? {}),
  };

  return {
    ...base,
    ...values,
    rankingMetric,
    sortField: values.sortField ?? values.request?.sort?.field ?? rankingMetric,
    request: {
      ...base.request,
      ...(values.request ?? {}),
      view: "albums",
      filters,
      offset: 0,
    },
  } satisfies ChartConfig;
}

export function clampCompletenessValue(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return completenessRange.min;
  return Math.min(completenessRange.max, Math.max(completenessRange.min, Math.round(value)));
}

export function normalizeCompletenessRange(minValue: number | null | undefined, maxValue: number | null | undefined) {
  const minimum = clampCompletenessValue(minValue);
  const maximum = clampCompletenessValue(maxValue);
  return minimum <= maximum ? { min: minimum, max: maximum } : { min: maximum, max: minimum };
}

export function toCompletenessFilterRange(minValue: number | null | undefined, maxValue: number | null | undefined) {
  const range = normalizeCompletenessRange(minValue, maxValue);
  return {
    ratingCompletenessMin: range.min <= completenessRange.min ? null : range.min,
    ratingCompletenessMax: range.max >= completenessRange.max ? null : range.max,
  } satisfies Pick<BrowseFilters, "ratingCompletenessMin" | "ratingCompletenessMax">;
}

export function chartCompletenessRange(config: ChartConfig) {
  const legacyThreshold = config.ratingCompletenessThreshold;
  return normalizeCompletenessRange(
    config.ratingCompletenessMin ?? legacyThreshold ?? completenessRange.max,
    config.ratingCompletenessMax ?? completenessRange.max,
  );
}

export function normalizeChartConfigForClient(config: ChartConfig) {
  const { min, max } = chartCompletenessRange(config);
  const request = {
    ...normalizeBrowseRequestForClient(config.request),
    view: "albums" as const,
  };
  return {
    ...config,
    request,
    ratingCompletenessMin: min,
    ratingCompletenessMax: max,
    ratingCompletenessThreshold: null,
    gridCoverSize: normalizeChartGridCoverSize(config.gridCoverSize),
  } satisfies ChartConfig;
}

export function normalizeSavedChartForClient(chart: SavedChart): SavedChart {
  return { ...chart, config: normalizeChartConfigForClient(chart.config) };
}

export function normalizeSavedChartsForClient(charts: SavedChart[]) {
  return charts.map(normalizeSavedChartForClient);
}

export function nextSort(current: BrowseSort, field: string): BrowseSort {
  return {
    field,
    direction: current.field === field && current.direction === "asc" ? "desc" : "asc",
  };
}

