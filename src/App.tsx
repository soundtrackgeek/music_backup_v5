import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  CSSProperties,
  FormEvent,
  KeyboardEvent,
  MouseEvent,
  PointerEvent,
  ReactNode,
} from "react";
import {
  Activity,
  Album,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Ban,
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CloudDownload,
  Compass,
  Database,
  Download,
  ExternalLink,
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
  Unlink,
  UsersRound,
  Wrench,
  X,
} from "lucide-react";
import {
  addWishListItem,
  deleteSavedChart,
  deleteSavedSearch,
  clearCoverImageCache,
  defaultBillboardSinglesSourcePath,
  defaultBillboardSourcePath,
  defaultCoverSourcePath,
  defaultImportSourcePath,
  defaultMusicBrainzCachePath,
  defaultMusicBrainzOverlaySyncPath,
  exportMusicBrainzArtistReleases,
  exportSearch,
  fixMusicToolIssues,
  cacheSettings,
  getAlbumCoverDataUrl,
  getDiscovery,
  getGenreProgress,
  getMusicBrainzArtistDiscography,
  getMusicBrainzArtistInfoStatus,
  getMusicBrainzCacheStatus,
  getMusicBrainzOriginCountryStatus,
  getSettings,
  getStatistics,
  getYearProgress,
  getLibraryStatus,
  importAlbumCovers,
  importBillboardCharts,
  importBillboardSingles,
  applyImportPreview,
  cancelImportPreview,
  getImportPreview,
  importMusicBrainzArtistInfos,
  importMusicBrainzOriginCountries,
  isTauriRuntime,
  listDatabaseBackups,
  listArtists,
  listGenres,
  listGenreSuggestions,
  listMusicToolIssues,
  listMusicToolFixHistory,
  listMusicTools,
  listImportRuns,
  listMusicBrainzOverlaySyncLog,
  listWishList,
  listSavedCharts,
  listSavedSearches,
  loadCachedSettings,
  listenToCoverImportProgress,
  listenToImportProgress,
  listenToMusicBrainzArtistInfoImportProgress,
  listenToMusicBrainzOriginCountryImportProgress,
  listenToMusicToolProgress,
  openExternalUrl,
  saveChart,
  saveSearch,
  saveSettings,
  previewMusicBrainzArtistInfoImport,
  previewMusicBrainzOriginCountryImport,
  prepareImportPreview,
  refreshMusicBrainzArtistInfo,
  setMusicBrainzArtistLink,
  setMusicBrainzArtistOriginCountry,
  setMusicBrainzReleaseDecision,
  syncMusicBrainzOverlay,
  cancelMusicBrainzArtistInfoImport,
  cancelMusicBrainzOriginCountryImport,
  searchLibrary,
  exportMusicToolIssues,
  restoreDatabaseBackup,
  rollbackImportRun,
  runPerformanceProbe,
  undoMusicToolFix,
} from "./backend";
import type {
  AppSettings,
  AiMusicResearchContext,
  AiSnapshot,
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
  CountryFlagDisplay,
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
  SavedExternalDiscovery,
  SavedPlaylist,
  ExportResult,
  GenreListRequest,
  GenreListResponse,
  GenreSummary,
  DurationAlbumStat,
  ImportPreview,
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
  MusicToolFixSummary,
  MusicToolFixHistoryEntry,
  MusicBrainzArtistExportRequest,
  MusicBrainzArtistOriginCountryUpdate,
  MusicBrainzArtistRefreshResult,
  MusicToolIssueRequest,
  MusicToolIssueResponse,
  MusicToolIssueRow,
  MusicToolProgress,
  MusicToolScope,
  MusicToolSummary,
  MusicBrainzArtistCandidateRow,
  MusicBrainzArtistDiscographyResponse,
  MusicBrainzArtistInfoImportProgress,
  MusicBrainzArtistInfoImportSummary,
  MusicBrainzArtistInfoPreview,
  MusicBrainzArtistInfoPreviewRow,
  MusicBrainzArtistInfoStatus,
  MusicBrainzArtistReleaseRow,
  MusicBrainzCacheStatus,
  MusicBrainzOriginCountryOption,
  MusicBrainzOriginCountryImportProgress,
  MusicBrainzOriginCountryImportSummary,
  MusicBrainzOriginCountryPreview,
  MusicBrainzOriginCountryPreviewRow,
  MusicBrainzOriginCountryStatus,
  MusicBrainzOverlaySyncLogEntry,
  MusicBrainzOverlaySyncResult,
  PerformanceProbeResponse,
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
  artistGenderOptions,
  artistTypeOptions,
  chartColumnOptions,
  chartGridCoverSize,
  chartViewModes,
  completenessRange,
  countryFlagDisplayLabels,
  countryFlagDisplayOptions,
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
  searchExportColumnOptions,
  searchTableColumnOptions,
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
  formatOriginCountry,
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
import {
  completionHeatmapDecades,
  completionHeatmapGenreLimits,
  completionHeatmapYearExtent,
  selectCompletionHeatmap,
  type CompletionHeatmapGenreLimit,
} from "./app/completionHeatmap";
import {
  fullyRatedGenreRatio,
  genreProgressLimits,
  selectGenreProgressRows,
  type GenreProgressLimit,
  type GenreProgressSort,
} from "./app/genreProgress";
import {
  fullyRatedAlbumRatio,
  selectYearProgressRows,
  yearProgressExtent,
} from "./app/yearProgress";
import { clampBackupRetention, numberValue } from "./app/input";
import { useWorkspaceNavigation } from "./app/navigation";
import {
  useAdaptiveDetailsLayout,
  workspaceHasUsefulDetails,
} from "./app/adaptiveDetails";
import { countAdvancedChartControls } from "./app/chartProgressive";
import { countAdvancedSearchFilters } from "./app/searchProgressive";
import {
  formatMusicBrainzReviewState,
  MusicBrainzReviewState,
} from "./components/MusicBrainzReviewState";
import { AiSettingsPanel } from "./components/AiSettingsPanel";
import { CurrentViewQuestionPanel } from "./components/CurrentViewQuestionPanel";
import { ExportResultStatus } from "./components/ExportResultStatus";
import { LibraryAnalystPanel } from "./components/LibraryAnalystPanel";
import {
  LunaPanel,
  type LunaHistorySelection,
  type LunaMode,
} from "./components/LunaPanel";
import { NaturalLanguageQueryPanel } from "./components/NaturalLanguageQueryPanel";
import { MusicResearchPanel } from "./components/MusicResearchPanel";
import { OutsideLibraryDiscovery } from "./components/OutsideLibraryDiscovery";
import { GenreTimeline } from "./components/GenreTimeline";
import { ImportSafetyPanel } from "./components/ImportSafetyPanel";
import { InsightActionDock } from "./components/InsightActionDock";
import {
  ChartAdvancedControls,
  ChartLunaCommandArea,
  SearchAdvancedFilters,
  SearchLunaCommandArea,
} from "./components/SearchProgressiveDisclosure";
import {
  ArtistDetailTabs,
  artistDetailTabNeedsMusicBrainz,
  artistDetailTabNeedsTracks,
  ArtistsWorkspace,
  type ArtistDetailTab,
} from "./workspaces/ArtistsWorkspace";
import { SearchWorkspace } from "./workspaces/SearchWorkspace";
import {
  SettingsSection,
  SettingsWorkspace,
} from "./workspaces/SettingsWorkspace";
import { PlaylistBuilderWorkspace } from "./workspaces/PlaylistBuilderWorkspace";
import { WishListWorkspace } from "./workspaces/WishListWorkspace";
import { MusicToolRepairPanel } from "./workspaces/MusicToolRepairPanel";
import {
  checkForAppUpdate,
  installAppUpdate,
  type AppUpdateCheckResult,
  type AppUpdateInfo,
  type AppUpdateInstallProgress,
} from "./app/updater";
import { setAppUpdateIndicator } from "./app/updateIndicator";
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
  createGenreTimelineRequest,
  createGenreSuggestionRequest,
  createMusicToolIssueRequest,
  createRequest,
  createTextFilter,
  defaultSort,
  nextSort,
  normalizeBrowseRequestForClient,
  normalizeChartConfigForClient,
  normalizeChartGridCoverSize,
  normalizeCompletenessRange,
  renewMusicToolIssueRequest,
  toCompletenessFilterRange,
  type DiscoverySelection,
} from "./app/requests";
import {
  albumsWithLovedTracksCohort,
  catalogArtistCohort,
  catalogGenreCohort,
  decadeCohort,
  discoveryAlbumCohort,
  discoveryArtistCohort,
  discoveryGenreCohort,
  discoveryHeatmapCohort,
  discoveryMissionCohort,
  durationAlbumCohort,
  genreCohort,
  lovedDensityCohort,
  lovedGenreCohort,
  lovedTracksCohort,
  lovedYearCohort,
  missingMetadataCohort,
  outlierCohort,
  ratingBucketCohort,
  ratingEventCohort,
  ratingProgressCohort,
  trackCountBucketCohort,
  yearCohort,
  type InsightCohort,
} from "./app/insightCohorts";

type AppUpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "upToDate"
  | "downloading"
  | "installing"
  | "restarting"
  | "error";

type OriginReportFilter =
  "needsAttention" | "skipped" | "unresolved" | "eligible" | "imported" | "all";

const originReportFilterOptions: Array<{
  value: OriginReportFilter;
  label: string;
}> = [
  { value: "needsAttention", label: "Needs attention" },
  { value: "skipped", label: "Skipped" },
  { value: "unresolved", label: "Unresolved" },
  { value: "eligible", label: "Eligible" },
  { value: "imported", label: "Imported" },
  { value: "all", label: "All" },
];

type ArtistInfoReportFilter =
  "needsAttention" | "eligible" | "imported" | "person" | "group" | "all";

const artistInfoReportFilterOptions: Array<{
  value: ArtistInfoReportFilter;
  label: string;
}> = [
  { value: "needsAttention", label: "Needs attention" },
  { value: "eligible", label: "Eligible" },
  { value: "imported", label: "Imported" },
  { value: "person", label: "People" },
  { value: "group", label: "Groups" },
  { value: "all", label: "All" },
];

function createDefaultSettings(): AppSettings {
  return loadCachedSettings();
}

function createDefaultImportSourcePath() {
  return loadCachedSettings().importSourcePath;
}

function createDefaultCoverSourcePath() {
  return loadCachedSettings().coverSourcePath;
}

function createDefaultBillboardSourcePath() {
  return loadCachedSettings().billboardSourcePath;
}

function createDefaultBillboardSinglesSourcePath() {
  return loadCachedSettings().billboardSinglesSourcePath;
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
    <span
      className="rating-stars"
      aria-label={ratingLabel ? `${label} ${ratingLabel}` : `${label} unrated`}
    >
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
  return (
    <span className={`run-status run-status-${status.toLowerCase()}`}>
      {status}
    </span>
  );
}

type OriginCountryValue = {
  originCountryCode: string | null;
  originCountryName: string | null;
  originCountryRawArea?: string | null;
};

type RegionDisplayNames = {
  of(code: string): string | undefined;
};

const regionDisplayNames =
  "DisplayNames" in Intl
    ? new (
        Intl as typeof Intl & {
          DisplayNames: new (
            locales: string[],
            options: { type: "region" },
          ) => RegionDisplayNames;
        }
      ).DisplayNames(["en"], { type: "region" })
    : null;

function countryCodeForFlag(code: string | null | undefined) {
  const normalized = code?.trim().toLowerCase() ?? "";
  return /^[a-z]{2}$/.test(normalized) ? normalized : "";
}

function CountryFlag({
  code,
  label,
  decorative = false,
}: {
  code: string;
  label: string;
  decorative?: boolean;
}) {
  return (
    <span
      className={`country-flag fi fi-${code}`}
      aria-hidden={decorative ? "true" : undefined}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : label}
    />
  );
}

function CountryDisplay({
  value,
  mode,
  fallback = "",
  className = "",
}: {
  value: OriginCountryValue;
  mode: CountryFlagDisplay;
  fallback?: string;
  className?: string;
}) {
  const normalizedValue = {
    originCountryCode: value.originCountryCode,
    originCountryName: value.originCountryName,
    originCountryRawArea: value.originCountryRawArea ?? null,
  };
  const label = formatOriginCountry(normalizedValue);
  const flagCode = countryCodeForFlag(value.originCountryCode);
  const showFlag = mode !== "name" && Boolean(flagCode);
  const showName = mode !== "flag" && Boolean(label);

  if (!label && !flagCode) {
    return fallback ? <>{fallback}</> : null;
  }

  if (!showFlag && !showName) {
    return <>{label || fallback}</>;
  }

  const title = [value.originCountryCode?.trim().toUpperCase(), label]
    .filter(Boolean)
    .join(" - ");
  const classes = ["country-display", `country-display-${mode}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} title={title || undefined}>
      {showFlag ? (
        <CountryFlag
          code={flagCode}
          label={label || value.originCountryCode || "Country flag"}
          decorative={showName}
        />
      ) : null}
      {showName ? <span className="country-name">{label}</span> : null}
    </span>
  );
}

function countryValueFromCode(
  code: string,
  countryOptions: MusicBrainzOriginCountryOption[],
): OriginCountryValue {
  const normalizedCode = code.trim().toUpperCase();
  const option = countryOptionForCode(countryOptions, normalizedCode);
  return {
    originCountryCode: normalizedCode,
    originCountryName: option
      ? countryOptionName(option)
      : (countryNameFromCode(normalizedCode) ?? normalizedCode),
    originCountryRawArea: null,
  };
}

function CountryListDisplay({
  values,
  countryOptions,
  mode,
}: {
  values: string[];
  countryOptions: MusicBrainzOriginCountryOption[];
  mode: CountryFlagDisplay;
}) {
  const codes = normalizeCountryCodes(values);
  if (codes.length === 0) {
    return null;
  }

  return (
    <span className="country-list-display">
      {codes.map((code, index) => (
        <Fragment key={code}>
          {index > 0 ? <span className="country-list-separator">,</span> : null}
          <CountryDisplay
            value={countryValueFromCode(code, countryOptions)}
            mode={mode}
          />
        </Fragment>
      ))}
    </span>
  );
}

function CountryOptionDisplay({
  country,
  mode,
}: {
  country: MusicBrainzOriginCountryOption;
  mode: CountryFlagDisplay;
}) {
  return (
    <CountryDisplay
      value={{
        originCountryCode: countryOptionCode(country),
        originCountryName: countryOptionName(country),
        originCountryRawArea: null,
      }}
      mode={mode}
      fallback={countryOptionLabel(country)}
    />
  );
}

function originImportStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "preparing":
      return "Preparing";
    case "running":
      return "Running";
    case "fetching":
      return "Fetching";
    case "stored":
      return "Stored";
    case "unresolved":
      return "Unresolved";
    case "artistFailed":
      return "Artist failed";
    case "completed":
      return "Completed";
    case "completed_with_errors":
      return "Completed with errors";
    case "cancelled":
      return "Cancelled";
    case "cancelling":
      return "Cancelling";
    case "failed":
      return "Failed";
    default:
      return status || "Idle";
  }
}

function originPreviewStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "eligible":
      return "Eligible";
    case "alreadyImported":
      return "Imported";
    case "manual":
      return "Manual";
    case "skipped":
      return "Skipped";
    case "unresolved":
      return "Unresolved";
    default:
      return status || "Unknown";
  }
}

function originPreviewMatchLabel(row: MusicBrainzOriginCountryPreviewRow) {
  const matchName = row.matchedName ?? row.musicbrainzMbid ?? "No MBID";
  return [matchName, row.matchMethod].filter(Boolean).join(" / ");
}

function originPreviewReason(row: MusicBrainzOriginCountryPreviewRow) {
  if (row.skippedReason) {
    return row.skippedReason;
  }
  switch (row.status) {
    case "eligible":
      return row.suspectMapping
        ? "Ready from cached MBID; review on the Artist page if wrong."
        : "Ready for MusicBrainz lookup.";
    case "alreadyImported":
      if (row.suspectMapping) {
        return "Imported from cached MBID; review on the Artist page if wrong.";
      }
      return row.existingReviewState
        ? `Saved as ${row.existingReviewState}.`
        : "Country already saved.";
    case "manual":
      return "Manual or reviewed country is preserved.";
    case "unresolved":
      return "No usable MusicBrainz artist match.";
    default:
      return row.artistLinkState ? `Artist link: ${row.artistLinkState}.` : "";
  }
}

function originPreviewMatchesFilter(
  row: MusicBrainzOriginCountryPreviewRow,
  filter: OriginReportFilter,
) {
  switch (filter) {
    case "needsAttention":
      return row.status === "skipped" || row.status === "unresolved";
    case "skipped":
      return row.status === "skipped";
    case "unresolved":
      return row.status === "unresolved";
    case "eligible":
      return row.status === "eligible";
    case "imported":
      return row.status === "alreadyImported" || row.status === "manual";
    case "all":
      return true;
    default:
      return true;
  }
}

function originPreviewMatchesSearch(
  row: MusicBrainzOriginCountryPreviewRow,
  query: string,
) {
  if (!query) {
    return true;
  }
  const haystack = [
    row.displayArtist,
    row.localArtistKey,
    row.musicbrainzMbid,
    row.matchedName,
    row.existingCountryName,
    row.existingCountryCode,
    row.matchMethod,
    row.artistLinkState,
    row.skippedReason,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function artistInfoPreviewStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "eligible":
      return "Eligible";
    case "alreadyImported":
      return "Imported";
    case "skipped":
      return "Skipped";
    case "unresolved":
      return "Unresolved";
    default:
      return status || "Unknown";
  }
}

function artistInfoPreviewMatchLabel(row: MusicBrainzArtistInfoPreviewRow) {
  const matchName = row.matchedName ?? row.musicbrainzMbid ?? "No MBID";
  return [matchName, row.matchMethod].filter(Boolean).join(" / ");
}

function artistInfoPreviewReason(row: MusicBrainzArtistInfoPreviewRow) {
  if (row.skippedReason) {
    return row.skippedReason;
  }
  switch (row.status) {
    case "eligible":
      return row.suspectMapping
        ? "Ready from cached MBID; review on the Artist page if wrong."
        : "Ready for MusicBrainz artist lookup.";
    case "alreadyImported":
      return row.existingReviewState
        ? `Saved as ${row.existingReviewState}.`
        : "Artist info already saved.";
    case "unresolved":
      return "No usable MusicBrainz artist match.";
    default:
      return row.artistLinkState ? `Artist link: ${row.artistLinkState}.` : "";
  }
}

function artistInfoPreviewMatchesFilter(
  row: MusicBrainzArtistInfoPreviewRow,
  filter: ArtistInfoReportFilter,
) {
  const artistType = row.existingArtistType?.trim().toLowerCase();
  switch (filter) {
    case "needsAttention":
      return row.status === "skipped" || row.status === "unresolved";
    case "eligible":
      return row.status === "eligible";
    case "imported":
      return row.status === "alreadyImported";
    case "person":
      return artistType === "person";
    case "group":
      return artistType === "group";
    case "all":
      return true;
    default:
      return true;
  }
}

function artistInfoPreviewMatchesSearch(
  row: MusicBrainzArtistInfoPreviewRow,
  query: string,
) {
  if (!query) {
    return true;
  }
  const haystack = [
    row.displayArtist,
    row.localArtistKey,
    row.musicbrainzMbid,
    row.matchedName,
    row.existingSortName,
    row.existingArtistType,
    row.existingGender,
    row.existingBeginDate,
    row.existingEndDate,
    row.existingBeginAreaName,
    row.existingEndAreaName,
    row.matchMethod,
    row.artistLinkState,
    row.skippedReason,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function artistInfoLifeStartLabel(row: MusicBrainzArtistInfoPreviewRow) {
  return row.existingArtistType?.toLowerCase() === "group" ? "Founded" : "Born";
}

function artistInfoLifeEndLabel(row: MusicBrainzArtistInfoPreviewRow) {
  return row.existingArtistType?.toLowerCase() === "group"
    ? "Dissolved"
    : "Died";
}

function artistInfoDateLabel(
  date: string | null,
  year: number | null,
  area: string | null,
) {
  const value = date || (year == null ? null : String(year));
  if (!value && !area) {
    return "Missing";
  }
  return [value, area].filter(Boolean).join(" / ");
}

function musicBrainzArtistUrl(mbid: string) {
  return `https://musicbrainz.org/artist/${mbid}`;
}

function musicBrainzStateLabel(
  state:
    | MusicBrainzCacheStatus["state"]
    | MusicBrainzArtistDiscographyResponse["state"]
    | null
    | undefined,
) {
  switch (state) {
    case "available":
      return "Available";
    case "warning":
      return "Warnings";
    case "invalid":
      return "Invalid";
    case "unavailable":
      return "Unavailable";
    case "notFound":
      return "Not found";
    case "ignored":
      return "Ignored";
    default:
      return "Not checked";
  }
}

function musicBrainzYearRange(status: MusicBrainzCacheStatus | null) {
  if (!status?.releaseYearMin || !status.releaseYearMax) {
    return "Unknown";
  }
  return `${status.releaseYearMin}-${status.releaseYearMax}`;
}

function musicBrainzCacheDateRange(status: MusicBrainzCacheStatus | null) {
  if (!status?.cacheDateMin || !status.cacheDateMax) {
    return "Unknown";
  }
  const dateFrom = status.cacheDateMin.slice(0, 10);
  const dateTo = status.cacheDateMax.slice(0, 10);
  return dateFrom === dateTo ? dateFrom : `${dateFrom}-${dateTo}`;
}

function musicBrainzOverlaySyncDetails(
  result: MusicBrainzOverlaySyncResult | MusicBrainzOverlaySyncLogEntry,
) {
  const details = [
    ["artist links", result.artistLinksImported, result.artistLinksExported],
    ["unlinks", result.artistUnlinksImported, result.artistUnlinksExported],
    [
      "release decisions",
      result.releaseDecisionsImported,
      result.releaseDecisionsExported,
    ],
    [
      "decision clears",
      result.releaseDecisionClearsImported,
      result.releaseDecisionClearsExported,
    ],
    [
      "status rows",
      result.releaseStatusesImported,
      result.releaseStatusesExported,
    ],
    [
      "release groups",
      result.releaseGroupsImported,
      result.releaseGroupsExported,
    ],
  ]
    .filter(([, imported, exported]) => Number(imported) + Number(exported) > 0)
    .map(
      ([label, imported, exported]) =>
        `${label}: ${imported} in / ${exported} out`,
    );

  return details.length > 0 ? details.join("; ") : "No row changes";
}

function textSettingValue(value: unknown, fallback: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || fallback;
}

function overlayAutoSyncMinutesValue(value: unknown) {
  const parsed = Math.round(Number(value ?? 0));
  return Math.min(1440, Math.max(0, Number.isFinite(parsed) ? parsed : 0));
}

function updateAutoCheckMinutesValue(value: unknown) {
  const parsed = Math.round(Number(value ?? 0));
  return Math.min(1440, Math.max(0, Number.isFinite(parsed) ? parsed : 0));
}

function appUpdateStatusLabel(status: AppUpdateStatus) {
  switch (status) {
    case "checking":
      return "Checking";
    case "available":
      return "Available";
    case "upToDate":
      return "Current";
    case "downloading":
      return "Downloading";
    case "installing":
      return "Installing";
    case "restarting":
      return "Restarting";
    case "error":
      return "Check failed";
    default:
      return "Not checked";
  }
}

function appUpdateProgressText(progress: AppUpdateInstallProgress | null) {
  if (!progress) {
    return "Preparing";
  }
  if (progress.phase !== "downloading") {
    return appUpdateStatusLabel(progress.phase);
  }
  if (progress.percent != null) {
    return `${Math.round(progress.percent)}% / ${formatBytes(progress.downloadedBytes)}`;
  }
  return `${formatBytes(progress.downloadedBytes)} downloaded`;
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
            onChange({
              ...filter,
              operator: event.target.value as TextFilterOperator,
            })
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
          onChange={(event) =>
            onChange({ ...filter, value: event.target.value })
          }
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
  const showSuggestions =
    isSuggestionOpen &&
    suggestions.length > 0 &&
    activeToken.query.trim().length > 0;
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
      inputRef.current?.setSelectionRange(
        nextDraft.caretPosition,
        nextDraft.caretPosition,
      );
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      setIsSuggestionOpen(true);
      setActiveSuggestionIndex((current) =>
        showSuggestions ? (current + 1) % suggestions.length : 0,
      );
      return;
    }

    if (event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      setIsSuggestionOpen(true);
      setActiveSuggestionIndex((current) =>
        showSuggestions
          ? (current - 1 + suggestions.length) % suggestions.length
          : suggestions.length - 1,
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
              className={
                index === activeSuggestionIndex
                  ? "genre-suggestion active"
                  : "genre-suggestion"
              }
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

function normalizeCountryCodes(values: string[]) {
  return values.map((code) => code.trim().toUpperCase()).filter(Boolean);
}

function countryOptionCode(country: MusicBrainzOriginCountryOption) {
  return country.code.trim().toUpperCase();
}

function countryNameFromCode(code: string) {
  const normalizedCode = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalizedCode)) {
    return null;
  }
  const displayName = regionDisplayNames?.of(normalizedCode)?.trim();
  return displayName && displayName.toUpperCase() !== normalizedCode
    ? displayName
    : null;
}

function countryOptionName(country: MusicBrainzOriginCountryOption) {
  const code = countryOptionCode(country);
  const name = country.name.trim();
  return name && name.toUpperCase() !== code
    ? name
    : (countryNameFromCode(code) ?? name);
}

function countryOptionLabel(country: MusicBrainzOriginCountryOption) {
  const code = countryOptionCode(country);
  const name = countryOptionName(country);
  return name && name.toUpperCase() !== code ? `${code} - ${name}` : code;
}

function countryOptionForCode(
  countryOptions: MusicBrainzOriginCountryOption[],
  code: string,
) {
  const normalizedCode = code.trim().toUpperCase();
  return countryOptions.find(
    (country) => countryOptionCode(country) === normalizedCode,
  );
}

function countryOptionNameForCode(
  countryOptions: MusicBrainzOriginCountryOption[],
  code: string,
) {
  const normalizedCode = code.trim().toUpperCase();
  const option = countryOptionForCode(countryOptions, normalizedCode);
  return option
    ? countryOptionName(option)
    : countryNameFromCode(normalizedCode);
}

function parseCountryToken(
  value: string,
  countryOptions: MusicBrainzOriginCountryOption[],
) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const leadingCode = trimmed
    .match(/^([a-z]{2})(?=$|\s|[-:])/i)?.[1]
    ?.toUpperCase();
  if (leadingCode) {
    return leadingCode;
  }

  const normalizedToken = normalizeCountrySuggestionText(trimmed);
  const matchedOption = countryOptions.find((country) => {
    const code = countryOptionCode(country);
    return (
      code.toLowerCase() === normalizedToken ||
      normalizeCountrySuggestionText(countryOptionName(country)) ===
        normalizedToken ||
      normalizeCountrySuggestionText(countryOptionLabel(country)) ===
        normalizedToken
    );
  });

  return matchedOption
    ? countryOptionCode(matchedOption)
    : trimmed.toUpperCase();
}

function parseCountryList(
  value: string,
  countryOptions: MusicBrainzOriginCountryOption[] = [],
) {
  return normalizeCountryCodes(
    parseList(value).map((item) => parseCountryToken(item, countryOptions)),
  );
}

function formatCountryCode(
  code: string,
  countryOptions: MusicBrainzOriginCountryOption[],
) {
  const normalizedCode = code.trim().toUpperCase();
  const name = countryOptionNameForCode(countryOptions, normalizedCode);
  return name && name.toUpperCase() !== normalizedCode
    ? `${normalizedCode} - ${name}`
    : normalizedCode;
}

function formatCountryList(
  values: string[],
  countryOptions: MusicBrainzOriginCountryOption[],
) {
  return formatList(
    normalizeCountryCodes(values).map((code) =>
      formatCountryCode(code, countryOptions),
    ),
  );
}

function normalizeCountrySuggestionText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countrySuggestionScore(
  country: MusicBrainzOriginCountryOption,
  normalizedQuery: string,
) {
  const code = country.code.trim().toUpperCase();
  const normalizedCode = code.toLowerCase();
  const normalizedName = normalizeCountrySuggestionText(
    countryOptionName(country),
  );

  if (!normalizedQuery) {
    return null;
  }
  if (
    normalizedCode === normalizedQuery ||
    normalizedName === normalizedQuery
  ) {
    return 0;
  }
  if (normalizedCode.startsWith(normalizedQuery)) {
    return 10 + (normalizedCode.length - normalizedQuery.length) / 100;
  }
  if (normalizedName.startsWith(normalizedQuery)) {
    return 20 + (normalizedName.length - normalizedQuery.length) / 100;
  }

  const words = normalizedName.split(" ");
  const wordStartIndex = words.findIndex((word) =>
    word.startsWith(normalizedQuery),
  );
  if (wordStartIndex >= 0) {
    const characterIndex = normalizedName.indexOf(words[wordStartIndex]);
    return (
      30 +
      characterIndex +
      (normalizedName.length - normalizedQuery.length) / 100
    );
  }

  const includesIndex = `${normalizedCode} ${normalizedName}`.indexOf(
    normalizedQuery,
  );
  if (includesIndex >= 0) {
    return 50 + includesIndex + normalizedName.length / 100;
  }

  return null;
}

function countrySuggestions(
  countryOptions: MusicBrainzOriginCountryOption[],
  query: string,
) {
  const normalizedQuery = normalizeCountrySuggestionText(query);
  if (!normalizedQuery) {
    return [];
  }

  return countryOptions
    .map((country) => ({
      country,
      score: countrySuggestionScore(country, normalizedQuery),
    }))
    .filter(
      (
        item,
      ): item is { country: MusicBrainzOriginCountryOption; score: number } =>
        item.score !== null,
    )
    .sort(
      (left, right) =>
        left.score - right.score ||
        countryOptionName(left.country).localeCompare(
          countryOptionName(right.country),
        ) ||
        left.country.code.localeCompare(right.country.code),
    )
    .slice(0, 8)
    .map((item) => item.country);
}

function CountryListCriterion({
  label,
  values,
  onChange,
  countryOptions,
  displayMode,
  placeholder = "GB, US",
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  countryOptions: MusicBrainzOriginCountryOption[];
  displayMode: CountryFlagDisplay;
  placeholder?: string;
}) {
  const inputId = useId();
  const listboxId = `${inputId}-country-suggestions`;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const normalizedValues = useMemo(
    () => normalizeCountryCodes(values),
    [values],
  );
  const formattedValues = useMemo(
    () => formatCountryList(normalizedValues, countryOptions),
    [countryOptions, normalizedValues],
  );
  const [draftValue, setDraftValue] = useState(() => formattedValues);
  const [caretPosition, setCaretPosition] = useState(() => draftValue.length);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [isSuggestionOpen, setIsSuggestionOpen] = useState(false);
  const activeToken = useMemo(
    () => currentGenreToken(draftValue, caretPosition),
    [caretPosition, draftValue],
  );
  const suggestions = useMemo(
    () => countrySuggestions(countryOptions, activeToken.query),
    [activeToken.query, countryOptions],
  );
  const showSuggestions =
    isSuggestionOpen &&
    suggestions.length > 0 &&
    activeToken.query.trim().length > 0;
  const activeSuggestionId = showSuggestions
    ? `${listboxId}-option-${activeSuggestionIndex}`
    : undefined;

  useEffect(() => {
    const parsedDraft = parseCountryList(draftValue, countryOptions);
    if (
      !listsEqual(parsedDraft, normalizedValues) ||
      draftValue === formatList(normalizedValues)
    ) {
      setDraftValue(formattedValues);
      setCaretPosition(formattedValues.length);
    }
  }, [countryOptions, draftValue, formattedValues, normalizedValues]);

  useEffect(() => {
    setActiveSuggestionIndex(0);
  }, [activeToken.query, suggestions.length]);

  function syncCaret(input: HTMLInputElement) {
    setCaretPosition(input.selectionStart ?? input.value.length);
  }

  function updateDraft(value: string) {
    setDraftValue(value);
    onChange(parseCountryList(value, countryOptions));
  }

  function chooseSuggestion(
    suggestion: MusicBrainzOriginCountryOption | undefined,
  ) {
    if (!suggestion) {
      return;
    }
    const nextDraft = replaceGenreToken(
      draftValue,
      caretPosition,
      countryOptionLabel(suggestion),
    );
    updateDraft(nextDraft.value);
    setCaretPosition(nextDraft.caretPosition);
    setIsSuggestionOpen(false);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(
        nextDraft.caretPosition,
        nextDraft.caretPosition,
      );
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      setIsSuggestionOpen(true);
      setActiveSuggestionIndex((current) =>
        showSuggestions ? (current + 1) % suggestions.length : 0,
      );
      return;
    }

    if (event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      setIsSuggestionOpen(true);
      setActiveSuggestionIndex((current) =>
        showSuggestions
          ? (current - 1 + suggestions.length) % suggestions.length
          : suggestions.length - 1,
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
    <div className="criterion genre-list-criterion country-list-criterion">
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
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={(event) => syncCaret(event.currentTarget)}
        onClick={(event) => syncCaret(event.currentTarget)}
        onSelect={(event) => syncCaret(event.currentTarget)}
        onBlur={(event) => {
          setDraftValue(
            formatCountryList(
              parseCountryList(event.currentTarget.value, countryOptions),
              countryOptions,
            ),
          );
          setIsSuggestionOpen(false);
        }}
        placeholder={placeholder}
      />
      {showSuggestions ? (
        <div className="genre-suggestions" id={listboxId} role="listbox">
          {suggestions.map((suggestion, index) => (
            <button
              className={
                index === activeSuggestionIndex
                  ? "genre-suggestion active"
                  : "genre-suggestion"
              }
              id={`${listboxId}-option-${index}`}
              key={suggestion.code}
              type="button"
              role="option"
              aria-selected={index === activeSuggestionIndex}
              onMouseDown={(event) => {
                event.preventDefault();
                chooseSuggestion(suggestion);
              }}
            >
              <CountryOptionDisplay country={suggestion} mode={displayMode} />
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
    return clampCompletenessValue(
      ((clientX - rect.left) / rect.width) * completenessRange.max,
    );
  }

  function updateHandle(handle: "min" | "max", value: number) {
    if (handle === "min") {
      updateMin(value);
    } else {
      updateMax(value);
    }
  }

  function handlePointerDown(
    event: PointerEvent<HTMLButtonElement>,
    handle: "min" | "max",
  ) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    updateHandle(handle, valueFromPointer(event.clientX));
  }

  function handlePointerMove(
    event: PointerEvent<HTMLButtonElement>,
    handle: "min" | "max",
  ) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      updateHandle(handle, valueFromPointer(event.clientX));
    }
  }

  function handlePointerUp(event: PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    handle: "min" | "max",
  ) {
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
    <div
      className={`criterion slider-criterion completeness-range-criterion ${className}`.trim()}
    >
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
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <label className="criterion">
      <span>{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
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
  const Icon = isActive
    ? sort.direction === "asc"
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown;
  const nextDirection =
    isActive && sort.direction === "asc" ? "descending" : "ascending";

  return (
    <span
      role="columnheader"
      aria-sort={
        isActive
          ? sort.direction === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
    >
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
  countryFlagDisplay,
  visibleColumns,
}: {
  response: BrowseResponse | null;
  sort: BrowseSort;
  onSort: (field: string) => void;
  countryFlagDisplay: CountryFlagDisplay;
  visibleColumns: string[];
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

  const visibleColumnSet = new Set(visibleColumns);
  const showBillboardColumn = visibleColumnSet.has("billboard");

  return response.view === "tracks" ? (
    <div
      className={`result-table track-results${showBillboardColumn ? " with-billboard" : ""}`}
      role="table"
    >
      <div className="result-table-head" role="row">
        <SortableColumnHeader
          label="Track"
          field="title"
          sort={sort}
          onSort={onSort}
        />
        <SortableColumnHeader
          label="Album"
          field="album"
          sort={sort}
          onSort={onSort}
        />
        <SortableColumnHeader
          label="Artist"
          field="displayArtist"
          sort={sort}
          onSort={onSort}
        />
        <SortableColumnHeader
          label="Origin"
          field="originCountry"
          sort={sort}
          onSort={onSort}
        />
        <SortableColumnHeader
          label="Year"
          field="year"
          sort={sort}
          onSort={onSort}
        />
        {showBillboardColumn ? (
          <SortableColumnHeader
            label="Album Billboard"
            field="billboardRank"
            sort={sort}
            onSort={onSort}
          />
        ) : null}
        <SortableColumnHeader
          label="Single"
          field="billboardSingleRank"
          sort={sort}
          onSort={onSort}
        />
        <SortableColumnHeader
          label="Rating"
          field="trackRating"
          sort={sort}
          onSort={onSort}
        />
        <span role="columnheader">File</span>
      </div>
      {response.rows.map((row) => {
        const singleLabel = formatBillboardSingleRank(row);
        return (
          <div className="result-table-row" role="row" key={row.id}>
            <span role="cell">
              <strong>
                <span>{row.title ?? "Untitled"}</span>
                {singleLabel ? (
                  <span className="billboard-badge">{singleLabel}</span>
                ) : null}
              </strong>
              <small>
                {[row.discNumber, row.trackNumber]
                  .filter((value) => value != null)
                  .join(".")}
                {row.love === "L" ? "  Loved" : ""}
              </small>
            </span>
            <span className="album-title-cell" role="cell">
              <AlbumTitleContents
                row={row}
                subtitle={
                  row.albumArtistDisplay ?? row.year?.toString() ?? null
                }
                showBillboardBadge={!showBillboardColumn}
              />
            </span>
            <span role="cell">
              {row.displayArtist ?? row.albumArtistDisplay ?? ""}
            </span>
            <span role="cell">
              <CountryDisplay value={row} mode={countryFlagDisplay} />
            </span>
            <span role="cell">{row.year ?? ""}</span>
            {showBillboardColumn ? (
              <span role="cell">{formatBillboardRank(row)}</span>
            ) : null}
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
    <div
      className={`result-table album-results${showBillboardColumn ? " with-billboard" : ""}`}
      role="table"
    >
      <div className="result-table-head" role="row">
        <SortableColumnHeader
          label="Album"
          field="album"
          sort={sort}
          onSort={onSort}
        />
        <SortableColumnHeader
          label="Artist"
          field="artist"
          sort={sort}
          onSort={onSort}
        />
        <SortableColumnHeader
          label="Origin"
          field="originCountry"
          sort={sort}
          onSort={onSort}
        />
        <SortableColumnHeader
          label="Year"
          field="year"
          sort={sort}
          onSort={onSort}
        />
        <SortableColumnHeader
          label="Genre"
          field="genre"
          sort={sort}
          onSort={onSort}
        />
        {showBillboardColumn ? (
          <SortableColumnHeader
            label="Billboard"
            field="billboardRank"
            sort={sort}
            onSort={onSort}
          />
        ) : null}
        <SortableColumnHeader
          label="Tracks"
          field="trackCount"
          sort={sort}
          onSort={onSort}
        />
        <SortableColumnHeader
          label="Complete"
          field="ratingCompleteness"
          sort={sort}
          onSort={onSort}
        />
        <SortableColumnHeader
          label="Score"
          field="albumScore"
          sort={sort}
          onSort={onSort}
        />
      </div>
      {response.rows.map((row) => (
        <div className="result-table-row" role="row" key={row.id}>
          <span className="album-title-cell" role="cell">
            <AlbumTitleContents
              row={row}
              showBillboardBadge={!showBillboardColumn}
            />
          </span>
          <span role="cell">{row.albumArtistDisplay ?? ""}</span>
          <span role="cell">
            <CountryDisplay value={row} mode={countryFlagDisplay} />
          </span>
          <span role="cell">{row.year ?? ""}</span>
          <span role="cell">{row.canonicalGenre ?? ""}</span>
          {showBillboardColumn ? (
            <span role="cell">{formatBillboardRank(row)}</span>
          ) : null}
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
  const classes = [
    "cover-placeholder",
    displayImageUrl ? "cover-image" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

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
  showBillboardBadge = true,
}: {
  row: BrowseRow;
  subtitle?: string | null;
  showBillboardBadge?: boolean;
}) {
  const billboardLabel = formatBillboardRank(row);
  return (
    <>
      <AlbumCover row={row} className="cover-mini" />
      <span>
        <strong>
          <span>{row.album ?? "Untitled"}</span>
          {showBillboardBadge && billboardLabel ? (
            <span className="billboard-badge">{billboardLabel}</span>
          ) : null}
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
  countryFlagDisplay,
}: {
  response: BrowseResponse | null;
  selectedAlbumId: string | null;
  onSelect: (albumId: string) => void;
  sort: BrowseSort;
  onSort: (field: string) => void;
  countryFlagDisplay: CountryFlagDisplay;
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
        <SortableColumnHeader
          label="Album"
          field="album"
          sort={sort}
          onSort={onSort}
        />
        <SortableColumnHeader
          label="Artist"
          field="artist"
          sort={sort}
          onSort={onSort}
        />
        <SortableColumnHeader
          label="Origin"
          field="originCountry"
          sort={sort}
          onSort={onSort}
        />
        <SortableColumnHeader
          label="Year"
          field="year"
          sort={sort}
          onSort={onSort}
        />
        <SortableColumnHeader
          label="Genre"
          field="genre"
          sort={sort}
          onSort={onSort}
        />
        <SortableColumnHeader
          label="Tracks"
          field="trackCount"
          sort={sort}
          onSort={onSort}
        />
        <SortableColumnHeader
          label="Complete"
          field="ratingCompleteness"
          sort={sort}
          onSort={onSort}
        />
        <SortableColumnHeader
          label="Score"
          field="albumScore"
          sort={sort}
          onSort={onSort}
        />
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
            <span role="cell">
              <CountryDisplay value={row} mode={countryFlagDisplay} />
            </span>
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
            <small>
              {row.love === "L" ? "Loved" : (row.canonicalGenre ?? "")}
            </small>
          </span>
          <span role="cell">
            {row.displayArtist ?? row.albumArtistDisplay ?? ""}
          </span>
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
  countryFlagDisplay,
}: {
  album: BrowseRow | null;
  tracks: BrowseResponse | null;
  isLoading: boolean;
  includeCalculated: boolean;
  onIncludeCalculatedChange: (value: boolean) => void;
  exportResult: ExportResult | null;
  onExport: (format: string) => Promise<void>;
  countryFlagDisplay: CountryFlagDisplay;
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
          <p>
            {[album.albumArtistDisplay, album.year, album.canonicalGenre]
              .filter(Boolean)
              .join(" / ")}
          </p>
        </div>
      </div>

      <AlbumCover
        row={album}
        className="album-cover-large"
        decorative={false}
      />

      <dl className="run-details album-detail-stats">
        <div>
          <dt>Tracks</dt>
          <dd>
            {album.ratedTracks != null
              ? formatNumber(album.ratedTracks)
              : formatNumber(album.totalTracks)}
            {album.ratedTracks != null
              ? ` / ${formatNumber(album.totalTracks)} rated`
              : ""}
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
          <dt>Origin Country</dt>
          <dd>
            <CountryDisplay
              value={album}
              mode={countryFlagDisplay}
              fallback="Not imported"
            />
          </dd>
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
            onChange={(event) =>
              onIncludeCalculatedChange(event.target.checked)
            }
          />
          <span>Calculated columns</span>
        </label>
        <div className="export-grid">
          {["csv", "tsv", "xlsx", "json", "txt"].map((format) => (
            <button
              type="button"
              key={format}
              onClick={() => void onExport(format)}
            >
              <Download size={16} />
              <span>{format.toUpperCase()}</span>
            </button>
          ))}
        </div>
        {exportResult ? (
          <ExportResultStatus result={exportResult} itemLabel="track" />
        ) : null}
      </section>
    </aside>
  );
}

function artistInitial(artist: ArtistSummary | null) {
  return artist?.name.trim().slice(0, 1).toUpperCase() || "A";
}

function formatYearSpan(
  firstYear: number | null | undefined,
  lastYear: number | null | undefined,
) {
  if (firstYear == null && lastYear == null) return "";
  if (firstYear != null && lastYear != null && firstYear !== lastYear) {
    return `${firstYear}-${lastYear}`;
  }
  return `${firstYear ?? lastYear}`;
}

function hasMusicBrainzArtistInfo(artist: ArtistSummary | null) {
  if (!artist) {
    return false;
  }
  return Boolean(
    artist.musicBrainzArtistType ||
      artist.musicBrainzGender ||
      artist.musicBrainzBeginDate ||
      artist.musicBrainzBeginYear != null ||
      artist.musicBrainzEndDate ||
      artist.musicBrainzEndYear != null ||
      artist.musicBrainzBeginAreaName ||
      artist.musicBrainzEndAreaName ||
      artist.musicBrainzInfoReviewState,
  );
}

function isMusicBrainzGroupArtist(artist: ArtistSummary | null) {
  return artist?.musicBrainzArtistType?.trim().toLowerCase() === "group";
}

function formatMusicBrainzArtistLifeDate(
  date: string | null | undefined,
  year: number | null | undefined,
) {
  return date?.trim() || (year == null ? "" : String(year));
}

function formatMusicBrainzArtistEndValue(artist: ArtistSummary | null) {
  if (!artist) {
    return "";
  }
  const explicitDate = formatMusicBrainzArtistLifeDate(
    artist.musicBrainzEndDate,
    artist.musicBrainzEndYear,
  );
  if (explicitDate) {
    return explicitDate;
  }
  if (artist.musicBrainzEnded === false) {
    return isMusicBrainzGroupArtist(artist) ? "Active" : "Living";
  }
  return "";
}

function formatMusicBrainzArtistLifeSummary(artist: ArtistSummary | null) {
  if (!artist) {
    return "";
  }
  const start = formatMusicBrainzArtistLifeDate(
    artist.musicBrainzBeginDate,
    artist.musicBrainzBeginYear,
  );
  const end = formatMusicBrainzArtistEndValue(artist);
  return [start, end].filter(Boolean).join("-");
}

function formatMusicBrainzArtistInfoState(artist: ArtistSummary | null) {
  return formatMusicBrainzReviewState(artist?.musicBrainzInfoReviewState);
}

function ArtistIndexTable({
  response,
  selectedArtistId,
  onSelect,
  countryFlagDisplay,
}: {
  response: ArtistListResponse | null;
  selectedArtistId: string | null;
  onSelect: (artistId: string) => void;
  countryFlagDisplay: CountryFlagDisplay;
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
        <span role="columnheader">Origin</span>
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
              <span
                className="cover-placeholder cover-mini artist-mini"
                aria-hidden="true"
              >
                <span>{artistInitial(artist)}</span>
              </span>
              <span>
                <strong>{artist.name}</strong>
                <small>{formatNumber(artist.trackCount)} tracks</small>
              </span>
            </span>
            <span role="cell">
              <CountryDisplay value={artist} mode={countryFlagDisplay} />
            </span>
            <span role="cell">{formatNumber(artist.albumCount)}</span>
            <span role="cell">
              {formatYearSpan(artist.firstYear, artist.lastYear)}
            </span>
            <span role="cell">{artist.topGenre ?? ""}</span>
            <span role="cell">
              {formatPercent(artist.averageRatingCompleteness)}
            </span>
            <span role="cell">
              {formatAverage(artist.averageAlbumScore, 2)}
            </span>
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

function MusicBrainzArtistInfoPanel({
  artist,
  response,
  isLoading,
  isUpdating,
  error,
  onUpdateInfo,
  onOpenExternalUrl,
  onSetArtistLink,
  onSetOriginCountry,
  refreshResult,
  originResult,
  countryOptions,
  countryFlagDisplay,
}: {
  artist: ArtistSummary | null;
  response: MusicBrainzArtistDiscographyResponse | null;
  isLoading: boolean;
  isUpdating: boolean;
  error: string | null;
  onUpdateInfo: () => void;
  onOpenExternalUrl: (url: string) => void;
  onSetArtistLink: (
    action: "verify" | "ignore" | "unlink" | "set",
    musicbrainzMbid?: string | null,
    canonicalName?: string | null,
  ) => void;
  onSetOriginCountry: (
    countryCode: string,
    countryName?: string | null,
  ) => void;
  refreshResult: MusicBrainzArtistRefreshResult | null;
  originResult: MusicBrainzArtistOriginCountryUpdate | null;
  countryOptions: MusicBrainzOriginCountryOption[];
  countryFlagDisplay: CountryFlagDisplay;
}) {
  const [manualMbid, setManualMbid] = useState("");
  const [manualOriginCode, setManualOriginCode] = useState("");
  const [manualOriginName, setManualOriginName] = useState("");
  const originInputId = useId();
  const originNameInputId = useId();
  const originOptionsId = `${originInputId}-options`;
  const musicBrainzMbid =
    response?.musicbrainzMbid ?? artist?.musicBrainzMbid ?? null;
  const musicBrainzArtistLink = musicBrainzMbid
    ? musicBrainzArtistUrl(musicBrainzMbid)
    : null;
  const hasArtistInfo = hasMusicBrainzArtistInfo(artist);
  const infoStatusLabel = formatMusicBrainzArtistInfoState(artist);
  const isGroup = isMusicBrainzGroupArtist(artist);
  const lifeStartLabel = isGroup ? "Founded" : "Born";
  const lifeEndLabel = isGroup ? "Dissolved" : "Died";
  const lifeStartValue = formatMusicBrainzArtistLifeDate(
    artist?.musicBrainzBeginDate,
    artist?.musicBrainzBeginYear,
  );
  const lifeEndValue = formatMusicBrainzArtistEndValue(artist);
  const artistLinkLabel =
    response?.artistLinkState === "verified"
      ? "Verified"
      : response?.artistLinkState === "ignored"
        ? "Ignored"
        : response?.artistLinkState === "unverified"
          ? "Unverified"
          : "No review";
  const artistLinkIgnored = response?.artistLinkIgnored ?? false;
  const canVerify = Boolean(
    artist &&
      musicBrainzMbid &&
      response?.artistLinkState !== "verified" &&
      !isLoading,
  );
  const canIgnore = Boolean(
    artist && musicBrainzMbid && !artistLinkIgnored && !isLoading,
  );
  const canUnlink = Boolean(
    artist &&
      response &&
      (response.artistLinkState === "verified" ||
        response.artistLinkState === "ignored") &&
      !isLoading,
  );
  const manualMbidValue = manualMbid.trim();
  const manualOriginCodeValue = manualOriginCode.trim().toUpperCase();
  const selectedOriginName = countryOptionNameForCode(
    countryOptions,
    manualOriginCodeValue,
  );
  const manualOriginNameValue =
    manualOriginName.trim() || selectedOriginName || null;
  const canSetManualMbid = Boolean(artist && manualMbidValue && !isLoading);
  const canSetManualOrigin = Boolean(
    artist && /^[A-Z]{2}$/.test(manualOriginCodeValue) && !isLoading,
  );
  const canUpdateInfo = Boolean(
    artist && musicBrainzMbid && !artistLinkIgnored && !isLoading,
  );
  const refreshedOrigin = refreshResult?.origin ?? null;

  useEffect(() => {
    setManualMbid(musicBrainzMbid ?? "");
  }, [artist?.id, musicBrainzMbid]);

  useEffect(() => {
    setManualOriginCode(artist?.originCountryCode ?? "");
    setManualOriginName(artist?.originCountryName ?? "");
  }, [artist?.id, artist?.originCountryCode, artist?.originCountryName]);

  function handleManualMbidSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (manualMbidValue) {
      onSetArtistLink("set", manualMbidValue);
    }
  }

  function handleManualOriginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSetManualOrigin) {
      onSetOriginCountry(manualOriginCodeValue, manualOriginNameValue);
    }
  }

  function handleManualOriginCodeChange(value: string) {
    const nextCode = value.toUpperCase();
    const currentName = manualOriginName.trim();
    const previousName = countryOptionNameForCode(
      countryOptions,
      manualOriginCode,
    );
    const nextName = countryOptionNameForCode(countryOptions, nextCode);
    const artistOriginName = artist?.originCountryName?.trim() ?? "";
    setManualOriginCode(nextCode);
    if (
      /^[A-Z]{2}$/.test(nextCode) &&
      nextName &&
      (!currentName ||
        currentName === previousName ||
        currentName === artistOriginName)
    ) {
      setManualOriginName(nextName);
    }
  }

  function handleMusicBrainzArtistLinkClick(
    event: MouseEvent<HTMLAnchorElement>,
  ) {
    if (!musicBrainzArtistLink) {
      return;
    }
    event.preventDefault();
    onOpenExternalUrl(musicBrainzArtistLink);
  }

  return (
    <section
      className="table-panel musicbrainz-artist-info-panel"
      aria-label="MusicBrainz artist information"
    >
      <div className="panel-heading compact">
        <div>
          <h2>MusicBrainz Artist Info</h2>
          <p>
            {isLoading
              ? isUpdating
                ? "Updating artist information"
                : "Checking local cache"
              : artist
                ? hasArtistInfo
                  ? [
                      artist.musicBrainzArtistType,
                      formatMusicBrainzArtistLifeSummary(artist),
                    ]
                      .filter(Boolean)
                      .join(" / ")
                  : "Artist info not imported"
                : "Select an artist"}
          </p>
        </div>
        <div className="panel-actions">
          <MusicBrainzReviewState
            state={artist?.musicBrainzInfoReviewState}
          />
          <button
            className="musicbrainz-update-button"
            type="button"
            title="Update MusicBrainz info for this artist"
            aria-label="Update MusicBrainz info for this artist"
            disabled={!canUpdateInfo}
            onClick={onUpdateInfo}
          >
            <CloudDownload size={16} />
            <span>{isUpdating ? "Updating" : "Update"}</span>
          </button>
        </div>
      </div>

      {error ? <p className="error-message">{error}</p> : null}

      {!artist ? (
        <div className="empty-state large">
          <UsersRound size={20} />
          <span>Select an artist.</span>
        </div>
      ) : (
        <>
          <dl className="performance-summary musicbrainz-artist-info-summary">
            <div>
              <dt>Type</dt>
              <dd>{artist.musicBrainzArtistType ?? "Missing"}</dd>
            </div>
            <div>
              <dt>Gender</dt>
              <dd>{artist.musicBrainzGender ?? "n/a"}</dd>
            </div>
            <div>
              <dt>Sort name</dt>
              <dd>{artist.musicBrainzSortName ?? "Missing"}</dd>
            </div>
            <div>
              <dt>{lifeStartLabel}</dt>
              <dd>{lifeStartValue || "Missing"}</dd>
            </div>
            <div>
              <dt>{lifeEndLabel}</dt>
              <dd>{lifeEndValue || "Missing"}</dd>
            </div>
            <div>
              <dt>Begin area</dt>
              <dd>{artist.musicBrainzBeginAreaName ?? "Missing"}</dd>
            </div>
            <div>
              <dt>End area</dt>
              <dd>{artist.musicBrainzEndAreaName ?? "n/a"}</dd>
            </div>
            <div>
              <dt>Origin</dt>
              <dd>
                <CountryDisplay
                  value={artist}
                  mode={countryFlagDisplay}
                  fallback="Not imported"
                />
              </dd>
            </div>
          </dl>

          <div className="musicbrainz-artist-meta">
            {musicBrainzArtistLink ? (
              <a
                href={musicBrainzArtistLink}
                target="_blank"
                rel="noreferrer"
                onClick={handleMusicBrainzArtistLinkClick}
              >
                {`MBID: ${musicBrainzMbid}`}
                <ExternalLink size={13} aria-hidden="true" />
              </a>
            ) : (
              <span>No MBID</span>
            )}
            <span>{`Match: ${response?.matchMethod ?? "none"}`}</span>
            <span>{`Trust: ${artistLinkLabel}`}</span>
            <span>{`Info: ${infoStatusLabel}`}</span>
            {artist.musicBrainzInfoFetchedAt ? (
              <span>{`Fetched: ${formatDate(artist.musicBrainzInfoFetchedAt)}`}</span>
            ) : null}
          </div>

          <div
            className="musicbrainz-link-review"
            aria-label="MusicBrainz artist match review"
          >
            <div className="musicbrainz-link-actions">
              <button
                className="primary-button"
                type="button"
                disabled={!canVerify}
                onClick={() => onSetArtistLink("verify", musicBrainzMbid)}
              >
                <Check size={16} />
                <span>Verify</span>
              </button>
              <button
                className="icon-button"
                type="button"
                title="Ignore MusicBrainz for this artist"
                aria-label="Ignore MusicBrainz for this artist"
                disabled={!canIgnore}
                onClick={() => onSetArtistLink("ignore", musicBrainzMbid)}
              >
                <Ban size={16} />
              </button>
              <button
                className="icon-button"
                type="button"
                title="Unlink MusicBrainz artist match"
                aria-label="Unlink MusicBrainz artist match"
                disabled={!canUnlink}
                onClick={() => onSetArtistLink("unlink")}
              >
                <Unlink size={16} />
              </button>
            </div>
            <form
              className="musicbrainz-manual-link"
              onSubmit={handleManualMbidSubmit}
            >
              <input
                aria-label="Manual MusicBrainz artist MBID"
                value={manualMbid}
                placeholder="Artist MBID"
                disabled={!artist || isLoading}
                onChange={(event) => setManualMbid(event.target.value)}
              />
              <button
                className="icon-button"
                type="submit"
                title="Set MusicBrainz artist MBID"
                aria-label="Set MusicBrainz artist MBID"
                disabled={!canSetManualMbid}
              >
                <Save size={16} />
              </button>
            </form>
          </div>
          <form
            className="musicbrainz-origin-editor"
            onSubmit={handleManualOriginSubmit}
          >
            <label htmlFor={originInputId}>
              <span>Origin Country</span>
              <input
                id={originInputId}
                list={originOptionsId}
                value={manualOriginCode}
                placeholder="US"
                maxLength={2}
                disabled={!artist || isLoading}
                onChange={(event) =>
                  handleManualOriginCodeChange(event.target.value)
                }
                onBlur={(event) =>
                  setManualOriginCode(
                    event.currentTarget.value.trim().toUpperCase(),
                  )
                }
              />
            </label>
            <label htmlFor={originNameInputId}>
              <span>Country name</span>
              <input
                id={originNameInputId}
                value={manualOriginName}
                placeholder={selectedOriginName ?? "United States"}
                disabled={!artist || isLoading}
                onChange={(event) => setManualOriginName(event.target.value)}
                onBlur={(event) =>
                  setManualOriginName(event.currentTarget.value.trim())
                }
              />
            </label>
            <datalist id={originOptionsId}>
              {countryOptions.map((country) => (
                <option
                  key={country.code}
                  value={countryOptionCode(country)}
                  label={countryOptionLabel(country)}
                >
                  {countryOptionLabel(country)}
                </option>
              ))}
            </datalist>
            <button
              className="icon-button"
              type="submit"
              title="Save manual origin country"
              aria-label="Save manual origin country"
              disabled={!canSetManualOrigin}
            >
              <Save size={16} />
            </button>
          </form>

          {refreshResult || originResult ? (
            <div
              className="musicbrainz-info-results"
              aria-label="MusicBrainz artist info updates"
            >
              {refreshResult ? (
                <div className="export-result musicbrainz-export-result">
                  <CloudDownload size={16} />
                  <span>
                    Artist info and {formatNumber(refreshResult.storedCount)}{" "}
                    release groups refreshed at{" "}
                    {formatDate(refreshResult.fetchedAt)}
                    {refreshedOrigin ? (
                      <>
                        {" / Origin "}
                        <CountryDisplay
                          value={refreshedOrigin}
                          mode={countryFlagDisplay}
                        />
                      </>
                    ) : null}
                  </span>
                </div>
              ) : null}
              {originResult ? (
                <div className="export-result musicbrainz-export-result">
                  <Save size={16} />
                  <span>
                    Origin saved as{" "}
                    <CountryDisplay
                      value={originResult}
                      mode={countryFlagDisplay}
                      fallback="manual"
                    />
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function MusicBrainzArtistDiscographyPanel({
  artist,
  response,
  isLoading,
  isUpdating,
  onRefresh,
  onOpenExternalUrl,
  onSetArtistLink,
  onSetReleaseDecision,
  onExport,
  exportResult,
}: {
  artist: ArtistSummary | null;
  response: MusicBrainzArtistDiscographyResponse | null;
  isLoading: boolean;
  isUpdating: boolean;
  onRefresh: () => void;
  onOpenExternalUrl: (url: string) => void;
  onSetArtistLink: (
    action: "verify" | "ignore" | "unlink" | "set",
    musicbrainzMbid?: string | null,
    canonicalName?: string | null,
  ) => void;
  onSetReleaseDecision: (
    row: MusicBrainzArtistReleaseRow,
    decision: "not-in-scope" | "include",
  ) => void;
  onExport: (format: "csv" | "xlsx") => void;
  exportResult: ExportResult | null;
}) {
  const rows = response?.releases ?? [];
  const visibleRows = rows.filter((row) => row.status !== "excluded");
  const candidates = response?.candidates ?? [];
  const statusLabel = musicBrainzStateLabel(response?.state);
  const artistLinkLabel =
    response?.artistLinkState === "verified"
      ? "Verified"
      : response?.artistLinkState === "ignored"
        ? "Ignored"
        : response?.artistLinkState === "unverified"
          ? "Unverified"
          : "No review";
  const canExport = Boolean(
    response &&
    !response.artistLinkIgnored &&
    visibleRows.length > 0 &&
    !isLoading,
  );

  return (
    <section
      className="table-panel musicbrainz-artist-panel"
      aria-label="MusicBrainz artist discography"
    >
      <div className="panel-heading compact">
        <div>
          <h2>MusicBrainz Discography</h2>
          <p>
            {isLoading
              ? isUpdating
                ? "Updating MusicBrainz"
                : "Checking local cache"
              : response
                ? `${formatNumber(response.ownedCount)} owned / ${formatNumber(response.missingCount)} missing scoped albums`
                : artist
                  ? "Not checked"
                  : "Select an artist"}
          </p>
        </div>
        <div className="panel-actions">
          <span
            className={`run-status run-status-${(response?.state ?? "unavailable").toLowerCase()}`}
          >
            {statusLabel}
          </span>
          <button
            className="icon-button"
            type="button"
            aria-label="Refresh MusicBrainz discography"
            disabled={!artist || isLoading}
            onClick={onRefresh}
          >
            <RotateCcw size={18} />
          </button>
        </div>
      </div>

      {!artist ? (
        <div className="empty-state large">
          <UsersRound size={20} />
          <span>Select an artist.</span>
        </div>
      ) : !response ? (
        <div className="empty-state large">
          <ShieldCheck size={20} />
          <span>
            {isLoading
              ? "Checking MusicBrainz cache."
              : "No MusicBrainz result yet."}
          </span>
        </div>
      ) : (
        <>
          <div
            className={`musicbrainz-status-strip musicbrainz-status-${response.state}`}
          >
            <span
              className={`run-status run-status-${response.state.toLowerCase()}`}
            >
              {statusLabel}
            </span>
            <span>{response.message}</span>
          </div>

          <dl className="performance-summary musicbrainz-artist-summary">
            <div>
              <dt>Completion</dt>
              <dd>
                {response.completion == null
                  ? "n/a"
                  : formatPercent(response.completion, 0)}
              </dd>
            </div>
            <div>
              <dt>Owned</dt>
              <dd>{formatNumber(response.ownedCount)}</dd>
            </div>
            <div>
              <dt>Missing</dt>
              <dd>{formatNumber(response.missingCount)}</dd>
            </div>
            <div>
              <dt>Filtered</dt>
              <dd>{formatNumber(response.excludedCount)}</dd>
            </div>
            <div>
              <dt>Scoped albums</dt>
              <dd>{formatNumber(response.pureAlbumCount)}</dd>
            </div>
            <div>
              <dt>Local albums</dt>
              <dd>{formatNumber(response.localAlbumCount)}</dd>
            </div>
            <div>
              <dt>Match</dt>
              <dd>{response.matchMethod}</dd>
            </div>
          </dl>

          <div className="musicbrainz-artist-meta">
            <span>{`Cache: ${response.matchedCacheName ?? "No cache artist"}`}</span>
            <span>{`Method: ${response.matchMethod}`}</span>
            <span>{`Trust: ${artistLinkLabel}`}</span>
            <span>
              {response.releaseGroupSource === "refreshed"
                ? `Source: refreshed${response.releaseGroupUpdatedAt ? ` ${formatDate(response.releaseGroupUpdatedAt)}` : ""}`
                : "Source: cache"}
            </span>
            {response.suspectMapping ? (
              <span>{`${formatNumber(response.cachedNameCount)} cache names / ${formatNumber(response.totalReleaseGroupCount)} release groups`}</span>
            ) : null}
          </div>

          {response.artistLinkIgnored ? null : (
            <>
              <div
                className="musicbrainz-export-controls"
                aria-label="Export selected artist MusicBrainz albums"
              >
                <div className="export-strip">
                  <button
                    type="button"
                    disabled={!canExport}
                    onClick={() => onExport("csv")}
                  >
                    <Download size={15} />
                    <span>CSV</span>
                  </button>
                  <button
                    type="button"
                    disabled={!canExport}
                    onClick={() => onExport("xlsx")}
                  >
                    <Download size={15} />
                    <span>XLSX</span>
                  </button>
                </div>
                {exportResult ? (
                  <ExportResultStatus result={exportResult} itemLabel="album" />
                ) : null}
              </div>
              <MusicBrainzArtistCandidateTable
                candidates={candidates}
                isLoading={isLoading}
                onOpenExternalUrl={onOpenExternalUrl}
                onVerifyCandidate={(candidate) =>
                  onSetArtistLink("verify", candidate.mbid, candidate.name)
                }
              />
              <MusicBrainzReleaseTable
                rows={rows}
                artistName={artist.name}
                onSetReleaseDecision={onSetReleaseDecision}
              />
            </>
          )}
          <small className="performance-database-path">
            {response.resolvedPath}
          </small>
        </>
      )}
    </section>
  );
}

function MusicBrainzArtistCandidateTable({
  candidates,
  isLoading,
  onOpenExternalUrl,
  onVerifyCandidate,
}: {
  candidates: MusicBrainzArtistCandidateRow[];
  isLoading: boolean;
  onOpenExternalUrl: (url: string) => void;
  onVerifyCandidate: (candidate: MusicBrainzArtistCandidateRow) => void;
}) {
  if (candidates.length === 0) {
    return null;
  }

  return (
    <div
      className="result-table musicbrainz-candidate-results"
      role="table"
      aria-label="MusicBrainz artist candidates"
    >
      <div className="result-table-head" role="row">
        <span role="columnheader">Candidate</span>
        <span role="columnheader">MBID</span>
        <span role="columnheader">Match</span>
        <span role="columnheader">Score</span>
        <span role="columnheader">Cache</span>
        <span role="columnheader">Review</span>
      </div>
      {candidates.map((candidate) => {
        const candidateUrl = `https://musicbrainz.org/artist/${encodeURIComponent(candidate.mbid)}`;
        return (
          <div
            className={`result-table-row musicbrainz-candidate-row${candidate.suspectMapping ? " suspect" : ""}`}
            role="row"
            key={`${candidate.mbid}:${candidate.name}`}
          >
            <span role="cell" title={candidate.name}>
              {candidate.name}
            </span>
            <span role="cell">
              <a
                href={candidateUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => {
                  event.preventDefault();
                  onOpenExternalUrl(candidateUrl);
                }}
              >
                {candidate.mbid}
                <ExternalLink size={13} aria-hidden="true" />
              </a>
            </span>
            <span role="cell">{candidate.matchMethod}</span>
            <span role="cell">{formatPercent(candidate.score, 0)}</span>
            <span role="cell">{`${formatNumber(candidate.cachedNameCount)} names / ${formatNumber(candidate.totalReleaseGroupCount)} groups`}</span>
            <span role="cell" className="musicbrainz-candidate-action">
              <button
                className="icon-button"
                type="button"
                title={`Verify ${candidate.name}`}
                aria-label={`Verify ${candidate.name} as the MusicBrainz artist match`}
                disabled={isLoading}
                onClick={() => onVerifyCandidate(candidate)}
              >
                <Check size={16} />
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function MusicBrainzReleaseTable({
  rows,
  artistName,
  onSetReleaseDecision,
}: {
  rows: MusicBrainzArtistReleaseRow[];
  artistName: string;
  onSetReleaseDecision: (
    row: MusicBrainzArtistReleaseRow,
    decision: "not-in-scope" | "include",
  ) => void;
}) {
  const visibleRows = rows.filter((row) => row.status !== "excluded");
  const [wishListReleaseIds, setWishListReleaseIds] = useState<Set<string>>(new Set());
  const [addingReleaseId, setAddingReleaseId] = useState<string | null>(null);
  const [wishListError, setWishListError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    void listWishList()
      .then((wishList) => {
        if (!disposed) {
          setWishListReleaseIds(
            new Set(
              wishList.items.flatMap((item) =>
                item.entity === "album" && item.musicbrainzId
                  ? [item.musicbrainzId]
                  : [],
              ),
            ),
          );
        }
      })
      .catch((loadError) => {
        if (!disposed) {
          setWishListError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      });
    return () => {
      disposed = true;
    };
  }, []);

  async function addReleaseToWishList(row: MusicBrainzArtistReleaseRow) {
    if (addingReleaseId || wishListReleaseIds.has(row.releaseMbid)) return;
    setAddingReleaseId(row.releaseMbid);
    setWishListError(null);
    try {
      await addWishListItem({
        entity: "album",
        title: row.title,
        artist: artistName,
        year: row.year,
        musicbrainzId: row.releaseMbid,
        musicbrainzUrl: `https://musicbrainz.org/release-group/${encodeURIComponent(row.releaseMbid)}`,
        source: "MusicBrainz discography",
      });
      setWishListReleaseIds((previous) => new Set(previous).add(row.releaseMbid));
    } catch (addError) {
      setWishListError(addError instanceof Error ? addError.message : String(addError));
    } finally {
      setAddingReleaseId(null);
    }
  }

  if (visibleRows.length === 0) {
    return (
      <div className="empty-state">
        <FileSearch size={18} />
        <span>No in-scope MusicBrainz albums found.</span>
      </div>
    );
  }

  return (
    <div className="result-table musicbrainz-release-results" role="table">
      <div className="result-table-head" role="row">
        <span role="columnheader">MusicBrainz album</span>
        <span role="columnheader">Year</span>
        <span role="columnheader">Status</span>
        <span role="columnheader">Local match</span>
        <span role="columnheader">Confidence</span>
        <span role="columnheader">Actions</span>
      </div>
      {visibleRows.map((row) => (
        <div
          className={`result-table-row musicbrainz-release-row ${row.status}`}
          role="row"
          key={row.releaseMbid}
        >
          <span role="cell" title={row.title}>
            {row.title}
          </span>
          <span role="cell">{row.year ?? ""}</span>
          <span role="cell">
            <RunStatus status={row.status} />
          </span>
          <span role="cell" title={row.localAlbumTitle ?? ""}>
            {row.localAlbumTitle
              ? `${row.localAlbumTitle}${row.localYear ? ` (${row.localYear})` : ""}`
              : ""}
          </span>
          <span role="cell">
            {row.status === "owned" ? formatPercent(row.confidence, 0) : ""}
          </span>
          <span role="cell" className="musicbrainz-scope-action">
            {row.status === "excluded" ? (
              <button
                className="icon-button"
                type="button"
                title="Include in MusicBrainz album comparison"
                aria-label={`Include ${row.title} in MusicBrainz album comparison`}
                onClick={() => onSetReleaseDecision(row, "include")}
              >
                <RotateCcw size={16} />
              </button>
            ) : row.status === "missing" ? (
              <>
                <button
                  className={`icon-button${wishListReleaseIds.has(row.releaseMbid) ? " active" : ""}`}
                  type="button"
                  title={wishListReleaseIds.has(row.releaseMbid) ? "Already on Wish List" : "Add to Wish List"}
                  aria-label={`${wishListReleaseIds.has(row.releaseMbid) ? "Added" : "Add"} ${row.title} to Wish List`}
                  disabled={
                    wishListReleaseIds.has(row.releaseMbid) ||
                    addingReleaseId === row.releaseMbid
                  }
                  onClick={() => void addReleaseToWishList(row)}
                >
                  {wishListReleaseIds.has(row.releaseMbid) ? <Check size={16} /> : <Heart size={16} />}
                </button>
                <button
                  className="icon-button"
                  type="button"
                  title="Mark not in scope"
                  aria-label={`Mark ${row.title} as not in scope`}
                  onClick={() => onSetReleaseDecision(row, "not-in-scope")}
                >
                  <Ban size={16} />
                </button>
              </>
            ) : null}
          </span>
        </div>
      ))}
      {wishListError ? <p className="error-message musicbrainz-wish-list-error">{wishListError}</p> : null}
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
          {billboardLabel ? (
            <span className="billboard-badge">{billboardLabel}</span>
          ) : null}
        </strong>
        <span>{row.albumArtistDisplay ?? ""}</span>
        <span>{row.canonicalGenre ?? ""}</span>
        <span className="artist-album-card-meta">
          <RatingStars
            value={row.effectiveAlbumRating}
            label="Album rating"
            showValue={false}
          />
          {row.lovedTracks ? (
            <span
              className="artist-album-love-count"
              aria-label={`${formatNumber(row.lovedTracks)} loved tracks`}
            >
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
    <div
      className="artist-album-track-list"
      role="table"
      aria-label="Selected artist album tracks"
    >
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
            <span
              className={`artist-track-love${isLoved ? " active" : ""}`}
              role="cell"
              aria-label={isLoved ? "Loved" : "Not loved"}
            >
              {isLoved ? (
                <Heart size={15} fill="currentColor" aria-hidden="true" />
              ) : null}
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
    <section
      className="artist-album-expanded"
      aria-label={`${album.album ?? "Selected album"} tracks`}
    >
      <div className="artist-album-expanded-cover">
        <AlbumCover
          row={album}
          className="artist-album-expanded-art"
          decorative={false}
        />
      </div>
      <div className="artist-album-expanded-content">
        <div className="artist-album-expanded-header">
          <div>
            <div className="artist-album-expanded-title">
              <h3>
                <span>{album.album ?? "Untitled"}</span>
                {billboardLabel ? (
                  <span className="billboard-badge">{billboardLabel}</span>
                ) : null}
              </h3>
              <Play size={17} aria-hidden="true" />
            </div>
            <p>
              {[album.albumArtistDisplay, album.year, album.canonicalGenre]
                .filter(Boolean)
                .join(" / ")}
            </p>
            <span className="artist-album-expanded-meta">
              <RatingStars
                value={album.effectiveAlbumRating}
                label="Album rating"
              />
              <span>{formatNumber(album.totalTracks)} tracks</span>
              <span>{formatMinutes(album.totalSeconds)}</span>
            </span>
          </div>
          <button
            className="artist-album-close"
            type="button"
            aria-label="Close album tracks"
            onClick={onClose}
          >
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

  const selectedIndex = response.rows.findIndex(
    (row) => row.albumId === selectedAlbumId,
  );
  const insertAfterIndex =
    selectedIndex >= 0
      ? Math.min(
          response.rows.length - 1,
          Math.floor(selectedIndex / 3) * 3 + 2,
        )
      : -1;

  return (
    <div className="artist-album-board">
      <div className="artist-album-cover-grid">
        {response.rows.map((row, index) => (
          <Fragment key={row.id}>
            <ArtistAlbumCoverCard
              row={row}
              isSelected={row.albumId === selectedAlbumId}
              onSelect={onSelect}
            />
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
          <p>
            {[
              formatYearSpan(artist.firstYear, artist.lastYear),
              artist.topGenre,
            ]
              .filter(Boolean)
              .join(" / ")}
          </p>
        </div>
      </div>

      <div
        className="cover-placeholder album-cover-large artist-cover-large"
        aria-hidden="true"
      >
        <span>{artistInitial(artist)}</span>
      </div>

      <dl className="run-details artist-detail-stats">
        <div>
          <dt>Albums</dt>
          <dd>{`${formatNumber(artist.ratedAlbumCount)} / ${formatNumber(artist.albumCount)} fully rated`}</dd>
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
            onChange={(event) =>
              onIncludeCalculatedChange(event.target.checked)
            }
          />
          <span>Calculated columns</span>
        </label>
        <div className="export-grid">
          {["csv", "tsv", "xlsx", "json", "txt"].map((format) => (
            <button
              type="button"
              key={format}
              onClick={() => void onExport(format)}
            >
              <Download size={16} />
              <span>{format.toUpperCase()}</span>
            </button>
          ))}
        </div>
        {exportResult ? (
          <ExportResultStatus result={exportResult} itemLabel="album" />
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
              <span
                className="cover-placeholder cover-mini genre-mini"
                aria-hidden="true"
              >
                <span>{genreInitial(genre)}</span>
              </span>
              <span>
                <strong>{genre.name}</strong>
                <small>{formatNumber(genre.trackCount)} tracks</small>
              </span>
            </span>
            <span role="cell">{formatNumber(genre.albumCount)}</span>
            <span role="cell">
              {formatYearSpan(genre.firstYear, genre.lastYear)}
            </span>
            <span role="cell">{genre.topArtist ?? ""}</span>
            <span role="cell">
              {formatPercent(genre.averageRatingCompleteness)}
            </span>
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
          <p>
            {[formatYearSpan(genre.firstYear, genre.lastYear), genre.topArtist]
              .filter(Boolean)
              .join(" / ")}
          </p>
        </div>
      </div>

      <div
        className="cover-placeholder album-cover-large genre-cover-large"
        aria-hidden="true"
      >
        <span>{genreInitial(genre)}</span>
      </div>

      <dl className="run-details genre-detail-stats">
        <div>
          <dt>Albums</dt>
          <dd>{`${formatNumber(genre.ratedAlbumCount)} / ${formatNumber(genre.albumCount)} fully rated`}</dd>
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
            onChange={(event) =>
              onIncludeCalculatedChange(event.target.checked)
            }
          />
          <span>Calculated columns</span>
        </label>
        <div className="export-grid">
          {["csv", "tsv", "xlsx", "json", "txt"].map((format) => (
            <button
              type="button"
              key={format}
              onClick={() => void onExport(format)}
            >
              <Download size={16} />
              <span>{format.toUpperCase()}</span>
            </button>
          ))}
        </div>
        {exportResult ? (
          <ExportResultStatus result={exportResult} itemLabel="album" />
        ) : null}
      </section>
    </aside>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={`tool-severity tool-severity-${severity}`}>
      {severityLabel(severity)}
    </span>
  );
}

function musicToolScopeLabel(scope: MusicToolScope) {
  switch (scope) {
    case "artists":
      return "Artists";
    case "tracks":
      return "Tracks";
    default:
      return "Albums";
  }
}

function musicToolAffectedLabel(scope: MusicToolScope) {
  switch (scope) {
    case "artists":
      return "Affected artists";
    case "tracks":
      return "Affected tracks";
    default:
      return "Affected albums";
  }
}

function musicToolAffectedCount(tool: MusicToolSummary) {
  return tool.scope === "tracks" ? tool.trackCount : tool.albumCount;
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
        <span role="columnheader">Scope</span>
        <span role="columnheader">Severity</span>
        <span role="columnheader">Issues</span>
        <span role="columnheader">Affected</span>
      </div>
      {tools.map((tool) => {
        const isSelected = tool.id === selectedToolId;
        const selectedProgress =
          isSelected && isMusicToolProgressActive(progress)
            ? formatToolProgress(progress)
            : null;
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
            <span role="cell">{musicToolScopeLabel(tool.scope)}</span>
            <span role="cell">
              <SeverityBadge severity={tool.severity} />
            </span>
            <span
              className={selectedProgress ? "tool-count-progress" : undefined}
              role="cell"
            >
              {selectedProgress ?? formatToolCount(tool.issueCount)}
            </span>
            <span role="cell">
              {formatToolCount(musicToolAffectedCount(tool))}
            </span>
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
            {progress?.message ?? "Counting selected tool."}{" "}
            {formatToolProgress(progress)}
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
    let emptyMessage = "No matching issues.";
    if (response.tool.id === "missing-billboard-albums") {
      emptyMessage =
        "No missing Billboard albums. If you expected rows, import the Billboard CSV folder once.";
    } else if (response.tool.id === "missing-billboard-singles") {
      emptyMessage =
        "No missing Billboard singles. If you expected rows, import the Billboard singles CSV folder once.";
    } else if (response.tool.id === "artists-without-musicbrainz-data") {
      emptyMessage =
        "Every library artist has a usable MusicBrainz cache or verified overlay match.";
    } else if (
      response.tool.id === "high-confidence-missing-musicbrainz-albums"
    ) {
      emptyMessage = "No high-confidence missing MusicBrainz albums found.";
    } else if (
      response.tool.id === "albums-not-on-musicbrainz-official-list" &&
      response.tool.issueCount === 0
    ) {
      emptyMessage =
        "Every comparable local album appears on its artist's pure official MusicBrainz album list.";
    }

    return (
      <div className="empty-state large">
        <ShieldCheck size={20} />
        <span>{emptyMessage}</span>
      </div>
    );
  }

  const primaryHeader = response.tool.scope === "artists" ? "Artist" : "Album";
  const secondaryHeader =
    response.tool.scope === "artists" ? "Sample album" : "Track";

  return (
    <div className="result-table tool-issue-results" role="table">
      <div className="result-table-head" role="row">
        <span role="columnheader">Issue</span>
        <span role="columnheader">{primaryHeader}</span>
        <span role="columnheader">{secondaryHeader}</span>
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
            <small>
              {[issue.albumArtistDisplay, issue.year]
                .filter(Boolean)
                .join(" / ")}
            </small>
          </span>
          <span role="cell">
            <strong>
              {issue.title ??
                (issue.entityType === "albums"
                  ? "Album-level"
                  : issue.entityType === "artists"
                    ? "Artist-level"
                    : "Untitled")}
            </strong>
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
        <ExportResultStatus result={exportResult} itemLabel="issue" />
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
      <aside
        className="detail-panel tools-detail"
        aria-label="Music tools details"
      >
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
  const affectedLabel = musicToolAffectedLabel(tool.scope);
  const affectedCount = musicToolAffectedCount(tool);

  return (
    <aside
      className="detail-panel tools-detail"
      aria-label="Music tools details"
    >
      <div className="detail-header">
        <Wrench size={20} />
        <div>
          <h2>{tool.label}</h2>
          <p>
            {severityLabel(tool.severity)} / {musicToolScopeLabel(tool.scope)}
          </p>
        </div>
      </div>

      <dl className="run-details tool-detail-stats">
        <div>
          <dt>Issue rows</dt>
          <dd>
            {isProgressActive && progressText
              ? progressText
              : formatToolCount(tool.issueCount)}
          </dd>
        </div>
        <div>
          <dt>{affectedLabel}</dt>
          <dd>{formatToolCount(affectedCount)}</dd>
        </div>
        <div>
          <dt>Severity</dt>
          <dd>{severityLabel(tool.severity)}</dd>
        </div>
      </dl>

      {progress ? (
        <section
          className="progress-block tool-progress-block"
          aria-live="polite"
        >
          <div className="progress-row">
            <span>{progress.message}</span>
            <strong>{progressText}</strong>
          </div>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{
                width: `${Math.min(100, Math.max(0, progress.percent))}%`,
              }}
            />
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
          <span>
            {tool.id === "whitespace-anomalies"
              ? "Guided repair includes exact diffs, backup, history, and undo"
              : "Issue rows are read-only"}
          </span>
        </div>
      </section>

      <section className="export-box">
        <div className="export-grid">
          {EXPORT_FORMATS.map((format) => (
            <button
              type="button"
              key={format}
              onClick={() => void onExport(format)}
            >
              <Download size={16} />
              <span>{format.toUpperCase()}</span>
            </button>
          ))}
        </div>
        {exportResult ? (
          <ExportResultStatus result={exportResult} itemLabel="issue" />
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
  countryFlagDisplay,
}: {
  response: BrowseResponse | null;
  config: ChartConfig;
  displaySort: BrowseSort | null;
  onSort: (field: string) => void;
  countryFlagDisplay: CountryFlagDisplay;
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
                {formatBillboardRank(row) ? (
                  <span className="billboard-badge">
                    {formatBillboardRank(row)}
                  </span>
                ) : null}
              </h3>
              <p className="chart-list-meta">
                {row.albumArtistDisplay ? (
                  <span>{row.albumArtistDisplay}</span>
                ) : null}
                {formatOriginCountry(row) ? (
                  <CountryDisplay value={row} mode={countryFlagDisplay} />
                ) : null}
                {row.year ? <span>{row.year}</span> : null}
                {row.canonicalGenre ? <span>{row.canonicalGenre}</span> : null}
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
                <p
                  className="chart-grid-artist"
                  title={row.albumArtistDisplay ?? ""}
                >
                  {row.albumArtistDisplay ?? ""}
                </p>
                {billboardLabel ? (
                  <span className="billboard-badge chart-grid-billboard">
                    {billboardLabel}
                  </span>
                ) : null}
                <span className="chart-grid-score">
                  {formatChartMetric(row, config.rankingMetric)}
                </span>
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
    {
      key: "rank",
      label: "#",
      value: (_row: BrowseRow, rank: number) => `${rank}`,
    },
    {
      key: "album",
      label: "Album",
      sortField: "album",
      className: "album-title-cell",
      value: (row: BrowseRow) => (
        <AlbumTitleContents row={row} showBillboardBadge={false} />
      ),
    },
    {
      key: "artist",
      label: "Artist",
      sortField: "artist",
      value: (row: BrowseRow) => row.albumArtistDisplay ?? "",
    },
    {
      key: "year",
      label: "Year",
      sortField: "year",
      value: (row: BrowseRow) => row.year?.toString() ?? "",
    },
    {
      key: "genre",
      label: "Genre",
      sortField: "genre",
      value: (row: BrowseRow) => row.canonicalGenre ?? "",
    },
    {
      key: "originCountry",
      label: "Origin",
      sortField: "originCountry",
      value: (row: BrowseRow) => (
        <CountryDisplay value={row} mode={countryFlagDisplay} />
      ),
    },
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
    {
      key: "ae",
      label: "AE",
      sortField: "ae",
      value: (row: BrowseRow) => formatPercent(row.aeRatio, 2),
    },
    {
      key: "tmoe",
      label: "TMOE",
      sortField: "tmoe",
      value: (row: BrowseRow) => formatMinutes(row.tmoeSeconds),
    },
    {
      key: "minutes",
      label: "Minutes",
      sortField: "totalMinutes",
      value: (row: BrowseRow) => formatMinutes(row.totalSeconds),
    },
  ].filter(
    (column) =>
      ["rank", "album", "artist", "year", "genre"].includes(column.key) ||
      visibleColumns.has(column.key),
  );
  const activeSort: BrowseSort = displaySort ?? {
    field: config.rankingMetric,
    direction: config.sortDirection,
  };
  const displayRows = response.rows.map((row, index) => ({
    row,
    rank: index + 1,
  }));
  if (displaySort) {
    displayRows.sort((left, right) => {
      const comparison = compareBrowseRows(
        left.row,
        right.row,
        displaySort.field,
      );
      return displaySort.direction === "desc" ? -comparison : comparison;
    });
  }

  return (
    <div className="result-table chart-results" role="table">
      <div className="result-table-head" role="row">
        {columns.map((column) =>
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
          ),
        )}
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
  onSelect,
}: {
  label: string;
  value: number;
  total: number;
  detail: string;
  onSelect?: () => void;
}) {
  return (
    <div
      className={`meter-row${onSelect ? " actionable-cohort" : ""}`}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect}
      onKeyDown={
        onSelect
          ? (event) => discoveryKeyOpen(event, onSelect)
          : undefined
      }
    >
      <div>
        <span>{label}</span>
        <strong>{formatNumber(value)}</strong>
      </div>
      <div className="meter-track" aria-hidden="true">
        <div
          className="meter-fill"
          style={{ width: `${percentOf(value, total)}%` }}
        />
      </div>
      <small>{detail}</small>
    </div>
  );
}

function DistributionBars({
  buckets,
  onSelect,
}: {
  buckets: RatingBucket[];
  onSelect?: (bucket: RatingBucket) => void;
}) {
  const maxCount = Math.max(1, ...buckets.map((bucket) => bucket.count));
  return (
    <div className="distribution-bars">
      {buckets.map((bucket) => (
        <div
          className={`distribution-row${onSelect ? " actionable-cohort" : ""}`}
          role={onSelect ? "button" : undefined}
          tabIndex={onSelect ? 0 : undefined}
          key={bucket.label}
          onClick={onSelect ? () => onSelect(bucket) : undefined}
          onKeyDown={
            onSelect
              ? (event) =>
                  discoveryKeyOpen(event, () => onSelect(bucket))
              : undefined
          }
        >
          <span>{bucket.label}</span>
          <div className="meter-track" aria-hidden="true">
            <div
              className="meter-fill"
              style={{ width: `${percentOf(bucket.count, maxCount)}` + "%" }}
            />
          </div>
          <strong>{formatNumber(bucket.count)}</strong>
        </div>
      ))}
    </div>
  );
}

function LibraryHealthScorePanel({
  statistics,
}: {
  statistics: StatisticsResponse | null;
}) {
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
      <div
        className="health-score-ring"
        style={ringStyle}
        aria-label={`Library health score ${score} of 100`}
      >
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
              <div
                className="meter-fill"
                style={{ width: `${component.value * 100}%` }}
              />
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

function RatingCompletionBurndown({
  statistics,
  onSelect,
}: {
  statistics: StatisticsResponse | null;
  onSelect: (cohort: InsightCohort) => void;
}) {
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
      const x =
        42 + (points.length === 1 ? 0.5 : index / (points.length - 1)) * 320;
      const y = 194 - (point.unratedTracks / maxUnrated) * 152;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const latest = points[points.length - 1];
  const totalTracks = latest.trackCount || statistics.overview.trackCount;
  const milestone = nextMilestone(latest.ratedTracks, totalTracks);

  return (
    <div className="burndown-panel">
      <svg
        className="burndown-chart"
        viewBox="0 0 400 230"
        role="img"
        aria-label="Unrated tracks over rating history"
      >
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
          const x =
            42 +
            (points.length === 1 ? 0.5 : index / (points.length - 1)) * 320;
          const y = 194 - (point.unratedTracks / maxUnrated) * 152;
          return (
            <circle key={point.importRunId} cx={x} cy={y} r={5}>
              <title>
                {formatDate(point.createdAt)}:{" "}
                {formatNumber(point.unratedTracks)} unrated tracks
              </title>
            </circle>
          );
        })}
      </svg>
      <div className="burndown-summary">
        <div
          className="actionable-cohort"
          role="button"
          tabIndex={0}
          onClick={() =>
            onSelect(
              ratingProgressCohort("rated-tracks", latest.ratedTracks),
            )
          }
          onKeyDown={(event) =>
            discoveryKeyOpen(event, () =>
              onSelect(
                ratingProgressCohort("rated-tracks", latest.ratedTracks),
              ),
            )
          }
        >
          <span>Rated now</span>
          <strong>
            {formatPercent(ratioOf(latest.ratedTracks, totalTracks))}
          </strong>
        </div>
        <div
          className="actionable-cohort"
          role="button"
          tabIndex={0}
          onClick={() =>
            onSelect(
              ratingProgressCohort("unrated-tracks", latest.unratedTracks),
            )
          }
          onKeyDown={(event) =>
            discoveryKeyOpen(event, () =>
              onSelect(
                ratingProgressCohort(
                  "unrated-tracks",
                  latest.unratedTracks,
                ),
              ),
            )
          }
        >
          <span>Remaining</span>
          <strong>{formatNumber(latest.unratedTracks)}</strong>
        </div>
        <div>
          <span>Next milestone</span>
          <strong>
            {milestone
              ? `${formatNumber(milestone.remaining)} to ${milestone.label}`
              : "Complete"}
          </strong>
        </div>
      </div>
    </div>
  );
}

function DecadeProgressTimeline({
  rows,
  onSelect,
}: {
  rows: DecadeProgressStats[];
  onSelect: (cohort: InsightCohort) => void;
}) {
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
        <div
          className="decade-row actionable-cohort"
          role="button"
          tabIndex={0}
          key={row.decade}
          onClick={() => onSelect(decadeCohort(row, "Decade progress"))}
          onKeyDown={(event) =>
            discoveryKeyOpen(event, () =>
              onSelect(decadeCohort(row, "Decade progress")),
            )
          }
        >
          <div>
            <strong>{row.decade}s</strong>
            <span>
              {formatNumber(row.albumCount)} albums /{" "}
              {formatHours(row.totalSeconds)}
            </span>
          </div>
          <div
            className="stacked-track"
            aria-label={`${row.decade}s rating progress`}
          >
            <span
              className="segment rated"
              style={{
                width: `${percentOf(row.ratedAlbumCount, row.albumCount)}%`,
              }}
            />
            <span
              className="segment partial"
              style={{
                width: `${percentOf(row.partialAlbumCount, row.albumCount)}%`,
              }}
            />
            <span
              className="segment unrated"
              style={{
                width: `${percentOf(row.unratedAlbumCount, row.albumCount)}%`,
              }}
            />
          </div>
          <small>
            {formatNumber(row.ratedAlbumCount)} rated /{" "}
            {formatNumber(row.partialAlbumCount)} partial /{" "}
            {formatNumber(row.unratedAlbumCount)} open
          </small>
        </div>
      ))}
    </div>
  );
}

function genreCompletionRatio(row: GenreProgressStats) {
  if (row.albumCount <= 0) return 0;
  return Math.max(
    0,
    Math.min(
      1,
      (row.ratedAlbumCount + row.partialAlbumCount * 0.5) / row.albumCount,
    ),
  );
}

function GenrePortfolioMatrix({
  rows,
  onSelect,
}: {
  rows: GenreProgressStats[];
  onSelect: (cohort: InsightCohort) => void;
}) {
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
    <svg
      className="genre-portfolio-chart"
      viewBox="0 0 430 250"
      role="img"
      aria-label="Genre size, score, and completion matrix"
    >
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
        const x =
          44 +
          normalizedValue(
            row.averageAlbumScore,
            scoreExtent.min,
            scoreExtent.max,
          ) *
            354;
        const y = 204 - completion * 170;
        const radius =
          7 +
          Math.sqrt(
            normalizedValue(row.albumCount, albumExtent.min, albumExtent.max),
          ) *
            17;
        const fill = `hsl(${185 - completion * 40} 62% ${72 - completion * 18}%)`;
        return (
          <g
            className="genre-portfolio-point actionable-cohort"
            role="button"
            tabIndex={0}
            key={row.genre}
            onClick={() => onSelect(genreCohort(row))}
            onKeyDown={(event) =>
              discoveryKeyOpen(event, () => onSelect(genreCohort(row)))
            }
          >
            <circle cx={x} cy={y} r={radius} style={{ fill }}>
              <title>
                {row.genre}: {formatNumber(row.albumCount)} albums /{" "}
                {formatPercent(completion)} complete /{" "}
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
    ...rows.map(
      (run) => run.addedTracks + run.changedTracks + run.removedTracks,
    ),
  );

  return (
    <div className="import-delta-timeline">
      {rows.map((run) => {
        const totalDelta =
          run.addedTracks + run.changedTracks + run.removedTracks;
        return (
          <div className="import-delta-row" key={run.id}>
            <div>
              <strong>{formatDate(run.completedAt)}</strong>
              <span>{formatNumber(run.ratingEventsCount)} rating events</span>
            </div>
            <div
              className="delta-track"
              aria-label={`Import ${run.id} track deltas`}
            >
              <span
                className="delta added"
                style={{ width: `${percentOf(run.addedTracks, maxDelta)}%` }}
              />
              <span
                className="delta changed"
                style={{ width: `${percentOf(run.changedTracks, maxDelta)}%` }}
              />
              <span
                className="delta removed"
                style={{ width: `${percentOf(run.removedTracks, maxDelta)}%` }}
              />
            </div>
            <small>
              {formatSignedNumber(run.addedTracks)} added /{" "}
              {formatNumber(run.changedTracks)} changed /{" "}
              {formatNumber(run.removedTracks)} removed /{" "}
              {formatNumber(totalDelta)} touched
            </small>
          </div>
        );
      })}
    </div>
  );
}

function MetadataCoveragePanel({
  metrics,
  onSelect,
}: {
  metrics: MetadataCoverageMetric[];
  onSelect: (cohort: InsightCohort) => void;
}) {
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
        const insight = missingMetadataCohort(metric);
        return (
          <div
            className={`metadata-coverage-row${insight ? " actionable-cohort" : ""}`}
            role={insight ? "button" : undefined}
            tabIndex={insight ? 0 : undefined}
            key={metric.id}
            onClick={insight ? () => onSelect(insight) : undefined}
            onKeyDown={
              insight
                ? (event) =>
                    discoveryKeyOpen(event, () => onSelect(insight))
                : undefined
            }
          >
            <div>
              <strong>{metric.label}</strong>
              <span>{metric.scope}</span>
            </div>
            <div className="meter-track" aria-hidden="true">
              <div
                className="meter-fill"
                style={{ width: `${coverage * 100}%` }}
              />
            </div>
            <small>
              {formatPercent(coverage, 0)} / {formatNumber(metric.coveredCount)}{" "}
              of {formatNumber(metric.totalCount)}
            </small>
          </div>
        );
      })}
    </div>
  );
}

function LibraryShapeByTime({
  statistics,
  onSelect,
}: {
  statistics: StatisticsResponse | null;
  onSelect: (cohort: InsightCohort) => void;
}) {
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
            {shape.peakYear == null
              ? "Unknown"
              : `${shape.peakYear} / ${formatNumber(shape.peakYearAlbums)}`}
          </strong>
        </div>
      </div>
      <div className="shape-time-bars">
        {rows.map((row) => (
          <div
            className="shape-time-row actionable-cohort"
            role="button"
            tabIndex={0}
            key={row.decade}
            onClick={() => onSelect(decadeCohort(row, "Library shape"))}
            onKeyDown={(event) =>
              discoveryKeyOpen(event, () =>
                onSelect(decadeCohort(row, "Library shape")),
              )
            }
          >
            <strong>{row.decade}s</strong>
            <div>
              <span>Albums</span>
              <div className="meter-track" aria-hidden="true">
                <div
                  className="meter-fill"
                  style={{ width: `${percentOf(row.albumCount, maxAlbums)}%` }}
                />
              </div>
            </div>
            <div>
              <span>Tracks</span>
              <div className="meter-track" aria-hidden="true">
                <div
                  className="meter-fill secondary"
                  style={{ width: `${percentOf(row.trackCount, maxTracks)}%` }}
                />
              </div>
            </div>
            <div>
              <span>Hours</span>
              <div className="meter-track" aria-hidden="true">
                <div
                  className="meter-fill warm"
                  style={{
                    width: `${percentOf(row.totalSeconds, maxSeconds)}%`,
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LovedDensityPanel({
  rows,
  onSelect,
}: {
  rows: LovedDensityStat[];
  onSelect: (cohort: InsightCohort) => void;
}) {
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
      {rows.slice(0, 12).map((row) => {
        const insight = lovedDensityCohort(row);
        return (
        <div
          className={`loved-density-row${insight ? " actionable-cohort" : ""}`}
          role={insight ? "button" : undefined}
          tabIndex={insight ? 0 : undefined}
          key={`${row.scope}:${row.label}`}
          onClick={insight ? () => onSelect(insight) : undefined}
          onKeyDown={
            insight
              ? (event) =>
                  discoveryKeyOpen(event, () => onSelect(insight))
              : undefined
          }
        >
          <div>
            <strong>{row.label}</strong>
            <span>{row.scope}</span>
          </div>
          <div className="meter-track" aria-hidden="true">
            <div
              className="meter-fill"
              style={{
                width: `${percentOf(row.lovedPer100Tracks, maxDensity)}%`,
              }}
            />
          </div>
          <small>
            {row.lovedPer100Tracks.toFixed(2)} / 100 /{" "}
            {formatNumber(row.lovedTracks)} loved
          </small>
        </div>
      )})}
    </div>
  );
}

function concentrationLabel(scope: string, point: ConcentrationPoint) {
  return `Top ${point.topN} ${scope}`;
}

function ConcentrationBars({
  scope,
  points,
}: {
  scope: string;
  points: ConcentrationPoint[];
}) {
  return (
    <div className="concentration-bars">
      {points.map((point) => (
        <div className="concentration-row" key={`${scope}:${point.topN}`}>
          <div>
            <strong>{concentrationLabel(scope, point)}</strong>
            <span>{formatNumber(point.albumCount)} albums</span>
          </div>
          <div className="meter-track" aria-hidden="true">
            <div
              className="meter-fill"
              style={{ width: `${point.share * 100}%` }}
            />
          </div>
          <small>{formatPercent(point.share, 1)}</small>
        </div>
      ))}
    </div>
  );
}

function CatalogConcentrationPanel({
  statistics,
  onSelect,
}: {
  statistics: StatisticsResponse | null;
  onSelect: (cohort: InsightCohort) => void;
}) {
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
        <div
          className={
            concentration.topArtist ? "actionable-cohort" : undefined
          }
          role={concentration.topArtist ? "button" : undefined}
          tabIndex={concentration.topArtist ? 0 : undefined}
          onClick={() => {
            const artist = concentration.topArtist;
            if (artist) {
              onSelect(
                catalogArtistCohort(
                  artist,
                  concentration.topArtistAlbumCount,
                ),
              );
            }
          }}
          onKeyDown={(event) => {
            const artist = concentration.topArtist;
            if (artist) {
              discoveryKeyOpen(event, () =>
                onSelect(
                  catalogArtistCohort(
                    artist,
                    concentration.topArtistAlbumCount,
                  ),
                ),
              );
            }
          }}
        >
          <span>Top artist</span>
          <strong>{concentration.topArtist ?? "Unknown"}</strong>
          <small>
            {formatNumber(concentration.topArtistAlbumCount)} albums
          </small>
        </div>
        <div
          className={concentration.topGenre ? "actionable-cohort" : undefined}
          role={concentration.topGenre ? "button" : undefined}
          tabIndex={concentration.topGenre ? 0 : undefined}
          onClick={() => {
            const genre = concentration.topGenre;
            if (genre) {
              onSelect(
                catalogGenreCohort(
                  genre,
                  concentration.topGenreAlbumCount,
                ),
              );
            }
          }}
          onKeyDown={(event) => {
            const genre = concentration.topGenre;
            if (genre) {
              discoveryKeyOpen(event, () =>
                onSelect(
                  catalogGenreCohort(
                    genre,
                    concentration.topGenreAlbumCount,
                  ),
                ),
              );
            }
          }}
        >
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
  return [album.albumArtistDisplay, album.album, album.year]
    .filter(Boolean)
    .join(" / ");
}

function DurationAlbumList({
  title,
  albums,
  onSelect,
}: {
  title: string;
  albums: DurationAlbumStat[];
  onSelect: (cohort: InsightCohort) => void;
}) {
  return (
    <div className="duration-album-list">
      <span>{title}</span>
      {albums.slice(0, 4).map((album) => (
        <div
          className="duration-album-row actionable-cohort"
          role="button"
          tabIndex={0}
          key={album.albumId}
          onClick={() => onSelect(durationAlbumCohort(album))}
          onKeyDown={(event) =>
            discoveryKeyOpen(event, () =>
              onSelect(durationAlbumCohort(album)),
            )
          }
        >
          <strong>{durationAlbumLabel(album) || "Untitled"}</strong>
          <small>
            {formatHours(album.totalSeconds)} /{" "}
            {formatNumber(album.totalTracks)} tracks /{" "}
            {formatPercent(album.ratingCompleteness, 0)} complete
          </small>
        </div>
      ))}
    </div>
  );
}

function DurationAnalyticsPanel({
  statistics,
  onSelect,
}: {
  statistics: StatisticsResponse | null;
  onSelect: (cohort: InsightCohort) => void;
}) {
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
      <DistributionBars
        buckets={analytics.trackCountBuckets}
        onSelect={(bucket) => {
          const insight = trackCountBucketCohort(bucket);
          if (insight) onSelect(insight);
        }}
      />
      <DurationAlbumList
        title="Longest albums"
        albums={analytics.longestAlbums}
        onSelect={onSelect}
      />
      <DurationAlbumList
        title="Shortest albums"
        albums={analytics.shortestAlbums}
        onSelect={onSelect}
      />
    </div>
  );
}

function OutlierStatsPanel({
  rows,
  onSelect,
}: {
  rows: OutlierStat[];
  onSelect: (cohort: InsightCohort) => void;
}) {
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
      {rows.map((row) => {
        const insight = outlierCohort(row);
        return (
        <article
          className={`outlier-stat${insight ? " actionable-cohort" : ""}`}
          role={insight ? "button" : undefined}
          tabIndex={insight ? 0 : undefined}
          key={row.id}
          onClick={insight ? () => onSelect(insight) : undefined}
          onKeyDown={
            insight
              ? (event) =>
                  discoveryKeyOpen(event, () => onSelect(insight))
              : undefined
          }
        >
          <span>{row.label}</span>
          <strong>{row.value}</strong>
          <small>{row.detail}</small>
        </article>
      )})}
    </div>
  );
}

function clampRatio(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function normalizedValue(
  value: number | null | undefined,
  min: number,
  max: number,
) {
  if (value == null || !Number.isFinite(value) || max <= min) return 0.5;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

function numericExtent<T>(
  rows: T[],
  value: (row: T) => number | null | undefined,
) {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  rows.forEach((row) => {
    const nextValue = value(row);
    if (nextValue == null || !Number.isFinite(nextValue)) return;
    min = Math.min(min, nextValue);
    max = Math.max(max, nextValue);
  });
  return Number.isFinite(min) && Number.isFinite(max)
    ? { min, max }
    : { min: 0, max: 1 };
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
        <button
          className="discovery-mission"
          type="button"
          key={mission.id}
          onClick={() => onOpen(mission)}
        >
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

function clampHeatmapYear(value: number, minYear: number, maxYear: number) {
  return Math.min(maxYear, Math.max(minYear, Math.round(value)));
}

function YearRangeSlider({
  minYear,
  maxYear,
  yearFrom,
  yearTo,
  scopeLabel,
  onChange,
}: {
  minYear: number;
  maxYear: number;
  yearFrom: number;
  yearTo: number;
  scopeLabel: string;
  onChange: (range: { from: number; to: number }) => void;
}) {
  const controlRef = useRef<HTMLDivElement | null>(null);
  const yearSpan = Math.max(1, maxYear - minYear);
  const minPosition = ((yearFrom - minYear) / yearSpan) * 100;
  const maxPosition = ((yearTo - minYear) / yearSpan) * 100;
  const sliderStyle = {
    "--range-min": `${minPosition}%`,
    "--range-max": `${maxPosition}%`,
  } as CSSProperties;
  const minHandleStyle = {
    "--handle-position": `${minPosition}%`,
  } as CSSProperties;
  const maxHandleStyle = {
    "--handle-position": `${maxPosition}%`,
  } as CSSProperties;

  function updateMin(value: number) {
    onChange({
      from: Math.min(clampHeatmapYear(value, minYear, maxYear), yearTo),
      to: yearTo,
    });
  }

  function updateMax(value: number) {
    onChange({
      from: yearFrom,
      to: Math.max(clampHeatmapYear(value, minYear, maxYear), yearFrom),
    });
  }

  function valueFromPointer(clientX: number) {
    const rect = controlRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return minYear;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return clampHeatmapYear(minYear + ratio * (maxYear - minYear), minYear, maxYear);
  }

  function updateHandle(handle: "min" | "max", value: number) {
    if (handle === "min") {
      updateMin(value);
    } else {
      updateMax(value);
    }
  }

  function handlePointerDown(
    event: PointerEvent<HTMLButtonElement>,
    handle: "min" | "max",
  ) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    updateHandle(handle, valueFromPointer(event.clientX));
  }

  function handlePointerMove(
    event: PointerEvent<HTMLButtonElement>,
    handle: "min" | "max",
  ) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      updateHandle(handle, valueFromPointer(event.clientX));
    }
  }

  function handlePointerUp(event: PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    handle: "min" | "max",
  ) {
    const current = handle === "min" ? yearFrom : yearTo;
    const step = event.shiftKey ? 10 : 1;
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
        nextValue = minYear;
        break;
      case "End":
        nextValue = maxYear;
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
    <section
      className="heatmap-year-range"
      aria-label={`${scopeLabel} year range`}
    >
      <div className="heatmap-year-range-heading">
        <div>
          <span>Year range</span>
          <strong>{`${yearFrom}–${yearTo}`}</strong>
        </div>
        <small>{`${formatNumber(yearTo - yearFrom + 1)} years`}</small>
      </div>
      <div className="heatmap-year-range-layout">
        <label className="heatmap-year-input">
          <span>From</span>
          <input
            type="number"
            aria-label={`${scopeLabel} year from`}
            min={minYear}
            max={yearTo}
            value={yearFrom}
            onChange={(event) => updateMin(Number(event.currentTarget.value))}
          />
        </label>
        <div className="range-slider heatmap-year-slider" style={sliderStyle}>
          <div className="range-control" ref={controlRef}>
            <span className="range-track" aria-hidden="true" />
            <button
              className={
                yearFrom === yearTo && yearFrom === maxYear
                  ? "range-handle range-handle-min range-handle-overlap"
                  : "range-handle range-handle-min"
              }
              type="button"
              role="slider"
              aria-label={`Earliest ${scopeLabel.toLowerCase()} year`}
              aria-valuemin={minYear}
              aria-valuemax={yearTo}
              aria-valuenow={yearFrom}
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
              aria-label={`Latest ${scopeLabel.toLowerCase()} year`}
              aria-valuemin={yearFrom}
              aria-valuemax={maxYear}
              aria-valuenow={yearTo}
              style={maxHandleStyle}
              onPointerDown={(event) => handlePointerDown(event, "max")}
              onPointerMove={(event) => handlePointerMove(event, "max")}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onKeyDown={(event) => handleKeyDown(event, "max")}
            />
          </div>
          <div className="heatmap-year-scale" aria-hidden="true">
            <span>{minYear}</span>
            <span>{maxYear}</span>
          </div>
        </div>
        <label className="heatmap-year-input">
          <span>To</span>
          <input
            type="number"
            aria-label={`${scopeLabel} year to`}
            min={yearFrom}
            max={maxYear}
            value={yearTo}
            onChange={(event) => updateMax(Number(event.currentTarget.value))}
          />
        </label>
      </div>
    </section>
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
  const yearExtent = useMemo(() => completionHeatmapYearExtent(cells), [cells]);
  const minYear = yearExtent?.min ?? 0;
  const maxYear = yearExtent?.max ?? 0;
  const [genreLimit, setGenreLimit] =
    useState<CompletionHeatmapGenreLimit>(12);
  const [yearFrom, setYearFrom] = useState<number | null>(null);
  const [yearTo, setYearTo] = useState<number | null>(null);
  const [includedGenres, setIncludedGenres] = useState<string[]>([]);
  const [excludedGenres, setExcludedGenres] = useState<string[]>([]);
  const effectiveYearFrom = clampHeatmapYear(
    yearFrom ?? minYear,
    minYear,
    maxYear,
  );
  const effectiveYearTo = clampHeatmapYear(
    yearTo ?? maxYear,
    effectiveYearFrom,
    maxYear,
  );
  const genreOptions = useMemo(() => {
    const seen = new Map<string, string>();
    cells.forEach((cell) => {
      if (!seen.has(cell.genreId)) seen.set(cell.genreId, cell.genre);
    });
    return uniqueGenreSuggestionOptions([
      ...genreSuggestionAliases,
      ...Array.from(seen.values()).sort((left, right) =>
        left.localeCompare(right),
      ),
    ]);
  }, [cells]);
  const decades = useMemo(
    () =>
      yearExtent ? completionHeatmapDecades(minYear, maxYear) : ([] as number[]),
    [maxYear, minYear, yearExtent],
  );
  const selectedDecade = useMemo(() => {
    if (
      effectiveYearFrom === minYear &&
      effectiveYearTo === maxYear
    ) {
      return "all";
    }
    const matchingDecade = decades.find(
      (decade) =>
        effectiveYearFrom === Math.max(minYear, decade) &&
        effectiveYearTo === Math.min(maxYear, decade + 9),
    );
    return matchingDecade == null ? "custom" : String(matchingDecade);
  }, [decades, effectiveYearFrom, effectiveYearTo, maxYear, minYear]);
  const selection = useMemo(
    () =>
      selectCompletionHeatmap(cells, {
        yearFrom: effectiveYearFrom,
        yearTo: effectiveYearTo,
        genreLimit,
        includedGenres,
        excludedGenres,
      }),
    [
      cells,
      effectiveYearFrom,
      effectiveYearTo,
      excludedGenres,
      genreLimit,
      includedGenres,
    ],
  );
  const cellLookup = useMemo(() => {
    const nextLookup = new Map<string, DiscoveryHeatmapCell>();
    selection.cells.forEach((cell) =>
      nextLookup.set(`${cell.genreId}:${cell.year}`, cell),
    );
    return nextLookup;
  }, [selection.cells]);
  const gridStyle = {
    "--heatmap-columns": selection.years.length,
  } as CSSProperties & Record<"--heatmap-columns", number>;
  const hasActiveFilters =
    genreLimit !== 12 ||
    effectiveYearFrom !== minYear ||
    effectiveYearTo !== maxYear ||
    includedGenres.length > 0 ||
    excludedGenres.length > 0;

  function resetFilters() {
    setGenreLimit(12);
    setYearFrom(null);
    setYearTo(null);
    setIncludedGenres([]);
    setExcludedGenres([]);
  }

  function selectDecade(value: string) {
    if (value === "all") {
      setYearFrom(null);
      setYearTo(null);
      return;
    }
    if (value === "custom") return;
    const decade = Number(value);
    setYearFrom(Math.max(minYear, decade));
    setYearTo(Math.min(maxYear, decade + 9));
  }

  if (cells.length === 0) {
    return (
      <div className="empty-state">
        <Gauge size={20} />
        <span>{emptyLabel}</span>
      </div>
    );
  }

  return (
    <div className="heatmap-explorer">
      <div className="heatmap-controls">
        <div className="heatmap-filter-grid">
          <SelectField
            label="Genre rows"
            value={String(genreLimit)}
            onChange={(value) =>
              setGenreLimit(Number(value) as CompletionHeatmapGenreLimit)
            }
            options={completionHeatmapGenreLimits.map((limit) => ({
              value: String(limit),
              label: `Top ${limit}`,
            }))}
          />
          <SelectField
            label="Jump to decade"
            value={selectedDecade}
            onChange={selectDecade}
            options={[
              ...(selectedDecade === "custom"
                ? [{ value: "custom", label: `${effectiveYearFrom}–${effectiveYearTo}` }]
                : []),
              { value: "all", label: "All years" },
              ...decades.map((decade) => ({
                value: String(decade),
                label: `${decade}s`,
              })),
            ]}
          />
          <GenreListCriterion
            label="Include genres"
            values={includedGenres}
            onChange={setIncludedGenres}
            genreOptions={genreOptions}
            placeholder="Synthpop, AOR"
          />
          <GenreListCriterion
            label="Exclude genres"
            values={excludedGenres}
            onChange={setExcludedGenres}
            genreOptions={genreOptions}
            placeholder="Comedy, TV"
          />
          <button
            className="secondary-button heatmap-reset-button"
            type="button"
            disabled={!hasActiveFilters}
            onClick={resetFilters}
          >
            <RotateCcw size={15} />
            <span>Reset</span>
          </button>
        </div>
        <YearRangeSlider
          minYear={minYear}
          maxYear={maxYear}
          yearFrom={effectiveYearFrom}
          yearTo={effectiveYearTo}
          scopeLabel="Heatmap"
          onChange={(range) => {
            setYearFrom(range.from);
            setYearTo(range.to);
          }}
        />
        <div className="heatmap-selection-summary" aria-live="polite">
          <span>
            {`Showing ${formatNumber(selection.genres.length)} genres across ${formatNumber(selection.years.length)} years`}
          </span>
          <small>
            {`${formatNumber(selection.cells.length)} populated intersections · rows ranked by album count`}
          </small>
        </div>
      </div>

      {selection.genres.length === 0 ? (
        <div className="empty-state heatmap-filter-empty">
          <span>No genre/year intersections match these filters.</span>
          <button className="secondary-button" type="button" onClick={resetFilters}>
            Reset filters
          </button>
        </div>
      ) : (
        <div
          className="completion-heatmap-scroll"
          tabIndex={0}
          aria-label={`Completion heatmap for ${effectiveYearFrom} through ${effectiveYearTo}. Scroll horizontally for more years.`}
        >
          <div className="completion-heatmap" style={gridStyle}>
            <div className="heatmap-corner" />
            <div className="heatmap-years">
              {selection.years.map((year) => (
                <span key={year}>{year}</span>
              ))}
            </div>
            {selection.genres.map((genre) => (
              <div className="heatmap-row" key={genre.genreId}>
                <span className="heatmap-genre">
                  <span>{genre.genre}</span>
                  <small>{formatNumber(genre.albumCount)}</small>
                </span>
                <div className="heatmap-cells">
                  {selection.years.map((year) => {
                    const cell =
                      cellLookup.get(`${genre.genreId}:${year}`) ?? null;
                    if (!cell) {
                      return (
                        <span
                          className="heatmap-cell empty"
                          key={year}
                          aria-hidden="true"
                        />
                      );
                    }
                    const completion = cell.averageRatingCompleteness ?? 0;
                    return (
                      <button
                        className="heatmap-cell"
                        type="button"
                        key={year}
                        style={{ backgroundColor: heatmapColor(completion) }}
                        title={`${cell.genre} / ${cell.year}: ${formatPercent(completion)} complete`}
                        aria-label={`${cell.genre}, ${cell.year}: ${formatPercent(completion)} complete across ${formatNumber(cell.albumCount)} albums`}
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
        </div>
      )}
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
  const scoreExtent = numericExtent(
    points,
    (point) => point.albumScore ?? point.effectiveAlbumRating,
  );
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
      <svg
        className="discovery-scatter"
        viewBox="0 0 340 220"
        role="img"
        aria-label="Loved tracks by album score"
      >
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
          const score =
            point.albumScore ?? point.effectiveAlbumRating ?? scoreExtent.min;
          const x =
            38 + normalizedValue(score, scoreExtent.min, scoreExtent.max) * 278;
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
              onKeyDown={(event) =>
                discoveryKeyOpen(event, () => onOpen(point))
              }
            >
              <title>
                {label}: {formatNumber(point.lovedTracks)} loved /{" "}
                {formatAverage(point.albumScore, 1)} score
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
        const size =
          58 +
          Math.sqrt(
            normalizedValue(point.albumCount, albumExtent.min, albumExtent.max),
          ) *
            74;
        const x =
          10 +
          normalizedValue(
            point.averageAlbumScore,
            scoreExtent.min,
            scoreExtent.max,
          ) *
            80;
        const y = 10 + clampRatio(point.averageRatingCompleteness) * 78;
        const style = {
          left: `${x}%`,
          bottom: `${y}%`,
          width: `${size}px`,
          height: `${size}px`,
          "--bubble-strength": clampRatio(point.averageRatingCompleteness),
        } as CSSProperties & Record<"--bubble-strength", number>;
        return (
          <button
            className="bubble-point"
            type="button"
            key={point.genreId}
            style={style}
            onClick={() => onOpen(point)}
          >
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
    <div
      className="bubble-plot artist-constellation"
      aria-label="Artist constellation"
    >
      <span className="plot-axis plot-axis-x">Catalog depth</span>
      <span className="plot-axis plot-axis-y">Average score</span>
      {points.map((point) => {
        const size =
          58 +
          Math.sqrt(
            normalizedValue(
              point.lovedTracks,
              lovedExtent.min,
              lovedExtent.max,
            ),
          ) *
            68;
        const x =
          10 +
          normalizedValue(point.albumCount, albumExtent.min, albumExtent.max) *
            80;
        const y =
          10 +
          normalizedValue(
            point.averageAlbumScore,
            scoreExtent.min,
            scoreExtent.max,
          ) *
            78;
        const style = {
          left: `${x}%`,
          bottom: `${y}%`,
          width: `${size}px`,
          height: `${size}px`,
          "--bubble-strength": clampRatio(point.averageRatingCompleteness),
        } as CSSProperties & Record<"--bubble-strength", number>;
        return (
          <button
            className="bubble-point artist"
            type="button"
            key={point.artistId}
            style={style}
            onClick={() => onOpen(point)}
          >
            <strong>{point.artist}</strong>
            <span>{formatNumber(point.albumCount)} albums</span>
          </button>
        );
      })}
    </div>
  );
}

function YearProgressExplorer({
  rows,
  genreOptions,
  onRequestGenreOptions,
  onSelect,
}: {
  rows: YearProgressStats[];
  genreOptions: string[];
  onRequestGenreOptions?: () => void;
  onSelect: (cohort: InsightCohort) => void;
}) {
  const extent = useMemo(() => yearProgressExtent(rows), [rows]);
  const minYear = extent?.min ?? 0;
  const maxYear = extent?.max ?? 0;
  const [yearFrom, setYearFrom] = useState<number | null>(null);
  const [yearTo, setYearTo] = useState<number | null>(null);
  const [includedGenres, setIncludedGenres] = useState<string[]>([]);
  const [excludedGenres, setExcludedGenres] = useState<string[]>([]);
  const [genreRows, setGenreRows] = useState<YearProgressStats[]>(rows);
  const [isGenreLoading, setIsGenreLoading] = useState(false);
  const [genreError, setGenreError] = useState<string | null>(null);
  const effectiveYearFrom = clampHeatmapYear(
    yearFrom ?? minYear,
    minYear,
    maxYear,
  );
  const effectiveYearTo = clampHeatmapYear(
    yearTo ?? maxYear,
    effectiveYearFrom,
    maxYear,
  );
  const decades = useMemo(
    () => (extent ? completionHeatmapDecades(minYear, maxYear) : []),
    [extent, maxYear, minYear],
  );
  const selectedDecade = useMemo(() => {
    if (effectiveYearFrom === minYear && effectiveYearTo === maxYear) {
      return "all";
    }
    const matchingDecade = decades.find(
      (decade) =>
        effectiveYearFrom === Math.max(minYear, decade) &&
        effectiveYearTo === Math.min(maxYear, decade + 9),
    );
    return matchingDecade == null ? "custom" : String(matchingDecade);
  }, [decades, effectiveYearFrom, effectiveYearTo, maxYear, minYear]);
  const visibleRows = useMemo(
    () =>
      selectYearProgressRows(
        genreRows,
        effectiveYearFrom,
        effectiveYearTo,
      ),
    [effectiveYearFrom, effectiveYearTo, genreRows],
  );
  const hasGenreFilters =
    includedGenres.length > 0 || excludedGenres.length > 0;
  const hasActiveFilters =
    hasGenreFilters ||
    effectiveYearFrom !== minYear ||
    effectiveYearTo !== maxYear;

  useEffect(() => {
    let cancelled = false;
    if (!hasGenreFilters) {
      setGenreRows(rows);
      setGenreError(null);
      setIsGenreLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const timeoutId = window.setTimeout(() => {
      setIsGenreLoading(true);
      setGenreError(null);
      void getYearProgress({
        genres: includedGenres,
        excludedGenres,
      })
        .then((nextRows) => {
          if (!cancelled) setGenreRows(nextRows);
        })
        .catch((error) => {
          if (!cancelled) {
            setGenreError(
              error instanceof Error
                ? error.message
                : "Could not filter year progress.",
            );
          }
        })
        .finally(() => {
          if (!cancelled) setIsGenreLoading(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [excludedGenres, hasGenreFilters, includedGenres, rows]);

  function selectDecade(value: string) {
    if (value === "all") {
      setYearFrom(null);
      setYearTo(null);
      return;
    }
    if (value === "custom") return;
    const decade = Number(value);
    setYearFrom(Math.max(minYear, decade));
    setYearTo(Math.min(maxYear, decade + 9));
  }

  function resetFilters() {
    setYearFrom(null);
    setYearTo(null);
    setIncludedGenres([]);
    setExcludedGenres([]);
  }

  if (!extent) {
    return (
      <YearProgressTable
        rows={[]}
        genres={[]}
        excludedGenres={[]}
        onSelect={onSelect}
      />
    );
  }

  return (
    <div className="year-progress-explorer">
      <div className="heatmap-controls year-progress-controls">
        <div className="heatmap-filter-grid year-progress-filter-grid">
          <SelectField
            label="Jump to decade"
            value={selectedDecade}
            onChange={selectDecade}
            options={[
              ...(selectedDecade === "custom"
                ? [
                    {
                      value: "custom",
                      label: `${effectiveYearFrom}–${effectiveYearTo}`,
                    },
                  ]
                : []),
              { value: "all", label: "All years" },
              ...decades.map((decade) => ({
                value: String(decade),
                label: `${decade}s`,
              })),
            ]}
          />
          <GenreListCriterion
            label="Include genres"
            values={includedGenres}
            onChange={setIncludedGenres}
            genreOptions={genreOptions}
            onRequestOptions={onRequestGenreOptions}
            placeholder="Synthpop, scores"
          />
          <GenreListCriterion
            label="Exclude genres"
            values={excludedGenres}
            onChange={setExcludedGenres}
            genreOptions={genreOptions}
            onRequestOptions={onRequestGenreOptions}
            placeholder="Comedy, TV"
          />
          <button
            className="secondary-button heatmap-reset-button"
            type="button"
            disabled={!hasActiveFilters}
            onClick={resetFilters}
          >
            <RotateCcw size={15} />
            <span>Reset</span>
          </button>
        </div>
        <YearRangeSlider
          minYear={minYear}
          maxYear={maxYear}
          yearFrom={effectiveYearFrom}
          yearTo={effectiveYearTo}
          scopeLabel="Year progress"
          onChange={(range) => {
            setYearFrom(range.from);
            setYearTo(range.to);
          }}
        />
        <div className="heatmap-selection-summary" aria-live="polite">
          <span>
            {isGenreLoading
              ? "Updating genre totals…"
              : `Showing ${formatNumber(visibleRows.length)} years · oldest first`}
          </span>
          <small>
            {hasGenreFilters
              ? "Genre filters use canonical album genres; scores includes film, TV, and game scores."
              : "All canonical album genres included."}
          </small>
        </div>
        {genreError ? (
          <p className="year-progress-error" role="alert">
            {genreError}
          </p>
        ) : null}
      </div>
      <YearProgressTable
        rows={visibleRows}
        genres={includedGenres}
        excludedGenres={excludedGenres}
        onSelect={onSelect}
      />
    </div>
  );
}

function YearProgressTable({
  rows,
  genres,
  excludedGenres,
  onSelect,
}: {
  rows: YearProgressStats[];
  genres: string[];
  excludedGenres: string[];
  onSelect: (cohort: InsightCohort) => void;
}) {
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
        <span role="columnheader">Fully rated %</span>
        <span role="columnheader">Partial</span>
        <span role="columnheader">Hours</span>
        <span role="columnheader">Score</span>
      </div>
      {rows.map((row) => (
        <div
          className="stats-table-row actionable-cohort"
          role="row"
          tabIndex={0}
          key={row.year}
          onClick={() => onSelect(yearCohort(row, genres, excludedGenres))}
          onKeyDown={(event) =>
            discoveryKeyOpen(event, () =>
              onSelect(yearCohort(row, genres, excludedGenres)),
            )
          }
        >
          <span role="cell">{row.year}</span>
          <span role="cell">{formatNumber(row.albumCount)}</span>
          <span role="cell">{formatNumber(row.ratedAlbumCount)}</span>
          <span role="cell">{formatPercent(fullyRatedAlbumRatio(row))}</span>
          <span role="cell">{formatNumber(row.partialAlbumCount)}</span>
          <span role="cell">{formatHours(row.totalSeconds)}</span>
          <span role="cell">{formatAverage(row.averageAlbumScore, 1)}</span>
        </div>
      ))}
    </div>
  );
}

function GenreProgressExplorer({
  rows,
  yearRows,
  genreOptions,
  onRequestGenreOptions,
  onSelect,
}: {
  rows: GenreProgressStats[];
  yearRows: YearProgressStats[];
  genreOptions: string[];
  onRequestGenreOptions?: () => void;
  onSelect: (cohort: InsightCohort) => void;
}) {
  const extent = useMemo(() => yearProgressExtent(yearRows), [yearRows]);
  const minYear = extent?.min ?? 0;
  const maxYear = extent?.max ?? 0;
  const [yearFrom, setYearFrom] = useState<number | null>(null);
  const [yearTo, setYearTo] = useState<number | null>(null);
  const [includedGenres, setIncludedGenres] = useState<string[]>([]);
  const [excludedGenres, setExcludedGenres] = useState<string[]>([]);
  const [genreLimit, setGenreLimit] = useState<GenreProgressLimit>(12);
  const [genreSort, setGenreSort] =
    useState<GenreProgressSort>("popularity");
  const [filteredRows, setFilteredRows] = useState<GenreProgressStats[]>(rows);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const effectiveYearFrom = clampHeatmapYear(
    yearFrom ?? minYear,
    minYear,
    maxYear,
  );
  const effectiveYearTo = clampHeatmapYear(
    yearTo ?? maxYear,
    effectiveYearFrom,
    maxYear,
  );
  const decades = useMemo(
    () => (extent ? completionHeatmapDecades(minYear, maxYear) : []),
    [extent, maxYear, minYear],
  );
  const selectedDecade = useMemo(() => {
    if (effectiveYearFrom === minYear && effectiveYearTo === maxYear) {
      return "all";
    }
    const matchingDecade = decades.find(
      (decade) =>
        effectiveYearFrom === Math.max(minYear, decade) &&
        effectiveYearTo === Math.min(maxYear, decade + 9),
    );
    return matchingDecade == null ? "custom" : String(matchingDecade);
  }, [decades, effectiveYearFrom, effectiveYearTo, maxYear, minYear]);
  const hasYearFilter =
    extent != null &&
    (effectiveYearFrom !== minYear || effectiveYearTo !== maxYear);
  const hasAggregationFilters =
    hasYearFilter || includedGenres.length > 0 || excludedGenres.length > 0;
  const hasActiveControls =
    hasAggregationFilters || genreLimit !== 12 || genreSort !== "popularity";
  const visibleRows = useMemo(
    () => selectGenreProgressRows(filteredRows, genreLimit, genreSort),
    [filteredRows, genreLimit, genreSort],
  );

  useEffect(() => {
    let cancelled = false;
    if (!hasAggregationFilters) {
      setFilteredRows(rows);
      setError(null);
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const timeoutId = window.setTimeout(() => {
      setIsLoading(true);
      setError(null);
      void getGenreProgress({
        yearFrom: hasYearFilter ? effectiveYearFrom : null,
        yearTo: hasYearFilter ? effectiveYearTo : null,
        genres: includedGenres,
        excludedGenres,
      })
        .then((nextRows) => {
          if (!cancelled) setFilteredRows(nextRows);
        })
        .catch((nextError) => {
          if (!cancelled) {
            setError(
              nextError instanceof Error
                ? nextError.message
                : "Could not filter genre progress.",
            );
          }
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    effectiveYearFrom,
    effectiveYearTo,
    excludedGenres,
    hasAggregationFilters,
    hasYearFilter,
    includedGenres,
    rows,
  ]);

  function selectDecade(value: string) {
    if (value === "all") {
      setYearFrom(null);
      setYearTo(null);
      return;
    }
    if (value === "custom") return;
    const decade = Number(value);
    setYearFrom(Math.max(minYear, decade));
    setYearTo(Math.min(maxYear, decade + 9));
  }

  function resetFilters() {
    setYearFrom(null);
    setYearTo(null);
    setIncludedGenres([]);
    setExcludedGenres([]);
    setGenreLimit(12);
    setGenreSort("popularity");
  }

  return (
    <div className="genre-progress-explorer">
      {extent ? (
        <div className="heatmap-controls genre-progress-controls">
          <div className="heatmap-filter-grid genre-progress-filter-grid">
            <SelectField
              label="Genres shown"
              value={String(genreLimit)}
              onChange={(value) =>
                setGenreLimit(
                  value === "all" ? "all" : (Number(value) as GenreProgressLimit),
                )
              }
              options={genreProgressLimits.map((limit) => ({
                value: String(limit),
                label: limit === "all" ? "All genres" : `Top ${limit}`,
              }))}
            />
            <SelectField
              label="Sort genres"
              value={genreSort}
              onChange={(value) => setGenreSort(value as GenreProgressSort)}
              options={[
                { value: "popularity", label: "Popularity" },
                { value: "name", label: "Name A–Z" },
              ]}
            />
            <SelectField
              label="Jump to decade"
              value={selectedDecade}
              onChange={selectDecade}
              options={[
                ...(selectedDecade === "custom"
                  ? [
                      {
                        value: "custom",
                        label: `${effectiveYearFrom}–${effectiveYearTo}`,
                      },
                    ]
                  : []),
                { value: "all", label: "All years" },
                ...decades.map((decade) => ({
                  value: String(decade),
                  label: `${decade}s`,
                })),
              ]}
            />
            <GenreListCriterion
              label="Include genres"
              values={includedGenres}
              onChange={setIncludedGenres}
              genreOptions={genreOptions}
              onRequestOptions={onRequestGenreOptions}
              placeholder="Synthpop, scores"
            />
            <GenreListCriterion
              label="Exclude genres"
              values={excludedGenres}
              onChange={setExcludedGenres}
              genreOptions={genreOptions}
              onRequestOptions={onRequestGenreOptions}
              placeholder="Comedy, TV"
            />
            <button
              className="secondary-button heatmap-reset-button"
              type="button"
              disabled={!hasActiveControls}
              onClick={resetFilters}
            >
              <RotateCcw size={15} />
              <span>Reset</span>
            </button>
          </div>
          <YearRangeSlider
            minYear={minYear}
            maxYear={maxYear}
            yearFrom={effectiveYearFrom}
            yearTo={effectiveYearTo}
            scopeLabel="Genre progress"
            onChange={(range) => {
              setYearFrom(range.from);
              setYearTo(range.to);
            }}
          />
          <div className="heatmap-selection-summary" aria-live="polite">
            <span>
              {isLoading
                ? "Updating genre totals…"
                : `Showing ${formatNumber(visibleRows.length)} of ${formatNumber(filteredRows.length)} matching genres`}
            </span>
            <small>
              {genreSort === "popularity"
                ? "Ranked by album popularity"
                : "Sorted by name"}
              {" · oldest decades listed first · scores includes film, TV, and game scores"}
            </small>
          </div>
          {error ? (
            <p className="year-progress-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
      <GenreProgressTable
        rows={visibleRows}
        filtered={hasAggregationFilters}
        yearFrom={hasYearFilter ? effectiveYearFrom : null}
        yearTo={hasYearFilter ? effectiveYearTo : null}
        excludedGenres={excludedGenres}
        onSelect={onSelect}
      />
    </div>
  );
}

function GenreProgressTable({
  rows,
  filtered = false,
  yearFrom,
  yearTo,
  excludedGenres,
  onSelect,
}: {
  rows: GenreProgressStats[];
  filtered?: boolean;
  yearFrom: number | null;
  yearTo: number | null;
  excludedGenres: string[];
  onSelect: (cohort: InsightCohort) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <Tags size={20} />
        <span>
          {filtered
            ? "No genres match these filters."
            : "No genre statistics yet."}
        </span>
      </div>
    );
  }

  return (
    <div className="stats-table genre-stats-table" role="table">
      <div className="stats-table-head" role="row">
        <span role="columnheader">Genre</span>
        <span role="columnheader">Albums</span>
        <span role="columnheader">Rated</span>
        <span role="columnheader">Fully rated %</span>
        <span role="columnheader">Partial</span>
        <span role="columnheader">Loved</span>
        <span role="columnheader">Score</span>
      </div>
      {rows.map((row) => (
        <div
          className="stats-table-row actionable-cohort"
          role="row"
          tabIndex={0}
          key={row.genre}
          onClick={() =>
            onSelect(genreCohort(row, yearFrom, yearTo, excludedGenres))
          }
          onKeyDown={(event) =>
            discoveryKeyOpen(event, () =>
              onSelect(genreCohort(row, yearFrom, yearTo, excludedGenres)),
            )
          }
        >
          <span role="cell">{row.genre}</span>
          <span role="cell">{formatNumber(row.albumCount)}</span>
          <span role="cell">{formatNumber(row.ratedAlbumCount)}</span>
          <span role="cell">{formatPercent(fullyRatedGenreRatio(row))}</span>
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

function RatingEventList({
  events,
  onSelect,
}: {
  events: RatingEvent[];
  onSelect: (cohort: InsightCohort) => void;
}) {
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
        <article
          className="rating-event actionable-cohort"
          role="button"
          tabIndex={0}
          key={event.id}
          onClick={() => onSelect(ratingEventCohort(event))}
          onKeyDown={(keyboardEvent) =>
            discoveryKeyOpen(keyboardEvent, () =>
              onSelect(ratingEventCohort(event)),
            )
          }
        >
          <strong>{eventLabel(event.eventType)}</strong>
          <span>
            {[event.albumArtistDisplay, event.album, event.year]
              .filter(Boolean)
              .join(" / ")}
          </span>
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
  const [isLunaOpen, setIsLunaOpen] = useState(false);
  const lunaLaunchIdRef = useRef(1);
  const [searchLunaLaunch, setSearchLunaLaunch] = useState<{
    id: number;
    mode: "build" | "results";
    snapshot: AiSnapshot | null;
  } | null>(null);
  const [chartLunaLaunch, setChartLunaLaunch] = useState<{
    id: number;
    mode: "build" | "results";
    snapshot: AiSnapshot | null;
  } | null>(null);
  const [analystSnapshotToOpen, setAnalystSnapshotToOpen] =
    useState<AiSnapshot | null>(null);
  const [savedPlaylistToOpen, setSavedPlaylistToOpen] =
    useState<SavedPlaylist | null>(null);
  const [savedDiscoveryToOpen, setSavedDiscoveryToOpen] =
    useState<SavedExternalDiscovery | null>(null);
  const [statisticsCohort, setStatisticsCohort] =
    useState<InsightCohort | null>(null);
  const [discoveryCohort, setDiscoveryCohort] =
    useState<InsightCohort | null>(null);
  const [playlistLaunch, setPlaylistLaunch] = useState<{
    id: number;
    cohortTitle: string;
    prompt: string;
    request: BrowseRequest;
  } | null>(null);
  useWorkspaceNavigation(activeSection, setActiveSection);
  const [sourcePath, setSourcePath] = useState(() =>
    createDefaultImportSourcePath(),
  );
  const [coverSourcePath, setCoverSourcePath] = useState(() =>
    createDefaultCoverSourcePath(),
  );
  const [coverExtractEmbeddedFallback, setCoverExtractEmbeddedFallback] =
    useState(true);
  const [coverReplaceExisting, setCoverReplaceExisting] = useState(false);
  const [status, setStatus] = useState<LibraryStatus | null>(null);
  const [runs, setRuns] = useState<ImportRun[]>([]);
  const [progress, setProgress] = useState(defaultProgress);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(
    null,
  );
  const [latestAppliedImport, setLatestAppliedImport] =
    useState<ImportRun | null>(null);
  const [coverProgress, setCoverProgress] = useState(defaultCoverProgress);
  const [isImporting, setIsImporting] = useState(false);
  const [isApplyingImport, setIsApplyingImport] = useState(false);
  const [isCancellingImport, setIsCancellingImport] = useState(false);
  const [isImportingCovers, setIsImportingCovers] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [coverImportError, setCoverImportError] = useState<string | null>(null);
  const [coverImportSummary, setCoverImportSummary] =
    useState<CoverImportSummary | null>(null);
  const [billboardSourcePath, setBillboardSourcePath] = useState(() =>
    createDefaultBillboardSourcePath(),
  );
  const [isImportingBillboard, setIsImportingBillboard] = useState(false);
  const [billboardImportError, setBillboardImportError] = useState<
    string | null
  >(null);
  const [billboardImportSummary, setBillboardImportSummary] =
    useState<BillboardImportSummary | null>(null);
  const [billboardSinglesSourcePath, setBillboardSinglesSourcePath] = useState(
    () => createDefaultBillboardSinglesSourcePath(),
  );
  const [isImportingBillboardSingles, setIsImportingBillboardSingles] =
    useState(false);
  const [billboardSinglesImportError, setBillboardSinglesImportError] =
    useState<string | null>(null);
  const [billboardSinglesImportSummary, setBillboardSinglesImportSummary] =
    useState<BillboardSinglesImportSummary | null>(null);
  const [request, setRequest] = useState<BrowseRequest>(() =>
    createRequest("albums"),
  );
  const [response, setResponse] = useState<BrowseResponse | null>(null);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [savedCharts, setSavedCharts] = useState<SavedChart[]>([]);
  const [saveName, setSaveName] = useState("");
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [includeCalculated, setIncludeCalculated] = useState(false);
  const [searchTableColumns, setSearchTableColumns] = useState<string[]>([
    "billboard",
  ]);
  const [searchExportColumns, setSearchExportColumns] = useState<string[]>([]);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [albumRequest, setAlbumRequest] = useState<BrowseRequest>(() => {
    const request = createRequest("albums");
    request.limit = 25;
    return request;
  });
  const [albumResponse, setAlbumResponse] = useState<BrowseResponse | null>(
    null,
  );
  const [albumError, setAlbumError] = useState<string | null>(null);
  const [isAlbumLoading, setIsAlbumLoading] = useState(false);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [albumTracksResponse, setAlbumTracksResponse] =
    useState<BrowseResponse | null>(null);
  const [albumTracksError, setAlbumTracksError] = useState<string | null>(null);
  const [isAlbumTracksLoading, setIsAlbumTracksLoading] = useState(false);
  const [albumIncludeCalculated, setAlbumIncludeCalculated] = useState(false);
  const [albumExportResult, setAlbumExportResult] =
    useState<ExportResult | null>(null);
  const [artistRequest, setArtistRequest] = useState<ArtistListRequest>(() =>
    createArtistListRequest(),
  );
  const [artistResponse, setArtistResponse] =
    useState<ArtistListResponse | null>(null);
  const [artistError, setArtistError] = useState<string | null>(null);
  const [isArtistLoading, setIsArtistLoading] = useState(false);
  const [selectedArtistId, setSelectedArtistId] = useState<string | null>(null);
  const [artistDetailTab, setArtistDetailTab] =
    useState<ArtistDetailTab>("local-albums");
  const [artistAlbumsResponse, setArtistAlbumsResponse] =
    useState<BrowseResponse | null>(null);
  const [artistAlbumsError, setArtistAlbumsError] = useState<string | null>(
    null,
  );
  const [isArtistAlbumsLoading, setIsArtistAlbumsLoading] = useState(false);
  const [selectedArtistAlbumId, setSelectedArtistAlbumId] = useState<
    string | null
  >(null);
  const [artistAlbumTracksResponse, setArtistAlbumTracksResponse] =
    useState<BrowseResponse | null>(null);
  const [artistAlbumTracksError, setArtistAlbumTracksError] = useState<
    string | null
  >(null);
  const [isArtistAlbumTracksLoading, setIsArtistAlbumTracksLoading] =
    useState(false);
  const [musicBrainzArtistDiscography, setMusicBrainzArtistDiscography] =
    useState<MusicBrainzArtistDiscographyResponse | null>(null);
  const [musicBrainzArtistError, setMusicBrainzArtistError] = useState<
    string | null
  >(null);
  const [isMusicBrainzArtistLoading, setIsMusicBrainzArtistLoading] =
    useState(false);
  const [isMusicBrainzArtistUpdating, setIsMusicBrainzArtistUpdating] =
    useState(false);
  const [musicBrainzArtistExportResult, setMusicBrainzArtistExportResult] =
    useState<ExportResult | null>(null);
  const [musicBrainzArtistRefreshResult, setMusicBrainzArtistRefreshResult] =
    useState<MusicBrainzArtistRefreshResult | null>(null);
  const [musicBrainzArtistOriginResult, setMusicBrainzArtistOriginResult] =
    useState<MusicBrainzArtistOriginCountryUpdate | null>(null);
  const [artistIncludeCalculated, setArtistIncludeCalculated] = useState(false);
  const [artistExportResult, setArtistExportResult] =
    useState<ExportResult | null>(null);
  const [genreRequest, setGenreRequest] = useState<GenreListRequest>(() =>
    createGenreListRequest(),
  );
  const [genreResponse, setGenreResponse] = useState<GenreListResponse | null>(
    null,
  );
  const [genreError, setGenreError] = useState<string | null>(null);
  const [isGenreLoading, setIsGenreLoading] = useState(false);
  const [genreTimelineResponse, setGenreTimelineResponse] =
    useState<GenreListResponse | null>(null);
  const [genreTimelineError, setGenreTimelineError] = useState<string | null>(
    null,
  );
  const [isGenreTimelineLoading, setIsGenreTimelineLoading] = useState(false);
  const [genreTimelineRefreshKey, setGenreTimelineRefreshKey] = useState(0);
  const [genreTimelineResetSignal, setGenreTimelineResetSignal] = useState(0);
  const [selectedGenreId, setSelectedGenreId] = useState<string | null>(null);
  const [genreAlbumsResponse, setGenreAlbumsResponse] =
    useState<BrowseResponse | null>(null);
  const [genreAlbumsError, setGenreAlbumsError] = useState<string | null>(null);
  const [isGenreAlbumsLoading, setIsGenreAlbumsLoading] = useState(false);
  const [genreIncludeCalculated, setGenreIncludeCalculated] = useState(false);
  const [genreExportResult, setGenreExportResult] =
    useState<ExportResult | null>(null);
  const [genreSuggestionNames, setGenreSuggestionNames] = useState<string[]>(
    [],
  );
  const [musicTools, setMusicTools] = useState<MusicToolSummary[]>(
    () => musicToolCatalog,
  );
  const [toolsError, setToolsError] = useState<string | null>(null);
  const [isToolsLoading, setIsToolsLoading] = useState(false);
  const [selectedToolId, setSelectedToolId] = useState<string | null>(
    musicToolCatalog[0]?.id ?? null,
  );
  const [toolIssueRequest, setToolIssueRequest] =
    useState<MusicToolIssueRequest>(() => createMusicToolIssueRequest());
  const [toolIssueResponse, setToolIssueResponse] =
    useState<MusicToolIssueResponse | null>(null);
  const [toolIssueError, setToolIssueError] = useState<string | null>(null);
  const [isToolIssuesLoading, setIsToolIssuesLoading] = useState(false);
  const [toolProgress, setToolProgress] = useState<MusicToolProgress | null>(
    null,
  );
  const [toolExportResult, setToolExportResult] = useState<ExportResult | null>(
    null,
  );
  const [toolFixSummary, setToolFixSummary] =
    useState<MusicToolFixSummary | null>(null);
  const [toolFixIssueIds, setToolFixIssueIds] = useState<string[]>([]);
  const [toolFixHistory, setToolFixHistory] = useState<
    MusicToolFixHistoryEntry[]
  >([]);
  const [toolFixHistoryError, setToolFixHistoryError] = useState<string | null>(
    null,
  );
  const [toolFixError, setToolFixError] = useState<string | null>(null);
  const [isToolFixing, setIsToolFixing] = useState(false);
  const [undoingToolFixRunId, setUndoingToolFixRunId] = useState<number | null>(
    null,
  );
  const [chartConfig, setChartConfig] = useState<ChartConfig>(() =>
    createChartConfig(),
  );
  const [chartTableSort, setChartTableSort] = useState<BrowseSort | null>(null);
  const [chartResponse, setChartResponse] = useState<BrowseResponse | null>(
    null,
  );
  const [chartName, setChartName] = useState("");
  const [chartError, setChartError] = useState<string | null>(null);
  const [isChartLoading, setIsChartLoading] = useState(false);
  const [chartExportResult, setChartExportResult] =
    useState<ExportResult | null>(null);
  const [statistics, setStatistics] = useState<StatisticsResponse | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [isStatsLoading, setIsStatsLoading] = useState(false);
  const [discovery, setDiscovery] = useState<DiscoveryResponse | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [isDiscoveryLoading, setIsDiscoveryLoading] = useState(true);
  const [discoveryAlbumRequest, setDiscoveryAlbumRequest] =
    useState<BrowseRequest>(() =>
      createDiscoveryAlbumRequest(
        {},
        { field: "albumScore", direction: "desc" },
        30,
      ),
    );
  const [discoveryAlbumResponse, setDiscoveryAlbumResponse] =
    useState<BrowseResponse | null>(null);
  const [discoveryAlbumError, setDiscoveryAlbumError] = useState<string | null>(
    null,
  );
  const [isDiscoveryAlbumsLoading, setIsDiscoveryAlbumsLoading] =
    useState(false);
  const [discoverySelection, setDiscoverySelection] =
    useState<DiscoverySelection | null>(null);
  const [settings, setSettings] = useState<AppSettings>(() =>
    createDefaultSettings(),
  );
  const settingsRef = useRef(settings);
  const settingsSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const settingsSaveSequenceRef = useRef(0);
  const pendingSettingsSaveCountRef = useRef(0);
  const appUpdateRef = useRef<AppUpdateCheckResult["update"] | null>(null);
  const isAppUpdateCheckingRef = useRef(false);
  const isAppUpdateInstallingRef = useRef(false);
  const [leftSidebarMode, setLeftSidebarMode] = useState<LeftSidebarMode>(() =>
    createDefaultLeftSidebarMode(),
  );
  const [rightSidebarMode, setRightSidebarMode] = useState<RightSidebarMode>(
    () => createDefaultRightSidebarMode(),
  );
  const detailDrawerRef = useRef<HTMLElement | null>(null);
  const detailToggleRef = useRef<HTMLButtonElement | null>(null);
  const [databaseBackups, setDatabaseBackups] = useState<DatabaseBackup[]>([]);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const [restoreSummary, setRestoreSummary] =
    useState<DatabaseRestoreSummary | null>(null);
  const [performanceProbe, setPerformanceProbe] =
    useState<PerformanceProbeResponse | null>(null);
  const [performanceProbeError, setPerformanceProbeError] = useState<
    string | null
  >(null);
  const [isPerformanceProbeRunning, setIsPerformanceProbeRunning] =
    useState(false);
  const [musicBrainzStatus, setMusicBrainzStatus] =
    useState<MusicBrainzCacheStatus | null>(null);
  const [musicBrainzStatusError, setMusicBrainzStatusError] = useState<
    string | null
  >(null);
  const [isMusicBrainzChecking, setIsMusicBrainzChecking] = useState(false);
  const [musicBrainzOriginStatus, setMusicBrainzOriginStatus] =
    useState<MusicBrainzOriginCountryStatus | null>(null);
  const [musicBrainzOriginPreview, setMusicBrainzOriginPreview] =
    useState<MusicBrainzOriginCountryPreview | null>(null);
  const [musicBrainzOriginImportSummary, setMusicBrainzOriginImportSummary] =
    useState<MusicBrainzOriginCountryImportSummary | null>(null);
  const [musicBrainzOriginProgress, setMusicBrainzOriginProgress] =
    useState<MusicBrainzOriginCountryImportProgress | null>(null);
  const [musicBrainzOriginLog, setMusicBrainzOriginLog] = useState<
    MusicBrainzOriginCountryImportProgress[]
  >([]);
  const [musicBrainzOriginError, setMusicBrainzOriginError] = useState<
    string | null
  >(null);
  const [musicBrainzOriginReportFilter, setMusicBrainzOriginReportFilter] =
    useState<OriginReportFilter>("needsAttention");
  const [musicBrainzOriginReportSearch, setMusicBrainzOriginReportSearch] =
    useState("");
  const [isMusicBrainzOriginPreviewing, setIsMusicBrainzOriginPreviewing] =
    useState(false);
  const [isMusicBrainzOriginImporting, setIsMusicBrainzOriginImporting] =
    useState(false);
  const [musicBrainzArtistInfoStatus, setMusicBrainzArtistInfoStatus] =
    useState<MusicBrainzArtistInfoStatus | null>(null);
  const [musicBrainzArtistInfoPreview, setMusicBrainzArtistInfoPreview] =
    useState<MusicBrainzArtistInfoPreview | null>(null);
  const [
    musicBrainzArtistInfoImportSummary,
    setMusicBrainzArtistInfoImportSummary,
  ] = useState<MusicBrainzArtistInfoImportSummary | null>(null);
  const [musicBrainzArtistInfoProgress, setMusicBrainzArtistInfoProgress] =
    useState<MusicBrainzArtistInfoImportProgress | null>(null);
  const [musicBrainzArtistInfoLog, setMusicBrainzArtistInfoLog] = useState<
    MusicBrainzArtistInfoImportProgress[]
  >([]);
  const [musicBrainzArtistInfoError, setMusicBrainzArtistInfoError] = useState<
    string | null
  >(null);
  const [
    musicBrainzArtistInfoReportFilter,
    setMusicBrainzArtistInfoReportFilter,
  ] = useState<ArtistInfoReportFilter>("needsAttention");
  const [
    musicBrainzArtistInfoReportSearch,
    setMusicBrainzArtistInfoReportSearch,
  ] = useState("");
  const [
    isMusicBrainzArtistInfoPreviewing,
    setIsMusicBrainzArtistInfoPreviewing,
  ] = useState(false);
  const [
    isMusicBrainzArtistInfoImporting,
    setIsMusicBrainzArtistInfoImporting,
  ] = useState(false);
  const [musicBrainzCachePathDraft, setMusicBrainzCachePathDraft] = useState(
    settings.musicBrainzCachePath || defaultMusicBrainzCachePath,
  );
  const [musicBrainzOverlaySyncPathDraft, setMusicBrainzOverlaySyncPathDraft] =
    useState(
      settings.musicBrainzOverlaySyncPath || defaultMusicBrainzOverlaySyncPath,
    );
  const [musicBrainzOverlayAutoSyncDraft, setMusicBrainzOverlayAutoSyncDraft] =
    useState(
      String(
        overlayAutoSyncMinutesValue(settings.musicBrainzOverlayAutoSyncMinutes),
      ),
    );
  const [appUpdateAutoCheckDraft, setAppUpdateAutoCheckDraft] = useState(
    String(updateAutoCheckMinutesValue(settings.updateAutoCheckMinutes)),
  );
  const [appUpdateStatus, setAppUpdateStatus] =
    useState<AppUpdateStatus>("idle");
  const [appUpdateInfo, setAppUpdateInfo] = useState<AppUpdateInfo | null>(
    null,
  );
  const [appUpdateError, setAppUpdateError] = useState<string | null>(null);
  const [appUpdateLastCheckedAt, setAppUpdateLastCheckedAt] = useState<
    string | null
  >(null);
  const [appUpdateProgress, setAppUpdateProgress] =
    useState<AppUpdateInstallProgress | null>(null);
  const [isAppUpdateBannerDismissed, setIsAppUpdateBannerDismissed] =
    useState(false);
  const [musicBrainzOverlaySyncResult, setMusicBrainzOverlaySyncResult] =
    useState<MusicBrainzOverlaySyncResult | null>(null);
  const [musicBrainzOverlaySyncLog, setMusicBrainzOverlaySyncLog] = useState<
    MusicBrainzOverlaySyncLogEntry[]
  >([]);
  const [musicBrainzOverlaySyncError, setMusicBrainzOverlaySyncError] =
    useState<string | null>(null);
  const [isMusicBrainzOverlaySyncing, setIsMusicBrainzOverlaySyncing] =
    useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const hasAppliedLayoutDefaults = useRef(false);
  const isMusicBrainzOverlaySyncingRef = useRef(false);
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
      nextMusicBrainzStatus,
      nextMusicBrainzOriginStatus,
      nextMusicBrainzArtistInfoStatus,
      nextMusicBrainzOverlaySyncLog,
    ] = await Promise.all([
      getLibraryStatus(),
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
    setStatus(nextStatus);
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

  const loadDiscoveryData = useCallback(async () => {
    setIsDiscoveryLoading(true);
    const nextDiscovery = await getDiscovery();
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
    if (activeSection !== "Tools" || !selectedToolId) {
      return;
    }

    let unlisten: (() => void) | null = null;
    void listenToMusicToolProgress((nextProgress) => {
      setToolProgress((previous) =>
        nextProgress.toolId === selectedToolId &&
        nextProgress.requestId === toolIssueRequest.requestId
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
    document.documentElement.dataset.theme = settings.darkMode
      ? "dark"
      : "light";
  }, [settings.darkMode]);

  const lastRun = runs[0] ?? status?.lastImport ?? null;
  const currentFilters = request.filters;
  const albumFilters = albumRequest.filters;
  const genreSuggestionOptions = useMemo(
    () =>
      uniqueGenreSuggestionOptions([
        ...genreSuggestionAliases,
        ...genreSuggestionNames,
      ]),
    [genreSuggestionNames],
  );
  const originCountryOptions = musicBrainzOriginStatus?.countries ?? [];
  const availableSearchExportColumns = useMemo(
    () =>
      searchExportColumnOptions.filter(
        (option) => !option.views || option.views.includes(request.view),
      ),
    [request.view],
  );
  const requestGenreSuggestionRefresh = useCallback(() => {
    void refreshGenreSuggestions().catch(() => {
      // Field focus can retry again; keep the existing option list.
    });
  }, [refreshGenreSuggestions]);
  const chartRequest = useMemo(
    () => chartRequestFromConfig(chartConfig),
    [chartConfig],
  );
  const albumTracksRequest = useMemo(
    () => (selectedAlbumId ? createAlbumTracksRequest(selectedAlbumId) : null),
    [selectedAlbumId],
  );
  const selectedArtist =
    artistResponse?.rows.find((artist) => artist.id === selectedArtistId) ??
    null;
  const artistAlbumsRequest = useMemo(
    () => (selectedArtist ? createArtistAlbumsRequest(selectedArtist) : null),
    [selectedArtist],
  );
  const selectedArtistAlbum =
    artistAlbumsResponse?.rows.find(
      (row) => row.albumId === selectedArtistAlbumId,
    ) ?? null;
  const artistAlbumTracksRequest = useMemo(
    () =>
      selectedArtistAlbumId
        ? createAlbumTracksRequest(selectedArtistAlbumId)
        : null,
    [selectedArtistAlbumId],
  );
  const shouldLoadArtistAlbumTracks =
    artistDetailTabNeedsTracks(artistDetailTab);
  const shouldLoadArtistMusicBrainz =
    artistDetailTabNeedsMusicBrainz(artistDetailTab);
  const selectedGenre =
    genreResponse?.rows.find((genre) => genre.id === selectedGenreId) ??
    genreTimelineResponse?.rows.find((genre) => genre.id === selectedGenreId) ??
    null;
  const genreAlbumsRequest = useMemo(
    () => (selectedGenre ? createGenreAlbumsRequest(selectedGenre) : null),
    [selectedGenre],
  );
  const selectedCatalogTool =
    musicTools.find((tool) => tool.id === selectedToolId) ?? null;
  const currentToolIssueResponse =
    toolIssueResponse?.tool.id === selectedToolId ? toolIssueResponse : null;
  const selectedTool = currentToolIssueResponse?.tool ?? selectedCatalogTool;
  const activeToolProgress =
    toolProgress?.toolId === selectedToolId &&
    toolProgress.requestId === toolIssueRequest.requestId
      ? toolProgress
      : null;
  const activeToolProgressText = formatToolProgress(activeToolProgress);
  const isToolProgressActive = isMusicToolProgressActive(activeToolProgress);
  const isToolRunPending =
    isToolIssuesLoading || isToolProgressActive || isToolFixing;

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
            setBrowseError(
              searchError instanceof Error
                ? searchError.message
                : String(searchError),
            );
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
            setAlbumError(
              searchError instanceof Error
                ? searchError.message
                : String(searchError),
            );
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
      previous && rows.some((row) => row.albumId === previous)
        ? previous
        : rows[0].albumId,
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
          setAlbumTracksError(
            searchError instanceof Error
              ? searchError.message
              : String(searchError),
          );
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
            setArtistError(
              searchError instanceof Error
                ? searchError.message
                : String(searchError),
            );
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
    const nextArtistId =
      selectedArtistId && rows.some((artist) => artist.id === selectedArtistId)
        ? selectedArtistId
        : (rows[0]?.id ?? null);

    if (nextArtistId === selectedArtistId) {
      return;
    }

    resetDeferredArtistDetails();
    setSelectedArtistId(nextArtistId);
  }, [activeSection, artistResponse, selectedArtistId]);

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
          setArtistAlbumsError(
            searchError instanceof Error
              ? searchError.message
              : String(searchError),
          );
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
      previous && rows.some((row) => row.albumId === previous)
        ? previous
        : rows[0].albumId,
    );
  }, [activeSection, artistAlbumsResponse]);

  useEffect(() => {
    if (
      activeSection !== "Artists" ||
      !shouldLoadArtistAlbumTracks ||
      !artistAlbumTracksRequest
    ) {
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
          setArtistAlbumTracksError(
            searchError instanceof Error
              ? searchError.message
              : String(searchError),
          );
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
  }, [activeSection, artistAlbumTracksRequest, shouldLoadArtistAlbumTracks]);

  useEffect(() => {
    if (activeSection !== "Artists") {
      return;
    }

    if (!selectedArtist) {
      setMusicBrainzArtistDiscography(null);
      setMusicBrainzArtistError(null);
      setIsMusicBrainzArtistLoading(false);
      setIsMusicBrainzArtistUpdating(false);
      setMusicBrainzArtistExportResult(null);
      setMusicBrainzArtistRefreshResult(null);
      setMusicBrainzArtistOriginResult(null);
      return;
    }

    if (
      !shouldLoadArtistMusicBrainz ||
      musicBrainzArtistDiscography?.artistKey === selectedArtist.id
    ) {
      return;
    }

    let cancelled = false;
    setIsMusicBrainzArtistLoading(true);
    setIsMusicBrainzArtistUpdating(false);
    setMusicBrainzArtistError(null);
    setMusicBrainzArtistExportResult(null);
    setMusicBrainzArtistRefreshResult(null);
    setMusicBrainzArtistOriginResult(null);
    void getMusicBrainzArtistDiscography(selectedArtist.id, selectedArtist.name)
      .then((nextResponse) => {
        if (!cancelled) {
          setMusicBrainzArtistDiscography(nextResponse);
        }
      })
      .catch((discographyError) => {
        if (!cancelled) {
          setMusicBrainzArtistError(
            discographyError instanceof Error
              ? discographyError.message
              : String(discographyError),
          );
          setMusicBrainzArtistDiscography(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsMusicBrainzArtistLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeSection,
    musicBrainzArtistDiscography?.artistKey,
    selectedArtist,
    shouldLoadArtistMusicBrainz,
  ]);

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
            setGenreError(
              searchError instanceof Error
                ? searchError.message
                : String(searchError),
            );
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
    if (activeSection !== "Genres") {
      return;
    }

    let cancelled = false;
    setIsGenreTimelineLoading(true);
    setGenreTimelineError(null);
    void listGenres(createGenreTimelineRequest())
      .then((nextResponse) => {
        if (!cancelled) {
          setGenreTimelineResponse(nextResponse);
        }
      })
      .catch((searchError) => {
        if (!cancelled) {
          setGenreTimelineError(
            searchError instanceof Error
              ? searchError.message
              : String(searchError),
          );
          setGenreTimelineResponse(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsGenreTimelineLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection, genreTimelineRefreshKey]);

  useEffect(() => {
    const visibleGenreNames =
      genreResponse?.rows.map((genre) => genre.name) ?? [];
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
    const timelineRows = genreTimelineResponse?.rows ?? [];

    setSelectedGenreId((previous) =>
      previous &&
      [...rows, ...timelineRows].some((genre) => genre.id === previous)
        ? previous
        : (rows[0]?.id ?? timelineRows[0]?.id ?? null),
    );
  }, [activeSection, genreResponse, genreTimelineResponse]);

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
          setGenreAlbumsError(
            searchError instanceof Error
              ? searchError.message
              : String(searchError),
          );
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
                  const previousTool = previous.find(
                    (tool) => tool.id === nextTool.id,
                  );
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
          setToolsError(
            searchError instanceof Error
              ? searchError.message
              : String(searchError),
          );
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

    let cancelled = false;
    setToolFixHistoryError(null);
    void listMusicToolFixHistory()
      .then((history) => {
        if (!cancelled) {
          setToolFixHistory(history);
        }
      })
      .catch((historyError) => {
        if (!cancelled) {
          setToolFixHistoryError(
            historyError instanceof Error
              ? historyError.message
              : String(historyError),
          );
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
      previous && musicTools.some((tool) => tool.id === previous)
        ? previous
        : musicTools[0].id,
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
    if (
      activeSection !== "Tools" ||
      !selectedToolId ||
      toolIssueRequest.toolId !== selectedToolId
    ) {
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
            setToolIssueError(
              searchError instanceof Error
                ? searchError.message
                : String(searchError),
            );
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
      previous.map((tool) =>
        tool.id === toolIssueResponse.tool.id ? toolIssueResponse.tool : tool,
      ),
    );
  }, [toolIssueResponse]);

  useEffect(() => {
    setToolExportResult(null);
    setToolFixSummary((previous) =>
      previous?.applied ? previous : null,
    );
    setToolFixIssueIds([]);
    setToolFixError(null);
  }, [
    toolIssueRequest.toolId,
    toolIssueRequest.searchText,
    toolIssueRequest.sort.field,
    toolIssueRequest.sort.direction,
    toolIssueRequest.limit,
    toolIssueRequest.offset,
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
            setChartError(
              searchError instanceof Error
                ? searchError.message
                : String(searchError),
            );
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
            setDiscoveryAlbumError(
              searchError instanceof Error
                ? searchError.message
                : String(searchError),
            );
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

  const musicBrainzOriginProgressPercent = useMemo(() => {
    if (!musicBrainzOriginProgress) {
      return 0;
    }
    return Math.min(100, Math.max(0, musicBrainzOriginProgress.percent));
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
    return Math.min(100, Math.max(0, musicBrainzArtistInfoProgress.percent));
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

  const importPathsDirty = useMemo(
    () =>
      textSettingValue(sourcePath, defaultImportSourcePath) !==
        settings.importSourcePath ||
      textSettingValue(coverSourcePath, defaultCoverSourcePath) !==
        settings.coverSourcePath ||
      textSettingValue(billboardSourcePath, defaultBillboardSourcePath) !==
        settings.billboardSourcePath ||
      textSettingValue(
        billboardSinglesSourcePath,
        defaultBillboardSinglesSourcePath,
      ) !== settings.billboardSinglesSourcePath,
    [
      billboardSinglesSourcePath,
      billboardSourcePath,
      coverSourcePath,
      settings.billboardSinglesSourcePath,
      settings.billboardSourcePath,
      settings.coverSourcePath,
      settings.importSourcePath,
      sourcePath,
    ],
  );

  const chips = useMemo(() => {
    const nextChips: { key: string; label: ReactNode; remove: () => void }[] =
      [];
    const addTextChip = (
      key: keyof BrowseFilters,
      label: string,
      filter: TextFilter,
    ) => {
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
        remove: () =>
          setRequest((previous) => ({
            ...previous,
            searchText: "",
            offset: 0,
          })),
      });
    }

    addTextChip("albumTitle", "Album", currentFilters.albumTitle);
    addTextChip("trackTitle", "Track", currentFilters.trackTitle);
    addTextChip("albumArtist", "Album artist", currentFilters.albumArtist);
    addTextChip(
      "displayArtist",
      "Display artist",
      currentFilters.displayArtist,
    );
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
    if (currentFilters.originCountryCodes.length) {
      nextChips.push({
        key: "originCountryCodes",
        label: (
          <>
            Origin:{" "}
            <CountryListDisplay
              values={currentFilters.originCountryCodes}
              countryOptions={originCountryOptions}
              mode={settings.countryFlagDisplay}
            />
          </>
        ),
        remove: () => updateFilter("originCountryCodes", []),
      });
    }
    if (currentFilters.excludedOriginCountryCodes.length) {
      nextChips.push({
        key: "excludedOriginCountryCodes",
        label: (
          <>
            Origin excluding:{" "}
            <CountryListDisplay
              values={currentFilters.excludedOriginCountryCodes}
              countryOptions={originCountryOptions}
              mode={settings.countryFlagDisplay}
            />
          </>
        ),
        remove: () => updateFilter("excludedOriginCountryCodes", []),
      });
    }
    if (currentFilters.missingOriginCountry) {
      nextChips.push({
        key: "missingOriginCountry",
        label: "Missing origin country",
        remove: () => updateFilter("missingOriginCountry", false),
      });
    }
    if (currentFilters.artistType.trim()) {
      nextChips.push({
        key: "artistType",
        label: `Type: ${currentFilters.artistType.trim()}`,
        remove: () => updateFilter("artistType", ""),
      });
    }
    if (currentFilters.artistGender.trim()) {
      nextChips.push({
        key: "artistGender",
        label: `Gender: ${currentFilters.artistGender.trim()}`,
        remove: () => updateFilter("artistGender", ""),
      });
    }

    addRangeChip(
      nextChips,
      "year",
      "Year",
      currentFilters.yearFrom,
      currentFilters.yearTo,
      () => {
        updateFilters({ yearFrom: null, yearTo: null });
      },
    );
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
        () =>
          updateFilters({
            billboardSingleRankMin: null,
            billboardSingleRankMax: null,
          }),
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
      "artistBorn",
      "Born",
      currentFilters.artistBornYearFrom,
      currentFilters.artistBornYearTo,
      () =>
        updateFilters({
          artistBornYearFrom: null,
          artistBornYearTo: null,
        }),
    );
    if (
      currentFilters.artistDiedYearFrom != null ||
      currentFilters.artistDiedYearTo != null
    ) {
      addRangeChip(
        nextChips,
        "artistDiedYears",
        "Died",
        currentFilters.artistDiedYearFrom,
        currentFilters.artistDiedYearTo,
        () =>
          updateFilters({
            artistDiedYearFrom: null,
            artistDiedYearTo: null,
          }),
      );
    } else if (currentFilters.artistDied) {
      nextChips.push({
        key: "artistDied",
        label: "Dead artists",
        remove: () => updateFilter("artistDied", false),
      });
    }
    addRangeChip(
      nextChips,
      "artistFounded",
      "Founded",
      currentFilters.artistFoundedYearFrom,
      currentFilters.artistFoundedYearTo,
      () =>
        updateFilters({
          artistFoundedYearFrom: null,
          artistFoundedYearTo: null,
        }),
    );
    if (
      currentFilters.artistDissolvedYearFrom != null ||
      currentFilters.artistDissolvedYearTo != null
    ) {
      addRangeChip(
        nextChips,
        "artistDissolvedYears",
        "Dissolved",
        currentFilters.artistDissolvedYearFrom,
        currentFilters.artistDissolvedYearTo,
        () =>
          updateFilters({
            artistDissolvedYearFrom: null,
            artistDissolvedYearTo: null,
          }),
      );
    } else if (currentFilters.artistDissolved) {
      nextChips.push({
        key: "artistDissolved",
        label: "Dissolved groups",
        remove: () => updateFilter("artistDissolved", false),
      });
    }
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
      () =>
        updateFilters({
          ratingCompletenessMin: null,
          ratingCompletenessMax: null,
        }),
      "%",
    );
    if (currentFilters.notFullyRated) {
      nextChips.push({
        key: "notFullyRated",
        label: "Not fully rated",
        remove: () => updateFilter("notFullyRated", false),
      });
    }
    if (
      currentFilters.lovedTracksMin != null ||
      currentFilters.lovedTracksMax != null
    ) {
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
  }, [
    currentFilters,
    originCountryOptions,
    request.searchText,
    request.view,
    settings.countryFlagDisplay,
  ]);
  const advancedSearchFilterCount = countAdvancedSearchFilters(
    currentFilters,
    request.view,
  );

  const albumChips = useMemo(() => {
    const nextChips: { key: string; label: ReactNode; remove: () => void }[] =
      [];
    const addTextChip = (
      key: keyof BrowseFilters,
      label: string,
      filter: TextFilter,
    ) => {
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
        remove: () =>
          setAlbumRequest((previous) => ({
            ...previous,
            searchText: "",
            offset: 0,
          })),
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

    addRangeChip(
      nextChips,
      "year",
      "Year",
      albumFilters.yearFrom,
      albumFilters.yearTo,
      () => {
        updateAlbumFilters({ yearFrom: null, yearTo: null });
      },
    );
    addRangeChip(
      nextChips,
      "billboard",
      "Billboard",
      albumFilters.billboardRankMin,
      albumFilters.billboardRankMax,
      () =>
        updateAlbumFilters({ billboardRankMin: null, billboardRankMax: null }),
    );
    addRangeChip(
      nextChips,
      "minutes",
      "Minutes",
      albumFilters.totalMinutesMin,
      albumFilters.totalMinutesMax,
      () =>
        updateAlbumFilters({ totalMinutesMin: null, totalMinutesMax: null }),
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
      () =>
        updateAlbumFilters({
          ratingCompletenessMin: null,
          ratingCompletenessMax: null,
        }),
      "%",
    );
    if (albumFilters.notFullyRated) {
      nextChips.push({
        key: "notFullyRated",
        label: "Not fully rated",
        remove: () => updateAlbumFilter("notFullyRated", false),
      });
    }
    if (
      albumFilters.lovedTracksMin != null ||
      albumFilters.lovedTracksMax != null
    ) {
      addRangeChip(
        nextChips,
        "lovedTracks",
        "Loved",
        albumFilters.lovedTracksMin,
        albumFilters.lovedTracksMax,
        () =>
          updateAlbumFilters({ lovedTracksMin: null, lovedTracksMax: null }),
      );
    }

    return nextChips;
  }, [albumFilters, albumRequest.searchText]);

  function updateFilter<K extends keyof BrowseFilters>(
    key: K,
    value: BrowseFilters[K],
  ) {
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

  function toggleSearchExportColumn(value: string) {
    setSearchExportColumns((previous) =>
      previous.includes(value)
        ? previous.filter((column) => column !== value)
        : [...previous, value],
    );
    setExportResult(null);
  }

  function toggleSearchTableColumn(value: string) {
    setSearchTableColumns((previous) =>
      previous.includes(value)
        ? previous.filter((column) => column !== value)
        : [...previous, value],
    );
  }

  function updateAlbumFilter<K extends keyof BrowseFilters>(
    key: K,
    value: BrowseFilters[K],
  ) {
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

  function refreshOriginJoinedViews() {
    setRequest((current) => ({ ...current }));
    setAlbumRequest((current) => ({ ...current }));
    setChartConfig((current) => ({ ...current }));
    setArtistRequest((current) => ({ ...current }));
    setArtistAlbumsResponse(null);
    setGenreAlbumsResponse(null);
    setDiscoveryAlbumResponse(null);
  }

  function applyArtistOriginUpdate(
    update: MusicBrainzArtistOriginCountryUpdate | null,
  ) {
    if (!update) {
      return;
    }

    setArtistResponse((current) =>
      current
        ? {
            ...current,
            rows: current.rows.map((artist) =>
              artist.id === update.artistKey
                ? {
                    ...artist,
                    originCountryCode: update.originCountryCode,
                    originCountryName: update.originCountryName,
                    originCountryRawArea: update.originCountryRawArea,
                    originCountryReviewState: update.originCountryReviewState,
                  }
                : artist,
            ),
          }
        : current,
    );
    refreshOriginJoinedViews();
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

  function resetDeferredArtistDetails() {
    setArtistDetailTab("local-albums");
    setSelectedArtistAlbumId(null);
    setArtistAlbumTracksResponse(null);
    setArtistAlbumTracksError(null);
    setIsArtistAlbumTracksLoading(false);
    setMusicBrainzArtistDiscography(null);
    setMusicBrainzArtistError(null);
    setIsMusicBrainzArtistLoading(false);
    setIsMusicBrainzArtistUpdating(false);
    setMusicBrainzArtistExportResult(null);
    setMusicBrainzArtistRefreshResult(null);
    setMusicBrainzArtistOriginResult(null);
  }

  function clearArtistQuery() {
    setArtistRequest((previous) => ({
      ...createArtistListRequest(),
      limit: previous.limit,
    }));
    resetDeferredArtistDetails();
    setArtistExportResult(null);
  }

  function selectArtist(artistId: string) {
    resetDeferredArtistDetails();
    setSelectedArtistId(artistId);
    setArtistExportResult(null);
  }

  function selectArtistAlbum(albumId: string) {
    setSelectedArtistAlbumId(albumId);
    setArtistAlbumTracksResponse(null);
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
    setGenreTimelineResetSignal((previous) => previous + 1);
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
    setToolFixSummary(null);
    setToolFixError(null);
  }

  function selectMusicTool(toolId: string) {
    setSelectedToolId(toolId);
    setToolIssueRequest((previous) => ({
      ...createMusicToolIssueRequest(toolId),
      limit: previous.limit,
    }));
    setToolExportResult(null);
    setToolFixSummary(null);
    setToolFixError(null);
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

  async function prepareLibraryImport() {
    setIsImporting(true);
    setImportError(null);
    setProgress({
      ...defaultProgress,
      status: "starting",
      message:
        importPreview?.canResume && !importPreview.sourceChanged
          ? "Opening the last durable TSV checkpoint."
          : "Starting a resumable pre-import scan.",
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
      setImportError(message);
      setProgress((previous) => ({
        ...previous,
        status: "failed",
        message,
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

  async function applyPreparedLibraryImport() {
    if (!importPreview || importPreview.status !== "ready") {
      return;
    }
    const confirmed = window.confirm(
      [
        "Apply this prepared MusicBee import?",
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
      setBillboardSinglesImportError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIsImportingBillboardSingles(false);
    }
  }

  async function saveCurrentSearch() {
    const fallbackName =
      request.searchText.trim() ||
      `${request.view === "albums" ? "Album" : "Track"} search`;
    const saved = await saveSearch(saveName.trim() || fallbackName, request);
    setSavedSearches((previous) => [
      saved,
      ...previous.filter((search) => search.id !== saved.id),
    ]);
    setSaveName("");
  }

  function openInsightInSearch(cohort: InsightCohort) {
    setRequest(normalizeBrowseRequestForClient(cohort.request));
    setActiveSection("Search");
  }

  async function saveInsightView(cohort: InsightCohort) {
    const saved = await saveSearch(
      cohort.title,
      normalizeBrowseRequestForClient(cohort.request),
    );
    setSavedSearches((previous) => [
      saved,
      ...previous.filter((search) => search.id !== saved.id),
    ]);
  }

  function openInsightInPlaylist(cohort: InsightCohort) {
    setPlaylistLaunch({
      id: Date.now(),
      cohortTitle: cohort.title,
      prompt: cohort.playlistPrompt,
      request: normalizeBrowseRequestForClient(cohort.request),
    });
    setActiveSection("Playlists");
  }

  async function removeSavedSearch(id: number) {
    await deleteSavedSearch(id);
    setSavedSearches((previous) =>
      previous.filter((search) => search.id !== id),
    );
  }

  async function runExport(format: string) {
    const result = await exportSearch(
      request,
      format,
      includeCalculated,
      searchExportColumns,
    );
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
    const result = await exportSearch(
      artistAlbumsRequest,
      format,
      artistIncludeCalculated,
    );
    setArtistExportResult(result);
  }

  async function refreshArtistMusicBrainz() {
    if (!selectedArtist) {
      return;
    }

    setIsMusicBrainzArtistLoading(true);
    setIsMusicBrainzArtistUpdating(false);
    setMusicBrainzArtistError(null);
    setMusicBrainzArtistExportResult(null);
    setMusicBrainzArtistRefreshResult(null);
    setMusicBrainzArtistOriginResult(null);
    setMusicBrainzArtistOriginResult(null);

    try {
      const result = await getMusicBrainzArtistDiscography(
        selectedArtist.id,
        selectedArtist.name,
      );
      setMusicBrainzArtistDiscography(result);
      setArtistRequest((current) => ({ ...current }));
    } catch (error) {
      setMusicBrainzArtistError(
        error instanceof Error ? error.message : String(error),
      );
      setMusicBrainzArtistDiscography(null);
    } finally {
      setIsMusicBrainzArtistLoading(false);
    }
  }

  async function setArtistMusicBrainzReleaseDecision(
    row: MusicBrainzArtistReleaseRow,
    decision: "not-in-scope" | "include",
  ) {
    if (!selectedArtist || !musicBrainzArtistDiscography) {
      return;
    }

    setIsMusicBrainzArtistLoading(true);
    setIsMusicBrainzArtistUpdating(false);
    setMusicBrainzArtistError(null);
    setMusicBrainzArtistExportResult(null);
    setMusicBrainzArtistRefreshResult(null);
    setMusicBrainzArtistOriginResult(null);

    try {
      await setMusicBrainzReleaseDecision({
        artistKey: selectedArtist.id,
        artistName: selectedArtist.name,
        musicbrainzMbid: musicBrainzArtistDiscography.musicbrainzMbid,
        releaseMbid: row.releaseMbid,
        decision,
        localAlbumId: row.localAlbumId,
      });
      const result = await getMusicBrainzArtistDiscography(
        selectedArtist.id,
        selectedArtist.name,
      );
      setMusicBrainzArtistDiscography(result);
      setArtistRequest((current) => ({ ...current }));
    } catch (error) {
      setMusicBrainzArtistError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIsMusicBrainzArtistLoading(false);
    }
  }

  async function setArtistMusicBrainzLink(
    action: "verify" | "ignore" | "unlink" | "set",
    musicbrainzMbid?: string | null,
    canonicalName?: string | null,
  ) {
    if (!selectedArtist) {
      return;
    }

    setIsMusicBrainzArtistLoading(true);
    setIsMusicBrainzArtistUpdating(false);
    setMusicBrainzArtistError(null);
    setMusicBrainzArtistExportResult(null);
    setMusicBrainzArtistRefreshResult(null);
    setMusicBrainzArtistOriginResult(null);

    try {
      await setMusicBrainzArtistLink({
        artistKey: selectedArtist.id,
        artistName: selectedArtist.name,
        action,
        musicbrainzMbid:
          musicbrainzMbid ??
          musicBrainzArtistDiscography?.musicbrainzMbid ??
          null,
        canonicalName:
          canonicalName ??
          musicBrainzArtistDiscography?.matchedCacheName ??
          selectedArtist.name,
      });
      const result = await getMusicBrainzArtistDiscography(
        selectedArtist.id,
        selectedArtist.name,
      );
      setMusicBrainzArtistDiscography(result);
      setArtistRequest((current) => ({ ...current }));
    } catch (error) {
      setMusicBrainzArtistError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIsMusicBrainzArtistLoading(false);
    }
  }

  async function updateArtistMusicBrainzInfo() {
    const musicBrainzMbid =
      musicBrainzArtistDiscography?.musicbrainzMbid ??
      selectedArtist?.musicBrainzMbid ??
      null;
    if (!selectedArtist || !musicBrainzMbid) {
      return;
    }

    setIsMusicBrainzArtistLoading(true);
    setIsMusicBrainzArtistUpdating(true);
    setMusicBrainzArtistError(null);
    setMusicBrainzArtistExportResult(null);
    setMusicBrainzArtistRefreshResult(null);

    try {
      const refreshResult = await refreshMusicBrainzArtistInfo({
        artistKey: selectedArtist.id,
        artistName: selectedArtist.name,
        musicbrainzMbid: musicBrainzMbid,
      });
      const discography = await getMusicBrainzArtistDiscography(
        selectedArtist.id,
        selectedArtist.name,
      );
      setMusicBrainzArtistDiscography(discography);
      setMusicBrainzArtistRefreshResult(refreshResult);
      setMusicBrainzArtistOriginResult(null);
      applyArtistOriginUpdate(refreshResult.origin);
      setArtistRequest((current) => ({ ...current }));
      await Promise.all([
        refreshMusicBrainzOriginCountryStatus(),
        refreshMusicBrainzArtistInfoStatus(),
      ]);
    } catch (error) {
      setMusicBrainzArtistError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIsMusicBrainzArtistUpdating(false);
      setIsMusicBrainzArtistLoading(false);
    }
  }

  async function saveArtistOriginCountry(
    countryCode: string,
    countryName?: string | null,
  ) {
    if (!selectedArtist) {
      return;
    }

    setIsMusicBrainzArtistLoading(true);
    setIsMusicBrainzArtistUpdating(false);
    setMusicBrainzArtistError(null);
    setMusicBrainzArtistExportResult(null);
    setMusicBrainzArtistRefreshResult(null);
    setMusicBrainzArtistOriginResult(null);

    try {
      const origin = await setMusicBrainzArtistOriginCountry({
        artistKey: selectedArtist.id,
        artistName: selectedArtist.name,
        musicbrainzMbid:
          musicBrainzArtistDiscography?.musicbrainzMbid ??
          selectedArtist.musicBrainzMbid ??
          null,
        countryCode,
        countryName,
      });
      setMusicBrainzArtistOriginResult(origin);
      applyArtistOriginUpdate(origin);
      await refreshMusicBrainzOriginCountryStatus();
    } catch (error) {
      setMusicBrainzArtistError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIsMusicBrainzArtistLoading(false);
    }
  }

  async function runArtistMusicBrainzExport(format: "csv" | "xlsx") {
    if (
      !selectedArtist ||
      !musicBrainzArtistDiscography ||
      musicBrainzArtistDiscography.artistLinkIgnored
    ) {
      return;
    }

    const rows = musicBrainzArtistDiscography.releases
      .filter((row) => row.status !== "excluded")
      .map((row) => ({
        releaseMbid: row.releaseMbid,
        title: row.title,
        year: row.year,
        status: row.status,
        localAlbumTitle: row.localAlbumTitle,
        localYear: row.localYear,
        matchMethod: row.matchMethod,
        confidence: row.confidence,
      }));

    if (rows.length === 0) {
      return;
    }

    const request: Omit<MusicBrainzArtistExportRequest, "format"> = {
      artistKey: selectedArtist.id,
      artistName: selectedArtist.name,
      musicbrainzMbid: musicBrainzArtistDiscography.musicbrainzMbid,
      matchedCacheName: musicBrainzArtistDiscography.matchedCacheName,
      matchMethod: musicBrainzArtistDiscography.matchMethod,
      artistLinkState: musicBrainzArtistDiscography.artistLinkState,
      artistLinkIgnored: musicBrainzArtistDiscography.artistLinkIgnored,
      rows,
    };

    setMusicBrainzArtistError(null);
    try {
      const result = await exportMusicBrainzArtistReleases(request, format);
      setMusicBrainzArtistExportResult(result);
    } catch (error) {
      setMusicBrainzArtistError(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async function openMusicBrainzArtistPage(url: string) {
    setMusicBrainzArtistError(null);
    try {
      await openExternalUrl(url);
    } catch (error) {
      setMusicBrainzArtistError(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async function runGenreExport(format: string) {
    if (!genreAlbumsRequest) {
      return;
    }
    const result = await exportSearch(
      genreAlbumsRequest,
      format,
      genreIncludeCalculated,
    );
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

  async function refreshToolFixHistory() {
    setToolFixHistoryError(null);
    try {
      setToolFixHistory(await listMusicToolFixHistory());
    } catch (error) {
      setToolFixHistoryError(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async function runToolFix(apply: boolean) {
    if (!selectedTool || !currentToolIssueResponse) {
      return;
    }

    const issueIds = apply
      ? toolFixIssueIds
      : currentToolIssueResponse.rows.map((row) => row.id);
    if (issueIds.length === 0) {
      return;
    }

    if (
      apply &&
      (!toolFixSummary ||
        toolFixSummary.toolId !== selectedTool.id ||
        toolFixSummary.applied)
    ) {
      setToolFixError("Preview this repair again before applying it.");
      return;
    }

    setIsToolFixing(true);
    setToolFixError(null);
    try {
      const summary = await fixMusicToolIssues({
        toolId: selectedTool.id,
        issueIds,
        apply,
      });
      setToolFixSummary(summary);
      setToolFixIssueIds(apply ? [] : issueIds);
      if (apply) {
        setToolExportResult(null);
        await refreshToolFixHistory();
        setToolIssueRequest((previous) =>
          renewMusicToolIssueRequest(previous, {
            offset: 0,
          }),
        );
      }
    } catch (error) {
      setToolFixError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsToolFixing(false);
    }
  }

  async function runToolUndo(runId: number) {
    if (undoingToolFixRunId != null) {
      return;
    }

    setUndoingToolFixRunId(runId);
    setToolFixError(null);
    try {
      await undoMusicToolFix(runId);
      setToolFixSummary(null);
      setToolFixIssueIds([]);
      setToolExportResult(null);
      await refreshToolFixHistory();
      setToolIssueRequest((previous) =>
        renewMusicToolIssueRequest(previous, {
          offset: 0,
        }),
      );
    } catch (error) {
      setToolFixError(error instanceof Error ? error.message : String(error));
    } finally {
      setUndoingToolFixRunId(null);
    }
  }

  function updateChartConfig(values: Partial<ChartConfig>) {
    setChartConfig((previous) => {
      const nextConfig = {
        ...previous,
        ...values,
        sortField:
          values.sortField ??
          (values.rankingMetric ? values.rankingMetric : previous.sortField),
        request: values.request ?? previous.request,
      };
      if (values.gridCoverSize != null) {
        nextConfig.gridCoverSize = normalizeChartGridCoverSize(
          values.gridCoverSize,
        );
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

  function toggleChartColumn(
    value: string,
    key: "visibleColumns" | "exportColumns",
  ) {
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
      saved,
      ...previous.filter((chart) => chart.id !== saved.id),
    ]);
    setChartName("");
  }

  async function removeSavedChart(id: number) {
    await deleteSavedChart(id);
    setSavedCharts((previous) => previous.filter((chart) => chart.id !== id));
  }

  async function runChartExport(format: string) {
    const result = await exportSearch(
      chartRequest,
      format,
      chartConfig.exportColumns.includes("calculated"),
      chartConfig.exportColumns,
    );
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

  function openDiscoveryAlbums(
    selection: DiscoverySelection,
    nextRequest: BrowseRequest,
  ) {
    setDiscoverySelection(selection);
    setDiscoveryAlbumRequest(nextRequest);
    setDiscoveryAlbumResponse(null);
    setDiscoveryAlbumError(null);
  }

  function openDiscoveryMission(mission: DiscoveryMission) {
    setDiscoveryCohort(discoveryMissionCohort(mission));
    openDiscoveryAlbums(
      {
        title: mission.title,
        caption: `${formatNumber(mission.albumCount)} albums / ${mission.actionLabel}`,
      },
      createDiscoveryMissionRequest(mission),
    );
  }

  function openDiscoveryHeatmapCell(cell: DiscoveryHeatmapCell) {
    setDiscoveryCohort(discoveryHeatmapCohort(cell));
    openDiscoveryAlbums(
      {
        title: `${cell.genre} / ${cell.year}`,
        caption: `${formatNumber(cell.albumCount)} albums, ${formatPercent(cell.averageRatingCompleteness)} complete`,
      },
      createDiscoveryHeatmapRequest(cell),
    );
  }

  function openDiscoveryAlbumPoint(point: DiscoveryAlbumPoint) {
    setDiscoveryCohort(discoveryAlbumCohort(point));
    openDiscoveryAlbums(
      {
        title: point.album ?? "Untitled album",
        caption: [point.albumArtistDisplay, point.year, point.genre]
          .filter(Boolean)
          .join(" / "),
      },
      createDiscoveryAlbumPointRequest(point),
    );
  }

  function openDiscoveryGenre(point: DiscoveryGenrePoint) {
    setDiscoveryCohort(discoveryGenreCohort(point));
    openDiscoveryAlbums(
      {
        title: point.genre,
        caption: `${formatNumber(point.albumCount)} albums / ${formatPercent(point.averageRatingCompleteness)} complete`,
      },
      createDiscoveryGenreRequest(point),
    );
  }

  function openDiscoveryArtist(point: DiscoveryArtistPoint) {
    setDiscoveryCohort(discoveryArtistCohort(point));
    openDiscoveryAlbums(
      {
        title: point.artist,
        caption: [formatNumber(point.albumCount), "albums", point.topGenre]
          .filter(Boolean)
          .join(" / "),
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
            setSourcePath(saved.importSourcePath);
          }
          if (Object.prototype.hasOwnProperty.call(values, "coverSourcePath")) {
            setCoverSourcePath(saved.coverSourcePath);
          }
          if (
            Object.prototype.hasOwnProperty.call(values, "billboardSourcePath")
          ) {
            setBillboardSourcePath(saved.billboardSourcePath);
          }
          if (
            Object.prototype.hasOwnProperty.call(
              values,
              "billboardSinglesSourcePath",
            )
          ) {
            setBillboardSinglesSourcePath(saved.billboardSinglesSourcePath);
          }
        }
      });
    settingsSaveQueueRef.current = saveTask.then(
      () => undefined,
      () => undefined,
    );

    try {
      await saveTask;
    } catch (error) {
      if (saveSequence === settingsSaveSequenceRef.current) {
        setSettingsError(
          error instanceof Error ? error.message : String(error),
        );
      }
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

  async function saveImportPathSettings() {
    await saveAppSettings({
      importSourcePath: sourcePath,
      coverSourcePath,
      billboardSourcePath,
      billboardSinglesSourcePath,
    });
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

  async function refreshMusicBrainzOriginCountryStatus() {
    const result = await getMusicBrainzOriginCountryStatus();
    setMusicBrainzOriginStatus(result);
    return result;
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

  async function refreshMusicBrainzArtistInfoStatus() {
    const result = await getMusicBrainzArtistInfoStatus();
    setMusicBrainzArtistInfoStatus(result);
    return result;
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

  async function runMusicBrainzOverlaySync(
    options: { source?: "manual" | "auto" } = {},
  ) {
    if (isMusicBrainzOverlaySyncingRef.current) {
      return;
    }

    const isAutoSync = options.source === "auto";
    const syncPath = musicBrainzOverlaySyncPathDraft.trim();
    if (!syncPath) {
      if (!isAutoSync) {
        setMusicBrainzOverlaySyncError(
          "Choose a shared MusicBrainz overlay sync database path before syncing.",
        );
      }
      return;
    }
    isMusicBrainzOverlaySyncingRef.current = true;
    if (!isAutoSync) {
      setIsMusicBrainzOverlaySyncing(true);
      setMusicBrainzOverlaySyncError(null);
    }

    try {
      if (!isAutoSync) {
        await saveAppSettings({ musicBrainzOverlaySyncPath: syncPath });
      }
      const result = await syncMusicBrainzOverlay({ recordNoop: !isAutoSync });
      if (!isAutoSync || result.changedCount > 0) {
        setMusicBrainzOverlaySyncResult(result);
        setMusicBrainzOverlaySyncPathDraft(result.syncPath);
        const log = await listMusicBrainzOverlaySyncLog(12);
        setMusicBrainzOverlaySyncLog(log);
      }
      if (selectedArtist && (!isAutoSync || result.changedCount > 0)) {
        const discography = await getMusicBrainzArtistDiscography(
          selectedArtist.id,
          selectedArtist.name,
        );
        setMusicBrainzArtistDiscography(discography);
      }
    } catch (error) {
      if (!isAutoSync) {
        setMusicBrainzOverlaySyncError(
          error instanceof Error ? error.message : String(error),
        );
      }
    } finally {
      isMusicBrainzOverlaySyncingRef.current = false;
      if (!isAutoSync) {
        setIsMusicBrainzOverlaySyncing(false);
      }
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
          void appUpdateRef.current?.close().catch(() => undefined);
          appUpdateRef.current = result.update;
          setAppUpdateInfo(result.info);
          setAppUpdateStatus("available");
          setIsAppUpdateBannerDismissed(false);
        } else {
          void appUpdateRef.current?.close().catch(() => undefined);
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
    if (!canImport) {
      return undefined;
    }

    void checkAppUpdate("startup");

    return () => {
      void appUpdateRef.current?.close().catch(() => undefined);
    };
  }, [canImport, checkAppUpdate]);

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

  useEffect(() => {
    const autoCheckMinutes = updateAutoCheckMinutesValue(
      settings.updateAutoCheckMinutes,
    );
    if (!canImport || autoCheckMinutes <= 0) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      void checkAppUpdate("auto");
    }, autoCheckMinutes * 60_000);

    return () => window.clearInterval(intervalId);
  }, [canImport, checkAppUpdate, settings.updateAutoCheckMinutes]);

  useEffect(() => {
    const autoSyncMinutes = overlayAutoSyncMinutesValue(
      settings.musicBrainzOverlayAutoSyncMinutes,
    );
    if (
      !canImport ||
      autoSyncMinutes <= 0 ||
      !settings.musicBrainzOverlaySyncPath.trim()
    ) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      void runMusicBrainzOverlaySync({ source: "auto" });
    }, autoSyncMinutes * 60_000);

    return () => window.clearInterval(intervalId);
  }, [
    canImport,
    settings.musicBrainzOverlayAutoSyncMinutes,
    settings.musicBrainzOverlaySyncPath,
    musicBrainzOverlaySyncPathDraft,
    selectedArtist?.id,
  ]);

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

  const total = response?.total ?? 0;
  const pageStart = total === 0 ? 0 : request.offset + 1;
  const pageEnd = Math.min(total, request.offset + request.limit);
  const albumTotal = albumResponse?.total ?? 0;
  const albumPageStart = albumTotal === 0 ? 0 : albumRequest.offset + 1;
  const albumPageEnd = Math.min(
    albumTotal,
    albumRequest.offset + albumRequest.limit,
  );
  const selectedAlbum =
    albumResponse?.rows.find((row) => row.albumId === selectedAlbumId) ?? null;
  const selectedAlbumTrackCount =
    selectedAlbum?.totalTracks ?? albumTracksResponse?.total ?? 0;
  const artistTotal = artistResponse?.total ?? 0;
  const artistPageStart = artistTotal === 0 ? 0 : artistRequest.offset + 1;
  const artistPageEnd = Math.min(
    artistTotal,
    artistRequest.offset + artistRequest.limit,
  );
  const selectedArtistAlbumCount =
    selectedArtist?.albumCount ?? artistAlbumsResponse?.total ?? 0;
  const selectedArtistAlbumTrackCount =
    selectedArtistAlbum?.totalTracks ?? artistAlbumTracksResponse?.total ?? 0;
  const genreTotal = genreResponse?.total ?? 0;
  const genrePageStart = genreTotal === 0 ? 0 : genreRequest.offset + 1;
  const genrePageEnd = Math.min(
    genreTotal,
    genreRequest.offset + genreRequest.limit,
  );
  const selectedGenreAlbumCount =
    selectedGenre?.albumCount ?? genreAlbumsResponse?.total ?? 0;
  const toolIssueTotal = currentToolIssueResponse?.total ?? 0;
  const toolIssuePageStart =
    toolIssueTotal === 0 ? 0 : toolIssueRequest.offset + 1;
  const toolIssuePageEnd = Math.min(
    toolIssueTotal,
    toolIssueRequest.offset + toolIssueRequest.limit,
  );
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
  const currentChartGridCoverSize = normalizeChartGridCoverSize(
    chartConfig.gridCoverSize,
  );
  const currentChartCompletenessRange = chartCompletenessRange(chartConfig);
  const advancedChartControlCount =
    countAdvancedChartControls(chartConfig);
  const discoveryMissionTotal =
    (discovery?.backlogMissions.length ?? 0) +
    (discovery?.smartMissions.length ?? 0);
  const discoveryMetricValue = (value: number | null | undefined) =>
    isDiscoveryLoading && !discovery ? "Loading" : formatNumber(value);
  const discoveryHeatmapEmptyLabel = isDiscoveryLoading
    ? "Loading heatmap cells."
    : "No heatmap cells yet.";
  const discoveryBacklogEmptyLabel = isDiscoveryLoading
    ? "Loading backlog missions."
    : "No backlog missions yet.";
  const discoverySmartMissionEmptyLabel = isDiscoveryLoading
    ? "Loading smart missions."
    : "No smart missions yet.";
  const discoveryOutlierEmptyLabel = isDiscoveryLoading
    ? "Loading loved/rating outliers."
    : "No loved/rating outliers yet.";
  const discoveryGenreEmptyLabel = isDiscoveryLoading
    ? "Loading genre universe."
    : "No genre universe yet.";
  const discoveryArtistEmptyLabel = isDiscoveryLoading
    ? "Loading artist constellation."
    : "No artist constellation yet.";
  const discoveryAlbumTotal = discoveryAlbumResponse?.total ?? 0;
  const discoveryAlbumPageStart =
    discoveryAlbumTotal === 0 ? 0 : discoveryAlbumRequest.offset + 1;
  const discoveryAlbumPageEnd = Math.min(
    discoveryAlbumTotal,
    discoveryAlbumRequest.offset + discoveryAlbumRequest.limit,
  );
  const ratingAlbumTotal =
    (statistics?.ratingProgress.fullyRatedAlbums ?? 0) +
    (statistics?.ratingProgress.partiallyRatedAlbums ?? 0) +
    (statistics?.ratingProgress.unratedAlbums ?? 0);
  const ratingTrackTotal =
    (statistics?.ratingProgress.ratedTracks ?? 0) +
    (statistics?.ratingProgress.unratedTracks ?? 0);
  const isLeftSidebarHidden = leftSidebarMode === "hidden";
  const hasUsefulDetailContent = workspaceHasUsefulDetails(activeSection, {
    hasDiscovery: discovery != null,
    hasSelectedAlbum: selectedAlbum != null,
    hasSelectedArtist: selectedArtist != null,
    hasSelectedGenre: selectedGenre != null,
    hasSelectedTool: selectedTool != null,
    hasStatistics: statistics != null,
  });
  const {
    isDrawerLayout: isDetailsDrawerLayout,
    isDrawerOpen: isDetailsDrawerOpen,
    openDrawer: openDetailsDrawer,
    closeDrawer: closeDetailsDrawer,
  } = useAdaptiveDetailsLayout(activeSection, hasUsefulDetailContent);
  const effectiveRightSidebarMode = hasUsefulDetailContent
    ? rightSidebarMode
    : "hidden";
  const isRightSidebarHidden =
    !hasUsefulDetailContent ||
    (isDetailsDrawerLayout
      ? !isDetailsDrawerOpen
      : rightSidebarMode === "hidden");
  const musicBrainzMetricTone =
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
  const musicResearchContext: AiMusicResearchContext = (() => {
    if (activeSection === "Albums" && selectedAlbum) {
      return {
        workspace: activeSection,
        selectedEntityType: "album",
        selectedEntityId: selectedAlbum.albumId,
        selectedLabel: selectedAlbum.album ?? "Untitled album",
        selectedSubtitle: [
          selectedAlbum.albumArtistDisplay,
          selectedAlbum.year,
        ]
          .filter((value) => value != null && value !== "")
          .join(" · "),
      };
    }
    if (activeSection === "Artists" && selectedArtist) {
      return {
        workspace: activeSection,
        selectedEntityType: "artist",
        selectedEntityId: selectedArtist.id,
        selectedLabel: selectedArtist.name,
        selectedSubtitle: [
          selectedArtist.topGenre,
          selectedArtist.firstYear && selectedArtist.lastYear
            ? `${selectedArtist.firstYear}–${selectedArtist.lastYear}`
            : null,
        ]
          .filter((value) => value != null && value !== "")
          .join(" · "),
      };
    }
    if (activeSection === "Genres" && selectedGenre) {
      return {
        workspace: activeSection,
        selectedEntityType: "genre",
        selectedEntityId: selectedGenre.id,
        selectedLabel: selectedGenre.name,
        selectedSubtitle: `${formatNumber(selectedGenre.albumCount)} ${selectedGenre.albumCount === 1 ? "album" : "albums"} in your library`,
      };
    }
    return {
      workspace: activeSection,
      selectedEntityType: null,
      selectedEntityId: null,
      selectedLabel: null,
      selectedSubtitle: null,
    };
  })();

  function nextLunaLaunchId() {
    const id = lunaLaunchIdRef.current;
    lunaLaunchIdRef.current += 1;
    return id;
  }

  function openLunaMode(mode: Exclude<LunaMode, "research">) {
    if (mode === "plan" || mode === "ask") {
      const launch = {
        id: nextLunaLaunchId(),
        mode: mode === "plan" ? ("build" as const) : ("results" as const),
        snapshot: null,
      };
      if (activeSection === "Charts") {
        setChartLunaLaunch(launch);
        setActiveSection("Charts");
      } else {
        setSearchLunaLaunch(launch);
        setActiveSection("Search");
      }
    } else if (mode === "analyze") {
      setActiveSection("Statistics");
    } else if (mode === "playlist") {
      setActiveSection("Playlists");
    } else if (mode === "discover") {
      setActiveSection("Discovery");
    }
    setIsLunaOpen(false);
  }

  function openLunaHistory(selection: LunaHistorySelection) {
    if (selection.source === "playlist") {
      setSavedPlaylistToOpen(selection.item);
      setActiveSection("Playlists");
      setIsLunaOpen(false);
      return;
    }
    if (selection.source === "discovery") {
      setSavedDiscoveryToOpen(selection.item);
      setActiveSection("Discovery");
      setIsLunaOpen(false);
      return;
    }

    const snapshot = selection.item;
    switch (snapshot.content.kind) {
      case "search":
        setSearchLunaLaunch({
          id: nextLunaLaunchId(),
          mode: "build",
          snapshot,
        });
        setActiveSection("Search");
        break;
      case "chart":
        setChartLunaLaunch({
          id: nextLunaLaunchId(),
          mode: "build",
          snapshot,
        });
        setActiveSection("Charts");
        break;
      case "searchAnswer":
        setRequest(normalizeBrowseRequestForClient(snapshot.content.request));
        setSearchLunaLaunch({
          id: nextLunaLaunchId(),
          mode: "results",
          snapshot,
        });
        setActiveSection("Search");
        break;
      case "chartAnswer":
        setChartLunaLaunch({
          id: nextLunaLaunchId(),
          mode: "results",
          snapshot,
        });
        setActiveSection("Charts");
        break;
      case "libraryAnalysis":
        setAnalystSnapshotToOpen(snapshot);
        setActiveSection("Statistics");
        break;
      case "musicResearch":
        return;
    }
    setIsLunaOpen(false);
  }

  const leftSidebarClass =
    leftSidebarMode === "iconOnly"
      ? "left-sidebar-icon-only"
      : `left-sidebar-${leftSidebarMode}`;
  const appShellClassName = [
    "app-shell",
    leftSidebarClass,
    `right-sidebar-${effectiveRightSidebarMode}`,
    hasUsefulDetailContent ? "has-detail-content" : "no-detail-content",
    isDetailsDrawerLayout ? "details-drawer-layout" : "",
    isDetailsDrawerOpen ? "details-drawer-open" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const leftIconOnlyToggleLabel =
    leftSidebarMode === "iconOnly"
      ? "Show navigation labels"
      : "Show navigation icons only";
  const rightSidebarToggleLabel = isDetailsDrawerLayout
    ? isDetailsDrawerOpen
      ? "Close details drawer"
      : "Open details drawer"
    : isRightSidebarHidden
      ? "Show details sidebar"
      : "Hide details sidebar";

  useEffect(() => {
    if (!isDetailsDrawerLayout || !isDetailsDrawerOpen) {
      return undefined;
    }

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frameId = window.requestAnimationFrame(() => {
      detailDrawerRef.current?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frameId);
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [isDetailsDrawerLayout, isDetailsDrawerOpen]);

  function closeDetailDrawerAndRestoreFocus() {
    closeDetailsDrawer();
    window.requestAnimationFrame(() => detailToggleRef.current?.focus());
  }

  function toggleRightSidebar() {
    if (isDetailsDrawerLayout) {
      if (isDetailsDrawerOpen) {
        closeDetailDrawerAndRestoreFocus();
      } else {
        setIsLunaOpen(false);
        openDetailsDrawer();
      }
      return;
    }

    setRightSidebarMode(isRightSidebarHidden ? "expanded" : "hidden");
  }

  function handleDetailDrawerKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!isDetailsDrawerLayout || !isDetailsDrawerOpen) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeDetailDrawerAndRestoreFocus();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter(
      (element) =>
        element.getAttribute("aria-hidden") !== "true" &&
        element.getClientRects().length > 0,
    );
    if (focusableElements.length === 0) {
      event.preventDefault();
      event.currentTarget.focus();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    if (
      event.shiftKey &&
      (document.activeElement === firstElement ||
        document.activeElement === event.currentTarget)
    ) {
      event.preventDefault();
      lastElement.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === lastElement ||
        document.activeElement === event.currentTarget)
    ) {
      event.preventDefault();
      firstElement.focus();
    }
  }

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
        className={`icon-button music-research-trigger${isLunaOpen ? " active" : ""}`}
        type="button"
        aria-label="Open Luna"
        aria-pressed={isLunaOpen}
        title="Open Luna"
        onClick={() => {
          if (!isLunaOpen && isDetailsDrawerLayout) {
            closeDetailsDrawer();
          }
          setIsLunaOpen((previous) => !previous);
        }}
      >
        <Sparkles size={18} />
      </button>
      {hasUsefulDetailContent ? (
        <button
          ref={detailToggleRef}
          className="icon-button edge-toggle right-sidebar-toggle"
          type="button"
          aria-controls="workspace-details"
          aria-expanded={!isRightSidebarHidden}
          aria-label={rightSidebarToggleLabel}
          title={rightSidebarToggleLabel}
          onClick={toggleRightSidebar}
        >
          {isRightSidebarHidden ? (
            <ChevronLeft size={18} />
          ) : (
            <ChevronRight size={18} />
          )}
        </button>
      ) : null}
      <LunaPanel
        isOpen={isLunaOpen}
        activeSection={activeSection}
        currentView={request.view}
        currentResultCount={total}
        chartResultCount={chartRows}
        albumCount={status?.albumCount ?? 0}
        trackCount={status?.trackCount ?? 0}
        researchContext={musicResearchContext}
        researchPanel={(snapshotToOpen) => (
          <MusicResearchPanel
            isOpen
            embedded
            showSnapshotHistory={false}
            snapshotToOpen={snapshotToOpen}
            context={musicResearchContext}
            onClose={() => setIsLunaOpen(false)}
          />
        )}
        onClose={() => setIsLunaOpen(false)}
        onOpenMode={openLunaMode}
        onOpenHistory={openLunaHistory}
      />
      {isDetailsDrawerLayout && isDetailsDrawerOpen ? (
        <button
          className="detail-drawer-backdrop"
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={closeDetailDrawerAndRestoreFocus}
        />
      ) : null}
      <aside
        className="sidebar"
        aria-label="Main navigation"
        aria-hidden={isLeftSidebarHidden}
      >
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
              onClick={() =>
                setLeftSidebarMode(
                  leftSidebarMode === "iconOnly" ? "expanded" : "iconOnly",
                )
              }
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
                aria-keyshortcuts={item.shortcut}
                title={item.label}
              >
                <Icon size={17} strokeWidth={2} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="workspace-column">
        {appUpdateBannerVisible ? (
          <section
            className={`app-update-banner app-update-banner-${appUpdateStatus}`}
            aria-live="polite"
          >
            <div className="app-update-banner-icon" aria-hidden="true">
              <Download size={18} />
            </div>
            <div className="app-update-banner-copy">
              <strong>{appUpdateBannerTitle}</strong>
              <span>{appUpdateBannerMessage}</span>
              {appUpdateStatus === "downloading" &&
              appUpdateProgress?.percent != null ? (
                <div className="app-update-progress" aria-hidden="true">
                  <div style={{ width: `${appUpdateProgress.percent}%` }} />
                </div>
              ) : null}
            </div>
            <div className="app-update-banner-actions">
              {appUpdateCanInstall ? (
                <button
                  className="primary-button"
                  type="button"
                  onClick={() => void runAppUpdateInstall()}
                >
                  <Download size={16} />
                  <span>Update now</span>
                </button>
              ) : null}
              {appUpdateStatus === "error" ? (
                <button
                  className="secondary-button"
                  type="button"
                  disabled={appUpdateIsBusy}
                  onClick={() => void checkAppUpdate("manual")}
                >
                  <RotateCcw size={16} />
                  <span>Check now</span>
                </button>
              ) : null}
              <button
                className="icon-button"
                type="button"
                aria-label="Dismiss update message"
                onClick={() => setIsAppUpdateBannerDismissed(true)}
              >
                <X size={16} />
              </button>
            </div>
          </section>
        ) : null}

        {activeSection === "Imports" ? (
          <section className="workspace">
            <header className="topbar">
              <div>
                <h1>Imports</h1>
                <p>
                  Build the local SQLite database from a MusicBee TSV export.
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
                      ? "Save import paths"
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

            {settingsError ? (
              <p className="error-message">{settingsError}</p>
            ) : null}

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
                    optionally extract embedded MP3 artwork into the cover
                    archive.
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
                  <span>
                    Extract missing embedded MP3 covers into AlbumCovers
                  </span>
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

              <div
                className="progress-block cover-progress-block"
                aria-live="polite"
              >
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
                    {formatNumber(coverProgress.newCoversFound)} new covers
                    found or extracted
                  </span>
                </div>
                <div className="progress-meta">
                  <span>
                    {formatNumber(coverProgress.importedCovers)} imported
                  </span>
                  <span>
                    {formatNumber(coverProgress.relinkedCovers)} relinked
                  </span>
                  <span>
                    {formatNumber(coverProgress.skippedExisting)} already had
                    covers
                  </span>
                  <span>
                    {formatNumber(coverProgress.missingCovers)} missing
                  </span>
                </div>
              </div>

              {coverImportError ? (
                <p className="error-message">{coverImportError}</p>
              ) : null}
              {coverImportSummary ? (
                <p className="success-message">
                  Linked or imported{" "}
                  {formatNumber(coverImportSummary.importedCovers)} covers from{" "}
                  {formatNumber(coverImportSummary.newCoversFound)} newly found
                  or extracted covers and{" "}
                  {formatNumber(coverImportSummary.relinkedCovers)} existing
                  cover entries.
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
                  <span>
                    {isImportingCovers ? "Scanning" : "Import covers"}
                  </span>
                </button>
                <span className="db-path">
                  Archive matches are linked directly; missing embedded art is
                  saved into AlbumCovers.
                </span>
              </div>
            </section>

            <section className="import-panel">
              <div className="panel-heading">
                <div>
                  <h2>Billboard year-end charts</h2>
                  <p>
                    Import album ranks from yearly CSV files and annotate
                    matching library albums.
                  </p>
                </div>
                <RunStatus
                  status={
                    isImportingBillboard
                      ? "running"
                      : billboardImportSummary
                        ? "completed"
                        : "idle"
                  }
                />
              </div>

              <label className="source-input">
                <span>Chart CSV folder</span>
                <input
                  value={billboardSourcePath}
                  onChange={(event) =>
                    setBillboardSourcePath(event.target.value)
                  }
                  placeholder="CSV"
                  disabled={isImportingBillboard}
                />
              </label>

              {billboardImportError ? (
                <p className="error-message">{billboardImportError}</p>
              ) : null}
              {billboardImportSummary ? (
                <p className="success-message">
                  Matched {formatNumber(billboardImportSummary.matchedAlbums)}{" "}
                  albums from{" "}
                  {formatNumber(billboardImportSummary.chartEntries)} chart rows
                  across {formatNumber(billboardImportSummary.filesScanned)}{" "}
                  files.
                </p>
              ) : null}

              <div className="action-row">
                <button
                  className="primary-button"
                  type="button"
                  onClick={startBillboardImport}
                  disabled={
                    isImportingBillboard ||
                    !billboardSourcePath.trim() ||
                    !canImport ||
                    (status?.albumCount ?? 0) === 0
                  }
                  title={
                    canImport
                      ? "Import Billboard charts"
                      : "Open the Tauri desktop app to import Billboard charts"
                  }
                >
                  <BarChart3 size={17} />
                  <span>
                    {isImportingBillboard ? "Importing" : "Import Billboard"}
                  </span>
                </button>
                <span className="db-path">
                  Best rank wins when an album appears in more than one year-end
                  chart.
                </span>
              </div>
            </section>

            <section className="import-panel">
              <div className="panel-heading">
                <div>
                  <h2>Billboard year-end singles</h2>
                  <p>
                    Import single ranks from yearly CSV files and annotate
                    matching library tracks.
                  </p>
                </div>
                <RunStatus
                  status={
                    isImportingBillboardSingles
                      ? "running"
                      : billboardSinglesImportSummary
                        ? "completed"
                        : "idle"
                  }
                />
              </div>

              <label className="source-input">
                <span>Singles CSV folder</span>
                <input
                  value={billboardSinglesSourcePath}
                  onChange={(event) =>
                    setBillboardSinglesSourcePath(event.target.value)
                  }
                  placeholder="CSV_SINGLES"
                  disabled={isImportingBillboardSingles}
                />
              </label>

              {billboardSinglesImportError ? (
                <p className="error-message">{billboardSinglesImportError}</p>
              ) : null}
              {billboardSinglesImportSummary ? (
                <p className="success-message">
                  Matched{" "}
                  {formatNumber(billboardSinglesImportSummary.matchedTracks)}{" "}
                  tracks from{" "}
                  {formatNumber(billboardSinglesImportSummary.chartEntries)}{" "}
                  singles rows across{" "}
                  {formatNumber(billboardSinglesImportSummary.filesScanned)}{" "}
                  files.
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
                  <span>
                    {isImportingBillboardSingles
                      ? "Importing"
                      : "Import singles"}
                  </span>
                </button>
                <span className="db-path">
                  Matches use Display Artist and Track; best rank wins across
                  repeated years.
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
                <p>
                  Rank album lists from saved filters, Album Score, loved
                  tracks, AE, and TMOE.
                </p>
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
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Refresh"
                  onClick={() => void loadData()}
                >
                  <Database size={18} />
                </button>
              </div>
            </header>

            <section className="metric-grid" aria-label="Chart summary">
              <Metric
                label="Albums"
                value={formatNumber(status?.albumCount)}
                tone="teal"
                icon={Album}
              />
              <Metric
                label="Ranked"
                value={formatNumber(chartTotal)}
                tone="amber"
                icon={BarChart3}
              />
              <Metric
                label="Showing"
                value={formatNumber(chartRows)}
                icon={ListMusic}
              />
              <Metric
                label="Saved"
                value={formatNumber(savedCharts.length)}
                icon={Save}
              />
            </section>

            <ChartLunaCommandArea
              launch={chartLunaLaunch}
              chartCommand={
                <NaturalLanguageQueryPanel
                  target="chart"
                  currentView="albums"
                  showSnapshotHistory={false}
                  snapshotToOpen={
                    chartLunaLaunch?.mode === "build"
                      ? chartLunaLaunch.snapshot
                      : null
                  }
                  onApply={(compiled) => {
                    if (compiled.chartConfig) {
                      setChartConfig(
                        normalizeChartConfigForClient(compiled.chartConfig),
                      );
                      setChartTableSort(null);
                      setChartError(null);
                    }
                  }}
                />
              }
              resultsCommand={
                <CurrentViewQuestionPanel
                  context="chart"
                  request={chartRequest}
                  showSnapshotHistory={false}
                  snapshotToOpen={
                    chartLunaLaunch?.mode === "results"
                      ? chartLunaLaunch.snapshot
                      : null
                  }
                />
              }
            />

            <section className="query-panel chart-builder">
              <div className="search-row">
                <div className="search-input">
                  <Search size={18} />
                  <input
                    value={chartConfig.request.searchText}
                    onChange={(event) =>
                      updateChartConfig({
                        request: {
                          ...chartConfig.request,
                          searchText: event.target.value,
                          offset: 0,
                        },
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
                        className={
                          chartConfig.viewMode === mode.value ? "active" : ""
                        }
                        type="button"
                        key={mode.value}
                        onClick={() =>
                          updateChartConfig({ viewMode: mode.value })
                        }
                      >
                        <Icon size={16} />
                        <span>{mode.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div
                className="filter-grid chart-common-filter-grid"
                aria-label="Common chart controls"
              >
                <SelectField
                  label="Ranking"
                  value={chartConfig.rankingMetric}
                  onChange={(rankingMetric) =>
                    updateChartConfig({ rankingMetric })
                  }
                  options={rankingOptions}
                />
                <SelectField
                  label="Direction"
                  value={chartConfig.sortDirection}
                  onChange={(sortDirection) =>
                    updateChartConfig({
                      sortDirection: sortDirection as "asc" | "desc",
                    })
                  }
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
                  onChange={(value) =>
                    updateChartConfig({ resultLimit: value ?? 50 })
                  }
                />
                <GenreListCriterion
                  label="Genres"
                  values={chartConfig.request.filters.genres}
                  onChange={(genres) => updateChartFilters({ genres })}
                  genreOptions={genreSuggestionOptions}
                  onRequestOptions={requestGenreSuggestionRefresh}
                  placeholder="Synthpop, AOR"
                />
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
              </div>

              <ChartAdvancedControls
                activeControlCount={advancedChartControlCount}
              >
                <div className="chart-advanced-section-heading">
                  <div>
                    <strong>Built-in charts</strong>
                    <small>
                      Start from a focused ranking, then refine any control.
                    </small>
                  </div>
                </div>
                <section
                  className="chart-template-panel"
                  aria-label="Built-in charts"
                >
                  {chartTemplates.map((template) => {
                    const Icon = template.icon;
                    return (
                      <button
                        type="button"
                        key={template.id}
                        onClick={() => applyChartTemplate(template)}
                      >
                        <Icon size={17} />
                        <span>
                          <strong>{template.label}</strong>
                          <small>{template.description}</small>
                        </span>
                      </button>
                    );
                  })}
                </section>

                <div className="filter-grid chart-advanced-filter-grid">
                <NumberField
                  label="Billboard min"
                  value={chartConfig.request.filters.billboardRankMin}
                  min={1}
                  onChange={(value) =>
                    updateChartFilters({ billboardRankMin: value })
                  }
                />
                <NumberField
                  label="Billboard max"
                  value={chartConfig.request.filters.billboardRankMax}
                  min={1}
                  onChange={(value) =>
                    updateChartFilters({ billboardRankMax: value })
                  }
                />
                <GenreListCriterion
                  label="Exclude genres"
                  values={chartConfig.request.filters.excludedGenres}
                  onChange={(excludedGenres) =>
                    updateChartFilters({ excludedGenres })
                  }
                  genreOptions={genreSuggestionOptions}
                  onRequestOptions={requestGenreSuggestionRefresh}
                />
                <CountryListCriterion
                  label="Origin countries"
                  values={chartConfig.request.filters.originCountryCodes}
                  onChange={(originCountryCodes) =>
                    updateChartFilters({ originCountryCodes })
                  }
                  countryOptions={originCountryOptions}
                  displayMode={settings.countryFlagDisplay}
                />
                <CountryListCriterion
                  label="Exclude origin countries"
                  values={
                    chartConfig.request.filters.excludedOriginCountryCodes
                  }
                  onChange={(excludedOriginCountryCodes) =>
                    updateChartFilters({ excludedOriginCountryCodes })
                  }
                  countryOptions={originCountryOptions}
                  displayMode={settings.countryFlagDisplay}
                />
                <SelectField
                  label="Artist type"
                  value={chartConfig.request.filters.artistType}
                  onChange={(artistType) => updateChartFilters({ artistType })}
                  options={artistTypeOptions}
                />
                <SelectField
                  label="Gender"
                  value={chartConfig.request.filters.artistGender}
                  onChange={(artistGender) =>
                    updateChartFilters({ artistGender })
                  }
                  options={artistGenderOptions}
                />
                <TextCriterion
                  label="Album artist"
                  filter={chartConfig.request.filters.albumArtist}
                  onChange={(filter) =>
                    updateChartFilters({ albumArtist: filter })
                  }
                />
                <TextCriterion
                  label="Album title"
                  filter={chartConfig.request.filters.albumTitle}
                  onChange={(filter) =>
                    updateChartFilters({ albumTitle: filter })
                  }
                />
                <TextCriterion
                  label="Publisher"
                  filter={chartConfig.request.filters.publisher}
                  onChange={(filter) =>
                    updateChartFilters({ publisher: filter })
                  }
                />
                <NumberField
                  label="Born after"
                  value={chartConfig.request.filters.artistBornYearFrom}
                  onChange={(value) =>
                    updateChartFilters({ artistBornYearFrom: value })
                  }
                />
                <NumberField
                  label="Born before"
                  value={chartConfig.request.filters.artistBornYearTo}
                  onChange={(value) =>
                    updateChartFilters({ artistBornYearTo: value })
                  }
                />
                <NumberField
                  label="Died after"
                  value={chartConfig.request.filters.artistDiedYearFrom}
                  onChange={(value) =>
                    updateChartFilters({ artistDiedYearFrom: value })
                  }
                />
                <NumberField
                  label="Died before"
                  value={chartConfig.request.filters.artistDiedYearTo}
                  onChange={(value) =>
                    updateChartFilters({ artistDiedYearTo: value })
                  }
                />
                <NumberField
                  label="Founded after"
                  value={chartConfig.request.filters.artistFoundedYearFrom}
                  onChange={(value) =>
                    updateChartFilters({ artistFoundedYearFrom: value })
                  }
                />
                <NumberField
                  label="Founded before"
                  value={chartConfig.request.filters.artistFoundedYearTo}
                  onChange={(value) =>
                    updateChartFilters({ artistFoundedYearTo: value })
                  }
                />
                <NumberField
                  label="Dissolved after"
                  value={chartConfig.request.filters.artistDissolvedYearFrom}
                  onChange={(value) =>
                    updateChartFilters({ artistDissolvedYearFrom: value })
                  }
                />
                <NumberField
                  label="Dissolved before"
                  value={chartConfig.request.filters.artistDissolvedYearTo}
                  onChange={(value) =>
                    updateChartFilters({ artistDissolvedYearTo: value })
                  }
                />
                <NumberField
                  label="Minutes min"
                  value={chartConfig.request.filters.totalMinutesMin}
                  step={0.5}
                  onChange={(value) =>
                    updateChartFilters({ totalMinutesMin: value })
                  }
                />
                <NumberField
                  label="Minutes max"
                  value={chartConfig.request.filters.totalMinutesMax}
                  step={0.5}
                  onChange={(value) =>
                    updateChartFilters({ totalMinutesMax: value })
                  }
                />
                <NumberField
                  label="Album rating min"
                  value={chartConfig.request.filters.albumRatingMin}
                  min={0}
                  max={100}
                  onChange={(value) =>
                    updateChartFilters({ albumRatingMin: value })
                  }
                />
                <NumberField
                  label="Album rating max"
                  value={chartConfig.request.filters.albumRatingMax}
                  min={0}
                  max={100}
                  onChange={(value) =>
                    updateChartFilters({ albumRatingMax: value })
                  }
                />
                <NumberField
                  label="Loved min"
                  value={chartConfig.request.filters.lovedTracksMin}
                  min={0}
                  onChange={(value) =>
                    updateChartFilters({ lovedTracksMin: value })
                  }
                />
                <NumberField
                  label="Loved max"
                  value={chartConfig.request.filters.lovedTracksMax}
                  min={0}
                  onChange={(value) =>
                    updateChartFilters({ lovedTracksMax: value })
                  }
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
                        onChange={(event) =>
                          updateChartConfig({
                            gridCoverSize: Number(event.target.value),
                          })
                        }
                      />
                      <strong>{currentChartGridCoverSize}px</strong>
                    </div>
                  </label>
                ) : null}
              </div>

              <div className="query-footer chart-options">
                <div
                  className="missing-flags"
                  aria-label="Visible chart columns"
                >
                  {chartColumnOptions.map((option) => (
                    <label key={option.value}>
                      <input
                        type="checkbox"
                        checked={chartConfig.visibleColumns.includes(
                          option.value,
                        )}
                        onChange={() =>
                          toggleChartColumn(option.value, "visibleColumns")
                        }
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={chartConfig.exportColumns.includes("calculated")}
                    onChange={() =>
                      toggleChartColumn("calculated", "exportColumns")
                    }
                  />
                  <span>Calculated export columns</span>
                </label>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={chartConfig.request.filters.missingOriginCountry}
                    onChange={(event) =>
                      updateChartFilters({
                        missingOriginCountry: event.target.checked,
                      })
                    }
                  />
                  <span>Missing origin country</span>
                </label>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={chartConfig.request.filters.artistDied}
                    onChange={(event) =>
                      updateChartFilters({
                        artistDied: event.target.checked,
                      })
                    }
                  />
                  <span>Dead artists</span>
                </label>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={chartConfig.request.filters.artistDissolved}
                    onChange={(event) =>
                      updateChartFilters({
                        artistDissolved: event.target.checked,
                      })
                    }
                  />
                  <span>Dissolved groups</span>
                </label>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={chartConfig.exportColumns.includes(
                      "originCountry",
                    )}
                    onChange={() =>
                      toggleChartColumn("originCountry", "exportColumns")
                    }
                  />
                  <span>Origin country export column</span>
                </label>
              </div>
              </ChartAdvancedControls>
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
                  {formatCompletenessRange(
                    currentChartCompletenessRange.min,
                    currentChartCompletenessRange.max,
                  )}{" "}
                  complete
                </span>
              </div>

              {chartError ? (
                <p className="error-message">{chartError}</p>
              ) : null}
              <ChartResults
                response={chartResponse}
                config={chartConfig}
                displaySort={chartTableSort}
                onSort={sortChartBy}
                countryFlagDisplay={settings.countryFlagDisplay}
              />
            </section>
          </section>
        ) : activeSection === "Playlists" ? (
          <PlaylistBuilderWorkspace
            isAvailable={Boolean(status?.hasDatabase && status.trackCount > 0)}
            launch={playlistLaunch}
            onLaunchConsumed={() => setPlaylistLaunch(null)}
            savedPlaylistToOpen={savedPlaylistToOpen}
          />
        ) : activeSection === "Discovery" ? (
          <section className="workspace discovery-workspace">
            <header className="topbar">
              <div>
                <h1>Discovery</h1>
                <p>
                  Find music outside your library, then explore rating
                  backlogs, loved outliers, and catalog pockets.
                </p>
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
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Refresh library data"
                  onClick={() => void loadData()}
                >
                  <Database size={18} />
                </button>
              </div>
            </header>

            <OutsideLibraryDiscovery
              isAvailable={Boolean(status?.hasDatabase && status.trackCount > 0)}
              savedDiscoveryToOpen={savedDiscoveryToOpen}
            />

            <section className="metric-grid" aria-label="Discovery summary">
              <Metric
                label="Missions"
                value={discoveryMetricValue(discoveryMissionTotal)}
                tone="teal"
                icon={Compass}
              />
              <Metric
                label="Heatmap cells"
                value={discoveryMetricValue(discovery?.heatmap.length)}
                tone="amber"
                icon={Gauge}
              />
              <Metric
                label="Genre bubbles"
                value={discoveryMetricValue(discovery?.genrePoints.length)}
                icon={Tags}
              />
              <Metric
                label="Outliers"
                value={discoveryMetricValue(discovery?.loveRatingPoints.length)}
                icon={Heart}
              />
            </section>

            {discoveryError ? (
              <p className="error-message">{discoveryError}</p>
            ) : null}

            <section
              className="discovery-dashboard-grid"
              aria-label="Discovery charts"
            >
              <InsightActionDock
                cohort={discoveryCohort}
                onOpenInSearch={openInsightInSearch}
                onSaveView={saveInsightView}
                onBuildPlaylist={openInsightInPlaylist}
                onClear={() => setDiscoveryCohort(null)}
              />

              <section className="discovery-panel wide">
                <div className="panel-heading compact">
                  <div>
                    <h2>Completion heatmap</h2>
                    <p>
                      {isDiscoveryLoading
                        ? "Loading"
                        : `${formatNumber(discovery?.heatmap.length)} populated intersections available`}
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

              <section
                className="table-panel discovery-results-panel"
                aria-label="Discovery album results"
              >
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
                      disabled={
                        !discoverySelection ||
                        discoveryAlbumRequest.offset === 0
                      }
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
                      disabled={
                        !discoverySelection ||
                        discoveryAlbumRequest.offset +
                          discoveryAlbumRequest.limit >=
                          discoveryAlbumTotal
                      }
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

                {discoveryAlbumError ? (
                  <p className="error-message">{discoveryAlbumError}</p>
                ) : null}
                <ResultTable
                  response={discoverySelection ? discoveryAlbumResponse : null}
                  sort={discoveryAlbumRequest.sort}
                  onSort={sortDiscoveryAlbumsBy}
                  countryFlagDisplay={settings.countryFlagDisplay}
                  visibleColumns={[]}
                />
              </section>
            </section>
          </section>
        ) : activeSection === "Wish List" ? (
          <WishListWorkspace />
        ) : activeSection === "Artists" ? (
          <ArtistsWorkspace
            actions={
              <>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Clear artist filters"
                  onClick={clearArtistQuery}
                >
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
              </>
            }
          >

            <section className="metric-grid" aria-label="Artist summary">
              <Metric
                label="Album artists"
                value={formatNumber(statistics?.overview.albumArtistCount)}
                tone="teal"
                icon={UsersRound}
              />
              <Metric
                label="Matches"
                value={formatNumber(artistTotal)}
                tone="amber"
                icon={Search}
              />
              <Metric
                label="Artist albums"
                value={formatNumber(selectedArtistAlbumCount)}
                icon={Album}
              />
              <Metric
                label="Loved tracks"
                value={formatNumber(selectedArtist?.lovedTracks)}
                icon={Heart}
              />
            </section>

            <section className="query-panel artist-query-panel">
              <div className="search-row artist-search-row">
                <div className="search-input">
                  <Search size={18} />
                  <input
                    value={artistRequest.searchText}
                    onChange={(event) =>
                      setArtistRequest((previous) => ({
                        ...previous,
                        searchText: event.target.value,
                        offset: 0,
                      }))
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
                <div
                  className="chip-row inline"
                  aria-label="Active artist filters"
                >
                  {artistRequest.searchText.trim() ? (
                    <button
                      className="filter-chip"
                      type="button"
                      onClick={() =>
                        setArtistRequest((previous) => ({
                          ...previous,
                          searchText: "",
                          offset: 0,
                        }))
                      }
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
                        sort: {
                          ...previous.sort,
                          direction: direction as "asc" | "desc",
                        },
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
                      setArtistRequest((previous) => ({
                        ...previous,
                        limit: value ?? 50,
                        offset: 0,
                      }))
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
                    disabled={
                      artistRequest.offset + artistRequest.limit >= artistTotal
                    }
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

              {artistError ? (
                <p className="error-message">{artistError}</p>
              ) : null}
              <ArtistIndexTable
                response={artistResponse}
                selectedArtistId={selectedArtistId}
                onSelect={selectArtist}
                countryFlagDisplay={settings.countryFlagDisplay}
              />
            </section>

            <ArtistDetailTabs
              activeTab={artistDetailTab}
              onChange={setArtistDetailTab}
            >
              {artistDetailTab === "local-albums" ? (
                <section
                  className="table-panel"
                  aria-label="Selected artist albums"
                >
                  <div className="panel-heading compact">
                    <div>
                      <h2>{selectedArtist?.name ?? "Artist albums"}</h2>
                      <p>
                        {isArtistAlbumsLoading
                          ? "Loading albums"
                          : `${formatNumber(artistAlbumsResponse?.rows.length ?? 0)} of ${formatNumber(selectedArtistAlbumCount)} albums`}
                      </p>
                    </div>
                    <span className="run-status">
                      {selectedArtist?.topGenre ?? "Artist"}
                    </span>
                  </div>

                  {artistAlbumsError ? (
                    <p className="error-message">{artistAlbumsError}</p>
                  ) : null}
                  <ArtistAlbumTable
                    response={artistAlbumsResponse}
                    selectedAlbumId={selectedArtistAlbumId}
                    onSelect={selectArtistAlbum}
                  />
                </section>
              ) : null}

              {artistDetailTab === "artist-info" ? (
                <MusicBrainzArtistInfoPanel
                  artist={selectedArtist}
                  response={musicBrainzArtistDiscography}
                  isLoading={isMusicBrainzArtistLoading}
                  isUpdating={isMusicBrainzArtistUpdating}
                  error={musicBrainzArtistError}
                  onUpdateInfo={() => void updateArtistMusicBrainzInfo()}
                  onOpenExternalUrl={(url) =>
                    void openMusicBrainzArtistPage(url)
                  }
                  onSetArtistLink={(action, musicbrainzMbid, canonicalName) =>
                    void setArtistMusicBrainzLink(
                      action,
                      musicbrainzMbid,
                      canonicalName,
                    )
                  }
                  onSetOriginCountry={(countryCode, countryName) =>
                    void saveArtistOriginCountry(countryCode, countryName)
                  }
                  refreshResult={musicBrainzArtistRefreshResult}
                  originResult={musicBrainzArtistOriginResult}
                  countryOptions={originCountryOptions}
                  countryFlagDisplay={settings.countryFlagDisplay}
                />
              ) : null}

              {artistDetailTab === "discography" ? (
                <MusicBrainzArtistDiscographyPanel
                  artist={selectedArtist}
                  response={musicBrainzArtistDiscography}
                  isLoading={isMusicBrainzArtistLoading}
                  isUpdating={isMusicBrainzArtistUpdating}
                  onRefresh={() => void refreshArtistMusicBrainz()}
                  onOpenExternalUrl={(url) =>
                    void openMusicBrainzArtistPage(url)
                  }
                  onSetArtistLink={(action, musicbrainzMbid, canonicalName) =>
                    void setArtistMusicBrainzLink(
                      action,
                      musicbrainzMbid,
                      canonicalName,
                    )
                  }
                  onSetReleaseDecision={(row, decision) =>
                    void setArtistMusicBrainzReleaseDecision(row, decision)
                  }
                  onExport={(format) =>
                    void runArtistMusicBrainzExport(format)
                  }
                  exportResult={musicBrainzArtistExportResult}
                />
              ) : null}

              {artistDetailTab === "cover-view" ? (
                <section
                  className="table-panel"
                  aria-label="Selected artist cover view"
                >
                  <div className="artist-album-board-heading">
                    <div>
                      <h3>Cover view</h3>
                      <p>
                        {isArtistAlbumTracksLoading
                          ? "Loading tracks"
                          : `${formatNumber(artistAlbumTracksResponse?.rows.length ?? 0)} of ${formatNumber(selectedArtistAlbumTrackCount)} tracks`}
                      </p>
                    </div>
                    <span className="run-status">
                      {selectedArtistAlbum?.year ?? "Album"}
                    </span>
                  </div>

                  {artistAlbumTracksError ? (
                    <p className="error-message">{artistAlbumTracksError}</p>
                  ) : null}
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
              ) : null}
            </ArtistDetailTabs>
          </ArtistsWorkspace>
        ) : activeSection === "Genres" ? (
          <section className="workspace genres-workspace">
            <header className="topbar">
              <div>
                <h1>Genres</h1>
                <p>
                  Canonical-genre index, selected genre album lists, and
                  genre-level summary stats.
                </p>
              </div>
              <div className="topbar-actions">
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Clear genre filters"
                  onClick={clearGenreQuery}
                >
                  <RotateCcw size={18} />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Refresh genres"
                  onClick={() => {
                    void loadData();
                    setGenreRequest((previous) => ({ ...previous }));
                    setGenreTimelineRefreshKey((previous) => previous + 1);
                  }}
                >
                  <Database size={18} />
                </button>
              </div>
            </header>

            <section className="metric-grid" aria-label="Genre summary">
              <Metric
                label="Canonical genres"
                value={formatNumber(statistics?.overview.genreCount)}
                tone="teal"
                icon={Tags}
              />
              <Metric
                label="Matches"
                value={formatNumber(genreTotal)}
                tone="amber"
                icon={Search}
              />
              <Metric
                label="Genre albums"
                value={formatNumber(selectedGenreAlbumCount)}
                icon={Album}
              />
              <Metric
                label="Loved tracks"
                value={formatNumber(selectedGenre?.lovedTracks)}
                icon={Heart}
              />
            </section>

            <section className="query-panel genre-query-panel">
              <div className="search-row genre-search-row">
                <div className="search-input">
                  <Search size={18} />
                  <input
                    value={genreRequest.searchText}
                    onChange={(event) =>
                      setGenreRequest((previous) => ({
                        ...previous,
                        searchText: event.target.value,
                        offset: 0,
                      }))
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
                <div
                  className="chip-row inline"
                  aria-label="Active genre filters"
                >
                  {genreRequest.searchText.trim() ? (
                    <button
                      className="filter-chip"
                      type="button"
                      onClick={() =>
                        setGenreRequest((previous) => ({
                          ...previous,
                          searchText: "",
                          offset: 0,
                        }))
                      }
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
                        sort: {
                          ...previous.sort,
                          direction: direction as "asc" | "desc",
                        },
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
                      setGenreRequest((previous) => ({
                        ...previous,
                        limit: value ?? 50,
                        offset: 0,
                      }))
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
                    disabled={
                      genreRequest.offset + genreRequest.limit >= genreTotal
                    }
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

              {genreError ? (
                <p className="error-message">{genreError}</p>
              ) : null}
              <GenreIndexTable
                response={genreResponse}
                selectedGenreId={selectedGenreId}
                onSelect={selectGenre}
              />
            </section>

            <GenreTimeline
              genres={genreTimelineResponse?.rows ?? null}
              totalGenres={
                genreTimelineResponse?.total ??
                statistics?.overview.genreCount ??
                0
              }
              isLoading={isGenreTimelineLoading}
              error={genreTimelineError}
              selectedGenreId={selectedGenreId}
              resetSignal={genreTimelineResetSignal}
              onSelect={selectGenre}
            />

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
                <span className="run-status">
                  {selectedGenre?.topArtist ?? "Genre"}
                </span>
              </div>

              {genreAlbumsError ? (
                <p className="error-message">{genreAlbumsError}</p>
              ) : null}
              <GenreAlbumTable response={genreAlbumsResponse} />
            </section>
          </section>
        ) : activeSection === "Tools" ? (
          <section className="workspace tools-workspace">
            <header className="topbar">
              <div>
                <h1>Tools</h1>
                <p>
                  Validate the library, review exact repair diffs, and undo
                  app-local fixes safely.
                </p>
              </div>
              <div className="topbar-actions">
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Clear tool filters"
                  onClick={clearToolQuery}
                >
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
              <Metric
                label="Validators"
                value={formatNumber(musicTools.length)}
                tone="teal"
                icon={Wrench}
              />
              <Metric
                label="Issue rows"
                value={formatToolCount(totalToolIssues)}
                tone="amber"
                icon={FileSearch}
              />
              <Metric
                label="Selected"
                value={selectedToolIssueValue}
                icon={ListMusic}
              />
              <Metric
                label="Severity"
                value={severityLabel(selectedTool?.severity) || "Select"}
                icon={ShieldCheck}
              />
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
                <div
                  className="chip-row inline"
                  aria-label="Active tool filters"
                >
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
                          sort: {
                            ...previous.sort,
                            direction: direction as "asc" | "desc",
                          },
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
                        renewMusicToolIssueRequest(previous, {
                          limit: value ?? 50,
                          offset: 0,
                        }),
                      )
                    }
                  />
                </div>
              </div>
            </section>

            <section className="table-panel" aria-label="Validation tool index">
              <div className="panel-heading compact">
                <div>
                  <h2>Validation &amp; repair suite</h2>
                  <p>
                    {isToolsLoading
                      ? "Loading tools"
                      : `${formatNumber(musicTools.length)} tools`}
                  </p>
                </div>
                <span className="run-status">
                  {totalToolIssues == null
                    ? "Counts on select"
                    : `${formatNumber(totalToolIssues)} issues`}
                </span>
              </div>

              {toolsError ? (
                <p className="error-message">{toolsError}</p>
              ) : null}
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
                            offset: Math.max(
                              0,
                              previous.offset - previous.limit,
                            ),
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
                      disabled={
                        toolIssueRequest.offset + toolIssueRequest.limit >=
                        toolIssueTotal
                      }
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

              <MusicToolRepairPanel
                tool={selectedTool}
                response={currentToolIssueResponse}
                isPending={isToolRunPending}
                fixSummary={toolFixSummary}
                fixHistory={toolFixHistory}
                fixError={toolFixError}
                historyError={toolFixHistoryError}
                undoingRunId={undoingToolFixRunId}
                onPreview={() => runToolFix(false)}
                onApply={() => runToolFix(true)}
                onUndo={runToolUndo}
              />

              {toolIssueError ? (
                <p className="error-message">{toolIssueError}</p>
              ) : null}
              <MusicToolIssueTable
                response={
                  isToolProgressActive ? null : currentToolIssueResponse
                }
                progress={activeToolProgress}
              />
            </section>
          </section>
        ) : activeSection === "Albums" ? (
          <section className="workspace albums-workspace">
            <header className="topbar">
              <div>
                <h1>Albums</h1>
                <p>
                  Dedicated album index, drill-down calculations, ordered
                  tracks, and album export.
                </p>
              </div>
              <div className="topbar-actions">
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Clear album filters"
                  onClick={clearAlbumQuery}
                >
                  <RotateCcw size={18} />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Refresh albums"
                  onClick={() => void loadData()}
                >
                  <Database size={18} />
                </button>
              </div>
            </header>

            <section className="metric-grid" aria-label="Album summary">
              <Metric
                label="Library albums"
                value={formatNumber(status?.albumCount)}
                tone="teal"
                icon={Album}
              />
              <Metric
                label="Matches"
                value={formatNumber(albumTotal)}
                tone="amber"
                icon={Search}
              />
              <Metric
                label="Tracks"
                value={formatNumber(selectedAlbumTrackCount)}
                icon={ListMusic}
              />
              <Metric
                label="Complete"
                value={
                  selectedAlbum
                    ? formatPercent(selectedAlbum.ratingCompleteness)
                    : "Select"
                }
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
                      setAlbumRequest((previous) => ({
                        ...previous,
                        searchText: event.target.value,
                        offset: 0,
                      }))
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
                  onChange={(filter) =>
                    updateAlbumFilter("albumArtist", filter)
                  }
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
                  onChange={(excludedGenres) =>
                    updateAlbumFilter("excludedGenres", excludedGenres)
                  }
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
                  onChange={(value) =>
                    updateAlbumFilter("billboardRankMin", value)
                  }
                />
                <NumberField
                  label="Billboard max"
                  value={albumFilters.billboardRankMax}
                  min={1}
                  onChange={(value) =>
                    updateAlbumFilter("billboardRankMax", value)
                  }
                />
                <NumberField
                  label="Minutes min"
                  value={albumFilters.totalMinutesMin}
                  step={0.5}
                  onChange={(value) =>
                    updateAlbumFilter("totalMinutesMin", value)
                  }
                />
                <NumberField
                  label="Minutes max"
                  value={albumFilters.totalMinutesMax}
                  step={0.5}
                  onChange={(value) =>
                    updateAlbumFilter("totalMinutesMax", value)
                  }
                />
                <NumberField
                  label="Tracks min"
                  value={albumFilters.trackCountMin}
                  onChange={(value) =>
                    updateAlbumFilter("trackCountMin", value)
                  }
                />
                <NumberField
                  label="Album rating min"
                  value={albumFilters.albumRatingMin}
                  min={0}
                  max={100}
                  onChange={(value) =>
                    updateAlbumFilter("albumRatingMin", value)
                  }
                />
                <CompletenessRangeCriterion
                  minValue={albumFilters.ratingCompletenessMin}
                  maxValue={albumFilters.ratingCompletenessMax}
                  onChange={(range) =>
                    updateAlbumFilters(
                      toCompletenessFilterRange(range.min, range.max),
                    )
                  }
                />
              </div>

              <div className="query-footer">
                <div
                  className="chip-row inline"
                  aria-label="Active album filters"
                >
                  {albumChips.length === 0 ? (
                    <span className="chip-empty">No active filters</span>
                  ) : (
                    albumChips.map((chip) => (
                      <button
                        className="filter-chip"
                        type="button"
                        key={chip.key}
                        onClick={chip.remove}
                      >
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
                        sort: {
                          ...previous.sort,
                          direction: direction as "asc" | "desc",
                        },
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
                      setAlbumRequest((previous) => ({
                        ...previous,
                        limit: value ?? 25,
                        offset: 0,
                      }))
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
                    disabled={
                      albumRequest.offset + albumRequest.limit >= albumTotal
                    }
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

              {albumError ? (
                <p className="error-message">{albumError}</p>
              ) : null}
              <AlbumIndexTable
                response={albumResponse}
                selectedAlbumId={selectedAlbumId}
                sort={albumRequest.sort}
                onSort={sortAlbumsBy}
                onSelect={selectAlbum}
                countryFlagDisplay={settings.countryFlagDisplay}
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
                <span className="run-status">
                  {selectedAlbum?.year ?? "Album"}
                </span>
              </div>

              {albumTracksError ? (
                <p className="error-message">{albumTracksError}</p>
              ) : null}
              <AlbumTrackTable
                response={albumTracksResponse}
                isLoading={isAlbumTracksLoading}
              />
            </section>
          </section>
        ) : activeSection === "Statistics" ? (
          <section className="workspace statistics-workspace">
            <header className="topbar">
              <div>
                <h1>Statistics</h1>
                <p>
                  Library health, rating progress, metadata coverage, time
                  shape, duration, and outlier signals.
                </p>
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
                value={formatNumber(
                  statistics?.overview.trackCount ?? status?.trackCount,
                )}
                tone="teal"
                icon={ListMusic}
              />
              <Metric
                label="Albums"
                value={formatNumber(
                  statistics?.overview.albumCount ?? status?.albumCount,
                )}
                tone="amber"
                icon={Album}
              />
              <Metric
                label="Artists"
                value={formatNumber(statistics?.overview.albumArtistCount)}
                icon={UsersRound}
              />
              <Metric
                label="Duration"
                value={formatHours(statistics?.overview.totalSeconds)}
                icon={Clock3}
              />
            </section>

            {statsError ? <p className="error-message">{statsError}</p> : null}

            <LibraryAnalystPanel
              isAvailable={Boolean(statistics && statistics.overview.albumCount > 0)}
              showSnapshotHistory={false}
              snapshotToOpen={analystSnapshotToOpen}
            />

            <section
              className="stats-dashboard-grid"
              aria-label="Statistics dashboards"
            >
              <InsightActionDock
                cohort={statisticsCohort}
                onOpenInSearch={openInsightInSearch}
                onSaveView={saveInsightView}
                onBuildPlaylist={openInsightInPlaylist}
                onClear={() => setStatisticsCohort(null)}
              />

              <section className="stats-panel health-panel">
                <div className="panel-heading compact">
                  <div>
                    <h2>Library health score</h2>
                    <p>
                      {statistics
                        ? "Ratings, metadata, covers, and score coverage"
                        : "Waiting for library data"}
                    </p>
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
                <RatingCompletionBurndown
                  statistics={statistics}
                  onSelect={setStatisticsCohort}
                />
              </section>

              <section className="stats-panel wide">
                <div className="panel-heading compact">
                  <div>
                    <h2>Decade progress timeline</h2>
                    <p>Rated, partial, and open albums by release decade.</p>
                  </div>
                  <Clock3 size={18} />
                </div>
                <DecadeProgressTimeline
                  rows={statistics?.decadeProgress ?? []}
                  onSelect={setStatisticsCohort}
                />
              </section>

              <section className="stats-panel wide">
                <div className="panel-heading compact">
                  <div>
                    <h2>Genre portfolio matrix</h2>
                    <p>
                      Catalog size, completion, and average Album Score by
                      genre.
                    </p>
                  </div>
                  <Tags size={18} />
                </div>
                <GenrePortfolioMatrix
                  rows={statistics?.genreProgress ?? []}
                  onSelect={setStatisticsCohort}
                />
              </section>

              <section className="stats-panel wide">
                <div className="panel-heading compact">
                  <div>
                    <h2>Metadata coverage</h2>
                    <p>Core album, track, artwork, and rating fields.</p>
                  </div>
                  <ShieldCheck size={18} />
                </div>
                <MetadataCoveragePanel
                  metrics={statistics?.metadataCoverage ?? []}
                  onSelect={setStatisticsCohort}
                />
              </section>

              <section className="stats-panel wide">
                <div className="panel-heading compact">
                  <div>
                    <h2>Import delta timeline</h2>
                    <p>
                      Added, changed, removed, and rating-event movement by
                      import.
                    </p>
                  </div>
                  <FolderInput size={18} />
                </div>
                <ImportDeltaTimeline runs={statistics?.importHistory ?? []} />
              </section>

              <section className="stats-panel wide">
                <div className="panel-heading compact">
                  <div>
                    <h2>Library shape by time</h2>
                    <p>
                      Albums, tracks, duration, and release-year center of
                      gravity.
                    </p>
                  </div>
                  <Clock3 size={18} />
                </div>
                <LibraryShapeByTime
                  statistics={statistics}
                  onSelect={setStatisticsCohort}
                />
              </section>

              <section className="stats-panel wide">
                <div className="panel-heading compact">
                  <div>
                    <h2>Loved density</h2>
                    <p>
                      Loved tracks per 100 tracks by genre, decade, and rating
                      bucket.
                    </p>
                  </div>
                  <Heart size={18} />
                </div>
                <LovedDensityPanel
                  rows={statistics?.lovedDensity ?? []}
                  onSelect={setStatisticsCohort}
                />
              </section>

              <section className="stats-panel wide">
                <div className="panel-heading compact">
                  <div>
                    <h2>Catalog concentration</h2>
                    <p>
                      Top artist and genre slices as a share of the album
                      library.
                    </p>
                  </div>
                  <UsersRound size={18} />
                </div>
                <CatalogConcentrationPanel
                  statistics={statistics}
                  onSelect={setStatisticsCohort}
                />
              </section>

              <section className="stats-panel wide">
                <div className="panel-heading compact">
                  <div>
                    <h2>Duration analytics</h2>
                    <p>
                      Listening time, album length extremes, and
                      tracks-per-album shape.
                    </p>
                  </div>
                  <Clock3 size={18} />
                </div>
                <DurationAnalyticsPanel
                  statistics={statistics}
                  onSelect={setStatisticsCohort}
                />
              </section>

              <section className="stats-panel wide">
                <div className="panel-heading compact">
                  <div>
                    <h2>Outlier stats</h2>
                    <p>
                      Aggregate oddities worth knowing without leaving
                      Statistics.
                    </p>
                  </div>
                  <Sparkles size={18} />
                </div>
                <OutlierStatsPanel
                  rows={statistics?.outlierStats ?? []}
                  onSelect={setStatisticsCohort}
                />
              </section>

              <section className="stats-panel rating-progress-panel">
                <div className="panel-heading compact">
                  <div>
                    <h2>Rating progress</h2>
                    <p>
                      {isStatsLoading
                        ? "Refreshing"
                        : formatPercent(
                            statistics?.ratingProgress
                              .averageRatingCompleteness,
                          )}
                    </p>
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
                      onSelect={() =>
                        setStatisticsCohort(
                          ratingProgressCohort(
                            "fully-rated",
                            statistics.ratingProgress.fullyRatedAlbums,
                          ),
                        )
                      }
                    />
                    <Meter
                      label="Partially rated albums"
                      value={statistics.ratingProgress.partiallyRatedAlbums}
                      total={ratingAlbumTotal}
                      detail={`${percentOf(statistics.ratingProgress.partiallyRatedAlbums, ratingAlbumTotal).toFixed(1)}%`}
                      onSelect={() =>
                        setStatisticsCohort(
                          ratingProgressCohort(
                            "partially-rated",
                            statistics.ratingProgress.partiallyRatedAlbums,
                          ),
                        )
                      }
                    />
                    <Meter
                      label="Rated tracks"
                      value={statistics.ratingProgress.ratedTracks}
                      total={ratingTrackTotal}
                      detail={`${percentOf(statistics.ratingProgress.ratedTracks, ratingTrackTotal).toFixed(1)}%`}
                      onSelect={() =>
                        setStatisticsCohort(
                          ratingProgressCohort(
                            "rated-tracks",
                            statistics.ratingProgress.ratedTracks,
                          ),
                        )
                      }
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
                    <p>
                      {statistics?.lovedTracks.topLovedGenre ??
                        "Waiting for library data"}
                    </p>
                  </div>
                  <Heart size={18} />
                </div>
                <div className="stat-pairs">
                  <div
                    className={statistics ? "actionable-cohort" : undefined}
                    role={statistics ? "button" : undefined}
                    tabIndex={statistics ? 0 : undefined}
                    onClick={() => {
                      if (statistics) {
                        setStatisticsCohort(
                          lovedTracksCohort(
                            statistics.lovedTracks.lovedTracks,
                          ),
                        );
                      }
                    }}
                    onKeyDown={(event) => {
                      if (statistics) {
                        discoveryKeyOpen(event, () =>
                          setStatisticsCohort(
                            lovedTracksCohort(
                              statistics.lovedTracks.lovedTracks,
                            ),
                          ),
                        );
                      }
                    }}
                  >
                    <span>Loved tracks</span>
                    <strong>
                      {formatNumber(statistics?.lovedTracks.lovedTracks)}
                    </strong>
                  </div>
                  <div
                    className={statistics ? "actionable-cohort" : undefined}
                    role={statistics ? "button" : undefined}
                    tabIndex={statistics ? 0 : undefined}
                    onClick={() => {
                      if (statistics) {
                        setStatisticsCohort(
                          albumsWithLovedTracksCohort(
                            statistics.lovedTracks.albumsWithLovedTracks,
                          ),
                        );
                      }
                    }}
                    onKeyDown={(event) => {
                      if (statistics) {
                        discoveryKeyOpen(event, () =>
                          setStatisticsCohort(
                            albumsWithLovedTracksCohort(
                              statistics.lovedTracks.albumsWithLovedTracks,
                            ),
                          ),
                        );
                      }
                    }}
                  >
                    <span>Albums with love</span>
                    <strong>
                      {formatNumber(
                        statistics?.lovedTracks.albumsWithLovedTracks,
                      )}
                    </strong>
                  </div>
                  <div
                    className={
                      statistics?.lovedTracks.topLovedGenre
                        ? "actionable-cohort"
                        : undefined
                    }
                    role={
                      statistics?.lovedTracks.topLovedGenre
                        ? "button"
                        : undefined
                    }
                    tabIndex={
                      statistics?.lovedTracks.topLovedGenre ? 0 : undefined
                    }
                    onClick={() => {
                      const genre = statistics?.lovedTracks.topLovedGenre;
                      if (genre) {
                        const albumCount =
                          statistics.genreProgress.find(
                            (row) => row.genre === genre,
                          )?.albumCount ?? null;
                        setStatisticsCohort(
                          lovedGenreCohort(genre, albumCount),
                        );
                      }
                    }}
                    onKeyDown={(event) => {
                      const genre = statistics?.lovedTracks.topLovedGenre;
                      if (genre) {
                        const albumCount =
                          statistics?.genreProgress.find(
                            (row) => row.genre === genre,
                          )?.albumCount ?? null;
                        discoveryKeyOpen(event, () =>
                          setStatisticsCohort(
                            lovedGenreCohort(genre, albumCount),
                          ),
                        );
                      }
                    }}
                  >
                    <span>Top genre</span>
                    <strong>
                      {statistics?.lovedTracks.topLovedGenre ?? ""}
                    </strong>
                  </div>
                  <div
                    className={
                      statistics?.lovedTracks.topLovedYear != null
                        ? "actionable-cohort"
                        : undefined
                    }
                    role={
                      statistics?.lovedTracks.topLovedYear != null
                        ? "button"
                        : undefined
                    }
                    tabIndex={
                      statistics?.lovedTracks.topLovedYear != null
                        ? 0
                        : undefined
                    }
                    onClick={() => {
                      const year = statistics?.lovedTracks.topLovedYear;
                      if (year != null) {
                        const albumCount =
                          statistics?.yearProgress.find(
                            (row) => row.year === year,
                          )?.albumCount ?? null;
                        setStatisticsCohort(
                          lovedYearCohort(year, albumCount),
                        );
                      }
                    }}
                    onKeyDown={(event) => {
                      const year = statistics?.lovedTracks.topLovedYear;
                      if (year != null) {
                        const albumCount =
                          statistics?.yearProgress.find(
                            (row) => row.year === year,
                          )?.albumCount ?? null;
                        discoveryKeyOpen(event, () =>
                          setStatisticsCohort(
                            lovedYearCohort(year, albumCount),
                          ),
                        );
                      }
                    }}
                  >
                    <span>Top year</span>
                    <strong>
                      {statistics?.lovedTracks.topLovedYear ?? ""}
                    </strong>
                  </div>
                </div>
              </section>

              <section className="stats-panel wide">
                <div className="panel-heading compact">
                  <div>
                    <h2>Year progress</h2>
                    <p>
                      {formatNumber(statistics?.overview.yearCount)} years with
                      albums
                    </p>
                  </div>
                  <Clock3 size={18} />
                </div>
                <YearProgressExplorer
                  rows={statistics?.yearProgress ?? []}
                  genreOptions={genreSuggestionOptions}
                  onRequestGenreOptions={requestGenreSuggestionRefresh}
                  onSelect={setStatisticsCohort}
                />
              </section>

              <section className="stats-panel wide">
                <div className="panel-heading compact">
                  <div>
                    <h2>Genre progress</h2>
                    <p>
                      {formatNumber(statistics?.overview.genreCount)} canonical
                      genres
                    </p>
                  </div>
                  <Tags size={18} />
                </div>
                <GenreProgressExplorer
                  rows={statistics?.genreProgress ?? []}
                  yearRows={statistics?.yearProgress ?? []}
                  genreOptions={genreSuggestionOptions}
                  onRequestGenreOptions={requestGenreSuggestionRefresh}
                  onSelect={setStatisticsCohort}
                />
              </section>

              <section className="stats-panel">
                <div className="panel-heading compact">
                  <div>
                    <h2>Track ratings</h2>
                    <p>
                      {formatNumber(statistics?.ratingProgress.ratedTracks)}{" "}
                      rated tracks
                    </p>
                  </div>
                  <ListMusic size={18} />
                </div>
                <DistributionBars
                  buckets={statistics?.trackRatingDistribution ?? []}
                  onSelect={(bucket) => {
                    const insight = ratingBucketCohort(bucket, "tracks");
                    if (insight) setStatisticsCohort(insight);
                  }}
                />
              </section>

              <section className="stats-panel">
                <div className="panel-heading compact">
                  <div>
                    <h2>Album ratings</h2>
                    <p>
                      {formatNumber(
                        statistics?.ratingProgress.albumsWithEffectiveRating,
                      )}{" "}
                      scored albums
                    </p>
                  </div>
                  <Album size={18} />
                </div>
                <DistributionBars
                  buckets={statistics?.albumRatingDistribution ?? []}
                  onSelect={(bucket) => {
                    const insight = ratingBucketCohort(bucket, "albums");
                    if (insight) setStatisticsCohort(insight);
                  }}
                />
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
                          +{formatNumber(run.addedTracks)} / ~
                          {formatNumber(run.changedTracks)} / -
                          {formatNumber(run.removedTracks)}
                        </span>
                        <span role="cell">{formatNumber(run.albumCount)}</span>
                        <span role="cell">
                          +{formatNumber(run.addedAlbums)} / ~
                          {formatNumber(run.changedAlbums)} / -
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
                    <p>
                      {formatNumber(statistics?.recentRatingEvents.length)}{" "}
                      recent rating events
                    </p>
                  </div>
                  <Activity size={18} />
                </div>
                <div className="rating-history-strip">
                  {(statistics?.ratingHistory ?? []).slice(-8).map((point) => (
                    <article className="history-point" key={point.importRunId}>
                      <span>{formatDate(point.createdAt)}</span>
                      <strong>
                        {formatPercent(
                          point.ratedTracks / Math.max(1, point.trackCount),
                        )}
                      </strong>
                      <small>
                        {formatNumber(point.ratingEventsCount)} events
                      </small>
                    </article>
                  ))}
                </div>
                <RatingEventList
                  events={statistics?.recentRatingEvents ?? []}
                  onSelect={setStatisticsCohort}
                />
              </section>
            </section>
          </section>
        ) : activeSection === "Settings" ? (
          <SettingsWorkspace
            reloadAction={
              <button
                className="icon-button"
                type="button"
                aria-label="Reload settings"
                onClick={() => void loadData()}
              >
                <RotateCcw size={18} />
              </button>
            }
          >

            {settingsError ? (
              <p className="error-message">{settingsError}</p>
            ) : null}

            <section
              className="settings-grid"
              aria-label="Application settings"
            >
              <SettingsSection id="ai">
                <AiSettingsPanel />
              </SettingsSection>

              <SettingsSection id="updates">
                <section className="settings-panel update-settings-panel">
                  <div className="panel-heading compact">
                    <div>
                      <h2>App Updates</h2>
                      <p>{appUpdatePanelText}</p>
                    </div>
                    <Download size={18} />
                  </div>

                <div className="app-update-settings-toolbar">
                  <label className="criterion setting-number app-update-interval">
                    <span>Auto minutes</span>
                    <input
                      type="number"
                      min={0}
                      max={1440}
                      value={appUpdateAutoCheckDraft}
                      onChange={(event) =>
                        setAppUpdateAutoCheckDraft(event.target.value)
                      }
                      onBlur={() => void commitAppUpdateAutoCheckMinutes()}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.currentTarget.blur();
                        }
                      }}
                    />
                  </label>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={appUpdateIsBusy}
                    onClick={() => void checkAppUpdate("manual")}
                  >
                    <RotateCcw size={16} />
                    <span>
                      {appUpdateStatus === "checking"
                        ? "Checking"
                        : "Check now"}
                    </span>
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    disabled={!appUpdateCanInstall || appUpdateIsBusy}
                    onClick={() => void runAppUpdateInstall()}
                  >
                    <Download size={16} />
                    <span>
                      {appUpdateStatus === "downloading" ||
                      appUpdateStatus === "installing" ||
                      appUpdateStatus === "restarting"
                        ? appUpdateStatusLabel(appUpdateStatus)
                        : "Update now"}
                    </span>
                  </button>
                </div>

                {appUpdateError ? (
                  <p className="error-message">{appUpdateError}</p>
                ) : null}

                <dl className="performance-summary app-update-summary">
                  <div>
                    <dt>Installed</dt>
                    <dd>{appUpdateInfo?.currentVersion ?? "Current build"}</dd>
                  </div>
                  <div>
                    <dt>Available</dt>
                    <dd>{appUpdateInfo?.version ?? "None"}</dd>
                  </div>
                  <div>
                    <dt>Last check</dt>
                    <dd>{appUpdateLastCheckedText}</dd>
                  </div>
                  <div>
                    <dt>Auto</dt>
                    <dd>
                      {appUpdateAutoCheckMinutes > 0
                        ? `${appUpdateAutoCheckMinutes} min`
                        : "Off"}
                    </dd>
                  </div>
                </dl>

                {appUpdateStatus === "downloading" &&
                appUpdateProgress?.percent != null ? (
                  <div
                    className="app-update-progress app-update-progress-settings"
                    aria-hidden="true"
                  >
                    <div style={{ width: `${appUpdateProgress.percent}%` }} />
                  </div>
                ) : null}
                </section>
              </SettingsSection>

              <SettingsSection id="data">
                <section className="settings-panel backup-settings-panel">
                  <div className="panel-heading compact">
                    <div>
                      <h2>Backups</h2>
                      <p>
                        {formatNumber(databaseBackups.length)} available /{" "}
                        {settings.backupRetention} retained
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
                          backupRetention: clampBackupRetention(
                            numberValue(event.target.value),
                          ),
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

                {backupError ? (
                  <p className="error-message">{backupError}</p>
                ) : null}
                {restoreSummary ? (
                  <div className="export-result restore-result">
                    <Check size={17} />
                    <span>
                      Restored {formatNumber(restoreSummary.trackCount)} tracks
                      / {formatNumber(restoreSummary.albumCount)} albums. Safety
                      copy:{" "}
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
                      <article
                        className="database-backup-card"
                        key={backup.backupPath}
                      >
                        <div>
                          <strong>{formatDate(backup.createdAt)}</strong>
                          <span>{backup.operation}</span>
                        </div>
                        <dl>
                          <div>
                            <dt>Rows</dt>
                            <dd>
                              {backup.trackRows == null
                                ? "Unknown"
                                : formatNumber(backup.trackRows)}
                            </dd>
                          </div>
                          <div>
                            <dt>Albums</dt>
                            <dd>
                              {backup.albumCount == null
                                ? "Unknown"
                                : formatNumber(backup.albumCount)}
                            </dd>
                          </div>
                          <div>
                            <dt>Schema</dt>
                            <dd>
                              {backup.schemaVersion == null
                                ? "Unknown"
                                : backup.schemaVersion}
                            </dd>
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
                          <span>
                            {isRestoringBackup
                              ? "Restoring"
                              : backup.canRestore
                                ? "Restore"
                                : "Unavailable"}
                          </span>
                        </button>
                      </article>
                    ))}
                  </div>
                )}
                </section>
              </SettingsSection>

              <SettingsSection id="musicbrainz">
                <section className="settings-panel musicbrainz-settings-panel">
                <div className="panel-heading compact">
                  <div>
                    <h2>MusicBrainz Cache</h2>
                    <p>{musicBrainzStatusText}</p>
                  </div>
                  <ShieldCheck size={18} />
                </div>

                <div className="musicbrainz-toolbar">
                  <label className="criterion musicbrainz-cache-path">
                    <span>Cache path</span>
                    <input
                      type="text"
                      value={musicBrainzCachePathDraft}
                      onChange={(event) =>
                        setMusicBrainzCachePathDraft(event.target.value)
                      }
                      placeholder={defaultMusicBrainzCachePath}
                    />
                  </label>
                  <button
                    className="primary-button"
                    type="button"
                    disabled={isMusicBrainzChecking}
                    onClick={() => void checkMusicBrainzCache()}
                  >
                    <ShieldCheck size={16} />
                    <span>
                      {isMusicBrainzChecking ? "Checking" : "Save and check"}
                    </span>
                  </button>
                </div>

                {musicBrainzStatusError ? (
                  <p className="error-message">{musicBrainzStatusError}</p>
                ) : null}

                {musicBrainzStatus ? (
                  <>
                    <div
                      className={`musicbrainz-status-strip musicbrainz-status-${musicBrainzStatus.state}`}
                    >
                      <RunStatus status={musicBrainzStatus.state} />
                      <span>{musicBrainzStatus.message}</span>
                    </div>

                    <dl className="performance-summary musicbrainz-summary">
                      <div>
                        <dt>File</dt>
                        <dd>
                          {musicBrainzStatus.exists
                            ? formatBytes(musicBrainzStatus.fileSizeBytes)
                            : "Missing"}
                        </dd>
                      </div>
                      <div>
                        <dt>Artists</dt>
                        <dd>{formatNumber(musicBrainzStatus.artistCount)}</dd>
                      </div>
                      <div>
                        <dt>MBIDs</dt>
                        <dd>
                          {formatNumber(musicBrainzStatus.distinctMbidCount)}
                        </dd>
                      </div>
                      <div>
                        <dt>Releases</dt>
                        <dd>
                          {formatNumber(musicBrainzStatus.releaseGroupCount)}
                        </dd>
                      </div>
                      <div>
                        <dt>Pure albums</dt>
                        <dd>
                          {formatNumber(
                            musicBrainzStatus.pureAlbumReleaseGroupCount,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Years</dt>
                        <dd>{musicBrainzYearRange(musicBrainzStatus)}</dd>
                      </div>
                    </dl>

                    <dl className="musicbrainz-quality-grid">
                      <div>
                        <dt>Official releases</dt>
                        <dd>
                          {formatNumber(
                            musicBrainzStatus.officialReleaseGroupCount,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Duplicate MBIDs</dt>
                        <dd>
                          {formatNumber(musicBrainzStatus.duplicateMbidCount)}
                        </dd>
                      </div>
                      <div>
                        <dt>Mapping warnings</dt>
                        <dd>
                          {formatNumber(
                            musicBrainzStatus.suspiciousMappingCount,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Cache dates</dt>
                        <dd>{musicBrainzCacheDateRange(musicBrainzStatus)}</dd>
                      </div>
                    </dl>

                    {musicBrainzHasWarnings ? (
                      <div className="musicbrainz-warning-list">
                        {musicBrainzStatus.warningExamples.map((example) => (
                          <article key={example.mbid}>
                            <div>
                              <strong>
                                {example.cachedNames.join(", ") || example.mbid}
                              </strong>
                              <span>{example.mbid}</span>
                            </div>
                            <dl>
                              <div>
                                <dt>Names</dt>
                                <dd>{formatNumber(example.cachedNameCount)}</dd>
                              </div>
                              <div>
                                <dt>Releases</dt>
                                <dd>
                                  {formatNumber(example.releaseGroupCount)}
                                </dd>
                              </div>
                            </dl>
                          </article>
                        ))}
                      </div>
                    ) : null}

                    <small className="performance-database-path">
                      {musicBrainzStatus.resolvedPath}
                    </small>
                  </>
                ) : (
                  <div className="empty-state">
                    <ShieldCheck size={20} />
                    <span>No MusicBrainz cache check has run yet.</span>
                  </div>
                )}
                </section>

                <section className="settings-panel musicbrainz-origin-settings-panel">
                <div className="panel-heading compact">
                  <div>
                    <h2>MusicBrainz Origin Countries</h2>
                    <p>
                      {musicBrainzOriginStatus
                        ? `${formatNumber(musicBrainzOriginStatus.importedOrigins)} imported / ${formatNumber(musicBrainzOriginStatus.totalAlbumArtists)} artists`
                        : "Not checked"}
                    </p>
                  </div>
                  <UsersRound size={18} />
                </div>

                <div className="musicbrainz-origin-grid">
                  <div className="musicbrainz-origin-workflow">
                    <div className="musicbrainz-toolbar">
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={
                          isMusicBrainzOriginPreviewing ||
                          isMusicBrainzOriginImporting
                        }
                        onClick={() => void previewMusicBrainzOriginCountries()}
                      >
                        <FileSearch size={16} />
                        <span>
                          {isMusicBrainzOriginPreviewing
                            ? "Previewing"
                            : "Preview"}
                        </span>
                      </button>
                      <button
                        className="primary-button"
                        type="button"
                        disabled={
                          isMusicBrainzOriginPreviewing ||
                          isMusicBrainzOriginImporting
                        }
                        onClick={() => void runMusicBrainzOriginCountryImport()}
                      >
                        <CloudDownload size={16} />
                        <span>
                          {isMusicBrainzOriginImporting
                            ? "Importing"
                            : "Import origins"}
                        </span>
                      </button>
                      <button
                        className="icon-button"
                        type="button"
                        aria-label="Cancel MusicBrainz origin import"
                        disabled={!isMusicBrainzOriginImporting}
                        onClick={() => void cancelMusicBrainzOriginImport()}
                      >
                        <X size={18} />
                      </button>
                    </div>

                    {musicBrainzOriginError ? (
                      <p className="error-message">{musicBrainzOriginError}</p>
                    ) : null}

                    {musicBrainzOriginStatus ? (
                      <dl className="performance-summary musicbrainz-summary">
                        <div>
                          <dt>Countries</dt>
                          <dd>
                            {formatNumber(musicBrainzOriginStatus.countryCount)}
                          </dd>
                        </div>
                        <div>
                          <dt>Manual</dt>
                          <dd>
                            {formatNumber(
                              musicBrainzOriginStatus.manualOrigins,
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Unresolved</dt>
                          <dd>
                            {formatNumber(
                              musicBrainzOriginStatus.unresolvedOrigins,
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Missing</dt>
                          <dd>
                            {formatNumber(
                              musicBrainzOriginStatus.missingOrigins,
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Last run</dt>
                          <dd>
                            {musicBrainzOriginStatus.lastRun
                              ? formatDate(
                                  musicBrainzOriginStatus.lastRun.completedAt,
                                )
                              : "Not yet"}
                          </dd>
                        </div>
                        <div>
                          <dt>Status</dt>
                          <dd>
                            {musicBrainzOriginStatus.lastRun?.status ?? "Idle"}
                          </dd>
                        </div>
                      </dl>
                    ) : null}

                    {musicBrainzOriginImportSummary ? (
                      <div className="export-result">
                        <Check size={17} />
                        <span>
                          {formatNumber(
                            musicBrainzOriginImportSummary.fetchedCount,
                          )}{" "}
                          fetched /{" "}
                          {formatNumber(
                            musicBrainzOriginImportSummary.storedCount,
                          )}{" "}
                          stored /{" "}
                          {formatNumber(
                            musicBrainzOriginImportSummary.unresolvedCount,
                          )}{" "}
                          unresolved
                        </span>
                      </div>
                    ) : null}
                  </div>

                  <aside
                    className="musicbrainz-origin-live-panel"
                    aria-live="polite"
                  >
                    <div className="musicbrainz-origin-live-heading">
                      <div>
                        <h3>Live import</h3>
                        <p>{musicBrainzOriginProgress?.message ?? "Idle"}</p>
                      </div>
                      <span
                        className={`run-status run-status-${(musicBrainzOriginProgress?.status ?? "idle").toLowerCase()}`}
                      >
                        {originImportStatusLabel(
                          musicBrainzOriginProgress?.status,
                        )}
                      </span>
                    </div>

                    <div className="progress-block musicbrainz-origin-progress-block">
                      <div className="progress-row">
                        <span>
                          {formatNumber(
                            musicBrainzOriginProgress?.processedCount ?? 0,
                          )}{" "}
                          done /{" "}
                          {formatNumber(
                            musicBrainzOriginProgress?.remainingCount ?? 0,
                          )}{" "}
                          left
                        </span>
                        <strong>
                          {formatPercent(
                            musicBrainzOriginProgressPercent / 100,
                            0,
                          ) || "0%"}
                        </strong>
                      </div>
                      <div className="progress-track">
                        <div
                          className="progress-fill"
                          style={{
                            width: `${musicBrainzOriginProgressPercent}%`,
                          }}
                        />
                      </div>
                      <div className="progress-meta">
                        <span>
                          {formatNumber(
                            musicBrainzOriginProgress?.eligibleCount ?? 0,
                          )}{" "}
                          eligible
                        </span>
                        <span>
                          {formatNumber(
                            musicBrainzOriginProgress?.totalArtists ?? 0,
                          )}{" "}
                          artists total
                        </span>
                      </div>
                    </div>

                    <dl className="musicbrainz-origin-live-stats">
                      <div>
                        <dt>Succeeded</dt>
                        <dd>
                          {formatNumber(
                            musicBrainzOriginProgress?.storedCount ?? 0,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Skipped</dt>
                        <dd>
                          {formatNumber(
                            musicBrainzOriginProgress?.skippedCount ?? 0,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Unresolved</dt>
                        <dd>
                          {formatNumber(
                            musicBrainzOriginProgress?.unresolvedCount ?? 0,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Failed</dt>
                        <dd>
                          {formatNumber(
                            musicBrainzOriginProgress?.failedCount ?? 0,
                          )}
                        </dd>
                      </div>
                    </dl>

                    {musicBrainzOriginLog.length > 0 ? (
                      <div className="musicbrainz-origin-log">
                        {musicBrainzOriginLog.map((entry, index) => (
                          <article
                            key={`${entry.status}-${entry.processedCount}-${entry.currentArtistKey ?? index}`}
                          >
                            <div>
                              <strong>
                                {originImportStatusLabel(entry.status)}
                              </strong>
                              <span>
                                {entry.currentArtist ??
                                  entry.currentMbid ??
                                  "Origin importer"}
                              </span>
                            </div>
                            <small>{entry.message}</small>
                          </article>
                        ))}
                      </div>
                    ) : musicBrainzOriginPreview ? (
                      <div className="musicbrainz-warning-list musicbrainz-origin-preview-list">
                        {musicBrainzOriginPreview.rows
                          .slice(0, 8)
                          .map((row) => (
                            <article key={row.localArtistKey}>
                              <div>
                                <strong>{row.displayArtist}</strong>
                                <span>
                                  {row.musicbrainzMbid ??
                                    row.skippedReason ??
                                    "No MBID"}
                                </span>
                              </div>
                              <dl>
                                <div>
                                  <dt>Status</dt>
                                  <dd>{row.status}</dd>
                                </div>
                                <div>
                                  <dt>Country</dt>
                                  <dd>
                                    <CountryDisplay
                                      value={{
                                        originCountryCode:
                                          row.existingCountryCode,
                                        originCountryName:
                                          row.existingCountryName,
                                        originCountryRawArea: null,
                                      }}
                                      mode={settings.countryFlagDisplay}
                                      fallback="Missing"
                                    />
                                  </dd>
                                </div>
                              </dl>
                            </article>
                          ))}
                      </div>
                    ) : (
                      <div className="empty-state">
                        <FileSearch size={20} />
                        <span>No origin preview yet.</span>
                      </div>
                    )}
                  </aside>
                </div>

                {musicBrainzOriginPreview ? (
                  <section
                    className="musicbrainz-origin-report"
                    aria-label="MusicBrainz origin coverage report"
                  >
                    <div className="musicbrainz-origin-report-heading">
                      <div>
                        <h3>Origin coverage report</h3>
                        <p>
                          {formatNumber(musicBrainzOriginReportRows.length)}{" "}
                          matching /{" "}
                          {formatNumber(musicBrainzOriginPreview.rows.length)}{" "}
                          previewed
                        </p>
                      </div>
                      <label className="criterion musicbrainz-origin-report-search">
                        <span>Find artist</span>
                        <input
                          type="search"
                          value={musicBrainzOriginReportSearch}
                          onChange={(event) =>
                            setMusicBrainzOriginReportSearch(event.target.value)
                          }
                          placeholder="Beastie Boys"
                        />
                      </label>
                    </div>

                    <div
                      className="segmented-control musicbrainz-origin-report-tabs"
                      role="group"
                      aria-label="Origin report filter"
                    >
                      {originReportFilterOptions.map((option) => (
                        <button
                          className={
                            musicBrainzOriginReportFilter === option.value
                              ? "active"
                              : ""
                          }
                          type="button"
                          key={option.value}
                          onClick={() =>
                            setMusicBrainzOriginReportFilter(option.value)
                          }
                        >
                          {option.label}
                          <span>
                            {formatNumber(
                              musicBrainzOriginReportCounts[option.value],
                            )}
                          </span>
                        </button>
                      ))}
                    </div>

                    <div
                      className="musicbrainz-origin-report-table"
                      role="table"
                    >
                      <div
                        className="musicbrainz-origin-report-head"
                        role="row"
                      >
                        <span role="columnheader">Artist</span>
                        <span role="columnheader">Status</span>
                        <span role="columnheader">Country</span>
                        <span role="columnheader">Match</span>
                        <span role="columnheader">Reason</span>
                      </div>
                      {musicBrainzOriginVisibleReportRows.length === 0 ? (
                        <div className="empty-state musicbrainz-origin-report-empty">
                          <FileSearch size={20} />
                          <span>No matching origin rows.</span>
                        </div>
                      ) : (
                        musicBrainzOriginVisibleReportRows.map((row) => (
                          <div
                            className={`musicbrainz-origin-report-row origin-report-status-${row.status.toLowerCase()}`}
                            role="row"
                            key={row.localArtistKey}
                          >
                            <span role="cell">
                              <strong>{row.displayArtist}</strong>
                              <small>
                                {formatNumber(row.albumCount)} albums
                              </small>
                            </span>
                            <span role="cell">
                              <RunStatus
                                status={originPreviewStatusLabel(row.status)}
                              />
                            </span>
                            <span role="cell">
                              <CountryDisplay
                                value={{
                                  originCountryCode: row.existingCountryCode,
                                  originCountryName: row.existingCountryName,
                                  originCountryRawArea: null,
                                }}
                                mode={settings.countryFlagDisplay}
                                fallback="Missing"
                              />
                            </span>
                            <span role="cell">
                              <span>{originPreviewMatchLabel(row)}</span>
                              {row.musicbrainzMbid ? (
                                <button
                                  className="icon-button musicbrainz-origin-report-link"
                                  type="button"
                                  aria-label={`Open ${row.displayArtist} in MusicBrainz`}
                                  onClick={() =>
                                    void openExternalUrl(
                                      musicBrainzArtistUrl(
                                        row.musicbrainzMbid!,
                                      ),
                                    )
                                  }
                                >
                                  <ExternalLink size={14} />
                                </button>
                              ) : null}
                            </span>
                            <span role="cell">{originPreviewReason(row)}</span>
                          </div>
                        ))
                      )}
                    </div>
                    {musicBrainzOriginReportRows.length >
                    musicBrainzOriginVisibleReportRows.length ? (
                      <small className="musicbrainz-origin-report-limit">
                        Showing{" "}
                        {formatNumber(
                          musicBrainzOriginVisibleReportRows.length,
                        )}{" "}
                        of {formatNumber(musicBrainzOriginReportRows.length)}{" "}
                        matching rows.
                      </small>
                    ) : null}
                  </section>
                ) : null}
                </section>

                <section className="settings-panel musicbrainz-origin-settings-panel musicbrainz-artist-info-settings-panel">
                <div className="panel-heading compact">
                  <div>
                    <h2>MusicBrainz Artist Information</h2>
                    <p>
                      {musicBrainzArtistInfoStatus
                        ? `${formatNumber(musicBrainzArtistInfoStatus.importedInfos)} imported / ${formatNumber(musicBrainzArtistInfoStatus.totalAlbumArtists)} artists`
                        : "Not checked"}
                    </p>
                  </div>
                  <UsersRound size={18} />
                </div>

                <div className="musicbrainz-origin-grid">
                  <div className="musicbrainz-origin-workflow">
                    <div className="musicbrainz-toolbar">
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={
                          isMusicBrainzArtistInfoPreviewing ||
                          isMusicBrainzArtistInfoImporting
                        }
                        onClick={() => void previewMusicBrainzArtistInfos()}
                      >
                        <FileSearch size={16} />
                        <span>
                          {isMusicBrainzArtistInfoPreviewing
                            ? "Previewing"
                            : "Preview"}
                        </span>
                      </button>
                      <button
                        className="primary-button"
                        type="button"
                        disabled={
                          isMusicBrainzArtistInfoPreviewing ||
                          isMusicBrainzArtistInfoImporting
                        }
                        onClick={() => void runMusicBrainzArtistInfoImport()}
                      >
                        <CloudDownload size={16} />
                        <span>
                          {isMusicBrainzArtistInfoImporting
                            ? "Importing"
                            : "Import info"}
                        </span>
                      </button>
                      <button
                        className="icon-button"
                        type="button"
                        aria-label="Cancel MusicBrainz artist-info import"
                        disabled={!isMusicBrainzArtistInfoImporting}
                        onClick={() =>
                          void cancelMusicBrainzArtistInfoImportRun()
                        }
                      >
                        <X size={18} />
                      </button>
                    </div>

                    {musicBrainzArtistInfoError ? (
                      <p className="error-message">
                        {musicBrainzArtistInfoError}
                      </p>
                    ) : null}

                    {musicBrainzArtistInfoStatus ? (
                      <dl className="performance-summary musicbrainz-summary">
                        <div>
                          <dt>People</dt>
                          <dd>
                            {formatNumber(
                              musicBrainzArtistInfoStatus.personArtists,
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Groups</dt>
                          <dd>
                            {formatNumber(
                              musicBrainzArtistInfoStatus.groupArtists,
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Gender</dt>
                          <dd>
                            {formatNumber(
                              musicBrainzArtistInfoStatus.genderedArtists,
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Born</dt>
                          <dd>
                            {formatNumber(
                              musicBrainzArtistInfoStatus.bornArtists,
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Died</dt>
                          <dd>
                            {formatNumber(
                              musicBrainzArtistInfoStatus.diedArtists,
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Founded</dt>
                          <dd>
                            {formatNumber(
                              musicBrainzArtistInfoStatus.foundedArtists,
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Dissolved</dt>
                          <dd>
                            {formatNumber(
                              musicBrainzArtistInfoStatus.dissolvedArtists,
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Missing</dt>
                          <dd>
                            {formatNumber(
                              musicBrainzArtistInfoStatus.missingInfos,
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>Last run</dt>
                          <dd>
                            {musicBrainzArtistInfoStatus.lastRun
                              ? formatDate(
                                  musicBrainzArtistInfoStatus.lastRun
                                    .completedAt,
                                )
                              : "Not yet"}
                          </dd>
                        </div>
                        <div>
                          <dt>Status</dt>
                          <dd>
                            {musicBrainzArtistInfoStatus.lastRun?.status ??
                              "Idle"}
                          </dd>
                        </div>
                      </dl>
                    ) : null}

                    {musicBrainzArtistInfoImportSummary ? (
                      <div className="export-result">
                        <Check size={17} />
                        <span>
                          {formatNumber(
                            musicBrainzArtistInfoImportSummary.fetchedCount,
                          )}{" "}
                          fetched /{" "}
                          {formatNumber(
                            musicBrainzArtistInfoImportSummary.storedCount,
                          )}{" "}
                          stored /{" "}
                          {formatNumber(
                            musicBrainzArtistInfoImportSummary.unresolvedCount,
                          )}{" "}
                          unresolved
                        </span>
                      </div>
                    ) : null}
                  </div>

                  <aside
                    className="musicbrainz-origin-live-panel"
                    aria-live="polite"
                  >
                    <div className="musicbrainz-origin-live-heading">
                      <div>
                        <h3>Live import</h3>
                        <p>
                          {musicBrainzArtistInfoProgress?.message ?? "Idle"}
                        </p>
                      </div>
                      <span
                        className={`run-status run-status-${(musicBrainzArtistInfoProgress?.status ?? "idle").toLowerCase()}`}
                      >
                        {originImportStatusLabel(
                          musicBrainzArtistInfoProgress?.status,
                        )}
                      </span>
                    </div>

                    <div className="progress-block musicbrainz-origin-progress-block">
                      <div className="progress-row">
                        <span>
                          {formatNumber(
                            musicBrainzArtistInfoProgress?.processedCount ?? 0,
                          )}{" "}
                          done /{" "}
                          {formatNumber(
                            musicBrainzArtistInfoProgress?.remainingCount ?? 0,
                          )}{" "}
                          left
                        </span>
                        <strong>
                          {formatPercent(
                            musicBrainzArtistInfoProgressPercent / 100,
                            0,
                          ) || "0%"}
                        </strong>
                      </div>
                      <div className="progress-track">
                        <div
                          className="progress-fill"
                          style={{
                            width: `${musicBrainzArtistInfoProgressPercent}%`,
                          }}
                        />
                      </div>
                      <div className="progress-meta">
                        <span>
                          {formatNumber(
                            musicBrainzArtistInfoProgress?.eligibleCount ?? 0,
                          )}{" "}
                          eligible
                        </span>
                        <span>
                          {formatNumber(
                            musicBrainzArtistInfoProgress?.totalArtists ?? 0,
                          )}{" "}
                          artists total
                        </span>
                      </div>
                    </div>

                    <dl className="musicbrainz-origin-live-stats">
                      <div>
                        <dt>Succeeded</dt>
                        <dd>
                          {formatNumber(
                            musicBrainzArtistInfoProgress?.storedCount ?? 0,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Skipped</dt>
                        <dd>
                          {formatNumber(
                            musicBrainzArtistInfoProgress?.skippedCount ?? 0,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Unresolved</dt>
                        <dd>
                          {formatNumber(
                            musicBrainzArtistInfoProgress?.unresolvedCount ?? 0,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Failed</dt>
                        <dd>
                          {formatNumber(
                            musicBrainzArtistInfoProgress?.failedCount ?? 0,
                          )}
                        </dd>
                      </div>
                    </dl>

                    {musicBrainzArtistInfoLog.length > 0 ? (
                      <div className="musicbrainz-origin-log">
                        {musicBrainzArtistInfoLog.map((entry, index) => (
                          <article
                            key={`${entry.status}-${entry.processedCount}-${entry.currentArtistKey ?? index}`}
                          >
                            <div>
                              <strong>
                                {originImportStatusLabel(entry.status)}
                              </strong>
                              <span>
                                {entry.currentArtist ??
                                  entry.currentMbid ??
                                  "Artist info importer"}
                              </span>
                            </div>
                            <small>{entry.message}</small>
                          </article>
                        ))}
                      </div>
                    ) : musicBrainzArtistInfoPreview ? (
                      <div className="musicbrainz-warning-list musicbrainz-origin-preview-list">
                        {musicBrainzArtistInfoPreview.rows
                          .slice(0, 8)
                          .map((row) => (
                            <article key={row.localArtistKey}>
                              <div>
                                <strong>{row.displayArtist}</strong>
                                <span>
                                  {row.musicbrainzMbid ??
                                    row.skippedReason ??
                                    "No MBID"}
                                </span>
                              </div>
                              <dl>
                                <div>
                                  <dt>Status</dt>
                                  <dd>{row.status}</dd>
                                </div>
                                <div>
                                  <dt>Type</dt>
                                  <dd>{row.existingArtistType ?? "Missing"}</dd>
                                </div>
                              </dl>
                            </article>
                          ))}
                      </div>
                    ) : (
                      <div className="empty-state">
                        <FileSearch size={20} />
                        <span>No artist-info preview yet.</span>
                      </div>
                    )}
                  </aside>
                </div>

                {musicBrainzArtistInfoPreview ? (
                  <section
                    className="musicbrainz-origin-report"
                    aria-label="MusicBrainz artist-info coverage report"
                  >
                    <div className="musicbrainz-origin-report-heading">
                      <div>
                        <h3>Artist information report</h3>
                        <p>
                          {formatNumber(musicBrainzArtistInfoReportRows.length)}{" "}
                          matching /{" "}
                          {formatNumber(
                            musicBrainzArtistInfoPreview.rows.length,
                          )}{" "}
                          previewed
                        </p>
                      </div>
                      <label className="criterion musicbrainz-origin-report-search">
                        <span>Find artist</span>
                        <input
                          type="search"
                          value={musicBrainzArtistInfoReportSearch}
                          onChange={(event) =>
                            setMusicBrainzArtistInfoReportSearch(
                              event.target.value,
                            )
                          }
                          placeholder="David Bowie"
                        />
                      </label>
                    </div>

                    <div
                      className="segmented-control musicbrainz-origin-report-tabs"
                      role="group"
                      aria-label="Artist information report filter"
                    >
                      {artistInfoReportFilterOptions.map((option) => (
                        <button
                          className={
                            musicBrainzArtistInfoReportFilter === option.value
                              ? "active"
                              : ""
                          }
                          type="button"
                          key={option.value}
                          onClick={() =>
                            setMusicBrainzArtistInfoReportFilter(option.value)
                          }
                        >
                          {option.label}
                          <span>
                            {formatNumber(
                              musicBrainzArtistInfoReportCounts[option.value],
                            )}
                          </span>
                        </button>
                      ))}
                    </div>

                    <div
                      className="musicbrainz-origin-report-table musicbrainz-artist-info-report-table"
                      role="table"
                    >
                      <div
                        className="musicbrainz-artist-info-report-head"
                        role="row"
                      >
                        <span role="columnheader">Artist</span>
                        <span role="columnheader">Status</span>
                        <span role="columnheader">Type</span>
                        <span role="columnheader">Gender</span>
                        <span role="columnheader">Life</span>
                        <span role="columnheader">Match</span>
                        <span role="columnheader">Reason</span>
                      </div>
                      {musicBrainzArtistInfoVisibleReportRows.length === 0 ? (
                        <div className="empty-state musicbrainz-origin-report-empty">
                          <FileSearch size={20} />
                          <span>No matching artist-info rows.</span>
                        </div>
                      ) : (
                        musicBrainzArtistInfoVisibleReportRows.map((row) => (
                          <div
                            className={`musicbrainz-artist-info-report-row origin-report-status-${row.status.toLowerCase()}`}
                            role="row"
                            key={row.localArtistKey}
                          >
                            <span role="cell">
                              <strong>{row.displayArtist}</strong>
                              <small>
                                {row.existingSortName ??
                                  `${formatNumber(row.albumCount)} albums`}
                              </small>
                            </span>
                            <span role="cell">
                              <RunStatus
                                status={artistInfoPreviewStatusLabel(
                                  row.status,
                                )}
                              />
                            </span>
                            <span role="cell">
                              {row.existingArtistType ?? "Missing"}
                            </span>
                            <span role="cell">
                              {row.existingGender ?? "Missing"}
                            </span>
                            <span role="cell">
                              <strong>{artistInfoLifeStartLabel(row)}</strong>
                              <small>
                                {artistInfoDateLabel(
                                  row.existingBeginDate,
                                  row.existingBeginYear,
                                  row.existingBeginAreaName,
                                )}
                              </small>
                              <strong>{artistInfoLifeEndLabel(row)}</strong>
                              <small>
                                {artistInfoDateLabel(
                                  row.existingEndDate,
                                  row.existingEndYear,
                                  row.existingEndAreaName,
                                )}
                              </small>
                            </span>
                            <span role="cell">
                              <span>{artistInfoPreviewMatchLabel(row)}</span>
                              {row.musicbrainzMbid ? (
                                <button
                                  className="icon-button musicbrainz-origin-report-link"
                                  type="button"
                                  aria-label={`Open ${row.displayArtist} in MusicBrainz`}
                                  onClick={() =>
                                    void openExternalUrl(
                                      musicBrainzArtistUrl(
                                        row.musicbrainzMbid!,
                                      ),
                                    )
                                  }
                                >
                                  <ExternalLink size={14} />
                                </button>
                              ) : null}
                            </span>
                            <span role="cell">
                              {artistInfoPreviewReason(row)}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                    {musicBrainzArtistInfoReportRows.length >
                    musicBrainzArtistInfoVisibleReportRows.length ? (
                      <small className="musicbrainz-origin-report-limit">
                        Showing{" "}
                        {formatNumber(
                          musicBrainzArtistInfoVisibleReportRows.length,
                        )}{" "}
                        of{" "}
                        {formatNumber(musicBrainzArtistInfoReportRows.length)}{" "}
                        matching rows.
                      </small>
                    ) : null}
                  </section>
                ) : null}
                </section>

                <section className="settings-panel musicbrainz-sync-settings-panel">
                <div className="panel-heading compact">
                  <div>
                    <h2>MusicBrainz Overlay Sync</h2>
                    <p>
                      {musicBrainzOverlaySyncResult
                        ? musicBrainzOverlaySyncResult.summary
                        : (musicBrainzOverlaySyncLog[0]?.summary ??
                          "Not synced")}
                    </p>
                  </div>
                  <CloudDownload size={18} />
                </div>

                <div className="musicbrainz-sync-toolbar">
                  <label className="criterion musicbrainz-sync-path">
                    <span>Sync database</span>
                    <input
                      type="text"
                      value={musicBrainzOverlaySyncPathDraft}
                      onChange={(event) =>
                        setMusicBrainzOverlaySyncPathDraft(event.target.value)
                      }
                      placeholder="Choose a shared .sqlite3 file path"
                    />
                  </label>
                  <label className="criterion setting-number musicbrainz-sync-interval">
                    <span>Auto minutes</span>
                    <input
                      type="number"
                      min={0}
                      max={1440}
                      value={musicBrainzOverlayAutoSyncDraft}
                      onChange={(event) =>
                        setMusicBrainzOverlayAutoSyncDraft(event.target.value)
                      }
                      onBlur={() =>
                        void commitMusicBrainzOverlayAutoSyncMinutes()
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.currentTarget.blur();
                        }
                      }}
                    />
                  </label>
                  <button
                    className="primary-button"
                    type="button"
                    disabled={
                      isMusicBrainzOverlaySyncing ||
                      !musicBrainzOverlaySyncPathDraft.trim()
                    }
                    onClick={() => void runMusicBrainzOverlaySync()}
                  >
                    <CloudDownload size={16} />
                    <span>
                      {isMusicBrainzOverlaySyncing ? "Syncing" : "Sync now"}
                    </span>
                  </button>
                </div>

                {musicBrainzOverlaySyncError ? (
                  <p className="error-message">{musicBrainzOverlaySyncError}</p>
                ) : null}

                {musicBrainzOverlaySyncResult ? (
                  <div className="export-result musicbrainz-sync-result">
                    <Check size={17} />
                    <span>
                      {musicBrainzOverlaySyncResult.summary}{" "}
                      {musicBrainzOverlaySyncDetails(
                        musicBrainzOverlaySyncResult,
                      )}
                      .
                    </span>
                  </div>
                ) : null}

                {musicBrainzOverlaySyncLog.length > 0 ? (
                  <div
                    className="musicbrainz-sync-log"
                    aria-label="MusicBrainz overlay sync log"
                  >
                    {musicBrainzOverlaySyncLog.map((entry) => (
                      <article key={entry.id}>
                        <div>
                          <strong>{formatDate(entry.syncedAt)}</strong>
                          <span>{entry.summary}</span>
                        </div>
                        <small>{musicBrainzOverlaySyncDetails(entry)}</small>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <Clock3 size={20} />
                    <span>No overlay sync runs logged yet.</span>
                  </div>
                )}

                <small className="performance-database-path">
                  {settings.musicBrainzOverlaySyncPath || "Not configured"}
                </small>
                </section>
              </SettingsSection>

              <SettingsSection id="diagnostics">
                <section className="settings-panel performance-settings-panel">
                <div className="panel-heading compact">
                  <div>
                    <h2>Performance Proof</h2>
                    <p>
                      {performanceProbe
                        ? `${formatDate(performanceProbe.generatedAt)} / ${formatDuration(performanceProbe.totalDurationMs)} total`
                        : "Not run"}
                    </p>
                  </div>
                  <Activity size={18} />
                </div>

                <div className="performance-toolbar">
                  <button
                    className="primary-button"
                    type="button"
                    disabled={isPerformanceProbeRunning}
                    onClick={() => void runSettingsPerformanceProbe()}
                  >
                    <Gauge size={16} />
                    <span>
                      {isPerformanceProbeRunning ? "Running" : "Run probe"}
                    </span>
                  </button>
                  <span>
                    {performanceProbe
                      ? `${formatNumber(performanceProbe.operations.length)} checks`
                      : "No report"}
                  </span>
                </div>

                {performanceProbeError ? (
                  <p className="error-message">{performanceProbeError}</p>
                ) : null}

                {performanceProbe ? (
                  <>
                    <dl className="performance-summary">
                      <div>
                        <dt>Tracks</dt>
                        <dd>{formatNumber(performanceProbe.trackCount)}</dd>
                      </div>
                      <div>
                        <dt>Albums</dt>
                        <dd>{formatNumber(performanceProbe.albumCount)}</dd>
                      </div>
                      <div>
                        <dt>Total</dt>
                        <dd>
                          {formatDuration(performanceProbe.totalDurationMs)}
                        </dd>
                      </div>
                      <div>
                        <dt>Slowest</dt>
                        <dd>
                          {formatDuration(performanceProbe.slowestOperationMs)}
                        </dd>
                      </div>
                    </dl>

                    <div className="performance-probe-list">
                      {performanceProbe.operations.map((operation) => (
                        <article
                          className={`performance-probe-row ${operation.status}`}
                          key={operation.id}
                        >
                          <div>
                            <strong>{operation.label}</strong>
                            <span>{operation.category}</span>
                          </div>
                          <dl>
                            <div>
                              <dt>Time</dt>
                              <dd>{formatDuration(operation.durationMs)}</dd>
                            </div>
                            <div>
                              <dt>Total</dt>
                              <dd>
                                {operation.totalCount == null
                                  ? "n/a"
                                  : formatNumber(operation.totalCount)}
                              </dd>
                            </div>
                            <div>
                              <dt>Rows</dt>
                              <dd>
                                {operation.rowCount == null
                                  ? "n/a"
                                  : formatNumber(operation.rowCount)}
                              </dd>
                            </div>
                          </dl>
                          <small>
                            {operation.errorMessage ?? operation.detail}
                          </small>
                        </article>
                      ))}
                    </div>

                    <small className="performance-database-path">
                      {performanceProbe.databasePath}
                    </small>
                  </>
                ) : null}
                </section>
              </SettingsSection>

              <SettingsSection id="general">
                <section
                  className="metric-grid settings-summary-grid"
                  aria-label="Settings summary"
                >
                  <Metric
                    label="Rolling backups"
                    value={formatNumber(settings.backupRetention)}
                    tone="teal"
                    icon={Database}
                  />
                  <Metric
                    label="Theme"
                    value={settings.darkMode ? "Dark" : "Light"}
                    tone="amber"
                    icon={Moon}
                  />
                  <Metric
                    label="Navigation"
                    value={leftSidebarModeLabels[settings.leftSidebarDefault]}
                    icon={Library}
                  />
                  <Metric
                    label="Details"
                    value={rightSidebarModeLabels[settings.rightSidebarDefault]}
                    icon={SlidersHorizontal}
                  />
                  <Metric
                    label="MusicBrainz"
                    value={musicBrainzStatusLabel}
                    tone={musicBrainzMetricTone}
                    icon={ShieldCheck}
                  />
                  <Metric
                    label="Updates"
                    value={appUpdateMetricValue}
                    tone="teal"
                    icon={Download}
                  />
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
                    onChange={(event) =>
                      void saveAppSettings({ darkMode: event.target.checked })
                    }
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
                    <p>
                      {isSavingSettings
                        ? "Saving preferences"
                        : "Preferences saved"}
                    </p>
                  </div>
                  <SlidersHorizontal size={18} />
                </div>

                <div className="layout-setting-stack">
                  <div className="layout-setting">
                    <span>Left sidebar default</span>
                    <div
                      className="segmented-control layout-mode-control left-layout-mode-control"
                      role="group"
                      aria-label="Left sidebar default"
                    >
                      {leftSidebarModeOptions.map((option) => (
                        <button
                          className={
                            settings.leftSidebarDefault === option.value
                              ? "active"
                              : ""
                          }
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
                    <div
                      className="segmented-control layout-mode-control right-layout-mode-control"
                      role="group"
                      aria-label="Right sidebar default"
                    >
                      {rightSidebarModeOptions.map((option) => (
                        <button
                          className={
                            settings.rightSidebarDefault === option.value
                              ? "active"
                              : ""
                          }
                          type="button"
                          key={option.value}
                          onClick={() => saveRightSidebarDefault(option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="layout-setting">
                    <span>Origin country display</span>
                    <div
                      className="segmented-control layout-mode-control country-display-mode-control"
                      role="group"
                      aria-label="Origin country display"
                    >
                      {countryFlagDisplayOptions.map((option) => (
                        <button
                          className={
                            settings.countryFlagDisplay === option.value
                              ? "active"
                              : ""
                          }
                          type="button"
                          key={option.value}
                          onClick={() => saveCountryFlagDisplay(option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                </section>
              </SettingsSection>
            </section>
          </SettingsWorkspace>
        ) : (
          <SearchWorkspace
            actions={
              <>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Clear query"
                  onClick={clearQuery}
                >
                  <RotateCcw size={18} />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Refresh"
                  onClick={() => void loadData()}
                >
                  <Database size={18} />
                </button>
              </>
            }
          >

            <section className="metric-grid" aria-label="Library summary">
              <Metric
                label="Tracks"
                value={formatNumber(status?.trackCount)}
                tone="teal"
                icon={ListMusic}
              />
              <Metric
                label="Albums"
                value={formatNumber(status?.albumCount)}
                tone="amber"
                icon={Album}
              />
              <Metric
                label="Matches"
                value={formatNumber(total)}
                icon={Search}
              />
              <Metric
                label="Saved"
                value={formatNumber(savedSearches.length)}
                icon={Save}
              />
            </section>

            <SearchLunaCommandArea
              launch={searchLunaLaunch}
              searchCommand={
                <NaturalLanguageQueryPanel
                  target="search"
                  currentView={request.view}
                  showSnapshotHistory={false}
                  snapshotToOpen={
                    searchLunaLaunch?.mode === "build"
                      ? searchLunaLaunch.snapshot
                      : null
                  }
                  onApply={(compiled) => {
                    setRequest(
                      normalizeBrowseRequestForClient(compiled.request),
                    );
                    setBrowseError(null);
                  }}
                />
              }
              resultsCommand={
                <CurrentViewQuestionPanel
                  context="search"
                  request={request}
                  showSnapshotHistory={false}
                  snapshotToOpen={
                    searchLunaLaunch?.mode === "results"
                      ? searchLunaLaunch.snapshot
                      : null
                  }
                />
              }
            />

            <section className="query-panel">
              <div className="search-row">
                <div className="search-input">
                  <Search size={18} />
                  <input
                    value={request.searchText}
                    onChange={(event) =>
                      setRequest((previous) => ({
                        ...previous,
                        searchText: event.target.value,
                        offset: 0,
                      }))
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

              <div
                className="filter-grid search-common-filter-grid"
                aria-label="Common filters"
              >
                {request.view === "albums" ? (
                  <>
                    <TextCriterion
                      label="Album title"
                      filter={currentFilters.albumTitle}
                      onChange={(filter) => updateFilter("albumTitle", filter)}
                    />
                    <TextCriterion
                      label="Album artist"
                      filter={currentFilters.albumArtist}
                      onChange={(filter) => updateFilter("albumArtist", filter)}
                    />
                  </>
                ) : (
                  <>
                    <TextCriterion
                      label="Track title"
                      filter={currentFilters.trackTitle}
                      onChange={(filter) => updateFilter("trackTitle", filter)}
                    />
                    <TextCriterion
                      label="Display artist"
                      filter={currentFilters.displayArtist}
                      onChange={(filter) =>
                        updateFilter("displayArtist", filter)
                      }
                    />
                  </>
                )}
                <GenreListCriterion
                  label="Genres"
                  values={currentFilters.genres}
                  onChange={(genres) => updateFilter("genres", genres)}
                  genreOptions={genreSuggestionOptions}
                  onRequestOptions={requestGenreSuggestionRefresh}
                  placeholder="Synthpop, AOR"
                />
                <NumberField
                  label="Year from"
                  value={currentFilters.yearFrom}
                  onChange={(value) => updateFilter("yearFrom", value)}
                />
                <NumberField
                  label="Year to"
                  value={currentFilters.yearTo}
                  onChange={(value) => updateFilter("yearTo", value)}
                />
                <NumberField
                  label={
                    request.view === "albums"
                      ? "Album rating min"
                      : "Track rating min"
                  }
                  value={
                    request.view === "albums"
                      ? currentFilters.albumRatingMin
                      : currentFilters.trackRatingMin
                  }
                  min={0}
                  max={request.view === "albums" ? 100 : 5}
                  onChange={(value) =>
                    request.view === "albums"
                      ? updateFilter("albumRatingMin", value)
                      : updateFilter("trackRatingMin", value)
                  }
                />
              </div>

              <SearchAdvancedFilters
                activeFilterCount={advancedSearchFilterCount}
              >
                <div className="filter-grid search-advanced-filter-grid">
                  {request.view === "tracks" ? (
                    <>
                      <TextCriterion
                        label="Album title"
                        filter={currentFilters.albumTitle}
                        onChange={(filter) => updateFilter("albumTitle", filter)}
                      />
                      <TextCriterion
                        label="Album artist"
                        filter={currentFilters.albumArtist}
                        onChange={(filter) =>
                          updateFilter("albumArtist", filter)
                        }
                      />
                    </>
                  ) : (
                    <>
                      <TextCriterion
                        label="Track title"
                        filter={currentFilters.trackTitle}
                        onChange={(filter) => updateFilter("trackTitle", filter)}
                      />
                      <TextCriterion
                        label="Display artist"
                        filter={currentFilters.displayArtist}
                        onChange={(filter) =>
                          updateFilter("displayArtist", filter)
                        }
                      />
                    </>
                  )}
                <GenreListCriterion
                  label="Exclude genres"
                  values={currentFilters.excludedGenres}
                  onChange={(excludedGenres) =>
                    updateFilter("excludedGenres", excludedGenres)
                  }
                  genreOptions={genreSuggestionOptions}
                  onRequestOptions={requestGenreSuggestionRefresh}
                />
                <CountryListCriterion
                  label="Origin countries"
                  values={currentFilters.originCountryCodes}
                  onChange={(originCountryCodes) =>
                    updateFilter("originCountryCodes", originCountryCodes)
                  }
                  countryOptions={originCountryOptions}
                  displayMode={settings.countryFlagDisplay}
                />
                <CountryListCriterion
                  label="Exclude origin countries"
                  values={currentFilters.excludedOriginCountryCodes}
                  onChange={(excludedOriginCountryCodes) =>
                    updateFilter(
                      "excludedOriginCountryCodes",
                      excludedOriginCountryCodes,
                    )
                  }
                  countryOptions={originCountryOptions}
                  displayMode={settings.countryFlagDisplay}
                />
                <SelectField
                  label="Artist type"
                  value={currentFilters.artistType}
                  onChange={(artistType) => updateFilter("artistType", artistType)}
                  options={artistTypeOptions}
                />
                <SelectField
                  label="Gender"
                  value={currentFilters.artistGender}
                  onChange={(artistGender) =>
                    updateFilter("artistGender", artistGender)
                  }
                  options={artistGenderOptions}
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
                    onChange={(event) =>
                      updateFilter("hasTrackText", event.target.value)
                    }
                  />
                </label>

                <NumberField
                  label={
                    request.view === "tracks"
                      ? "Album Billboard min"
                      : "Billboard min"
                  }
                  value={currentFilters.billboardRankMin}
                  min={1}
                  onChange={(value) => updateFilter("billboardRankMin", value)}
                />
                <NumberField
                  label={
                    request.view === "tracks"
                      ? "Album Billboard max"
                      : "Billboard max"
                  }
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
                      onChange={(value) =>
                        updateFilter("billboardSingleRankMin", value)
                      }
                    />
                    <NumberField
                      label="Single Billboard max"
                      value={currentFilters.billboardSingleRankMax}
                      min={1}
                      onChange={(value) =>
                        updateFilter("billboardSingleRankMax", value)
                      }
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
                  label="Born after"
                  value={currentFilters.artistBornYearFrom}
                  onChange={(value) =>
                    updateFilter("artistBornYearFrom", value)
                  }
                />
                <NumberField
                  label="Born before"
                  value={currentFilters.artistBornYearTo}
                  onChange={(value) =>
                    updateFilter("artistBornYearTo", value)
                  }
                />
                <NumberField
                  label="Died after"
                  value={currentFilters.artistDiedYearFrom}
                  onChange={(value) =>
                    updateFilter("artistDiedYearFrom", value)
                  }
                />
                <NumberField
                  label="Died before"
                  value={currentFilters.artistDiedYearTo}
                  onChange={(value) =>
                    updateFilter("artistDiedYearTo", value)
                  }
                />
                <NumberField
                  label="Founded after"
                  value={currentFilters.artistFoundedYearFrom}
                  onChange={(value) =>
                    updateFilter("artistFoundedYearFrom", value)
                  }
                />
                <NumberField
                  label="Founded before"
                  value={currentFilters.artistFoundedYearTo}
                  onChange={(value) =>
                    updateFilter("artistFoundedYearTo", value)
                  }
                />
                <NumberField
                  label="Dissolved after"
                  value={currentFilters.artistDissolvedYearFrom}
                  onChange={(value) =>
                    updateFilter("artistDissolvedYearFrom", value)
                  }
                />
                <NumberField
                  label="Dissolved before"
                  value={currentFilters.artistDissolvedYearTo}
                  onChange={(value) =>
                    updateFilter("artistDissolvedYearTo", value)
                  }
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

                {request.view === "tracks" ? (
                  <NumberField
                    label="Album rating min"
                    value={currentFilters.albumRatingMin}
                    min={0}
                    max={100}
                    onChange={(value) => updateFilter("albumRatingMin", value)}
                  />
                ) : null}
                <NumberField
                  label="Album rating max"
                  value={currentFilters.albumRatingMax}
                  min={0}
                  max={100}
                  onChange={(value) => updateFilter("albumRatingMax", value)}
                />
                {request.view === "albums" ? (
                  <NumberField
                    label="Track rating min"
                    value={currentFilters.trackRatingMin}
                    min={0}
                    max={5}
                    onChange={(value) => updateFilter("trackRatingMin", value)}
                  />
                ) : null}
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
                  onChange={(range) =>
                    updateFilters(
                      toCompletenessFilterRange(range.min, range.max),
                    )
                  }
                />
                <NumberField
                  label="Loved min"
                  value={currentFilters.lovedTracksMin}
                  min={0}
                  onChange={(value) => updateFilter("lovedTracksMin", value)}
                />
                <NumberField
                  label="Loved max"
                  value={currentFilters.lovedTracksMax}
                  min={0}
                  onChange={(value) => updateFilter("lovedTracksMax", value)}
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
                  {missingFieldOptions
                    .filter(
                      (option) =>
                        request.view === "tracks" ||
                        option.value !== "billboardSingle",
                    )
                    .map((option) => {
                      const checked = currentFilters.missingFields.includes(
                        option.value,
                      );
                      const label = missingFieldLabel(
                        option.value,
                        request.view,
                      );
                      return (
                        <label key={option.value}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {
                              const nextValues = event.target.checked
                                ? [
                                    ...currentFilters.missingFields,
                                    option.value,
                                  ]
                                : currentFilters.missingFields.filter(
                                    (value) => value !== option.value,
                                  );
                              updateFilter("missingFields", nextValues);
                            }}
                          />
                          <span>{label}</span>
                        </label>
                      );
                    })}
                  <label>
                    <input
                      type="checkbox"
                      checked={currentFilters.missingOriginCountry}
                      onChange={(event) =>
                        updateFilter(
                          "missingOriginCountry",
                          event.target.checked,
                        )
                      }
                    />
                    <span>Origin Country</span>
                  </label>
                </div>

                <div
                  className="missing-flags"
                  aria-label="Artist lifecycle filters"
                >
                  <span className="missing-flags-title">Artist status</span>
                  <label>
                    <input
                      type="checkbox"
                      checked={currentFilters.artistDied}
                      onChange={(event) =>
                        updateFilter("artistDied", event.target.checked)
                      }
                    />
                    <span>Dead artists</span>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={currentFilters.artistDissolved}
                      onChange={(event) =>
                        updateFilter("artistDissolved", event.target.checked)
                      }
                    />
                    <span>Dissolved groups</span>
                  </label>
                </div>

                <div
                  className="missing-flags"
                  aria-label="Visible Search columns"
                >
                  <span className="missing-flags-title">Table columns</span>
                  {searchTableColumnOptions.map((option) => (
                    <label key={option.value}>
                      <input
                        type="checkbox"
                        checked={searchTableColumns.includes(option.value)}
                        onChange={() => toggleSearchTableColumn(option.value)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>

                <div className="sort-controls">
                  <SelectField
                    label="Sort"
                    value={request.sort.field}
                    onChange={(field) =>
                      setRequest((previous) => ({
                        ...previous,
                        sort: {
                          ...previous.sort,
                          field,
                          direction:
                            field === "random"
                              ? "asc"
                              : previous.sort.direction,
                        },
                        offset: 0,
                      }))
                    }
                    options={
                      request.view === "tracks"
                        ? [
                            { value: "random", label: "Random" },
                            { value: "title", label: "Title" },
                            { value: "album", label: "Album" },
                            { value: "displayArtist", label: "Display artist" },
                            { value: "year", label: "Year" },
                            { value: "originCountry", label: "Origin country" },
                            {
                              value: "billboardRank",
                              label: "Album Billboard",
                            },
                            {
                              value: "billboardSingleRank",
                              label: "Single Billboard",
                            },
                            { value: "trackRating", label: "Track rating" },
                            { value: "trackNumber", label: "Track number" },
                          ]
                        : [
                            { value: "random", label: "Random" },
                            { value: "album", label: "Album" },
                            { value: "artist", label: "Artist" },
                            { value: "year", label: "Year" },
                            { value: "originCountry", label: "Origin country" },
                            { value: "billboardRank", label: "Billboard" },
                            { value: "genre", label: "Genre" },
                            { value: "totalMinutes", label: "Minutes" },
                            { value: "trackCount", label: "Tracks" },
                            { value: "albumRating", label: "Rating" },
                            {
                              value: "ratingCompleteness",
                              label: "Completeness",
                            },
                            { value: "lovedTracks", label: "Loved" },
                            { value: "albumScore", label: "Score" },
                          ]
                    }
                  />
                  <SelectField
                    label="Direction"
                    value={request.sort.direction}
                    disabled={request.sort.field === "random"}
                    onChange={(direction) =>
                      setRequest((previous) => ({
                        ...previous,
                        sort: {
                          ...previous.sort,
                          direction: direction as "asc" | "desc",
                        },
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
                      setRequest((previous) => ({
                        ...previous,
                        limit: value ?? 50,
                        offset: 0,
                      }))
                    }
                  />
                </div>
              </div>
              </SearchAdvancedFilters>

              <div className="chip-row" aria-label="Active filters">
                {chips.length === 0 ? (
                  <span className="chip-empty">No active filters</span>
                ) : (
                  chips.map((chip) => (
                    <button
                      className="filter-chip"
                      type="button"
                      key={chip.key}
                      onClick={chip.remove}
                    >
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
                  <h2>
                    {request.view === "albums" ? "Album table" : "Track table"}
                  </h2>
                  <p>
                    {isSearching
                      ? "Searching"
                      : `${formatNumber(pageStart)}-${formatNumber(pageEnd)} of ${formatNumber(total)}`}
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

              {browseError ? (
                <p className="error-message">{browseError}</p>
              ) : null}
              <ResultTable
                response={response}
                sort={request.sort}
                onSort={sortSearchBy}
                countryFlagDisplay={settings.countryFlagDisplay}
                visibleColumns={searchTableColumns}
              />
            </section>
          </SearchWorkspace>
        )}
      </div>

      <section
        ref={detailDrawerRef}
        id="workspace-details"
        className="detail-column"
        role={isDetailsDrawerLayout && isDetailsDrawerOpen ? "dialog" : undefined}
        aria-modal={isDetailsDrawerLayout && isDetailsDrawerOpen ? true : undefined}
        aria-label={
          isDetailsDrawerLayout && isDetailsDrawerOpen ? "Workspace details" : undefined
        }
        aria-hidden={isRightSidebarHidden}
        tabIndex={isDetailsDrawerLayout ? -1 : undefined}
        onKeyDown={handleDetailDrawerKeyDown}
      >
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
                <dd>
                  {lastRun
                    ? formatBytes(lastRun.sourceSizeBytes)
                    : "Waiting for first import"}
                </dd>
              </div>
              <div>
                <dt>Completed</dt>
                <dd>{lastRun ? formatDate(lastRun.completedAt) : "Not yet"}</dd>
              </div>
              <div>
                <dt>Backup</dt>
                <dd>
                  {lastRun?.backupPath ?? "Created before import replacement"}
                </dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{lastRun?.sourcePath ?? sourcePath}</dd>
              </div>
            </dl>
          </aside>
        ) : activeSection === "Playlists" ? (
          <aside
            className="detail-panel playlist-detail"
            aria-label="Playlist builder details"
          >
            <div className="detail-header">
              <ListMusic size={20} />
              <div>
                <h2>Local by design</h2>
                <p>Luna plans; SQLite selects</p>
              </div>
            </div>

            <section className="calculation-list">
              <div>
                <Sparkles size={17} />
                <span>One AI call creates a bounded search recipe</span>
              </div>
              <div>
                <ShieldCheck size={17} />
                <span>Track names, artists, and file paths stay local</span>
              </div>
              <div>
                <Save size={17} />
                <span>Exact track order is saved only when you choose</span>
              </div>
              <div>
                <Download size={17} />
                <span>UTF-8 M3U8 exports point to your local files</span>
              </div>
            </section>

            <dl className="run-details">
              <div>
                <dt>Candidate ceiling</dt>
                <dd>500 tracks</dd>
              </div>
              <div>
                <dt>Playlist ceiling</dt>
                <dd>200 tracks</dd>
              </div>
              <div>
                <dt>Current library</dt>
                <dd>{formatNumber(status?.trackCount)} tracks</dd>
              </div>
            </dl>
          </aside>
        ) : activeSection === "Discovery" ? (
          <aside
            className="detail-panel discovery-detail"
            aria-label="Discovery details"
          >
            <div className="detail-header">
              <Compass size={20} />
              <div>
                <h2>Discovery Map</h2>
                <p>
                  {discovery?.generatedAt
                    ? formatDate(discovery.generatedAt)
                    : "Waiting for library data"}
                </p>
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
        ) : activeSection === "Wish List" ? (
          <aside className="detail-panel wish-list-detail" aria-label="Wish List details">
            <div className="detail-header">
              <Heart size={20} />
              <div>
                <h2>Collection watch</h2>
                <p>Automatically reconciled</p>
              </div>
            </div>
            <section className="calculation-list">
              <div>
                <UsersRound size={17} />
                <span>Save artists from Luna discovery</span>
              </div>
              <div>
                <Album size={17} />
                <span>Save missing MusicBrainz albums</span>
              </div>
              <div>
                <Sparkles size={17} />
                <span>Acquired music is removed after import</span>
              </div>
              <div>
                <ExternalLink size={17} />
                <span>MusicBrainz references stay one click away</span>
              </div>
            </section>
          </aside>
        ) : activeSection === "Charts" ? (
          <aside
            className="detail-panel chart-detail"
            aria-label="Chart actions"
          >
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
                <input
                  value={chartName}
                  onChange={(event) => setChartName(event.target.value)}
                />
              </label>
              <button
                className="primary-button"
                type="button"
                onClick={() => void saveCurrentChart()}
              >
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
                        setChartConfig(
                          normalizeChartConfigForClient(chart.config),
                        );
                        setChartTableSort(null);
                        setActiveSection("Charts");
                      }}
                    >
                      <strong>{chart.name}</strong>
                      <span>
                        {rankingLabel(chart.config.rankingMetric)} /{" "}
                        {chart.config.viewMode}
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
                  <button
                    type="button"
                    key={format}
                    onClick={() => void runChartExport(format)}
                  >
                    <Download size={16} />
                    <span>{format.toUpperCase()}</span>
                  </button>
                ))}
              </div>
              {chartExportResult ? (
                <ExportResultStatus result={chartExportResult} itemLabel="row" />
              ) : null}
            </section>
          </aside>
        ) : activeSection === "Artists" ? (
          <ArtistDetailPanel
            artist={selectedArtist}
            includeCalculated={artistIncludeCalculated}
            onIncludeCalculatedChange={(value) =>
              setArtistIncludeCalculated(value)
            }
            exportResult={artistExportResult}
            onExport={runArtistExport}
          />
        ) : activeSection === "Genres" ? (
          <GenreDetailPanel
            genre={selectedGenre}
            includeCalculated={genreIncludeCalculated}
            onIncludeCalculatedChange={(value) =>
              setGenreIncludeCalculated(value)
            }
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
            onIncludeCalculatedChange={(value) =>
              setAlbumIncludeCalculated(value)
            }
            exportResult={albumExportResult}
            onExport={runAlbumExport}
            countryFlagDisplay={settings.countryFlagDisplay}
          />
        ) : activeSection === "Statistics" ? (
          <aside
            className="detail-panel statistics-detail"
            aria-label="Statistics details"
          >
            <div className="detail-header">
              <Activity size={20} />
              <div>
                <h2>Library Signals</h2>
                <p>
                  {statistics?.lastUpdated
                    ? formatDate(statistics.lastUpdated)
                    : "No import yet"}
                </p>
              </div>
            </div>

            <dl className="run-details">
              <div>
                <dt>Health score</dt>
                <dd>
                  {statistics
                    ? `${Math.round(statistics.healthScore.score)}/100`
                    : ""}
                </dd>
              </div>
              <div>
                <dt>Average album rating</dt>
                <dd>
                  {formatAverage(
                    statistics?.ratingProgress.averageAlbumRating,
                    1,
                  )}
                </dd>
              </div>
              <div>
                <dt>Average album score</dt>
                <dd>
                  {formatAverage(statistics?.overview.averageAlbumScore, 2)}
                </dd>
              </div>
              <div>
                <dt>Unrated albums</dt>
                <dd>
                  {formatNumber(statistics?.ratingProgress.unratedAlbums)}
                </dd>
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
                <dd>
                  {formatPercent(
                    statistics?.catalogConcentration.artistPoints[0]?.share,
                    1,
                  )}
                </dd>
              </div>
            </dl>

            <section className="calculation-list statistics-signals">
              <div>
                <Album size={17} />
                <span>
                  {formatNumber(statistics?.ratingProgress.fullyRatedAlbums)}{" "}
                  fully rated albums
                </span>
              </div>
              <div>
                <Gauge size={17} />
                <span>
                  {formatNumber(
                    statistics?.ratingProgress.partiallyRatedAlbums,
                  )}{" "}
                  partial albums
                </span>
              </div>
              <div>
                <Heart size={17} />
                <span>
                  {formatNumber(statistics?.lovedTracks.lovedTracks)} loved
                  tracks
                </span>
              </div>
              <div>
                <FolderInput size={17} />
                <span>
                  {formatNumber(statistics?.importHistory.length)} import runs
                </span>
              </div>
              <div>
                <ShieldCheck size={17} />
                <span>
                  {formatPercent(statistics?.healthScore.metadataCoverage, 0)}{" "}
                  metadata coverage
                </span>
              </div>
              <div>
                <Clock3 size={17} />
                <span>
                  {formatHours(
                    statistics?.durationAnalytics.averageAlbumSeconds,
                  )}{" "}
                  average album
                </span>
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
              <RatingEventList
                events={statistics?.recentRatingEvents ?? []}
                onSelect={setStatisticsCohort}
              />
            </section>
          </aside>
        ) : activeSection === "Settings" ? (
          <aside
            className="detail-panel settings-detail"
            aria-label="Settings details"
          >
            <div className="detail-header">
              <Settings size={20} />
              <div>
                <h2>Preferences</h2>
                <p>
                  {settings.updatedAt
                    ? formatDate(settings.updatedAt)
                    : "Default settings"}
                </p>
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
                <dt>Origin display</dt>
                <dd>{countryFlagDisplayLabels[settings.countryFlagDisplay]}</dd>
              </div>
              <div>
                <dt>Updates</dt>
                <dd>
                  {appUpdateAutoCheckMinutes > 0
                    ? `${appUpdateAutoCheckMinutes} min`
                    : appUpdateStatusLabel(appUpdateStatus)}
                </dd>
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
                <span>
                  {settings.darkMode ? "Dark mode active" : "Light mode active"}
                </span>
              </div>
              <div>
                <Download size={17} />
                <span>{appUpdateStatusLabel(appUpdateStatus)}</span>
              </div>
            </section>
          </aside>
        ) : (
          <aside
            className="detail-panel search-detail"
            aria-label="Search actions"
          >
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
                <input
                  value={saveName}
                  onChange={(event) => setSaveName(event.target.value)}
                />
              </label>
              <button
                className="primary-button"
                type="button"
                onClick={() => void saveCurrentSearch()}
              >
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
                        setRequest(normalizeBrowseRequestForClient(search.request));
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
                  onChange={(event) => {
                    setIncludeCalculated(event.target.checked);
                    setExportResult(null);
                  }}
                />
                <span>Calculated columns</span>
              </label>
              {availableSearchExportColumns.length > 0 ? (
                <div
                  className="missing-flags"
                  aria-label="Optional Search export columns"
                >
                  {availableSearchExportColumns.map((option) => (
                    <label key={option.value}>
                      <input
                        type="checkbox"
                        checked={searchExportColumns.includes(option.value)}
                        onChange={() => toggleSearchExportColumn(option.value)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              ) : null}
              <div className="export-grid">
                {["csv", "tsv", "xlsx", "json", "txt"].map((format) => (
                  <button
                    type="button"
                    key={format}
                    onClick={() => void runExport(format)}
                  >
                    <Download size={16} />
                    <span>{format.toUpperCase()}</span>
                  </button>
                ))}
              </div>
              {exportResult ? (
                <ExportResultStatus result={exportResult} itemLabel="row" />
              ) : null}
            </section>
          </aside>
        )}
      </section>
    </main>
  );
}

function addRangeChip(
  chips: { key: string; label: ReactNode; remove: () => void }[],
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
