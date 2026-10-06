import {
  type AppSettings,
  type LeftSidebarMode,
  type RightSidebarMode,
} from "../types";
import {
  loadCachedSettings,
  listGenreSuggestions,
  listGenres,
} from "../backend";
import { uniqueGenreSuggestionOptions } from "./genreSuggestions";
import { createGenreSuggestionRequest } from "./requests";

export type AppUpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "upToDate"
  | "downloading"
  | "installing"
  | "restarting"
  | "error";

export type OriginReportFilter =
  "needsAttention" | "skipped" | "unresolved" | "eligible" | "imported" | "all";

export const originReportFilterOptions: Array<{
  value: OriginReportFilter;
  label: string;
}> = [
  { value: "needsAttention", label: "Needs attention" },
  { value: "skipped", label: "Skipped" },
  { value: "unresolved", label: "Unresolved" },
  { value: "eligible", label: "Eligible" },
  { value: "imported", label: "Imported" },
  { value: "all", label: "All" },
];

export type ArtistInfoReportFilter =
  "needsAttention" | "eligible" | "imported" | "person" | "group" | "all";

export const artistInfoReportFilterOptions: Array<{
  value: ArtistInfoReportFilter;
  label: string;
}> = [
  { value: "needsAttention", label: "Needs attention" },
  { value: "eligible", label: "Eligible" },
  { value: "imported", label: "Imported" },
  { value: "person", label: "People" },
  { value: "group", label: "Groups" },
  { value: "all", label: "All" },
];

export function createDefaultSettings(): AppSettings {
  return loadCachedSettings();
}

export function createDefaultImportSourcePath() {
  return loadCachedSettings().importSourcePath;
}

export function createDefaultCoverSourcePath() {
  return loadCachedSettings().coverSourcePath;
}

export function createDefaultBillboardSourcePath() {
  return loadCachedSettings().billboardSourcePath;
}

export function createDefaultBillboardSinglesSourcePath() {
  return loadCachedSettings().billboardSinglesSourcePath;
}

export function createDefaultVgListaAlbumSourcePath() {
  return loadCachedSettings().vgListaAlbumSourcePath;
}

export function createDefaultVgListaSinglesSourcePath() {
  return loadCachedSettings().vgListaSinglesSourcePath;
}

export function createDefaultOfficialUkAlbumSourcePath() {
  return loadCachedSettings().officialUkAlbumSourcePath;
}

export function createDefaultOfficialUkSinglesSourcePath() {
  return loadCachedSettings().officialUkSinglesSourcePath;
}

export function createDefaultTiISkuddetSourcePath() {
  return loadCachedSettings().tiISkuddetSourcePath;
}

export function createDefaultNorsktoppenSourcePath() {
  return loadCachedSettings().norsktoppenSourcePath;
}

export function createDefaultLeftSidebarMode(): LeftSidebarMode {
  return loadCachedSettings().leftSidebarDefault;
}

export function createDefaultRightSidebarMode(): RightSidebarMode {
  return loadCachedSettings().rightSidebarDefault;
}

export async function loadGenreSuggestionNames() {
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
