import { useEffect, useMemo } from "react";
import {
  listenToImportProgress,
  listenToCoverImportProgress,
  defaultImportSourcePath,
  defaultCoverSourcePath,
  defaultBillboardSourcePath,
  defaultBillboardSinglesSourcePath,
  defaultVgListaAlbumSourcePath,
  defaultVgListaSinglesSourcePath,
  defaultOfficialUkAlbumSourcePath,
  defaultOfficialUkSinglesSourcePath,
  defaultTiISkuddetSourcePath,
  defaultNorsktoppenSourcePath,
  prepareImportPreview,
  cancelImportPreview,
  selectTaggedAlbumFolder,
  applyImportPreview,
  rollbackImportRun,
  clearCoverImageCache,
  importAlbumCovers,
  importBillboardCharts,
  importVgListaAlbums,
  importOfficialUkAlbums,
  importBillboardSingles,
  importVgListaSingles,
  importOfficialUkSingles,
  importTiISkuddetSingles,
  importNorsktoppenSingles,
} from "../../backend";
import { textSettingValue } from "../settings/settingsDisplay";
import { defaultProgress, defaultCoverProgress } from "../../app/config";
import { formatNumber, formatDate } from "../../app/display";
import { type ImportSummary, type ImportRun } from "../../types";
import type { WorkspaceStores } from "../../app/WorkspaceStoresProvider";
import type { useCatalogWorkspace } from "../../app/useCatalogWorkspace";
type Inputs = Pick<
  WorkspaceStores,
  | "setProgress"
  | "setCoverProgress"
  | "runs"
  | "status"
  | "coverProgress"
  | "isImportingCovers"
  | "sourcePath"
  | "coverSourcePath"
  | "billboardSourcePath"
  | "billboardSinglesSourcePath"
  | "vgListaAlbumSourcePath"
  | "vgListaSinglesSourcePath"
  | "officialUkAlbumSourcePath"
  | "officialUkSinglesSourcePath"
  | "tiISkuddetSourcePath"
  | "norsktoppenSourcePath"
  | "persistedSettings"
  | "lastAutoSavedImportPathsRef"
  | "setIsImporting"
  | "setImportError"
  | "importPreview"
  | "setImportPreview"
  | "setIsCancellingImport"
  | "setSourcePath"
  | "setIsApplyingImport"
  | "setLatestAppliedImport"
  | "isRestoringBackup"
  | "setIsRestoringBackup"
  | "setBackupError"
  | "setRestoreSummary"
  | "setIsImportingCovers"
  | "setCoverImportError"
  | "setCoverImportSummary"
  | "coverExtractEmbeddedFallback"
  | "coverReplaceExisting"
  | "setRequest"
  | "setAlbumTimelineRefreshKey"
  | "setAlbumRequest"
  | "setChartConfig"
  | "setArtistAlbumsResponse"
  | "setGenreAlbumsResponse"
  | "setIsImportingBillboard"
  | "setBillboardImportError"
  | "setBillboardImportSummary"
  | "setVgListaAlbumImportSummary"
  | "setOfficialUkAlbumImportSummary"
  | "importAlbumChartsUs"
  | "importAlbumChartsNo"
  | "importAlbumChartsUk"
  | "setArtistRequest"
  | "setGenreRequest"
  | "setDiscoveryAlbumRequest"
  | "setDiscoveryAlbumResponse"
  | "setIsImportingBillboardSingles"
  | "setBillboardSinglesImportError"
  | "setBillboardSinglesImportSummary"
  | "setVgListaSinglesImportSummary"
  | "setOfficialUkSinglesImportSummary"
  | "setTiISkuddetImportSummary"
  | "setNorsktoppenImportSummary"
  | "importSingleChartsUs"
  | "importSingleChartsNo"
  | "importSingleChartsUk"
  | "importSingleChartsTiISkuddet"
  | "importSingleChartsNorsktoppen"
  | "setAlbumTracksResponse"
  | "setArtistAlbumTracksResponse"
> &
  Pick<ReturnType<typeof useCatalogWorkspace>, "saveAppSettings" | "loadData">;

export function useImportsWorkspace({
  setProgress,
  setCoverProgress,
  runs,
  status,
  coverProgress,
  isImportingCovers,
  sourcePath,
  coverSourcePath,
  billboardSourcePath,
  billboardSinglesSourcePath,
  vgListaAlbumSourcePath,
  vgListaSinglesSourcePath,
  officialUkAlbumSourcePath,
  officialUkSinglesSourcePath,
  tiISkuddetSourcePath,
  norsktoppenSourcePath,
  persistedSettings,
  lastAutoSavedImportPathsRef,
  setIsImporting,
  setImportError,
  importPreview,
  setImportPreview,
  setIsCancellingImport,
  setSourcePath,
  setIsApplyingImport,
  setLatestAppliedImport,
  isRestoringBackup,
  setIsRestoringBackup,
  setBackupError,
  setRestoreSummary,
  setIsImportingCovers,
  setCoverImportError,
  setCoverImportSummary,
  coverExtractEmbeddedFallback,
  coverReplaceExisting,
  setRequest,
  setAlbumTimelineRefreshKey,
  setAlbumRequest,
  setChartConfig,
  setArtistAlbumsResponse,
  setGenreAlbumsResponse,
  setIsImportingBillboard,
  setBillboardImportError,
  setBillboardImportSummary,
  setVgListaAlbumImportSummary,
  setOfficialUkAlbumImportSummary,
  importAlbumChartsUs,
  importAlbumChartsNo,
  importAlbumChartsUk,
  setArtistRequest,
  setGenreRequest,
  setDiscoveryAlbumRequest,
  setDiscoveryAlbumResponse,
  setIsImportingBillboardSingles,
  setBillboardSinglesImportError,
  setBillboardSinglesImportSummary,
  setVgListaSinglesImportSummary,
  setOfficialUkSinglesImportSummary,
  setTiISkuddetImportSummary,
  setNorsktoppenImportSummary,
  importSingleChartsUs,
  importSingleChartsNo,
  importSingleChartsUk,
  importSingleChartsTiISkuddet,
  importSingleChartsNorsktoppen,
  setAlbumTracksResponse,
  setArtistAlbumTracksResponse,
  saveAppSettings,
  loadData,
}: Inputs) {
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    void listenToImportProgress(setProgress).then((nextUnlisten) => {
      unlisten = nextUnlisten;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    void listenToCoverImportProgress(setCoverProgress).then((nextUnlisten) => {
      unlisten = nextUnlisten;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  const lastRun = runs[0] ?? status?.lastImport ?? null;

  const coverProgressPercent = useMemo(() => {
    if (coverProgress.status === "completed") return 100;
    if (coverProgress.scannedAlbums === 0) return isImportingCovers ? 4 : 0;
    return Math.min(99, Math.max(1, coverProgress.percent));
  }, [
    coverProgress.percent,
    coverProgress.scannedAlbums,
    coverProgress.status,
    isImportingCovers,
  ]);

  const normalizedImportPaths = useMemo(
    () => ({
      importSourcePath: textSettingValue(sourcePath, defaultImportSourcePath),
      coverSourcePath: textSettingValue(
        coverSourcePath,
        defaultCoverSourcePath,
      ),
      billboardSourcePath: textSettingValue(
        billboardSourcePath,
        defaultBillboardSourcePath,
      ),
      billboardSinglesSourcePath: textSettingValue(
        billboardSinglesSourcePath,
        defaultBillboardSinglesSourcePath,
      ),
      vgListaAlbumSourcePath: textSettingValue(
        vgListaAlbumSourcePath,
        defaultVgListaAlbumSourcePath,
      ),
      vgListaSinglesSourcePath: textSettingValue(
        vgListaSinglesSourcePath,
        defaultVgListaSinglesSourcePath,
      ),
      officialUkAlbumSourcePath: textSettingValue(
        officialUkAlbumSourcePath,
        defaultOfficialUkAlbumSourcePath,
      ),
      officialUkSinglesSourcePath: textSettingValue(
        officialUkSinglesSourcePath,
        defaultOfficialUkSinglesSourcePath,
      ),
      tiISkuddetSourcePath: textSettingValue(
        tiISkuddetSourcePath,
        defaultTiISkuddetSourcePath,
      ),
      norsktoppenSourcePath: textSettingValue(
        norsktoppenSourcePath,
        defaultNorsktoppenSourcePath,
      ),
    }),
    [
      billboardSinglesSourcePath,
      billboardSourcePath,
      coverSourcePath,
      sourcePath,
      vgListaAlbumSourcePath,
      vgListaSinglesSourcePath,
      officialUkAlbumSourcePath,
      officialUkSinglesSourcePath,
      tiISkuddetSourcePath,
      norsktoppenSourcePath,
    ],
  );

  const importPathsKey = useMemo(
    () => JSON.stringify(normalizedImportPaths),
    [normalizedImportPaths],
  );

  const importPathsDirty =
    normalizedImportPaths.importSourcePath !==
      persistedSettings.importSourcePath ||
    normalizedImportPaths.coverSourcePath !==
      persistedSettings.coverSourcePath ||
    normalizedImportPaths.billboardSourcePath !==
      persistedSettings.billboardSourcePath ||
    normalizedImportPaths.billboardSinglesSourcePath !==
      persistedSettings.billboardSinglesSourcePath ||
    normalizedImportPaths.vgListaAlbumSourcePath !==
      persistedSettings.vgListaAlbumSourcePath ||
    normalizedImportPaths.vgListaSinglesSourcePath !==
      persistedSettings.vgListaSinglesSourcePath ||
    normalizedImportPaths.officialUkAlbumSourcePath !==
      persistedSettings.officialUkAlbumSourcePath ||
    normalizedImportPaths.officialUkSinglesSourcePath !==
      persistedSettings.officialUkSinglesSourcePath ||
    normalizedImportPaths.tiISkuddetSourcePath !==
      persistedSettings.tiISkuddetSourcePath ||
    normalizedImportPaths.norsktoppenSourcePath !==
      persistedSettings.norsktoppenSourcePath;

  useEffect(() => {
    if (
      !importPathsDirty ||
      lastAutoSavedImportPathsRef.current === importPathsKey
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      lastAutoSavedImportPathsRef.current = importPathsKey;
      void saveAppSettings(normalizedImportPaths);
    }, 600);

    return () => window.clearTimeout(timeoutId);
  }, [importPathsDirty, importPathsKey, normalizedImportPaths]);

  async function prepareLibraryImport() {
    setIsImporting(true);
    setImportError(null);
    setProgress({
      ...defaultProgress,
      status: "starting",
      message:
        importPreview?.canResume && !importPreview.sourceChanged
          ? "Opening the last durable import checkpoint."
          : "Scanning the selected source before staging its delta.",
    });

    try {
      const preview = await prepareImportPreview(sourcePath);
      setImportPreview(preview);
      setProgress({
        status: preview.status,
        sessionId: preview.sessionId,
        processedRows: preview.processedRows,
        processedBytes: preview.processedBytes,
        totalBytes: preview.sourceSizeBytes,
        albumCount: preview.albumCount,
        message:
          preview.status === "ready"
            ? "Delta ready. Review it before applying the atomic import."
            : "Preparation stopped at a durable checkpoint.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const wasCancelled = message.toLowerCase().includes("cancelled safely");
      setImportError(wasCancelled ? null : message);
      setProgress((previous) => ({
        ...previous,
        status: wasCancelled ? "cancelled" : "failed",
        message: wasCancelled
          ? "Album folder scan cancelled before the active library changed."
          : message,
      }));
    } finally {
      setIsImporting(false);
      setIsCancellingImport(false);
    }
  }

  async function cancelLibraryImportPreparation() {
    setIsCancellingImport(true);
    setImportError(null);
    try {
      await cancelImportPreview();
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error));
      setIsCancellingImport(false);
    }
  }

  async function browseForImportAlbumFolder() {
    setImportError(null);
    try {
      const selected = await selectTaggedAlbumFolder(
        sourcePath.trim().toLowerCase().endsWith(".tsv")
          ? undefined
          : sourcePath,
      );
      if (!selected) {
        return;
      }
      setSourcePath(selected);
      setImportPreview(null);
      setProgress(defaultProgress);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error));
    }
  }

  async function applyPreparedLibraryImport() {
    if (!importPreview || importPreview.status !== "ready") {
      return;
    }
    const confirmed = window.confirm(
      [
        "Apply this prepared library update?",
        "",
        `${formatNumber(importPreview.addedAlbums)} added albums`,
        `${formatNumber(importPreview.changedAlbums)} changed albums`,
        `${formatNumber(importPreview.removedAlbums)} removed albums`,
        `${formatNumber(importPreview.suspiciousAlbumCount)} suspicious albums`,
        "",
        "A rollback backup will be created before the atomic replacement.",
      ].join("\n"),
    );
    if (!confirmed) {
      return;
    }

    setIsApplyingImport(true);
    setImportError(null);
    setProgress((previous) => ({
      ...previous,
      status: "applying",
      message: "Creating the rollback backup before the atomic apply.",
    }));
    try {
      const summary: ImportSummary = await applyImportPreview(
        importPreview.sessionId,
      );
      setLatestAppliedImport(summary.importRun);
      setImportPreview({
        ...importPreview,
        status: "completed",
        completedAt: summary.importRun.completedAt,
        importRunId: summary.importRun.id,
      });
      setProgress({
        status: "completed",
        sessionId: importPreview.sessionId,
        processedRows: summary.trackRows,
        processedBytes: importPreview.sourceSizeBytes,
        totalBytes: importPreview.sourceSizeBytes,
        albumCount: summary.albumCount,
        message:
          "Import applied. The generated backup is ready for one-click rollback.",
      });
      await loadData();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setImportError(message);
      setProgress((previous) => ({
        ...previous,
        status: "failed",
        message,
      }));
    } finally {
      setIsApplyingImport(false);
    }
  }

  async function rollbackCompletedImport(run: ImportRun) {
    if (!run.backupPath || isRestoringBackup) {
      return;
    }
    const confirmed = window.confirm(
      [
        `Roll back import from ${formatDate(run.startedAt)}?`,
        "",
        run.backupPath,
        "",
        "The current database will be copied to a pre-rollback safety backup first.",
      ].join("\n"),
    );
    if (!confirmed) {
      return;
    }

    setIsRestoringBackup(true);
    setImportError(null);
    setBackupError(null);
    try {
      const summary = await rollbackImportRun(run.id);
      clearCoverImageCache();
      setRestoreSummary(summary);
      setLatestAppliedImport(null);
      setImportPreview(null);
      setProgress({
        ...defaultProgress,
        status: "completed",
        message: `Rolled back to ${formatDate(run.startedAt)} backup.`,
      });
      await loadData();
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRestoringBackup(false);
    }
  }

  async function startCoverImport() {
    setIsImportingCovers(true);
    setCoverImportError(null);
    setCoverImportSummary(null);
    setCoverProgress({
      ...defaultCoverProgress,
      status: "running",
      message: "Scanning album folders for cover art.",
    });

    try {
      const summary = await importAlbumCovers({
        sourcePath: coverSourcePath,
        extractEmbeddedFallback: coverExtractEmbeddedFallback,
        replaceExisting: coverReplaceExisting,
      });
      setCoverImportSummary(summary);
      setCoverProgress({
        status: "completed",
        totalAlbums: summary.totalAlbums,
        scannedAlbums: summary.scannedAlbums,
        newCoversFound: summary.newCoversFound,
        importedCovers: summary.importedCovers,
        relinkedCovers: summary.relinkedCovers,
        skippedExisting: summary.skippedExisting,
        missingCovers: summary.missingCovers,
        percent: 100,
        message: "Cover import completed.",
      });
      clearCoverImageCache();
      await loadData();
      setRequest((current) => ({ ...current }));
      setAlbumTimelineRefreshKey((previous) => previous + 1);
      setAlbumRequest((current) => ({ ...current }));
      setChartConfig((current) => ({ ...current }));
      setArtistAlbumsResponse(null);
      setGenreAlbumsResponse(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCoverImportError(message);
      setCoverProgress((current) => ({
        ...current,
        status: "failed",
        message,
      }));
    } finally {
      setIsImportingCovers(false);
    }
  }

  async function startBillboardImport() {
    setIsImportingBillboard(true);
    setBillboardImportError(null);
    setBillboardImportSummary(null);
    setVgListaAlbumImportSummary(null);
    setOfficialUkAlbumImportSummary(null);

    try {
      const errors: string[] = [];
      let completed = false;
      if (importAlbumChartsUs) {
        try {
          setBillboardImportSummary(
            await importBillboardCharts(billboardSourcePath),
          );
          completed = true;
        } catch (error) {
          errors.push(
            `US: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      if (importAlbumChartsNo) {
        try {
          setVgListaAlbumImportSummary(
            await importVgListaAlbums(vgListaAlbumSourcePath),
          );
          completed = true;
        } catch (error) {
          errors.push(
            `Norway: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      if (importAlbumChartsUk) {
        try {
          setOfficialUkAlbumImportSummary(
            await importOfficialUkAlbums(officialUkAlbumSourcePath),
          );
          completed = true;
        } catch (error) {
          errors.push(
            `UK: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      if (completed) {
        await loadData();
        setRequest((current) => ({ ...current }));
        setAlbumTimelineRefreshKey((previous) => previous + 1);
        setAlbumRequest((current) => ({ ...current }));
        setChartConfig((current) => ({ ...current }));
        setArtistRequest((current) => ({ ...current }));
        setGenreRequest((current) => ({ ...current }));
        setDiscoveryAlbumRequest((current) => ({ ...current }));
        setArtistAlbumsResponse(null);
        setGenreAlbumsResponse(null);
        setDiscoveryAlbumResponse(null);
      }
      setBillboardImportError(errors.length > 0 ? errors.join(" · ") : null);
    } catch (error) {
      setBillboardImportError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIsImportingBillboard(false);
    }
  }

  async function startBillboardSinglesImport() {
    setIsImportingBillboardSingles(true);
    setBillboardSinglesImportError(null);
    setBillboardSinglesImportSummary(null);
    setVgListaSinglesImportSummary(null);
    setOfficialUkSinglesImportSummary(null);
    setTiISkuddetImportSummary(null);
    setNorsktoppenImportSummary(null);

    try {
      const errors: string[] = [];
      let completed = false;
      if (importSingleChartsUs) {
        try {
          setBillboardSinglesImportSummary(
            await importBillboardSingles(billboardSinglesSourcePath),
          );
          completed = true;
        } catch (error) {
          errors.push(
            `US: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      if (importSingleChartsNo) {
        try {
          setVgListaSinglesImportSummary(
            await importVgListaSingles(vgListaSinglesSourcePath),
          );
          completed = true;
        } catch (error) {
          errors.push(
            `Norway: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      if (importSingleChartsUk) {
        try {
          setOfficialUkSinglesImportSummary(
            await importOfficialUkSingles(officialUkSinglesSourcePath),
          );
          completed = true;
        } catch (error) {
          errors.push(
            `UK: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      if (importSingleChartsTiISkuddet) {
        try {
          setTiISkuddetImportSummary(
            await importTiISkuddetSingles(tiISkuddetSourcePath),
          );
          completed = true;
        } catch (error) {
          errors.push(
            `Ti i Skuddet: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      if (importSingleChartsNorsktoppen) {
        try {
          setNorsktoppenImportSummary(
            await importNorsktoppenSingles(norsktoppenSourcePath),
          );
          completed = true;
        } catch (error) {
          errors.push(
            `Norsktoppen: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      if (completed) {
        await loadData();
        setRequest((current) => ({ ...current }));
        setAlbumTimelineRefreshKey((previous) => previous + 1);
        setAlbumTracksResponse(null);
        setArtistAlbumTracksResponse(null);
        setGenreAlbumsResponse(null);
        setDiscoveryAlbumResponse(null);
      }
      setBillboardSinglesImportError(
        errors.length > 0 ? errors.join(" · ") : null,
      );
    } catch (error) {
      setBillboardSinglesImportError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIsImportingBillboardSingles(false);
    }
  }

  async function saveImportPathSettings() {
    await saveAppSettings(normalizedImportPaths);
  }
  return {
    lastRun,
    coverProgressPercent,
    normalizedImportPaths,
    importPathsKey,
    importPathsDirty,
    prepareLibraryImport,
    cancelLibraryImportPreparation,
    browseForImportAlbumFolder,
    applyPreparedLibraryImport,
    rollbackCompletedImport,
    startCoverImport,
    startBillboardImport,
    startBillboardSinglesImport,
    saveImportPathSettings,
  };
}
