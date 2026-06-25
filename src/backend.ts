import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AppSettings,
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
} from "./types";

const settingsStorageKey = "musicLibrarySettings:v1";

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
    normalizedRating: 100,
    discNumber: 1,
    trackNumber: 2,
    love: "L",
    filePath: "D:\\Music\\Pet Shop Boys\\Actually",
    filename: "02 What Have I Done to Deserve This.mp3",
  },
];

let mockSavedSearches: SavedSearch[] = [];
let mockSavedCharts: SavedChart[] = [];
let mockSettings: AppSettings = loadMockSettings();

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

  return invoke<AppSettings>("get_settings");
}

export async function saveSettings(settings: AppSettings) {
  if (!isTauriRuntime()) {
    mockSettings = {
      ...normalizeSettings(settings),
      updatedAt: new Date().toISOString(),
    };
    saveMockSettings(mockSettings);
    return mockSettings;
  }

  return invoke<AppSettings>("save_settings", { settings });
}

export async function importMusicBeeTsv(sourcePath: string) {
  if (!isTauriRuntime()) {
    throw new Error("Start import from the Tauri desktop app to access local files and SQLite.");
  }

  return invoke<ImportSummary>("import_musicbee_tsv", { sourcePath });
}

export async function searchLibrary(request: BrowseRequest) {
  if (!isTauriRuntime()) {
    const rows = mockRows.filter((row) => (request.view === "tracks" ? row.trackId !== null : row.trackId === null));
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

export async function listenToImportProgress(handler: (progress: ImportProgress) => void) {
  if (!isTauriRuntime()) {
    return (() => undefined) satisfies UnlistenFn;
  }

  return listen<ImportProgress>("import-progress", (event) => {
    handler(event.payload);
  });
}

function loadMockSettings() {
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

function saveMockSettings(settings: AppSettings) {
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
