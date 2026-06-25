import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  BrowseRequest,
  BrowseResponse,
  BrowseRow,
  ExportResult,
  ImportProgress,
  ImportRun,
  ImportSummary,
  LibraryStatus,
  SavedSearch,
} from "./types";

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
    return [] satisfies ImportRun[];
  }

  return invoke<ImportRun[]>("list_import_runs", { limit });
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
