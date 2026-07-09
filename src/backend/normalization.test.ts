import { describe, expect, it } from "vitest";
import {
  defaultMusicBrainzOverlaySyncPath,
  normalizeSettings,
} from "./normalization";

describe("settings normalization", () => {
  it("provides portable defaults and leaves overlay sync unconfigured", () => {
    const settings = normalizeSettings({});

    expect(settings.backupRetention).toBe(3);
    expect(settings.importSourcePath).toBe("musicbee-library.tsv");
    expect(settings.musicBrainzCachePath).toBe(
      "MusicBrainz/musicbrainz_cache.db",
    );
    expect(defaultMusicBrainzOverlaySyncPath).toBe("");
    expect(settings.musicBrainzOverlaySyncPath).toBe("");
  });

  it("trims paths, validates modes, and clamps numeric preferences", () => {
    const settings = normalizeSettings({
      backupRetention: 999,
      darkMode: true,
      countryFlagDisplay: "not-a-mode" as never,
      leftSidebarDefault: "not-a-mode" as never,
      rightSidebarDefault: "hidden",
      importSourcePath: "  D:/Music/library.tsv  ",
      musicBrainzOverlaySyncPath: "  D:/Sync/overlay.sqlite3  ",
      musicBrainzOverlayAutoSyncMinutes: -25,
      updateAutoCheckMinutes: 9999,
    });

    expect(settings).toMatchObject({
      backupRetention: 50,
      darkMode: true,
      countryFlagDisplay: "flagAndName",
      leftSidebarDefault: "expanded",
      rightSidebarDefault: "hidden",
      importSourcePath: "D:/Music/library.tsv",
      musicBrainzOverlaySyncPath: "D:/Sync/overlay.sqlite3",
      musicBrainzOverlayAutoSyncMinutes: 0,
      updateAutoCheckMinutes: 1440,
    });
  });
});
