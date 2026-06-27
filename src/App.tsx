import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import {
  Activity,
  Album,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Database,
  Download,
  Film,
  FileSearch,
  FolderInput,
  Gauge,
  Heart,
  Library,
  ListMusic,
  Moon,
  Play,
  RotateCcw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tags,
  Trash2,
  UsersRound,
  Wrench,
  X,
} from "lucide-react";
import {
  deleteSavedChart,
  deleteSavedSearch,
  clearCoverImageCache,
  exportSearch,
  cacheSettings,
  getAlbumCoverDataUrl,
  getSettings,
  getStatistics,
  getLibraryStatus,
  importAlbumCovers,
  importMusicBeeTsv,
  isTauriRuntime,
  listArtists,
  listGenres,
  listGenreSuggestions,
  listMusicToolIssues,
  listMusicTools,
  listImportRuns,
  listSavedCharts,
  listSavedSearches,
  loadCachedSettings,
  listenToCoverImportProgress,
  listenToImportProgress,
  listenToMusicToolProgress,
  saveChart,
  saveSearch,
  saveSettings,
  searchLibrary,
  exportMusicToolIssues,
} from "./backend";
import type {
  AppSettings,
  ArtistListRequest,
  ArtistListResponse,
  ArtistSummary,
  BrowseFilters,
  BrowseRequest,
  BrowseResponse,
  BrowseRow,
  BrowseSort,
  BrowseView,
  ChartConfig,
  ChartViewMode,
  CoverImportProgress,
  CoverImportSummary,
  ExportResult,
  GenreListRequest,
  GenreListResponse,
  GenreSummary,
  ImportProgress,
  ImportRun,
  ImportSummary,
  LibraryStatus,
  GenreProgressStats,
  RatingBucket,
  RatingEvent,
  MusicToolIssueRequest,
  MusicToolIssueResponse,
  MusicToolIssueRow,
  MusicToolProgress,
  MusicToolSummary,
  SavedChart,
  SavedSearch,
  StatisticsResponse,
  TextFilter,
  TextFilterOperator,
  YearProgressStats,
} from "./types";

const navigation = [
  { label: "Search", icon: Search, enabled: true },
  { label: "Charts", icon: BarChart3, enabled: true },
  { label: "Statistics", icon: Activity, enabled: true },
  { label: "Albums", icon: Album, enabled: true },
  { label: "Artists", icon: UsersRound, enabled: true },
  { label: "Genres", icon: Tags, enabled: true },
  { label: "Tools", icon: Wrench, enabled: true },
  { label: "Imports", icon: FolderInput, enabled: true },
  { label: "Settings", icon: Settings, enabled: true },
];

const operatorLabels: Record<TextFilterOperator, string> = {
  contains: "Contains",
  equals: "Equals",
  startsWith: "Starts with",
};

type MissingFieldOption = {
  value: string;
  albumLabel: string;
  trackLabel: string;
};

const missingFieldOptions: MissingFieldOption[] = [
  { value: "album", albumLabel: "Album title", trackLabel: "Track album" },
  { value: "albumArtist", albumLabel: "Album artist", trackLabel: "Album artist" },
  { value: "genre", albumLabel: "Genre", trackLabel: "Track genre" },
  { value: "year", albumLabel: "Year", trackLabel: "Track year" },
  { value: "rating", albumLabel: "Album rating", trackLabel: "Track rating" },
  { value: "time", albumLabel: "Total duration", trackLabel: "Track duration" },
];

function missingFieldLabel(value: string, view: BrowseView) {
  const option = missingFieldOptions.find((field) => field.value === value);
  if (!option) {
    return value;
  }
  return view === "tracks" ? option.trackLabel : option.albumLabel;
}

function formatMissingFieldLabels(values: string[], view: BrowseView) {
  return values.map((value) => missingFieldLabel(value, view)).join(", ");
}

const rankingOptions = [
  { value: "albumScore", label: "Album Score" },
  { value: "albumRating", label: "Album rating" },
  { value: "lovedTracks", label: "Loved tracks" },
  { value: "ae", label: "AE" },
  { value: "tmoe", label: "TMOE" },
  { value: "ratingCompleteness", label: "Completeness" },
  { value: "totalMinutes", label: "Minutes" },
];

const chartColumnOptions = [
  { value: "rating", label: "Rating" },
  { value: "complete", label: "Complete" },
  { value: "score", label: "Score" },
  { value: "loved", label: "Loved" },
  { value: "ae", label: "AE" },
  { value: "tmoe", label: "TMOE" },
  { value: "minutes", label: "Minutes" },
];

const chartViewModes: { value: ChartViewMode; label: string; icon: typeof BarChart3 }[] = [
  { value: "table", label: "Table", icon: BarChart3 },
  { value: "compact", label: "List", icon: ListMusic },
  { value: "grid", label: "Grid", icon: Album },
];

const chartGridCoverSize = {
  min: 96,
  max: 224,
  step: 8,
  default: 144,
} as const;

const genreSuggestionPageSize = 500;
const genreSuggestionAliases = ["scores"] as const;
const maxGenreSuggestions = 5;

const defaultProgress: ImportProgress = {
  status: "idle",
  processedRows: 0,
  albumCount: 0,
  message: "Ready to import a MusicBee TSV export.",
};

const defaultCoverProgress: CoverImportProgress = {
  status: "idle",
  totalAlbums: 0,
  scannedAlbums: 0,
  newCoversFound: 0,
  importedCovers: 0,
  relinkedCovers: 0,
  skippedExisting: 0,
  missingCovers: 0,
  percent: 0,
  message: "Ready to scan AlbumCovers.",
};

function createDefaultSettings(): AppSettings {
  return loadCachedSettings();
}

function createTextFilter(): TextFilter {
  return { operator: "contains", value: "" };
}

function createFilters(): BrowseFilters {
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
    yearFrom: null,
    yearTo: null,
    releaseYearFrom: null,
    releaseYearTo: null,
    totalMinutesMin: null,
    totalMinutesMax: null,
    trackCountMin: null,
    trackCountMax: null,
    albumRatingMin: null,
    albumRatingMax: null,
    trackRatingMin: null,
    trackRatingMax: null,
    ratingCompletenessMin: null,
    lovedTracksMin: null,
    lovedTracksMax: null,
  };
}

function defaultSort(view: BrowseView) {
  return { field: view === "tracks" ? "title" : "album", direction: "asc" as const };
}

function createRequest(view: BrowseView = "albums"): BrowseRequest {
  return {
    view,
    searchText: "",
    filters: createFilters(),
    sort: defaultSort(view),
    limit: 50,
    offset: 0,
  };
}

function createAlbumTracksRequest(albumId: string): BrowseRequest {
  const request = createRequest("tracks");
  request.filters.albumIds = [albumId];
  request.sort = { field: "trackNumber", direction: "asc" };
  request.limit = 500;
  return request;
}

function createArtistListRequest(): ArtistListRequest {
  return {
    searchText: "",
    sort: { field: "name", direction: "asc" },
    limit: 50,
    offset: 0,
  };
}

function createArtistAlbumsRequest(artist: ArtistSummary): BrowseRequest {
  const request = createRequest("albums");
  request.filters.artistKeys = [artist.id];
  request.sort = { field: "year", direction: "asc" };
  request.limit = 100;
  return request;
}

function createGenreListRequest(): GenreListRequest {
  return {
    searchText: "",
    sort: { field: "name", direction: "asc" },
    limit: 50,
    offset: 0,
  };
}

function createGenreSuggestionRequest(offset = 0): GenreListRequest {
  return {
    searchText: "",
    sort: { field: "name", direction: "asc" },
    limit: genreSuggestionPageSize,
    offset,
  };
}

async function loadGenreSuggestionNames() {
  try {
    return uniqueGenreSuggestionOptions(await listGenreSuggestions());
  } catch {
    // Older desktop builds or command failures can still fall back to the paginated summary command.
  }

  const names: string[] = [];
  let offset = 0;
  let total = 0;

  do {
    const nextGenres = await listGenres(createGenreSuggestionRequest(offset));
    names.push(...nextGenres.rows.map((genre) => genre.name));
    total = nextGenres.total;

    if (nextGenres.rows.length === 0) {
      break;
    }

    offset += nextGenres.rows.length;
  } while (offset < total);

  return uniqueGenreSuggestionOptions(names);
}

function createGenreAlbumsRequest(genre: GenreSummary): BrowseRequest {
  const request = createRequest("albums");
  request.filters.genres = [genre.id];
  request.sort = { field: "year", direction: "asc" };
  request.limit = 100;
  return request;
}

function createMusicToolIssueRequestId(toolId: string) {
  return `${toolId}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createMusicToolIssueRequest(toolId = "duplicate-albums"): MusicToolIssueRequest {
  return {
    toolId,
    requestId: createMusicToolIssueRequestId(toolId),
    searchText: "",
    sort: { field: "album", direction: "asc" },
    limit: 50,
    offset: 0,
  };
}

function renewMusicToolIssueRequest(
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

function createChartConfig(): ChartConfig {
  const request = createRequest("albums");
  request.sort = { field: "albumScore", direction: "desc" };
  request.limit = 50;
  request.filters.ratingCompletenessMin = 100;

  return {
    request,
    rankingMetric: "albumScore",
    sortField: "albumScore",
    ratingCompletenessThreshold: 100,
    sortDirection: "desc",
    resultLimit: 50,
    visibleColumns: ["rating", "complete", "score", "loved"],
    exportColumns: ["calculated"],
    viewMode: "table",
    gridCoverSize: chartGridCoverSize.default,
  };
}

function normalizeChartGridCoverSize(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return chartGridCoverSize.default;
  }
  return Math.min(chartGridCoverSize.max, Math.max(chartGridCoverSize.min, value));
}

function chartRequestFromConfig(config: ChartConfig): BrowseRequest {
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
      ...config.request.filters,
      ratingCompletenessMin: config.ratingCompletenessThreshold,
    },
  };
}

type ChartTemplateConfigOverrides = Omit<Partial<ChartConfig>, "request"> & {
  request?: Partial<Omit<BrowseRequest, "filters">> & { filters?: Partial<BrowseFilters> };
};

function createChartTemplateConfig(values: ChartTemplateConfigOverrides) {
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

type ChartTemplate = {
  id: string;
  label: string;
  description: string;
  icon: typeof BarChart3;
  createConfig: () => ChartConfig;
};

const chartTemplates: ChartTemplate[] = [
  {
    id: "year",
    label: "Year",
    description: "Top albums from a selected year.",
    icon: BarChart3,
    createConfig: () =>
      createChartTemplateConfig({
        request: { filters: { yearFrom: 1987, yearTo: 1987 } },
      }),
  },
  {
    id: "decade",
    label: "Decade",
    description: "Top albums from a selected decade.",
    icon: Gauge,
    createConfig: () =>
      createChartTemplateConfig({
        request: { filters: { yearFrom: 1980, yearTo: 1989 } },
      }),
  },
  {
    id: "genre",
    label: "Genre",
    description: "Top albums in a canonical genre.",
    icon: Tags,
    createConfig: () =>
      createChartTemplateConfig({
        request: { filters: { genres: ["Synthpop"] } },
      }),
  },
  {
    id: "scores",
    label: "Scores",
    description: "Film, TV, and game score albums.",
    icon: Film,
    createConfig: () =>
      createChartTemplateConfig({
        request: { filters: { genres: ["scores"] } },
      }),
  },
  {
    id: "artist",
    label: "Artist",
    description: "Top albums by album artist.",
    icon: UsersRound,
    createConfig: () =>
      createChartTemplateConfig({
        request: { filters: { albumArtist: { operator: "contains", value: "Pet Shop Boys" } } },
      }),
  },
  {
    id: "loved",
    label: "Loved",
    description: "Albums with the most loved tracks.",
    icon: Heart,
    createConfig: () =>
      createChartTemplateConfig({
        rankingMetric: "lovedTracks",
        request: { sort: { field: "lovedTracks", direction: "desc" }, filters: { lovedTracksMin: 1 } },
      }),
  },
  {
    id: "ae",
    label: "AE",
    description: "Albums with the highest Album Excellence.",
    icon: Sparkles,
    createConfig: () =>
      createChartTemplateConfig({
        rankingMetric: "ae",
        request: { sort: { field: "ae", direction: "desc" } },
      }),
  },
  {
    id: "tmoe",
    label: "TMOE",
    description: "Albums with the highest Total Minutes Of Excellence.",
    icon: Clock3,
    createConfig: () =>
      createChartTemplateConfig({
        rankingMetric: "tmoe",
        request: { sort: { field: "tmoe", direction: "desc" } },
      }),
  },
];

const musicToolCatalog: MusicToolSummary[] = [
  {
    id: "duplicate-albums",
    label: "Duplicate albums",
    description: "Potential duplicate album versions with the same artist, title, and year.",
    severity: "medium",
    scope: "albums",
    issueCount: -1,
    albumCount: -1,
    trackCount: -1,
  },
  {
    id: "duplicates-within-album",
    label: "Duplicates within album",
    description: "Tracks that repeat a title or disc/track position inside one album.",
    severity: "high",
    scope: "tracks",
    issueCount: -1,
    albumCount: -1,
    trackCount: -1,
  },
  {
    id: "invalid-time-values",
    label: "Invalid time values",
    description: "Tracks where duration could not be parsed into seconds.",
    severity: "high",
    scope: "tracks",
    issueCount: -1,
    albumCount: -1,
    trackCount: -1,
  },
  {
    id: "non-numeric-ratings",
    label: "Non-numeric ratings",
    description: "Track ratings that contain non-numeric text.",
    severity: "medium",
    scope: "tracks",
    issueCount: -1,
    albumCount: -1,
    trackCount: -1,
  },
  {
    id: "missing-tags",
    label: "Missing tags",
    description: "Tracks missing required album, artist, title, genre, year, or file tags.",
    severity: "high",
    scope: "tracks",
    issueCount: -1,
    albumCount: -1,
    trackCount: -1,
  },
  {
    id: "non-mp3-files",
    label: "Non-MP3 files",
    description: "Tracks whose filenames do not end in .mp3.",
    severity: "low",
    scope: "tracks",
    issueCount: -1,
    albumCount: -1,
    trackCount: -1,
  },
  {
    id: "year-anomalies",
    label: "Year anomalies",
    description: "Tracks with missing or implausible canonical year values.",
    severity: "medium",
    scope: "tracks",
    issueCount: -1,
    albumCount: -1,
    trackCount: -1,
  },
  {
    id: "ratings-out-of-range",
    label: "Ratings out of range",
    description: "Numeric ratings that are not whole-number values from 0 to 5.",
    severity: "high",
    scope: "tracks",
    issueCount: -1,
    albumCount: -1,
    trackCount: -1,
  },
  {
    id: "track-disc-number-issues",
    label: "Track/disc number issues",
    description: "Tracks with missing, zero, or negative disc and track numbers.",
    severity: "medium",
    scope: "tracks",
    issueCount: -1,
    albumCount: -1,
    trackCount: -1,
  },
  {
    id: "inconsistent-album-metadata",
    label: "Inconsistent album metadata",
    description: "Albums whose tracks disagree on title, genre, or publisher.",
    severity: "medium",
    scope: "albums",
    issueCount: -1,
    albumCount: -1,
    trackCount: -1,
  },
  {
    id: "whitespace-anomalies",
    label: "Whitespace anomalies",
    description: "Track metadata with repeated internal spaces.",
    severity: "low",
    scope: "tracks",
    issueCount: -1,
    albumCount: -1,
    trackCount: -1,
  },
  {
    id: "genre-normalization-issues",
    label: "Genre normalization issues",
    description: "Tracks with multi-value genre strings that were collapsed to one canonical genre.",
    severity: "low",
    scope: "tracks",
    issueCount: -1,
    albumCount: -1,
    trackCount: -1,
  },
  {
    id: "conflicting-album-artists",
    label: "Conflicting album artists",
    description: "Albums whose tracks disagree on album artist.",
    severity: "high",
    scope: "albums",
    issueCount: -1,
    albumCount: -1,
    trackCount: -1,
  },
  {
    id: "multiple-years-per-album",
    label: "Multiple years per album",
    description: "Albums containing tracks with more than one canonical year.",
    severity: "medium",
    scope: "albums",
    issueCount: -1,
    albumCount: -1,
    trackCount: -1,
  },
];

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat().format(value ?? 0);
}

function formatToolCount(value: number | null | undefined) {
  if (value == null || value < 0) {
    return "On select";
  }
  return formatNumber(value);
}

function formatToolProgress(progress: MusicToolProgress | null) {
  if (!progress) {
    return null;
  }
  return `${Math.round(progress.percent)}%`;
}

function isMusicToolProgressActive(progress: MusicToolProgress | null) {
  return Boolean(progress && progress.status !== "completed" && progress.status !== "failed");
}

function formatDuration(ms: number) {
  if (!ms) return "0s";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(value: string | null) {
  if (!value) return "Not completed";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatMinutes(seconds: number | null | undefined) {
  if (seconds == null) return "";
  return `${(seconds / 60).toFixed(1)}m`;
}

function formatHours(seconds: number | null | undefined) {
  if (!seconds) return "0h";
  return `${(seconds / 3600).toFixed(1)}h`;
}

function formatPercent(value: number | null | undefined, digits = 1) {
  if (value == null) return "";
  return `${(value * 100).toFixed(digits)}%`;
}

function percentOf(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (value / total) * 100));
}

function formatAverage(value: number | null | undefined, digits = 1) {
  if (value == null) return "";
  return value.toFixed(digits);
}

function formatTrackRating(value: number | null | undefined) {
  if (value == null) return "";
  return `${value / 20}`;
}

function rankingLabel(value: string) {
  return rankingOptions.find((option) => option.value === value)?.label ?? "Album Score";
}

function severityLabel(value: string | null | undefined) {
  if (!value) return "";
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function formatChartMetric(row: BrowseRow, metric: string) {
  switch (metric) {
    case "albumRating":
      return row.effectiveAlbumRating?.toString() ?? "";
    case "lovedTracks":
      return row.lovedTracks?.toString() ?? "0";
    case "ae":
      return formatPercent(row.aeRatio, 2);
    case "tmoe":
      return formatMinutes(row.tmoeSeconds);
    case "ratingCompleteness":
      return formatPercent(row.ratingCompleteness);
    case "totalMinutes":
      return formatMinutes(row.totalSeconds);
    default:
      return row.albumScore?.toFixed(3) ?? "";
  }
}

function browseRowSortValue(row: BrowseRow, field: string) {
  switch (field) {
    case "title":
      return row.title?.toLowerCase() ?? "";
    case "displayArtist":
      return row.displayArtist?.toLowerCase() ?? "";
    case "artist":
      return row.albumArtistDisplay?.toLowerCase() ?? "";
    case "year":
      return row.year;
    case "genre":
      return row.canonicalGenre?.toLowerCase() ?? "";
    case "trackRating":
      return row.normalizedRating;
    case "time":
      return row.trackSeconds;
    case "trackNumber":
      return (row.discNumber ?? 0) * 10000 + (row.trackNumber ?? 0);
    case "totalMinutes":
      return row.totalSeconds;
    case "trackCount":
      return row.totalTracks;
    case "albumRating":
      return row.effectiveAlbumRating;
    case "ratingCompleteness":
      return row.ratingCompleteness;
    case "lovedTracks":
      return row.lovedTracks;
    case "ae":
      return row.aeRatio;
    case "tmoe":
      return row.tmoeSeconds;
    case "albumScore":
      return row.albumScore;
    default:
      return row.album?.toLowerCase() ?? "";
  }
}

function compareBrowseRows(left: BrowseRow, right: BrowseRow, field: string) {
  const leftValue = browseRowSortValue(left, field);
  const rightValue = browseRowSortValue(right, field);
  if (typeof leftValue === "string" || typeof rightValue === "string") {
    return String(leftValue).localeCompare(String(rightValue));
  }
  return (leftValue ?? 0) - (rightValue ?? 0);
}

function parseList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatList(values: string[]) {
  return values.join(", ");
}

function listsEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function normalizeGenreSuggestionText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueGenreSuggestionOptions(values: string[]) {
  const seen = new Set<string>();
  const options: string[] = [];
  values.forEach((value) => {
    const trimmed = value.trim();
    const key = normalizeGenreSuggestionText(trimmed);
    if (!trimmed || seen.has(key)) {
      return;
    }
    seen.add(key);
    options.push(trimmed);
  });
  return options;
}

function genreTokenRange(value: string, caretPosition: number) {
  const cursor = Math.min(Math.max(caretPosition, 0), value.length);
  const commaBefore = value.lastIndexOf(",", Math.max(0, cursor - 1));
  const commaAfter = value.indexOf(",", cursor);
  return {
    start: commaBefore + 1,
    end: commaAfter === -1 ? value.length : commaAfter,
  };
}

function currentGenreToken(value: string, caretPosition: number) {
  const range = genreTokenRange(value, caretPosition);
  const rawValue = value.slice(range.start, range.end);
  return {
    ...range,
    rawValue,
    query: rawValue.trim(),
  };
}

function replaceGenreToken(value: string, caretPosition: number, genre: string) {
  const range = genreTokenRange(value, caretPosition);
  const rawValue = value.slice(range.start, range.end);
  const leadingWhitespace = rawValue.match(/^\s*/)?.[0] ?? "";
  const trailingWhitespace = rawValue.match(/\s*$/)?.[0] ?? "";
  const nextValue = `${value.slice(0, range.start)}${leadingWhitespace}${genre}${trailingWhitespace}${value.slice(range.end)}`;

  return {
    value: nextValue,
    caretPosition: range.start + leadingWhitespace.length + genre.length,
  };
}

function genreSuggestionScore(option: string, query: string) {
  const normalizedOption = normalizeGenreSuggestionText(option);
  const normalizedQuery = normalizeGenreSuggestionText(query);
  if (!normalizedOption || !normalizedQuery) {
    return null;
  }
  if (normalizedOption === normalizedQuery) {
    return 0;
  }
  if (normalizedOption.startsWith(normalizedQuery)) {
    return 10 + (normalizedOption.length - normalizedQuery.length) / 100;
  }

  const wordStartIndex = normalizedOption
    .split(" ")
    .findIndex((word) => word.startsWith(normalizedQuery));
  if (wordStartIndex >= 0) {
    const characterIndex = normalizedOption.indexOf(normalizedOption.split(" ")[wordStartIndex]);
    return 20 + characterIndex + (normalizedOption.length - normalizedQuery.length) / 100;
  }

  const includesIndex = normalizedOption.indexOf(normalizedQuery);
  if (includesIndex >= 0) {
    return 40 + includesIndex + (normalizedOption.length - normalizedQuery.length) / 100;
  }

  let optionIndex = 0;
  let distance = 0;
  for (const character of normalizedQuery) {
    const nextIndex = normalizedOption.indexOf(character, optionIndex);
    if (nextIndex === -1) {
      return null;
    }
    distance += nextIndex - optionIndex;
    optionIndex = nextIndex + 1;
  }

  return 80 + distance + normalizedOption.length / 100;
}

function genreSuggestions(options: string[], query: string) {
  const normalizedQuery = normalizeGenreSuggestionText(query);
  if (!normalizedQuery) {
    return [];
  }

  return options
    .map((option) => ({ option, score: genreSuggestionScore(option, normalizedQuery) }))
    .filter((item): item is { option: string; score: number } => item.score !== null)
    .sort((left, right) => left.score - right.score || left.option.localeCompare(right.option))
    .slice(0, maxGenreSuggestions)
    .map((item) => item.option);
}

function numberValue(value: string) {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampBackupRetention(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return 3;
  return Math.min(50, Math.max(1, Math.round(value)));
}

function textFilterLabel(label: string, filter: TextFilter) {
  if (!filter.value.trim()) return null;
  return `${label} ${operatorLabels[filter.operator].toLowerCase()} "${filter.value.trim()}"`;
}

function Metric({
  label,
  value,
  tone = "neutral",
  icon: Icon,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "teal" | "amber";
  icon: typeof Database;
}) {
  return (
    <section className={`metric metric-${tone}`}>
      <div className="metric-icon" aria-hidden="true">
        <Icon size={18} strokeWidth={2} />
      </div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </section>
  );
}

function RunStatus({ status }: { status: string }) {
  return <span className={`run-status run-status-${status.toLowerCase()}`}>{status}</span>;
}

function TextCriterion({
  label,
  filter,
  onChange,
  placeholder,
}: {
  label: string;
  filter: TextFilter;
  onChange: (filter: TextFilter) => void;
  placeholder?: string;
}) {
  return (
    <label className="criterion criterion-text">
      <span>{label}</span>
      <div>
        <select
          value={filter.operator}
          onChange={(event) =>
            onChange({ ...filter, operator: event.target.value as TextFilterOperator })
          }
        >
          {Object.entries(operatorLabels).map(([value, optionLabel]) => (
            <option key={value} value={value}>
              {optionLabel}
            </option>
          ))}
        </select>
        <input
          value={filter.value}
          onChange={(event) => onChange({ ...filter, value: event.target.value })}
          placeholder={placeholder}
        />
      </div>
    </label>
  );
}

function GenreListCriterion({
  label,
  values,
  onChange,
  placeholder,
  genreOptions = [],
  onRequestOptions,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  genreOptions?: string[];
  onRequestOptions?: () => void;
}) {
  const inputId = useId();
  const listboxId = `${inputId}-genre-suggestions`;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draftValue, setDraftValue] = useState(() => formatList(values));
  const [caretPosition, setCaretPosition] = useState(() => draftValue.length);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [isSuggestionOpen, setIsSuggestionOpen] = useState(false);
  const activeToken = useMemo(
    () => currentGenreToken(draftValue, caretPosition),
    [caretPosition, draftValue],
  );
  const suggestions = useMemo(
    () => genreSuggestions(genreOptions, activeToken.query),
    [activeToken.query, genreOptions],
  );
  const showSuggestions = isSuggestionOpen && suggestions.length > 0 && activeToken.query.trim().length > 0;
  const activeSuggestionId = showSuggestions
    ? `${listboxId}-option-${activeSuggestionIndex}`
    : undefined;

  useEffect(() => {
    if (!listsEqual(parseList(draftValue), values)) {
      const nextValue = formatList(values);
      setDraftValue(nextValue);
      setCaretPosition(nextValue.length);
    }
  }, [draftValue, values]);

  useEffect(() => {
    setActiveSuggestionIndex(0);
  }, [activeToken.query, suggestions.length]);

  function syncCaret(input: HTMLInputElement) {
    setCaretPosition(input.selectionStart ?? input.value.length);
  }

  function updateDraft(nextValue: string) {
    setDraftValue(nextValue);
    onChange(parseList(nextValue));
  }

  function chooseSuggestion(suggestion: string) {
    const nextDraft = replaceGenreToken(draftValue, caretPosition, suggestion);
    updateDraft(nextDraft.value);
    setCaretPosition(nextDraft.caretPosition);
    setIsSuggestionOpen(false);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextDraft.caretPosition, nextDraft.caretPosition);
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      setIsSuggestionOpen(true);
      setActiveSuggestionIndex((current) => (showSuggestions ? (current + 1) % suggestions.length : 0));
      return;
    }

    if (event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      setIsSuggestionOpen(true);
      setActiveSuggestionIndex((current) =>
        showSuggestions ? (current - 1 + suggestions.length) % suggestions.length : suggestions.length - 1,
      );
      return;
    }

    if ((event.key === "Enter" || event.key === "Tab") && showSuggestions) {
      event.preventDefault();
      chooseSuggestion(suggestions[activeSuggestionIndex]);
      return;
    }

    if (event.key === "Escape") {
      setIsSuggestionOpen(false);
    }
  }

  return (
    <div className="criterion genre-list-criterion">
      <span id={`${inputId}-label`}>{label}</span>
      <input
        ref={inputRef}
        id={inputId}
        aria-labelledby={`${inputId}-label`}
        aria-autocomplete="list"
        aria-controls={showSuggestions ? listboxId : undefined}
        aria-expanded={showSuggestions}
        aria-activedescendant={activeSuggestionId}
        value={draftValue}
        onChange={(event) => {
          const nextValue = event.target.value;
          syncCaret(event.target);
          updateDraft(nextValue);
          setIsSuggestionOpen(true);
        }}
        onFocus={(event) => {
          syncCaret(event.currentTarget);
          setIsSuggestionOpen(true);
          if (genreOptions.length <= genreSuggestionAliases.length) {
            onRequestOptions?.();
          }
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={(event) => syncCaret(event.currentTarget)}
        onClick={(event) => syncCaret(event.currentTarget)}
        onSelect={(event) => syncCaret(event.currentTarget)}
        onBlur={(event) => {
          setDraftValue(formatList(parseList(event.currentTarget.value)));
          setIsSuggestionOpen(false);
        }}
        placeholder={placeholder}
      />
      {showSuggestions ? (
        <div className="genre-suggestions" id={listboxId} role="listbox">
          {suggestions.map((suggestion, index) => (
            <button
              className={index === activeSuggestionIndex ? "genre-suggestion active" : "genre-suggestion"}
              id={`${listboxId}-option-${index}`}
              key={suggestion}
              type="button"
              role="option"
              aria-selected={index === activeSuggestionIndex}
              onMouseDown={(event) => {
                event.preventDefault();
                chooseSuggestion(suggestion);
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="criterion">
      <span>{label}</span>
      <input
        type="number"
        value={value ?? ""}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(numberValue(event.target.value))}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="criterion">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function nextSort(current: BrowseSort, field: string): BrowseSort {
  return {
    field,
    direction: current.field === field && current.direction === "asc" ? "desc" : "asc",
  };
}

function SortableColumnHeader({
  label,
  field,
  sort,
  onSort,
}: {
  label: string;
  field: string;
  sort: BrowseSort;
  onSort: (field: string) => void;
}) {
  const isActive = sort.field === field;
  const Icon = isActive ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  const nextDirection = isActive && sort.direction === "asc" ? "descending" : "ascending";

  return (
    <span role="columnheader" aria-sort={isActive ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
      <button
        className={`table-sort-button${isActive ? " active" : ""}`}
        type="button"
        aria-label={`Sort by ${label} ${nextDirection}`}
        onClick={() => onSort(field)}
      >
        <span>{label}</span>
        <Icon size={13} strokeWidth={2.2} aria-hidden="true" />
      </button>
    </span>
  );
}

function ResultTable({
  response,
  sort,
  onSort,
}: {
  response: BrowseResponse | null;
  sort: BrowseSort;
  onSort: (field: string) => void;
}) {
  if (!response) {
    return (
      <div className="empty-state large">
        <FileSearch size={20} />
        <span>No results loaded.</span>
      </div>
    );
  }

  if (response.rows.length === 0) {
    return (
      <div className="empty-state large">
        <FileSearch size={20} />
        <span>No matches.</span>
      </div>
    );
  }

  return response.view === "tracks" ? (
    <div className="result-table track-results" role="table">
      <div className="result-table-head" role="row">
        <SortableColumnHeader label="Track" field="title" sort={sort} onSort={onSort} />
        <SortableColumnHeader label="Album" field="album" sort={sort} onSort={onSort} />
        <SortableColumnHeader label="Artist" field="displayArtist" sort={sort} onSort={onSort} />
        <SortableColumnHeader label="Year" field="year" sort={sort} onSort={onSort} />
        <SortableColumnHeader label="Rating" field="trackRating" sort={sort} onSort={onSort} />
        <span role="columnheader">File</span>
      </div>
      {response.rows.map((row) => (
        <div className="result-table-row" role="row" key={row.id}>
          <span role="cell">
            <strong>{row.title ?? "Untitled"}</strong>
            <small>
              {[row.discNumber, row.trackNumber].filter((value) => value != null).join(".")}
              {row.love === "L" ? "  Loved" : ""}
            </small>
          </span>
          <span className="album-title-cell" role="cell">
            <AlbumTitleContents row={row} subtitle={row.albumArtistDisplay ?? row.year?.toString() ?? null} />
          </span>
          <span role="cell">{row.displayArtist ?? row.albumArtistDisplay ?? ""}</span>
          <span role="cell">{row.year ?? ""}</span>
          <span role="cell">{formatTrackRating(row.normalizedRating)}</span>
          <span role="cell" title={row.filePath ?? ""}>
            {row.filename ?? ""}
          </span>
        </div>
      ))}
    </div>
  ) : (
    <div className="result-table album-results" role="table">
      <div className="result-table-head" role="row">
        <SortableColumnHeader label="Album" field="album" sort={sort} onSort={onSort} />
        <SortableColumnHeader label="Artist" field="artist" sort={sort} onSort={onSort} />
        <SortableColumnHeader label="Year" field="year" sort={sort} onSort={onSort} />
        <SortableColumnHeader label="Genre" field="genre" sort={sort} onSort={onSort} />
        <SortableColumnHeader label="Tracks" field="trackCount" sort={sort} onSort={onSort} />
        <SortableColumnHeader label="Complete" field="ratingCompleteness" sort={sort} onSort={onSort} />
        <SortableColumnHeader label="Score" field="albumScore" sort={sort} onSort={onSort} />
      </div>
      {response.rows.map((row) => (
        <div className="result-table-row" role="row" key={row.id}>
          <span className="album-title-cell" role="cell">
            <AlbumTitleContents row={row} />
          </span>
          <span role="cell">{row.albumArtistDisplay ?? ""}</span>
          <span role="cell">{row.year ?? ""}</span>
          <span role="cell">{row.canonicalGenre ?? ""}</span>
          <span role="cell">{row.totalTracks ?? ""}</span>
          <span role="cell">{formatPercent(row.ratingCompleteness)}</span>
          <span role="cell">{row.albumScore?.toFixed(3) ?? ""}</span>
        </div>
      ))}
    </div>
  );
}

function albumInitial(row: BrowseRow | null) {
  return row?.album?.trim().slice(0, 1).toUpperCase() || "A";
}

function AlbumCover({
  row,
  className = "",
  decorative = true,
}: {
  row: BrowseRow | null;
  className?: string;
  decorative?: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const coverPath = row?.coverPath ?? null;
  const albumId = row?.albumId ?? null;

  useEffect(() => {
    setImageFailed(false);
    setImageUrl(null);
    if (!albumId || !coverPath) {
      return;
    }

    let cancelled = false;
    void getAlbumCoverDataUrl(albumId).then((nextImageUrl) => {
      if (!cancelled) {
        setImageUrl(nextImageUrl);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [albumId, coverPath]);

  const displayImageUrl = imageFailed ? null : imageUrl;
  const label = row?.album ? `${row.album} cover` : "Album cover";
  const classes = ["cover-placeholder", displayImageUrl ? "cover-image" : "", className].filter(Boolean).join(" ");

  return (
    <span className={classes} aria-hidden={decorative ? "true" : undefined}>
      {displayImageUrl ? (
        <img
          src={displayImageUrl}
          alt={decorative ? "" : label}
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span>{albumInitial(row)}</span>
      )}
    </span>
  );
}

function AlbumTitleContents({
  row,
  subtitle = formatMinutes(row.totalSeconds),
}: {
  row: BrowseRow;
  subtitle?: string | null;
}) {
  return (
    <>
      <AlbumCover row={row} className="cover-mini" />
      <span>
        <strong>{row.album ?? "Untitled"}</strong>
        {subtitle ? <small>{subtitle}</small> : null}
      </span>
    </>
  );
}

function formatTrackPosition(row: BrowseRow) {
  const disc = row.discNumber?.toString() ?? "";
  const track = row.trackNumber?.toString() ?? "";
  if (disc && track) return `${disc}.${track}`;
  return disc || track;
}

function AlbumIndexTable({
  response,
  selectedAlbumId,
  onSelect,
  sort,
  onSort,
}: {
  response: BrowseResponse | null;
  selectedAlbumId: string | null;
  onSelect: (albumId: string) => void;
  sort: BrowseSort;
  onSort: (field: string) => void;
}) {
  if (!response) {
    return (
      <div className="empty-state large">
        <Album size={20} />
        <span>No albums loaded.</span>
      </div>
    );
  }

  if (response.rows.length === 0) {
    return (
      <div className="empty-state large">
        <FileSearch size={20} />
        <span>No albums match.</span>
      </div>
    );
  }

  return (
    <div className="result-table album-index-results" role="table">
      <div className="result-table-head" role="row">
        <SortableColumnHeader label="Album" field="album" sort={sort} onSort={onSort} />
        <SortableColumnHeader label="Artist" field="artist" sort={sort} onSort={onSort} />
        <SortableColumnHeader label="Year" field="year" sort={sort} onSort={onSort} />
        <SortableColumnHeader label="Genre" field="genre" sort={sort} onSort={onSort} />
        <SortableColumnHeader label="Tracks" field="trackCount" sort={sort} onSort={onSort} />
        <SortableColumnHeader label="Complete" field="ratingCompleteness" sort={sort} onSort={onSort} />
        <SortableColumnHeader label="Score" field="albumScore" sort={sort} onSort={onSort} />
      </div>
      {response.rows.map((row) => {
        const isSelected = row.albumId === selectedAlbumId;
        return (
          <div
            className={`result-table-row selectable${isSelected ? " selected" : ""}`}
            role="row"
            aria-selected={isSelected}
            tabIndex={0}
            key={row.id}
            onClick={() => onSelect(row.albumId)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(row.albumId);
              }
            }}
          >
            <span className="album-title-cell" role="cell">
              <AlbumTitleContents row={row} />
            </span>
            <span role="cell">{row.albumArtistDisplay ?? ""}</span>
            <span role="cell">{row.year ?? ""}</span>
            <span role="cell">{row.canonicalGenre ?? ""}</span>
            <span role="cell">{row.totalTracks ?? ""}</span>
            <span role="cell">{formatPercent(row.ratingCompleteness)}</span>
            <span role="cell">{row.albumScore?.toFixed(3) ?? ""}</span>
          </div>
        );
      })}
    </div>
  );
}

function AlbumTrackTable({
  response,
  isLoading,
}: {
  response: BrowseResponse | null;
  isLoading: boolean;
}) {
  if (!response) {
    return (
      <div className="empty-state large">
        <ListMusic size={20} />
        <span>{isLoading ? "Loading track list." : "Select an album."}</span>
      </div>
    );
  }

  if (response.rows.length === 0) {
    return (
      <div className="empty-state large">
        <FileSearch size={20} />
        <span>No tracks found.</span>
      </div>
    );
  }

  return (
    <div className="result-table album-track-results" role="table">
      <div className="result-table-head" role="row">
        <span role="columnheader">#</span>
        <span role="columnheader">Track</span>
        <span role="columnheader">Artist</span>
        <span role="columnheader">Time</span>
        <span role="columnheader">Rating</span>
        <span role="columnheader">File</span>
      </div>
      {response.rows.map((row) => (
        <div className="result-table-row" role="row" key={row.id}>
          <span role="cell">{formatTrackPosition(row)}</span>
          <span role="cell">
            <strong>{row.title ?? "Untitled"}</strong>
            <small>{row.love === "L" ? "Loved" : row.canonicalGenre ?? ""}</small>
          </span>
          <span role="cell">{row.displayArtist ?? row.albumArtistDisplay ?? ""}</span>
          <span role="cell">{formatMinutes(row.trackSeconds)}</span>
          <span role="cell">{formatTrackRating(row.normalizedRating)}</span>
          <span role="cell" title={row.filePath ?? ""}>
            {row.filename ?? ""}
          </span>
        </div>
      ))}
    </div>
  );
}

function AlbumDetailPanel({
  album,
  tracks,
  isLoading,
  includeCalculated,
  onIncludeCalculatedChange,
  exportResult,
  onExport,
}: {
  album: BrowseRow | null;
  tracks: BrowseResponse | null;
  isLoading: boolean;
  includeCalculated: boolean;
  onIncludeCalculatedChange: (value: boolean) => void;
  exportResult: ExportResult | null;
  onExport: (format: string) => Promise<void>;
}) {
  if (!album) {
    return (
      <aside className="detail-panel album-detail" aria-label="Album details">
        <div className="detail-header">
          <Album size={20} />
          <div>
            <h2>Album Detail</h2>
            <p>Select an album from the index</p>
          </div>
        </div>
        <div className="empty-state">
          <FileSearch size={20} />
          <span>No album selected.</span>
        </div>
      </aside>
    );
  }

  return (
    <aside className="detail-panel album-detail" aria-label="Album details">
      <div className="detail-header">
        <Album size={20} />
        <div>
          <h2>{album.album ?? "Untitled"}</h2>
          <p>{[album.albumArtistDisplay, album.year, album.canonicalGenre].filter(Boolean).join(" / ")}</p>
        </div>
      </div>

      <AlbumCover row={album} className="album-cover-large" decorative={false} />

      <dl className="run-details album-detail-stats">
        <div>
          <dt>Tracks</dt>
          <dd>
            {album.ratedTracks != null ? formatNumber(album.ratedTracks) : formatNumber(album.totalTracks)}
            {album.ratedTracks != null ? ` / ${formatNumber(album.totalTracks)} rated` : ""}
            {isLoading ? " / loading" : ""}
          </dd>
        </div>
        <div>
          <dt>Total time</dt>
          <dd>{formatMinutes(album.totalSeconds)}</dd>
        </div>
        <div>
          <dt>Rating completeness</dt>
          <dd>{formatPercent(album.ratingCompleteness)}</dd>
        </div>
        <div>
          <dt>Album rating</dt>
          <dd>{album.effectiveAlbumRating ?? ""}</dd>
        </div>
        <div>
          <dt>TMOE</dt>
          <dd>{formatMinutes(album.tmoeSeconds)}</dd>
        </div>
        <div>
          <dt>AE</dt>
          <dd>{formatPercent(album.aeRatio, 2)}</dd>
        </div>
        <div>
          <dt>Loved tracks</dt>
          <dd>{formatNumber(album.lovedTracks)}</dd>
        </div>
        <div>
          <dt>Album Score</dt>
          <dd>{album.albumScore?.toFixed(3) ?? ""}</dd>
        </div>
        <div>
          <dt>Publisher</dt>
          <dd>{album.publisher ?? ""}</dd>
        </div>
        <div>
          <dt>Release year</dt>
          <dd>{album.releaseYear ?? ""}</dd>
        </div>
      </dl>

      <section className="export-box">
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={includeCalculated}
            onChange={(event) => onIncludeCalculatedChange(event.target.checked)}
          />
          <span>Calculated columns</span>
        </label>
        <div className="export-grid">
          {["csv", "tsv", "xlsx", "json", "txt"].map((format) => (
            <button type="button" key={format} onClick={() => void onExport(format)}>
              <Download size={16} />
              <span>{format.toUpperCase()}</span>
            </button>
          ))}
        </div>
        {exportResult ? (
          <div className="export-result">
            <Check size={17} />
            <span>
              {formatNumber(exportResult.rowCount)} tracks to {exportResult.path}
            </span>
          </div>
        ) : null}
      </section>
    </aside>
  );
}

function artistInitial(artist: ArtistSummary | null) {
  return artist?.name.trim().slice(0, 1).toUpperCase() || "A";
}

function formatYearSpan(firstYear: number | null | undefined, lastYear: number | null | undefined) {
  if (firstYear == null && lastYear == null) return "";
  if (firstYear != null && lastYear != null && firstYear !== lastYear) {
    return `${firstYear}-${lastYear}`;
  }
  return `${firstYear ?? lastYear}`;
}

function ArtistIndexTable({
  response,
  selectedArtistId,
  onSelect,
}: {
  response: ArtistListResponse | null;
  selectedArtistId: string | null;
  onSelect: (artistId: string) => void;
}) {
  if (!response) {
    return (
      <div className="empty-state large">
        <UsersRound size={20} />
        <span>No artists loaded.</span>
      </div>
    );
  }

  if (response.rows.length === 0) {
    return (
      <div className="empty-state large">
        <FileSearch size={20} />
        <span>No artists match.</span>
      </div>
    );
  }

  return (
    <div className="result-table artist-index-results" role="table">
      <div className="result-table-head" role="row">
        <span role="columnheader">Artist</span>
        <span role="columnheader">Albums</span>
        <span role="columnheader">Years</span>
        <span role="columnheader">Top genre</span>
        <span role="columnheader">Complete</span>
        <span role="columnheader">Avg score</span>
        <span role="columnheader">Loved</span>
      </div>
      {response.rows.map((artist) => {
        const isSelected = artist.id === selectedArtistId;
        return (
          <div
            className={`result-table-row selectable${isSelected ? " selected" : ""}`}
            role="row"
            aria-selected={isSelected}
            tabIndex={0}
            key={artist.id}
            onClick={() => onSelect(artist.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(artist.id);
              }
            }}
          >
            <span className="album-index-title" role="cell">
              <span className="cover-placeholder cover-mini artist-mini" aria-hidden="true">
                <span>{artistInitial(artist)}</span>
              </span>
              <span>
                <strong>{artist.name}</strong>
                <small>{formatNumber(artist.trackCount)} tracks</small>
              </span>
            </span>
            <span role="cell">{formatNumber(artist.albumCount)}</span>
            <span role="cell">{formatYearSpan(artist.firstYear, artist.lastYear)}</span>
            <span role="cell">{artist.topGenre ?? ""}</span>
            <span role="cell">{formatPercent(artist.averageRatingCompleteness)}</span>
            <span role="cell">{formatAverage(artist.averageAlbumScore, 2)}</span>
            <span role="cell">{formatNumber(artist.lovedTracks)}</span>
          </div>
        );
      })}
    </div>
  );
}

function ArtistAlbumTable({ response }: { response: BrowseResponse | null }) {
  if (!response) {
    return (
      <div className="empty-state large">
        <Album size={20} />
        <span>Select an artist.</span>
      </div>
    );
  }

  if (response.rows.length === 0) {
    return (
      <div className="empty-state large">
        <FileSearch size={20} />
        <span>No albums found.</span>
      </div>
    );
  }

  return (
    <div className="result-table artist-album-results" role="table">
      <div className="result-table-head" role="row">
        <span role="columnheader">Album</span>
        <span role="columnheader">Year</span>
        <span role="columnheader">Genre</span>
        <span role="columnheader">Tracks</span>
        <span role="columnheader">Complete</span>
        <span role="columnheader">Rating</span>
        <span role="columnheader">Score</span>
      </div>
      {response.rows.map((row) => (
        <div className="result-table-row" role="row" key={row.id}>
          <span className="album-title-cell" role="cell">
            <AlbumTitleContents row={row} />
          </span>
          <span role="cell">{row.year ?? ""}</span>
          <span role="cell">{row.canonicalGenre ?? ""}</span>
          <span role="cell">{formatNumber(row.totalTracks)}</span>
          <span role="cell">{formatPercent(row.ratingCompleteness)}</span>
          <span role="cell">{row.effectiveAlbumRating ?? ""}</span>
          <span role="cell">{row.albumScore?.toFixed(3) ?? ""}</span>
        </div>
      ))}
    </div>
  );
}

function ArtistDetailPanel({
  artist,
  includeCalculated,
  onIncludeCalculatedChange,
  exportResult,
  onExport,
}: {
  artist: ArtistSummary | null;
  includeCalculated: boolean;
  onIncludeCalculatedChange: (value: boolean) => void;
  exportResult: ExportResult | null;
  onExport: (format: string) => Promise<void>;
}) {
  if (!artist) {
    return (
      <aside className="detail-panel artist-detail" aria-label="Artist details">
        <div className="detail-header">
          <UsersRound size={20} />
          <div>
            <h2>Artist Detail</h2>
            <p>Select an album artist from the index</p>
          </div>
        </div>
        <div className="empty-state">
          <FileSearch size={20} />
          <span>No artist selected.</span>
        </div>
      </aside>
    );
  }

  return (
    <aside className="detail-panel artist-detail" aria-label="Artist details">
      <div className="detail-header">
        <UsersRound size={20} />
        <div>
          <h2>{artist.name}</h2>
          <p>{[formatYearSpan(artist.firstYear, artist.lastYear), artist.topGenre].filter(Boolean).join(" / ")}</p>
        </div>
      </div>

      <div className="cover-placeholder album-cover-large artist-cover-large" aria-hidden="true">
        <span>{artistInitial(artist)}</span>
      </div>

      <dl className="run-details artist-detail-stats">
        <div>
          <dt>Albums</dt>
          <dd>
            {`${formatNumber(artist.ratedAlbumCount)} / ${formatNumber(artist.albumCount)} fully rated`}
          </dd>
        </div>
        <div>
          <dt>Partial albums</dt>
          <dd>{formatNumber(artist.partialAlbumCount)}</dd>
        </div>
        <div>
          <dt>Unrated albums</dt>
          <dd>{formatNumber(artist.unratedAlbumCount)}</dd>
        </div>
        <div>
          <dt>Tracks</dt>
          <dd>{formatNumber(artist.trackCount)}</dd>
        </div>
        <div>
          <dt>Total time</dt>
          <dd>{formatHours(artist.totalSeconds)}</dd>
        </div>
        <div>
          <dt>Average complete</dt>
          <dd>{formatPercent(artist.averageRatingCompleteness)}</dd>
        </div>
        <div>
          <dt>Average rating</dt>
          <dd>{formatAverage(artist.averageAlbumRating, 1)}</dd>
        </div>
        <div>
          <dt>Average score</dt>
          <dd>{formatAverage(artist.averageAlbumScore, 2)}</dd>
        </div>
        <div>
          <dt>Loved tracks</dt>
          <dd>{formatNumber(artist.lovedTracks)}</dd>
        </div>
        <div>
          <dt>TMOE</dt>
          <dd>{formatMinutes(artist.tmoeSeconds)}</dd>
        </div>
      </dl>

      <section className="export-box">
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={includeCalculated}
            onChange={(event) => onIncludeCalculatedChange(event.target.checked)}
          />
          <span>Calculated columns</span>
        </label>
        <div className="export-grid">
          {["csv", "tsv", "xlsx", "json", "txt"].map((format) => (
            <button type="button" key={format} onClick={() => void onExport(format)}>
              <Download size={16} />
              <span>{format.toUpperCase()}</span>
            </button>
          ))}
        </div>
        {exportResult ? (
          <div className="export-result">
            <Check size={17} />
            <span>
              {formatNumber(exportResult.rowCount)} albums to {exportResult.path}
            </span>
          </div>
        ) : null}
      </section>
    </aside>
  );
}

function genreInitial(genre: GenreSummary | null) {
  return genre?.name.trim().slice(0, 1).toUpperCase() || "G";
}

function GenreIndexTable({
  response,
  selectedGenreId,
  onSelect,
}: {
  response: GenreListResponse | null;
  selectedGenreId: string | null;
  onSelect: (genreId: string) => void;
}) {
  if (!response) {
    return (
      <div className="empty-state large">
        <Tags size={20} />
        <span>No genres loaded.</span>
      </div>
    );
  }

  if (response.rows.length === 0) {
    return (
      <div className="empty-state large">
        <FileSearch size={20} />
        <span>No genres match.</span>
      </div>
    );
  }

  return (
    <div className="result-table genre-index-results" role="table">
      <div className="result-table-head" role="row">
        <span role="columnheader">Genre</span>
        <span role="columnheader">Albums</span>
        <span role="columnheader">Years</span>
        <span role="columnheader">Top artist</span>
        <span role="columnheader">Complete</span>
        <span role="columnheader">Avg score</span>
        <span role="columnheader">Loved</span>
      </div>
      {response.rows.map((genre) => {
        const isSelected = genre.id === selectedGenreId;
        return (
          <div
            className={`result-table-row selectable${isSelected ? " selected" : ""}`}
            role="row"
            aria-selected={isSelected}
            tabIndex={0}
            key={genre.id}
            onClick={() => onSelect(genre.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(genre.id);
              }
            }}
          >
            <span className="album-index-title" role="cell">
              <span className="cover-placeholder cover-mini genre-mini" aria-hidden="true">
                <span>{genreInitial(genre)}</span>
              </span>
              <span>
                <strong>{genre.name}</strong>
                <small>{formatNumber(genre.trackCount)} tracks</small>
              </span>
            </span>
            <span role="cell">{formatNumber(genre.albumCount)}</span>
            <span role="cell">{formatYearSpan(genre.firstYear, genre.lastYear)}</span>
            <span role="cell">{genre.topArtist ?? ""}</span>
            <span role="cell">{formatPercent(genre.averageRatingCompleteness)}</span>
            <span role="cell">{formatAverage(genre.averageAlbumScore, 2)}</span>
            <span role="cell">{formatNumber(genre.lovedTracks)}</span>
          </div>
        );
      })}
    </div>
  );
}

function GenreAlbumTable({ response }: { response: BrowseResponse | null }) {
  if (!response) {
    return (
      <div className="empty-state large">
        <Album size={20} />
        <span>Select a genre.</span>
      </div>
    );
  }

  if (response.rows.length === 0) {
    return (
      <div className="empty-state large">
        <FileSearch size={20} />
        <span>No albums found.</span>
      </div>
    );
  }

  return (
    <div className="result-table genre-album-results" role="table">
      <div className="result-table-head" role="row">
        <span role="columnheader">Album</span>
        <span role="columnheader">Artist</span>
        <span role="columnheader">Year</span>
        <span role="columnheader">Tracks</span>
        <span role="columnheader">Complete</span>
        <span role="columnheader">Rating</span>
        <span role="columnheader">Score</span>
      </div>
      {response.rows.map((row) => (
        <div className="result-table-row" role="row" key={row.id}>
          <span className="album-title-cell" role="cell">
            <AlbumTitleContents row={row} />
          </span>
          <span role="cell">{row.albumArtistDisplay ?? ""}</span>
          <span role="cell">{row.year ?? ""}</span>
          <span role="cell">{formatNumber(row.totalTracks)}</span>
          <span role="cell">{formatPercent(row.ratingCompleteness)}</span>
          <span role="cell">{row.effectiveAlbumRating ?? ""}</span>
          <span role="cell">{row.albumScore?.toFixed(3) ?? ""}</span>
        </div>
      ))}
    </div>
  );
}

function GenreDetailPanel({
  genre,
  includeCalculated,
  onIncludeCalculatedChange,
  exportResult,
  onExport,
}: {
  genre: GenreSummary | null;
  includeCalculated: boolean;
  onIncludeCalculatedChange: (value: boolean) => void;
  exportResult: ExportResult | null;
  onExport: (format: string) => Promise<void>;
}) {
  if (!genre) {
    return (
      <aside className="detail-panel genre-detail" aria-label="Genre details">
        <div className="detail-header">
          <Tags size={20} />
          <div>
            <h2>Genre Detail</h2>
            <p>Select a canonical genre from the index</p>
          </div>
        </div>
        <div className="empty-state">
          <FileSearch size={20} />
          <span>No genre selected.</span>
        </div>
      </aside>
    );
  }

  return (
    <aside className="detail-panel genre-detail" aria-label="Genre details">
      <div className="detail-header">
        <Tags size={20} />
        <div>
          <h2>{genre.name}</h2>
          <p>{[formatYearSpan(genre.firstYear, genre.lastYear), genre.topArtist].filter(Boolean).join(" / ")}</p>
        </div>
      </div>

      <div className="cover-placeholder album-cover-large genre-cover-large" aria-hidden="true">
        <span>{genreInitial(genre)}</span>
      </div>

      <dl className="run-details genre-detail-stats">
        <div>
          <dt>Albums</dt>
          <dd>
            {`${formatNumber(genre.ratedAlbumCount)} / ${formatNumber(genre.albumCount)} fully rated`}
          </dd>
        </div>
        <div>
          <dt>Partial albums</dt>
          <dd>{formatNumber(genre.partialAlbumCount)}</dd>
        </div>
        <div>
          <dt>Unrated albums</dt>
          <dd>{formatNumber(genre.unratedAlbumCount)}</dd>
        </div>
        <div>
          <dt>Tracks</dt>
          <dd>{formatNumber(genre.trackCount)}</dd>
        </div>
        <div>
          <dt>Total time</dt>
          <dd>{formatHours(genre.totalSeconds)}</dd>
        </div>
        <div>
          <dt>Top artist</dt>
          <dd>{genre.topArtist ?? ""}</dd>
        </div>
        <div>
          <dt>Average complete</dt>
          <dd>{formatPercent(genre.averageRatingCompleteness)}</dd>
        </div>
        <div>
          <dt>Average rating</dt>
          <dd>{formatAverage(genre.averageAlbumRating, 1)}</dd>
        </div>
        <div>
          <dt>Average score</dt>
          <dd>{formatAverage(genre.averageAlbumScore, 2)}</dd>
        </div>
        <div>
          <dt>Loved tracks</dt>
          <dd>{formatNumber(genre.lovedTracks)}</dd>
        </div>
        <div>
          <dt>TMOE</dt>
          <dd>{formatMinutes(genre.tmoeSeconds)}</dd>
        </div>
      </dl>

      <section className="export-box">
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={includeCalculated}
            onChange={(event) => onIncludeCalculatedChange(event.target.checked)}
          />
          <span>Calculated columns</span>
        </label>
        <div className="export-grid">
          {["csv", "tsv", "xlsx", "json", "txt"].map((format) => (
            <button type="button" key={format} onClick={() => void onExport(format)}>
              <Download size={16} />
              <span>{format.toUpperCase()}</span>
            </button>
          ))}
        </div>
        {exportResult ? (
          <div className="export-result">
            <Check size={17} />
            <span>
              {formatNumber(exportResult.rowCount)} albums to {exportResult.path}
            </span>
          </div>
        ) : null}
      </section>
    </aside>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  return <span className={`tool-severity tool-severity-${severity}`}>{severityLabel(severity)}</span>;
}

function MusicToolIndexTable({
  tools,
  selectedToolId,
  progress,
  onSelect,
}: {
  tools: MusicToolSummary[];
  selectedToolId: string | null;
  progress: MusicToolProgress | null;
  onSelect: (toolId: string) => void;
}) {
  if (tools.length === 0) {
    return (
      <div className="empty-state large">
        <Wrench size={20} />
        <span>No validation tools loaded.</span>
      </div>
    );
  }

  return (
    <div className="result-table tool-index-results" role="table">
      <div className="result-table-head" role="row">
        <span role="columnheader">Tool</span>
        <span role="columnheader">Severity</span>
        <span role="columnheader">Issues</span>
        <span role="columnheader">Albums</span>
        <span role="columnheader">Tracks</span>
      </div>
      {tools.map((tool) => {
        const isSelected = tool.id === selectedToolId;
        const selectedProgress = isSelected && isMusicToolProgressActive(progress) ? formatToolProgress(progress) : null;
        return (
          <div
            className={`result-table-row selectable${isSelected ? " selected" : ""}`}
            role="row"
            aria-selected={isSelected}
            tabIndex={0}
            key={tool.id}
            onClick={() => onSelect(tool.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(tool.id);
              }
            }}
          >
            <span role="cell">
              <strong>{tool.label}</strong>
              <small>{tool.description}</small>
            </span>
            <span role="cell">
              <SeverityBadge severity={tool.severity} />
            </span>
            <span className={selectedProgress ? "tool-count-progress" : undefined} role="cell">
              {selectedProgress ?? formatToolCount(tool.issueCount)}
            </span>
            <span role="cell">{formatToolCount(tool.albumCount)}</span>
            <span role="cell">{formatToolCount(tool.trackCount)}</span>
          </div>
        );
      })}
    </div>
  );
}

function MusicToolIssueTable({
  response,
  progress,
}: {
  response: MusicToolIssueResponse | null;
  progress: MusicToolProgress | null;
}) {
  if (!response) {
    if (isMusicToolProgressActive(progress)) {
      return (
        <div className="empty-state large">
          <Wrench size={20} />
          <span>
            {progress?.message ?? "Counting selected tool."} {formatToolProgress(progress)}
          </span>
        </div>
      );
    }

    return (
      <div className="empty-state large">
        <FileSearch size={20} />
        <span>Select a validation tool.</span>
      </div>
    );
  }

  if (response.rows.length === 0) {
    return (
      <div className="empty-state large">
        <ShieldCheck size={20} />
        <span>No matching issues.</span>
      </div>
    );
  }

  return (
    <div className="result-table tool-issue-results" role="table">
      <div className="result-table-head" role="row">
        <span role="columnheader">Issue</span>
        <span role="columnheader">Album</span>
        <span role="columnheader">Track</span>
        <span role="columnheader">Value</span>
        <span role="columnheader">File</span>
      </div>
      {response.rows.map((issue) => (
        <div className="result-table-row" role="row" key={issue.id}>
          <span role="cell">
            <strong>{issue.detail}</strong>
            <small>
              {severityLabel(issue.severity)} / {issue.entityType}
            </small>
          </span>
          <span role="cell">
            <strong>{issue.album ?? "Untitled"}</strong>
            <small>{[issue.albumArtistDisplay, issue.year].filter(Boolean).join(" / ")}</small>
          </span>
          <span role="cell">
            <strong>{issue.title ?? (issue.entityType === "albums" ? "Album-level" : "Untitled")}</strong>
            <small>{issue.canonicalGenre ?? ""}</small>
          </span>
          <span role="cell">{issue.value ?? ""}</span>
          <span role="cell" title={issue.filePath ?? ""}>
            {issue.filename ?? ""}
          </span>
        </div>
      ))}
    </div>
  );
}

function MusicToolDetailPanel({
  tool,
  progress,
  exportResult,
  onExport,
}: {
  tool: MusicToolSummary | null;
  progress: MusicToolProgress | null;
  exportResult: ExportResult | null;
  onExport: (format: string) => Promise<void>;
}) {
  if (!tool) {
    return (
      <aside className="detail-panel tools-detail" aria-label="Music tools details">
        <div className="detail-header">
          <Wrench size={20} />
          <div>
            <h2>Music Tools</h2>
            <p>Select a validation tool</p>
          </div>
        </div>
        <div className="empty-state">
          <FileSearch size={20} />
          <span>No tool selected.</span>
        </div>
      </aside>
    );
  }

  const progressText = formatToolProgress(progress);
  const isProgressActive = isMusicToolProgressActive(progress);

  return (
    <aside className="detail-panel tools-detail" aria-label="Music tools details">
      <div className="detail-header">
        <Wrench size={20} />
        <div>
          <h2>{tool.label}</h2>
          <p>
            {severityLabel(tool.severity)} / {tool.scope}
          </p>
        </div>
      </div>

      <dl className="run-details tool-detail-stats">
        <div>
          <dt>Issue rows</dt>
          <dd>{isProgressActive && progressText ? progressText : formatToolCount(tool.issueCount)}</dd>
        </div>
        <div>
          <dt>Affected albums</dt>
          <dd>{formatToolCount(tool.albumCount)}</dd>
        </div>
        <div>
          <dt>Affected tracks</dt>
          <dd>{formatToolCount(tool.trackCount)}</dd>
        </div>
        <div>
          <dt>Severity</dt>
          <dd>{severityLabel(tool.severity)}</dd>
        </div>
      </dl>

      {progress ? (
        <section className="progress-block tool-progress-block" aria-live="polite">
          <div className="progress-row">
            <span>{progress.message}</span>
            <strong>{progressText}</strong>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }} />
          </div>
          <div className="progress-meta">
            <span>{progress.status}</span>
            <span>{tool.label}</span>
          </div>
        </section>
      ) : null}

      <section className="calculation-list tools-signals">
        <div>
          <FileSearch size={17} />
          <span>{tool.description}</span>
        </div>
        <div>
          <ShieldCheck size={17} />
          <span>Issue rows are read-only</span>
        </div>
      </section>

      <section className="export-box">
        <div className="export-grid">
          {["csv", "tsv", "xlsx", "json", "txt"].map((format) => (
            <button type="button" key={format} onClick={() => void onExport(format)}>
              <Download size={16} />
              <span>{format.toUpperCase()}</span>
            </button>
          ))}
        </div>
        {exportResult ? (
          <div className="export-result">
            <Check size={17} />
            <span>
              {formatNumber(exportResult.rowCount)} issues to {exportResult.path}
            </span>
          </div>
        ) : null}
      </section>
    </aside>
  );
}

function ChartResults({
  response,
  config,
  displaySort,
  onSort,
}: {
  response: BrowseResponse | null;
  config: ChartConfig;
  displaySort: BrowseSort | null;
  onSort: (field: string) => void;
}) {
  if (!response) {
    return (
      <div className="empty-state large">
        <BarChart3 size={20} />
        <span>No chart loaded.</span>
      </div>
    );
  }

  if (response.rows.length === 0) {
    return (
      <div className="empty-state large">
        <FileSearch size={20} />
        <span>No ranked albums.</span>
      </div>
    );
  }

  if (config.viewMode === "compact") {
    return (
      <div className="chart-list" role="list">
        {response.rows.map((row, index) => (
          <article className="chart-list-row" role="listitem" key={row.id}>
            <strong className="rank-number">{index + 1}</strong>
            <AlbumCover row={row} className="cover-list" />
            <div>
              <h3>{row.album ?? "Untitled"}</h3>
              <p>
                {[row.albumArtistDisplay, row.year, row.canonicalGenre].filter(Boolean).join(" / ")}
              </p>
            </div>
            <div className="rank-metric">
              <span>{rankingLabel(config.rankingMetric)}</span>
              <strong>{formatChartMetric(row, config.rankingMetric)}</strong>
            </div>
          </article>
        ))}
      </div>
    );
  }

  if (config.viewMode === "grid") {
    const coverSize = normalizeChartGridCoverSize(config.gridCoverSize);
    const gridStyle = {
      "--chart-grid-cover-size": `${coverSize}px`,
    } as CSSProperties & Record<"--chart-grid-cover-size", string>;

    return (
      <div className="chart-grid" role="list" style={gridStyle}>
        {response.rows.map((row, index) => (
          <article className="chart-grid-item" role="listitem" key={row.id}>
            <AlbumCover row={row} className="chart-grid-cover" />
            <div>
              <strong>#{index + 1}</strong>
              <h3>{row.album ?? "Untitled"}</h3>
              <p>{row.albumArtistDisplay ?? ""}</p>
              <span>{formatChartMetric(row, config.rankingMetric)}</span>
            </div>
          </article>
        ))}
      </div>
    );
  }

  const visibleColumns = new Set(config.visibleColumns);
  const columns: {
    key: string;
    label: string;
    sortField?: string;
    className?: string;
    value: (row: BrowseRow, index: number) => ReactNode;
  }[] = [
    { key: "rank", label: "#", value: (_row: BrowseRow, rank: number) => `${rank}` },
    {
      key: "album",
      label: "Album",
      sortField: "album",
      className: "album-title-cell",
      value: (row: BrowseRow) => <AlbumTitleContents row={row} />,
    },
    { key: "artist", label: "Artist", sortField: "artist", value: (row: BrowseRow) => row.albumArtistDisplay ?? "" },
    { key: "year", label: "Year", sortField: "year", value: (row: BrowseRow) => row.year?.toString() ?? "" },
    { key: "genre", label: "Genre", sortField: "genre", value: (row: BrowseRow) => row.canonicalGenre ?? "" },
    {
      key: "rating",
      label: "Rating",
      sortField: "albumRating",
      value: (row: BrowseRow) => row.effectiveAlbumRating?.toString() ?? "",
    },
    {
      key: "complete",
      label: "Complete",
      sortField: "ratingCompleteness",
      value: (row: BrowseRow) => formatPercent(row.ratingCompleteness),
    },
    {
      key: "score",
      label: "Score",
      sortField: "albumScore",
      value: (row: BrowseRow) => row.albumScore?.toFixed(3) ?? "",
    },
    {
      key: "loved",
      label: "Loved",
      sortField: "lovedTracks",
      value: (row: BrowseRow) => row.lovedTracks?.toString() ?? "0",
    },
    { key: "ae", label: "AE", sortField: "ae", value: (row: BrowseRow) => formatPercent(row.aeRatio, 2) },
    { key: "tmoe", label: "TMOE", sortField: "tmoe", value: (row: BrowseRow) => formatMinutes(row.tmoeSeconds) },
    {
      key: "minutes",
      label: "Minutes",
      sortField: "totalMinutes",
      value: (row: BrowseRow) => formatMinutes(row.totalSeconds),
    },
  ].filter((column) => ["rank", "album", "artist", "year", "genre"].includes(column.key) || visibleColumns.has(column.key));
  const activeSort: BrowseSort = displaySort ?? {
    field: config.rankingMetric,
    direction: config.sortDirection,
  };
  const displayRows = response.rows.map((row, index) => ({ row, rank: index + 1 }));
  if (displaySort) {
    displayRows.sort((left, right) => {
      const comparison = compareBrowseRows(left.row, right.row, displaySort.field);
      return displaySort.direction === "desc" ? -comparison : comparison;
    });
  }

  return (
    <div className="result-table chart-results" role="table">
      <div className="result-table-head" role="row">
        {columns.map((column) => (
          column.sortField ? (
            <SortableColumnHeader
              label={column.label}
              field={column.sortField}
              sort={activeSort}
              onSort={onSort}
              key={column.key}
            />
          ) : (
            <span role="columnheader" key={column.key}>
              {column.label}
            </span>
          )
        ))}
      </div>
      {displayRows.map(({ row, rank }) => (
        <div className="result-table-row" role="row" key={row.id}>
          {columns.map((column) => (
            <span className={column.className} role="cell" key={column.key}>
              {column.value(row, rank)}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function Meter({
  label,
  value,
  total,
  detail,
}: {
  label: string;
  value: number;
  total: number;
  detail: string;
}) {
  return (
    <div className="meter-row">
      <div>
        <span>{label}</span>
        <strong>{formatNumber(value)}</strong>
      </div>
      <div className="meter-track" aria-hidden="true">
        <div className="meter-fill" style={{ width: `${percentOf(value, total)}%` }} />
      </div>
      <small>{detail}</small>
    </div>
  );
}

function DistributionBars({ buckets }: { buckets: RatingBucket[] }) {
  const maxCount = Math.max(1, ...buckets.map((bucket) => bucket.count));
  return (
    <div className="distribution-bars">
      {buckets.map((bucket) => (
        <div className="distribution-row" key={bucket.label}>
          <span>{bucket.label}</span>
          <div className="meter-track" aria-hidden="true">
            <div className="meter-fill" style={{ width: `${percentOf(bucket.count, maxCount)}` + "%" }} />
          </div>
          <strong>{formatNumber(bucket.count)}</strong>
        </div>
      ))}
    </div>
  );
}

function YearProgressTable({ rows }: { rows: YearProgressStats[] }) {
  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <Activity size={20} />
        <span>No year statistics yet.</span>
      </div>
    );
  }

  return (
    <div className="stats-table year-stats-table" role="table">
      <div className="stats-table-head" role="row">
        <span role="columnheader">Year</span>
        <span role="columnheader">Albums</span>
        <span role="columnheader">Rated</span>
        <span role="columnheader">Partial</span>
        <span role="columnheader">Hours</span>
        <span role="columnheader">Score</span>
      </div>
      {rows.slice(0, 14).map((row) => (
        <div className="stats-table-row" role="row" key={row.year}>
          <span role="cell">{row.year}</span>
          <span role="cell">{formatNumber(row.albumCount)}</span>
          <span role="cell">{formatNumber(row.ratedAlbumCount)}</span>
          <span role="cell">{formatNumber(row.partialAlbumCount)}</span>
          <span role="cell">{formatHours(row.totalSeconds)}</span>
          <span role="cell">{formatAverage(row.averageAlbumScore, 1)}</span>
        </div>
      ))}
    </div>
  );
}

function GenreProgressTable({ rows }: { rows: GenreProgressStats[] }) {
  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <Tags size={20} />
        <span>No genre statistics yet.</span>
      </div>
    );
  }

  return (
    <div className="stats-table genre-stats-table" role="table">
      <div className="stats-table-head" role="row">
        <span role="columnheader">Genre</span>
        <span role="columnheader">Albums</span>
        <span role="columnheader">Rated</span>
        <span role="columnheader">Partial</span>
        <span role="columnheader">Loved</span>
        <span role="columnheader">Score</span>
      </div>
      {rows.slice(0, 12).map((row) => (
        <div className="stats-table-row" role="row" key={row.genre}>
          <span role="cell">{row.genre}</span>
          <span role="cell">{formatNumber(row.albumCount)}</span>
          <span role="cell">{formatNumber(row.ratedAlbumCount)}</span>
          <span role="cell">{formatNumber(row.partialAlbumCount)}</span>
          <span role="cell">{formatNumber(row.lovedTracks)}</span>
          <span role="cell">{formatAverage(row.averageAlbumScore, 1)}</span>
        </div>
      ))}
    </div>
  );
}

function eventLabel(eventType: string) {
  const labels: Record<string, string> = {
    addedPartial: "Added partial",
    addedRated: "Added rated",
    completed: "Completed",
    ratedLess: "Rated less",
    ratedMore: "Rated more",
    ratingChanged: "Rating changed",
    ratingUpdated: "Rating updated",
    removedRated: "Removed rated",
  };
  return labels[eventType] ?? eventType;
}

function RatingEventList({ events }: { events: RatingEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="empty-state">
        <Activity size={20} />
        <span>No rating events yet.</span>
      </div>
    );
  }

  return (
    <div className="rating-event-list">
      {events.slice(0, 8).map((event) => (
        <article className="rating-event" key={event.id}>
          <strong>{eventLabel(event.eventType)}</strong>
          <span>{[event.albumArtistDisplay, event.album, event.year].filter(Boolean).join(" / ")}</span>
          <small>
            {formatPercent(event.previousRatingCompleteness, 0) || "New"}
            {" -> "}
            {formatPercent(event.currentRatingCompleteness, 0) || "Removed"}
          </small>
        </article>
      ))}
    </div>
  );
}

export default function App() {
  const [activeSection, setActiveSection] = useState("Search");
  const [sourcePath, setSourcePath] = useState("musicbee-library.tsv");
  const [coverSourcePath, setCoverSourcePath] = useState("AlbumCovers");
  const [coverExtractEmbeddedFallback, setCoverExtractEmbeddedFallback] = useState(true);
  const [coverReplaceExisting, setCoverReplaceExisting] = useState(false);
  const [status, setStatus] = useState<LibraryStatus | null>(null);
  const [runs, setRuns] = useState<ImportRun[]>([]);
  const [progress, setProgress] = useState(defaultProgress);
  const [coverProgress, setCoverProgress] = useState(defaultCoverProgress);
  const [isImporting, setIsImporting] = useState(false);
  const [isImportingCovers, setIsImportingCovers] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [coverImportError, setCoverImportError] = useState<string | null>(null);
  const [coverImportSummary, setCoverImportSummary] = useState<CoverImportSummary | null>(null);
  const [request, setRequest] = useState<BrowseRequest>(() => createRequest("albums"));
  const [response, setResponse] = useState<BrowseResponse | null>(null);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [savedCharts, setSavedCharts] = useState<SavedChart[]>([]);
  const [saveName, setSaveName] = useState("");
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [includeCalculated, setIncludeCalculated] = useState(false);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [albumRequest, setAlbumRequest] = useState<BrowseRequest>(() => {
    const request = createRequest("albums");
    request.limit = 25;
    return request;
  });
  const [albumResponse, setAlbumResponse] = useState<BrowseResponse | null>(null);
  const [albumError, setAlbumError] = useState<string | null>(null);
  const [isAlbumLoading, setIsAlbumLoading] = useState(false);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [albumTracksResponse, setAlbumTracksResponse] = useState<BrowseResponse | null>(null);
  const [albumTracksError, setAlbumTracksError] = useState<string | null>(null);
  const [isAlbumTracksLoading, setIsAlbumTracksLoading] = useState(false);
  const [albumIncludeCalculated, setAlbumIncludeCalculated] = useState(false);
  const [albumExportResult, setAlbumExportResult] = useState<ExportResult | null>(null);
  const [artistRequest, setArtistRequest] = useState<ArtistListRequest>(() => createArtistListRequest());
  const [artistResponse, setArtistResponse] = useState<ArtistListResponse | null>(null);
  const [artistError, setArtistError] = useState<string | null>(null);
  const [isArtistLoading, setIsArtistLoading] = useState(false);
  const [selectedArtistId, setSelectedArtistId] = useState<string | null>(null);
  const [artistAlbumsResponse, setArtistAlbumsResponse] = useState<BrowseResponse | null>(null);
  const [artistAlbumsError, setArtistAlbumsError] = useState<string | null>(null);
  const [isArtistAlbumsLoading, setIsArtistAlbumsLoading] = useState(false);
  const [artistIncludeCalculated, setArtistIncludeCalculated] = useState(false);
  const [artistExportResult, setArtistExportResult] = useState<ExportResult | null>(null);
  const [genreRequest, setGenreRequest] = useState<GenreListRequest>(() => createGenreListRequest());
  const [genreResponse, setGenreResponse] = useState<GenreListResponse | null>(null);
  const [genreError, setGenreError] = useState<string | null>(null);
  const [isGenreLoading, setIsGenreLoading] = useState(false);
  const [selectedGenreId, setSelectedGenreId] = useState<string | null>(null);
  const [genreAlbumsResponse, setGenreAlbumsResponse] = useState<BrowseResponse | null>(null);
  const [genreAlbumsError, setGenreAlbumsError] = useState<string | null>(null);
  const [isGenreAlbumsLoading, setIsGenreAlbumsLoading] = useState(false);
  const [genreIncludeCalculated, setGenreIncludeCalculated] = useState(false);
  const [genreExportResult, setGenreExportResult] = useState<ExportResult | null>(null);
  const [genreSuggestionNames, setGenreSuggestionNames] = useState<string[]>([]);
  const [musicTools, setMusicTools] = useState<MusicToolSummary[]>(() => musicToolCatalog);
  const [toolsError, setToolsError] = useState<string | null>(null);
  const [isToolsLoading, setIsToolsLoading] = useState(false);
  const [selectedToolId, setSelectedToolId] = useState<string | null>(musicToolCatalog[0]?.id ?? null);
  const [toolIssueRequest, setToolIssueRequest] = useState<MusicToolIssueRequest>(() =>
    createMusicToolIssueRequest(),
  );
  const [toolIssueResponse, setToolIssueResponse] = useState<MusicToolIssueResponse | null>(null);
  const [toolIssueError, setToolIssueError] = useState<string | null>(null);
  const [isToolIssuesLoading, setIsToolIssuesLoading] = useState(false);
  const [toolProgress, setToolProgress] = useState<MusicToolProgress | null>(null);
  const [toolExportResult, setToolExportResult] = useState<ExportResult | null>(null);
  const [chartConfig, setChartConfig] = useState<ChartConfig>(() => createChartConfig());
  const [chartTableSort, setChartTableSort] = useState<BrowseSort | null>(null);
  const [chartResponse, setChartResponse] = useState<BrowseResponse | null>(null);
  const [chartName, setChartName] = useState("");
  const [chartError, setChartError] = useState<string | null>(null);
  const [isChartLoading, setIsChartLoading] = useState(false);
  const [chartExportResult, setChartExportResult] = useState<ExportResult | null>(null);
  const [statistics, setStatistics] = useState<StatisticsResponse | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [isStatsLoading, setIsStatsLoading] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() => createDefaultSettings());
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const canImport = isTauriRuntime();

  const refreshGenreSuggestions = useCallback(async () => {
    const nextGenreNames = await loadGenreSuggestionNames();
    setGenreSuggestionNames(nextGenreNames);
  }, []);

  const loadData = useCallback(async () => {
    const [nextStatus, nextRuns, nextSavedSearches, nextSavedCharts, nextStatistics, nextSettings] = await Promise.all([
      getLibraryStatus(),
      listImportRuns(8),
      listSavedSearches(),
      listSavedCharts(),
      getStatistics(),
      getSettings(),
    ]);
    setStatus(nextStatus);
    setRuns(nextRuns);
    setSavedSearches(nextSavedSearches);
    setSavedCharts(nextSavedCharts);
    setStatistics(nextStatistics);
    setSettings(nextSettings);
    void refreshGenreSuggestions().catch(() => {
      // Keep any suggestions already loaded from focus retry or the Genres page.
    });
  }, [refreshGenreSuggestions]);

  useEffect(() => {
    void loadData().catch((loadError) => {
      setImportError(loadError instanceof Error ? loadError.message : String(loadError));
    });
  }, [loadData]);

  useEffect(() => {
    let cancelled = false;

    void loadGenreSuggestionNames()
      .then((nextGenreNames) => {
        if (!cancelled) {
          setGenreSuggestionNames(nextGenreNames);
        }
      })
      .catch(() => {
        // The genre fields can retry on focus, and the Genres page can still seed suggestions.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    void listenToImportProgress(setProgress).then((nextUnlisten) => {
      unlisten = nextUnlisten;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    void listenToCoverImportProgress(setCoverProgress).then((nextUnlisten) => {
      unlisten = nextUnlisten;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (activeSection !== "Tools" || !selectedToolId) {
      return;
    }

    let unlisten: (() => void) | null = null;
    void listenToMusicToolProgress((nextProgress) => {
      setToolProgress((previous) =>
        nextProgress.toolId === selectedToolId && nextProgress.requestId === toolIssueRequest.requestId
          ? nextProgress
          : previous,
      );
    }).then((nextUnlisten) => {
      unlisten = nextUnlisten;
    });

    return () => {
      unlisten?.();
    };
  }, [activeSection, selectedToolId, toolIssueRequest.requestId]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.darkMode ? "dark" : "light";
  }, [settings.darkMode]);

  const lastRun = runs[0] ?? status?.lastImport ?? null;
  const currentFilters = request.filters;
  const albumFilters = albumRequest.filters;
  const genreSuggestionOptions = useMemo(
    () => uniqueGenreSuggestionOptions([...genreSuggestionAliases, ...genreSuggestionNames]),
    [genreSuggestionNames],
  );
  const requestGenreSuggestionRefresh = useCallback(() => {
    void refreshGenreSuggestions().catch(() => {
      // Field focus can retry again; keep the existing option list.
    });
  }, [refreshGenreSuggestions]);
  const chartRequest = useMemo(() => chartRequestFromConfig(chartConfig), [chartConfig]);
  const albumTracksRequest = useMemo(
    () => (selectedAlbumId ? createAlbumTracksRequest(selectedAlbumId) : null),
    [selectedAlbumId],
  );
  const selectedArtist =
    artistResponse?.rows.find((artist) => artist.id === selectedArtistId) ?? null;
  const artistAlbumsRequest = useMemo(
    () => (selectedArtist ? createArtistAlbumsRequest(selectedArtist) : null),
    [selectedArtist],
  );
  const selectedGenre =
    genreResponse?.rows.find((genre) => genre.id === selectedGenreId) ?? null;
  const genreAlbumsRequest = useMemo(
    () => (selectedGenre ? createGenreAlbumsRequest(selectedGenre) : null),
    [selectedGenre],
  );
  const selectedCatalogTool = musicTools.find((tool) => tool.id === selectedToolId) ?? null;
  const currentToolIssueResponse = toolIssueResponse?.tool.id === selectedToolId ? toolIssueResponse : null;
  const selectedTool = currentToolIssueResponse?.tool ?? selectedCatalogTool;
  const activeToolProgress =
    toolProgress?.toolId === selectedToolId && toolProgress.requestId === toolIssueRequest.requestId
      ? toolProgress
      : null;
  const activeToolProgressText = formatToolProgress(activeToolProgress);
  const isToolProgressActive = isMusicToolProgressActive(activeToolProgress);
  const isToolRunPending = isToolIssuesLoading || isToolProgressActive;

  useEffect(() => {
    if (activeSection !== "Search") {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsSearching(true);
      setBrowseError(null);
      void searchLibrary(request)
        .then((nextResponse) => {
          if (!cancelled) {
            setResponse(nextResponse);
          }
        })
        .catch((searchError) => {
          if (!cancelled) {
            setBrowseError(searchError instanceof Error ? searchError.message : String(searchError));
            setResponse(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsSearching(false);
          }
        });
    }, 160);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeSection, request]);

  useEffect(() => {
    if (activeSection !== "Albums") {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsAlbumLoading(true);
      setAlbumError(null);
      void searchLibrary(albumRequest)
        .then((nextResponse) => {
          if (!cancelled) {
            setAlbumResponse(nextResponse);
          }
        })
        .catch((searchError) => {
          if (!cancelled) {
            setAlbumError(searchError instanceof Error ? searchError.message : String(searchError));
            setAlbumResponse(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsAlbumLoading(false);
          }
        });
    }, 160);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeSection, albumRequest]);

  useEffect(() => {
    if (activeSection !== "Albums") {
      return;
    }

    const rows = albumResponse?.rows ?? [];
    if (rows.length === 0) {
      setSelectedAlbumId(null);
      return;
    }

    setSelectedAlbumId((previous) =>
      previous && rows.some((row) => row.albumId === previous) ? previous : rows[0].albumId,
    );
  }, [activeSection, albumResponse]);

  useEffect(() => {
    if (activeSection !== "Albums" || !albumTracksRequest) {
      setAlbumTracksResponse(null);
      return;
    }

    let cancelled = false;
    setIsAlbumTracksLoading(true);
    setAlbumTracksError(null);
    void searchLibrary(albumTracksRequest)
      .then((nextResponse) => {
        if (!cancelled) {
          setAlbumTracksResponse(nextResponse);
        }
      })
      .catch((searchError) => {
        if (!cancelled) {
          setAlbumTracksError(searchError instanceof Error ? searchError.message : String(searchError));
          setAlbumTracksResponse(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsAlbumTracksLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection, albumTracksRequest]);

  useEffect(() => {
    if (activeSection !== "Artists") {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsArtistLoading(true);
      setArtistError(null);
      void listArtists(artistRequest)
        .then((nextResponse) => {
          if (!cancelled) {
            setArtistResponse(nextResponse);
          }
        })
        .catch((searchError) => {
          if (!cancelled) {
            setArtistError(searchError instanceof Error ? searchError.message : String(searchError));
            setArtistResponse(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsArtistLoading(false);
          }
        });
    }, 160);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeSection, artistRequest]);

  useEffect(() => {
    if (activeSection !== "Artists") {
      return;
    }

    const rows = artistResponse?.rows ?? [];
    if (rows.length === 0) {
      setSelectedArtistId(null);
      return;
    }

    setSelectedArtistId((previous) =>
      previous && rows.some((artist) => artist.id === previous) ? previous : rows[0].id,
    );
  }, [activeSection, artistResponse]);

  useEffect(() => {
    if (activeSection !== "Artists" || !artistAlbumsRequest) {
      setArtistAlbumsResponse(null);
      return;
    }

    let cancelled = false;
    setIsArtistAlbumsLoading(true);
    setArtistAlbumsError(null);
    void searchLibrary(artistAlbumsRequest)
      .then((nextResponse) => {
        if (!cancelled) {
          setArtistAlbumsResponse(nextResponse);
        }
      })
      .catch((searchError) => {
        if (!cancelled) {
          setArtistAlbumsError(searchError instanceof Error ? searchError.message : String(searchError));
          setArtistAlbumsResponse(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsArtistAlbumsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection, artistAlbumsRequest]);

  useEffect(() => {
    if (activeSection !== "Genres") {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsGenreLoading(true);
      setGenreError(null);
      void listGenres(genreRequest)
        .then((nextResponse) => {
          if (!cancelled) {
            setGenreResponse(nextResponse);
          }
        })
        .catch((searchError) => {
          if (!cancelled) {
            setGenreError(searchError instanceof Error ? searchError.message : String(searchError));
            setGenreResponse(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsGenreLoading(false);
          }
        });
    }, 160);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeSection, genreRequest]);

  useEffect(() => {
    const visibleGenreNames = genreResponse?.rows.map((genre) => genre.name) ?? [];
    if (visibleGenreNames.length === 0) {
      return;
    }

    setGenreSuggestionNames((previous) =>
      uniqueGenreSuggestionOptions([...previous, ...visibleGenreNames]),
    );
  }, [genreResponse]);

  useEffect(() => {
    if (activeSection !== "Genres") {
      return;
    }

    const rows = genreResponse?.rows ?? [];
    if (rows.length === 0) {
      setSelectedGenreId(null);
      return;
    }

    setSelectedGenreId((previous) =>
      previous && rows.some((genre) => genre.id === previous) ? previous : rows[0].id,
    );
  }, [activeSection, genreResponse]);

  useEffect(() => {
    if (activeSection !== "Genres" || !genreAlbumsRequest) {
      setGenreAlbumsResponse(null);
      return;
    }

    let cancelled = false;
    setIsGenreAlbumsLoading(true);
    setGenreAlbumsError(null);
    void searchLibrary(genreAlbumsRequest)
      .then((nextResponse) => {
        if (!cancelled) {
          setGenreAlbumsResponse(nextResponse);
        }
      })
      .catch((searchError) => {
        if (!cancelled) {
          setGenreAlbumsError(searchError instanceof Error ? searchError.message : String(searchError));
          setGenreAlbumsResponse(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsGenreAlbumsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection, genreAlbumsRequest]);

  useEffect(() => {
    if (activeSection !== "Tools") {
      return;
    }

    let cancelled = false;
    setIsToolsLoading(true);
    setToolsError(null);
    void listMusicTools()
      .then((nextTools) => {
        if (!cancelled) {
          setMusicTools((previous) =>
            nextTools.length === 0
              ? previous
              : nextTools.map((nextTool) => {
                  const previousTool = previous.find((tool) => tool.id === nextTool.id);
                  return previousTool && previousTool.issueCount >= 0
                    ? {
                        ...nextTool,
                        issueCount: previousTool.issueCount,
                        albumCount: previousTool.albumCount,
                        trackCount: previousTool.trackCount,
                      }
                    : nextTool;
                }),
          );
        }
      })
      .catch((searchError) => {
        if (!cancelled) {
          setToolsError(searchError instanceof Error ? searchError.message : String(searchError));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsToolsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection]);

  useEffect(() => {
    if (activeSection !== "Tools") {
      return;
    }

    if (musicTools.length === 0) {
      setSelectedToolId(null);
      setToolIssueResponse(null);
      return;
    }

    setSelectedToolId((previous) =>
      previous && musicTools.some((tool) => tool.id === previous) ? previous : musicTools[0].id,
    );
  }, [activeSection, musicTools]);

  useEffect(() => {
    if (activeSection !== "Tools" || !selectedToolId) {
      return;
    }

    setToolIssueRequest((previous) =>
      previous.toolId === selectedToolId
        ? previous
        : {
            ...createMusicToolIssueRequest(selectedToolId),
            limit: previous.limit,
          },
    );
  }, [activeSection, selectedToolId]);

  useEffect(() => {
    if (activeSection !== "Tools" || !selectedToolId || toolIssueRequest.toolId !== selectedToolId) {
      return;
    }

    let cancelled = false;
    setToolProgress({
      toolId: toolIssueRequest.toolId,
      requestId: toolIssueRequest.requestId,
      status: "starting",
      percent: 5,
      message: "Starting validation count.",
    });
    const timer = window.setTimeout(() => {
      setIsToolIssuesLoading(true);
      setToolIssueError(null);
      void listMusicToolIssues(toolIssueRequest)
        .then((nextResponse) => {
          if (!cancelled) {
            setToolIssueResponse(nextResponse);
            setToolProgress({
              toolId: toolIssueRequest.toolId,
              requestId: toolIssueRequest.requestId,
              status: "completed",
              percent: 100,
              message: "Validation count complete.",
            });
          }
        })
        .catch((searchError) => {
          if (!cancelled) {
            setToolIssueError(searchError instanceof Error ? searchError.message : String(searchError));
            setToolIssueResponse(null);
            setToolProgress({
              toolId: toolIssueRequest.toolId,
              requestId: toolIssueRequest.requestId,
              status: "failed",
              percent: 100,
              message: "Validation count failed.",
            });
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsToolIssuesLoading(false);
          }
        });
    }, 160);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeSection, selectedToolId, toolIssueRequest]);

  useEffect(() => {
    if (!toolIssueResponse) {
      return;
    }

    setMusicTools((previous) =>
      previous.map((tool) => (tool.id === toolIssueResponse.tool.id ? toolIssueResponse.tool : tool)),
    );
  }, [toolIssueResponse]);

  useEffect(() => {
    if (activeSection !== "Charts") {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsChartLoading(true);
      setChartError(null);
      void searchLibrary(chartRequest)
        .then((nextResponse) => {
          if (!cancelled) {
            setChartResponse(nextResponse);
          }
        })
        .catch((searchError) => {
          if (!cancelled) {
            setChartError(searchError instanceof Error ? searchError.message : String(searchError));
            setChartResponse(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsChartLoading(false);
          }
        });
    }, 160);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeSection, chartRequest]);

  const progressPercent = useMemo(() => {
    if (progress.status === "completed") return 100;
    if (progress.processedRows === 0) return isImporting ? 6 : 0;
    return Math.min(96, Math.max(8, (progress.processedRows / 1_130_882) * 100));
  }, [isImporting, progress.processedRows, progress.status]);

  const coverProgressPercent = useMemo(() => {
    if (coverProgress.status === "completed") return 100;
    if (coverProgress.scannedAlbums === 0) return isImportingCovers ? 4 : 0;
    return Math.min(99, Math.max(1, coverProgress.percent));
  }, [coverProgress.percent, coverProgress.scannedAlbums, coverProgress.status, isImportingCovers]);

  const chips = useMemo(() => {
    const nextChips: { key: string; label: string; remove: () => void }[] = [];
    const addTextChip = (key: keyof BrowseFilters, label: string, filter: TextFilter) => {
      const chipLabel = textFilterLabel(label, filter);
      if (chipLabel) {
        nextChips.push({
          key,
          label: chipLabel,
          remove: () => updateFilter(key, createTextFilter()),
        });
      }
    };

    if (request.searchText.trim()) {
      nextChips.push({
        key: "searchText",
        label: `Search "${request.searchText.trim()}"`,
        remove: () => setRequest((previous) => ({ ...previous, searchText: "", offset: 0 })),
      });
    }

    addTextChip("albumTitle", "Album", currentFilters.albumTitle);
    addTextChip("trackTitle", "Track", currentFilters.trackTitle);
    addTextChip("albumArtist", "Album artist", currentFilters.albumArtist);
    addTextChip("displayArtist", "Display artist", currentFilters.displayArtist);
    addTextChip("publisher", "Publisher", currentFilters.publisher);
    addTextChip("filePath", "Path", currentFilters.filePath);
    addTextChip("filename", "Filename", currentFilters.filename);

    if (currentFilters.hasTrackText.trim()) {
      nextChips.push({
        key: "hasTrackText",
        label: `Track text "${currentFilters.hasTrackText.trim()}"`,
        remove: () => updateFilter("hasTrackText", ""),
      });
    }
    if (currentFilters.genres.length) {
      nextChips.push({
        key: "genres",
        label: `Genres: ${currentFilters.genres.join(", ")}`,
        remove: () => updateFilter("genres", []),
      });
    }
    if (currentFilters.excludedGenres.length) {
      nextChips.push({
        key: "excludedGenres",
        label: `Excluding: ${currentFilters.excludedGenres.join(", ")}`,
        remove: () => updateFilter("excludedGenres", []),
      });
    }

    addRangeChip(nextChips, "year", "Year", currentFilters.yearFrom, currentFilters.yearTo, () => {
      updateFilters({ yearFrom: null, yearTo: null });
    });
    addRangeChip(
      nextChips,
      "releaseYear",
      "Release",
      currentFilters.releaseYearFrom,
      currentFilters.releaseYearTo,
      () => updateFilters({ releaseYearFrom: null, releaseYearTo: null }),
    );
    addRangeChip(
      nextChips,
      "minutes",
      "Minutes",
      currentFilters.totalMinutesMin,
      currentFilters.totalMinutesMax,
      () => updateFilters({ totalMinutesMin: null, totalMinutesMax: null }),
    );
    addRangeChip(
      nextChips,
      "albumRating",
      "Album rating",
      currentFilters.albumRatingMin,
      currentFilters.albumRatingMax,
      () => updateFilters({ albumRatingMin: null, albumRatingMax: null }),
    );
    addRangeChip(
      nextChips,
      "trackRating",
      "Track rating",
      currentFilters.trackRatingMin,
      currentFilters.trackRatingMax,
      () => updateFilters({ trackRatingMin: null, trackRatingMax: null }),
    );

    if (currentFilters.ratingCompletenessMin != null) {
      nextChips.push({
        key: "ratingCompletenessMin",
        label: `Complete >= ${currentFilters.ratingCompletenessMin}%`,
        remove: () => updateFilter("ratingCompletenessMin", null),
      });
    }
    if (currentFilters.lovedTracksMin != null || currentFilters.lovedTracksMax != null) {
      addRangeChip(
        nextChips,
        "lovedTracks",
        "Loved",
        currentFilters.lovedTracksMin,
        currentFilters.lovedTracksMax,
        () => updateFilters({ lovedTracksMin: null, lovedTracksMax: null }),
      );
    }
    if (currentFilters.missingFields.length) {
      nextChips.push({
        key: "missingFields",
        label: `Missing: ${formatMissingFieldLabels(currentFilters.missingFields, request.view)}`,
        remove: () => updateFilter("missingFields", []),
      });
    }

    return nextChips;
  }, [currentFilters, request.searchText, request.view]);

  const albumChips = useMemo(() => {
    const nextChips: { key: string; label: string; remove: () => void }[] = [];
    const addTextChip = (key: keyof BrowseFilters, label: string, filter: TextFilter) => {
      const chipLabel = textFilterLabel(label, filter);
      if (chipLabel) {
        nextChips.push({
          key,
          label: chipLabel,
          remove: () => updateAlbumFilter(key, createTextFilter()),
        });
      }
    };

    if (albumRequest.searchText.trim()) {
      nextChips.push({
        key: "searchText",
        label: `Search "${albumRequest.searchText.trim()}"`,
        remove: () => setAlbumRequest((previous) => ({ ...previous, searchText: "", offset: 0 })),
      });
    }

    addTextChip("albumTitle", "Album", albumFilters.albumTitle);
    addTextChip("albumArtist", "Album artist", albumFilters.albumArtist);
    addTextChip("publisher", "Publisher", albumFilters.publisher);

    if (albumFilters.genres.length) {
      nextChips.push({
        key: "genres",
        label: `Genres: ${albumFilters.genres.join(", ")}`,
        remove: () => updateAlbumFilter("genres", []),
      });
    }
    if (albumFilters.excludedGenres.length) {
      nextChips.push({
        key: "excludedGenres",
        label: `Excluding: ${albumFilters.excludedGenres.join(", ")}`,
        remove: () => updateAlbumFilter("excludedGenres", []),
      });
    }

    addRangeChip(nextChips, "year", "Year", albumFilters.yearFrom, albumFilters.yearTo, () => {
      updateAlbumFilters({ yearFrom: null, yearTo: null });
    });
    addRangeChip(
      nextChips,
      "minutes",
      "Minutes",
      albumFilters.totalMinutesMin,
      albumFilters.totalMinutesMax,
      () => updateAlbumFilters({ totalMinutesMin: null, totalMinutesMax: null }),
    );
    addRangeChip(
      nextChips,
      "albumRating",
      "Album rating",
      albumFilters.albumRatingMin,
      albumFilters.albumRatingMax,
      () => updateAlbumFilters({ albumRatingMin: null, albumRatingMax: null }),
    );
    addRangeChip(
      nextChips,
      "trackCount",
      "Tracks",
      albumFilters.trackCountMin,
      albumFilters.trackCountMax,
      () => updateAlbumFilters({ trackCountMin: null, trackCountMax: null }),
    );

    if (albumFilters.ratingCompletenessMin != null) {
      nextChips.push({
        key: "ratingCompletenessMin",
        label: `Complete >= ${albumFilters.ratingCompletenessMin}%`,
        remove: () => updateAlbumFilter("ratingCompletenessMin", null),
      });
    }
    if (albumFilters.lovedTracksMin != null || albumFilters.lovedTracksMax != null) {
      addRangeChip(
        nextChips,
        "lovedTracks",
        "Loved",
        albumFilters.lovedTracksMin,
        albumFilters.lovedTracksMax,
        () => updateAlbumFilters({ lovedTracksMin: null, lovedTracksMax: null }),
      );
    }

    return nextChips;
  }, [albumFilters, albumRequest.searchText]);

  function updateFilter<K extends keyof BrowseFilters>(key: K, value: BrowseFilters[K]) {
    setRequest((previous) => ({
      ...previous,
      filters: { ...previous.filters, [key]: value },
      offset: 0,
    }));
  }

  function updateFilters(values: Partial<BrowseFilters>) {
    setRequest((previous) => ({
      ...previous,
      filters: { ...previous.filters, ...values },
      offset: 0,
    }));
  }

  function setView(view: BrowseView) {
    setRequest((previous) => ({
      ...previous,
      view,
      sort: defaultSort(view),
      offset: 0,
    }));
  }

  function clearQuery() {
    setRequest((previous) => ({
      ...createRequest(previous.view),
      limit: previous.limit,
    }));
    setExportResult(null);
  }

  function sortSearchBy(field: string) {
    setRequest((previous) => ({
      ...previous,
      sort: nextSort(previous.sort, field),
      offset: 0,
    }));
    setExportResult(null);
  }

  function updateAlbumFilter<K extends keyof BrowseFilters>(key: K, value: BrowseFilters[K]) {
    setAlbumRequest((previous) => ({
      ...previous,
      filters: { ...previous.filters, [key]: value },
      offset: 0,
    }));
    setAlbumExportResult(null);
  }

  function updateAlbumFilters(values: Partial<BrowseFilters>) {
    setAlbumRequest((previous) => ({
      ...previous,
      filters: { ...previous.filters, ...values },
      offset: 0,
    }));
    setAlbumExportResult(null);
  }

  function sortAlbumsBy(field: string) {
    setAlbumRequest((previous) => ({
      ...previous,
      sort: nextSort(previous.sort, field),
      offset: 0,
    }));
    setAlbumExportResult(null);
  }

  function clearAlbumQuery() {
    setAlbumRequest((previous) => {
      const nextRequest = createRequest("albums");
      nextRequest.limit = previous.limit;
      return nextRequest;
    });
    setAlbumExportResult(null);
  }

  function selectAlbum(albumId: string) {
    setSelectedAlbumId(albumId);
    setAlbumExportResult(null);
  }

  function clearArtistQuery() {
    setArtistRequest((previous) => ({
      ...createArtistListRequest(),
      limit: previous.limit,
    }));
    setArtistExportResult(null);
  }

  function selectArtist(artistId: string) {
    setSelectedArtistId(artistId);
    setArtistExportResult(null);
  }

  function clearGenreQuery() {
    setGenreRequest((previous) => ({
      ...createGenreListRequest(),
      limit: previous.limit,
    }));
    setGenreExportResult(null);
  }

  function selectGenre(genreId: string) {
    setSelectedGenreId(genreId);
    setGenreExportResult(null);
  }

  function clearToolQuery() {
    setToolIssueRequest((previous) => ({
      ...createMusicToolIssueRequest(previous.toolId),
      limit: previous.limit,
    }));
    setToolExportResult(null);
  }

  function selectMusicTool(toolId: string) {
    setSelectedToolId(toolId);
    setToolIssueRequest((previous) => ({
      ...createMusicToolIssueRequest(toolId),
      limit: previous.limit,
    }));
    setToolExportResult(null);
  }

  async function refreshMusicTools() {
    setIsToolsLoading(true);
    setToolsError(null);
    try {
      const nextTools = await listMusicTools();
      setMusicTools(nextTools);
    } catch (error) {
      setToolsError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsToolsLoading(false);
    }
  }

  async function startImport() {
    setIsImporting(true);
    setImportError(null);
    setProgress({
      status: "starting",
      processedRows: 0,
      albumCount: 0,
      message: "Creating a database backup before import.",
    });

    try {
      const summary: ImportSummary = await importMusicBeeTsv(sourcePath);
      setProgress({
        status: "completed",
        processedRows: summary.trackRows,
        albumCount: summary.albumCount,
        message: "Import completed and album calculations refreshed.",
      });
      await loadData();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setImportError(message);
      setProgress({
        status: "failed",
        processedRows: progress.processedRows,
        albumCount: progress.albumCount,
        message,
      });
    } finally {
      setIsImporting(false);
    }
  }

  async function startCoverImport() {
    setIsImportingCovers(true);
    setCoverImportError(null);
    setCoverImportSummary(null);
    setCoverProgress({
      ...defaultCoverProgress,
      status: "running",
      message: "Scanning album folders for cover art.",
    });

    try {
      const summary = await importAlbumCovers({
        sourcePath: coverSourcePath,
        extractEmbeddedFallback: coverExtractEmbeddedFallback,
        replaceExisting: coverReplaceExisting,
      });
      setCoverImportSummary(summary);
      setCoverProgress({
        status: "completed",
        totalAlbums: summary.totalAlbums,
        scannedAlbums: summary.scannedAlbums,
        newCoversFound: summary.newCoversFound,
        importedCovers: summary.importedCovers,
        relinkedCovers: summary.relinkedCovers,
        skippedExisting: summary.skippedExisting,
        missingCovers: summary.missingCovers,
        percent: 100,
        message: "Cover import completed.",
      });
      clearCoverImageCache();
      await loadData();
      setRequest((current) => ({ ...current }));
      setAlbumRequest((current) => ({ ...current }));
      setChartConfig((current) => ({ ...current }));
      setArtistAlbumsResponse(null);
      setGenreAlbumsResponse(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCoverImportError(message);
      setCoverProgress((current) => ({
        ...current,
        status: "failed",
        message,
      }));
    } finally {
      setIsImportingCovers(false);
    }
  }

  async function saveCurrentSearch() {
    const fallbackName =
      request.searchText.trim() || `${request.view === "albums" ? "Album" : "Track"} search`;
    const saved = await saveSearch(saveName.trim() || fallbackName, request);
    setSavedSearches((previous) => [saved, ...previous.filter((search) => search.id !== saved.id)]);
    setSaveName("");
  }

  async function removeSavedSearch(id: number) {
    await deleteSavedSearch(id);
    setSavedSearches((previous) => previous.filter((search) => search.id !== id));
  }

  async function runExport(format: string) {
    const result = await exportSearch(request, format, includeCalculated);
    setExportResult(result);
  }

  async function runAlbumExport(format: string) {
    if (!selectedAlbumId) {
      return;
    }
    const result = await exportSearch(
      createAlbumTracksRequest(selectedAlbumId),
      format,
      albumIncludeCalculated,
    );
    setAlbumExportResult(result);
  }

  async function runArtistExport(format: string) {
    if (!artistAlbumsRequest) {
      return;
    }
    const result = await exportSearch(artistAlbumsRequest, format, artistIncludeCalculated);
    setArtistExportResult(result);
  }

  async function runGenreExport(format: string) {
    if (!genreAlbumsRequest) {
      return;
    }
    const result = await exportSearch(genreAlbumsRequest, format, genreIncludeCalculated);
    setGenreExportResult(result);
  }

  async function runToolExport(format: string) {
    if (!selectedTool) {
      return;
    }
    const result = await exportMusicToolIssues(selectedTool.id, toolIssueRequest.searchText, format);
    setToolExportResult(result);
  }

  function updateChartConfig(values: Partial<ChartConfig>) {
    setChartConfig((previous) => {
      const nextConfig = {
        ...previous,
        ...values,
        sortField: values.sortField ?? (values.rankingMetric ? values.rankingMetric : previous.sortField),
        request: values.request ?? previous.request,
      };
      if (values.gridCoverSize != null) {
        nextConfig.gridCoverSize = normalizeChartGridCoverSize(values.gridCoverSize);
      }
      return nextConfig;
    });
    setChartExportResult(null);
  }

  function updateChartFilters(values: Partial<BrowseFilters>) {
    setChartConfig((previous) => ({
      ...previous,
      request: {
        ...previous.request,
        filters: {
          ...previous.request.filters,
          ...values,
        },
        offset: 0,
      },
    }));
    setChartExportResult(null);
  }

  function sortChartBy(field: string) {
    const defaultSort: BrowseSort = {
      field: chartConfig.rankingMetric,
      direction: chartConfig.sortDirection,
    };
    setChartTableSort((previous) => nextSort(previous ?? defaultSort, field));
  }

  function toggleChartColumn(value: string, key: "visibleColumns" | "exportColumns") {
    setChartConfig((previous) => {
      const current = previous[key];
      const nextValues = current.includes(value)
        ? current.filter((column) => column !== value)
        : [...current, value];
      return { ...previous, [key]: nextValues };
    });
    setChartExportResult(null);
  }

  function applyChartTemplate(template: ChartTemplate) {
    setChartConfig(template.createConfig());
    setChartTableSort(null);
    setChartExportResult(null);
  }

  async function saveCurrentChart() {
    const nextConfig = {
      ...chartConfig,
      sortField: chartConfig.sortField ?? chartConfig.rankingMetric,
      gridCoverSize: normalizeChartGridCoverSize(chartConfig.gridCoverSize),
      request: chartRequest,
    };
    const fallbackName = `${rankingLabel(nextConfig.rankingMetric)} chart`;
    const saved = await saveChart(chartName.trim() || fallbackName, nextConfig);
    setSavedCharts((previous) => [saved, ...previous.filter((chart) => chart.id !== saved.id)]);
    setChartName("");
  }

  async function removeSavedChart(id: number) {
    await deleteSavedChart(id);
    setSavedCharts((previous) => previous.filter((chart) => chart.id !== id));
  }

  async function runChartExport(format: string) {
    const result = await exportSearch(chartRequest, format, chartConfig.exportColumns.length > 0);
    setChartExportResult(result);
  }

  async function refreshStatistics() {
    setIsStatsLoading(true);
    setStatsError(null);
    try {
      await loadData();
    } catch (error) {
      setStatsError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsStatsLoading(false);
    }
  }

  async function saveAppSettings(values: Partial<AppSettings>) {
    const nextSettings = {
      ...settings,
      ...values,
      backupRetention: clampBackupRetention(values.backupRetention ?? settings.backupRetention),
    };
    setSettings(nextSettings);
    cacheSettings(nextSettings);
    setIsSavingSettings(true);
    setSettingsError(null);

    try {
      const saved = await saveSettings(nextSettings);
      setSettings(saved);
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSavingSettings(false);
    }
  }

  const total = response?.total ?? 0;
  const pageStart = total === 0 ? 0 : request.offset + 1;
  const pageEnd = Math.min(total, request.offset + request.limit);
  const albumTotal = albumResponse?.total ?? 0;
  const albumPageStart = albumTotal === 0 ? 0 : albumRequest.offset + 1;
  const albumPageEnd = Math.min(albumTotal, albumRequest.offset + albumRequest.limit);
  const selectedAlbum =
    albumResponse?.rows.find((row) => row.albumId === selectedAlbumId) ?? null;
  const selectedAlbumTrackCount = selectedAlbum?.totalTracks ?? albumTracksResponse?.total ?? 0;
  const artistTotal = artistResponse?.total ?? 0;
  const artistPageStart = artistTotal === 0 ? 0 : artistRequest.offset + 1;
  const artistPageEnd = Math.min(artistTotal, artistRequest.offset + artistRequest.limit);
  const selectedArtistAlbumCount = selectedArtist?.albumCount ?? artistAlbumsResponse?.total ?? 0;
  const genreTotal = genreResponse?.total ?? 0;
  const genrePageStart = genreTotal === 0 ? 0 : genreRequest.offset + 1;
  const genrePageEnd = Math.min(genreTotal, genreRequest.offset + genreRequest.limit);
  const selectedGenreAlbumCount = selectedGenre?.albumCount ?? genreAlbumsResponse?.total ?? 0;
  const toolIssueTotal = currentToolIssueResponse?.total ?? 0;
  const toolIssuePageStart = toolIssueTotal === 0 ? 0 : toolIssueRequest.offset + 1;
  const toolIssuePageEnd = Math.min(toolIssueTotal, toolIssueRequest.offset + toolIssueRequest.limit);
  const totalToolIssues = musicTools.every((tool) => tool.issueCount >= 0)
    ? musicTools.reduce((sum, tool) => sum + tool.issueCount, 0)
    : null;
  const selectedToolIssueCount = selectedTool?.issueCount ?? toolIssueTotal;
  const selectedToolIssueValue =
    isToolProgressActive && activeToolProgressText
      ? activeToolProgressText
      : formatToolCount(selectedToolIssueCount);
  const toolIssuePanelCaption =
    isToolRunPending && activeToolProgress && activeToolProgressText
      ? `${activeToolProgress.message} ${activeToolProgressText}`
      : `${formatNumber(toolIssuePageStart)}-${formatNumber(toolIssuePageEnd)} of ${formatNumber(toolIssueTotal)}`;
  const chartTotal = chartResponse?.total ?? 0;
  const chartRows = chartResponse?.rows.length ?? 0;
  const currentChartGridCoverSize = normalizeChartGridCoverSize(chartConfig.gridCoverSize);
  const ratingAlbumTotal =
    (statistics?.ratingProgress.fullyRatedAlbums ?? 0) +
    (statistics?.ratingProgress.partiallyRatedAlbums ?? 0) +
    (statistics?.ratingProgress.unratedAlbums ?? 0);
  const ratingTrackTotal =
    (statistics?.ratingProgress.ratedTracks ?? 0) + (statistics?.ratingProgress.unratedTracks ?? 0);

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Main navigation">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <Library size={20} />
          </div>
          <div>
            <strong>Music Library</strong>
            <span>Local TSV browser</span>
          </div>
        </div>

        <nav className="nav-list">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = item.label === activeSection;
            return (
              <button
                className={isActive ? "active" : ""}
                key={item.label}
                type="button"
                disabled={!item.enabled}
                onClick={() => item.enabled && setActiveSection(item.label)}
                title={item.label}
              >
                <Icon size={17} strokeWidth={2} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {activeSection === "Imports" ? (
        <section className="workspace">
          <header className="topbar">
            <div>
              <h1>Imports</h1>
              <p>Build the local SQLite database from a MusicBee TSV export.</p>
            </div>
            <button className="icon-button" type="button" aria-label="Refresh" onClick={() => void loadData()}>
              <RotateCcw size={18} />
            </button>
          </header>

          <section className="metric-grid" aria-label="Library summary">
            <Metric label="Raw tracks" value={formatNumber(status?.trackCount)} tone="teal" icon={ListMusic} />
            <Metric label="Album aggregates" value={formatNumber(status?.albumCount)} tone="amber" icon={Album} />
            <Metric label="Cover images" value={formatNumber(status?.coverCount)} icon={Album} />
            <Metric label="Import runs" value={formatNumber(status?.importRunCount)} icon={Clock3} />
            <Metric label="Database" value={status?.hasDatabase ? "Ready" : "New"} icon={Database} />
          </section>

          <section className="import-panel">
            <div className="panel-heading">
              <div>
                <h2>musicbee-library.tsv</h2>
                <p>Streaming import validates headers and refreshes calculated album fields.</p>
              </div>
              <RunStatus status={progress.status} />
            </div>

            <label className="source-input">
              <span>TSV source path</span>
              <input
                value={sourcePath}
                onChange={(event) => setSourcePath(event.target.value)}
                placeholder="C:\\Music\\musicbee-library.tsv"
                disabled={isImporting}
              />
            </label>

            <div className="progress-block" aria-live="polite">
              <div className="progress-row">
                <span>{progress.message}</span>
                <strong>{formatNumber(progress.processedRows)} rows</strong>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
              </div>
              <div className="progress-meta">
                <span>{formatNumber(progress.albumCount)} album keys observed</span>
                <span>Backup ready before data replacement</span>
              </div>
            </div>

            {importError ? <p className="error-message">{importError}</p> : null}

            <div className="action-row">
              <button
                className="primary-button"
                type="button"
                onClick={startImport}
                disabled={isImporting || !sourcePath.trim() || !canImport}
                title={canImport ? "Start import" : "Open the Tauri desktop app to import"}
              >
                <Play size={17} fill="currentColor" />
                <span>{isImporting ? "Importing" : "Start import"}</span>
              </button>
              <span className="db-path">{status?.dbPath ?? "Database path will appear after initialization."}</span>
            </div>
          </section>

          <section className="import-panel">
            <div className="panel-heading">
              <div>
                <h2>Cover art</h2>
                <p>Scan folder-named image files, link archive matches, and optionally extract embedded MP3 artwork into the cover archive.</p>
              </div>
              <RunStatus status={coverProgress.status} />
            </div>

            <label className="source-input">
              <span>Cover source folder</span>
              <input
                value={coverSourcePath}
                onChange={(event) => setCoverSourcePath(event.target.value)}
                placeholder="C:\\Music\\AlbumCovers"
                disabled={isImportingCovers}
              />
            </label>

            <div className="toggle-row cover-options">
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={coverExtractEmbeddedFallback}
                  onChange={(event) => setCoverExtractEmbeddedFallback(event.target.checked)}
                  disabled={isImportingCovers}
                />
                <span>Extract missing embedded MP3 covers into AlbumCovers</span>
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={coverReplaceExisting}
                  onChange={(event) => setCoverReplaceExisting(event.target.checked)}
                  disabled={isImportingCovers}
                />
                <span>Replace existing covers</span>
              </label>
            </div>

            <div className="progress-block cover-progress-block" aria-live="polite">
              <div className="progress-row">
                <span>{coverProgress.message}</span>
                <strong>{Math.round(coverProgressPercent)}%</strong>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${coverProgressPercent}%` }} />
              </div>
              <div className="progress-meta">
                <span>
                  {formatNumber(coverProgress.scannedAlbums)} of {formatNumber(coverProgress.totalAlbums)} albums scanned
                </span>
                <span>{formatNumber(coverProgress.newCoversFound)} new covers found or extracted</span>
              </div>
              <div className="progress-meta">
                <span>{formatNumber(coverProgress.importedCovers)} imported</span>
                <span>{formatNumber(coverProgress.relinkedCovers)} relinked</span>
                <span>{formatNumber(coverProgress.skippedExisting)} already had covers</span>
                <span>{formatNumber(coverProgress.missingCovers)} missing</span>
              </div>
            </div>

            {coverImportError ? <p className="error-message">{coverImportError}</p> : null}
            {coverImportSummary ? (
              <p className="success-message">
                Linked or imported {formatNumber(coverImportSummary.importedCovers)} covers from{" "}
                {formatNumber(coverImportSummary.newCoversFound)} newly found or extracted covers and{" "}
                {formatNumber(coverImportSummary.relinkedCovers)} existing cover entries.
              </p>
            ) : null}

            <div className="action-row">
              <button
                className="primary-button"
                type="button"
                onClick={startCoverImport}
                disabled={isImportingCovers || !coverSourcePath.trim() || !canImport || (status?.albumCount ?? 0) === 0}
                title={canImport ? "Start cover import" : "Open the Tauri desktop app to import covers"}
              >
                <Play size={17} fill="currentColor" />
                <span>{isImportingCovers ? "Scanning" : "Import covers"}</span>
              </button>
              <span className="db-path">
                Archive matches are linked directly; missing embedded art is saved into AlbumCovers.
              </span>
            </div>
          </section>

          <section className="table-panel" aria-label="Import history">
            <div className="panel-heading compact">
              <div>
                <h2>Last run</h2>
                <p>Recent imports and their database refresh results.</p>
              </div>
            </div>

            <div className="run-table" role="table">
              <div className="run-table-head" role="row">
                <span role="columnheader">Status</span>
                <span role="columnheader">Started</span>
                <span role="columnheader">Tracks</span>
                <span role="columnheader">Albums</span>
                <span role="columnheader">Duration</span>
              </div>
              {runs.length === 0 ? (
                <div className="empty-state">
                  <FileSearch size={20} />
                  <span>No imports yet.</span>
                </div>
              ) : (
                runs.map((run) => (
                  <div className="run-table-row" role="row" key={run.id}>
                    <span role="cell">
                      <RunStatus status={run.status} />
                    </span>
                    <span role="cell">{formatDate(run.startedAt)}</span>
                    <span role="cell">{formatNumber(run.trackRows)}</span>
                    <span role="cell">{formatNumber(run.albumCount)}</span>
                    <span role="cell">{formatDuration(run.durationMs)}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </section>
      ) : activeSection === "Charts" ? (
        <section className="workspace charts-workspace">
          <header className="topbar">
            <div>
              <h1>Charts</h1>
              <p>Rank album lists from saved filters, Album Score, loved tracks, AE, and TMOE.</p>
            </div>
            <div className="topbar-actions">
              <button
                className="icon-button"
                type="button"
                aria-label="Reset chart"
                onClick={() => {
                  setChartConfig(createChartConfig());
                  setChartTableSort(null);
                }}
              >
                <RotateCcw size={18} />
              </button>
              <button className="icon-button" type="button" aria-label="Refresh" onClick={() => void loadData()}>
                <Database size={18} />
              </button>
            </div>
          </header>

          <section className="metric-grid" aria-label="Chart summary">
            <Metric label="Albums" value={formatNumber(status?.albumCount)} tone="teal" icon={Album} />
            <Metric label="Ranked" value={formatNumber(chartTotal)} tone="amber" icon={BarChart3} />
            <Metric label="Showing" value={formatNumber(chartRows)} icon={ListMusic} />
            <Metric label="Saved" value={formatNumber(savedCharts.length)} icon={Save} />
          </section>

          <section className="chart-template-panel" aria-label="Built-in charts">
            {chartTemplates.map((template) => {
              const Icon = template.icon;
              return (
                <button type="button" key={template.id} onClick={() => applyChartTemplate(template)}>
                  <Icon size={17} />
                  <span>
                    <strong>{template.label}</strong>
                    <small>{template.description}</small>
                  </span>
                </button>
              );
            })}
          </section>

          <section className="query-panel chart-builder">
            <div className="search-row">
              <div className="search-input">
                <Search size={18} />
                <input
                  value={chartConfig.request.searchText}
                  onChange={(event) =>
                    updateChartConfig({
                      request: { ...chartConfig.request, searchText: event.target.value, offset: 0 },
                    })
                  }
                  placeholder="Search within chart albums, artists, genres, publishers"
                />
              </div>

              <div className="segmented-control" aria-label="Chart view mode">
                {chartViewModes.map((mode) => {
                  const Icon = mode.icon;
                  return (
                    <button
                      className={chartConfig.viewMode === mode.value ? "active" : ""}
                      type="button"
                      key={mode.value}
                      onClick={() => updateChartConfig({ viewMode: mode.value })}
                    >
                      <Icon size={16} />
                      <span>{mode.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="filter-grid">
              <NumberField
                label="Year from"
                value={chartConfig.request.filters.yearFrom}
                onChange={(value) => updateChartFilters({ yearFrom: value })}
              />
              <NumberField
                label="Year to"
                value={chartConfig.request.filters.yearTo}
                onChange={(value) => updateChartFilters({ yearTo: value })}
              />
              <GenreListCriterion
                label="Genres"
                values={chartConfig.request.filters.genres}
                onChange={(genres) => updateChartFilters({ genres })}
                genreOptions={genreSuggestionOptions}
                onRequestOptions={requestGenreSuggestionRefresh}
                placeholder="Synthpop, AOR"
              />
              <GenreListCriterion
                label="Exclude genres"
                values={chartConfig.request.filters.excludedGenres}
                onChange={(excludedGenres) => updateChartFilters({ excludedGenres })}
                genreOptions={genreSuggestionOptions}
                onRequestOptions={requestGenreSuggestionRefresh}
              />
              <TextCriterion
                label="Album artist"
                filter={chartConfig.request.filters.albumArtist}
                onChange={(filter) => updateChartFilters({ albumArtist: filter })}
              />
              <TextCriterion
                label="Album title"
                filter={chartConfig.request.filters.albumTitle}
                onChange={(filter) => updateChartFilters({ albumTitle: filter })}
              />
              <TextCriterion
                label="Publisher"
                filter={chartConfig.request.filters.publisher}
                onChange={(filter) => updateChartFilters({ publisher: filter })}
              />
              <NumberField
                label="Minutes min"
                value={chartConfig.request.filters.totalMinutesMin}
                step={0.5}
                onChange={(value) => updateChartFilters({ totalMinutesMin: value })}
              />
              <NumberField
                label="Minutes max"
                value={chartConfig.request.filters.totalMinutesMax}
                step={0.5}
                onChange={(value) => updateChartFilters({ totalMinutesMax: value })}
              />
              <NumberField
                label="Loved min"
                value={chartConfig.request.filters.lovedTracksMin}
                min={0}
                onChange={(value) => updateChartFilters({ lovedTracksMin: value })}
              />
              <SelectField
                label="Ranking"
                value={chartConfig.rankingMetric}
                onChange={(rankingMetric) => updateChartConfig({ rankingMetric })}
                options={rankingOptions}
              />
              <SelectField
                label="Direction"
                value={chartConfig.sortDirection}
                onChange={(sortDirection) => updateChartConfig({ sortDirection: sortDirection as "asc" | "desc" })}
                options={[
                  { value: "desc", label: "Descending" },
                  { value: "asc", label: "Ascending" },
                ]}
              />
              <NumberField
                label="Limit"
                value={chartConfig.resultLimit}
                min={10}
                max={500}
                onChange={(value) => updateChartConfig({ resultLimit: value ?? 50 })}
              />
              <label className="criterion slider-criterion chart-slider">
                <span>Completeness</span>
                <div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={chartConfig.ratingCompletenessThreshold}
                    onChange={(event) => updateChartConfig({ ratingCompletenessThreshold: Number(event.target.value) })}
                  />
                  <strong>{chartConfig.ratingCompletenessThreshold}%</strong>
                </div>
              </label>
              {chartConfig.viewMode === "grid" ? (
                <label className="criterion slider-criterion chart-slider">
                  <span>Cover size</span>
                  <div>
                    <input
                      type="range"
                      min={chartGridCoverSize.min}
                      max={chartGridCoverSize.max}
                      step={chartGridCoverSize.step}
                      value={currentChartGridCoverSize}
                      onChange={(event) => updateChartConfig({ gridCoverSize: Number(event.target.value) })}
                    />
                    <strong>{currentChartGridCoverSize}px</strong>
                  </div>
                </label>
              ) : null}
            </div>

            <div className="query-footer chart-options">
              <div className="missing-flags" aria-label="Visible chart columns">
                {chartColumnOptions.map((option) => (
                  <label key={option.value}>
                    <input
                      type="checkbox"
                      checked={chartConfig.visibleColumns.includes(option.value)}
                      onChange={() => toggleChartColumn(option.value, "visibleColumns")}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={chartConfig.exportColumns.includes("calculated")}
                  onChange={() => toggleChartColumn("calculated", "exportColumns")}
                />
                <span>Calculated export columns</span>
              </label>
            </div>
          </section>

          <section className="table-panel" aria-label="Chart results">
            <div className="panel-heading compact">
              <div>
                <h2>{rankingLabel(chartConfig.rankingMetric)} chart</h2>
                <p>
                  {isChartLoading
                    ? "Ranking"
                    : `${formatNumber(chartRows)} shown from ${formatNumber(chartTotal)} matches`}
                </p>
              </div>
              <span className="run-status">{chartConfig.ratingCompletenessThreshold}% complete</span>
            </div>

            {chartError ? <p className="error-message">{chartError}</p> : null}
            <ChartResults
              response={chartResponse}
              config={chartConfig}
              displaySort={chartTableSort}
              onSort={sortChartBy}
            />
          </section>
        </section>
      ) : activeSection === "Artists" ? (
        <section className="workspace artists-workspace">
          <header className="topbar">
            <div>
              <h1>Artists</h1>
              <p>Album-artist index, selected artist album lists, and artist-level summary stats.</p>
            </div>
            <div className="topbar-actions">
              <button className="icon-button" type="button" aria-label="Clear artist filters" onClick={clearArtistQuery}>
                <RotateCcw size={18} />
              </button>
              <button
                className="icon-button"
                type="button"
                aria-label="Refresh artists"
                onClick={() => {
                  void loadData();
                  setArtistRequest((previous) => ({ ...previous }));
                }}
              >
                <Database size={18} />
              </button>
            </div>
          </header>

          <section className="metric-grid" aria-label="Artist summary">
            <Metric
              label="Album artists"
              value={formatNumber(statistics?.overview.albumArtistCount)}
              tone="teal"
              icon={UsersRound}
            />
            <Metric label="Matches" value={formatNumber(artistTotal)} tone="amber" icon={Search} />
            <Metric label="Artist albums" value={formatNumber(selectedArtistAlbumCount)} icon={Album} />
            <Metric label="Loved tracks" value={formatNumber(selectedArtist?.lovedTracks)} icon={Heart} />
          </section>

          <section className="query-panel artist-query-panel">
            <div className="search-row artist-search-row">
              <div className="search-input">
                <Search size={18} />
                <input
                  value={artistRequest.searchText}
                  onChange={(event) =>
                    setArtistRequest((previous) => ({ ...previous, searchText: event.target.value, offset: 0 }))
                  }
                  placeholder="Search album artists"
                />
              </div>
              <SelectField
                label="Sort"
                value={artistRequest.sort.field}
                onChange={(field) =>
                  setArtistRequest((previous) => ({
                    ...previous,
                    sort: { ...previous.sort, field },
                    offset: 0,
                  }))
                }
                options={[
                  { value: "name", label: "Artist" },
                  { value: "albumCount", label: "Albums" },
                  { value: "trackCount", label: "Tracks" },
                  { value: "lovedTracks", label: "Loved tracks" },
                  { value: "averageCompleteness", label: "Completeness" },
                  { value: "averageRating", label: "Average rating" },
                  { value: "averageScore", label: "Average score" },
                  { value: "firstYear", label: "First year" },
                  { value: "lastYear", label: "Last year" },
                  { value: "topGenre", label: "Top genre" },
                ]}
              />
            </div>

            <div className="query-footer">
              <div className="chip-row inline" aria-label="Active artist filters">
                {artistRequest.searchText.trim() ? (
                  <button
                    className="filter-chip"
                    type="button"
                    onClick={() => setArtistRequest((previous) => ({ ...previous, searchText: "", offset: 0 }))}
                  >
                    <span>Search "{artistRequest.searchText.trim()}"</span>
                    <X size={14} />
                  </button>
                ) : (
                  <span className="chip-empty">No active filters</span>
                )}
              </div>

              <div className="sort-controls">
                <SelectField
                  label="Direction"
                  value={artistRequest.sort.direction}
                  onChange={(direction) =>
                    setArtistRequest((previous) => ({
                      ...previous,
                      sort: { ...previous.sort, direction: direction as "asc" | "desc" },
                      offset: 0,
                    }))
                  }
                  options={[
                    { value: "asc", label: "Ascending" },
                    { value: "desc", label: "Descending" },
                  ]}
                />
                <NumberField
                  label="Rows"
                  value={artistRequest.limit}
                  min={10}
                  max={500}
                  onChange={(value) =>
                    setArtistRequest((previous) => ({ ...previous, limit: value ?? 50, offset: 0 }))
                  }
                />
              </div>
            </div>
          </section>

          <section className="table-panel" aria-label="Artist index">
            <div className="panel-heading compact">
              <div>
                <h2>Artist index</h2>
                <p>
                  {isArtistLoading
                    ? "Loading artists"
                    : `${formatNumber(artistPageStart)}-${formatNumber(artistPageEnd)} of ${formatNumber(artistTotal)}`}
                </p>
              </div>
              <div className="pager">
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Previous artist page"
                  disabled={artistRequest.offset === 0}
                  onClick={() =>
                    setArtistRequest((previous) => ({
                      ...previous,
                      offset: Math.max(0, previous.offset - previous.limit),
                    }))
                  }
                >
                  <ChevronLeft size={17} />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Next artist page"
                  disabled={artistRequest.offset + artistRequest.limit >= artistTotal}
                  onClick={() =>
                    setArtistRequest((previous) => ({
                      ...previous,
                      offset: previous.offset + previous.limit,
                    }))
                  }
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>

            {artistError ? <p className="error-message">{artistError}</p> : null}
            <ArtistIndexTable response={artistResponse} selectedArtistId={selectedArtistId} onSelect={selectArtist} />
          </section>

          <section className="table-panel" aria-label="Selected artist albums">
            <div className="panel-heading compact">
              <div>
                <h2>{selectedArtist?.name ?? "Artist albums"}</h2>
                <p>
                  {isArtistAlbumsLoading
                    ? "Loading albums"
                    : `${formatNumber(artistAlbumsResponse?.rows.length ?? 0)} of ${formatNumber(selectedArtistAlbumCount)} albums`}
                </p>
              </div>
              <span className="run-status">{selectedArtist?.topGenre ?? "Artist"}</span>
            </div>

            {artistAlbumsError ? <p className="error-message">{artistAlbumsError}</p> : null}
            <ArtistAlbumTable response={artistAlbumsResponse} />
          </section>
        </section>
      ) : activeSection === "Genres" ? (
        <section className="workspace genres-workspace">
          <header className="topbar">
            <div>
              <h1>Genres</h1>
              <p>Canonical-genre index, selected genre album lists, and genre-level summary stats.</p>
            </div>
            <div className="topbar-actions">
              <button className="icon-button" type="button" aria-label="Clear genre filters" onClick={clearGenreQuery}>
                <RotateCcw size={18} />
              </button>
              <button
                className="icon-button"
                type="button"
                aria-label="Refresh genres"
                onClick={() => {
                  void loadData();
                  setGenreRequest((previous) => ({ ...previous }));
                }}
              >
                <Database size={18} />
              </button>
            </div>
          </header>

          <section className="metric-grid" aria-label="Genre summary">
            <Metric label="Canonical genres" value={formatNumber(statistics?.overview.genreCount)} tone="teal" icon={Tags} />
            <Metric label="Matches" value={formatNumber(genreTotal)} tone="amber" icon={Search} />
            <Metric label="Genre albums" value={formatNumber(selectedGenreAlbumCount)} icon={Album} />
            <Metric label="Loved tracks" value={formatNumber(selectedGenre?.lovedTracks)} icon={Heart} />
          </section>

          <section className="query-panel genre-query-panel">
            <div className="search-row genre-search-row">
              <div className="search-input">
                <Search size={18} />
                <input
                  value={genreRequest.searchText}
                  onChange={(event) =>
                    setGenreRequest((previous) => ({ ...previous, searchText: event.target.value, offset: 0 }))
                  }
                  placeholder="Search canonical genres"
                />
              </div>
              <SelectField
                label="Sort"
                value={genreRequest.sort.field}
                onChange={(field) =>
                  setGenreRequest((previous) => ({
                    ...previous,
                    sort: { ...previous.sort, field },
                    offset: 0,
                  }))
                }
                options={[
                  { value: "name", label: "Genre" },
                  { value: "albumCount", label: "Albums" },
                  { value: "trackCount", label: "Tracks" },
                  { value: "lovedTracks", label: "Loved tracks" },
                  { value: "averageCompleteness", label: "Completeness" },
                  { value: "averageRating", label: "Average rating" },
                  { value: "averageScore", label: "Average score" },
                  { value: "firstYear", label: "First year" },
                  { value: "lastYear", label: "Last year" },
                  { value: "topArtist", label: "Top artist" },
                ]}
              />
            </div>

            <div className="query-footer">
              <div className="chip-row inline" aria-label="Active genre filters">
                {genreRequest.searchText.trim() ? (
                  <button
                    className="filter-chip"
                    type="button"
                    onClick={() => setGenreRequest((previous) => ({ ...previous, searchText: "", offset: 0 }))}
                  >
                    <span>Search "{genreRequest.searchText.trim()}"</span>
                    <X size={14} />
                  </button>
                ) : (
                  <span className="chip-empty">No active filters</span>
                )}
              </div>

              <div className="sort-controls">
                <SelectField
                  label="Direction"
                  value={genreRequest.sort.direction}
                  onChange={(direction) =>
                    setGenreRequest((previous) => ({
                      ...previous,
                      sort: { ...previous.sort, direction: direction as "asc" | "desc" },
                      offset: 0,
                    }))
                  }
                  options={[
                    { value: "asc", label: "Ascending" },
                    { value: "desc", label: "Descending" },
                  ]}
                />
                <NumberField
                  label="Rows"
                  value={genreRequest.limit}
                  min={10}
                  max={500}
                  onChange={(value) =>
                    setGenreRequest((previous) => ({ ...previous, limit: value ?? 50, offset: 0 }))
                  }
                />
              </div>
            </div>
          </section>

          <section className="table-panel" aria-label="Genre index">
            <div className="panel-heading compact">
              <div>
                <h2>Genre index</h2>
                <p>
                  {isGenreLoading
                    ? "Loading genres"
                    : `${formatNumber(genrePageStart)}-${formatNumber(genrePageEnd)} of ${formatNumber(genreTotal)}`}
                </p>
              </div>
              <div className="pager">
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Previous genre page"
                  disabled={genreRequest.offset === 0}
                  onClick={() =>
                    setGenreRequest((previous) => ({
                      ...previous,
                      offset: Math.max(0, previous.offset - previous.limit),
                    }))
                  }
                >
                  <ChevronLeft size={17} />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Next genre page"
                  disabled={genreRequest.offset + genreRequest.limit >= genreTotal}
                  onClick={() =>
                    setGenreRequest((previous) => ({
                      ...previous,
                      offset: previous.offset + previous.limit,
                    }))
                  }
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>

            {genreError ? <p className="error-message">{genreError}</p> : null}
            <GenreIndexTable response={genreResponse} selectedGenreId={selectedGenreId} onSelect={selectGenre} />
          </section>

          <section className="table-panel" aria-label="Selected genre albums">
            <div className="panel-heading compact">
              <div>
                <h2>{selectedGenre?.name ?? "Genre albums"}</h2>
                <p>
                  {isGenreAlbumsLoading
                    ? "Loading albums"
                    : `${formatNumber(genreAlbumsResponse?.rows.length ?? 0)} of ${formatNumber(selectedGenreAlbumCount)} albums`}
                </p>
              </div>
              <span className="run-status">{selectedGenre?.topArtist ?? "Genre"}</span>
            </div>

            {genreAlbumsError ? <p className="error-message">{genreAlbumsError}</p> : null}
            <GenreAlbumTable response={genreAlbumsResponse} />
          </section>
        </section>
      ) : activeSection === "Tools" ? (
        <section className="workspace tools-workspace">
          <header className="topbar">
            <div>
              <h1>Tools</h1>
              <p>Validation issue lists for library cleanup checks.</p>
            </div>
            <div className="topbar-actions">
              <button className="icon-button" type="button" aria-label="Clear tool filters" onClick={clearToolQuery}>
                <RotateCcw size={18} />
              </button>
              <button
                className="icon-button"
                type="button"
                aria-label="Refresh tools"
                onClick={() => void refreshMusicTools()}
              >
                <Database size={18} />
              </button>
            </div>
          </header>

          <section className="metric-grid" aria-label="Tools summary">
            <Metric label="Validators" value={formatNumber(musicTools.length)} tone="teal" icon={Wrench} />
            <Metric label="Issue rows" value={formatToolCount(totalToolIssues)} tone="amber" icon={FileSearch} />
            <Metric label="Selected" value={selectedToolIssueValue} icon={ListMusic} />
            <Metric label="Severity" value={severityLabel(selectedTool?.severity) || "Select"} icon={ShieldCheck} />
          </section>

          <section className="query-panel tool-query-panel">
            <div className="search-row tool-search-row">
              <div className="search-input">
                <Search size={18} />
                <input
                  value={toolIssueRequest.searchText}
                  onChange={(event) =>
                    setToolIssueRequest((previous) =>
                      renewMusicToolIssueRequest(previous, {
                        searchText: event.target.value,
                        offset: 0,
                      }),
                    )
                  }
                  placeholder="Filter affected albums, tracks, files, and issue values"
                />
              </div>
              <SelectField
                label="Sort"
                value={toolIssueRequest.sort.field}
                onChange={(field) =>
                  setToolIssueRequest((previous) =>
                    renewMusicToolIssueRequest(previous, {
                      sort: { ...previous.sort, field },
                      offset: 0,
                    }),
                  )
                }
                options={[
                  { value: "album", label: "Album" },
                  { value: "artist", label: "Artist" },
                  { value: "year", label: "Year" },
                  { value: "title", label: "Track" },
                  { value: "detail", label: "Issue" },
                  { value: "value", label: "Value" },
                  { value: "filename", label: "Filename" },
                  { value: "severity", label: "Severity" },
                ]}
              />
            </div>

            <div className="query-footer">
              <div className="chip-row inline" aria-label="Active tool filters">
                {toolIssueRequest.searchText.trim() ? (
                  <button
                    className="filter-chip"
                    type="button"
                    onClick={() =>
                      setToolIssueRequest((previous) =>
                        renewMusicToolIssueRequest(previous, {
                          searchText: "",
                          offset: 0,
                        }),
                      )
                    }
                  >
                    <span>Filter "{toolIssueRequest.searchText.trim()}"</span>
                    <X size={14} />
                  </button>
                ) : (
                  <span className="chip-empty">No active filters</span>
                )}
              </div>

              <div className="sort-controls">
                <SelectField
                  label="Direction"
                  value={toolIssueRequest.sort.direction}
                  onChange={(direction) =>
                    setToolIssueRequest((previous) =>
                      renewMusicToolIssueRequest(previous, {
                        sort: { ...previous.sort, direction: direction as "asc" | "desc" },
                        offset: 0,
                      }),
                    )
                  }
                  options={[
                    { value: "asc", label: "Ascending" },
                    { value: "desc", label: "Descending" },
                  ]}
                />
                <NumberField
                  label="Rows"
                  value={toolIssueRequest.limit}
                  min={10}
                  max={500}
                  onChange={(value) =>
                    setToolIssueRequest((previous) =>
                      renewMusicToolIssueRequest(previous, { limit: value ?? 50, offset: 0 }),
                    )
                  }
                />
              </div>
            </div>
          </section>

          <section className="table-panel" aria-label="Validation tool index">
            <div className="panel-heading compact">
              <div>
                <h2>Validation suite</h2>
                <p>{isToolsLoading ? "Loading tools" : `${formatNumber(musicTools.length)} tools`}</p>
              </div>
              <span className="run-status">
                {totalToolIssues == null ? "Counts on select" : `${formatNumber(totalToolIssues)} issues`}
              </span>
            </div>

            {toolsError ? <p className="error-message">{toolsError}</p> : null}
            <MusicToolIndexTable
              tools={musicTools}
              selectedToolId={selectedToolId}
              progress={activeToolProgress}
              onSelect={selectMusicTool}
            />
          </section>

          <section className="table-panel" aria-label="Validation issues">
            <div className="panel-heading compact">
              <div>
                <h2>{selectedTool?.label ?? "Issue list"}</h2>
                <p>{toolIssuePanelCaption}</p>
              </div>
              <div className="pager">
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Previous issue page"
                  disabled={toolIssueRequest.offset === 0}
                  onClick={() =>
                    setToolIssueRequest((previous) =>
                      renewMusicToolIssueRequest(previous, {
                        offset: Math.max(0, previous.offset - previous.limit),
                      }),
                    )
                  }
                >
                  <ChevronLeft size={17} />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Next issue page"
                  disabled={toolIssueRequest.offset + toolIssueRequest.limit >= toolIssueTotal}
                  onClick={() =>
                    setToolIssueRequest((previous) =>
                      renewMusicToolIssueRequest(previous, {
                        offset: previous.offset + previous.limit,
                      }),
                    )
                  }
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>

            {toolIssueError ? <p className="error-message">{toolIssueError}</p> : null}
            <MusicToolIssueTable
              response={isToolProgressActive ? null : currentToolIssueResponse}
              progress={activeToolProgress}
            />
          </section>
        </section>
      ) : activeSection === "Albums" ? (
        <section className="workspace albums-workspace">
          <header className="topbar">
            <div>
              <h1>Albums</h1>
              <p>Dedicated album index, drill-down calculations, ordered tracks, and album export.</p>
            </div>
            <div className="topbar-actions">
              <button className="icon-button" type="button" aria-label="Clear album filters" onClick={clearAlbumQuery}>
                <RotateCcw size={18} />
              </button>
              <button className="icon-button" type="button" aria-label="Refresh albums" onClick={() => void loadData()}>
                <Database size={18} />
              </button>
            </div>
          </header>

          <section className="metric-grid" aria-label="Album summary">
            <Metric label="Library albums" value={formatNumber(status?.albumCount)} tone="teal" icon={Album} />
            <Metric label="Matches" value={formatNumber(albumTotal)} tone="amber" icon={Search} />
            <Metric label="Tracks" value={formatNumber(selectedAlbumTrackCount)} icon={ListMusic} />
            <Metric
              label="Complete"
              value={selectedAlbum ? formatPercent(selectedAlbum.ratingCompleteness) : "Select"}
              icon={Gauge}
            />
          </section>

          <section className="query-panel album-query-panel">
            <div className="search-row album-search-row">
              <div className="search-input">
                <Search size={18} />
                <input
                  value={albumRequest.searchText}
                  onChange={(event) =>
                    setAlbumRequest((previous) => ({ ...previous, searchText: event.target.value, offset: 0 }))
                  }
                  placeholder="Search albums, artists, genres, publishers"
                />
              </div>
              <SelectField
                label="Sort"
                value={albumRequest.sort.field}
                onChange={(field) =>
                  setAlbumRequest((previous) => ({
                    ...previous,
                    sort: { ...previous.sort, field },
                    offset: 0,
                  }))
                }
                options={[
                  { value: "album", label: "Album" },
                  { value: "artist", label: "Artist" },
                  { value: "year", label: "Year" },
                  { value: "genre", label: "Genre" },
                  { value: "totalMinutes", label: "Minutes" },
                  { value: "trackCount", label: "Tracks" },
                  { value: "albumRating", label: "Rating" },
                  { value: "ratingCompleteness", label: "Completeness" },
                  { value: "lovedTracks", label: "Loved" },
                  { value: "albumScore", label: "Score" },
                ]}
              />
            </div>

            <div className="filter-grid">
              <TextCriterion
                label="Album title"
                filter={albumFilters.albumTitle}
                onChange={(filter) => updateAlbumFilter("albumTitle", filter)}
              />
              <TextCriterion
                label="Album artist"
                filter={albumFilters.albumArtist}
                onChange={(filter) => updateAlbumFilter("albumArtist", filter)}
              />
              <TextCriterion
                label="Publisher"
                filter={albumFilters.publisher}
                onChange={(filter) => updateAlbumFilter("publisher", filter)}
              />
              <GenreListCriterion
                label="Genres"
                values={albumFilters.genres}
                onChange={(genres) => updateAlbumFilter("genres", genres)}
                genreOptions={genreSuggestionOptions}
                onRequestOptions={requestGenreSuggestionRefresh}
                placeholder="Synthpop, AOR"
              />
              <GenreListCriterion
                label="Exclude genres"
                values={albumFilters.excludedGenres}
                onChange={(excludedGenres) => updateAlbumFilter("excludedGenres", excludedGenres)}
                genreOptions={genreSuggestionOptions}
                onRequestOptions={requestGenreSuggestionRefresh}
              />
              <NumberField
                label="Year from"
                value={albumFilters.yearFrom}
                onChange={(value) => updateAlbumFilter("yearFrom", value)}
              />
              <NumberField
                label="Year to"
                value={albumFilters.yearTo}
                onChange={(value) => updateAlbumFilter("yearTo", value)}
              />
              <NumberField
                label="Minutes min"
                value={albumFilters.totalMinutesMin}
                step={0.5}
                onChange={(value) => updateAlbumFilter("totalMinutesMin", value)}
              />
              <NumberField
                label="Minutes max"
                value={albumFilters.totalMinutesMax}
                step={0.5}
                onChange={(value) => updateAlbumFilter("totalMinutesMax", value)}
              />
              <NumberField
                label="Tracks min"
                value={albumFilters.trackCountMin}
                onChange={(value) => updateAlbumFilter("trackCountMin", value)}
              />
              <NumberField
                label="Album rating min"
                value={albumFilters.albumRatingMin}
                min={0}
                max={100}
                onChange={(value) => updateAlbumFilter("albumRatingMin", value)}
              />
              <label className="criterion slider-criterion">
                <span>Completeness</span>
                <div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={albumFilters.ratingCompletenessMin ?? 0}
                    onChange={(event) => updateAlbumFilter("ratingCompletenessMin", Number(event.target.value))}
                  />
                  <strong>{albumFilters.ratingCompletenessMin ?? 0}%</strong>
                </div>
              </label>
            </div>

            <div className="query-footer">
              <div className="chip-row inline" aria-label="Active album filters">
                {albumChips.length === 0 ? (
                  <span className="chip-empty">No active filters</span>
                ) : (
                  albumChips.map((chip) => (
                    <button className="filter-chip" type="button" key={chip.key} onClick={chip.remove}>
                      <span>{chip.label}</span>
                      <X size={14} />
                    </button>
                  ))
                )}
              </div>

              <div className="sort-controls">
                <SelectField
                  label="Direction"
                  value={albumRequest.sort.direction}
                  onChange={(direction) =>
                    setAlbumRequest((previous) => ({
                      ...previous,
                      sort: { ...previous.sort, direction: direction as "asc" | "desc" },
                      offset: 0,
                    }))
                  }
                  options={[
                    { value: "asc", label: "Ascending" },
                    { value: "desc", label: "Descending" },
                  ]}
                />
                <NumberField
                  label="Rows"
                  value={albumRequest.limit}
                  min={10}
                  max={500}
                  onChange={(value) =>
                    setAlbumRequest((previous) => ({ ...previous, limit: value ?? 25, offset: 0 }))
                  }
                />
              </div>
            </div>
          </section>

          <section className="table-panel" aria-label="Album index">
            <div className="panel-heading compact">
              <div>
                <h2>Album index</h2>
                <p>
                  {isAlbumLoading
                    ? "Loading albums"
                    : `${formatNumber(albumPageStart)}-${formatNumber(albumPageEnd)} of ${formatNumber(albumTotal)}`}
                </p>
              </div>
              <div className="pager">
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Previous album page"
                  disabled={albumRequest.offset === 0}
                  onClick={() =>
                    setAlbumRequest((previous) => ({
                      ...previous,
                      offset: Math.max(0, previous.offset - previous.limit),
                    }))
                  }
                >
                  <ChevronLeft size={17} />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Next album page"
                  disabled={albumRequest.offset + albumRequest.limit >= albumTotal}
                  onClick={() =>
                    setAlbumRequest((previous) => ({
                      ...previous,
                      offset: previous.offset + previous.limit,
                    }))
                  }
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>

            {albumError ? <p className="error-message">{albumError}</p> : null}
            <AlbumIndexTable
              response={albumResponse}
              selectedAlbumId={selectedAlbumId}
              sort={albumRequest.sort}
              onSort={sortAlbumsBy}
              onSelect={selectAlbum}
            />
          </section>

          <section className="table-panel" aria-label="Selected album tracks">
            <div className="panel-heading compact">
              <div>
                <h2>{selectedAlbum?.album ?? "Track list"}</h2>
                <p>
                  {isAlbumTracksLoading
                    ? "Loading tracks"
                    : `${formatNumber(albumTracksResponse?.rows.length ?? 0)} of ${formatNumber(selectedAlbumTrackCount)} tracks`}
                </p>
              </div>
              <span className="run-status">{selectedAlbum?.year ?? "Album"}</span>
            </div>

            {albumTracksError ? <p className="error-message">{albumTracksError}</p> : null}
            <AlbumTrackTable response={albumTracksResponse} isLoading={isAlbumTracksLoading} />
          </section>
        </section>
      ) : activeSection === "Statistics" ? (
        <section className="workspace statistics-workspace">
          <header className="topbar">
            <div>
              <h1>Statistics</h1>
              <p>Library totals, rating progress, import deltas, and rating history.</p>
            </div>
            <div className="topbar-actions">
              <button
                className="icon-button"
                type="button"
                aria-label="Refresh statistics"
                onClick={() => void refreshStatistics()}
              >
                <RotateCcw size={18} />
              </button>
            </div>
          </header>

          <section className="metric-grid" aria-label="Statistics summary">
            <Metric
              label="Tracks"
              value={formatNumber(statistics?.overview.trackCount ?? status?.trackCount)}
              tone="teal"
              icon={ListMusic}
            />
            <Metric
              label="Albums"
              value={formatNumber(statistics?.overview.albumCount ?? status?.albumCount)}
              tone="amber"
              icon={Album}
            />
            <Metric label="Artists" value={formatNumber(statistics?.overview.albumArtistCount)} icon={UsersRound} />
            <Metric label="Duration" value={formatHours(statistics?.overview.totalSeconds)} icon={Clock3} />
          </section>

          {statsError ? <p className="error-message">{statsError}</p> : null}

          <section className="stats-dashboard-grid" aria-label="Statistics dashboards">
            <section className="stats-panel rating-progress-panel">
              <div className="panel-heading compact">
                <div>
                  <h2>Rating progress</h2>
                  <p>{isStatsLoading ? "Refreshing" : formatPercent(statistics?.ratingProgress.averageRatingCompleteness)}</p>
                </div>
                <Gauge size={18} />
              </div>

              {statistics ? (
                <div className="meter-stack">
                  <Meter
                    label="Fully rated albums"
                    value={statistics.ratingProgress.fullyRatedAlbums}
                    total={ratingAlbumTotal}
                    detail={`${percentOf(statistics.ratingProgress.fullyRatedAlbums, ratingAlbumTotal).toFixed(1)}%`}
                  />
                  <Meter
                    label="Partially rated albums"
                    value={statistics.ratingProgress.partiallyRatedAlbums}
                    total={ratingAlbumTotal}
                    detail={`${percentOf(statistics.ratingProgress.partiallyRatedAlbums, ratingAlbumTotal).toFixed(1)}%`}
                  />
                  <Meter
                    label="Rated tracks"
                    value={statistics.ratingProgress.ratedTracks}
                    total={ratingTrackTotal}
                    detail={`${percentOf(statistics.ratingProgress.ratedTracks, ratingTrackTotal).toFixed(1)}%`}
                  />
                </div>
              ) : (
                <div className="empty-state">
                  <Activity size={20} />
                  <span>No statistics loaded.</span>
                </div>
              )}
            </section>

            <section className="stats-panel loved-panel">
              <div className="panel-heading compact">
                <div>
                  <h2>Loved tracks</h2>
                  <p>{statistics?.lovedTracks.topLovedGenre ?? "Waiting for library data"}</p>
                </div>
                <Heart size={18} />
              </div>
              <div className="stat-pairs">
                <div>
                  <span>Loved tracks</span>
                  <strong>{formatNumber(statistics?.lovedTracks.lovedTracks)}</strong>
                </div>
                <div>
                  <span>Albums with love</span>
                  <strong>{formatNumber(statistics?.lovedTracks.albumsWithLovedTracks)}</strong>
                </div>
                <div>
                  <span>Average per album</span>
                  <strong>{formatAverage(statistics?.lovedTracks.averageLovedTracksPerAlbum, 2)}</strong>
                </div>
                <div>
                  <span>Top year</span>
                  <strong>{statistics?.lovedTracks.topLovedYear ?? ""}</strong>
                </div>
              </div>
            </section>

            <section className="stats-panel wide">
              <div className="panel-heading compact">
                <div>
                  <h2>Year progress</h2>
                  <p>{formatNumber(statistics?.overview.yearCount)} years with albums</p>
                </div>
                <Clock3 size={18} />
              </div>
              <YearProgressTable rows={statistics?.yearProgress ?? []} />
            </section>

            <section className="stats-panel wide">
              <div className="panel-heading compact">
                <div>
                  <h2>Genre progress</h2>
                  <p>{formatNumber(statistics?.overview.genreCount)} canonical genres</p>
                </div>
                <Tags size={18} />
              </div>
              <GenreProgressTable rows={statistics?.genreProgress ?? []} />
            </section>

            <section className="stats-panel">
              <div className="panel-heading compact">
                <div>
                  <h2>Track ratings</h2>
                  <p>{formatNumber(statistics?.ratingProgress.ratedTracks)} rated tracks</p>
                </div>
                <ListMusic size={18} />
              </div>
              <DistributionBars buckets={statistics?.trackRatingDistribution ?? []} />
            </section>

            <section className="stats-panel">
              <div className="panel-heading compact">
                <div>
                  <h2>Album ratings</h2>
                  <p>{formatNumber(statistics?.ratingProgress.albumsWithEffectiveRating)} scored albums</p>
                </div>
                <Album size={18} />
              </div>
              <DistributionBars buckets={statistics?.albumRatingDistribution ?? []} />
            </section>

            <section className="stats-panel wide">
              <div className="panel-heading compact">
                <div>
                  <h2>Import history</h2>
                  <p>Track and album deltas recorded during imports.</p>
                </div>
                <FolderInput size={18} />
              </div>
              <div className="stats-table import-stats-table" role="table">
                <div className="stats-table-head" role="row">
                  <span role="columnheader">Status</span>
                  <span role="columnheader">Completed</span>
                  <span role="columnheader">Tracks</span>
                  <span role="columnheader">Track delta</span>
                  <span role="columnheader">Albums</span>
                  <span role="columnheader">Album delta</span>
                </div>
                {(statistics?.importHistory ?? []).length === 0 ? (
                  <div className="empty-state">
                    <FileSearch size={20} />
                    <span>No imports yet.</span>
                  </div>
                ) : (
                  statistics?.importHistory.map((run) => (
                    <div className="stats-table-row" role="row" key={run.id}>
                      <span role="cell">
                        <RunStatus status={run.status} />
                      </span>
                      <span role="cell">{formatDate(run.completedAt)}</span>
                      <span role="cell">{formatNumber(run.trackRows)}</span>
                      <span role="cell">
                        +{formatNumber(run.addedTracks)} / ~{formatNumber(run.changedTracks)} / -
                        {formatNumber(run.removedTracks)}
                      </span>
                      <span role="cell">{formatNumber(run.albumCount)}</span>
                      <span role="cell">
                        +{formatNumber(run.addedAlbums)} / ~{formatNumber(run.changedAlbums)} / -
                        {formatNumber(run.removedAlbums)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="stats-panel wide">
              <div className="panel-heading compact">
                <div>
                  <h2>Rating history</h2>
                  <p>{formatNumber(statistics?.recentRatingEvents.length)} recent rating events</p>
                </div>
                <Activity size={18} />
              </div>
              <div className="rating-history-strip">
                {(statistics?.ratingHistory ?? []).slice(-8).map((point) => (
                  <article className="history-point" key={point.importRunId}>
                    <span>{formatDate(point.createdAt)}</span>
                    <strong>{formatPercent(point.ratedTracks / Math.max(1, point.trackCount))}</strong>
                    <small>{formatNumber(point.ratingEventsCount)} events</small>
                  </article>
                ))}
              </div>
              <RatingEventList events={statistics?.recentRatingEvents ?? []} />
            </section>
          </section>
        </section>
      ) : activeSection === "Settings" ? (
        <section className="workspace settings-workspace">
          <header className="topbar">
            <div>
              <h1>Settings</h1>
              <p>Backup retention and app appearance.</p>
            </div>
            <button className="icon-button" type="button" aria-label="Reload settings" onClick={() => void loadData()}>
              <RotateCcw size={18} />
            </button>
          </header>

          <section className="metric-grid" aria-label="Settings summary">
            <Metric
              label="Rolling backups"
              value={formatNumber(settings.backupRetention)}
              tone="teal"
              icon={Database}
            />
            <Metric label="Theme" value={settings.darkMode ? "Dark" : "Light"} tone="amber" icon={Moon} />
            <Metric label="Settings" value={isSavingSettings ? "Saving" : "Saved"} icon={Save} />
            <Metric label="Runtime" value={canImport ? "Desktop" : "Preview"} icon={Settings} />
          </section>

          {settingsError ? <p className="error-message">{settingsError}</p> : null}

          <section className="settings-grid" aria-label="Application settings">
            <section className="settings-panel">
              <div className="panel-heading compact">
                <div>
                  <h2>Backups</h2>
                  <p>{settings.backupRetention} retained after each import</p>
                </div>
                <Database size={18} />
              </div>

              <label className="criterion setting-number">
                <span>Rolling backups</span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={settings.backupRetention}
                  onChange={(event) =>
                    void saveAppSettings({
                      backupRetention: clampBackupRetention(numberValue(event.target.value)),
                    })
                  }
                />
              </label>
            </section>

            <section className="settings-panel">
              <div className="panel-heading compact">
                <div>
                  <h2>Appearance</h2>
                  <p>{settings.darkMode ? "Dark mode" : "Light mode"}</p>
                </div>
                <Moon size={18} />
              </div>

              <label className="setting-toggle">
                <input
                  type="checkbox"
                  aria-label="Dark mode"
                  checked={settings.darkMode}
                  onChange={(event) => void saveAppSettings({ darkMode: event.target.checked })}
                />
                <span>
                  <strong>Dark mode</strong>
                  <small>{settings.darkMode ? "On" : "Off"}</small>
                </span>
              </label>
            </section>
          </section>
        </section>
      ) : (
        <section className="workspace search-workspace">
          <header className="topbar">
            <div>
              <h1>Search</h1>
              <p>Album and track browsing over the imported MusicBee library.</p>
            </div>
            <div className="topbar-actions">
              <button className="icon-button" type="button" aria-label="Clear query" onClick={clearQuery}>
                <RotateCcw size={18} />
              </button>
              <button className="icon-button" type="button" aria-label="Refresh" onClick={() => void loadData()}>
                <Database size={18} />
              </button>
            </div>
          </header>

          <section className="metric-grid" aria-label="Library summary">
            <Metric label="Tracks" value={formatNumber(status?.trackCount)} tone="teal" icon={ListMusic} />
            <Metric label="Albums" value={formatNumber(status?.albumCount)} tone="amber" icon={Album} />
            <Metric label="Matches" value={formatNumber(total)} icon={Search} />
            <Metric label="Saved" value={formatNumber(savedSearches.length)} icon={Save} />
          </section>

          <section className="query-panel">
            <div className="search-row">
              <div className="search-input">
                <Search size={18} />
                <input
                  value={request.searchText}
                  onChange={(event) =>
                    setRequest((previous) => ({ ...previous, searchText: event.target.value, offset: 0 }))
                  }
                  placeholder="Search albums, artists, genres, tracks, publishers, files"
                />
              </div>

              <div className="segmented-control" aria-label="Browse view">
                <button
                  className={request.view === "albums" ? "active" : ""}
                  type="button"
                  onClick={() => setView("albums")}
                >
                  <Album size={16} />
                  <span>Albums</span>
                </button>
                <button
                  className={request.view === "tracks" ? "active" : ""}
                  type="button"
                  onClick={() => setView("tracks")}
                >
                  <ListMusic size={16} />
                  <span>Tracks</span>
                </button>
              </div>
            </div>

            <div className="filter-grid">
              <TextCriterion
                label="Album title"
                filter={currentFilters.albumTitle}
                onChange={(filter) => updateFilter("albumTitle", filter)}
              />
              <TextCriterion
                label="Track title"
                filter={currentFilters.trackTitle}
                onChange={(filter) => updateFilter("trackTitle", filter)}
              />
              <TextCriterion
                label="Album artist"
                filter={currentFilters.albumArtist}
                onChange={(filter) => updateFilter("albumArtist", filter)}
              />
              <TextCriterion
                label="Display artist"
                filter={currentFilters.displayArtist}
                onChange={(filter) => updateFilter("displayArtist", filter)}
              />

              <GenreListCriterion
                label="Genres"
                values={currentFilters.genres}
                onChange={(genres) => updateFilter("genres", genres)}
                genreOptions={genreSuggestionOptions}
                onRequestOptions={requestGenreSuggestionRefresh}
                placeholder="Synthpop, AOR"
              />
              <GenreListCriterion
                label="Exclude genres"
                values={currentFilters.excludedGenres}
                onChange={(excludedGenres) => updateFilter("excludedGenres", excludedGenres)}
                genreOptions={genreSuggestionOptions}
                onRequestOptions={requestGenreSuggestionRefresh}
              />
              <TextCriterion
                label="Publisher"
                filter={currentFilters.publisher}
                onChange={(filter) => updateFilter("publisher", filter)}
              />
              <label className="criterion">
                <span>Track text</span>
                <input
                  value={currentFilters.hasTrackText}
                  onChange={(event) => updateFilter("hasTrackText", event.target.value)}
                />
              </label>

              <NumberField label="Year from" value={currentFilters.yearFrom} onChange={(value) => updateFilter("yearFrom", value)} />
              <NumberField label="Year to" value={currentFilters.yearTo} onChange={(value) => updateFilter("yearTo", value)} />
              <NumberField
                label="Release from"
                value={currentFilters.releaseYearFrom}
                onChange={(value) => updateFilter("releaseYearFrom", value)}
              />
              <NumberField
                label="Release to"
                value={currentFilters.releaseYearTo}
                onChange={(value) => updateFilter("releaseYearTo", value)}
              />

              <NumberField
                label="Minutes min"
                value={currentFilters.totalMinutesMin}
                step={0.5}
                onChange={(value) => updateFilter("totalMinutesMin", value)}
              />
              <NumberField
                label="Minutes max"
                value={currentFilters.totalMinutesMax}
                step={0.5}
                onChange={(value) => updateFilter("totalMinutesMax", value)}
              />
              <NumberField
                label="Tracks min"
                value={currentFilters.trackCountMin}
                onChange={(value) => updateFilter("trackCountMin", value)}
              />
              <NumberField
                label="Tracks max"
                value={currentFilters.trackCountMax}
                onChange={(value) => updateFilter("trackCountMax", value)}
              />

              <NumberField
                label="Album rating min"
                value={currentFilters.albumRatingMin}
                min={0}
                max={100}
                onChange={(value) => updateFilter("albumRatingMin", value)}
              />
              <NumberField
                label="Album rating max"
                value={currentFilters.albumRatingMax}
                min={0}
                max={100}
                onChange={(value) => updateFilter("albumRatingMax", value)}
              />
              <NumberField
                label="Track rating min"
                value={currentFilters.trackRatingMin}
                min={0}
                max={5}
                onChange={(value) => updateFilter("trackRatingMin", value)}
              />
              <NumberField
                label="Track rating max"
                value={currentFilters.trackRatingMax}
                min={0}
                max={5}
                onChange={(value) => updateFilter("trackRatingMax", value)}
              />

              <label className="criterion slider-criterion">
                <span>Completeness</span>
                <div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={currentFilters.ratingCompletenessMin ?? 0}
                    onChange={(event) => updateFilter("ratingCompletenessMin", Number(event.target.value))}
                  />
                  <strong>{currentFilters.ratingCompletenessMin ?? 0}%</strong>
                </div>
              </label>
              <NumberField
                label="Loved min"
                value={currentFilters.lovedTracksMin}
                min={0}
                onChange={(value) => updateFilter("lovedTracksMin", value)}
              />
              <TextCriterion
                label="File path"
                filter={currentFilters.filePath}
                onChange={(filter) => updateFilter("filePath", filter)}
              />
              <TextCriterion
                label="Filename"
                filter={currentFilters.filename}
                onChange={(filter) => updateFilter("filename", filter)}
              />
            </div>

            <div className="query-footer">
              <div className="missing-flags" aria-label="Missing metadata">
                <span className="missing-flags-title">Missing fields</span>
                {missingFieldOptions.map((option) => {
                  const checked = currentFilters.missingFields.includes(option.value);
                  const label = missingFieldLabel(option.value, request.view);
                  return (
                    <label key={option.value}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          const nextValues = event.target.checked
                            ? [...currentFilters.missingFields, option.value]
                            : currentFilters.missingFields.filter((value) => value !== option.value);
                          updateFilter("missingFields", nextValues);
                        }}
                      />
                      <span>{label}</span>
                    </label>
                  );
                })}
              </div>

              <div className="sort-controls">
                <SelectField
                  label="Sort"
                  value={request.sort.field}
                  onChange={(field) =>
                    setRequest((previous) => ({ ...previous, sort: { ...previous.sort, field }, offset: 0 }))
                  }
                  options={
                    request.view === "tracks"
                      ? [
                          { value: "title", label: "Title" },
                          { value: "album", label: "Album" },
                          { value: "displayArtist", label: "Display artist" },
                          { value: "year", label: "Year" },
                          { value: "trackRating", label: "Track rating" },
                          { value: "trackNumber", label: "Track number" },
                        ]
                      : [
                          { value: "album", label: "Album" },
                          { value: "artist", label: "Artist" },
                          { value: "year", label: "Year" },
                          { value: "genre", label: "Genre" },
                          { value: "totalMinutes", label: "Minutes" },
                          { value: "trackCount", label: "Tracks" },
                          { value: "albumRating", label: "Rating" },
                          { value: "ratingCompleteness", label: "Completeness" },
                          { value: "lovedTracks", label: "Loved" },
                          { value: "albumScore", label: "Score" },
                        ]
                  }
                />
                <SelectField
                  label="Direction"
                  value={request.sort.direction}
                  onChange={(direction) =>
                    setRequest((previous) => ({
                      ...previous,
                      sort: { ...previous.sort, direction: direction as "asc" | "desc" },
                      offset: 0,
                    }))
                  }
                  options={[
                    { value: "asc", label: "Ascending" },
                    { value: "desc", label: "Descending" },
                  ]}
                />
                <NumberField
                  label="Rows"
                  value={request.limit}
                  min={10}
                  max={500}
                  onChange={(value) =>
                    setRequest((previous) => ({ ...previous, limit: value ?? 50, offset: 0 }))
                  }
                />
              </div>
            </div>

            <div className="chip-row" aria-label="Active filters">
              {chips.length === 0 ? (
                <span className="chip-empty">No active filters</span>
              ) : (
                chips.map((chip) => (
                  <button className="filter-chip" type="button" key={chip.key} onClick={chip.remove}>
                    <span>{chip.label}</span>
                    <X size={14} />
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="table-panel" aria-label="Search results">
            <div className="panel-heading compact">
              <div>
                <h2>{request.view === "albums" ? "Album table" : "Track table"}</h2>
                <p>
                  {isSearching ? "Searching" : `${formatNumber(pageStart)}-${formatNumber(pageEnd)} of ${formatNumber(total)}`}
                </p>
              </div>
              <div className="pager">
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Previous page"
                  disabled={request.offset === 0}
                  onClick={() =>
                    setRequest((previous) => ({
                      ...previous,
                      offset: Math.max(0, previous.offset - previous.limit),
                    }))
                  }
                >
                  <ChevronLeft size={17} />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Next page"
                  disabled={request.offset + request.limit >= total}
                  onClick={() =>
                    setRequest((previous) => ({
                      ...previous,
                      offset: previous.offset + previous.limit,
                    }))
                  }
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>

            {browseError ? <p className="error-message">{browseError}</p> : null}
            <ResultTable response={response} sort={request.sort} onSort={sortSearchBy} />
          </section>
        </section>
      )}

      {activeSection === "Imports" ? (
        <aside className="detail-panel" aria-label="Selected import details">
          <div className="detail-header">
            <Sparkles size={20} />
            <div>
              <h2>Calculation Summary</h2>
              <p>Phase 1 album fields</p>
            </div>
          </div>

          <div className="calculation-list">
            <div>
              <Gauge size={17} />
              <span>Rating completeness</span>
            </div>
            <div>
              <Heart size={17} />
              <span>Loved tracks</span>
            </div>
            <div>
              <Clock3 size={17} />
              <span>TMOE and AE</span>
            </div>
            <div>
              <BarChart3 size={17} />
              <span>Album Score</span>
            </div>
          </div>

          <dl className="run-details">
            <div>
              <dt>Source size</dt>
              <dd>{lastRun ? formatBytes(lastRun.sourceSizeBytes) : "Waiting for first import"}</dd>
            </div>
            <div>
              <dt>Completed</dt>
              <dd>{lastRun ? formatDate(lastRun.completedAt) : "Not yet"}</dd>
            </div>
            <div>
              <dt>Backup</dt>
              <dd>{lastRun?.backupPath ?? "Created before import replacement"}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{lastRun?.sourcePath ?? sourcePath}</dd>
            </div>
          </dl>
        </aside>
      ) : activeSection === "Charts" ? (
        <aside className="detail-panel chart-detail" aria-label="Chart actions">
          <div className="detail-header">
            <BarChart3 size={20} />
            <div>
              <h2>Chart Library</h2>
              <p>Saved chart configs and exports</p>
            </div>
          </div>

          <section className="save-search-box">
            <label className="source-input">
              <span>Name</span>
              <input value={chartName} onChange={(event) => setChartName(event.target.value)} />
            </label>
            <button className="primary-button" type="button" onClick={() => void saveCurrentChart()}>
              <Save size={17} />
              <span>Save chart</span>
            </button>
          </section>

          <section className="saved-list" aria-label="Saved charts">
            {savedCharts.length === 0 ? (
              <div className="empty-state">
                <BarChart3 size={20} />
                <span>No saved charts.</span>
              </div>
            ) : (
              savedCharts.map((chart) => (
                <div className="saved-search" key={chart.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setChartConfig({
                        ...chart.config,
                        gridCoverSize: normalizeChartGridCoverSize(chart.config.gridCoverSize),
                      });
                      setChartTableSort(null);
                      setActiveSection("Charts");
                    }}
                  >
                    <strong>{chart.name}</strong>
                    <span>
                      {rankingLabel(chart.config.rankingMetric)} / {chart.config.viewMode}
                    </span>
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={`Delete ${chart.name}`}
                    onClick={() => void removeSavedChart(chart.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            )}
          </section>

          <section className="export-box">
            <div className="export-grid">
              {["csv", "tsv", "xlsx", "json", "txt"].map((format) => (
                <button type="button" key={format} onClick={() => void runChartExport(format)}>
                  <Download size={16} />
                  <span>{format.toUpperCase()}</span>
                </button>
              ))}
            </div>
            {chartExportResult ? (
              <div className="export-result">
                <Check size={17} />
                <span>
                  {formatNumber(chartExportResult.rowCount)} rows to {chartExportResult.path}
                </span>
              </div>
            ) : null}
          </section>
        </aside>
      ) : activeSection === "Artists" ? (
        <ArtistDetailPanel
          artist={selectedArtist}
          includeCalculated={artistIncludeCalculated}
          onIncludeCalculatedChange={(value) => setArtistIncludeCalculated(value)}
          exportResult={artistExportResult}
          onExport={runArtistExport}
        />
      ) : activeSection === "Genres" ? (
        <GenreDetailPanel
          genre={selectedGenre}
          includeCalculated={genreIncludeCalculated}
          onIncludeCalculatedChange={(value) => setGenreIncludeCalculated(value)}
          exportResult={genreExportResult}
          onExport={runGenreExport}
        />
      ) : activeSection === "Tools" ? (
        <MusicToolDetailPanel
          tool={selectedTool}
          progress={activeToolProgress}
          exportResult={toolExportResult}
          onExport={runToolExport}
        />
      ) : activeSection === "Albums" ? (
        <AlbumDetailPanel
          album={selectedAlbum}
          tracks={albumTracksResponse}
          isLoading={isAlbumTracksLoading}
          includeCalculated={albumIncludeCalculated}
          onIncludeCalculatedChange={(value) => setAlbumIncludeCalculated(value)}
          exportResult={albumExportResult}
          onExport={runAlbumExport}
        />
      ) : activeSection === "Statistics" ? (
        <aside className="detail-panel statistics-detail" aria-label="Statistics details">
          <div className="detail-header">
            <Activity size={20} />
            <div>
              <h2>Library Signals</h2>
              <p>{statistics?.lastUpdated ? formatDate(statistics.lastUpdated) : "No import yet"}</p>
            </div>
          </div>

          <dl className="run-details">
            <div>
              <dt>Average album rating</dt>
              <dd>{formatAverage(statistics?.ratingProgress.averageAlbumRating, 1)}</dd>
            </div>
            <div>
              <dt>Average album score</dt>
              <dd>{formatAverage(statistics?.overview.averageAlbumScore, 2)}</dd>
            </div>
            <div>
              <dt>Unrated albums</dt>
              <dd>{formatNumber(statistics?.ratingProgress.unratedAlbums)}</dd>
            </div>
            <div>
              <dt>Top loved genre</dt>
              <dd>{statistics?.lovedTracks.topLovedGenre ?? "Not yet"}</dd>
            </div>
          </dl>

          <section className="calculation-list statistics-signals">
            <div>
              <Album size={17} />
              <span>{formatNumber(statistics?.ratingProgress.fullyRatedAlbums)} fully rated albums</span>
            </div>
            <div>
              <Gauge size={17} />
              <span>{formatNumber(statistics?.ratingProgress.partiallyRatedAlbums)} partial albums</span>
            </div>
            <div>
              <Heart size={17} />
              <span>{formatNumber(statistics?.lovedTracks.lovedTracks)} loved tracks</span>
            </div>
            <div>
              <FolderInput size={17} />
              <span>{formatNumber(statistics?.importHistory.length)} import runs</span>
            </div>
          </section>

          <section className="saved-list" aria-label="Recent rating events">
            <div className="detail-header small">
              <Sparkles size={18} />
              <div>
                <h2>Recent Events</h2>
                <p>Rating changes from imports</p>
              </div>
            </div>
            <RatingEventList events={statistics?.recentRatingEvents ?? []} />
          </section>
        </aside>
      ) : activeSection === "Settings" ? (
        <aside className="detail-panel settings-detail" aria-label="Settings details">
          <div className="detail-header">
            <Settings size={20} />
            <div>
              <h2>Preferences</h2>
              <p>{settings.updatedAt ? formatDate(settings.updatedAt) : "Default settings"}</p>
            </div>
          </div>

          <dl className="run-details">
            <div>
              <dt>Rolling backups</dt>
              <dd>{formatNumber(settings.backupRetention)}</dd>
            </div>
            <div>
              <dt>Theme</dt>
              <dd>{settings.darkMode ? "Dark" : "Light"}</dd>
            </div>
            <div>
              <dt>Runtime</dt>
              <dd>{canImport ? "Tauri desktop" : "Web preview"}</dd>
            </div>
          </dl>

          <section className="calculation-list settings-signals">
            <div>
              <ShieldCheck size={17} />
              <span>Backups pruned after import</span>
            </div>
            <div>
              <Moon size={17} />
              <span>{settings.darkMode ? "Dark mode active" : "Light mode active"}</span>
            </div>
          </section>
        </aside>
      ) : (
        <aside className="detail-panel search-detail" aria-label="Search actions">
          <div className="detail-header">
            <SlidersHorizontal size={20} />
            <div>
              <h2>Views</h2>
              <p>Saved searches and exports</p>
            </div>
          </div>

          <section className="save-search-box">
            <label className="source-input">
              <span>Name</span>
              <input value={saveName} onChange={(event) => setSaveName(event.target.value)} />
            </label>
            <button className="primary-button" type="button" onClick={() => void saveCurrentSearch()}>
              <Save size={17} />
              <span>Save search</span>
            </button>
          </section>

          <section className="saved-list" aria-label="Saved searches">
            {savedSearches.length === 0 ? (
              <div className="empty-state">
                <FileSearch size={20} />
                <span>No saved searches.</span>
              </div>
            ) : (
              savedSearches.map((search) => (
                <div className="saved-search" key={search.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setRequest(search.request);
                      setActiveSection("Search");
                    }}
                  >
                    <strong>{search.name}</strong>
                    <span>{search.view}</span>
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={`Delete ${search.name}`}
                    onClick={() => void removeSavedSearch(search.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            )}
          </section>

          <section className="export-box">
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={includeCalculated}
                onChange={(event) => setIncludeCalculated(event.target.checked)}
              />
              <span>Calculated columns</span>
            </label>
            <div className="export-grid">
              {["csv", "tsv", "xlsx", "json", "txt"].map((format) => (
                <button type="button" key={format} onClick={() => void runExport(format)}>
                  <Download size={16} />
                  <span>{format.toUpperCase()}</span>
                </button>
              ))}
            </div>
            {exportResult ? (
              <div className="export-result">
                <Check size={17} />
                <span>
                  {formatNumber(exportResult.rowCount)} rows to {exportResult.path}
                </span>
              </div>
            ) : null}
          </section>
        </aside>
      )}
    </main>
  );
}

function addRangeChip(
  chips: { key: string; label: string; remove: () => void }[],
  key: string,
  label: string,
  minimum: number | null,
  maximum: number | null,
  remove: () => void,
) {
  if (minimum == null && maximum == null) return;
  const text =
    minimum != null && maximum != null
      ? `${label} ${minimum}-${maximum}`
      : minimum != null
        ? `${label} >= ${minimum}`
        : `${label} <= ${maximum}`;
  chips.push({ key, label: text, remove });
}
