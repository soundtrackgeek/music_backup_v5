
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
  AiKeySource,
  AiKeyStatus,
  AiLibraryAnalysis,
  AiLibraryFinding,
  AiLibraryLens,
  AiMarkdownExportRequest,
  AiMusicResearchAnswer,
  AiMusicResearchEntity,
  AiMusicResearchExchange,
  AiMusicResearchSource,
  AiMusicResearchTurn,
  AiPlaylistStrategy,
  AiPlaylistTrack,
  AiQueryFollowUpContext,
  AiQueryTarget,
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
  ArtistTimelineMetric,
  ArtistTimelineResponse,
  ArtistTrackChartHistory,
  ArtistTrackHighlights,
  BillboardImportSummary,
  BillboardSinglesImportSummary,
  BrowseResponse,
  BrowseRow,
  BrowseView,
  CatalogConcentrationStats,
  ChartViewMode,
  ConcentrationPoint,
  ConfirmLibraryCompletionArtistMatchRequest,
  CountryCatalogStats,
  CountryFlagDisplay,
  CoverImportProgress,
  CoverImportSummary,
  DatabaseBackup,
  DatabaseRestoreSummary,
  DecadeProgressStats,
  DeemixAlbumDownloadPhase,
  DeemixAlbumDownloadPreflight,
  DeemixAlbumDownloadProgress,
  DeemixAlbumDownloadSummary,
  DeemixAlbumMatch,
  DeemixAlbumSearchResponse,
  DeemixConnectionTest,
  DeemixCredentialSource,
  DeemixCredentialStatus,
  DeemixDownloadOrganization,
  DeemixDownloadQuality,
  DiscogsConnectionTest,
  DiscogsCredentialStatus,
  DiscoveryAlbumCompletionStory,
  DiscoveryAlbumPoint,
  DiscoveryAnniversaryStory,
  DiscoveryArtistCompletionStory,
  DiscoveryArtistPoint,
  DiscoveryChartSnapshot,
  DiscoveryChartSnapshotRequest,
  DiscoveryChartSource,
  DiscoveryChartStory,
  DiscoveryCompletionMode,
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
  DiscoveryMixerSeedKind,
  DiscoveryMixerSeedOption,
  DiscoveryMixerSeedSearchRequest,
  DiscoveryRecommendationAnchor,
  DiscoveryRecommendationMode,
  DiscoveryRecommendationSnapshot,
  DiscoveryRecommendationSnapshotRequest,
  DiscoveryRecommendationStory,
  DiscoveryResponse,
  DiscoveryShelf,
  DiscoveryShelfExplorerRequest,
  DiscoveryShelfExplorerResponse,
  DiscoverySourceHealthAction,
  DiscoverySourceHealthItem,
  DiscoverySourceHealthResponse,
  DiscoverySourceHealthState,
  DurationAlbumStat,
  DurationAnalyticsStats,
  ExternalDiscoveryEntity,
  ExternalDiscoveryItem,
  GenreListResponse,
  GenreProgressStats,
  GenreSummary,
  GenreTimelineAlbumPoint,
  GenreTimelineGenre,
  GenreTimelineResponse,
  GenreTimelineYearCount,
  ImportPreview,
  ImportProgress,
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
  LeftSidebarMode,
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
  LibraryCompletionConfidence,
  LibraryCompletionCoverEnrichment,
  LibraryCompletionDecision,
  LibraryCompletionEvidence,
  LibraryCompletionRequest,
  LibraryCompletionResponse,
  LibraryCompletionStatus,
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
  LibraryUpdateKind,
  LibraryUpdateResponse,
  LibraryUpdateSummary,
  LovedDensityStat,
  LovedTrackStats,
  MetadataCoverageMetric,
  MusicBrainzArtistCandidateRow,
  MusicBrainzArtistDiscographyResponse,
  MusicBrainzArtistInfoImportProgress,
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
  MusicBrainzOriginCountryImportProgress,
  MusicBrainzOriginCountryImportRequest,
  MusicBrainzOriginCountryImportSummary,
  MusicBrainzOriginCountryOption,
  MusicBrainzOriginCountryPreview,
  MusicBrainzOriginCountryPreviewRow,
  MusicBrainzOriginCountryStatus,
  MusicBrainzOverlaySyncLogEntry,
  MusicBrainzOverlaySyncResult,
  MusicBrainzReleaseDecision,
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
  MusicToolFixConfidence,
  MusicToolFixDiff,
  MusicToolFixHistoryEntry,
  MusicToolFixSummary,
  MusicToolIssueResponse,
  MusicToolIssueRow,
  MusicToolProgress,
  MusicToolScope,
  MusicToolSeverity,
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
  RightSidebarMode,
  SaveDiscogsCredentialsRequest,
  SaveLastFmApiKeyRequest,
  SaveUsenetProfileRequest,
  SetLibraryCompletionArtistDecisionRequest,
  SetLibraryCompletionArtistVerificationStateRequest,
  SetLibraryCompletionDecisionRequest,
  SetLibraryCompletionVerificationStateRequest,
  SetPlaylistAutomationRequest,
  TextFilterOperator,
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
  UsenetTransferStatus,
  VgListaImportSummary,
  WishListArtistAlbumDiscoveryRequest,
  WishListArtistAlbumDiscoveryResponse,
  WishListArtistAlbumDiscoveryRow,
  WishListArtistAlbumSummary,
  WishListEntity,
  WishListItem,
  WishListMissingAlbum,
  WishListMusicBrainzCandidate,
  WishListMusicBrainzSearchRequest,
  WishListMusicBrainzSearchResponse,
  WishListResponse,
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
  StatisticsResponse as StatisticsResponse_Generated,
  TextFilter as TextFilter_Generated,
  UsenetSearchRequest as UsenetSearchRequest_Generated,
  YearProgressRequest as YearProgressRequest_Generated,
  YearProgressStats as YearProgressStats_Generated,
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
  AiKeySource,
  AiKeyStatus,
  AiLibraryAnalysis,
  AiLibraryFinding,
  AiLibraryLens,
  AiMarkdownExportRequest,
  AiMusicResearchAnswer,
  AiMusicResearchEntity,
  AiMusicResearchExchange,
  AiMusicResearchSource,
  AiMusicResearchTurn,
  AiPlaylistStrategy,
  AiPlaylistTrack,
  AiQueryFollowUpContext,
  AiQueryTarget,
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
  ArtistTimelineMetric,
  ArtistTimelineResponse,
  ArtistTrackChartHistory,
  ArtistTrackHighlights,
  BillboardImportSummary,
  BillboardSinglesImportSummary,
  BrowseResponse,
  BrowseRow,
  BrowseView,
  CatalogConcentrationStats,
  ChartViewMode,
  ConcentrationPoint,
  ConfirmLibraryCompletionArtistMatchRequest,
  CountryCatalogStats,
  CountryFlagDisplay,
  CoverImportProgress,
  CoverImportSummary,
  DatabaseBackup,
  DatabaseRestoreSummary,
  DecadeProgressStats,
  DeemixAlbumDownloadPhase,
  DeemixAlbumDownloadPreflight,
  DeemixAlbumDownloadProgress,
  DeemixAlbumDownloadSummary,
  DeemixAlbumMatch,
  DeemixAlbumSearchResponse,
  DeemixConnectionTest,
  DeemixCredentialSource,
  DeemixCredentialStatus,
  DeemixDownloadOrganization,
  DeemixDownloadQuality,
  DiscogsConnectionTest,
  DiscogsCredentialStatus,
  DiscoveryAlbumCompletionStory,
  DiscoveryAlbumPoint,
  DiscoveryAnniversaryStory,
  DiscoveryArtistCompletionStory,
  DiscoveryArtistPoint,
  DiscoveryChartSnapshot,
  DiscoveryChartSnapshotRequest,
  DiscoveryChartSource,
  DiscoveryChartStory,
  DiscoveryCompletionMode,
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
  DiscoveryMixerSeedKind,
  DiscoveryMixerSeedOption,
  DiscoveryMixerSeedSearchRequest,
  DiscoveryRecommendationAnchor,
  DiscoveryRecommendationMode,
  DiscoveryRecommendationSnapshot,
  DiscoveryRecommendationSnapshotRequest,
  DiscoveryRecommendationStory,
  DiscoveryResponse,
  DiscoveryShelf,
  DiscoveryShelfExplorerRequest,
  DiscoveryShelfExplorerResponse,
  DiscoverySourceHealthAction,
  DiscoverySourceHealthItem,
  DiscoverySourceHealthResponse,
  DiscoverySourceHealthState,
  DurationAlbumStat,
  DurationAnalyticsStats,
  ExternalDiscoveryEntity,
  ExternalDiscoveryItem,
  GenreListResponse,
  GenreProgressStats,
  GenreSummary,
  GenreTimelineAlbumPoint,
  GenreTimelineGenre,
  GenreTimelineResponse,
  GenreTimelineYearCount,
  ImportPreview,
  ImportProgress,
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
  LeftSidebarMode,
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
  LibraryCompletionConfidence,
  LibraryCompletionCoverEnrichment,
  LibraryCompletionDecision,
  LibraryCompletionEvidence,
  LibraryCompletionRequest,
  LibraryCompletionResponse,
  LibraryCompletionStatus,
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
  LibraryUpdateKind,
  LibraryUpdateResponse,
  LibraryUpdateSummary,
  LovedDensityStat,
  LovedTrackStats,
  MetadataCoverageMetric,
  MusicBrainzArtistCandidateRow,
  MusicBrainzArtistDiscographyResponse,
  MusicBrainzArtistInfoImportProgress,
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
  MusicBrainzOriginCountryImportProgress,
  MusicBrainzOriginCountryImportRequest,
  MusicBrainzOriginCountryImportSummary,
  MusicBrainzOriginCountryOption,
  MusicBrainzOriginCountryPreview,
  MusicBrainzOriginCountryPreviewRow,
  MusicBrainzOriginCountryStatus,
  MusicBrainzOverlaySyncLogEntry,
  MusicBrainzOverlaySyncResult,
  MusicBrainzReleaseDecision,
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
  MusicToolFixConfidence,
  MusicToolFixDiff,
  MusicToolFixHistoryEntry,
  MusicToolFixSummary,
  MusicToolIssueResponse,
  MusicToolIssueRow,
  MusicToolProgress,
  MusicToolScope,
  MusicToolSeverity,
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
  RightSidebarMode,
  SaveDiscogsCredentialsRequest,
  SaveLastFmApiKeyRequest,
  SaveUsenetProfileRequest,
  SetLibraryCompletionArtistDecisionRequest,
  SetLibraryCompletionArtistVerificationStateRequest,
  SetLibraryCompletionDecisionRequest,
  SetLibraryCompletionVerificationStateRequest,
  SetPlaylistAutomationRequest,
  TextFilterOperator,
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
  UsenetTransferStatus,
  VgListaImportSummary,
  WishListArtistAlbumDiscoveryRequest,
  WishListArtistAlbumDiscoveryResponse,
  WishListArtistAlbumDiscoveryRow,
  WishListArtistAlbumSummary,
  WishListEntity,
  WishListItem,
  WishListMissingAlbum,
  WishListMusicBrainzCandidate,
  WishListMusicBrainzSearchRequest,
  WishListMusicBrainzSearchResponse,
  WishListResponse,
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
export type StatisticsResponse = Complete<StatisticsResponse_Generated>;
export type TextFilter = Complete<TextFilter_Generated>;
export type UsenetSearchRequest = Complete<UsenetSearchRequest_Generated>;
export type YearProgressRequest = Complete<YearProgressRequest_Generated>;
export type YearProgressStats = Complete<YearProgressStats_Generated>;



export type AiSnapshotKind = AiSnapshotContent["kind"];

export type ExternalDiscoveryPlan = import("./bindings").AiExternalDiscoveryPlan;

export type LibraryCompletionArtistChartSource = LibraryCompletionArtistEvidence["source"];

export type SoulseekConnectionState = import("./bindings").ConnectionState;

export type SoulseekConnectionProfile = import("./bindings").ConnectionProfile;

export type SoulseekConnectionSnapshot = import("./bindings").ConnectionSnapshot;

export type SoulseekConnectionBootstrap = import("./bindings").ConnectionBootstrap;

export type SaveSoulseekConnectionRequest = import("./bindings").SaveConnectionRequest;

export type SoulseekSearchState = import("./bindings").SearchState;

export type SoulseekSearchSnapshot = import("./bindings").SearchSnapshot;

export type SoulseekSearchResult = import("./bindings").SearchResult;

export type SoulseekSearchEvent = import("./bindings").SearchEvent;

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

