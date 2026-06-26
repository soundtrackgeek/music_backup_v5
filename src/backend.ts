import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AppSettings,
  ArtistListRequest,
  ArtistListResponse,
  ArtistSummary,
  BrowseRequest,
  BrowseResponse,
  BrowseRow,
  ExportResult,
  ImportProgress,
  ImportRun,
  ImportSummary,
  LibraryStatus,
  SavedChart,
  SavedSearch,
  ChartConfig,
  StatisticsResponse,
  GenreListRequest,
  GenreListResponse,
  GenreSummary,
  MusicToolIssueRequest,
  MusicToolIssueResponse,
  MusicToolIssueRow,
  MusicToolSummary,
} from "./types";

export const settingsStorageKey = "musicLibrarySettings:v1";

const mockStatus: LibraryStatus = {
  dbPath: "Tauri desktop runtime required for SQLite access",
  hasDatabase: true,
  trackCount: 1130882,
  albumCount: 76789,
  importRunCount: 0,
  lastImport: null,
};

const mockRows: BrowseRow[] = [
  {
    id: "mb:mock-1",
    trackId: null,
    albumId: "mb:mock-1",
    album: "Actually",
    albumArtistDisplay: "Pet Shop Boys",
    displayArtist: null,
    title: null,
    canonicalGenre: "Synthpop",
    publisher: "Parlophone",
    year: 1987,
    releaseYear: 1987,
    totalTracks: 10,
    ratedTracks: 10,
    ratingCompleteness: 1,
    totalSeconds: 2880,
    lovedTracks: 2,
    tmoeSeconds: 840,
    aeRatio: 0.2916,
    effectiveAlbumRating: 86,
    albumScore: 207.62,
    trackSeconds: null,
    normalizedRating: null,
    discNumber: null,
    trackNumber: null,
    love: null,
    filePath: null,
    filename: null,
  },
  {
    id: "mb:mock-2",
    trackId: null,
    albumId: "mb:mock-2",
    album: "The Queen Is Dead",
    albumArtistDisplay: "The Smiths",
    displayArtist: null,
    title: null,
    canonicalGenre: "Post-Punk",
    publisher: "Rough Trade",
    year: 1986,
    releaseYear: 1986,
    totalTracks: 10,
    ratedTracks: 10,
    ratingCompleteness: 1,
    totalSeconds: 2220,
    lovedTracks: 1,
    tmoeSeconds: 600,
    aeRatio: 0.2702,
    effectiveAlbumRating: 88,
    albumScore: 108.4,
    trackSeconds: null,
    normalizedRating: null,
    discNumber: null,
    trackNumber: null,
    love: null,
    filePath: null,
    filename: null,
  },
  {
    id: "track:mock-1",
    trackId: 1,
    albumId: "mb:mock-1",
    album: "Actually",
    albumArtistDisplay: "Pet Shop Boys",
    displayArtist: "Pet Shop Boys",
    title: "What Have I Done to Deserve This?",
    canonicalGenre: "Synthpop",
    publisher: "Parlophone",
    year: 1987,
    releaseYear: 1987,
    totalTracks: 10,
    ratedTracks: 10,
    ratingCompleteness: 1,
    totalSeconds: 2880,
    lovedTracks: 2,
    tmoeSeconds: 840,
    aeRatio: 0.2916,
    effectiveAlbumRating: 86,
    albumScore: 207.62,
    trackSeconds: 260,
    normalizedRating: 100,
    discNumber: 1,
    trackNumber: 2,
    love: "L",
    filePath: "D:\\Music\\Pet Shop Boys\\Actually",
    filename: "02 What Have I Done to Deserve This.mp3",
  },
];

const mockArtists: ArtistSummary[] = [
  {
    id: "pet shop boys",
    name: "Pet Shop Boys",
    albumCount: 1,
    ratedAlbumCount: 1,
    partialAlbumCount: 0,
    unratedAlbumCount: 0,
    trackCount: 10,
    totalSeconds: 2880,
    lovedTracks: 2,
    tmoeSeconds: 840,
    averageRatingCompleteness: 1,
    averageAlbumRating: 86,
    averageAlbumScore: 207.62,
    firstYear: 1987,
    lastYear: 1987,
    topGenre: "Synthpop",
  },
  {
    id: "the smiths",
    name: "The Smiths",
    albumCount: 1,
    ratedAlbumCount: 1,
    partialAlbumCount: 0,
    unratedAlbumCount: 0,
    trackCount: 10,
    totalSeconds: 2220,
    lovedTracks: 1,
    tmoeSeconds: 600,
    averageRatingCompleteness: 1,
    averageAlbumRating: 88,
    averageAlbumScore: 108.4,
    firstYear: 1986,
    lastYear: 1986,
    topGenre: "Post-Punk",
  },
];

const mockGenres: GenreSummary[] = [
  {
    id: "synthpop",
    name: "Synthpop",
    albumCount: 1,
    ratedAlbumCount: 1,
    partialAlbumCount: 0,
    unratedAlbumCount: 0,
    trackCount: 10,
    totalSeconds: 2880,
    lovedTracks: 2,
    tmoeSeconds: 840,
    averageRatingCompleteness: 1,
    averageAlbumRating: 86,
    averageAlbumScore: 207.62,
    firstYear: 1987,
    lastYear: 1987,
    topArtist: "Pet Shop Boys",
  },
  {
    id: "post-punk",
    name: "Post-Punk",
    albumCount: 1,
    ratedAlbumCount: 1,
    partialAlbumCount: 0,
    unratedAlbumCount: 0,
    trackCount: 10,
    totalSeconds: 2220,
    lovedTracks: 1,
    tmoeSeconds: 600,
    averageRatingCompleteness: 1,
    averageAlbumRating: 88,
    averageAlbumScore: 108.4,
    firstYear: 1986,
    lastYear: 1986,
    topArtist: "The Smiths",
  },
];

const mockMusicTools: MusicToolSummary[] = [
  {
    id: "duplicate-albums",
    label: "Duplicate albums",
    description: "Potential duplicate album versions with the same artist, title, and year.",
    severity: "medium",
    scope: "albums",
    issueCount: 2,
    albumCount: 2,
    trackCount: 0,
  },
  {
    id: "invalid-time-values",
    label: "Invalid time values",
    description: "Tracks where duration could not be parsed into seconds.",
    severity: "high",
    scope: "tracks",
    issueCount: 1,
    albumCount: 1,
    trackCount: 1,
  },
  {
    id: "genre-normalization-issues",
    label: "Genre normalization issues",
    description: "Tracks with multi-value genre strings that were collapsed to one canonical genre.",
    severity: "low",
    scope: "tracks",
    issueCount: 1,
    albumCount: 1,
    trackCount: 1,
  },
];

const mockMusicToolIssues: MusicToolIssueRow[] = [
  {
    id: "duplicate-albums:mb:mock-1",
    toolId: "duplicate-albums",
    severity: "medium",
    entityType: "albums",
    albumId: "mb:mock-1",
    trackId: null,
    album: "Actually",
    albumArtistDisplay: "Pet Shop Boys",
    title: null,
    canonicalGenre: "Synthpop",
    year: 1987,
    detail: "Potential duplicate album version",
    value: "2 albums share artist/title/year",
    filename: null,
    filePath: null,
  },
  {
    id: "duplicate-albums:mb:mock-1-deluxe",
    toolId: "duplicate-albums",
    severity: "medium",
    entityType: "albums",
    albumId: "mb:mock-1-deluxe",
    trackId: null,
    album: "Actually",
    albumArtistDisplay: "Pet Shop Boys",
    title: null,
    canonicalGenre: "Synthpop",
    year: 1987,
    detail: "Potential duplicate album version",
    value: "2 albums share artist/title/year",
    filename: null,
    filePath: null,
  },
  {
    id: "invalid-time-values:1",
    toolId: "invalid-time-values",
    severity: "high",
    entityType: "tracks",
    albumId: "mb:mock-1",
    trackId: 1,
    album: "Actually",
    albumArtistDisplay: "Pet Shop Boys",
    title: "What Have I Done to Deserve This?",
    canonicalGenre: "Synthpop",
    year: 1987,
    detail: "Missing or invalid track time",
    value: null,
    filename: "02 What Have I Done to Deserve This.mp3",
    filePath: "D:\\Music\\Pet Shop Boys\\Actually",
  },
  {
    id: "genre-normalization-issues:1",
    toolId: "genre-normalization-issues",
    severity: "low",
    entityType: "tracks",
    albumId: "mb:mock-1",
    trackId: 1,
    album: "Actually",
    albumArtistDisplay: "Pet Shop Boys",
    title: "What Have I Done to Deserve This?",
    canonicalGenre: "Synthpop",
    year: 1987,
    detail: "Multiple genre values collapsed to canonical genre",
    value: "Synthpop; Dance-Pop",
    filename: "02 What Have I Done to Deserve This.mp3",
    filePath: "D:\\Music\\Pet Shop Boys\\Actually",
  },
];

let mockSavedSearches: SavedSearch[] = [];
let mockSavedCharts: SavedChart[] = [];
let mockSettings: AppSettings = loadCachedSettings();

const mockImportRun = {
  id: 1,
  sourcePath: "musicbee-library.tsv",
  sourceSizeBytes: 240_000_000,
  startedAt: "2026-06-25T09:00:00Z",
  completedAt: "2026-06-25T09:03:20Z",
  status: "completed",
  trackRows: 1_130_882,
  albumCount: 76_789,
  durationMs: 200_000,
  backupPath: "Preview runtime backup.sqlite3",
  errorMessage: null,
  addedTracks: 1_130_882,
  changedTracks: 0,
  removedTracks: 0,
  addedAlbums: 76_789,
  changedAlbums: 0,
  removedAlbums: 0,
  ratingEventsCount: 2,
};

const mockStatistics: StatisticsResponse = {
  overview: {
    trackCount: 1_130_882,
    albumCount: 76_789,
    albumArtistCount: 24_812,
    genreCount: 318,
    yearCount: 86,
    totalSeconds: 226_176_400,
    averageAlbumScore: 104.72,
  },
  ratingProgress: {
    fullyRatedAlbums: 18_420,
    partiallyRatedAlbums: 9_380,
    unratedAlbums: 48_989,
    albumsWithEffectiveRating: 27_800,
    ratedTracks: 412_580,
    unratedTracks: 718_302,
    averageRatingCompleteness: 0.37,
    averageAlbumRating: 74.4,
  },
  yearProgress: [
    {
      year: 1987,
      albumCount: 1250,
      ratedAlbumCount: 420,
      partialAlbumCount: 180,
      unratedAlbumCount: 650,
      trackCount: 14_620,
      totalSeconds: 2_915_600,
      lovedTracks: 332,
      averageAlbumScore: 113.42,
    },
    {
      year: 1986,
      albumCount: 1184,
      ratedAlbumCount: 388,
      partialAlbumCount: 162,
      unratedAlbumCount: 634,
      trackCount: 13_940,
      totalSeconds: 2_760_000,
      lovedTracks: 301,
      averageAlbumScore: 109.18,
    },
    {
      year: 1985,
      albumCount: 1168,
      ratedAlbumCount: 364,
      partialAlbumCount: 170,
      unratedAlbumCount: 634,
      trackCount: 13_804,
      totalSeconds: 2_714_000,
      lovedTracks: 286,
      averageAlbumScore: 108.31,
    },
  ],
  genreProgress: [
    {
      genre: "Synthpop",
      albumCount: 1840,
      ratedAlbumCount: 682,
      partialAlbumCount: 230,
      unratedAlbumCount: 928,
      trackCount: 21_440,
      totalSeconds: 4_102_000,
      lovedTracks: 720,
      averageAlbumScore: 128.42,
    },
    {
      genre: "Post-Punk",
      albumCount: 1390,
      ratedAlbumCount: 508,
      partialAlbumCount: 211,
      unratedAlbumCount: 671,
      trackCount: 15_890,
      totalSeconds: 3_006_000,
      lovedTracks: 488,
      averageAlbumScore: 119.08,
    },
    {
      genre: "Hard Rock",
      albumCount: 1320,
      ratedAlbumCount: 412,
      partialAlbumCount: 196,
      unratedAlbumCount: 712,
      trackCount: 14_820,
      totalSeconds: 3_230_000,
      lovedTracks: 350,
      averageAlbumScore: 101.68,
    },
  ],
  trackRatingDistribution: [
    { label: "5", count: 74_620 },
    { label: "4", count: 146_300 },
    { label: "3", count: 112_400 },
    { label: "2", count: 42_180 },
    { label: "1", count: 18_720 },
    { label: "0", count: 18_360 },
  ],
  albumRatingDistribution: [
    { label: "90-99", count: 2600 },
    { label: "80-89", count: 6400 },
    { label: "70-79", count: 8700 },
    { label: "60-69", count: 5200 },
    { label: "50-59", count: 3100 },
    { label: "40-49", count: 1800 },
  ],
  lovedTracks: {
    lovedTracks: 14_280,
    albumsWithLovedTracks: 8_640,
    averageLovedTracksPerAlbum: 1.65,
    topLovedGenre: "Synthpop",
    topLovedYear: 1987,
  },
  importHistory: [mockImportRun],
  ratingHistory: [
    {
      importRunId: 1,
      createdAt: "2026-06-25T09:03:20Z",
      trackCount: 1_130_882,
      albumCount: 76_789,
      ratedTracks: 412_580,
      unratedTracks: 718_302,
      fullyRatedAlbums: 18_420,
      partiallyRatedAlbums: 9_380,
      unratedAlbums: 48_989,
      albumsWithEffectiveRating: 27_800,
      averageAlbumRating: 74.4,
      averageAlbumScore: 104.72,
      ratingEventsCount: 2,
    },
  ],
  recentRatingEvents: [
    {
      id: 1,
      importRunId: 1,
      createdAt: "2026-06-25T09:03:20Z",
      eventType: "addedRated",
      albumId: "mb:mock-1",
      album: "Actually",
      albumArtistDisplay: "Pet Shop Boys",
      year: 1987,
      previousRatedTracks: null,
      currentRatedTracks: 10,
      previousRatingCompleteness: null,
      currentRatingCompleteness: 1,
      previousEffectiveAlbumRating: null,
      currentEffectiveAlbumRating: 86,
    },
    {
      id: 2,
      importRunId: 1,
      createdAt: "2026-06-25T09:03:20Z",
      eventType: "addedRated",
      albumId: "mb:mock-2",
      album: "The Queen Is Dead",
      albumArtistDisplay: "The Smiths",
      year: 1986,
      previousRatedTracks: null,
      currentRatedTracks: 10,
      previousRatingCompleteness: null,
      currentRatingCompleteness: 1,
      previousEffectiveAlbumRating: null,
      currentEffectiveAlbumRating: 88,
    },
  ],
  lastUpdated: "2026-06-25T09:03:20Z",
};

export function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function getLibraryStatus() {
  if (!isTauriRuntime()) {
    return mockStatus;
  }

  return invoke<LibraryStatus>("get_library_status");
}

export async function listImportRuns(limit: number) {
  if (!isTauriRuntime()) {
    return [mockImportRun].slice(0, limit) satisfies ImportRun[];
  }

  return invoke<ImportRun[]>("list_import_runs", { limit });
}

export async function getStatistics() {
  if (!isTauriRuntime()) {
    return mockStatistics;
  }

  return invoke<StatisticsResponse>("get_statistics");
}

export async function getSettings() {
  if (!isTauriRuntime()) {
    return mockSettings;
  }

  const settings = await invoke<AppSettings>("get_settings");
  cacheSettings(settings);
  return settings;
}

export async function saveSettings(settings: AppSettings) {
  if (!isTauriRuntime()) {
    mockSettings = {
      ...normalizeSettings(settings),
      updatedAt: new Date().toISOString(),
    };
    cacheSettings(mockSettings);
    return mockSettings;
  }

  const saved = await invoke<AppSettings>("save_settings", { settings });
  cacheSettings(saved);
  return saved;
}

export async function importMusicBeeTsv(sourcePath: string) {
  if (!isTauriRuntime()) {
    throw new Error("Start import from the Tauri desktop app to access local files and SQLite.");
  }

  return invoke<ImportSummary>("import_musicbee_tsv", { sourcePath });
}

export async function searchLibrary(request: BrowseRequest) {
  if (!isTauriRuntime()) {
    const albumIds = new Set(request.filters.albumIds);
    const artistKeys = new Set(request.filters.artistKeys);
    const genreKeys = new Set(request.filters.genres.map(normalizeGenreKey));
    const excludedGenreKeys = new Set(request.filters.excludedGenres.map(normalizeGenreKey));
    const rows = mockRows.filter((row) => {
      const matchesView = request.view === "tracks" ? row.trackId !== null : row.trackId === null;
      const artistKey = normalizeArtistKey(row.albumArtistDisplay);
      const genreKey = normalizeGenreKey(row.canonicalGenre);
      return (
        matchesView &&
        (albumIds.size === 0 || albumIds.has(row.albumId)) &&
        (artistKeys.size === 0 || artistKeys.has(artistKey)) &&
        (genreKeys.size === 0 || genreKeys.has(genreKey)) &&
        !excludedGenreKeys.has(genreKey)
      );
    });
    return {
      view: request.view,
      rows,
      total: rows.length,
      limit: request.limit,
      offset: request.offset,
    } satisfies BrowseResponse;
  }

  return invoke<BrowseResponse>("search_library", { request });
}

export async function listArtists(request: ArtistListRequest) {
  if (!isTauriRuntime()) {
    const searchText = request.searchText.trim().toLowerCase();
    const filtered = mockArtists.filter((artist) => artist.name.toLowerCase().includes(searchText));
    const sorted = [...filtered].sort((left, right) => compareArtists(left, right, request.sort.field));
    if (request.sort.direction === "desc") {
      sorted.reverse();
    }
    return {
      rows: sorted.slice(request.offset, request.offset + request.limit),
      total: sorted.length,
      limit: request.limit,
      offset: request.offset,
    } satisfies ArtistListResponse;
  }

  return invoke<ArtistListResponse>("list_artists", { request });
}

export async function listGenres(request: GenreListRequest) {
  if (!isTauriRuntime()) {
    const searchText = request.searchText.trim().toLowerCase();
    const filtered = mockGenres.filter((genre) => genre.name.toLowerCase().includes(searchText));
    const sorted = [...filtered].sort((left, right) => compareGenres(left, right, request.sort.field));
    if (request.sort.direction === "desc") {
      sorted.reverse();
    }
    return {
      rows: sorted.slice(request.offset, request.offset + request.limit),
      total: sorted.length,
      limit: request.limit,
      offset: request.offset,
    } satisfies GenreListResponse;
  }

  return invoke<GenreListResponse>("list_genres", { request });
}

export async function listMusicTools() {
  if (!isTauriRuntime()) {
    return mockMusicTools;
  }

  return invoke<MusicToolSummary[]>("list_music_tools");
}

export async function listMusicToolIssues(request: MusicToolIssueRequest) {
  if (!isTauriRuntime()) {
    const searchText = request.searchText.trim().toLowerCase();
    const tool = mockMusicTools.find((item) => item.id === request.toolId) ?? mockMusicTools[0];
    const filtered = mockMusicToolIssues.filter((issue) => {
      if (issue.toolId !== tool.id) {
        return false;
      }
      if (!searchText) {
        return true;
      }
      return [
        issue.album,
        issue.albumArtistDisplay,
        issue.title,
        issue.canonicalGenre,
        issue.detail,
        issue.value,
        issue.filename,
        issue.filePath,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(searchText);
    });
    const sorted = [...filtered].sort((left, right) => compareMusicToolIssues(left, right, request.sort.field));
    if (request.sort.direction === "desc") {
      sorted.reverse();
    }
    return {
      tool,
      rows: sorted.slice(request.offset, request.offset + request.limit),
      total: sorted.length,
      limit: request.limit,
      offset: request.offset,
    } satisfies MusicToolIssueResponse;
  }

  return invoke<MusicToolIssueResponse>("list_music_tool_issues", { request });
}

export async function listSavedSearches() {
  if (!isTauriRuntime()) {
    return mockSavedSearches;
  }

  return invoke<SavedSearch[]>("list_saved_searches");
}

export async function saveSearch(name: string, request: BrowseRequest) {
  if (!isTauriRuntime()) {
    const now = new Date().toISOString();
    const saved = {
      id: Date.now(),
      name,
      view: request.view,
      request,
      createdAt: now,
      updatedAt: now,
    } satisfies SavedSearch;
    mockSavedSearches = [saved, ...mockSavedSearches];
    return saved;
  }

  return invoke<SavedSearch>("save_search", { input: { name, request } });
}

export async function deleteSavedSearch(id: number) {
  if (!isTauriRuntime()) {
    mockSavedSearches = mockSavedSearches.filter((search) => search.id !== id);
    return;
  }

  return invoke<void>("delete_saved_search", { id });
}

export async function listSavedCharts() {
  if (!isTauriRuntime()) {
    return mockSavedCharts;
  }

  return invoke<SavedChart[]>("list_saved_charts");
}

export async function saveChart(name: string, config: ChartConfig) {
  if (!isTauriRuntime()) {
    const now = new Date().toISOString();
    const saved = {
      id: Date.now(),
      name,
      config,
      createdAt: now,
      updatedAt: now,
    } satisfies SavedChart;
    mockSavedCharts = [saved, ...mockSavedCharts];
    return saved;
  }

  return invoke<SavedChart>("save_chart", { input: { name, config } });
}

export async function deleteSavedChart(id: number) {
  if (!isTauriRuntime()) {
    mockSavedCharts = mockSavedCharts.filter((chart) => chart.id !== id);
    return;
  }

  return invoke<void>("delete_saved_chart", { id });
}

export async function exportSearch(request: BrowseRequest, format: string, includeCalculated: boolean) {
  if (!isTauriRuntime()) {
    return {
      path: `Preview runtime export.${format}`,
      format,
      rowCount: mockRows.filter((row) => (request.view === "tracks" ? row.trackId !== null : row.trackId === null)).length,
    } satisfies ExportResult;
  }

  return invoke<ExportResult>("export_search", { input: { request, format, includeCalculated } });
}

export async function exportMusicToolIssues(toolId: string, searchText: string, format: string) {
  if (!isTauriRuntime()) {
    const normalizedSearch = searchText.trim().toLowerCase();
    const rowCount = mockMusicToolIssues.filter((issue) => {
      if (issue.toolId !== toolId) {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }
      return [
        issue.album,
        issue.albumArtistDisplay,
        issue.title,
        issue.canonicalGenre,
        issue.detail,
        issue.value,
        issue.filename,
        issue.filePath,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    }).length;
    return {
      path: `Preview runtime tools export.${format}`,
      format,
      rowCount,
    } satisfies ExportResult;
  }

  return invoke<ExportResult>("export_music_tool_issues", { input: { toolId, searchText, format } });
}

export async function listenToImportProgress(handler: (progress: ImportProgress) => void) {
  if (!isTauriRuntime()) {
    return (() => undefined) satisfies UnlistenFn;
  }

  return listen<ImportProgress>("import-progress", (event) => {
    handler(event.payload);
  });
}

export function loadCachedSettings() {
  if (typeof window === "undefined") {
    return defaultSettings();
  }

  try {
    const stored = window.localStorage.getItem(settingsStorageKey);
    if (!stored) {
      return defaultSettings();
    }
    return normalizeSettings(JSON.parse(stored));
  } catch {
    return defaultSettings();
  }
}

export function cacheSettings(settings: AppSettings) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
  } catch {
    // Preview settings are best-effort when browser storage is unavailable.
  }
}

function normalizeSettings(settings: Partial<AppSettings>): AppSettings {
  const backupRetention = Math.round(Number(settings.backupRetention ?? 3));
  return {
    backupRetention: Math.min(50, Math.max(1, Number.isFinite(backupRetention) ? backupRetention : 3)),
    darkMode: Boolean(settings.darkMode),
    updatedAt: settings.updatedAt ?? null,
  };
}

function defaultSettings(): AppSettings {
  return {
    backupRetention: 3,
    darkMode: false,
    updatedAt: null,
  };
}

function normalizeArtistKey(value: string | null) {
  const normalized = (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return normalized || "unknown";
}

function normalizeGenreKey(value: string | null) {
  const normalized = (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return normalized || "unknown";
}

function compareArtists(left: ArtistSummary, right: ArtistSummary, field: string) {
  const leftValue = artistSortValue(left, field);
  const rightValue = artistSortValue(right, field);
  if (typeof leftValue === "string" || typeof rightValue === "string") {
    return String(leftValue).localeCompare(String(rightValue));
  }
  return (leftValue ?? 0) - (rightValue ?? 0);
}

function artistSortValue(artist: ArtistSummary, field: string) {
  switch (field) {
    case "albumCount":
      return artist.albumCount;
    case "trackCount":
      return artist.trackCount;
    case "lovedTracks":
      return artist.lovedTracks;
    case "totalMinutes":
      return artist.totalSeconds;
    case "averageCompleteness":
      return artist.averageRatingCompleteness;
    case "averageRating":
      return artist.averageAlbumRating;
    case "averageScore":
      return artist.averageAlbumScore;
    case "firstYear":
      return artist.firstYear;
    case "lastYear":
      return artist.lastYear;
    case "topGenre":
      return artist.topGenre ?? "";
    default:
      return artist.name.toLowerCase();
  }
}

function compareGenres(left: GenreSummary, right: GenreSummary, field: string) {
  const leftValue = genreSortValue(left, field);
  const rightValue = genreSortValue(right, field);
  if (typeof leftValue === "string" || typeof rightValue === "string") {
    return String(leftValue).localeCompare(String(rightValue));
  }
  return (leftValue ?? 0) - (rightValue ?? 0);
}

function genreSortValue(genre: GenreSummary, field: string) {
  switch (field) {
    case "albumCount":
      return genre.albumCount;
    case "trackCount":
      return genre.trackCount;
    case "lovedTracks":
      return genre.lovedTracks;
    case "totalMinutes":
      return genre.totalSeconds;
    case "averageCompleteness":
      return genre.averageRatingCompleteness;
    case "averageRating":
      return genre.averageAlbumRating;
    case "averageScore":
      return genre.averageAlbumScore;
    case "firstYear":
      return genre.firstYear;
    case "lastYear":
      return genre.lastYear;
    case "topArtist":
      return genre.topArtist ?? "";
    default:
      return genre.name.toLowerCase();
  }
}

function compareMusicToolIssues(left: MusicToolIssueRow, right: MusicToolIssueRow, field: string) {
  const leftValue = musicToolIssueSortValue(left, field);
  const rightValue = musicToolIssueSortValue(right, field);
  if (typeof leftValue === "string" || typeof rightValue === "string") {
    return String(leftValue).localeCompare(String(rightValue));
  }
  return (leftValue ?? 0) - (rightValue ?? 0);
}

function musicToolIssueSortValue(issue: MusicToolIssueRow, field: string) {
  switch (field) {
    case "artist":
      return issue.albumArtistDisplay?.toLowerCase() ?? "";
    case "year":
      return issue.year;
    case "title":
      return issue.title?.toLowerCase() ?? "";
    case "severity":
      return issue.severity;
    case "value":
      return issue.value?.toLowerCase() ?? "";
    case "filename":
      return issue.filename?.toLowerCase() ?? "";
    case "detail":
      return issue.detail.toLowerCase();
    default:
      return issue.album?.toLowerCase() ?? "";
  }
}
