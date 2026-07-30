export type ImportRun = {
  id: number;
  sourcePath: string;
  sourceSizeBytes: number;
  startedAt: string;
  completedAt: string | null;
  status: string;
  trackRows: number;
  albumCount: number;
  durationMs: number;
  backupPath: string | null;
  errorMessage: string | null;
  addedTracks: number;
  changedTracks: number;
  removedTracks: number;
  addedAlbums: number;
  changedAlbums: number;
  removedAlbums: number;
  ratingEventsCount: number;
};

export type LibraryUpdateKind = "new" | "changed" | "removed";

export type LibraryUpdateRequest = {
  query: string;
  changeKind: LibraryUpdateKind | null;
  dateFrom: string | null;
  limit: number;
  offset: number;
};

export type LibraryUpdate = {
  id: number;
  importRunId: number | null;
  createdAt: string;
  changeKind: LibraryUpdateKind;
  category: "album" | "metadata" | "tracks" | "ratings" | string;
  albumId: string;
  albumArtistDisplay: string | null;
  album: string | null;
  year: number | null;
  field: string | null;
  fieldLabel: string | null;
  previousValue: string | null;
  currentValue: string | null;
  changeCount: number | null;
  description: string;
  sourceKind: string;
  sourceLabel: string;
  sourcePath: string | null;
};

export type LibraryUpdateSummary = {
  all: number;
  new: number;
  changed: number;
  removed: number;
};

export type LibraryUpdateResponse = {
  rows: LibraryUpdate[];
  total: number;
  summary: LibraryUpdateSummary;
  limit: number;
  offset: number;
};

export type LibraryStatus = {
  dbPath: string;
  hasDatabase: boolean;
  trackCount: number;
  albumCount: number;
  coverCount: number;
  importRunCount: number;
  lastImport: ImportRun | null;
};

export type PerformanceProbeOperation = {
  id: string;
  label: string;
  category: string;
  status: "ok" | "failed";
  durationMs: number;
  totalCount: number | null;
  rowCount: number | null;
  detail: string;
  errorMessage: string | null;
};

export type PerformanceProbeResponse = {
  generatedAt: string;
  databasePath: string;
  trackCount: number;
  albumCount: number;
  totalDurationMs: number;
  slowestOperationMs: number;
  operations: PerformanceProbeOperation[];
};

export type DatabaseBackup = {
  id: number | null;
  createdAt: string;
  operation: string;
  sourcePath: string | null;
  sourceSizeBytes: number;
  backupPath: string;
  fileSizeBytes: number;
  trackRows: number | null;
  albumCount: number | null;
  schemaVersion: number | null;
  exists: boolean;
  canRestore: boolean;
};

export type DatabaseRestoreSummary = {
  restoredBackup: DatabaseBackup;
  preRestoreBackupPath: string | null;
  trackCount: number;
  albumCount: number;
  schemaVersion: number;
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

export type ImportSuspiciousAlbum = {
  albumId: string;
  album: string | null;
  albumArtistDisplay: string | null;
  year: number | null;
  reason: string;
  previousTrackCount: number | null;
  currentTrackCount: number | null;
};

export type ImportPreview = {
  sessionId: number;
  sourcePath: string;
  sourceSizeBytes: number;
  sourceModifiedMs: number;
  status: string;
  processedRows: number;
  processedBytes: number;
  trackRows: number;
  albumCount: number;
  addedTracks: number;
  changedTracks: number;
  removedTracks: number;
  addedAlbums: number;
  changedAlbums: number;
  removedAlbums: number;
  suspiciousAlbumCount: number;
  suspiciousAlbums: ImportSuspiciousAlbum[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  importRunId: number | null;
  errorMessage: string | null;
  canResume: boolean;
  sourceChanged: boolean;
};

export type ImportSummary = {
  importRun: ImportRun;
  trackRows: number;
  albumCount: number;
  durationMs: number;
  backupPath: string | null;
};

export type CoverImportRequest = {
  sourcePath: string;
  extractEmbeddedFallback: boolean;
  replaceExisting: boolean;
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

export type CoverImportSummary = {
  totalAlbums: number;
  scannedAlbums: number;
  newCoversFound: number;
  importedCovers: number;
  relinkedCovers: number;
  skippedExisting: number;
  missingCovers: number;
  durationMs: number;
};

export type BillboardImportSummary = {
  sourcePath: string;
  filesScanned: number;
  chartEntries: number;
  matchedAlbums: number;
  datedAlbums: number;
  durationMs: number;
};

export type BillboardSinglesImportSummary = {
  sourcePath: string;
  filesScanned: number;
  chartEntries: number;
  matchedTracks: number;
  datedTracks: number;
  exactDates: number;
  qualifiedDates: number;
  missingDates: number;
  invalidDates: number;
  durationMs: number;
};

export type VgListaImportSummary = {
  sourcePath: string;
  filesScanned: number;
  chartEntries: number;
  matchedItems: number;
  datedItems: number;
  durationMs: number;
};

export type OfficialUkImportSummary = {
  sourcePath: string;
  filesScanned: number;
  chartEntries: number;
  matchedItems: number;
  datedItems: number;
  durationMs: number;
};

export type TiISkuddetImportSummary = {
  sourcePath: string;
  filesScanned: number;
  chartEntries: number;
  matchedTracks: number;
  datedTracks: number;
  skippedRows: number;
  durationMs: number;
};

export type NorsktoppenImportSummary = {
  sourcePath: string;
  filesScanned: number;
  chartEntries: number;
  matchedTracks: number;
  datedTracks: number;
  skippedRows: number;
  durationMs: number;
};

export type LeftSidebarMode = "expanded" | "iconOnly" | "hidden";

export type RightSidebarMode = "expanded" | "hidden";

export type CountryFlagDisplay = "flagAndName" | "name" | "flag";

export type DeemixDownloadQuality = "mp3_128" | "mp3_320" | "flac";

export type DeemixDownloadOrganization =
  | "flat_artist_album_year"
  | "artist_album_year_folders";

export type AppSettings = {
  backupRetention: number;
  darkMode: boolean;
  countryFlagDisplay: CountryFlagDisplay;
  leftSidebarDefault: LeftSidebarMode;
  rightSidebarDefault: RightSidebarMode;
  importSourcePath: string;
  coverSourcePath: string;
  billboardSourcePath: string;
  billboardSinglesSourcePath: string;
  vgListaAlbumSourcePath: string;
  vgListaSinglesSourcePath: string;
  officialUkAlbumSourcePath: string;
  officialUkSinglesSourcePath: string;
  tiISkuddetSourcePath: string;
  norsktoppenSourcePath: string;
  deemixDownloadPath: string;
  deemixDownloadQuality: DeemixDownloadQuality;
  deemixDownloadFallback: boolean;
  deemixDownloadOrganization: DeemixDownloadOrganization;
  musicBrainzCachePath: string;
  musicBrainzOverlaySyncPath: string;
  musicBrainzOverlayAutoSyncMinutes: number;
  updateAutoCheckMinutes: number;
  updatedAt: string | null;
};

export type MusicBrainzOverlaySyncResult = {
  syncPath: string;
  syncedAt: string;
  importedCount: number;
  exportedCount: number;
  changedCount: number;
  summary: string;
  artistLinksImported: number;
  artistLinksExported: number;
  artistUnlinksImported: number;
  artistUnlinksExported: number;
  releaseDecisionsImported: number;
  releaseDecisionsExported: number;
  releaseDecisionClearsImported: number;
  releaseDecisionClearsExported: number;
  releaseStatusesImported: number;
  releaseStatusesExported: number;
  releaseGroupsImported: number;
  releaseGroupsExported: number;
};

export type MusicBrainzOverlaySyncLogEntry = MusicBrainzOverlaySyncResult & {
  id: number;
};

export type MusicBrainzCacheWarningExample = {
  mbid: string;
  cachedNameCount: number;
  releaseGroupCount: number;
  cachedNames: string[];
};

export type MusicBrainzCacheStatus = {
  cachePath: string;
  resolvedPath: string;
  exists: boolean;
  valid: boolean;
  state: "available" | "warning" | "unavailable" | "invalid";
  message: string;
  fileSizeBytes: number;
  artistCount: number;
  distinctMbidCount: number;
  duplicateMbidCount: number;
  suspiciousMappingCount: number;
  releaseGroupCount: number;
  officialReleaseGroupCount: number;
  pureAlbumReleaseGroupCount: number;
  releaseYearMin: number | null;
  releaseYearMax: number | null;
  cacheDateMin: string | null;
  cacheDateMax: string | null;
  warningExamples: MusicBrainzCacheWarningExample[];
};

export type MusicBrainzOriginCountryOption = {
  code: string;
  name: string;
  artistCount: number;
};

export type MusicBrainzArtistOriginImportRun = {
  id: number;
  scope: string;
  status: string;
  totalArtists: number;
  eligibleCount: number;
  fetchedCount: number;
  skippedCount: number;
  unresolvedCount: number;
  failedCount: number;
  lastProcessedArtistKey: string | null;
  startedAt: string;
  completedAt: string | null;
  errorSummary: string | null;
};

export type MusicBrainzOriginCountryStatus = {
  totalAlbumArtists: number;
  importedOrigins: number;
  countryCount: number;
  manualOrigins: number;
  unresolvedOrigins: number;
  missingOrigins: number;
  lastRun: MusicBrainzArtistOriginImportRun | null;
  countries: MusicBrainzOriginCountryOption[];
};

export type MusicBrainzOriginCountryPreviewRow = {
  localArtistKey: string;
  displayArtist: string;
  albumCount: number;
  musicbrainzMbid: string | null;
  matchedName: string | null;
  matchMethod: string;
  artistLinkState: "none" | "unverified" | "verified" | "ignored" | string;
  suspectMapping: boolean;
  existingCountryCode: string | null;
  existingCountryName: string | null;
  existingReviewState: string | null;
  status:
    | "eligible"
    | "alreadyImported"
    | "manual"
    | "skipped"
    | "unresolved"
    | string;
  skippedReason: string | null;
};

export type MusicBrainzOriginCountryPreview = {
  totalAlbumArtists: number;
  eligibleCount: number;
  alreadyImportedCount: number;
  skippedCount: number;
  unresolvedCount: number;
  estimatedSeconds: number;
  rows: MusicBrainzOriginCountryPreviewRow[];
};

export type MusicBrainzOriginCountryImportRequest = {
  artistKeys?: string[];
  refetch?: boolean;
  limit?: number | null;
};

export type MusicBrainzOriginCountryImportSummary = {
  run: MusicBrainzArtistOriginImportRun;
  totalAlbumArtists: number;
  eligibleCount: number;
  fetchedCount: number;
  storedCount: number;
  skippedCount: number;
  unresolvedCount: number;
  failedCount: number;
  cancelled: boolean;
  rows: MusicBrainzOriginCountryPreviewRow[];
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

export type MusicBrainzArtistInfoImportRun = {
  id: number;
  scope: string;
  status: string;
  totalArtists: number;
  eligibleCount: number;
  fetchedCount: number;
  skippedCount: number;
  unresolvedCount: number;
  failedCount: number;
  lastProcessedArtistKey: string | null;
  startedAt: string;
  completedAt: string | null;
  errorSummary: string | null;
};

export type MusicBrainzArtistInfoStatus = {
  totalAlbumArtists: number;
  importedInfos: number;
  personArtists: number;
  groupArtists: number;
  genderedArtists: number;
  bornArtists: number;
  diedArtists: number;
  foundedArtists: number;
  dissolvedArtists: number;
  missingInfos: number;
  lastRun: MusicBrainzArtistInfoImportRun | null;
};

export type MusicBrainzArtistInfoPreviewRow = {
  localArtistKey: string;
  displayArtist: string;
  albumCount: number;
  musicbrainzMbid: string | null;
  matchedName: string | null;
  matchMethod: string;
  artistLinkState: "none" | "unverified" | "verified" | "ignored" | string;
  suspectMapping: boolean;
  existingSortName: string | null;
  existingArtistType: string | null;
  existingGender: string | null;
  existingBeginDate: string | null;
  existingBeginYear: number | null;
  existingEndDate: string | null;
  existingEndYear: number | null;
  existingEnded: boolean | null;
  existingBeginAreaName: string | null;
  existingEndAreaName: string | null;
  existingReviewState: string | null;
  status: "eligible" | "alreadyImported" | "skipped" | "unresolved" | string;
  skippedReason: string | null;
};

export type MusicBrainzArtistInfoPreview = {
  totalAlbumArtists: number;
  eligibleCount: number;
  alreadyImportedCount: number;
  skippedCount: number;
  unresolvedCount: number;
  estimatedSeconds: number;
  rows: MusicBrainzArtistInfoPreviewRow[];
};

export type MusicBrainzArtistInfoImportRequest = {
  artistKeys?: string[];
  refetch?: boolean;
  limit?: number | null;
};

export type MusicBrainzArtistInfoImportSummary = {
  run: MusicBrainzArtistInfoImportRun;
  totalAlbumArtists: number;
  eligibleCount: number;
  fetchedCount: number;
  storedCount: number;
  skippedCount: number;
  unresolvedCount: number;
  failedCount: number;
  cancelled: boolean;
  rows: MusicBrainzArtistInfoPreviewRow[];
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

export type MusicBrainzArtistReleaseRow = {
  releaseMbid: string;
  title: string;
  year: number | null;
  trackCount: number | null;
  status: "owned" | "missing" | "excluded";
  localAlbumId: string | null;
  localAlbumTitle: string | null;
  localYear: number | null;
  matchMethod: string;
  confidence: number;
  decision: MusicBrainzReleaseDecision;
};

export type MusicBrainzArtistExportRow = {
  releaseMbid: string;
  title: string;
  year: number | null;
  status: "owned" | "missing" | "excluded";
  localAlbumTitle: string | null;
  localYear: number | null;
  matchMethod: string;
  confidence: number;
};

export type MusicBrainzArtistExportRequest = {
  artistKey: string;
  artistName: string;
  musicbrainzMbid: string | null;
  matchedCacheName: string | null;
  matchMethod: string;
  artistLinkState: "none" | "unverified" | "verified" | "ignored";
  artistLinkIgnored: boolean;
  rows: MusicBrainzArtistExportRow[];
  format: string;
};

export type MusicBrainzArtistRefreshResult = {
  artistKey: string;
  artistName: string;
  musicbrainzMbid: string;
  fetchedCount: number;
  storedCount: number;
  fetchedAt: string;
  origin: MusicBrainzArtistOriginCountryUpdate | null;
};

export type MusicBrainzArtistOriginCountryUpdate = {
  artistKey: string;
  artistName: string;
  musicbrainzMbid: string | null;
  originCountryCode: string | null;
  originCountryName: string | null;
  originCountryRawArea: string | null;
  originCountryReviewState: string | null;
};

export type MusicBrainzArtistCandidateRow = {
  name: string;
  mbid: string;
  matchMethod: string;
  score: number;
  cachedNameCount: number;
  totalReleaseGroupCount: number;
  suspectMapping: boolean;
};

export type MusicBrainzArtistDiscographyResponse = {
  artistKey: string;
  artistName: string;
  state:
    | "available"
    | "warning"
    | "unavailable"
    | "invalid"
    | "notFound"
    | "ignored";
  message: string;
  cachePath: string;
  resolvedPath: string;
  musicbrainzMbid: string | null;
  matchedCacheName: string | null;
  matchMethod: string;
  artistLinkState: "none" | "unverified" | "verified" | "ignored";
  artistLinkIgnored: boolean;
  suspectMapping: boolean;
  cachedNameCount: number;
  totalReleaseGroupCount: number;
  pureAlbumCount: number;
  ownedCount: number;
  missingCount: number;
  excludedCount: number;
  localAlbumCount: number;
  completion: number | null;
  releaseGroupSource: "cache" | "refreshed";
  releaseGroupUpdatedAt: string | null;
  releases: MusicBrainzArtistReleaseRow[];
  candidates: MusicBrainzArtistCandidateRow[];
};

export type BrowseView = "albums" | "tracks";

export type AiKeySource =
  | "windowsCredentialManager"
  | "environment"
  | "none";

export type AiKeyStatus = {
  configured: boolean;
  source: AiKeySource;
  model: string;
};

export type AiUsage = {
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
};

export type AiMusicResearchEntity = "album" | "artist" | "genre";

export type AiMusicResearchContext = {
  workspace: string;
  selectedEntityType: AiMusicResearchEntity | null;
  selectedEntityId: string | null;
  selectedLabel: string | null;
  selectedSubtitle: string | null;
};

export type AiMusicResearchTurn = {
  role: "user" | "assistant";
  content: string;
};

export type AiMusicResearchRequest = {
  question: string;
  context: AiMusicResearchContext;
  conversation: AiMusicResearchTurn[];
};

export type AiMusicResearchSource = {
  title: string;
  url: string;
};

export type AiMusicResearchAnswer = {
  answer: string;
  sources: AiMusicResearchSource[];
  model: string;
  usage: AiUsage;
  usedWebSearch: boolean;
  localInspectionCount: number;
};

export type AiMusicResearchExchange = {
  question: string;
  result: AiMusicResearchAnswer;
};

export type AiQueryTarget = "search" | "chart";

export type AiQueryFollowUpContext = {
  previousPrompt: string;
  previousSummary: string;
  previousAnswer: string;
};

export type AiCompileRequest = {
  prompt: string;
  target: AiQueryTarget;
  currentView?: BrowseView | null;
  followUp?: AiQueryFollowUpContext | null;
};

export type AiCurrentViewQuestion = {
  question: string;
  request: BrowseRequest;
};

export type AiCurrentViewAnswer = {
  answer: string;
  view: BrowseView;
  matchingRows: number;
  analysisCount: number;
  namedRowsShared: number;
  model: string;
  usage: AiUsage;
};

export type AiQueryExchange = {
  prompt: string;
  result: AiCompiledQuery;
  answer?: AiCurrentViewAnswer | null;
};

export type AiLibraryLens =
  | "overview"
  | "ratingBacklog"
  | "tasteProfile"
  | "catalogBalance"
  | "metadataHealth";

export type AiLibraryAnalysisRequest = {
  lens: AiLibraryLens;
  focus: string;
};

export type AiLibraryFinding = {
  title: string;
  evidence: string;
  interpretation: string;
};

export type AiLibraryAnalysis = {
  lens: AiLibraryLens;
  headline: string;
  summary: string;
  findings: AiLibraryFinding[];
  nextQuestions: string[];
  profileSections: string[];
  aggregatePointsShared: number;
  model: string;
  usage: AiUsage;
};

export type AiSnapshotKind =
  | AiQueryTarget
  | "searchAnswer"
  | "chartAnswer"
  | "libraryAnalysis"
  | "musicResearch";

export type AiSnapshotContent =
  | {
      kind: "search";
      prompt: string;
      result: AiCompiledQuery;
      answer?: AiCurrentViewAnswer | null;
      exchanges?: AiQueryExchange[];
    }
  | {
      kind: "chart";
      prompt: string;
      result: AiCompiledQuery;
      answer?: AiCurrentViewAnswer | null;
      exchanges?: AiQueryExchange[];
    }
  | {
      kind: "searchAnswer";
      prompt: string;
      request: BrowseRequest;
      result: AiCurrentViewAnswer;
    }
  | {
      kind: "chartAnswer";
      prompt: string;
      request: BrowseRequest;
      result: AiCurrentViewAnswer;
    }
  | {
      kind: "libraryAnalysis";
      prompt: string;
      result: AiLibraryAnalysis;
    }
  | {
      kind: "musicResearch";
      prompt: string;
      context: AiMusicResearchContext;
      exchanges: AiMusicResearchExchange[];
    };

export type AiSnapshot = {
  id: number;
  title: string;
  content: AiSnapshotContent;
  libraryImportRunId: number | null;
  libraryImportedAt: string | null;
  libraryAlbumCount: number;
  libraryTrackCount: number;
  createdAt: string;
};

export type SaveAiSnapshotRequest = {
  title: string;
  content: AiSnapshotContent;
};

export type AiPlaylistStrategy =
  | "ranked"
  | "variety"
  | "discovery"
  | "random";

export type AiPlaylistBuildRequest = {
  prompt: string;
  sourceRequest?: BrowseRequest | null;
};

export type AiPlaylistTrack = {
  trackId: number;
  albumId: string;
  album: string | null;
  albumArtist: string | null;
  displayArtist: string | null;
  title: string | null;
  genre: string | null;
  year: number | null;
  seconds: number;
  rating: number | null;
  loved: boolean;
  filePath: string | null;
  filename: string | null;
};

export type AiPlaylist = {
  prompt: string;
  name: string;
  description: string;
  request: BrowseRequest;
  strategy: AiPlaylistStrategy;
  targetTrackCount: number;
  targetMinutes: number;
  maxTracksPerArtist: number;
  maxTracksPerAlbum: number;
  model: string;
  usage: AiUsage;
  matchingTrackCount: number;
  candidateCount: number;
  totalSeconds: number;
  tracks: AiPlaylistTrack[];
};

export type SavePlaylistRequest = {
  id: number | null;
  name: string;
  playlist: AiPlaylist;
};

export type ExportPlaylistRequest = {
  name: string;
  playlist: AiPlaylist;
};

export type SavedPlaylist = {
  id: number;
  name: string;
  playlist: AiPlaylist;
  libraryImportRunId: number | null;
  libraryImportedAt: string | null;
  libraryAlbumCount: number;
  libraryTrackCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ExternalDiscoveryEntity = "artist" | "album" | "song";

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

export type ExternalDiscoveryItem = {
  id: string;
  entity: ExternalDiscoveryEntity;
  title: string;
  artist: string;
  anchor: string | null;
  year: number | null;
  country: string | null;
  itemType: string | null;
  tags: string[];
  score: number;
  evidence: string;
  url: string;
};

export type ExternalDiscoveryResponse = {
  prompt: string;
  title: string;
  summary: string;
  plan: ExternalDiscoveryPlan;
  items: ExternalDiscoveryItem[];
  source: "MusicBrainz";
  fetchedAt: string;
  catalogCandidateCount: number;
  excludedOwnedCount: number;
  limitations: string[];
};

export type SaveExternalDiscoveryRequest = {
  id: number | null;
  name: string;
  response: ExternalDiscoveryResponse;
};

export type SavedExternalDiscovery = {
  id: number;
  name: string;
  response: ExternalDiscoveryResponse;
  libraryImportRunId: number | null;
  libraryImportedAt: string | null;
  libraryAlbumCount: number;
  libraryTrackCount: number;
  createdAt: string;
  updatedAt: string;
};

export type WishListEntity = "artist" | "album";

export type AddWishListItemRequest = {
  entity: WishListEntity;
  title: string;
  artist: string;
  year: number | null;
  musicbrainzId: string | null;
  musicbrainzUrl: string | null;
  source: string;
};

export type WishListItem = AddWishListItemRequest & {
  id: number;
  createdAt: string;
  downloadedDeezerAlbumId: string | null;
  downloadedPath: string | null;
  downloadedAt: string | null;
  artistAlbumSummary: WishListArtistAlbumSummary | null;
};

export type WishListMissingAlbum = {
  releaseGroupId: string;
  title: string;
  year: number | null;
  musicbrainzUrl: string;
};

export type WishListArtistAlbumSummary = {
  officialAlbumCount: number;
  ownedAlbumCount: number;
  missingAlbumCount: number;
  missingAlbums: WishListMissingAlbum[];
  updatedAt: string;
};

export type WishListResponse = {
  items: WishListItem[];
  autoRemovedCount: number;
};

export type WishListMusicBrainzSearchRequest = {
  entity: WishListEntity;
  query: string;
  artist?: string;
  year?: number;
};

export type WishListMusicBrainzCandidate = {
  entity: WishListEntity;
  title: string;
  artist: string;
  year: number | null;
  musicbrainzId: string;
  musicbrainzUrl: string;
  disambiguation: string | null;
  country: string | null;
  score: number;
};

export type WishListMusicBrainzSearchResponse = {
  entity: WishListEntity;
  query: string;
  candidates: WishListMusicBrainzCandidate[];
  searchedAt: string;
};

export type AddWishListMusicBrainzCandidateResponse = {
  added: boolean;
  item: WishListItem | null;
  message: string;
  artistAlbumSummary: WishListArtistAlbumSummary | null;
};

export type WishListArtistAlbumDiscoveryRequest = {
  wishListItemId: number;
};

export type WishListArtistAlbumDiscoveryRow = {
  releaseGroupId: string;
  title: string;
  year: number | null;
  secondaryTypes: string[];
  musicbrainzUrl: string;
  deemixMatches: DeemixAlbumMatch[];
  deemixError: string | null;
  downloadedDeezerAlbumId: string | null;
  downloadedPath: string | null;
  downloadedAt: string | null;
  inLibrary: boolean;
};

export type WishListArtistAlbumDiscoveryResponse = {
  wishListItemId: number;
  artist: string;
  musicbrainzId: string;
  officialAlbumCount: number;
  searchedAlbumCount: number;
  matchedAlbumCount: number;
  truncated: boolean;
  albums: WishListArtistAlbumDiscoveryRow[];
  albumSummary: WishListArtistAlbumSummary;
  searchedAt: string;
};

export type LibraryCompletionStatus =
  | "candidate"
  | "wanted"
  | "notForMe"
  | "needsReview";

export type LibraryCompletionConfidence =
  | "best"
  | "good"
  | "needsReview"
  | "low";

export type LibraryCompletionEvidence = {
  source: "billboard" | "officialUk" | "vgLista";
  label: string;
  bestRank: number;
  firstYear: number;
  lastYear: number;
  appearances: number;
};

export type LibraryCompletionCandidate = {
  id: string;
  artist: string;
  title: string;
  chartYear: number;
  confidence: LibraryCompletionConfidence;
  status: LibraryCompletionStatus;
  wishListItemId: number | null;
  musicbrainzId: string | null;
  musicbrainzUrl: string | null;
  coverUrl: string | null;
  coverStatus: "checking" | "available" | "unavailable" | "failed" | null;
  coverProvider: "musicbrainz" | "discogs" | null;
  coverMessage: string | null;
  coverCheckedAt: string | null;
  verificationStatus:
    | "unverified"
    | "queued"
    | "checking"
    | "verified"
    | "noMatch"
    | "ambiguous"
    | "failed";
  verificationProvider: "musicbrainz" | "discogs" | null;
  verificationMessage: string | null;
  verificationCheckedAt: string | null;
  musicbrainzVerificationStatus: "verified" | "noMatch" | "ambiguous" | "failed" | null;
  musicbrainzVerificationMessage: string | null;
  discogsVerificationStatus: "verified" | "noMatch" | "ambiguous" | "failed" | null;
  discogsVerificationMessage: string | null;
  discogsMasterId: string | null;
  discogsUrl: string | null;
  evidence: LibraryCompletionEvidence[];
};

export type LibraryCompletionCoverEnrichment = {
  candidateId: string;
  state: Exclude<LibraryCompletionCandidate["coverStatus"], null>;
  provider: LibraryCompletionCandidate["coverProvider"];
  message: string;
  hasCover: boolean;
  checkedAt: string;
};

export type LibraryCompletionAtlasCell = {
  source: LibraryCompletionEvidence["source"];
  label: string;
  decade: number;
  owned: number;
  candidates: number;
  verified: number;
  wanted: number;
  needsReview: number;
  excluded: number;
  total: number;
};

export type LibraryCompletionResponse = {
  generatedAt: string;
  totalChartAlbums: number;
  totalCandidates: number;
  returnedCandidates: number;
  truncated: boolean;
  candidates: LibraryCompletionCandidate[];
  atlas: LibraryCompletionAtlasCell[];
};

export type LibraryCompletionRequest = {
  source?: LibraryCompletionEvidence["source"] | null;
  decade?: number | null;
  yearFrom?: number | null;
  yearTo?: number | null;
};

export type SetLibraryCompletionDecisionRequest = {
  candidateId: string;
  artist: string;
  title: string;
  chartYear: number;
  source: string;
  status: LibraryCompletionStatus;
  wishListItemId: number | null;
  musicbrainzId: string | null;
  musicbrainzUrl: string | null;
};

export type LibraryCompletionDecision = {
  candidateId: string;
  status: LibraryCompletionStatus;
  wishListItemId: number | null;
  musicbrainzId: string | null;
  musicbrainzUrl: string | null;
  updatedAt: string;
};

export type StartLibraryCompletionVerificationRequest = {
  scope: "candidate" | "selection" | "campaign";
  candidateIds: string[];
  source: LibraryCompletionEvidence["source"] | null;
  decade: number | null;
  label: string | null;
};

export type SetLibraryCompletionVerificationStateRequest = {
  batchId: number;
  state: "running" | "paused";
};

export type LibraryCompletionVerificationItemSummary = {
  candidateId: string;
  artist: string;
  title: string;
  state: Exclude<LibraryCompletionCandidate["verificationStatus"], "unverified">;
  provider: "musicbrainz" | "discogs";
  message: string | null;
  musicbrainzId: string | null;
  musicbrainzUrl: string | null;
  musicbrainzVerificationStatus: LibraryCompletionCandidate["musicbrainzVerificationStatus"];
  musicbrainzVerificationMessage: string | null;
  discogsVerificationStatus: LibraryCompletionCandidate["discogsVerificationStatus"];
  discogsVerificationMessage: string | null;
  discogsMasterId: string | null;
  discogsUrl: string | null;
  updatedAt: string;
};

export type LibraryCompletionVerificationBatch = {
  id: number;
  label: string;
  source: LibraryCompletionEvidence["source"] | null;
  decade: number | null;
  state: "running" | "paused" | "completed";
  totalCount: number;
  queuedCount: number;
  checkingCount: number;
  verifiedCount: number;
  discogsVerifiedCount: number;
  noMatchCount: number;
  ambiguousCount: number;
  failedCount: number;
  cachedCount: number;
  completedCount: number;
  estimatedSecondsRemaining: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type LibraryCompletionVerificationStatus = {
  batch: LibraryCompletionVerificationBatch | null;
  recentItems: LibraryCompletionVerificationItemSummary[];
};

export type LibraryCompletionArtistEvidence = {
  source: LibraryCompletionEvidence["source"];
  chartKind: "albums" | "singles";
  label: string;
  bestRank: number;
  firstYear: number;
  lastYear: number;
  appearances: number;
};

export type LibraryCompletionArtistCandidate = {
  id: string;
  artist: string;
  firstChartYear: number;
  confidence: Exclude<LibraryCompletionConfidence, "needsReview">;
  status: LibraryCompletionStatus;
  wishListItemId: number | null;
  verificationStatus: LibraryCompletionCandidate["verificationStatus"];
  verificationMessage: string | null;
  verificationCheckedAt: string | null;
  musicbrainzVerificationStatus: LibraryCompletionCandidate["musicbrainzVerificationStatus"];
  musicbrainzVerificationMessage: string | null;
  musicbrainzId: string | null;
  musicbrainzUrl: string | null;
  officialAlbumCount: number;
  discogsVerificationStatus: LibraryCompletionCandidate["discogsVerificationStatus"];
  discogsVerificationMessage: string | null;
  discogsMasterId: string | null;
  discogsUrl: string | null;
  discogsStudioAlbumTitle: string | null;
  evidence: LibraryCompletionArtistEvidence[];
};

export type LibraryCompletionArtistResponse = {
  generatedAt: string;
  totalChartArtists: number;
  ownedArtistCount: number;
  totalCandidates: number;
  returnedCandidates: number;
  truncated: boolean;
  candidates: LibraryCompletionArtistCandidate[];
};

export type LibraryCompletionArtistRequest = {
  source?: LibraryCompletionEvidence["source"] | null;
  yearFrom?: number | null;
  yearTo?: number | null;
};

export type StartLibraryCompletionArtistVerificationRequest = {
  artistIds: string[];
  label: string | null;
};

export type SetLibraryCompletionArtistVerificationStateRequest = {
  batchId: number;
  state: "running" | "paused";
};

export type ConfirmLibraryCompletionArtistMatchRequest = {
  artistId: string;
  candidate: WishListMusicBrainzCandidate;
};

export type SetLibraryCompletionArtistDecisionRequest = {
  artistId: string;
  artist: string;
  status: LibraryCompletionStatus;
};

export type LibraryCompletionArtistDecision = {
  artistId: string;
  status: LibraryCompletionStatus;
  wishListItemId: number | null;
  missingAlbumCount: number | null;
  message: string;
  updatedAt: string;
};

export type LibraryCompletionArtistVerificationItemSummary = {
  artistId: string;
  artist: string;
  state: Exclude<LibraryCompletionArtistCandidate["verificationStatus"], "unverified">;
  provider: "musicbrainz" | "discogs";
  message: string | null;
  officialAlbumCount: number;
  updatedAt: string;
};

export type LibraryCompletionArtistVerificationBatch = {
  id: number;
  label: string;
  state: "running" | "paused" | "completed";
  totalCount: number;
  queuedCount: number;
  checkingCount: number;
  verifiedCount: number;
  noMatchCount: number;
  ambiguousCount: number;
  failedCount: number;
  completedCount: number;
  estimatedSecondsRemaining: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type LibraryCompletionArtistVerificationStatus = {
  batch: LibraryCompletionArtistVerificationBatch | null;
  recentItems: LibraryCompletionArtistVerificationItemSummary[];
};

export type DeemixCredentialSource = "windowsCredentialManager" | "none";

export type DiscogsCredentialStatus = {
  configured: boolean;
  source: "windowsCredentialManager" | "none";
};

export type DiscogsConnectionTest = {
  authenticated: boolean;
  rateLimit: number | null;
  rateLimitRemaining: number | null;
  message: string;
};

export type SaveDiscogsCredentialsRequest = {
  consumerKey: string;
  consumerSecret: string;
};

export type DeemixCredentialStatus = {
  configured: boolean;
  source: DeemixCredentialSource;
};

export type DeemixConnectionTest = {
  accountName: string;
  userId: string;
  country: string | null;
  canStreamHq: boolean;
  canStreamLossless: boolean;
  message: string;
};

export type DeemixAlbumSearchRequest = {
  title: string;
  artist: string;
  year: number | null;
  limit?: number;
};

export type DeemixAlbumMatch = {
  id: string;
  title: string;
  artist: string;
  year: number | null;
  trackCount: number | null;
  recordType: string | null;
  explicit: boolean;
  deezerUrl: string;
  matchScore: number;
  matchLevel: "exact" | "likely" | "possible";
  downloadedAt: string | null;
  downloadedPath: string | null;
};

export type DeemixAlbumSearchResponse = {
  query: string;
  total: number;
  matches: DeemixAlbumMatch[];
  searchedAt: string;
};

export type DeemixAlbumDownloadRequest = {
  albumId: string;
  requestId: string;
  wishListItemId: number | null;
  musicbrainzReleaseGroupId: string | null;
  expectedArtist: string;
  expectedAlbum: string;
  expectedYear: number | null;
  allowDuplicate: boolean;
};

export type DeemixAlbumDownloadPreflightRequest = {
  albumId: string;
  wishListItemId: number | null;
  musicbrainzReleaseGroupId: string | null;
  artist: string;
  album: string;
  year: number | null;
};

export type DeemixAlbumDownloadPreflight = {
  alreadyDownloaded: boolean;
  destinationPath: string | null;
  downloadedAt: string | null;
  message: string;
};

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

export type DeemixAlbumDownloadSummary = {
  requestId: string;
  albumId: string;
  artist: string;
  album: string;
  year: number | null;
  quality: DeemixDownloadQuality;
  destinationPath: string;
  coverPath: string | null;
  warning: string | null;
  trackCount: number;
  completedAt: string;
};

export type SoulseekConnectionState =
  | "unconfigured"
  | "offline"
  | "connecting"
  | "authenticating"
  | "online"
  | "reconnecting"
  | "error";

export type SoulseekConnectionProfile = {
  username: string;
  serverHost: string;
  serverPort: number;
  downloadDirectory: string;
  rememberPassword: boolean;
  autoConnect: boolean;
};

export type SoulseekConnectionSnapshot = {
  state: SoulseekConnectionState;
  username: string | null;
  server: string | null;
  message: string;
  attempt: number;
  connectedAtMs: number | null;
  retryInSeconds: number | null;
  updatedAtMs: number;
};

export type SoulseekConnectionBootstrap = {
  profile: SoulseekConnectionProfile | null;
  suggestedProfile: SoulseekConnectionProfile;
  hasPassword: boolean;
  snapshot: SoulseekConnectionSnapshot;
  diagnosticsPath: string;
};

export type SaveSoulseekConnectionRequest = {
  profile: SoulseekConnectionProfile;
  password: string | null;
};

export type SoulseekSearchState =
  | "idle"
  | "searching"
  | "completed"
  | "stopped"
  | "error";

export type SoulseekSearchSnapshot = {
  state: SoulseekSearchState;
  token: number | null;
  clientId: string;
  query: string;
  resultCount: number;
  peerCount: number;
  message: string;
  startedAtMs: number | null;
  finishedAtMs: number | null;
};

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

export type SoulseekTransferStatus =
  | "queued"
  | "retrying"
  | "requesting"
  | "remotelyQueued"
  | "connecting"
  | "downloading"
  | "paused"
  | "completed"
  | "failed";

export type SoulseekTransfer = {
  id: string;
  releaseId: string | null;
  releaseTitle: string | null;
  releaseFolder: string | null;
  fileIndex: number | null;
  fileCount: number | null;
  expectedTrackCount: number | null;
  releaseGroupId: string | null;
  title: string;
  username: string;
  remoteFilename: string;
  sizeBytes: number;
  transferredBytes: number;
  speedBytesPerSecond: number;
  etaSeconds: number | null;
  status: SoulseekTransferStatus;
  queuePosition: number | null;
  localPath: string;
  error: string | null;
  createdAtMs: number;
  updatedAtMs: number;
};

export type SoulseekTransferQueue = {
  transfers: SoulseekTransfer[];
  activeCount: number;
  maxConcurrentDownloads: number;
  relaySuggestionMinutes: number;
  soundcheckEnabled: boolean;
  safetyState: "running" | "draining" | "pausedForRestart";
};

export type SoulseekSharedRoot = {
  id: string;
  path: string;
  alias: string;
  enabled: boolean;
  fileCount: number;
  directoryCount: number;
  totalSizeBytes: number;
  error: string | null;
};

export type SoulseekLocalShares = {
  roots: SoulseekSharedRoot[];
  uploadSlots: number;
  scanning: boolean;
  totalFileCount: number;
  totalDirectoryCount: number;
  totalSizeBytes: number;
  lastScanAtMs: number | null;
};

export type SoulseekUpload = {
  id: string;
  username: string;
  remoteFilename: string;
  filename: string;
  sizeBytes: number;
  transferredBytes: number;
  speedBytesPerSecond: number;
  etaSeconds: number | null;
  status: "queued" | "connecting" | "uploading" | "completed" | "failed" | "cancelled";
  queuePosition: number | null;
  error: string | null;
  createdAtMs: number;
  updatedAtMs: number;
};

export type SoulseekUploadQueue = {
  uploads: SoulseekUpload[];
  activeCount: number;
  queuedCount: number;
  sessionUploadedBytes: number;
};

export type UsenetProfile = {
  prowlarrUrl: string;
  newsHost: string;
  newsPort: number;
  useTls: boolean;
  username: string;
  downloadDirectory: string;
  connections: number;
};

export type UsenetBootstrap = {
  profile: UsenetProfile;
  hasProwlarrApiKey: boolean;
  hasNewsPassword: boolean;
  extractorPath: string | null;
};

export type SaveUsenetProfileRequest = {
  profile: UsenetProfile;
  prowlarrApiKey: string | null;
  newsPassword: string | null;
};

export type UsenetConnectionTest = {
  prowlarrVersion: string;
  newsServer: string;
  extractorPath: string | null;
  message: string;
};

export type UsenetSearchRequest = {
  title: string;
  artist: string;
  year: number | null;
  limit?: number;
};

export type UsenetSearchResult = {
  guid: string;
  title: string;
  indexer: string;
  sizeBytes: number;
  ageDays: number;
  grabs: number | null;
  publishDate: string | null;
  downloadUrl: string;
  infoUrl: string | null;
  categories: string[];
  matchScore: number;
};

export type UsenetSearchResponse = {
  query: string;
  results: UsenetSearchResult[];
  searchedAt: string;
};

export type UsenetDownloadRequest = {
  guid: string;
  title: string;
  indexer: string;
  downloadUrl: string;
  sizeBytes: number;
  expectedArtist: string;
  expectedAlbum: string;
  expectedYear: number | null;
  releaseGroupId: string | null;
};

export type UsenetTransferStatus =
  | "queued"
  | "fetchingNzb"
  | "downloading"
  | "extracting"
  | "completed"
  | "failed";

export type UsenetTransfer = {
  id: string;
  guid: string;
  title: string;
  indexer: string;
  status: UsenetTransferStatus;
  progressPercent: number;
  downloadedBytes: number;
  totalBytes: number;
  message: string;
  destinationPath: string | null;
  error: string | null;
  releaseGroupId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UsenetTransferQueue = {
  transfers: UsenetTransfer[];
  activeCount: number;
};

export type AiConnectionTest = {
  model: string;
  message: string;
  usage: AiUsage;
};

export type TextFilterOperator = "contains" | "equals" | "startsWith";

export type TextFilter = {
  operator: TextFilterOperator;
  value: string;
};

export type BrowseFilters = {
  albumIds: string[];
  trackIds: number[];
  artistKeys: string[];
  albumTitle: TextFilter;
  trackTitle: TextFilter;
  albumArtist: TextFilter;
  displayArtist: TextFilter;
  publisher: TextFilter;
  filePath: TextFilter;
  filename: TextFilter;
  hasTrackText: string;
  genres: string[];
  excludedGenres: string[];
  missingFields: string[];
  billboardRankMin: number | null;
  billboardRankMax: number | null;
  billboardSingleRankMin: number | null;
  billboardSingleRankMax: number | null;
  billboardSingleDebutDateFrom: string | null;
  billboardSingleDebutDateTo: string | null;
  billboardDebutWeekFrom: string | null;
  billboardDebutWeekTo: string | null;
  vgListaRankMin: number | null;
  vgListaRankMax: number | null;
  vgListaDebutWeekFrom: string | null;
  vgListaDebutWeekTo: string | null;
  officialUkRankMin: number | null;
  officialUkRankMax: number | null;
  officialUkDebutWeekFrom: string | null;
  officialUkDebutWeekTo: string | null;
  tiISkuddetRankMin: number | null;
  tiISkuddetRankMax: number | null;
  tiISkuddetDebutWeekFrom: string | null;
  tiISkuddetDebutWeekTo: string | null;
  norsktoppenRankMin: number | null;
  norsktoppenRankMax: number | null;
  norsktoppenDebutWeekFrom: string | null;
  norsktoppenDebutWeekTo: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  releaseYearFrom: number | null;
  releaseYearTo: number | null;
  totalMinutesMin: number | null;
  totalMinutesMax: number | null;
  trackCountMin: number | null;
  trackCountMax: number | null;
  ratedTracksMin: number | null;
  ratedTracksMax: number | null;
  albumRatingMin: number | null;
  albumRatingMax: number | null;
  trackRatingMin: number | null;
  trackRatingMax: number | null;
  ratingCompletenessMin: number | null;
  ratingCompletenessMax: number | null;
  notFullyRated: boolean;
  lovedTracksMin: number | null;
  lovedTracksMax: number | null;
  originCountryCodes: string[];
  excludedOriginCountryCodes: string[];
  missingOriginCountry: boolean;
  artistType: string;
  artistGender: string;
  artistBornYearFrom: number | null;
  artistBornYearTo: number | null;
  artistDied: boolean;
  artistDiedYearFrom: number | null;
  artistDiedYearTo: number | null;
  artistFoundedYearFrom: number | null;
  artistFoundedYearTo: number | null;
  artistDissolved: boolean;
  artistDissolvedYearFrom: number | null;
  artistDissolvedYearTo: number | null;
};

export type BrowseSort = {
  field: string;
  direction: "asc" | "desc";
};

export type BrowseRequest = {
  view: BrowseView;
  searchText: string;
  filters: BrowseFilters;
  sort: BrowseSort;
  limit: number;
  offset: number;
};

export type ArtistListRequest = {
  searchText: string;
  sort: BrowseSort;
  limit: number;
  offset: number;
};

export type ArtistSummary = {
  id: string;
  name: string;
  albumCount: number;
  ratedAlbumCount: number;
  partialAlbumCount: number;
  unratedAlbumCount: number;
  trackCount: number;
  totalSeconds: number;
  lovedTracks: number;
  tmoeSeconds: number;
  averageRatingCompleteness: number | null;
  averageAlbumRating: number | null;
  averageAlbumScore: number | null;
  firstYear: number | null;
  lastYear: number | null;
  topGenre: string | null;
  musicBrainzMbid: string | null;
  musicBrainzSortName: string | null;
  musicBrainzArtistType: string | null;
  musicBrainzGender: string | null;
  musicBrainzBeginDate: string | null;
  musicBrainzBeginYear: number | null;
  musicBrainzEndDate: string | null;
  musicBrainzEndYear: number | null;
  musicBrainzEnded: boolean | null;
  musicBrainzBeginAreaName: string | null;
  musicBrainzEndAreaName: string | null;
  musicBrainzInfoReviewState: string | null;
  musicBrainzInfoFetchedAt: string | null;
  originCountryCode: string | null;
  originCountryName: string | null;
  originCountryRawArea: string | null;
  originCountryReviewState: string | null;
};

export type ArtistListResponse = {
  rows: ArtistSummary[];
  total: number;
  limit: number;
  offset: number;
};

export type GenreListRequest = {
  searchText: string;
  sort: BrowseSort;
  limit: number;
  offset: number;
};

export type GenreSummary = {
  id: string;
  name: string;
  albumCount: number;
  ratedAlbumCount: number;
  partialAlbumCount: number;
  unratedAlbumCount: number;
  trackCount: number;
  totalSeconds: number;
  lovedTracks: number;
  tmoeSeconds: number;
  averageRatingCompleteness: number | null;
  averageAlbumRating: number | null;
  averageAlbumScore: number | null;
  firstYear: number | null;
  lastYear: number | null;
  topArtist: string | null;
};

export type GenreListResponse = {
  rows: GenreSummary[];
  total: number;
  limit: number;
  offset: number;
};

export type DiscoveryResponse = {
  heatmap: DiscoveryHeatmapCell[];
  backlogMissions: DiscoveryMission[];
  smartMissions: DiscoveryMission[];
  loveRatingPoints: DiscoveryAlbumPoint[];
  genrePoints: DiscoveryGenrePoint[];
  artistPoints: DiscoveryArtistPoint[];
  generatedAt: string | null;
};

export type DiscoveryHeatmapCell = {
  genreId: string;
  genre: string;
  year: number;
  albumCount: number;
  ratedAlbumCount: number;
  partialAlbumCount: number;
  unratedAlbumCount: number;
  trackCount: number;
  lovedTracks: number;
  averageRatingCompleteness: number | null;
  averageAlbumScore: number | null;
};

export type DiscoveryMission = {
  id: string;
  title: string;
  description: string;
  actionLabel: string;
  albumCount: number;
  trackCount: number;
  lovedTracks: number;
  averageAlbumScore: number | null;
  averageRatingCompleteness: number | null;
  genreId: string | null;
  genre: string | null;
  artistId: string | null;
  artist: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  ratedTracksMin: number | null;
  ratingCompletenessMin: number | null;
  ratingCompletenessMax: number | null;
  lovedTracksMin: number | null;
  sortField: string;
  sortDirection: "asc" | "desc";
  limit: number;
};

export type DiscoveryAlbumPoint = {
  albumId: string;
  album: string | null;
  albumArtistDisplay: string | null;
  genreId: string | null;
  genre: string | null;
  year: number | null;
  lovedTracks: number;
  albumScore: number | null;
  effectiveAlbumRating: number | null;
  ratingCompleteness: number;
  totalSeconds: number;
};

export type DiscoveryGenrePoint = {
  genreId: string;
  genre: string;
  albumCount: number;
  trackCount: number;
  lovedTracks: number;
  totalSeconds: number;
  partialAlbumCount: number;
  unratedAlbumCount: number;
  averageRatingCompleteness: number | null;
  averageAlbumScore: number | null;
};

export type DiscoveryArtistPoint = {
  artistId: string;
  artist: string;
  albumCount: number;
  trackCount: number;
  lovedTracks: number;
  totalSeconds: number;
  partialAlbumCount: number;
  unratedAlbumCount: number;
  averageRatingCompleteness: number | null;
  averageAlbumScore: number | null;
  topGenre: string | null;
};

export type MusicToolSeverity = "high" | "medium" | "low";

export type MusicToolScope = "albums" | "tracks" | "artists";

export type MusicToolSummary = {
  id: string;
  label: string;
  description: string;
  severity: MusicToolSeverity;
  scope: MusicToolScope;
  issueCount: number;
  albumCount: number;
  trackCount: number;
};

export type MusicToolIssueRequest = {
  toolId: string;
  requestId: string;
  searchText: string;
  sort: BrowseSort;
  limit: number;
  offset: number;
};

export type MusicToolProgress = {
  toolId: string;
  requestId: string;
  status: "starting" | "counting" | "loading" | "completed" | "failed";
  percent: number;
  message: string;
};

export type MusicToolIssueRow = {
  id: string;
  toolId: string;
  severity: MusicToolSeverity;
  entityType: MusicToolScope;
  albumId: string;
  trackId: number | null;
  album: string | null;
  albumArtistDisplay: string | null;
  title: string | null;
  canonicalGenre: string | null;
  year: number | null;
  detail: string;
  value: string | null;
  filename: string | null;
  filePath: string | null;
};

export type MusicToolIssueResponse = {
  tool: MusicToolSummary;
  rows: MusicToolIssueRow[];
  total: number;
  limit: number;
  offset: number;
};

export type MusicToolFixRequest = {
  toolId: string;
  issueIds: string[];
  apply: boolean;
};

export type MusicToolFixConfidence = "high" | "medium" | "low";

export type MusicToolFieldDiff = {
  field: string;
  label: string;
  before: string | null;
  after: string | null;
};

export type MusicToolFixDiff = {
  id: string;
  entityType: "tracks" | "albums";
  entityId: string;
  albumId: string;
  trackId: number | null;
  label: string;
  context: string | null;
  confidence: MusicToolFixConfidence;
  sourceWarning: string;
  changes: MusicToolFieldDiff[];
};

export type MusicToolFixSummary = {
  repairId: number | null;
  toolId: string;
  action: string;
  applied: boolean;
  confidence: MusicToolFixConfidence;
  sourceWarning: string;
  requestedCount: number;
  fixableCount: number;
  affectedAlbumCount: number;
  affectedTrackCount: number;
  changedAlbumCount: number;
  changedTrackCount: number;
  skippedCount: number;
  backupPath: string | null;
  message: string;
  diffs: MusicToolFixDiff[];
};

export type MusicToolFixHistoryEntry = {
  id: number;
  toolId: string;
  toolLabel: string;
  action: string;
  status: "applied" | "undone";
  confidence: MusicToolFixConfidence;
  requestedCount: number;
  fixableCount: number;
  affectedAlbumCount: number;
  affectedTrackCount: number;
  changedAlbumCount: number;
  changedTrackCount: number;
  diffCount: number;
  backupPath: string | null;
  undoBackupPath: string | null;
  sourceWarning: string;
  message: string;
  createdAt: string;
  undoneAt: string | null;
  canUndo: boolean;
};

export type MusicToolUndoSummary = {
  run: MusicToolFixHistoryEntry;
  restoredAlbumCount: number;
  restoredTrackCount: number;
  backupPath: string | null;
  message: string;
};

export type BrowseRow = {
  id: string;
  trackId: number | null;
  albumId: string;
  album: string | null;
  albumArtistDisplay: string | null;
  displayArtist: string | null;
  title: string | null;
  canonicalGenre: string | null;
  publisher: string | null;
  year: number | null;
  releaseYear: number | null;
  totalTracks: number | null;
  ratedTracks: number | null;
  ratingCompleteness: number | null;
  totalSeconds: number | null;
  lovedTracks: number | null;
  tmoeSeconds: number | null;
  aeRatio: number | null;
  effectiveAlbumRating: number | null;
  albumScore: number | null;
  billboardRank: number | null;
  billboardYear: number | null;
  billboardDebutYear: number | null;
  billboardDebutMonth: number | null;
  billboardDebutWeek: number | null;
  billboardDebutWeekKey: string | null;
  billboardSingleRank: number | null;
  billboardSingleYear: number | null;
  billboardSingleDebutDate: string | null;
  billboardSingleDebutYear: number | null;
  billboardSingleDebutMonth: number | null;
  billboardSingleDebutWeek: number | null;
  billboardSingleDebutWeekKey: string | null;
  vgListaRank: number | null;
  vgListaYear: number | null;
  vgListaDebutYear: number | null;
  vgListaDebutMonth: number | null;
  vgListaDebutWeek: number | null;
  vgListaDebutWeekKey: string | null;
  officialUkRank: number | null;
  officialUkYear: number | null;
  officialUkDebutYear: number | null;
  officialUkDebutMonth: number | null;
  officialUkDebutWeek: number | null;
  officialUkDebutWeekKey: string | null;
  tiISkuddetRank: number | null;
  tiISkuddetYear: number | null;
  tiISkuddetDebutDate: string | null;
  tiISkuddetDebutYear: number | null;
  tiISkuddetDebutMonth: number | null;
  tiISkuddetDebutWeek: number | null;
  tiISkuddetDebutWeekKey: string | null;
  norsktoppenRank: number | null;
  norsktoppenYear: number | null;
  norsktoppenDebutDate: string | null;
  norsktoppenDebutYear: number | null;
  norsktoppenDebutMonth: number | null;
  norsktoppenDebutWeek: number | null;
  norsktoppenDebutWeekKey: string | null;
  trackSeconds: number | null;
  normalizedRating: number | null;
  discNumber: number | null;
  trackNumber: number | null;
  love: string | null;
  filePath: string | null;
  filename: string | null;
  coverPath: string | null;
  coverMimeType: string | null;
  originCountryCode: string | null;
  originCountryName: string | null;
  originCountryRawArea: string | null;
  originCountryReviewState: string | null;
};

export type BrowseResponse = {
  view: BrowseView;
  rows: BrowseRow[];
  total: number;
  limit: number;
  offset: number;
};

export type AlbumDebutTimelineAlbum = {
  id: string;
  albumId: string;
  album: string | null;
  albumArtistDisplay: string | null;
  canonicalGenre: string | null;
  year: number | null;
  albumScore: number | null;
  billboardRank: number | null;
  billboardYear: number | null;
  billboardDebutYear: number;
  billboardDebutMonth: number;
  billboardDebutWeek: number;
  billboardDebutWeekKey: string;
  coverPath: string | null;
  coverMimeType: string | null;
};

export type AlbumDebutTimelineYear = {
  year: number;
  albumCount: number;
  representativeAlbum: AlbumDebutTimelineAlbum | null;
};

export type AlbumDebutTimelineResponse = {
  years: AlbumDebutTimelineYear[];
  selectedYear: number | null;
  albums: AlbumDebutTimelineAlbum[];
  datedAlbumCount: number;
  undatedAlbumCount: number;
};

export type TrackDebutTimelineTrack = {
  id: string;
  trackId: number;
  albumId: string;
  title: string | null;
  displayArtist: string | null;
  album: string | null;
  albumArtistDisplay: string | null;
  canonicalGenre: string | null;
  year: number | null;
  normalizedRating: number | null;
  love: string | null;
  billboardSingleRank: number | null;
  billboardSingleYear: number | null;
  billboardSingleDebutDate: string;
  billboardSingleDebutYear: number;
  billboardSingleDebutMonth: number;
  billboardSingleDebutWeek: number;
  billboardSingleDebutWeekKey: string;
  coverPath: string | null;
  coverMimeType: string | null;
};

export type TrackDebutTimelineYear = {
  year: number;
  trackCount: number;
  representativeTrack: TrackDebutTimelineTrack | null;
};

export type TrackDebutTimelineResponse = {
  years: TrackDebutTimelineYear[];
  selectedYear: number | null;
  tracks: TrackDebutTimelineTrack[];
  datedTrackCount: number;
  undatedTrackCount: number;
};

export type TimelineChartSource =
  | "billboard"
  | "vgLista"
  | "officialUk"
  | "tiISkuddet"
  | "norsktoppen";

export type SavedSearch = {
  id: number;
  name: string;
  view: BrowseView;
  request: BrowseRequest;
  createdAt: string;
  updatedAt: string;
};

export type ChartViewMode = "table" | "compact" | "grid";

export type ChartConfig = {
  request: BrowseRequest;
  rankingMetric: string;
  sortField?: string | null;
  ratingCompletenessMin: number;
  ratingCompletenessMax: number;
  ratingCompletenessThreshold?: number | null;
  sortDirection: "asc" | "desc";
  resultLimit: number;
  visibleColumns: string[];
  exportColumns: string[];
  viewMode: ChartViewMode;
  gridCoverSize: number;
};

export type AiCompiledQuery = {
  target: AiQueryTarget;
  queryIntent?: "filter" | "answer";
  summary: string;
  request: BrowseRequest;
  chartConfig: ChartConfig | null;
  model: string;
  usage: AiUsage;
};

export type SavedChart = {
  id: number;
  name: string;
  config: ChartConfig;
  createdAt: string;
  updatedAt: string;
};

export type ExportResult = {
  path: string;
  format: string;
  rowCount: number;
  pathCopied: boolean;
};

export type AiMarkdownExportRequest = {
  title: string;
  markdown: string;
};

export type StatisticsResponse = {
  overview: LibraryOverviewStats;
  healthScore: LibraryHealthScore;
  libraryShape: LibraryShapeStats;
  ratingProgress: RatingProgressStats;
  decadeProgress: DecadeProgressStats[];
  yearProgress: YearProgressStats[];
  genreProgress: GenreProgressStats[];
  lovedDensity: LovedDensityStat[];
  catalogConcentration: CatalogConcentrationStats;
  durationAnalytics: DurationAnalyticsStats;
  outlierStats: OutlierStat[];
  trackRatingDistribution: RatingBucket[];
  albumRatingDistribution: RatingBucket[];
  metadataCoverage: MetadataCoverageMetric[];
  lovedTracks: LovedTrackStats;
  importHistory: ImportRun[];
  ratingHistory: RatingHistoryPoint[];
  recentRatingEvents: RatingEvent[];
  lastUpdated: string | null;
};

export type LibraryShapeStats = {
  medianYear: number | null;
  mostRepresentedDecade: number | null;
  mostRepresentedDecadeAlbums: number;
  peakYear: number | null;
  peakYearAlbums: number;
};

export type LibraryHealthScore = {
  score: number;
  ratingCoverage: number;
  albumCompletion: number;
  metadataCoverage: number;
  coverCoverage: number;
  scoreCoverage: number;
};

export type LibraryOverviewStats = {
  trackCount: number;
  albumCount: number;
  albumArtistCount: number;
  genreCount: number;
  yearCount: number;
  totalSeconds: number;
  averageAlbumScore: number | null;
};

export type RatingProgressStats = {
  fullyRatedAlbums: number;
  partiallyRatedAlbums: number;
  unratedAlbums: number;
  albumsWithEffectiveRating: number;
  ratedTracks: number;
  unratedTracks: number;
  averageRatingCompleteness: number | null;
  averageAlbumRating: number | null;
};

export type DecadeProgressStats = {
  decade: number;
  albumCount: number;
  ratedAlbumCount: number;
  partialAlbumCount: number;
  unratedAlbumCount: number;
  trackCount: number;
  totalSeconds: number;
  lovedTracks: number;
  averageAlbumScore: number | null;
};

export type YearProgressStats = {
  year: number;
  albumCount: number;
  ratedAlbumCount: number;
  partialAlbumCount: number;
  unratedAlbumCount: number;
  trackCount: number;
  totalSeconds: number;
  lovedTracks: number;
  averageAlbumScore: number | null;
};

export type YearProgressRequest = {
  genres: string[];
  excludedGenres: string[];
};

export type GenreProgressRequest = {
  yearFrom: number | null;
  yearTo: number | null;
  genres: string[];
  excludedGenres: string[];
};

export type GenreProgressStats = {
  genre: string;
  albumCount: number;
  ratedAlbumCount: number;
  partialAlbumCount: number;
  unratedAlbumCount: number;
  trackCount: number;
  totalSeconds: number;
  lovedTracks: number;
  averageAlbumScore: number | null;
};

export type LovedDensityStat = {
  scope: string;
  label: string;
  albumCount: number;
  trackCount: number;
  lovedTracks: number;
  lovedPer100Tracks: number;
};

export type CatalogConcentrationStats = {
  artistPoints: ConcentrationPoint[];
  genrePoints: ConcentrationPoint[];
  topArtist: string | null;
  topArtistAlbumCount: number;
  topGenre: string | null;
  topGenreAlbumCount: number;
};

export type ConcentrationPoint = {
  topN: number;
  albumCount: number;
  share: number;
};

export type DurationAnalyticsStats = {
  averageAlbumSeconds: number | null;
  averageTrackSeconds: number | null;
  longestAlbums: DurationAlbumStat[];
  shortestAlbums: DurationAlbumStat[];
  trackCountBuckets: RatingBucket[];
};

export type DurationAlbumStat = {
  albumId: string;
  album: string | null;
  albumArtistDisplay: string | null;
  year: number | null;
  totalTracks: number;
  totalSeconds: number;
  ratingCompleteness: number;
  albumScore: number | null;
};

export type OutlierStat = {
  id: string;
  label: string;
  value: string;
  detail: string;
};

export type MetadataCoverageMetric = {
  id: string;
  label: string;
  scope: string;
  coveredCount: number;
  totalCount: number;
};

export type RatingBucket = {
  label: string;
  count: number;
};

export type LovedTrackStats = {
  lovedTracks: number;
  albumsWithLovedTracks: number;
  averageLovedTracksPerAlbum: number | null;
  topLovedGenre: string | null;
  topLovedYear: number | null;
};

export type RatingHistoryPoint = {
  importRunId: number;
  createdAt: string;
  trackCount: number;
  albumCount: number;
  ratedTracks: number;
  unratedTracks: number;
  fullyRatedAlbums: number;
  partiallyRatedAlbums: number;
  unratedAlbums: number;
  albumsWithEffectiveRating: number;
  averageAlbumRating: number | null;
  averageAlbumScore: number | null;
  ratingEventsCount: number;
};

export type RatingEvent = {
  id: number;
  importRunId: number;
  createdAt: string;
  eventType: string;
  albumId: string;
  album: string | null;
  albumArtistDisplay: string | null;
  year: number | null;
  previousRatedTracks: number | null;
  currentRatedTracks: number | null;
  previousRatingCompleteness: number | null;
  currentRatingCompleteness: number | null;
  previousEffectiveAlbumRating: number | null;
  currentEffectiveAlbumRating: number | null;
};

export type MusicMapSummary = {
  totalArtists: number;
  mappedArtists: number;
  preciseArtistCount: number;
  countryFallbackArtistCount: number;
  areaCount: number;
  countryCount: number;
  unresolvedArtistCount: number;
  candidateAreaCount: number;
  lastRefreshedAt: string | null;
  needsRefresh: boolean;
};

export type MusicMapPoint = {
  id: string;
  name: string;
  countryCode: string | null;
  countryName: string | null;
  precision: "area" | "country";
  latitude: number;
  longitude: number;
  artistCount: number;
  albumCount: number;
  trackCount: number;
  lovedTracks: number;
  topGenre: string;
};

export type MusicMapResponse = {
  summary: MusicMapSummary;
  countries: MusicMapPoint[];
  areas: MusicMapPoint[];
  generatedAt: string;
};

export type MusicMapGenreStat = {
  genre: string;
  albumCount: number;
  artistCount: number;
  percentage: number;
};

export type MusicMapArtist = {
  artistKey: string;
  name: string;
  albumCount: number;
  trackCount: number;
  lovedTracks: number;
  topGenre: string;
  representativeAlbumId: string | null;
  representativeAlbumTitle: string | null;
  coverPath: string | null;
};

export type MusicMapLocationDetails = {
  point: MusicMapPoint;
  genres: MusicMapGenreStat[];
  artists: MusicMapArtist[];
};

export type MusicMapRefreshSummary = {
  candidateAreas: number;
  resolvedAreas: number;
  candidateCountries: number;
  resolvedCountries: number;
  unresolvedLocations: number;
  fetchedAt: string;
};
