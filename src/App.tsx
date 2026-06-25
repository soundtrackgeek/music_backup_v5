import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Album,
  BarChart3,
  Clock3,
  Database,
  FileArchive,
  FileSearch,
  FolderInput,
  Gauge,
  Heart,
  Library,
  ListMusic,
  Play,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Tags,
  UsersRound,
  Wrench,
} from "lucide-react";
import {
  getLibraryStatus,
  importMusicBeeTsv,
  isTauriRuntime,
  listenToImportProgress,
  listImportRuns,
} from "./backend";
import type { ImportProgress, ImportRun, ImportSummary, LibraryStatus } from "./types";

const navigation = [
  { label: "Search", icon: Search },
  { label: "Charts", icon: BarChart3 },
  { label: "Statistics", icon: Activity },
  { label: "Albums", icon: Album },
  { label: "Artists", icon: UsersRound },
  { label: "Genres", icon: Tags },
  { label: "Tools", icon: Wrench },
  { label: "Imports", icon: FolderInput },
  { label: "Settings", icon: Settings },
];

const defaultProgress: ImportProgress = {
  status: "idle",
  processedRows: 0,
  albumCount: 0,
  message: "Ready to import a MusicBee TSV export.",
};

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat().format(value ?? 0);
}

function formatDuration(ms: number) {
  if (!ms) return "0s";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDate(value: string | null) {
  if (!value) return "Not completed";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function Metric({
  label,
  value,
  tone = "neutral",
  icon: Icon,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "teal" | "amber";
  icon: typeof Database;
}) {
  return (
    <section className={`metric metric-${tone}`}>
      <div className="metric-icon" aria-hidden="true">
        <Icon size={18} strokeWidth={2} />
      </div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </section>
  );
}

function RunStatus({ status }: { status: string }) {
  return <span className={`run-status run-status-${status.toLowerCase()}`}>{status}</span>;
}

export default function App() {
  const [sourcePath, setSourcePath] = useState("musicbee-library.tsv");
  const [status, setStatus] = useState<LibraryStatus | null>(null);
  const [runs, setRuns] = useState<ImportRun[]>([]);
  const [progress, setProgress] = useState(defaultProgress);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canImport = isTauriRuntime();

  const loadData = useCallback(async () => {
    const [nextStatus, nextRuns] = await Promise.all([getLibraryStatus(), listImportRuns(8)]);
    setStatus(nextStatus);
    setRuns(nextRuns);
  }, []);

  useEffect(() => {
    void loadData().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    });
  }, [loadData]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    void listenToImportProgress(setProgress).then((nextUnlisten) => {
      unlisten = nextUnlisten;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  const lastRun = runs[0] ?? status?.lastImport ?? null;

  const progressPercent = useMemo(() => {
    if (progress.status === "completed") return 100;
    if (progress.processedRows === 0) return isImporting ? 6 : 0;
    return Math.min(96, Math.max(8, (progress.processedRows / 1_130_882) * 100));
  }, [isImporting, progress.processedRows, progress.status]);

  async function startImport() {
    setIsImporting(true);
    setError(null);
    setProgress({
      status: "starting",
      processedRows: 0,
      albumCount: 0,
      message: "Creating a database backup before import.",
    });

    try {
      const summary: ImportSummary = await importMusicBeeTsv(sourcePath);
      setProgress({
        status: "completed",
        processedRows: summary.trackRows,
        albumCount: summary.albumCount,
        message: "Import completed and album calculations refreshed.",
      });
      await loadData();
    } catch (importError) {
      const message = importError instanceof Error ? importError.message : String(importError);
      setError(message);
      setProgress({
        status: "failed",
        processedRows: progress.processedRows,
        albumCount: progress.albumCount,
        message,
      });
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Main navigation">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <Library size={20} />
          </div>
          <div>
            <strong>Music Library</strong>
            <span>Local TSV foundation</span>
          </div>
        </div>

        <nav className="nav-list">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = item.label === "Imports";
            return (
              <button className={isActive ? "active" : ""} key={item.label} type="button">
                <Icon size={17} strokeWidth={2} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>Imports</h1>
            <p>Build the local SQLite database from a MusicBee TSV export.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Filter settings">
            <SlidersHorizontal size={18} />
          </button>
        </header>

        <section className="metric-grid" aria-label="Library summary">
          <Metric label="Raw tracks" value={formatNumber(status?.trackCount)} tone="teal" icon={ListMusic} />
          <Metric label="Album aggregates" value={formatNumber(status?.albumCount)} tone="amber" icon={Album} />
          <Metric label="Import runs" value={formatNumber(status?.importRunCount)} icon={Clock3} />
          <Metric label="Database" value={status?.hasDatabase ? "Ready" : "New"} icon={Database} />
        </section>

        <section className="import-panel">
          <div className="panel-heading">
            <div>
              <h2>musicbee-library.tsv</h2>
              <p>Streaming import validates headers, stores raw tracks, and recalculates album score fields.</p>
            </div>
            <RunStatus status={progress.status} />
          </div>

          <label className="source-input">
            <span>TSV source path</span>
            <input
              value={sourcePath}
              onChange={(event) => setSourcePath(event.target.value)}
              placeholder="C:\\Music\\musicbee-library.tsv"
              disabled={isImporting}
            />
          </label>

          <div className="progress-block" aria-live="polite">
            <div className="progress-row">
              <span>{progress.message}</span>
              <strong>{formatNumber(progress.processedRows)} rows</strong>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
            <div className="progress-meta">
              <span>{formatNumber(progress.albumCount)} album keys observed</span>
              <span>Backup ready before data replacement</span>
            </div>
          </div>

          {error ? <p className="error-message">{error}</p> : null}

          <div className="action-row">
            <button
              className="primary-button"
              type="button"
              onClick={startImport}
              disabled={isImporting || !sourcePath.trim() || !canImport}
              title={canImport ? "Start import" : "Open the Tauri desktop app to import"}
            >
              <Play size={17} fill="currentColor" />
              <span>{isImporting ? "Importing" : "Start import"}</span>
            </button>
            <span className="db-path">{status?.dbPath ?? "Database path will appear after initialization."}</span>
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

      <aside className="detail-panel" aria-label="Selected import details">
        <div className="detail-header">
          <Sparkles size={20} />
          <div>
            <h2>Calculation Summary</h2>
            <p>Phase 1 album fields</p>
          </div>
        </div>

        <div className="calculation-list">
          <div>
            <Gauge size={17} />
            <span>Rating completeness</span>
          </div>
          <div>
            <Heart size={17} />
            <span>Loved tracks</span>
          </div>
          <div>
            <Clock3 size={17} />
            <span>TMOE and AE</span>
          </div>
          <div>
            <BarChart3 size={17} />
            <span>Album Score</span>
          </div>
        </div>

        <dl className="run-details">
          <div>
            <dt>Source size</dt>
            <dd>{lastRun ? formatBytes(lastRun.sourceSizeBytes) : "Waiting for first import"}</dd>
          </div>
          <div>
            <dt>Completed</dt>
            <dd>{lastRun ? formatDate(lastRun.completedAt) : "Not yet"}</dd>
          </div>
          <div>
            <dt>Backup</dt>
            <dd>{lastRun?.backupPath ?? "Created before import replacement"}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>{lastRun?.sourcePath ?? sourcePath}</dd>
          </div>
        </dl>
      </aside>
    </main>
  );
}
