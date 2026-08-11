import type { BrowseRow, MusicToolProgress, TextFilter } from "../types";
import { completenessRange, operatorLabels, rankingOptions } from "./config";
import { normalizeCompletenessRange } from "./requests";

export function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat().format(value ?? 0);
}

export function formatToolCount(value: number | null | undefined) {
  if (value == null || value < 0) {
    return "On select";
  }
  return formatNumber(value);
}

export function formatToolProgress(progress: MusicToolProgress | null) {
  if (!progress) {
    return null;
  }
  return `${Math.round(progress.percent)}%`;
}

export function isMusicToolProgressActive(progress: MusicToolProgress | null) {
  return Boolean(progress && progress.status !== "completed" && progress.status !== "failed");
}

export function formatDuration(ms: number) {
  if (!ms) return "0s";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function formatDate(value: string | null) {
  if (!value) return "Not completed";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatMinutes(seconds: number | null | undefined) {
  if (seconds == null) return "";
  return `${(seconds / 60).toFixed(1)}m`;
}

export function formatHours(seconds: number | null | undefined) {
  if (!seconds) return "0h";
  return `${(seconds / 3600).toFixed(1)}h`;
}

export function formatPercent(value: number | null | undefined, digits = 1) {
  if (value == null) return "";
  return `${(value * 100).toFixed(digits)}%`;
}

export function percentOf(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (value / total) * 100));
}

export function ratioOf(value: number | null | undefined, total: number | null | undefined) {
  if (!value || !total || total <= 0) return 0;
  return Math.max(0, Math.min(1, value / total));
}

export function formatAverage(value: number | null | undefined, digits = 1) {
  if (value == null) return "";
  return value.toFixed(digits);
}

export function formatSignedNumber(value: number) {
  if (value === 0) return "0";
  return `${value > 0 ? "+" : "-"}${formatNumber(Math.abs(value))}`;
}

export function formatTrackRating(value: number | null | undefined) {
  if (value == null) return "";
  return `${value / 20}`;
}

export function formatClockTime(seconds: number | null | undefined) {
  if (seconds == null) return "";
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export function ratingStarCount(value: number | null | undefined) {
  if (value == null) return 0;
  return Math.max(0, Math.min(5, Math.round(value / 20)));
}

export function rankingLabel(value: string) {
  return rankingOptions.find((option) => option.value === value)?.label ?? "Album Score";
}

export function severityLabel(value: string | null | undefined) {
  if (!value) return "";
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

export function formatBillboardRank(row: Pick<BrowseRow, "billboardRank" | "billboardYear">) {
  if (row.billboardRank == null) return "";
  return row.billboardYear == null ? `#${row.billboardRank}` : `#${row.billboardRank} ${row.billboardYear}`;
}

export function formatBillboardSingleRank(row: Pick<BrowseRow, "billboardSingleRank" | "billboardSingleYear">) {
  if (row.billboardSingleRank == null) return "";
  return row.billboardSingleYear == null
    ? `#${row.billboardSingleRank}`
    : `#${row.billboardSingleRank} ${row.billboardSingleYear}`;
}

export function formatOriginCountry(
  row: Pick<BrowseRow, "originCountryCode" | "originCountryName" | "originCountryRawArea">,
) {
  const name = stripOriginCountryArea(row.originCountryName) || row.originCountryCode || "";
  return name;
}

export function formatVgListaRank(
  row: Pick<BrowseRow, "vgListaRank" | "vgListaYear">,
) {
  if (row.vgListaRank == null) return "";
  return row.vgListaYear == null
    ? `#${row.vgListaRank}`
    : `#${row.vgListaRank} ${row.vgListaYear}`;
}

export function formatOfficialUkRank(
  row: Pick<BrowseRow, "officialUkRank" | "officialUkYear">,
) {
  if (row.officialUkRank == null) return "";
  return row.officialUkYear == null
    ? `#${row.officialUkRank}`
    : `#${row.officialUkRank} ${row.officialUkYear}`;
}

export function formatTiISkuddetRank(
  row: Pick<BrowseRow, "tiISkuddetRank" | "tiISkuddetYear">,
) {
  if (row.tiISkuddetRank == null) return "";
  return row.tiISkuddetYear == null
    ? `#${row.tiISkuddetRank}`
    : `#${row.tiISkuddetRank} ${row.tiISkuddetYear}`;
}

export function formatTiISkuddetDebut(
  row: Pick<
    BrowseRow,
    "tiISkuddetDebutDate" | "tiISkuddetDebutWeek"
  >,
) {
  if (!row.tiISkuddetDebutDate) return "";
  const date = new Date(`${row.tiISkuddetDebutDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return row.tiISkuddetDebutDate;
  const label = new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
  return row.tiISkuddetDebutWeek == null
    ? label
    : `${label} · W${row.tiISkuddetDebutWeek}`;
}

export function formatNorsktoppenRank(
  row: Pick<BrowseRow, "norsktoppenRank" | "norsktoppenYear">,
) {
  if (row.norsktoppenRank == null) return "";
  return row.norsktoppenYear == null
    ? `#${row.norsktoppenRank}`
    : `#${row.norsktoppenRank} ${row.norsktoppenYear}`;
}

export function formatNorsktoppenDebut(
  row: Pick<BrowseRow, "norsktoppenDebutDate" | "norsktoppenDebutWeek">,
) {
  if (!row.norsktoppenDebutDate) return "";
  const date = new Date(`${row.norsktoppenDebutDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return row.norsktoppenDebutDate;
  const label = new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
  return row.norsktoppenDebutWeek == null
    ? label
    : `${label} · W${row.norsktoppenDebutWeek}`;
}

export function formatBillboardSingleDebut(
  row: Pick<
    BrowseRow,
    "billboardSingleDebutDate" | "billboardSingleDebutWeek"
  >,
) {
  if (!row.billboardSingleDebutDate) return "";
  const date = new Date(`${row.billboardSingleDebutDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return row.billboardSingleDebutDate;
  const label = new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
  return row.billboardSingleDebutWeek == null
    ? label
    : `${label} · W${row.billboardSingleDebutWeek}`;
}

export function formatBillboardDebutWeek(
  row: Pick<
    BrowseRow,
    "billboardDebutYear" | "billboardDebutMonth" | "billboardDebutWeek"
  >,
) {
  if (row.billboardDebutYear == null || row.billboardDebutWeek == null) {
    return "";
  }
  const month =
    row.billboardDebutMonth == null
      ? ""
      : new Intl.DateTimeFormat(undefined, {
          month: "short",
          timeZone: "UTC",
        }).format(new Date(Date.UTC(2000, row.billboardDebutMonth - 1, 1)));
  return `${month ? `${month} ` : ""}${row.billboardDebutYear} · Week ${row.billboardDebutWeek}`;
}

export function formatVgListaDebutWeek(
  row: Pick<
    BrowseRow,
    "vgListaDebutYear" | "vgListaDebutMonth" | "vgListaDebutWeek"
  >,
) {
  if (row.vgListaDebutYear == null || row.vgListaDebutWeek == null) {
    return "";
  }
  const month =
    row.vgListaDebutMonth == null
      ? ""
      : new Intl.DateTimeFormat(undefined, {
          month: "short",
          timeZone: "UTC",
        }).format(new Date(Date.UTC(2000, row.vgListaDebutMonth - 1, 1)));
  return `${month ? `${month} ` : ""}${row.vgListaDebutYear} · Week ${row.vgListaDebutWeek}`;
}

export function formatOfficialUkDebutWeek(
  row: Pick<
    BrowseRow,
    "officialUkDebutYear" | "officialUkDebutMonth" | "officialUkDebutWeek"
  >,
) {
  if (row.officialUkDebutYear == null || row.officialUkDebutWeek == null) {
    return "";
  }
  const month =
    row.officialUkDebutMonth == null
      ? ""
      : new Intl.DateTimeFormat(undefined, {
          month: "short",
          timeZone: "UTC",
        }).format(new Date(Date.UTC(2000, row.officialUkDebutMonth - 1, 1)));
  return `${month ? `${month} ` : ""}${row.officialUkDebutYear} · Week ${row.officialUkDebutWeek}`;
}

export function billboardDebutWeekKey(
  row: Pick<
    BrowseRow,
    "billboardDebutYear" | "billboardDebutWeek" | "billboardDebutWeekKey"
  >,
) {
  if (row.billboardDebutWeekKey) {
    return row.billboardDebutWeekKey;
  }
  if (row.billboardDebutYear == null || row.billboardDebutWeek == null) {
    return "";
  }
  return `${row.billboardDebutYear.toString().padStart(4, "0")}-W${row.billboardDebutWeek.toString().padStart(2, "0")}`;
}

function stripOriginCountryArea(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed.endsWith(")")) {
    return trimmed;
  }
  const openIndex = trimmed.lastIndexOf(" (");
  if (openIndex <= 0) {
    return trimmed;
  }
  return trimmed.slice(0, openIndex).trim();
}

export function formatChartMetric(row: BrowseRow, metric: string) {
  switch (metric) {
    case "billboardRank":
      return formatBillboardRank(row);
    case "albumRating":
      return row.effectiveAlbumRating?.toString() ?? "";
    case "billboardSingleRank":
      return formatBillboardSingleRank(row);
    case "billboardSingleDebut":
      return formatBillboardSingleDebut(row);
    case "vgListaRank":
      return formatVgListaRank(row);
    case "vgListaDebut":
      return formatVgListaDebutWeek(row);
    case "officialUkRank":
      return formatOfficialUkRank(row);
    case "officialUkDebut":
      return formatOfficialUkDebutWeek(row);
    case "tiISkuddetRank":
      return formatTiISkuddetRank(row);
    case "tiISkuddetDebut":
      return formatTiISkuddetDebut(row);
    case "norsktoppenRank":
      return formatNorsktoppenRank(row);
    case "norsktoppenDebut":
      return formatNorsktoppenDebut(row);
    case "trackRating":
      return formatTrackRating(row.normalizedRating);
    case "lovedTracks":
      return row.lovedTracks?.toString() ?? "0";
    case "ae":
      return formatPercent(row.aeRatio, 2);
    case "tmoe":
      return formatMinutes(row.tmoeSeconds);
    case "ratingCompleteness":
      return formatPercent(row.ratingCompleteness);
    case "totalMinutes":
      return formatMinutes(row.totalSeconds);
    default:
      return row.albumScore?.toFixed(3) ?? "";
  }
}

export function browseRowSortValue(row: BrowseRow, field: string) {
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
      return (row.originCountryName || row.originCountryCode || "").toLowerCase();
    case "billboardRank":
      return row.billboardRank;
    case "billboardDebut":
      return billboardDebutWeekKey(row);
    case "billboardSingleRank":
      return row.billboardSingleRank;
    case "billboardSingleDebut":
      return row.billboardSingleDebutDate ?? "";
    case "vgListaRank":
      return row.vgListaRank;
    case "vgListaDebut":
      return row.vgListaDebutWeekKey ?? "";
    case "officialUkRank":
      return row.officialUkRank;
    case "officialUkDebut":
      return row.officialUkDebutWeekKey ?? "";
    case "tiISkuddetRank":
      return row.tiISkuddetRank;
    case "tiISkuddetDebut":
      return row.tiISkuddetDebutWeekKey ?? "";
    case "norsktoppenRank":
      return row.norsktoppenRank;
    case "norsktoppenDebut":
      return row.norsktoppenDebutWeekKey ?? "";
    case "trackRating":
      return row.normalizedRating;
    case "bitrate":
      return row.trackId == null ? row.minBitrateKbps : row.bitrateKbps;
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

export function compareBrowseRows(left: BrowseRow, right: BrowseRow, field: string) {
  const leftValue = browseRowSortValue(left, field);
  const rightValue = browseRowSortValue(right, field);
  if (typeof leftValue === "string" || typeof rightValue === "string") {
    return String(leftValue).localeCompare(String(rightValue));
  }
  return (leftValue ?? 0) - (rightValue ?? 0);
}

export function formatCompletenessRange(minValue: number | null | undefined, maxValue: number | null | undefined) {
  const { min, max } = normalizeCompletenessRange(minValue, maxValue);
  if (min <= completenessRange.min && max >= completenessRange.max) return "0-100%";
  if (min === max) return `${min}%`;
  if (min <= completenessRange.min) return `<= ${max}%`;
  if (max >= completenessRange.max) return `>= ${min}%`;
  return `${min}-${max}%`;
}

export function textFilterLabel(label: string, filter: TextFilter) {
  if (!filter.value.trim()) return null;
  return `${label} ${operatorLabels[filter.operator].toLowerCase()} "${filter.value.trim()}"`;
}

