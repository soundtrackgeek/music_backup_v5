import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from "react";
import {
  Activity,
  Album,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Compass,
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
  Star,
  Tags,
  Trash2,
  UsersRound,
  Wrench,
  X,
} from "lucide-react";
import {
  deleteSavedChart,
  deleteSavedSearch,
  clearCoverImageCache,
  exportSearch,
  cacheSettings,
  getAlbumCoverDataUrl,
  getDiscovery,
  getSettings,
  getStatistics,
  getLibraryStatus,
  importAlbumCovers,
  importBillboardCharts,
  importBillboardSingles,
  importMusicBeeTsv,
  isTauriRuntime,
  listDatabaseBackups,
  listArtists,
  listGenres,
  listGenreSuggestions,
  listMusicToolIssues,
  listMusicTools,
  listImportRuns,
  listSavedCharts,
  listSavedSearches,
  loadCachedSettings,
  listenToCoverImportProgress,
  listenToImportProgress,
  listenToMusicToolProgress,
  saveChart,
  saveSearch,
  saveSettings,
  searchLibrary,
  exportMusicToolIssues,
  restoreDatabaseBackup,
} from "./backend";
import type {
  AppSettings,
  ArtistListRequest,
  ArtistListResponse,
  ArtistSummary,
  BillboardImportSummary,
  BillboardSinglesImportSummary,
  BrowseFilters,
  BrowseRequest,
  BrowseResponse,
  BrowseRow,
  BrowseSort,
  BrowseView,
  ChartConfig,
  ConcentrationPoint,
  CoverImportSummary,
  DatabaseBackup,
  DatabaseRestoreSummary,
  DecadeProgressStats,
  DiscoveryAlbumPoint,
  DiscoveryArtistPoint,
  DiscoveryGenrePoint,
  DiscoveryHeatmapCell,
  DiscoveryMission,
  DiscoveryResponse,
  ExportResult,
  GenreListRequest,
  GenreListResponse,
  GenreSummary,
  DurationAlbumStat,
  ImportRun,
  ImportSummary,
  LovedDensityStat,
  MetadataCoverageMetric,
  OutlierStat,
  LibraryStatus,
  LeftSidebarMode,
  GenreProgressStats,
  RatingBucket,
  RatingEvent,
  RightSidebarMode,
  MusicToolIssueRequest,
  MusicToolIssueResponse,
  MusicToolIssueRow,
  MusicToolProgress,
  MusicToolSummary,
  SavedChart,
  SavedSearch,
  StatisticsResponse,
  TextFilter,
  TextFilterOperator,
  YearProgressStats,
} from "./types";
import { chartTemplates, type ChartTemplate } from "./app/chartTemplates";
import {
  EXPORT_FORMATS,
  chartColumnOptions,
  chartGridCoverSize,
  chartViewModes,
  completenessRange,
  defaultCoverProgress,
  defaultProgress,
  formatMissingFieldLabels,
  genreSuggestionAliases,
  leftSidebarModeLabels,
  leftSidebarModeOptions,
  missingFieldLabel,
  missingFieldOptions,
  musicToolCatalog,
  navigation,
  operatorLabels,
  rankingOptions,
  rightSidebarModeLabels,
  rightSidebarModeOptions,
} from "./app/config";
import {
  compareBrowseRows,
  formatAverage,
  formatBillboardRank,
  formatBillboardSingleRank,
  formatBytes,
  formatChartMetric,
  formatClockTime,
  formatCompletenessRange,
  formatDate,
  formatDuration,
  formatHours,
  formatMinutes,
  formatNumber,
  formatPercent,
  formatSignedNumber,
  formatToolCount,
  formatToolProgress,
  formatTrackRating,
  isMusicToolProgressActive,
  percentOf,
  rankingLabel,
  ratingStarCount,
  ratioOf,
  severityLabel,
  textFilterLabel,
} from "./app/display";
import {
  currentGenreToken,
  formatList,
  genreSuggestions,
  listsEqual,
  parseList,
  replaceGenreToken,
  uniqueGenreSuggestionOptions,
} from "./app/genreSuggestions";
import { clampBackupRetention, numberValue } from "./app/input";
import {
  chartCompletenessRange,
  chartRequestFromConfig,
  clampCompletenessValue,
  createAlbumTracksRequest,
  createArtistAlbumsRequest,
  createArtistListRequest,
  createChartConfig,
  createDiscoveryAlbumPointRequest,
  createDiscoveryAlbumRequest,
  createDiscoveryArtistRequest,
  createDiscoveryGenreRequest,
  createDiscoveryHeatmapRequest,
  createDiscoveryMissionRequest,
  createGenreAlbumsRequest,
  createGenreListRequest,
  createGenreSuggestionRequest,
  createMusicToolIssueRequest,
  createRequest,
  createTextFilter,
  defaultSort,
  nextSort,
  normalizeChartConfigForClient,
  normalizeChartGridCoverSize,
  normalizeCompletenessRange,
  renewMusicToolIssueRequest,
  toCompletenessFilterRange,
  type DiscoverySelection,
} from "./app/requests";

function createDefaultSettings(): AppSettings {
  return loadCachedSettings();
}

function createDefaultLeftSidebarMode(): LeftSidebarMode {
  return loadCachedSettings().leftSidebarDefault;
}

function createDefaultRightSidebarMode(): RightSidebarMode {
  return loadCachedSettings().rightSidebarDefault;
}

async function loadGenreSuggestionNames() {
  try {
    return uniqueGenreSuggestionOptions(await listGenreSuggestions());
  } catch {
    // Older desktop builds or command failures can still fall back to the paginated summary command.
  }

  const names: string[] = [];
  let offset = 0;
  let total = 0;

  do {
    const nextGenres = await listGenres(createGenreSuggestionRequest(offset));
    names.push(...nextGenres.rows.map((genre) => genre.name));
    total = nextGenres.total;

    if (nextGenres.rows.length === 0) {
      break;
    }

    offset += nextGenres.rows.length;
  } while (offset < total);

  return uniqueGenreSuggestionOptions(names);
}

function RatingStars({
  value,
  label = "Rating",
  showValue = true,
}: {
  value: number | null | undefined;
  label?: string;
  showValue?: boolean;
}) {
  const filledStars = ratingStarCount(value);
  const ratingLabel = formatTrackRating(value);

  return (
    <span className="rating-stars" aria-label={ratingLabel ? `${label} ${ratingLabel}` : `${label} unrated`}>
      {Array.from({ length: 5 }, (_, index) => (
        <Star
          key={index}
          size={14}
          strokeWidth={1.8}
          className={index < filledStars ? "filled" : undefined}
          aria-hidden="true"
        />
      ))}
      {showValue ? <small>{ratingLabel || "Unrated"}</small> : null}
    </span>
  );
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

function GenreListCriterion({
  label,
  values,
  onChange,
  placeholder,
  genreOptions = [],
  onRequestOptions,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  genreOptions?: string[];
  onRequestOptions?: () => void;
}) {
  const inputId = useId();
  const listboxId = `${inputId}-genre-suggestions`;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draftValue, setDraftValue] = useState(() => formatList(values));
  const [caretPosition, setCaretPosition] = useState(() => draftValue.length);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [isSuggestionOpen, setIsSuggestionOpen] = useState(false);
  const activeToken = useMemo(
    () => currentGenreToken(draftValue, caretPosition),
    [caretPosition, draftValue],
  );
  const suggestions = useMemo(
    () => genreSuggestions(genreOptions, activeToken.query),
    [activeToken.query, genreOptions],
  );
  const showSuggestions = isSuggestionOpen && suggestions.length > 0 && activeToken.query.trim().length > 0;
  const activeSuggestionId = showSuggestions
    ? `${listboxId}-option-${activeSuggestionIndex}`
    : undefined;

  useEffect(() => {
    if (!listsEqual(parseList(draftValue), values)) {
      const nextValue = formatList(values);
      setDraftValue(nextValue);
      setCaretPosition(nextValue.length);
    }
  }, [draftValue, values]);

  useEffect(() => {
    setActiveSuggestionIndex(0);
  }, [activeToken.query, suggestions.length]);

  function syncCaret(input: HTMLInputElement) {
    setCaretPosition(input.selectionStart ?? input.value.length);
  }

  function updateDraft(nextValue: string) {
    setDraftValue(nextValue);
    onChange(parseList(nextValue));
  }

  function chooseSuggestion(suggestion: string) {
    const nextDraft = replaceGenreToken(draftValue, caretPosition, suggestion);
    updateDraft(nextDraft.value);
    setCaretPosition(nextDraft.caretPosition);
    setIsSuggestionOpen(false);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextDraft.caretPosition, nextDraft.caretPosition);
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      setIsSuggestionOpen(true);
      setActiveSuggestionIndex((current) => (showSuggestions ? (current + 1) % suggestions.length : 0));
      return;
    }

    if (event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      setIsSuggestionOpen(true);
      setActiveSuggestionIndex((current) =>
        showSuggestions ? (current - 1 + suggestions.length) % suggestions.length : suggestions.length - 1,
      );
      return;
    }

    if ((event.key === "Enter" || event.key === "Tab") && showSuggestions) {
      event.preventDefault();
      chooseSuggestion(suggestions[activeSuggestionIndex]);
      return;
    }

    if (event.key === "Escape") {
      setIsSuggestionOpen(false);
    }
  }

  return (
    <div className="criterion genre-list-criterion">
      <span id={`${inputId}-label`}>{label}</span>
      <input
        ref={inputRef}
        id={inputId}
        aria-labelledby={`${inputId}-label`}
        aria-autocomplete="list"
        aria-controls={showSuggestions ? listboxId : undefined}
        aria-expanded={showSuggestions}
        aria-activedescendant={activeSuggestionId}
        value={draftValue}
        onChange={(event) => {
          const nextValue = event.target.value;
          syncCaret(event.target);
          updateDraft(nextValue);
          setIsSuggestionOpen(true);
        }}
        onFocus={(event) => {
          syncCaret(event.currentTarget);
          setIsSuggestionOpen(true);
          if (genreOptions.length <= genreSuggestionAliases.length) {
            onRequestOptions?.();
          }
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={(event) => syncCaret(event.currentTarget)}
        onClick={(event) => syncCaret(event.currentTarget)}
        onSelect={(event) => syncCaret(event.currentTarget)}
        onBlur={(event) => {
          setDraftValue(formatList(parseList(event.currentTarget.value)));
          setIsSuggestionOpen(false);
        }}
        placeholder={placeholder}
      />
      {showSuggestions ? (
        <div className="genre-suggestions" id={listboxId} role="listbox">
          {suggestions.map((suggestion, index) => (
            <button
              className={index === activeSuggestionIndex ? "genre-suggestion active" : "genre-suggestion"}
              id={`${listboxId}-option-${index}`}
              key={suggestion}
              type="button"
              role="option"
              aria-selected={index === activeSuggestionIndex}
              onMouseDown={(event) => {
                event.preventDefault();
                chooseSuggestion(suggestion);
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </div>
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

function CompletenessRangeCriterion({
  minValue,
  maxValue,
  onChange,
  className = "",
}: {
  minValue: number | null;
  maxValue: number | null;
  onChange: (range: { min: number; max: number }) => void;
  className?: string;
}) {
  const { min, max } = normalizeCompletenessRange(
    minValue ?? completenessRange.min,
    maxValue ?? completenessRange.max,
  );
  const style = {
    "--range-min": `${min}%`,
    "--range-max": `${max}%`,
  } as CSSProperties;
  const minHandleStyle = { "--handle-position": `${min}%` } as CSSProperties;
  const maxHandleStyle = { "--handle-position": `${max}%` } as CSSProperties;
  const controlRef = useRef<HTMLDivElement | null>(null);

  function updateMin(value: number) {
    onChange(normalizeCompletenessRange(Math.min(value, max), max));
  }

  function updateMax(value: number) {
    onChange(normalizeCompletenessRange(min, Math.max(value, min)));
  }

  function valueFromPointer(clientX: number) {
    const rect = controlRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return completenessRange.min;
    return clampCompletenessValue(((clientX - rect.left) / rect.width) * completenessRange.max);
  }

  function updateHandle(handle: "min" | "max", value: number) {
    if (handle === "min") {
      updateMin(value);
    } else {
      updateMax(value);
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>, handle: "min" | "max") {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    updateHandle(handle, valueFromPointer(event.clientX));
  }

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>, handle: "min" | "max") {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      updateHandle(handle, valueFromPointer(event.clientX));
    }
  }

  function handlePointerUp(event: PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, handle: "min" | "max") {
    const current = handle === "min" ? min : max;
    const step = event.shiftKey ? 10 : completenessRange.step;
    let nextValue: number | null = null;

    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        nextValue = current - step;
        break;
      case "ArrowRight":
      case "ArrowUp":
        nextValue = current + step;
        break;
      case "PageDown":
        nextValue = current - 10;
        break;
      case "PageUp":
        nextValue = current + 10;
        break;
      case "Home":
        nextValue = completenessRange.min;
        break;
      case "End":
        nextValue = completenessRange.max;
        break;
      default:
        break;
    }

    if (nextValue != null) {
      event.preventDefault();
      updateHandle(handle, nextValue);
    }
  }

  return (
    <div className={`criterion slider-criterion completeness-range-criterion ${className}`.trim()}>
      <span>Completeness</span>
      <div className="range-slider" style={style}>
        <div className="range-control" ref={controlRef}>
          <span className="range-track" aria-hidden="true" />
          <button
            className={
              min === max && min === completenessRange.max
                ? "range-handle range-handle-min range-handle-overlap"
                : "range-handle range-handle-min"
            }
            type="button"
            role="slider"
            aria-label="Minimum completeness"
            aria-valuemin={completenessRange.min}
            aria-valuemax={max}
            aria-valuenow={min}
            aria-valuetext={`${min}%`}
            style={minHandleStyle}
            onPointerDown={(event) => handlePointerDown(event, "min")}
            onPointerMove={(event) => handlePointerMove(event, "min")}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onKeyDown={(event) => handleKeyDown(event, "min")}
          />
          <button
            className="range-handle range-handle-max"
            type="button"
            role="slider"
            aria-label="Maximum completeness"
            aria-valuemin={min}
            aria-valuemax={completenessRange.max}
            aria-valuenow={max}
            aria-valuetext={`${max}%`}
            style={maxHandleStyle}
            onPointerDown={(event) => handlePointerDown(event, "max")}
            onPointerMove={(event) => handlePointerMove(event, "max")}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onKeyDown={(event) => handleKeyDown(event, "max")}
          />
        </div>
        <strong>{formatCompletenessRange(min, max)}</strong>
      </div>
    </div>
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

function SortableColumnHeader({
  label,
  field,
  sort,
  onSort,
}: {
  label: string;
  field: string;
  sort: BrowseSort;
  onSort: (field: string) => void;
}) {
  const isActive = sort.field === field;
  const Icon = isActive ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  const nextDirection = isActive && sort.direction === "asc" ? "descending" : "ascending";

  return (
    <span role="columnheader" aria-sort={isActive ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
      <button
        className={`table-sort-button${isActive ? " active" : ""}`}
        type="button"
        aria-label={`Sort by ${label} ${nextDirection}`}
        onClick={() => onSort(field)}
      >
        <span>{label}</span>
        <Icon size={13} strokeWidth={2.2} aria-hidden="true" />
      </button>
    </span>
  );
}

function ResultTable({
  response,
  sort,
  onSort,
}: {
  response: BrowseResponse | null;
  sort: BrowseSort;
  onSort: (field: string) => void;
}) {
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
        <SortableColumnHeader label="Track" field="title" sort={sort} onSort={onSort} />
        <SortableColumnHeader label="Album" field="album" sort={sort} onSort={onSort} />
        <SortableColumnHeader label="Artist" field="displayArtist" sort={sort} onSort={onSort} />
        <SortableColumnHeader label="Year" field="year" sort={sort} onSort={onSort} />
        <SortableColumnHeader label="Single" field="billboardSingleRank" sort={sort} onSort={onSort} />
        <SortableColumnHeader label="Rating" field="trackRating" sort={sort} onSort={onSort} />
        <span role="columnheader">File</span>
      </div>
      {response.rows.map((row) => {
        const singleLabel = formatBillboardSingleRank(row);
        return (
          <div className="result-table-row" role="row" key={row.id}>
            <span role="cell">
              <strong>
                <span>{row.title ?? "Untitled"}</span>
                {singleLabel ? <span className="billboard-badge">{singleLabel}</span> : null}
              </strong>
              <small>
                {[row.discNumber, row.trackNumber].filter((value) => value != null).join(".")}
                {row.love === "L" ? "  Loved" : ""}
              </small>
            </span>
            <span className="album-title-cell" role="cell">
              <AlbumTitleContents row={row} subtitle={row.albumArtistDisplay ?? row.year?.toString() ?? null} />
            </span>
            <span role="cell">{row.displayArtist ?? row.albumArtistDisplay ?? ""}</span>
            <span role="cell">{row.year ?? ""}</span>
            <span role="cell">{singleLabel}</span>
            <span role="cell">{formatTrackRating(row.normalizedRating)}</span>
            <span role="cell" title={row.filePath ?? ""}>
              {row.filename ?? ""}
            </span>
          </div>
        );
      })}
    </div>
  ) : (
    <div className="result-table album-results" role="table">
      <div className="result-table-head" role="row">
        <SortableColumnHeader label="Album" field="album" sort={sort} onSort={onSort} />
        <SortableColumnHeader label="Artist" field="artist" sort={sort} onSort={onSort} />
        <SortableColumnHeader label="Year" field="year" sort={sort} onSort={onSort} />
        <SortableColumnHeader label="Genre" field="genre" sort={sort} onSort={onSort} />
        <SortableColumnHeader label="Tracks" field="trackCount" sort={sort} onSort={onSort} />
        <SortableColumnHeader label="Complete" field="ratingCompleteness" sort={sort} onSort={onSort} />
        <SortableColumnHeader label="Score" field="albumScore" sort={sort} onSort={onSort} />
      </div>
      {response.rows.map((row) => (
        <div className="result-table-row" role="row" key={row.id}>
          <span className="album-title-cell" role="cell">
            <AlbumTitleContents row={row} />
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

function albumInitial(row: BrowseRow | null) {
  return row?.album?.trim().slice(0, 1).toUpperCase() || "A";
}

function AlbumCover({
  row,
  className = "",
  decorative = true,
}: {
  row: BrowseRow | null;
  className?: string;
  decorative?: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const coverPath = row?.coverPath ?? null;
  const albumId = row?.albumId ?? null;

  useEffect(() => {
    setImageFailed(false);
    setImageUrl(null);
    if (!albumId || !coverPath) {
      return;
    }

    let cancelled = false;
    void getAlbumCoverDataUrl(albumId).then((nextImageUrl) => {
      if (!cancelled) {
        setImageUrl(nextImageUrl);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [albumId, coverPath]);

  const displayImageUrl = imageFailed ? null : imageUrl;
  const label = row?.album ? `${row.album} cover` : "Album cover";
  const classes = ["cover-placeholder", displayImageUrl ? "cover-image" : "", className].filter(Boolean).join(" ");

  return (
    <span className={classes} aria-hidden={decorative ? "true" : undefined}>
      {displayImageUrl ? (
        <img
          src={displayImageUrl}
          alt={decorative ? "" : label}
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span>{albumInitial(row)}</span>
      )}
    </span>
  );
}

function AlbumTitleContents({
  row,
  subtitle = formatMinutes(row.totalSeconds),
}: {
  row: BrowseRow;
  subtitle?: string | null;
}) {
  const billboardLabel = formatBillboardRank(row);
  return (
    <>
      <AlbumCover row={row} className="cover-mini" />
      <span>
        <strong>
          <span>{row.album ?? "Untitled"}</span>
          {billboardLabel ? <span className="billboard-badge">{billboardLabel}</span> : null}
        </strong>
        {subtitle ? <small>{subtitle}</small> : null}
      </span>
    </>
  );
}

function formatTrackPosition(row: BrowseRow) {
  const disc = row.discNumber?.toString() ?? "";
  const track = row.trackNumber?.toString() ?? "";
  if (disc && track) return `${disc}.${track}`;
  return disc || track;
}

function AlbumIndexTable({
  response,
  selectedAlbumId,
  onSelect,
  sort,
  onSort,
}: {
  response: BrowseResponse | null;
  selectedAlbumId: string | null;
  onSelect: (albumId: string) => void;
  sort: BrowseSort;
  onSort: (field: string) => void;
}) {
  if (!response) {
    return (
      <div className="empty-state large">
        <Album size={20} />
        <span>No albums loaded.</span>
      </div>
    );
  }

  if (response.rows.length === 0) {
    return (
      <div className="empty-state large">
        <FileSearch size={20} />
        <span>No albums match.</span>
      </div>
    );
  }

  return (
    <div className="result-table album-index-results" role="table">
      <div className="result-table-head" role="row">
        <SortableColumnHeader label="Album" field="album" sort={sort} onSort={onSort} />
        <SortableColumnHeader label="Artist" field="artist" sort={sort} onSort={onSort} />
        <SortableColumnHeader label="Year" field="year" sort={sort} onSort={onSort} />
        <SortableColumnHeader label="Genre" field="genre" sort={sort} onSort={onSort} />
        <SortableColumnHeader label="Tracks" field="trackCount" sort={sort} onSort={onSort} />
        <SortableColumnHeader label="Complete" field="ratingCompleteness" sort={sort} onSort={onSort} />
        <SortableColumnHeader label="Score" field="albumScore" sort={sort} onSort={onSort} />
      </div>
      {response.rows.map((row) => {
        const isSelected = row.albumId === selectedAlbumId;
        return (
          <div
            className={`result-table-row selectable${isSelected ? " selected" : ""}`}
            role="row"
            aria-selected={isSelected}
            tabIndex={0}
            key={row.id}
            onClick={() => onSelect(row.albumId)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(row.albumId);
              }
            }}
          >
            <span className="album-title-cell" role="cell">
              <AlbumTitleContents row={row} />
            </span>
            <span role="cell">{row.albumArtistDisplay ?? ""}</span>
            <span role="cell">{row.year ?? ""}</span>
            <span role="cell">{row.canonicalGenre ?? ""}</span>
            <span role="cell">{row.totalTracks ?? ""}</span>
            <span role="cell">{formatPercent(row.ratingCompleteness)}</span>
            <span role="cell">{row.albumScore?.toFixed(3) ?? ""}</span>
          </div>
        );
      })}
    </div>
  );
}

function AlbumTrackTable({
  response,
  isLoading,
}: {
  response: BrowseResponse | null;
  isLoading: boolean;
}) {
  if (!response) {
    return (
      <div className="empty-state large">
        <ListMusic size={20} />
        <span>{isLoading ? "Loading track list." : "Select an album."}</span>
      </div>
    );
  }

  if (response.rows.length === 0) {
    return (
      <div className="empty-state large">
        <FileSearch size={20} />
        <span>No tracks found.</span>
      </div>
    );
  }

  return (
    <div className="result-table album-track-results" role="table">
      <div className="result-table-head" role="row">
        <span role="columnheader">#</span>
        <span role="columnheader">Track</span>
        <span role="columnheader">Artist</span>
        <span role="columnheader">Time</span>
        <span role="columnheader">Rating</span>
        <span role="columnheader">File</span>
      </div>
      {response.rows.map((row) => (
        <div className="result-table-row" role="row" key={row.id}>
          <span role="cell">{formatTrackPosition(row)}</span>
          <span role="cell">
            <strong>{row.title ?? "Untitled"}</strong>
            <small>{row.love === "L" ? "Loved" : row.canonicalGenre ?? ""}</small>
          </span>
          <span role="cell">{row.displayArtist ?? row.albumArtistDisplay ?? ""}</span>
          <span role="cell">{formatMinutes(row.trackSeconds)}</span>
          <span role="cell">{formatTrackRating(row.normalizedRating)}</span>
          <span role="cell" title={row.filePath ?? ""}>
            {row.filename ?? ""}
          </span>
        </div>
      ))}
    </div>
  );
}

function AlbumDetailPanel({
  album,
  tracks,
  isLoading,
  includeCalculated,
  onIncludeCalculatedChange,
  exportResult,
  onExport,
}: {
  album: BrowseRow | null;
  tracks: BrowseResponse | null;
  isLoading: boolean;
  includeCalculated: boolean;
  onIncludeCalculatedChange: (value: boolean) => void;
  exportResult: ExportResult | null;
  onExport: (format: string) => Promise<void>;
}) {
  if (!album) {
    return (
      <aside className="detail-panel album-detail" aria-label="Album details">
        <div className="detail-header">
          <Album size={20} />
          <div>
            <h2>Album Detail</h2>
            <p>Select an album from the index</p>
          </div>
        </div>
        <div className="empty-state">
          <FileSearch size={20} />
          <span>No album selected.</span>
        </div>
      </aside>
    );
  }

  return (
    <aside className="detail-panel album-detail" aria-label="Album details">
      <div className="detail-header">
        <Album size={20} />
        <div>
          <h2>{album.album ?? "Untitled"}</h2>
          <p>{[album.albumArtistDisplay, album.year, album.canonicalGenre].filter(Boolean).join(" / ")}</p>
        </div>
      </div>

      <AlbumCover row={album} className="album-cover-large" decorative={false} />

      <dl className="run-details album-detail-stats">
        <div>
          <dt>Tracks</dt>
          <dd>
            {album.ratedTracks != null ? formatNumber(album.ratedTracks) : formatNumber(album.totalTracks)}
            {album.ratedTracks != null ? ` / ${formatNumber(album.totalTracks)} rated` : ""}
            {isLoading ? " / loading" : ""}
          </dd>
        </div>
        <div>
          <dt>Total time</dt>
          <dd>{formatMinutes(album.totalSeconds)}</dd>
        </div>
        <div>
          <dt>Rating completeness</dt>
          <dd>{formatPercent(album.ratingCompleteness)}</dd>
        </div>
        <div>
          <dt>Album rating</dt>
          <dd>{album.effectiveAlbumRating ?? ""}</dd>
        </div>
        <div>
          <dt>TMOE</dt>
          <dd>{formatMinutes(album.tmoeSeconds)}</dd>
        </div>
        <div>
          <dt>AE</dt>
          <dd>{formatPercent(album.aeRatio, 2)}</dd>
        </div>
        <div>
          <dt>Loved tracks</dt>
          <dd>{formatNumber(album.lovedTracks)}</dd>
        </div>
        <div>
          <dt>Album Score</dt>
          <dd>{album.albumScore?.toFixed(3) ?? ""}</dd>
        </div>
        <div>
          <dt>Billboard</dt>
          <dd>{formatBillboardRank(album)}</dd>
        </div>
        <div>
          <dt>Publisher</dt>
          <dd>{album.publisher ?? ""}</dd>
        </div>
        <div>
          <dt>Release year</dt>
          <dd>{album.releaseYear ?? ""}</dd>
        </div>
      </dl>

      <section className="export-box">
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={includeCalculated}
            onChange={(event) => onIncludeCalculatedChange(event.target.checked)}
          />
          <span>Calculated columns</span>
        </label>
        <div className="export-grid">
          {["csv", "tsv", "xlsx", "json", "txt"].map((format) => (
            <button type="button" key={format} onClick={() => void onExport(format)}>
              <Download size={16} />
              <span>{format.toUpperCase()}</span>
            </button>
          ))}
        </div>
        {exportResult ? (
          <div className="export-result">
            <Check size={17} />
            <span>
              {formatNumber(exportResult.rowCount)} tracks to {exportResult.path}
            </span>
          </div>
        ) : null}
      </section>
    </aside>
  );
}

function artistInitial(artist: ArtistSummary | null) {
  return artist?.name.trim().slice(0, 1).toUpperCase() || "A";
}

function formatYearSpan(firstYear: number | null | undefined, lastYear: number | null | undefined) {
  if (firstYear == null && lastYear == null) return "";
  if (firstYear != null && lastYear != null && firstYear !== lastYear) {
    return `${firstYear}-${lastYear}`;
  }
  return `${firstYear ?? lastYear}`;
}

function ArtistIndexTable({
  response,
  selectedArtistId,
  onSelect,
}: {
  response: ArtistListResponse | null;
  selectedArtistId: string | null;
  onSelect: (artistId: string) => void;
}) {
  if (!response) {
    return (
      <div className="empty-state large">
        <UsersRound size={20} />
        <span>No artists loaded.</span>
      </div>
    );
  }

  if (response.rows.length === 0) {
    return (
      <div className="empty-state large">
        <FileSearch size={20} />
        <span>No artists match.</span>
      </div>
    );
  }

  return (
    <div className="result-table artist-index-results" role="table">
      <div className="result-table-head" role="row">
        <span role="columnheader">Artist</span>
        <span role="columnheader">Albums</span>
        <span role="columnheader">Years</span>
        <span role="columnheader">Top genre</span>
        <span role="columnheader">Complete</span>
        <span role="columnheader">Avg score</span>
        <span role="columnheader">Loved</span>
      </div>
      {response.rows.map((artist) => {
        const isSelected = artist.id === selectedArtistId;
        return (
          <div
            className={`result-table-row selectable${isSelected ? " selected" : ""}`}
            role="row"
            aria-selected={isSelected}
            tabIndex={0}
            key={artist.id}
            onClick={() => onSelect(artist.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(artist.id);
              }
            }}
          >
            <span className="album-index-title" role="cell">
              <span className="cover-placeholder cover-mini artist-mini" aria-hidden="true">
                <span>{artistInitial(artist)}</span>
              </span>
              <span>
                <strong>{artist.name}</strong>
                <small>{formatNumber(artist.trackCount)} tracks</small>
              </span>
            </span>
            <span role="cell">{formatNumber(artist.albumCount)}</span>
            <span role="cell">{formatYearSpan(artist.firstYear, artist.lastYear)}</span>
            <span role="cell">{artist.topGenre ?? ""}</span>
            <span role="cell">{formatPercent(artist.averageRatingCompleteness)}</span>
            <span role="cell">{formatAverage(artist.averageAlbumScore, 2)}</span>
            <span role="cell">{formatNumber(artist.lovedTracks)}</span>
          </div>
        );
      })}
    </div>
  );
}

function ArtistAlbumTable({
  response,
  selectedAlbumId,
  onSelect,
}: {
  response: BrowseResponse | null;
  selectedAlbumId: string | null;
  onSelect: (albumId: string) => void;
}) {
  if (!response) {
    return (
      <div className="empty-state large">
        <Album size={20} />
        <span>Select an artist.</span>
      </div>
    );
  }

  if (response.rows.length === 0) {
    return (
      <div className="empty-state large">
        <FileSearch size={20} />
        <span>No albums found.</span>
      </div>
    );
  }

  return (
    <div className="result-table artist-album-results" role="table">
      <div className="result-table-head" role="row">
        <span role="columnheader">Album</span>
        <span role="columnheader">Year</span>
        <span role="columnheader">Genre</span>
        <span role="columnheader">Tracks</span>
        <span role="columnheader">Complete</span>
        <span role="columnheader">Rating</span>
        <span role="columnheader">Score</span>
      </div>
      {response.rows.map((row) => {
        const isSelected = row.albumId === selectedAlbumId;
        return (
          <div
            className={`result-table-row selectable${isSelected ? " selected" : ""}`}
            role="row"
            aria-selected={isSelected}
            tabIndex={0}
            key={row.id}
            onClick={() => onSelect(row.albumId)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(row.albumId);
              }
            }}
          >
            <span className="album-title-cell" role="cell">
              <AlbumTitleContents row={row} />
            </span>
            <span role="cell">{row.year ?? ""}</span>
            <span role="cell">{row.canonicalGenre ?? ""}</span>
            <span role="cell">{formatNumber(row.totalTracks)}</span>
            <span role="cell">{formatPercent(row.ratingCompleteness)}</span>
            <span role="cell">{row.effectiveAlbumRating ?? ""}</span>
            <span role="cell">{row.albumScore?.toFixed(3) ?? ""}</span>
          </div>
        );
      })}
    </div>
  );
}

function ArtistAlbumCoverCard({
  row,
  isSelected,
  onSelect,
}: {
  row: BrowseRow;
  isSelected: boolean;
  onSelect: (albumId: string) => void;
}) {
  const title = `${row.album ?? "Untitled"}${row.year ? ` [${row.year}]` : ""}`;
  const billboardLabel = formatBillboardRank(row);

  return (
    <button
      className={`artist-album-cover-card${isSelected ? " selected" : ""}`}
      type="button"
      aria-pressed={isSelected}
      title={title}
      onClick={() => onSelect(row.albumId)}
    >
      <AlbumCover row={row} className="artist-album-cover-art" />
      <span className="artist-album-cover-overlay">
        <strong>
          <span>{title}</span>
          {billboardLabel ? <span className="billboard-badge">{billboardLabel}</span> : null}
        </strong>
        <span>{row.albumArtistDisplay ?? ""}</span>
        <span>{row.canonicalGenre ?? ""}</span>
        <span className="artist-album-card-meta">
          <RatingStars value={row.effectiveAlbumRating} label="Album rating" showValue={false} />
          {row.lovedTracks ? (
            <span className="artist-album-love-count" aria-label={`${formatNumber(row.lovedTracks)} loved tracks`}>
              <Heart size={13} fill="currentColor" aria-hidden="true" />
              {formatNumber(row.lovedTracks)}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

function ArtistAlbumTrackList({
  response,
  isLoading,
}: {
  response: BrowseResponse | null;
  isLoading: boolean;
}) {
  if (!response) {
    return (
      <div className="artist-album-tracks-empty">
        <ListMusic size={18} />
        <span>{isLoading ? "Loading tracks." : "Select an album cover."}</span>
      </div>
    );
  }

  if (response.rows.length === 0) {
    return (
      <div className="artist-album-tracks-empty">
        <FileSearch size={18} />
        <span>No tracks found.</span>
      </div>
    );
  }

  return (
    <div className="artist-album-track-list" role="table" aria-label="Selected artist album tracks">
      {response.rows.map((row) => {
        const isLoved = row.love === "L";
        return (
          <div className="artist-album-track-row" role="row" key={row.id}>
            <span className="artist-track-position" role="cell">
              {formatTrackPosition(row)}
            </span>
            <strong role="cell" title={row.title ?? "Untitled"}>
              {row.title ?? "Untitled"}
            </strong>
            <RatingStars value={row.normalizedRating} label="Track rating" />
            <span className={`artist-track-love${isLoved ? " active" : ""}`} role="cell" aria-label={isLoved ? "Loved" : "Not loved"}>
              {isLoved ? <Heart size={15} fill="currentColor" aria-hidden="true" /> : null}
            </span>
            <time role="cell">{formatClockTime(row.trackSeconds)}</time>
          </div>
        );
      })}
    </div>
  );
}

function ArtistAlbumExpandedPanel({
  album,
  tracks,
  isLoading,
  onClose,
}: {
  album: BrowseRow;
  tracks: BrowseResponse | null;
  isLoading: boolean;
  onClose: () => void;
}) {
  const billboardLabel = formatBillboardRank(album);
  return (
    <section className="artist-album-expanded" aria-label={`${album.album ?? "Selected album"} tracks`}>
      <div className="artist-album-expanded-cover">
        <AlbumCover row={album} className="artist-album-expanded-art" decorative={false} />
      </div>
      <div className="artist-album-expanded-content">
        <div className="artist-album-expanded-header">
          <div>
            <div className="artist-album-expanded-title">
              <h3>
                <span>{album.album ?? "Untitled"}</span>
                {billboardLabel ? <span className="billboard-badge">{billboardLabel}</span> : null}
              </h3>
              <Play size={17} aria-hidden="true" />
            </div>
            <p>{[album.albumArtistDisplay, album.year, album.canonicalGenre].filter(Boolean).join(" / ")}</p>
            <span className="artist-album-expanded-meta">
              <RatingStars value={album.effectiveAlbumRating} label="Album rating" />
              <span>{formatNumber(album.totalTracks)} tracks</span>
              <span>{formatMinutes(album.totalSeconds)}</span>
            </span>
          </div>
          <button className="artist-album-close" type="button" aria-label="Close album tracks" onClick={onClose}>
            <X size={17} />
          </button>
        </div>

        <ArtistAlbumTrackList response={tracks} isLoading={isLoading} />
      </div>
    </section>
  );
}

function ArtistAlbumCoverBoard({
  response,
  selectedAlbumId,
  selectedAlbum,
  tracks,
  isLoading,
  onSelect,
  onClose,
}: {
  response: BrowseResponse | null;
  selectedAlbumId: string | null;
  selectedAlbum: BrowseRow | null;
  tracks: BrowseResponse | null;
  isLoading: boolean;
  onSelect: (albumId: string) => void;
  onClose: () => void;
}) {
  if (!response) {
    return (
      <div className="empty-state large">
        <Album size={20} />
        <span>Select an artist.</span>
      </div>
    );
  }

  if (response.rows.length === 0) {
    return (
      <div className="empty-state large">
        <FileSearch size={20} />
        <span>No album covers found.</span>
      </div>
    );
  }

  const selectedIndex = response.rows.findIndex((row) => row.albumId === selectedAlbumId);
  const insertAfterIndex =
    selectedIndex >= 0 ? Math.min(response.rows.length - 1, Math.floor(selectedIndex / 3) * 3 + 2) : -1;

  return (
    <div className="artist-album-board">
      <div className="artist-album-cover-grid">
        {response.rows.map((row, index) => (
          <Fragment key={row.id}>
            <ArtistAlbumCoverCard row={row} isSelected={row.albumId === selectedAlbumId} onSelect={onSelect} />
            {selectedAlbum && index === insertAfterIndex ? (
              <ArtistAlbumExpandedPanel
                album={selectedAlbum}
                tracks={tracks}
                isLoading={isLoading}
                onClose={onClose}
              />
            ) : null}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function ArtistDetailPanel({
  artist,
  includeCalculated,
  onIncludeCalculatedChange,
  exportResult,
  onExport,
}: {
  artist: ArtistSummary | null;
  includeCalculated: boolean;
  onIncludeCalculatedChange: (value: boolean) => void;
  exportResult: ExportResult | null;
  onExport: (format: string) => Promise<void>;
}) {
  if (!artist) {
    return (
      <aside className="detail-panel artist-detail" aria-label="Artist details">
        <div className="detail-header">
          <UsersRound size={20} />
          <div>
            <h2>Artist Detail</h2>
            <p>Select an album artist from the index</p>
          </div>
        </div>
        <div className="empty-state">
          <FileSearch size={20} />
          <span>No artist selected.</span>
        </div>
      </aside>
    );
  }

  return (
    <aside className="detail-panel artist-detail" aria-label="Artist details">
      <div className="detail-header">
        <UsersRound size={20} />
        <div>
          <h2>{artist.name}</h2>
          <p>{[formatYearSpan(artist.firstYear, artist.lastYear), artist.topGenre].filter(Boolean).join(" / ")}</p>
        </div>
      </div>

      <div className="cover-placeholder album-cover-large artist-cover-large" aria-hidden="true">
        <span>{artistInitial(artist)}</span>
      </div>

      <dl className="run-details artist-detail-stats">
        <div>
          <dt>Albums</dt>
          <dd>
            {`${formatNumber(artist.ratedAlbumCount)} / ${formatNumber(artist.albumCount)} fully rated`}
          </dd>
        </div>
        <div>
          <dt>Partial albums</dt>
          <dd>{formatNumber(artist.partialAlbumCount)}</dd>
        </div>
        <div>
          <dt>Unrated albums</dt>
          <dd>{formatNumber(artist.unratedAlbumCount)}</dd>
        </div>
        <div>
          <dt>Tracks</dt>
          <dd>{formatNumber(artist.trackCount)}</dd>
        </div>
        <div>
          <dt>Total time</dt>
          <dd>{formatHours(artist.totalSeconds)}</dd>
        </div>
        <div>
          <dt>Average complete</dt>
          <dd>{formatPercent(artist.averageRatingCompleteness)}</dd>
        </div>
        <div>
          <dt>Average rating</dt>
          <dd>{formatAverage(artist.averageAlbumRating, 1)}</dd>
        </div>
        <div>
          <dt>Average score</dt>
          <dd>{formatAverage(artist.averageAlbumScore, 2)}</dd>
        </div>
        <div>
          <dt>Loved tracks</dt>
          <dd>{formatNumber(artist.lovedTracks)}</dd>
        </div>
        <div>
          <dt>TMOE</dt>
          <dd>{formatMinutes(artist.tmoeSeconds)}</dd>
        </div>
      </dl>

      <section className="export-box">
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={includeCalculated}
            onChange={(event) => onIncludeCalculatedChange(event.target.checked)}
          />
          <span>Calculated columns</span>
        </label>
        <div className="export-grid">
          {["csv", "tsv", "xlsx", "json", "txt"].map((format) => (
            <button type="button" key={format} onClick={() => void onExport(format)}>
              <Download size={16} />
              <span>{format.toUpperCase()}</span>
            </button>
          ))}
        </div>
        {exportResult ? (
          <div className="export-result">
            <Check size={17} />
            <span>
              {formatNumber(exportResult.rowCount)} albums to {exportResult.path}
            </span>
          </div>
        ) : null}
      </section>
    </aside>
  );
}

function genreInitial(genre: GenreSummary | null) {
  return genre?.name.trim().slice(0, 1).toUpperCase() || "G";
}

function GenreIndexTable({
  response,
  selectedGenreId,
  onSelect,
}: {
  response: GenreListResponse | null;
  selectedGenreId: string | null;
  onSelect: (genreId: string) => void;
}) {
  if (!response) {
    return (
      <div className="empty-state large">
        <Tags size={20} />
        <span>No genres loaded.</span>
      </div>
    );
  }

  if (response.rows.length === 0) {
    return (
      <div className="empty-state large">
        <FileSearch size={20} />
        <span>No genres match.</span>
      </div>
    );
  }

  return (
    <div className="result-table genre-index-results" role="table">
      <div className="result-table-head" role="row">
        <span role="columnheader">Genre</span>
        <span role="columnheader">Albums</span>
        <span role="columnheader">Years</span>
        <span role="columnheader">Top artist</span>
        <span role="columnheader">Complete</span>
        <span role="columnheader">Avg score</span>
        <span role="columnheader">Loved</span>
      </div>
      {response.rows.map((genre) => {
        const isSelected = genre.id === selectedGenreId;
        return (
          <div
            className={`result-table-row selectable${isSelected ? " selected" : ""}`}
            role="row"
            aria-selected={isSelected}
            tabIndex={0}
            key={genre.id}
            onClick={() => onSelect(genre.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(genre.id);
              }
            }}
          >
            <span className="album-index-title" role="cell">
              <span className="cover-placeholder cover-mini genre-mini" aria-hidden="true">
                <span>{genreInitial(genre)}</span>
              </span>
              <span>
                <strong>{genre.name}</strong>
                <small>{formatNumber(genre.trackCount)} tracks</small>
              </span>
            </span>
            <span role="cell">{formatNumber(genre.albumCount)}</span>
            <span role="cell">{formatYearSpan(genre.firstYear, genre.lastYear)}</span>
            <span role="cell">{genre.topArtist ?? ""}</span>
            <span role="cell">{formatPercent(genre.averageRatingCompleteness)}</span>
            <span role="cell">{formatAverage(genre.averageAlbumScore, 2)}</span>
            <span role="cell">{formatNumber(genre.lovedTracks)}</span>
          </div>
        );
      })}
    </div>
  );
}

function GenreAlbumTable({ response }: { response: BrowseResponse | null }) {
  if (!response) {
    return (
      <div className="empty-state large">
        <Album size={20} />
        <span>Select a genre.</span>
      </div>
    );
  }

  if (response.rows.length === 0) {
    return (
      <div className="empty-state large">
        <FileSearch size={20} />
        <span>No albums found.</span>
      </div>
    );
  }

  return (
    <div className="result-table genre-album-results" role="table">
      <div className="result-table-head" role="row">
        <span role="columnheader">Album</span>
        <span role="columnheader">Artist</span>
        <span role="columnheader">Year</span>
        <span role="columnheader">Tracks</span>
        <span role="columnheader">Complete</span>
        <span role="columnheader">Rating</span>
        <span role="columnheader">Score</span>
      </div>
      {response.rows.map((row) => (
        <div className="result-table-row" role="row" key={row.id}>
          <span className="album-title-cell" role="cell">
            <AlbumTitleContents row={row} />
          </span>
          <span role="cell">{row.albumArtistDisplay ?? ""}</span>
          <span role="cell">{row.year ?? ""}</span>
          <span role="cell">{formatNumber(row.totalTracks)}</span>
          <span role="cell">{formatPercent(row.ratingCompleteness)}</span>
          <span role="cell">{row.effectiveAlbumRating ?? ""}</span>
          <span role="cell">{row.albumScore?.toFixed(3) ?? ""}</span>
        </div>
      ))}
    </div>
  );
}

function GenreDetailPanel({
  genre,
  includeCalculated,
  onIncludeCalculatedChange,
  exportResult,
  onExport,
}: {
  genre: GenreSummary | null;
  includeCalculated: boolean;
  onIncludeCalculatedChange: (value: boolean) => void;
  exportResult: ExportResult | null;
  onExport: (format: string) => Promise<void>;
}) {
  if (!genre) {
    return (
      <aside className="detail-panel genre-detail" aria-label="Genre details">
        <div className="detail-header">
          <Tags size={20} />
          <div>
            <h2>Genre Detail</h2>
            <p>Select a canonical genre from the index</p>
          </div>
        </div>
        <div className="empty-state">
          <FileSearch size={20} />
          <span>No genre selected.</span>
        </div>
      </aside>
    );
  }

  return (
    <aside className="detail-panel genre-detail" aria-label="Genre details">
      <div className="detail-header">
        <Tags size={20} />
        <div>
          <h2>{genre.name}</h2>
          <p>{[formatYearSpan(genre.firstYear, genre.lastYear), genre.topArtist].filter(Boolean).join(" / ")}</p>
        </div>
      </div>

      <div className="cover-placeholder album-cover-large genre-cover-large" aria-hidden="true">
        <span>{genreInitial(genre)}</span>
      </div>

      <dl className="run-details genre-detail-stats">
        <div>
          <dt>Albums</dt>
          <dd>
            {`${formatNumber(genre.ratedAlbumCount)} / ${formatNumber(genre.albumCount)} fully rated`}
          </dd>
        </div>
        <div>
          <dt>Partial albums</dt>
          <dd>{formatNumber(genre.partialAlbumCount)}</dd>
        </div>
        <div>
          <dt>Unrated albums</dt>
          <dd>{formatNumber(genre.unratedAlbumCount)}</dd>
        </div>
        <div>
          <dt>Tracks</dt>
          <dd>{formatNumber(genre.trackCount)}</dd>
        </div>
        <div>
          <dt>Total time</dt>
          <dd>{formatHours(genre.totalSeconds)}</dd>
        </div>
        <div>
          <dt>Top artist</dt>
          <dd>{genre.topArtist ?? ""}</dd>
        </div>
        <div>
          <dt>Average complete</dt>
          <dd>{formatPercent(genre.averageRatingCompleteness)}</dd>
        </div>
        <div>
          <dt>Average rating</dt>
          <dd>{formatAverage(genre.averageAlbumRating, 1)}</dd>
        </div>
        <div>
          <dt>Average score</dt>
          <dd>{formatAverage(genre.averageAlbumScore, 2)}</dd>
        </div>
        <div>
          <dt>Loved tracks</dt>
          <dd>{formatNumber(genre.lovedTracks)}</dd>
        </div>
        <div>
          <dt>TMOE</dt>
          <dd>{formatMinutes(genre.tmoeSeconds)}</dd>
        </div>
      </dl>

      <section className="export-box">
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={includeCalculated}
            onChange={(event) => onIncludeCalculatedChange(event.target.checked)}
          />
          <span>Calculated columns</span>
        </label>
        <div className="export-grid">
          {["csv", "tsv", "xlsx", "json", "txt"].map((format) => (
            <button type="button" key={format} onClick={() => void onExport(format)}>
              <Download size={16} />
              <span>{format.toUpperCase()}</span>
            </button>
          ))}
        </div>
        {exportResult ? (
          <div className="export-result">
            <Check size={17} />
            <span>
              {formatNumber(exportResult.rowCount)} albums to {exportResult.path}
            </span>
          </div>
        ) : null}
      </section>
    </aside>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  return <span className={`tool-severity tool-severity-${severity}`}>{severityLabel(severity)}</span>;
}

function MusicToolIndexTable({
  tools,
  selectedToolId,
  progress,
  onSelect,
}: {
  tools: MusicToolSummary[];
  selectedToolId: string | null;
  progress: MusicToolProgress | null;
  onSelect: (toolId: string) => void;
}) {
  if (tools.length === 0) {
    return (
      <div className="empty-state large">
        <Wrench size={20} />
        <span>No validation tools loaded.</span>
      </div>
    );
  }

  return (
    <div className="result-table tool-index-results" role="table">
      <div className="result-table-head" role="row">
        <span role="columnheader">Tool</span>
        <span role="columnheader">Severity</span>
        <span role="columnheader">Issues</span>
        <span role="columnheader">Albums</span>
        <span role="columnheader">Tracks</span>
      </div>
      {tools.map((tool) => {
        const isSelected = tool.id === selectedToolId;
        const selectedProgress = isSelected && isMusicToolProgressActive(progress) ? formatToolProgress(progress) : null;
        return (
          <div
            className={`result-table-row selectable${isSelected ? " selected" : ""}`}
            role="row"
            aria-selected={isSelected}
            tabIndex={0}
            key={tool.id}
            onClick={() => onSelect(tool.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(tool.id);
              }
            }}
          >
            <span role="cell">
              <strong>{tool.label}</strong>
              <small>{tool.description}</small>
            </span>
            <span role="cell">
              <SeverityBadge severity={tool.severity} />
            </span>
            <span className={selectedProgress ? "tool-count-progress" : undefined} role="cell">
              {selectedProgress ?? formatToolCount(tool.issueCount)}
            </span>
            <span role="cell">{formatToolCount(tool.albumCount)}</span>
            <span role="cell">{formatToolCount(tool.trackCount)}</span>
          </div>
        );
      })}
    </div>
  );
}

function MusicToolIssueTable({
  response,
  progress,
}: {
  response: MusicToolIssueResponse | null;
  progress: MusicToolProgress | null;
}) {
  if (!response) {
    if (isMusicToolProgressActive(progress)) {
      return (
        <div className="empty-state large">
          <Wrench size={20} />
          <span>
            {progress?.message ?? "Counting selected tool."} {formatToolProgress(progress)}
          </span>
        </div>
      );
    }

    return (
      <div className="empty-state large">
        <FileSearch size={20} />
        <span>Select a validation tool.</span>
      </div>
    );
  }

  if (response.rows.length === 0) {
    const emptyMessage =
      response.tool.id === "missing-billboard-albums"
        ? "No missing Billboard albums. If you expected rows, import the Billboard CSV folder once."
        : response.tool.id === "missing-billboard-singles"
          ? "No missing Billboard singles. If you expected rows, import the Billboard singles CSV folder once."
        : "No matching issues.";

    return (
      <div className="empty-state large">
        <ShieldCheck size={20} />
        <span>{emptyMessage}</span>
      </div>
    );
  }

  return (
    <div className="result-table tool-issue-results" role="table">
      <div className="result-table-head" role="row">
        <span role="columnheader">Issue</span>
        <span role="columnheader">Album</span>
        <span role="columnheader">Track</span>
        <span role="columnheader">Value</span>
        <span role="columnheader">File</span>
      </div>
      {response.rows.map((issue) => (
        <div className="result-table-row" role="row" key={issue.id}>
          <span role="cell">
            <strong>{issue.detail}</strong>
            <small>
              {severityLabel(issue.severity)} / {issue.entityType}
            </small>
          </span>
          <span role="cell">
            <strong>{issue.album ?? "Untitled"}</strong>
            <small>{[issue.albumArtistDisplay, issue.year].filter(Boolean).join(" / ")}</small>
          </span>
          <span role="cell">
            <strong>{issue.title ?? (issue.entityType === "albums" ? "Album-level" : "Untitled")}</strong>
            <small>{issue.canonicalGenre ?? ""}</small>
          </span>
          <span role="cell">{issue.value ?? ""}</span>
          <span role="cell" title={issue.filePath ?? ""}>
            {issue.filename ?? ""}
          </span>
        </div>
      ))}
    </div>
  );
}

function MusicToolExportControls({
  tool,
  isPending,
  exportResult,
  onExport,
}: {
  tool: MusicToolSummary | null;
  isPending: boolean;
  exportResult: ExportResult | null;
  onExport: (format: string) => Promise<void>;
}) {
  const isDisabled = !tool || isPending;

  return (
    <div className="tool-export-controls" aria-label="Export validation issues">
      <div className="export-strip">
        {EXPORT_FORMATS.map((format) => (
          <button
            type="button"
            key={format}
            disabled={isDisabled}
            aria-label={`Export ${tool?.label ?? "validation issues"} as ${format.toUpperCase()}`}
            onClick={() => void onExport(format)}
          >
            <Download size={15} />
            <span>{format.toUpperCase()}</span>
          </button>
        ))}
      </div>
      {exportResult ? (
        <div className="export-result tool-export-result">
          <Check size={17} />
          <span>
            {formatNumber(exportResult.rowCount)} issues to {exportResult.path}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function MusicToolDetailPanel({
  tool,
  progress,
  exportResult,
  onExport,
}: {
  tool: MusicToolSummary | null;
  progress: MusicToolProgress | null;
  exportResult: ExportResult | null;
  onExport: (format: string) => Promise<void>;
}) {
  if (!tool) {
    return (
      <aside className="detail-panel tools-detail" aria-label="Music tools details">
        <div className="detail-header">
          <Wrench size={20} />
          <div>
            <h2>Music Tools</h2>
            <p>Select a validation tool</p>
          </div>
        </div>
        <div className="empty-state">
          <FileSearch size={20} />
          <span>No tool selected.</span>
        </div>
      </aside>
    );
  }

  const progressText = formatToolProgress(progress);
  const isProgressActive = isMusicToolProgressActive(progress);

  return (
    <aside className="detail-panel tools-detail" aria-label="Music tools details">
      <div className="detail-header">
        <Wrench size={20} />
        <div>
          <h2>{tool.label}</h2>
          <p>
            {severityLabel(tool.severity)} / {tool.scope}
          </p>
        </div>
      </div>

      <dl className="run-details tool-detail-stats">
        <div>
          <dt>Issue rows</dt>
          <dd>{isProgressActive && progressText ? progressText : formatToolCount(tool.issueCount)}</dd>
        </div>
        <div>
          <dt>Affected albums</dt>
          <dd>{formatToolCount(tool.albumCount)}</dd>
        </div>
        <div>
          <dt>Affected tracks</dt>
          <dd>{formatToolCount(tool.trackCount)}</dd>
        </div>
        <div>
          <dt>Severity</dt>
          <dd>{severityLabel(tool.severity)}</dd>
        </div>
      </dl>

      {progress ? (
        <section className="progress-block tool-progress-block" aria-live="polite">
          <div className="progress-row">
            <span>{progress.message}</span>
            <strong>{progressText}</strong>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }} />
          </div>
          <div className="progress-meta">
            <span>{progress.status}</span>
            <span>{tool.label}</span>
          </div>
        </section>
      ) : null}

      <section className="calculation-list tools-signals">
        <div>
          <FileSearch size={17} />
          <span>{tool.description}</span>
        </div>
        <div>
          <ShieldCheck size={17} />
          <span>Issue rows are read-only</span>
        </div>
      </section>

      <section className="export-box">
        <div className="export-grid">
          {EXPORT_FORMATS.map((format) => (
            <button type="button" key={format} onClick={() => void onExport(format)}>
              <Download size={16} />
              <span>{format.toUpperCase()}</span>
            </button>
          ))}
        </div>
        {exportResult ? (
          <div className="export-result">
            <Check size={17} />
            <span>
              {formatNumber(exportResult.rowCount)} issues to {exportResult.path}
            </span>
          </div>
        ) : null}
      </section>
    </aside>
  );
}

function ChartResults({
  response,
  config,
  displaySort,
  onSort,
}: {
  response: BrowseResponse | null;
  config: ChartConfig;
  displaySort: BrowseSort | null;
  onSort: (field: string) => void;
}) {
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
            <AlbumCover row={row} className="cover-list" />
            <div>
              <h3>
                <span>{row.album ?? "Untitled"}</span>
                {formatBillboardRank(row) ? <span className="billboard-badge">{formatBillboardRank(row)}</span> : null}
              </h3>
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
    const coverSize = normalizeChartGridCoverSize(config.gridCoverSize);
    const gridStyle = {
      "--chart-grid-cover-size": `${coverSize}px`,
    } as CSSProperties & Record<"--chart-grid-cover-size", string>;

    return (
      <div className="chart-grid" role="list" style={gridStyle}>
        {response.rows.map((row, index) => {
          const albumTitle = row.album ?? "Untitled";
          const billboardLabel = formatBillboardRank(row);

          return (
            <article className="chart-grid-item" role="listitem" key={row.id}>
              <AlbumCover row={row} className="chart-grid-cover" />
              <div className="chart-grid-meta">
                <strong className="chart-grid-rank">#{index + 1}</strong>
                <h3 className="chart-grid-title" title={albumTitle}>
                  {albumTitle}
                </h3>
                <p className="chart-grid-artist" title={row.albumArtistDisplay ?? ""}>
                  {row.albumArtistDisplay ?? ""}
                </p>
                {billboardLabel ? <span className="billboard-badge chart-grid-billboard">{billboardLabel}</span> : null}
                <span className="chart-grid-score">{formatChartMetric(row, config.rankingMetric)}</span>
              </div>
            </article>
          );
        })}
      </div>
    );
  }

  const visibleColumns = new Set(config.visibleColumns);
  const columns: {
    key: string;
    label: string;
    sortField?: string;
    className?: string;
    value: (row: BrowseRow, index: number) => ReactNode;
  }[] = [
    { key: "rank", label: "#", value: (_row: BrowseRow, rank: number) => `${rank}` },
    {
      key: "album",
      label: "Album",
      sortField: "album",
      className: "album-title-cell",
      value: (row: BrowseRow) => <AlbumTitleContents row={row} />,
    },
    { key: "artist", label: "Artist", sortField: "artist", value: (row: BrowseRow) => row.albumArtistDisplay ?? "" },
    { key: "year", label: "Year", sortField: "year", value: (row: BrowseRow) => row.year?.toString() ?? "" },
    { key: "genre", label: "Genre", sortField: "genre", value: (row: BrowseRow) => row.canonicalGenre ?? "" },
    {
      key: "billboard",
      label: "Billboard",
      sortField: "billboardRank",
      value: (row: BrowseRow) => formatBillboardRank(row),
    },
    {
      key: "rating",
      label: "Rating",
      sortField: "albumRating",
      value: (row: BrowseRow) => row.effectiveAlbumRating?.toString() ?? "",
    },
    {
      key: "complete",
      label: "Complete",
      sortField: "ratingCompleteness",
      value: (row: BrowseRow) => formatPercent(row.ratingCompleteness),
    },
    {
      key: "score",
      label: "Score",
      sortField: "albumScore",
      value: (row: BrowseRow) => row.albumScore?.toFixed(3) ?? "",
    },
    {
      key: "loved",
      label: "Loved",
      sortField: "lovedTracks",
      value: (row: BrowseRow) => row.lovedTracks?.toString() ?? "0",
    },
    { key: "ae", label: "AE", sortField: "ae", value: (row: BrowseRow) => formatPercent(row.aeRatio, 2) },
    { key: "tmoe", label: "TMOE", sortField: "tmoe", value: (row: BrowseRow) => formatMinutes(row.tmoeSeconds) },
    {
      key: "minutes",
      label: "Minutes",
      sortField: "totalMinutes",
      value: (row: BrowseRow) => formatMinutes(row.totalSeconds),
    },
  ].filter((column) => ["rank", "album", "artist", "year", "genre"].includes(column.key) || visibleColumns.has(column.key));
  const activeSort: BrowseSort = displaySort ?? {
    field: config.rankingMetric,
    direction: config.sortDirection,
  };
  const displayRows = response.rows.map((row, index) => ({ row, rank: index + 1 }));
  if (displaySort) {
    displayRows.sort((left, right) => {
      const comparison = compareBrowseRows(left.row, right.row, displaySort.field);
      return displaySort.direction === "desc" ? -comparison : comparison;
    });
  }

  return (
    <div className="result-table chart-results" role="table">
      <div className="result-table-head" role="row">
        {columns.map((column) => (
          column.sortField ? (
            <SortableColumnHeader
              label={column.label}
              field={column.sortField}
              sort={activeSort}
              onSort={onSort}
              key={column.key}
            />
          ) : (
            <span role="columnheader" key={column.key}>
              {column.label}
            </span>
          )
        ))}
      </div>
      {displayRows.map(({ row, rank }) => (
        <div className="result-table-row" role="row" key={row.id}>
          {columns.map((column) => (
            <span className={column.className} role="cell" key={column.key}>
              {column.value(row, rank)}
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

function LibraryHealthScorePanel({ statistics }: { statistics: StatisticsResponse | null }) {
  if (!statistics) {
    return (
      <div className="empty-state">
        <ShieldCheck size={20} />
        <span>No health score yet.</span>
      </div>
    );
  }

  const health = statistics.healthScore;
  const score = Math.round(health.score);
  const ringStyle = {
    "--score": `${Math.max(0, Math.min(100, health.score))}%`,
  } as CSSProperties & Record<"--score", string>;
  const components = [
    { label: "Ratings", value: health.ratingCoverage },
    { label: "Albums complete", value: health.albumCompletion },
    { label: "Metadata", value: health.metadataCoverage },
    { label: "Covers", value: health.coverCoverage },
    { label: "Scored albums", value: health.scoreCoverage },
  ];

  return (
    <div className="health-score-panel">
      <div className="health-score-ring" style={ringStyle} aria-label={`Library health score ${score} of 100`}>
        <strong>{score}</strong>
        <span>/100</span>
      </div>
      <div className="health-score-components">
        {components.map((component) => (
          <div className="health-component" key={component.label}>
            <div>
              <span>{component.label}</span>
              <strong>{formatPercent(component.value, 0)}</strong>
            </div>
            <div className="meter-track" aria-hidden="true">
              <div className="meter-fill" style={{ width: `${component.value * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function nextMilestone(ratedTracks: number, totalTracks: number) {
  if (totalTracks <= 0) return null;
  const ratio = ratedTracks / totalTracks;
  const milestone = [0.25, 0.5, 0.75, 0.9, 1].find((target) => ratio < target);
  if (!milestone) return null;
  return {
    label: formatPercent(milestone, 0),
    remaining: Math.max(0, Math.ceil(totalTracks * milestone - ratedTracks)),
  };
}

function RatingCompletionBurndown({ statistics }: { statistics: StatisticsResponse | null }) {
  const points = (statistics?.ratingHistory ?? []).slice(-10);
  if (!statistics || points.length === 0) {
    return (
      <div className="empty-state">
        <Activity size={20} />
        <span>No rating history yet.</span>
      </div>
    );
  }

  const maxUnrated = Math.max(1, ...points.map((point) => point.unratedTracks));
  const path = points
    .map((point, index) => {
      const x = 42 + (points.length === 1 ? 0.5 : index / (points.length - 1)) * 320;
      const y = 194 - (point.unratedTracks / maxUnrated) * 152;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const latest = points[points.length - 1];
  const totalTracks = latest.trackCount || statistics.overview.trackCount;
  const milestone = nextMilestone(latest.ratedTracks, totalTracks);

  return (
    <div className="burndown-panel">
      <svg className="burndown-chart" viewBox="0 0 400 230" role="img" aria-label="Unrated tracks over rating history">
        <line x1="42" y1="194" x2="372" y2="194" />
        <line x1="42" y1="34" x2="42" y2="194" />
        <text x="42" y="218">
          Older
        </text>
        <text x="326" y="218">
          Latest
        </text>
        <text x="8" y="28">
          Unrated
        </text>
        <path d={path} />
        {points.map((point, index) => {
          const x = 42 + (points.length === 1 ? 0.5 : index / (points.length - 1)) * 320;
          const y = 194 - (point.unratedTracks / maxUnrated) * 152;
          return (
            <circle key={point.importRunId} cx={x} cy={y} r={5}>
              <title>
                {formatDate(point.createdAt)}: {formatNumber(point.unratedTracks)} unrated tracks
              </title>
            </circle>
          );
        })}
      </svg>
      <div className="burndown-summary">
        <div>
          <span>Rated now</span>
          <strong>{formatPercent(ratioOf(latest.ratedTracks, totalTracks))}</strong>
        </div>
        <div>
          <span>Remaining</span>
          <strong>{formatNumber(latest.unratedTracks)}</strong>
        </div>
        <div>
          <span>Next milestone</span>
          <strong>{milestone ? `${formatNumber(milestone.remaining)} to ${milestone.label}` : "Complete"}</strong>
        </div>
      </div>
    </div>
  );
}

function DecadeProgressTimeline({ rows }: { rows: DecadeProgressStats[] }) {
  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <Clock3 size={20} />
        <span>No decade statistics yet.</span>
      </div>
    );
  }

  return (
    <div className="decade-timeline">
      {rows.map((row) => (
        <div className="decade-row" key={row.decade}>
          <div>
            <strong>{row.decade}s</strong>
            <span>{formatNumber(row.albumCount)} albums / {formatHours(row.totalSeconds)}</span>
          </div>
          <div className="stacked-track" aria-label={`${row.decade}s rating progress`}>
            <span className="segment rated" style={{ width: `${percentOf(row.ratedAlbumCount, row.albumCount)}%` }} />
            <span className="segment partial" style={{ width: `${percentOf(row.partialAlbumCount, row.albumCount)}%` }} />
            <span className="segment unrated" style={{ width: `${percentOf(row.unratedAlbumCount, row.albumCount)}%` }} />
          </div>
          <small>
            {formatNumber(row.ratedAlbumCount)} rated / {formatNumber(row.partialAlbumCount)} partial /{" "}
            {formatNumber(row.unratedAlbumCount)} open
          </small>
        </div>
      ))}
    </div>
  );
}

function genreCompletionRatio(row: GenreProgressStats) {
  if (row.albumCount <= 0) return 0;
  return Math.max(0, Math.min(1, (row.ratedAlbumCount + row.partialAlbumCount * 0.5) / row.albumCount));
}

function GenrePortfolioMatrix({ rows }: { rows: GenreProgressStats[] }) {
  const points = rows.slice(0, 24);
  if (points.length === 0) {
    return (
      <div className="empty-state">
        <Tags size={20} />
        <span>No genre portfolio yet.</span>
      </div>
    );
  }

  const scoreExtent = numericExtent(points, (row) => row.averageAlbumScore);
  const albumExtent = numericExtent(points, (row) => row.albumCount);

  return (
    <svg className="genre-portfolio-chart" viewBox="0 0 430 250" role="img" aria-label="Genre size, score, and completion matrix">
      <line x1="44" y1="204" x2="398" y2="204" />
      <line x1="44" y1="34" x2="44" y2="204" />
      <text x="302" y="232">
        Average score
      </text>
      <text x="8" y="24">
        Completion
      </text>
      <line className="matrix-guide" x1="44" y1="119" x2="398" y2="119" />
      <line className="matrix-guide" x1="221" y1="34" x2="221" y2="204" />
      {points.map((row, index) => {
        const completion = genreCompletionRatio(row);
        const x = 44 + normalizedValue(row.averageAlbumScore, scoreExtent.min, scoreExtent.max) * 354;
        const y = 204 - completion * 170;
        const radius = 7 + Math.sqrt(normalizedValue(row.albumCount, albumExtent.min, albumExtent.max)) * 17;
        const fill = `hsl(${185 - completion * 40} 62% ${72 - completion * 18}%)`;
        return (
          <g className="genre-portfolio-point" key={row.genre}>
            <circle cx={x} cy={y} r={radius} style={{ fill }}>
              <title>
                {row.genre}: {formatNumber(row.albumCount)} albums / {formatPercent(completion)} complete /{" "}
                {formatAverage(row.averageAlbumScore, 1)} score
              </title>
            </circle>
            {index < 8 ? (
              <text x={x} y={y - radius - 5}>
                {row.genre}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

function ImportDeltaTimeline({ runs }: { runs: ImportRun[] }) {
  const rows = [...runs].sort((left, right) => left.id - right.id).slice(-8);
  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <FolderInput size={20} />
        <span>No import deltas yet.</span>
      </div>
    );
  }

  const maxDelta = Math.max(
    1,
    ...rows.map((run) => run.addedTracks + run.changedTracks + run.removedTracks),
  );

  return (
    <div className="import-delta-timeline">
      {rows.map((run) => {
        const totalDelta = run.addedTracks + run.changedTracks + run.removedTracks;
        return (
          <div className="import-delta-row" key={run.id}>
            <div>
              <strong>{formatDate(run.completedAt)}</strong>
              <span>{formatNumber(run.ratingEventsCount)} rating events</span>
            </div>
            <div className="delta-track" aria-label={`Import ${run.id} track deltas`}>
              <span className="delta added" style={{ width: `${percentOf(run.addedTracks, maxDelta)}%` }} />
              <span className="delta changed" style={{ width: `${percentOf(run.changedTracks, maxDelta)}%` }} />
              <span className="delta removed" style={{ width: `${percentOf(run.removedTracks, maxDelta)}%` }} />
            </div>
            <small>
              {formatSignedNumber(run.addedTracks)} added / {formatNumber(run.changedTracks)} changed /{" "}
              {formatNumber(run.removedTracks)} removed / {formatNumber(totalDelta)} touched
            </small>
          </div>
        );
      })}
    </div>
  );
}

function MetadataCoveragePanel({ metrics }: { metrics: MetadataCoverageMetric[] }) {
  if (metrics.length === 0) {
    return (
      <div className="empty-state">
        <ShieldCheck size={20} />
        <span>No metadata coverage yet.</span>
      </div>
    );
  }

  return (
    <div className="metadata-coverage-list">
      {metrics.map((metric) => {
        const coverage = ratioOf(metric.coveredCount, metric.totalCount);
        return (
          <div className="metadata-coverage-row" key={metric.id}>
            <div>
              <strong>{metric.label}</strong>
              <span>{metric.scope}</span>
            </div>
            <div className="meter-track" aria-hidden="true">
              <div className="meter-fill" style={{ width: `${coverage * 100}%` }} />
            </div>
            <small>
              {formatPercent(coverage, 0)} / {formatNumber(metric.coveredCount)} of {formatNumber(metric.totalCount)}
            </small>
          </div>
        );
      })}
    </div>
  );
}

function LibraryShapeByTime({ statistics }: { statistics: StatisticsResponse | null }) {
  const rows = statistics?.decadeProgress ?? [];
  if (!statistics || rows.length === 0) {
    return (
      <div className="empty-state">
        <Clock3 size={20} />
        <span>No library shape data yet.</span>
      </div>
    );
  }

  const maxAlbums = Math.max(1, ...rows.map((row) => row.albumCount));
  const maxTracks = Math.max(1, ...rows.map((row) => row.trackCount));
  const maxSeconds = Math.max(1, ...rows.map((row) => row.totalSeconds));
  const shape = statistics.libraryShape;

  return (
    <div className="shape-by-time-panel">
      <div className="shape-summary">
        <div>
          <span>Median year</span>
          <strong>{shape.medianYear ?? "Unknown"}</strong>
        </div>
        <div>
          <span>Most represented decade</span>
          <strong>
            {shape.mostRepresentedDecade == null
              ? "Unknown"
              : `${shape.mostRepresentedDecade}s / ${formatNumber(shape.mostRepresentedDecadeAlbums)}`}
          </strong>
        </div>
        <div>
          <span>Peak release year</span>
          <strong>
            {shape.peakYear == null ? "Unknown" : `${shape.peakYear} / ${formatNumber(shape.peakYearAlbums)}`}
          </strong>
        </div>
      </div>
      <div className="shape-time-bars">
        {rows.map((row) => (
          <div className="shape-time-row" key={row.decade}>
            <strong>{row.decade}s</strong>
            <div>
              <span>Albums</span>
              <div className="meter-track" aria-hidden="true">
                <div className="meter-fill" style={{ width: `${percentOf(row.albumCount, maxAlbums)}%` }} />
              </div>
            </div>
            <div>
              <span>Tracks</span>
              <div className="meter-track" aria-hidden="true">
                <div className="meter-fill secondary" style={{ width: `${percentOf(row.trackCount, maxTracks)}%` }} />
              </div>
            </div>
            <div>
              <span>Hours</span>
              <div className="meter-track" aria-hidden="true">
                <div className="meter-fill warm" style={{ width: `${percentOf(row.totalSeconds, maxSeconds)}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LovedDensityPanel({ rows }: { rows: LovedDensityStat[] }) {
  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <Heart size={20} />
        <span>No loved-density data yet.</span>
      </div>
    );
  }

  const maxDensity = Math.max(1, ...rows.map((row) => row.lovedPer100Tracks));
  return (
    <div className="loved-density-list">
      {rows.slice(0, 12).map((row) => (
        <div className="loved-density-row" key={`${row.scope}:${row.label}`}>
          <div>
            <strong>{row.label}</strong>
            <span>{row.scope}</span>
          </div>
          <div className="meter-track" aria-hidden="true">
            <div className="meter-fill" style={{ width: `${percentOf(row.lovedPer100Tracks, maxDensity)}%` }} />
          </div>
          <small>
            {row.lovedPer100Tracks.toFixed(2)} / 100 / {formatNumber(row.lovedTracks)} loved
          </small>
        </div>
      ))}
    </div>
  );
}

function concentrationLabel(scope: string, point: ConcentrationPoint) {
  return `Top ${point.topN} ${scope}`;
}

function ConcentrationBars({ scope, points }: { scope: string; points: ConcentrationPoint[] }) {
  return (
    <div className="concentration-bars">
      {points.map((point) => (
        <div className="concentration-row" key={`${scope}:${point.topN}`}>
          <div>
            <strong>{concentrationLabel(scope, point)}</strong>
            <span>{formatNumber(point.albumCount)} albums</span>
          </div>
          <div className="meter-track" aria-hidden="true">
            <div className="meter-fill" style={{ width: `${point.share * 100}%` }} />
          </div>
          <small>{formatPercent(point.share, 1)}</small>
        </div>
      ))}
    </div>
  );
}

function CatalogConcentrationPanel({ statistics }: { statistics: StatisticsResponse | null }) {
  if (!statistics) {
    return (
      <div className="empty-state">
        <UsersRound size={20} />
        <span>No concentration data yet.</span>
      </div>
    );
  }

  const concentration = statistics.catalogConcentration;
  return (
    <div className="catalog-concentration-panel">
      <div className="concentration-summary">
        <div>
          <span>Top artist</span>
          <strong>{concentration.topArtist ?? "Unknown"}</strong>
          <small>{formatNumber(concentration.topArtistAlbumCount)} albums</small>
        </div>
        <div>
          <span>Top genre</span>
          <strong>{concentration.topGenre ?? "Unknown"}</strong>
          <small>{formatNumber(concentration.topGenreAlbumCount)} albums</small>
        </div>
      </div>
      <ConcentrationBars scope="artists" points={concentration.artistPoints} />
      <ConcentrationBars scope="genres" points={concentration.genrePoints} />
    </div>
  );
}

function durationAlbumLabel(album: DurationAlbumStat) {
  return [album.albumArtistDisplay, album.album, album.year].filter(Boolean).join(" / ");
}

function DurationAlbumList({ title, albums }: { title: string; albums: DurationAlbumStat[] }) {
  return (
    <div className="duration-album-list">
      <span>{title}</span>
      {albums.slice(0, 4).map((album) => (
        <div className="duration-album-row" key={album.albumId}>
          <strong>{durationAlbumLabel(album) || "Untitled"}</strong>
          <small>
            {formatHours(album.totalSeconds)} / {formatNumber(album.totalTracks)} tracks /{" "}
            {formatPercent(album.ratingCompleteness, 0)} complete
          </small>
        </div>
      ))}
    </div>
  );
}

function DurationAnalyticsPanel({ statistics }: { statistics: StatisticsResponse | null }) {
  if (!statistics) {
    return (
      <div className="empty-state">
        <Clock3 size={20} />
        <span>No duration analytics yet.</span>
      </div>
    );
  }

  const analytics = statistics.durationAnalytics;
  return (
    <div className="duration-analytics-panel">
      <div className="duration-summary">
        <div>
          <span>Average album</span>
          <strong>{formatHours(analytics.averageAlbumSeconds)}</strong>
        </div>
        <div>
          <span>Average track</span>
          <strong>{formatMinutes(analytics.averageTrackSeconds)}</strong>
        </div>
      </div>
      <DistributionBars buckets={analytics.trackCountBuckets} />
      <DurationAlbumList title="Longest albums" albums={analytics.longestAlbums} />
      <DurationAlbumList title="Shortest albums" albums={analytics.shortestAlbums} />
    </div>
  );
}

function OutlierStatsPanel({ rows }: { rows: OutlierStat[] }) {
  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <Sparkles size={20} />
        <span>No outlier stats yet.</span>
      </div>
    );
  }

  return (
    <div className="outlier-stat-grid">
      {rows.map((row) => (
        <article className="outlier-stat" key={row.id}>
          <span>{row.label}</span>
          <strong>{row.value}</strong>
          <small>{row.detail}</small>
        </article>
      ))}
    </div>
  );
}

function clampRatio(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function normalizedValue(value: number | null | undefined, min: number, max: number) {
  if (value == null || !Number.isFinite(value) || max <= min) return 0.5;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

function numericExtent<T>(rows: T[], value: (row: T) => number | null | undefined) {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  rows.forEach((row) => {
    const nextValue = value(row);
    if (nextValue == null || !Number.isFinite(nextValue)) return;
    min = Math.min(min, nextValue);
    max = Math.max(max, nextValue);
  });
  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : { min: 0, max: 1 };
}

function heatmapColor(value: number | null | undefined) {
  const ratio = clampRatio(value);
  const lightness = 94 - ratio * 43;
  return `hsl(174 62% ${lightness}%)`;
}

function discoveryKeyOpen(event: KeyboardEvent, onOpen: () => void) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onOpen();
  }
}

function DiscoveryMissionGrid({
  missions,
  emptyLabel,
  onOpen,
}: {
  missions: DiscoveryMission[];
  emptyLabel: string;
  onOpen: (mission: DiscoveryMission) => void;
}) {
  if (missions.length === 0) {
    return (
      <div className="empty-state">
        <Compass size={20} />
        <span>{emptyLabel}</span>
      </div>
    );
  }

  return (
    <div className="discovery-mission-grid">
      {missions.map((mission) => (
        <button className="discovery-mission" type="button" key={mission.id} onClick={() => onOpen(mission)}>
          <span>{mission.actionLabel}</span>
          <strong>{mission.title}</strong>
          <small>{mission.description}</small>
          <dl>
            <div>
              <dt>Albums</dt>
              <dd>{formatNumber(mission.albumCount)}</dd>
            </div>
            <div>
              <dt>Complete</dt>
              <dd>{formatPercent(mission.averageRatingCompleteness)}</dd>
            </div>
            <div>
              <dt>Score</dt>
              <dd>{formatAverage(mission.averageAlbumScore, 1)}</dd>
            </div>
          </dl>
        </button>
      ))}
    </div>
  );
}

function CompletionHeatmap({
  cells,
  emptyLabel = "No heatmap cells yet.",
  onOpen,
}: {
  cells: DiscoveryHeatmapCell[];
  emptyLabel?: string;
  onOpen: (cell: DiscoveryHeatmapCell) => void;
}) {
  const years = useMemo(
    () => Array.from(new Set(cells.map((cell) => cell.year))).sort((left, right) => left - right),
    [cells],
  );
  const genres = useMemo(() => {
    const seen = new Map<string, string>();
    cells.forEach((cell) => {
      if (!seen.has(cell.genreId)) {
        seen.set(cell.genreId, cell.genre);
      }
    });
    return Array.from(seen, ([genreId, genre]) => ({ genreId, genre })).sort((left, right) =>
      left.genre.localeCompare(right.genre),
    );
  }, [cells]);
  const cellLookup = useMemo(() => {
    const nextLookup = new Map<string, DiscoveryHeatmapCell>();
    cells.forEach((cell) => nextLookup.set(`${cell.genreId}:${cell.year}`, cell));
    return nextLookup;
  }, [cells]);
  const gridStyle = {
    "--heatmap-columns": years.length,
  } as CSSProperties & Record<"--heatmap-columns", number>;

  if (cells.length === 0) {
    return (
      <div className="empty-state">
        <Gauge size={20} />
        <span>{emptyLabel}</span>
      </div>
    );
  }

  return (
    <div className="completion-heatmap" style={gridStyle}>
      <div className="heatmap-corner" />
      <div className="heatmap-years">
        {years.map((year) => (
          <span key={year}>{year}</span>
        ))}
      </div>
      {genres.map((genre) => (
        <div className="heatmap-row" key={genre.genreId}>
          <span className="heatmap-genre">{genre.genre}</span>
          <div className="heatmap-cells">
            {years.map((year) => {
              const cell = cellLookup.get(`${genre.genreId}:${year}`) ?? null;
              if (!cell) {
                return <span className="heatmap-cell empty" key={year} />;
              }
              const completion = cell.averageRatingCompleteness ?? 0;
              return (
                <button
                  className="heatmap-cell"
                  type="button"
                  key={year}
                  style={{ backgroundColor: heatmapColor(completion) }}
                  title={`${cell.genre} / ${cell.year}: ${formatPercent(completion)} complete`}
                  onClick={() => onOpen(cell)}
                >
                  <strong>{formatPercent(completion, 0)}</strong>
                  <span>{formatNumber(cell.albumCount)}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function LoveRatingScatter({
  points,
  emptyLabel = "No loved/rating outliers yet.",
  onOpen,
}: {
  points: DiscoveryAlbumPoint[];
  emptyLabel?: string;
  onOpen: (point: DiscoveryAlbumPoint) => void;
}) {
  const scoreExtent = numericExtent(points, (point) => point.albumScore ?? point.effectiveAlbumRating);
  const lovedExtent = numericExtent(points, (point) => point.lovedTracks);
  const maxLoved = Math.max(1, lovedExtent.max);

  if (points.length === 0) {
    return (
      <div className="empty-state">
        <Heart size={20} />
        <span>{emptyLabel}</span>
      </div>
    );
  }

  return (
    <div className="scatter-shell">
      <svg className="discovery-scatter" viewBox="0 0 340 220" role="img" aria-label="Loved tracks by album score">
        <line x1="38" y1="178" x2="316" y2="178" />
        <line x1="38" y1="178" x2="38" y2="22" />
        <text x="318" y="198">
          Score
        </text>
        <text x="8" y="20">
          Love
        </text>
        <line className="scatter-guide" x1="38" y1="100" x2="316" y2="100" />
        <line className="scatter-guide" x1="177" y1="22" x2="177" y2="178" />
        {points.map((point) => {
          const score = point.albumScore ?? point.effectiveAlbumRating ?? scoreExtent.min;
          const x = 38 + normalizedValue(score, scoreExtent.min, scoreExtent.max) * 278;
          const y = 178 - normalizedValue(point.lovedTracks, 0, maxLoved) * 156;
          const radius = 5 + clampRatio(point.ratingCompleteness) * 5;
          const label = `${point.album ?? "Untitled"} / ${point.albumArtistDisplay ?? ""}`;
          return (
            <circle
              role="button"
              tabIndex={0}
              className="scatter-point"
              key={point.albumId}
              cx={x}
              cy={y}
              r={radius}
              aria-label={`Open ${label}`}
              onClick={() => onOpen(point)}
              onKeyDown={(event) => discoveryKeyOpen(event, () => onOpen(point))}
            >
              <title>
                {label}: {formatNumber(point.lovedTracks)} loved / {formatAverage(point.albumScore, 1)} score
              </title>
            </circle>
          );
        })}
      </svg>
    </div>
  );
}

function GenreUniverse({
  points,
  emptyLabel = "No genre universe yet.",
  onOpen,
}: {
  points: DiscoveryGenrePoint[];
  emptyLabel?: string;
  onOpen: (point: DiscoveryGenrePoint) => void;
}) {
  const albumExtent = numericExtent(points, (point) => point.albumCount);
  const scoreExtent = numericExtent(points, (point) => point.averageAlbumScore);

  if (points.length === 0) {
    return (
      <div className="empty-state">
        <Tags size={20} />
        <span>{emptyLabel}</span>
      </div>
    );
  }

  return (
    <div className="bubble-plot genre-universe" aria-label="Genre universe">
      <span className="plot-axis plot-axis-x">Average score</span>
      <span className="plot-axis plot-axis-y">Completeness</span>
      {points.map((point) => {
        const size = 58 + Math.sqrt(normalizedValue(point.albumCount, albumExtent.min, albumExtent.max)) * 74;
        const x = 10 + normalizedValue(point.averageAlbumScore, scoreExtent.min, scoreExtent.max) * 80;
        const y = 10 + clampRatio(point.averageRatingCompleteness) * 78;
        const style = {
          left: `${x}%`,
          bottom: `${y}%`,
          width: `${size}px`,
          height: `${size}px`,
          "--bubble-strength": clampRatio(point.averageRatingCompleteness),
        } as CSSProperties & Record<"--bubble-strength", number>;
        return (
          <button className="bubble-point" type="button" key={point.genreId} style={style} onClick={() => onOpen(point)}>
            <strong>{point.genre}</strong>
            <span>{formatNumber(point.albumCount)}</span>
          </button>
        );
      })}
    </div>
  );
}

function ArtistConstellation({
  points,
  emptyLabel = "No artist constellation yet.",
  onOpen,
}: {
  points: DiscoveryArtistPoint[];
  emptyLabel?: string;
  onOpen: (point: DiscoveryArtistPoint) => void;
}) {
  const albumExtent = numericExtent(points, (point) => point.albumCount);
  const scoreExtent = numericExtent(points, (point) => point.averageAlbumScore);
  const lovedExtent = numericExtent(points, (point) => point.lovedTracks);

  if (points.length === 0) {
    return (
      <div className="empty-state">
        <UsersRound size={20} />
        <span>{emptyLabel}</span>
      </div>
    );
  }

  return (
    <div className="bubble-plot artist-constellation" aria-label="Artist constellation">
      <span className="plot-axis plot-axis-x">Catalog depth</span>
      <span className="plot-axis plot-axis-y">Average score</span>
      {points.map((point) => {
        const size = 58 + Math.sqrt(normalizedValue(point.lovedTracks, lovedExtent.min, lovedExtent.max)) * 68;
        const x = 10 + normalizedValue(point.albumCount, albumExtent.min, albumExtent.max) * 80;
        const y = 10 + normalizedValue(point.averageAlbumScore, scoreExtent.min, scoreExtent.max) * 78;
        const style = {
          left: `${x}%`,
          bottom: `${y}%`,
          width: `${size}px`,
          height: `${size}px`,
          "--bubble-strength": clampRatio(point.averageRatingCompleteness),
        } as CSSProperties & Record<"--bubble-strength", number>;
        return (
          <button className="bubble-point artist" type="button" key={point.artistId} style={style} onClick={() => onOpen(point)}>
            <strong>{point.artist}</strong>
            <span>{formatNumber(point.albumCount)} albums</span>
          </button>
        );
      })}
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
  const [coverSourcePath, setCoverSourcePath] = useState("AlbumCovers");
  const [coverExtractEmbeddedFallback, setCoverExtractEmbeddedFallback] = useState(true);
  const [coverReplaceExisting, setCoverReplaceExisting] = useState(false);
  const [status, setStatus] = useState<LibraryStatus | null>(null);
  const [runs, setRuns] = useState<ImportRun[]>([]);
  const [progress, setProgress] = useState(defaultProgress);
  const [coverProgress, setCoverProgress] = useState(defaultCoverProgress);
  const [isImporting, setIsImporting] = useState(false);
  const [isImportingCovers, setIsImportingCovers] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [coverImportError, setCoverImportError] = useState<string | null>(null);
  const [coverImportSummary, setCoverImportSummary] = useState<CoverImportSummary | null>(null);
  const [billboardSourcePath, setBillboardSourcePath] = useState("CSV");
  const [isImportingBillboard, setIsImportingBillboard] = useState(false);
  const [billboardImportError, setBillboardImportError] = useState<string | null>(null);
  const [billboardImportSummary, setBillboardImportSummary] = useState<BillboardImportSummary | null>(null);
  const [billboardSinglesSourcePath, setBillboardSinglesSourcePath] = useState("CSV_SINGLES");
  const [isImportingBillboardSingles, setIsImportingBillboardSingles] = useState(false);
  const [billboardSinglesImportError, setBillboardSinglesImportError] = useState<string | null>(null);
  const [billboardSinglesImportSummary, setBillboardSinglesImportSummary] =
    useState<BillboardSinglesImportSummary | null>(null);
  const [request, setRequest] = useState<BrowseRequest>(() => createRequest("albums"));
  const [response, setResponse] = useState<BrowseResponse | null>(null);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [savedCharts, setSavedCharts] = useState<SavedChart[]>([]);
  const [saveName, setSaveName] = useState("");
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [includeCalculated, setIncludeCalculated] = useState(false);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [albumRequest, setAlbumRequest] = useState<BrowseRequest>(() => {
    const request = createRequest("albums");
    request.limit = 25;
    return request;
  });
  const [albumResponse, setAlbumResponse] = useState<BrowseResponse | null>(null);
  const [albumError, setAlbumError] = useState<string | null>(null);
  const [isAlbumLoading, setIsAlbumLoading] = useState(false);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [albumTracksResponse, setAlbumTracksResponse] = useState<BrowseResponse | null>(null);
  const [albumTracksError, setAlbumTracksError] = useState<string | null>(null);
  const [isAlbumTracksLoading, setIsAlbumTracksLoading] = useState(false);
  const [albumIncludeCalculated, setAlbumIncludeCalculated] = useState(false);
  const [albumExportResult, setAlbumExportResult] = useState<ExportResult | null>(null);
  const [artistRequest, setArtistRequest] = useState<ArtistListRequest>(() => createArtistListRequest());
  const [artistResponse, setArtistResponse] = useState<ArtistListResponse | null>(null);
  const [artistError, setArtistError] = useState<string | null>(null);
  const [isArtistLoading, setIsArtistLoading] = useState(false);
  const [selectedArtistId, setSelectedArtistId] = useState<string | null>(null);
  const [artistAlbumsResponse, setArtistAlbumsResponse] = useState<BrowseResponse | null>(null);
  const [artistAlbumsError, setArtistAlbumsError] = useState<string | null>(null);
  const [isArtistAlbumsLoading, setIsArtistAlbumsLoading] = useState(false);
  const [selectedArtistAlbumId, setSelectedArtistAlbumId] = useState<string | null>(null);
  const [artistAlbumTracksResponse, setArtistAlbumTracksResponse] = useState<BrowseResponse | null>(null);
  const [artistAlbumTracksError, setArtistAlbumTracksError] = useState<string | null>(null);
  const [isArtistAlbumTracksLoading, setIsArtistAlbumTracksLoading] = useState(false);
  const [artistIncludeCalculated, setArtistIncludeCalculated] = useState(false);
  const [artistExportResult, setArtistExportResult] = useState<ExportResult | null>(null);
  const [genreRequest, setGenreRequest] = useState<GenreListRequest>(() => createGenreListRequest());
  const [genreResponse, setGenreResponse] = useState<GenreListResponse | null>(null);
  const [genreError, setGenreError] = useState<string | null>(null);
  const [isGenreLoading, setIsGenreLoading] = useState(false);
  const [selectedGenreId, setSelectedGenreId] = useState<string | null>(null);
  const [genreAlbumsResponse, setGenreAlbumsResponse] = useState<BrowseResponse | null>(null);
  const [genreAlbumsError, setGenreAlbumsError] = useState<string | null>(null);
  const [isGenreAlbumsLoading, setIsGenreAlbumsLoading] = useState(false);
  const [genreIncludeCalculated, setGenreIncludeCalculated] = useState(false);
  const [genreExportResult, setGenreExportResult] = useState<ExportResult | null>(null);
  const [genreSuggestionNames, setGenreSuggestionNames] = useState<string[]>([]);
  const [musicTools, setMusicTools] = useState<MusicToolSummary[]>(() => musicToolCatalog);
  const [toolsError, setToolsError] = useState<string | null>(null);
  const [isToolsLoading, setIsToolsLoading] = useState(false);
  const [selectedToolId, setSelectedToolId] = useState<string | null>(musicToolCatalog[0]?.id ?? null);
  const [toolIssueRequest, setToolIssueRequest] = useState<MusicToolIssueRequest>(() =>
    createMusicToolIssueRequest(),
  );
  const [toolIssueResponse, setToolIssueResponse] = useState<MusicToolIssueResponse | null>(null);
  const [toolIssueError, setToolIssueError] = useState<string | null>(null);
  const [isToolIssuesLoading, setIsToolIssuesLoading] = useState(false);
  const [toolProgress, setToolProgress] = useState<MusicToolProgress | null>(null);
  const [toolExportResult, setToolExportResult] = useState<ExportResult | null>(null);
  const [chartConfig, setChartConfig] = useState<ChartConfig>(() => createChartConfig());
  const [chartTableSort, setChartTableSort] = useState<BrowseSort | null>(null);
  const [chartResponse, setChartResponse] = useState<BrowseResponse | null>(null);
  const [chartName, setChartName] = useState("");
  const [chartError, setChartError] = useState<string | null>(null);
  const [isChartLoading, setIsChartLoading] = useState(false);
  const [chartExportResult, setChartExportResult] = useState<ExportResult | null>(null);
  const [statistics, setStatistics] = useState<StatisticsResponse | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [isStatsLoading, setIsStatsLoading] = useState(false);
  const [discovery, setDiscovery] = useState<DiscoveryResponse | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [isDiscoveryLoading, setIsDiscoveryLoading] = useState(true);
  const [discoveryAlbumRequest, setDiscoveryAlbumRequest] = useState<BrowseRequest>(() =>
    createDiscoveryAlbumRequest({}, { field: "albumScore", direction: "desc" }, 30),
  );
  const [discoveryAlbumResponse, setDiscoveryAlbumResponse] = useState<BrowseResponse | null>(null);
  const [discoveryAlbumError, setDiscoveryAlbumError] = useState<string | null>(null);
  const [isDiscoveryAlbumsLoading, setIsDiscoveryAlbumsLoading] = useState(false);
  const [discoverySelection, setDiscoverySelection] = useState<DiscoverySelection | null>(null);
  const [settings, setSettings] = useState<AppSettings>(() => createDefaultSettings());
  const [leftSidebarMode, setLeftSidebarMode] = useState<LeftSidebarMode>(() => createDefaultLeftSidebarMode());
  const [rightSidebarMode, setRightSidebarMode] = useState<RightSidebarMode>(() => createDefaultRightSidebarMode());
  const [databaseBackups, setDatabaseBackups] = useState<DatabaseBackup[]>([]);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const [restoreSummary, setRestoreSummary] = useState<DatabaseRestoreSummary | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const hasAppliedLayoutDefaults = useRef(false);
  const canImport = isTauriRuntime();

  const refreshGenreSuggestions = useCallback(async () => {
    const nextGenreNames = await loadGenreSuggestionNames();
    setGenreSuggestionNames(nextGenreNames);
  }, []);

  const loadData = useCallback(async () => {
    const [
      nextStatus,
      nextRuns,
      nextBackups,
      nextSavedSearches,
      nextSavedCharts,
      nextStatistics,
      nextSettings,
    ] = await Promise.all([
      getLibraryStatus(),
      listImportRuns(8),
      listDatabaseBackups(),
      listSavedSearches(),
      listSavedCharts(),
      getStatistics(),
      getSettings(),
    ]);
    setStatus(nextStatus);
    setRuns(nextRuns);
    setDatabaseBackups(nextBackups);
    setBackupError(null);
    setSavedSearches(nextSavedSearches);
    setSavedCharts(
      nextSavedCharts.map((chart) => ({
        ...chart,
        config: normalizeChartConfigForClient(chart.config),
      })),
    );
    setStatistics(nextStatistics);
    setSettings(nextSettings);
    if (!hasAppliedLayoutDefaults.current) {
      setLeftSidebarMode(nextSettings.leftSidebarDefault);
      setRightSidebarMode(nextSettings.rightSidebarDefault);
      hasAppliedLayoutDefaults.current = true;
    }
    void refreshGenreSuggestions().catch(() => {
      // Keep any suggestions already loaded from focus retry or the Genres page.
    });
  }, [refreshGenreSuggestions]);

  const loadDiscoveryData = useCallback(async () => {
    setIsDiscoveryLoading(true);
    const nextDiscovery = await getDiscovery();
    setDiscovery(nextDiscovery);
    setDiscoveryError(null);
    setIsDiscoveryLoading(false);
  }, []);

  useEffect(() => {
    void loadData().catch((loadError) => {
      setImportError(loadError instanceof Error ? loadError.message : String(loadError));
    });
    void loadDiscoveryData().catch((loadError) => {
      setDiscoveryError(loadError instanceof Error ? loadError.message : String(loadError));
      setIsDiscoveryLoading(false);
    });
  }, [loadData, loadDiscoveryData]);

  useEffect(() => {
    let cancelled = false;

    void loadGenreSuggestionNames()
      .then((nextGenreNames) => {
        if (!cancelled) {
          setGenreSuggestionNames(nextGenreNames);
        }
      })
      .catch(() => {
        // The genre fields can retry on focus, and the Genres page can still seed suggestions.
      });

    return () => {
      cancelled = true;
    };
  }, []);

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

  useEffect(() => {
    if (activeSection !== "Tools" || !selectedToolId) {
      return;
    }

    let unlisten: (() => void) | null = null;
    void listenToMusicToolProgress((nextProgress) => {
      setToolProgress((previous) =>
        nextProgress.toolId === selectedToolId && nextProgress.requestId === toolIssueRequest.requestId
          ? nextProgress
          : previous,
      );
    }).then((nextUnlisten) => {
      unlisten = nextUnlisten;
    });

    return () => {
      unlisten?.();
    };
  }, [activeSection, selectedToolId, toolIssueRequest.requestId]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.darkMode ? "dark" : "light";
  }, [settings.darkMode]);

  const lastRun = runs[0] ?? status?.lastImport ?? null;
  const currentFilters = request.filters;
  const albumFilters = albumRequest.filters;
  const genreSuggestionOptions = useMemo(
    () => uniqueGenreSuggestionOptions([...genreSuggestionAliases, ...genreSuggestionNames]),
    [genreSuggestionNames],
  );
  const requestGenreSuggestionRefresh = useCallback(() => {
    void refreshGenreSuggestions().catch(() => {
      // Field focus can retry again; keep the existing option list.
    });
  }, [refreshGenreSuggestions]);
  const chartRequest = useMemo(() => chartRequestFromConfig(chartConfig), [chartConfig]);
  const albumTracksRequest = useMemo(
    () => (selectedAlbumId ? createAlbumTracksRequest(selectedAlbumId) : null),
    [selectedAlbumId],
  );
  const selectedArtist =
    artistResponse?.rows.find((artist) => artist.id === selectedArtistId) ?? null;
  const artistAlbumsRequest = useMemo(
    () => (selectedArtist ? createArtistAlbumsRequest(selectedArtist) : null),
    [selectedArtist],
  );
  const selectedArtistAlbum =
    artistAlbumsResponse?.rows.find((row) => row.albumId === selectedArtistAlbumId) ?? null;
  const artistAlbumTracksRequest = useMemo(
    () => (selectedArtistAlbumId ? createAlbumTracksRequest(selectedArtistAlbumId) : null),
    [selectedArtistAlbumId],
  );
  const selectedGenre =
    genreResponse?.rows.find((genre) => genre.id === selectedGenreId) ?? null;
  const genreAlbumsRequest = useMemo(
    () => (selectedGenre ? createGenreAlbumsRequest(selectedGenre) : null),
    [selectedGenre],
  );
  const selectedCatalogTool = musicTools.find((tool) => tool.id === selectedToolId) ?? null;
  const currentToolIssueResponse = toolIssueResponse?.tool.id === selectedToolId ? toolIssueResponse : null;
  const selectedTool = currentToolIssueResponse?.tool ?? selectedCatalogTool;
  const activeToolProgress =
    toolProgress?.toolId === selectedToolId && toolProgress.requestId === toolIssueRequest.requestId
      ? toolProgress
      : null;
  const activeToolProgressText = formatToolProgress(activeToolProgress);
  const isToolProgressActive = isMusicToolProgressActive(activeToolProgress);
  const isToolRunPending = isToolIssuesLoading || isToolProgressActive;

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

  useEffect(() => {
    if (activeSection !== "Albums") {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsAlbumLoading(true);
      setAlbumError(null);
      void searchLibrary(albumRequest)
        .then((nextResponse) => {
          if (!cancelled) {
            setAlbumResponse(nextResponse);
          }
        })
        .catch((searchError) => {
          if (!cancelled) {
            setAlbumError(searchError instanceof Error ? searchError.message : String(searchError));
            setAlbumResponse(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsAlbumLoading(false);
          }
        });
    }, 160);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeSection, albumRequest]);

  useEffect(() => {
    if (activeSection !== "Albums") {
      return;
    }

    const rows = albumResponse?.rows ?? [];
    if (rows.length === 0) {
      setSelectedAlbumId(null);
      return;
    }

    setSelectedAlbumId((previous) =>
      previous && rows.some((row) => row.albumId === previous) ? previous : rows[0].albumId,
    );
  }, [activeSection, albumResponse]);

  useEffect(() => {
    if (activeSection !== "Albums" || !albumTracksRequest) {
      setAlbumTracksResponse(null);
      return;
    }

    let cancelled = false;
    setIsAlbumTracksLoading(true);
    setAlbumTracksError(null);
    void searchLibrary(albumTracksRequest)
      .then((nextResponse) => {
        if (!cancelled) {
          setAlbumTracksResponse(nextResponse);
        }
      })
      .catch((searchError) => {
        if (!cancelled) {
          setAlbumTracksError(searchError instanceof Error ? searchError.message : String(searchError));
          setAlbumTracksResponse(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsAlbumTracksLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection, albumTracksRequest]);

  useEffect(() => {
    if (activeSection !== "Artists") {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsArtistLoading(true);
      setArtistError(null);
      void listArtists(artistRequest)
        .then((nextResponse) => {
          if (!cancelled) {
            setArtistResponse(nextResponse);
          }
        })
        .catch((searchError) => {
          if (!cancelled) {
            setArtistError(searchError instanceof Error ? searchError.message : String(searchError));
            setArtistResponse(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsArtistLoading(false);
          }
        });
    }, 160);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeSection, artistRequest]);

  useEffect(() => {
    if (activeSection !== "Artists") {
      return;
    }

    const rows = artistResponse?.rows ?? [];
    if (rows.length === 0) {
      setSelectedArtistId(null);
      return;
    }

    setSelectedArtistId((previous) =>
      previous && rows.some((artist) => artist.id === previous) ? previous : rows[0].id,
    );
  }, [activeSection, artistResponse]);

  useEffect(() => {
    if (activeSection !== "Artists" || !artistAlbumsRequest) {
      setArtistAlbumsResponse(null);
      return;
    }

    let cancelled = false;
    setIsArtistAlbumsLoading(true);
    setArtistAlbumsError(null);
    void searchLibrary(artistAlbumsRequest)
      .then((nextResponse) => {
        if (!cancelled) {
          setArtistAlbumsResponse(nextResponse);
        }
      })
      .catch((searchError) => {
        if (!cancelled) {
          setArtistAlbumsError(searchError instanceof Error ? searchError.message : String(searchError));
          setArtistAlbumsResponse(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsArtistAlbumsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection, artistAlbumsRequest]);

  useEffect(() => {
    if (activeSection !== "Artists") {
      return;
    }

    const rows = artistAlbumsResponse?.rows ?? [];
    if (rows.length === 0) {
      setSelectedArtistAlbumId(null);
      return;
    }

    setSelectedArtistAlbumId((previous) =>
      previous && rows.some((row) => row.albumId === previous) ? previous : rows[0].albumId,
    );
  }, [activeSection, artistAlbumsResponse]);

  useEffect(() => {
    if (activeSection !== "Artists" || !artistAlbumTracksRequest) {
      setArtistAlbumTracksResponse(null);
      return;
    }

    let cancelled = false;
    setIsArtistAlbumTracksLoading(true);
    setArtistAlbumTracksError(null);
    void searchLibrary(artistAlbumTracksRequest)
      .then((nextResponse) => {
        if (!cancelled) {
          setArtistAlbumTracksResponse(nextResponse);
        }
      })
      .catch((searchError) => {
        if (!cancelled) {
          setArtistAlbumTracksError(searchError instanceof Error ? searchError.message : String(searchError));
          setArtistAlbumTracksResponse(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsArtistAlbumTracksLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection, artistAlbumTracksRequest]);

  useEffect(() => {
    if (activeSection !== "Genres") {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsGenreLoading(true);
      setGenreError(null);
      void listGenres(genreRequest)
        .then((nextResponse) => {
          if (!cancelled) {
            setGenreResponse(nextResponse);
          }
        })
        .catch((searchError) => {
          if (!cancelled) {
            setGenreError(searchError instanceof Error ? searchError.message : String(searchError));
            setGenreResponse(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsGenreLoading(false);
          }
        });
    }, 160);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeSection, genreRequest]);

  useEffect(() => {
    const visibleGenreNames = genreResponse?.rows.map((genre) => genre.name) ?? [];
    if (visibleGenreNames.length === 0) {
      return;
    }

    setGenreSuggestionNames((previous) =>
      uniqueGenreSuggestionOptions([...previous, ...visibleGenreNames]),
    );
  }, [genreResponse]);

  useEffect(() => {
    if (activeSection !== "Genres") {
      return;
    }

    const rows = genreResponse?.rows ?? [];
    if (rows.length === 0) {
      setSelectedGenreId(null);
      return;
    }

    setSelectedGenreId((previous) =>
      previous && rows.some((genre) => genre.id === previous) ? previous : rows[0].id,
    );
  }, [activeSection, genreResponse]);

  useEffect(() => {
    if (activeSection !== "Genres" || !genreAlbumsRequest) {
      setGenreAlbumsResponse(null);
      return;
    }

    let cancelled = false;
    setIsGenreAlbumsLoading(true);
    setGenreAlbumsError(null);
    void searchLibrary(genreAlbumsRequest)
      .then((nextResponse) => {
        if (!cancelled) {
          setGenreAlbumsResponse(nextResponse);
        }
      })
      .catch((searchError) => {
        if (!cancelled) {
          setGenreAlbumsError(searchError instanceof Error ? searchError.message : String(searchError));
          setGenreAlbumsResponse(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsGenreAlbumsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection, genreAlbumsRequest]);

  useEffect(() => {
    if (activeSection !== "Tools") {
      return;
    }

    let cancelled = false;
    setIsToolsLoading(true);
    setToolsError(null);
    void listMusicTools()
      .then((nextTools) => {
        if (!cancelled) {
          setMusicTools((previous) =>
            nextTools.length === 0
              ? previous
              : nextTools.map((nextTool) => {
                  const previousTool = previous.find((tool) => tool.id === nextTool.id);
                  return previousTool && previousTool.issueCount >= 0
                    ? {
                        ...nextTool,
                        issueCount: previousTool.issueCount,
                        albumCount: previousTool.albumCount,
                        trackCount: previousTool.trackCount,
                      }
                    : nextTool;
                }),
          );
        }
      })
      .catch((searchError) => {
        if (!cancelled) {
          setToolsError(searchError instanceof Error ? searchError.message : String(searchError));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsToolsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection]);

  useEffect(() => {
    if (activeSection !== "Tools") {
      return;
    }

    if (musicTools.length === 0) {
      setSelectedToolId(null);
      setToolIssueResponse(null);
      return;
    }

    setSelectedToolId((previous) =>
      previous && musicTools.some((tool) => tool.id === previous) ? previous : musicTools[0].id,
    );
  }, [activeSection, musicTools]);

  useEffect(() => {
    if (activeSection !== "Tools" || !selectedToolId) {
      return;
    }

    setToolIssueRequest((previous) =>
      previous.toolId === selectedToolId
        ? previous
        : {
            ...createMusicToolIssueRequest(selectedToolId),
            limit: previous.limit,
          },
    );
  }, [activeSection, selectedToolId]);

  useEffect(() => {
    if (activeSection !== "Tools" || !selectedToolId || toolIssueRequest.toolId !== selectedToolId) {
      return;
    }

    let cancelled = false;
    setToolProgress({
      toolId: toolIssueRequest.toolId,
      requestId: toolIssueRequest.requestId,
      status: "starting",
      percent: 5,
      message: "Starting validation count.",
    });
    const timer = window.setTimeout(() => {
      setIsToolIssuesLoading(true);
      setToolIssueError(null);
      void listMusicToolIssues(toolIssueRequest)
        .then((nextResponse) => {
          if (!cancelled) {
            setToolIssueResponse(nextResponse);
            setToolProgress({
              toolId: toolIssueRequest.toolId,
              requestId: toolIssueRequest.requestId,
              status: "completed",
              percent: 100,
              message: "Validation count complete.",
            });
          }
        })
        .catch((searchError) => {
          if (!cancelled) {
            setToolIssueError(searchError instanceof Error ? searchError.message : String(searchError));
            setToolIssueResponse(null);
            setToolProgress({
              toolId: toolIssueRequest.toolId,
              requestId: toolIssueRequest.requestId,
              status: "failed",
              percent: 100,
              message: "Validation count failed.",
            });
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsToolIssuesLoading(false);
          }
        });
    }, 160);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeSection, selectedToolId, toolIssueRequest]);

  useEffect(() => {
    if (!toolIssueResponse) {
      return;
    }

    setMusicTools((previous) =>
      previous.map((tool) => (tool.id === toolIssueResponse.tool.id ? toolIssueResponse.tool : tool)),
    );
  }, [toolIssueResponse]);

  useEffect(() => {
    setToolExportResult(null);
  }, [
    toolIssueRequest.toolId,
    toolIssueRequest.searchText,
    toolIssueRequest.sort.field,
    toolIssueRequest.sort.direction,
  ]);

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

  useEffect(() => {
    if (activeSection !== "Discovery" || !discoverySelection) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsDiscoveryAlbumsLoading(true);
      setDiscoveryAlbumError(null);
      void searchLibrary(discoveryAlbumRequest)
        .then((nextResponse) => {
          if (!cancelled) {
            setDiscoveryAlbumResponse(nextResponse);
          }
        })
        .catch((searchError) => {
          if (!cancelled) {
            setDiscoveryAlbumError(searchError instanceof Error ? searchError.message : String(searchError));
            setDiscoveryAlbumResponse(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsDiscoveryAlbumsLoading(false);
          }
        });
    }, 160);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeSection, discoveryAlbumRequest, discoverySelection]);

  const progressPercent = useMemo(() => {
    if (progress.status === "completed") return 100;
    if (progress.processedRows === 0) return isImporting ? 6 : 0;
    return Math.min(96, Math.max(8, (progress.processedRows / 1_130_882) * 100));
  }, [isImporting, progress.processedRows, progress.status]);

  const coverProgressPercent = useMemo(() => {
    if (coverProgress.status === "completed") return 100;
    if (coverProgress.scannedAlbums === 0) return isImportingCovers ? 4 : 0;
    return Math.min(99, Math.max(1, coverProgress.percent));
  }, [coverProgress.percent, coverProgress.scannedAlbums, coverProgress.status, isImportingCovers]);

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
      "billboard",
      request.view === "tracks" ? "Album Billboard" : "Billboard",
      currentFilters.billboardRankMin,
      currentFilters.billboardRankMax,
      () => updateFilters({ billboardRankMin: null, billboardRankMax: null }),
    );
    if (request.view === "tracks") {
      addRangeChip(
        nextChips,
        "billboardSingle",
        "Single Billboard",
        currentFilters.billboardSingleRankMin,
        currentFilters.billboardSingleRankMax,
        () => updateFilters({ billboardSingleRankMin: null, billboardSingleRankMax: null }),
      );
    }
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
      "ratedTracks",
      "Tracks rated",
      currentFilters.ratedTracksMin,
      currentFilters.ratedTracksMax,
      () => updateFilters({ ratedTracksMin: null, ratedTracksMax: null }),
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

    addRangeChip(
      nextChips,
      "ratingCompleteness",
      "Complete",
      currentFilters.ratingCompletenessMin,
      currentFilters.ratingCompletenessMax,
      () => updateFilters({ ratingCompletenessMin: null, ratingCompletenessMax: null }),
      "%",
    );
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
        label: `Missing: ${formatMissingFieldLabels(currentFilters.missingFields, request.view)}`,
        remove: () => updateFilter("missingFields", []),
      });
    }

    return nextChips;
  }, [currentFilters, request.searchText, request.view]);

  const albumChips = useMemo(() => {
    const nextChips: { key: string; label: string; remove: () => void }[] = [];
    const addTextChip = (key: keyof BrowseFilters, label: string, filter: TextFilter) => {
      const chipLabel = textFilterLabel(label, filter);
      if (chipLabel) {
        nextChips.push({
          key,
          label: chipLabel,
          remove: () => updateAlbumFilter(key, createTextFilter()),
        });
      }
    };

    if (albumRequest.searchText.trim()) {
      nextChips.push({
        key: "searchText",
        label: `Search "${albumRequest.searchText.trim()}"`,
        remove: () => setAlbumRequest((previous) => ({ ...previous, searchText: "", offset: 0 })),
      });
    }

    addTextChip("albumTitle", "Album", albumFilters.albumTitle);
    addTextChip("albumArtist", "Album artist", albumFilters.albumArtist);
    addTextChip("publisher", "Publisher", albumFilters.publisher);

    if (albumFilters.genres.length) {
      nextChips.push({
        key: "genres",
        label: `Genres: ${albumFilters.genres.join(", ")}`,
        remove: () => updateAlbumFilter("genres", []),
      });
    }
    if (albumFilters.excludedGenres.length) {
      nextChips.push({
        key: "excludedGenres",
        label: `Excluding: ${albumFilters.excludedGenres.join(", ")}`,
        remove: () => updateAlbumFilter("excludedGenres", []),
      });
    }

    addRangeChip(nextChips, "year", "Year", albumFilters.yearFrom, albumFilters.yearTo, () => {
      updateAlbumFilters({ yearFrom: null, yearTo: null });
    });
    addRangeChip(
      nextChips,
      "billboard",
      "Billboard",
      albumFilters.billboardRankMin,
      albumFilters.billboardRankMax,
      () => updateAlbumFilters({ billboardRankMin: null, billboardRankMax: null }),
    );
    addRangeChip(
      nextChips,
      "minutes",
      "Minutes",
      albumFilters.totalMinutesMin,
      albumFilters.totalMinutesMax,
      () => updateAlbumFilters({ totalMinutesMin: null, totalMinutesMax: null }),
    );
    addRangeChip(
      nextChips,
      "albumRating",
      "Album rating",
      albumFilters.albumRatingMin,
      albumFilters.albumRatingMax,
      () => updateAlbumFilters({ albumRatingMin: null, albumRatingMax: null }),
    );
    addRangeChip(
      nextChips,
      "trackCount",
      "Tracks",
      albumFilters.trackCountMin,
      albumFilters.trackCountMax,
      () => updateAlbumFilters({ trackCountMin: null, trackCountMax: null }),
    );

    addRangeChip(
      nextChips,
      "ratingCompleteness",
      "Complete",
      albumFilters.ratingCompletenessMin,
      albumFilters.ratingCompletenessMax,
      () => updateAlbumFilters({ ratingCompletenessMin: null, ratingCompletenessMax: null }),
      "%",
    );
    if (albumFilters.lovedTracksMin != null || albumFilters.lovedTracksMax != null) {
      addRangeChip(
        nextChips,
        "lovedTracks",
        "Loved",
        albumFilters.lovedTracksMin,
        albumFilters.lovedTracksMax,
        () => updateAlbumFilters({ lovedTracksMin: null, lovedTracksMax: null }),
      );
    }

    return nextChips;
  }, [albumFilters, albumRequest.searchText]);

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

  function sortSearchBy(field: string) {
    setRequest((previous) => ({
      ...previous,
      sort: nextSort(previous.sort, field),
      offset: 0,
    }));
    setExportResult(null);
  }

  function updateAlbumFilter<K extends keyof BrowseFilters>(key: K, value: BrowseFilters[K]) {
    setAlbumRequest((previous) => ({
      ...previous,
      filters: { ...previous.filters, [key]: value },
      offset: 0,
    }));
    setAlbumExportResult(null);
  }

  function updateAlbumFilters(values: Partial<BrowseFilters>) {
    setAlbumRequest((previous) => ({
      ...previous,
      filters: { ...previous.filters, ...values },
      offset: 0,
    }));
    setAlbumExportResult(null);
  }

  function sortAlbumsBy(field: string) {
    setAlbumRequest((previous) => ({
      ...previous,
      sort: nextSort(previous.sort, field),
      offset: 0,
    }));
    setAlbumExportResult(null);
  }

  function clearAlbumQuery() {
    setAlbumRequest((previous) => {
      const nextRequest = createRequest("albums");
      nextRequest.limit = previous.limit;
      return nextRequest;
    });
    setAlbumExportResult(null);
  }

  function selectAlbum(albumId: string) {
    setSelectedAlbumId(albumId);
    setAlbumExportResult(null);
  }

  function clearArtistQuery() {
    setArtistRequest((previous) => ({
      ...createArtistListRequest(),
      limit: previous.limit,
    }));
    setSelectedArtistAlbumId(null);
    setArtistAlbumTracksResponse(null);
    setArtistAlbumTracksError(null);
    setArtistExportResult(null);
  }

  function selectArtist(artistId: string) {
    setSelectedArtistId(artistId);
    setSelectedArtistAlbumId(null);
    setArtistAlbumTracksResponse(null);
    setArtistAlbumTracksError(null);
    setArtistExportResult(null);
  }

  function selectArtistAlbum(albumId: string) {
    setSelectedArtistAlbumId(albumId);
    setArtistAlbumTracksError(null);
  }

  function clearSelectedArtistAlbum() {
    setSelectedArtistAlbumId(null);
    setArtistAlbumTracksResponse(null);
    setArtistAlbumTracksError(null);
  }

  function clearGenreQuery() {
    setGenreRequest((previous) => ({
      ...createGenreListRequest(),
      limit: previous.limit,
    }));
    setGenreExportResult(null);
  }

  function selectGenre(genreId: string) {
    setSelectedGenreId(genreId);
    setGenreExportResult(null);
  }

  function clearToolQuery() {
    setToolIssueRequest((previous) => ({
      ...createMusicToolIssueRequest(previous.toolId),
      limit: previous.limit,
    }));
    setToolExportResult(null);
  }

  function selectMusicTool(toolId: string) {
    setSelectedToolId(toolId);
    setToolIssueRequest((previous) => ({
      ...createMusicToolIssueRequest(toolId),
      limit: previous.limit,
    }));
    setToolExportResult(null);
  }

  async function refreshMusicTools() {
    setIsToolsLoading(true);
    setToolsError(null);
    try {
      const nextTools = await listMusicTools();
      setMusicTools(nextTools);
    } catch (error) {
      setToolsError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsToolsLoading(false);
    }
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

    try {
      const summary = await importBillboardCharts(billboardSourcePath);
      setBillboardImportSummary(summary);
      await loadData();
      setRequest((current) => ({ ...current }));
      setAlbumRequest((current) => ({ ...current }));
      setChartConfig((current) => ({ ...current }));
      setArtistRequest((current) => ({ ...current }));
      setGenreRequest((current) => ({ ...current }));
      setDiscoveryAlbumRequest((current) => ({ ...current }));
      setArtistAlbumsResponse(null);
      setGenreAlbumsResponse(null);
      setDiscoveryAlbumResponse(null);
    } catch (error) {
      setBillboardImportError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsImportingBillboard(false);
    }
  }

  async function startBillboardSinglesImport() {
    setIsImportingBillboardSingles(true);
    setBillboardSinglesImportError(null);
    setBillboardSinglesImportSummary(null);

    try {
      const summary = await importBillboardSingles(billboardSinglesSourcePath);
      setBillboardSinglesImportSummary(summary);
      await loadData();
      setRequest((current) => ({ ...current }));
      setAlbumTracksResponse(null);
      setArtistAlbumTracksResponse(null);
      setGenreAlbumsResponse(null);
      setDiscoveryAlbumResponse(null);
    } catch (error) {
      setBillboardSinglesImportError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsImportingBillboardSingles(false);
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

  async function runAlbumExport(format: string) {
    if (!selectedAlbumId) {
      return;
    }
    const result = await exportSearch(
      createAlbumTracksRequest(selectedAlbumId),
      format,
      albumIncludeCalculated,
    );
    setAlbumExportResult(result);
  }

  async function runArtistExport(format: string) {
    if (!artistAlbumsRequest) {
      return;
    }
    const result = await exportSearch(artistAlbumsRequest, format, artistIncludeCalculated);
    setArtistExportResult(result);
  }

  async function runGenreExport(format: string) {
    if (!genreAlbumsRequest) {
      return;
    }
    const result = await exportSearch(genreAlbumsRequest, format, genreIncludeCalculated);
    setGenreExportResult(result);
  }

  async function runToolExport(format: string) {
    if (!selectedTool) {
      return;
    }
    const result = await exportMusicToolIssues(
      {
        ...toolIssueRequest,
        toolId: selectedTool.id,
      },
      format,
    );
    setToolExportResult(result);
  }

  function updateChartConfig(values: Partial<ChartConfig>) {
    setChartConfig((previous) => {
      const nextConfig = {
        ...previous,
        ...values,
        sortField: values.sortField ?? (values.rankingMetric ? values.rankingMetric : previous.sortField),
        request: values.request ?? previous.request,
      };
      if (values.gridCoverSize != null) {
        nextConfig.gridCoverSize = normalizeChartGridCoverSize(values.gridCoverSize);
      }
      return nextConfig;
    });
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

  function sortChartBy(field: string) {
    const defaultSort: BrowseSort = {
      field: chartConfig.rankingMetric,
      direction: chartConfig.sortDirection,
    };
    setChartTableSort((previous) => nextSort(previous ?? defaultSort, field));
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
    setChartTableSort(null);
    setChartExportResult(null);
  }

  async function saveCurrentChart() {
    const nextConfig = {
      ...normalizeChartConfigForClient(chartConfig),
      sortField: chartConfig.sortField ?? chartConfig.rankingMetric,
      gridCoverSize: normalizeChartGridCoverSize(chartConfig.gridCoverSize),
      request: chartRequest,
    };
    const fallbackName = `${rankingLabel(nextConfig.rankingMetric)} chart`;
    const saved = await saveChart(chartName.trim() || fallbackName, nextConfig);
    setSavedCharts((previous) => [
      { ...saved, config: normalizeChartConfigForClient(saved.config) },
      ...previous.filter((chart) => chart.id !== saved.id),
    ]);
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

  async function refreshDiscovery() {
    setDiscoveryError(null);
    try {
      await loadDiscoveryData();
    } catch (error) {
      setDiscoveryError(error instanceof Error ? error.message : String(error));
      setIsDiscoveryLoading(false);
    }
  }

  function openDiscoveryAlbums(selection: DiscoverySelection, nextRequest: BrowseRequest) {
    setDiscoverySelection(selection);
    setDiscoveryAlbumRequest(nextRequest);
    setDiscoveryAlbumResponse(null);
    setDiscoveryAlbumError(null);
  }

  function openDiscoveryMission(mission: DiscoveryMission) {
    openDiscoveryAlbums(
      {
        title: mission.title,
        caption: `${formatNumber(mission.albumCount)} albums / ${mission.actionLabel}`,
      },
      createDiscoveryMissionRequest(mission),
    );
  }

  function openDiscoveryHeatmapCell(cell: DiscoveryHeatmapCell) {
    openDiscoveryAlbums(
      {
        title: `${cell.genre} / ${cell.year}`,
        caption: `${formatNumber(cell.albumCount)} albums, ${formatPercent(cell.averageRatingCompleteness)} complete`,
      },
      createDiscoveryHeatmapRequest(cell),
    );
  }

  function openDiscoveryAlbumPoint(point: DiscoveryAlbumPoint) {
    openDiscoveryAlbums(
      {
        title: point.album ?? "Untitled album",
        caption: [point.albumArtistDisplay, point.year, point.genre].filter(Boolean).join(" / "),
      },
      createDiscoveryAlbumPointRequest(point),
    );
  }

  function openDiscoveryGenre(point: DiscoveryGenrePoint) {
    openDiscoveryAlbums(
      {
        title: point.genre,
        caption: `${formatNumber(point.albumCount)} albums / ${formatPercent(point.averageRatingCompleteness)} complete`,
      },
      createDiscoveryGenreRequest(point),
    );
  }

  function openDiscoveryArtist(point: DiscoveryArtistPoint) {
    openDiscoveryAlbums(
      {
        title: point.artist,
        caption: [formatNumber(point.albumCount), "albums", point.topGenre].filter(Boolean).join(" / "),
      },
      createDiscoveryArtistRequest(point),
    );
  }

  function sortDiscoveryAlbumsBy(field: string) {
    setDiscoveryAlbumRequest((previous) => ({
      ...previous,
      sort: nextSort(previous.sort, field),
      offset: 0,
    }));
  }

  async function saveAppSettings(values: Partial<AppSettings>) {
    const nextSettings = {
      ...settings,
      ...values,
      backupRetention: clampBackupRetention(values.backupRetention ?? settings.backupRetention),
      leftSidebarDefault: values.leftSidebarDefault ?? settings.leftSidebarDefault,
      rightSidebarDefault: values.rightSidebarDefault ?? settings.rightSidebarDefault,
    };
    setSettings(nextSettings);
    cacheSettings(nextSettings);
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
        setDiscoveryError(error instanceof Error ? error.message : String(error));
        setIsDiscoveryLoading(false);
      });
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRestoringBackup(false);
    }
  }

  function saveLeftSidebarDefault(mode: LeftSidebarMode) {
    setLeftSidebarMode(mode);
    void saveAppSettings({ leftSidebarDefault: mode });
  }

  function saveRightSidebarDefault(mode: RightSidebarMode) {
    setRightSidebarMode(mode);
    void saveAppSettings({ rightSidebarDefault: mode });
  }

  const total = response?.total ?? 0;
  const pageStart = total === 0 ? 0 : request.offset + 1;
  const pageEnd = Math.min(total, request.offset + request.limit);
  const albumTotal = albumResponse?.total ?? 0;
  const albumPageStart = albumTotal === 0 ? 0 : albumRequest.offset + 1;
  const albumPageEnd = Math.min(albumTotal, albumRequest.offset + albumRequest.limit);
  const selectedAlbum =
    albumResponse?.rows.find((row) => row.albumId === selectedAlbumId) ?? null;
  const selectedAlbumTrackCount = selectedAlbum?.totalTracks ?? albumTracksResponse?.total ?? 0;
  const artistTotal = artistResponse?.total ?? 0;
  const artistPageStart = artistTotal === 0 ? 0 : artistRequest.offset + 1;
  const artistPageEnd = Math.min(artistTotal, artistRequest.offset + artistRequest.limit);
  const selectedArtistAlbumCount = selectedArtist?.albumCount ?? artistAlbumsResponse?.total ?? 0;
  const selectedArtistAlbumTrackCount =
    selectedArtistAlbum?.totalTracks ?? artistAlbumTracksResponse?.total ?? 0;
  const genreTotal = genreResponse?.total ?? 0;
  const genrePageStart = genreTotal === 0 ? 0 : genreRequest.offset + 1;
  const genrePageEnd = Math.min(genreTotal, genreRequest.offset + genreRequest.limit);
  const selectedGenreAlbumCount = selectedGenre?.albumCount ?? genreAlbumsResponse?.total ?? 0;
  const toolIssueTotal = currentToolIssueResponse?.total ?? 0;
  const toolIssuePageStart = toolIssueTotal === 0 ? 0 : toolIssueRequest.offset + 1;
  const toolIssuePageEnd = Math.min(toolIssueTotal, toolIssueRequest.offset + toolIssueRequest.limit);
  const totalToolIssues = musicTools.every((tool) => tool.issueCount >= 0)
    ? musicTools.reduce((sum, tool) => sum + tool.issueCount, 0)
    : null;
  const selectedToolIssueCount = selectedTool?.issueCount ?? toolIssueTotal;
  const selectedToolIssueValue =
    isToolProgressActive && activeToolProgressText
      ? activeToolProgressText
      : formatToolCount(selectedToolIssueCount);
  const toolIssuePanelCaption =
    isToolRunPending && activeToolProgress && activeToolProgressText
      ? `${activeToolProgress.message} ${activeToolProgressText}`
      : `${formatNumber(toolIssuePageStart)}-${formatNumber(toolIssuePageEnd)} of ${formatNumber(toolIssueTotal)}`;
  const chartTotal = chartResponse?.total ?? 0;
  const chartRows = chartResponse?.rows.length ?? 0;
  const currentChartGridCoverSize = normalizeChartGridCoverSize(chartConfig.gridCoverSize);
  const currentChartCompletenessRange = chartCompletenessRange(chartConfig);
  const discoveryMissionTotal = (discovery?.backlogMissions.length ?? 0) + (discovery?.smartMissions.length ?? 0);
  const discoveryMetricValue = (value: number | null | undefined) =>
    isDiscoveryLoading && !discovery ? "Loading" : formatNumber(value);
  const discoveryHeatmapEmptyLabel = isDiscoveryLoading ? "Loading heatmap cells." : "No heatmap cells yet.";
  const discoveryBacklogEmptyLabel = isDiscoveryLoading ? "Loading backlog missions." : "No backlog missions yet.";
  const discoverySmartMissionEmptyLabel = isDiscoveryLoading ? "Loading smart missions." : "No smart missions yet.";
  const discoveryOutlierEmptyLabel = isDiscoveryLoading
    ? "Loading loved/rating outliers."
    : "No loved/rating outliers yet.";
  const discoveryGenreEmptyLabel = isDiscoveryLoading ? "Loading genre universe." : "No genre universe yet.";
  const discoveryArtistEmptyLabel = isDiscoveryLoading ? "Loading artist constellation." : "No artist constellation yet.";
  const discoveryAlbumTotal = discoveryAlbumResponse?.total ?? 0;
  const discoveryAlbumPageStart = discoveryAlbumTotal === 0 ? 0 : discoveryAlbumRequest.offset + 1;
  const discoveryAlbumPageEnd = Math.min(discoveryAlbumTotal, discoveryAlbumRequest.offset + discoveryAlbumRequest.limit);
  const ratingAlbumTotal =
    (statistics?.ratingProgress.fullyRatedAlbums ?? 0) +
    (statistics?.ratingProgress.partiallyRatedAlbums ?? 0) +
    (statistics?.ratingProgress.unratedAlbums ?? 0);
  const ratingTrackTotal =
    (statistics?.ratingProgress.ratedTracks ?? 0) + (statistics?.ratingProgress.unratedTracks ?? 0);
  const isLeftSidebarHidden = leftSidebarMode === "hidden";
  const isRightSidebarHidden = rightSidebarMode === "hidden";
  const leftSidebarClass = leftSidebarMode === "iconOnly" ? "left-sidebar-icon-only" : `left-sidebar-${leftSidebarMode}`;
  const appShellClassName = `app-shell ${leftSidebarClass} right-sidebar-${rightSidebarMode}`;
  const leftIconOnlyToggleLabel =
    leftSidebarMode === "iconOnly" ? "Show navigation labels" : "Show navigation icons only";

  return (
    <main className={appShellClassName}>
      {isLeftSidebarHidden ? (
        <button
          className="icon-button edge-toggle left-sidebar-toggle"
          type="button"
          aria-label="Show navigation"
          title="Show navigation"
          onClick={() => setLeftSidebarMode("expanded")}
        >
          <ChevronRight size={18} />
        </button>
      ) : null}
      <button
        className="icon-button edge-toggle right-sidebar-toggle"
        type="button"
        aria-label={isRightSidebarHidden ? "Show details sidebar" : "Hide details sidebar"}
        title={isRightSidebarHidden ? "Show details sidebar" : "Hide details sidebar"}
        onClick={() => setRightSidebarMode(isRightSidebarHidden ? "expanded" : "hidden")}
      >
        {isRightSidebarHidden ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
      </button>
      <aside className="sidebar" aria-label="Main navigation" aria-hidden={isLeftSidebarHidden}>
        <div className="sidebar-header">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">
              <Library size={20} />
            </div>
            <div>
              <strong>Music Library</strong>
              <span>Local TSV browser</span>
            </div>
          </div>

          <div className="sidebar-actions">
            <button
              className="icon-button sidebar-action"
              type="button"
              aria-label={leftIconOnlyToggleLabel}
              title={leftIconOnlyToggleLabel}
              onClick={() => setLeftSidebarMode(leftSidebarMode === "iconOnly" ? "expanded" : "iconOnly")}
            >
              <ListMusic size={16} />
            </button>
            <button
              className="icon-button sidebar-action"
              type="button"
              aria-label="Collapse navigation"
              title="Collapse navigation"
              onClick={() => setLeftSidebarMode("hidden")}
            >
              <ChevronLeft size={16} />
            </button>
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
            <Metric label="Cover images" value={formatNumber(status?.coverCount)} icon={Album} />
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

          <section className="import-panel">
            <div className="panel-heading">
              <div>
                <h2>Cover art</h2>
                <p>Scan folder-named image files, link archive matches, and optionally extract embedded MP3 artwork into the cover archive.</p>
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
                  onChange={(event) => setCoverExtractEmbeddedFallback(event.target.checked)}
                  disabled={isImportingCovers}
                />
                <span>Extract missing embedded MP3 covers into AlbumCovers</span>
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={coverReplaceExisting}
                  onChange={(event) => setCoverReplaceExisting(event.target.checked)}
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
                <div className="progress-fill" style={{ width: `${coverProgressPercent}%` }} />
              </div>
              <div className="progress-meta">
                <span>
                  {formatNumber(coverProgress.scannedAlbums)} of {formatNumber(coverProgress.totalAlbums)} albums scanned
                </span>
                <span>{formatNumber(coverProgress.newCoversFound)} new covers found or extracted</span>
              </div>
              <div className="progress-meta">
                <span>{formatNumber(coverProgress.importedCovers)} imported</span>
                <span>{formatNumber(coverProgress.relinkedCovers)} relinked</span>
                <span>{formatNumber(coverProgress.skippedExisting)} already had covers</span>
                <span>{formatNumber(coverProgress.missingCovers)} missing</span>
              </div>
            </div>

            {coverImportError ? <p className="error-message">{coverImportError}</p> : null}
            {coverImportSummary ? (
              <p className="success-message">
                Linked or imported {formatNumber(coverImportSummary.importedCovers)} covers from{" "}
                {formatNumber(coverImportSummary.newCoversFound)} newly found or extracted covers and{" "}
                {formatNumber(coverImportSummary.relinkedCovers)} existing cover entries.
              </p>
            ) : null}

            <div className="action-row">
              <button
                className="primary-button"
                type="button"
                onClick={startCoverImport}
                disabled={isImportingCovers || !coverSourcePath.trim() || !canImport || (status?.albumCount ?? 0) === 0}
                title={canImport ? "Start cover import" : "Open the Tauri desktop app to import covers"}
              >
                <Play size={17} fill="currentColor" />
                <span>{isImportingCovers ? "Scanning" : "Import covers"}</span>
              </button>
              <span className="db-path">
                Archive matches are linked directly; missing embedded art is saved into AlbumCovers.
              </span>
            </div>
          </section>

          <section className="import-panel">
            <div className="panel-heading">
              <div>
                <h2>Billboard year-end charts</h2>
                <p>Import album ranks from yearly CSV files and annotate matching library albums.</p>
              </div>
              <RunStatus
                status={isImportingBillboard ? "running" : billboardImportSummary ? "completed" : "idle"}
              />
            </div>

            <label className="source-input">
              <span>Chart CSV folder</span>
              <input
                value={billboardSourcePath}
                onChange={(event) => setBillboardSourcePath(event.target.value)}
                placeholder="CSV"
                disabled={isImportingBillboard}
              />
            </label>

            {billboardImportError ? <p className="error-message">{billboardImportError}</p> : null}
            {billboardImportSummary ? (
              <p className="success-message">
                Matched {formatNumber(billboardImportSummary.matchedAlbums)} albums from{" "}
                {formatNumber(billboardImportSummary.chartEntries)} chart rows across{" "}
                {formatNumber(billboardImportSummary.filesScanned)} files.
              </p>
            ) : null}

            <div className="action-row">
              <button
                className="primary-button"
                type="button"
                onClick={startBillboardImport}
                disabled={isImportingBillboard || !billboardSourcePath.trim() || !canImport || (status?.albumCount ?? 0) === 0}
                title={canImport ? "Import Billboard charts" : "Open the Tauri desktop app to import Billboard charts"}
              >
                <BarChart3 size={17} />
                <span>{isImportingBillboard ? "Importing" : "Import Billboard"}</span>
              </button>
              <span className="db-path">
                Best rank wins when an album appears in more than one year-end chart.
              </span>
            </div>
          </section>

          <section className="import-panel">
            <div className="panel-heading">
              <div>
                <h2>Billboard year-end singles</h2>
                <p>Import single ranks from yearly CSV files and annotate matching library tracks.</p>
              </div>
              <RunStatus
                status={
                  isImportingBillboardSingles ? "running" : billboardSinglesImportSummary ? "completed" : "idle"
                }
              />
            </div>

            <label className="source-input">
              <span>Singles CSV folder</span>
              <input
                value={billboardSinglesSourcePath}
                onChange={(event) => setBillboardSinglesSourcePath(event.target.value)}
                placeholder="CSV_SINGLES"
                disabled={isImportingBillboardSingles}
              />
            </label>

            {billboardSinglesImportError ? <p className="error-message">{billboardSinglesImportError}</p> : null}
            {billboardSinglesImportSummary ? (
              <p className="success-message">
                Matched {formatNumber(billboardSinglesImportSummary.matchedTracks)} tracks from{" "}
                {formatNumber(billboardSinglesImportSummary.chartEntries)} singles rows across{" "}
                {formatNumber(billboardSinglesImportSummary.filesScanned)} files.
              </p>
            ) : null}

            <div className="action-row">
              <button
                className="primary-button"
                type="button"
                onClick={startBillboardSinglesImport}
                disabled={
                  isImportingBillboardSingles ||
                  !billboardSinglesSourcePath.trim() ||
                  !canImport ||
                  (status?.trackCount ?? 0) === 0
                }
                title={
                  canImport
                    ? "Import Billboard singles"
                    : "Open the Tauri desktop app to import Billboard singles"
                }
              >
                <ListMusic size={17} />
                <span>{isImportingBillboardSingles ? "Importing" : "Import singles"}</span>
              </button>
              <span className="db-path">
                Matches use Display Artist and Track; best rank wins across repeated years.
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
      ) : activeSection === "Charts" ? (
        <section className="workspace charts-workspace">
          <header className="topbar">
            <div>
              <h1>Charts</h1>
              <p>Rank album lists from saved filters, Album Score, loved tracks, AE, and TMOE.</p>
            </div>
            <div className="topbar-actions">
              <button
                className="icon-button"
                type="button"
                aria-label="Reset chart"
                onClick={() => {
                  setChartConfig(createChartConfig());
                  setChartTableSort(null);
                }}
              >
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
              <NumberField
                label="Billboard min"
                value={chartConfig.request.filters.billboardRankMin}
                min={1}
                onChange={(value) => updateChartFilters({ billboardRankMin: value })}
              />
              <NumberField
                label="Billboard max"
                value={chartConfig.request.filters.billboardRankMax}
                min={1}
                onChange={(value) => updateChartFilters({ billboardRankMax: value })}
              />
              <GenreListCriterion
                label="Genres"
                values={chartConfig.request.filters.genres}
                onChange={(genres) => updateChartFilters({ genres })}
                genreOptions={genreSuggestionOptions}
                onRequestOptions={requestGenreSuggestionRefresh}
                placeholder="Synthpop, AOR"
              />
              <GenreListCriterion
                label="Exclude genres"
                values={chartConfig.request.filters.excludedGenres}
                onChange={(excludedGenres) => updateChartFilters({ excludedGenres })}
                genreOptions={genreSuggestionOptions}
                onRequestOptions={requestGenreSuggestionRefresh}
              />
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
              <CompletenessRangeCriterion
                minValue={currentChartCompletenessRange.min}
                maxValue={currentChartCompletenessRange.max}
                className="chart-slider"
                onChange={(range) =>
                  updateChartConfig({
                    ratingCompletenessMin: range.min,
                    ratingCompletenessMax: range.max,
                    ratingCompletenessThreshold: null,
                  })
                }
              />
              {chartConfig.viewMode === "grid" ? (
                <label className="criterion slider-criterion chart-slider">
                  <span>Cover size</span>
                  <div>
                    <input
                      type="range"
                      min={chartGridCoverSize.min}
                      max={chartGridCoverSize.max}
                      step={chartGridCoverSize.step}
                      value={currentChartGridCoverSize}
                      onChange={(event) => updateChartConfig({ gridCoverSize: Number(event.target.value) })}
                    />
                    <strong>{currentChartGridCoverSize}px</strong>
                  </div>
                </label>
              ) : null}
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
              <span className="run-status">
                {formatCompletenessRange(currentChartCompletenessRange.min, currentChartCompletenessRange.max)} complete
              </span>
            </div>

            {chartError ? <p className="error-message">{chartError}</p> : null}
            <ChartResults
              response={chartResponse}
              config={chartConfig}
              displaySort={chartTableSort}
              onSort={sortChartBy}
            />
          </section>
        </section>
      ) : activeSection === "Discovery" ? (
        <section className="workspace discovery-workspace">
          <header className="topbar">
            <div>
              <h1>Discovery</h1>
              <p>Explore rating backlogs, loved outliers, genre clusters, and artist catalog pockets.</p>
            </div>
            <div className="topbar-actions">
              <button
                className="icon-button"
                type="button"
                aria-label="Refresh discovery"
                onClick={() => void refreshDiscovery()}
              >
                <RotateCcw size={18} />
              </button>
              <button className="icon-button" type="button" aria-label="Refresh library data" onClick={() => void loadData()}>
                <Database size={18} />
              </button>
            </div>
          </header>

          <section className="metric-grid" aria-label="Discovery summary">
            <Metric label="Missions" value={discoveryMetricValue(discoveryMissionTotal)} tone="teal" icon={Compass} />
            <Metric label="Heatmap cells" value={discoveryMetricValue(discovery?.heatmap.length)} tone="amber" icon={Gauge} />
            <Metric label="Genre bubbles" value={discoveryMetricValue(discovery?.genrePoints.length)} icon={Tags} />
            <Metric label="Outliers" value={discoveryMetricValue(discovery?.loveRatingPoints.length)} icon={Heart} />
          </section>

          {discoveryError ? <p className="error-message">{discoveryError}</p> : null}

          <section className="discovery-dashboard-grid" aria-label="Discovery charts">
            <section className="discovery-panel wide">
              <div className="panel-heading compact">
                <div>
                  <h2>Completion heatmap</h2>
                  <p>
                    {isDiscoveryLoading
                      ? "Loading"
                      : `${formatNumber(discovery?.heatmap.length)} genre/year intersections`}
                  </p>
                </div>
                <Gauge size={18} />
              </div>
              <CompletionHeatmap
                cells={discovery?.heatmap ?? []}
                emptyLabel={discoveryHeatmapEmptyLabel}
                onOpen={openDiscoveryHeatmapCell}
              />
            </section>

            <section className="discovery-panel">
              <div className="panel-heading compact">
                <div>
                  <h2>Backlog quest board</h2>
                  <p>Rating paths with the strongest payoff signals.</p>
                </div>
                <Compass size={18} />
              </div>
              <DiscoveryMissionGrid
                missions={discovery?.backlogMissions ?? []}
                emptyLabel={discoveryBacklogEmptyLabel}
                onOpen={openDiscoveryMission}
              />
            </section>

            <section className="discovery-panel">
              <div className="panel-heading compact">
                <div>
                  <h2>Smart missions</h2>
                  <p>Generated shortcuts into focused album sets.</p>
                </div>
                <Sparkles size={18} />
              </div>
              <DiscoveryMissionGrid
                missions={discovery?.smartMissions ?? []}
                emptyLabel={discoverySmartMissionEmptyLabel}
                onOpen={openDiscoveryMission}
              />
            </section>

            <section className="discovery-panel wide">
              <div className="panel-heading compact">
                <div>
                  <h2>Love vs rating scatter</h2>
                  <p>Click a point to inspect the album behind an outlier.</p>
                </div>
                <Heart size={18} />
              </div>
              <LoveRatingScatter
                points={discovery?.loveRatingPoints ?? []}
                emptyLabel={discoveryOutlierEmptyLabel}
                onOpen={openDiscoveryAlbumPoint}
              />
            </section>

            <section className="discovery-panel">
              <div className="panel-heading compact">
                <div>
                  <h2>Genre universe</h2>
                  <p>Bubble size is catalog depth; height is completion.</p>
                </div>
                <Tags size={18} />
              </div>
              <GenreUniverse
                points={discovery?.genrePoints ?? []}
                emptyLabel={discoveryGenreEmptyLabel}
                onOpen={openDiscoveryGenre}
              />
            </section>

            <section className="discovery-panel">
              <div className="panel-heading compact">
                <div>
                  <h2>Artist constellation</h2>
                  <p>Find deep catalogs, favorites, and neglected artists.</p>
                </div>
                <UsersRound size={18} />
              </div>
              <ArtistConstellation
                points={discovery?.artistPoints ?? []}
                emptyLabel={discoveryArtistEmptyLabel}
                onOpen={openDiscoveryArtist}
              />
            </section>

            <section className="table-panel discovery-results-panel" aria-label="Discovery album results">
              <div className="panel-heading compact">
                <div>
                  <h2>{discoverySelection?.title ?? "Discovery albums"}</h2>
                  <p>
                    {!discoverySelection
                      ? "Click a chart item or mission to open matching albums."
                      : isDiscoveryAlbumsLoading
                        ? "Loading"
                        : `${formatNumber(discoveryAlbumPageStart)}-${formatNumber(discoveryAlbumPageEnd)} of ${formatNumber(discoveryAlbumTotal)} / ${discoverySelection.caption}`}
                  </p>
                </div>
                <div className="pager">
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="Previous discovery page"
                    disabled={!discoverySelection || discoveryAlbumRequest.offset === 0}
                    onClick={() =>
                      setDiscoveryAlbumRequest((previous) => ({
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
                    aria-label="Next discovery page"
                    disabled={!discoverySelection || discoveryAlbumRequest.offset + discoveryAlbumRequest.limit >= discoveryAlbumTotal}
                    onClick={() =>
                      setDiscoveryAlbumRequest((previous) => ({
                        ...previous,
                        offset: previous.offset + previous.limit,
                      }))
                    }
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
              </div>

              {discoveryAlbumError ? <p className="error-message">{discoveryAlbumError}</p> : null}
              <ResultTable
                response={discoverySelection ? discoveryAlbumResponse : null}
                sort={discoveryAlbumRequest.sort}
                onSort={sortDiscoveryAlbumsBy}
              />
            </section>
          </section>
        </section>
      ) : activeSection === "Artists" ? (
        <section className="workspace artists-workspace">
          <header className="topbar">
            <div>
              <h1>Artists</h1>
              <p>Album-artist index, selected artist album lists, and artist-level summary stats.</p>
            </div>
            <div className="topbar-actions">
              <button className="icon-button" type="button" aria-label="Clear artist filters" onClick={clearArtistQuery}>
                <RotateCcw size={18} />
              </button>
              <button
                className="icon-button"
                type="button"
                aria-label="Refresh artists"
                onClick={() => {
                  void loadData();
                  setArtistRequest((previous) => ({ ...previous }));
                }}
              >
                <Database size={18} />
              </button>
            </div>
          </header>

          <section className="metric-grid" aria-label="Artist summary">
            <Metric
              label="Album artists"
              value={formatNumber(statistics?.overview.albumArtistCount)}
              tone="teal"
              icon={UsersRound}
            />
            <Metric label="Matches" value={formatNumber(artistTotal)} tone="amber" icon={Search} />
            <Metric label="Artist albums" value={formatNumber(selectedArtistAlbumCount)} icon={Album} />
            <Metric label="Loved tracks" value={formatNumber(selectedArtist?.lovedTracks)} icon={Heart} />
          </section>

          <section className="query-panel artist-query-panel">
            <div className="search-row artist-search-row">
              <div className="search-input">
                <Search size={18} />
                <input
                  value={artistRequest.searchText}
                  onChange={(event) =>
                    setArtistRequest((previous) => ({ ...previous, searchText: event.target.value, offset: 0 }))
                  }
                  placeholder="Search album artists"
                />
              </div>
              <SelectField
                label="Sort"
                value={artistRequest.sort.field}
                onChange={(field) =>
                  setArtistRequest((previous) => ({
                    ...previous,
                    sort: { ...previous.sort, field },
                    offset: 0,
                  }))
                }
                options={[
                  { value: "name", label: "Artist" },
                  { value: "albumCount", label: "Albums" },
                  { value: "trackCount", label: "Tracks" },
                  { value: "lovedTracks", label: "Loved tracks" },
                  { value: "averageCompleteness", label: "Completeness" },
                  { value: "averageRating", label: "Average rating" },
                  { value: "averageScore", label: "Average score" },
                  { value: "firstYear", label: "First year" },
                  { value: "lastYear", label: "Last year" },
                  { value: "topGenre", label: "Top genre" },
                ]}
              />
            </div>

            <div className="query-footer">
              <div className="chip-row inline" aria-label="Active artist filters">
                {artistRequest.searchText.trim() ? (
                  <button
                    className="filter-chip"
                    type="button"
                    onClick={() => setArtistRequest((previous) => ({ ...previous, searchText: "", offset: 0 }))}
                  >
                    <span>Search "{artistRequest.searchText.trim()}"</span>
                    <X size={14} />
                  </button>
                ) : (
                  <span className="chip-empty">No active filters</span>
                )}
              </div>

              <div className="sort-controls">
                <SelectField
                  label="Direction"
                  value={artistRequest.sort.direction}
                  onChange={(direction) =>
                    setArtistRequest((previous) => ({
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
                  value={artistRequest.limit}
                  min={10}
                  max={500}
                  onChange={(value) =>
                    setArtistRequest((previous) => ({ ...previous, limit: value ?? 50, offset: 0 }))
                  }
                />
              </div>
            </div>
          </section>

          <section className="table-panel" aria-label="Artist index">
            <div className="panel-heading compact">
              <div>
                <h2>Artist index</h2>
                <p>
                  {isArtistLoading
                    ? "Loading artists"
                    : `${formatNumber(artistPageStart)}-${formatNumber(artistPageEnd)} of ${formatNumber(artistTotal)}`}
                </p>
              </div>
              <div className="pager">
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Previous artist page"
                  disabled={artistRequest.offset === 0}
                  onClick={() =>
                    setArtistRequest((previous) => ({
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
                  aria-label="Next artist page"
                  disabled={artistRequest.offset + artistRequest.limit >= artistTotal}
                  onClick={() =>
                    setArtistRequest((previous) => ({
                      ...previous,
                      offset: previous.offset + previous.limit,
                    }))
                  }
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>

            {artistError ? <p className="error-message">{artistError}</p> : null}
            <ArtistIndexTable response={artistResponse} selectedArtistId={selectedArtistId} onSelect={selectArtist} />
          </section>

          <section className="table-panel" aria-label="Selected artist albums">
            <div className="panel-heading compact">
              <div>
                <h2>{selectedArtist?.name ?? "Artist albums"}</h2>
                <p>
                  {isArtistAlbumsLoading
                    ? "Loading albums"
                    : `${formatNumber(artistAlbumsResponse?.rows.length ?? 0)} of ${formatNumber(selectedArtistAlbumCount)} albums`}
                </p>
              </div>
              <span className="run-status">{selectedArtist?.topGenre ?? "Artist"}</span>
            </div>

            {artistAlbumsError ? <p className="error-message">{artistAlbumsError}</p> : null}
            <ArtistAlbumTable
              response={artistAlbumsResponse}
              selectedAlbumId={selectedArtistAlbumId}
              onSelect={selectArtistAlbum}
            />

            <div className="artist-album-board-heading">
              <div>
                <h3>Cover view</h3>
                <p>
                  {isArtistAlbumTracksLoading
                    ? "Loading tracks"
                    : `${formatNumber(artistAlbumTracksResponse?.rows.length ?? 0)} of ${formatNumber(selectedArtistAlbumTrackCount)} tracks`}
                </p>
              </div>
              <span className="run-status">{selectedArtistAlbum?.year ?? "Album"}</span>
            </div>

            {artistAlbumTracksError ? <p className="error-message">{artistAlbumTracksError}</p> : null}
            <ArtistAlbumCoverBoard
              response={artistAlbumsResponse}
              selectedAlbumId={selectedArtistAlbumId}
              selectedAlbum={selectedArtistAlbum}
              tracks={artistAlbumTracksResponse}
              isLoading={isArtistAlbumTracksLoading}
              onSelect={selectArtistAlbum}
              onClose={clearSelectedArtistAlbum}
            />
          </section>
        </section>
      ) : activeSection === "Genres" ? (
        <section className="workspace genres-workspace">
          <header className="topbar">
            <div>
              <h1>Genres</h1>
              <p>Canonical-genre index, selected genre album lists, and genre-level summary stats.</p>
            </div>
            <div className="topbar-actions">
              <button className="icon-button" type="button" aria-label="Clear genre filters" onClick={clearGenreQuery}>
                <RotateCcw size={18} />
              </button>
              <button
                className="icon-button"
                type="button"
                aria-label="Refresh genres"
                onClick={() => {
                  void loadData();
                  setGenreRequest((previous) => ({ ...previous }));
                }}
              >
                <Database size={18} />
              </button>
            </div>
          </header>

          <section className="metric-grid" aria-label="Genre summary">
            <Metric label="Canonical genres" value={formatNumber(statistics?.overview.genreCount)} tone="teal" icon={Tags} />
            <Metric label="Matches" value={formatNumber(genreTotal)} tone="amber" icon={Search} />
            <Metric label="Genre albums" value={formatNumber(selectedGenreAlbumCount)} icon={Album} />
            <Metric label="Loved tracks" value={formatNumber(selectedGenre?.lovedTracks)} icon={Heart} />
          </section>

          <section className="query-panel genre-query-panel">
            <div className="search-row genre-search-row">
              <div className="search-input">
                <Search size={18} />
                <input
                  value={genreRequest.searchText}
                  onChange={(event) =>
                    setGenreRequest((previous) => ({ ...previous, searchText: event.target.value, offset: 0 }))
                  }
                  placeholder="Search canonical genres"
                />
              </div>
              <SelectField
                label="Sort"
                value={genreRequest.sort.field}
                onChange={(field) =>
                  setGenreRequest((previous) => ({
                    ...previous,
                    sort: { ...previous.sort, field },
                    offset: 0,
                  }))
                }
                options={[
                  { value: "name", label: "Genre" },
                  { value: "albumCount", label: "Albums" },
                  { value: "trackCount", label: "Tracks" },
                  { value: "lovedTracks", label: "Loved tracks" },
                  { value: "averageCompleteness", label: "Completeness" },
                  { value: "averageRating", label: "Average rating" },
                  { value: "averageScore", label: "Average score" },
                  { value: "firstYear", label: "First year" },
                  { value: "lastYear", label: "Last year" },
                  { value: "topArtist", label: "Top artist" },
                ]}
              />
            </div>

            <div className="query-footer">
              <div className="chip-row inline" aria-label="Active genre filters">
                {genreRequest.searchText.trim() ? (
                  <button
                    className="filter-chip"
                    type="button"
                    onClick={() => setGenreRequest((previous) => ({ ...previous, searchText: "", offset: 0 }))}
                  >
                    <span>Search "{genreRequest.searchText.trim()}"</span>
                    <X size={14} />
                  </button>
                ) : (
                  <span className="chip-empty">No active filters</span>
                )}
              </div>

              <div className="sort-controls">
                <SelectField
                  label="Direction"
                  value={genreRequest.sort.direction}
                  onChange={(direction) =>
                    setGenreRequest((previous) => ({
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
                  value={genreRequest.limit}
                  min={10}
                  max={500}
                  onChange={(value) =>
                    setGenreRequest((previous) => ({ ...previous, limit: value ?? 50, offset: 0 }))
                  }
                />
              </div>
            </div>
          </section>

          <section className="table-panel" aria-label="Genre index">
            <div className="panel-heading compact">
              <div>
                <h2>Genre index</h2>
                <p>
                  {isGenreLoading
                    ? "Loading genres"
                    : `${formatNumber(genrePageStart)}-${formatNumber(genrePageEnd)} of ${formatNumber(genreTotal)}`}
                </p>
              </div>
              <div className="pager">
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Previous genre page"
                  disabled={genreRequest.offset === 0}
                  onClick={() =>
                    setGenreRequest((previous) => ({
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
                  aria-label="Next genre page"
                  disabled={genreRequest.offset + genreRequest.limit >= genreTotal}
                  onClick={() =>
                    setGenreRequest((previous) => ({
                      ...previous,
                      offset: previous.offset + previous.limit,
                    }))
                  }
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>

            {genreError ? <p className="error-message">{genreError}</p> : null}
            <GenreIndexTable response={genreResponse} selectedGenreId={selectedGenreId} onSelect={selectGenre} />
          </section>

          <section className="table-panel" aria-label="Selected genre albums">
            <div className="panel-heading compact">
              <div>
                <h2>{selectedGenre?.name ?? "Genre albums"}</h2>
                <p>
                  {isGenreAlbumsLoading
                    ? "Loading albums"
                    : `${formatNumber(genreAlbumsResponse?.rows.length ?? 0)} of ${formatNumber(selectedGenreAlbumCount)} albums`}
                </p>
              </div>
              <span className="run-status">{selectedGenre?.topArtist ?? "Genre"}</span>
            </div>

            {genreAlbumsError ? <p className="error-message">{genreAlbumsError}</p> : null}
            <GenreAlbumTable response={genreAlbumsResponse} />
          </section>
        </section>
      ) : activeSection === "Tools" ? (
        <section className="workspace tools-workspace">
          <header className="topbar">
            <div>
              <h1>Tools</h1>
              <p>Validation issue lists for library cleanup checks.</p>
            </div>
            <div className="topbar-actions">
              <button className="icon-button" type="button" aria-label="Clear tool filters" onClick={clearToolQuery}>
                <RotateCcw size={18} />
              </button>
              <button
                className="icon-button"
                type="button"
                aria-label="Refresh tools"
                onClick={() => void refreshMusicTools()}
              >
                <Database size={18} />
              </button>
            </div>
          </header>

          <section className="metric-grid" aria-label="Tools summary">
            <Metric label="Validators" value={formatNumber(musicTools.length)} tone="teal" icon={Wrench} />
            <Metric label="Issue rows" value={formatToolCount(totalToolIssues)} tone="amber" icon={FileSearch} />
            <Metric label="Selected" value={selectedToolIssueValue} icon={ListMusic} />
            <Metric label="Severity" value={severityLabel(selectedTool?.severity) || "Select"} icon={ShieldCheck} />
          </section>

          <section className="query-panel tool-query-panel">
            <div className="search-row tool-search-row">
              <div className="search-input">
                <Search size={18} />
                <input
                  value={toolIssueRequest.searchText}
                  onChange={(event) =>
                    setToolIssueRequest((previous) =>
                      renewMusicToolIssueRequest(previous, {
                        searchText: event.target.value,
                        offset: 0,
                      }),
                    )
                  }
                  placeholder="Filter affected albums, tracks, files, and issue values"
                />
              </div>
              <SelectField
                label="Sort"
                value={toolIssueRequest.sort.field}
                onChange={(field) =>
                  setToolIssueRequest((previous) =>
                    renewMusicToolIssueRequest(previous, {
                      sort: { ...previous.sort, field },
                      offset: 0,
                    }),
                  )
                }
                options={[
                  { value: "album", label: "Album" },
                  { value: "artist", label: "Artist" },
                  { value: "year", label: "Year" },
                  { value: "title", label: "Track" },
                  { value: "detail", label: "Issue" },
                  { value: "value", label: "Value" },
                  { value: "filename", label: "Filename" },
                  { value: "severity", label: "Severity" },
                ]}
              />
            </div>

            <div className="query-footer">
              <div className="chip-row inline" aria-label="Active tool filters">
                {toolIssueRequest.searchText.trim() ? (
                  <button
                    className="filter-chip"
                    type="button"
                    onClick={() =>
                      setToolIssueRequest((previous) =>
                        renewMusicToolIssueRequest(previous, {
                          searchText: "",
                          offset: 0,
                        }),
                      )
                    }
                  >
                    <span>Filter "{toolIssueRequest.searchText.trim()}"</span>
                    <X size={14} />
                  </button>
                ) : (
                  <span className="chip-empty">No active filters</span>
                )}
              </div>

              <div className="sort-controls">
                <SelectField
                  label="Direction"
                  value={toolIssueRequest.sort.direction}
                  onChange={(direction) =>
                    setToolIssueRequest((previous) =>
                      renewMusicToolIssueRequest(previous, {
                        sort: { ...previous.sort, direction: direction as "asc" | "desc" },
                        offset: 0,
                      }),
                    )
                  }
                  options={[
                    { value: "asc", label: "Ascending" },
                    { value: "desc", label: "Descending" },
                  ]}
                />
                <NumberField
                  label="Rows"
                  value={toolIssueRequest.limit}
                  min={10}
                  max={500}
                  onChange={(value) =>
                    setToolIssueRequest((previous) =>
                      renewMusicToolIssueRequest(previous, { limit: value ?? 50, offset: 0 }),
                    )
                  }
                />
              </div>
            </div>
          </section>

          <section className="table-panel" aria-label="Validation tool index">
            <div className="panel-heading compact">
              <div>
                <h2>Validation suite</h2>
                <p>{isToolsLoading ? "Loading tools" : `${formatNumber(musicTools.length)} tools`}</p>
              </div>
              <span className="run-status">
                {totalToolIssues == null ? "Counts on select" : `${formatNumber(totalToolIssues)} issues`}
              </span>
            </div>

            {toolsError ? <p className="error-message">{toolsError}</p> : null}
            <MusicToolIndexTable
              tools={musicTools}
              selectedToolId={selectedToolId}
              progress={activeToolProgress}
              onSelect={selectMusicTool}
            />
          </section>

          <section className="table-panel" aria-label="Validation issues">
            <div className="panel-heading compact">
              <div>
                <h2>{selectedTool?.label ?? "Issue list"}</h2>
                <p>{toolIssuePanelCaption}</p>
              </div>
              <div className="panel-actions">
                <MusicToolExportControls
                  tool={selectedTool}
                  isPending={isToolRunPending}
                  exportResult={toolExportResult}
                  onExport={runToolExport}
                />
                <div className="pager">
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="Previous issue page"
                    disabled={toolIssueRequest.offset === 0}
                    onClick={() =>
                      setToolIssueRequest((previous) =>
                        renewMusicToolIssueRequest(previous, {
                          offset: Math.max(0, previous.offset - previous.limit),
                        }),
                      )
                    }
                  >
                    <ChevronLeft size={17} />
                  </button>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label="Next issue page"
                    disabled={toolIssueRequest.offset + toolIssueRequest.limit >= toolIssueTotal}
                    onClick={() =>
                      setToolIssueRequest((previous) =>
                        renewMusicToolIssueRequest(previous, {
                          offset: previous.offset + previous.limit,
                        }),
                      )
                    }
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
              </div>
            </div>

            {toolIssueError ? <p className="error-message">{toolIssueError}</p> : null}
            <MusicToolIssueTable
              response={isToolProgressActive ? null : currentToolIssueResponse}
              progress={activeToolProgress}
            />
          </section>
        </section>
      ) : activeSection === "Albums" ? (
        <section className="workspace albums-workspace">
          <header className="topbar">
            <div>
              <h1>Albums</h1>
              <p>Dedicated album index, drill-down calculations, ordered tracks, and album export.</p>
            </div>
            <div className="topbar-actions">
              <button className="icon-button" type="button" aria-label="Clear album filters" onClick={clearAlbumQuery}>
                <RotateCcw size={18} />
              </button>
              <button className="icon-button" type="button" aria-label="Refresh albums" onClick={() => void loadData()}>
                <Database size={18} />
              </button>
            </div>
          </header>

          <section className="metric-grid" aria-label="Album summary">
            <Metric label="Library albums" value={formatNumber(status?.albumCount)} tone="teal" icon={Album} />
            <Metric label="Matches" value={formatNumber(albumTotal)} tone="amber" icon={Search} />
            <Metric label="Tracks" value={formatNumber(selectedAlbumTrackCount)} icon={ListMusic} />
            <Metric
              label="Complete"
              value={selectedAlbum ? formatPercent(selectedAlbum.ratingCompleteness) : "Select"}
              icon={Gauge}
            />
          </section>

          <section className="query-panel album-query-panel">
            <div className="search-row album-search-row">
              <div className="search-input">
                <Search size={18} />
                <input
                  value={albumRequest.searchText}
                  onChange={(event) =>
                    setAlbumRequest((previous) => ({ ...previous, searchText: event.target.value, offset: 0 }))
                  }
                  placeholder="Search albums, artists, genres, publishers"
                />
              </div>
              <SelectField
                label="Sort"
                value={albumRequest.sort.field}
                onChange={(field) =>
                  setAlbumRequest((previous) => ({
                    ...previous,
                    sort: { ...previous.sort, field },
                    offset: 0,
                  }))
                }
                options={[
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
                ]}
              />
            </div>

            <div className="filter-grid">
              <TextCriterion
                label="Album title"
                filter={albumFilters.albumTitle}
                onChange={(filter) => updateAlbumFilter("albumTitle", filter)}
              />
              <TextCriterion
                label="Album artist"
                filter={albumFilters.albumArtist}
                onChange={(filter) => updateAlbumFilter("albumArtist", filter)}
              />
              <TextCriterion
                label="Publisher"
                filter={albumFilters.publisher}
                onChange={(filter) => updateAlbumFilter("publisher", filter)}
              />
              <GenreListCriterion
                label="Genres"
                values={albumFilters.genres}
                onChange={(genres) => updateAlbumFilter("genres", genres)}
                genreOptions={genreSuggestionOptions}
                onRequestOptions={requestGenreSuggestionRefresh}
                placeholder="Synthpop, AOR"
              />
              <GenreListCriterion
                label="Exclude genres"
                values={albumFilters.excludedGenres}
                onChange={(excludedGenres) => updateAlbumFilter("excludedGenres", excludedGenres)}
                genreOptions={genreSuggestionOptions}
                onRequestOptions={requestGenreSuggestionRefresh}
              />
              <NumberField
                label="Year from"
                value={albumFilters.yearFrom}
                onChange={(value) => updateAlbumFilter("yearFrom", value)}
              />
              <NumberField
                label="Year to"
                value={albumFilters.yearTo}
                onChange={(value) => updateAlbumFilter("yearTo", value)}
              />
              <NumberField
                label="Billboard min"
                value={albumFilters.billboardRankMin}
                min={1}
                onChange={(value) => updateAlbumFilter("billboardRankMin", value)}
              />
              <NumberField
                label="Billboard max"
                value={albumFilters.billboardRankMax}
                min={1}
                onChange={(value) => updateAlbumFilter("billboardRankMax", value)}
              />
              <NumberField
                label="Minutes min"
                value={albumFilters.totalMinutesMin}
                step={0.5}
                onChange={(value) => updateAlbumFilter("totalMinutesMin", value)}
              />
              <NumberField
                label="Minutes max"
                value={albumFilters.totalMinutesMax}
                step={0.5}
                onChange={(value) => updateAlbumFilter("totalMinutesMax", value)}
              />
              <NumberField
                label="Tracks min"
                value={albumFilters.trackCountMin}
                onChange={(value) => updateAlbumFilter("trackCountMin", value)}
              />
              <NumberField
                label="Album rating min"
                value={albumFilters.albumRatingMin}
                min={0}
                max={100}
                onChange={(value) => updateAlbumFilter("albumRatingMin", value)}
              />
              <CompletenessRangeCriterion
                minValue={albumFilters.ratingCompletenessMin}
                maxValue={albumFilters.ratingCompletenessMax}
                onChange={(range) => updateAlbumFilters(toCompletenessFilterRange(range.min, range.max))}
              />
            </div>

            <div className="query-footer">
              <div className="chip-row inline" aria-label="Active album filters">
                {albumChips.length === 0 ? (
                  <span className="chip-empty">No active filters</span>
                ) : (
                  albumChips.map((chip) => (
                    <button className="filter-chip" type="button" key={chip.key} onClick={chip.remove}>
                      <span>{chip.label}</span>
                      <X size={14} />
                    </button>
                  ))
                )}
              </div>

              <div className="sort-controls">
                <SelectField
                  label="Direction"
                  value={albumRequest.sort.direction}
                  onChange={(direction) =>
                    setAlbumRequest((previous) => ({
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
                  value={albumRequest.limit}
                  min={10}
                  max={500}
                  onChange={(value) =>
                    setAlbumRequest((previous) => ({ ...previous, limit: value ?? 25, offset: 0 }))
                  }
                />
              </div>
            </div>
          </section>

          <section className="table-panel" aria-label="Album index">
            <div className="panel-heading compact">
              <div>
                <h2>Album index</h2>
                <p>
                  {isAlbumLoading
                    ? "Loading albums"
                    : `${formatNumber(albumPageStart)}-${formatNumber(albumPageEnd)} of ${formatNumber(albumTotal)}`}
                </p>
              </div>
              <div className="pager">
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Previous album page"
                  disabled={albumRequest.offset === 0}
                  onClick={() =>
                    setAlbumRequest((previous) => ({
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
                  aria-label="Next album page"
                  disabled={albumRequest.offset + albumRequest.limit >= albumTotal}
                  onClick={() =>
                    setAlbumRequest((previous) => ({
                      ...previous,
                      offset: previous.offset + previous.limit,
                    }))
                  }
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>

            {albumError ? <p className="error-message">{albumError}</p> : null}
            <AlbumIndexTable
              response={albumResponse}
              selectedAlbumId={selectedAlbumId}
              sort={albumRequest.sort}
              onSort={sortAlbumsBy}
              onSelect={selectAlbum}
            />
          </section>

          <section className="table-panel" aria-label="Selected album tracks">
            <div className="panel-heading compact">
              <div>
                <h2>{selectedAlbum?.album ?? "Track list"}</h2>
                <p>
                  {isAlbumTracksLoading
                    ? "Loading tracks"
                    : `${formatNumber(albumTracksResponse?.rows.length ?? 0)} of ${formatNumber(selectedAlbumTrackCount)} tracks`}
                </p>
              </div>
              <span className="run-status">{selectedAlbum?.year ?? "Album"}</span>
            </div>

            {albumTracksError ? <p className="error-message">{albumTracksError}</p> : null}
            <AlbumTrackTable response={albumTracksResponse} isLoading={isAlbumTracksLoading} />
          </section>
        </section>
      ) : activeSection === "Statistics" ? (
        <section className="workspace statistics-workspace">
          <header className="topbar">
            <div>
              <h1>Statistics</h1>
              <p>Library health, rating progress, metadata coverage, time shape, duration, and outlier signals.</p>
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
            <section className="stats-panel health-panel">
              <div className="panel-heading compact">
                <div>
                  <h2>Library health score</h2>
                  <p>{statistics ? "Ratings, metadata, covers, and score coverage" : "Waiting for library data"}</p>
                </div>
                <ShieldCheck size={18} />
              </div>
              <LibraryHealthScorePanel statistics={statistics} />
            </section>

            <section className="stats-panel">
              <div className="panel-heading compact">
                <div>
                  <h2>Rating completion burndown</h2>
                  <p>Unrated tracks remaining across rating snapshots.</p>
                </div>
                <Activity size={18} />
              </div>
              <RatingCompletionBurndown statistics={statistics} />
            </section>

            <section className="stats-panel wide">
              <div className="panel-heading compact">
                <div>
                  <h2>Decade progress timeline</h2>
                  <p>Rated, partial, and open albums by release decade.</p>
                </div>
                <Clock3 size={18} />
              </div>
              <DecadeProgressTimeline rows={statistics?.decadeProgress ?? []} />
            </section>

            <section className="stats-panel wide">
              <div className="panel-heading compact">
                <div>
                  <h2>Genre portfolio matrix</h2>
                  <p>Catalog size, completion, and average Album Score by genre.</p>
                </div>
                <Tags size={18} />
              </div>
              <GenrePortfolioMatrix rows={statistics?.genreProgress ?? []} />
            </section>

            <section className="stats-panel wide">
              <div className="panel-heading compact">
                <div>
                  <h2>Metadata coverage</h2>
                  <p>Core album, track, artwork, and rating fields.</p>
                </div>
                <ShieldCheck size={18} />
              </div>
              <MetadataCoveragePanel metrics={statistics?.metadataCoverage ?? []} />
            </section>

            <section className="stats-panel wide">
              <div className="panel-heading compact">
                <div>
                  <h2>Import delta timeline</h2>
                  <p>Added, changed, removed, and rating-event movement by import.</p>
                </div>
                <FolderInput size={18} />
              </div>
              <ImportDeltaTimeline runs={statistics?.importHistory ?? []} />
            </section>

            <section className="stats-panel wide">
              <div className="panel-heading compact">
                <div>
                  <h2>Library shape by time</h2>
                  <p>Albums, tracks, duration, and release-year center of gravity.</p>
                </div>
                <Clock3 size={18} />
              </div>
              <LibraryShapeByTime statistics={statistics} />
            </section>

            <section className="stats-panel wide">
              <div className="panel-heading compact">
                <div>
                  <h2>Loved density</h2>
                  <p>Loved tracks per 100 tracks by genre, decade, and rating bucket.</p>
                </div>
                <Heart size={18} />
              </div>
              <LovedDensityPanel rows={statistics?.lovedDensity ?? []} />
            </section>

            <section className="stats-panel wide">
              <div className="panel-heading compact">
                <div>
                  <h2>Catalog concentration</h2>
                  <p>Top artist and genre slices as a share of the album library.</p>
                </div>
                <UsersRound size={18} />
              </div>
              <CatalogConcentrationPanel statistics={statistics} />
            </section>

            <section className="stats-panel wide">
              <div className="panel-heading compact">
                <div>
                  <h2>Duration analytics</h2>
                  <p>Listening time, album length extremes, and tracks-per-album shape.</p>
                </div>
                <Clock3 size={18} />
              </div>
              <DurationAnalyticsPanel statistics={statistics} />
            </section>

            <section className="stats-panel wide">
              <div className="panel-heading compact">
                <div>
                  <h2>Outlier stats</h2>
                  <p>Aggregate oddities worth knowing without leaving Statistics.</p>
                </div>
                <Sparkles size={18} />
              </div>
              <OutlierStatsPanel rows={statistics?.outlierStats ?? []} />
            </section>

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
              <p>Backup retention, appearance, and workspace layout.</p>
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
            <Metric label="Navigation" value={leftSidebarModeLabels[settings.leftSidebarDefault]} icon={Library} />
            <Metric label="Details" value={rightSidebarModeLabels[settings.rightSidebarDefault]} icon={SlidersHorizontal} />
          </section>

          {settingsError ? <p className="error-message">{settingsError}</p> : null}

          <section className="settings-grid" aria-label="Application settings">
            <section className="settings-panel backup-settings-panel">
              <div className="panel-heading compact">
                <div>
                  <h2>Backups</h2>
                  <p>
                    {formatNumber(databaseBackups.length)} available / {settings.backupRetention} retained
                  </p>
                </div>
                <Database size={18} />
              </div>

              <div className="backup-settings-toolbar">
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
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Refresh backups"
                  onClick={() => void loadData()}
                >
                  <RotateCcw size={18} />
                </button>
              </div>

              {backupError ? <p className="error-message">{backupError}</p> : null}
              {restoreSummary ? (
                <div className="export-result restore-result">
                  <Check size={17} />
                  <span>
                    Restored {formatNumber(restoreSummary.trackCount)} tracks /{" "}
                    {formatNumber(restoreSummary.albumCount)} albums. Safety copy:{" "}
                    {restoreSummary.preRestoreBackupPath ?? "not needed"}
                  </span>
                </div>
              ) : null}

              {!canImport ? (
                <div className="empty-state">
                  <Database size={20} />
                  <span>Desktop runtime required.</span>
                </div>
              ) : databaseBackups.length === 0 ? (
                <div className="empty-state">
                  <Database size={20} />
                  <span>No backups found.</span>
                </div>
              ) : (
                <div className="database-backup-list">
                  {databaseBackups.map((backup) => (
                    <article className="database-backup-card" key={backup.backupPath}>
                      <div>
                        <strong>{formatDate(backup.createdAt)}</strong>
                        <span>{backup.operation}</span>
                      </div>
                      <dl>
                        <div>
                          <dt>Rows</dt>
                          <dd>{backup.trackRows == null ? "Unknown" : formatNumber(backup.trackRows)}</dd>
                        </div>
                        <div>
                          <dt>Albums</dt>
                          <dd>{backup.albumCount == null ? "Unknown" : formatNumber(backup.albumCount)}</dd>
                        </div>
                        <div>
                          <dt>Schema</dt>
                          <dd>{backup.schemaVersion == null ? "Unknown" : backup.schemaVersion}</dd>
                        </div>
                        <div>
                          <dt>Size</dt>
                          <dd>{formatBytes(backup.fileSizeBytes)}</dd>
                        </div>
                      </dl>
                      <small>{backup.backupPath}</small>
                      <button
                        className="primary-button"
                        type="button"
                        disabled={!backup.canRestore || isRestoringBackup}
                        onClick={() => void restoreBackup(backup)}
                      >
                        <Database size={16} />
                        <span>{isRestoringBackup ? "Restoring" : backup.canRestore ? "Restore" : "Unavailable"}</span>
                      </button>
                    </article>
                  ))}
                </div>
              )}
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

            <section className="settings-panel layout-settings-panel">
              <div className="panel-heading compact">
                <div>
                  <h2>Layout</h2>
                  <p>{isSavingSettings ? "Saving preferences" : "Preferences saved"}</p>
                </div>
                <SlidersHorizontal size={18} />
              </div>

              <div className="layout-setting-stack">
                <div className="layout-setting">
                  <span>Left sidebar default</span>
                  <div className="segmented-control layout-mode-control left-layout-mode-control" role="group" aria-label="Left sidebar default">
                    {leftSidebarModeOptions.map((option) => (
                      <button
                        className={settings.leftSidebarDefault === option.value ? "active" : ""}
                        type="button"
                        key={option.value}
                        onClick={() => saveLeftSidebarDefault(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="layout-setting">
                  <span>Right sidebar default</span>
                  <div className="segmented-control layout-mode-control right-layout-mode-control" role="group" aria-label="Right sidebar default">
                    {rightSidebarModeOptions.map((option) => (
                      <button
                        className={settings.rightSidebarDefault === option.value ? "active" : ""}
                        type="button"
                        key={option.value}
                        onClick={() => saveRightSidebarDefault(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
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

              <GenreListCriterion
                label="Genres"
                values={currentFilters.genres}
                onChange={(genres) => updateFilter("genres", genres)}
                genreOptions={genreSuggestionOptions}
                onRequestOptions={requestGenreSuggestionRefresh}
                placeholder="Synthpop, AOR"
              />
              <GenreListCriterion
                label="Exclude genres"
                values={currentFilters.excludedGenres}
                onChange={(excludedGenres) => updateFilter("excludedGenres", excludedGenres)}
                genreOptions={genreSuggestionOptions}
                onRequestOptions={requestGenreSuggestionRefresh}
              />
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
                label={request.view === "tracks" ? "Album Billboard min" : "Billboard min"}
                value={currentFilters.billboardRankMin}
                min={1}
                onChange={(value) => updateFilter("billboardRankMin", value)}
              />
              <NumberField
                label={request.view === "tracks" ? "Album Billboard max" : "Billboard max"}
                value={currentFilters.billboardRankMax}
                min={1}
                onChange={(value) => updateFilter("billboardRankMax", value)}
              />
              {request.view === "tracks" ? (
                <>
                  <NumberField
                    label="Single Billboard min"
                    value={currentFilters.billboardSingleRankMin}
                    min={1}
                    onChange={(value) => updateFilter("billboardSingleRankMin", value)}
                  />
                  <NumberField
                    label="Single Billboard max"
                    value={currentFilters.billboardSingleRankMax}
                    min={1}
                    onChange={(value) => updateFilter("billboardSingleRankMax", value)}
                  />
                </>
              ) : null}
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
                label="Tracks rated min"
                value={currentFilters.ratedTracksMin}
                min={0}
                onChange={(value) => updateFilter("ratedTracksMin", value)}
              />
              <NumberField
                label="Tracks rated max"
                value={currentFilters.ratedTracksMax}
                min={0}
                onChange={(value) => updateFilter("ratedTracksMax", value)}
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

              <CompletenessRangeCriterion
                minValue={currentFilters.ratingCompletenessMin}
                maxValue={currentFilters.ratingCompletenessMax}
                onChange={(range) => updateFilters(toCompletenessFilterRange(range.min, range.max))}
              />
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
                <span className="missing-flags-title">Missing fields</span>
                {missingFieldOptions.filter((option) => request.view === "tracks" || option.value !== "billboardSingle").map((option) => {
                  const checked = currentFilters.missingFields.includes(option.value);
                  const label = missingFieldLabel(option.value, request.view);
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
                      <span>{label}</span>
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
                          { value: "billboardRank", label: "Album Billboard" },
                          { value: "billboardSingleRank", label: "Single Billboard" },
                          { value: "trackRating", label: "Track rating" },
                          { value: "trackNumber", label: "Track number" },
                        ]
                      : [
                          { value: "album", label: "Album" },
                          { value: "artist", label: "Artist" },
                          { value: "year", label: "Year" },
                          { value: "billboardRank", label: "Billboard" },
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
            <ResultTable response={response} sort={request.sort} onSort={sortSearchBy} />
          </section>
        </section>
      )}

      <section className="detail-column" aria-hidden={isRightSidebarHidden}>
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
      ) : activeSection === "Discovery" ? (
        <aside className="detail-panel discovery-detail" aria-label="Discovery details">
          <div className="detail-header">
            <Compass size={20} />
            <div>
              <h2>Discovery Map</h2>
              <p>{discovery?.generatedAt ? formatDate(discovery.generatedAt) : "Waiting for library data"}</p>
            </div>
          </div>

          <dl className="run-details">
            <div>
              <dt>Backlog missions</dt>
              <dd>{formatNumber(discovery?.backlogMissions.length)}</dd>
            </div>
            <div>
              <dt>Smart missions</dt>
              <dd>{formatNumber(discovery?.smartMissions.length)}</dd>
            </div>
            <div>
              <dt>Current result</dt>
              <dd>{formatNumber(discoveryAlbumTotal)}</dd>
            </div>
            <div>
              <dt>Selection</dt>
              <dd>{discoverySelection?.title ?? "None yet"}</dd>
            </div>
          </dl>

          <section className="calculation-list discovery-signals">
            <div>
              <Gauge size={17} />
              <span>Heatmap cells open matching genre/year albums</span>
            </div>
            <div>
              <Heart size={17} />
              <span>Scatter points open individual outlier albums</span>
            </div>
            <div>
              <Tags size={17} />
              <span>Genre bubbles open full genre album sets</span>
            </div>
            <div>
              <UsersRound size={17} />
              <span>Artist bubbles open catalog deep dives</span>
            </div>
          </section>
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
                      setChartConfig(normalizeChartConfigForClient(chart.config));
                      setChartTableSort(null);
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
      ) : activeSection === "Artists" ? (
        <ArtistDetailPanel
          artist={selectedArtist}
          includeCalculated={artistIncludeCalculated}
          onIncludeCalculatedChange={(value) => setArtistIncludeCalculated(value)}
          exportResult={artistExportResult}
          onExport={runArtistExport}
        />
      ) : activeSection === "Genres" ? (
        <GenreDetailPanel
          genre={selectedGenre}
          includeCalculated={genreIncludeCalculated}
          onIncludeCalculatedChange={(value) => setGenreIncludeCalculated(value)}
          exportResult={genreExportResult}
          onExport={runGenreExport}
        />
      ) : activeSection === "Tools" ? (
        <MusicToolDetailPanel
          tool={selectedTool}
          progress={activeToolProgress}
          exportResult={toolExportResult}
          onExport={runToolExport}
        />
      ) : activeSection === "Albums" ? (
        <AlbumDetailPanel
          album={selectedAlbum}
          tracks={albumTracksResponse}
          isLoading={isAlbumTracksLoading}
          includeCalculated={albumIncludeCalculated}
          onIncludeCalculatedChange={(value) => setAlbumIncludeCalculated(value)}
          exportResult={albumExportResult}
          onExport={runAlbumExport}
        />
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
              <dt>Health score</dt>
              <dd>{statistics ? `${Math.round(statistics.healthScore.score)}/100` : ""}</dd>
            </div>
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
            <div>
              <dt>Median release year</dt>
              <dd>{statistics?.libraryShape.medianYear ?? "Not yet"}</dd>
            </div>
            <div>
              <dt>Top artist share</dt>
              <dd>{formatPercent(statistics?.catalogConcentration.artistPoints[0]?.share, 1)}</dd>
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
            <div>
              <ShieldCheck size={17} />
              <span>{formatPercent(statistics?.healthScore.metadataCoverage, 0)} metadata coverage</span>
            </div>
            <div>
              <Clock3 size={17} />
              <span>{formatHours(statistics?.durationAnalytics.averageAlbumSeconds)} average album</span>
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
              <dt>Navigation</dt>
              <dd>{leftSidebarModeLabels[settings.leftSidebarDefault]}</dd>
            </div>
            <div>
              <dt>Details</dt>
              <dd>{rightSidebarModeLabels[settings.rightSidebarDefault]}</dd>
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
      </section>
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
  suffix = "",
) {
  if (minimum == null && maximum == null) return;
  const formatValue = (value: number) => `${value}${suffix}`;
  const text =
    minimum != null && maximum != null
      ? `${label} ${formatValue(minimum)}-${formatValue(maximum)}`
      : minimum != null
        ? `${label} >= ${formatValue(minimum)}`
        : `${label} <= ${formatValue(maximum ?? 0)}`;
  chips.push({ key, label: text, remove });
}
