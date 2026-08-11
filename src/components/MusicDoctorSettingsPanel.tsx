import { useCallback, useEffect, useState } from "react";
import { Check, Database, RefreshCw, ShieldCheck } from "lucide-react";

import {
  defaultMusicDoctorDatabasePath,
  getMusicDoctorStatus,
  syncMusicDoctor,
} from "../backend";
import type { AppSettings, MusicDoctorStatus } from "../types";

type Props = {
  databasePath: string;
  autoSync: boolean;
  isSavingSettings: boolean;
  onSaveSettings: (values: Partial<AppSettings>) => Promise<boolean>;
};

const numberFormatter = new Intl.NumberFormat();

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function formatBytes(value: number) {
  if (value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );
  const scaled = value / 1024 ** index;
  return `${scaled.toFixed(index === 0 || scaled >= 100 ? 0 : 1)} ${units[index]}`;
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Never";
}

export function MusicDoctorSettingsPanel({
  databasePath,
  autoSync,
  isSavingSettings,
  onSaveSettings,
}: Props) {
  const [pathDraft, setPathDraft] = useState(databasePath);
  const [status, setStatus] = useState<MusicDoctorStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => setPathDraft(databasePath), [databasePath]);

  const refreshStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const nextStatus = await getMusicDoctorStatus();
      setStatus(nextStatus);
      return nextStatus;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const runSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setError(null);
    try {
      await syncMusicDoctor();
      await refreshStatus();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, refreshStatus]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  async function saveConnection() {
    const nextPath = pathDraft.trim() || defaultMusicDoctorDatabasePath;
    const saved = await onSaveSettings({ musicDoctorDatabasePath: nextPath });
    if (saved) {
      await refreshStatus();
    }
  }

  async function setAutoSync(enabled: boolean) {
    await onSaveSettings({ musicDoctorAutoSync: enabled });
  }

  const busy = isLoading || isSyncing || isSavingSettings;

  return (
    <section className="settings-panel music-doctor-settings-panel">
      <div className="panel-heading compact">
        <div>
          <h2>Music Doctor</h2>
          <p>{status?.message ?? "Checking the quality database…"}</p>
        </div>
        <ShieldCheck size={18} />
      </div>

      <div className="music-doctor-toolbar">
        <label className="criterion music-doctor-database-path">
          <span>Database path</span>
          <input
            type="text"
            value={pathDraft}
            placeholder={defaultMusicDoctorDatabasePath}
            onChange={(event) => setPathDraft(event.target.value)}
          />
        </label>
        <button
          className="secondary-button"
          type="button"
          disabled={busy}
          onClick={() => void saveConnection()}
        >
          <Database size={16} />
          <span>Save and check</span>
        </button>
        <button
          className="primary-button"
          type="button"
          disabled={busy || !status?.valid}
          onClick={() => void runSync()}
        >
          {isSyncing ? <RefreshCw className="spin" size={16} /> : <RefreshCw size={16} />}
          <span>{isSyncing ? "Syncing" : "Sync now"}</span>
        </button>
      </div>

      <label className="settings-toggle music-doctor-auto-sync">
        <input
          type="checkbox"
          checked={autoSync}
          disabled={isSavingSettings}
          onChange={(event) => void setAutoSync(event.target.checked)}
        />
        <span>
          <strong>Sync new Music Doctor scans automatically</strong>
          <small>The external database is always opened read-only.</small>
        </span>
      </label>

      {error ? <p className="error-message">{error}</p> : null}

      {status ? (
        <>
          <div className={`music-doctor-status-strip state-${status.state}`}>
            {status.valid && !status.needsSync ? <Check size={16} /> : <Database size={16} />}
            <span>
              {status.valid
                ? `Scan ${status.latestScanId ?? "—"} · ${formatBytes(status.fileSizeBytes)}`
                : status.resolvedPath}
            </span>
          </div>

          <dl className="performance-summary music-doctor-summary">
            <div><dt>Audio files</dt><dd>{formatNumber(status.audioFiles)}</dd></div>
            <div><dt>Albums</dt><dd>{formatNumber(status.audioAlbums)}</dd></div>
            <div><dt>Matched</dt><dd>{formatNumber(status.matchedTracks)}</dd></div>
            <div><dt>New audio</dt><dd>{formatNumber(status.unmatchedDoctorAudio)}</dd></div>
            <div><dt>File issues</dt><dd>{formatNumber(status.fileIssueCount)}</dd></div>
            <div><dt>Last sync</dt><dd>{formatDate(status.lastSyncedAt)}</dd></div>
          </dl>

          {status.bitrateStats.length > 0 ? (
            <div className="music-doctor-bitrate-list" aria-label="Bitrate distribution">
              {status.bitrateStats.map((row) => (
                <div key={row.band}>
                  <span>{row.band}</span>
                  <strong>{formatNumber(row.fileCount)}</strong>
                </div>
              ))}
            </div>
          ) : null}

          {status.sources.length > 0 ? (
            <div className="music-doctor-source-list">
              {status.sources.map((source) => (
                <div key={source.path}>
                  <span>{source.path}</span>
                  <small>{formatNumber(source.fileCount)} files</small>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
