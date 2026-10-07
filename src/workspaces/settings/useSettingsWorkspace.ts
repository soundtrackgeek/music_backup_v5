import { useEffect, useMemo, useCallback } from "react";
import {
  listenToMusicBrainzOriginCountryImportProgress,
  listenToMusicBrainzArtistInfoImportProgress,
  restoreDatabaseBackup,
  clearCoverImageCache,
  runPerformanceProbe,
  defaultMusicBrainzCachePath,
  getMusicBrainzCacheStatus,
  previewMusicBrainzOriginCountryImport,
  importMusicBrainzOriginCountries,
  cancelMusicBrainzOriginCountryImport,
  previewMusicBrainzArtistInfoImport,
  importMusicBrainzArtistInfos,
  cancelMusicBrainzArtistInfoImport,
  syncMusicBrainzOverlay,
  listMusicBrainzOverlaySyncLog,
} from "../../backend";
import {
  originPreviewMatchesFilter,
  originPreviewMatchesSearch,
  artistInfoPreviewMatchesFilter,
  artistInfoPreviewMatchesSearch,
  overlayAutoSyncMinutesValue,
  updateAutoCheckMinutesValue,
  musicBrainzStateLabel,
  appUpdateProgressText,
  appUpdateStatusLabel,
} from "./settingsDisplay";
import {
  type OriginReportFilter,
  type ArtistInfoReportFilter,
} from "../../app/defaults";
import {
  type DatabaseBackup,
  type MusicBrainzOriginCountryImportProgress,
  type MusicBrainzArtistInfoImportProgress,
  type LeftSidebarMode,
  type RightSidebarMode,
  type CountryFlagDisplay,
} from "../../types";
import { formatDate, formatNumber } from "../../app/display";
import { numberValue } from "../../app/input";
import {
  checkForAppUpdate,
  installAppUpdate,
  listenToAppUpdateChecks,
  getAppUpdateStatus,
} from "../../app/updater";
import { subscribeWithSnapshot } from "../../app/backendEvents";
import { setAppUpdateIndicator } from "../../app/updateIndicator";
import type { WorkspaceStores } from "../../app/WorkspaceStoresProvider";
import type { useCatalogWorkspace } from "../../app/useCatalogWorkspace";
type Inputs = Pick<
  WorkspaceStores,
  | "setMusicBrainzOriginProgress"
  | "setMusicBrainzOriginLog"
  | "setMusicBrainzArtistInfoProgress"
  | "setMusicBrainzArtistInfoLog"
  | "settings"
  | "musicBrainzOriginStatus"
  | "musicBrainzOriginProgress"
  | "musicBrainzOriginReportSearch"
  | "musicBrainzOriginPreview"
  | "musicBrainzOriginReportFilter"
  | "musicBrainzArtistInfoProgress"
  | "musicBrainzArtistInfoReportSearch"
  | "musicBrainzArtistInfoPreview"
  | "musicBrainzArtistInfoReportFilter"
  | "isRestoringBackup"
  | "setIsRestoringBackup"
  | "setBackupError"
  | "setRestoreSummary"
  | "setDiscoveryError"
  | "setIsDiscoveryLoading"
  | "setIsPerformanceProbeRunning"
  | "setPerformanceProbeError"
  | "setPerformanceProbe"
  | "musicBrainzCachePathDraft"
  | "setIsMusicBrainzChecking"
  | "setMusicBrainzStatusError"
  | "setMusicBrainzStatus"
  | "setMusicBrainzCachePathDraft"
  | "setIsMusicBrainzOriginPreviewing"
  | "setMusicBrainzOriginError"
  | "setMusicBrainzOriginImportSummary"
  | "setMusicBrainzOriginPreview"
  | "setIsMusicBrainzOriginImporting"
  | "setIsMusicBrainzArtistInfoPreviewing"
  | "setMusicBrainzArtistInfoError"
  | "setMusicBrainzArtistInfoImportSummary"
  | "setMusicBrainzArtistInfoPreview"
  | "setIsMusicBrainzArtistInfoImporting"
  | "musicBrainzArtistInfoStatus"
  | "isMusicBrainzOverlaySyncingRef"
  | "musicBrainzOverlaySyncPathDraft"
  | "setMusicBrainzOverlaySyncError"
  | "setIsMusicBrainzOverlaySyncing"
  | "setMusicBrainzOverlaySyncResult"
  | "setMusicBrainzOverlaySyncLog"
  | "musicBrainzOverlayAutoSyncDraft"
  | "setMusicBrainzOverlayAutoSyncDraft"
  | "appUpdateAutoCheckDraft"
  | "setAppUpdateAutoCheckDraft"
  | "setAppUpdateStatus"
  | "setAppUpdateError"
  | "setIsAppUpdateBannerDismissed"
  | "isAppUpdateCheckingRef"
  | "isAppUpdateInstallingRef"
  | "setAppUpdateProgress"
  | "setAppUpdateLastCheckedAt"
  | "appUpdateRef"
  | "setAppUpdateInfo"
  | "appUpdateInfo"
  | "setLeftSidebarMode"
  | "setRightSidebarMode"
  | "musicBrainzStatus"
  | "appUpdateStatus"
  | "appUpdateProgress"
  | "appUpdateLastCheckedAt"
  | "isAppUpdateBannerDismissed"
  | "appUpdateError"
> &
  Pick<
    ReturnType<typeof useCatalogWorkspace>,
    | "loadData"
    | "loadDiscoveryData"
    | "saveAppSettings"
    | "refreshMusicBrainzOriginCountryStatus"
    | "refreshOriginJoinedViews"
    | "refreshMusicBrainzArtistInfoStatus"
    | "refreshSelectedArtistAfterOverlaySync"
    | "canImport"
  >;

export function useSettingsWorkspace({
  setMusicBrainzOriginProgress,
  setMusicBrainzOriginLog,
  setMusicBrainzArtistInfoProgress,
  setMusicBrainzArtistInfoLog,
  settings,
  musicBrainzOriginStatus,
  musicBrainzOriginProgress,
  musicBrainzOriginReportSearch,
  musicBrainzOriginPreview,
  musicBrainzOriginReportFilter,
  musicBrainzArtistInfoProgress,
  musicBrainzArtistInfoReportSearch,
  musicBrainzArtistInfoPreview,
  musicBrainzArtistInfoReportFilter,
  isRestoringBackup,
  setIsRestoringBackup,
  setBackupError,
  setRestoreSummary,
  setDiscoveryError,
  setIsDiscoveryLoading,
  setIsPerformanceProbeRunning,
  setPerformanceProbeError,
  setPerformanceProbe,
  musicBrainzCachePathDraft,
  setIsMusicBrainzChecking,
  setMusicBrainzStatusError,
  setMusicBrainzStatus,
  setMusicBrainzCachePathDraft,
  setIsMusicBrainzOriginPreviewing,
  setMusicBrainzOriginError,
  setMusicBrainzOriginImportSummary,
  setMusicBrainzOriginPreview,
  setIsMusicBrainzOriginImporting,
  setIsMusicBrainzArtistInfoPreviewing,
  setMusicBrainzArtistInfoError,
  setMusicBrainzArtistInfoImportSummary,
  setMusicBrainzArtistInfoPreview,
  setIsMusicBrainzArtistInfoImporting,
  musicBrainzArtistInfoStatus,
  isMusicBrainzOverlaySyncingRef,
  musicBrainzOverlaySyncPathDraft,
  setMusicBrainzOverlaySyncError,
  setIsMusicBrainzOverlaySyncing,
  setMusicBrainzOverlaySyncResult,
  setMusicBrainzOverlaySyncLog,
  musicBrainzOverlayAutoSyncDraft,
  setMusicBrainzOverlayAutoSyncDraft,
  appUpdateAutoCheckDraft,
  setAppUpdateAutoCheckDraft,
  setAppUpdateStatus,
  setAppUpdateError,
  setIsAppUpdateBannerDismissed,
  isAppUpdateCheckingRef,
  isAppUpdateInstallingRef,
  setAppUpdateProgress,
  setAppUpdateLastCheckedAt,
  appUpdateRef,
  setAppUpdateInfo,
  appUpdateInfo,
  setLeftSidebarMode,
  setRightSidebarMode,
  musicBrainzStatus,
  appUpdateStatus,
  appUpdateProgress,
  appUpdateLastCheckedAt,
  isAppUpdateBannerDismissed,
  appUpdateError,
  loadData,
  loadDiscoveryData,
  saveAppSettings,
  refreshMusicBrainzOriginCountryStatus,
  refreshOriginJoinedViews,
  refreshMusicBrainzArtistInfoStatus,
  refreshSelectedArtistAfterOverlaySync,
  canImport,
}: Inputs) {
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    void listenToMusicBrainzOriginCountryImportProgress((nextProgress) => {
      setMusicBrainzOriginProgress(nextProgress);
      setMusicBrainzOriginLog((previous) =>
        [nextProgress, ...previous].slice(0, 80),
      );
    }).then((nextUnlisten) => {
      unlisten = nextUnlisten;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    void listenToMusicBrainzArtistInfoImportProgress((nextProgress) => {
      setMusicBrainzArtistInfoProgress(nextProgress);
      setMusicBrainzArtistInfoLog((previous) =>
        [nextProgress, ...previous].slice(0, 80),
      );
    }).then((nextUnlisten) => {
      unlisten = nextUnlisten;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.darkMode
      ? "dark"
      : "light";
  }, [settings.darkMode]);

  const originCountryOptions = musicBrainzOriginStatus?.countries ?? [];

  const musicBrainzOriginProgressPercent = useMemo(() => {
    if (!musicBrainzOriginProgress) {
      return 0;
    }
    return Math.min(100, Math.max(0, musicBrainzOriginProgress.percent ?? 0));
  }, [musicBrainzOriginProgress]);

  const musicBrainzOriginReportQuery = musicBrainzOriginReportSearch
    .trim()
    .toLowerCase();

  const musicBrainzOriginReportRows = useMemo(() => {
    const rows = musicBrainzOriginPreview?.rows ?? [];
    return rows.filter(
      (row) =>
        originPreviewMatchesFilter(row, musicBrainzOriginReportFilter) &&
        originPreviewMatchesSearch(row, musicBrainzOriginReportQuery),
    );
  }, [
    musicBrainzOriginPreview,
    musicBrainzOriginReportFilter,
    musicBrainzOriginReportQuery,
  ]);

  const musicBrainzOriginVisibleReportRows = musicBrainzOriginReportRows.slice(
    0,
    250,
  );

  const musicBrainzOriginReportCounts = useMemo(() => {
    const rows = musicBrainzOriginPreview?.rows ?? [];
    return rows.reduce(
      (counts, row) => {
        counts.all += 1;
        if (row.status === "skipped" || row.status === "unresolved") {
          counts.needsAttention += 1;
        }
        if (row.status === "skipped") {
          counts.skipped += 1;
        } else if (row.status === "unresolved") {
          counts.unresolved += 1;
        } else if (row.status === "eligible") {
          counts.eligible += 1;
        } else if (
          row.status === "alreadyImported" ||
          row.status === "manual"
        ) {
          counts.imported += 1;
        }
        return counts;
      },
      {
        needsAttention: 0,
        skipped: 0,
        unresolved: 0,
        eligible: 0,
        imported: 0,
        all: 0,
      } satisfies Record<OriginReportFilter, number>,
    );
  }, [musicBrainzOriginPreview]);

  const musicBrainzArtistInfoProgressPercent = useMemo(() => {
    if (!musicBrainzArtistInfoProgress) {
      return 0;
    }
    return Math.min(100, Math.max(0, musicBrainzArtistInfoProgress.percent ?? 0));
  }, [musicBrainzArtistInfoProgress]);

  const musicBrainzArtistInfoReportQuery = musicBrainzArtistInfoReportSearch
    .trim()
    .toLowerCase();

  const musicBrainzArtistInfoReportRows = useMemo(() => {
    const rows = musicBrainzArtistInfoPreview?.rows ?? [];
    return rows.filter(
      (row) =>
        artistInfoPreviewMatchesFilter(
          row,
          musicBrainzArtistInfoReportFilter,
        ) &&
        artistInfoPreviewMatchesSearch(row, musicBrainzArtistInfoReportQuery),
    );
  }, [
    musicBrainzArtistInfoPreview,
    musicBrainzArtistInfoReportFilter,
    musicBrainzArtistInfoReportQuery,
  ]);

  const musicBrainzArtistInfoVisibleReportRows =
    musicBrainzArtistInfoReportRows.slice(0, 250);

  const musicBrainzArtistInfoReportCounts = useMemo(() => {
    const rows = musicBrainzArtistInfoPreview?.rows ?? [];
    return rows.reduce(
      (counts, row) => {
        counts.all += 1;
        const artistType = row.existingArtistType?.trim().toLowerCase();
        if (row.status === "skipped" || row.status === "unresolved") {
          counts.needsAttention += 1;
        }
        if (row.status === "eligible") {
          counts.eligible += 1;
        } else if (row.status === "alreadyImported") {
          counts.imported += 1;
        }
        if (artistType === "person") {
          counts.person += 1;
        } else if (artistType === "group") {
          counts.group += 1;
        }
        return counts;
      },
      {
        needsAttention: 0,
        eligible: 0,
        imported: 0,
        person: 0,
        group: 0,
        all: 0,
      } satisfies Record<ArtistInfoReportFilter, number>,
    );
  }, [musicBrainzArtistInfoPreview]);

  async function restoreBackup(backup: DatabaseBackup) {
    if (!backup.canRestore || isRestoringBackup) {
      return;
    }

    const confirmed = window.confirm(
      [
        `Restore database backup from ${formatDate(backup.createdAt)}?`,
        "",
        backup.backupPath,
        "",
        "The current database will be copied to a pre-restore backup first.",
      ].join("\n"),
    );
    if (!confirmed) {
      return;
    }

    setIsRestoringBackup(true);
    setBackupError(null);
    setRestoreSummary(null);

    try {
      const summary = await restoreDatabaseBackup(backup.backupPath);
      clearCoverImageCache();
      setRestoreSummary(summary);
      await loadData();
      await loadDiscoveryData().catch((error) => {
        setDiscoveryError(
          error instanceof Error ? error.message : String(error),
        );
        setIsDiscoveryLoading(false);
      });
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRestoringBackup(false);
    }
  }

  async function runSettingsPerformanceProbe() {
    setIsPerformanceProbeRunning(true);
    setPerformanceProbeError(null);

    try {
      const result = await runPerformanceProbe();
      setPerformanceProbe(result);
    } catch (error) {
      setPerformanceProbeError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIsPerformanceProbeRunning(false);
    }
  }

  async function checkMusicBrainzCache() {
    const cachePath =
      musicBrainzCachePathDraft.trim() || defaultMusicBrainzCachePath;
    setIsMusicBrainzChecking(true);
    setMusicBrainzStatusError(null);

    try {
      await saveAppSettings({ musicBrainzCachePath: cachePath });
      const result = await getMusicBrainzCacheStatus(cachePath);
      setMusicBrainzStatus(result);
      setMusicBrainzCachePathDraft(result.cachePath);
    } catch (error) {
      setMusicBrainzStatusError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIsMusicBrainzChecking(false);
    }
  }

  async function previewMusicBrainzOriginCountries() {
    setIsMusicBrainzOriginPreviewing(true);
    setMusicBrainzOriginError(null);
    setMusicBrainzOriginImportSummary(null);

    try {
      const result = await previewMusicBrainzOriginCountryImport({});
      setMusicBrainzOriginPreview(result);
      await refreshMusicBrainzOriginCountryStatus();
    } catch (error) {
      setMusicBrainzOriginError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIsMusicBrainzOriginPreviewing(false);
    }
  }

  async function runMusicBrainzOriginCountryImport() {
    setIsMusicBrainzOriginImporting(true);
    setMusicBrainzOriginError(null);
    setMusicBrainzOriginImportSummary(null);
    const startingProgress: MusicBrainzOriginCountryImportProgress = {
      status: "preparing",
      totalArtists: musicBrainzOriginStatus?.totalAlbumArtists ?? 0,
      eligibleCount: 0,
      processedCount: 0,
      remainingCount: 0,
      fetchedCount: 0,
      storedCount: 0,
      skippedCount: 0,
      unresolvedCount: 0,
      failedCount: 0,
      percent: 0,
      currentArtist: null,
      currentArtistKey: null,
      currentMbid: null,
      message: "Preparing MusicBrainz origin-country import.",
    };
    setMusicBrainzOriginProgress(startingProgress);
    setMusicBrainzOriginLog([startingProgress]);

    try {
      const result = await importMusicBrainzOriginCountries({});
      setMusicBrainzOriginImportSummary(result);
      const preview = await previewMusicBrainzOriginCountryImport({});
      setMusicBrainzOriginPreview(preview);
      await refreshMusicBrainzOriginCountryStatus();
      refreshOriginJoinedViews();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMusicBrainzOriginError(message);
      const failedProgress: MusicBrainzOriginCountryImportProgress = {
        status: "failed",
        totalArtists:
          musicBrainzOriginProgress?.totalArtists ??
          musicBrainzOriginStatus?.totalAlbumArtists ??
          0,
        eligibleCount: musicBrainzOriginProgress?.eligibleCount ?? 0,
        processedCount: musicBrainzOriginProgress?.processedCount ?? 0,
        remainingCount: musicBrainzOriginProgress?.remainingCount ?? 0,
        fetchedCount: musicBrainzOriginProgress?.fetchedCount ?? 0,
        storedCount: musicBrainzOriginProgress?.storedCount ?? 0,
        skippedCount: musicBrainzOriginProgress?.skippedCount ?? 0,
        unresolvedCount: musicBrainzOriginProgress?.unresolvedCount ?? 0,
        failedCount: musicBrainzOriginProgress?.failedCount ?? 1,
        percent: musicBrainzOriginProgress?.percent ?? 0,
        currentArtist: musicBrainzOriginProgress?.currentArtist ?? null,
        currentArtistKey: musicBrainzOriginProgress?.currentArtistKey ?? null,
        currentMbid: musicBrainzOriginProgress?.currentMbid ?? null,
        message,
      };
      setMusicBrainzOriginProgress(failedProgress);
      setMusicBrainzOriginLog((previous) =>
        [failedProgress, ...previous].slice(0, 80),
      );
    } finally {
      setIsMusicBrainzOriginImporting(false);
    }
  }

  async function cancelMusicBrainzOriginImport() {
    try {
      setMusicBrainzOriginProgress((current) =>
        current
          ? {
              ...current,
              status: "cancelling",
              message:
                "Cancellation requested. Waiting for the current MusicBrainz request to finish.",
            }
          : current,
      );
      await cancelMusicBrainzOriginCountryImport();
    } catch (error) {
      setMusicBrainzOriginError(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async function previewMusicBrainzArtistInfos() {
    setIsMusicBrainzArtistInfoPreviewing(true);
    setMusicBrainzArtistInfoError(null);
    setMusicBrainzArtistInfoImportSummary(null);

    try {
      const result = await previewMusicBrainzArtistInfoImport({});
      setMusicBrainzArtistInfoPreview(result);
      await refreshMusicBrainzArtistInfoStatus();
    } catch (error) {
      setMusicBrainzArtistInfoError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIsMusicBrainzArtistInfoPreviewing(false);
    }
  }

  async function runMusicBrainzArtistInfoImport() {
    setIsMusicBrainzArtistInfoImporting(true);
    setMusicBrainzArtistInfoError(null);
    setMusicBrainzArtistInfoImportSummary(null);
    const startingProgress: MusicBrainzArtistInfoImportProgress = {
      status: "preparing",
      totalArtists: musicBrainzArtistInfoStatus?.totalAlbumArtists ?? 0,
      eligibleCount: 0,
      processedCount: 0,
      remainingCount: 0,
      fetchedCount: 0,
      storedCount: 0,
      skippedCount: 0,
      unresolvedCount: 0,
      failedCount: 0,
      percent: 0,
      currentArtist: null,
      currentArtistKey: null,
      currentMbid: null,
      message: "Preparing MusicBrainz artist-info import.",
    };
    setMusicBrainzArtistInfoProgress(startingProgress);
    setMusicBrainzArtistInfoLog([startingProgress]);

    try {
      const result = await importMusicBrainzArtistInfos({});
      setMusicBrainzArtistInfoImportSummary(result);
      const preview = await previewMusicBrainzArtistInfoImport({});
      setMusicBrainzArtistInfoPreview(preview);
      await refreshMusicBrainzArtistInfoStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setMusicBrainzArtistInfoError(message);
      const failedProgress: MusicBrainzArtistInfoImportProgress = {
        status: "failed",
        totalArtists:
          musicBrainzArtistInfoProgress?.totalArtists ??
          musicBrainzArtistInfoStatus?.totalAlbumArtists ??
          0,
        eligibleCount: musicBrainzArtistInfoProgress?.eligibleCount ?? 0,
        processedCount: musicBrainzArtistInfoProgress?.processedCount ?? 0,
        remainingCount: musicBrainzArtistInfoProgress?.remainingCount ?? 0,
        fetchedCount: musicBrainzArtistInfoProgress?.fetchedCount ?? 0,
        storedCount: musicBrainzArtistInfoProgress?.storedCount ?? 0,
        skippedCount: musicBrainzArtistInfoProgress?.skippedCount ?? 0,
        unresolvedCount: musicBrainzArtistInfoProgress?.unresolvedCount ?? 0,
        failedCount: musicBrainzArtistInfoProgress?.failedCount ?? 1,
        percent: musicBrainzArtistInfoProgress?.percent ?? 0,
        currentArtist: musicBrainzArtistInfoProgress?.currentArtist ?? null,
        currentArtistKey:
          musicBrainzArtistInfoProgress?.currentArtistKey ?? null,
        currentMbid: musicBrainzArtistInfoProgress?.currentMbid ?? null,
        message,
      };
      setMusicBrainzArtistInfoProgress(failedProgress);
      setMusicBrainzArtistInfoLog((previous) =>
        [failedProgress, ...previous].slice(0, 80),
      );
    } finally {
      setIsMusicBrainzArtistInfoImporting(false);
    }
  }

  async function cancelMusicBrainzArtistInfoImportRun() {
    try {
      setMusicBrainzArtistInfoProgress((current) =>
        current
          ? {
              ...current,
              status: "cancelling",
              message:
                "Cancellation requested. Waiting for the current MusicBrainz request to finish.",
            }
          : current,
      );
      await cancelMusicBrainzArtistInfoImport();
    } catch (error) {
      setMusicBrainzArtistInfoError(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async function runMusicBrainzOverlaySync() {
    if (isMusicBrainzOverlaySyncingRef.current) return;
    const syncPath = musicBrainzOverlaySyncPathDraft.trim();
    if (!syncPath) {
      setMusicBrainzOverlaySyncError(
        "Choose a shared MusicBrainz overlay sync database path before syncing.",
      );
      return;
    }
    isMusicBrainzOverlaySyncingRef.current = true;
    setIsMusicBrainzOverlaySyncing(true);
    setMusicBrainzOverlaySyncError(null);
    try {
      await saveAppSettings({ musicBrainzOverlaySyncPath: syncPath });
      const result = await syncMusicBrainzOverlay({ recordNoop: true });
      setMusicBrainzOverlaySyncResult(result);
      setMusicBrainzOverlaySyncLog(await listMusicBrainzOverlaySyncLog(12));
      await refreshSelectedArtistAfterOverlaySync();
    } catch (error) {
      setMusicBrainzOverlaySyncError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      isMusicBrainzOverlaySyncingRef.current = false;
      setIsMusicBrainzOverlaySyncing(false);
    }
  }

  async function commitMusicBrainzOverlayAutoSyncMinutes() {
    const nextAutoSyncMinutes = overlayAutoSyncMinutesValue(
      numberValue(musicBrainzOverlayAutoSyncDraft),
    );
    setMusicBrainzOverlayAutoSyncDraft(String(nextAutoSyncMinutes));
    await saveAppSettings({
      musicBrainzOverlayAutoSyncMinutes: nextAutoSyncMinutes,
    });
  }

  async function commitAppUpdateAutoCheckMinutes() {
    const nextAutoCheckMinutes = updateAutoCheckMinutesValue(
      numberValue(appUpdateAutoCheckDraft),
    );
    setAppUpdateAutoCheckDraft(String(nextAutoCheckMinutes));
    await saveAppSettings({ updateAutoCheckMinutes: nextAutoCheckMinutes });
  }

  const checkAppUpdate = useCallback(
    async (source: "startup" | "manual" | "auto" = "manual") => {
      if (!canImport) {
        if (source === "manual") {
          setAppUpdateStatus("error");
          setAppUpdateError("Desktop runtime required.");
          setIsAppUpdateBannerDismissed(false);
        }
        return;
      }

      if (isAppUpdateCheckingRef.current || isAppUpdateInstallingRef.current) {
        return;
      }

      isAppUpdateCheckingRef.current = true;
      setAppUpdateStatus("checking");
      setAppUpdateProgress(null);
      if (source === "manual") {
        setIsAppUpdateBannerDismissed(false);
      }
      setAppUpdateError(null);

      try {
        const result = await checkForAppUpdate();
        setAppUpdateLastCheckedAt(new Date().toISOString());
        if (result) {
          appUpdateRef.current = result.update;
          setAppUpdateInfo(result.info);
          setAppUpdateStatus("available");
          setIsAppUpdateBannerDismissed(false);
        } else {
          appUpdateRef.current = null;
          setAppUpdateInfo(null);
          setAppUpdateStatus("upToDate");
        }
      } catch (error) {
        if (source === "manual") {
          setAppUpdateLastCheckedAt(new Date().toISOString());
          setAppUpdateStatus("error");
          setAppUpdateError(
            error instanceof Error ? error.message : String(error),
          );
          setIsAppUpdateBannerDismissed(false);
        } else {
          setAppUpdateStatus((currentStatus) =>
            currentStatus === "checking" ? "idle" : currentStatus,
          );
        }
      } finally {
        isAppUpdateCheckingRef.current = false;
      }
    },
    [canImport],
  );

  async function runAppUpdateInstall() {
    if (isAppUpdateInstallingRef.current || !appUpdateRef.current) {
      return;
    }

    isAppUpdateInstallingRef.current = true;
    setAppUpdateStatus("downloading");
    setAppUpdateProgress(null);
    setAppUpdateError(null);
    setIsAppUpdateBannerDismissed(false);

    try {
      await installAppUpdate(appUpdateRef.current, (progress) => {
        setAppUpdateProgress(progress);
        setAppUpdateStatus(progress.phase);
      });
    } catch (error) {
      setAppUpdateStatus("error");
      setAppUpdateError(error instanceof Error ? error.message : String(error));
      isAppUpdateInstallingRef.current = false;
    }
  }

  useEffect(() => {
    if (!canImport) return;
    return subscribeWithSnapshot(
      listenToAppUpdateChecks,
      getAppUpdateStatus,
      (snapshot) => {
        if (
          !snapshot.checkedAt ||
          isAppUpdateInstallingRef.current ||
          isAppUpdateCheckingRef.current
        )
          return;
        setAppUpdateLastCheckedAt(snapshot.checkedAt);
        // Quiet background errors preserve a previously available update.
        if (snapshot.error && !snapshot.info) return;
        appUpdateRef.current = snapshot.info?.version ?? null;
        setAppUpdateInfo(snapshot.info);
        setAppUpdateStatus(snapshot.info ? "available" : "upToDate");
        setAppUpdateError(null);
        if (snapshot.info) setIsAppUpdateBannerDismissed(false);
      },
    );
  }, [canImport]);

  useEffect(() => {
    if (!canImport) {
      return;
    }

    void setAppUpdateIndicator(appUpdateInfo?.version ?? null).catch(
      (error) => {
        console.warn("Could not update the desktop update indicator.", error);
      },
    );
  }, [appUpdateInfo?.version, canImport]);

  function saveLeftSidebarDefault(mode: LeftSidebarMode) {
    setLeftSidebarMode(mode);
    void saveAppSettings({ leftSidebarDefault: mode });
  }

  function saveRightSidebarDefault(mode: RightSidebarMode) {
    setRightSidebarMode(mode);
    void saveAppSettings({ rightSidebarDefault: mode });
  }

  function saveCountryFlagDisplay(mode: CountryFlagDisplay) {
    void saveAppSettings({ countryFlagDisplay: mode });
  }

  const musicBrainzMetricTone: "neutral" | "teal" | "amber" =
    musicBrainzStatus?.state === "available"
      ? "teal"
      : musicBrainzStatus?.state === "warning"
        ? "amber"
        : "neutral";

  const musicBrainzStatusLabel = musicBrainzStateLabel(
    musicBrainzStatus?.state,
  );

  const musicBrainzStatusText = musicBrainzStatus
    ? `${musicBrainzStatusLabel} / ${formatNumber(musicBrainzStatus.artistCount)} artists`
    : "Not checked";

  const musicBrainzHasWarnings =
    (musicBrainzStatus?.suspiciousMappingCount ?? 0) > 0;

  const appUpdateIsBusy =
    appUpdateStatus === "checking" ||
    appUpdateStatus === "downloading" ||
    appUpdateStatus === "installing" ||
    appUpdateStatus === "restarting";

  const appUpdateCanInstall =
    appUpdateStatus === "available" && appUpdateRef.current != null;

  const appUpdateProgressLabel = appUpdateProgressText(appUpdateProgress);

  const appUpdateLastCheckedText = appUpdateLastCheckedAt
    ? formatDate(appUpdateLastCheckedAt)
    : "Not checked";

  const appUpdateAutoCheckMinutes = updateAutoCheckMinutesValue(
    settings.updateAutoCheckMinutes,
  );

  const appUpdateMetricValue =
    appUpdateStatus === "available" && appUpdateInfo
      ? `v${appUpdateInfo.version}`
      : appUpdateStatus === "downloading"
        ? appUpdateProgressLabel
        : appUpdateStatusLabel(appUpdateStatus);

  const appUpdatePanelText =
    appUpdateStatus === "available" && appUpdateInfo
      ? `Version ${appUpdateInfo.version} is ready`
      : appUpdateStatus === "downloading" ||
          appUpdateStatus === "installing" ||
          appUpdateStatus === "restarting"
        ? appUpdateProgressLabel
        : appUpdateStatus === "upToDate"
          ? `Last checked ${appUpdateLastCheckedText}`
          : appUpdateStatusLabel(appUpdateStatus);

  const appUpdateBannerVisible =
    !isAppUpdateBannerDismissed &&
    (appUpdateStatus === "available" ||
      appUpdateStatus === "downloading" ||
      appUpdateStatus === "installing" ||
      appUpdateStatus === "restarting" ||
      appUpdateStatus === "error");

  const appUpdateBannerTitle =
    appUpdateStatus === "available" && appUpdateInfo
      ? `Music Library ${appUpdateInfo.version} is available`
      : appUpdateStatus === "error"
        ? "Update check failed"
        : "Updating Music Library";

  const appUpdateBannerMessage =
    appUpdateStatus === "available" && appUpdateInfo
      ? `Installed version ${appUpdateInfo.currentVersion}.`
      : appUpdateStatus === "error"
        ? (appUpdateError ?? "Could not check for updates.")
        : appUpdateProgressLabel;
  return {
    originCountryOptions,
    musicBrainzOriginProgressPercent,
    musicBrainzOriginReportQuery,
    musicBrainzOriginReportRows,
    musicBrainzOriginVisibleReportRows,
    musicBrainzOriginReportCounts,
    musicBrainzArtistInfoProgressPercent,
    musicBrainzArtistInfoReportQuery,
    musicBrainzArtistInfoReportRows,
    musicBrainzArtistInfoVisibleReportRows,
    musicBrainzArtistInfoReportCounts,
    restoreBackup,
    runSettingsPerformanceProbe,
    checkMusicBrainzCache,
    previewMusicBrainzOriginCountries,
    runMusicBrainzOriginCountryImport,
    cancelMusicBrainzOriginImport,
    previewMusicBrainzArtistInfos,
    runMusicBrainzArtistInfoImport,
    cancelMusicBrainzArtistInfoImportRun,
    runMusicBrainzOverlaySync,
    commitMusicBrainzOverlayAutoSyncMinutes,
    commitAppUpdateAutoCheckMinutes,
    checkAppUpdate,
    runAppUpdateInstall,
    saveLeftSidebarDefault,
    saveRightSidebarDefault,
    saveCountryFlagDisplay,
    musicBrainzMetricTone,
    musicBrainzStatusLabel,
    musicBrainzStatusText,
    musicBrainzHasWarnings,
    appUpdateIsBusy,
    appUpdateCanInstall,
    appUpdateProgressLabel,
    appUpdateLastCheckedText,
    appUpdateAutoCheckMinutes,
    appUpdateMetricValue,
    appUpdatePanelText,
    appUpdateBannerVisible,
    appUpdateBannerTitle,
    appUpdateBannerMessage,
  };
}
