import type {
  AppSettings,
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
  CoverImportProgress,
  CoverImportRequest,
  CoverImportSummary,
  DatabaseBackup,
  DatabaseRestoreSummary,
  DiscoveryResponse,
  ExportResult,
  ImportProgress,
  ImportRun,
  ImportSummary,
  LibraryStatus,
  SavedChart,
  SavedSearch,
  ChartConfig,
  StatisticsResponse,
  GenreListRequest,
  GenreListResponse,
  GenreSummary,
  MusicToolFixRequest,
  MusicToolFixSummary,
  MusicToolIssueRequest,
  MusicToolIssueResponse,
  MusicToolIssueRow,
  MusicToolProgress,
  MusicToolSummary,
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
  PerformanceProbeResponse,
} from "../types";
import timelineCover1 from "../assets/album-timeline/timeline-cover-1.webp";
import timelineCover2 from "../assets/album-timeline/timeline-cover-2.webp";
import timelineCover3 from "../assets/album-timeline/timeline-cover-3.webp";
import timelineCover4 from "../assets/album-timeline/timeline-cover-4.webp";
import timelineCover5 from "../assets/album-timeline/timeline-cover-5.webp";
import timelineCover6 from "../assets/album-timeline/timeline-cover-6.webp";
import {
  defaultMusicBrainzCachePath,
  loadCachedSettings,
  normalizeArtistKey,
} from "./normalization";
import { mockDiscovery, mockTimelineCoverUrls } from "./preview/discovery";
import { mockDatabaseBackups, mockImportRuns, mockStatistics } from "./preview/statistics";
import { emitMockMusicBrainzArtistInfoProgress, emitMockMusicBrainzOriginProgress, emitMockMusicToolProgress, mockArtistInfoProgress, mockArtistInfoProgressHandlers, mockMusicBrainzArtistInfoPreviewRows, mockMusicBrainzArtistInfoRun, mockMusicBrainzArtistInfoStatus, mockMusicBrainzCacheStatus, mockMusicBrainzDiscographies, mockMusicBrainzOriginCountryStatus, mockMusicBrainzOriginPreviewRows, mockMusicBrainzOriginRun, mockMusicToolProgressHandlers, mockOriginProgress, mockOriginProgressHandlers } from "./preview/musicBrainz";

const mockStatus: LibraryStatus = {
  dbPath: "Tauri desktop runtime required for SQLite access",
  hasDatabase: true,
  trackCount: 1130882,
  albumCount: 76789,
  coverCount: 0,
  importRunCount: 0,
  lastImport: null,
};

type OriginCountryFields = Pick<
  BrowseRow,
  | "originCountryCode"
  | "originCountryName"
  | "originCountryRawArea"
  | "originCountryReviewState"
>;
type MusicBrainzArtistInfoFields = Pick<
  ArtistSummary,
  | "musicBrainzMbid"
  | "musicBrainzSortName"
  | "musicBrainzArtistType"
  | "musicBrainzGender"
  | "musicBrainzBeginDate"
  | "musicBrainzBeginYear"
  | "musicBrainzEndDate"
  | "musicBrainzEndYear"
  | "musicBrainzEnded"
  | "musicBrainzBeginAreaName"
  | "musicBrainzEndAreaName"
  | "musicBrainzInfoReviewState"
  | "musicBrainzInfoFetchedAt"
>;
type BrowseRowWithoutOrigin = Omit<
  BrowseRow,
  | keyof OriginCountryFields
  | "fileFormat"
  | "bitrateKbps"
  | "qualityFileSizeBytes"
  | "doctorDurationMs"
  | "qualityTrackCount"
  | "minBitrateKbps"
  | "avgBitrateKbps"
  | "maxBitrateKbps"
  | "below320Tracks"
  | "mixedAudioQuality"
  | "billboardDebutYear"
  | "billboardDebutMonth"
  | "billboardDebutWeek"
  | "billboardDebutWeekKey"
  | "billboardSingleDebutDate"
  | "billboardSingleDebutYear"
  | "billboardSingleDebutMonth"
  | "billboardSingleDebutWeek"
  | "billboardSingleDebutWeekKey"
  | "vgListaRank"
  | "vgListaYear"
  | "vgListaDebutYear"
  | "vgListaDebutMonth"
  | "vgListaDebutWeek"
  | "vgListaDebutWeekKey"
  | "officialUkRank"
  | "officialUkYear"
  | "officialUkDebutYear"
  | "officialUkDebutMonth"
  | "officialUkDebutWeek"
  | "officialUkDebutWeekKey"
  | "tiISkuddetRank"
  | "tiISkuddetYear"
  | "tiISkuddetDebutDate"
  | "tiISkuddetDebutYear"
  | "tiISkuddetDebutMonth"
  | "tiISkuddetDebutWeek"
  | "tiISkuddetDebutWeekKey"
  | "norsktoppenRank"
  | "norsktoppenYear"
  | "norsktoppenDebutDate"
  | "norsktoppenDebutYear"
  | "norsktoppenDebutMonth"
  | "norsktoppenDebutWeek"
  | "norsktoppenDebutWeekKey"
>;
type ArtistSummaryWithoutMusicBrainz = Omit<
  ArtistSummary,
  | keyof OriginCountryFields
  | keyof MusicBrainzArtistInfoFields
  | "portraitAvailable"
  | "representativeAlbumId"
  | "representativeAlbum"
  | "representativeCoverPath"
>;

function mockOriginForArtist(
  artist: string | null | undefined,
): OriginCountryFields {
  switch (normalizeArtistKey(artist ?? null)) {
    case "pet shop boys":
      return {
        originCountryCode: "GB",
        originCountryName: "United Kingdom",
        originCountryRawArea: "England",
        originCountryReviewState: "imported",
      };
    case "the smiths":
      return {
        originCountryCode: "GB",
        originCountryName: "United Kingdom",
        originCountryRawArea: "England",
        originCountryReviewState: "reviewed",
      };
    case "austin wintory":
    case "dio":
      return {
        originCountryCode: "US",
        originCountryName: "United States",
        originCountryRawArea: "United States",
        originCountryReviewState: "imported",
      };
    default:
      return {
        originCountryCode: null,
        originCountryName: null,
        originCountryRawArea: null,
        originCountryReviewState: null,
      };
  }
}

function mockArtistInfoForArtist(
  artist: string | null | undefined,
): MusicBrainzArtistInfoFields {
  switch (normalizeArtistKey(artist ?? null)) {
    case "pet shop boys":
      return {
        musicBrainzMbid: "012151a8-preview-psb",
        musicBrainzSortName: "Pet Shop Boys",
        musicBrainzArtistType: "Group",
        musicBrainzGender: null,
        musicBrainzBeginDate: "1981",
        musicBrainzBeginYear: 1981,
        musicBrainzEndDate: null,
        musicBrainzEndYear: null,
        musicBrainzEnded: false,
        musicBrainzBeginAreaName: "London, England",
        musicBrainzEndAreaName: null,
        musicBrainzInfoReviewState: "imported",
        musicBrainzInfoFetchedAt: "2026-07-08T10:12:05.000Z",
      };
    case "the smiths":
      return {
        musicBrainzMbid: "preview-smiths",
        musicBrainzSortName: "Smiths, The",
        musicBrainzArtistType: "Group",
        musicBrainzGender: null,
        musicBrainzBeginDate: "1982",
        musicBrainzBeginYear: 1982,
        musicBrainzEndDate: "1987",
        musicBrainzEndYear: 1987,
        musicBrainzEnded: true,
        musicBrainzBeginAreaName: "Manchester, England",
        musicBrainzEndAreaName: null,
        musicBrainzInfoReviewState: "imported",
        musicBrainzInfoFetchedAt: "2026-07-08T10:12:05.000Z",
      };
    case "austin wintory":
      return {
        musicBrainzMbid: "preview-austin-wintory",
        musicBrainzSortName: "Wintory, Austin",
        musicBrainzArtistType: "Person",
        musicBrainzGender: "Male",
        musicBrainzBeginDate: "1984-09-09",
        musicBrainzBeginYear: 1984,
        musicBrainzEndDate: null,
        musicBrainzEndYear: null,
        musicBrainzEnded: false,
        musicBrainzBeginAreaName: "Denver, Colorado",
        musicBrainzEndAreaName: null,
        musicBrainzInfoReviewState: "imported",
        musicBrainzInfoFetchedAt: "2026-07-08T10:12:05.000Z",
      };
    case "dio":
      return {
        musicBrainzMbid: "preview-dio",
        musicBrainzSortName: "Dio",
        musicBrainzArtistType: "Group",
        musicBrainzGender: null,
        musicBrainzBeginDate: "1982",
        musicBrainzBeginYear: 1982,
        musicBrainzEndDate: "2010",
        musicBrainzEndYear: 2010,
        musicBrainzEnded: true,
        musicBrainzBeginAreaName: "Cortland, New York",
        musicBrainzEndAreaName: null,
        musicBrainzInfoReviewState: "imported",
        musicBrainzInfoFetchedAt: "2026-07-08T10:12:05.000Z",
      };
    case "korn":
      return {
        musicBrainzMbid: "preview-korn",
        musicBrainzSortName: "Korn",
        musicBrainzArtistType: "Group",
        musicBrainzGender: null,
        musicBrainzBeginDate: "1993",
        musicBrainzBeginYear: 1993,
        musicBrainzEndDate: null,
        musicBrainzEndYear: null,
        musicBrainzEnded: false,
        musicBrainzBeginAreaName: "Bakersfield, California",
        musicBrainzEndAreaName: null,
        musicBrainzInfoReviewState: "imported",
        musicBrainzInfoFetchedAt: "2026-07-08T10:12:05.000Z",
      };
    default:
      return {
        musicBrainzMbid: null,
        musicBrainzSortName: null,
        musicBrainzArtistType: null,
        musicBrainzGender: null,
        musicBrainzBeginDate: null,
        musicBrainzBeginYear: null,
        musicBrainzEndDate: null,
        musicBrainzEndYear: null,
        musicBrainzEnded: null,
        musicBrainzBeginAreaName: null,
        musicBrainzEndAreaName: null,
        musicBrainzInfoReviewState: null,
        musicBrainzInfoFetchedAt: null,
      };
  }
}

function isoWeekForMockDate(date: Date) {
  const thursday = new Date(date.getTime());
  const day = thursday.getUTCDay() || 7;
  thursday.setUTCDate(thursday.getUTCDate() + 4 - day);
  const isoYear = thursday.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(
    ((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return { isoYear, week };
}

function withMockOrigin(row: BrowseRowWithoutOrigin): BrowseRow {
  const debutWeek =
    row.billboardYear == null ? null : ((row.billboardYear * 7) % 52) + 1;
  const singleDebutDay = ((row.trackId ?? 1) * 7) % 24 + 1;
  const singleDebutDateValue =
    row.billboardSingleYear == null
      ? null
      : new Date(Date.UTC(row.billboardSingleYear, 6, singleDebutDay));
  const singleDebutWeek =
    singleDebutDateValue == null
      ? null
      : isoWeekForMockDate(singleDebutDateValue);
  const singleDebutDate =
    row.billboardSingleYear == null || singleDebutDateValue == null
      ? null
      : `${row.billboardSingleYear}-07-${String(singleDebutDay).padStart(2, "0")}`;
  return {
    ...row,
    billboardDebutYear: row.billboardYear,
    billboardDebutMonth: debutWeek == null ? null : Math.ceil(debutWeek / 4.4),
    billboardDebutWeek: debutWeek,
    billboardDebutWeekKey:
      row.billboardYear == null || debutWeek == null
        ? null
        : `${row.billboardYear}-W${String(debutWeek).padStart(2, "0")}`,
    billboardSingleDebutDate: singleDebutDate,
    billboardSingleDebutYear: row.billboardSingleYear,
    billboardSingleDebutMonth: singleDebutDate == null ? null : 7,
    billboardSingleDebutWeek: singleDebutWeek?.week ?? null,
    billboardSingleDebutWeekKey:
      row.billboardSingleYear == null || singleDebutWeek == null
        ? null
        : `${singleDebutWeek.isoYear}-W${String(singleDebutWeek.week).padStart(2, "0")}`,
    vgListaRank:
      row.trackId == null ? row.billboardRank : row.billboardSingleRank,
    vgListaYear:
      row.trackId == null ? row.billboardYear : row.billboardSingleYear,
    vgListaDebutYear:
      row.trackId == null ? row.billboardYear : row.billboardSingleYear,
    vgListaDebutMonth:
      row.trackId == null
        ? debutWeek == null
          ? null
          : Math.ceil(debutWeek / 4.4)
        : row.billboardSingleYear == null
          ? null
          : 7,
    vgListaDebutWeek:
      row.trackId == null ? debutWeek : (singleDebutWeek?.week ?? null),
    vgListaDebutWeekKey:
      row.trackId == null
        ? row.billboardYear == null || debutWeek == null
          ? null
          : `${row.billboardYear}-W${String(debutWeek).padStart(2, "0")}`
        : row.billboardSingleYear == null || singleDebutWeek == null
          ? null
          : `${singleDebutWeek.isoYear}-W${String(singleDebutWeek.week).padStart(2, "0")}`,
    officialUkRank:
      row.trackId == null ? row.billboardRank : row.billboardSingleRank,
    officialUkYear:
      row.trackId == null ? row.billboardYear : row.billboardSingleYear,
    officialUkDebutYear:
      row.trackId == null ? row.billboardYear : row.billboardSingleYear,
    officialUkDebutMonth:
      row.trackId == null
        ? debutWeek == null
          ? null
          : Math.ceil(debutWeek / 4.4)
        : row.billboardSingleYear == null
          ? null
          : 7,
    officialUkDebutWeek:
      row.trackId == null ? debutWeek : (singleDebutWeek?.week ?? null),
    officialUkDebutWeekKey:
      row.trackId == null
        ? row.billboardYear == null || debutWeek == null
          ? null
          : `${row.billboardYear}-W${String(debutWeek).padStart(2, "0")}`
        : row.billboardSingleYear == null || singleDebutWeek == null
          ? null
          : `${singleDebutWeek.isoYear}-W${String(singleDebutWeek.week).padStart(2, "0")}`,
    tiISkuddetRank:
      row.trackId == null ? null : row.billboardSingleRank,
    tiISkuddetYear:
      row.trackId == null ? null : row.billboardSingleYear,
    tiISkuddetDebutDate: row.trackId == null ? null : singleDebutDate,
    tiISkuddetDebutYear:
      row.trackId == null ? null : row.billboardSingleYear,
    tiISkuddetDebutMonth:
      row.trackId == null || singleDebutDate == null ? null : 7,
    tiISkuddetDebutWeek:
      row.trackId == null ? null : (singleDebutWeek?.week ?? null),
    tiISkuddetDebutWeekKey:
      row.trackId == null || row.billboardSingleYear == null || singleDebutWeek == null
        ? null
        : `${singleDebutWeek.isoYear}-W${String(singleDebutWeek.week).padStart(2, "0")}`,
    norsktoppenRank:
      row.trackId == null ? null : row.billboardSingleRank,
    norsktoppenYear:
      row.trackId == null ? null : row.billboardSingleYear,
    norsktoppenDebutDate: row.trackId == null ? null : singleDebutDate,
    norsktoppenDebutYear:
      row.trackId == null ? null : row.billboardSingleYear,
    norsktoppenDebutMonth:
      row.trackId == null || singleDebutDate == null ? null : 7,
    norsktoppenDebutWeek:
      row.trackId == null ? null : (singleDebutWeek?.week ?? null),
    norsktoppenDebutWeekKey:
      row.trackId == null || row.billboardSingleYear == null || singleDebutWeek == null
        ? null
        : `${singleDebutWeek.isoYear}-W${String(singleDebutWeek.week).padStart(2, "0")}`,
    fileFormat: "MP3",
    bitrateKbps: row.trackId == null ? null : row.trackId % 2 === 0 ? 256 : 320,
    qualityFileSizeBytes: row.trackId == null ? 98_000_000 : 9_800_000,
    doctorDurationMs: row.trackSeconds == null ? null : row.trackSeconds * 1000,
    qualityTrackCount: row.trackId == null ? row.totalTracks : row.totalTracks,
    minBitrateKbps: row.trackId == null ? 256 : 256,
    avgBitrateKbps: row.trackId == null ? 304 : 304,
    maxBitrateKbps: row.trackId == null ? 320 : 320,
    below320Tracks: row.trackId == null ? 2 : 2,
    mixedAudioQuality: true,
    ...mockOriginForArtist(row.albumArtistDisplay),
  };
}

const mockRows: BrowseRow[] = (
  [
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
      billboardRank: 103,
      billboardYear: 1987,
      billboardSingleRank: null,
      billboardSingleYear: null,
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
      billboardRank: 282,
      billboardYear: 1986,
      billboardSingleRank: null,
      billboardSingleYear: null,
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
      billboardRank: null,
      billboardYear: null,
      billboardSingleRank: null,
      billboardSingleYear: null,
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
      billboardRank: 428,
      billboardYear: 1984,
      billboardSingleRank: null,
      billboardSingleYear: null,
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
      billboardRank: 20,
      billboardYear: 1999,
      billboardSingleRank: null,
      billboardSingleYear: null,
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
      billboardRank: null,
      billboardYear: null,
      billboardSingleRank: null,
      billboardSingleYear: null,
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
      billboardRank: 103,
      billboardYear: 1987,
      billboardSingleRank: 10,
      billboardSingleYear: 1987,
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
      billboardRank: null,
      billboardYear: null,
      billboardSingleRank: null,
      billboardSingleYear: null,
      trackSeconds: 108,
      normalizedRating: 100,
      discNumber: 1,
      trackNumber: 1,
      love: null,
      filePath: "D:\\Music\\Austin Wintory\\Journey",
      filename: "01 Nascence.mp3",
      coverPath: null,
      coverMimeType: null,
    },
  ] satisfies BrowseRowWithoutOrigin[]
).map(withMockOrigin);

const mockArtists: ArtistSummary[] = (
  [
    {
      id: "head east",
      name: "Head East",
      albumCount: 1,
      ratedAlbumCount: 1,
      partialAlbumCount: 0,
      unratedAlbumCount: 0,
      trackCount: 9,
      totalSeconds: 2268,
      lovedTracks: 1,
      tmoeSeconds: 540,
      averageRatingCompleteness: 1,
      averageAlbumRating: 82,
      averageAlbumScore: 103.8,
      firstYear: 1977,
      lastYear: 1977,
      topGenre: "AOR",
    },
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
  ] satisfies ArtistSummaryWithoutMusicBrainz[]
).map((artist) => ({
  portraitAvailable: false,
  representativeAlbumId: null,
  representativeAlbum: null,
  representativeCoverPath: null,
  ...artist,
  ...mockArtistInfoForArtist(artist.name),
  ...mockOriginForArtist(artist.name),
}));

function applyMockArtistOriginCountry(
  artistKey: string,
  artistName: string,
  musicbrainzMbid: string | null | undefined,
  countryCode: string,
  countryName: string,
  reviewState: string,
): MusicBrainzArtistOriginCountryUpdate {
  const normalizedKey = normalizeArtistKey(artistKey || artistName);
  const update = {
    artistKey: normalizedKey,
    artistName: artistName || artistKey || "Unknown Artist",
    musicbrainzMbid: musicbrainzMbid?.trim() || null,
    originCountryCode: countryCode,
    originCountryName: countryName,
    originCountryRawArea: countryName,
    originCountryReviewState: reviewState,
  } satisfies MusicBrainzArtistOriginCountryUpdate;

  mockRows.forEach((row) => {
    if (normalizeArtistKey(row.albumArtistDisplay) === normalizedKey) {
      row.originCountryCode = update.originCountryCode;
      row.originCountryName = update.originCountryName;
      row.originCountryRawArea = update.originCountryRawArea;
      row.originCountryReviewState = update.originCountryReviewState;
    }
  });
  mockArtists.forEach((artist) => {
    if (artist.id === normalizedKey) {
      artist.originCountryCode = update.originCountryCode;
      artist.originCountryName = update.originCountryName;
      artist.originCountryRawArea = update.originCountryRawArea;
      artist.originCountryReviewState = update.originCountryReviewState;
    }
  });

  return update;
}

function mockCountryNameFromCode(countryCode: string) {
  switch (countryCode) {
    case "GB":
      return "United Kingdom";
    case "NO":
      return "Norway";
    case "SE":
      return "Sweden";
    case "US":
      return "United States";
    default:
      return countryCode;
  }
}

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

let mockMusicTools: MusicToolSummary[] = [
  {
    id: "duplicate-albums",
    label: "Duplicate albums",
    description:
      "Potential duplicate album versions with the same artist, title, and year.",
    severity: "medium",
    scope: "albums",
    issueCount: 2,
    albumCount: 2,
    trackCount: 0,
  },
  {
    id: "albums-without-cover-image",
    label: "Albums without embedded cover image",
    description:
      "Albums missing an imported archive or embedded cover image record.",
    severity: "low",
    scope: "albums",
    issueCount: 1,
    albumCount: 1,
    trackCount: 0,
  },
  {
    id: "missing-chart-albums",
    label: "Missing Chart Albums",
    description:
      "Imported Billboard, Official UK, and VG Lista albums not linked to the library.",
    severity: "low",
    scope: "albums",
    issueCount: 1,
    albumCount: 1,
    trackCount: 0,
  },
  {
    id: "missing-chart-singles",
    label: "Missing Chart Singles",
    description:
      "Imported Billboard, Official UK, VG Lista, Ti i Skuddet, and Norsktoppen singles not linked to the library.",
    severity: "low",
    scope: "tracks",
    issueCount: 1,
    albumCount: 1,
    trackCount: 1,
  },
  {
    id: "artists-without-musicbrainz-data",
    label: "Artists without MusicBrainz data",
    description:
      "Library album artists without a usable MusicBrainz cache or verified overlay match.",
    severity: "medium",
    scope: "artists",
    issueCount: 1,
    albumCount: 1,
    trackCount: 0,
  },
  {
    id: "high-confidence-missing-musicbrainz-albums",
    label: "High-confidence missing MusicBrainz albums",
    description:
      "Collection-wide missing pure official MusicBrainz albums from trusted artist matches.",
    severity: "low",
    scope: "albums",
    issueCount: 1,
    albumCount: 1,
    trackCount: 0,
  },
  {
    id: "albums-not-on-musicbrainz-official-list",
    label: "Albums not on MusicBrainz official list",
    description:
      "Local albums absent from pure official MusicBrainz album lists for trusted artist matches.",
    severity: "low",
    scope: "albums",
    issueCount: 1,
    albumCount: 1,
    trackCount: 0,
  },
  {
    id: "owned-musicbrainz-special-releases",
    label: "Owned MusicBrainz special releases",
    description:
      "Local albums positively matched to selected MusicBrainz compilation, live, interview, or EP release-group types and absent from the pure album list.",
    severity: "low",
    scope: "albums",
    issueCount: 1,
    albumCount: 1,
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
    id: "audio-below-320-kbps",
    label: "Audio below 320 kbps",
    description: "Music Doctor audio matches with a measured bitrate below 320 kbps.",
    severity: "medium",
    scope: "tracks",
    issueCount: 128_069,
    albumCount: 19_604,
    trackCount: 128_069,
  },
  {
    id: "mixed-audio-quality",
    label: "Albums with mixed audio quality",
    description: "Albums whose Music Doctor matches contain more than one measured bitrate.",
    severity: "low",
    scope: "albums",
    issueCount: 8_412,
    albumCount: 8_412,
    trackCount: 0,
  },
  {
    id: "music-doctor-unimported-audio",
    label: "Music Doctor audio not in library",
    description: "Audio files scanned by Music Doctor that do not match the imported library.",
    severity: "low",
    scope: "tracks",
    issueCount: 960,
    albumCount: 78,
    trackCount: 0,
  },
  {
    id: "music-doctor-file-problems",
    label: "Music Doctor file problems",
    description: "Empty, missing, or unreadable files reported by Music Doctor.",
    severity: "high",
    scope: "tracks",
    issueCount: 35,
    albumCount: 14,
    trackCount: 0,
  },
  {
    id: "genre-normalization-issues",
    label: "Genre normalization issues",
    description:
      "Tracks with multi-value genre strings that were collapsed to one canonical genre.",
    severity: "low",
    scope: "tracks",
    issueCount: 1,
    albumCount: 1,
    trackCount: 1,
  },
  {
    id: "whitespace-anomalies",
    label: "Whitespace anomalies",
    description: "Track metadata with repeated internal spaces.",
    severity: "low",
    scope: "tracks",
    issueCount: 1,
    albumCount: 1,
    trackCount: 1,
  },
];

type MockChartMemberships =
  | "billboard"
  | "officialUk"
  | "vgLista"
  | "tiISkuddet"
  | "norsktoppen";
type MockMusicToolIssue = Omit<MusicToolIssueRow, MockChartMemberships> &
  Partial<Pick<MusicToolIssueRow, MockChartMemberships>>;

let mockMusicToolIssues: MusicToolIssueRow[] = ([
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
    id: "albums-without-cover-image:mb:mock-2",
    toolId: "albums-without-cover-image",
    severity: "low",
    entityType: "albums",
    albumId: "mb:mock-2",
    trackId: null,
    album: "Follow the Leader",
    albumArtistDisplay: "Korn",
    title: null,
    canonicalGenre: "Nu Metal",
    year: 1998,
    detail: "No imported cover image",
    value: "Missing album cover record",
    filename: "01 It's On!.mp3",
    filePath: "D:\\Music\\Korn\\Follow the Leader",
  },
  {
    id: "missing-chart-albums:mock-whitney",
    toolId: "missing-chart-albums",
    severity: "low",
    entityType: "albums",
    albumId: "chart-album:whitney-houston-whitney",
    trackId: null,
    album: "Whitney",
    albumArtistDisplay: "WHITNEY HOUSTON",
    title: null,
    canonicalGenre: null,
    year: 1987,
    detail: "Chart album missing from library",
    value: "Billboard #1 / 1987 · Official UK #1 / 1987",
    filename: "1987.csv,albums-1987.csv",
    filePath: null,
    billboard: "#1 / 1987",
    officialUk: "#1 / 1987",
    vgLista: null,
    tiISkuddet: null,
    norsktoppen: null,
  },
  {
    id: "missing-chart-singles:mock-a-ha",
    toolId: "missing-chart-singles",
    severity: "low",
    entityType: "tracks",
    albumId: "chart-single:a-ha-the-living-daylights",
    trackId: null,
    album: null,
    albumArtistDisplay: "A-ha",
    title: "The Living Daylights",
    canonicalGenre: null,
    year: 1987,
    detail: "Chart single missing from library",
    value: "Official UK #5 / 1987 · VG Lista #1 / 1987",
    filename: "1987.csv,singles-1987.csv",
    filePath: null,
    billboard: null,
    officialUk: "#5 / 1987",
    vgLista: "#1 / 1987",
    tiISkuddet: null,
    norsktoppen: null,
  },
  {
    id: "artists-without-musicbrainz-data:korn",
    toolId: "artists-without-musicbrainz-data",
    severity: "medium",
    entityType: "artists",
    albumId: "korn",
    trackId: null,
    album: "Korn",
    albumArtistDisplay: "Korn",
    title: "Follow the Leader",
    canonicalGenre: "Nu Metal",
    year: 1998,
    detail: "No MusicBrainz artist cache match",
    value: "1 albums / 13 tracks",
    filename: null,
    filePath: null,
  },
  {
    id: "high-confidence-missing-musicbrainz-albums:pet-shop-boys:please",
    toolId: "high-confidence-missing-musicbrainz-albums",
    severity: "low",
    entityType: "albums",
    albumId: "musicbrainz:pet-shop-boys:please",
    trackId: null,
    album: "Please",
    albumArtistDisplay: "Pet Shop Boys",
    title: null,
    canonicalGenre: null,
    year: 1986,
    detail: "High-confidence MusicBrainz album missing from library",
    value: "MBID mbid-psb / verified-link / refreshed / matched Pet Shop Boys",
    filename: null,
    filePath: null,
  },
  {
    id: "albums-not-on-musicbrainz-official-list:mb:mock-bootleg",
    toolId: "albums-not-on-musicbrainz-official-list",
    severity: "low",
    entityType: "albums",
    albumId: "mb:mock-bootleg",
    trackId: null,
    album: "Actually: Studio Demos",
    albumArtistDisplay: "Pet Shop Boys",
    title: null,
    canonicalGenre: "Synthpop",
    year: 1986,
    detail: "Local album not found on MusicBrainz pure official album list",
    value: "MBID mbid-psb / verified-link / refreshed / matched Pet Shop Boys",
    filename: "01 One More Chance.mp3",
    filePath: "D:\\Music\\Pet Shop Boys\\Actually Studio Demos",
  },
  {
    id: "owned-musicbrainz-special-releases:mb:mock-live",
    toolId: "owned-musicbrainz-special-releases",
    severity: "low",
    entityType: "albums",
    albumId: "mb:mock-live",
    trackId: null,
    album: "Mirror Ball: Live & More",
    albumArtistDisplay: "Def Leppard",
    title: null,
    canonicalGenre: "Hard Rock",
    year: 2011,
    detail: "Owned MusicBrainz special release",
    value: "Album + Live",
    filename: "01 Rock! Rock! (Till You Drop).mp3",
    filePath: "D:\\Music\\Def Leppard\\Mirror Ball Live & More",
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
  {
    id: "whitespace-anomalies:2",
    toolId: "whitespace-anomalies",
    severity: "low",
    entityType: "tracks",
    albumId: "mb:mock-1",
    trackId: 2,
    album: "Actually",
    albumArtistDisplay: "Pet  Shop Boys",
    title: "What  Have I Done to Deserve This?",
    canonicalGenre: "Synthpop",
    year: 1987,
    detail: "Repeated internal whitespace",
    value: "Repeated spaces",
    filename: "02 What  Have I Done to Deserve This.mp3",
    filePath: "D:\\Music\\Pet  Shop Boys\\Actually",
  },
] satisfies MockMusicToolIssue[]).map((issue) => ({
  billboard: null,
  officialUk: null,
  vgLista: null,
  tiISkuddet: null,
  norsktoppen: null,
  ...issue,
}));

let mockSavedSearches: SavedSearch[] = [];
let mockSavedCharts: SavedChart[] = [];
let mockAiSnapshots: AiSnapshot[] = [];
let mockSettings: AppSettings = loadCachedSettings();
let mockMusicBrainzOverlaySyncLog: MusicBrainzOverlaySyncLogEntry[] = [];

export function setMockMusicBrainzOverlaySyncLog(
  value: MusicBrainzOverlaySyncLogEntry[],
) {
  mockMusicBrainzOverlaySyncLog = value;
}

export function setMockSettings(value: AppSettings) {
  mockSettings = value;
}

export function setMockMusicToolIssues(value: MusicToolIssueRow[]) {
  mockMusicToolIssues = value;
}

export function setMockMusicTools(value: MusicToolSummary[]) {
  mockMusicTools = value;
}

export function setMockSavedSearches(value: SavedSearch[]) {
  mockSavedSearches = value;
}

export function setMockSavedCharts(value: SavedChart[]) {
  mockSavedCharts = value;
}

export function setMockAiSnapshots(value: AiSnapshot[]) {
  mockAiSnapshots = value;
}

export {
  applyMockArtistOriginCountry,
  emitMockMusicBrainzArtistInfoProgress,
  emitMockMusicBrainzOriginProgress,
  emitMockMusicToolProgress,
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
  mockMusicToolProgressHandlers,
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
};
export type { MusicBrainzArtistInfoFields };
