import {
  isTauriRuntime,
  getLibraryStatus,
  listImportRuns,
  listDatabaseBackups,
  listSavedSearches,
  listSavedCharts,
  getStatistics,
  getSettings,
  getMusicBrainzCacheStatus,
  getMusicBrainzOriginCountryStatus,
  getMusicBrainzArtistInfoStatus,
  listMusicBrainzOverlaySyncLog,
  defaultImportSourcePath,
  getImportPreview,
  defaultCoverSourcePath,
  defaultBillboardSourcePath,
  defaultBillboardSinglesSourcePath,
  defaultVgListaAlbumSourcePath,
  defaultVgListaSinglesSourcePath,
  defaultOfficialUkAlbumSourcePath,
  defaultOfficialUkSinglesSourcePath,
  defaultTiISkuddetSourcePath,
  defaultNorsktoppenSourcePath,
  defaultMusicBrainzCachePath,
  defaultMusicBrainzOverlaySyncPath,
  getDiscovery,
  getDiscoveryAnniversaries,
  getCatalogRevision,
  clearCoverImageCache,
  listenToCatalogRevision,
  acknowledgeCatalogRevision,
  listenToMusicDoctorSync,
  cacheSettings,
  saveSettings,
  getMusicBrainzArtistDiscography,
  listenToMusicBrainzOverlaySync,
} from "../backend";
import { useCallback, useEffect, useRef } from "react";
import { loadGenreSuggestionNames } from "./defaults";
import {
  overlayAutoSyncMinutesValue,
  updateAutoCheckMinutesValue,
  textSettingValue,
} from "../workspaces/settings/settingsDisplay";
import { createCatalogRevisionChecker } from "./catalogRevisionWatcher";
import { subscribeWithSnapshot } from "./backendEvents";
import { type AppSettings } from "../types";
import { clampBackupRetention } from "./input";
import type { WorkspaceStores } from "./WorkspaceStoresProvider";

type Inputs = Pick<
  WorkspaceStores,
  | "setGenreSuggestionNames"
  | "setStatus"
  | "setRuns"
  | "setLatestAppliedImport"
  | "setDatabaseBackups"
  | "setBackupError"
  | "setSavedSearches"
  | "setSavedCharts"
  | "setStatistics"
  | "settingsRef"
  | "setSettings"
  | "setPersistedSettings"
  | "setSourcePath"
  | "setImportPreview"
  | "setCoverSourcePath"
  | "setBillboardSourcePath"
  | "setBillboardSinglesSourcePath"
  | "setVgListaAlbumSourcePath"
  | "setVgListaSinglesSourcePath"
  | "setOfficialUkAlbumSourcePath"
  | "setOfficialUkSinglesSourcePath"
  | "setTiISkuddetSourcePath"
  | "setNorsktoppenSourcePath"
  | "setMusicBrainzCachePathDraft"
  | "setMusicBrainzOverlaySyncPathDraft"
  | "setMusicBrainzOverlayAutoSyncDraft"
  | "setAppUpdateAutoCheckDraft"
  | "setMusicBrainzStatus"
  | "setMusicBrainzStatusError"
  | "setMusicBrainzOriginStatus"
  | "setMusicBrainzOriginError"
  | "setMusicBrainzArtistInfoStatus"
  | "setMusicBrainzArtistInfoError"
  | "setMusicBrainzOverlaySyncLog"
  | "setMusicBrainzOverlaySyncError"
  | "hasAppliedLayoutDefaults"
  | "setLeftSidebarMode"
  | "setRightSidebarMode"
  | "setIsDiscoveryLoading"
  | "discoveryAnniversaryYearsRef"
  | "setDiscovery"
  | "setDiscoveryError"
  | "setImportError"
  | "hasObservedCatalogRevisionRef"
  | "observedCatalogRevisionRef"
  | "setCatalogRefreshKey"
  | "setRequest"
  | "setAlbumRequest"
  | "setChartConfig"
  | "setArtistRequest"
  | "setArtistAlbumsResponse"
  | "setGenreAlbumsResponse"
  | "setDiscoveryAlbumResponse"
  | "settingsSaveSequenceRef"
  | "pendingSettingsSaveCountRef"
  | "setIsSavingSettings"
  | "setSettingsError"
  | "settingsSaveQueueRef"
  | "selectedArtist"
  | "setMusicBrainzArtistDiscography"
  | "setMusicBrainzOverlaySyncResult"
>;

export function useCatalogWorkspace({
  setGenreSuggestionNames,
  setStatus,
  setRuns,
  setLatestAppliedImport,
  setDatabaseBackups,
  setBackupError,
  setSavedSearches,
  setSavedCharts,
  setStatistics,
  settingsRef,
  setSettings,
  setPersistedSettings,
  setSourcePath,
  setImportPreview,
  setCoverSourcePath,
  setBillboardSourcePath,
  setBillboardSinglesSourcePath,
  setVgListaAlbumSourcePath,
  setVgListaSinglesSourcePath,
  setOfficialUkAlbumSourcePath,
  setOfficialUkSinglesSourcePath,
  setTiISkuddetSourcePath,
  setNorsktoppenSourcePath,
  setMusicBrainzCachePathDraft,
  setMusicBrainzOverlaySyncPathDraft,
  setMusicBrainzOverlayAutoSyncDraft,
  setAppUpdateAutoCheckDraft,
  setMusicBrainzStatus,
  setMusicBrainzStatusError,
  setMusicBrainzOriginStatus,
  setMusicBrainzOriginError,
  setMusicBrainzArtistInfoStatus,
  setMusicBrainzArtistInfoError,
  setMusicBrainzOverlaySyncLog,
  setMusicBrainzOverlaySyncError,
  hasAppliedLayoutDefaults,
  setLeftSidebarMode,
  setRightSidebarMode,
  setIsDiscoveryLoading,
  discoveryAnniversaryYearsRef,
  setDiscovery,
  setDiscoveryError,
  setImportError,
  hasObservedCatalogRevisionRef,
  observedCatalogRevisionRef,
  setCatalogRefreshKey,
  setRequest,
  setAlbumRequest,
  setChartConfig,
  setArtistRequest,
  setArtistAlbumsResponse,
  setGenreAlbumsResponse,
  setDiscoveryAlbumResponse,
  settingsSaveSequenceRef,
  pendingSettingsSaveCountRef,
  setIsSavingSettings,
  setSettingsError,
  settingsSaveQueueRef,
  selectedArtist,
  setMusicBrainzArtistDiscography,
  setMusicBrainzOverlaySyncResult,
}: Inputs) {
  const canImport = isTauriRuntime();

  const refreshGenreSuggestions = useCallback(async () => {
    const nextGenreNames = await loadGenreSuggestionNames();
    setGenreSuggestionNames(nextGenreNames);
  }, []);

  const loadData = useCallback(async () => {
    const statusPromise = getLibraryStatus().then((nextStatus) => {
      setStatus(nextStatus);
      return nextStatus;
    });
    const [
      ,
      nextRuns,
      nextBackups,
      nextSavedSearches,
      nextSavedCharts,
      nextStatistics,
      nextSettings,
      nextMusicBrainzStatus,
      nextMusicBrainzOriginStatus,
      nextMusicBrainzArtistInfoStatus,
      nextMusicBrainzOverlaySyncLog,
    ] = await Promise.all([
      statusPromise,
      listImportRuns(8),
      listDatabaseBackups(),
      listSavedSearches(),
      listSavedCharts(),
      getStatistics(),
      getSettings(),
      getMusicBrainzCacheStatus(),
      getMusicBrainzOriginCountryStatus(),
      getMusicBrainzArtistInfoStatus(),
      listMusicBrainzOverlaySyncLog(12),
    ]);
    setRuns(nextRuns);
    setLatestAppliedImport(
      nextRuns.find(
        (run) => run.status === "completed" && Boolean(run.backupPath),
      ) ?? null,
    );
    setDatabaseBackups(nextBackups);
    setBackupError(null);
    setSavedSearches(nextSavedSearches);
    setSavedCharts(nextSavedCharts);
    setStatistics(nextStatistics);
    settingsRef.current = nextSettings;
    setSettings(nextSettings);
    setPersistedSettings(nextSettings);
    setSourcePath(nextSettings.importSourcePath || defaultImportSourcePath);
    void getImportPreview(
      nextSettings.importSourcePath || defaultImportSourcePath,
    )
      .then(setImportPreview)
      .catch(() => {
        // A missing or moved TSV should not prevent the rest of the app from loading.
      });
    setCoverSourcePath(nextSettings.coverSourcePath || defaultCoverSourcePath);
    setBillboardSourcePath(
      nextSettings.billboardSourcePath || defaultBillboardSourcePath,
    );
    setBillboardSinglesSourcePath(
      nextSettings.billboardSinglesSourcePath ||
        defaultBillboardSinglesSourcePath,
    );
    setVgListaAlbumSourcePath(
      nextSettings.vgListaAlbumSourcePath || defaultVgListaAlbumSourcePath,
    );
    setVgListaSinglesSourcePath(
      nextSettings.vgListaSinglesSourcePath || defaultVgListaSinglesSourcePath,
    );
    setOfficialUkAlbumSourcePath(
      nextSettings.officialUkAlbumSourcePath ||
        defaultOfficialUkAlbumSourcePath,
    );
    setOfficialUkSinglesSourcePath(
      nextSettings.officialUkSinglesSourcePath ||
        defaultOfficialUkSinglesSourcePath,
    );
    setTiISkuddetSourcePath(
      nextSettings.tiISkuddetSourcePath || defaultTiISkuddetSourcePath,
    );
    setNorsktoppenSourcePath(
      nextSettings.norsktoppenSourcePath || defaultNorsktoppenSourcePath,
    );
    setMusicBrainzCachePathDraft(
      nextSettings.musicBrainzCachePath || defaultMusicBrainzCachePath,
    );
    setMusicBrainzOverlaySyncPathDraft(
      nextSettings.musicBrainzOverlaySyncPath ||
        defaultMusicBrainzOverlaySyncPath,
    );
    setMusicBrainzOverlayAutoSyncDraft(
      String(
        overlayAutoSyncMinutesValue(
          nextSettings.musicBrainzOverlayAutoSyncMinutes,
        ),
      ),
    );
    setAppUpdateAutoCheckDraft(
      String(updateAutoCheckMinutesValue(nextSettings.updateAutoCheckMinutes)),
    );
    setMusicBrainzStatus(nextMusicBrainzStatus);
    setMusicBrainzStatusError(null);
    setMusicBrainzOriginStatus(nextMusicBrainzOriginStatus);
    setMusicBrainzOriginError(null);
    setMusicBrainzArtistInfoStatus(nextMusicBrainzArtistInfoStatus);
    setMusicBrainzArtistInfoError(null);
    setMusicBrainzOverlaySyncLog(nextMusicBrainzOverlaySyncLog);
    setMusicBrainzOverlaySyncError(null);
    if (!hasAppliedLayoutDefaults.current) {
      setLeftSidebarMode(nextSettings.leftSidebarDefault);
      setRightSidebarMode(nextSettings.rightSidebarDefault);
      hasAppliedLayoutDefaults.current = true;
    }
    void refreshGenreSuggestions().catch(() => {
      // Keep any suggestions already loaded from focus retry or the Genres page.
    });
  }, [refreshGenreSuggestions]);

  const loadDiscoveryData = useCallback(async (refreshDailyEdition = false) => {
    setIsDiscoveryLoading(true);
    let nextDiscovery = await getDiscovery({ refreshDailyEdition });
    const anniversaryYears = discoveryAnniversaryYearsRef.current;
    if (
      !nextDiscovery.dailyEditionArchive.isArchived &&
      anniversaryYears !== nextDiscovery.dailyEdition.anniversaryYears
    ) {
      const anniversaries = await getDiscoveryAnniversaries(anniversaryYears);
      nextDiscovery = {
        ...nextDiscovery,
        dailyEdition: {
          ...nextDiscovery.dailyEdition,
          anniversaryYears,
          anniversaries,
        },
      };
    }
    setDiscovery(nextDiscovery);
    setDiscoveryError(null);
    setIsDiscoveryLoading(false);
  }, []);

  useEffect(() => {
    void loadData().catch((loadError) => {
      setImportError(
        loadError instanceof Error ? loadError.message : String(loadError),
      );
    });
    void loadDiscoveryData().catch((loadError) => {
      setDiscoveryError(
        loadError instanceof Error ? loadError.message : String(loadError),
      );
      setIsDiscoveryLoading(false);
    });
  }, [loadData, loadDiscoveryData]);

  useEffect(() => {
    if (!canImport) return;

    let disposed = false;

    const checkCatalogRevision = createCatalogRevisionChecker({
      isVisible: () => !disposed && document.visibilityState !== "hidden",
      getRevision: getCatalogRevision,
      hasObservedRevision: () => hasObservedCatalogRevisionRef.current,
      getObservedRevision: () => observedCatalogRevisionRef.current,
      setObservedRevision: (revision) => {
        observedCatalogRevisionRef.current = revision;
        hasObservedCatalogRevisionRef.current = true;
      },
      onRevision: async (_revision, reason) => {
        if (disposed) return;

        // Invalidate live catalog queries before doing any secondary bookkeeping.
        // The checker issues one follow-up retry pulse after acknowledgement so a
        // transient child query failure cannot leave the visible view stale.
        setCatalogRefreshKey((current) => current + 1);
        clearCoverImageCache();
        if (reason === "retry") return;

        const nextRuns = await listImportRuns(8);
        if (disposed) return;

        setRuns(nextRuns);
        setLatestAppliedImport(
          nextRuns.find(
            (run) => run.status === "completed" && Boolean(run.backupPath),
          ) ?? null,
        );
        void Promise.all([getLibraryStatus(), getStatistics()])
          .then(([nextStatus, nextStatistics]) => {
            if (disposed) return;
            setStatus(nextStatus);
            setStatistics(nextStatistics);
          })
          .catch(() => {
            // The catalog views are already refreshing; summary cards can wait for a later reload.
          });
      },
    });
    const checkForExternalImport = () => {
      void checkCatalogRevision()
        .then(() => checkCatalogRevision())
        .catch(() => {
          // A locked or temporarily unavailable database can be retried on the next tick.
        });
    };

    const handleFocus = checkForExternalImport;
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkForExternalImport();
      }
    };

    const unsubscribe = subscribeWithSnapshot(
      listenToCatalogRevision,
      getCatalogRevision,
      (revision) => {
        void checkCatalogRevision(revision)
          .then((processed) => {
            if (
              processed &&
              !disposed &&
              document.visibilityState !== "hidden" &&
              hasObservedCatalogRevisionRef.current &&
              observedCatalogRevisionRef.current === revision
            ) {
              return acknowledgeCatalogRevision(revision);
            }
          })
          .catch(() => undefined);
      },
    );
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    checkForExternalImport();

    return () => {
      disposed = true;
      unsubscribe();
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [canImport]);

  useEffect(() => {
    if (!canImport) return;
    return subscribeWithSnapshot(listenToMusicDoctorSync, null, () => {
      setCatalogRefreshKey((current) => current + 1);
    });
  }, [canImport]);

  function refreshOriginJoinedViews() {
    setRequest((current) => ({ ...current }));
    setAlbumRequest((current) => ({ ...current }));
    setChartConfig((current) => ({ ...current }));
    setArtistRequest((current) => ({ ...current }));
    setArtistAlbumsResponse(null);
    setGenreAlbumsResponse(null);
    setDiscoveryAlbumResponse(null);
  }

  async function saveAppSettings(values: Partial<AppSettings>) {
    const baseSettings = settingsRef.current;
    const overlayAutoSyncMinutes = overlayAutoSyncMinutesValue(
      values.musicBrainzOverlayAutoSyncMinutes ??
        baseSettings.musicBrainzOverlayAutoSyncMinutes,
    );
    const updateAutoCheckMinutes = updateAutoCheckMinutesValue(
      values.updateAutoCheckMinutes ?? baseSettings.updateAutoCheckMinutes,
    );
    const nextSettings = {
      ...baseSettings,
      ...values,
      backupRetention: clampBackupRetention(
        values.backupRetention ?? baseSettings.backupRetention,
      ),
      leftSidebarDefault:
        values.leftSidebarDefault ?? baseSettings.leftSidebarDefault,
      rightSidebarDefault:
        values.rightSidebarDefault ?? baseSettings.rightSidebarDefault,
      importSourcePath: textSettingValue(
        values.importSourcePath ?? baseSettings.importSourcePath,
        defaultImportSourcePath,
      ),
      coverSourcePath: textSettingValue(
        values.coverSourcePath ?? baseSettings.coverSourcePath,
        defaultCoverSourcePath,
      ),
      billboardSourcePath: textSettingValue(
        values.billboardSourcePath ?? baseSettings.billboardSourcePath,
        defaultBillboardSourcePath,
      ),
      billboardSinglesSourcePath: textSettingValue(
        values.billboardSinglesSourcePath ??
          baseSettings.billboardSinglesSourcePath,
        defaultBillboardSinglesSourcePath,
      ),
      vgListaAlbumSourcePath: textSettingValue(
        values.vgListaAlbumSourcePath ?? baseSettings.vgListaAlbumSourcePath,
        defaultVgListaAlbumSourcePath,
      ),
      vgListaSinglesSourcePath: textSettingValue(
        values.vgListaSinglesSourcePath ??
          baseSettings.vgListaSinglesSourcePath,
        defaultVgListaSinglesSourcePath,
      ),
      officialUkAlbumSourcePath: textSettingValue(
        values.officialUkAlbumSourcePath ??
          baseSettings.officialUkAlbumSourcePath,
        defaultOfficialUkAlbumSourcePath,
      ),
      officialUkSinglesSourcePath: textSettingValue(
        values.officialUkSinglesSourcePath ??
          baseSettings.officialUkSinglesSourcePath,
        defaultOfficialUkSinglesSourcePath,
      ),
      tiISkuddetSourcePath: textSettingValue(
        values.tiISkuddetSourcePath ?? baseSettings.tiISkuddetSourcePath,
        defaultTiISkuddetSourcePath,
      ),
      norsktoppenSourcePath: textSettingValue(
        values.norsktoppenSourcePath ?? baseSettings.norsktoppenSourcePath,
        defaultNorsktoppenSourcePath,
      ),
      deemixDownloadPath: (
        values.deemixDownloadPath ?? baseSettings.deemixDownloadPath
      ).trim(),
      musicBrainzCachePath: textSettingValue(
        values.musicBrainzCachePath ?? baseSettings.musicBrainzCachePath,
        defaultMusicBrainzCachePath,
      ),
      musicBrainzOverlaySyncPath: textSettingValue(
        values.musicBrainzOverlaySyncPath ??
          baseSettings.musicBrainzOverlaySyncPath,
        defaultMusicBrainzOverlaySyncPath,
      ),
      musicBrainzOverlayAutoSyncMinutes: overlayAutoSyncMinutes,
      updateAutoCheckMinutes,
    };
    const saveSequence = settingsSaveSequenceRef.current + 1;
    settingsSaveSequenceRef.current = saveSequence;
    pendingSettingsSaveCountRef.current += 1;
    settingsRef.current = nextSettings;
    setSettings(nextSettings);
    cacheSettings(nextSettings);
    setIsSavingSettings(true);
    setSettingsError(null);

    const previousSave = settingsSaveQueueRef.current;
    const saveTask = previousSave
      .catch(() => undefined)
      .then(async () => {
        const saved = await saveSettings(nextSettings);
        setPersistedSettings(saved);
        if (saveSequence === settingsSaveSequenceRef.current) {
          settingsRef.current = saved;
          setSettings(saved);
          cacheSettings(saved);
          if (
            Object.prototype.hasOwnProperty.call(
              values,
              "musicBrainzOverlayAutoSyncMinutes",
            )
          ) {
            setMusicBrainzOverlayAutoSyncDraft(
              String(
                overlayAutoSyncMinutesValue(
                  saved.musicBrainzOverlayAutoSyncMinutes,
                ),
              ),
            );
          }
          if (
            Object.prototype.hasOwnProperty.call(
              values,
              "updateAutoCheckMinutes",
            )
          ) {
            setAppUpdateAutoCheckDraft(
              String(updateAutoCheckMinutesValue(saved.updateAutoCheckMinutes)),
            );
          }
          if (
            Object.prototype.hasOwnProperty.call(values, "importSourcePath")
          ) {
            setSourcePath((current) =>
              textSettingValue(current, defaultImportSourcePath) ===
              nextSettings.importSourcePath
                ? saved.importSourcePath
                : current,
            );
          }
          if (Object.prototype.hasOwnProperty.call(values, "coverSourcePath")) {
            setCoverSourcePath((current) =>
              textSettingValue(current, defaultCoverSourcePath) ===
              nextSettings.coverSourcePath
                ? saved.coverSourcePath
                : current,
            );
          }
          if (
            Object.prototype.hasOwnProperty.call(values, "billboardSourcePath")
          ) {
            setBillboardSourcePath((current) =>
              textSettingValue(current, defaultBillboardSourcePath) ===
              nextSettings.billboardSourcePath
                ? saved.billboardSourcePath
                : current,
            );
          }
          if (
            Object.prototype.hasOwnProperty.call(
              values,
              "billboardSinglesSourcePath",
            )
          ) {
            setBillboardSinglesSourcePath((current) =>
              textSettingValue(current, defaultBillboardSinglesSourcePath) ===
              nextSettings.billboardSinglesSourcePath
                ? saved.billboardSinglesSourcePath
                : current,
            );
          }
          if (
            Object.prototype.hasOwnProperty.call(
              values,
              "vgListaAlbumSourcePath",
            )
          ) {
            setVgListaAlbumSourcePath((current) =>
              textSettingValue(current, defaultVgListaAlbumSourcePath) ===
              nextSettings.vgListaAlbumSourcePath
                ? saved.vgListaAlbumSourcePath
                : current,
            );
          }
          if (
            Object.prototype.hasOwnProperty.call(
              values,
              "vgListaSinglesSourcePath",
            )
          ) {
            setVgListaSinglesSourcePath((current) =>
              textSettingValue(current, defaultVgListaSinglesSourcePath) ===
              nextSettings.vgListaSinglesSourcePath
                ? saved.vgListaSinglesSourcePath
                : current,
            );
          }
          if (
            Object.prototype.hasOwnProperty.call(
              values,
              "officialUkAlbumSourcePath",
            )
          ) {
            setOfficialUkAlbumSourcePath((current) =>
              textSettingValue(current, defaultOfficialUkAlbumSourcePath) ===
              nextSettings.officialUkAlbumSourcePath
                ? saved.officialUkAlbumSourcePath
                : current,
            );
          }
          if (
            Object.prototype.hasOwnProperty.call(
              values,
              "officialUkSinglesSourcePath",
            )
          ) {
            setOfficialUkSinglesSourcePath((current) =>
              textSettingValue(current, defaultOfficialUkSinglesSourcePath) ===
              nextSettings.officialUkSinglesSourcePath
                ? saved.officialUkSinglesSourcePath
                : current,
            );
          }
          if (
            Object.prototype.hasOwnProperty.call(values, "tiISkuddetSourcePath")
          ) {
            setTiISkuddetSourcePath((current) =>
              textSettingValue(current, defaultTiISkuddetSourcePath) ===
              nextSettings.tiISkuddetSourcePath
                ? saved.tiISkuddetSourcePath
                : current,
            );
          }
          if (
            Object.prototype.hasOwnProperty.call(
              values,
              "norsktoppenSourcePath",
            )
          ) {
            setNorsktoppenSourcePath((current) =>
              textSettingValue(current, defaultNorsktoppenSourcePath) ===
              nextSettings.norsktoppenSourcePath
                ? saved.norsktoppenSourcePath
                : current,
            );
          }
        }
      });
    settingsSaveQueueRef.current = saveTask.then(
      () => undefined,
      () => undefined,
    );

    try {
      await saveTask;
      return true;
    } catch (error) {
      if (saveSequence === settingsSaveSequenceRef.current) {
        setSettingsError(
          error instanceof Error ? error.message : String(error),
        );
      }
      return false;
    } finally {
      pendingSettingsSaveCountRef.current = Math.max(
        0,
        pendingSettingsSaveCountRef.current - 1,
      );
      if (pendingSettingsSaveCountRef.current === 0) {
        setIsSavingSettings(false);
      }
    }
  }

  async function refreshMusicBrainzOriginCountryStatus() {
    const result = await getMusicBrainzOriginCountryStatus();
    setMusicBrainzOriginStatus(result);
    return result;
  }

  async function refreshMusicBrainzArtistInfoStatus() {
    const result = await getMusicBrainzArtistInfoStatus();
    setMusicBrainzArtistInfoStatus(result);
    return result;
  }

  const selectedArtistForSyncRef = useRef(selectedArtist);

  selectedArtistForSyncRef.current = selectedArtist;

  async function refreshSelectedArtistAfterOverlaySync() {
    const artist = selectedArtistForSyncRef.current;
    if (!artist) return;
    const discography = await getMusicBrainzArtistDiscography(
      artist.id,
      artist.name,
    );
    if (selectedArtistForSyncRef.current?.id === artist.id) {
      setMusicBrainzArtistDiscography(discography);
    }
  }

  useEffect(() => {
    if (!canImport) return;
    let disposed = false;
    const unsubscribe = subscribeWithSnapshot(
      listenToMusicBrainzOverlaySync,
      null,
      (result) => {
        setMusicBrainzOverlaySyncResult(result);
        // Background completion never replaces a path currently being edited.
        void listMusicBrainzOverlaySyncLog(12)
          .then((log) => {
            if (!disposed) setMusicBrainzOverlaySyncLog(log);
          })
          .catch(() => undefined);
        void refreshSelectedArtistAfterOverlaySync().catch(() => undefined);
        setCatalogRefreshKey((current) => current + 1);
      },
    );
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [canImport]);
  return {
    canImport,
    refreshGenreSuggestions,
    loadData,
    loadDiscoveryData,
    refreshOriginJoinedViews,
    saveAppSettings,
    refreshMusicBrainzOriginCountryStatus,
    refreshMusicBrainzArtistInfoStatus,
    selectedArtistForSyncRef,
    refreshSelectedArtistAfterOverlaySync,
  };
}
