import { writeText } from "@tauri-apps/plugin-clipboard-manager";

import {
  invoke,
  isTauriRuntime,
  listen,
  openUrl,
  selectDirectory,
  type UnlistenFn,
} from "./backend/tauriClient";
export { isTauriRuntime } from "./backend/tauriClient";
import { createSoulseekSearchClientId } from "./backend/soulseek";
import {
  defaultBillboardSinglesSourcePath,
  defaultBillboardSourcePath,
  defaultVgListaAlbumSourcePath,
  defaultVgListaSinglesSourcePath,
  defaultOfficialUkAlbumSourcePath,
  defaultOfficialUkSinglesSourcePath,
  defaultTiISkuddetSourcePath,
  defaultNorsktoppenSourcePath,
  defaultCoverSourcePath,
  defaultImportSourcePath,
  defaultMusicBrainzCachePath,
  defaultMusicBrainzOverlaySyncPath,
  defaultSettings,
  cacheSettings,
  loadCachedSettings,
  normalizeArtistKey,
  normalizeMusicBrainzCachePath,
  normalizeSettings,
  settingsStorageKey,
} from "./backend/normalization";
import {
  createRequest,
  normalizeBrowseRequestForClient,
  normalizeSavedChartForClient,
  normalizeSavedChartsForClient,
  normalizeSavedSearchForClient,
  normalizeSavedSearchesForClient,
} from "./app/requests";
import { scoreGenreGroup } from "./app/genreGroups";
import { normalizeAllowedExternalUrl } from "./backend/externalUrl";
import {
  applyMockArtistOriginCountry,
  coverDataUrlCache,
  emitMockMusicBrainzArtistInfoProgress,
  emitMockMusicBrainzOriginProgress,
  mockArtistInfoForArtist,
  mockArtistInfoProgress,
  mockArtistInfoProgressHandlers,
  mockArtists,
  mockCountryNameFromCode,
  mockDatabaseBackups,
  mockDiscovery,
  mockGenres,
  mockImportRuns,
  mockMusicBrainzArtistInfoPreviewRows,
  mockMusicBrainzArtistInfoRun,
  mockMusicBrainzArtistInfoStatus,
  mockMusicBrainzCacheStatus,
  mockMusicBrainzDiscographies,
  mockMusicBrainzOriginCountryStatus,
  mockMusicBrainzOriginPreviewRows,
  mockMusicBrainzOriginRun,
  mockMusicBrainzOverlaySyncLog,
  mockMusicToolIssues,
  mockMusicTools,
  mockOriginForArtist,
  mockOriginProgress,
  mockOriginProgressHandlers,
  mockRows,
  mockTimelineCoverUrls,
  mockAiSnapshots,
  mockSavedCharts,
  mockSavedSearches,
  mockSettings,
  mockStatistics,
  mockStatus,
  setMockMusicBrainzOverlaySyncLog,
  setMockMusicToolIssues,
  setMockMusicTools,
  setMockSavedCharts,
  setMockAiSnapshots,
  setMockSavedSearches,
  setMockSettings,
  type MusicBrainzArtistInfoFields,
} from "./backend/webPreview";
import {
  mockMusicMap,
  mockMusicMapDetails,
  mockMusicMapRefresh,
} from "./backend/musicMapPreview";
export {
  defaultBillboardSinglesSourcePath,
  defaultBillboardSourcePath,
  defaultVgListaAlbumSourcePath,
  defaultVgListaSinglesSourcePath,
  defaultOfficialUkAlbumSourcePath,
  defaultOfficialUkSinglesSourcePath,
  defaultTiISkuddetSourcePath,
  defaultNorsktoppenSourcePath,
  defaultCoverSourcePath,
  defaultImportSourcePath,
  defaultMusicBrainzCachePath,
  defaultMusicBrainzOverlaySyncPath,
  cacheSettings,
  loadCachedSettings,
  normalizeSettings,
  settingsStorageKey,
} from "./backend/normalization";
import type {
  AppSettings,
  AiCompileRequest,
  AiCompiledQuery,
  AiConnectionTest,
  AiCurrentViewAnswer,
  AiCurrentViewQuestion,
  AiKeyStatus,
  AiLibraryAnalysis,
  AiLibraryAnalysisRequest,
  AiMusicResearchAnswer,
  AiMusicResearchRequest,
  AiMarkdownExportRequest,
  AiSnapshot,
  AiSnapshotKind,
  AiPlaylist,
  AiPlaylistBuildRequest,
  ExternalDiscoveryEntity,
  ExternalDiscoveryItem,
  ExternalDiscoveryResponse,
  ExportPlaylistRequest,
  SaveExternalDiscoveryRequest,
  SavePlaylistRequest,
  SavedExternalDiscovery,
  AddWishListItemRequest,
  AddWishListMusicBrainzCandidateResponse,
  DeemixAlbumDownloadProgress,
  DeemixAlbumDownloadPreflight,
  DeemixAlbumDownloadPreflightRequest,
  DeemixAlbumDownloadRequest,
  DeemixAlbumDownloadSummary,
  DeemixAlbumSearchRequest,
  DeemixAlbumSearchResponse,
  DeemixConnectionTest,
  SoulseekAlbumSearchRequest,
  SoulseekAlbumSearchResponse,
  SoulseekConnectionBootstrap,
  SoulseekConnectionProfile,
  SoulseekConnectionSnapshot,
  SoulseekLocalShares,
  SoulseekReleaseDownloadRequest,
  SoulseekSearchEvent,
  SoulseekSearchResult,
  SoulseekTransfer,
  SoulseekTransferQueue,
  SoulseekUploadQueue,
  DiscogsConnectionTest,
  DiscogsCredentialStatus,
  SaveDiscogsCredentialsRequest,
  LibraryCompletionCandidate,
  LibraryCompletionArtistCandidate,
  LibraryCompletionArtistDecision,
  LibraryCompletionArtistResponse,
  LibraryCompletionArtistVerificationStatus,
  LibraryCompletionArtistRequest,
  LibraryCompletionCoverEnrichment,
  LibraryCompletionDecision,
  LibraryCompletionRequest,
  LibraryCompletionResponse,
  LibraryCompletionVerificationStatus,
  SetLibraryCompletionVerificationStateRequest,
  SetLibraryCompletionDecisionRequest,
  SetLibraryCompletionArtistDecisionRequest,
  SetLibraryCompletionArtistVerificationStateRequest,
  StartLibraryCompletionVerificationRequest,
  StartLibraryCompletionArtistVerificationRequest,
  ConfirmLibraryCompletionArtistMatchRequest,
  DeemixCredentialStatus,
  WishListItem,
  WishListArtistAlbumSummary,
  WishListArtistAlbumDiscoveryResponse,
  WishListResponse,
  WishListMusicBrainzCandidate,
  WishListMusicBrainzSearchRequest,
  WishListMusicBrainzSearchResponse,
  SavedPlaylist,
  SaveAiSnapshotRequest,
  ArtistListRequest,
  ArtistListResponse,
  ArtistSummary,
  AlbumDebutTimelineAlbum,
  AlbumDebutTimelineResponse,
  TrackDebutTimelineResponse,
  TrackDebutTimelineTrack,
  TimelineChartSource,
  BillboardImportSummary,
  BillboardSinglesImportSummary,
  VgListaImportSummary,
  OfficialUkImportSummary,
  TiISkuddetImportSummary,
  NorsktoppenImportSummary,
  BrowseFilters,
  BrowseRequest,
  BrowseResponse,
  BrowseRow,
  CoverImportProgress,
  CoverImportRequest,
  CoverImportSummary,
  DatabaseBackup,
  DatabaseRestoreSummary,
  DiscoveryResponse,
  ExportResult,
  ImportProgress,
  ImportPreview,
  ImportRun,
  ImportSummary,
  LibraryStatus,
  SavedChart,
  SavedSearch,
  ChartConfig,
  GenreProgressRequest,
  GenreProgressStats,
  StatisticsResponse,
  YearProgressRequest,
  YearProgressStats,
  GenreListRequest,
  GenreListResponse,
  GenreSummary,
  MusicToolFixRequest,
  MusicToolFixDiff,
  MusicToolFixHistoryEntry,
  MusicToolFixSummary,
  MusicToolIssueRequest,
  MusicToolIssueResponse,
  MusicToolIssueRow,
  MusicToolProgress,
  MusicToolSummary,
  MusicToolUndoSummary,
  MusicBrainzArtistDiscographyResponse,
  MusicBrainzArtistExportRequest,
  MusicBrainzArtistInfoImportProgress,
  MusicBrainzArtistInfoImportRequest,
  MusicBrainzArtistInfoImportSummary,
  MusicBrainzArtistInfoPreview,
  MusicBrainzArtistInfoPreviewRow,
  MusicBrainzArtistInfoStatus,
  MusicBrainzArtistOriginCountryUpdate,
  MusicBrainzArtistRefreshResult,
  MusicBrainzArtistReleaseRow,
  MusicBrainzCacheStatus,
  MusicBrainzOriginCountryImportRequest,
  MusicBrainzOriginCountryImportProgress,
  MusicBrainzOriginCountryImportSummary,
  MusicBrainzOriginCountryPreview,
  MusicBrainzOriginCountryPreviewRow,
  MusicBrainzOriginCountryStatus,
  MusicBrainzOverlaySyncLogEntry,
  MusicBrainzOverlaySyncResult,
  MusicMapLocationDetails,
  MusicMapRefreshSummary,
  MusicMapResponse,
  PerformanceProbeResponse,
} from "./types";

let mockSavedPlaylists: SavedPlaylist[] = [];
let mockSavedExternalDiscoveries: SavedExternalDiscovery[] = [];
let mockWishListItems: WishListItem[] = [
  {
    id: 1,
    entity: "album",
    title: "Release",
    artist: "Pet Shop Boys",
    year: 2002,
    musicbrainzId: "3d5ca740-5f1b-3b6c-87f3-88a7fca8bcea",
    musicbrainzUrl:
      "https://musicbrainz.org/release-group/3d5ca740-5f1b-3b6c-87f3-88a7fca8bcea",
    source: "Preview",
    createdAt: "2026-07-26T12:00:00Z",
    downloadedDeezerAlbumId: null,
    downloadedPath: null,
    downloadedAt: null,
    artistAlbumSummary: null,
  },
  {
    id: 2,
    entity: "artist",
    title: "Pet Shop Boys",
    artist: "",
    year: null,
    musicbrainzId: "056e4f3e-d505-4dad-8ec1-d04f521cbb56",
    musicbrainzUrl:
      "https://musicbrainz.org/artist/056e4f3e-d505-4dad-8ec1-d04f521cbb56",
    source: "Preview",
    createdAt: "2026-07-26T11:00:00Z",
    downloadedDeezerAlbumId: null,
    downloadedPath: null,
    downloadedAt: null,
    artistAlbumSummary: {
      officialAlbumCount: 4,
      ownedAlbumCount: 2,
      missingAlbumCount: 2,
      missingAlbums: [
        {
          releaseGroupId: "00000000-0000-4000-8000-000000000001",
          title: "Please",
          year: 1986,
          musicbrainzUrl:
            "https://musicbrainz.org/release-group/00000000-0000-4000-8000-000000000001",
        },
        {
          releaseGroupId: "00000000-0000-4000-8000-000000000003",
          title: "Behaviour",
          year: 1990,
          musicbrainzUrl:
            "https://musicbrainz.org/release-group/00000000-0000-4000-8000-000000000003",
        },
      ],
      updatedAt: "2026-07-27T10:00:00Z",
    },
  },
];
const mockLibraryCompletionProviderDefaults = {
  coverStatus: null,
  coverProvider: null,
  coverMessage: null,
  coverCheckedAt: null,
  verificationProvider: null,
  musicbrainzVerificationStatus: null,
  musicbrainzVerificationMessage: null,
  discogsVerificationStatus: null,
  discogsVerificationMessage: null,
  discogsMasterId: null,
  discogsUrl: null,
} as const;
const mockLibraryCompletionCandidates: LibraryCompletionCandidate[] = [
  {
    ...mockLibraryCompletionProviderDefaults,
    id: "massive attack\u001fmezzanine",
    artist: "Massive Attack",
    title: "Mezzanine",
    chartYear: 1998,
    confidence: "best",
    status: "candidate",
    wishListItemId: null,
    musicbrainzId: null,
    musicbrainzUrl: null,
    coverUrl: mockTimelineCoverUrls[5],
    verificationStatus: "unverified",
    verificationMessage: null,
    verificationCheckedAt: null,
    evidence: [
      {
        source: "officialUk",
        label: "Official UK Albums",
        bestRank: 31,
        firstYear: 1998,
        lastYear: 1998,
        appearances: 12,
      },
      {
        source: "vgLista",
        label: "VG Lista",
        bestRank: 31,
        firstYear: 1998,
        lastYear: 1998,
        appearances: 8,
      },
    ],
  },
  {
    ...mockLibraryCompletionProviderDefaults,
    id: "rem\u001fautomatic for the people",
    artist: "R.E.M.",
    title: "Automatic for the People",
    chartYear: 1992,
    confidence: "best",
    status: "candidate",
    wishListItemId: null,
    musicbrainzId: null,
    musicbrainzUrl: null,
    coverUrl: null,
    verificationStatus: "unverified",
    verificationMessage: null,
    verificationCheckedAt: null,
    evidence: [
      {
        source: "billboard",
        label: "Billboard 200",
        bestRank: 38,
        firstYear: 1992,
        lastYear: 1992,
        appearances: 1,
      },
    ],
  },
  {
    ...mockLibraryCompletionProviderDefaults,
    id: "the chemical brothers\u001fdig your own hole",
    artist: "The Chemical Brothers",
    title: "Dig Your Own Hole",
    chartYear: 1997,
    confidence: "best",
    status: "candidate",
    wishListItemId: null,
    musicbrainzId: null,
    musicbrainzUrl: null,
    coverUrl: mockTimelineCoverUrls[2],
    verificationStatus: "unverified",
    verificationMessage: null,
    verificationCheckedAt: null,
    evidence: [
      {
        source: "officialUk",
        label: "Official UK Albums",
        bestRank: 21,
        firstYear: 1997,
        lastYear: 1997,
        appearances: 9,
      },
    ],
  },
  {
    ...mockLibraryCompletionProviderDefaults,
    id: "portishead\u001fportishead",
    artist: "Portishead",
    title: "Portishead",
    chartYear: 1997,
    confidence: "good",
    status: "candidate",
    wishListItemId: null,
    musicbrainzId: null,
    musicbrainzUrl: null,
    coverUrl: mockTimelineCoverUrls[1],
    verificationStatus: "unverified",
    verificationMessage: null,
    verificationCheckedAt: null,
    evidence: [
      {
        source: "vgLista",
        label: "VG Lista",
        bestRank: 46,
        firstYear: 1997,
        lastYear: 1997,
        appearances: 6,
      },
    ],
  },
  {
    ...mockLibraryCompletionProviderDefaults,
    id: "air\u001fmoon safari",
    artist: "Air",
    title: "Moon Safari",
    chartYear: 1998,
    confidence: "good",
    status: "candidate",
    wishListItemId: null,
    musicbrainzId: null,
    musicbrainzUrl: null,
    coverUrl: mockTimelineCoverUrls[3],
    verificationStatus: "unverified",
    verificationMessage: null,
    verificationCheckedAt: null,
    evidence: [
      {
        source: "officialUk",
        label: "Official UK Albums",
        bestRank: 15,
        firstYear: 1998,
        lastYear: 1998,
        appearances: 3,
      },
    ],
  },
  {
    ...mockLibraryCompletionProviderDefaults,
    id: "radiohead\u001fthe bends",
    artist: "Radiohead",
    title: "The Bends",
    chartYear: 1995,
    confidence: "needsReview",
    status: "needsReview",
    wishListItemId: null,
    musicbrainzId: null,
    musicbrainzUrl: null,
    coverUrl: mockTimelineCoverUrls[4],
    verificationStatus: "unverified",
    verificationMessage: null,
    verificationCheckedAt: null,
    evidence: [
      {
        source: "billboard",
        label: "Billboard 200",
        bestRank: 88,
        firstYear: 1995,
        lastYear: 1996,
        appearances: 2,
      },
    ],
  },
];
const mockLibraryCompletionAtlasRows: Array<[
  LibraryCompletionResponse["atlas"][number]["source"],
  string,
  number[],
  number[],
]> = [
  ["billboard", "Billboard 200", [1960, 1970, 1980, 1990, 2000, 2010, 2020], [12, 28, 41, 72, 81, 89, 94]],
  ["officialUk", "Official UK Albums", [1960, 1970, 1980, 1990, 2000, 2010, 2020], [18, 34, 38, 64, 76, 86, 93]],
  ["vgLista", "VG Lista", [1960, 1970, 1980, 1990, 2000, 2010, 2020], [8, 21, 27, 53, 68, 80, 91]],
];
const mockLibraryCompletionAtlas = mockLibraryCompletionAtlasRows.flatMap(
  ([source, label, decades, ownedPercents]) =>
  (decades as number[]).map((decade, index) => {
    const total = decade === 1980 && source === "officialUk" ? 418 : 240 + index * 24;
    const owned = Math.round(total * (ownedPercents as number[])[index] / 100);
    const needsReview = Math.max(4, Math.round(total * 0.15));
    const wanted = Math.max(2, Math.round(total * 0.04));
    const verified = Math.max(1, Math.round(total * 0.03));
    const previewCohort = source === "officialUk" && decade === 1990;
    const candidates = previewCohort
      ? 3
      : Math.max(0, total - owned - needsReview - wanted - verified - Math.max(1, Math.round(total * 0.03)));
    const excluded = Math.max(1, total - owned - needsReview - wanted - verified - candidates);
    return {
      source,
      label,
      decade,
      owned,
      candidates,
      verified,
      wanted,
      needsReview,
      excluded,
      total,
    };
  }),
) satisfies LibraryCompletionResponse["atlas"];
const mockLibraryCompletionDecisions = new Map<
  string,
  LibraryCompletionDecision
>();
const mockLibraryCompletionVerifications = new Map<
  string,
  LibraryCompletionVerificationStatus["recentItems"][number]
>();
const mockLibraryCompletionCovers = new Map<
  string,
  LibraryCompletionCoverEnrichment & { dataUrl: string | null }
>();
let mockLibraryCompletionVerificationStatus: LibraryCompletionVerificationStatus = {
  batch: null,
  recentItems: [],
};
let mockLibraryCompletionVerificationSequence = 1;
const mockLibraryCompletionArtistCandidates: LibraryCompletionArtistCandidate[] = [
  {
    id: "talk talk",
    artist: "Talk Talk",
    firstChartYear: 1982,
    confidence: "best",
    status: "candidate",
    wishListItemId: null,
    verificationStatus: "unverified",
    verificationMessage: null,
    verificationCheckedAt: null,
    musicbrainzVerificationStatus: null,
    musicbrainzVerificationMessage: null,
    musicbrainzId: null,
    musicbrainzUrl: null,
    officialAlbumCount: 0,
    discogsVerificationStatus: null,
    discogsVerificationMessage: null,
    discogsMasterId: null,
    discogsUrl: null,
    discogsStudioAlbumTitle: null,
    evidence: [
      { source: "officialUk", chartKind: "albums", label: "Official UK Albums", bestRank: 3, firstYear: 1984, lastYear: 1991, appearances: 42 },
      { source: "officialUk", chartKind: "singles", label: "Official UK Singles", bestRank: 13, firstYear: 1982, lastYear: 1991, appearances: 68 },
      { source: "vgLista", chartKind: "albums", label: "VG Lista Albums", bestRank: 9, firstYear: 1984, lastYear: 1988, appearances: 14 },
    ],
  },
  {
    id: "grace jones",
    artist: "Grace Jones",
    firstChartYear: 1977,
    confidence: "best",
    status: "candidate",
    wishListItemId: null,
    verificationStatus: "unverified",
    verificationMessage: null,
    verificationCheckedAt: null,
    musicbrainzVerificationStatus: null,
    musicbrainzVerificationMessage: null,
    musicbrainzId: null,
    musicbrainzUrl: null,
    officialAlbumCount: 0,
    discogsVerificationStatus: null,
    discogsVerificationMessage: null,
    discogsMasterId: null,
    discogsUrl: null,
    discogsStudioAlbumTitle: null,
    evidence: [
      { source: "billboard", chartKind: "albums", label: "Billboard 200", bestRank: 52, firstYear: 1981, lastYear: 1986, appearances: 18 },
      { source: "officialUk", chartKind: "singles", label: "Official UK Singles", bestRank: 12, firstYear: 1977, lastYear: 1993, appearances: 51 },
    ],
  },
  {
    id: "the blue nile",
    artist: "The Blue Nile",
    firstChartYear: 1984,
    confidence: "good",
    status: "candidate",
    wishListItemId: null,
    verificationStatus: "unverified",
    verificationMessage: null,
    verificationCheckedAt: null,
    musicbrainzVerificationStatus: null,
    musicbrainzVerificationMessage: null,
    musicbrainzId: null,
    musicbrainzUrl: null,
    officialAlbumCount: 0,
    discogsVerificationStatus: null,
    discogsVerificationMessage: null,
    discogsMasterId: null,
    discogsUrl: null,
    discogsStudioAlbumTitle: null,
    evidence: [
      { source: "officialUk", chartKind: "albums", label: "Official UK Albums", bestRank: 10, firstYear: 1984, lastYear: 2004, appearances: 22 },
    ],
  },
];
const mockLibraryCompletionArtistVerifications = new Map<
  string,
  LibraryCompletionArtistCandidate
>();
const mockLibraryCompletionArtistDecisions = new Map<
  string,
  LibraryCompletionArtistDecision
>();
let mockLibraryCompletionArtistVerificationStatus: LibraryCompletionArtistVerificationStatus = {
  batch: null,
  recentItems: [],
};
let mockLibraryCompletionArtistVerificationSequence = 1;
const mockDeemixDownloads = new Map<
  string,
  { destinationPath: string; downloadedAt: string }
>();
let mockPreparedImport: ImportPreview | null = null;
let mockImportCancellationRequested = false;
const mockImportProgressHandlers = new Set<(progress: ImportProgress) => void>();
const mockDeemixDownloadProgressHandlers = new Set<
  (progress: DeemixAlbumDownloadProgress) => void
>();
let mockMusicToolFixHistory: MusicToolFixHistoryEntry[] = [];
let mockMusicToolFixSequence = 1;
const mockMusicToolFixSnapshots = new Map<
  number,
  { issues: MusicToolIssueRow[]; diffs: MusicToolFixDiff[] }
>();
const mockMusicToolSourceWarning =
  "This repair changes only the app-local SQLite library. MusicBee TSV rows and audio tags remain unchanged, so re-importing the same source can restore the original spacing.";

function emitMockImportProgress(progress: ImportProgress) {
  for (const handler of mockImportProgressHandlers) {
    handler(progress);
  }
}

type RawExportResult = Omit<ExportResult, "pathCopied">;

export async function copyTextToClipboard(value: string) {
  if (!value) return false;
  try {
    if (isTauriRuntime()) {
      await writeText(value);
    } else if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function finalizeExport(result: RawExportResult): Promise<ExportResult> {
  return {
    ...result,
    pathCopied: await copyTextToClipboard(result.path),
  };
}

export async function openExternalUrl(url: string) {
  const normalizedUrl = normalizeAllowedExternalUrl(url);

  if (!isTauriRuntime()) {
    window.open(normalizedUrl, "_blank", "noopener,noreferrer");
    return;
  }

  await openUrl(normalizedUrl);
}

export async function openResearchSourceUrl(url: string) {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("Invalid research source URL.");
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error("Research sources must use HTTPS.");
  }

  const normalizedUrl = parsedUrl.toString();
  if (!isTauriRuntime()) {
    window.open(normalizedUrl, "_blank", "noopener,noreferrer");
    return;
  }

  await openUrl(normalizedUrl);
}

export async function getLibraryStatus() {
  if (!isTauriRuntime()) {
    return mockStatus;
  }

  return invoke<LibraryStatus>("get_library_status");
}

export async function runPerformanceProbe() {
  if (!isTauriRuntime()) {
    const operations = [
      [
        "search-albums-default",
        "Album search default page",
        "Search",
        18,
        mockRows.length,
        "Default album page, sorted by album.",
      ],
      [
        "search-albums-sampled-text",
        "Album search sampled text",
        "Search",
        23,
        1,
        "Sampled album text: Actually",
      ],
      [
        "search-tracks-sampled-text",
        "Track search sampled text",
        "Search",
        27,
        1,
        "Sampled track text: What Have I Done to Deserve This?",
      ],
      [
        "chart-album-score",
        "Chart-style album score ranking",
        "Charts",
        31,
        1,
        "Fully rated albums sorted by Album Score.",
      ],
      [
        "tools-missing-covers",
        "Music Tool missing covers",
        "Tools",
        34,
        1,
        "Albums without imported cover records.",
      ],
      [
        "tools-whitespace",
        "Music Tool whitespace anomalies",
        "Tools",
        12,
        1,
        "Repeated whitespace validator.",
      ],
      [
        "statistics-dashboard",
        "Statistics dashboard payload",
        "Statistics",
        44,
        mockRows.length,
        "Mock dashboard summary.",
      ],
      [
        "discovery-dashboard",
        "Discovery dashboard payload",
        "Discovery",
        39,
        12,
        "Mock discovery summary.",
      ],
    ] as const;

    return {
      generatedAt: new Date().toISOString(),
      databasePath: mockStatus.dbPath,
      trackCount: mockStatus.trackCount,
      albumCount: mockStatus.albumCount,
      totalDurationMs: operations.reduce(
        (sum, operation) => sum + operation[3],
        0,
      ),
      slowestOperationMs: Math.max(
        ...operations.map((operation) => operation[3]),
      ),
      operations: operations.map(
        ([id, label, category, durationMs, rowCount, detail]) => ({
          id,
          label,
          category,
          status: "ok",
          durationMs,
          totalCount: rowCount,
          rowCount,
          detail,
          errorMessage: null,
        }),
      ),
    } satisfies PerformanceProbeResponse;
  }

  return invoke<PerformanceProbeResponse>("run_performance_probe");
}

export async function listImportRuns(limit: number) {
  if (!isTauriRuntime()) {
    return mockImportRuns.slice(0, limit) satisfies ImportRun[];
  }

  return invoke<ImportRun[]>("list_import_runs", { limit });
}

export async function listDatabaseBackups() {
  if (!isTauriRuntime()) {
    return mockDatabaseBackups satisfies DatabaseBackup[];
  }

  return invoke<DatabaseBackup[]>("list_database_backups");
}

export async function restoreDatabaseBackup(backupPath: string) {
  if (!isTauriRuntime()) {
    throw new Error(
      "Start restore from the Tauri desktop app to access local SQLite backups.",
    );
  }

  return invoke<DatabaseRestoreSummary>("restore_database_backup", {
    backupPath,
  });
}

export async function getStatistics() {
  if (!isTauriRuntime()) {
    return mockStatistics;
  }

  return invoke<StatisticsResponse>("get_statistics");
}

function mockAlbumDebutTimeline(
  requestedYear: number | null,
): AlbumDebutTimelineResponse {
  const previewYears = [
    1960, 1964, 1969, 1973, 1978, 1982, 1986, 1989, 1993, 1998, 2002,
    2008, 2013, 2018, 2024,
  ];
  const previewTitles = [
    "Afterimage",
    "Night Geometry",
    "Still Water",
    "Pale Orbit",
    "The Red Door",
    "Contour Lines",
  ];
  const previewArtists = [
    "Glass Harbour",
    "Northern Static",
    "Velvet Transit",
    "Low Meridian",
    "Sunday Cinema",
    "Parallel Forms",
  ];
  const datedAlbums = previewYears.flatMap((year, yearIndex) => {
    const months =
      year === 1989
        ? [1, 2, 3, 4, 5, 6, 6, 6, 7, 7, 7, 8, 8, 8, 9, 10, 11, 12]
        : Array.from(
            { length: yearIndex % 3 === 0 ? 2 : 1 },
            (_, albumIndex) => ((yearIndex * 3 + albumIndex * 4) % 12) + 1,
          );
    return months.map((month, albumIndex) => {
      const sequence = yearIndex * 3 + albumIndex;
      const week = Math.min(
        53,
        Math.max(1, Math.round((month - 1) * 4.35 + 2 + (sequence % 3))),
      );
      const id = `timeline-preview-${year}-${albumIndex}`;
      return {
        id,
        albumId: id,
        album: `${previewTitles[sequence % previewTitles.length]}${
          year === 1989 ? ` ${albumIndex + 1}` : ""
        }`,
        albumArtistDisplay: previewArtists[sequence % previewArtists.length],
        canonicalGenre: ["Art Pop", "Synthpop", "Post-Punk", "Ambient"][
          sequence % 4
        ],
        year,
        albumScore: 6.7 + (sequence % 23) / 10,
        billboardRank: 7 + (sequence * 11) % 91,
        billboardYear: year,
        billboardDebutYear: year,
        billboardDebutMonth: month,
        billboardDebutWeek: week,
        billboardDebutWeekKey: `${year}-W${String(week).padStart(2, "0")}`,
        coverPath: mockTimelineCoverUrls[sequence % mockTimelineCoverUrls.length],
        coverMimeType: "image/webp",
      } satisfies AlbumDebutTimelineAlbum;
    });
  });
  const grouped = new Map<
    number,
    { albumCount: number; representativeAlbum: AlbumDebutTimelineAlbum }
  >();
  for (const album of datedAlbums) {
    const current = grouped.get(album.billboardDebutYear);
    if (!current) {
      grouped.set(album.billboardDebutYear, {
        albumCount: 1,
        representativeAlbum: album,
      });
      continue;
    }
    current.albumCount += 1;
    const currentScore = current.representativeAlbum.albumScore ?? -Infinity;
    if ((album.albumScore ?? -Infinity) > currentScore) {
      current.representativeAlbum = album;
    }
  }
  const years = [...grouped.entries()]
    .map(([year, value]) => ({ year, ...value }))
    .sort((left, right) => left.year - right.year);
  const selectedYear =
    requestedYear != null && grouped.has(requestedYear)
      ? requestedYear
      : (years.reduce<(typeof years)[number] | null>(
          (best, year) =>
            !best ||
            year.albumCount > best.albumCount ||
            (year.albumCount === best.albumCount && year.year > best.year)
              ? year
              : best,
          null,
        )?.year ?? null);
  return {
    years,
    selectedYear,
    albums: datedAlbums.filter(
      (album) => album.billboardDebutYear === selectedYear,
    ),
    datedAlbumCount: datedAlbums.length,
    undatedAlbumCount: 3,
  };
}

export async function getAlbumDebutTimeline(
  selectedYear: number | null = null,
  chartSource: TimelineChartSource = "billboard",
) {
  if (!isTauriRuntime()) {
    return mockAlbumDebutTimeline(selectedYear);
  }

  return invoke<AlbumDebutTimelineResponse>("get_album_debut_timeline", {
    selectedYear,
    chartSource,
  });
}

function mockIsoWeekStartDate(year: number, week: number) {
  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const januaryFourthIsoDay = januaryFourth.getUTCDay() || 7;
  januaryFourth.setUTCDate(
    januaryFourth.getUTCDate() - januaryFourthIsoDay + 1 + (week - 1) * 7,
  );
  return januaryFourth.toISOString().slice(0, 10);
}

function mockTrackDebutTimeline(
  requestedYear: number | null,
  chartSource: TimelineChartSource = "billboard",
): TrackDebutTimelineResponse {
  const useTiISkuddet = chartSource === "tiISkuddet";
  const useNorsktoppen = chartSource === "norsktoppen";
  const useOfficialUk = chartSource === "officialUk";
  const useVgLista = chartSource === "vgLista";
  const tracks = mockRows
    .filter(
      (row) =>
        row.trackId != null &&
        (useNorsktoppen
          ? row.norsktoppenDebutDate != null &&
            row.norsktoppenDebutYear != null &&
            row.norsktoppenDebutMonth != null &&
            row.norsktoppenDebutWeek != null &&
            row.norsktoppenDebutWeekKey != null
          : useTiISkuddet
          ? row.tiISkuddetDebutDate != null &&
            row.tiISkuddetDebutYear != null &&
            row.tiISkuddetDebutMonth != null &&
            row.tiISkuddetDebutWeek != null &&
            row.tiISkuddetDebutWeekKey != null
          : useOfficialUk
          ? row.officialUkDebutYear != null &&
            row.officialUkDebutMonth != null &&
            row.officialUkDebutWeek != null &&
            row.officialUkDebutWeekKey != null
          : useVgLista
          ? row.vgListaDebutYear != null &&
            row.vgListaDebutMonth != null &&
            row.vgListaDebutWeek != null &&
            row.vgListaDebutWeekKey != null
          : row.billboardSingleDebutDate != null &&
            row.billboardSingleDebutYear != null &&
            row.billboardSingleDebutMonth != null &&
            row.billboardSingleDebutWeek != null &&
            row.billboardSingleDebutWeekKey != null),
    )
    .map(
      (row) =>
        ({
          id: String(row.trackId),
          trackId: row.trackId!,
          albumId: row.albumId,
          title: row.title,
          displayArtist: row.displayArtist,
          album: row.album,
          albumArtistDisplay: row.albumArtistDisplay,
          canonicalGenre: row.canonicalGenre,
          year: row.year,
          normalizedRating: row.normalizedRating,
          love: row.love,
          billboardSingleRank: useNorsktoppen
            ? row.norsktoppenRank
            : useTiISkuddet
              ? row.tiISkuddetRank
              : useOfficialUk
                ? row.officialUkRank
                : useVgLista
                  ? row.vgListaRank
              : row.billboardSingleRank,
          billboardSingleYear: useNorsktoppen
            ? row.norsktoppenYear
            : useTiISkuddet
              ? row.tiISkuddetYear
              : useOfficialUk
                ? row.officialUkYear
                : useVgLista
                  ? row.vgListaYear
              : row.billboardSingleYear,
          billboardSingleDebutDate: useNorsktoppen
            ? row.norsktoppenDebutDate!
            : useTiISkuddet
              ? row.tiISkuddetDebutDate!
              : useOfficialUk
                ? mockIsoWeekStartDate(
                    row.officialUkDebutYear!,
                    row.officialUkDebutWeek!,
                  )
                : useVgLista
                  ? mockIsoWeekStartDate(
                      row.vgListaDebutYear!,
                      row.vgListaDebutWeek!,
                    )
              : row.billboardSingleDebutDate!,
          billboardSingleDebutYear: useNorsktoppen
            ? row.norsktoppenDebutYear!
            : useTiISkuddet
              ? row.tiISkuddetDebutYear!
              : useOfficialUk
                ? row.officialUkDebutYear!
                : useVgLista
                  ? row.vgListaDebutYear!
              : row.billboardSingleDebutYear!,
          billboardSingleDebutMonth: useNorsktoppen
            ? row.norsktoppenDebutMonth!
            : useTiISkuddet
              ? row.tiISkuddetDebutMonth!
              : useOfficialUk
                ? row.officialUkDebutMonth!
                : useVgLista
                  ? row.vgListaDebutMonth!
              : row.billboardSingleDebutMonth!,
          billboardSingleDebutWeek: useNorsktoppen
            ? row.norsktoppenDebutWeek!
            : useTiISkuddet
              ? row.tiISkuddetDebutWeek!
              : useOfficialUk
                ? row.officialUkDebutWeek!
                : useVgLista
                  ? row.vgListaDebutWeek!
              : row.billboardSingleDebutWeek!,
          billboardSingleDebutWeekKey: useNorsktoppen
            ? row.norsktoppenDebutWeekKey!
            : useTiISkuddet
              ? row.tiISkuddetDebutWeekKey!
              : useOfficialUk
                ? row.officialUkDebutWeekKey!
                : useVgLista
                  ? row.vgListaDebutWeekKey!
              : row.billboardSingleDebutWeekKey!,
          coverPath: row.coverPath,
          coverMimeType: row.coverMimeType,
        }) satisfies TrackDebutTimelineTrack,
    );
  const grouped = new Map<
    number,
    { trackCount: number; representativeTrack: TrackDebutTimelineTrack }
  >();
  for (const track of tracks) {
    const current = grouped.get(track.billboardSingleDebutYear);
    if (!current) {
      grouped.set(track.billboardSingleDebutYear, {
        trackCount: 1,
        representativeTrack: track,
      });
      continue;
    }
    current.trackCount += 1;
    if (
      (track.normalizedRating ?? -Infinity) >
      (current.representativeTrack.normalizedRating ?? -Infinity)
    ) {
      current.representativeTrack = track;
    }
  }
  const years = [...grouped.entries()]
    .map(([year, value]) => ({ year, ...value }))
    .sort((left, right) => left.year - right.year);
  const selectedYear =
    requestedYear != null && grouped.has(requestedYear)
      ? requestedYear
      : (years.reduce<(typeof years)[number] | null>(
          (best, year) =>
            !best ||
            year.trackCount > best.trackCount ||
            (year.trackCount === best.trackCount && year.year > best.year)
              ? year
              : best,
          null,
        )?.year ?? null);
  return {
    years,
    selectedYear,
    tracks: tracks.filter(
      (track) => track.billboardSingleDebutYear === selectedYear,
    ),
    datedTrackCount: tracks.length,
    undatedTrackCount: mockRows.filter((row) => row.trackId != null).length - tracks.length,
  };
}

export async function getTrackDebutTimeline(
  selectedYear: number | null = null,
  chartSource: TimelineChartSource = "billboard",
) {
  if (!isTauriRuntime()) {
    return mockTrackDebutTimeline(selectedYear, chartSource);
  }

  return invoke<TrackDebutTimelineResponse>("get_track_debut_timeline", {
    selectedYear,
    chartSource,
  });
}

export async function getMusicMap() {
  if (!isTauriRuntime()) {
    return mockMusicMap;
  }

  return invoke<MusicMapResponse>("get_music_map");
}

export async function getMusicMapLocationDetails(locationKey: string) {
  if (!isTauriRuntime()) {
    return mockMusicMapDetails(locationKey);
  }

  return invoke<MusicMapLocationDetails>("get_music_map_location_details", {
    locationKey,
  });
}

export async function refreshMusicMapLocations() {
  if (!isTauriRuntime()) {
    return mockMusicMapRefresh;
  }

  return invoke<MusicMapRefreshSummary>("refresh_music_map_locations");
}

export async function getYearProgress(request: YearProgressRequest) {
  if (!isTauriRuntime()) {
    const includedGenres = new Set(expandGenreFilterKeys(request.genres));
    const excludedGenres = new Set(
      expandGenreFilterKeys(request.excludedGenres),
    );
    const rowsByYear = new Map<
      number,
      YearProgressStats & { scoreTotal: number; scoredAlbumCount: number }
    >();

    mockRows.forEach((album) => {
      if (album.trackId != null || album.year == null) return;
      const genre = normalizeGenreKey(album.canonicalGenre);
      if (includedGenres.size > 0 && !includedGenres.has(genre)) return;
      if (excludedGenres.has(genre)) return;

      const existing = rowsByYear.get(album.year) ?? {
        year: album.year,
        albumCount: 0,
        ratedAlbumCount: 0,
        partialAlbumCount: 0,
        unratedAlbumCount: 0,
        trackCount: 0,
        totalSeconds: 0,
        lovedTracks: 0,
        averageAlbumScore: null,
        scoreTotal: 0,
        scoredAlbumCount: 0,
      };
      existing.albumCount += 1;
      existing.trackCount += album.totalTracks ?? 0;
      existing.totalSeconds += album.totalSeconds ?? 0;
      existing.lovedTracks += album.lovedTracks ?? 0;
      if ((album.ratingCompleteness ?? 0) >= 1) {
        existing.ratedAlbumCount += 1;
      } else if ((album.ratingCompleteness ?? 0) > 0) {
        existing.partialAlbumCount += 1;
      } else {
        existing.unratedAlbumCount += 1;
      }
      if (album.albumScore != null) {
        existing.scoreTotal += album.albumScore;
        existing.scoredAlbumCount += 1;
        existing.averageAlbumScore =
          existing.scoreTotal / existing.scoredAlbumCount;
      }
      rowsByYear.set(album.year, existing);
    });

    return Array.from(rowsByYear.values())
      .sort((left, right) => left.year - right.year)
      .map(({ scoreTotal: _scoreTotal, scoredAlbumCount: _scoredCount, ...row }) =>
        row,
      );
  }

  return invoke<YearProgressStats[]>("get_year_progress", { request });
}

export async function getGenreProgress(request: GenreProgressRequest) {
  if (!isTauriRuntime()) {
    const includedGenres = new Set(expandGenreFilterKeys(request.genres));
    const excludedGenres = new Set(
      expandGenreFilterKeys(request.excludedGenres),
    );
    const rowsByGenre = new Map<
      string,
      GenreProgressStats & { scoreTotal: number; scoredAlbumCount: number }
    >();

    mockRows.forEach((album) => {
      if (album.trackId != null) return;
      if (
        request.yearFrom != null &&
        (album.year == null || album.year < request.yearFrom)
      ) {
        return;
      }
      if (
        request.yearTo != null &&
        (album.year == null || album.year > request.yearTo)
      ) {
        return;
      }
      const genre = normalizeGenreKey(album.canonicalGenre) || "unknown";
      if (includedGenres.size > 0 && !includedGenres.has(genre)) return;
      if (excludedGenres.has(genre)) return;

      const existing = rowsByGenre.get(genre) ?? {
        genre: album.canonicalGenre?.trim() || "Unknown",
        albumCount: 0,
        ratedAlbumCount: 0,
        partialAlbumCount: 0,
        unratedAlbumCount: 0,
        trackCount: 0,
        totalSeconds: 0,
        lovedTracks: 0,
        averageAlbumScore: null,
        scoreTotal: 0,
        scoredAlbumCount: 0,
      };
      existing.albumCount += 1;
      existing.trackCount += album.totalTracks ?? 0;
      existing.totalSeconds += album.totalSeconds ?? 0;
      existing.lovedTracks += album.lovedTracks ?? 0;
      if ((album.ratingCompleteness ?? 0) >= 1) {
        existing.ratedAlbumCount += 1;
      } else if ((album.ratingCompleteness ?? 0) > 0) {
        existing.partialAlbumCount += 1;
      } else {
        existing.unratedAlbumCount += 1;
      }
      if (album.albumScore != null) {
        existing.scoreTotal += album.albumScore;
        existing.scoredAlbumCount += 1;
        existing.averageAlbumScore =
          existing.scoreTotal / existing.scoredAlbumCount;
      }
      rowsByGenre.set(genre, existing);
    });

    return Array.from(rowsByGenre.values())
      .sort(
        (left, right) =>
          right.albumCount - left.albumCount ||
          left.genre.localeCompare(right.genre),
      )
      .map(({ scoreTotal: _scoreTotal, scoredAlbumCount: _scoredCount, ...row }) =>
        row,
      );
  }

  return invoke<GenreProgressStats[]>("get_genre_progress", { request });
}

export async function getDiscovery() {
  if (!isTauriRuntime()) {
    return mockDiscovery;
  }

  return invoke<DiscoveryResponse>("get_discovery");
}

export async function getSettings() {
  if (!isTauriRuntime()) {
    return mockSettings;
  }

  const settings = normalizeSettings(
    await invoke<AppSettings>("get_settings"),
  );
  cacheSettings(settings);
  return settings;
}

export async function getAiKeyStatus() {
  if (!isTauriRuntime()) {
    return {
      configured: false,
      source: "none",
      model: "gpt-5.6-luna",
    } satisfies AiKeyStatus;
  }

  return invoke<AiKeyStatus>("get_ai_key_status");
}

export async function saveOpenAiApiKey(apiKey: string) {
  if (!isTauriRuntime()) {
    throw new Error(
      "OpenAI keys can only be stored by the Tauri desktop app.",
    );
  }

  return invoke<AiKeyStatus>("save_openai_api_key", { apiKey });
}

export async function deleteOpenAiApiKey() {
  if (!isTauriRuntime()) {
    throw new Error(
      "OpenAI keys can only be removed by the Tauri desktop app.",
    );
  }

  return invoke<AiKeyStatus>("delete_openai_api_key");
}

export async function testOpenAiConnection() {
  if (!isTauriRuntime()) {
    throw new Error("OpenAI connection tests require the Tauri desktop app.");
  }

  return invoke<AiConnectionTest>("test_openai_connection");
}

export async function getDeemixCredentialStatus() {
  if (!isTauriRuntime()) {
    return {
      configured: false,
      source: "none",
    } satisfies DeemixCredentialStatus;
  }
  return invoke<DeemixCredentialStatus>("get_deemix_credential_status");
}

export async function saveDeemixArl(arl: string) {
  if (!isTauriRuntime()) {
    throw new Error(
      "Deemix credentials can only be stored by the Tauri desktop app.",
    );
  }
  return invoke<DeemixConnectionTest>("save_deemix_arl", { arl });
}

export async function deleteDeemixArl() {
  if (!isTauriRuntime()) {
    throw new Error(
      "Deemix credentials can only be removed by the Tauri desktop app.",
    );
  }
  return invoke<DeemixCredentialStatus>("delete_deemix_arl");
}

export async function testDeemixConnection() {
  if (!isTauriRuntime()) {
    throw new Error("Deemix connection tests require the Tauri desktop app.");
  }
  return invoke<DeemixConnectionTest>("test_deemix_connection");
}

export async function getDiscogsCredentialStatus() {
  if (!isTauriRuntime()) {
    return {
      configured: true,
      source: "windowsCredentialManager",
    } satisfies DiscogsCredentialStatus;
  }
  return invoke<DiscogsCredentialStatus>("get_discogs_credential_status");
}

export async function saveDiscogsCredentials(input: SaveDiscogsCredentialsRequest) {
  if (!isTauriRuntime()) {
    throw new Error(
      "Discogs credentials can only be stored by the Tauri desktop app.",
    );
  }
  return invoke<DiscogsConnectionTest>("save_discogs_credentials", { input });
}

export async function deleteDiscogsCredentials() {
  if (!isTauriRuntime()) {
    throw new Error(
      "Discogs credentials can only be removed by the Tauri desktop app.",
    );
  }
  return invoke<DiscogsCredentialStatus>("delete_discogs_credentials");
}

export async function testDiscogsConnection() {
  if (!isTauriRuntime()) {
    throw new Error("Discogs connection tests require the Tauri desktop app.");
  }
  return invoke<DiscogsConnectionTest>("test_discogs_connection");
}

export async function selectDeemixDownloadDirectory(defaultPath?: string) {
  if (!isTauriRuntime()) {
    return null;
  }
  return selectDirectory(defaultPath);
}

const soulseekPreviewProfile: SoulseekConnectionProfile = {
  username: "",
  serverHost: "server.slsknet.org",
  serverPort: 2242,
  downloadDirectory: "C:\\Users\\Music\\Downloads\\Soulseek",
  rememberPassword: true,
  autoConnect: true,
};

export async function getSoulseekConnection() {
  if (!isTauriRuntime()) {
    return {
      profile: null,
      suggestedProfile: soulseekPreviewProfile,
      hasPassword: false,
      snapshot: {
        state: "unconfigured",
        username: null,
        server: null,
        message: "Add your Soulseek account to get started.",
        attempt: 0,
        connectedAtMs: null,
        retryInSeconds: null,
        updatedAtMs: Date.now(),
      },
      diagnosticsPath: "Preview runtime",
    } satisfies SoulseekConnectionBootstrap;
  }
  return invoke<SoulseekConnectionBootstrap>("connection_bootstrap");
}

export async function saveSoulseekConnection(
  profile: SoulseekConnectionProfile,
  password: string | null,
) {
  if (!isTauriRuntime()) {
    return {
      profile,
      suggestedProfile: soulseekPreviewProfile,
      hasPassword: Boolean(password),
      snapshot: {
        state: "offline",
        username: profile.username,
        server: `${profile.serverHost}:${profile.serverPort}`,
        message: "Ready to connect.",
        attempt: 0,
        connectedAtMs: null,
        retryInSeconds: null,
        updatedAtMs: Date.now(),
      },
      diagnosticsPath: "Preview runtime",
    } satisfies SoulseekConnectionBootstrap;
  }
  return invoke<SoulseekConnectionBootstrap>("connection_save_profile", {
    request: { profile, password },
  });
}

export async function connectSoulseek() {
  if (!isTauriRuntime()) {
    return {
      state: "online",
      username: "preview-listener",
      server: "server.slsknet.org:2242",
      message: "Connected to Soulseek.",
      attempt: 1,
      connectedAtMs: Date.now(),
      retryInSeconds: null,
      updatedAtMs: Date.now(),
    } satisfies SoulseekConnectionSnapshot;
  }
  return invoke<SoulseekConnectionSnapshot>("connection_connect");
}

export async function disconnectSoulseek() {
  if (!isTauriRuntime()) {
    return {
      state: "offline",
      username: "preview-listener",
      server: "server.slsknet.org:2242",
      message: "Ready to connect.",
      attempt: 0,
      connectedAtMs: null,
      retryInSeconds: null,
      updatedAtMs: Date.now(),
    } satisfies SoulseekConnectionSnapshot;
  }
  return invoke<SoulseekConnectionSnapshot>("connection_disconnect");
}

export async function resetSoulseekConnection() {
  if (!isTauriRuntime()) return getSoulseekConnection();
  return invoke<SoulseekConnectionBootstrap>("connection_reset");
}

export async function selectSoulseekDownloadDirectory(defaultPath?: string) {
  if (!isTauriRuntime()) return null;
  return selectDirectory(defaultPath, "Choose Soulseek download folder");
}

export async function selectSoulseekShareDirectory() {
  if (!isTauriRuntime()) return null;
  return selectDirectory(undefined, "Choose a music folder to share on Soulseek");
}

const emptySoulseekShares = (): SoulseekLocalShares => ({
  roots: [],
  uploadSlots: 1,
  scanning: false,
  totalFileCount: 0,
  totalDirectoryCount: 0,
  totalSizeBytes: 0,
  lastScanAtMs: null,
});

export async function getSoulseekLocalShares() {
  if (!isTauriRuntime()) return emptySoulseekShares();
  return invoke<SoulseekLocalShares>("local_shares_snapshot");
}

export async function addSoulseekLocalShare(path: string) {
  if (!isTauriRuntime()) return emptySoulseekShares();
  return invoke<SoulseekLocalShares>("local_shares_add", { path });
}

export async function removeSoulseekLocalShare(id: string) {
  if (!isTauriRuntime()) return emptySoulseekShares();
  return invoke<SoulseekLocalShares>("local_shares_remove", { id });
}

export async function setSoulseekLocalShareEnabled(id: string, enabled: boolean) {
  if (!isTauriRuntime()) return emptySoulseekShares();
  return invoke<SoulseekLocalShares>("local_shares_set_enabled", { id, enabled });
}

export async function rescanSoulseekLocalShares() {
  if (!isTauriRuntime()) return emptySoulseekShares();
  return invoke<SoulseekLocalShares>("local_shares_rescan");
}

export async function setSoulseekUploadSlots(uploadSlots: number) {
  if (!isTauriRuntime()) return emptySoulseekShares();
  return invoke<SoulseekLocalShares>("local_shares_set_upload_slots", {
    uploadSlots,
  });
}

export async function searchSoulseekAlbum(
  input: SoulseekAlbumSearchRequest,
) {
  const query = `${input.artist} ${input.title}`.trim();
  if (!isTauriRuntime()) {
    const folder = `Music\\${input.artist}\\${input.title}${input.year ? ` (${input.year})` : ""}`;
    const results = Array.from({ length: 10 }, (_, index) => ({
      id: `preview-${index + 1}`,
      token: 1,
      username: "lossless-listener",
      filename: `${folder}\\${String(index + 1).padStart(2, "0")} - Track ${index + 1}.flac`,
      sizeBytes: 31_000_000 + index * 420_000,
      extension: "flac",
      bitrate: 950,
      durationSeconds: 220 + index,
      vbr: false,
      sampleRate: 44_100,
      bitDepth: 16,
      slotFree: true,
      averageSpeed: 5_500_000,
      queueLength: 0,
      isPrivate: false,
    })) satisfies SoulseekSearchResult[];
    return {
      query,
      snapshot: {
        state: "completed",
        token: 1,
        clientId: "wishlist-preview",
        query,
        resultCount: results.length,
        peerCount: 1,
        message: "Found 10 files from 1 person.",
        startedAtMs: Date.now() - 500,
        finishedAtMs: Date.now(),
      },
      results,
      searchedAt: new Date().toISOString(),
    } satisfies SoulseekAlbumSearchResponse;
  }

  const clientId = createSoulseekSearchClientId();
  return new Promise<SoulseekAlbumSearchResponse>(async (resolve, reject) => {
    const results = new Map<string, SoulseekSearchResult>();
    let settled = false;
    let unlisten: UnlistenFn | undefined;
    const finish = (
      snapshot: SoulseekSearchEvent["snapshot"],
      failure?: string,
    ) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      unlisten?.();
      void invoke<boolean>("search_close", { clientId }).catch(() => undefined);
      if (failure) {
        reject(new Error(failure));
      } else {
        resolve({
          query,
          snapshot,
          results: [...results.values()],
          searchedAt: new Date().toISOString(),
        });
      }
    };
    const timeout = window.setTimeout(() => {
      void invoke("search_stop", { clientId }).catch(() => undefined);
      finish(
        {
          state: "error",
          token: null,
          clientId,
          query,
          resultCount: results.size,
          peerCount: 0,
          message: "Soulseek search timed out.",
          startedAtMs: null,
          finishedAtMs: Date.now(),
        },
        "Soulseek search timed out.",
      );
    }, 25_000);

    try {
      unlisten = await listen<SoulseekSearchEvent>(
        "music-library://soulseek-search",
        (event) => {
        const payload = event.payload;
        if (payload.snapshot.clientId !== clientId) return;
        for (const result of payload.results) results.set(result.id, result);
        if (payload.event === "completed" || payload.event === "stopped") {
          finish(payload.snapshot);
        } else if (payload.event === "error") {
          finish(payload.snapshot, payload.snapshot.message);
        }
        },
      );
      await invoke("search_start", { clientId, query });
    } catch (error) {
      finish(
        {
          state: "error",
          token: null,
          clientId,
          query,
          resultCount: results.size,
          peerCount: 0,
          message: error instanceof Error ? error.message : String(error),
          startedAtMs: null,
          finishedAtMs: Date.now(),
        },
        error instanceof Error ? error.message : String(error),
      );
    }
  });
}

let mockSoulseekTransfers: SoulseekTransfer[] = [];
let mockSoulseekReleaseSequence = 0;
const mockSoulseekTransferHandlers = new Set<
  (snapshot: SoulseekTransferQueue) => void
>();

function mockSoulseekTransferSnapshot() {
  return {
    transfers: mockSoulseekTransfers,
    activeCount: mockSoulseekTransfers.filter((transfer) =>
      ["requesting", "remotelyQueued", "connecting", "downloading"].includes(
        transfer.status,
      ),
    ).length,
    maxConcurrentDownloads: 3,
    relaySuggestionMinutes: 10,
    soundcheckEnabled: true,
    safetyState: "running",
  } satisfies SoulseekTransferQueue;
}

function publishMockSoulseekTransfers() {
  const snapshot = mockSoulseekTransferSnapshot();
  for (const handler of mockSoulseekTransferHandlers) handler(snapshot);
  return snapshot;
}

export async function getSoulseekTransfers() {
  if (!isTauriRuntime()) return mockSoulseekTransferSnapshot();
  return invoke<SoulseekTransferQueue>("transfers_snapshot");
}

export async function enqueueSoulseekRelease(input: SoulseekReleaseDownloadRequest) {
  if (!isTauriRuntime()) {
    const now = Date.now();
    const releaseId = `preview-release-${now}-${++mockSoulseekReleaseSequence}`;
    const fileCount = input.files.length;
    mockSoulseekTransfers = [
      ...mockSoulseekTransfers,
      ...input.files.map(
        (file, index) =>
          ({
            id: `${releaseId}-${index + 1}`,
            releaseId,
            releaseTitle: input.title,
            releaseFolder: `Preview\\${input.title}`,
            fileIndex: index + 1,
            fileCount,
            expectedTrackCount: input.expectedTrackCount,
            releaseGroupId: input.releaseGroupId,
            title: file.title,
            username: input.username,
            remoteFilename: file.remoteFilename,
            sizeBytes: file.sizeBytes,
            transferredBytes: 0,
            speedBytesPerSecond: 0,
            etaSeconds: null,
            status: "queued",
            queuePosition: null,
            localPath: `Preview\\${input.title}\\${file.title}`,
            error: null,
            createdAtMs: now + index,
            updatedAtMs: now,
          }) satisfies SoulseekTransfer,
      ),
    ];
    const queuedSnapshot = publishMockSoulseekTransfers();
    window.setTimeout(() => {
      mockSoulseekTransfers = mockSoulseekTransfers.map((transfer) => {
        if (transfer.releaseId !== releaseId) return transfer;
        if (transfer.fileIndex === 1) {
          return {
            ...transfer,
            status: "completed",
            transferredBytes: transfer.sizeBytes,
            updatedAtMs: Date.now(),
          };
        }
        if (transfer.fileIndex === 2) {
          return {
            ...transfer,
            status: "downloading",
            transferredBytes: Math.round(transfer.sizeBytes * 0.4),
            speedBytesPerSecond: 2_500_000,
            etaSeconds: 45,
            updatedAtMs: Date.now(),
          };
        }
        return transfer;
      });
      publishMockSoulseekTransfers();
    }, 700);
    return queuedSnapshot;
  }
  return invoke<SoulseekTransferQueue>("transfer_enqueue_release", { request: input });
}

export async function getSoulseekUploads() {
  if (!isTauriRuntime()) {
    return {
      uploads: [],
      activeCount: 0,
      queuedCount: 0,
      sessionUploadedBytes: 0,
    } satisfies SoulseekUploadQueue;
  }
  return invoke<SoulseekUploadQueue>("uploads_snapshot");
}

export async function compileNaturalLanguageQuery(input: AiCompileRequest) {
  if (!isTauriRuntime()) {
    throw new Error("Natural-language queries require the Tauri desktop app.");
  }

  return invoke<AiCompiledQuery>("compile_natural_language_query", { input });
}

export async function askCurrentView(input: AiCurrentViewQuestion) {
  if (!isTauriRuntime()) {
    const preview = await searchLibrary({
      ...input.request,
      offset: 0,
      limit: Math.min(input.request.limit, 50),
    });
    const artistCounts = new Map<string, number>();
    for (const row of preview.rows) {
      const artist =
        (input.request.view === "tracks"
          ? row.displayArtist || row.albumArtistDisplay
          : row.albumArtistDisplay) || "Unknown";
      artistCounts.set(artist, (artistCounts.get(artist) ?? 0) + 1);
    }
    const topArtist = [...artistCounts.entries()].sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )[0];
    const noun = input.request.view === "tracks" ? "tracks" : "albums";
    const artistSummary = topArtist
      ? ` The most frequent artist in the inspected preview rows is ${topArtist[0]} (${topArtist[1]}).`
      : "";
    return {
      answer: `This filtered view contains ${preview.total.toLocaleString()} ${noun}.${artistSummary}`,
      view: input.request.view,
      matchingRows: preview.total,
      analysisCount: 2,
      namedRowsShared: 0,
      model: "gpt-5.6-luna",
      usage: {
        inputTokens: null,
        cachedInputTokens: null,
        outputTokens: null,
      },
    } satisfies AiCurrentViewAnswer;
  }

  return invoke<AiCurrentViewAnswer>("ask_current_view", { input });
}

export async function researchMusic(input: AiMusicResearchRequest) {
  if (!isTauriRuntime()) {
    const context = input.context.selectedLabel
      ? `${input.context.selectedLabel}${input.context.selectedSubtitle ? ` — ${input.context.selectedSubtitle}` : ""}`
      : "the wider music question";
    return {
      answer: [
        "## Preview research finding",
        "",
        `This is a **Markdown preview** about ${context}. In the desktop app, Luna can search the web and, when relevant, inspect a small bounded slice of the selected local album, artist, or genre.`,
        "",
        "- Web-supported music research",
        "- Bounded local-library context when requested",
        "- Exact local snapshots for later reopening",
        "",
        `> Your question: ${input.question.trim()}`,
      ].join("\n"),
      sources: [
        {
          title: "OpenAI web search documentation",
          url: "https://developers.openai.com/api/docs/guides/tools-web-search",
        },
      ],
      model: "gpt-5.6-luna",
      usage: {
        inputTokens: null,
        cachedInputTokens: null,
        outputTokens: null,
      },
      usedWebSearch: true,
      localInspectionCount: input.context.selectedEntityId ? 1 : 0,
    } satisfies AiMusicResearchAnswer;
  }

  return invoke<AiMusicResearchAnswer>("research_music", { input });
}

export async function analyzeLibrary(input: AiLibraryAnalysisRequest) {
  if (!isTauriRuntime()) {
    const albumTotal = mockStatistics.overview.albumCount;
    const unrated = mockStatistics.ratingProgress.unratedAlbums;
    const ratingCoverage = mockStatistics.healthScore.ratingCoverage * 100;
    const genre = mockStatistics.genreProgress[0];
    const lensSummary = {
      overview: `The preview library contains ${albumTotal.toLocaleString()} albums and ${mockStatistics.overview.trackCount.toLocaleString()} tracks.`,
      ratingBacklog: `${unrated.toLocaleString()} albums remain unrated, while track rating coverage is ${ratingCoverage.toFixed(1)}%.`,
      tasteProfile: `${mockStatistics.lovedTracks.lovedTracks.toLocaleString()} tracks are marked loved${genre ? `, with ${genre.genre} the largest preview genre` : ""}.`,
      catalogBalance: `${mockStatistics.libraryShape.mostRepresentedDecade ?? "The leading decade"}s is the most represented decade in the preview profile.`,
      metadataHealth: `The preview library health score is ${mockStatistics.healthScore.score.toFixed(1)}%.`,
    }[input.lens];
    return {
      lens: input.lens,
      headline: "A compact profile with a clear next step",
      summary: lensSummary,
      findings: [
        {
          title: "Rating coverage is the main opportunity",
          evidence: `${unrated.toLocaleString()} albums are unrated and track coverage is ${ratingCoverage.toFixed(1)}%.`,
          interpretation:
            "A focused rating pass would improve both completion and the quality of later taste comparisons.",
        },
        {
          title: "The catalog has a visible center of gravity",
          evidence: `${mockStatistics.libraryShape.mostRepresentedDecade ?? 1980}s contains ${mockStatistics.libraryShape.mostRepresentedDecadeAlbums.toLocaleString()} albums.`,
          interpretation:
            "Compare that decade with a smaller adjacent decade to distinguish collection size from preference.",
        },
      ],
      nextQuestions: [
        "Which genres contain the largest unrated backlog?",
        "How concentrated is the catalog by decade?",
      ],
      profileSections: ["overview", "ratingProgress"],
      aggregatePointsShared: 17,
      model: "gpt-5.6-luna",
      usage: {
        inputTokens: null,
        cachedInputTokens: null,
        outputTokens: null,
      },
    } satisfies AiLibraryAnalysis;
  }

  return invoke<AiLibraryAnalysis>("analyze_library", { input });
}

export async function listAiSnapshots(kind?: AiSnapshotKind) {
  if (!isTauriRuntime()) {
    return mockAiSnapshots.filter(
      (snapshot) => kind == null || snapshot.content.kind === kind,
    ) satisfies AiSnapshot[];
  }

  return invoke<AiSnapshot[]>("list_ai_snapshots", { kind: kind ?? null });
}

export async function saveAiSnapshot(input: SaveAiSnapshotRequest) {
  if (!isTauriRuntime()) {
    const nextId =
      mockAiSnapshots.reduce(
        (largest, snapshot) => Math.max(largest, snapshot.id),
        0,
      ) + 1;
    const saved = {
      id: nextId,
      title: input.title,
      content: input.content,
      libraryImportRunId: mockStatus.lastImport?.id ?? null,
      libraryImportedAt: mockStatus.lastImport?.completedAt ?? null,
      libraryAlbumCount: mockStatus.albumCount,
      libraryTrackCount: mockStatus.trackCount,
      createdAt: new Date().toISOString(),
    } satisfies AiSnapshot;
    setMockAiSnapshots([saved, ...mockAiSnapshots]);
    return saved;
  }

  return invoke<AiSnapshot>("save_ai_snapshot", { input });
}

export async function deleteAiSnapshot(id: number) {
  if (!isTauriRuntime()) {
    setMockAiSnapshots(
      mockAiSnapshots.filter((snapshot) => snapshot.id !== id),
    );
    return;
  }

  return invoke<void>("delete_ai_snapshot", { id });
}

export async function exportAiMarkdown(input: AiMarkdownExportRequest) {
  if (!isTauriRuntime()) {
    return finalizeExport({
      path: `C:\\Music Library\\exports\\music-library-ai-${input.title
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "research"}-preview.md`,
      format: "md",
      rowCount: input.markdown.split(/\r?\n/).length,
    } satisfies RawExportResult);
  }

  return finalizeExport(
    await invoke<RawExportResult>("export_ai_markdown", { input }),
  );
}

export async function buildPlaylist(input: AiPlaylistBuildRequest) {
  if (!isTauriRuntime()) {
    const request = input.sourceRequest
      ? normalizeBrowseRequestForClient({
          ...input.sourceRequest,
          view: "tracks",
          offset: 0,
        })
      : createRequest("tracks");
    request.view = "tracks";
    request.sort = { field: "trackRating", direction: "desc" };
    request.limit = 200;
    const sourceRows = input.sourceRequest
      ? (await searchLibrary(request)).rows
      : mockRows;
    const tracks = sourceRows
      .filter((row) => row.trackId != null)
      .map((row) => ({
        trackId: row.trackId!,
        albumId: row.albumId,
        album: row.album,
        albumArtist: row.albumArtistDisplay,
        displayArtist: row.displayArtist,
        title: row.title,
        genre: row.canonicalGenre,
        year: row.year,
        seconds: row.trackSeconds ?? 0,
        rating: row.normalizedRating,
        loved: row.love?.trim().toLowerCase() === "l",
        filePath: row.filePath,
        filename: row.filename,
      }));
    const prompt = input.prompt.trim();
    const strategy = /discover|surpris|deep cut/i.test(prompt)
      ? "discovery"
      : /random|shuffle/i.test(prompt)
        ? "random"
        : "variety";
    return {
      prompt,
      name: "Luna preview mix",
      description:
        "A varied local-library sequence shaped from the request, with repeat caps applied.",
      request,
      strategy,
      targetTrackCount: 12,
      targetMinutes: 45,
      maxTracksPerArtist: 2,
      maxTracksPerAlbum: 1,
      model: "gpt-5.6-luna",
      usage: {
        inputTokens: null,
        cachedInputTokens: null,
        outputTokens: null,
      },
      matchingTrackCount: tracks.length,
      candidateCount: tracks.length,
      totalSeconds: tracks.reduce((total, track) => total + track.seconds, 0),
      tracks,
    } satisfies AiPlaylist;
  }

  return invoke<AiPlaylist>("build_playlist", { input });
}

export async function listSavedPlaylists() {
  if (!isTauriRuntime()) {
    return mockSavedPlaylists;
  }
  return invoke<SavedPlaylist[]>("list_saved_playlists");
}

export async function savePlaylist(input: SavePlaylistRequest) {
  if (!isTauriRuntime()) {
    const now = new Date().toISOString();
    const existing = input.id == null
      ? null
      : mockSavedPlaylists.find((playlist) => playlist.id === input.id) ?? null;
    const saved = {
      id:
        existing?.id ??
        mockSavedPlaylists.reduce(
          (largest, playlist) => Math.max(largest, playlist.id),
          0,
        ) + 1,
      name: input.name.trim(),
      playlist: input.playlist,
      libraryImportRunId: mockStatus.lastImport?.id ?? null,
      libraryImportedAt: mockStatus.lastImport?.completedAt ?? null,
      libraryAlbumCount: mockStatus.albumCount,
      libraryTrackCount: mockStatus.trackCount,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    } satisfies SavedPlaylist;
    mockSavedPlaylists = [
      saved,
      ...mockSavedPlaylists.filter((playlist) => playlist.id !== saved.id),
    ];
    return saved;
  }
  return invoke<SavedPlaylist>("save_playlist", { input });
}

export async function deleteSavedPlaylist(id: number) {
  if (!isTauriRuntime()) {
    mockSavedPlaylists = mockSavedPlaylists.filter(
      (playlist) => playlist.id !== id,
    );
    return;
  }
  return invoke<void>("delete_saved_playlist", { id });
}

const previewExternalCatalog: Record<
  ExternalDiscoveryEntity,
  Array<[string, string, string]>
> = {
  artist: [
    ["Porcupine Tree", "On the Sunday of Life…", "b9d134dd-2e7c-4ccc-9a26-81cb9c8d4d7a"],
    ["The Cardigans", "Emmerdale", "0a03e7c3-63e6-4db2-902c-438c1f7241c0"],
    ["Kyuss", "Blues for the Red Sun", "bd53f61e-ade8-4151-9a31-8b8b7d41a1c3"],
    ["Morphine", "Good", "13e28215-eae1-4bd4-b7e7-6b4b6b9e81cb"],
    ["The Pharcyde", "Bizarre Ride II the Pharcyde", "647221d0-f45a-4238-8d16-320f1c2f9b46"],
    ["Luna", "Lunapark", "44aa8475-aba2-480b-8a89-a7c9339d1bf8"],
    ["Pavement", "Slanted and Enchanted", "bdea8a47-0c90-4a9a-95c6-a790c9f7bf45"],
    ["Stereolab", "Peng!", "98d2f0ec-3c08-4f52-ac0c-2243b2b0c31a"],
    ["Helmet", "Meantime", "e2b2c4a8-9b9a-44d3-9d4b-97a6a274710b"],
    ["Spiritualized", "Lazer Guided Melodies", "c1fda6fa-2a76-4d6c-bd0c-0e53285c1718"],
  ],
  album: [
    ["Images and Words", "Dream Theater", "8b2acb43-832f-34f5-b372-01b37d368636"],
    ["Automatic for the People", "R.E.M.", "3402eece-7c5c-354b-bf87-a8108912f9a7"],
    ["Copper Blue", "Sugar", "4a51cbcf-878e-3f09-89a3-3e7a6e80623a"],
    ["Dirt", "Alice in Chains", "82822e11-4cb6-39cc-8c4e-791923d62561"],
    ["Dry", "PJ Harvey", "00465433-411a-33e1-aecb-4572f7b14848"],
    ["Selected Ambient Works 85–92", "Aphex Twin", "fdefee02-3886-3b28-b1fd-22664d17b5ed"],
    ["Meantime", "Helmet", "812d8919-04a8-3ae7-a0e4-8afc8157fe2c"],
    ["The Chronic", "Dr. Dre", "0d1868bd-3b30-33c4-8664-55826459c3f9"],
    ["Little Earthquakes", "Tori Amos", "88b6c5e7-4e6c-35b8-a029-6941d15a5535"],
    ["Lazer Guided Melodies", "Spiritualized", "152815ca-8ce5-3e54-9155-0fa16f7d20d1"],
  ],
  song: [
    ["Friday I'm in Love", "The Cure", "083721bb-1f61-4da0-a4f4-baa8d758b516"],
    ["Nuthin' but a ‘G’ Thang", "Dr. Dre", "1d557f61-5f77-499c-bc28-b86f9b03c97c"],
    ["Would?", "Alice in Chains", "8488d5e4-30f2-4f38-8dd8-89a33a2095fb"],
    ["Connected", "Stereo MC's", "c74215e7-7bb5-42e0-9456-f5a05122f2c7"],
    ["Drive", "R.E.M.", "6d4d4032-f476-4e33-aecf-fc51cfe17da7"],
    ["Killing in the Name", "Rage Against the Machine", "c0727b09-0f08-4a42-8aa4-e511e08e6b34"],
    ["Silent Lucidity", "Queensrÿche", "3be10621-7df9-4ecb-8b0b-391577fcf40b"],
    ["Motorcycle Emptiness", "Manic Street Preachers", "d54e2b7e-270d-4e13-9b4a-88448f05a5ad"],
    ["Human Behaviour", "Björk", "485778d2-5edb-4b5d-bf8e-037b979bf8fd"],
    ["Creep", "Radiohead", "ccfdd180-22e5-4dd2-a739-907a40055a27"],
  ],
};

function previewDiscoveryEntity(prompt: string): ExternalDiscoveryEntity {
  if (/\b(song|songs|track|tracks|recording|recordings)\b/i.test(prompt)) {
    return "song";
  }
  if (/\b(album|albums|record|records|lp|lps)\b/i.test(prompt)) {
    return "album";
  }
  return "artist";
}

function previewDiscoveryCount(prompt: string) {
  const match = prompt.match(/\b(\d{1,2})\b/);
  const value = match ? Number(match[1]) : 5;
  return Math.min(25, Math.max(1, value));
}

function previewDiscoveryYears(prompt: string) {
  const exactYear = Number(prompt.match(/\b(?:1\d|20)\d{2}\b/)?.[0] ?? 0);
  if (exactYear) return { year: exactYear, yearFrom: 0, yearTo: 0 };

  const longDecade = Number(prompt.match(/\b((?:1\d|20)\d0)['’]?s\b/i)?.[1] ?? 0);
  const shortDecade = Number(prompt.match(/(?:^|[^\d])['’]?(\d{2})['’]?s\b/i)?.[1] ?? 0);
  const decade = longDecade || (shortDecade ? (shortDecade <= 20 ? 2000 : 1900) + shortDecade : 0);
  return decade
    ? { year: 0, yearFrom: decade, yearTo: decade + 9 }
    : { year: 0, yearFrom: 0, yearTo: 0 };
}

export async function discoverOutsideLibrary(input: { prompt: string }) {
  if (!isTauriRuntime()) {
    const prompt = input.prompt.trim();
    const entity = previewDiscoveryEntity(prompt);
    const count = previewDiscoveryCount(prompt);
    const { year, yearFrom, yearTo } = previewDiscoveryYears(prompt);
    const formedYear =
      entity === "artist" && /\b(formed|founded|started)\b/i.test(prompt);
    const entityLabel = entity === "song" ? "songs" : `${entity}s`;
    const rows = previewExternalCatalog[entity].slice(0, count);
    const path = entity === "album" ? "release-group" : entity === "song" ? "recording" : "artist";
    const items = rows.map(([title, artistOrAnchor, id], index) => ({
      id,
      entity,
      title,
      artist: entity === "artist" ? title : artistOrAnchor,
      anchor: entity === "artist" ? artistOrAnchor : null,
      year: year || (yearFrom ? yearFrom + (index % (yearTo - yearFrom + 1)) : 1992),
      country: null,
      itemType: entity === "artist" ? "Group" : entity === "album" ? "Album" : "Recording",
      tags: [],
      score: 100,
      evidence:
        entity === "artist"
          ? `MusicBrainz verifies the release “${artistOrAnchor}” in ${year || (yearFrom ? yearFrom + index : 1992)}.`
          : `MusicBrainz verifies this ${entity}'s first release in ${year || (yearFrom ? yearFrom + index : 1992)}.`,
      url: `https://musicbrainz.org/${path}/${id}`,
    })) satisfies ExternalDiscoveryItem[];
    const title = `${entityLabel[0].toUpperCase()}${entityLabel.slice(1)} outside my library`;
    return {
      prompt,
      title,
      summary: `${count} verified ${entityLabel}${year ? ` tied to ${year}` : yearFrom ? ` from ${yearFrom}–${yearTo}` : ""}, excluding local-library matches.`,
      plan: {
        prompt,
        entity,
        count,
        year,
        yearFrom,
        yearTo,
        yearMeaning: formedYear ? "formedYear" : "releaseYear",
        genres: /\baor\b/i.test(prompt) ? ["AOR"] : [],
        countries: [],
        keywords: "",
        title,
        summary: `${count} verified ${entityLabel} outside the local library.`,
        model: "gpt-5.6-luna",
        usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null },
      },
      items,
      source: "MusicBrainz",
      fetchedAt: new Date().toISOString(),
      catalogCandidateCount: Math.min(100, Math.max(25, count * 12)),
      excludedOwnedCount: 3,
      limitations: rows.length < count
        ? [`MusicBrainz returned ${rows.length} unowned results from the bounded candidate set, fewer than the requested ${count}.`]
        : [],
    } satisfies ExternalDiscoveryResponse;
  }
  return invoke<ExternalDiscoveryResponse>("discover_outside_library", { input });
}

export async function listSavedExternalDiscoveries() {
  if (!isTauriRuntime()) return mockSavedExternalDiscoveries;
  return invoke<SavedExternalDiscovery[]>("list_saved_external_discoveries");
}

export async function saveExternalDiscovery(input: SaveExternalDiscoveryRequest) {
  if (!isTauriRuntime()) {
    const now = new Date().toISOString();
    const existing = input.id == null
      ? null
      : mockSavedExternalDiscoveries.find((saved) => saved.id === input.id) ?? null;
    const saved = {
      id: existing?.id ?? mockSavedExternalDiscoveries.reduce(
        (largest, entry) => Math.max(largest, entry.id),
        0,
      ) + 1,
      name: input.name.trim(),
      response: input.response,
      libraryImportRunId: mockStatus.lastImport?.id ?? null,
      libraryImportedAt: mockStatus.lastImport?.completedAt ?? null,
      libraryAlbumCount: mockStatus.albumCount,
      libraryTrackCount: mockStatus.trackCount,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    } satisfies SavedExternalDiscovery;
    mockSavedExternalDiscoveries = [
      saved,
      ...mockSavedExternalDiscoveries.filter((entry) => entry.id !== saved.id),
    ];
    return saved;
  }
  return invoke<SavedExternalDiscovery>("save_external_discovery", { input });
}

export async function deleteSavedExternalDiscovery(id: number) {
  if (!isTauriRuntime()) {
    mockSavedExternalDiscoveries = mockSavedExternalDiscoveries.filter(
      (saved) => saved.id !== id,
    );
    return;
  }
  return invoke<void>("delete_saved_external_discovery", { id });
}

export async function listWishList() {
  if (!isTauriRuntime()) {
    return {
      items: mockWishListItems,
      autoRemovedCount: 0,
    } satisfies WishListResponse;
  }
  return invoke<WishListResponse>("list_wish_list");
}

export async function getLibraryCompletion(input: LibraryCompletionRequest | null = null) {
  if (!isTauriRuntime()) {
    const decidedCandidates = mockLibraryCompletionCandidates.map((candidate) => {
      const decision = mockLibraryCompletionDecisions.get(candidate.id);
      const verification = mockLibraryCompletionVerifications.get(candidate.id);
      const cover = mockLibraryCompletionCovers.get(candidate.id);
      return {
        ...candidate,
        status: decision?.status ?? candidate.status,
        wishListItemId: decision?.wishListItemId ?? candidate.wishListItemId,
        musicbrainzId:
          decision?.musicbrainzId ?? verification?.musicbrainzId ?? candidate.musicbrainzId,
        musicbrainzUrl:
          decision?.musicbrainzUrl ?? verification?.musicbrainzUrl ?? candidate.musicbrainzUrl,
        verificationStatus: verification?.state ?? candidate.verificationStatus,
        verificationProvider:
          verification?.provider ?? candidate.verificationProvider,
        verificationMessage: verification?.message ?? candidate.verificationMessage,
        verificationCheckedAt: verification?.updatedAt ?? candidate.verificationCheckedAt,
        musicbrainzVerificationStatus:
          verification?.musicbrainzVerificationStatus ?? candidate.musicbrainzVerificationStatus,
        musicbrainzVerificationMessage:
          verification?.musicbrainzVerificationMessage ?? candidate.musicbrainzVerificationMessage,
        discogsVerificationStatus:
          verification?.discogsVerificationStatus ?? candidate.discogsVerificationStatus,
        discogsVerificationMessage:
          verification?.discogsVerificationMessage ?? candidate.discogsVerificationMessage,
        discogsMasterId: verification?.discogsMasterId ?? candidate.discogsMasterId,
        discogsUrl: verification?.discogsUrl ?? candidate.discogsUrl,
        coverStatus: cover?.state ?? candidate.coverStatus,
        coverProvider: cover?.provider ?? candidate.coverProvider,
        coverMessage: cover?.message ?? candidate.coverMessage,
        coverCheckedAt: cover?.checkedAt ?? candidate.coverCheckedAt,
      };
    });
    const candidates = decidedCandidates.filter((candidate) =>
      !input || candidate.evidence.some(
        (evidence) =>
          (!input.source || evidence.source === input.source) &&
          (input.decade == null || Math.floor(evidence.firstYear / 10) * 10 === input.decade) &&
          (input.yearFrom == null || evidence.lastYear >= input.yearFrom) &&
          (input.yearTo == null || evidence.firstYear <= input.yearTo),
      ),
    );
    return {
      generatedAt: new Date().toISOString(),
      totalChartAlbums: 2_164,
      totalCandidates: 1_248,
      returnedCandidates: candidates.length,
      truncated: input == null,
      candidates,
      atlas: mockLibraryCompletionAtlas,
    } satisfies LibraryCompletionResponse;
  }
  return invoke<LibraryCompletionResponse>("get_library_completion", { input });
}

function advanceMockLibraryCompletionVerification() {
  const batch = mockLibraryCompletionVerificationStatus.batch;
  if (!batch || batch.state !== "running") return;
  const now = new Date().toISOString();
  let items = mockLibraryCompletionVerificationStatus.recentItems.map((item) => {
    if (item.state !== "checking") return item;
    const useDiscogsFallback = item.candidateId.startsWith("rem\u001f");
    const verified = {
      ...item,
      state: "verified" as const,
      provider: useDiscogsFallback ? "discogs" as const : "musicbrainz" as const,
      message: useDiscogsFallback
        ? "Discogs confirmed one exact master with an accepted key release classified Album and no non-studio markers."
        : "MusicBrainz confirmed a primary Album release group without secondary types and with an official release.",
      musicbrainzId: useDiscogsFallback ? null : `preview-${encodeURIComponent(item.candidateId)}`,
      musicbrainzUrl: useDiscogsFallback ? null : "https://musicbrainz.org/release-group/preview-release-group",
      musicbrainzVerificationStatus: useDiscogsFallback ? "noMatch" as const : "verified" as const,
      musicbrainzVerificationMessage: useDiscogsFallback
        ? "MusicBrainz returned no exact artist and primary Album title match."
        : "MusicBrainz confirmed a primary Album release group without secondary types and with an official release.",
      discogsVerificationStatus: useDiscogsFallback ? "verified" as const : null,
      discogsVerificationMessage: useDiscogsFallback
        ? "Discogs confirmed one exact master with an accepted key release classified Album and no non-studio markers."
        : null,
      discogsMasterId: useDiscogsFallback ? "55555" : null,
      discogsUrl: useDiscogsFallback ? "https://www.discogs.com/master/55555" : null,
      updatedAt: now,
    };
    mockLibraryCompletionVerifications.set(item.candidateId, verified);
    return verified;
  });
  const nextIndex = items.findIndex((item) => item.state === "queued");
  if (nextIndex >= 0) {
    items = items.map((item, index) =>
      index === nextIndex ? { ...item, state: "checking" as const, updatedAt: now } : item,
    );
  }
  const queuedCount = items.filter((item) => item.state === "queued").length;
  const checkingCount = items.filter((item) => item.state === "checking").length;
  const verifiedCount = items.filter((item) => item.state === "verified").length;
  const noMatchCount = items.filter((item) => item.state === "noMatch").length;
  const ambiguousCount = items.filter((item) => item.state === "ambiguous").length;
  const failedCount = items.filter((item) => item.state === "failed").length;
  const completed = queuedCount + checkingCount === 0;
  mockLibraryCompletionVerificationStatus = {
    batch: {
      ...batch,
      state: completed ? "completed" : "running",
      queuedCount,
      checkingCount,
      verifiedCount,
      discogsVerifiedCount: items.filter(
        (item) => item.state === "verified" && item.provider === "discogs",
      ).length,
      noMatchCount,
      ambiguousCount,
      failedCount,
      completedCount: batch.totalCount - queuedCount - checkingCount,
      estimatedSecondsRemaining: (queuedCount + checkingCount) * 2,
      updatedAt: now,
      completedAt: completed ? now : null,
    },
    recentItems: items,
  };
}

export async function getLibraryCompletionVerificationStatus() {
  if (!isTauriRuntime()) {
    advanceMockLibraryCompletionVerification();
    return mockLibraryCompletionVerificationStatus;
  }
  return invoke<LibraryCompletionVerificationStatus>(
    "get_library_completion_verification_status",
  );
}

export async function getLibraryCompletionCoverDataUrl(candidateId: string) {
  if (!isTauriRuntime()) {
    return mockLibraryCompletionCovers.get(candidateId)?.dataUrl ?? null;
  }
  return invoke<string | null>("get_library_completion_cover_data_url", {
    candidateId,
  });
}

export async function enrichLibraryCompletionCover(candidateId: string) {
  if (!isTauriRuntime()) {
    const verification = mockLibraryCompletionVerifications.get(candidateId);
    if (!verification || verification.state !== "verified") {
      throw new Error("Verify this album before looking for cover artwork.");
    }
    const provider = verification.provider === "discogs" ? "discogs" : "musicbrainz";
    const result = {
      candidateId,
      state: "available",
      provider,
      message: provider === "discogs"
        ? "Discogs master artwork is cached locally."
        : "Cover Art Archive artwork is cached locally.",
      hasCover: true,
      checkedAt: new Date().toISOString(),
      dataUrl: mockTimelineCoverUrls[0],
    } satisfies LibraryCompletionCoverEnrichment & { dataUrl: string | null };
    mockLibraryCompletionCovers.set(candidateId, result);
    return result;
  }
  return invoke<LibraryCompletionCoverEnrichment>(
    "enrich_library_completion_cover",
    { candidateId },
  );
}

export async function startLibraryCompletionVerification(
  input: StartLibraryCompletionVerificationRequest,
) {
  if (!isTauriRuntime()) {
    if (
      mockLibraryCompletionVerificationStatus.batch &&
      mockLibraryCompletionVerificationStatus.batch.state !== "completed"
    ) {
      throw new Error("Finish the current verification batch before starting another one.");
    }
    const selectedIds = new Set(input.candidateIds);
    const candidates = mockLibraryCompletionCandidates.filter((candidate) => {
      if (
        (input.scope === "campaign" && candidate.status !== "candidate") ||
        (input.scope !== "campaign" && candidate.status === "notForMe")
      ) return false;
      if (mockLibraryCompletionVerifications.has(candidate.id)) return false;
      if (input.scope === "campaign") {
        return candidate.evidence.some(
          (evidence) =>
            evidence.source === input.source &&
            Math.floor(evidence.firstYear / 10) * 10 === input.decade,
        );
      }
      return selectedIds.has(candidate.id);
    });
    if (candidates.length === 0) {
      throw new Error("Every album in this scope is already checked or no longer open for verification.");
    }
    const now = new Date().toISOString();
    const recentItems = candidates.map((candidate, index) => ({
      candidateId: candidate.id,
      artist: candidate.artist,
      title: candidate.title,
      state: index === 0 ? "checking" as const : "queued" as const,
      provider: "musicbrainz" as const,
      message: null,
      musicbrainzId: null,
      musicbrainzUrl: null,
      musicbrainzVerificationStatus: null,
      musicbrainzVerificationMessage: null,
      discogsVerificationStatus: null,
      discogsVerificationMessage: null,
      discogsMasterId: null,
      discogsUrl: null,
      updatedAt: now,
    }));
    const label = input.label ?? (
      input.scope === "campaign"
        ? `${input.source === "billboard" ? "Billboard 200" : input.source === "officialUk" ? "Official UK Albums" : "VG Lista"} · ${input.decade}s`
        : input.scope === "candidate"
          ? `${candidates[0].artist} — ${candidates[0].title}`
          : `Selected albums (${candidates.length})`
    );
    mockLibraryCompletionVerificationStatus = {
      batch: {
        id: mockLibraryCompletionVerificationSequence++,
        label,
        source: input.source,
        decade: input.decade,
        state: "running",
        totalCount: candidates.length,
        queuedCount: Math.max(0, candidates.length - 1),
        checkingCount: 1,
        verifiedCount: 0,
        discogsVerifiedCount: 0,
        noMatchCount: 0,
        ambiguousCount: 0,
        failedCount: 0,
        cachedCount: 0,
        completedCount: 0,
        estimatedSecondsRemaining: candidates.length * 2,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      },
      recentItems,
    };
    return mockLibraryCompletionVerificationStatus;
  }
  return invoke<LibraryCompletionVerificationStatus>(
    "start_library_completion_verification",
    { input },
  );
}

export async function setLibraryCompletionVerificationState(
  input: SetLibraryCompletionVerificationStateRequest,
) {
  if (!isTauriRuntime()) {
    const batch = mockLibraryCompletionVerificationStatus.batch;
    if (!batch || batch.id !== input.batchId || batch.state === "completed") {
      throw new Error("The selected verification batch is already complete or no longer exists.");
    }
    mockLibraryCompletionVerificationStatus = {
      ...mockLibraryCompletionVerificationStatus,
      batch: { ...batch, state: input.state, updatedAt: new Date().toISOString() },
    };
    return mockLibraryCompletionVerificationStatus;
  }
  return invoke<LibraryCompletionVerificationStatus>(
    "set_library_completion_verification_state",
    { input },
  );
}

export async function retryLibraryCompletionVerificationFailures(batchId: number) {
  if (!isTauriRuntime()) {
    const batch = mockLibraryCompletionVerificationStatus.batch;
    if (!batch || batch.id !== batchId || batch.failedCount === 0) {
      throw new Error("This verification batch has no failed checks to retry.");
    }
    const now = new Date().toISOString();
    const recentItems = mockLibraryCompletionVerificationStatus.recentItems.map((item) =>
      item.state === "failed"
        ? {
            ...item,
            state: "queued" as const,
            provider: "musicbrainz" as const,
            message: null,
            musicbrainzVerificationStatus: null,
            musicbrainzVerificationMessage: null,
            discogsVerificationStatus: null,
            discogsVerificationMessage: null,
            discogsMasterId: null,
            discogsUrl: null,
            updatedAt: now,
          }
        : item,
    );
    mockLibraryCompletionVerificationStatus = {
      batch: {
        ...batch,
        state: "running",
        queuedCount: batch.queuedCount + batch.failedCount,
        failedCount: 0,
        completedCount: batch.completedCount - batch.failedCount,
        completedAt: null,
        updatedAt: now,
      },
      recentItems,
    };
    return mockLibraryCompletionVerificationStatus;
  }
  return invoke<LibraryCompletionVerificationStatus>(
    "retry_library_completion_verification_failures",
    { batchId },
  );
}

export async function setLibraryCompletionDecision(
  input: SetLibraryCompletionDecisionRequest,
) {
  if (!isTauriRuntime()) {
    if (input.status === "candidate") {
      mockLibraryCompletionDecisions.delete(input.candidateId);
      return {
        candidateId: input.candidateId,
        status: input.status,
        wishListItemId: null,
        musicbrainzId: input.musicbrainzId ?? null,
        musicbrainzUrl: input.musicbrainzUrl ?? null,
        updatedAt: new Date().toISOString(),
      } satisfies LibraryCompletionDecision;
    }

    let wishListItemId = input.wishListItemId ?? null;
    if (input.status === "wanted" && wishListItemId == null) {
      const item = await addWishListItem({
        entity: "album",
        title: input.title,
        artist: input.artist,
        year: input.chartYear,
        musicbrainzId: input.musicbrainzId ?? null,
        musicbrainzUrl: input.musicbrainzUrl ?? null,
        source: `Library Completion · ${input.source}`,
      });
      wishListItemId = item.id;
    }

    const decision = {
      candidateId: input.candidateId,
      status: input.status,
      wishListItemId,
      musicbrainzId: input.musicbrainzId ?? null,
      musicbrainzUrl: input.musicbrainzUrl ?? null,
      updatedAt: new Date().toISOString(),
    } satisfies LibraryCompletionDecision;
    mockLibraryCompletionDecisions.set(input.candidateId, decision);
    if (input.musicbrainzId) {
      mockLibraryCompletionVerifications.set(input.candidateId, {
        candidateId: input.candidateId,
        artist: input.artist,
        title: input.title,
        state: "verified",
        provider: "musicbrainz",
        message: "MusicBrainz confirmed an official studio-album release group.",
        musicbrainzId: input.musicbrainzId,
        musicbrainzUrl: input.musicbrainzUrl ?? null,
        musicbrainzVerificationStatus: "verified",
        musicbrainzVerificationMessage:
          "MusicBrainz confirmed an official studio-album release group.",
        discogsVerificationStatus: null,
        discogsVerificationMessage: null,
        discogsMasterId: null,
        discogsUrl: null,
        updatedAt: decision.updatedAt,
      });
    }
    return decision;
  }
  return invoke<LibraryCompletionDecision>(
    "set_library_completion_decision",
    { input },
  );
}

export async function getLibraryCompletionArtists(
  input: LibraryCompletionArtistRequest | null = null,
) {
  if (!isTauriRuntime()) {
    const decidedCandidates = mockLibraryCompletionArtistCandidates.map((candidate) => {
      const verification = mockLibraryCompletionArtistVerifications.get(candidate.id);
      const decision = mockLibraryCompletionArtistDecisions.get(candidate.id);
      return {
        ...(verification ?? candidate),
        status: decision?.status ?? verification?.status ?? candidate.status,
        wishListItemId:
          decision?.wishListItemId ?? verification?.wishListItemId ?? candidate.wishListItemId,
      };
    });
    const candidates = decidedCandidates.filter((candidate) =>
      !input || candidate.evidence.some((evidence) =>
        (!input.source || evidence.source === input.source) &&
        (input.yearFrom == null || evidence.lastYear >= input.yearFrom) &&
        (input.yearTo == null || evidence.firstYear <= input.yearTo),
      ),
    );
    return {
      generatedAt: new Date().toISOString(),
      totalChartArtists: 3_862,
      ownedArtistCount: 2_174,
      totalCandidates: 1_688,
      returnedCandidates: candidates.length,
      truncated: true,
      candidates,
    } satisfies LibraryCompletionArtistResponse;
  }
  return invoke<LibraryCompletionArtistResponse>("get_library_completion_artists", { input });
}

function verifiedMockArtist(candidate: LibraryCompletionArtistCandidate) {
  const now = new Date().toISOString();
  const officialAlbumCount = candidate.id === "talk talk" ? 5 : candidate.id === "grace jones" ? 10 : 4;
  return {
    ...candidate,
    verificationStatus: "verified" as const,
    verificationMessage: `MusicBrainz confirmed ${officialAlbumCount} official studio albums; Discogs independently corroborated the artist.`,
    verificationCheckedAt: now,
    musicbrainzVerificationStatus: "verified" as const,
    musicbrainzVerificationMessage: `MusicBrainz confirmed ${officialAlbumCount} official studio albums for this artist.`,
    musicbrainzId: "11111111-1111-4111-8111-111111111111",
    musicbrainzUrl: "https://musicbrainz.org/artist/11111111-1111-4111-8111-111111111111",
    officialAlbumCount,
    discogsVerificationStatus: "verified" as const,
    discogsVerificationMessage: "Discogs corroborated this artist with an accepted studio-album master.",
    discogsMasterId: "424242",
    discogsUrl: "https://www.discogs.com/master/424242",
    discogsStudioAlbumTitle: candidate.id === "talk talk" ? "The Colour of Spring" : "Preview Studio Album",
  } satisfies LibraryCompletionArtistCandidate;
}

function advanceMockLibraryCompletionArtistVerification() {
  const batch = mockLibraryCompletionArtistVerificationStatus.batch;
  if (!batch || batch.state !== "running") return;
  const now = new Date().toISOString();
  let items = mockLibraryCompletionArtistVerificationStatus.recentItems.map((item) => {
    if (item.state !== "checking") return item;
    const candidate = mockLibraryCompletionArtistCandidates.find(
      (value) => value.id === item.artistId,
    );
    if (candidate) mockLibraryCompletionArtistVerifications.set(item.artistId, verifiedMockArtist(candidate));
    return {
      ...item,
      state: "verified" as const,
      provider: "discogs" as const,
      message: "MusicBrainz confirmed official studio albums; Discogs corroborated the artist.",
      officialAlbumCount: candidate?.id === "talk talk" ? 5 : 4,
      updatedAt: now,
    };
  });
  const nextIndex = items.findIndex((item) => item.state === "queued");
  if (nextIndex >= 0) {
    items = items.map((item, index) =>
      index === nextIndex
        ? { ...item, state: "checking" as const, provider: "musicbrainz" as const, updatedAt: now }
        : item,
    );
  }
  const queuedCount = items.filter((item) => item.state === "queued").length;
  const checkingCount = items.filter((item) => item.state === "checking").length;
  const completed = queuedCount + checkingCount === 0;
  mockLibraryCompletionArtistVerificationStatus = {
    batch: {
      ...batch,
      state: completed ? "completed" : "running",
      queuedCount,
      checkingCount,
      verifiedCount: items.filter((item) => item.state === "verified").length,
      noMatchCount: items.filter((item) => item.state === "noMatch").length,
      ambiguousCount: items.filter((item) => item.state === "ambiguous").length,
      failedCount: items.filter((item) => item.state === "failed").length,
      completedCount: batch.totalCount - queuedCount - checkingCount,
      estimatedSecondsRemaining: (queuedCount + checkingCount) * 2,
      updatedAt: now,
      completedAt: completed ? now : null,
    },
    recentItems: items,
  };
}

export async function getLibraryCompletionArtistVerificationStatus() {
  if (!isTauriRuntime()) {
    advanceMockLibraryCompletionArtistVerification();
    return mockLibraryCompletionArtistVerificationStatus;
  }
  return invoke<LibraryCompletionArtistVerificationStatus>(
    "get_library_completion_artist_verification_status",
  );
}

export async function startLibraryCompletionArtistVerification(
  input: StartLibraryCompletionArtistVerificationRequest,
) {
  if (!isTauriRuntime()) {
    const current = mockLibraryCompletionArtistVerificationStatus.batch;
    if (current && current.state !== "completed") {
      throw new Error("Finish or pause the current artist verification run before starting another one.");
    }
    const selected = new Set(input.artistIds);
    const candidates = mockLibraryCompletionArtistCandidates.filter(
      (candidate) =>
        selected.has(candidate.id) &&
        candidate.status === "candidate" &&
        (candidate.verificationStatus === "unverified" || candidate.verificationStatus === "failed"),
    );
    if (candidates.length === 0) {
      throw new Error("Every selected artist is already checked or no longer open for verification.");
    }
    const now = new Date().toISOString();
    const recentItems = candidates.map((candidate, index) => ({
      artistId: candidate.id,
      artist: candidate.artist,
      state: index === 0 ? "checking" as const : "queued" as const,
      provider: "musicbrainz" as const,
      message: null,
      officialAlbumCount: 0,
      updatedAt: now,
    }));
    mockLibraryCompletionArtistVerificationStatus = {
      batch: {
        id: mockLibraryCompletionArtistVerificationSequence++,
        label: input.label ?? (candidates.length === 1 ? candidates[0].artist : `${candidates.length} chart artists`),
        state: "running",
        totalCount: candidates.length,
        queuedCount: Math.max(0, candidates.length - 1),
        checkingCount: 1,
        verifiedCount: 0,
        noMatchCount: 0,
        ambiguousCount: 0,
        failedCount: 0,
        completedCount: 0,
        estimatedSecondsRemaining: candidates.length * 2,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      },
      recentItems,
    };
    return mockLibraryCompletionArtistVerificationStatus;
  }
  return invoke<LibraryCompletionArtistVerificationStatus>(
    "start_library_completion_artist_verification",
    { input },
  );
}

export async function setLibraryCompletionArtistVerificationState(
  input: SetLibraryCompletionArtistVerificationStateRequest,
) {
  if (!isTauriRuntime()) {
    const batch = mockLibraryCompletionArtistVerificationStatus.batch;
    if (!batch || batch.id !== input.batchId || batch.state === "completed") {
      throw new Error("The selected artist verification run is already complete or no longer exists.");
    }
    mockLibraryCompletionArtistVerificationStatus = {
      ...mockLibraryCompletionArtistVerificationStatus,
      batch: { ...batch, state: input.state, updatedAt: new Date().toISOString() },
    };
    return mockLibraryCompletionArtistVerificationStatus;
  }
  return invoke<LibraryCompletionArtistVerificationStatus>(
    "set_library_completion_artist_verification_state",
    { input },
  );
}

export async function retryLibraryCompletionArtistVerificationFailures(batchId: number) {
  if (!isTauriRuntime()) {
    const batch = mockLibraryCompletionArtistVerificationStatus.batch;
    if (!batch || batch.failedCount === 0) {
      throw new Error("This artist verification run has no failed checks to retry.");
    }
    return mockLibraryCompletionArtistVerificationStatus;
  }
  return invoke<LibraryCompletionArtistVerificationStatus>(
    "retry_library_completion_artist_verification_failures",
    { batchId },
  );
}

export async function confirmLibraryCompletionArtistMatch(
  input: ConfirmLibraryCompletionArtistMatchRequest,
) {
  if (!isTauriRuntime()) {
    const candidate = mockLibraryCompletionArtistCandidates.find(
      (value) => value.id === input.artistId,
    );
    if (!candidate) throw new Error("The selected chart artist is no longer missing from the library.");
    const verified = {
      ...verifiedMockArtist(candidate),
      musicbrainzId: input.candidate.musicbrainzId,
      musicbrainzUrl: input.candidate.musicbrainzUrl,
    };
    mockLibraryCompletionArtistVerifications.set(candidate.id, verified);
    return verified;
  }
  return invoke<LibraryCompletionArtistCandidate>(
    "confirm_library_completion_artist_match",
    { input },
  );
}

export async function setLibraryCompletionArtistDecision(
  input: SetLibraryCompletionArtistDecisionRequest,
) {
  if (!isTauriRuntime()) {
    if (input.status === "candidate") {
      mockLibraryCompletionArtistDecisions.delete(input.artistId);
      return {
        artistId: input.artistId,
        status: input.status,
        wishListItemId: null,
        missingAlbumCount: null,
        message: "Returned this artist to the discovery queue.",
        updatedAt: new Date().toISOString(),
      } satisfies LibraryCompletionArtistDecision;
    }
    const verification = mockLibraryCompletionArtistVerifications.get(input.artistId);
    let wishListItemId: number | null = null;
    let missingAlbumCount: number | null = null;
    let message = input.status === "needsReview"
      ? "Saved this chart artist for manual review."
      : "Excluded this chart artist from the active discovery queue.";
    if (input.status === "wanted") {
      if (!verification || verification.verificationStatus !== "verified") {
        throw new Error("Only artists with confirmed official studio albums can be added to the Wish List.");
      }
      const existing = mockWishListItems.find(
        (item) => item.entity === "artist" && item.title.toLocaleLowerCase() === input.artist.toLocaleLowerCase(),
      );
      const count = verification.officialAlbumCount;
      const item = existing ?? {
        id: mockWishListItems.reduce((largest, entry) => Math.max(largest, entry.id), 0) + 1,
        entity: "artist" as const,
        title: input.artist,
        artist: "",
        year: null,
        musicbrainzId: verification.musicbrainzId,
        musicbrainzUrl: verification.musicbrainzUrl,
        source: "Library Completion · Chart artist discovery",
        createdAt: new Date().toISOString(),
        downloadedDeezerAlbumId: null,
        downloadedPath: null,
        downloadedAt: null,
        artistAlbumSummary: {
          officialAlbumCount: count,
          ownedAlbumCount: 0,
          missingAlbumCount: count,
          missingAlbums: Array.from({ length: count }, (_, index) => ({
            releaseGroupId: `33333333-3333-4333-8333-${String(index + 1).padStart(12, "0")}`,
            title: `Official studio album ${index + 1}`,
            year: 1982 + index * 2,
            musicbrainzUrl: `https://musicbrainz.org/release-group/33333333-3333-4333-8333-${String(index + 1).padStart(12, "0")}`,
          })),
          updatedAt: new Date().toISOString(),
        },
      } satisfies WishListItem;
      if (!existing) mockWishListItems = [item, ...mockWishListItems];
      wishListItemId = item.id;
      missingAlbumCount = count;
      message = existing
        ? `${input.artist} is already being tracked with ${count} albums missing.`
        : `Added ${input.artist} with ${count} albums missing.`;
    }
    const decision = {
      artistId: input.artistId,
      status: input.status,
      wishListItemId,
      missingAlbumCount,
      message,
      updatedAt: new Date().toISOString(),
    } satisfies LibraryCompletionArtistDecision;
    mockLibraryCompletionArtistDecisions.set(input.artistId, decision);
    return decision;
  }
  return invoke<LibraryCompletionArtistDecision>(
    "set_library_completion_artist_decision",
    { input },
  );
}

export async function searchWishListMusicBrainz(
  input: WishListMusicBrainzSearchRequest,
) {
  if (!isTauriRuntime()) {
    const title = input.query.trim();
    const isArtist = input.entity === "artist";
    const albumQueryMatch = isArtist
      ? null
      : title.match(/^(.+?)\s+by\s+(.+?)(?:\s+\((\d{4})\))?$/i);
    const previewAlbumTitle = albumQueryMatch?.[1]?.trim() || title;
    const previewAlbumArtist = input.artist?.trim() || albumQueryMatch?.[2]?.trim() || "Pet Shop Boys";
    const previewAlbumYear = input.year ?? (albumQueryMatch?.[3]
      ? Number(albumQueryMatch[3])
      : 2002);
    return {
      entity: input.entity,
      query: title,
      candidates: title
        ? [
            {
              entity: input.entity,
              title: isArtist ? title : previewAlbumTitle,
              artist: isArtist ? "" : previewAlbumArtist,
              year: isArtist ? null : previewAlbumYear,
              musicbrainzId: isArtist
                ? "11111111-1111-4111-8111-111111111111"
                : "22222222-2222-4222-8222-222222222222",
              musicbrainzUrl: isArtist
                ? "https://musicbrainz.org/artist/11111111-1111-4111-8111-111111111111"
                : "https://musicbrainz.org/release-group/22222222-2222-4222-8222-222222222222",
              disambiguation: isArtist ? "Irish alternative rock band" : null,
              country: isArtist ? "IE" : null,
              score: 100,
            },
          ]
        : [],
      searchedAt: new Date().toISOString(),
    } satisfies WishListMusicBrainzSearchResponse;
  }
  return invoke<WishListMusicBrainzSearchResponse>(
    "search_wish_list_musicbrainz",
    { input },
  );
}

export async function addWishListMusicBrainzCandidate(
  candidate: WishListMusicBrainzCandidate,
) {
  if (!isTauriRuntime()) {
    if (candidate.entity === "artist") {
      const complete = candidate.title.toLowerCase().includes("complete");
      const summary = {
        officialAlbumCount: complete ? 2 : 4,
        ownedAlbumCount: 2,
        missingAlbumCount: complete ? 0 : 2,
        missingAlbums: complete
          ? []
          : [
              {
                releaseGroupId: "33333333-3333-4333-8333-333333333333",
                title: "Engine Alley",
                year: 1995,
                musicbrainzUrl:
                  "https://musicbrainz.org/release-group/33333333-3333-4333-8333-333333333333",
              },
              {
                releaseGroupId: "44444444-4444-4444-8444-444444444444",
                title: "Showroom",
                year: 2018,
                musicbrainzUrl:
                  "https://musicbrainz.org/release-group/44444444-4444-4444-8444-444444444444",
              },
            ],
        updatedAt: new Date().toISOString(),
      } satisfies WishListArtistAlbumSummary;
      if (complete) {
        return {
          added: false,
          item: null,
          message: `You already have all 2 official albums by ${candidate.title}. The artist was not added.`,
          artistAlbumSummary: summary,
        } satisfies AddWishListMusicBrainzCandidateResponse;
      }
      const item = await addWishListItem({
        entity: "artist",
        title: candidate.title,
        artist: "",
        year: null,
        musicbrainzId: candidate.musicbrainzId,
        musicbrainzUrl: candidate.musicbrainzUrl,
        source: "MusicBrainz search",
      });
      item.artistAlbumSummary = summary;
      return {
        added: true,
        item,
        message: `Added ${candidate.title} with 2 albums missing.`,
        artistAlbumSummary: summary,
      } satisfies AddWishListMusicBrainzCandidateResponse;
    }
    const item = await addWishListItem({
      entity: "album",
      title: candidate.title,
      artist: candidate.artist,
      year: candidate.year,
      musicbrainzId: candidate.musicbrainzId,
      musicbrainzUrl: candidate.musicbrainzUrl,
      source: "MusicBrainz search",
    });
    return {
      added: true,
      item,
      message: `Added ${candidate.title} by ${candidate.artist}.`,
      artistAlbumSummary: null,
    } satisfies AddWishListMusicBrainzCandidateResponse;
  }
  return invoke<AddWishListMusicBrainzCandidateResponse>(
    "add_wish_list_musicbrainz_candidate",
    { input: { candidate } },
  );
}

export async function addWishListItem(input: AddWishListItemRequest) {
  if (!isTauriRuntime()) {
    const existing = mockWishListItems.find((item) =>
      input.musicbrainzId
        ? item.entity === input.entity && item.musicbrainzId === input.musicbrainzId
        : item.entity === input.entity &&
          item.title.localeCompare(input.title, undefined, { sensitivity: "base" }) === 0 &&
          item.artist.localeCompare(input.artist, undefined, { sensitivity: "base" }) === 0,
    );
    if (existing) return existing;
    const item = {
      ...input,
      id: mockWishListItems.reduce((largest, entry) => Math.max(largest, entry.id), 0) + 1,
      createdAt: new Date().toISOString(),
      downloadedDeezerAlbumId: null,
      downloadedPath: null,
      downloadedAt: null,
      artistAlbumSummary: null,
    } satisfies WishListItem;
    mockWishListItems = [item, ...mockWishListItems];
    return item;
  }
  return invoke<WishListItem>("add_wish_list_item", { input });
}

export async function removeWishListItem(id: number) {
  if (!isTauriRuntime()) {
    mockWishListItems = mockWishListItems.filter((item) => item.id !== id);
    return;
  }
  return invoke<void>("remove_wish_list_item", { id });
}

export async function searchDeemixAlbums(input: DeemixAlbumSearchRequest) {
  if (!isTauriRuntime()) {
    return {
      query: `${input.artist} ${input.title}`.trim(),
      total: 1,
      matches: [
        {
          id: "240766",
          title: input.title,
          artist: input.artist,
          year: input.year,
          trackCount: 10,
          recordType: "album",
          explicit: false,
          deezerUrl: "https://www.deezer.com/album/240766",
          matchScore: 100,
          matchLevel: "exact",
          downloadedAt: mockDeemixDownloads.get("240766")?.downloadedAt ?? null,
          downloadedPath:
            mockDeemixDownloads.get("240766")?.destinationPath ?? null,
        },
      ],
      searchedAt: new Date().toISOString(),
    } satisfies DeemixAlbumSearchResponse;
  }
  return invoke<DeemixAlbumSearchResponse>("search_deemix_albums", { input });
}

export async function refreshWishListArtistAlbumSummary(wishListItemId: number) {
  if (!isTauriRuntime()) {
    const item = mockWishListItems.find(
      (entry) => entry.id === wishListItemId && entry.entity === "artist",
    );
    if (!item?.musicbrainzId) {
      throw new Error("This artist has no MusicBrainz ID to verify official albums.");
    }
    if (item.artistAlbumSummary) return item.artistAlbumSummary;
    return {
      officialAlbumCount: 0,
      ownedAlbumCount: 0,
      missingAlbumCount: 0,
      missingAlbums: [],
      updatedAt: new Date().toISOString(),
    } satisfies WishListArtistAlbumSummary;
  }
  return invoke<WishListArtistAlbumSummary>(
    "refresh_wish_list_artist_album_summary",
    { input: { wishListItemId } },
  );
}

export async function discoverWishListArtistAlbums(wishListItemId: number) {
  if (!isTauriRuntime()) {
    const item = mockWishListItems.find(
      (entry) => entry.id === wishListItemId && entry.entity === "artist",
    );
    if (!item?.musicbrainzId) {
      throw new Error("This artist has no MusicBrainz ID to verify official albums.");
    }
    const fixtures = [
      { id: "102001", title: "Please", year: 1986, tracks: 11 },
      { id: "102002", title: "Actually", year: 1987, tracks: 10 },
      { id: "102003", title: "Behaviour", year: 1990, tracks: 10 },
      { id: "240766", title: "Release", year: 2002, tracks: 10 },
    ];
    return {
      wishListItemId,
      artist: item.title,
      musicbrainzId: item.musicbrainzId,
      officialAlbumCount: fixtures.length,
      searchedAlbumCount: fixtures.length,
      matchedAlbumCount: fixtures.length,
      truncated: false,
      albums: fixtures.map((album, index) => {
        const receipt = mockDeemixDownloads.get(album.id);
        return {
          releaseGroupId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
          title: album.title,
          year: album.year,
          secondaryTypes: [],
          musicbrainzUrl: `https://musicbrainz.org/release-group/00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
          deemixMatches: [
            {
              id: album.id,
              title: album.title,
              artist: item.title,
              year: album.year,
              trackCount: album.tracks,
              recordType: "album",
              explicit: false,
              deezerUrl: `https://www.deezer.com/album/${album.id}`,
              matchScore: 100,
              matchLevel: "exact" as const,
              downloadedAt: receipt?.downloadedAt ?? null,
              downloadedPath: receipt?.destinationPath ?? null,
            },
          ],
          deemixError: null,
          downloadedDeezerAlbumId: receipt ? album.id : null,
          downloadedPath: receipt?.destinationPath ?? null,
          downloadedAt: receipt?.downloadedAt ?? null,
          inLibrary: index === 1 || index === 3,
        };
      }),
      albumSummary:
        item.artistAlbumSummary ??
        ({
          officialAlbumCount: fixtures.length,
          ownedAlbumCount: 0,
          missingAlbumCount: fixtures.length,
          missingAlbums: fixtures.map((album, index) => ({
            releaseGroupId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
            title: album.title,
            year: album.year,
            musicbrainzUrl: `https://musicbrainz.org/release-group/00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
          })),
          updatedAt: new Date().toISOString(),
        } satisfies WishListArtistAlbumSummary),
      searchedAt: new Date().toISOString(),
    } satisfies WishListArtistAlbumDiscoveryResponse;
  }
  return invoke<WishListArtistAlbumDiscoveryResponse>(
    "discover_wish_list_artist_albums",
    { input: { wishListItemId } },
  );
}

export async function preflightDeemixAlbumDownload(
  input: DeemixAlbumDownloadPreflightRequest,
) {
  if (!isTauriRuntime()) {
    const receipt = mockDeemixDownloads.get(input.albumId);
    return {
      alreadyDownloaded: Boolean(receipt),
      destinationPath: receipt?.destinationPath ?? null,
      downloadedAt: receipt?.downloadedAt ?? null,
      message: receipt
        ? `This album is already in the configured download folder: ${receipt.destinationPath}`
        : "This album is not currently in the configured download folder.",
    } satisfies DeemixAlbumDownloadPreflight;
  }
  return invoke<DeemixAlbumDownloadPreflight>(
    "preflight_deemix_album_download",
    { input },
  );
}

function emitMockDeemixDownloadProgress(
  progress: DeemixAlbumDownloadProgress,
) {
  for (const handler of mockDeemixDownloadProgressHandlers) {
    handler(progress);
  }
}

export async function downloadDeemixAlbum(input: DeemixAlbumDownloadRequest) {
  if (!isTauriRuntime()) {
    const steps: DeemixAlbumDownloadProgress[] = [
      {
        requestId: input.requestId,
        albumId: input.albumId,
        phase: "metadata",
        message: "Validating Deezer and loading album metadata…",
        currentTrack: null,
        completedTracks: 0,
        totalTracks: 10,
      },
      {
        requestId: input.requestId,
        albumId: input.albumId,
        phase: "downloading",
        message: "Downloading track 6 of 10…",
        currentTrack: "Unsung",
        completedTracks: 5,
        totalTracks: 10,
      },
      {
        requestId: input.requestId,
        albumId: input.albumId,
        phase: "tagging",
        message: "Tagging track 10 of 10…",
        currentTrack: "Role Model",
        completedTracks: 9,
        totalTracks: 10,
      },
    ];
    for (const progress of steps) {
      emitMockDeemixDownloadProgress(progress);
      await new Promise((resolve) => window.setTimeout(resolve, 120));
    }
    const destinationName = `${input.expectedArtist} - ${input.expectedAlbum}${input.expectedYear ? ` (${input.expectedYear})` : ""}${input.allowDuplicate ? " [2]" : ""}`;
    const completedAt = new Date().toISOString();
    const summary = {
      requestId: input.requestId,
      albumId: input.albumId,
      artist: input.expectedArtist,
      album: input.expectedAlbum,
      year: input.expectedYear,
      quality: "mp3_320",
      destinationPath: `D:\\Music\\Incoming\\${destinationName}`,
      coverPath:
        `D:\\Music\\Incoming\\${destinationName}\\cover.jpg`,
      warning: null,
      trackCount: 10,
      completedAt,
    } satisfies DeemixAlbumDownloadSummary;
    mockDeemixDownloads.set(input.albumId, {
      destinationPath: summary.destinationPath,
      downloadedAt: completedAt,
    });
    if (input.wishListItemId != null) {
      mockWishListItems = mockWishListItems.map((item) =>
        item.id === input.wishListItemId && item.entity === "album"
          ? {
              ...item,
              downloadedDeezerAlbumId: input.albumId,
              downloadedPath: summary.destinationPath,
              downloadedAt: completedAt,
            }
          : item,
      );
    }
    emitMockDeemixDownloadProgress({
      requestId: input.requestId,
      albumId: input.albumId,
      phase: "complete",
      message: "Downloaded and tagged 10 tracks as MP3 320 kbps.",
      currentTrack: null,
      completedTracks: 10,
      totalTracks: 10,
    });
    return summary;
  }
  return invoke<DeemixAlbumDownloadSummary>("download_deemix_album", { input });
}

export async function exportPlaylist(input: ExportPlaylistRequest) {
  if (!isTauriRuntime()) {
    return finalizeExport({
      path: `Preview runtime / ${input.name.trim() || "playlist"}.m3u8`,
      format: "m3u8",
      rowCount: input.playlist.tracks.filter(
        (track) => track.filePath && track.filename,
      ).length,
    } satisfies RawExportResult);
  }
  return finalizeExport(
    await invoke<RawExportResult>("export_playlist", { input }),
  );
}

export async function getMusicBrainzCacheStatus(cachePath?: string) {
  if (!isTauriRuntime()) {
    const nextCachePath = normalizeMusicBrainzCachePath(
      cachePath ?? mockSettings.musicBrainzCachePath,
    );
    return {
      ...mockMusicBrainzCacheStatus,
      cachePath: nextCachePath,
      resolvedPath: `Preview runtime / ${nextCachePath}`,
    } satisfies MusicBrainzCacheStatus;
  }

  return invoke<MusicBrainzCacheStatus>("get_musicbrainz_cache_status", {
    cachePath: cachePath ?? null,
  });
}

function mockOriginPreview(
  request: MusicBrainzOriginCountryImportRequest = {},
): MusicBrainzOriginCountryPreview {
  const selectedKeys = new Set(
    (request.artistKeys ?? []).map(normalizeArtistKey).filter(Boolean),
  );
  const rows = mockMusicBrainzOriginPreviewRows
    .filter(
      (row) => selectedKeys.size === 0 || selectedKeys.has(row.localArtistKey),
    )
    .slice(0, request.limit ?? undefined)
    .map((row) => {
      if (
        request.refetch &&
        (row.status === "alreadyImported" || row.status === "manual")
      ) {
        return { ...row, status: "eligible" };
      }
      return row;
    });
  return {
    totalAlbumArtists: mockMusicBrainzOriginCountryStatus.totalAlbumArtists,
    eligibleCount: rows.filter((row) => row.status === "eligible").length,
    alreadyImportedCount: rows.filter(
      (row) => row.status === "alreadyImported" || row.status === "manual",
    ).length,
    skippedCount: rows.filter((row) => row.status === "skipped").length,
    unresolvedCount: rows.filter((row) => row.status === "unresolved").length,
    estimatedSeconds:
      rows.filter((row) => row.status === "eligible").length * 2,
    rows,
  };
}

export async function getMusicBrainzOriginCountryStatus() {
  if (!isTauriRuntime()) {
    return mockMusicBrainzOriginCountryStatus;
  }

  return invoke<MusicBrainzOriginCountryStatus>(
    "get_musicbrainz_origin_country_status",
  );
}

export async function previewMusicBrainzOriginCountryImport(
  request: MusicBrainzOriginCountryImportRequest = {},
) {
  if (!isTauriRuntime()) {
    return mockOriginPreview(request);
  }

  return invoke<MusicBrainzOriginCountryPreview>(
    "preview_musicbrainz_origin_country_import",
    {
      request,
    },
  );
}

export async function importMusicBrainzOriginCountries(
  request: MusicBrainzOriginCountryImportRequest = {},
) {
  if (!isTauriRuntime()) {
    const preview = mockOriginPreview(request);
    const eligibleRows = preview.rows.filter(
      (row) => row.status === "eligible",
    );
    const fetchedCount = eligibleRows.length;
    const skippedCount = Math.max(0, preview.rows.length - eligibleRows.length);
    let storedCount = 0;
    let unresolvedCount = 0;
    emitMockMusicBrainzOriginProgress(
      mockOriginProgress(
        "running",
        preview.totalAlbumArtists,
        fetchedCount,
        0,
        0,
        0,
        skippedCount,
        0,
        0,
        null,
        `Ready to fetch ${fetchedCount} eligible artists; ${skippedCount} skipped by preview rules.`,
      ),
    );

    for (const [index, row] of eligibleRows.entries()) {
      emitMockMusicBrainzOriginProgress(
        mockOriginProgress(
          "fetching",
          preview.totalAlbumArtists,
          fetchedCount,
          index,
          index,
          storedCount,
          skippedCount,
          unresolvedCount,
          0,
          row,
          `Fetching ${row.displayArtist} from MusicBrainz.`,
        ),
      );
      await new Promise((resolve) => window.setTimeout(resolve, 180));
      const isUnresolved = row.displayArtist === "Dio" && request.refetch;
      if (isUnresolved) {
        unresolvedCount += 1;
      } else {
        storedCount += 1;
      }
      emitMockMusicBrainzOriginProgress(
        mockOriginProgress(
          isUnresolved ? "unresolved" : "stored",
          preview.totalAlbumArtists,
          fetchedCount,
          index + 1,
          index + 1,
          storedCount,
          skippedCount,
          unresolvedCount,
          0,
          row,
          isUnresolved
            ? `${row.displayArtist} did not return a usable country; saved as unresolved.`
            : `Stored ${row.existingCountryName ?? "origin country"} for ${row.displayArtist}.`,
        ),
      );
    }

    emitMockMusicBrainzOriginProgress(
      mockOriginProgress(
        "completed",
        preview.totalAlbumArtists,
        fetchedCount,
        fetchedCount,
        fetchedCount,
        storedCount,
        skippedCount,
        unresolvedCount,
        0,
        null,
        `Import completed: ${storedCount} succeeded, ${unresolvedCount} unresolved, 0 failed, ${skippedCount} skipped.`,
      ),
    );

    return {
      run: {
        ...mockMusicBrainzOriginRun,
        id: mockMusicBrainzOriginRun.id + 1,
        eligibleCount: fetchedCount,
        fetchedCount,
        skippedCount,
        unresolvedCount,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
      totalAlbumArtists: preview.totalAlbumArtists,
      eligibleCount: fetchedCount,
      fetchedCount,
      storedCount,
      skippedCount,
      unresolvedCount,
      failedCount: 0,
      cancelled: false,
      rows: preview.rows,
    } satisfies MusicBrainzOriginCountryImportSummary;
  }

  return invoke<MusicBrainzOriginCountryImportSummary>(
    "import_musicbrainz_origin_countries",
    {
      request,
    },
  );
}

export async function cancelMusicBrainzOriginCountryImport() {
  if (!isTauriRuntime()) {
    return;
  }

  await invoke<void>("cancel_musicbrainz_origin_country_import");
}

function mockArtistInfoPreview(
  request: MusicBrainzArtistInfoImportRequest = {},
): MusicBrainzArtistInfoPreview {
  const selectedKeys = new Set(
    (request.artistKeys ?? []).map(normalizeArtistKey).filter(Boolean),
  );
  const rows = mockMusicBrainzArtistInfoPreviewRows
    .filter(
      (row) => selectedKeys.size === 0 || selectedKeys.has(row.localArtistKey),
    )
    .slice(0, request.limit ?? undefined)
    .map((row) => {
      if (request.refetch && row.status === "alreadyImported") {
        return { ...row, status: "eligible" };
      }
      return row;
    });
  return {
    totalAlbumArtists: mockMusicBrainzArtistInfoStatus.totalAlbumArtists,
    eligibleCount: rows.filter((row) => row.status === "eligible").length,
    alreadyImportedCount: rows.filter((row) => row.status === "alreadyImported")
      .length,
    skippedCount: rows.filter((row) => row.status === "skipped").length,
    unresolvedCount: rows.filter((row) => row.status === "unresolved").length,
    estimatedSeconds:
      rows.filter((row) => row.status === "eligible").length * 2,
    rows,
  };
}

export async function getMusicBrainzArtistInfoStatus() {
  if (!isTauriRuntime()) {
    return mockMusicBrainzArtistInfoStatus;
  }

  return invoke<MusicBrainzArtistInfoStatus>(
    "get_musicbrainz_artist_info_status",
  );
}

export async function previewMusicBrainzArtistInfoImport(
  request: MusicBrainzArtistInfoImportRequest = {},
) {
  if (!isTauriRuntime()) {
    return mockArtistInfoPreview(request);
  }

  return invoke<MusicBrainzArtistInfoPreview>(
    "preview_musicbrainz_artist_info_import",
    {
      request,
    },
  );
}

export async function importMusicBrainzArtistInfos(
  request: MusicBrainzArtistInfoImportRequest = {},
) {
  if (!isTauriRuntime()) {
    const preview = mockArtistInfoPreview(request);
    const eligibleRows = preview.rows.filter(
      (row) => row.status === "eligible",
    );
    const fetchedCount = eligibleRows.length;
    const skippedCount = Math.max(0, preview.rows.length - eligibleRows.length);
    let storedCount = 0;
    let unresolvedCount = 0;
    emitMockMusicBrainzArtistInfoProgress(
      mockArtistInfoProgress(
        "running",
        preview.totalAlbumArtists,
        fetchedCount,
        0,
        0,
        0,
        skippedCount,
        0,
        0,
        null,
        `Ready to fetch ${fetchedCount} eligible artists; ${skippedCount} skipped by preview rules.`,
      ),
    );

    for (const [index, row] of eligibleRows.entries()) {
      emitMockMusicBrainzArtistInfoProgress(
        mockArtistInfoProgress(
          "fetching",
          preview.totalAlbumArtists,
          fetchedCount,
          index,
          index,
          storedCount,
          skippedCount,
          unresolvedCount,
          0,
          row,
          `Fetching artist info for ${row.displayArtist} from MusicBrainz.`,
        ),
      );
      await new Promise((resolve) => window.setTimeout(resolve, 180));
      const isUnresolved =
        row.displayArtist === "Austin Wintory" && request.refetch;
      if (isUnresolved) {
        unresolvedCount += 1;
      } else {
        storedCount += 1;
      }
      emitMockMusicBrainzArtistInfoProgress(
        mockArtistInfoProgress(
          isUnresolved ? "unresolved" : "stored",
          preview.totalAlbumArtists,
          fetchedCount,
          index + 1,
          index + 1,
          storedCount,
          skippedCount,
          unresolvedCount,
          0,
          row,
          isUnresolved
            ? `${row.displayArtist} did not return type, gender, or life-span data; saved as unresolved.`
            : `Stored artist info for ${row.displayArtist}.`,
        ),
      );
    }

    emitMockMusicBrainzArtistInfoProgress(
      mockArtistInfoProgress(
        "completed",
        preview.totalAlbumArtists,
        fetchedCount,
        fetchedCount,
        fetchedCount,
        storedCount,
        skippedCount,
        unresolvedCount,
        0,
        null,
        `Import completed: ${storedCount} succeeded, ${unresolvedCount} unresolved, 0 failed, ${skippedCount} skipped.`,
      ),
    );

    return {
      run: {
        ...mockMusicBrainzArtistInfoRun,
        id: mockMusicBrainzArtistInfoRun.id + 1,
        eligibleCount: fetchedCount,
        fetchedCount,
        skippedCount,
        unresolvedCount,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      },
      totalAlbumArtists: preview.totalAlbumArtists,
      eligibleCount: fetchedCount,
      fetchedCount,
      storedCount,
      skippedCount,
      unresolvedCount,
      failedCount: 0,
      cancelled: false,
      rows: preview.rows,
    } satisfies MusicBrainzArtistInfoImportSummary;
  }

  return invoke<MusicBrainzArtistInfoImportSummary>(
    "import_musicbrainz_artist_infos",
    {
      request,
    },
  );
}

export async function cancelMusicBrainzArtistInfoImport() {
  if (!isTauriRuntime()) {
    return;
  }

  await invoke<void>("cancel_musicbrainz_artist_info_import");
}

export async function getMusicBrainzArtistDiscography(
  artistKey: string,
  artistName: string,
) {
  if (!isTauriRuntime()) {
    const normalizedKey = normalizeArtistKey(artistKey || artistName);
    const mockDiscography = mockMusicBrainzDiscographies[normalizedKey];
    if (mockDiscography) {
      return mockDiscography;
    }
    return {
      artistKey: normalizedKey,
      artistName: artistName || artistKey || "Unknown Artist",
      state: "notFound",
      message: "No MusicBrainz artist match was found in the preview cache.",
      cachePath: mockSettings.musicBrainzCachePath,
      resolvedPath: `Preview runtime / ${mockSettings.musicBrainzCachePath}`,
      musicbrainzMbid: null,
      matchedCacheName: null,
      matchMethod: "none",
      artistLinkState: "none",
      artistLinkIgnored: false,
      suspectMapping: false,
      cachedNameCount: 0,
      totalReleaseGroupCount: 0,
      pureAlbumCount: 0,
      ownedCount: 0,
      missingCount: 0,
      excludedCount: 0,
      localAlbumCount: 0,
      completion: null,
      releaseGroupSource: "cache",
      releaseGroupUpdatedAt: null,
      releases: [],
      candidates: [],
    } satisfies MusicBrainzArtistDiscographyResponse;
  }

  return invoke<MusicBrainzArtistDiscographyResponse>(
    "get_musicbrainz_artist_discography",
    {
      request: { artistKey, artistName },
    },
  );
}

export async function refreshMusicBrainzArtistInfo(input: {
  artistKey: string;
  artistName: string;
  musicbrainzMbid: string | null;
}) {
  if (!isTauriRuntime()) {
    const normalizedKey = normalizeArtistKey(
      input.artistKey || input.artistName,
    );
    const mockDiscography = mockMusicBrainzDiscographies[normalizedKey];
    const fetchedAt = new Date().toISOString();
    if (
      mockDiscography &&
      !mockDiscography.releases.some(
        (row) => row.releaseMbid === "preview-sandbox",
      )
    ) {
      mockDiscography.releases.push({
        releaseMbid: "preview-sandbox",
        title: "Sandbox",
        year: 2026,
        trackCount: null,
        status: "missing",
        localAlbumId: null,
        localAlbumTitle: null,
        localYear: null,
        matchMethod: "none",
        confidence: 0,
        decision: null,
      });
      mockDiscography.releaseGroupSource = "refreshed";
      mockDiscography.releaseGroupUpdatedAt = fetchedAt;
      recomputeMockMusicBrainzDiscographyCounts(mockDiscography);
    }
    const currentOrigin = mockOriginForArtist(
      input.artistName || input.artistKey,
    );
    const origin = applyMockArtistOriginCountry(
      input.artistKey,
      input.artistName,
      input.musicbrainzMbid ?? mockDiscography?.musicbrainzMbid ?? null,
      currentOrigin.originCountryCode ?? "US",
      currentOrigin.originCountryName ?? "United States",
      currentOrigin.originCountryReviewState ?? "imported",
    );
    return {
      artistKey: normalizedKey,
      artistName: input.artistName || input.artistKey || "Unknown Artist",
      musicbrainzMbid:
        input.musicbrainzMbid ??
        mockDiscography?.musicbrainzMbid ??
        "preview-mbid",
      fetchedCount: mockDiscography?.releases.length ?? 0,
      storedCount: mockDiscography?.releases.length ?? 0,
      fetchedAt,
      origin,
    } satisfies MusicBrainzArtistRefreshResult;
  }

  return invoke<MusicBrainzArtistRefreshResult>(
    "refresh_musicbrainz_artist_releases",
    {
      request: input,
    },
  );
}

export async function setMusicBrainzArtistOriginCountry(input: {
  artistKey: string;
  artistName: string;
  musicbrainzMbid?: string | null;
  countryCode: string;
  countryName?: string | null;
}) {
  if (!isTauriRuntime()) {
    const countryCode = input.countryCode.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(countryCode)) {
      throw new Error("Origin Country must be a two-letter country code.");
    }
    const countryName =
      input.countryName?.trim() || mockCountryNameFromCode(countryCode);
    return applyMockArtistOriginCountry(
      input.artistKey,
      input.artistName,
      input.musicbrainzMbid,
      countryCode,
      countryName,
      "manual",
    );
  }

  return invoke<MusicBrainzArtistOriginCountryUpdate>(
    "set_musicbrainz_artist_origin_country",
    {
      request: input,
    },
  );
}

export async function setMusicBrainzArtistLink(input: {
  artistKey: string;
  artistName: string;
  action: "verify" | "ignore" | "unlink" | "set";
  musicbrainzMbid?: string | null;
  canonicalName?: string | null;
}) {
  if (!isTauriRuntime()) {
    const normalizedKey = normalizeArtistKey(
      input.artistKey || input.artistName,
    );
    const mockDiscography = mockMusicBrainzDiscographies[normalizedKey];
    if (!mockDiscography) {
      return;
    }

    if (input.action === "unlink") {
      mockDiscography.artistLinkState = "unverified";
      mockDiscography.artistLinkIgnored = false;
      mockDiscography.matchMethod = mockDiscography.musicbrainzMbid
        ? "exact-name"
        : "none";
      mockDiscography.state = mockDiscography.musicbrainzMbid
        ? "available"
        : "notFound";
      recomputeMockMusicBrainzDiscographyCounts(mockDiscography);
      return;
    }

    const nextMbid =
      input.musicbrainzMbid?.trim() || mockDiscography.musicbrainzMbid;
    const nextName =
      input.canonicalName?.trim() ||
      mockDiscography.matchedCacheName ||
      input.artistName;

    if (input.action === "ignore") {
      mockDiscography.musicbrainzMbid = nextMbid;
      mockDiscography.matchedCacheName = nextName;
      mockDiscography.matchMethod = "ignored";
      mockDiscography.artistLinkState = "ignored";
      mockDiscography.artistLinkIgnored = true;
      mockDiscography.state = "ignored";
      mockDiscography.message = "MusicBrainz is ignored for this local artist.";
      mockDiscography.releases = [];
      mockDiscography.candidates = [];
      recomputeMockMusicBrainzDiscographyCounts(mockDiscography);
      mockDiscography.message = "MusicBrainz is ignored for this local artist.";
      return;
    }

    mockDiscography.musicbrainzMbid = nextMbid;
    mockDiscography.matchedCacheName = nextName;
    mockDiscography.matchMethod =
      input.action === "set" ? "manual-mbid" : "verified-link";
    mockDiscography.artistLinkState = "verified";
    mockDiscography.artistLinkIgnored = false;
    mockDiscography.state = "available";
    mockDiscography.candidates = [];
    recomputeMockMusicBrainzDiscographyCounts(mockDiscography);
    return;
  }

  return invoke<void>("set_musicbrainz_artist_link", {
    request: input,
  });
}

export async function setMusicBrainzReleaseDecision(input: {
  artistKey: string;
  artistName: string;
  musicbrainzMbid: string | null;
  releaseMbid: string;
  decision: "not-in-scope" | "ignored" | "clear" | "include";
  localAlbumId?: string | null;
}) {
  if (!isTauriRuntime()) {
    const normalizedKey = normalizeArtistKey(
      input.artistKey || input.artistName,
    );
    const mockDiscography = mockMusicBrainzDiscographies[normalizedKey];
    if (!mockDiscography) {
      return;
    }

    const nextDecision =
      input.decision === "clear" || input.decision === "include"
        ? null
        : input.decision;
    mockDiscography.releases = mockDiscography.releases.map((row) =>
      row.releaseMbid === input.releaseMbid
        ? applyMockMusicBrainzReleaseDecision(row, nextDecision)
        : row,
    );
    recomputeMockMusicBrainzDiscographyCounts(mockDiscography);
    return;
  }

  return invoke<void>("set_musicbrainz_release_decision", {
    request: input,
  });
}

export async function syncMusicBrainzOverlay(
  options: { recordNoop?: boolean } = {},
) {
  if (!isTauriRuntime()) {
    const result = createMockMusicBrainzOverlaySyncResult();
    if (options.recordNoop !== false || result.changedCount > 0) {
      setMockMusicBrainzOverlaySyncLog(
        [result, ...mockMusicBrainzOverlaySyncLog].slice(0, 12),
      );
    }
    return result;
  }

  return invoke<MusicBrainzOverlaySyncResult>("sync_musicbrainz_overlay", {
    recordNoop: options.recordNoop ?? true,
  });
}

export async function listMusicBrainzOverlaySyncLog(limit = 12) {
  if (!isTauriRuntime()) {
    return mockMusicBrainzOverlaySyncLog.slice(
      0,
      limit,
    ) satisfies MusicBrainzOverlaySyncLogEntry[];
  }

  return invoke<MusicBrainzOverlaySyncLogEntry[]>(
    "list_musicbrainz_overlay_sync_log",
    { limit },
  );
}

function createMockMusicBrainzOverlaySyncResult(): MusicBrainzOverlaySyncLogEntry {
  const syncedAt = new Date().toISOString();
  return {
    id: Date.now(),
    syncPath: mockSettings.musicBrainzOverlaySyncPath,
    syncedAt,
    importedCount: 0,
    exportedCount: 0,
    changedCount: 0,
    summary: "No MusicBrainz overlay changes.",
    artistLinksImported: 0,
    artistLinksExported: 0,
    artistUnlinksImported: 0,
    artistUnlinksExported: 0,
    releaseDecisionsImported: 0,
    releaseDecisionsExported: 0,
    releaseDecisionClearsImported: 0,
    releaseDecisionClearsExported: 0,
    releaseStatusesImported: 0,
    releaseStatusesExported: 0,
    releaseGroupsImported: 0,
    releaseGroupsExported: 0,
  };
}

function applyMockMusicBrainzReleaseDecision(
  row: MusicBrainzArtistReleaseRow,
  decision: "not-in-scope" | "ignored" | null,
): MusicBrainzArtistReleaseRow {
  if (decision) {
    return {
      ...row,
      status: "excluded",
      localAlbumId: null,
      localAlbumTitle: null,
      localYear: null,
      matchMethod: decision,
      confidence: 0,
      decision,
    };
  }

  const owned = Boolean(row.localAlbumTitle);
  return {
    ...row,
    status: owned ? "owned" : "missing",
    matchMethod: owned ? row.matchMethod || "normalized-title" : "none",
    confidence: owned ? row.confidence || 0.92 : 0,
    decision: null,
  };
}

function recomputeMockMusicBrainzDiscographyCounts(
  response: MusicBrainzArtistDiscographyResponse,
) {
  response.ownedCount = response.releases.filter(
    (row) => row.status === "owned",
  ).length;
  response.missingCount = response.releases.filter(
    (row) => row.status === "missing",
  ).length;
  response.excludedCount = response.releases.filter(
    (row) => row.status === "excluded",
  ).length;
  response.pureAlbumCount = response.ownedCount + response.missingCount;
  response.completion =
    response.pureAlbumCount > 0
      ? response.ownedCount / response.pureAlbumCount
      : null;
  response.message = `Matched ${response.pureAlbumCount} scoped MusicBrainz albums against ${response.localAlbumCount} local albums; ${response.excludedCount} excluded by release decisions.`;
}

export async function saveSettings(settings: AppSettings) {
  const normalizedSettings = normalizeSettings(settings);
  if (!isTauriRuntime()) {
    setMockSettings({
      ...normalizedSettings,
      updatedAt: new Date().toISOString(),
    });
    cacheSettings(mockSettings);
    return mockSettings;
  }

  const saved = normalizeSettings(
    await invoke<AppSettings>("save_settings", {
      settings: normalizedSettings,
    }),
  );
  cacheSettings(saved);
  return saved;
}

export async function getImportPreview(sourcePath: string) {
  if (!isTauriRuntime()) {
    return mockPreparedImport?.sourcePath === sourcePath
      ? mockPreparedImport
      : null;
  }

  return invoke<ImportPreview | null>("get_import_preview", { sourcePath });
}

export async function prepareImportPreview(sourcePath: string) {
  if (!isTauriRuntime()) {
    mockImportCancellationRequested = false;
    emitMockImportProgress({
      status: "preparing",
      sessionId: 42,
      processedRows: 612_000,
      processedBytes: 131_000_000,
      totalBytes: 240_000_000,
      albumCount: 41_820,
      message: "Staging rows and saving a resumable checkpoint.",
    });
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    const wasCancelled = mockImportCancellationRequested;
    mockPreparedImport = {
      sessionId: 42,
      sourcePath,
      sourceSizeBytes: 240_000_000,
      sourceModifiedMs: Date.now(),
      status: wasCancelled ? "cancelled" : "ready",
      processedRows: wasCancelled ? 612_000 : 1_136_420,
      processedBytes: wasCancelled ? 131_000_000 : 240_000_000,
      trackRows: wasCancelled ? 612_000 : 1_136_420,
      albumCount: wasCancelled ? 41_820 : 77_104,
      addedTracks: 6_128,
      changedTracks: 1_442,
      removedTracks: 590,
      addedAlbums: 418,
      changedAlbums: 236,
      removedAlbums: 103,
      suspiciousAlbumCount: 7,
      suspiciousAlbums: [
        {
          albumId: "mock:removed",
          album: "Northern Static",
          albumArtistDisplay: "The Long Signal",
          year: 1998,
          reason: "Rated or loved album would be removed",
          previousTrackCount: 11,
          currentTrackCount: 0,
        },
        {
          albumId: "mock:tracks",
          album: "Low Season",
          albumArtistDisplay: "Glass Harbour",
          year: 2007,
          reason: "Track count falls from 14 to 8",
          previousTrackCount: 14,
          currentTrackCount: 8,
        },
        {
          albumId: "mock:artist",
          album: "Collected Works",
          albumArtistDisplay: null,
          year: 1984,
          reason: "Album artist metadata would disappear",
          previousTrackCount: 18,
          currentTrackCount: 18,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
      importRunId: null,
      errorMessage: null,
      canResume: wasCancelled,
      sourceChanged: false,
    };
    emitMockImportProgress({
      status: mockPreparedImport.status,
      sessionId: 42,
      processedRows: mockPreparedImport.processedRows,
      processedBytes: mockPreparedImport.processedBytes,
      totalBytes: mockPreparedImport.sourceSizeBytes,
      albumCount: mockPreparedImport.albumCount,
      message: wasCancelled
        ? "Preparation cancelled. The checkpoint is safe to resume."
        : "Delta ready. Review it before applying the atomic import.",
    });
    return mockPreparedImport;
  }

  return invoke<ImportPreview>("prepare_import_preview", { sourcePath });
}

export async function cancelImportPreview() {
  if (!isTauriRuntime()) {
    mockImportCancellationRequested = true;
    if (mockPreparedImport) {
      mockPreparedImport = {
        ...mockPreparedImport,
        status: "cancelled",
        canResume: true,
        updatedAt: new Date().toISOString(),
      };
    }
    return;
  }

  await invoke<void>("cancel_import_preview");
}

export async function applyImportPreview(sessionId: number) {
  if (!isTauriRuntime()) {
    if (!mockPreparedImport || mockPreparedImport.sessionId !== sessionId) {
      throw new Error("Prepare the import delta before applying this import.");
    }
    const run: ImportRun = {
      ...mockImportRuns[0],
      id: 42,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      trackRows: mockPreparedImport.trackRows,
      albumCount: mockPreparedImport.albumCount,
      addedTracks: mockPreparedImport.addedTracks,
      changedTracks: mockPreparedImport.changedTracks,
      removedTracks: mockPreparedImport.removedTracks,
      addedAlbums: mockPreparedImport.addedAlbums,
      changedAlbums: mockPreparedImport.changedAlbums,
      removedAlbums: mockPreparedImport.removedAlbums,
      backupPath: "Preview runtime rollback-42.sqlite3",
    };
    mockPreparedImport = {
      ...mockPreparedImport,
      status: "completed",
      completedAt: run.completedAt,
      importRunId: run.id,
    };
    mockImportRuns.unshift(run);
    emitMockImportProgress({
      status: "completed",
      sessionId,
      processedRows: run.trackRows,
      processedBytes: mockPreparedImport.sourceSizeBytes,
      totalBytes: mockPreparedImport.sourceSizeBytes,
      albumCount: run.albumCount,
      message: "Import applied. The generated backup is ready for rollback.",
    });
    return {
      importRun: run,
      trackRows: run.trackRows,
      albumCount: run.albumCount,
      durationMs: 8_420,
      backupPath: run.backupPath,
    } satisfies ImportSummary;
  }

  return invoke<ImportSummary>("apply_import_preview", { sessionId });
}

export async function rollbackImportRun(importRunId: number) {
  if (!isTauriRuntime()) {
    const run = mockImportRuns.find((candidate) => candidate.id === importRunId);
    if (!run?.backupPath) {
      throw new Error("This import does not have a rollback backup.");
    }
    return {
      restoredBackup: {
        id: importRunId,
        createdAt: run.startedAt,
        operation: "import",
        sourcePath: run.sourcePath,
        sourceSizeBytes: run.sourceSizeBytes,
        backupPath: run.backupPath,
        fileSizeBytes: 64_000_000,
        trackRows: run.trackRows,
        albumCount: run.albumCount,
        schemaVersion: 25,
        exists: true,
        canRestore: true,
      },
      preRestoreBackupPath: "Preview runtime before-rollback.sqlite3",
      trackCount: run.trackRows,
      albumCount: run.albumCount,
      schemaVersion: 25,
    } satisfies DatabaseRestoreSummary;
  }

  return invoke<DatabaseRestoreSummary>("rollback_import_run", {
    importRunId,
  });
}

export async function importAlbumCovers(request: CoverImportRequest) {
  if (!isTauriRuntime()) {
    throw new Error(
      "Start cover import from the Tauri desktop app to access local files and SQLite.",
    );
  }

  return invoke<CoverImportSummary>("import_album_covers", { request });
}

export async function importBillboardCharts(sourcePath: string) {
  if (!isTauriRuntime()) {
    const matchedAlbums = mockRows.filter(
      (row) => row.trackId === null && row.billboardRank != null,
    ).length;
    return {
      sourcePath,
      filesScanned: 70,
      chartEntries: 12000,
      matchedAlbums,
      datedAlbums: matchedAlbums,
      durationMs: 0,
    } satisfies BillboardImportSummary;
  }

  return invoke<BillboardImportSummary>("import_billboard_charts", {
    sourcePath,
  });
}

export async function importBillboardSingles(sourcePath: string) {
  if (!isTauriRuntime()) {
    const matchedTracks = mockRows.filter(
      (row) => row.trackId !== null && row.billboardSingleRank != null,
    ).length;
    return {
      sourcePath,
      filesScanned: 135,
      chartEntries: 18000,
      matchedTracks,
      datedTracks: matchedTracks,
      exactDates: 18_000,
      qualifiedDates: 0,
      missingDates: 0,
      invalidDates: 0,
      durationMs: 0,
    } satisfies BillboardSinglesImportSummary;
  }

  return invoke<BillboardSinglesImportSummary>("import_billboard_singles", {
    sourcePath,
  });
}

export async function importVgListaAlbums(sourcePath: string) {
  if (!isTauriRuntime()) {
    const matchedItems = mockRows.filter(
      (row) => row.trackId === null && row.vgListaRank != null,
    ).length;
    return {
      sourcePath,
      filesScanned: 59,
      chartEntries: 52_000,
      matchedItems,
      datedItems: matchedItems,
      durationMs: 0,
    } satisfies VgListaImportSummary;
  }

  return invoke<VgListaImportSummary>("import_vg_lista_albums", {
    sourcePath,
  });
}

export async function importVgListaSingles(sourcePath: string) {
  if (!isTauriRuntime()) {
    const matchedItems = mockRows.filter(
      (row) => row.trackId !== null && row.vgListaRank != null,
    ).length;
    return {
      sourcePath,
      filesScanned: 69,
      chartEntries: 76_000,
      matchedItems,
      datedItems: matchedItems,
      durationMs: 0,
    } satisfies VgListaImportSummary;
  }

  return invoke<VgListaImportSummary>("import_vg_lista_singles", {
    sourcePath,
  });
}

export async function importOfficialUkAlbums(sourcePath: string) {
  if (!isTauriRuntime()) {
    const matchedItems = mockRows.filter(
      (row) => row.trackId === null && row.officialUkRank != null,
    ).length;
    return {
      sourcePath,
      filesScanned: 71,
      chartEntries: 278_293,
      matchedItems,
      datedItems: matchedItems,
      durationMs: 0,
    } satisfies OfficialUkImportSummary;
  }

  return invoke<OfficialUkImportSummary>("import_official_uk_albums", {
    sourcePath,
  });
}

export async function importOfficialUkSingles(sourcePath: string) {
  if (!isTauriRuntime()) {
    const matchedItems = mockRows.filter(
      (row) => row.trackId !== null && row.officialUkRank != null,
    ).length;
    return {
      sourcePath,
      filesScanned: 75,
      chartEntries: 298_194,
      matchedItems,
      datedItems: matchedItems,
      durationMs: 0,
    } satisfies OfficialUkImportSummary;
  }

  return invoke<OfficialUkImportSummary>("import_official_uk_singles", {
    sourcePath,
  });
}

export async function importTiISkuddetSingles(sourcePath: string) {
  if (!isTauriRuntime()) {
    const matchedTracks = mockRows.filter(
      (row) => row.trackId !== null && row.tiISkuddetRank != null,
    ).length;
    return {
      sourcePath,
      filesScanned: 33,
      chartEntries: 17_974,
      matchedTracks,
      datedTracks: matchedTracks,
      skippedRows: 1,
      durationMs: 0,
    } satisfies TiISkuddetImportSummary;
  }

  return invoke<TiISkuddetImportSummary>("import_ti_i_skuddet_singles", {
    sourcePath,
  });
}

export async function importNorsktoppenSingles(sourcePath: string) {
  if (!isTauriRuntime()) {
    const matchedTracks = mockRows.filter(
      (row) => row.trackId !== null && row.norsktoppenRank != null,
    ).length;
    return {
      sourcePath,
      filesScanned: 36,
      chartEntries: 22_888,
      matchedTracks,
      datedTracks: matchedTracks,
      skippedRows: 24,
      durationMs: 0,
    } satisfies NorsktoppenImportSummary;
  }

  return invoke<NorsktoppenImportSummary>("import_norsktoppen_singles", {
    sourcePath,
  });
}

export async function getAlbumCoverDataUrl(albumId: string) {
  if (!isTauriRuntime()) {
    return null;
  }

  if (coverDataUrlCache.has(albumId)) {
    return coverDataUrlCache.get(albumId) ?? null;
  }

  const request = invoke<string | null>("get_album_cover_data_url", {
    albumId,
  }).catch(() => null);
  coverDataUrlCache.set(albumId, request);
  const dataUrl = await request;
  coverDataUrlCache.set(albumId, dataUrl);
  return dataUrl;
}

export function clearCoverImageCache() {
  coverDataUrlCache.clear();
}

export async function searchLibrary(request: BrowseRequest) {
  if (!isTauriRuntime()) {
    const isTracks = request.view === "tracks";
    const albumIds = new Set(request.filters.albumIds);
    const trackIds = new Set(request.filters.trackIds);
    const artistKeys = new Set(request.filters.artistKeys);
    const genreKeys = new Set(expandGenreFilterKeys(request.filters.genres));
    const excludedGenreKeys = new Set(
      expandGenreFilterKeys(request.filters.excludedGenres),
    );
    const originCountryCodes = new Set(
      (request.filters.originCountryCodes ?? []).map((code) =>
        code.trim().toUpperCase(),
      ),
    );
    const excludedOriginCountryCodes = new Set(
      (request.filters.excludedOriginCountryCodes ?? []).map((code) =>
        code.trim().toUpperCase(),
      ),
    );
    const ratedTracksMin = request.filters.ratedTracksMin;
    const ratedTracksMax = request.filters.ratedTracksMax;
    const yearFrom = request.filters.yearFrom;
    const yearTo = request.filters.yearTo;
    const releaseYearFrom = request.filters.releaseYearFrom;
    const releaseYearTo = request.filters.releaseYearTo;
    const totalMinutesMin = request.filters.totalMinutesMin;
    const totalMinutesMax = request.filters.totalMinutesMax;
    const trackCountMin = request.filters.trackCountMin;
    const trackCountMax = request.filters.trackCountMax;
    const albumRatingMin = request.filters.albumRatingMin;
    const albumRatingMax = request.filters.albumRatingMax;
    const trackRatingMin = request.filters.trackRatingMin;
    const trackRatingMax = request.filters.trackRatingMax;
    const billboardRankMin = request.filters.billboardRankMin;
    const billboardRankMax = request.filters.billboardRankMax;
    const billboardSingleRankMin = request.filters.billboardSingleRankMin;
    const billboardSingleRankMax = request.filters.billboardSingleRankMax;
    const billboardSingleDebutDateFrom =
      request.filters.billboardSingleDebutDateFrom;
    const billboardSingleDebutDateTo =
      request.filters.billboardSingleDebutDateTo;
    const billboardDebutWeekFrom = request.filters.billboardDebutWeekFrom;
    const billboardDebutWeekTo = request.filters.billboardDebutWeekTo;
    const vgListaRankMin = request.filters.vgListaRankMin;
    const vgListaRankMax = request.filters.vgListaRankMax;
    const vgListaDebutWeekFrom = request.filters.vgListaDebutWeekFrom;
    const vgListaDebutWeekTo = request.filters.vgListaDebutWeekTo;
    const officialUkRankMin = request.filters.officialUkRankMin;
    const officialUkRankMax = request.filters.officialUkRankMax;
    const officialUkDebutWeekFrom = request.filters.officialUkDebutWeekFrom;
    const officialUkDebutWeekTo = request.filters.officialUkDebutWeekTo;
    const tiISkuddetRankMin = request.filters.tiISkuddetRankMin;
    const tiISkuddetRankMax = request.filters.tiISkuddetRankMax;
    const tiISkuddetDebutWeekFrom =
      request.filters.tiISkuddetDebutWeekFrom;
    const tiISkuddetDebutWeekTo = request.filters.tiISkuddetDebutWeekTo;
    const norsktoppenRankMin = request.filters.norsktoppenRankMin;
    const norsktoppenRankMax = request.filters.norsktoppenRankMax;
    const norsktoppenDebutWeekFrom = request.filters.norsktoppenDebutWeekFrom;
    const norsktoppenDebutWeekTo = request.filters.norsktoppenDebutWeekTo;
    const lovedTracksMin = request.filters.lovedTracksMin;
    const lovedTracksMax = request.filters.lovedTracksMax;
    const ratingCompletenessMin = normalizePercentFilter(
      request.filters.ratingCompletenessMin,
    );
    const ratingCompletenessMax = normalizePercentFilter(
      request.filters.ratingCompletenessMax,
    );
    const rows = mockRows.filter((row) => {
      const matchesView = isTracks
        ? row.trackId !== null
        : row.trackId === null;
      const artistKey = normalizeArtistKey(row.albumArtistDisplay);
      const genreKey = normalizeGenreKey(row.canonicalGenre);
      const ratedTracks = row.ratedTracks ?? 0;
      const ratingCompleteness = row.ratingCompleteness ?? 0;
      const artistInfo = mockArtistInfoForArtist(row.albumArtistDisplay);
      const lovedTracks = isTracks
        ? row.love === "L"
          ? 1
          : 0
        : (row.lovedTracks ?? 0);
      return (
        matchesView &&
        (albumIds.size === 0 || albumIds.has(row.albumId)) &&
        (!isTracks || trackIds.size === 0 || (row.trackId != null && trackIds.has(row.trackId))) &&
        (artistKeys.size === 0 || artistKeys.has(artistKey)) &&
        (genreKeys.size === 0 || genreKeys.has(genreKey)) &&
        !excludedGenreKeys.has(genreKey) &&
        (originCountryCodes.size === 0 ||
          originCountryCodes.has(
            (row.originCountryCode ?? "").trim().toUpperCase(),
          )) &&
        !excludedOriginCountryCodes.has(
          (row.originCountryCode ?? "").trim().toUpperCase(),
        ) &&
        (!request.filters.missingOriginCountry || !row.originCountryCode) &&
        matchesArtistInfoFilters(artistInfo, request.filters) &&
        matchesNumberRange(row.year, yearFrom, yearTo) &&
        matchesNumberRange(row.releaseYear, releaseYearFrom, releaseYearTo) &&
        matchesIsoWeekRange(
          row.billboardDebutWeekKey,
          row.billboardDebutYear,
          row.billboardDebutWeek,
          billboardDebutWeekFrom,
          billboardDebutWeekTo,
        ) &&
        matchesMinuteRange(
          isTracks ? row.trackSeconds : row.totalSeconds,
          totalMinutesMin,
          totalMinutesMax,
        ) &&
        matchesNumberRange(row.totalTracks, trackCountMin, trackCountMax) &&
        matchesNumberRange(ratedTracks, ratedTracksMin, ratedTracksMax) &&
        matchesNumberRange(
          row.effectiveAlbumRating,
          albumRatingMin,
          albumRatingMax,
        ) &&
        matchesTrackRatingRange(
          row,
          isTracks,
          trackRatingMin,
          trackRatingMax,
        ) &&
        matchesNumberRange(
          row.billboardRank,
          billboardRankMin,
          billboardRankMax,
        ) &&
        (!isTracks ||
          matchesNumberRange(
            row.billboardSingleRank,
            billboardSingleRankMin,
            billboardSingleRankMax,
          )) &&
        (!isTracks ||
          matchesIsoDateRange(
            row.billboardSingleDebutDate,
            billboardSingleDebutDateFrom,
            billboardSingleDebutDateTo,
          )) &&
        matchesNumberRange(
          row.vgListaRank,
          vgListaRankMin,
          vgListaRankMax,
        ) &&
        matchesIsoWeekRange(
          row.vgListaDebutWeekKey,
          row.vgListaDebutYear,
          row.vgListaDebutWeek,
          vgListaDebutWeekFrom,
          vgListaDebutWeekTo,
        ) &&
        matchesNumberRange(
          row.officialUkRank,
          officialUkRankMin,
          officialUkRankMax,
        ) &&
        matchesIsoWeekRange(
          row.officialUkDebutWeekKey,
          row.officialUkDebutYear,
          row.officialUkDebutWeek,
          officialUkDebutWeekFrom,
          officialUkDebutWeekTo,
        ) &&
        (!isTracks ||
          matchesNumberRange(
            row.tiISkuddetRank,
            tiISkuddetRankMin,
            tiISkuddetRankMax,
          )) &&
        (!isTracks ||
          matchesIsoWeekRange(
            row.tiISkuddetDebutWeekKey,
            row.tiISkuddetDebutYear,
            row.tiISkuddetDebutWeek,
            tiISkuddetDebutWeekFrom,
            tiISkuddetDebutWeekTo,
          )) &&
        (!isTracks ||
          matchesNumberRange(
            row.norsktoppenRank,
            norsktoppenRankMin,
            norsktoppenRankMax,
          )) &&
        (!isTracks ||
          matchesIsoWeekRange(
            row.norsktoppenDebutWeekKey,
            row.norsktoppenDebutYear,
            row.norsktoppenDebutWeek,
            norsktoppenDebutWeekFrom,
            norsktoppenDebutWeekTo,
          )) &&
        (lovedTracksMin == null || lovedTracks >= lovedTracksMin) &&
        (lovedTracksMax == null || lovedTracks <= lovedTracksMax) &&
        (ratingCompletenessMin == null ||
          ratingCompleteness >= ratingCompletenessMin) &&
        (ratingCompletenessMax == null ||
          ratingCompleteness <= ratingCompletenessMax) &&
        (!request.filters.notFullyRated || ratingCompleteness < 1) &&
        matchesMissingFields(row, isTracks, request.filters.missingFields)
      );
    });
    const sorted = [...rows];
    if (request.sort.field === "random") {
      for (let index = sorted.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [sorted[index], sorted[swapIndex]] = [sorted[swapIndex], sorted[index]];
      }
    } else {
      sorted.sort((left, right) =>
        compareBrowseRows(left, right, request.sort.field),
      );
      if (request.sort.direction === "desc") {
        sorted.reverse();
      }
    }
    return {
      view: request.view,
      rows: sorted.slice(request.offset, request.offset + request.limit),
      total: sorted.length,
      limit: request.limit,
      offset: request.offset,
    } satisfies BrowseResponse;
  }

  return invoke<BrowseResponse>("search_library", { request });
}

export async function listArtists(request: ArtistListRequest) {
  if (!isTauriRuntime()) {
    const searchText = request.searchText.trim().toLowerCase();
    const filtered = mockArtists.filter((artist) =>
      artist.name.toLowerCase().includes(searchText),
    );
    const sorted = [...filtered].sort((left, right) =>
      compareArtists(left, right, request.sort.field),
    );
    if (request.sort.direction === "desc") {
      sorted.reverse();
    }
    return {
      rows: sorted.slice(request.offset, request.offset + request.limit),
      total: sorted.length,
      limit: request.limit,
      offset: request.offset,
    } satisfies ArtistListResponse;
  }

  return invoke<ArtistListResponse>("list_artists", { request });
}

export async function listGenres(request: GenreListRequest) {
  if (!isTauriRuntime()) {
    const searchText = request.searchText.trim().toLowerCase();
    const filtered = mockGenres.filter((genre) =>
      genre.name.toLowerCase().includes(searchText),
    );
    const sorted = [...filtered].sort((left, right) =>
      compareGenres(left, right, request.sort.field),
    );
    if (request.sort.direction === "desc") {
      sorted.reverse();
    }
    return {
      rows: sorted.slice(request.offset, request.offset + request.limit),
      total: sorted.length,
      limit: request.limit,
      offset: request.offset,
    } satisfies GenreListResponse;
  }

  return invoke<GenreListResponse>("list_genres", { request });
}

export async function listGenreSuggestions() {
  if (!isTauriRuntime()) {
    return mockGenres.map((genre) => genre.name);
  }

  return invoke<string[]>("list_genre_suggestions");
}

export async function listMusicTools() {
  if (!isTauriRuntime()) {
    return mockMusicTools;
  }

  return invoke<MusicToolSummary[]>("list_music_tools");
}

export async function listMusicToolIssues(request: MusicToolIssueRequest) {
  if (!isTauriRuntime()) {
    const searchText = request.searchText.trim().toLowerCase();
    const tool =
      mockMusicTools.find((item) => item.id === request.toolId) ??
      mockMusicTools[0];
    const filtered = mockMusicToolIssues.filter((issue) => {
      if (issue.toolId !== tool.id) {
        return false;
      }
      if (!searchText) {
        return true;
      }
      return [
        issue.album,
        issue.albumArtistDisplay,
        issue.title,
        issue.canonicalGenre,
        issue.detail,
        issue.value,
        issue.filename,
        issue.filePath,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(searchText);
    });
    const sorted = [...filtered].sort((left, right) =>
      compareMusicToolIssues(left, right, request.sort.field),
    );
    if (request.sort.direction === "desc") {
      sorted.reverse();
    }
    return {
      tool,
      rows: sorted.slice(request.offset, request.offset + request.limit),
      total: sorted.length,
      limit: request.limit,
      offset: request.offset,
    } satisfies MusicToolIssueResponse;
  }

  return invoke<MusicToolIssueResponse>("list_music_tool_issues", { request });
}

export async function fixMusicToolIssues(input: MusicToolFixRequest) {
  if (!isTauriRuntime()) {
    const requestedIds = new Set(input.issueIds);
    const fixableRows = mockMusicToolIssues.filter(
      (issue) =>
        issue.toolId === "whitespace-anomalies" &&
        issue.toolId === input.toolId &&
        requestedIds.has(issue.id),
    );
    if (input.toolId !== "whitespace-anomalies") {
      throw new Error(
        `No fix action is available for this music tool yet: ${input.toolId}`,
      );
    }

    const compact = (value: string | null | undefined) =>
      value == null ? null : value.replace(/\s+/g, " ");
    const countLabel = (count: number, singular: string, plural: string) =>
      `${count} ${count === 1 ? singular : plural}`;
    const diffs: MusicToolFixDiff[] = fixableRows.flatMap((issue) => {
      const trackCandidates: Array<
        [string, string, string | null | undefined]
      > = [
        ["album_artist_display", "Album artist", issue.albumArtistDisplay],
        ["album", "Album", issue.album],
        ["title", "Track title", issue.title],
        ["canonical_genre", "Canonical genre", issue.canonicalGenre],
        ["file_path", "File path", issue.filePath],
        ["filename", "Filename", issue.filename],
      ];
      const trackChanges = trackCandidates.flatMap(
        ([field, label, before]) => {
          const after = compact(before);
          return before !== after
            ? [{ field, label, before: before ?? null, after }]
            : [];
        },
      );
      const albumCandidates: Array<
        [string, string, string | null | undefined]
      > = [
        ["album_artist_display", "Album artist", issue.albumArtistDisplay],
        ["album", "Album", issue.album],
        ["canonical_genre", "Canonical genre", issue.canonicalGenre],
      ];
      const albumChanges = albumCandidates.flatMap(
        ([field, label, before]) => {
          const after = compact(before);
          return before !== after
            ? [{ field, label, before: before ?? null, after }]
            : [];
        },
      );
      return [
        ...(trackChanges.length > 0
          ? [
              {
                id: `tracks:${issue.trackId}`,
                entityType: "tracks" as const,
                entityId: String(issue.trackId),
                albumId: issue.albumId,
                trackId: issue.trackId,
                label: issue.title ?? issue.filename ?? "Affected track",
                context: [issue.albumArtistDisplay, issue.album]
                  .filter(Boolean)
                  .join(" / "),
                confidence: "high" as const,
                sourceWarning: mockMusicToolSourceWarning,
                changes: trackChanges,
              },
            ]
          : []),
        ...(albumChanges.length > 0
          ? [
              {
                id: `albums:${issue.albumId}`,
                entityType: "albums" as const,
                entityId: issue.albumId,
                albumId: issue.albumId,
                trackId: null,
                label: issue.album ?? "Affected album",
                context: issue.albumArtistDisplay,
                confidence: "high" as const,
                sourceWarning: `Derived app-local album metadata will be updated. ${mockMusicToolSourceWarning}`,
                changes: albumChanges,
              },
            ]
          : []),
      ];
    });
    const repairId =
      input.apply && fixableRows.length > 0
        ? mockMusicToolFixSequence++
        : null;
    if (input.apply) {
      setMockMusicToolIssues(
        mockMusicToolIssues.filter(
          (issue) =>
            !(issue.toolId === input.toolId && requestedIds.has(issue.id)),
        ),
      );
      setMockMusicTools(
        mockMusicTools.map((tool) =>
          tool.id === input.toolId
            ? {
                ...tool,
                issueCount: Math.max(0, tool.issueCount - fixableRows.length),
                albumCount: fixableRows.length > 0 ? 0 : tool.albumCount,
                trackCount: Math.max(0, tool.trackCount - fixableRows.length),
              }
            : tool,
          ),
      );
      if (repairId != null) {
        const now = new Date().toISOString();
        const message = `Compacted whitespace for ${countLabel(fixableRows.length, "track", "tracks")} and ${countLabel(fixableRows.length > 0 ? 1 : 0, "album", "albums")}.`;
        mockMusicToolFixSnapshots.set(repairId, {
          issues: fixableRows.map((issue) => ({ ...issue })),
          diffs,
        });
        mockMusicToolFixHistory = [
          {
            id: repairId,
            toolId: input.toolId,
            toolLabel: "Whitespace anomalies",
            action: "compact-whitespace",
            status: "applied",
            confidence: "high",
            requestedCount: requestedIds.size,
            fixableCount: fixableRows.length,
            affectedAlbumCount: new Set(
              fixableRows.map((issue) => issue.albumId),
            ).size,
            affectedTrackCount: new Set(
              fixableRows
                .map((issue) => issue.trackId)
                .filter((trackId) => trackId != null),
            ).size,
            changedAlbumCount: fixableRows.length > 0 ? 1 : 0,
            changedTrackCount: fixableRows.length,
            diffCount: diffs.length,
            backupPath: null,
            undoBackupPath: null,
            sourceWarning: mockMusicToolSourceWarning,
            message,
            createdAt: now,
            undoneAt: null,
            canUndo: true,
          },
          ...mockMusicToolFixHistory,
        ];
      }
    }

    return {
      repairId,
      toolId: input.toolId,
      action: "compact-whitespace",
      applied: input.apply,
      confidence: "high",
      sourceWarning: mockMusicToolSourceWarning,
      requestedCount: requestedIds.size,
      fixableCount: fixableRows.length,
      affectedAlbumCount: new Set(fixableRows.map((issue) => issue.albumId))
        .size,
      affectedTrackCount: new Set(
        fixableRows
          .map((issue) => issue.trackId)
          .filter((trackId) => trackId != null),
      ).size,
      changedAlbumCount: input.apply && fixableRows.length > 0 ? 1 : 0,
      changedTrackCount: input.apply ? fixableRows.length : 0,
      skippedCount: Math.max(0, requestedIds.size - fixableRows.length),
      backupPath: null,
      message: input.apply
        ? `Compacted whitespace for ${countLabel(fixableRows.length, "track", "tracks")} and ${countLabel(fixableRows.length > 0 ? 1 : 0, "album", "albums")}.`
        : `Preview found ${countLabel(fixableRows.length, "visible issue row", "visible issue rows")} across ${countLabel(diffs.length, "exact affected-row diff", "exact affected-row diffs")}.`,
      diffs,
    } satisfies MusicToolFixSummary;
  }

  return invoke<MusicToolFixSummary>("fix_music_tool_issues", { input });
}

function matchesIsoDateRange(
  value: string | null | undefined,
  minimum: string | null | undefined,
  maximum: string | null | undefined,
) {
  if (minimum == null && maximum == null) {
    return true;
  }
  if (!value) {
    return false;
  }
  return (minimum == null || value >= minimum) && (maximum == null || value <= maximum);
}

export async function listMusicToolFixHistory(toolId?: string) {
  if (!isTauriRuntime()) {
    return mockMusicToolFixHistory.filter(
      (entry) => !toolId || entry.toolId === toolId,
    );
  }

  return invoke<MusicToolFixHistoryEntry[]>("list_music_tool_fix_history", {
    toolId: toolId ?? null,
  });
}

export async function undoMusicToolFix(runId: number) {
  if (!isTauriRuntime()) {
    const index = mockMusicToolFixHistory.findIndex(
      (entry) => entry.id === runId,
    );
    const history = mockMusicToolFixHistory[index];
    const snapshot = mockMusicToolFixSnapshots.get(runId);
    if (!history || history.status !== "applied" || !snapshot) {
      throw new Error("This Music Tool repair is no longer available to undo.");
    }

    const restoredIds = new Set(snapshot.issues.map((issue) => issue.id));
    setMockMusicToolIssues([
      ...mockMusicToolIssues.filter((issue) => !restoredIds.has(issue.id)),
      ...snapshot.issues.map((issue) => ({ ...issue })),
    ]);
    setMockMusicTools(
      mockMusicTools.map((tool) =>
        tool.id === history.toolId
          ? {
              ...tool,
              issueCount: tool.issueCount + snapshot.issues.length,
              albumCount:
                tool.albumCount +
                new Set(snapshot.issues.map((issue) => issue.albumId)).size,
              trackCount:
                tool.trackCount +
                new Set(
                  snapshot.issues
                    .map((issue) => issue.trackId)
                    .filter((trackId) => trackId != null),
                ).size,
            }
          : tool,
      ),
    );
    const countLabel = (count: number, singular: string, plural: string) =>
      `${count} ${count === 1 ? singular : plural}`;
    const message = `Restored ${countLabel(history.changedTrackCount, "track", "tracks")} and ${countLabel(history.changedAlbumCount, "album", "albums")} from repair #${runId}.`;
    const undone: MusicToolFixHistoryEntry = {
      ...history,
      status: "undone",
      message,
      undoneAt: new Date().toISOString(),
      canUndo: false,
    };
    mockMusicToolFixHistory = mockMusicToolFixHistory.map((entry) =>
      entry.id === runId ? undone : entry,
    );
    mockMusicToolFixSnapshots.delete(runId);
    return {
      run: undone,
      restoredAlbumCount: history.changedAlbumCount,
      restoredTrackCount: history.changedTrackCount,
      backupPath: null,
      message,
    } satisfies MusicToolUndoSummary;
  }

  return invoke<MusicToolUndoSummary>("undo_music_tool_fix", { runId });
}

export async function listSavedSearches() {
  if (!isTauriRuntime()) {
    return normalizeSavedSearchesForClient(mockSavedSearches);
  }

  return normalizeSavedSearchesForClient(
    await invoke<SavedSearch[]>("list_saved_searches"),
  );
}

export async function saveSearch(name: string, request: BrowseRequest) {
  if (!isTauriRuntime()) {
    const now = new Date().toISOString();
    const saved = {
      id: Date.now(),
      name,
      view: request.view,
      request,
      createdAt: now,
      updatedAt: now,
    } satisfies SavedSearch;
    setMockSavedSearches([saved, ...mockSavedSearches]);
    return normalizeSavedSearchForClient(saved);
  }

  return normalizeSavedSearchForClient(
    await invoke<SavedSearch>("save_search", { input: { name, request } }),
  );
}

export async function deleteSavedSearch(id: number) {
  if (!isTauriRuntime()) {
    setMockSavedSearches(
      mockSavedSearches.filter((search) => search.id !== id),
    );
    return;
  }

  return invoke<void>("delete_saved_search", { id });
}

export async function listSavedCharts() {
  if (!isTauriRuntime()) {
    return normalizeSavedChartsForClient(mockSavedCharts);
  }

  return normalizeSavedChartsForClient(
    await invoke<SavedChart[]>("list_saved_charts"),
  );
}

export async function saveChart(name: string, config: ChartConfig) {
  if (!isTauriRuntime()) {
    const now = new Date().toISOString();
    const saved = {
      id: Date.now(),
      name,
      config,
      createdAt: now,
      updatedAt: now,
    } satisfies SavedChart;
    setMockSavedCharts([saved, ...mockSavedCharts]);
    return normalizeSavedChartForClient(saved);
  }

  return normalizeSavedChartForClient(
    await invoke<SavedChart>("save_chart", { input: { name, config } }),
  );
}

export async function deleteSavedChart(id: number) {
  if (!isTauriRuntime()) {
    setMockSavedCharts(mockSavedCharts.filter((chart) => chart.id !== id));
    return;
  }

  return invoke<void>("delete_saved_chart", { id });
}

export async function exportSearch(
  request: BrowseRequest,
  format: string,
  includeCalculated: boolean,
  exportColumns: string[] = [],
) {
  if (!isTauriRuntime()) {
    return finalizeExport({
      path: `Preview runtime export.${format}`,
      format,
      rowCount: mockRows.filter((row) =>
        request.view === "tracks" ? row.trackId !== null : row.trackId === null,
      ).length,
    } satisfies RawExportResult);
  }

  return finalizeExport(
    await invoke<RawExportResult>("export_search", {
      input: { request, format, includeCalculated, exportColumns },
    }),
  );
}

export async function exportMusicToolIssues(
  request: MusicToolIssueRequest,
  format: string,
) {
  if (!isTauriRuntime()) {
    const normalizedSearch = request.searchText.trim().toLowerCase();
    const rowCount = mockMusicToolIssues.filter((issue) => {
      if (issue.toolId !== request.toolId) {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }
      return [
        issue.album,
        issue.albumArtistDisplay,
        issue.title,
        issue.canonicalGenre,
        issue.detail,
        issue.value,
        issue.filename,
        issue.filePath,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    }).length;
    return finalizeExport({
      path: `Preview runtime tools export.${format}`,
      format,
      rowCount,
    } satisfies RawExportResult);
  }

  return finalizeExport(
    await invoke<RawExportResult>("export_music_tool_issues", {
      input: { request, format },
    }),
  );
}

export async function exportMusicBrainzArtistReleases(
  request: Omit<MusicBrainzArtistExportRequest, "format">,
  format: string,
) {
  const visibleRows = request.rows.filter((row) => row.status !== "excluded");

  if (!isTauriRuntime()) {
    return finalizeExport({
      path: `Preview runtime MusicBrainz artist export.${format}`,
      format,
      rowCount: visibleRows.length,
    } satisfies RawExportResult);
  }

  return finalizeExport(
    await invoke<RawExportResult>("export_musicbrainz_artist_releases", {
      input: { ...request, rows: visibleRows, format },
    }),
  );
}

export async function listenToImportProgress(
  handler: (progress: ImportProgress) => void,
) {
  if (!isTauriRuntime()) {
    mockImportProgressHandlers.add(handler);
    return (() => mockImportProgressHandlers.delete(handler)) satisfies UnlistenFn;
  }

  return listen<ImportProgress>("import-progress", (event) => {
    handler(event.payload);
  });
}

export async function listenToDeemixDownloadProgress(
  handler: (progress: DeemixAlbumDownloadProgress) => void,
) {
  if (!isTauriRuntime()) {
    mockDeemixDownloadProgressHandlers.add(handler);
    return (() => {
      mockDeemixDownloadProgressHandlers.delete(handler);
    }) satisfies UnlistenFn;
  }

  return listen<DeemixAlbumDownloadProgress>(
    "deemix-download-progress",
    (event) => {
      handler(event.payload);
    },
  );
}

export async function listenToSoulseekConnection(
  handler: (snapshot: SoulseekConnectionSnapshot) => void,
) {
  if (!isTauriRuntime()) return (() => undefined) satisfies UnlistenFn;
  return listen<SoulseekConnectionSnapshot>("music-library://soulseek-connection", (event) => {
    handler(event.payload);
  });
}

export async function listenToSoulseekTransfers(
  handler: (snapshot: SoulseekTransferQueue) => void,
) {
  if (!isTauriRuntime()) {
    mockSoulseekTransferHandlers.add(handler);
    return (() => mockSoulseekTransferHandlers.delete(handler)) satisfies UnlistenFn;
  }
  return listen<SoulseekTransferQueue>("music-library://soulseek-transfers", (event) => {
    handler(event.payload);
  });
}

export async function listenToSoulseekLocalShares(
  handler: (snapshot: SoulseekLocalShares) => void,
) {
  if (!isTauriRuntime()) return (() => undefined) satisfies UnlistenFn;
  return listen<SoulseekLocalShares>("music-library://soulseek-local-shares", (event) => {
    handler(event.payload);
  });
}

export async function listenToSoulseekUploads(
  handler: (snapshot: SoulseekUploadQueue) => void,
) {
  if (!isTauriRuntime()) return (() => undefined) satisfies UnlistenFn;
  return listen<SoulseekUploadQueue>("music-library://soulseek-uploads", (event) => {
    handler(event.payload);
  });
}

export async function listenToCoverImportProgress(
  handler: (progress: CoverImportProgress) => void,
) {
  if (!isTauriRuntime()) {
    return (() => undefined) satisfies UnlistenFn;
  }

  return listen<CoverImportProgress>("cover-import-progress", (event) => {
    handler(event.payload);
  });
}

export async function listenToMusicBrainzOriginCountryImportProgress(
  handler: (progress: MusicBrainzOriginCountryImportProgress) => void,
) {
  if (!isTauriRuntime()) {
    mockOriginProgressHandlers.add(handler);
    return (() => {
      mockOriginProgressHandlers.delete(handler);
    }) satisfies UnlistenFn;
  }

  return listen<MusicBrainzOriginCountryImportProgress>(
    "musicbrainz-origin-country-import-progress",
    (event) => {
      handler(event.payload);
    },
  );
}

export async function listenToMusicBrainzArtistInfoImportProgress(
  handler: (progress: MusicBrainzArtistInfoImportProgress) => void,
) {
  if (!isTauriRuntime()) {
    mockArtistInfoProgressHandlers.add(handler);
    return (() => {
      mockArtistInfoProgressHandlers.delete(handler);
    }) satisfies UnlistenFn;
  }

  return listen<MusicBrainzArtistInfoImportProgress>(
    "musicbrainz-artist-info-import-progress",
    (event) => {
      handler(event.payload);
    },
  );
}

export async function listenToMusicToolProgress(
  handler: (progress: MusicToolProgress) => void,
) {
  if (!isTauriRuntime()) {
    return (() => undefined) satisfies UnlistenFn;
  }

  return listen<MusicToolProgress>("music-tool-progress", (event) => {
    handler(event.payload);
  });
}

function normalizeGenreKey(value: string | null) {
  const normalized = (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return normalized || "unknown";
}

function expandGenreFilterKeys(values: string[]) {
  const keys: string[] = [];
  values.forEach((value) => {
    const key = normalizeGenreKey(value);
    if (key === "unknown") {
      return;
    }
    if (isScoreGenreGroupAlias(key)) {
      scoreGenreGroup.forEach((genre) => addUnique(keys, genre));
    } else {
      addUnique(keys, key);
    }
  });
  return keys;
}

function isScoreGenreGroupAlias(value: string) {
  return value === "score" || value === "scores";
}

function addUnique(values: string[], value: string) {
  if (!values.includes(value)) {
    values.push(value);
  }
}

function isMissingText(value: string | null) {
  return (value ?? "").trim() === "";
}

function normalizePercentFilter(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  return value > 1
    ? Math.min(1, Math.max(0, value / 100))
    : Math.min(1, Math.max(0, value));
}

function matchesNumberRange(
  value: number | null | undefined,
  minimum: number | null | undefined,
  maximum: number | null | undefined,
) {
  if (minimum == null && maximum == null) {
    return true;
  }
  if (value == null || !Number.isFinite(value)) {
    return false;
  }
  return (
    (minimum == null || value >= minimum) &&
    (maximum == null || value <= maximum)
  );
}

function matchesIsoWeekRange(
  weekKey: string | null | undefined,
  year: number | null | undefined,
  week: number | null | undefined,
  minimum: string | null | undefined,
  maximum: string | null | undefined,
) {
  if (!minimum && !maximum) return true;
  const value =
    weekKey ??
    (year == null || week == null
      ? null
      : `${year.toString().padStart(4, "0")}-W${week.toString().padStart(2, "0")}`);
  if (!value) return false;
  return (!minimum || value >= minimum) && (!maximum || value <= maximum);
}

function normalizedArtistInfoValue(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function hasYearRange(
  minimum: number | null | undefined,
  maximum: number | null | undefined,
) {
  return minimum != null || maximum != null;
}

function artistInfoEnded(info: MusicBrainzArtistInfoFields) {
  return (
    Boolean(info.musicBrainzEnded) ||
    info.musicBrainzEndYear != null ||
    Boolean(info.musicBrainzEndDate?.trim())
  );
}

function matchesArtistInfoFilters(
  info: MusicBrainzArtistInfoFields,
  filters: BrowseFilters,
) {
  const artistType = normalizedArtistInfoValue(info.musicBrainzArtistType);
  const artistGender = normalizedArtistInfoValue(info.musicBrainzGender);
  const typeFilter = normalizedArtistInfoValue(filters.artistType);
  const genderFilter = normalizedArtistInfoValue(filters.artistGender);
  const bornRange = hasYearRange(
    filters.artistBornYearFrom,
    filters.artistBornYearTo,
  );
  const diedRange = hasYearRange(
    filters.artistDiedYearFrom,
    filters.artistDiedYearTo,
  );
  const foundedRange = hasYearRange(
    filters.artistFoundedYearFrom,
    filters.artistFoundedYearTo,
  );
  const dissolvedRange = hasYearRange(
    filters.artistDissolvedYearFrom,
    filters.artistDissolvedYearTo,
  );

  return (
    (!typeFilter || artistType === typeFilter) &&
    (!genderFilter || artistGender === genderFilter) &&
    (!bornRange ||
      (artistType === "person" &&
        matchesNumberRange(
          info.musicBrainzBeginYear,
          filters.artistBornYearFrom,
          filters.artistBornYearTo,
        ))) &&
    (!filters.artistDied ||
      (artistType === "person" && artistInfoEnded(info))) &&
    (!diedRange ||
      (artistType === "person" &&
        matchesNumberRange(
          info.musicBrainzEndYear,
          filters.artistDiedYearFrom,
          filters.artistDiedYearTo,
        ))) &&
    (!foundedRange ||
      (artistType === "group" &&
        matchesNumberRange(
          info.musicBrainzBeginYear,
          filters.artistFoundedYearFrom,
          filters.artistFoundedYearTo,
        ))) &&
    (!filters.artistDissolved ||
      (artistType === "group" && artistInfoEnded(info))) &&
    (!dissolvedRange ||
      (artistType === "group" &&
        matchesNumberRange(
          info.musicBrainzEndYear,
          filters.artistDissolvedYearFrom,
          filters.artistDissolvedYearTo,
        )))
  );
}

function matchesMinuteRange(
  seconds: number | null | undefined,
  minimumMinutes: number | null | undefined,
  maximumMinutes: number | null | undefined,
) {
  return matchesNumberRange(
    seconds,
    minimumMinutes == null ? null : Math.round(minimumMinutes * 60),
    maximumMinutes == null ? null : Math.round(maximumMinutes * 60),
  );
}

function matchesTrackRatingRange(
  row: BrowseRow,
  isTracks: boolean,
  minimum: number | null | undefined,
  maximum: number | null | undefined,
) {
  if (minimum == null && maximum == null) {
    return true;
  }

  const minimumPoints = minimum == null ? null : minimum * 20;
  const maximumPoints = maximum == null ? null : maximum * 20;
  if (isTracks) {
    return matchesNumberRange(
      row.normalizedRating,
      minimumPoints,
      maximumPoints,
    );
  }

  const albumTracks = mockRows.filter(
    (track) => track.trackId != null && track.albumId === row.albumId,
  );
  if (albumTracks.length === 0) {
    return true;
  }
  return albumTracks.some((track) =>
    matchesNumberRange(track.normalizedRating, minimumPoints, maximumPoints),
  );
}

function matchesMissingFields(
  row: BrowseRow,
  isTracks: boolean,
  fields: string[],
) {
  return fields.every((field) => {
    switch (field) {
      case "album":
        return isMissingText(row.album);
      case "albumArtist":
        return isMissingText(row.albumArtistDisplay);
      case "genre":
        return isMissingText(row.canonicalGenre);
      case "year":
        return row.year == null;
      case "billboard":
        return row.billboardRank == null;
      case "billboardSingle":
        return isTracks ? row.billboardSingleRank == null : true;
      case "billboardSingleDebut":
        return isTracks ? row.billboardSingleDebutDate == null : true;
      case "vgLista":
        return row.vgListaRank == null;
      case "vgListaDebut":
        return row.vgListaDebutWeekKey == null;
      case "officialUk":
        return row.officialUkRank == null;
      case "officialUkDebut":
        return row.officialUkDebutWeekKey == null;
      case "tiISkuddet":
        return isTracks ? row.tiISkuddetRank == null : true;
      case "tiISkuddetDebut":
        return isTracks ? row.tiISkuddetDebutWeekKey == null : true;
      case "norsktoppen":
        return isTracks ? row.norsktoppenRank == null : true;
      case "norsktoppenDebut":
        return isTracks ? row.norsktoppenDebutWeekKey == null : true;
      case "rating":
        return isTracks
          ? row.normalizedRating == null
          : row.effectiveAlbumRating == null;
      case "time":
        return isTracks
          ? row.trackSeconds == null
          : (row.totalSeconds ?? 0) <= 0;
      default:
        return true;
    }
  });
}

function compareBrowseRows(left: BrowseRow, right: BrowseRow, field: string) {
  const leftValue = browseSortValue(left, field);
  const rightValue = browseSortValue(right, field);
  if (typeof leftValue === "string" || typeof rightValue === "string") {
    return String(leftValue).localeCompare(String(rightValue));
  }
  return (leftValue ?? 0) - (rightValue ?? 0);
}

function browseSortValue(row: BrowseRow, field: string) {
  switch (field) {
    case "title":
      return row.title?.toLowerCase() ?? "";
    case "displayArtist":
      return row.displayArtist?.toLowerCase() ?? "";
    case "artist":
      return row.albumArtistDisplay?.toLowerCase() ?? "";
    case "year":
      return row.year;
    case "genre":
      return row.canonicalGenre?.toLowerCase() ?? "";
    case "originCountry":
      return (
        row.originCountryName ||
        row.originCountryCode ||
        ""
      ).toLowerCase();
    case "billboardRank":
      return row.billboardRank;
    case "billboardSingleRank":
      return row.billboardSingleRank;
    case "billboardSingleDebut":
      return row.billboardSingleDebutDate;
    case "vgListaRank":
      return row.vgListaRank;
    case "vgListaDebut":
      return row.vgListaDebutWeekKey;
    case "officialUkRank":
      return row.officialUkRank;
    case "officialUkDebut":
      return row.officialUkDebutWeekKey;
    case "tiISkuddetRank":
      return row.tiISkuddetRank;
    case "tiISkuddetDebut":
      return row.tiISkuddetDebutWeekKey;
    case "norsktoppenRank":
      return row.norsktoppenRank;
    case "norsktoppenDebut":
      return row.norsktoppenDebutWeekKey;
    case "trackRating":
      return row.normalizedRating;
    case "time":
      return row.trackSeconds;
    case "trackNumber":
      return (row.discNumber ?? 0) * 10000 + (row.trackNumber ?? 0);
    case "totalMinutes":
      return row.totalSeconds;
    case "trackCount":
      return row.totalTracks;
    case "albumRating":
      return row.effectiveAlbumRating;
    case "ratingCompleteness":
      return row.ratingCompleteness;
    case "lovedTracks":
      return row.lovedTracks;
    case "ae":
      return row.aeRatio;
    case "tmoe":
      return row.tmoeSeconds;
    case "albumScore":
      return row.albumScore;
    default:
      return row.album?.toLowerCase() ?? "";
  }
}

function compareArtists(
  left: ArtistSummary,
  right: ArtistSummary,
  field: string,
) {
  const leftValue = artistSortValue(left, field);
  const rightValue = artistSortValue(right, field);
  if (typeof leftValue === "string" || typeof rightValue === "string") {
    return String(leftValue).localeCompare(String(rightValue));
  }
  return (leftValue ?? 0) - (rightValue ?? 0);
}

function artistSortValue(artist: ArtistSummary, field: string) {
  switch (field) {
    case "albumCount":
      return artist.albumCount;
    case "trackCount":
      return artist.trackCount;
    case "lovedTracks":
      return artist.lovedTracks;
    case "totalMinutes":
      return artist.totalSeconds;
    case "averageCompleteness":
      return artist.averageRatingCompleteness;
    case "averageRating":
      return artist.averageAlbumRating;
    case "averageScore":
      return artist.averageAlbumScore;
    case "firstYear":
      return artist.firstYear;
    case "lastYear":
      return artist.lastYear;
    case "topGenre":
      return artist.topGenre ?? "";
    case "originCountry":
      return (
        artist.originCountryName ||
        artist.originCountryCode ||
        ""
      ).toLowerCase();
    default:
      return artist.name.toLowerCase();
  }
}

function compareGenres(left: GenreSummary, right: GenreSummary, field: string) {
  const leftValue = genreSortValue(left, field);
  const rightValue = genreSortValue(right, field);
  if (typeof leftValue === "string" || typeof rightValue === "string") {
    return String(leftValue).localeCompare(String(rightValue));
  }
  return (leftValue ?? 0) - (rightValue ?? 0);
}

function genreSortValue(genre: GenreSummary, field: string) {
  switch (field) {
    case "albumCount":
      return genre.albumCount;
    case "trackCount":
      return genre.trackCount;
    case "lovedTracks":
      return genre.lovedTracks;
    case "totalMinutes":
      return genre.totalSeconds;
    case "averageCompleteness":
      return genre.averageRatingCompleteness;
    case "averageRating":
      return genre.averageAlbumRating;
    case "averageScore":
      return genre.averageAlbumScore;
    case "firstYear":
      return genre.firstYear;
    case "lastYear":
      return genre.lastYear;
    case "topArtist":
      return genre.topArtist ?? "";
    default:
      return genre.name.toLowerCase();
  }
}

function compareMusicToolIssues(
  left: MusicToolIssueRow,
  right: MusicToolIssueRow,
  field: string,
) {
  const leftValue = musicToolIssueSortValue(left, field);
  const rightValue = musicToolIssueSortValue(right, field);
  if (typeof leftValue === "string" || typeof rightValue === "string") {
    return String(leftValue).localeCompare(String(rightValue));
  }
  return (leftValue ?? 0) - (rightValue ?? 0);
}

function musicToolIssueSortValue(issue: MusicToolIssueRow, field: string) {
  switch (field) {
    case "artist":
      return issue.albumArtistDisplay?.toLowerCase() ?? "";
    case "year":
      return issue.year;
    case "title":
      return issue.title?.toLowerCase() ?? "";
    case "severity":
      return issue.severity;
    case "value":
      return issue.value?.toLowerCase() ?? "";
    case "filename":
      return issue.filename?.toLowerCase() ?? "";
    case "detail":
      return issue.detail.toLowerCase();
    default:
      return issue.album?.toLowerCase() ?? "";
  }
}
