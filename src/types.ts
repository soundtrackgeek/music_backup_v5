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

export type AppSettings = {
  backupRetention: number;
  darkMode: boolean;
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
  albumRatingMin: number | null;
  albumRatingMax: number | null;
  trackRatingMin: number | null;
  trackRatingMax: number | null;
  ratingCompletenessMin: number | null;
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
  ratingCompletenessThreshold: number;
  sortDirection: "asc" | "desc";
  resultLimit: number;
  visibleColumns: string[];
  exportColumns: string[];
  viewMode: ChartViewMode;
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
  ratingProgress: RatingProgressStats;
  yearProgress: YearProgressStats[];
  genreProgress: GenreProgressStats[];
  trackRatingDistribution: RatingBucket[];
  albumRatingDistribution: RatingBucket[];
  lovedTracks: LovedTrackStats;
  importHistory: ImportRun[];
  ratingHistory: RatingHistoryPoint[];
  recentRatingEvents: RatingEvent[];
  lastUpdated: string | null;
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
