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

export type LibraryStatus = {
  dbPath: string;
  hasDatabase: boolean;
  trackCount: number;
  albumCount: number;
  coverCount: number;
  importRunCount: number;
  lastImport: ImportRun | null;
};

export type ImportProgress = {
  status: string;
  processedRows: number;
  albumCount: number;
  message: string;
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

export type LeftSidebarMode = "expanded" | "iconOnly" | "hidden";

export type RightSidebarMode = "expanded" | "hidden";

export type AppSettings = {
  backupRetention: number;
  darkMode: boolean;
  leftSidebarDefault: LeftSidebarMode;
  rightSidebarDefault: RightSidebarMode;
  updatedAt: string | null;
};

export type BrowseView = "albums" | "tracks";

export type TextFilterOperator = "contains" | "equals" | "startsWith";

export type TextFilter = {
  operator: TextFilterOperator;
  value: string;
};

export type BrowseFilters = {
  albumIds: string[];
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
  lovedTracksMin: number | null;
  lovedTracksMax: number | null;
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

export type MusicToolScope = "albums" | "tracks";

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
  trackSeconds: number | null;
  normalizedRating: number | null;
  discNumber: number | null;
  trackNumber: number | null;
  love: string | null;
  filePath: string | null;
  filename: string | null;
  coverPath: string | null;
  coverMimeType: string | null;
};

export type BrowseResponse = {
  view: BrowseView;
  rows: BrowseRow[];
  total: number;
  limit: number;
  offset: number;
};

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
