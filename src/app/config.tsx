import {
  Activity,
  Album,
  BarChart3,
  Clock3,
  Compass,
  Film,
  FolderInput,
  Gauge,
  Heart,
  ListMusic,
  Search,
  Settings,
  Sparkles,
  Tags,
  UsersRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type {
  BrowseView,
  ChartViewMode,
  CountryFlagDisplay,
  CoverImportProgress,
  ImportProgress,
  LeftSidebarMode,
  MusicToolSummary,
  RightSidebarMode,
  TextFilterOperator,
} from "../types";

export const EXPORT_FORMATS = ["csv", "tsv", "xlsx", "json", "txt"];

export const navigation: { label: string; icon: LucideIcon; enabled: boolean; shortcut: string }[] = [
  { label: "Search", icon: Search, enabled: true, shortcut: "1" },
  { label: "Charts", icon: BarChart3, enabled: true, shortcut: "2" },
  { label: "Discovery", icon: Compass, enabled: true, shortcut: "3" },
  { label: "Statistics", icon: Activity, enabled: true, shortcut: "4" },
  { label: "Albums", icon: Album, enabled: true, shortcut: "5" },
  { label: "Artists", icon: UsersRound, enabled: true, shortcut: "6" },
  { label: "Genres", icon: Tags, enabled: true, shortcut: "7" },
  { label: "Tools", icon: Wrench, enabled: true, shortcut: "8" },
  { label: "Imports", icon: FolderInput, enabled: true, shortcut: "9" },
  { label: "Settings", icon: Settings, enabled: true, shortcut: "0" },
];

export const navigationShortcutMap = new Map(navigation.map((item) => [item.shortcut, item]));

export const leftSidebarModeOptions: { value: LeftSidebarMode; label: string }[] = [
  { value: "expanded", label: "Full" },
  { value: "iconOnly", label: "Icons" },
  { value: "hidden", label: "Hidden" },
];

export const rightSidebarModeOptions: { value: RightSidebarMode; label: string }[] = [
  { value: "expanded", label: "Shown" },
  { value: "hidden", label: "Hidden" },
];

export const countryFlagDisplayOptions: { value: CountryFlagDisplay; label: string }[] = [
  { value: "flagAndName", label: "Flag + name" },
  { value: "name", label: "Name" },
  { value: "flag", label: "Flag" },
];

export const leftSidebarModeLabels: Record<LeftSidebarMode, string> = {
  expanded: "Full",
  iconOnly: "Icons",
  hidden: "Hidden",
};

export const rightSidebarModeLabels: Record<RightSidebarMode, string> = {
  expanded: "Shown",
  hidden: "Hidden",
};

export const countryFlagDisplayLabels: Record<CountryFlagDisplay, string> = {
  flagAndName: "Flag + name",
  name: "Name",
  flag: "Flag",
};

export const operatorLabels: Record<TextFilterOperator, string> = {
  contains: "Contains",
  equals: "Equals",
  startsWith: "Starts with",
};

export type MissingFieldOption = {
  value: string;
  albumLabel: string;
  trackLabel: string;
};

export const missingFieldOptions: MissingFieldOption[] = [
  { value: "album", albumLabel: "Album title", trackLabel: "Track album" },
  { value: "albumArtist", albumLabel: "Album artist", trackLabel: "Album artist" },
  { value: "genre", albumLabel: "Genre", trackLabel: "Track genre" },
  { value: "year", albumLabel: "Year", trackLabel: "Track year" },
  { value: "billboard", albumLabel: "Billboard rank", trackLabel: "Album Billboard rank" },
  { value: "billboardSingle", albumLabel: "Single Billboard rank", trackLabel: "Single Billboard rank" },
  { value: "rating", albumLabel: "Album rating", trackLabel: "Track rating" },
  { value: "time", albumLabel: "Total duration", trackLabel: "Track duration" },
];

export function missingFieldLabel(value: string, view: BrowseView) {
  const option = missingFieldOptions.find((field) => field.value === value);
  if (!option) {
    return value;
  }
  return view === "tracks" ? option.trackLabel : option.albumLabel;
}

export function formatMissingFieldLabels(values: string[], view: BrowseView) {
  return values.map((value) => missingFieldLabel(value, view)).join(", ");
}

export const rankingOptions = [
  { value: "albumScore", label: "Album Score" },
  { value: "billboardRank", label: "Billboard rank" },
  { value: "albumRating", label: "Album rating" },
  { value: "lovedTracks", label: "Loved tracks" },
  { value: "ae", label: "AE" },
  { value: "tmoe", label: "TMOE" },
  { value: "ratingCompleteness", label: "Completeness" },
  { value: "totalMinutes", label: "Minutes" },
];

export const chartColumnOptions = [
  { value: "billboard", label: "Billboard" },
  { value: "originCountry", label: "Origin" },
  { value: "rating", label: "Rating" },
  { value: "complete", label: "Complete" },
  { value: "score", label: "Score" },
  { value: "loved", label: "Loved" },
  { value: "ae", label: "AE" },
  { value: "tmoe", label: "TMOE" },
  { value: "minutes", label: "Minutes" },
];

export const searchTableColumnOptions = [
  { value: "billboard", label: "Billboard" },
];

export type SearchExportColumnOption = {
  value: string;
  label: string;
  views?: BrowseView[];
};

export const searchExportColumnOptions: SearchExportColumnOption[] = [
  { value: "filename", label: "Filename", views: ["albums"] },
  { value: "filePath", label: "File path", views: ["albums"] },
  { value: "ids", label: "IDs" },
  { value: "coverInfo", label: "Cover info" },
  { value: "originCountry", label: "Origin country" },
];

export const chartViewModes: { value: ChartViewMode; label: string; icon: LucideIcon }[] = [
  { value: "table", label: "Table", icon: BarChart3 },
  { value: "compact", label: "List", icon: ListMusic },
  { value: "grid", label: "Grid", icon: Album },
];

export const chartGridCoverSize = {
  min: 96,
  max: 224,
  step: 8,
  default: 144,
} as const;

export const completenessRange = {
  min: 0,
  max: 100,
  step: 1,
} as const;

export const genreSuggestionPageSize = 500;
export const genreSuggestionAliases = ["scores"] as const;
export const maxGenreSuggestions = 5;

export const defaultProgress: ImportProgress = {
  status: "idle",
  processedRows: 0,
  albumCount: 0,
  message: "Ready to import a MusicBee TSV export.",
};

export const defaultCoverProgress: CoverImportProgress = {
  status: "idle",
  totalAlbums: 0,
  scannedAlbums: 0,
  newCoversFound: 0,
  importedCovers: 0,
  relinkedCovers: 0,
  skippedExisting: 0,
  missingCovers: 0,
  percent: 0,
  message: "Ready to scan AlbumCovers.",
};

export const musicToolCatalog: MusicToolSummary[] = [
  {
    id: "duplicate-albums",
    label: "Duplicate albums",
    description: "Potential duplicate album versions with the same artist, title, and year.",
    severity: "medium",
    scope: "albums",
    issueCount: -1,
    albumCount: -1,
    trackCount: -1,
  },
  {
    id: "albums-without-cover-image",
    label: "Albums without embedded cover image",
    description: "Albums missing an imported archive or embedded cover image record.",
    severity: "low",
    scope: "albums",
    issueCount: -1,
    albumCount: -1,
    trackCount: -1,
  },
  {
    id: "missing-billboard-albums",
    label: "Missing Billboard Albums",
    description: "Imported Billboard chart albums that are not linked to any library album.",
    severity: "low",
    scope: "albums",
    issueCount: -1,
    albumCount: -1,
    trackCount: -1,
  },
  {
    id: "missing-billboard-singles",
    label: "Missing Billboard Singles",
    description: "Imported Billboard chart singles that are not linked to any library track.",
    severity: "low",
    scope: "tracks",
    issueCount: -1,
    albumCount: -1,
    trackCount: -1,
  },
  {
    id: "duplicates-within-album",
    label: "Duplicates within album",
    description: "Tracks that repeat a title or disc/track position inside one album.",
    severity: "high",
    scope: "tracks",
    issueCount: -1,
    albumCount: -1,
    trackCount: -1,
  },
  {
    id: "invalid-time-values",
    label: "Invalid time values",
    description: "Tracks where duration could not be parsed into seconds.",
    severity: "high",
    scope: "tracks",
    issueCount: -1,
    albumCount: -1,
    trackCount: -1,
  },
  {
    id: "non-numeric-ratings",
    label: "Non-numeric ratings",
    description: "Track ratings that contain non-numeric text.",
    severity: "medium",
    scope: "tracks",
    issueCount: -1,
    albumCount: -1,
    trackCount: -1,
  },
  {
    id: "missing-tags",
    label: "Missing tags",
    description: "Tracks missing required album, artist, title, genre, year, or file tags.",
    severity: "high",
    scope: "tracks",
    issueCount: -1,
    albumCount: -1,
    trackCount: -1,
  },
  {
    id: "non-mp3-files",
    label: "Non-MP3 files",
    description: "Tracks whose filenames do not end in .mp3.",
    severity: "low",
    scope: "tracks",
    issueCount: -1,
    albumCount: -1,
    trackCount: -1,
  },
  {
    id: "year-anomalies",
    label: "Year anomalies",
    description: "Tracks with missing or implausible canonical year values.",
    severity: "medium",
    scope: "tracks",
    issueCount: -1,
    albumCount: -1,
    trackCount: -1,
  },
  {
    id: "ratings-out-of-range",
    label: "Ratings out of range",
    description: "Numeric ratings that are not whole-number values from 0 to 5.",
    severity: "high",
    scope: "tracks",
    issueCount: -1,
    albumCount: -1,
    trackCount: -1,
  },
  {
    id: "track-disc-number-issues",
    label: "Track/disc number issues",
    description: "Tracks with missing, zero, or negative disc and track numbers.",
    severity: "medium",
    scope: "tracks",
    issueCount: -1,
    albumCount: -1,
    trackCount: -1,
  },
  {
    id: "inconsistent-album-metadata",
    label: "Inconsistent album metadata",
    description: "Albums whose tracks disagree on title, genre, or publisher.",
    severity: "medium",
    scope: "albums",
    issueCount: -1,
    albumCount: -1,
    trackCount: -1,
  },
  {
    id: "whitespace-anomalies",
    label: "Whitespace anomalies",
    description: "Track metadata with repeated internal spaces.",
    severity: "low",
    scope: "tracks",
    issueCount: -1,
    albumCount: -1,
    trackCount: -1,
  },
  {
    id: "genre-normalization-issues",
    label: "Genre normalization issues",
    description: "Tracks with multi-value genre strings that were collapsed to one canonical genre.",
    severity: "low",
    scope: "tracks",
    issueCount: -1,
    albumCount: -1,
    trackCount: -1,
  },
  {
    id: "conflicting-album-artists",
    label: "Conflicting album artists",
    description: "Albums whose tracks disagree on album artist.",
    severity: "high",
    scope: "albums",
    issueCount: -1,
    albumCount: -1,
    trackCount: -1,
  },
  {
    id: "multiple-years-per-album",
    label: "Multiple years per album",
    description: "Albums containing tracks with more than one canonical year.",
    severity: "medium",
    scope: "albums",
    issueCount: -1,
    albumCount: -1,
    trackCount: -1,
  },
];
