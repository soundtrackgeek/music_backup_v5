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

export type BrowseView = "albums" | "tracks";

export type TextFilterOperator = "contains" | "equals" | "startsWith";

export type TextFilter = {
  operator: TextFilterOperator;
  value: string;
};

export type BrowseFilters = {
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
