import {
  AlertTriangle,
  Check,
  DatabaseBackup,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import type { ImportPreview, ImportProgress, ImportRun } from "../types";

type ImportSafetyPanelProps = {
  sourcePath: string;
  preview: ImportPreview | null;
  progress: ImportProgress;
  latestAppliedRun: ImportRun | null;
  databasePath: string | null;
  error: string | null;
  isPreparing: boolean;
  isApplying: boolean;
  isCancelling: boolean;
  onSourcePathChange: (value: string) => void;
  onPrepare: () => void;
  onCancel: () => void;
  onApply: () => void;
  onRollback: (run: ImportRun) => void;
};

const numberFormatter = new Intl.NumberFormat();

function formatNumber(value: number | null | undefined) {
  return numberFormatter.format(value ?? 0);
}

function progressPercent(progress: ImportProgress) {
  if (["ready", "completed"].includes(progress.status)) return 100;
  if (progress.totalBytes > 0) {
    return Math.min(
      99,
      Math.max(2, (progress.processedBytes / progress.totalBytes) * 100),
    );
  }
  return ["preparing", "resuming", "analyzing", "applying"].includes(
    progress.status,
  )
    ? 4
    : 0;
}

function DeltaMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "added" | "changed" | "removed" | "warning";
}) {
  return (
    <div className={`import-safety-delta ${tone}`}>
      <span>{label}</span>
      <strong>{formatNumber(value)}</strong>
    </div>
  );
}

export function ImportSafetyPanel({
  sourcePath,
  preview,
  progress,
  latestAppliedRun,
  databasePath,
  error,
  isPreparing,
  isApplying,
  isCancelling,
  onSourcePathChange,
  onPrepare,
  onCancel,
  onApply,
  onRollback,
}: ImportSafetyPanelProps) {
  const isReady = preview?.status === "ready" && !preview.sourceChanged;
  const canResume = preview?.canResume && !preview.sourceChanged;
  const isBusy = isPreparing || isApplying;
  const percent = progressPercent(progress);
  const preparationStatus = ["preparing", "resuming", "analyzing", "optimizing"].includes(
    progress.status,
  )
    ? progress.status
    : canResume
      ? "resuming"
      : "preparing";
  const status = isApplying
    ? "applying"
    : isPreparing
      ? preparationStatus
      : preview?.status ?? progress.status;

  return (
    <section
      className="import-panel import-safety-panel"
      aria-label="Safe MusicBee library import"
    >
      <div className="panel-heading">
        <div>
          <h2>musicbee-library.tsv</h2>
          <p>
            Stage and inspect the delta before the active library is replaced.
          </p>
        </div>
        <span className={`run-status run-status-${status}`}>{status}</span>
      </div>

      <div className="import-safety-note">
        <ShieldCheck size={18} aria-hidden="true" />
        <div>
          <strong>Your current library stays live during preparation.</strong>
          <span>
            Only resumable checkpoints are written, so the SQLite file can grow
            temporarily. Apply creates a rollback backup before replacing the
            active snapshot, then reclaims completed staging space.
          </span>
        </div>
      </div>

      <label className="source-input">
        <span>TSV source path</span>
        <input
          value={sourcePath}
          onChange={(event) => onSourcePathChange(event.target.value)}
          placeholder="C:\Music\musicbee-library.tsv"
          disabled={isBusy}
        />
      </label>

      <div className="progress-block" aria-live="polite">
        <div className="progress-row">
          <span>{progress.message}</span>
          <strong>{formatNumber(progress.processedRows)} rows</strong>
        </div>
        <div
          className="progress-track"
          role="progressbar"
          aria-label="Import preparation"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percent)}
        >
          <div className="progress-fill" style={{ width: `${percent}%` }} />
        </div>
        <div className="progress-meta">
          <span>{formatNumber(progress.albumCount)} album keys observed</span>
          <span>
            {progress.totalBytes > 0
              ? `${Math.round(percent)}% of source staged`
              : "Waiting for preparation"}
          </span>
        </div>
      </div>

      {preview?.sourceChanged ? (
        <p className="import-safety-warning">
          <AlertTriangle size={17} aria-hidden="true" />
          The source file changed after this checkpoint. Prepare a fresh delta
          before applying.
        </p>
      ) : null}

      {error ? <p className="error-message">{error}</p> : null}

      {isReady ? (
        <div className="import-safety-preview">
          <div className="import-safety-preview-heading">
            <div>
              <span>Pre-import delta</span>
              <strong>
                {formatNumber(preview.trackRows)} tracks across{" "}
                {formatNumber(preview.albumCount)} albums
              </strong>
            </div>
            <span className="import-safety-ready">
              <Check size={15} aria-hidden="true" />
              Ready to apply
            </span>
          </div>

          <div className="import-safety-delta-groups">
            <section aria-label="Track delta">
              <h3>Tracks</h3>
              <div>
                <DeltaMetric
                  label="Added"
                  value={preview.addedTracks}
                  tone="added"
                />
                <DeltaMetric
                  label="Changed"
                  value={preview.changedTracks}
                  tone="changed"
                />
                <DeltaMetric
                  label="Removed"
                  value={preview.removedTracks}
                  tone="removed"
                />
              </div>
            </section>
            <section aria-label="Album delta">
              <h3>Albums</h3>
              <div>
                <DeltaMetric
                  label="Added"
                  value={preview.addedAlbums}
                  tone="added"
                />
                <DeltaMetric
                  label="Changed"
                  value={preview.changedAlbums}
                  tone="changed"
                />
                <DeltaMetric
                  label="Removed"
                  value={preview.removedAlbums}
                  tone="removed"
                />
              </div>
            </section>
          </div>

          <details
            className="import-safety-suspicious"
            open={preview.suspiciousAlbumCount > 0}
          >
            <summary>
              <span>
                <AlertTriangle size={17} aria-hidden="true" />
                Suspicious albums
              </span>
              <strong>{formatNumber(preview.suspiciousAlbumCount)}</strong>
            </summary>
            {preview.suspiciousAlbumCount === 0 ? (
              <p>No material removals or metadata regressions detected.</p>
            ) : (
              <>
                <p>
                  Review rated or loved removals, large track-count drops, and
                  identity metadata that would disappear.
                </p>
                <div className="import-safety-suspicious-list">
                  {preview.suspiciousAlbums.map((album) => (
                    <article key={`${album.albumId}:${album.reason}`}>
                      <div>
                        <strong>{album.album ?? "Untitled album"}</strong>
                        <span>
                          {[album.albumArtistDisplay, album.year]
                            .filter(Boolean)
                            .join(" / ") || "Unknown artist"}
                        </span>
                      </div>
                      <p>{album.reason}</p>
                      <small>
                        {album.previousTrackCount == null
                          ? "New album"
                          : `${formatNumber(album.previousTrackCount)} → ${formatNumber(album.currentTrackCount)} tracks`}
                      </small>
                    </article>
                  ))}
                </div>
                {preview.suspiciousAlbumCount >
                preview.suspiciousAlbums.length ? (
                  <small className="import-safety-example-limit">
                    Showing {formatNumber(preview.suspiciousAlbums.length)} of{" "}
                    {formatNumber(preview.suspiciousAlbumCount)} flagged albums.
                  </small>
                ) : null}
              </>
            )}
          </details>
        </div>
      ) : null}

      {latestAppliedRun?.backupPath ? (
        <div className="import-safety-rollback">
          <DatabaseBackup size={18} aria-hidden="true" />
          <div>
            <strong>Rollback backup ready</strong>
            <span>{latestAppliedRun.backupPath}</span>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={() => onRollback(latestAppliedRun)}
            disabled={isBusy}
          >
            <RotateCcw size={16} aria-hidden="true" />
            Roll back
          </button>
        </div>
      ) : null}

      <div className="action-row import-safety-actions">
        {!isReady ? (
          <button
            className="primary-button"
            type="button"
            onClick={onPrepare}
            disabled={isBusy || !sourcePath.trim()}
          >
            <Play size={17} fill="currentColor" aria-hidden="true" />
            <span>
              {isPreparing
                ? canResume
                  ? "Resuming"
                  : "Preparing"
                : canResume
                  ? "Resume preview"
                  : "Preview changes"}
            </span>
          </button>
        ) : (
          <button
            className="primary-button"
            type="button"
            onClick={onApply}
            disabled={isBusy}
          >
            <ShieldCheck size={17} aria-hidden="true" />
            <span>{isApplying ? "Applying atomically" : "Apply safely"}</span>
          </button>
        )}

        {isPreparing ? (
          <button
            className="secondary-button"
            type="button"
            onClick={onCancel}
            disabled={isCancelling}
          >
            <Pause size={17} aria-hidden="true" />
            <span>{isCancelling ? "Stopping safely" : "Cancel"}</span>
          </button>
        ) : null}

        <span className="db-path">
          {databasePath ?? "Database path will appear after initialization."}
        </span>
      </div>
    </section>
  );
}
