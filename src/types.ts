import type {
  AiKeySource,
  AiLibraryLens,
  AiMusicResearchEntity,
  AiPlaylistStrategy,
  AiQueryTarget,
  ArtistTimelineMetric,
  BrowseView,
  ChartViewMode,
  CountryFlagDisplay,
  DeemixCredentialSource,
  DeemixDownloadOrganization,
  DeemixDownloadQuality,
  DiscoveryChartSource,
  DiscoveryCompletionMode,
  DiscoveryMixerSeedKind,
  DiscoveryRecommendationMode,
  DiscoveryShelf,
  DiscoverySourceHealthAction,
  DiscoverySourceHealthState,
  ExternalDiscoveryEntity,
  LeftSidebarMode,
  LibraryCompletionConfidence,
  LibraryCompletionStatus,
  LibraryUpdateKind,
  MusicToolFixConfidence,
  MusicToolScope,
  MusicToolSeverity,
  RightSidebarMode,
  TextFilterOperator,
  UsenetTransferStatus,
  WishListEntity,
} from "./bindings";

// Types the backend sends or accepts come from Rust: `src/bindings.ts` is generated
// (`npm run bindings`) and the names below re-export it. Three shapes are used:
//   * plain re-exports;
//   * `Complete<...>` for request structs whose fields have serde defaults, because
//     the generated type marks those fields optional but the UI always builds them
//     in full (a few request types that callers genuinely build partially keep the
//     generated optional shape);
//   * `X = X_Serialize` for types that serialize differently from how they
//     deserialize (the shape the backend sends).
// Add new backend types in Rust, not here.
import type {
  AddWishListMusicBrainzCandidateResponse,
  AiCompileRequest,
  AiConnectionTest,
  AiCurrentViewAnswer,
  AiKeyStatus,
  AiLibraryAnalysis,
  AiLibraryFinding,
  AiMarkdownExportRequest,
  AiMusicResearchAnswer,
  AiMusicResearchExchange,
  AiMusicResearchSource,
  AiMusicResearchTurn,
  AiPlaylistTrack,
  AiQueryFollowUpContext,
  AiUsage,
  AlbumDebutTimelineAlbum,
  AlbumDebutTimelineResponse,
  AlbumDebutTimelineYear,
  AlbumReview,
  ArtistBiography,
  ArtistChartTrack,
  ArtistListResponse,
  ArtistLovedTrack,
  ArtistSummary,
  ArtistTimelineAlbum,
  ArtistTimelineArtist,
  ArtistTimelineResponse,
  ArtistTrackChartHistory,
  ArtistTrackHighlights,
  BillboardImportSummary,
  BillboardSinglesImportSummary,
  BrowseResponse,
  BrowseRow,
  CatalogConcentrationStats,
  ConcentrationPoint,
  ConfirmLibraryCompletionArtistMatchRequest,
  CountryCatalogStats,
  CoverImportSummary,
  DatabaseBackup,
  DatabaseRestoreSummary,
  DecadeProgressStats,
  DeemixAlbumDownloadPreflight,
  DeemixAlbumDownloadSummary,
  DeemixAlbumMatch,
  DeemixAlbumSearchResponse,
  DeemixConnectionTest,
  DeemixCredentialStatus,
  DiscogsConnectionTest,
  DiscogsCredentialStatus,
  DiscoveryAlbumCompletionStory,
  DiscoveryAlbumPoint,
  DiscoveryAnniversaryStory,
  DiscoveryArtistCompletionStory,
  DiscoveryArtistPoint,
  DiscoveryChartSnapshot,
  DiscoveryChartSnapshotRequest,
  DiscoveryChartStory,
  DiscoveryCompletionSnapshot,
  DiscoveryCompletionSnapshotRequest,
  DiscoveryDailyEdition,
  DiscoveryDailyEditionArchive,
  DiscoveryDailyEditionSnapshotResponse,
  DiscoveryDeepCutGenre,
  DiscoveryDeepCutSnapshot,
  DiscoveryDeepCutSnapshotRequest,
  DiscoveryDeepCutStory,
  DiscoveryGenrePoint,
  DiscoveryHeatmapCell,
  DiscoveryLifeEventStory,
  DiscoveryMission,
  DiscoveryMixerRecommendation,
  DiscoveryMixerRequest,
  DiscoveryMixerResponse,
  DiscoveryMixerSeedInput,
  DiscoveryMixerSeedOption,
  DiscoveryMixerSeedSearchRequest,
  DiscoveryRecommendationAnchor,
  DiscoveryRecommendationSnapshot,
  DiscoveryRecommendationSnapshotRequest,
  DiscoveryRecommendationStory,
  DiscoveryResponse,
  DiscoveryShelfExplorerRequest,
  DiscoveryShelfExplorerResponse,
  DiscoverySourceHealthItem,
  DiscoverySourceHealthResponse,
  DurationAlbumStat,
  DurationAnalyticsStats,
  ExternalDiscoveryItem,
  GenreListResponse,
  GenreProgressStats,
  GenreSummary,
  GenreTimelineAlbumPoint,
  GenreTimelineGenre,
  GenreTimelineResponse,
  GenreTimelineYearCount,
  ImportPreview,
  ImportRun,
  ImportSummary,
  ImportSuspiciousAlbum,
  LastFmAlbumPopularity,
  LastFmAlbumTrackPopularity,
  LastFmArtistImageRefreshSummary,
  LastFmArtistPopularity,
  LastFmArtistSimilarity,
  LastFmConnectionTest,
  LastFmCredentialStatus,
  LastFmPopularTrack,
  LastFmRelatedAlbum,
  LastFmRelatedAlbums,
  LastFmSimilarArtist,
  LibraryCompletionArtistCandidate,
  LibraryCompletionArtistDecision,
  LibraryCompletionArtistEvidence,
  LibraryCompletionArtistRequest,
  LibraryCompletionArtistResponse,
  LibraryCompletionArtistVerificationBatch,
  LibraryCompletionArtistVerificationItemSummary,
  LibraryCompletionArtistVerificationStatus,
  LibraryCompletionAtlasCell,
  LibraryCompletionCandidate,
  LibraryCompletionCoverEnrichment,
  LibraryCompletionDecision,
  LibraryCompletionEvidence,
  LibraryCompletionRequest,
  LibraryCompletionResponse,
  LibraryCompletionVerificationBatch,
  LibraryCompletionVerificationItemSummary,
  LibraryCompletionVerificationStatus,
  LibraryHealthScore,
  LibraryOverviewStats,
  LibraryShapeStats,
  LibraryStatus,
  LibraryUpdate,
  LibraryUpdateArtistResponse,
  LibraryUpdateArtistSummary,
  LibraryUpdateResponse,
  LibraryUpdateSummary,
  LovedDensityStat,
  LovedTrackStats,
  MetadataCoverageMetric,
  MusicBrainzArtistCandidateRow,
  MusicBrainzArtistDiscographyResponse,
  MusicBrainzArtistInfoImportRequest,
  MusicBrainzArtistInfoImportRun,
  MusicBrainzArtistInfoImportSummary,
  MusicBrainzArtistInfoPreview,
  MusicBrainzArtistInfoPreviewRow,
  MusicBrainzArtistInfoStatus,
  MusicBrainzArtistOriginCountryUpdate,
  MusicBrainzArtistOriginImportRun,
  MusicBrainzArtistRefreshResult,
  MusicBrainzArtistReleaseRow,
  MusicBrainzCacheStatus,
  MusicBrainzCacheWarningExample,
  MusicBrainzOriginCountryImportRequest,
  MusicBrainzOriginCountryImportSummary,
  MusicBrainzOriginCountryOption,
  MusicBrainzOriginCountryPreview,
  MusicBrainzOriginCountryPreviewRow,
  MusicBrainzOriginCountryStatus,
  MusicBrainzOverlaySyncLogEntry,
  MusicBrainzOverlaySyncResult,
  MusicDoctorBitrateStat,
  MusicDoctorFormatStat,
  MusicDoctorSource,
  MusicDoctorStatus,
  MusicDoctorSyncResult,
  MusicMapArtist,
  MusicMapGenreStat,
  MusicMapLocationDetails,
  MusicMapPoint,
  MusicMapRefreshSummary,
  MusicMapResponse,
  MusicMapSummary,
  MusicToolFieldDiff,
  MusicToolFixDiff,
  MusicToolFixHistoryEntry,
  MusicToolFixSummary,
  MusicToolIssueResponse,
  MusicToolIssueRow,
  MusicToolSummary,
  MusicToolUndoSummary,
  NewLibraryArtist,
  NorsktoppenImportSummary,
  OfficialUkImportSummary,
  OutlierStat,
  PerformanceProbeOperation,
  PerformanceProbeResponse,
  PlaylistAutomationStatus,
  RatingBucket,
  RatingEvent,
  RatingHistoryPoint,
  RatingProgressStats,
  SaveDiscogsCredentialsRequest,
  SaveLastFmApiKeyRequest,
  SaveUsenetProfileRequest,
  SetLibraryCompletionArtistDecisionRequest,
  SetLibraryCompletionArtistVerificationStateRequest,
  SetLibraryCompletionDecisionRequest,
  SetLibraryCompletionVerificationStateRequest,
  SetPlaylistAutomationRequest,
  StatisticsResponse,
  TiISkuddetImportSummary,
  TrackDebutTimelineResponse,
  TrackDebutTimelineTrack,
  TrackDebutTimelineYear,
  UsenetBootstrap,
  UsenetConnectionTest,
  UsenetDownloadRequest,
  UsenetProfile,
  UsenetSearchResponse,
  UsenetSearchResult,
  UsenetTransfer,
  UsenetTransferQueue,
  VgListaImportSummary,
  WishListArtistAlbumDiscoveryRequest,
  WishListArtistAlbumDiscoveryResponse,
  WishListArtistAlbumDiscoveryRow,
  WishListArtistAlbumSummary,
  WishListItem,
  WishListMissingAlbum,
  WishListMusicBrainzCandidate,
  WishListMusicBrainzSearchRequest,
  WishListMusicBrainzSearchResponse,
  WishListResponse,
  YearProgressStats,
  AiCompiledQuery_Serialize,
  AiPlaylist_Serialize,
  AiQueryExchange_Serialize,
  AiSnapshot_Serialize,
  AiSnapshotContent_Serialize,
  AppSettings_Serialize,
  ChartConfig_Serialize,
  ExportPlaylistRequest_Serialize,
  SaveAiSnapshotRequest_Serialize,
  SavePlaylistRequest_Serialize,
  SavedChart_Serialize,
  SavedPlaylist_Serialize,
  SmartPlaylistRefreshResult_Serialize,
  AddWishListItemRequest as AddWishListItemRequest_Generated,
  AiCurrentViewQuestion as AiCurrentViewQuestion_Generated,
  AiLibraryAnalysisRequest as AiLibraryAnalysisRequest_Generated,
  AiMusicResearchContext as AiMusicResearchContext_Generated,
  AiMusicResearchRequest as AiMusicResearchRequest_Generated,
  AiPlaylistBuildRequest as AiPlaylistBuildRequest_Generated,
  ArtistListRequest as ArtistListRequest_Generated,
  ArtistTimelineRequest as ArtistTimelineRequest_Generated,
  BrowseFilters as BrowseFilters_Generated,
  BrowseRequest as BrowseRequest_Generated,
  BrowseSort as BrowseSort_Generated,
  CoverImportRequest as CoverImportRequest_Generated,
  DeemixAlbumDownloadPreflightRequest as DeemixAlbumDownloadPreflightRequest_Generated,
  DeemixAlbumDownloadRequest as DeemixAlbumDownloadRequest_Generated,
  DeemixAlbumSearchRequest as DeemixAlbumSearchRequest_Generated,
  ExternalDiscoveryResponse as ExternalDiscoveryResponse_Generated,
  GenreListRequest as GenreListRequest_Generated,
  GenreProgressRequest as GenreProgressRequest_Generated,
  GenreTimelineRequest as GenreTimelineRequest_Generated,
  LibraryUpdateRequest as LibraryUpdateRequest_Generated,
  MusicBrainzArtistExportRequest as MusicBrainzArtistExportRequest_Generated,
  MusicBrainzArtistExportRow as MusicBrainzArtistExportRow_Generated,
  MusicToolFixRequest as MusicToolFixRequest_Generated,
  MusicToolIssueRequest as MusicToolIssueRequest_Generated,
  SaveExternalDiscoveryRequest as SaveExternalDiscoveryRequest_Generated,
  SavedExternalDiscovery as SavedExternalDiscovery_Generated,
  SavedSearch as SavedSearch_Generated,
  StartLibraryCompletionArtistVerificationRequest as StartLibraryCompletionArtistVerificationRequest_Generated,
  StartLibraryCompletionVerificationRequest as StartLibraryCompletionVerificationRequest_Generated,
  TextFilter as TextFilter_Generated,
  UsenetSearchRequest as UsenetSearchRequest_Generated,
  YearProgressRequest as YearProgressRequest_Generated,
} from "./bindings";

/**
 * Request structs accept omitted fields (serde defaults), so the generated
 * types mark them optional. The UI always builds them in full, so app code
 * uses this deep `Complete` view of them.
 */
export type Complete<T> = T extends readonly unknown[]
  ? { [K in keyof T]: Complete<T[K]> }
  : T extends object
    ? { [K in keyof T as [Exclude<T[K], undefined>] extends [never] ? never : K]-?: Complete<T[K]> }
    : T;

export type {
  AddWishListMusicBrainzCandidateResponse,
  AiCompileRequest,
  AiConnectionTest,
  AiCurrentViewAnswer,
  AiKeyStatus,
  AiLibraryAnalysis,
  AiLibraryFinding,
  AiMarkdownExportRequest,
  AiMusicResearchAnswer,
  AiMusicResearchExchange,
  AiMusicResearchSource,
  AiMusicResearchTurn,
  AiPlaylistTrack,
  AiQueryFollowUpContext,
  AiUsage,
  AlbumDebutTimelineAlbum,
  AlbumDebutTimelineResponse,
  AlbumDebutTimelineYear,
  AlbumReview,
  ArtistBiography,
  ArtistChartTrack,
  ArtistListResponse,
  ArtistLovedTrack,
  ArtistSummary,
  ArtistTimelineAlbum,
  ArtistTimelineArtist,
  ArtistTimelineResponse,
  ArtistTrackChartHistory,
  ArtistTrackHighlights,
  BillboardImportSummary,
  BillboardSinglesImportSummary,
  BrowseResponse,
  BrowseRow,
  CatalogConcentrationStats,
  ConcentrationPoint,
  ConfirmLibraryCompletionArtistMatchRequest,
  CountryCatalogStats,
  CoverImportSummary,
  DatabaseBackup,
  DatabaseRestoreSummary,
  DecadeProgressStats,
  DeemixAlbumDownloadPreflight,
  DeemixAlbumDownloadSummary,
  DeemixAlbumMatch,
  DeemixAlbumSearchResponse,
  DeemixConnectionTest,
  DeemixCredentialStatus,
  DiscogsConnectionTest,
  DiscogsCredentialStatus,
  DiscoveryAlbumCompletionStory,
  DiscoveryAlbumPoint,
  DiscoveryAnniversaryStory,
  DiscoveryArtistCompletionStory,
  DiscoveryArtistPoint,
  DiscoveryChartSnapshot,
  DiscoveryChartSnapshotRequest,
  DiscoveryChartStory,
  DiscoveryCompletionSnapshot,
  DiscoveryCompletionSnapshotRequest,
  DiscoveryDailyEdition,
  DiscoveryDailyEditionArchive,
  DiscoveryDailyEditionSnapshotResponse,
  DiscoveryDeepCutGenre,
  DiscoveryDeepCutSnapshot,
  DiscoveryDeepCutSnapshotRequest,
  DiscoveryDeepCutStory,
  DiscoveryGenrePoint,
  DiscoveryHeatmapCell,
  DiscoveryLifeEventStory,
  DiscoveryMission,
  DiscoveryMixerRecommendation,
  DiscoveryMixerRequest,
  DiscoveryMixerResponse,
  DiscoveryMixerSeedInput,
  DiscoveryMixerSeedOption,
  DiscoveryMixerSeedSearchRequest,
  DiscoveryRecommendationAnchor,
  DiscoveryRecommendationSnapshot,
  DiscoveryRecommendationSnapshotRequest,
  DiscoveryRecommendationStory,
  DiscoveryResponse,
  DiscoveryShelfExplorerRequest,
  DiscoveryShelfExplorerResponse,
  DiscoverySourceHealthItem,
  DiscoverySourceHealthResponse,
  DurationAlbumStat,
  DurationAnalyticsStats,
  ExternalDiscoveryItem,
  GenreListResponse,
  GenreProgressStats,
  GenreSummary,
  GenreTimelineAlbumPoint,
  GenreTimelineGenre,
  GenreTimelineResponse,
  GenreTimelineYearCount,
  ImportPreview,
  ImportRun,
  ImportSummary,
  ImportSuspiciousAlbum,
  LastFmAlbumPopularity,
  LastFmAlbumTrackPopularity,
  LastFmArtistImageRefreshSummary,
  LastFmArtistPopularity,
  LastFmArtistSimilarity,
  LastFmConnectionTest,
  LastFmCredentialStatus,
  LastFmPopularTrack,
  LastFmRelatedAlbum,
  LastFmRelatedAlbums,
  LastFmSimilarArtist,
  LibraryCompletionArtistCandidate,
  LibraryCompletionArtistDecision,
  LibraryCompletionArtistEvidence,
  LibraryCompletionArtistRequest,
  LibraryCompletionArtistResponse,
  LibraryCompletionArtistVerificationBatch,
  LibraryCompletionArtistVerificationItemSummary,
  LibraryCompletionArtistVerificationStatus,
  LibraryCompletionAtlasCell,
  LibraryCompletionCandidate,
  LibraryCompletionCoverEnrichment,
  LibraryCompletionDecision,
  LibraryCompletionEvidence,
  LibraryCompletionRequest,
  LibraryCompletionResponse,
  LibraryCompletionVerificationBatch,
  LibraryCompletionVerificationItemSummary,
  LibraryCompletionVerificationStatus,
  LibraryHealthScore,
  LibraryOverviewStats,
  LibraryShapeStats,
  LibraryStatus,
  LibraryUpdate,
  LibraryUpdateArtistResponse,
  LibraryUpdateArtistSummary,
  LibraryUpdateResponse,
  LibraryUpdateSummary,
  LovedDensityStat,
  LovedTrackStats,
  MetadataCoverageMetric,
  MusicBrainzArtistCandidateRow,
  MusicBrainzArtistDiscographyResponse,
  MusicBrainzArtistInfoImportRequest,
  MusicBrainzArtistInfoImportRun,
  MusicBrainzArtistInfoImportSummary,
  MusicBrainzArtistInfoPreview,
  MusicBrainzArtistInfoPreviewRow,
  MusicBrainzArtistInfoStatus,
  MusicBrainzArtistOriginCountryUpdate,
  MusicBrainzArtistOriginImportRun,
  MusicBrainzArtistRefreshResult,
  MusicBrainzArtistReleaseRow,
  MusicBrainzCacheStatus,
  MusicBrainzCacheWarningExample,
  MusicBrainzOriginCountryImportRequest,
  MusicBrainzOriginCountryImportSummary,
  MusicBrainzOriginCountryOption,
  MusicBrainzOriginCountryPreview,
  MusicBrainzOriginCountryPreviewRow,
  MusicBrainzOriginCountryStatus,
  MusicBrainzOverlaySyncLogEntry,
  MusicBrainzOverlaySyncResult,
  MusicDoctorBitrateStat,
  MusicDoctorFormatStat,
  MusicDoctorSource,
  MusicDoctorStatus,
  MusicDoctorSyncResult,
  MusicMapArtist,
  MusicMapGenreStat,
  MusicMapLocationDetails,
  MusicMapPoint,
  MusicMapRefreshSummary,
  MusicMapResponse,
  MusicMapSummary,
  MusicToolFieldDiff,
  MusicToolFixDiff,
  MusicToolFixHistoryEntry,
  MusicToolFixSummary,
  MusicToolIssueResponse,
  MusicToolIssueRow,
  MusicToolSummary,
  MusicToolUndoSummary,
  NewLibraryArtist,
  NorsktoppenImportSummary,
  OfficialUkImportSummary,
  OutlierStat,
  PerformanceProbeOperation,
  PerformanceProbeResponse,
  PlaylistAutomationStatus,
  RatingBucket,
  RatingEvent,
  RatingHistoryPoint,
  RatingProgressStats,
  SaveDiscogsCredentialsRequest,
  SaveLastFmApiKeyRequest,
  SaveUsenetProfileRequest,
  SetLibraryCompletionArtistDecisionRequest,
  SetLibraryCompletionArtistVerificationStateRequest,
  SetLibraryCompletionDecisionRequest,
  SetLibraryCompletionVerificationStateRequest,
  SetPlaylistAutomationRequest,
  StatisticsResponse,
  TiISkuddetImportSummary,
  TrackDebutTimelineResponse,
  TrackDebutTimelineTrack,
  TrackDebutTimelineYear,
  UsenetBootstrap,
  UsenetConnectionTest,
  UsenetDownloadRequest,
  UsenetProfile,
  UsenetSearchResponse,
  UsenetSearchResult,
  UsenetTransfer,
  UsenetTransferQueue,
  VgListaImportSummary,
  WishListArtistAlbumDiscoveryRequest,
  WishListArtistAlbumDiscoveryResponse,
  WishListArtistAlbumDiscoveryRow,
  WishListArtistAlbumSummary,
  WishListItem,
  WishListMissingAlbum,
  WishListMusicBrainzCandidate,
  WishListMusicBrainzSearchRequest,
  WishListMusicBrainzSearchResponse,
  WishListResponse,
  YearProgressStats,
};

export type AiCompiledQuery = Complete<AiCompiledQuery_Serialize>;
export type AiPlaylist = Complete<AiPlaylist_Serialize>;
export type AiQueryExchange = Complete<AiQueryExchange_Serialize>;
export type AiSnapshot = Complete<AiSnapshot_Serialize>;
export type AiSnapshotContent = Complete<AiSnapshotContent_Serialize>;
export type AppSettings = AppSettings_Serialize;
export type ChartConfig = Complete<ChartConfig_Serialize>;
export type ExportPlaylistRequest = Complete<ExportPlaylistRequest_Serialize>;
export type SaveAiSnapshotRequest = Complete<SaveAiSnapshotRequest_Serialize>;
export type SavePlaylistRequest = Complete<SavePlaylistRequest_Serialize>;
export type SavedChart = Complete<SavedChart_Serialize>;
export type SavedPlaylist = Complete<SavedPlaylist_Serialize>;
export type SmartPlaylistRefreshResult = Complete<SmartPlaylistRefreshResult_Serialize>;
export type AddWishListItemRequest = Complete<AddWishListItemRequest_Generated>;
export type AiCurrentViewQuestion = Omit<Complete<AiCurrentViewQuestion_Generated>, "scopeLabel" | "scopeToResultLimit"> & Partial<Pick<Complete<AiCurrentViewQuestion_Generated>, "scopeLabel" | "scopeToResultLimit">>;
export type AiLibraryAnalysisRequest = Complete<AiLibraryAnalysisRequest_Generated>;
export type AiMusicResearchContext = Complete<AiMusicResearchContext_Generated>;
export type AiMusicResearchRequest = Complete<AiMusicResearchRequest_Generated>;
export type AiPlaylistBuildRequest = Complete<AiPlaylistBuildRequest_Generated>;
export type ArtistListRequest = Complete<ArtistListRequest_Generated>;
export type ArtistTimelineRequest = Complete<ArtistTimelineRequest_Generated>;
export type BrowseFilters = Complete<BrowseFilters_Generated>;
export type BrowseRequest = Complete<BrowseRequest_Generated>;
export type BrowseSort = Complete<BrowseSort_Generated>;
export type CoverImportRequest = Complete<CoverImportRequest_Generated>;
export type DeemixAlbumDownloadPreflightRequest = Complete<DeemixAlbumDownloadPreflightRequest_Generated>;
export type DeemixAlbumDownloadRequest = Complete<DeemixAlbumDownloadRequest_Generated>;
export type DeemixAlbumSearchRequest = Complete<DeemixAlbumSearchRequest_Generated>;
export type ExternalDiscoveryResponse = Complete<ExternalDiscoveryResponse_Generated>;
export type GenreListRequest = Complete<GenreListRequest_Generated>;
export type GenreProgressRequest = Complete<GenreProgressRequest_Generated>;
export type GenreTimelineRequest = Complete<GenreTimelineRequest_Generated>;
export type LibraryUpdateRequest = Complete<LibraryUpdateRequest_Generated>;
export type MusicBrainzArtistExportRequest = Complete<MusicBrainzArtistExportRequest_Generated>;
export type MusicBrainzArtistExportRow = Complete<MusicBrainzArtistExportRow_Generated>;
export type MusicToolFixRequest = Complete<MusicToolFixRequest_Generated>;
export type MusicToolIssueRequest = Complete<MusicToolIssueRequest_Generated>;
export type SaveExternalDiscoveryRequest = Complete<SaveExternalDiscoveryRequest_Generated>;
export type SavedExternalDiscovery = Complete<SavedExternalDiscovery_Generated>;
export type SavedSearch = Complete<SavedSearch_Generated>;
export type StartLibraryCompletionArtistVerificationRequest = Complete<StartLibraryCompletionArtistVerificationRequest_Generated>;
export type StartLibraryCompletionVerificationRequest = Complete<StartLibraryCompletionVerificationRequest_Generated>;
export type TextFilter = Complete<TextFilter_Generated>;
export type UsenetSearchRequest = Complete<UsenetSearchRequest_Generated>;
export type YearProgressRequest = Complete<YearProgressRequest_Generated>;

export type {
  AiKeySource,
  AiLibraryLens,
  AiMusicResearchEntity,
  AiPlaylistStrategy,
  AiQueryTarget,
  ArtistTimelineMetric,
  BrowseView,
  ChartViewMode,
  CountryFlagDisplay,
  DeemixCredentialSource,
  DeemixDownloadOrganization,
  DeemixDownloadQuality,
  DiscoveryChartSource,
  DiscoveryCompletionMode,
  DiscoveryMixerSeedKind,
  DiscoveryRecommendationMode,
  DiscoveryShelf,
  DiscoverySourceHealthAction,
  DiscoverySourceHealthState,
  ExternalDiscoveryEntity,
  LeftSidebarMode,
  LibraryCompletionConfidence,
  LibraryCompletionStatus,
  LibraryUpdateKind,
  MusicToolFixConfidence,
  MusicToolScope,
  MusicToolSeverity,
  RightSidebarMode,
  TextFilterOperator,
  UsenetTransferStatus,
  WishListEntity,
};

export type ImportProgress = {
  status: string;
  sessionId: number | null;
  processedRows: number;
  processedBytes: number;
  totalBytes: number;
  albumCount: number;
  message: string;
};

export type CoverImportProgress = {
  status: string;
  totalAlbums: number;
  scannedAlbums: number;
  newCoversFound: number;
  importedCovers: number;
  relinkedCovers: number;
  skippedExisting: number;
  missingCovers: number;
  percent: number;
  message: string;
};

export type MusicBrainzOriginCountryImportProgress = {
  status: string;
  totalArtists: number;
  eligibleCount: number;
  processedCount: number;
  remainingCount: number;
  fetchedCount: number;
  storedCount: number;
  skippedCount: number;
  unresolvedCount: number;
  failedCount: number;
  percent: number;
  currentArtist: string | null;
  currentArtistKey: string | null;
  currentMbid: string | null;
  message: string;
};

export type MusicBrainzArtistInfoImportProgress = {
  status: string;
  totalArtists: number;
  eligibleCount: number;
  processedCount: number;
  remainingCount: number;
  fetchedCount: number;
  storedCount: number;
  skippedCount: number;
  unresolvedCount: number;
  failedCount: number;
  percent: number;
  currentArtist: string | null;
  currentArtistKey: string | null;
  currentMbid: string | null;
  message: string;
};

export type MusicBrainzReleaseDecision =
  "not-in-scope" | "ignored" | "include" | "auto-not-official" | null;

export type AiSnapshotKind =
  | AiQueryTarget
  | "searchAnswer"
  | "chartAnswer"
  | "libraryAnalysis"
  | "musicResearch";

export type ExternalDiscoveryPlan = {
  prompt: string;
  entity: ExternalDiscoveryEntity;
  count: number;
  year: number;
  yearFrom: number;
  yearTo: number;
  yearMeaning: "releaseYear" | "formedYear";
  genres: string[];
  countries: string[];
  keywords: string;
  title: string;
  summary: string;
  model: string;
  usage: AiUsage;
};

export type LibraryCompletionArtistChartSource =
  | LibraryCompletionEvidence["source"]
  | "tiISkuddet"
  | "norsktoppen";

export type DeemixAlbumDownloadPhase =
  | "metadata"
  | "artwork"
  | "downloading"
  | "tagging"
  | "complete"
  | "failed";

export type DeemixAlbumDownloadProgress = {
  requestId: string;
  albumId: string;
  phase: DeemixAlbumDownloadPhase;
  message: string;
  currentTrack: string | null;
  completedTracks: number;
  totalTracks: number;
};

export type SoulseekConnectionState = import("./bindings").ConnectionState;

export type SoulseekConnectionProfile = import("./bindings").ConnectionProfile;

export type SoulseekConnectionSnapshot = import("./bindings").ConnectionSnapshot;

export type SoulseekConnectionBootstrap = import("./bindings").ConnectionBootstrap;

export type SaveSoulseekConnectionRequest = import("./bindings").SaveConnectionRequest;

export type SoulseekSearchState = import("./bindings").SearchState;

export type SoulseekSearchSnapshot = import("./bindings").SearchSnapshot;

export type SoulseekSearchResult = {
  id: string;
  token: number;
  username: string;
  filename: string;
  sizeBytes: number;
  extension: string;
  bitrate: number | null;
  durationSeconds: number | null;
  vbr: boolean | null;
  sampleRate: number | null;
  bitDepth: number | null;
  slotFree: boolean;
  averageSpeed: number;
  queueLength: number;
  isPrivate: boolean;
};

export type SoulseekSearchEvent = {
  event: "started" | "results" | "completed" | "stopped" | "error";
  snapshot: SoulseekSearchSnapshot;
  results: SoulseekSearchResult[];
};

export type SoulseekAlbumSearchRequest = {
  title: string;
  artist: string;
  year: number | null;
};

export type SoulseekAlbumSearchResponse = {
  query: string;
  snapshot: SoulseekSearchSnapshot;
  results: SoulseekSearchResult[];
  searchedAt: string;
};

export type SoulseekReleaseFileRequest = {
  title: string;
  remoteFilename: string;
  sizeBytes: number;
};

export type SoulseekReleaseDownloadRequest = {
  title: string;
  username: string;
  remoteFolder: string;
  files: SoulseekReleaseFileRequest[];
  expectedTrackCount: number | null;
  releaseGroupId: string | null;
  alternatives: never[];
};

export type SoulseekTransferStatus = import("./bindings").TransferStatus;

export type SoulseekTransfer = import("./bindings").TransferSnapshot;

export type SoulseekTransferQueue = import("./bindings").TransferQueueSnapshot;

export type SoulseekSharedRoot = import("./bindings").SharedRootSnapshot;

export type SoulseekLocalShares = import("./bindings").LocalSharesSnapshot;

export type SoulseekUpload = import("./bindings").UploadSnapshot;

export type SoulseekUploadQueue = import("./bindings").UploadQueueSnapshot;

export type MusicToolProgress = {
  toolId: string;
  requestId: string;
  status: "starting" | "counting" | "loading" | "completed" | "failed";
  percent: number;
  message: string;
};

export type TimelineChartSource =
  | "billboard"
  | "vgLista"
  | "officialUk"
  | "tiISkuddet"
  | "norsktoppen";

export type ExportResult = {
  path: string;
  format: string;
  rowCount: number;
  pathCopied: boolean;
};

