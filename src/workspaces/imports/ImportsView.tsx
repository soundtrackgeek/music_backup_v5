import {
  Save,
  RotateCcw,
  ListMusic,
  Album,
  Clock3,
  Database,
  Play,
  BarChart3,
  FileSearch,
} from "lucide-react";
import { Metric, RunStatus } from "../../components/catalog/CatalogValues";
import { formatNumber, formatDate, formatDuration } from "../../app/display";
import { ImportSafetyPanel } from "../../components/ImportSafetyPanel";
import { defaultProgress } from "../../app/config";
import type { AppModel } from "../../app/useAppController";
export function ImportsView({
  model,
}: {
  model: Pick<
    AppModel,
    | "isSavingSettings"
    | "importPathsDirty"
    | "saveImportPathSettings"
    | "loadData"
    | "status"
    | "settingsError"
    | "sourcePath"
    | "importPreview"
    | "progress"
    | "latestAppliedImport"
    | "importError"
    | "isImporting"
    | "isApplyingImport"
    | "isCancellingImport"
    | "setSourcePath"
    | "setImportPreview"
    | "setProgress"
    | "setImportError"
    | "browseForImportAlbumFolder"
    | "prepareLibraryImport"
    | "cancelLibraryImportPreparation"
    | "applyPreparedLibraryImport"
    | "rollbackCompletedImport"
    | "coverProgress"
    | "coverSourcePath"
    | "setCoverSourcePath"
    | "isImportingCovers"
    | "coverExtractEmbeddedFallback"
    | "setCoverExtractEmbeddedFallback"
    | "coverReplaceExisting"
    | "setCoverReplaceExisting"
    | "coverProgressPercent"
    | "coverImportError"
    | "coverImportSummary"
    | "startCoverImport"
    | "canImport"
    | "isImportingBillboard"
    | "billboardImportSummary"
    | "vgListaAlbumImportSummary"
    | "officialUkAlbumImportSummary"
    | "importAlbumChartsUs"
    | "setImportAlbumChartsUs"
    | "importAlbumChartsNo"
    | "setImportAlbumChartsNo"
    | "importAlbumChartsUk"
    | "setImportAlbumChartsUk"
    | "billboardSourcePath"
    | "setBillboardSourcePath"
    | "vgListaAlbumSourcePath"
    | "setVgListaAlbumSourcePath"
    | "officialUkAlbumSourcePath"
    | "setOfficialUkAlbumSourcePath"
    | "billboardImportError"
    | "startBillboardImport"
    | "isImportingBillboardSingles"
    | "billboardSinglesImportSummary"
    | "vgListaSinglesImportSummary"
    | "officialUkSinglesImportSummary"
    | "tiISkuddetImportSummary"
    | "norsktoppenImportSummary"
    | "importSingleChartsUs"
    | "setImportSingleChartsUs"
    | "importSingleChartsNo"
    | "setImportSingleChartsNo"
    | "importSingleChartsUk"
    | "setImportSingleChartsUk"
    | "importSingleChartsTiISkuddet"
    | "setImportSingleChartsTiISkuddet"
    | "importSingleChartsNorsktoppen"
    | "setImportSingleChartsNorsktoppen"
    | "billboardSinglesSourcePath"
    | "setBillboardSinglesSourcePath"
    | "tiISkuddetSourcePath"
    | "setTiISkuddetSourcePath"
    | "vgListaSinglesSourcePath"
    | "setVgListaSinglesSourcePath"
    | "officialUkSinglesSourcePath"
    | "setOfficialUkSinglesSourcePath"
    | "norsktoppenSourcePath"
    | "setNorsktoppenSourcePath"
    | "billboardSinglesImportError"
    | "startBillboardSinglesImport"
    | "runs"
  >;
}) {
  const {
    isSavingSettings,
    importPathsDirty,
    saveImportPathSettings,
    loadData,
    status,
    settingsError,
    sourcePath,
    importPreview,
    progress,
    latestAppliedImport,
    importError,
    isImporting,
    isApplyingImport,
    isCancellingImport,
    setSourcePath,
    setImportPreview,
    setProgress,
    setImportError,
    browseForImportAlbumFolder,
    prepareLibraryImport,
    cancelLibraryImportPreparation,
    applyPreparedLibraryImport,
    rollbackCompletedImport,
    coverProgress,
    coverSourcePath,
    setCoverSourcePath,
    isImportingCovers,
    coverExtractEmbeddedFallback,
    setCoverExtractEmbeddedFallback,
    coverReplaceExisting,
    setCoverReplaceExisting,
    coverProgressPercent,
    coverImportError,
    coverImportSummary,
    startCoverImport,
    canImport,
    isImportingBillboard,
    billboardImportSummary,
    vgListaAlbumImportSummary,
    officialUkAlbumImportSummary,
    importAlbumChartsUs,
    setImportAlbumChartsUs,
    importAlbumChartsNo,
    setImportAlbumChartsNo,
    importAlbumChartsUk,
    setImportAlbumChartsUk,
    billboardSourcePath,
    setBillboardSourcePath,
    vgListaAlbumSourcePath,
    setVgListaAlbumSourcePath,
    officialUkAlbumSourcePath,
    setOfficialUkAlbumSourcePath,
    billboardImportError,
    startBillboardImport,
    isImportingBillboardSingles,
    billboardSinglesImportSummary,
    vgListaSinglesImportSummary,
    officialUkSinglesImportSummary,
    tiISkuddetImportSummary,
    norsktoppenImportSummary,
    importSingleChartsUs,
    setImportSingleChartsUs,
    importSingleChartsNo,
    setImportSingleChartsNo,
    importSingleChartsUk,
    setImportSingleChartsUk,
    importSingleChartsTiISkuddet,
    setImportSingleChartsTiISkuddet,
    importSingleChartsNorsktoppen,
    setImportSingleChartsNorsktoppen,
    billboardSinglesSourcePath,
    setBillboardSinglesSourcePath,
    tiISkuddetSourcePath,
    setTiISkuddetSourcePath,
    vgListaSinglesSourcePath,
    setVgListaSinglesSourcePath,
    officialUkSinglesSourcePath,
    setOfficialUkSinglesSourcePath,
    norsktoppenSourcePath,
    setNorsktoppenSourcePath,
    billboardSinglesImportError,
    startBillboardSinglesImport,
    runs,
  } = model;
  return (
    <section className="workspace">
      <header className="topbar">
        <div>
          <h1>Imports</h1>
          <p>
            Sync one already-tagged MP3 album folder, or use the legacy MusicBee
            TSV route. Path edits save automatically.
          </p>
        </div>
        <div className="topbar-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={isSavingSettings || !importPathsDirty}
            onClick={() => void saveImportPathSettings()}
            title={
              importPathsDirty
                ? "Save import paths now"
                : "Import paths are saved"
            }
          >
            <Save size={16} />
            <span>
              {isSavingSettings
                ? "Saving"
                : importPathsDirty
                  ? "Save paths"
                  : "Paths saved"}
            </span>
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="Refresh"
            onClick={() => void loadData()}
          >
            <RotateCcw size={18} />
          </button>
        </div>
      </header>

      <section className="metric-grid" aria-label="Library summary">
        <Metric
          label="Raw tracks"
          value={formatNumber(status?.trackCount)}
          tone="teal"
          icon={ListMusic}
        />
        <Metric
          label="Album aggregates"
          value={formatNumber(status?.albumCount)}
          tone="amber"
          icon={Album}
        />
        <Metric
          label="Cover images"
          value={formatNumber(status?.coverCount)}
          icon={Album}
        />
        <Metric
          label="Import runs"
          value={formatNumber(status?.importRunCount)}
          icon={Clock3}
        />
        <Metric
          label="Database"
          value={status?.hasDatabase ? "Ready" : "New"}
          icon={Database}
        />
      </section>

      {settingsError ? <p className="error-message">{settingsError}</p> : null}

      <ImportSafetyPanel
        sourcePath={sourcePath}
        preview={importPreview}
        progress={progress}
        latestAppliedRun={latestAppliedImport}
        databasePath={status?.dbPath ?? null}
        error={importError}
        isPreparing={isImporting}
        isApplying={isApplyingImport}
        isCancelling={isCancellingImport}
        onSourcePathChange={(value) => {
          setSourcePath(value);
          if (importPreview?.sourcePath !== value) {
            setImportPreview(null);
            setProgress(defaultProgress);
            setImportError(null);
          }
        }}
        onBrowseFolder={() => void browseForImportAlbumFolder()}
        onPrepare={() => void prepareLibraryImport()}
        onCancel={() => void cancelLibraryImportPreparation()}
        onApply={() => void applyPreparedLibraryImport()}
        onRollback={(run) => void rollbackCompletedImport(run)}
      />

      <section className="import-panel">
        <div className="panel-heading">
          <div>
            <h2>Cover art</h2>
            <p>
              Scan folder-named image files, link archive matches, and
              optionally extract embedded MP3 artwork into the cover archive.
            </p>
          </div>
          <RunStatus status={coverProgress.status} />
        </div>

        <label className="source-input">
          <span>Cover source folder</span>
          <input
            value={coverSourcePath}
            onChange={(event) => setCoverSourcePath(event.target.value)}
            placeholder="C:\\Music\\AlbumCovers"
            disabled={isImportingCovers}
          />
        </label>

        <div className="toggle-row cover-options">
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={coverExtractEmbeddedFallback}
              onChange={(event) =>
                setCoverExtractEmbeddedFallback(event.target.checked)
              }
              disabled={isImportingCovers}
            />
            <span>Extract missing embedded MP3 covers into AlbumCovers</span>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={coverReplaceExisting}
              onChange={(event) =>
                setCoverReplaceExisting(event.target.checked)
              }
              disabled={isImportingCovers}
            />
            <span>Replace existing covers</span>
          </label>
        </div>

        <div className="progress-block cover-progress-block" aria-live="polite">
          <div className="progress-row">
            <span>{coverProgress.message}</span>
            <strong>{Math.round(coverProgressPercent)}%</strong>
          </div>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${coverProgressPercent}%` }}
            />
          </div>
          <div className="progress-meta">
            <span>
              {formatNumber(coverProgress.scannedAlbums)} of{" "}
              {formatNumber(coverProgress.totalAlbums)} albums scanned
            </span>
            <span>
              {formatNumber(coverProgress.newCoversFound)} new covers found or
              extracted
            </span>
          </div>
          <div className="progress-meta">
            <span>{formatNumber(coverProgress.importedCovers)} imported</span>
            <span>{formatNumber(coverProgress.relinkedCovers)} relinked</span>
            <span>
              {formatNumber(coverProgress.skippedExisting)} already had covers
            </span>
            <span>{formatNumber(coverProgress.missingCovers)} missing</span>
          </div>
        </div>

        {coverImportError ? (
          <p className="error-message">{coverImportError}</p>
        ) : null}
        {coverImportSummary ? (
          <p className="success-message">
            Linked or imported {formatNumber(coverImportSummary.importedCovers)}{" "}
            covers from {formatNumber(coverImportSummary.newCoversFound)} newly
            found or extracted covers and{" "}
            {formatNumber(coverImportSummary.relinkedCovers)} existing cover
            entries.
          </p>
        ) : null}

        <div className="action-row">
          <button
            className="primary-button"
            type="button"
            onClick={startCoverImport}
            disabled={
              isImportingCovers ||
              !coverSourcePath.trim() ||
              !canImport ||
              (status?.albumCount ?? 0) === 0
            }
            title={
              canImport
                ? "Start cover import"
                : "Open the Tauri desktop app to import covers"
            }
          >
            <Play size={17} fill="currentColor" />
            <span>{isImportingCovers ? "Scanning" : "Import covers"}</span>
          </button>
          <span className="db-path">
            Archive matches are linked directly; missing embedded art is saved
            into AlbumCovers.
          </span>
        </div>
      </section>

      <section className="import-panel">
        <div className="panel-heading">
          <div>
            <h2>Album charts</h2>
            <p>
              Import US Billboard, Norwegian VG Lista, and Official UK album
              rows in one operation.
            </p>
          </div>
          <RunStatus
            status={
              isImportingBillboard
                ? "running"
                : billboardImportSummary ||
                    vgListaAlbumImportSummary ||
                    officialUkAlbumImportSummary
                  ? "completed"
                  : "idle"
            }
          />
        </div>

        <div
          className="toggle-row cover-options"
          aria-label="Album chart countries"
        >
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={importAlbumChartsUs}
              onChange={(event) => setImportAlbumChartsUs(event.target.checked)}
              disabled={isImportingBillboard}
            />
            <span>US · Billboard</span>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={importAlbumChartsNo}
              onChange={(event) => setImportAlbumChartsNo(event.target.checked)}
              disabled={isImportingBillboard}
            />
            <span>NO · VG Lista</span>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={importAlbumChartsUk}
              onChange={(event) => setImportAlbumChartsUk(event.target.checked)}
              disabled={isImportingBillboard}
            />
            <span>UK · Official Charts</span>
          </label>
        </div>

        <label className="source-input">
          <span>US album CSV folder</span>
          <input
            value={billboardSourcePath}
            onChange={(event) => setBillboardSourcePath(event.target.value)}
            placeholder="CSV_ALBUMS"
            disabled={isImportingBillboard || !importAlbumChartsUs}
          />
        </label>
        <label className="source-input">
          <span>Norwegian album CSV folder</span>
          <input
            value={vgListaAlbumSourcePath}
            onChange={(event) => setVgListaAlbumSourcePath(event.target.value)}
            placeholder="CSV_ALBUMS_NO"
            disabled={isImportingBillboard || !importAlbumChartsNo}
          />
        </label>
        <label className="source-input">
          <span>Official UK album CSV folder</span>
          <input
            value={officialUkAlbumSourcePath}
            onChange={(event) =>
              setOfficialUkAlbumSourcePath(event.target.value)
            }
            placeholder="CSV_ALBUMS_UK"
            disabled={isImportingBillboard || !importAlbumChartsUk}
          />
        </label>

        {billboardImportError ? (
          <p className="error-message">{billboardImportError}</p>
        ) : null}
        {billboardImportSummary ? (
          <p className="success-message">
            US · Matched {formatNumber(billboardImportSummary.matchedAlbums)}{" "}
            albums with {formatNumber(billboardImportSummary.datedAlbums)} debut
            weeks from {formatNumber(billboardImportSummary.chartEntries)} chart
            rows across {formatNumber(billboardImportSummary.filesScanned)}{" "}
            files.
          </p>
        ) : null}
        {vgListaAlbumImportSummary ? (
          <p className="success-message">
            Norway · Matched{" "}
            {formatNumber(vgListaAlbumImportSummary.matchedItems)} albums with{" "}
            {formatNumber(vgListaAlbumImportSummary.datedItems)} debut weeks
            from {formatNumber(vgListaAlbumImportSummary.chartEntries)} weekly
            rows across {formatNumber(vgListaAlbumImportSummary.filesScanned)}{" "}
            files.
          </p>
        ) : null}
        {officialUkAlbumImportSummary ? (
          <p className="success-message">
            UK · Matched{" "}
            {formatNumber(officialUkAlbumImportSummary.matchedItems)} albums
            with {formatNumber(officialUkAlbumImportSummary.datedItems)} debut
            weeks from {formatNumber(officialUkAlbumImportSummary.chartEntries)}{" "}
            weekly rows across{" "}
            {formatNumber(officialUkAlbumImportSummary.filesScanned)} files.
          </p>
        ) : null}

        <div className="action-row">
          <button
            className="primary-button"
            type="button"
            onClick={startBillboardImport}
            disabled={
              isImportingBillboard ||
              (!importAlbumChartsUs &&
                !importAlbumChartsNo &&
                !importAlbumChartsUk) ||
              (importAlbumChartsUs && !billboardSourcePath.trim()) ||
              (importAlbumChartsNo && !vgListaAlbumSourcePath.trim()) ||
              (importAlbumChartsUk && !officialUkAlbumSourcePath.trim()) ||
              !canImport ||
              (status?.albumCount ?? 0) === 0
            }
            title={
              canImport
                ? "Import selected album charts"
                : "Open the Tauri desktop app to import album charts"
            }
          >
            <BarChart3 size={17} />
            <span>
              {isImportingBillboard ? "Importing" : "Import album charts"}
            </span>
          </button>
          <span className="db-path">
            Each source keeps its own best rank and earliest chart week.
          </span>
        </div>
      </section>

      <section className="import-panel">
        <div className="panel-heading">
          <div>
            <h2>Singles charts</h2>
            <p>
              Import US Billboard, Official UK, VG Lista, Ti i Skuddet, and
              Norsktoppen rows in one operation.
            </p>
          </div>
          <RunStatus
            status={
              isImportingBillboardSingles
                ? "running"
                : billboardSinglesImportSummary ||
                    vgListaSinglesImportSummary ||
                    officialUkSinglesImportSummary ||
                    tiISkuddetImportSummary ||
                    norsktoppenImportSummary
                  ? "completed"
                  : "idle"
            }
          />
        </div>

        <div
          className="toggle-row cover-options"
          aria-label="Singles chart countries"
        >
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={importSingleChartsUs}
              onChange={(event) =>
                setImportSingleChartsUs(event.target.checked)
              }
              disabled={isImportingBillboardSingles}
            />
            <span>US · Billboard</span>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={importSingleChartsNo}
              onChange={(event) =>
                setImportSingleChartsNo(event.target.checked)
              }
              disabled={isImportingBillboardSingles}
            />
            <span>NO · VG Lista</span>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={importSingleChartsUk}
              onChange={(event) =>
                setImportSingleChartsUk(event.target.checked)
              }
              disabled={isImportingBillboardSingles}
            />
            <span>UK · Official Charts</span>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={importSingleChartsTiISkuddet}
              onChange={(event) =>
                setImportSingleChartsTiISkuddet(event.target.checked)
              }
              disabled={isImportingBillboardSingles}
            />
            <span>NO · Ti i Skuddet</span>
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={importSingleChartsNorsktoppen}
              onChange={(event) =>
                setImportSingleChartsNorsktoppen(event.target.checked)
              }
              disabled={isImportingBillboardSingles}
            />
            <span>NO · Norsktoppen</span>
          </label>
        </div>

        <label className="source-input">
          <span>US singles CSV folder</span>
          <input
            value={billboardSinglesSourcePath}
            onChange={(event) =>
              setBillboardSinglesSourcePath(event.target.value)
            }
            placeholder="CSV_SINGLES"
            disabled={isImportingBillboardSingles || !importSingleChartsUs}
          />
        </label>
        <label className="source-input">
          <span>Ti i Skuddet CSV folder</span>
          <input
            value={tiISkuddetSourcePath}
            onChange={(event) => setTiISkuddetSourcePath(event.target.value)}
            placeholder="CSV_TIISKUDDET_NO"
            disabled={
              isImportingBillboardSingles || !importSingleChartsTiISkuddet
            }
          />
        </label>
        <label className="source-input">
          <span>Norwegian singles CSV folder</span>
          <input
            value={vgListaSinglesSourcePath}
            onChange={(event) =>
              setVgListaSinglesSourcePath(event.target.value)
            }
            placeholder="CSV_SINGLES_NO"
            disabled={isImportingBillboardSingles || !importSingleChartsNo}
          />
        </label>
        <label className="source-input">
          <span>Official UK singles CSV folder</span>
          <input
            value={officialUkSinglesSourcePath}
            onChange={(event) =>
              setOfficialUkSinglesSourcePath(event.target.value)
            }
            placeholder="CSV_SINGLES_UK"
            disabled={isImportingBillboardSingles || !importSingleChartsUk}
          />
        </label>
        <label className="source-input">
          <span>Norsktoppen CSV folder</span>
          <input
            value={norsktoppenSourcePath}
            onChange={(event) => setNorsktoppenSourcePath(event.target.value)}
            placeholder="CSV_NORSKTOPPEN_NO"
            disabled={
              isImportingBillboardSingles || !importSingleChartsNorsktoppen
            }
          />
        </label>

        {billboardSinglesImportError ? (
          <p className="error-message">{billboardSinglesImportError}</p>
        ) : null}
        {billboardSinglesImportSummary ? (
          <p className="success-message">
            US · Matched{" "}
            {formatNumber(billboardSinglesImportSummary.matchedTracks)} tracks
            from {formatNumber(billboardSinglesImportSummary.chartEntries)}{" "}
            singles rows across{" "}
            {formatNumber(billboardSinglesImportSummary.filesScanned)} files.
            Found chart-entry dates for{" "}
            {formatNumber(billboardSinglesImportSummary.datedTracks)} matched
            tracks
            {billboardSinglesImportSummary.qualifiedDates > 0
              ? `, including ${formatNumber(billboardSinglesImportSummary.qualifiedDates)} historically qualified dates`
              : ""}
            {billboardSinglesImportSummary.invalidDates > 0
              ? `; skipped ${formatNumber(billboardSinglesImportSummary.invalidDates)} malformed dates`
              : ""}
            .
          </p>
        ) : null}
        {vgListaSinglesImportSummary ? (
          <p className="success-message">
            Norway · Matched{" "}
            {formatNumber(vgListaSinglesImportSummary.matchedItems)} tracks with{" "}
            {formatNumber(vgListaSinglesImportSummary.datedItems)} debut weeks
            from {formatNumber(vgListaSinglesImportSummary.chartEntries)} weekly
            rows across {formatNumber(vgListaSinglesImportSummary.filesScanned)}{" "}
            files.
          </p>
        ) : null}
        {officialUkSinglesImportSummary ? (
          <p className="success-message">
            UK · Matched{" "}
            {formatNumber(officialUkSinglesImportSummary.matchedItems)} tracks
            with {formatNumber(officialUkSinglesImportSummary.datedItems)} debut
            weeks from{" "}
            {formatNumber(officialUkSinglesImportSummary.chartEntries)} weekly
            rows across{" "}
            {formatNumber(officialUkSinglesImportSummary.filesScanned)} files.
          </p>
        ) : null}
        {tiISkuddetImportSummary ? (
          <p className="success-message">
            Ti i Skuddet · Matched{" "}
            {formatNumber(tiISkuddetImportSummary.matchedTracks)} tracks with{" "}
            {formatNumber(tiISkuddetImportSummary.datedTracks)} debut weeks from{" "}
            {formatNumber(tiISkuddetImportSummary.chartEntries)} rows across{" "}
            {formatNumber(tiISkuddetImportSummary.filesScanned)} files
            {tiISkuddetImportSummary.skippedRows > 0
              ? `; skipped ${formatNumber(tiISkuddetImportSummary.skippedRows)} incomplete rows`
              : ""}
            .
          </p>
        ) : null}
        {norsktoppenImportSummary ? (
          <p className="success-message">
            Norsktoppen · Matched{" "}
            {formatNumber(norsktoppenImportSummary.matchedTracks)} tracks with{" "}
            {formatNumber(norsktoppenImportSummary.datedTracks)} debut weeks
            from {formatNumber(norsktoppenImportSummary.chartEntries)} rows
            across {formatNumber(norsktoppenImportSummary.filesScanned)} files
            {norsktoppenImportSummary.skippedRows > 0
              ? `; skipped ${formatNumber(norsktoppenImportSummary.skippedRows)} incomplete rows`
              : ""}
            .
          </p>
        ) : null}

        <div className="action-row">
          <button
            className="primary-button"
            type="button"
            onClick={startBillboardSinglesImport}
            disabled={
              isImportingBillboardSingles ||
              (!importSingleChartsUs &&
                !importSingleChartsNo &&
                !importSingleChartsUk &&
                !importSingleChartsTiISkuddet &&
                !importSingleChartsNorsktoppen) ||
              (importSingleChartsUs && !billboardSinglesSourcePath.trim()) ||
              (importSingleChartsNo && !vgListaSinglesSourcePath.trim()) ||
              (importSingleChartsUk && !officialUkSinglesSourcePath.trim()) ||
              (importSingleChartsTiISkuddet && !tiISkuddetSourcePath.trim()) ||
              (importSingleChartsNorsktoppen &&
                !norsktoppenSourcePath.trim()) ||
              !canImport ||
              (status?.trackCount ?? 0) === 0
            }
            title={
              canImport
                ? "Import selected singles charts"
                : "Open the Tauri desktop app to import singles charts"
            }
          >
            <ListMusic size={17} />
            <span>
              {isImportingBillboardSingles ? "Importing" : "Import singles"}
            </span>
          </button>
          <span className="db-path">
            Each source keeps its own best rank and earliest chart entry.
          </span>
        </div>
      </section>

      <section className="table-panel" aria-label="Import history">
        <div className="panel-heading compact">
          <div>
            <h2>Last run</h2>
            <p>Recent imports and their database refresh results.</p>
          </div>
        </div>

        <div className="run-table" role="table">
          <div className="run-table-head" role="row">
            <span role="columnheader">Status</span>
            <span role="columnheader">Started</span>
            <span role="columnheader">Tracks</span>
            <span role="columnheader">Albums</span>
            <span role="columnheader">Duration</span>
          </div>
          {runs.length === 0 ? (
            <div className="empty-state">
              <FileSearch size={20} />
              <span>No imports yet.</span>
            </div>
          ) : (
            runs.map((run) => (
              <div className="run-table-row" role="row" key={run.id}>
                <span role="cell">
                  <RunStatus status={run.status} />
                </span>
                <span role="cell">{formatDate(run.startedAt)}</span>
                <span role="cell">{formatNumber(run.trackRows)}</span>
                <span role="cell">{formatNumber(run.albumCount)}</span>
                <span role="cell">{formatDuration(run.durationMs)}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </section>
  );
}
