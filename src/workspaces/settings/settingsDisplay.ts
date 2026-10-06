import {
  type MusicBrainzOriginCountryPreviewRow,
  type MusicBrainzArtistInfoPreviewRow,
  type MusicBrainzCacheStatus,
  type MusicBrainzArtistDiscographyResponse,
  type MusicBrainzOverlaySyncResult,
  type MusicBrainzOverlaySyncLogEntry,
} from "../../types";
import {
  type OriginReportFilter,
  type ArtistInfoReportFilter,
  type AppUpdateStatus,
} from "../../app/defaults";
import { type AppUpdateInstallProgress } from "../../app/updater";
import { formatBytes } from "../../app/display";

export function originImportStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "preparing":
      return "Preparing";
    case "running":
      return "Running";
    case "fetching":
      return "Fetching";
    case "stored":
      return "Stored";
    case "unresolved":
      return "Unresolved";
    case "artistFailed":
      return "Artist failed";
    case "completed":
      return "Completed";
    case "completed_with_errors":
      return "Completed with errors";
    case "cancelled":
      return "Cancelled";
    case "cancelling":
      return "Cancelling";
    case "failed":
      return "Failed";
    default:
      return status || "Idle";
  }
}

export function originPreviewStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "eligible":
      return "Eligible";
    case "alreadyImported":
      return "Imported";
    case "manual":
      return "Manual";
    case "skipped":
      return "Skipped";
    case "unresolved":
      return "Unresolved";
    default:
      return status || "Unknown";
  }
}

export function originPreviewMatchLabel(
  row: MusicBrainzOriginCountryPreviewRow,
) {
  const matchName = row.matchedName ?? row.musicbrainzMbid ?? "No MBID";
  return [matchName, row.matchMethod].filter(Boolean).join(" / ");
}

export function originPreviewReason(row: MusicBrainzOriginCountryPreviewRow) {
  if (row.skippedReason) {
    return row.skippedReason;
  }
  switch (row.status) {
    case "eligible":
      return row.suspectMapping
        ? "Ready from cached MBID; review on the Artist page if wrong."
        : "Ready for MusicBrainz lookup.";
    case "alreadyImported":
      if (row.suspectMapping) {
        return "Imported from cached MBID; review on the Artist page if wrong.";
      }
      return row.existingReviewState
        ? `Saved as ${row.existingReviewState}.`
        : "Country already saved.";
    case "manual":
      return "Manual or reviewed country is preserved.";
    case "unresolved":
      return "No usable MusicBrainz artist match.";
    default:
      return row.artistLinkState ? `Artist link: ${row.artistLinkState}.` : "";
  }
}

export function originPreviewMatchesFilter(
  row: MusicBrainzOriginCountryPreviewRow,
  filter: OriginReportFilter,
) {
  switch (filter) {
    case "needsAttention":
      return row.status === "skipped" || row.status === "unresolved";
    case "skipped":
      return row.status === "skipped";
    case "unresolved":
      return row.status === "unresolved";
    case "eligible":
      return row.status === "eligible";
    case "imported":
      return row.status === "alreadyImported" || row.status === "manual";
    case "all":
      return true;
    default:
      return true;
  }
}

export function originPreviewMatchesSearch(
  row: MusicBrainzOriginCountryPreviewRow,
  query: string,
) {
  if (!query) {
    return true;
  }
  const haystack = [
    row.displayArtist,
    row.localArtistKey,
    row.musicbrainzMbid,
    row.matchedName,
    row.existingCountryName,
    row.existingCountryCode,
    row.matchMethod,
    row.artistLinkState,
    row.skippedReason,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

export function artistInfoPreviewStatusLabel(
  status: string | null | undefined,
) {
  switch (status) {
    case "eligible":
      return "Eligible";
    case "alreadyImported":
      return "Imported";
    case "skipped":
      return "Skipped";
    case "unresolved":
      return "Unresolved";
    default:
      return status || "Unknown";
  }
}

export function artistInfoPreviewMatchLabel(
  row: MusicBrainzArtistInfoPreviewRow,
) {
  const matchName = row.matchedName ?? row.musicbrainzMbid ?? "No MBID";
  return [matchName, row.matchMethod].filter(Boolean).join(" / ");
}

export function artistInfoPreviewReason(row: MusicBrainzArtistInfoPreviewRow) {
  if (row.skippedReason) {
    return row.skippedReason;
  }
  switch (row.status) {
    case "eligible":
      return row.suspectMapping
        ? "Ready from cached MBID; review on the Artist page if wrong."
        : "Ready for MusicBrainz artist lookup.";
    case "alreadyImported":
      return row.existingReviewState
        ? `Saved as ${row.existingReviewState}.`
        : "Artist info already saved.";
    case "unresolved":
      return "No usable MusicBrainz artist match.";
    default:
      return row.artistLinkState ? `Artist link: ${row.artistLinkState}.` : "";
  }
}

export function artistInfoPreviewMatchesFilter(
  row: MusicBrainzArtistInfoPreviewRow,
  filter: ArtistInfoReportFilter,
) {
  const artistType = row.existingArtistType?.trim().toLowerCase();
  switch (filter) {
    case "needsAttention":
      return row.status === "skipped" || row.status === "unresolved";
    case "eligible":
      return row.status === "eligible";
    case "imported":
      return row.status === "alreadyImported";
    case "person":
      return artistType === "person";
    case "group":
      return artistType === "group";
    case "all":
      return true;
    default:
      return true;
  }
}

export function artistInfoPreviewMatchesSearch(
  row: MusicBrainzArtistInfoPreviewRow,
  query: string,
) {
  if (!query) {
    return true;
  }
  const haystack = [
    row.displayArtist,
    row.localArtistKey,
    row.musicbrainzMbid,
    row.matchedName,
    row.existingSortName,
    row.existingArtistType,
    row.existingGender,
    row.existingBeginDate,
    row.existingEndDate,
    row.existingBeginAreaName,
    row.existingEndAreaName,
    row.matchMethod,
    row.artistLinkState,
    row.skippedReason,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

export function artistInfoLifeStartLabel(row: MusicBrainzArtistInfoPreviewRow) {
  return row.existingArtistType?.toLowerCase() === "group" ? "Founded" : "Born";
}

export function artistInfoLifeEndLabel(row: MusicBrainzArtistInfoPreviewRow) {
  return row.existingArtistType?.toLowerCase() === "group"
    ? "Dissolved"
    : "Died";
}

export function artistInfoDateLabel(
  date: string | null,
  year: number | null,
  area: string | null,
) {
  const value = date || (year == null ? null : String(year));
  if (!value && !area) {
    return "Missing";
  }
  return [value, area].filter(Boolean).join(" / ");
}

export function musicBrainzArtistUrl(mbid: string) {
  return `https://musicbrainz.org/artist/${mbid}`;
}

export function musicBrainzStateLabel(
  state:
    | MusicBrainzCacheStatus["state"]
    | MusicBrainzArtistDiscographyResponse["state"]
    | null
    | undefined,
) {
  switch (state) {
    case "available":
      return "Available";
    case "warning":
      return "Warnings";
    case "invalid":
      return "Invalid";
    case "unavailable":
      return "Unavailable";
    case "notFound":
      return "Not found";
    case "ignored":
      return "Ignored";
    default:
      return "Not checked";
  }
}

export function musicBrainzYearRange(status: MusicBrainzCacheStatus | null) {
  if (!status?.releaseYearMin || !status.releaseYearMax) {
    return "Unknown";
  }
  return `${status.releaseYearMin}-${status.releaseYearMax}`;
}

export function musicBrainzCacheDateRange(
  status: MusicBrainzCacheStatus | null,
) {
  if (!status?.cacheDateMin || !status.cacheDateMax) {
    return "Unknown";
  }
  const dateFrom = status.cacheDateMin.slice(0, 10);
  const dateTo = status.cacheDateMax.slice(0, 10);
  return dateFrom === dateTo ? dateFrom : `${dateFrom}-${dateTo}`;
}

export function musicBrainzOverlaySyncDetails(
  result: MusicBrainzOverlaySyncResult | MusicBrainzOverlaySyncLogEntry,
) {
  const details = [
    ["artist links", result.artistLinksImported, result.artistLinksExported],
    ["unlinks", result.artistUnlinksImported, result.artistUnlinksExported],
    [
      "release decisions",
      result.releaseDecisionsImported,
      result.releaseDecisionsExported,
    ],
    [
      "decision clears",
      result.releaseDecisionClearsImported,
      result.releaseDecisionClearsExported,
    ],
    [
      "status rows",
      result.releaseStatusesImported,
      result.releaseStatusesExported,
    ],
    [
      "release groups",
      result.releaseGroupsImported,
      result.releaseGroupsExported,
    ],
  ]
    .filter(([, imported, exported]) => Number(imported) + Number(exported) > 0)
    .map(
      ([label, imported, exported]) =>
        `${label}: ${imported} in / ${exported} out`,
    );

  return details.length > 0 ? details.join("; ") : "No row changes";
}

export function textSettingValue(value: unknown, fallback: string) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || fallback;
}

export function overlayAutoSyncMinutesValue(value: unknown) {
  const parsed = Math.round(Number(value ?? 0));
  return Math.min(1440, Math.max(0, Number.isFinite(parsed) ? parsed : 0));
}

export function updateAutoCheckMinutesValue(value: unknown) {
  const parsed = Math.round(Number(value ?? 0));
  return Math.min(1440, Math.max(0, Number.isFinite(parsed) ? parsed : 0));
}

export function appUpdateStatusLabel(status: AppUpdateStatus) {
  switch (status) {
    case "checking":
      return "Checking";
    case "available":
      return "Available";
    case "upToDate":
      return "Current";
    case "downloading":
      return "Downloading";
    case "installing":
      return "Installing";
    case "restarting":
      return "Restarting";
    case "error":
      return "Check failed";
    default:
      return "Not checked";
  }
}

export function appUpdateProgressText(
  progress: AppUpdateInstallProgress | null,
) {
  if (!progress) {
    return "Preparing";
  }
  if (progress.phase !== "downloading") {
    return appUpdateStatusLabel(progress.phase);
  }
  if (progress.percent != null) {
    return `${Math.round(progress.percent)}% / ${formatBytes(progress.downloadedBytes)}`;
  }
  return `${formatBytes(progress.downloadedBytes)} downloaded`;
}
