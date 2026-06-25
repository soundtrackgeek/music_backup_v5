import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Album,
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Database,
  Download,
  FileSearch,
  FolderInput,
  Gauge,
  Heart,
  Library,
  ListMusic,
  Play,
  RotateCcw,
  Save,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Tags,
  Trash2,
  UsersRound,
  Wrench,
  X,
} from "lucide-react";
import {
  deleteSavedSearch,
  exportSearch,
  getLibraryStatus,
  importMusicBeeTsv,
  isTauriRuntime,
  listImportRuns,
  listSavedSearches,
  listenToImportProgress,
  saveSearch,
  searchLibrary,
} from "./backend";
import type {
  BrowseFilters,
  BrowseRequest,
  BrowseResponse,
  BrowseRow,
  BrowseView,
  ExportResult,
  ImportProgress,
  ImportRun,
  ImportSummary,
  LibraryStatus,
  SavedSearch,
  TextFilter,
  TextFilterOperator,
} from "./types";

const navigation = [
  { label: "Search", icon: Search, enabled: true },
  { label: "Charts", icon: BarChart3, enabled: false },
  { label: "Statistics", icon: Activity, enabled: false },
  { label: "Albums", icon: Album, enabled: false },
  { label: "Artists", icon: UsersRound, enabled: false },
  { label: "Genres", icon: Tags, enabled: false },
  { label: "Tools", icon: Wrench, enabled: false },
  { label: "Imports", icon: FolderInput, enabled: true },
  { label: "Settings", icon: Settings, enabled: false },
];

const operatorLabels: Record<TextFilterOperator, string> = {
  contains: "Contains",
  equals: "Equals",
  startsWith: "Starts with",
};

const missingFieldOptions = [
  { value: "album", label: "Album" },
  { value: "albumArtist", label: "Album artist" },
  { value: "genre", label: "Genre" },
  { value: "year", label: "Year" },
  { value: "rating", label: "Rating" },
  { value: "time", label: "Time" },
];

const defaultProgress: ImportProgress = {
  status: "idle",
  processedRows: 0,
  albumCount: 0,
  message: "Ready to import a MusicBee TSV export.",
};

function createTextFilter(): TextFilter {
  return { operator: "contains", value: "" };
}

function createFilters(): BrowseFilters {
  return {
    albumTitle: createTextFilter(),
    trackTitle: createTextFilter(),
    albumArtist: createTextFilter(),
    displayArtist: createTextFilter(),
    publisher: createTextFilter(),
    filePath: createTextFilter(),
    filename: createTextFilter(),
    hasTrackText: "",
    genres: [],
    excludedGenres: [],
    missingFields: [],
    yearFrom: null,
    yearTo: null,
    releaseYearFrom: null,
    releaseYearTo: null,
    totalMinutesMin: null,
    totalMinutesMax: null,
    trackCountMin: null,
    trackCountMax: null,
    albumRatingMin: null,
    albumRatingMax: null,
    trackRatingMin: null,
    trackRatingMax: null,
    ratingCompletenessMin: null,
    lovedTracksMin: null,
    lovedTracksMax: null,
  };
}

function defaultSort(view: BrowseView) {
  return { field: view === "tracks" ? "title" : "album", direction: "asc" as const };
}

function createRequest(view: BrowseView = "albums"): BrowseRequest {
  return {
    view,
    searchText: "",
    filters: createFilters(),
    sort: defaultSort(view),
    limit: 50,
    offset: 0,
  };
}

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

function formatMinutes(seconds: number | null | undefined) {
  if (seconds == null) return "";
  return `${(seconds / 60).toFixed(1)}m`;
}

function formatPercent(value: number | null | undefined, digits = 1) {
  if (value == null) return "";
  return `${(value * 100).toFixed(digits)}%`;
}

function formatTrackRating(value: number | null | undefined) {
  if (value == null) return "";
  return `${value / 20}`;
}

function parseList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function numberValue(value: string) {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function textFilterLabel(label: string, filter: TextFilter) {
  if (!filter.value.trim()) return null;
  return `${label} ${operatorLabels[filter.operator].toLowerCase()} "${filter.value.trim()}"`;
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

function TextCriterion({
  label,
  filter,
  onChange,
  placeholder,
}: {
  label: string;
  filter: TextFilter;
  onChange: (filter: TextFilter) => void;
  placeholder?: string;
}) {
  return (
    <label className="criterion criterion-text">
      <span>{label}</span>
      <div>
        <select
          value={filter.operator}
          onChange={(event) =>
            onChange({ ...filter, operator: event.target.value as TextFilterOperator })
          }
        >
          {Object.entries(operatorLabels).map(([value, optionLabel]) => (
            <option key={value} value={value}>
              {optionLabel}
            </option>
          ))}
        </select>
        <input
          value={filter.value}
          onChange={(event) => onChange({ ...filter, value: event.target.value })}
          placeholder={placeholder}
        />
      </div>
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="criterion">
      <span>{label}</span>
      <input
        type="number"
        value={value ?? ""}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(numberValue(event.target.value))}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="criterion">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ResultTable({ response }: { response: BrowseResponse | null }) {
  if (!response) {
    return (
      <div className="empty-state large">
        <FileSearch size={20} />
        <span>No results loaded.</span>
      </div>
    );
  }

  if (response.rows.length === 0) {
    return (
      <div className="empty-state large">
        <FileSearch size={20} />
        <span>No matches.</span>
      </div>
    );
  }

  return response.view === "tracks" ? (
    <div className="result-table track-results" role="table">
      <div className="result-table-head" role="row">
        <span role="columnheader">Track</span>
        <span role="columnheader">Album</span>
        <span role="columnheader">Artist</span>
        <span role="columnheader">Year</span>
        <span role="columnheader">Rating</span>
        <span role="columnheader">File</span>
      </div>
      {response.rows.map((row) => (
        <div className="result-table-row" role="row" key={row.id}>
          <span role="cell">
            <strong>{row.title ?? "Untitled"}</strong>
            <small>
              {[row.discNumber, row.trackNumber].filter((value) => value != null).join(".")}
              {row.love === "L" ? "  Loved" : ""}
            </small>
          </span>
          <span role="cell">{row.album ?? ""}</span>
          <span role="cell">{row.displayArtist ?? row.albumArtistDisplay ?? ""}</span>
          <span role="cell">{row.year ?? ""}</span>
          <span role="cell">{formatTrackRating(row.normalizedRating)}</span>
          <span role="cell" title={row.filePath ?? ""}>
            {row.filename ?? ""}
          </span>
        </div>
      ))}
    </div>
  ) : (
    <div className="result-table album-results" role="table">
      <div className="result-table-head" role="row">
        <span role="columnheader">Album</span>
        <span role="columnheader">Artist</span>
        <span role="columnheader">Year</span>
        <span role="columnheader">Genre</span>
        <span role="columnheader">Tracks</span>
        <span role="columnheader">Complete</span>
        <span role="columnheader">Score</span>
      </div>
      {response.rows.map((row) => (
        <div className="result-table-row" role="row" key={row.id}>
          <span role="cell">
            <strong>{row.album ?? "Untitled"}</strong>
            <small>{formatMinutes(row.totalSeconds)}</small>
          </span>
          <span role="cell">{row.albumArtistDisplay ?? ""}</span>
          <span role="cell">{row.year ?? ""}</span>
          <span role="cell">{row.canonicalGenre ?? ""}</span>
          <span role="cell">{row.totalTracks ?? ""}</span>
          <span role="cell">{formatPercent(row.ratingCompleteness)}</span>
          <span role="cell">{row.albumScore?.toFixed(3) ?? ""}</span>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [activeSection, setActiveSection] = useState("Search");
  const [sourcePath, setSourcePath] = useState("musicbee-library.tsv");
  const [status, setStatus] = useState<LibraryStatus | null>(null);
  const [runs, setRuns] = useState<ImportRun[]>([]);
  const [progress, setProgress] = useState(defaultProgress);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [request, setRequest] = useState<BrowseRequest>(() => createRequest("albums"));
  const [response, setResponse] = useState<BrowseResponse | null>(null);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [saveName, setSaveName] = useState("");
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [includeCalculated, setIncludeCalculated] = useState(false);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const canImport = isTauriRuntime();

  const loadData = useCallback(async () => {
    const [nextStatus, nextRuns, nextSavedSearches] = await Promise.all([
      getLibraryStatus(),
      listImportRuns(8),
      listSavedSearches(),
    ]);
    setStatus(nextStatus);
    setRuns(nextRuns);
    setSavedSearches(nextSavedSearches);
  }, []);

  useEffect(() => {
    void loadData().catch((loadError) => {
      setImportError(loadError instanceof Error ? loadError.message : String(loadError));
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

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsSearching(true);
      setBrowseError(null);
      void searchLibrary(request)
        .then((nextResponse) => {
          if (!cancelled) {
            setResponse(nextResponse);
          }
        })
        .catch((searchError) => {
          if (!cancelled) {
            setBrowseError(searchError instanceof Error ? searchError.message : String(searchError));
            setResponse(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsSearching(false);
          }
        });
    }, 160);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [request]);

  const lastRun = runs[0] ?? status?.lastImport ?? null;
  const currentFilters = request.filters;

  const progressPercent = useMemo(() => {
    if (progress.status === "completed") return 100;
    if (progress.processedRows === 0) return isImporting ? 6 : 0;
    return Math.min(96, Math.max(8, (progress.processedRows / 1_130_882) * 100));
  }, [isImporting, progress.processedRows, progress.status]);

  const chips = useMemo(() => {
    const nextChips: { key: string; label: string; remove: () => void }[] = [];
    const addTextChip = (key: keyof BrowseFilters, label: string, filter: TextFilter) => {
      const chipLabel = textFilterLabel(label, filter);
      if (chipLabel) {
        nextChips.push({
          key,
          label: chipLabel,
          remove: () => updateFilter(key, createTextFilter()),
        });
      }
    };

    if (request.searchText.trim()) {
      nextChips.push({
        key: "searchText",
        label: `Search "${request.searchText.trim()}"`,
        remove: () => setRequest((previous) => ({ ...previous, searchText: "", offset: 0 })),
      });
    }

    addTextChip("albumTitle", "Album", currentFilters.albumTitle);
    addTextChip("trackTitle", "Track", currentFilters.trackTitle);
    addTextChip("albumArtist", "Album artist", currentFilters.albumArtist);
    addTextChip("displayArtist", "Display artist", currentFilters.displayArtist);
    addTextChip("publisher", "Publisher", currentFilters.publisher);
    addTextChip("filePath", "Path", currentFilters.filePath);
    addTextChip("filename", "Filename", currentFilters.filename);

    if (currentFilters.hasTrackText.trim()) {
      nextChips.push({
        key: "hasTrackText",
        label: `Track text "${currentFilters.hasTrackText.trim()}"`,
        remove: () => updateFilter("hasTrackText", ""),
      });
    }
    if (currentFilters.genres.length) {
      nextChips.push({
        key: "genres",
        label: `Genres: ${currentFilters.genres.join(", ")}`,
        remove: () => updateFilter("genres", []),
      });
    }
    if (currentFilters.excludedGenres.length) {
      nextChips.push({
        key: "excludedGenres",
        label: `Excluding: ${currentFilters.excludedGenres.join(", ")}`,
        remove: () => updateFilter("excludedGenres", []),
      });
    }

    addRangeChip(nextChips, "year", "Year", currentFilters.yearFrom, currentFilters.yearTo, () => {
      updateFilters({ yearFrom: null, yearTo: null });
    });
    addRangeChip(
      nextChips,
      "releaseYear",
      "Release",
      currentFilters.releaseYearFrom,
      currentFilters.releaseYearTo,
      () => updateFilters({ releaseYearFrom: null, releaseYearTo: null }),
    );
    addRangeChip(
      nextChips,
      "minutes",
      "Minutes",
      currentFilters.totalMinutesMin,
      currentFilters.totalMinutesMax,
      () => updateFilters({ totalMinutesMin: null, totalMinutesMax: null }),
    );
    addRangeChip(
      nextChips,
      "albumRating",
      "Album rating",
      currentFilters.albumRatingMin,
      currentFilters.albumRatingMax,
      () => updateFilters({ albumRatingMin: null, albumRatingMax: null }),
    );
    addRangeChip(
      nextChips,
      "trackRating",
      "Track rating",
      currentFilters.trackRatingMin,
      currentFilters.trackRatingMax,
      () => updateFilters({ trackRatingMin: null, trackRatingMax: null }),
    );

    if (currentFilters.ratingCompletenessMin != null) {
      nextChips.push({
        key: "ratingCompletenessMin",
        label: `Complete >= ${currentFilters.ratingCompletenessMin}%`,
        remove: () => updateFilter("ratingCompletenessMin", null),
      });
    }
    if (currentFilters.lovedTracksMin != null || currentFilters.lovedTracksMax != null) {
      addRangeChip(
        nextChips,
        "lovedTracks",
        "Loved",
        currentFilters.lovedTracksMin,
        currentFilters.lovedTracksMax,
        () => updateFilters({ lovedTracksMin: null, lovedTracksMax: null }),
      );
    }
    if (currentFilters.missingFields.length) {
      nextChips.push({
        key: "missingFields",
        label: `Missing: ${currentFilters.missingFields.join(", ")}`,
        remove: () => updateFilter("missingFields", []),
      });
    }

    return nextChips;
  }, [currentFilters, request.searchText]);

  function updateFilter<K extends keyof BrowseFilters>(key: K, value: BrowseFilters[K]) {
    setRequest((previous) => ({
      ...previous,
      filters: { ...previous.filters, [key]: value },
      offset: 0,
    }));
  }

  function updateFilters(values: Partial<BrowseFilters>) {
    setRequest((previous) => ({
      ...previous,
      filters: { ...previous.filters, ...values },
      offset: 0,
    }));
  }

  function setView(view: BrowseView) {
    setRequest((previous) => ({
      ...previous,
      view,
      sort: defaultSort(view),
      offset: 0,
    }));
  }

  function clearQuery() {
    setRequest((previous) => ({
      ...createRequest(previous.view),
      limit: previous.limit,
    }));
    setExportResult(null);
  }

  async function startImport() {
    setIsImporting(true);
    setImportError(null);
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setImportError(message);
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

  async function saveCurrentSearch() {
    const fallbackName =
      request.searchText.trim() || `${request.view === "albums" ? "Album" : "Track"} search`;
    const saved = await saveSearch(saveName.trim() || fallbackName, request);
    setSavedSearches((previous) => [saved, ...previous.filter((search) => search.id !== saved.id)]);
    setSaveName("");
  }

  async function removeSavedSearch(id: number) {
    await deleteSavedSearch(id);
    setSavedSearches((previous) => previous.filter((search) => search.id !== id));
  }

  async function runExport(format: string) {
    const result = await exportSearch(request, format, includeCalculated);
    setExportResult(result);
  }

  const total = response?.total ?? 0;
  const pageStart = total === 0 ? 0 : request.offset + 1;
  const pageEnd = Math.min(total, request.offset + request.limit);

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Main navigation">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <Library size={20} />
          </div>
          <div>
            <strong>Music Library</strong>
            <span>Local TSV browser</span>
          </div>
        </div>

        <nav className="nav-list">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = item.label === activeSection;
            return (
              <button
                className={isActive ? "active" : ""}
                key={item.label}
                type="button"
                disabled={!item.enabled}
                onClick={() => item.enabled && setActiveSection(item.label)}
                title={item.label}
              >
                <Icon size={17} strokeWidth={2} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {activeSection === "Imports" ? (
        <section className="workspace">
          <header className="topbar">
            <div>
              <h1>Imports</h1>
              <p>Build the local SQLite database from a MusicBee TSV export.</p>
            </div>
            <button className="icon-button" type="button" aria-label="Refresh" onClick={() => void loadData()}>
              <RotateCcw size={18} />
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
                <p>Streaming import validates headers and refreshes calculated album fields.</p>
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

            {importError ? <p className="error-message">{importError}</p> : null}

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
      ) : (
        <section className="workspace search-workspace">
          <header className="topbar">
            <div>
              <h1>Search</h1>
              <p>Album and track browsing over the imported MusicBee library.</p>
            </div>
            <div className="topbar-actions">
              <button className="icon-button" type="button" aria-label="Clear query" onClick={clearQuery}>
                <RotateCcw size={18} />
              </button>
              <button className="icon-button" type="button" aria-label="Refresh" onClick={() => void loadData()}>
                <Database size={18} />
              </button>
            </div>
          </header>

          <section className="metric-grid" aria-label="Library summary">
            <Metric label="Tracks" value={formatNumber(status?.trackCount)} tone="teal" icon={ListMusic} />
            <Metric label="Albums" value={formatNumber(status?.albumCount)} tone="amber" icon={Album} />
            <Metric label="Matches" value={formatNumber(total)} icon={Search} />
            <Metric label="Saved" value={formatNumber(savedSearches.length)} icon={Save} />
          </section>

          <section className="query-panel">
            <div className="search-row">
              <div className="search-input">
                <Search size={18} />
                <input
                  value={request.searchText}
                  onChange={(event) =>
                    setRequest((previous) => ({ ...previous, searchText: event.target.value, offset: 0 }))
                  }
                  placeholder="Search albums, artists, genres, tracks, publishers, files"
                />
              </div>

              <div className="segmented-control" aria-label="Browse view">
                <button
                  className={request.view === "albums" ? "active" : ""}
                  type="button"
                  onClick={() => setView("albums")}
                >
                  <Album size={16} />
                  <span>Albums</span>
                </button>
                <button
                  className={request.view === "tracks" ? "active" : ""}
                  type="button"
                  onClick={() => setView("tracks")}
                >
                  <ListMusic size={16} />
                  <span>Tracks</span>
                </button>
              </div>
            </div>

            <div className="filter-grid">
              <TextCriterion
                label="Album title"
                filter={currentFilters.albumTitle}
                onChange={(filter) => updateFilter("albumTitle", filter)}
              />
              <TextCriterion
                label="Track title"
                filter={currentFilters.trackTitle}
                onChange={(filter) => updateFilter("trackTitle", filter)}
              />
              <TextCriterion
                label="Album artist"
                filter={currentFilters.albumArtist}
                onChange={(filter) => updateFilter("albumArtist", filter)}
              />
              <TextCriterion
                label="Display artist"
                filter={currentFilters.displayArtist}
                onChange={(filter) => updateFilter("displayArtist", filter)}
              />

              <label className="criterion">
                <span>Genres</span>
                <input
                  value={currentFilters.genres.join(", ")}
                  onChange={(event) => updateFilter("genres", parseList(event.target.value))}
                  placeholder="Synthpop, AOR"
                />
              </label>
              <label className="criterion">
                <span>Exclude genres</span>
                <input
                  value={currentFilters.excludedGenres.join(", ")}
                  onChange={(event) => updateFilter("excludedGenres", parseList(event.target.value))}
                />
              </label>
              <TextCriterion
                label="Publisher"
                filter={currentFilters.publisher}
                onChange={(filter) => updateFilter("publisher", filter)}
              />
              <label className="criterion">
                <span>Track text</span>
                <input
                  value={currentFilters.hasTrackText}
                  onChange={(event) => updateFilter("hasTrackText", event.target.value)}
                />
              </label>

              <NumberField label="Year from" value={currentFilters.yearFrom} onChange={(value) => updateFilter("yearFrom", value)} />
              <NumberField label="Year to" value={currentFilters.yearTo} onChange={(value) => updateFilter("yearTo", value)} />
              <NumberField
                label="Release from"
                value={currentFilters.releaseYearFrom}
                onChange={(value) => updateFilter("releaseYearFrom", value)}
              />
              <NumberField
                label="Release to"
                value={currentFilters.releaseYearTo}
                onChange={(value) => updateFilter("releaseYearTo", value)}
              />

              <NumberField
                label="Minutes min"
                value={currentFilters.totalMinutesMin}
                step={0.5}
                onChange={(value) => updateFilter("totalMinutesMin", value)}
              />
              <NumberField
                label="Minutes max"
                value={currentFilters.totalMinutesMax}
                step={0.5}
                onChange={(value) => updateFilter("totalMinutesMax", value)}
              />
              <NumberField
                label="Tracks min"
                value={currentFilters.trackCountMin}
                onChange={(value) => updateFilter("trackCountMin", value)}
              />
              <NumberField
                label="Tracks max"
                value={currentFilters.trackCountMax}
                onChange={(value) => updateFilter("trackCountMax", value)}
              />

              <NumberField
                label="Album rating min"
                value={currentFilters.albumRatingMin}
                min={0}
                max={100}
                onChange={(value) => updateFilter("albumRatingMin", value)}
              />
              <NumberField
                label="Album rating max"
                value={currentFilters.albumRatingMax}
                min={0}
                max={100}
                onChange={(value) => updateFilter("albumRatingMax", value)}
              />
              <NumberField
                label="Track rating min"
                value={currentFilters.trackRatingMin}
                min={0}
                max={5}
                onChange={(value) => updateFilter("trackRatingMin", value)}
              />
              <NumberField
                label="Track rating max"
                value={currentFilters.trackRatingMax}
                min={0}
                max={5}
                onChange={(value) => updateFilter("trackRatingMax", value)}
              />

              <label className="criterion slider-criterion">
                <span>Completeness</span>
                <div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={currentFilters.ratingCompletenessMin ?? 0}
                    onChange={(event) => updateFilter("ratingCompletenessMin", Number(event.target.value))}
                  />
                  <strong>{currentFilters.ratingCompletenessMin ?? 0}%</strong>
                </div>
              </label>
              <NumberField
                label="Loved min"
                value={currentFilters.lovedTracksMin}
                min={0}
                onChange={(value) => updateFilter("lovedTracksMin", value)}
              />
              <TextCriterion
                label="File path"
                filter={currentFilters.filePath}
                onChange={(filter) => updateFilter("filePath", filter)}
              />
              <TextCriterion
                label="Filename"
                filter={currentFilters.filename}
                onChange={(filter) => updateFilter("filename", filter)}
              />
            </div>

            <div className="query-footer">
              <div className="missing-flags" aria-label="Missing metadata">
                {missingFieldOptions.map((option) => {
                  const checked = currentFilters.missingFields.includes(option.value);
                  return (
                    <label key={option.value}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          const nextValues = event.target.checked
                            ? [...currentFilters.missingFields, option.value]
                            : currentFilters.missingFields.filter((value) => value !== option.value);
                          updateFilter("missingFields", nextValues);
                        }}
                      />
                      <span>{option.label}</span>
                    </label>
                  );
                })}
              </div>

              <div className="sort-controls">
                <SelectField
                  label="Sort"
                  value={request.sort.field}
                  onChange={(field) =>
                    setRequest((previous) => ({ ...previous, sort: { ...previous.sort, field }, offset: 0 }))
                  }
                  options={
                    request.view === "tracks"
                      ? [
                          { value: "title", label: "Title" },
                          { value: "album", label: "Album" },
                          { value: "displayArtist", label: "Display artist" },
                          { value: "year", label: "Year" },
                          { value: "trackRating", label: "Track rating" },
                          { value: "trackNumber", label: "Track number" },
                        ]
                      : [
                          { value: "album", label: "Album" },
                          { value: "artist", label: "Artist" },
                          { value: "year", label: "Year" },
                          { value: "genre", label: "Genre" },
                          { value: "totalMinutes", label: "Minutes" },
                          { value: "trackCount", label: "Tracks" },
                          { value: "albumRating", label: "Rating" },
                          { value: "ratingCompleteness", label: "Completeness" },
                          { value: "lovedTracks", label: "Loved" },
                          { value: "albumScore", label: "Score" },
                        ]
                  }
                />
                <SelectField
                  label="Direction"
                  value={request.sort.direction}
                  onChange={(direction) =>
                    setRequest((previous) => ({
                      ...previous,
                      sort: { ...previous.sort, direction: direction as "asc" | "desc" },
                      offset: 0,
                    }))
                  }
                  options={[
                    { value: "asc", label: "Ascending" },
                    { value: "desc", label: "Descending" },
                  ]}
                />
                <NumberField
                  label="Rows"
                  value={request.limit}
                  min={10}
                  max={500}
                  onChange={(value) =>
                    setRequest((previous) => ({ ...previous, limit: value ?? 50, offset: 0 }))
                  }
                />
              </div>
            </div>

            <div className="chip-row" aria-label="Active filters">
              {chips.length === 0 ? (
                <span className="chip-empty">No active filters</span>
              ) : (
                chips.map((chip) => (
                  <button className="filter-chip" type="button" key={chip.key} onClick={chip.remove}>
                    <span>{chip.label}</span>
                    <X size={14} />
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="table-panel" aria-label="Search results">
            <div className="panel-heading compact">
              <div>
                <h2>{request.view === "albums" ? "Album table" : "Track table"}</h2>
                <p>
                  {isSearching ? "Searching" : `${formatNumber(pageStart)}-${formatNumber(pageEnd)} of ${formatNumber(total)}`}
                </p>
              </div>
              <div className="pager">
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Previous page"
                  disabled={request.offset === 0}
                  onClick={() =>
                    setRequest((previous) => ({
                      ...previous,
                      offset: Math.max(0, previous.offset - previous.limit),
                    }))
                  }
                >
                  <ChevronLeft size={17} />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Next page"
                  disabled={request.offset + request.limit >= total}
                  onClick={() =>
                    setRequest((previous) => ({
                      ...previous,
                      offset: previous.offset + previous.limit,
                    }))
                  }
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>

            {browseError ? <p className="error-message">{browseError}</p> : null}
            <ResultTable response={response} />
          </section>
        </section>
      )}

      {activeSection === "Imports" ? (
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
      ) : (
        <aside className="detail-panel search-detail" aria-label="Search actions">
          <div className="detail-header">
            <SlidersHorizontal size={20} />
            <div>
              <h2>Views</h2>
              <p>Saved searches and exports</p>
            </div>
          </div>

          <section className="save-search-box">
            <label className="source-input">
              <span>Name</span>
              <input value={saveName} onChange={(event) => setSaveName(event.target.value)} />
            </label>
            <button className="primary-button" type="button" onClick={() => void saveCurrentSearch()}>
              <Save size={17} />
              <span>Save search</span>
            </button>
          </section>

          <section className="saved-list" aria-label="Saved searches">
            {savedSearches.length === 0 ? (
              <div className="empty-state">
                <FileSearch size={20} />
                <span>No saved searches.</span>
              </div>
            ) : (
              savedSearches.map((search) => (
                <div className="saved-search" key={search.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setRequest(search.request);
                      setActiveSection("Search");
                    }}
                  >
                    <strong>{search.name}</strong>
                    <span>{search.view}</span>
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={`Delete ${search.name}`}
                    onClick={() => void removeSavedSearch(search.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            )}
          </section>

          <section className="export-box">
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={includeCalculated}
                onChange={(event) => setIncludeCalculated(event.target.checked)}
              />
              <span>Calculated columns</span>
            </label>
            <div className="export-grid">
              {["csv", "tsv", "json", "txt"].map((format) => (
                <button type="button" key={format} onClick={() => void runExport(format)}>
                  <Download size={16} />
                  <span>{format.toUpperCase()}</span>
                </button>
              ))}
            </div>
            {exportResult ? (
              <div className="export-result">
                <Check size={17} />
                <span>
                  {formatNumber(exportResult.rowCount)} rows to {exportResult.path}
                </span>
              </div>
            ) : null}
          </section>
        </aside>
      )}
    </main>
  );
}

function addRangeChip(
  chips: { key: string; label: string; remove: () => void }[],
  key: string,
  label: string,
  minimum: number | null,
  maximum: number | null,
  remove: () => void,
) {
  if (minimum == null && maximum == null) return;
  const text =
    minimum != null && maximum != null
      ? `${label} ${minimum}-${maximum}`
      : minimum != null
        ? `${label} >= ${minimum}`
        : `${label} <= ${maximum}`;
  chips.push({ key, label: text, remove });
}
