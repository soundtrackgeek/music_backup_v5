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
    expect(settings.billboardSourcePath).toBe("CSV_ALBUMS");
    expect(settings.billboardSinglesSourcePath).toBe("CSV_SINGLES");
    expect(settings.vgListaAlbumSourcePath).toBe("CSV_ALBUMS_NO");
    expect(settings.vgListaSinglesSourcePath).toBe("CSV_SINGLES_NO");
    expect(settings.tiISkuddetSourcePath).toBe("CSV_TIISKUDDET_NO");
    expect(settings.norsktoppenSourcePath).toBe("CSV_NORSKTOPPEN_NO");
    expect(settings.musicBrainzCachePath).toBe(
      "MusicBrainz/musicbrainz_cache.db",
    );
    expect(defaultMusicBrainzOverlaySyncPath).toBe("");
    expect(settings.musicBrainzOverlaySyncPath).toBe("");
    expect(settings.deemixDownloadPath).toBe("");
    expect(settings.deemixDownloadQuality).toBe("mp3_320");
    expect(settings.deemixDownloadFallback).toBe(true);
    expect(settings.deemixDownloadOrganization).toBe(
      "flat_artist_album_year",
    );
  });

  it("migrates the legacy album chart folder default", () => {
    const settings = normalizeSettings({ billboardSourcePath: "CSV" });

    expect(settings.billboardSourcePath).toBe("CSV_ALBUMS");
  });

  it("resolves bare Norwegian defaults beside full US chart folders", () => {
    const settings = normalizeSettings({
      billboardSourcePath: "C:\\_code\\music_backup_v5\\CSV_ALBUMS",
      billboardSinglesSourcePath:
        "C:\\_code\\music_backup_v5\\CSV_SINGLES",
      vgListaAlbumSourcePath: "CSV_ALBUMS_NO",
      vgListaSinglesSourcePath: "CSV_SINGLES_NO",
      tiISkuddetSourcePath: "CSV_TIISKUDDET_NO",
      norsktoppenSourcePath: "CSV_NORSKTOPPEN_NO",
    });

    expect(settings.vgListaAlbumSourcePath).toBe(
      "C:\\_code\\music_backup_v5\\CSV_ALBUMS_NO",
    );
    expect(settings.vgListaSinglesSourcePath).toBe(
      "C:\\_code\\music_backup_v5\\CSV_SINGLES_NO",
    );
    expect(settings.tiISkuddetSourcePath).toBe(
      "C:\\_code\\music_backup_v5\\CSV_TIISKUDDET_NO",
    );
    expect(settings.norsktoppenSourcePath).toBe(
      "C:\\_code\\music_backup_v5\\CSV_NORSKTOPPEN_NO",
    );
  });

  it("trims paths, validates modes, and clamps numeric preferences", () => {
    const settings = normalizeSettings({
      backupRetention: 999,
      darkMode: true,
      countryFlagDisplay: "not-a-mode" as never,
      leftSidebarDefault: "not-a-mode" as never,
      rightSidebarDefault: "hidden",
      importSourcePath: "  D:/Music/library.tsv  ",
      coverSourcePath: "  C:\\_code\\music_backup_v5\\AlbumCovers\\  ",
      vgListaAlbumSourcePath: "  D:/Charts/Norway/Albums  ",
      vgListaSinglesSourcePath: "  D:/Charts/Norway/Singles  ",
      tiISkuddetSourcePath: "  D:/Charts/Norway/Ti i Skuddet  ",
      norsktoppenSourcePath: "  D:/Charts/Norway/Norsktoppen  ",
      deemixDownloadPath: "  D:/Music/Incoming  ",
      deemixDownloadQuality: "mp3_128",
      deemixDownloadFallback: false,
      deemixDownloadOrganization: "artist_album_year_folders",
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
      coverSourcePath: "C:\\_code\\music_backup_v5\\AlbumCovers\\",
      vgListaAlbumSourcePath: "D:/Charts/Norway/Albums",
      vgListaSinglesSourcePath: "D:/Charts/Norway/Singles",
      tiISkuddetSourcePath: "D:/Charts/Norway/Ti i Skuddet",
      norsktoppenSourcePath: "D:/Charts/Norway/Norsktoppen",
      deemixDownloadPath: "D:/Music/Incoming",
      deemixDownloadQuality: "mp3_128",
      deemixDownloadFallback: false,
      deemixDownloadOrganization: "artist_album_year_folders",
      musicBrainzOverlaySyncPath: "D:/Sync/overlay.sqlite3",
      musicBrainzOverlayAutoSyncMinutes: 0,
      updateAutoCheckMinutes: 1440,
    });
  });
});
