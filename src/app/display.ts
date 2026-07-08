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
    case "billboardSingleRank":
      return row.billboardSingleRank;
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

