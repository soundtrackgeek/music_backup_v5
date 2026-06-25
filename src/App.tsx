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
  Moon,
  Play,
  RotateCcw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Tags,
  Trash2,
  UsersRound,
  Wrench,
  X,
} from "lucide-react";
import {
  deleteSavedChart,
  deleteSavedSearch,
  exportSearch,
  getSettings,
  getStatistics,
  getLibraryStatus,
  importMusicBeeTsv,
  isTauriRuntime,
  listImportRuns,
  listSavedCharts,
  listSavedSearches,
  listenToImportProgress,
  saveChart,
  saveSearch,
  saveSettings,
  searchLibrary,
} from "./backend";
import type {
  AppSettings,
  BrowseFilters,
  BrowseRequest,
  BrowseResponse,
  BrowseRow,
  BrowseView,
  ChartConfig,
  ChartViewMode,
  ExportResult,
  ImportProgress,
  ImportRun,
  ImportSummary,
  LibraryStatus,
  GenreProgressStats,
  RatingBucket,
  RatingEvent,
  SavedChart,
  SavedSearch,
  StatisticsResponse,
  TextFilter,
  TextFilterOperator,
  YearProgressStats,
} from "./types";

const navigation = [
  { label: "Search", icon: Search, enabled: true },
  { label: "Charts", icon: BarChart3, enabled: true },
  { label: "Statistics", icon: Activity, enabled: true },
  { label: "Albums", icon: Album, enabled: false },
  { label: "Artists", icon: UsersRound, enabled: false },
  { label: "Genres", icon: Tags, enabled: false },
  { label: "Tools", icon: Wrench, enabled: false },
  { label: "Imports", icon: FolderInput, enabled: true },
  { label: "Settings", icon: Settings, enabled: true },
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

const rankingOptions = [
  { value: "albumScore", label: "Album Score" },
  { value: "albumRating", label: "Album rating" },
  { value: "lovedTracks", label: "Loved tracks" },
  { value: "ae", label: "AE" },
  { value: "tmoe", label: "TMOE" },
  { value: "ratingCompleteness", label: "Completeness" },
  { value: "totalMinutes", label: "Minutes" },
];

const chartColumnOptions = [
  { value: "rating", label: "Rating" },
  { value: "complete", label: "Complete" },
  { value: "score", label: "Score" },
  { value: "loved", label: "Loved" },
  { value: "ae", label: "AE" },
  { value: "tmoe", label: "TMOE" },
  { value: "minutes", label: "Minutes" },
];

const chartViewModes: { value: ChartViewMode; label: string; icon: typeof BarChart3 }[] = [
  { value: "table", label: "Table", icon: BarChart3 },
  { value: "compact", label: "List", icon: ListMusic },
  { value: "grid", label: "Grid", icon: Album },
];

const defaultProgress: ImportProgress = {
  status: "idle",
  processedRows: 0,
  albumCount: 0,
  message: "Ready to import a MusicBee TSV export.",
};

function createDefaultSettings(): AppSettings {
  return {
    backupRetention: 3,
    darkMode: false,
    updatedAt: null,
  };
}

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

function createChartConfig(): ChartConfig {
  const request = createRequest("albums");
  request.sort = { field: "albumScore", direction: "desc" };
  request.limit = 50;
  request.filters.ratingCompletenessMin = 100;

  return {
    request,
    rankingMetric: "albumScore",
    ratingCompletenessThreshold: 100,
    sortDirection: "desc",
    resultLimit: 50,
    visibleColumns: ["rating", "complete", "score", "loved"],
    exportColumns: ["calculated"],
    viewMode: "table",
  };
}

function chartRequestFromConfig(config: ChartConfig): BrowseRequest {
  return {
    ...config.request,
    view: "albums",
    offset: 0,
    limit: config.resultLimit,
    sort: {
      field: config.rankingMetric,
      direction: config.sortDirection,
    },
    filters: {
      ...config.request.filters,
      ratingCompletenessMin: config.ratingCompletenessThreshold,
    },
  };
}

type ChartTemplateConfigOverrides = Omit<Partial<ChartConfig>, "request"> & {
  request?: Partial<Omit<BrowseRequest, "filters">> & { filters?: Partial<BrowseFilters> };
};

function createChartTemplateConfig(values: ChartTemplateConfigOverrides) {
  const base = createChartConfig();
  const filters = {
    ...base.request.filters,
    ...(values.request?.filters ?? {}),
  };

  return {
    ...base,
    ...values,
    request: {
      ...base.request,
      ...(values.request ?? {}),
      view: "albums",
      filters,
      offset: 0,
    },
  } satisfies ChartConfig;
}

type ChartTemplate = {
  id: string;
  label: string;
  description: string;
  icon: typeof BarChart3;
  createConfig: () => ChartConfig;
};

const chartTemplates: ChartTemplate[] = [
  {
    id: "year",
    label: "Year",
    description: "Top albums from a selected year.",
    icon: BarChart3,
    createConfig: () =>
      createChartTemplateConfig({
        request: { filters: { yearFrom: 1987, yearTo: 1987 } },
      }),
  },
  {
    id: "decade",
    label: "Decade",
    description: "Top albums from a selected decade.",
    icon: Gauge,
    createConfig: () =>
      createChartTemplateConfig({
        request: { filters: { yearFrom: 1980, yearTo: 1989 } },
      }),
  },
  {
    id: "genre",
    label: "Genre",
    description: "Top albums in a canonical genre.",
    icon: Tags,
    createConfig: () =>
      createChartTemplateConfig({
        request: { filters: { genres: ["Synthpop"] } },
      }),
  },
  {
    id: "artist",
    label: "Artist",
    description: "Top albums by album artist.",
    icon: UsersRound,
    createConfig: () =>
      createChartTemplateConfig({
        request: { filters: { albumArtist: { operator: "contains", value: "Pet Shop Boys" } } },
      }),
  },
  {
    id: "loved",
    label: "Loved",
    description: "Albums with the most loved tracks.",
    icon: Heart,
    createConfig: () =>
      createChartTemplateConfig({
        rankingMetric: "lovedTracks",
        request: { sort: { field: "lovedTracks", direction: "desc" }, filters: { lovedTracksMin: 1 } },
      }),
  },
  {
    id: "ae",
    label: "AE",
    description: "Albums with the highest Album Excellence.",
    icon: Sparkles,
    createConfig: () =>
      createChartTemplateConfig({
        rankingMetric: "ae",
        request: { sort: { field: "ae", direction: "desc" } },
      }),
  },
  {
    id: "tmoe",
    label: "TMOE",
    description: "Albums with the highest Total Minutes Of Excellence.",
    icon: Clock3,
    createConfig: () =>
      createChartTemplateConfig({
        rankingMetric: "tmoe",
        request: { sort: { field: "tmoe", direction: "desc" } },
      }),
  },
];

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

function formatHours(seconds: number | null | undefined) {
  if (!seconds) return "0h";
  return `${(seconds / 3600).toFixed(1)}h`;
}

function formatPercent(value: number | null | undefined, digits = 1) {
  if (value == null) return "";
  return `${(value * 100).toFixed(digits)}%`;
}

function percentOf(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (value / total) * 100));
}

function formatAverage(value: number | null | undefined, digits = 1) {
  if (value == null) return "";
  return value.toFixed(digits);
}

function formatTrackRating(value: number | null | undefined) {
  if (value == null) return "";
  return `${value / 20}`;
}

function rankingLabel(value: string) {
  return rankingOptions.find((option) => option.value === value)?.label ?? "Album Score";
}

function formatChartMetric(row: BrowseRow, metric: string) {
  switch (metric) {
    case "albumRating":
      return row.effectiveAlbumRating?.toString() ?? "";
    case "lovedTracks":
      return row.lovedTracks?.toString() ?? "0";
    case "ae":
      return formatPercent(row.aeRatio, 2);
    case "tmoe":
      return formatMinutes(row.tmoeSeconds);
    case "ratingCompleteness":
      return formatPercent(row.ratingCompleteness);
    case "totalMinutes":
      return formatMinutes(row.totalSeconds);
    default:
      return row.albumScore?.toFixed(3) ?? "";
  }
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

function clampBackupRetention(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return 3;
  return Math.min(50, Math.max(1, Math.round(value)));
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

function ChartResults({ response, config }: { response: BrowseResponse | null; config: ChartConfig }) {
  if (!response) {
    return (
      <div className="empty-state large">
        <BarChart3 size={20} />
        <span>No chart loaded.</span>
      </div>
    );
  }

  if (response.rows.length === 0) {
    return (
      <div className="empty-state large">
        <FileSearch size={20} />
        <span>No ranked albums.</span>
      </div>
    );
  }

  if (config.viewMode === "compact") {
    return (
      <div className="chart-list" role="list">
        {response.rows.map((row, index) => (
          <article className="chart-list-row" role="listitem" key={row.id}>
            <strong className="rank-number">{index + 1}</strong>
            <div>
              <h3>{row.album ?? "Untitled"}</h3>
              <p>
                {[row.albumArtistDisplay, row.year, row.canonicalGenre].filter(Boolean).join(" / ")}
              </p>
            </div>
            <div className="rank-metric">
              <span>{rankingLabel(config.rankingMetric)}</span>
              <strong>{formatChartMetric(row, config.rankingMetric)}</strong>
            </div>
          </article>
        ))}
      </div>
    );
  }

  if (config.viewMode === "grid") {
    return (
      <div className="chart-grid" role="list">
        {response.rows.map((row, index) => (
          <article className="chart-grid-item" role="listitem" key={row.id}>
            <div className="cover-placeholder" aria-hidden="true">
              <span>{row.album?.slice(0, 1).toUpperCase() ?? "A"}</span>
            </div>
            <div>
              <strong>#{index + 1}</strong>
              <h3>{row.album ?? "Untitled"}</h3>
              <p>{row.albumArtistDisplay ?? ""}</p>
              <span>{formatChartMetric(row, config.rankingMetric)}</span>
            </div>
          </article>
        ))}
      </div>
    );
  }

  const visibleColumns = new Set(config.visibleColumns);
  const columns = [
    { key: "rank", label: "#", value: (_row: BrowseRow, index: number) => `${index + 1}` },
    { key: "album", label: "Album", value: (row: BrowseRow) => row.album ?? "Untitled" },
    { key: "artist", label: "Artist", value: (row: BrowseRow) => row.albumArtistDisplay ?? "" },
    { key: "year", label: "Year", value: (row: BrowseRow) => row.year?.toString() ?? "" },
    { key: "genre", label: "Genre", value: (row: BrowseRow) => row.canonicalGenre ?? "" },
    { key: "rating", label: "Rating", value: (row: BrowseRow) => row.effectiveAlbumRating?.toString() ?? "" },
    { key: "complete", label: "Complete", value: (row: BrowseRow) => formatPercent(row.ratingCompleteness) },
    { key: "score", label: "Score", value: (row: BrowseRow) => row.albumScore?.toFixed(3) ?? "" },
    { key: "loved", label: "Loved", value: (row: BrowseRow) => row.lovedTracks?.toString() ?? "0" },
    { key: "ae", label: "AE", value: (row: BrowseRow) => formatPercent(row.aeRatio, 2) },
    { key: "tmoe", label: "TMOE", value: (row: BrowseRow) => formatMinutes(row.tmoeSeconds) },
    { key: "minutes", label: "Minutes", value: (row: BrowseRow) => formatMinutes(row.totalSeconds) },
  ].filter((column) => ["rank", "album", "artist", "year", "genre"].includes(column.key) || visibleColumns.has(column.key));

  return (
    <div className="result-table chart-results" role="table">
      <div className="result-table-head" role="row">
        {columns.map((column) => (
          <span role="columnheader" key={column.key}>
            {column.label}
          </span>
        ))}
      </div>
      {response.rows.map((row, index) => (
        <div className="result-table-row" role="row" key={row.id}>
          {columns.map((column) => (
            <span role="cell" key={column.key}>
              {column.value(row, index)}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function Meter({
  label,
  value,
  total,
  detail,
}: {
  label: string;
  value: number;
  total: number;
  detail: string;
}) {
  return (
    <div className="meter-row">
      <div>
        <span>{label}</span>
        <strong>{formatNumber(value)}</strong>
      </div>
      <div className="meter-track" aria-hidden="true">
        <div className="meter-fill" style={{ width: `${percentOf(value, total)}%` }} />
      </div>
      <small>{detail}</small>
    </div>
  );
}

function DistributionBars({ buckets }: { buckets: RatingBucket[] }) {
  const maxCount = Math.max(1, ...buckets.map((bucket) => bucket.count));
  return (
    <div className="distribution-bars">
      {buckets.map((bucket) => (
        <div className="distribution-row" key={bucket.label}>
          <span>{bucket.label}</span>
          <div className="meter-track" aria-hidden="true">
            <div className="meter-fill" style={{ width: `${percentOf(bucket.count, maxCount)}` + "%" }} />
          </div>
          <strong>{formatNumber(bucket.count)}</strong>
        </div>
      ))}
    </div>
  );
}

function YearProgressTable({ rows }: { rows: YearProgressStats[] }) {
  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <Activity size={20} />
        <span>No year statistics yet.</span>
      </div>
    );
  }

  return (
    <div className="stats-table year-stats-table" role="table">
      <div className="stats-table-head" role="row">
        <span role="columnheader">Year</span>
        <span role="columnheader">Albums</span>
        <span role="columnheader">Rated</span>
        <span role="columnheader">Partial</span>
        <span role="columnheader">Hours</span>
        <span role="columnheader">Score</span>
      </div>
      {rows.slice(0, 14).map((row) => (
        <div className="stats-table-row" role="row" key={row.year}>
          <span role="cell">{row.year}</span>
          <span role="cell">{formatNumber(row.albumCount)}</span>
          <span role="cell">{formatNumber(row.ratedAlbumCount)}</span>
          <span role="cell">{formatNumber(row.partialAlbumCount)}</span>
          <span role="cell">{formatHours(row.totalSeconds)}</span>
          <span role="cell">{formatAverage(row.averageAlbumScore, 1)}</span>
        </div>
      ))}
    </div>
  );
}

function GenreProgressTable({ rows }: { rows: GenreProgressStats[] }) {
  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <Tags size={20} />
        <span>No genre statistics yet.</span>
      </div>
    );
  }

  return (
    <div className="stats-table genre-stats-table" role="table">
      <div className="stats-table-head" role="row">
        <span role="columnheader">Genre</span>
        <span role="columnheader">Albums</span>
        <span role="columnheader">Rated</span>
        <span role="columnheader">Partial</span>
        <span role="columnheader">Loved</span>
        <span role="columnheader">Score</span>
      </div>
      {rows.slice(0, 12).map((row) => (
        <div className="stats-table-row" role="row" key={row.genre}>
          <span role="cell">{row.genre}</span>
          <span role="cell">{formatNumber(row.albumCount)}</span>
          <span role="cell">{formatNumber(row.ratedAlbumCount)}</span>
          <span role="cell">{formatNumber(row.partialAlbumCount)}</span>
          <span role="cell">{formatNumber(row.lovedTracks)}</span>
          <span role="cell">{formatAverage(row.averageAlbumScore, 1)}</span>
        </div>
      ))}
    </div>
  );
}

function eventLabel(eventType: string) {
  const labels: Record<string, string> = {
    addedPartial: "Added partial",
    addedRated: "Added rated",
    completed: "Completed",
    ratedLess: "Rated less",
    ratedMore: "Rated more",
    ratingChanged: "Rating changed",
    ratingUpdated: "Rating updated",
    removedRated: "Removed rated",
  };
  return labels[eventType] ?? eventType;
}

function RatingEventList({ events }: { events: RatingEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="empty-state">
        <Activity size={20} />
        <span>No rating events yet.</span>
      </div>
    );
  }

  return (
    <div className="rating-event-list">
      {events.slice(0, 8).map((event) => (
        <article className="rating-event" key={event.id}>
          <strong>{eventLabel(event.eventType)}</strong>
          <span>{[event.albumArtistDisplay, event.album, event.year].filter(Boolean).join(" / ")}</span>
          <small>
            {formatPercent(event.previousRatingCompleteness, 0) || "New"}
            {" -> "}
            {formatPercent(event.currentRatingCompleteness, 0) || "Removed"}
          </small>
        </article>
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
  const [savedCharts, setSavedCharts] = useState<SavedChart[]>([]);
  const [saveName, setSaveName] = useState("");
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [includeCalculated, setIncludeCalculated] = useState(false);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [chartConfig, setChartConfig] = useState<ChartConfig>(() => createChartConfig());
  const [chartResponse, setChartResponse] = useState<BrowseResponse | null>(null);
  const [chartName, setChartName] = useState("");
  const [chartError, setChartError] = useState<string | null>(null);
  const [isChartLoading, setIsChartLoading] = useState(false);
  const [chartExportResult, setChartExportResult] = useState<ExportResult | null>(null);
  const [statistics, setStatistics] = useState<StatisticsResponse | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [isStatsLoading, setIsStatsLoading] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() => createDefaultSettings());
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const canImport = isTauriRuntime();

  const loadData = useCallback(async () => {
    const [nextStatus, nextRuns, nextSavedSearches, nextSavedCharts, nextStatistics, nextSettings] = await Promise.all([
      getLibraryStatus(),
      listImportRuns(8),
      listSavedSearches(),
      listSavedCharts(),
      getStatistics(),
      getSettings(),
    ]);
    setStatus(nextStatus);
    setRuns(nextRuns);
    setSavedSearches(nextSavedSearches);
    setSavedCharts(nextSavedCharts);
    setStatistics(nextStatistics);
    setSettings(nextSettings);
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
    document.documentElement.dataset.theme = settings.darkMode ? "dark" : "light";
  }, [settings.darkMode]);

  useEffect(() => {
    if (activeSection !== "Search") {
      return;
    }

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
  }, [activeSection, request]);

  const lastRun = runs[0] ?? status?.lastImport ?? null;
  const currentFilters = request.filters;
  const chartRequest = useMemo(() => chartRequestFromConfig(chartConfig), [chartConfig]);

  useEffect(() => {
    if (activeSection !== "Charts") {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsChartLoading(true);
      setChartError(null);
      void searchLibrary(chartRequest)
        .then((nextResponse) => {
          if (!cancelled) {
            setChartResponse(nextResponse);
          }
        })
        .catch((searchError) => {
          if (!cancelled) {
            setChartError(searchError instanceof Error ? searchError.message : String(searchError));
            setChartResponse(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsChartLoading(false);
          }
        });
    }, 160);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeSection, chartRequest]);

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

  function updateChartConfig(values: Partial<ChartConfig>) {
    setChartConfig((previous) => ({
      ...previous,
      ...values,
      request: values.request ?? previous.request,
    }));
    setChartExportResult(null);
  }

  function updateChartFilters(values: Partial<BrowseFilters>) {
    setChartConfig((previous) => ({
      ...previous,
      request: {
        ...previous.request,
        filters: {
          ...previous.request.filters,
          ...values,
        },
        offset: 0,
      },
    }));
    setChartExportResult(null);
  }

  function toggleChartColumn(value: string, key: "visibleColumns" | "exportColumns") {
    setChartConfig((previous) => {
      const current = previous[key];
      const nextValues = current.includes(value)
        ? current.filter((column) => column !== value)
        : [...current, value];
      return { ...previous, [key]: nextValues };
    });
    setChartExportResult(null);
  }

  function applyChartTemplate(template: ChartTemplate) {
    setChartConfig(template.createConfig());
    setChartExportResult(null);
  }

  async function saveCurrentChart() {
    const nextConfig = {
      ...chartConfig,
      request: chartRequest,
    };
    const fallbackName = `${rankingLabel(nextConfig.rankingMetric)} chart`;
    const saved = await saveChart(chartName.trim() || fallbackName, nextConfig);
    setSavedCharts((previous) => [saved, ...previous.filter((chart) => chart.id !== saved.id)]);
    setChartName("");
  }

  async function removeSavedChart(id: number) {
    await deleteSavedChart(id);
    setSavedCharts((previous) => previous.filter((chart) => chart.id !== id));
  }

  async function runChartExport(format: string) {
    const result = await exportSearch(chartRequest, format, chartConfig.exportColumns.length > 0);
    setChartExportResult(result);
  }

  async function refreshStatistics() {
    setIsStatsLoading(true);
    setStatsError(null);
    try {
      await loadData();
    } catch (error) {
      setStatsError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsStatsLoading(false);
    }
  }

  async function saveAppSettings(values: Partial<AppSettings>) {
    const nextSettings = {
      ...settings,
      ...values,
      backupRetention: clampBackupRetention(values.backupRetention ?? settings.backupRetention),
    };
    setSettings(nextSettings);
    setIsSavingSettings(true);
    setSettingsError(null);

    try {
      const saved = await saveSettings(nextSettings);
      setSettings(saved);
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSavingSettings(false);
    }
  }

  const total = response?.total ?? 0;
  const pageStart = total === 0 ? 0 : request.offset + 1;
  const pageEnd = Math.min(total, request.offset + request.limit);
  const chartTotal = chartResponse?.total ?? 0;
  const chartRows = chartResponse?.rows.length ?? 0;
  const ratingAlbumTotal =
    (statistics?.ratingProgress.fullyRatedAlbums ?? 0) +
    (statistics?.ratingProgress.partiallyRatedAlbums ?? 0) +
    (statistics?.ratingProgress.unratedAlbums ?? 0);
  const ratingTrackTotal =
    (statistics?.ratingProgress.ratedTracks ?? 0) + (statistics?.ratingProgress.unratedTracks ?? 0);

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
      ) : activeSection === "Charts" ? (
        <section className="workspace charts-workspace">
          <header className="topbar">
            <div>
              <h1>Charts</h1>
              <p>Rank album lists from saved filters, Album Score, loved tracks, AE, and TMOE.</p>
            </div>
            <div className="topbar-actions">
              <button className="icon-button" type="button" aria-label="Reset chart" onClick={() => setChartConfig(createChartConfig())}>
                <RotateCcw size={18} />
              </button>
              <button className="icon-button" type="button" aria-label="Refresh" onClick={() => void loadData()}>
                <Database size={18} />
              </button>
            </div>
          </header>

          <section className="metric-grid" aria-label="Chart summary">
            <Metric label="Albums" value={formatNumber(status?.albumCount)} tone="teal" icon={Album} />
            <Metric label="Ranked" value={formatNumber(chartTotal)} tone="amber" icon={BarChart3} />
            <Metric label="Showing" value={formatNumber(chartRows)} icon={ListMusic} />
            <Metric label="Saved" value={formatNumber(savedCharts.length)} icon={Save} />
          </section>

          <section className="chart-template-panel" aria-label="Built-in charts">
            {chartTemplates.map((template) => {
              const Icon = template.icon;
              return (
                <button type="button" key={template.id} onClick={() => applyChartTemplate(template)}>
                  <Icon size={17} />
                  <span>
                    <strong>{template.label}</strong>
                    <small>{template.description}</small>
                  </span>
                </button>
              );
            })}
          </section>

          <section className="query-panel chart-builder">
            <div className="search-row">
              <div className="search-input">
                <Search size={18} />
                <input
                  value={chartConfig.request.searchText}
                  onChange={(event) =>
                    updateChartConfig({
                      request: { ...chartConfig.request, searchText: event.target.value, offset: 0 },
                    })
                  }
                  placeholder="Search within chart albums, artists, genres, publishers"
                />
              </div>

              <div className="segmented-control" aria-label="Chart view mode">
                {chartViewModes.map((mode) => {
                  const Icon = mode.icon;
                  return (
                    <button
                      className={chartConfig.viewMode === mode.value ? "active" : ""}
                      type="button"
                      key={mode.value}
                      onClick={() => updateChartConfig({ viewMode: mode.value })}
                    >
                      <Icon size={16} />
                      <span>{mode.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="filter-grid">
              <NumberField
                label="Year from"
                value={chartConfig.request.filters.yearFrom}
                onChange={(value) => updateChartFilters({ yearFrom: value })}
              />
              <NumberField
                label="Year to"
                value={chartConfig.request.filters.yearTo}
                onChange={(value) => updateChartFilters({ yearTo: value })}
              />
              <label className="criterion">
                <span>Genres</span>
                <input
                  value={chartConfig.request.filters.genres.join(", ")}
                  onChange={(event) => updateChartFilters({ genres: parseList(event.target.value) })}
                  placeholder="Synthpop, AOR"
                />
              </label>
              <TextCriterion
                label="Album artist"
                filter={chartConfig.request.filters.albumArtist}
                onChange={(filter) => updateChartFilters({ albumArtist: filter })}
              />
              <TextCriterion
                label="Album title"
                filter={chartConfig.request.filters.albumTitle}
                onChange={(filter) => updateChartFilters({ albumTitle: filter })}
              />
              <TextCriterion
                label="Publisher"
                filter={chartConfig.request.filters.publisher}
                onChange={(filter) => updateChartFilters({ publisher: filter })}
              />
              <NumberField
                label="Minutes min"
                value={chartConfig.request.filters.totalMinutesMin}
                step={0.5}
                onChange={(value) => updateChartFilters({ totalMinutesMin: value })}
              />
              <NumberField
                label="Minutes max"
                value={chartConfig.request.filters.totalMinutesMax}
                step={0.5}
                onChange={(value) => updateChartFilters({ totalMinutesMax: value })}
              />
              <NumberField
                label="Loved min"
                value={chartConfig.request.filters.lovedTracksMin}
                min={0}
                onChange={(value) => updateChartFilters({ lovedTracksMin: value })}
              />
              <SelectField
                label="Ranking"
                value={chartConfig.rankingMetric}
                onChange={(rankingMetric) => updateChartConfig({ rankingMetric })}
                options={rankingOptions}
              />
              <SelectField
                label="Direction"
                value={chartConfig.sortDirection}
                onChange={(sortDirection) => updateChartConfig({ sortDirection: sortDirection as "asc" | "desc" })}
                options={[
                  { value: "desc", label: "Descending" },
                  { value: "asc", label: "Ascending" },
                ]}
              />
              <NumberField
                label="Limit"
                value={chartConfig.resultLimit}
                min={10}
                max={500}
                onChange={(value) => updateChartConfig({ resultLimit: value ?? 50 })}
              />
              <label className="criterion slider-criterion chart-slider">
                <span>Completeness</span>
                <div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={chartConfig.ratingCompletenessThreshold}
                    onChange={(event) => updateChartConfig({ ratingCompletenessThreshold: Number(event.target.value) })}
                  />
                  <strong>{chartConfig.ratingCompletenessThreshold}%</strong>
                </div>
              </label>
            </div>

            <div className="query-footer chart-options">
              <div className="missing-flags" aria-label="Visible chart columns">
                {chartColumnOptions.map((option) => (
                  <label key={option.value}>
                    <input
                      type="checkbox"
                      checked={chartConfig.visibleColumns.includes(option.value)}
                      onChange={() => toggleChartColumn(option.value, "visibleColumns")}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={chartConfig.exportColumns.includes("calculated")}
                  onChange={() => toggleChartColumn("calculated", "exportColumns")}
                />
                <span>Calculated export columns</span>
              </label>
            </div>
          </section>

          <section className="table-panel" aria-label="Chart results">
            <div className="panel-heading compact">
              <div>
                <h2>{rankingLabel(chartConfig.rankingMetric)} chart</h2>
                <p>
                  {isChartLoading
                    ? "Ranking"
                    : `${formatNumber(chartRows)} shown from ${formatNumber(chartTotal)} matches`}
                </p>
              </div>
              <span className="run-status">{chartConfig.ratingCompletenessThreshold}% complete</span>
            </div>

            {chartError ? <p className="error-message">{chartError}</p> : null}
            <ChartResults response={chartResponse} config={chartConfig} />
          </section>
        </section>
      ) : activeSection === "Statistics" ? (
        <section className="workspace statistics-workspace">
          <header className="topbar">
            <div>
              <h1>Statistics</h1>
              <p>Library totals, rating progress, import deltas, and rating history.</p>
            </div>
            <div className="topbar-actions">
              <button
                className="icon-button"
                type="button"
                aria-label="Refresh statistics"
                onClick={() => void refreshStatistics()}
              >
                <RotateCcw size={18} />
              </button>
            </div>
          </header>

          <section className="metric-grid" aria-label="Statistics summary">
            <Metric
              label="Tracks"
              value={formatNumber(statistics?.overview.trackCount ?? status?.trackCount)}
              tone="teal"
              icon={ListMusic}
            />
            <Metric
              label="Albums"
              value={formatNumber(statistics?.overview.albumCount ?? status?.albumCount)}
              tone="amber"
              icon={Album}
            />
            <Metric label="Artists" value={formatNumber(statistics?.overview.albumArtistCount)} icon={UsersRound} />
            <Metric label="Duration" value={formatHours(statistics?.overview.totalSeconds)} icon={Clock3} />
          </section>

          {statsError ? <p className="error-message">{statsError}</p> : null}

          <section className="stats-dashboard-grid" aria-label="Statistics dashboards">
            <section className="stats-panel rating-progress-panel">
              <div className="panel-heading compact">
                <div>
                  <h2>Rating progress</h2>
                  <p>{isStatsLoading ? "Refreshing" : formatPercent(statistics?.ratingProgress.averageRatingCompleteness)}</p>
                </div>
                <Gauge size={18} />
              </div>

              {statistics ? (
                <div className="meter-stack">
                  <Meter
                    label="Fully rated albums"
                    value={statistics.ratingProgress.fullyRatedAlbums}
                    total={ratingAlbumTotal}
                    detail={`${percentOf(statistics.ratingProgress.fullyRatedAlbums, ratingAlbumTotal).toFixed(1)}%`}
                  />
                  <Meter
                    label="Partially rated albums"
                    value={statistics.ratingProgress.partiallyRatedAlbums}
                    total={ratingAlbumTotal}
                    detail={`${percentOf(statistics.ratingProgress.partiallyRatedAlbums, ratingAlbumTotal).toFixed(1)}%`}
                  />
                  <Meter
                    label="Rated tracks"
                    value={statistics.ratingProgress.ratedTracks}
                    total={ratingTrackTotal}
                    detail={`${percentOf(statistics.ratingProgress.ratedTracks, ratingTrackTotal).toFixed(1)}%`}
                  />
                </div>
              ) : (
                <div className="empty-state">
                  <Activity size={20} />
                  <span>No statistics loaded.</span>
                </div>
              )}
            </section>

            <section className="stats-panel loved-panel">
              <div className="panel-heading compact">
                <div>
                  <h2>Loved tracks</h2>
                  <p>{statistics?.lovedTracks.topLovedGenre ?? "Waiting for library data"}</p>
                </div>
                <Heart size={18} />
              </div>
              <div className="stat-pairs">
                <div>
                  <span>Loved tracks</span>
                  <strong>{formatNumber(statistics?.lovedTracks.lovedTracks)}</strong>
                </div>
                <div>
                  <span>Albums with love</span>
                  <strong>{formatNumber(statistics?.lovedTracks.albumsWithLovedTracks)}</strong>
                </div>
                <div>
                  <span>Average per album</span>
                  <strong>{formatAverage(statistics?.lovedTracks.averageLovedTracksPerAlbum, 2)}</strong>
                </div>
                <div>
                  <span>Top year</span>
                  <strong>{statistics?.lovedTracks.topLovedYear ?? ""}</strong>
                </div>
              </div>
            </section>

            <section className="stats-panel wide">
              <div className="panel-heading compact">
                <div>
                  <h2>Year progress</h2>
                  <p>{formatNumber(statistics?.overview.yearCount)} years with albums</p>
                </div>
                <Clock3 size={18} />
              </div>
              <YearProgressTable rows={statistics?.yearProgress ?? []} />
            </section>

            <section className="stats-panel wide">
              <div className="panel-heading compact">
                <div>
                  <h2>Genre progress</h2>
                  <p>{formatNumber(statistics?.overview.genreCount)} canonical genres</p>
                </div>
                <Tags size={18} />
              </div>
              <GenreProgressTable rows={statistics?.genreProgress ?? []} />
            </section>

            <section className="stats-panel">
              <div className="panel-heading compact">
                <div>
                  <h2>Track ratings</h2>
                  <p>{formatNumber(statistics?.ratingProgress.ratedTracks)} rated tracks</p>
                </div>
                <ListMusic size={18} />
              </div>
              <DistributionBars buckets={statistics?.trackRatingDistribution ?? []} />
            </section>

            <section className="stats-panel">
              <div className="panel-heading compact">
                <div>
                  <h2>Album ratings</h2>
                  <p>{formatNumber(statistics?.ratingProgress.albumsWithEffectiveRating)} scored albums</p>
                </div>
                <Album size={18} />
              </div>
              <DistributionBars buckets={statistics?.albumRatingDistribution ?? []} />
            </section>

            <section className="stats-panel wide">
              <div className="panel-heading compact">
                <div>
                  <h2>Import history</h2>
                  <p>Track and album deltas recorded during imports.</p>
                </div>
                <FolderInput size={18} />
              </div>
              <div className="stats-table import-stats-table" role="table">
                <div className="stats-table-head" role="row">
                  <span role="columnheader">Status</span>
                  <span role="columnheader">Completed</span>
                  <span role="columnheader">Tracks</span>
                  <span role="columnheader">Track delta</span>
                  <span role="columnheader">Albums</span>
                  <span role="columnheader">Album delta</span>
                </div>
                {(statistics?.importHistory ?? []).length === 0 ? (
                  <div className="empty-state">
                    <FileSearch size={20} />
                    <span>No imports yet.</span>
                  </div>
                ) : (
                  statistics?.importHistory.map((run) => (
                    <div className="stats-table-row" role="row" key={run.id}>
                      <span role="cell">
                        <RunStatus status={run.status} />
                      </span>
                      <span role="cell">{formatDate(run.completedAt)}</span>
                      <span role="cell">{formatNumber(run.trackRows)}</span>
                      <span role="cell">
                        +{formatNumber(run.addedTracks)} / ~{formatNumber(run.changedTracks)} / -
                        {formatNumber(run.removedTracks)}
                      </span>
                      <span role="cell">{formatNumber(run.albumCount)}</span>
                      <span role="cell">
                        +{formatNumber(run.addedAlbums)} / ~{formatNumber(run.changedAlbums)} / -
                        {formatNumber(run.removedAlbums)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="stats-panel wide">
              <div className="panel-heading compact">
                <div>
                  <h2>Rating history</h2>
                  <p>{formatNumber(statistics?.recentRatingEvents.length)} recent rating events</p>
                </div>
                <Activity size={18} />
              </div>
              <div className="rating-history-strip">
                {(statistics?.ratingHistory ?? []).slice(-8).map((point) => (
                  <article className="history-point" key={point.importRunId}>
                    <span>{formatDate(point.createdAt)}</span>
                    <strong>{formatPercent(point.ratedTracks / Math.max(1, point.trackCount))}</strong>
                    <small>{formatNumber(point.ratingEventsCount)} events</small>
                  </article>
                ))}
              </div>
              <RatingEventList events={statistics?.recentRatingEvents ?? []} />
            </section>
          </section>
        </section>
      ) : activeSection === "Settings" ? (
        <section className="workspace settings-workspace">
          <header className="topbar">
            <div>
              <h1>Settings</h1>
              <p>Backup retention and app appearance.</p>
            </div>
            <button className="icon-button" type="button" aria-label="Reload settings" onClick={() => void loadData()}>
              <RotateCcw size={18} />
            </button>
          </header>

          <section className="metric-grid" aria-label="Settings summary">
            <Metric
              label="Rolling backups"
              value={formatNumber(settings.backupRetention)}
              tone="teal"
              icon={Database}
            />
            <Metric label="Theme" value={settings.darkMode ? "Dark" : "Light"} tone="amber" icon={Moon} />
            <Metric label="Settings" value={isSavingSettings ? "Saving" : "Saved"} icon={Save} />
            <Metric label="Runtime" value={canImport ? "Desktop" : "Preview"} icon={Settings} />
          </section>

          {settingsError ? <p className="error-message">{settingsError}</p> : null}

          <section className="settings-grid" aria-label="Application settings">
            <section className="settings-panel">
              <div className="panel-heading compact">
                <div>
                  <h2>Backups</h2>
                  <p>{settings.backupRetention} retained after each import</p>
                </div>
                <Database size={18} />
              </div>

              <label className="criterion setting-number">
                <span>Rolling backups</span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={settings.backupRetention}
                  onChange={(event) =>
                    void saveAppSettings({
                      backupRetention: clampBackupRetention(numberValue(event.target.value)),
                    })
                  }
                />
              </label>
            </section>

            <section className="settings-panel">
              <div className="panel-heading compact">
                <div>
                  <h2>Appearance</h2>
                  <p>{settings.darkMode ? "Dark mode" : "Light mode"}</p>
                </div>
                <Moon size={18} />
              </div>

              <label className="setting-toggle">
                <input
                  type="checkbox"
                  aria-label="Dark mode"
                  checked={settings.darkMode}
                  onChange={(event) => void saveAppSettings({ darkMode: event.target.checked })}
                />
                <span>
                  <strong>Dark mode</strong>
                  <small>{settings.darkMode ? "On" : "Off"}</small>
                </span>
              </label>
            </section>
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
      ) : activeSection === "Charts" ? (
        <aside className="detail-panel chart-detail" aria-label="Chart actions">
          <div className="detail-header">
            <BarChart3 size={20} />
            <div>
              <h2>Chart Library</h2>
              <p>Saved chart configs and exports</p>
            </div>
          </div>

          <section className="save-search-box">
            <label className="source-input">
              <span>Name</span>
              <input value={chartName} onChange={(event) => setChartName(event.target.value)} />
            </label>
            <button className="primary-button" type="button" onClick={() => void saveCurrentChart()}>
              <Save size={17} />
              <span>Save chart</span>
            </button>
          </section>

          <section className="saved-list" aria-label="Saved charts">
            {savedCharts.length === 0 ? (
              <div className="empty-state">
                <BarChart3 size={20} />
                <span>No saved charts.</span>
              </div>
            ) : (
              savedCharts.map((chart) => (
                <div className="saved-search" key={chart.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setChartConfig(chart.config);
                      setActiveSection("Charts");
                    }}
                  >
                    <strong>{chart.name}</strong>
                    <span>
                      {rankingLabel(chart.config.rankingMetric)} / {chart.config.viewMode}
                    </span>
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={`Delete ${chart.name}`}
                    onClick={() => void removeSavedChart(chart.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            )}
          </section>

          <section className="export-box">
            <div className="export-grid">
              {["csv", "tsv", "xlsx", "json", "txt"].map((format) => (
                <button type="button" key={format} onClick={() => void runChartExport(format)}>
                  <Download size={16} />
                  <span>{format.toUpperCase()}</span>
                </button>
              ))}
            </div>
            {chartExportResult ? (
              <div className="export-result">
                <Check size={17} />
                <span>
                  {formatNumber(chartExportResult.rowCount)} rows to {chartExportResult.path}
                </span>
              </div>
            ) : null}
          </section>
        </aside>
      ) : activeSection === "Statistics" ? (
        <aside className="detail-panel statistics-detail" aria-label="Statistics details">
          <div className="detail-header">
            <Activity size={20} />
            <div>
              <h2>Library Signals</h2>
              <p>{statistics?.lastUpdated ? formatDate(statistics.lastUpdated) : "No import yet"}</p>
            </div>
          </div>

          <dl className="run-details">
            <div>
              <dt>Average album rating</dt>
              <dd>{formatAverage(statistics?.ratingProgress.averageAlbumRating, 1)}</dd>
            </div>
            <div>
              <dt>Average album score</dt>
              <dd>{formatAverage(statistics?.overview.averageAlbumScore, 2)}</dd>
            </div>
            <div>
              <dt>Unrated albums</dt>
              <dd>{formatNumber(statistics?.ratingProgress.unratedAlbums)}</dd>
            </div>
            <div>
              <dt>Top loved genre</dt>
              <dd>{statistics?.lovedTracks.topLovedGenre ?? "Not yet"}</dd>
            </div>
          </dl>

          <section className="calculation-list statistics-signals">
            <div>
              <Album size={17} />
              <span>{formatNumber(statistics?.ratingProgress.fullyRatedAlbums)} fully rated albums</span>
            </div>
            <div>
              <Gauge size={17} />
              <span>{formatNumber(statistics?.ratingProgress.partiallyRatedAlbums)} partial albums</span>
            </div>
            <div>
              <Heart size={17} />
              <span>{formatNumber(statistics?.lovedTracks.lovedTracks)} loved tracks</span>
            </div>
            <div>
              <FolderInput size={17} />
              <span>{formatNumber(statistics?.importHistory.length)} import runs</span>
            </div>
          </section>

          <section className="saved-list" aria-label="Recent rating events">
            <div className="detail-header small">
              <Sparkles size={18} />
              <div>
                <h2>Recent Events</h2>
                <p>Rating changes from imports</p>
              </div>
            </div>
            <RatingEventList events={statistics?.recentRatingEvents ?? []} />
          </section>
        </aside>
      ) : activeSection === "Settings" ? (
        <aside className="detail-panel settings-detail" aria-label="Settings details">
          <div className="detail-header">
            <Settings size={20} />
            <div>
              <h2>Preferences</h2>
              <p>{settings.updatedAt ? formatDate(settings.updatedAt) : "Default settings"}</p>
            </div>
          </div>

          <dl className="run-details">
            <div>
              <dt>Rolling backups</dt>
              <dd>{formatNumber(settings.backupRetention)}</dd>
            </div>
            <div>
              <dt>Theme</dt>
              <dd>{settings.darkMode ? "Dark" : "Light"}</dd>
            </div>
            <div>
              <dt>Runtime</dt>
              <dd>{canImport ? "Tauri desktop" : "Web preview"}</dd>
            </div>
          </dl>

          <section className="calculation-list settings-signals">
            <div>
              <ShieldCheck size={17} />
              <span>Backups pruned after import</span>
            </div>
            <div>
              <Moon size={17} />
              <span>{settings.darkMode ? "Dark mode active" : "Light mode active"}</span>
            </div>
          </section>
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
              {["csv", "tsv", "xlsx", "json", "txt"].map((format) => (
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
