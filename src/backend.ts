import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ImportProgress, ImportRun, ImportSummary, LibraryStatus } from "./types";

const mockStatus: LibraryStatus = {
  dbPath: "Tauri desktop runtime required for SQLite access",
  hasDatabase: false,
  trackCount: 0,
  albumCount: 0,
  importRunCount: 0,
  lastImport: null,
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

export async function listenToImportProgress(handler: (progress: ImportProgress) => void) {
  if (!isTauriRuntime()) {
    return (() => undefined) satisfies UnlistenFn;
  }

  return listen<ImportProgress>("import-progress", (event) => {
    handler(event.payload);
  });
}

