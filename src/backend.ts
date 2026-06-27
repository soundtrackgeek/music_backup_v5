import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AppSettings,
  ArtistListRequest,
  ArtistListResponse,
  ArtistSummary,
  BrowseRequest,
  BrowseResponse,
  BrowseRow,
  CoverImportProgress,
  CoverImportRequest,
  CoverImportSummary,
  DiscoveryResponse,
  ExportResult,
  ImportProgress,
  ImportRun,
  ImportSummary,
  LibraryStatus,
  SavedChart,
  SavedSearch,
  ChartConfig,
  LeftSidebarMode,
  RightSidebarMode,
  StatisticsResponse,
  GenreListRequest,
  GenreListResponse,
  GenreSummary,
  MusicToolIssueRequest,
  MusicToolIssueResponse,
  MusicToolIssueRow,
  MusicToolProgress,
  MusicToolSummary,
} from "./types";

export const settingsStorageKey = "musicLibrarySettings:v1";

const scoreGenreGroup = [
  "action",
  "animation",
  "comedy",
  "documentary",
  "drama",
  "fantasy",
  "horror",
  "sci-fi",
  "thriller",
  "tv",
  "video game",
  "western",
  "anime",
] as const;

const mockStatus: LibraryStatus = {
  dbPath: "Tauri desktop runtime required for SQLite access",
  hasDatabase: true,
  trackCount: 1130882,
  albumCount: 76789,
  coverCount: 0,
  importRunCount: 0,
  lastImport: null,
};

const mockRows: BrowseRow[] = [
  {
    id: "mb:mock-1",
    trackId: null,
    albumId: "mb:mock-1",
    album: "Actually",
    albumArtistDisplay: "Pet Shop Boys",
    displayArtist: null,
    title: null,
    canonicalGenre: "Synthpop",
    publisher: "Parlophone",
    year: 1987,
    releaseYear: 1987,
    totalTracks: 10,
    ratedTracks: 10,
    ratingCompleteness: 1,
    totalSeconds: 2880,
    lovedTracks: 2,
    tmoeSeconds: 840,
    aeRatio: 0.2916,
    effectiveAlbumRating: 86,
    albumScore: 207.62,
    trackSeconds: null,
    normalizedRating: null,
    discNumber: null,
    trackNumber: null,
    love: null,
    filePath: null,
    filename: null,
    coverPath: null,
    coverMimeType: null,
  },
  {
    id: "mb:mock-2",
    trackId: null,
    albumId: "mb:mock-2",
    album: "The Queen Is Dead",
    albumArtistDisplay: "The Smiths",
    displayArtist: null,
    title: null,
    canonicalGenre: "Post-Punk",
    publisher: "Rough Trade",
    year: 1986,
    releaseYear: 1986,
    totalTracks: 10,
    ratedTracks: 10,
    ratingCompleteness: 1,
    totalSeconds: 2220,
    lovedTracks: 1,
    tmoeSeconds: 600,
    aeRatio: 0.2702,
    effectiveAlbumRating: 88,
    albumScore: 108.4,
    trackSeconds: null,
    normalizedRating: null,
    discNumber: null,
    trackNumber: null,
    love: null,
    filePath: null,
    filename: null,
    coverPath: null,
    coverMimeType: null,
  },
  {
    id: "mb:mock-score",
    trackId: null,
    albumId: "mb:mock-score",
    album: "Journey",
    albumArtistDisplay: "Austin Wintory",
    displayArtist: null,
    title: null,
    canonicalGenre: "Video Game",
    publisher: "Sony Computer Entertainment",
    year: 2012,
    releaseYear: 2012,
    totalTracks: 18,
    ratedTracks: 18,
    ratingCompleteness: 1,
    totalSeconds: 3480,
    lovedTracks: 3,
    tmoeSeconds: 960,
    aeRatio: 0.2759,
    effectiveAlbumRating: 91,
    albumScore: 251.16,
    trackSeconds: null,
    normalizedRating: null,
    discNumber: null,
    trackNumber: null,
    love: null,
    filePath: null,
    filename: null,
    coverPath: null,
    coverMimeType: null,
  },
  {
    id: "mb:mock-metal",
    trackId: null,
    albumId: "mb:mock-metal",
    album: "Holy Diver",
    albumArtistDisplay: "Dio",
    displayArtist: null,
    title: null,
    canonicalGenre: "Heavy Metal",
    publisher: "Warner Bros.",
    year: 1984,
    releaseYear: 1983,
    totalTracks: 9,
    ratedTracks: 4,
    ratingCompleteness: 0.44,
    totalSeconds: 2520,
    lovedTracks: 1,
    tmoeSeconds: 480,
    aeRatio: 0.1904,
    effectiveAlbumRating: 74,
    albumScore: 82.1,
    trackSeconds: null,
    normalizedRating: null,
    discNumber: null,
    trackNumber: null,
    love: null,
    filePath: null,
    filename: null,
    coverPath: null,
    coverMimeType: null,
  },
  {
    id: "mb:mock-nu",
    trackId: null,
    albumId: "mb:mock-nu",
    album: "Issues",
    albumArtistDisplay: "Korn",
    displayArtist: null,
    title: null,
    canonicalGenre: "Nu-Metal",
    publisher: "Immortal",
    year: 1999,
    releaseYear: 1999,
    totalTracks: 12,
    ratedTracks: 4,
    ratingCompleteness: 0.33,
    totalSeconds: 3180,
    lovedTracks: 0,
    tmoeSeconds: 420,
    aeRatio: 0.132,
    effectiveAlbumRating: 68,
    albumScore: 61.5,
    trackSeconds: null,
    normalizedRating: null,
    discNumber: null,
    trackNumber: null,
    love: null,
    filePath: null,
    filename: null,
    coverPath: null,
    coverMimeType: null,
  },
  {
    id: "mb:mock-unrated",
    trackId: null,
    albumId: "mb:mock-unrated",
    album: "The End of Heartache",
    albumArtistDisplay: "Killswitch Engage",
    displayArtist: null,
    title: null,
    canonicalGenre: "Metalcore",
    publisher: "Roadrunner",
    year: 2004,
    releaseYear: 2004,
    totalTracks: 10,
    ratedTracks: 0,
    ratingCompleteness: 0,
    totalSeconds: 2860,
    lovedTracks: 0,
    tmoeSeconds: 0,
    aeRatio: 0,
    effectiveAlbumRating: null,
    albumScore: null,
    trackSeconds: null,
    normalizedRating: null,
    discNumber: null,
    trackNumber: null,
    love: null,
    filePath: null,
    filename: null,
    coverPath: null,
    coverMimeType: null,
  },
  {
    id: "track:mock-1",
    trackId: 1,
    albumId: "mb:mock-1",
    album: "Actually",
    albumArtistDisplay: "Pet Shop Boys",
    displayArtist: "Pet Shop Boys",
    title: "What Have I Done to Deserve This?",
    canonicalGenre: "Synthpop",
    publisher: "Parlophone",
    year: 1987,
    releaseYear: 1987,
    totalTracks: 10,
    ratedTracks: 10,
    ratingCompleteness: 1,
    totalSeconds: 2880,
    lovedTracks: 2,
    tmoeSeconds: 840,
    aeRatio: 0.2916,
    effectiveAlbumRating: 86,
    albumScore: 207.62,
    trackSeconds: 260,
    normalizedRating: 100,
    discNumber: 1,
    trackNumber: 2,
    love: "L",
    filePath: "D:\\Music\\Pet Shop Boys\\Actually",
    filename: "02 What Have I Done to Deserve This.mp3",
    coverPath: null,
    coverMimeType: null,
  },
  {
    id: "track:mock-score",
    trackId: 2,
    albumId: "mb:mock-score",
    album: "Journey",
    albumArtistDisplay: "Austin Wintory",
    displayArtist: "Austin Wintory",
    title: "Nascence",
    canonicalGenre: "Video Game",
    publisher: "Sony Computer Entertainment",
    year: 2012,
    releaseYear: 2012,
    totalTracks: 18,
    ratedTracks: 18,
    ratingCompleteness: 1,
    totalSeconds: 3480,
    lovedTracks: 3,
    tmoeSeconds: 960,
    aeRatio: 0.2759,
    effectiveAlbumRating: 91,
    albumScore: 251.16,
    trackSeconds: 108,
    normalizedRating: 100,
    discNumber: 1,
    trackNumber: 1,
    love: "L",
    filePath: "D:\\Music\\Austin Wintory\\Journey",
    filename: "01 Nascence.mp3",
    coverPath: null,
    coverMimeType: null,
  },
];

const mockArtists: ArtistSummary[] = [
  {
    id: "pet shop boys",
    name: "Pet Shop Boys",
    albumCount: 1,
    ratedAlbumCount: 1,
    partialAlbumCount: 0,
    unratedAlbumCount: 0,
    trackCount: 10,
    totalSeconds: 2880,
    lovedTracks: 2,
    tmoeSeconds: 840,
    averageRatingCompleteness: 1,
    averageAlbumRating: 86,
    averageAlbumScore: 207.62,
    firstYear: 1987,
    lastYear: 1987,
    topGenre: "Synthpop",
  },
  {
    id: "the smiths",
    name: "The Smiths",
    albumCount: 1,
    ratedAlbumCount: 1,
    partialAlbumCount: 0,
    unratedAlbumCount: 0,
    trackCount: 10,
    totalSeconds: 2220,
    lovedTracks: 1,
    tmoeSeconds: 600,
    averageRatingCompleteness: 1,
    averageAlbumRating: 88,
    averageAlbumScore: 108.4,
    firstYear: 1986,
    lastYear: 1986,
    topGenre: "Post-Punk",
  },
];

const mockGenres: GenreSummary[] = [
  {
    id: "synthpop",
    name: "Synthpop",
    albumCount: 1,
    ratedAlbumCount: 1,
    partialAlbumCount: 0,
    unratedAlbumCount: 0,
    trackCount: 10,
    totalSeconds: 2880,
    lovedTracks: 2,
    tmoeSeconds: 840,
    averageRatingCompleteness: 1,
    averageAlbumRating: 86,
    averageAlbumScore: 207.62,
    firstYear: 1987,
    lastYear: 1987,
    topArtist: "Pet Shop Boys",
  },
  {
    id: "post-punk",
    name: "Post-Punk",
    albumCount: 1,
    ratedAlbumCount: 1,
    partialAlbumCount: 0,
    unratedAlbumCount: 0,
    trackCount: 10,
    totalSeconds: 2220,
    lovedTracks: 1,
    tmoeSeconds: 600,
    averageRatingCompleteness: 1,
    averageAlbumRating: 88,
    averageAlbumScore: 108.4,
    firstYear: 1986,
    lastYear: 1986,
    topArtist: "The Smiths",
  },
  {
    id: "video game",
    name: "Video Game",
    albumCount: 1,
    ratedAlbumCount: 1,
    partialAlbumCount: 0,
    unratedAlbumCount: 0,
    trackCount: 18,
    totalSeconds: 3480,
    lovedTracks: 3,
    tmoeSeconds: 960,
    averageRatingCompleteness: 1,
    averageAlbumRating: 91,
    averageAlbumScore: 251.16,
    firstYear: 2012,
    lastYear: 2012,
    topArtist: "Austin Wintory",
  },
  {
    id: "heavy metal",
    name: "Heavy Metal",
    albumCount: 1,
    ratedAlbumCount: 0,
    partialAlbumCount: 1,
    unratedAlbumCount: 0,
    trackCount: 9,
    totalSeconds: 2520,
    lovedTracks: 1,
    tmoeSeconds: 480,
    averageRatingCompleteness: 0.4,
    averageAlbumRating: 74,
    averageAlbumScore: 82.1,
    firstYear: 1984,
    lastYear: 1984,
    topArtist: "Dio",
  },
  {
    id: "nu-metal",
    name: "Nu-Metal",
    albumCount: 1,
    ratedAlbumCount: 0,
    partialAlbumCount: 1,
    unratedAlbumCount: 0,
    trackCount: 12,
    totalSeconds: 3180,
    lovedTracks: 0,
    tmoeSeconds: 420,
    averageRatingCompleteness: 0.3,
    averageAlbumRating: 68,
    averageAlbumScore: 61.5,
    firstYear: 1999,
    lastYear: 1999,
    topArtist: "Korn",
  },
  {
    id: "metalcore",
    name: "Metalcore",
    albumCount: 1,
    ratedAlbumCount: 0,
    partialAlbumCount: 0,
    unratedAlbumCount: 1,
    trackCount: 10,
    totalSeconds: 2860,
    lovedTracks: 0,
    tmoeSeconds: 0,
    averageRatingCompleteness: 0,
    averageAlbumRating: null,
    averageAlbumScore: null,
    firstYear: 2004,
    lastYear: 2004,
    topArtist: "Killswitch Engage",
  },
];

const mockMusicTools: MusicToolSummary[] = [
  {
    id: "duplicate-albums",
    label: "Duplicate albums",
    description: "Potential duplicate album versions with the same artist, title, and year.",
    severity: "medium",
    scope: "albums",
    issueCount: 2,
    albumCount: 2,
    trackCount: 0,
  },
  {
    id: "invalid-time-values",
    label: "Invalid time values",
    description: "Tracks where duration could not be parsed into seconds.",
    severity: "high",
    scope: "tracks",
    issueCount: 1,
    albumCount: 1,
    trackCount: 1,
  },
  {
    id: "genre-normalization-issues",
    label: "Genre normalization issues",
    description: "Tracks with multi-value genre strings that were collapsed to one canonical genre.",
    severity: "low",
    scope: "tracks",
    issueCount: 1,
    albumCount: 1,
    trackCount: 1,
  },
];

const mockMusicToolIssues: MusicToolIssueRow[] = [
  {
    id: "duplicate-albums:mb:mock-1",
    toolId: "duplicate-albums",
    severity: "medium",
    entityType: "albums",
    albumId: "mb:mock-1",
    trackId: null,
    album: "Actually",
    albumArtistDisplay: "Pet Shop Boys",
    title: null,
    canonicalGenre: "Synthpop",
    year: 1987,
    detail: "Potential duplicate album version",
    value: "2 albums share artist/title/year",
    filename: null,
    filePath: null,
  },
  {
    id: "duplicate-albums:mb:mock-1-deluxe",
    toolId: "duplicate-albums",
    severity: "medium",
    entityType: "albums",
    albumId: "mb:mock-1-deluxe",
    trackId: null,
    album: "Actually",
    albumArtistDisplay: "Pet Shop Boys",
    title: null,
    canonicalGenre: "Synthpop",
    year: 1987,
    detail: "Potential duplicate album version",
    value: "2 albums share artist/title/year",
    filename: null,
    filePath: null,
  },
  {
    id: "invalid-time-values:1",
    toolId: "invalid-time-values",
    severity: "high",
    entityType: "tracks",
    albumId: "mb:mock-1",
    trackId: 1,
    album: "Actually",
    albumArtistDisplay: "Pet Shop Boys",
    title: "What Have I Done to Deserve This?",
    canonicalGenre: "Synthpop",
    year: 1987,
    detail: "Missing or invalid track time",
    value: null,
    filename: "02 What Have I Done to Deserve This.mp3",
    filePath: "D:\\Music\\Pet Shop Boys\\Actually",
  },
  {
    id: "genre-normalization-issues:1",
    toolId: "genre-normalization-issues",
    severity: "low",
    entityType: "tracks",
    albumId: "mb:mock-1",
    trackId: 1,
    album: "Actually",
    albumArtistDisplay: "Pet Shop Boys",
    title: "What Have I Done to Deserve This?",
    canonicalGenre: "Synthpop",
    year: 1987,
    detail: "Multiple genre values collapsed to canonical genre",
    value: "Synthpop; Dance-Pop",
    filename: "02 What Have I Done to Deserve This.mp3",
    filePath: "D:\\Music\\Pet Shop Boys\\Actually",
  },
];

let mockSavedSearches: SavedSearch[] = [];
let mockSavedCharts: SavedChart[] = [];
let mockSettings: AppSettings = loadCachedSettings();
const coverDataUrlCache = new Map<string, Promise<string | null> | string | null>();

const mockImportRun = {
  id: 1,
  sourcePath: "musicbee-library.tsv",
  sourceSizeBytes: 240_000_000,
  startedAt: "2026-06-25T09:00:00Z",
  completedAt: "2026-06-25T09:03:20Z",
  status: "completed",
  trackRows: 1_130_882,
  albumCount: 76_789,
  durationMs: 200_000,
  backupPath: "Preview runtime backup.sqlite3",
  errorMessage: null,
  addedTracks: 1_130_882,
  changedTracks: 0,
  removedTracks: 0,
  addedAlbums: 76_789,
  changedAlbums: 0,
  removedAlbums: 0,
  ratingEventsCount: 2,
};

const mockStatistics: StatisticsResponse = {
  overview: {
    trackCount: 1_130_882,
    albumCount: 76_789,
    albumArtistCount: 24_812,
    genreCount: 318,
    yearCount: 86,
    totalSeconds: 226_176_400,
    averageAlbumScore: 104.72,
  },
  ratingProgress: {
    fullyRatedAlbums: 18_420,
    partiallyRatedAlbums: 9_380,
    unratedAlbums: 48_989,
    albumsWithEffectiveRating: 27_800,
    ratedTracks: 412_580,
    unratedTracks: 718_302,
    averageRatingCompleteness: 0.37,
    averageAlbumRating: 74.4,
  },
  yearProgress: [
    {
      year: 1987,
      albumCount: 1250,
      ratedAlbumCount: 420,
      partialAlbumCount: 180,
      unratedAlbumCount: 650,
      trackCount: 14_620,
      totalSeconds: 2_915_600,
      lovedTracks: 332,
      averageAlbumScore: 113.42,
    },
    {
      year: 1986,
      albumCount: 1184,
      ratedAlbumCount: 388,
      partialAlbumCount: 162,
      unratedAlbumCount: 634,
      trackCount: 13_940,
      totalSeconds: 2_760_000,
      lovedTracks: 301,
      averageAlbumScore: 109.18,
    },
    {
      year: 1985,
      albumCount: 1168,
      ratedAlbumCount: 364,
      partialAlbumCount: 170,
      unratedAlbumCount: 634,
      trackCount: 13_804,
      totalSeconds: 2_714_000,
      lovedTracks: 286,
      averageAlbumScore: 108.31,
    },
  ],
  genreProgress: [
    {
      genre: "Synthpop",
      albumCount: 1840,
      ratedAlbumCount: 682,
      partialAlbumCount: 230,
      unratedAlbumCount: 928,
      trackCount: 21_440,
      totalSeconds: 4_102_000,
      lovedTracks: 720,
      averageAlbumScore: 128.42,
    },
    {
      genre: "Post-Punk",
      albumCount: 1390,
      ratedAlbumCount: 508,
      partialAlbumCount: 211,
      unratedAlbumCount: 671,
      trackCount: 15_890,
      totalSeconds: 3_006_000,
      lovedTracks: 488,
      averageAlbumScore: 119.08,
    },
    {
      genre: "Hard Rock",
      albumCount: 1320,
      ratedAlbumCount: 412,
      partialAlbumCount: 196,
      unratedAlbumCount: 712,
      trackCount: 14_820,
      totalSeconds: 3_230_000,
      lovedTracks: 350,
      averageAlbumScore: 101.68,
    },
  ],
  trackRatingDistribution: [
    { label: "5", count: 74_620 },
    { label: "4", count: 146_300 },
    { label: "3", count: 112_400 },
    { label: "2", count: 42_180 },
    { label: "1", count: 18_720 },
    { label: "0", count: 18_360 },
  ],
  albumRatingDistribution: [
    { label: "90-99", count: 2600 },
    { label: "80-89", count: 6400 },
    { label: "70-79", count: 8700 },
    { label: "60-69", count: 5200 },
    { label: "50-59", count: 3100 },
    { label: "40-49", count: 1800 },
  ],
  lovedTracks: {
    lovedTracks: 14_280,
    albumsWithLovedTracks: 8_640,
    averageLovedTracksPerAlbum: 1.65,
    topLovedGenre: "Synthpop",
    topLovedYear: 1987,
  },
  importHistory: [mockImportRun],
  ratingHistory: [
    {
      importRunId: 1,
      createdAt: "2026-06-25T09:03:20Z",
      trackCount: 1_130_882,
      albumCount: 76_789,
      ratedTracks: 412_580,
      unratedTracks: 718_302,
      fullyRatedAlbums: 18_420,
      partiallyRatedAlbums: 9_380,
      unratedAlbums: 48_989,
      albumsWithEffectiveRating: 27_800,
      averageAlbumRating: 74.4,
      averageAlbumScore: 104.72,
      ratingEventsCount: 2,
    },
  ],
  recentRatingEvents: [
    {
      id: 1,
      importRunId: 1,
      createdAt: "2026-06-25T09:03:20Z",
      eventType: "addedRated",
      albumId: "mb:mock-1",
      album: "Actually",
      albumArtistDisplay: "Pet Shop Boys",
      year: 1987,
      previousRatedTracks: null,
      currentRatedTracks: 10,
      previousRatingCompleteness: null,
      currentRatingCompleteness: 1,
      previousEffectiveAlbumRating: null,
      currentEffectiveAlbumRating: 86,
    },
    {
      id: 2,
      importRunId: 1,
      createdAt: "2026-06-25T09:03:20Z",
      eventType: "addedRated",
      albumId: "mb:mock-2",
      album: "The Queen Is Dead",
      albumArtistDisplay: "The Smiths",
      year: 1986,
      previousRatedTracks: null,
      currentRatedTracks: 10,
      previousRatingCompleteness: null,
      currentRatingCompleteness: 1,
      previousEffectiveAlbumRating: null,
      currentEffectiveAlbumRating: 88,
    },
  ],
  lastUpdated: "2026-06-25T09:03:20Z",
};

const mockDiscovery: DiscoveryResponse = {
  heatmap: [
    {
      genreId: "synthpop",
      genre: "Synthpop",
      year: 1987,
      albumCount: 125,
      ratedAlbumCount: 82,
      partialAlbumCount: 21,
      unratedAlbumCount: 22,
      trackCount: 1460,
      lovedTracks: 96,
      averageRatingCompleteness: 0.72,
      averageAlbumScore: 128.4,
    },
    {
      genreId: "post-punk",
      genre: "Post-Punk",
      year: 1986,
      albumCount: 88,
      ratedAlbumCount: 44,
      partialAlbumCount: 19,
      unratedAlbumCount: 25,
      trackCount: 1040,
      lovedTracks: 61,
      averageRatingCompleteness: 0.63,
      averageAlbumScore: 116.9,
    },
    {
      genreId: "heavy metal",
      genre: "Heavy Metal",
      year: 1984,
      albumCount: 76,
      ratedAlbumCount: 18,
      partialAlbumCount: 37,
      unratedAlbumCount: 21,
      trackCount: 812,
      lovedTracks: 34,
      averageRatingCompleteness: 0.41,
      averageAlbumScore: 82.1,
    },
    {
      genreId: "nu-metal",
      genre: "Nu-Metal",
      year: 1999,
      albumCount: 42,
      ratedAlbumCount: 9,
      partialAlbumCount: 21,
      unratedAlbumCount: 12,
      trackCount: 530,
      lovedTracks: 8,
      averageRatingCompleteness: 0.34,
      averageAlbumScore: 61.5,
    },
    {
      genreId: "metalcore",
      genre: "Metalcore",
      year: 2004,
      albumCount: 54,
      ratedAlbumCount: 12,
      partialAlbumCount: 16,
      unratedAlbumCount: 26,
      trackCount: 604,
      lovedTracks: 12,
      averageRatingCompleteness: 0.28,
      averageAlbumScore: 74.8,
    },
    {
      genreId: "video game",
      genre: "Video Game",
      year: 2012,
      albumCount: 64,
      ratedAlbumCount: 50,
      partialAlbumCount: 10,
      unratedAlbumCount: 4,
      trackCount: 1480,
      lovedTracks: 104,
      averageRatingCompleteness: 0.84,
      averageAlbumScore: 151.2,
    },
  ],
  backlogMissions: [
    {
      id: "finish-high-score-partials",
      title: "Finish high-score partials",
      description: "Partially rated albums with the strongest Album Score signals.",
      actionLabel: "Open top partials",
      albumCount: 2,
      trackCount: 21,
      lovedTracks: 1,
      averageAlbumScore: 71.8,
      averageRatingCompleteness: 0.39,
      genreId: null,
      genre: null,
      artistId: null,
      artist: null,
      yearFrom: null,
      yearTo: null,
      ratedTracksMin: 1,
      ratingCompletenessMin: null,
      ratingCompletenessMax: 99,
      lovedTracksMin: null,
      sortField: "albumScore",
      sortDirection: "desc",
      limit: 20,
    },
    {
      id: "neglected-decade",
      title: "Rate a neglected decade",
      description: "The decade with the largest unfinished album pile. 1980s albums are still open.",
      actionLabel: "Open decade backlog",
      albumCount: 1,
      trackCount: 9,
      lovedTracks: 1,
      averageAlbumScore: 82.1,
      averageRatingCompleteness: 0.44,
      genreId: null,
      genre: null,
      artistId: null,
      artist: null,
      yearFrom: 1980,
      yearTo: 1989,
      ratedTracksMin: null,
      ratingCompletenessMin: null,
      ratingCompletenessMax: 99,
      lovedTracksMin: null,
      sortField: "albumScore",
      sortDirection: "desc",
      limit: 50,
    },
    {
      id: "high-potential-genre",
      title: "High-potential Heavy Metal",
      description: "A genre backlog with unusually strong scored-album signals.",
      actionLabel: "Open genre backlog",
      albumCount: 1,
      trackCount: 9,
      lovedTracks: 1,
      averageAlbumScore: 82.1,
      averageRatingCompleteness: 0.44,
      genreId: "heavy metal",
      genre: "Heavy Metal",
      artistId: null,
      artist: null,
      yearFrom: null,
      yearTo: null,
      ratedTracksMin: null,
      ratingCompletenessMin: null,
      ratingCompletenessMax: 99,
      lovedTracksMin: null,
      sortField: "albumScore",
      sortDirection: "desc",
      limit: 40,
    },
  ],
  smartMissions: [
    {
      id: "smart-high-score-partial-decade",
      title: "20 high-score partial albums from the 1980s",
      description: "Best partial-album cluster.",
      actionLabel: "Open partial decade",
      albumCount: 1,
      trackCount: 9,
      lovedTracks: 1,
      averageAlbumScore: 82.1,
      averageRatingCompleteness: 0.44,
      genreId: null,
      genre: null,
      artistId: null,
      artist: null,
      yearFrom: 1980,
      yearTo: 1989,
      ratedTracksMin: 1,
      ratingCompletenessMin: null,
      ratingCompletenessMax: 99,
      lovedTracksMin: null,
      sortField: "albumScore",
      sortDirection: "desc",
      limit: 20,
    },
    {
      id: "smart-loved-incomplete-genre",
      title: "Loved but incomplete Heavy Metal albums",
      description: "A loved-track rich genre that still has unfinished albums.",
      actionLabel: "Open loved genre",
      albumCount: 1,
      trackCount: 9,
      lovedTracks: 1,
      averageAlbumScore: 82.1,
      averageRatingCompleteness: 0.44,
      genreId: "heavy metal",
      genre: "Heavy Metal",
      artistId: null,
      artist: null,
      yearFrom: null,
      yearTo: null,
      ratedTracksMin: null,
      ratingCompletenessMin: null,
      ratingCompletenessMax: 99,
      lovedTracksMin: 1,
      sortField: "lovedTracks",
      sortDirection: "desc",
      limit: 20,
    },
    {
      id: "smart-unrated-high-potential-genre",
      title: "Unrated Metalcore waiting room",
      description: "A fully unrated genre pocket whose rated neighbors score well.",
      actionLabel: "Open unrated genre",
      albumCount: 1,
      trackCount: 10,
      lovedTracks: 0,
      averageAlbumScore: 74.8,
      averageRatingCompleteness: 0.28,
      genreId: "metalcore",
      genre: "Metalcore",
      artistId: null,
      artist: null,
      yearFrom: null,
      yearTo: null,
      ratedTracksMin: null,
      ratingCompletenessMin: null,
      ratingCompletenessMax: 0,
      lovedTracksMin: null,
      sortField: "year",
      sortDirection: "desc",
      limit: 30,
    },
  ],
  loveRatingPoints: [
    {
      albumId: "mb:mock-score",
      album: "Journey",
      albumArtistDisplay: "Austin Wintory",
      genreId: "video game",
      genre: "Video Game",
      year: 2012,
      lovedTracks: 3,
      albumScore: 251.16,
      effectiveAlbumRating: 91,
      ratingCompleteness: 1,
      totalSeconds: 3480,
    },
    {
      albumId: "mb:mock-1",
      album: "Actually",
      albumArtistDisplay: "Pet Shop Boys",
      genreId: "synthpop",
      genre: "Synthpop",
      year: 1987,
      lovedTracks: 2,
      albumScore: 207.62,
      effectiveAlbumRating: 86,
      ratingCompleteness: 1,
      totalSeconds: 2880,
    },
    {
      albumId: "mb:mock-metal",
      album: "Holy Diver",
      albumArtistDisplay: "Dio",
      genreId: "heavy metal",
      genre: "Heavy Metal",
      year: 1984,
      lovedTracks: 1,
      albumScore: 82.1,
      effectiveAlbumRating: 74,
      ratingCompleteness: 0.44,
      totalSeconds: 2520,
    },
  ],
  genrePoints: [
    {
      genreId: "synthpop",
      genre: "Synthpop",
      albumCount: 1840,
      trackCount: 21_440,
      lovedTracks: 720,
      totalSeconds: 4_102_000,
      partialAlbumCount: 230,
      unratedAlbumCount: 928,
      averageRatingCompleteness: 0.49,
      averageAlbumScore: 128.42,
    },
    {
      genreId: "post-punk",
      genre: "Post-Punk",
      albumCount: 1390,
      trackCount: 15_890,
      lovedTracks: 488,
      totalSeconds: 3_006_000,
      partialAlbumCount: 211,
      unratedAlbumCount: 671,
      averageRatingCompleteness: 0.52,
      averageAlbumScore: 119.08,
    },
    {
      genreId: "heavy metal",
      genre: "Heavy Metal",
      albumCount: 1320,
      trackCount: 14_820,
      lovedTracks: 350,
      totalSeconds: 3_230_000,
      partialAlbumCount: 196,
      unratedAlbumCount: 712,
      averageRatingCompleteness: 0.37,
      averageAlbumScore: 101.68,
    },
    {
      genreId: "video game",
      genre: "Video Game",
      albumCount: 820,
      trackCount: 18_200,
      lovedTracks: 640,
      totalSeconds: 4_560_000,
      partialAlbumCount: 112,
      unratedAlbumCount: 204,
      averageRatingCompleteness: 0.71,
      averageAlbumScore: 151.2,
    },
  ],
  artistPoints: [
    {
      artistId: "pet shop boys",
      artist: "Pet Shop Boys",
      albumCount: 24,
      trackCount: 260,
      lovedTracks: 46,
      totalSeconds: 72_000,
      partialAlbumCount: 3,
      unratedAlbumCount: 6,
      averageRatingCompleteness: 0.74,
      averageAlbumScore: 135.2,
      topGenre: "Synthpop",
    },
    {
      artistId: "the smiths",
      artist: "The Smiths",
      albumCount: 12,
      trackCount: 118,
      lovedTracks: 26,
      totalSeconds: 34_000,
      partialAlbumCount: 2,
      unratedAlbumCount: 4,
      averageRatingCompleteness: 0.66,
      averageAlbumScore: 118.6,
      topGenre: "Post-Punk",
    },
    {
      artistId: "dio",
      artist: "Dio",
      albumCount: 9,
      trackCount: 92,
      lovedTracks: 12,
      totalSeconds: 28_400,
      partialAlbumCount: 4,
      unratedAlbumCount: 2,
      averageRatingCompleteness: 0.44,
      averageAlbumScore: 82.1,
      topGenre: "Heavy Metal",
    },
  ],
  generatedAt: "2026-06-25T09:03:20Z",
};

export function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function getLibraryStatus() {
  if (!isTauriRuntime()) {
    return mockStatus;
  }

  return invoke<LibraryStatus>("get_library_status");
}

export async function listImportRuns(limit: number) {
  if (!isTauriRuntime()) {
    return [mockImportRun].slice(0, limit) satisfies ImportRun[];
  }

  return invoke<ImportRun[]>("list_import_runs", { limit });
}

export async function getStatistics() {
  if (!isTauriRuntime()) {
    return mockStatistics;
  }

  return invoke<StatisticsResponse>("get_statistics");
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

  const settings = await invoke<AppSettings>("get_settings");
  cacheSettings(settings);
  return settings;
}

export async function saveSettings(settings: AppSettings) {
  if (!isTauriRuntime()) {
    mockSettings = {
      ...normalizeSettings(settings),
      updatedAt: new Date().toISOString(),
    };
    cacheSettings(mockSettings);
    return mockSettings;
  }

  const saved = await invoke<AppSettings>("save_settings", { settings });
  cacheSettings(saved);
  return saved;
}

export async function importMusicBeeTsv(sourcePath: string) {
  if (!isTauriRuntime()) {
    throw new Error("Start import from the Tauri desktop app to access local files and SQLite.");
  }

  return invoke<ImportSummary>("import_musicbee_tsv", { sourcePath });
}

export async function importAlbumCovers(request: CoverImportRequest) {
  if (!isTauriRuntime()) {
    throw new Error("Start cover import from the Tauri desktop app to access local files and SQLite.");
  }

  return invoke<CoverImportSummary>("import_album_covers", { request });
}

export async function getAlbumCoverDataUrl(albumId: string) {
  if (!isTauriRuntime()) {
    return null;
  }

  if (coverDataUrlCache.has(albumId)) {
    return coverDataUrlCache.get(albumId) ?? null;
  }

  const request = invoke<string | null>("get_album_cover_data_url", { albumId }).catch(() => null);
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
    const artistKeys = new Set(request.filters.artistKeys);
    const genreKeys = new Set(expandGenreFilterKeys(request.filters.genres));
    const excludedGenreKeys = new Set(expandGenreFilterKeys(request.filters.excludedGenres));
    const ratedTracksMin = request.filters.ratedTracksMin;
    const ratedTracksMax = request.filters.ratedTracksMax;
    const yearFrom = request.filters.yearFrom;
    const yearTo = request.filters.yearTo;
    const lovedTracksMin = request.filters.lovedTracksMin;
    const lovedTracksMax = request.filters.lovedTracksMax;
    const ratingCompletenessMin = normalizePercentFilter(request.filters.ratingCompletenessMin);
    const ratingCompletenessMax = normalizePercentFilter(request.filters.ratingCompletenessMax);
    const rows = mockRows.filter((row) => {
      const matchesView = isTracks ? row.trackId !== null : row.trackId === null;
      const artistKey = normalizeArtistKey(row.albumArtistDisplay);
      const genreKey = normalizeGenreKey(row.canonicalGenre);
      const ratedTracks = row.ratedTracks ?? 0;
      const ratingCompleteness = row.ratingCompleteness ?? 0;
      const lovedTracks = row.lovedTracks ?? 0;
      const year = row.year ?? 0;
      return (
        matchesView &&
        (albumIds.size === 0 || albumIds.has(row.albumId)) &&
        (artistKeys.size === 0 || artistKeys.has(artistKey)) &&
        (genreKeys.size === 0 || genreKeys.has(genreKey)) &&
        !excludedGenreKeys.has(genreKey) &&
        (yearFrom == null || year >= yearFrom) &&
        (yearTo == null || year <= yearTo) &&
        (ratedTracksMin == null || ratedTracks >= ratedTracksMin) &&
        (ratedTracksMax == null || ratedTracks <= ratedTracksMax) &&
        (lovedTracksMin == null || lovedTracks >= lovedTracksMin) &&
        (lovedTracksMax == null || lovedTracks <= lovedTracksMax) &&
        (ratingCompletenessMin == null || ratingCompleteness >= ratingCompletenessMin) &&
        (ratingCompletenessMax == null || ratingCompleteness <= ratingCompletenessMax) &&
        matchesMissingFields(row, isTracks, request.filters.missingFields)
      );
    });
    const sorted = [...rows].sort((left, right) => compareBrowseRows(left, right, request.sort.field));
    if (request.sort.direction === "desc") {
      sorted.reverse();
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
    const filtered = mockArtists.filter((artist) => artist.name.toLowerCase().includes(searchText));
    const sorted = [...filtered].sort((left, right) => compareArtists(left, right, request.sort.field));
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
    const filtered = mockGenres.filter((genre) => genre.name.toLowerCase().includes(searchText));
    const sorted = [...filtered].sort((left, right) => compareGenres(left, right, request.sort.field));
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
    const tool = mockMusicTools.find((item) => item.id === request.toolId) ?? mockMusicTools[0];
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
    const sorted = [...filtered].sort((left, right) => compareMusicToolIssues(left, right, request.sort.field));
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

export async function listSavedSearches() {
  if (!isTauriRuntime()) {
    return mockSavedSearches;
  }

  return invoke<SavedSearch[]>("list_saved_searches");
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
    mockSavedSearches = [saved, ...mockSavedSearches];
    return saved;
  }

  return invoke<SavedSearch>("save_search", { input: { name, request } });
}

export async function deleteSavedSearch(id: number) {
  if (!isTauriRuntime()) {
    mockSavedSearches = mockSavedSearches.filter((search) => search.id !== id);
    return;
  }

  return invoke<void>("delete_saved_search", { id });
}

export async function listSavedCharts() {
  if (!isTauriRuntime()) {
    return mockSavedCharts;
  }

  return invoke<SavedChart[]>("list_saved_charts");
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
    mockSavedCharts = [saved, ...mockSavedCharts];
    return saved;
  }

  return invoke<SavedChart>("save_chart", { input: { name, config } });
}

export async function deleteSavedChart(id: number) {
  if (!isTauriRuntime()) {
    mockSavedCharts = mockSavedCharts.filter((chart) => chart.id !== id);
    return;
  }

  return invoke<void>("delete_saved_chart", { id });
}

export async function exportSearch(request: BrowseRequest, format: string, includeCalculated: boolean) {
  if (!isTauriRuntime()) {
    return {
      path: `Preview runtime export.${format}`,
      format,
      rowCount: mockRows.filter((row) => (request.view === "tracks" ? row.trackId !== null : row.trackId === null)).length,
    } satisfies ExportResult;
  }

  return invoke<ExportResult>("export_search", { input: { request, format, includeCalculated } });
}

export async function exportMusicToolIssues(toolId: string, searchText: string, format: string) {
  if (!isTauriRuntime()) {
    const normalizedSearch = searchText.trim().toLowerCase();
    const rowCount = mockMusicToolIssues.filter((issue) => {
      if (issue.toolId !== toolId) {
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
    return {
      path: `Preview runtime tools export.${format}`,
      format,
      rowCount,
    } satisfies ExportResult;
  }

  return invoke<ExportResult>("export_music_tool_issues", { input: { toolId, searchText, format } });
}

export async function listenToImportProgress(handler: (progress: ImportProgress) => void) {
  if (!isTauriRuntime()) {
    return (() => undefined) satisfies UnlistenFn;
  }

  return listen<ImportProgress>("import-progress", (event) => {
    handler(event.payload);
  });
}

export async function listenToCoverImportProgress(handler: (progress: CoverImportProgress) => void) {
  if (!isTauriRuntime()) {
    return (() => undefined) satisfies UnlistenFn;
  }

  return listen<CoverImportProgress>("cover-import-progress", (event) => {
    handler(event.payload);
  });
}

export async function listenToMusicToolProgress(handler: (progress: MusicToolProgress) => void) {
  if (!isTauriRuntime()) {
    return (() => undefined) satisfies UnlistenFn;
  }

  return listen<MusicToolProgress>("music-tool-progress", (event) => {
    handler(event.payload);
  });
}


export function loadCachedSettings() {
  if (typeof window === "undefined") {
    return defaultSettings();
  }

  try {
    const stored = window.localStorage.getItem(settingsStorageKey);
    if (!stored) {
      return defaultSettings();
    }
    return normalizeSettings(JSON.parse(stored));
  } catch {
    return defaultSettings();
  }
}

export function cacheSettings(settings: AppSettings) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
  } catch {
    // Preview settings are best-effort when browser storage is unavailable.
  }
}

function normalizeSettings(settings: Partial<AppSettings>): AppSettings {
  const backupRetention = Math.round(Number(settings.backupRetention ?? 3));
  return {
    backupRetention: Math.min(50, Math.max(1, Number.isFinite(backupRetention) ? backupRetention : 3)),
    darkMode: Boolean(settings.darkMode),
    leftSidebarDefault: normalizeLeftSidebarMode(settings.leftSidebarDefault),
    rightSidebarDefault: normalizeRightSidebarMode(settings.rightSidebarDefault),
    updatedAt: settings.updatedAt ?? null,
  };
}

function defaultSettings(): AppSettings {
  return {
    backupRetention: 3,
    darkMode: false,
    leftSidebarDefault: "expanded",
    rightSidebarDefault: "expanded",
    updatedAt: null,
  };
}

function normalizeLeftSidebarMode(value: unknown): LeftSidebarMode {
  return value === "iconOnly" || value === "hidden" || value === "expanded" ? value : "expanded";
}

function normalizeRightSidebarMode(value: unknown): RightSidebarMode {
  return value === "hidden" || value === "expanded" ? value : "expanded";
}

function normalizeArtistKey(value: string | null) {
  const normalized = (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return normalized || "unknown";
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
  return value > 1 ? Math.min(1, Math.max(0, value / 100)) : Math.min(1, Math.max(0, value));
}

function matchesMissingFields(row: BrowseRow, isTracks: boolean, fields: string[]) {
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
      case "rating":
        return isTracks ? row.normalizedRating == null : row.effectiveAlbumRating == null;
      case "time":
        return isTracks ? row.trackSeconds == null : (row.totalSeconds ?? 0) <= 0;
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

function compareArtists(left: ArtistSummary, right: ArtistSummary, field: string) {
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

function compareMusicToolIssues(left: MusicToolIssueRow, right: MusicToolIssueRow, field: string) {
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
