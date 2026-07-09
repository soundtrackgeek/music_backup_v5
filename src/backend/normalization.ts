import type {
  AppSettings,
  CountryFlagDisplay,
  LeftSidebarMode,
  RightSidebarMode,
} from "../types";

export const settingsStorageKey = "musicLibrarySettings:v1";
export const defaultImportSourcePath = "musicbee-library.tsv";
export const defaultCoverSourcePath = "AlbumCovers";
export const defaultBillboardSourcePath = "CSV";
export const defaultBillboardSinglesSourcePath = "CSV_SINGLES";
export const defaultMusicBrainzCachePath =
  "MusicBrainz/musicbrainz_cache.db";
export const defaultMusicBrainzOverlaySyncPath = "";

export function normalizeSettings(
  settings: Partial<AppSettings>,
): AppSettings {
  const backupRetention = Math.round(Number(settings.backupRetention ?? 3));
  const autoSyncMinutes = Math.round(
    Number(settings.musicBrainzOverlayAutoSyncMinutes ?? 0),
  );
  const updateAutoCheckMinutes = Math.round(
    Number(settings.updateAutoCheckMinutes ?? 0),
  );

  return {
    backupRetention: Math.min(
      50,
      Math.max(1, Number.isFinite(backupRetention) ? backupRetention : 3),
    ),
    darkMode: Boolean(settings.darkMode),
    countryFlagDisplay: normalizeCountryFlagDisplay(
      settings.countryFlagDisplay,
    ),
    leftSidebarDefault: normalizeLeftSidebarMode(settings.leftSidebarDefault),
    rightSidebarDefault: normalizeRightSidebarMode(
      settings.rightSidebarDefault,
    ),
    importSourcePath: normalizeImportPath(
      settings.importSourcePath,
      defaultImportSourcePath,
    ),
    coverSourcePath: normalizeImportPath(
      settings.coverSourcePath,
      defaultCoverSourcePath,
    ),
    billboardSourcePath: normalizeImportPath(
      settings.billboardSourcePath,
      defaultBillboardSourcePath,
    ),
    billboardSinglesSourcePath: normalizeImportPath(
      settings.billboardSinglesSourcePath,
      defaultBillboardSinglesSourcePath,
    ),
    musicBrainzCachePath: normalizeMusicBrainzCachePath(
      settings.musicBrainzCachePath,
    ),
    musicBrainzOverlaySyncPath: normalizeMusicBrainzOverlaySyncPath(
      settings.musicBrainzOverlaySyncPath,
    ),
    musicBrainzOverlayAutoSyncMinutes: Math.min(
      1440,
      Math.max(0, Number.isFinite(autoSyncMinutes) ? autoSyncMinutes : 0),
    ),
    updateAutoCheckMinutes: Math.min(
      1440,
      Math.max(
        0,
        Number.isFinite(updateAutoCheckMinutes) ? updateAutoCheckMinutes : 0,
      ),
    ),
    updatedAt: settings.updatedAt ?? null,
  };
}

export function defaultSettings(): AppSettings {
  return normalizeSettings({});
}

export function normalizeMusicBrainzCachePath(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || defaultMusicBrainzCachePath;
}

export function normalizeMusicBrainzOverlaySyncPath(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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
    return normalizeSettings(JSON.parse(stored) as Partial<AppSettings>);
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

export function normalizeArtistKey(value: string | null) {
  const normalized = (value ?? "")
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return normalized || "unknown";
}

function normalizeLeftSidebarMode(value: unknown): LeftSidebarMode {
  return value === "iconOnly" || value === "hidden" || value === "expanded"
    ? value
    : "expanded";
}

function normalizeRightSidebarMode(value: unknown): RightSidebarMode {
  return value === "hidden" || value === "expanded" ? value : "expanded";
}

function normalizeCountryFlagDisplay(value: unknown): CountryFlagDisplay {
  return value === "flagAndName" || value === "name" || value === "flag"
    ? value
    : "flagAndName";
}

function normalizeImportPath(value: unknown, fallback: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || fallback;
}
