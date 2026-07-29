import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Album,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  ExternalLink,
  Heart,
  ListPlus,
  Plus,
  RadioTower,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";

import {
  addWishListMusicBrainzCandidate,
  clearCompletedSoulseekTransfers,
  discoverWishListArtistAlbums,
  downloadDeemixAlbum,
  enqueueSoulseekRelease,
  getSoulseekTransfers,
  listWishList,
  listenToDeemixDownloadProgress,
  listenToSoulseekTransfers,
  openExternalUrl,
  preflightDeemixAlbumDownload,
  refreshWishListArtistAlbumSummary,
  removeWishListItem,
  searchWishListMusicBrainz,
  searchDeemixAlbums,
  searchSoulseekAlbum,
} from "../backend";
import type {
  DeemixAlbumDownloadProgress,
  DeemixAlbumDownloadSummary,
  DeemixAlbumMatch,
  DeemixAlbumSearchResponse,
  SoulseekAlbumSearchResponse,
  SoulseekSearchResult,
  SoulseekTransfer,
  SoulseekTransferQueue,
  SoulseekTransferStatus,
  WishListArtistAlbumDiscoveryRow,
  WishListArtistAlbumDiscoveryResponse,
  WishListArtistAlbumSummary,
  WishListEntity,
  WishListItem,
  WishListMusicBrainzCandidate,
  WishListMusicBrainzSearchResponse,
} from "../types";

type SoulseekReleaseCandidate = {
  id: string;
  username: string;
  remoteFolder: string;
  files: SoulseekSearchResult[];
  format: string;
  totalSizeBytes: number;
  slotFree: boolean;
  averageSpeed: number;
  queueLength: number;
};

type SoulseekDownloadTarget = {
  artist: string;
  title: string;
  year: number | null;
  releaseGroupId: string | null;
};

type ArtistSoulseekSearchEntry = {
  status: "queued" | "searching" | "complete" | "error";
  response: SoulseekAlbumSearchResponse | null;
  error: string | null;
  notice: string | null;
};

const ARTIST_SOULSEEK_SEARCH_CONCURRENCY = 6;

const SOULSEEK_AUDIO_EXTENSIONS = new Set([
  "flac",
  "mp3",
  "m4a",
  "aac",
  "ogg",
  "opus",
  "wav",
  "aiff",
  "ape",
  "wv",
]);

function remoteFolder(filename: string) {
  const normalized = filename.replace(/\//g, "\\");
  const separator = normalized.lastIndexOf("\\");
  return separator > 0 ? normalized.slice(0, separator) : "Shared music";
}

function remoteTitle(filename: string) {
  const normalized = filename.replace(/\//g, "\\");
  return normalized.slice(normalized.lastIndexOf("\\") + 1);
}

function soulseekReleaseCandidates(
  response: SoulseekAlbumSearchResponse | null,
) {
  if (!response) return [];
  const groups = new Map<string, SoulseekReleaseCandidate>();
  for (const result of response.results) {
    const extension = result.extension.toLowerCase().replace(/^\./, "");
    if (result.isPrivate || !SOULSEEK_AUDIO_EXTENSIONS.has(extension)) continue;
    const folder = remoteFolder(result.filename);
    const key = `${result.username.toLowerCase()}\u001f${folder.toLowerCase()}`;
    const current = groups.get(key);
    if (current) {
      if (!current.files.some((file) => file.filename === result.filename)) {
        current.files.push(result);
        current.totalSizeBytes += result.sizeBytes;
      }
      current.slotFree ||= result.slotFree;
      current.averageSpeed = Math.max(current.averageSpeed, result.averageSpeed);
      current.queueLength = Math.min(current.queueLength, result.queueLength);
      const formats = new Set(current.format.split(" / "));
      formats.add(extension.toUpperCase());
      current.format = [...formats].join(" / ");
      continue;
    }
    groups.set(key, {
      id: key,
      username: result.username,
      remoteFolder: folder,
      files: [result],
      format: extension.toUpperCase(),
      totalSizeBytes: result.sizeBytes,
      slotFree: result.slotFree,
      averageSpeed: result.averageSpeed,
      queueLength: result.queueLength,
    });
  }
  return [...groups.values()]
    .map((candidate) => ({
      ...candidate,
      files: candidate.files.sort((left, right) =>
        left.filename.localeCompare(right.filename, undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      ),
    }))
    .sort(
      (left, right) =>
        Number(right.slotFree) - Number(left.slotFree) ||
        right.files.length - left.files.length ||
        right.averageSpeed - left.averageSpeed ||
        left.queueLength - right.queueLength,
    )
    .slice(0, 25);
}

function formatSoulseekBytes(value: number) {
  if (value < 1_048_576) return `${Math.max(1, Math.round(value / 1_024))} KB`;
  if (value < 1_073_741_824) return `${(value / 1_048_576).toFixed(1)} MB`;
  return `${(value / 1_073_741_824).toFixed(2)} GB`;
}

function formatSoulseekSpeed(value: number) {
  return value > 0 ? `${formatSoulseekBytes(value)}/s` : "speed unknown";
}

function formatSoulseekDuration(seconds: number) {
  if (seconds < 60) return `${Math.max(1, Math.ceil(seconds))} sec`;
  if (seconds < 3_600) return `${Math.ceil(seconds / 60)} min`;
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.ceil((seconds % 3_600) / 60);
  return minutes ? `${hours} hr ${minutes} min` : `${hours} hr`;
}

function soulseekSourceKey(username: string, folder: string) {
  return `${username.trim().toLocaleLowerCase()}\u0000${folder
    .replace(/\//g, "\\")
    .replace(/[\\]+$/, "")
    .toLocaleLowerCase()}`;
}

type SoulseekReleaseProgressSummary = {
  status: SoulseekTransferStatus;
  fileCount: number;
  completedFiles: number;
  failedFiles: number;
  totalBytes: number;
  transferredBytes: number;
  speedBytesPerSecond: number;
  etaSeconds: number | null;
  queuePosition: number | null;
  error: string | null;
};

type SoulseekReleaseProgressAccumulator = Omit<
  SoulseekReleaseProgressSummary,
  "status"
> & {
  statuses: Set<SoulseekTransferStatus>;
};

function resolveSoulseekReleaseStatus(
  summary: SoulseekReleaseProgressAccumulator,
): SoulseekTransferStatus {
  if (summary.completedFiles === summary.fileCount) return "completed";
  if (summary.failedFiles > 0) return "failed";
  for (const status of [
    "downloading",
    "connecting",
    "requesting",
    "remotelyQueued",
    "retrying",
    "queued",
    "paused",
  ] as const) {
    if (summary.statuses.has(status)) return status;
  }
  return "queued";
}

function buildSoulseekReleaseProgress(
  queue: SoulseekTransferQueue | null,
) {
  const progress = new Map<string, SoulseekReleaseProgressAccumulator>();
  for (const transfer of queue?.transfers ?? []) {
    const key = soulseekSourceKey(
      transfer.username,
      remoteFolder(transfer.remoteFilename),
    );
    const summary = progress.get(key) ?? {
      fileCount: 0,
      completedFiles: 0,
      failedFiles: 0,
      totalBytes: 0,
      transferredBytes: 0,
      speedBytesPerSecond: 0,
      etaSeconds: null,
      queuePosition: null,
      error: null,
      statuses: new Set<SoulseekTransferStatus>(),
    };
    summary.fileCount += 1;
    summary.completedFiles += Number(transfer.status === "completed");
    summary.failedFiles += Number(transfer.status === "failed");
    summary.totalBytes += transfer.sizeBytes;
    summary.transferredBytes += Math.min(
      transfer.transferredBytes,
      transfer.sizeBytes,
    );
    summary.speedBytesPerSecond += transfer.speedBytesPerSecond;
    summary.etaSeconds =
      transfer.etaSeconds === null
        ? summary.etaSeconds
        : Math.max(summary.etaSeconds ?? 0, transfer.etaSeconds);
    if (
      transfer.status === "remotelyQueued" &&
      transfer.queuePosition !== null
    ) {
      summary.queuePosition = Math.min(
        summary.queuePosition ?? transfer.queuePosition,
        transfer.queuePosition,
      );
    }
    summary.error ??= transfer.error;
    summary.statuses.add(transfer.status);
    progress.set(key, summary);
  }

  return new Map<string, SoulseekReleaseProgressSummary>(
    [...progress].map(([key, summary]) => [
      key,
      { ...summary, status: resolveSoulseekReleaseStatus(summary) },
    ]),
  );
}

function clearableSoulseekTransferCount(queue: SoulseekTransferQueue | null) {
  if (!queue) return 0;
  const releases = new Map<string, SoulseekTransfer[]>();
  let standaloneCompleted = 0;
  for (const transfer of queue.transfers) {
    if (!transfer.releaseId) {
      standaloneCompleted += Number(transfer.status === "completed");
      continue;
    }
    const release = releases.get(transfer.releaseId) ?? [];
    release.push(transfer);
    releases.set(transfer.releaseId, release);
  }
  return standaloneCompleted + [...releases.values()].reduce(
    (count, release) =>
      count + (release.every((transfer) => transfer.status === "completed") ? release.length : 0),
    0,
  );
}

function soulseekProgressPercent(summary: SoulseekReleaseProgressSummary) {
  return summary.totalBytes
    ? Math.min(
        100,
        Math.round((summary.transferredBytes / summary.totalBytes) * 100),
      )
    : 0;
}

function soulseekReleaseStatusLabel(summary: SoulseekReleaseProgressSummary) {
  const progress = soulseekProgressPercent(summary);
  switch (summary.status) {
    case "downloading":
      return `Downloading ${progress}%`;
    case "connecting":
      return "Connecting";
    case "requesting":
      return "Requesting peer";
    case "remotelyQueued":
      return summary.queuePosition
        ? `Peer queue #${summary.queuePosition}`
        : "Waiting in peer queue";
    case "retrying":
      return "Retrying automatically";
    case "paused":
      return "Paused";
    case "completed":
      return "Downloaded";
    case "failed":
      return "Download failed";
    default:
      return "Queued locally";
  }
}

function soulseekReleaseStatusDetail(
  summary: SoulseekReleaseProgressSummary,
  username: string,
  queue: SoulseekTransferQueue,
) {
  const fileProgress = `${summary.completedFiles} of ${summary.fileCount} files complete`;
  const progress = soulseekProgressPercent(summary);
  switch (summary.status) {
    case "downloading":
      return [
        fileProgress,
        `${progress}%`,
        `${formatSoulseekBytes(summary.transferredBytes)} of ${formatSoulseekBytes(summary.totalBytes)}`,
        formatSoulseekSpeed(summary.speedBytesPerSecond),
        summary.etaSeconds === null
          ? null
          : `${formatSoulseekDuration(summary.etaSeconds)} left`,
      ]
        .filter(Boolean)
        .join(" · ");
    case "connecting":
      return `${fileProgress} · ${username} accepted the request; opening the transfer connection`;
    case "requesting":
      return `${fileProgress} · Contacting ${username} and requesting the next file`;
    case "remotelyQueued":
      return `${fileProgress} · Waiting in ${username}'s peer queue${
        summary.queuePosition ? ` at position ${summary.queuePosition}` : ""
      }`;
    case "retrying":
      return `${fileProgress} · A temporary problem occurred; Soulseek is retrying automatically`;
    case "paused":
      return `${fileProgress} · The release is paused`;
    case "completed":
      return `${summary.fileCount} ${summary.fileCount === 1 ? "file" : "files"} downloaded · ${formatSoulseekBytes(summary.totalBytes)}`;
    case "failed":
      return `${summary.failedFiles} of ${summary.fileCount} ${
        summary.fileCount === 1 ? "file" : "files"
      } failed · ${summary.error ?? "Open Soulseek transfers for the failure details."}`;
    default:
      if (queue.safetyState === "pausedForRestart") {
        return `${fileProgress} · Transfers are paused while the app prepares to restart`;
      }
      if (queue.safetyState === "draining") {
        return `${fileProgress} · Waiting while current files finish before restart`;
      }
      return `${fileProgress} · Queued in this app · ${queue.activeCount} of ${queue.maxConcurrentDownloads} transfer slots active`;
  }
}

function SoulseekProgressIcon({ status }: { status: SoulseekTransferStatus }) {
  if (status === "completed") return <CheckCircle2 size={15} aria-hidden="true" />;
  if (status === "failed") return <AlertTriangle size={15} aria-hidden="true" />;
  if (status === "downloading" || status === "connecting" || status === "requesting") {
    return <RefreshCw size={15} className="spin" aria-hidden="true" />;
  }
  if (status === "remotelyQueued") return <RadioTower size={15} aria-hidden="true" />;
  return <Clock3 size={15} aria-hidden="true" />;
}

function SoulseekReleaseProgress({
  summary,
  target,
  username,
  queue,
}: {
  summary: SoulseekReleaseProgressSummary;
  target: SoulseekDownloadTarget;
  username: string;
  queue: SoulseekTransferQueue;
}) {
  const percent = soulseekProgressPercent(summary);
  return (
    <div
      className={`soulseek-release-progress ${summary.status}`}
      role="status"
      aria-label={`Download status for ${target.title} from ${username}`}
    >
      <div className="soulseek-release-progress-heading">
        <div>
          <SoulseekProgressIcon status={summary.status} />
          <strong>{soulseekReleaseStatusLabel(summary)}</strong>
        </div>
        <span>{percent}%</span>
      </div>
      <progress
        aria-label={`${target.title} download progress`}
        max={100}
        value={percent}
      />
      <small>{soulseekReleaseStatusDetail(summary, username, queue)}</small>
    </div>
  );
}

function soulseekTransferStatusDetail(transfer: SoulseekTransfer) {
  const progress = transfer.sizeBytes
    ? Math.min(
        100,
        Math.round((transfer.transferredBytes / transfer.sizeBytes) * 100),
      )
    : 0;
  const filePosition =
    transfer.fileIndex && transfer.fileCount
      ? `File ${transfer.fileIndex} of ${transfer.fileCount} · `
      : "";
  switch (transfer.status) {
    case "downloading":
      return `${filePosition}Downloading ${progress}% · ${transfer.username}${
        transfer.speedBytesPerSecond
          ? ` · ${formatSoulseekSpeed(transfer.speedBytesPerSecond)}`
          : ""
      }${
        transfer.etaSeconds === null
          ? ""
          : ` · ${formatSoulseekDuration(transfer.etaSeconds)} left`
      }`;
    case "connecting":
      return `${filePosition}Connecting to ${transfer.username}`;
    case "requesting":
      return `${filePosition}Requesting the file from ${transfer.username}`;
    case "remotelyQueued":
      return `${filePosition}Waiting in ${transfer.username}'s queue${
        transfer.queuePosition ? ` at position ${transfer.queuePosition}` : ""
      }`;
    case "retrying":
      return `${filePosition}Retrying automatically · ${transfer.username}`;
    case "paused":
      return `${filePosition}Paused · ${transfer.username}`;
    case "completed":
      return `${filePosition}Downloaded · ${transfer.username}`;
    case "failed":
      return `${filePosition}${transfer.error ?? "Download failed"}`;
    default:
      return `${filePosition}Waiting for an app transfer slot · ${transfer.username}`;
  }
}

function SoulseekSourceList({
  candidates,
  notice,
  target,
  transfers,
  transferProgress,
  onDownload,
}: {
  candidates: SoulseekReleaseCandidate[];
  notice: string | null;
  target: SoulseekDownloadTarget;
  transfers: SoulseekTransferQueue | null;
  transferProgress: ReadonlyMap<string, SoulseekReleaseProgressSummary>;
  onDownload: (candidate: SoulseekReleaseCandidate) => void;
}) {
  return (
    <>
      {notice ? (
        <p className="artist-albums-queue-notice" role="status">
          {notice}
        </p>
      ) : null}
      <div className="soulseek-source-list">
        {candidates.map((candidate) => {
          const summary = transferProgress.get(
            soulseekSourceKey(candidate.username, candidate.remoteFolder),
          );
          const statusLabel = summary
            ? soulseekReleaseStatusLabel(summary)
            : "Download release";
          return (
            <article key={candidate.id}>
              <div className="soulseek-source-format">
                <strong>{candidate.format}</strong>
                <span>{candidate.files.length} files</span>
              </div>
              <div className="deemix-match-copy">
                <strong>{candidate.remoteFolder.split(/[\\/]/).pop()}</strong>
                <span>
                  {candidate.username} · {formatSoulseekBytes(candidate.totalSizeBytes)}
                </span>
                <small title={candidate.remoteFolder}>
                  {candidate.slotFree ? "Free upload slot" : `Queue ${candidate.queueLength}`}
                  {` · ${formatSoulseekSpeed(candidate.averageSpeed)}`}
                  {candidate.files[0]?.sampleRate
                    ? ` · ${(candidate.files[0].sampleRate! / 1_000).toFixed(1)} kHz`
                    : ""}
                  {candidate.files[0]?.bitDepth
                    ? ` / ${candidate.files[0].bitDepth}-bit`
                    : ""}
                </small>
              </div>
              <div className="deemix-match-actions">
                <button
                  className={`primary-button deemix-download-button soulseek-transfer-button${
                    summary ? ` ${summary.status}` : ""
                  }`}
                  type="button"
                  disabled={Boolean(summary)}
                  aria-label={
                    summary
                      ? `${statusLabel}: ${target.title} from ${candidate.username}`
                      : `Download ${target.title} from ${candidate.username}`
                  }
                  onClick={() => onDownload(candidate)}
                >
                  {summary ? (
                    <SoulseekProgressIcon status={summary.status} />
                  ) : (
                    <Download size={15} />
                  )}
                  <span>{statusLabel}</span>
                </button>
              </div>
              {summary && transfers ? (
                <SoulseekReleaseProgress
                  summary={summary}
                  target={target}
                  username={candidate.username}
                  queue={transfers}
                />
              ) : null}
            </article>
          );
        })}
      </div>
    </>
  );
}

type DownloadContext = {
  wishListItemId: number | null;
  musicbrainzReleaseGroupId: string | null;
  label: string;
};

type DownloadQueueJob = {
  id: string;
  key: string;
  match: DeemixAlbumMatch;
  context: DownloadContext;
  allowDuplicate: boolean;
  status: "queued" | "downloading" | "complete" | "failed";
  summary: DeemixAlbumDownloadSummary | null;
  error: string | null;
};

type DuplicatePrompt = {
  match: DeemixAlbumMatch;
  context: DownloadContext;
  path: string;
};

function downloadKey(match: DeemixAlbumMatch, context: DownloadContext) {
  return `${context.musicbrainzReleaseGroupId ?? context.wishListItemId ?? "deezer"}:${match.id}`;
}

function missingAlbumLabel(count: number) {
  if (count === 0) return "No albums missing";
  return `${count} ${count === 1 ? "album" : "albums"} missing`;
}

function markSummaryAlbumAcquired(
  summary: WishListArtistAlbumSummary,
  releaseGroupId: string | null,
) {
  if (!releaseGroupId) return summary;
  const missingAlbums = summary.missingAlbums.filter(
    (album) => album.releaseGroupId !== releaseGroupId,
  );
  if (missingAlbums.length === summary.missingAlbums.length) return summary;
  return {
    ...summary,
    ownedAlbumCount: Math.min(
      summary.officialAlbumCount,
      summary.ownedAlbumCount + 1,
    ),
    missingAlbumCount: missingAlbums.length,
    missingAlbums,
  };
}

type MissingAlbumsPopupPosition = {
  placement: "above" | "below";
  left: number;
  top?: number;
  bottom?: number;
  width: number;
  maxHeight: number;
};

const MISSING_POPUP_GAP = 7;
const MISSING_POPUP_MARGIN = 8;
const MISSING_POPUP_MAX_WIDTH = 310;
const MISSING_POPUP_MAX_HEIGHT = 340;

function MissingAlbumsPopover({ item }: { item: WishListItem }) {
  const summary = item.artistAlbumSummary;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<MissingAlbumsPopupPosition | null>(null);
  const popupId = `wish-list-missing-${item.id}`;

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current === null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const openPopup = useCallback(() => {
    cancelClose();
    setIsOpen(true);
  }, [cancelClose]);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      setIsOpen(false);
      closeTimerRef.current = null;
    }, 80);
  }, [cancelClose]);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger || !summary) return;

    const bounds = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(
      MISSING_POPUP_MAX_WIDTH,
      Math.max(0, viewportWidth - MISSING_POPUP_MARGIN * 2),
    );
    const maxLeft = Math.max(
      MISSING_POPUP_MARGIN,
      viewportWidth - MISSING_POPUP_MARGIN - width,
    );
    const left = Math.min(
      maxLeft,
      Math.max(MISSING_POPUP_MARGIN, bounds.right - width),
    );
    const spaceAbove = Math.max(
      0,
      bounds.top - MISSING_POPUP_GAP - MISSING_POPUP_MARGIN,
    );
    const spaceBelow = Math.max(
      0,
      viewportHeight - bounds.bottom - MISSING_POPUP_GAP - MISSING_POPUP_MARGIN,
    );
    const estimatedHeight = Math.min(
      MISSING_POPUP_MAX_HEIGHT,
      61 + Math.max(1, summary.missingAlbums.length) * 28,
    );
    const placement =
      spaceBelow < estimatedHeight && spaceAbove > spaceBelow ? "above" : "below";
    const maxHeight = Math.min(
      MISSING_POPUP_MAX_HEIGHT,
      placement === "above" ? spaceAbove : spaceBelow,
    );

    setPosition({
      placement,
      left,
      width,
      maxHeight,
      ...(placement === "above"
        ? { bottom: viewportHeight - bounds.top + MISSING_POPUP_GAP }
        : { top: bounds.bottom + MISSING_POPUP_GAP }),
    });
  }, [summary]);

  useLayoutEffect(() => {
    if (!isOpen) {
      setPosition(null);
      return;
    }
    updatePosition();
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || popupRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setIsOpen(false);
      triggerRef.current?.focus();
    };

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen, updatePosition]);

  useEffect(() => () => cancelClose(), [cancelClose]);

  if (!summary) return null;

  const popup = isOpen && position ? (
    <div
      className={`wish-list-missing-popup ${position.placement}`}
      id={popupId}
      ref={popupRef}
      role="tooltip"
      data-placement={position.placement}
      style={{
        left: position.left,
        top: position.top,
        bottom: position.bottom,
        width: position.width,
        maxHeight: position.maxHeight,
      }}
      onMouseEnter={openPopup}
      onMouseLeave={scheduleClose}
    >
      <div>
        <strong>{missingAlbumLabel(summary.missingAlbumCount)}</strong>
        <span>
          {summary.ownedAlbumCount} of {summary.officialAlbumCount} official albums acquired
        </span>
      </div>
      {summary.missingAlbums.length ? (
        <ol>
          {summary.missingAlbums.map((album) => (
            <li key={album.releaseGroupId}>
              <span>{album.title}</span>
              <small>{album.year ?? "Year unknown"}</small>
            </li>
          ))}
        </ol>
      ) : (
        <p>Your collection contains every official album currently listed by MusicBrainz.</p>
      )}
    </div>
  ) : null;

  return (
    <div
      className="wish-list-missing-popover"
      onMouseEnter={openPopup}
      onMouseLeave={scheduleClose}
    >
      <button
        className="icon-button wish-list-missing-trigger"
        ref={triggerRef}
        type="button"
        aria-label={`Show ${missingAlbumLabel(summary.missingAlbumCount)} for ${item.title}`}
        aria-describedby={isOpen ? popupId : undefined}
        aria-expanded={isOpen}
        title="Show missing albums"
        onClick={openPopup}
        onFocus={openPopup}
        onBlur={scheduleClose}
      >
        <Eye size={16} aria-hidden="true" />
      </button>
      {popup ? createPortal(popup, document.body) : null}
    </div>
  );
}

function WishListGroup({
  entity,
  items,
  onOpen,
  onRemove,
  onSearchAlbum,
  onSearchSoulseek,
  onDiscoverArtist,
  searchingId,
  soulseekSearchingId,
  checkingArtistIds,
  artistSummaryErrors,
}: {
  entity: WishListEntity;
  items: WishListItem[];
  onOpen: (item: WishListItem) => void;
  onRemove: (item: WishListItem) => void;
  onSearchAlbum: (item: WishListItem) => void;
  onSearchSoulseek: (item: WishListItem) => void;
  onDiscoverArtist: (item: WishListItem) => void;
  searchingId: number | null;
  soulseekSearchingId: number | null;
  checkingArtistIds: ReadonlySet<number>;
  artistSummaryErrors: Readonly<Record<number, string>>;
}) {
  const isArtist = entity === "artist";
  const Icon = isArtist ? UsersRound : Album;
  const heading = isArtist ? "Artists" : "Albums";
  const emptyCopy = isArtist
    ? "Artists added from Luna discovery will appear here."
    : "Missing MusicBrainz albums and Luna discoveries will appear here.";

  return (
    <section
      className={`wish-list-group ${entity}`}
      aria-labelledby={`wish-list-${entity}-heading`}
    >
      <header>
        <div>
          <span className={`wish-list-group-icon ${entity}`}>
            <Icon size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 id={`wish-list-${entity}-heading`}>{heading}</h2>
            <p>{items.length} {isArtist ? "tracking" : "waiting"}</p>
          </div>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="wish-list-empty">
          <Heart size={21} aria-hidden="true" />
          <strong>No {heading.toLowerCase()} on the list</strong>
          <span>{emptyCopy}</span>
        </div>
      ) : (
        <div className="wish-list-items">
          {items.map((item) => (
            <article key={item.id}>
              <span className="wish-list-item-mark">
                <Icon size={17} aria-hidden="true" />
              </span>
              <div className="wish-list-item-copy">
                <strong>{item.title}</strong>
                <span>
                  {isArtist ? "Artist" : item.artist}
                  {item.year ? ` · ${item.year}` : ""}
                </span>
                <small>Added from {item.source}</small>
                {isArtist && item.artistAlbumSummary ? (
                  <span
                    className={`wish-list-missing-summary ${item.artistAlbumSummary.missingAlbumCount === 0 ? "complete" : ""}`}
                  >
                    {missingAlbumLabel(item.artistAlbumSummary.missingAlbumCount)}
                  </span>
                ) : isArtist && checkingArtistIds.has(item.id) ? (
                  <span className="wish-list-missing-summary loading">
                    <RefreshCw size={11} className="spin" aria-hidden="true" />
                    Checking albums…
                  </span>
                ) : isArtist && artistSummaryErrors[item.id] ? (
                  <span
                    className="wish-list-missing-summary error"
                    title={artistSummaryErrors[item.id]}
                  >
                    Album check unavailable
                  </span>
                ) : isArtist && !item.musicbrainzId ? (
                  <span
                    className="wish-list-missing-summary error"
                    title="Add a MusicBrainz artist ID before checking the official discography."
                  >
                    MusicBrainz ID needed
                  </span>
                ) : null}
                {!isArtist && item.downloadedAt ? (
                  <span
                    className="wish-list-downloaded-badge"
                    title={item.downloadedPath ?? "Downloaded with Deemix"}
                  >
                    <CheckCircle2 size={13} aria-hidden="true" />
                    Downloaded
                  </span>
                ) : null}
              </div>
              <div className="wish-list-item-actions">
                {isArtist && item.artistAlbumSummary ? (
                  <MissingAlbumsPopover item={item} />
                ) : null}
                <button
                  className="icon-button"
                  type="button"
                  title={
                    isArtist
                      ? "Find official albums with MusicBrainz, Deemix, and Soulseek"
                      : "Search with Deemix"
                  }
                  aria-label={
                    isArtist
                      ? `Search ${item.title} official albums with Deemix and Soulseek`
                      : `Search ${item.title} with Deemix`
                  }
                  disabled={searchingId !== null || (isArtist && !item.musicbrainzId)}
                  onClick={() =>
                    isArtist ? onDiscoverArtist(item) : onSearchAlbum(item)
                  }
                >
                  <Search size={16} className={searchingId === item.id ? "spin" : ""} />
                </button>
                {!isArtist ? (
                  <button
                    className="icon-button soulseek-search-button"
                    type="button"
                    title="Search with Soulseek"
                    aria-label={`Search ${item.title} with Soulseek`}
                    disabled={soulseekSearchingId !== null}
                    onClick={() => onSearchSoulseek(item)}
                  >
                    <RadioTower
                      size={16}
                      className={soulseekSearchingId === item.id ? "spin" : ""}
                    />
                  </button>
                ) : null}
                {item.musicbrainzUrl ? (
                  <button
                    className="icon-button"
                    type="button"
                    title="Open in MusicBrainz"
                    aria-label={`Open ${item.title} in MusicBrainz`}
                    onClick={() => onOpen(item)}
                  >
                    <ExternalLink size={16} />
                  </button>
                ) : null}
                <button
                  className="icon-button"
                  type="button"
                  title="Remove from Wish List"
                  aria-label={`Remove ${item.title} from Wish List`}
                  onClick={() => onRemove(item)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function MatchBadge({ match }: { match: DeemixAlbumMatch }) {
  return (
    <span
      className={`deemix-match-badge ${match.matchLevel}`}
      title={`${match.matchScore}% metadata match`}
    >
      {match.matchLevel === "exact" ? (
        <CheckCircle2 size={15} aria-hidden="true" />
      ) : (
        <Search size={15} aria-hidden="true" />
      )}
      {match.matchLevel}
    </span>
  );
}

export function WishListWorkspace() {
  const [items, setItems] = useState<WishListItem[]>([]);
  const [autoRemovedCount, setAutoRemovedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [searchingId, setSearchingId] = useState<number | null>(null);
  const [searchedItem, setSearchedItem] = useState<WishListItem | null>(null);
  const [deemixResults, setDeemixResults] =
    useState<DeemixAlbumSearchResponse | null>(null);
  const [soulseekSearchedItem, setSoulseekSearchedItem] =
    useState<WishListItem | null>(null);
  const [soulseekSearchingId, setSoulseekSearchingId] =
    useState<number | null>(null);
  const [soulseekResults, setSoulseekResults] =
    useState<SoulseekAlbumSearchResponse | null>(null);
  const [soulseekTransfers, setSoulseekTransfers] =
    useState<SoulseekTransferQueue | null>(null);
  const [isClearingSoulseekTransfers, setIsClearingSoulseekTransfers] =
    useState(false);
  const [soulseekNotice, setSoulseekNotice] = useState<string | null>(null);
  const [artistDiscovery, setArtistDiscovery] =
    useState<WishListArtistAlbumDiscoveryResponse | null>(null);
  const [artistSoulseekSearches, setArtistSoulseekSearches] = useState<
    Record<string, ArtistSoulseekSearchEntry>
  >({});
  const artistSoulseekGeneration = useRef(0);
  const [checkingArtistIds, setCheckingArtistIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [artistSummaryErrors, setArtistSummaryErrors] = useState<
    Record<number, string>
  >({});
  const artistSummaryGeneration = useRef(0);
  const [isQueueingAll, setIsQueueingAll] = useState(false);
  const [queueNotice, setQueueNotice] = useState<string | null>(null);
  const [downloadQueue, setDownloadQueue] = useState<DownloadQueueJob[]>([]);
  const downloadQueueRef = useRef<DownloadQueueJob[]>([]);
  const isProcessingQueue = useRef(false);
  const [downloadProgress, setDownloadProgress] =
    useState<DeemixAlbumDownloadProgress | null>(null);
  const [downloadSummary, setDownloadSummary] =
    useState<DeemixAlbumDownloadSummary | null>(null);
  const [duplicatePrompt, setDuplicatePrompt] = useState<DuplicatePrompt | null>(null);
  const activeDownloadRequest = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [addEntity, setAddEntity] = useState<WishListEntity>("artist");
  const [addQuery, setAddQuery] = useState("");
  const [musicbrainzSearch, setMusicbrainzSearch] =
    useState<WishListMusicBrainzSearchResponse | null>(null);
  const [isSearchingMusicbrainz, setIsSearchingMusicbrainz] = useState(false);
  const [addingCandidateId, setAddingCandidateId] = useState<string | null>(null);
  const [addNotice, setAddNotice] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  const replaceQueue = useCallback(
    (update: (previous: DownloadQueueJob[]) => DownloadQueueJob[]) => {
      const next = update(downloadQueueRef.current);
      downloadQueueRef.current = next;
      setDownloadQueue(next);
    },
    [],
  );

  const refreshMissingArtistSummaries = useCallback(
    async (sourceItems: WishListItem[], generation: number) => {
      const artists = sourceItems.filter(
        (item) =>
          item.entity === "artist" &&
          item.musicbrainzId &&
          !item.artistAlbumSummary,
      );
      setCheckingArtistIds(new Set(artists.map((item) => item.id)));
      setArtistSummaryErrors({});
      for (const artist of artists) {
        try {
          const summary = await refreshWishListArtistAlbumSummary(artist.id);
          if (artistSummaryGeneration.current !== generation) return;
          setItems((previous) =>
            previous.map((item) =>
              item.id === artist.id
                ? { ...item, artistAlbumSummary: summary }
                : item,
            ),
          );
        } catch (summaryError) {
          if (artistSummaryGeneration.current !== generation) return;
          const message =
            summaryError instanceof Error
              ? summaryError.message
              : String(summaryError);
          setArtistSummaryErrors((previous) => ({
            ...previous,
            [artist.id]: message,
          }));
        } finally {
          if (artistSummaryGeneration.current === generation) {
            setCheckingArtistIds((previous) => {
              const next = new Set(previous);
              next.delete(artist.id);
              return next;
            });
          }
        }
      }
    },
    [],
  );

  const load = useCallback(async () => {
    const summaryGeneration = artistSummaryGeneration.current + 1;
    artistSummaryGeneration.current = summaryGeneration;
    setIsLoading(true);
    setError(null);
    try {
      const response = await listWishList();
      setItems(response.items);
      setAutoRemovedCount(response.autoRemovedCount);
      void refreshMissingArtistSummaries(response.items, summaryGeneration);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [refreshMissingArtistSummaries]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listenToDeemixDownloadProgress((progress) => {
      if (progress.requestId === activeDownloadRequest.current) {
        setDownloadProgress(progress);
      }
    }).then((nextUnlisten) => {
      if (disposed) nextUnlisten();
      else unlisten = nextUnlisten;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getSoulseekTransfers()
      .then((snapshot) => {
        if (!disposed) setSoulseekTransfers(snapshot);
      })
      .catch(() => undefined);
    void listenToSoulseekTransfers((snapshot) => {
      if (!disposed) setSoulseekTransfers(snapshot);
    }).then((nextUnlisten) => {
      if (disposed) nextUnlisten();
      else unlisten = nextUnlisten;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const grouped = useMemo(
    () => ({
      artists: items.filter((item) => item.entity === "artist"),
      albums: items.filter((item) => item.entity === "album"),
    }),
    [items],
  );

  const soulseekCandidates = useMemo(
    () => soulseekReleaseCandidates(soulseekResults),
    [soulseekResults],
  );
  const soulseekTransferProgress = useMemo(
    () => buildSoulseekReleaseProgress(soulseekTransfers),
    [soulseekTransfers],
  );
  const clearableSoulseekTransfers = useMemo(
    () => clearableSoulseekTransferCount(soulseekTransfers),
    [soulseekTransfers],
  );
  const artistSoulseekCandidates = useMemo(() => {
    const candidates = new Map<string, SoulseekReleaseCandidate[]>();
    for (const [releaseGroupId, search] of Object.entries(
      artistSoulseekSearches,
    )) {
      candidates.set(releaseGroupId, soulseekReleaseCandidates(search.response));
    }
    return candidates;
  }, [artistSoulseekSearches]);
  const artistSoulseekBatchBusy = useMemo(
    () =>
      Object.values(artistSoulseekSearches).some(
        (search) => search.status === "queued" || search.status === "searching",
      ),
    [artistSoulseekSearches],
  );

  const queueCounts = useMemo(
    () => ({
      queued: downloadQueue.filter((job) => job.status === "queued").length,
      complete: downloadQueue.filter((job) => job.status === "complete").length,
      failed: downloadQueue.filter((job) => job.status === "failed").length,
    }),
    [downloadQueue],
  );

  function markDownloaded(
    albumId: string,
    context: DownloadContext,
    destinationPath: string,
    downloadedAt: string,
  ) {
    setItems((previous) =>
      previous.map((item) => {
        if (item.id !== context.wishListItemId) return item;
        if (item.entity === "album") {
          return {
            ...item,
            downloadedDeezerAlbumId: albumId,
            downloadedPath: destinationPath,
            downloadedAt,
          };
        }
        if (item.entity === "artist" && item.artistAlbumSummary) {
          return {
            ...item,
            artistAlbumSummary: markSummaryAlbumAcquired(
              item.artistAlbumSummary,
              context.musicbrainzReleaseGroupId,
            ),
          };
        }
        return item;
      }),
    );
    setDeemixResults((previous) =>
      previous
        ? {
            ...previous,
            matches: previous.matches.map((match) =>
              match.id === albumId
                ? {
                    ...match,
                    downloadedAt,
                    downloadedPath: destinationPath,
                  }
                : match,
            ),
          }
        : previous,
    );
    setArtistDiscovery((previous) =>
      previous
        ? {
            ...previous,
            albums: previous.albums.map((album) =>
              album.releaseGroupId === context.musicbrainzReleaseGroupId
                ? {
                    ...album,
                    downloadedDeezerAlbumId: albumId,
                    downloadedPath: destinationPath,
                    downloadedAt,
                    deemixMatches: album.deemixMatches.map((match) =>
                      match.id === albumId
                        ? {
                            ...match,
                            downloadedAt,
                            downloadedPath: destinationPath,
                          }
                        : match,
                    ),
                  }
                : album,
            ),
            albumSummary: markSummaryAlbumAcquired(
              previous.albumSummary,
              context.musicbrainzReleaseGroupId,
            ),
          }
        : previous,
    );
  }

  function applyCompletedDownload(
    job: DownloadQueueJob,
    summary: DeemixAlbumDownloadSummary,
  ) {
    markDownloaded(
      summary.albumId,
      job.context,
      summary.destinationPath,
      summary.completedAt,
    );
  }

  async function processDownloadQueue() {
    if (isProcessingQueue.current) return;
    isProcessingQueue.current = true;
    try {
      while (true) {
        const next = downloadQueueRef.current.find((job) => job.status === "queued");
        if (!next) break;
        const requestId =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `download-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        activeDownloadRequest.current = requestId;
        setDownloadSummary(null);
        setDownloadProgress({
          requestId,
          albumId: next.match.id,
          phase: "metadata",
          message: `Preparing ${next.match.title}…`,
          currentTrack: null,
          completedTracks: 0,
          totalTracks: next.match.trackCount ?? 0,
        });
        replaceQueue((previous) =>
          previous.map((job) =>
            job.id === next.id ? { ...job, status: "downloading" } : job,
          ),
        );
        try {
          const summary = await downloadDeemixAlbum({
            albumId: next.match.id,
            requestId,
            wishListItemId: next.context.wishListItemId,
            musicbrainzReleaseGroupId: next.context.musicbrainzReleaseGroupId,
            expectedArtist: next.match.artist,
            expectedAlbum: next.match.title,
            expectedYear: next.match.year,
            allowDuplicate: next.allowDuplicate,
          });
          replaceQueue((previous) =>
            previous.map((job) =>
              job.id === next.id
                ? { ...job, status: "complete", summary, error: null }
                : job,
            ),
          );
          applyCompletedDownload(next, summary);
          setDownloadSummary(summary);
        } catch (downloadError) {
          const message =
            downloadError instanceof Error
              ? downloadError.message
              : String(downloadError);
          replaceQueue((previous) =>
            previous.map((job) =>
              job.id === next.id
                ? { ...job, status: "failed", error: message }
                : job,
            ),
          );
          setError(message);
        } finally {
          activeDownloadRequest.current = null;
          setDownloadProgress(null);
        }
      }
    } finally {
      isProcessingQueue.current = false;
    }
  }

  function enqueueDownload(
    match: DeemixAlbumMatch,
    context: DownloadContext,
    allowDuplicate: boolean,
  ) {
    const key = downloadKey(match, context);
    if (
      downloadQueueRef.current.some(
        (job) =>
          job.key === key && (job.status === "queued" || job.status === "downloading"),
      )
    ) {
      return false;
    }
    const job: DownloadQueueJob = {
      id: `${key}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      key,
      match,
      context,
      allowDuplicate,
      status: "queued",
      summary: null,
      error: null,
    };
    replaceQueue((previous) => [...previous, job]);
    void processDownloadQueue();
    return true;
  }

  async function requestDownload(
    match: DeemixAlbumMatch,
    context: DownloadContext,
    showDuplicatePrompt = true,
  ) {
    setError(null);
    try {
      const preflight = await preflightDeemixAlbumDownload({
        albumId: match.id,
        wishListItemId: context.wishListItemId,
        musicbrainzReleaseGroupId: context.musicbrainzReleaseGroupId,
        artist: match.artist,
        album: match.title,
        year: match.year,
      });
      if (preflight.alreadyDownloaded) {
        markDownloaded(
          match.id,
          context,
          preflight.destinationPath ?? "the configured download folder",
          preflight.downloadedAt ?? new Date().toISOString(),
        );
        if (showDuplicatePrompt) {
          setDuplicatePrompt({
            match,
            context,
            path: preflight.destinationPath ?? "the configured download folder",
          });
        }
        return "duplicate" as const;
      }
      return enqueueDownload(match, context, false)
        ? ("queued" as const)
        : ("alreadyQueued" as const);
    } catch (preflightError) {
      setError(
        preflightError instanceof Error
          ? preflightError.message
          : String(preflightError),
      );
      return "failed" as const;
    }
  }

  function jobStatus(match: DeemixAlbumMatch, context: DownloadContext) {
    const key = downloadKey(match, context);
    const matchingJobs = downloadQueue.filter((job) => job.key === key);
    return matchingJobs.length
      ? matchingJobs[matchingJobs.length - 1].status
      : null;
  }

  async function removeItem(item: WishListItem) {
    setError(null);
    try {
      await removeWishListItem(item.id);
      setItems((previous) => previous.filter((entry) => entry.id !== item.id));
      if (searchedItem?.id === item.id) {
        setSearchedItem(null);
        setDeemixResults(null);
      }
      if (soulseekSearchedItem?.id === item.id) {
        setSoulseekSearchedItem(null);
        setSoulseekResults(null);
      }
      if (artistDiscovery?.wishListItemId === item.id) {
        artistSoulseekGeneration.current += 1;
        setArtistDiscovery(null);
        setArtistSoulseekSearches({});
      }
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : String(removeError));
    }
  }

  async function searchItemWithDeemix(item: WishListItem) {
    if (item.entity !== "album") return;
    setSearchingId(item.id);
    setSearchedItem(item);
    setDeemixResults(null);
    artistSoulseekGeneration.current += 1;
    setArtistDiscovery(null);
    setArtistSoulseekSearches({});
    setQueueNotice(null);
    setError(null);
    try {
      const response = await searchDeemixAlbums({
        title: item.title,
        artist: item.artist,
        year: item.year,
        limit: 8,
      });
      setDeemixResults(response);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : String(searchError));
    } finally {
      setSearchingId(null);
    }
  }

  async function searchItemWithSoulseek(item: WishListItem) {
    if (item.entity !== "album") return;
    setSoulseekSearchingId(item.id);
    setSoulseekSearchedItem(item);
    setSoulseekResults(null);
    setSoulseekNotice(null);
    setError(null);
    try {
      const response = await searchSoulseekAlbum({
        title: item.title,
        artist: item.artist,
        year: item.year,
      });
      setSoulseekResults(response);
    } catch (searchError) {
      setError(
        searchError instanceof Error ? searchError.message : String(searchError),
      );
    } finally {
      setSoulseekSearchingId(null);
    }
  }

  async function downloadSoulseekRelease(candidate: SoulseekReleaseCandidate) {
    if (!soulseekSearchedItem) return;
    setError(null);
    setSoulseekNotice(null);
    try {
      const notice = await queueSoulseekRelease(
        {
          artist: soulseekSearchedItem.artist,
          title: soulseekSearchedItem.title,
          year: soulseekSearchedItem.year,
          releaseGroupId: soulseekSearchedItem.musicbrainzId,
        },
        candidate,
      );
      setSoulseekNotice(notice);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : String(downloadError),
      );
    }
  }

  async function queueSoulseekRelease(
    target: SoulseekDownloadTarget,
    candidate: SoulseekReleaseCandidate,
  ) {
    const snapshot = await enqueueSoulseekRelease({
      title: `${target.artist} - ${target.title}${
        target.year ? ` (${target.year})` : ""
      }`,
      username: candidate.username,
      remoteFolder: candidate.remoteFolder,
      files: candidate.files.map((file) => ({
        title: remoteTitle(file.filename),
        remoteFilename: file.filename,
        sizeBytes: file.sizeBytes,
      })),
      expectedTrackCount: candidate.files.length,
      releaseGroupId: target.releaseGroupId,
      alternatives: [],
    });
    setSoulseekTransfers(snapshot);
    return `${candidate.files.length} ${candidate.files.length === 1 ? "file" : "files"} queued from ${candidate.username}.`;
  }

  async function clearCompletedSoulseekDownloads() {
    setIsClearingSoulseekTransfers(true);
    setError(null);
    try {
      setSoulseekTransfers(await clearCompletedSoulseekTransfers());
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : String(clearError));
    } finally {
      setIsClearingSoulseekTransfers(false);
    }
  }

  async function runArtistSoulseekSearch(
    artist: string,
    album: WishListArtistAlbumDiscoveryRow,
    generation: number,
  ) {
    if (artistSoulseekGeneration.current !== generation) return;
    setArtistSoulseekSearches((previous) => ({
      ...previous,
      [album.releaseGroupId]: {
        status: "searching",
        response: null,
        error: null,
        notice: null,
      },
    }));
    try {
      const response = await searchSoulseekAlbum({
        title: album.title,
        artist,
        year: album.year,
      });
      if (artistSoulseekGeneration.current !== generation) return;
      setArtistSoulseekSearches((previous) => ({
        ...previous,
        [album.releaseGroupId]: {
          status: "complete",
          response,
          error: null,
          notice: previous[album.releaseGroupId]?.notice ?? null,
        },
      }));
    } catch (searchError) {
      if (artistSoulseekGeneration.current !== generation) return;
      setArtistSoulseekSearches((previous) => ({
        ...previous,
        [album.releaseGroupId]: {
          status: "error",
          response: null,
          error:
            searchError instanceof Error
              ? searchError.message
              : String(searchError),
          notice: null,
        },
      }));
    }
  }

  async function searchArtistAlbumsWithSoulseek(
    discovery: WishListArtistAlbumDiscoveryResponse,
    generation: number,
  ) {
    const missingAlbums = discovery.albums.filter(
      (album) => !album.inLibrary && !album.downloadedAt,
    );
    if (artistSoulseekGeneration.current !== generation) return;
    setArtistSoulseekSearches(
      Object.fromEntries(
        missingAlbums.map((album) => [
          album.releaseGroupId,
          {
            status: "queued",
            response: null,
            error: null,
            notice: null,
          } satisfies ArtistSoulseekSearchEntry,
        ]),
      ),
    );
    let nextIndex = 0;
    async function worker() {
      while (
        nextIndex < missingAlbums.length &&
        artistSoulseekGeneration.current === generation
      ) {
        const album = missingAlbums[nextIndex];
        nextIndex += 1;
        await runArtistSoulseekSearch(discovery.artist, album, generation);
      }
    }
    await Promise.all(
      Array.from(
        {
          length: Math.min(
            ARTIST_SOULSEEK_SEARCH_CONCURRENCY,
            missingAlbums.length,
          ),
        },
        () => worker(),
      ),
    );
  }

  async function retryArtistSoulseekSearch(
    album: WishListArtistAlbumDiscoveryRow,
  ) {
    if (!artistDiscovery) return;
    await runArtistSoulseekSearch(
      artistDiscovery.artist,
      album,
      artistSoulseekGeneration.current,
    );
  }

  async function downloadArtistSoulseekRelease(
    album: WishListArtistAlbumDiscoveryRow,
    candidate: SoulseekReleaseCandidate,
  ) {
    if (!artistDiscovery) return;
    setError(null);
    setArtistSoulseekSearches((previous) => ({
      ...previous,
      [album.releaseGroupId]: {
        ...previous[album.releaseGroupId],
        notice: null,
      },
    }));
    try {
      const notice = await queueSoulseekRelease(
        {
          artist: artistDiscovery.artist,
          title: album.title,
          year: album.year,
          releaseGroupId: album.releaseGroupId,
        },
        candidate,
      );
      setArtistSoulseekSearches((previous) => ({
        ...previous,
        [album.releaseGroupId]: {
          ...previous[album.releaseGroupId],
          notice,
        },
      }));
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : String(downloadError),
      );
    }
  }

  async function discoverArtist(item: WishListItem) {
    if (item.entity !== "artist") return;
    const generation = artistSoulseekGeneration.current + 1;
    artistSoulseekGeneration.current = generation;
    setSearchingId(item.id);
    setSearchedItem(null);
    setDeemixResults(null);
    setArtistDiscovery(null);
    setArtistSoulseekSearches({});
    setQueueNotice(null);
    setError(null);
    try {
      const response = await discoverWishListArtistAlbums(item.id);
      if (artistSoulseekGeneration.current !== generation) return;
      setArtistDiscovery(response);
      void searchArtistAlbumsWithSoulseek(response, generation);
      setItems((previous) =>
        previous.map((entry) =>
          entry.id === item.id
            ? { ...entry, artistAlbumSummary: response.albumSummary }
            : entry,
        ),
      );
    } catch (discoveryError) {
      setError(
        discoveryError instanceof Error
          ? discoveryError.message
          : String(discoveryError),
      );
    } finally {
      setSearchingId(null);
    }
  }

  async function downloadAllArtistAlbums() {
    if (!artistDiscovery || isQueueingAll) return;
    setIsQueueingAll(true);
    setQueueNotice(null);
    setError(null);
    let queued = 0;
    let skippedDownloaded = 0;
    let skippedUnmatched = 0;
    try {
      for (const album of artistDiscovery.albums) {
        const match = album.deemixMatches[0];
        if (!match) {
          skippedUnmatched += 1;
          continue;
        }
        if (album.downloadedAt || album.inLibrary) {
          skippedDownloaded += 1;
          continue;
        }
        const result = await requestDownload(
          match,
          {
            wishListItemId: artistDiscovery.wishListItemId,
            musicbrainzReleaseGroupId: album.releaseGroupId,
            label: album.title,
          },
          false,
        );
        if (result === "queued") queued += 1;
        else if (result === "duplicate") skippedDownloaded += 1;
      }
      setQueueNotice(
        `${queued} ${queued === 1 ? "album" : "albums"} added to the queue` +
          `${skippedDownloaded ? ` · ${skippedDownloaded} already acquired` : ""}` +
          `${skippedUnmatched ? ` · ${skippedUnmatched} without a Deezer match` : ""}.`,
      );
    } catch (queueError) {
      setError(queueError instanceof Error ? queueError.message : String(queueError));
    } finally {
      setIsQueueingAll(false);
    }
  }

  async function searchMusicbrainzForAddition() {
    const query = addQuery.trim();
    if (query.length < 2 || isSearchingMusicbrainz) return;
    setIsSearchingMusicbrainz(true);
    setMusicbrainzSearch(null);
    setAddNotice(null);
    setAddError(null);
    try {
      const response = await searchWishListMusicBrainz({
        entity: addEntity,
        query,
      });
      setMusicbrainzSearch(response);
    } catch (searchError) {
      setAddError(
        searchError instanceof Error ? searchError.message : String(searchError),
      );
    } finally {
      setIsSearchingMusicbrainz(false);
    }
  }

  async function addMusicbrainzCandidate(
    candidate: WishListMusicBrainzCandidate,
  ) {
    if (addingCandidateId) return;
    setAddingCandidateId(candidate.musicbrainzId);
    setAddNotice(null);
    setAddError(null);
    try {
      const response = await addWishListMusicBrainzCandidate(candidate);
      const addedItem = response.item;
      if (addedItem) {
        setItems((previous) => [
          addedItem,
          ...previous.filter((item) => item.id !== addedItem.id),
        ]);
      }
      setAddNotice(response.message);
    } catch (addCandidateError) {
      setAddError(
        addCandidateError instanceof Error
          ? addCandidateError.message
          : String(addCandidateError),
      );
    } finally {
      setAddingCandidateId(null);
    }
  }

  async function openUrl(url: string) {
    setError(null);
    try {
      await openExternalUrl(url);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : String(openError));
    }
  }

  return (
    <section className="workspace wish-list-workspace">
      <header className="topbar">
        <div>
          <h1>Wish List</h1>
          <p>Keep track of the artists and albums you want to add to your collection.</p>
        </div>
        <div className="topbar-actions">
          <button
            className="primary-button wish-list-add-toggle"
            type="button"
            aria-expanded={showAddPanel}
            aria-controls="wish-list-add-panel"
            onClick={() => {
              setShowAddPanel((visible) => !visible);
              setAddError(null);
            }}
          >
            <Plus size={16} aria-hidden="true" />
            <span>Add artist or album</span>
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="Refresh Wish List"
            title="Refresh Wish List"
            disabled={isLoading || checkingArtistIds.size > 0}
            onClick={() => void load()}
          >
            <RefreshCw
              size={18}
              className={isLoading || checkingArtistIds.size > 0 ? "spin" : ""}
            />
          </button>
        </div>
      </header>

      {showAddPanel ? (
        <section className="wish-list-add-panel" id="wish-list-add-panel">
          <header>
            <div>
              <span className="wish-list-add-icon">
                <Search size={18} aria-hidden="true" />
              </span>
              <div>
                <h2>Add to Wish List</h2>
                <p>Search MusicBrainz first so the artist or album is verified.</p>
              </div>
            </div>
            <button
              className="icon-button"
              type="button"
              aria-label="Close Add to Wish List"
              title="Close"
              onClick={() => setShowAddPanel(false)}
            >
              <X size={16} />
            </button>
          </header>
          <form
            className="wish-list-add-form"
            onSubmit={(event) => {
              event.preventDefault();
              void searchMusicbrainzForAddition();
            }}
          >
            <div className="wish-list-add-kind" role="group" aria-label="Wish List item type">
              {(["artist", "album"] as const).map((entity) => (
                <button
                  key={entity}
                  className={addEntity === entity ? "active" : ""}
                  type="button"
                  aria-pressed={addEntity === entity}
                  onClick={() => {
                    setAddEntity(entity);
                    setMusicbrainzSearch(null);
                    setAddNotice(null);
                    setAddError(null);
                  }}
                >
                  {entity === "artist" ? (
                    <UsersRound size={15} aria-hidden="true" />
                  ) : (
                    <Album size={15} aria-hidden="true" />
                  )}
                  {entity === "artist" ? "Artist" : "Album"}
                </button>
              ))}
            </div>
            <label>
              <span>{addEntity === "artist" ? "Artist name" : "Album title"}</span>
              <input
                type="search"
                value={addQuery}
                maxLength={200}
                autoComplete="off"
                placeholder={
                  addEntity === "artist"
                    ? "For example, Engine Alley"
                    : "For example, Release"
                }
                onChange={(event) => setAddQuery(event.target.value)}
              />
            </label>
            <button
              className="primary-button"
              type="submit"
              disabled={addQuery.trim().length < 2 || isSearchingMusicbrainz}
            >
              {isSearchingMusicbrainz ? (
                <RefreshCw size={15} className="spin" aria-hidden="true" />
              ) : (
                <Search size={15} aria-hidden="true" />
              )}
              <span>{isSearchingMusicbrainz ? "Searching" : "Search MusicBrainz"}</span>
            </button>
          </form>
          {addEntity === "artist" ? (
            <p className="wish-list-add-help">
              Before adding an artist, the app checks official album releases against your library and completed downloads. Artists with nothing missing are not added.
            </p>
          ) : null}
          {addError ? <p className="error-message">{addError}</p> : null}
          {addNotice ? (
            <p className="wish-list-add-notice" role="status">
              <CheckCircle2 size={16} aria-hidden="true" />
              {addNotice}
            </p>
          ) : null}
          {musicbrainzSearch ? (
            musicbrainzSearch.candidates.length ? (
              <div className="wish-list-musicbrainz-results" aria-live="polite">
                {musicbrainzSearch.candidates.map((candidate) => (
                  <article key={candidate.musicbrainzId}>
                    <span className="wish-list-item-mark">
                      {candidate.entity === "artist" ? (
                        <UsersRound size={17} aria-hidden="true" />
                      ) : (
                        <Album size={17} aria-hidden="true" />
                      )}
                    </span>
                    <div>
                      <strong>{candidate.title}</strong>
                      <span>
                        {candidate.entity === "artist"
                          ? [candidate.country, candidate.disambiguation]
                              .filter(Boolean)
                              .join(" · ") || "Artist"
                          : `${candidate.artist}${candidate.year ? ` · ${candidate.year}` : ""}`}
                      </span>
                      <small>{candidate.score}% MusicBrainz match</small>
                    </div>
                    <div className="wish-list-musicbrainz-actions">
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => void openUrl(candidate.musicbrainzUrl)}
                      >
                        <ExternalLink size={14} aria-hidden="true" />
                        MusicBrainz
                      </button>
                      <button
                        className="primary-button"
                        type="button"
                        disabled={addingCandidateId !== null}
                        aria-label={`Add ${candidate.title} to Wish List`}
                        onClick={() => void addMusicbrainzCandidate(candidate)}
                      >
                        {addingCandidateId === candidate.musicbrainzId ? (
                          <RefreshCw size={15} className="spin" aria-hidden="true" />
                        ) : (
                          <Plus size={15} aria-hidden="true" />
                        )}
                        {addingCandidateId === candidate.musicbrainzId
                          ? candidate.entity === "artist"
                            ? "Checking albums"
                            : "Adding"
                          : `Add ${candidate.entity}`}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="wish-list-add-empty" role="status">
                <Search size={18} aria-hidden="true" />
                <strong>No {musicbrainzSearch.entity} found on MusicBrainz</strong>
                <span>Check the spelling or try a broader name.</span>
              </div>
            )
          ) : null}
        </section>
      ) : null}

      <section className="wish-list-summary" aria-label="Wish List summary">
        <div>
          <Heart size={19} aria-hidden="true" />
          <span>Total wishes</span>
          <strong>{items.length}</strong>
        </div>
        <div>
          <UsersRound size={19} aria-hidden="true" />
          <span>Artists</span>
          <strong>{grouped.artists.length}</strong>
        </div>
        <div>
          <Album size={19} aria-hidden="true" />
          <span>Albums</span>
          <strong>{grouped.albums.length}</strong>
        </div>
      </section>

      {autoRemovedCount > 0 ? (
        <div className="wish-list-reconciled" role="status">
          <Sparkles size={17} aria-hidden="true" />
          <span>
            Removed {autoRemovedCount} {autoRemovedCount === 1 ? "item" : "items"} now found in your library.
          </span>
        </div>
      ) : null}
      {error ? <p className="error-message">{error}</p> : null}

      <div className="wish-list-columns" aria-busy={isLoading}>
        <WishListGroup
          entity="artist"
          items={grouped.artists}
          onOpen={(item) => item.musicbrainzUrl && void openUrl(item.musicbrainzUrl)}
          onRemove={(item) => void removeItem(item)}
          onSearchAlbum={(item) => void searchItemWithDeemix(item)}
          onSearchSoulseek={(item) => void searchItemWithSoulseek(item)}
          onDiscoverArtist={(item) => void discoverArtist(item)}
          searchingId={searchingId}
          soulseekSearchingId={soulseekSearchingId}
          checkingArtistIds={checkingArtistIds}
          artistSummaryErrors={artistSummaryErrors}
        />
        <WishListGroup
          entity="album"
          items={grouped.albums}
          onOpen={(item) => item.musicbrainzUrl && void openUrl(item.musicbrainzUrl)}
          onRemove={(item) => void removeItem(item)}
          onSearchAlbum={(item) => void searchItemWithDeemix(item)}
          onSearchSoulseek={(item) => void searchItemWithSoulseek(item)}
          onDiscoverArtist={(item) => void discoverArtist(item)}
          searchingId={searchingId}
          soulseekSearchingId={soulseekSearchingId}
          checkingArtistIds={checkingArtistIds}
          artistSummaryErrors={artistSummaryErrors}
        />
      </div>

      {searchedItem ? (
        <section className="deemix-search-results" aria-live="polite">
          <header>
            <div>
              <span className="deemix-search-icon">
                <Search size={18} aria-hidden="true" />
              </span>
              <div>
                <h2>Deemix matches</h2>
                <p>
                  {searchedItem.artist} · {searchedItem.title}
                  {searchedItem.year ? ` · ${searchedItem.year}` : ""}
                </p>
              </div>
            </div>
            <button
              className="icon-button"
              type="button"
              title="Close Deemix results"
              aria-label="Close Deemix results"
              onClick={() => {
                setSearchedItem(null);
                setDeemixResults(null);
              }}
            >
              <X size={16} />
            </button>
          </header>

          {searchingId === searchedItem.id ? (
            <div className="deemix-search-state">
              <RefreshCw size={19} className="spin" aria-hidden="true" />
              <span>Validating the stored ARL and searching Deezer…</span>
            </div>
          ) : deemixResults?.matches.length ? (
            <div className="deemix-match-list">
              {deemixResults.matches.map((match) => {
                const context = {
                  wishListItemId: searchedItem.id,
                  musicbrainzReleaseGroupId: searchedItem.musicbrainzId,
                  label: searchedItem.title,
                } satisfies DownloadContext;
                const status = jobStatus(match, context);
                return (
                  <article key={match.id}>
                    <MatchBadge match={match} />
                    <div className="deemix-match-copy">
                      <strong>{match.title}</strong>
                      <span>
                        {match.artist}
                        {match.year ? ` · ${match.year}` : ""}
                        {match.trackCount ? ` · ${match.trackCount} tracks` : ""}
                      </span>
                      <small>
                        {match.recordType ?? "album"}
                        {match.explicit ? " · explicit" : ""}
                        {` · ${match.matchScore}% match`}
                      </small>
                      {match.downloadedAt || searchedItem.downloadedAt ? (
                        <span className="deemix-result-downloaded">
                          <CheckCircle2 size={13} aria-hidden="true" />
                          Already downloaded
                        </span>
                      ) : null}
                    </div>
                    <div className="deemix-match-actions">
                      <button
                        className="primary-button deemix-download-button"
                        type="button"
                        disabled={status === "queued" || status === "downloading"}
                        aria-label={`Download ${match.title}`}
                        onClick={() => void requestDownload(match, context)}
                      >
                        {status === "downloading" ? (
                          <RefreshCw size={15} className="spin" />
                        ) : status === "queued" ? (
                          <Clock3 size={15} />
                        ) : (
                          <Download size={15} />
                        )}
                        <span>
                          {status === "downloading"
                            ? "Downloading"
                            : status === "queued"
                              ? "Queued"
                              : match.downloadedAt || searchedItem.downloadedAt
                                ? "Download again"
                                : "Download album"}
                        </span>
                      </button>
                      <button
                        className="secondary-button deemix-open-button"
                        type="button"
                        onClick={() => void openUrl(match.deezerUrl)}
                      >
                        <ExternalLink size={15} />
                        <span>Open in Deezer</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : deemixResults ? (
            <div className="deemix-search-state empty">
              <Search size={19} aria-hidden="true" />
              <strong>No Deezer album matches found</strong>
              <span>This wish remains on the list for another provider.</span>
            </div>
          ) : null}
        </section>
      ) : null}

      {soulseekSearchedItem ? (
        <section className="deemix-search-results soulseek-search-results" aria-live="polite">
          <header>
            <div>
              <span className="deemix-search-icon soulseek">
                <RadioTower size={18} aria-hidden="true" />
              </span>
              <div>
                <h2>Soulseek sources</h2>
                <p>
                  {soulseekSearchedItem.artist} · {soulseekSearchedItem.title}
                  {soulseekSearchedItem.year ? ` · ${soulseekSearchedItem.year}` : ""}
                </p>
              </div>
            </div>
            <button
              className="icon-button"
              type="button"
              title="Close Soulseek results"
              aria-label="Close Soulseek results"
              onClick={() => {
                setSoulseekSearchedItem(null);
                setSoulseekResults(null);
                setSoulseekNotice(null);
              }}
            >
              <X size={16} />
            </button>
          </header>

          {soulseekSearchingId === soulseekSearchedItem.id ? (
            <div className="deemix-search-state">
              <RadioTower size={19} className="spin" aria-hidden="true" />
              <span>Listening for Soulseek peers for up to 15 seconds…</span>
            </div>
          ) : soulseekCandidates.length ? (
            <SoulseekSourceList
              candidates={soulseekCandidates}
              notice={soulseekNotice}
              target={{
                artist: soulseekSearchedItem.artist,
                title: soulseekSearchedItem.title,
                year: soulseekSearchedItem.year,
                releaseGroupId: soulseekSearchedItem.musicbrainzId,
              }}
              transfers={soulseekTransfers}
              transferProgress={soulseekTransferProgress}
              onDownload={(candidate) => void downloadSoulseekRelease(candidate)}
            />
          ) : soulseekResults ? (
            <div className="deemix-search-state empty">
              <RadioTower size={19} aria-hidden="true" />
              <strong>No public audio folders answered</strong>
              <span>Try again later, or broaden the artist or album spelling.</span>
            </div>
          ) : null}
        </section>
      ) : null}

      {artistDiscovery ? (
        <section className="artist-albums-found" aria-live="polite">
          <header>
            <div>
              <span className="deemix-search-icon">
                <Album size={18} aria-hidden="true" />
              </span>
              <div>
                <h2>Albums found</h2>
                <p>
                  {artistDiscovery.artist} · {artistDiscovery.officialAlbumCount} official MusicBrainz {artistDiscovery.officialAlbumCount === 1 ? "album" : "albums"} · {artistDiscovery.matchedAlbumCount} with Deezer matches
                  {` · ${missingAlbumLabel(artistDiscovery.albumSummary.missingAlbumCount)}`}
                </p>
              </div>
            </div>
            <div className="artist-albums-found-actions">
              <button
                className="primary-button"
                type="button"
                disabled={isQueueingAll || artistDiscovery.matchedAlbumCount === 0}
                onClick={() => void downloadAllArtistAlbums()}
              >
                {isQueueingAll ? (
                  <RefreshCw size={15} className="spin" />
                ) : (
                  <ListPlus size={15} />
                )}
                <span>
                  {isQueueingAll ? "Checking folders" : "Download all with Deemix"}
                </span>
              </button>
              <button
                className="icon-button"
                type="button"
                title="Close Albums found"
                aria-label="Close Albums found"
                onClick={() => {
                  artistSoulseekGeneration.current += 1;
                  setArtistDiscovery(null);
                  setArtistSoulseekSearches({});
                }}
              >
                <X size={16} />
              </button>
            </div>
          </header>
          {artistDiscovery.truncated ? (
            <p className="artist-albums-limit-note">
              Showing and searching the first {artistDiscovery.searchedAlbumCount} albums of {artistDiscovery.officialAlbumCount} to keep the provider request bounded.
            </p>
          ) : null}
          {queueNotice ? <p className="artist-albums-queue-notice" role="status">{queueNotice}</p> : null}
          <div className="artist-albums-list">
            {artistDiscovery.albums.map((album) => {
              const match = album.deemixMatches[0] ?? null;
              const context = {
                wishListItemId: artistDiscovery.wishListItemId,
                musicbrainzReleaseGroupId: album.releaseGroupId,
                label: album.title,
              } satisfies DownloadContext;
              const status = match ? jobStatus(match, context) : null;
              const soulseekSearch =
                artistSoulseekSearches[album.releaseGroupId] ?? null;
              const soulseekCandidatesForAlbum =
                artistSoulseekCandidates.get(album.releaseGroupId) ?? [];
              const isSoulseekSearching = soulseekSearch?.status === "searching";
              const isSoulseekQueued = soulseekSearch?.status === "queued";
              return (
                <article key={album.releaseGroupId}>
                  <div className="artist-album-source">
                    <strong>{album.title}</strong>
                    <span>
                      {album.year ?? "Year unknown"}
                      {album.secondaryTypes.length
                        ? ` · ${album.secondaryTypes.join(" · ")}`
                        : " · Album"}
                    </span>
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => void openUrl(album.musicbrainzUrl)}
                    >
                      MusicBrainz
                      <ExternalLink size={13} />
                    </button>
                  </div>
                  <div className="artist-album-match">
                    {match ? (
                      <>
                        <MatchBadge match={match} />
                        <div className="deemix-match-copy">
                          <strong>{match.title}</strong>
                          <span>
                            {match.artist}
                            {match.year ? ` · ${match.year}` : ""}
                            {match.trackCount ? ` · ${match.trackCount} tracks` : ""}
                          </span>
                          <small>
                            Deezer · {match.matchScore}% match
                            {album.deemixMatches.length > 1
                              ? ` · ${album.deemixMatches.length - 1} alternative ${album.deemixMatches.length === 2 ? "match" : "matches"}`
                              : ""}
                          </small>
                        </div>
                      </>
                    ) : (
                      <div className="artist-album-no-match">
                        <Search size={16} aria-hidden="true" />
                        <span>{album.deemixError ?? "No Deezer match found"}</span>
                      </div>
                    )}
                  </div>
                  <div className="artist-album-actions">
                    {album.inLibrary ? (
                      <span
                        className="wish-list-library-badge"
                        title="This album is already in the imported library"
                      >
                        <CheckCircle2 size={13} aria-hidden="true" />
                        In library
                      </span>
                    ) : null}
                    {album.downloadedAt ? (
                      <span
                        className="wish-list-downloaded-badge"
                        title={album.downloadedPath ?? "Downloaded with Deemix"}
                      >
                        <CheckCircle2 size={13} aria-hidden="true" />
                        Downloaded
                      </span>
                    ) : null}
                    {match ? (
                      <button
                        className="primary-button deemix-download-button"
                        type="button"
                        disabled={status === "queued" || status === "downloading"}
                        aria-label={`Download ${album.title} with Deemix`}
                        onClick={() => void requestDownload(match, context)}
                      >
                        {status === "downloading" ? (
                          <RefreshCw size={15} className="spin" />
                        ) : status === "queued" ? (
                          <Clock3 size={15} />
                        ) : (
                          <Download size={15} />
                        )}
                        <span>
                          {status === "downloading"
                            ? "Deemix downloading"
                            : status === "queued"
                              ? "Deemix queued"
                              : album.downloadedAt
                                ? "Deemix again"
                                : album.inLibrary
                                  ? "Deemix copy"
                                : "Download with Deemix"}
                        </span>
                      </button>
                    ) : null}
                    <button
                      className="secondary-button soulseek-album-search-button"
                      type="button"
                      disabled={
                        artistSoulseekBatchBusy ||
                        soulseekSearchingId !== null
                      }
                      aria-label={`${soulseekSearch ? "Refresh" : "Search"} ${album.title} with Soulseek`}
                      onClick={() => void retryArtistSoulseekSearch(album)}
                    >
                      <RadioTower
                        size={15}
                        className={isSoulseekSearching ? "spin" : ""}
                      />
                      <span>
                        {isSoulseekSearching
                          ? "Searching Soulseek"
                          : isSoulseekQueued
                            ? "Soulseek queued"
                            : soulseekSearch
                              ? "Refresh Soulseek"
                              : "Search Soulseek"}
                      </span>
                    </button>
                  </div>
                  {soulseekSearch ? (
                    <section
                      className="artist-album-soulseek"
                      aria-label={`Soulseek sources for ${album.title}`}
                    >
                      <header>
                        <div>
                          <RadioTower size={16} aria-hidden="true" />
                          <div>
                            <strong>Soulseek sources</strong>
                            <span>
                              {artistDiscovery.artist} · {album.title}
                              {album.year ? ` · ${album.year}` : ""}
                            </span>
                          </div>
                        </div>
                        <span className={`soulseek-search-status ${soulseekSearch.status}`}>
                          {soulseekSearch.status === "queued"
                            ? "Waiting"
                            : soulseekSearch.status === "searching"
                              ? "Searching"
                              : soulseekSearch.status === "complete"
                                ? `${soulseekCandidatesForAlbum.length} sources`
                                : "Unavailable"}
                        </span>
                      </header>
                      {isSoulseekQueued ? (
                        <div className="deemix-search-state">
                          <Clock3 size={18} aria-hidden="true" />
                          <span>Waiting for an available Soulseek search slot…</span>
                        </div>
                      ) : isSoulseekSearching ? (
                        <div className="deemix-search-state">
                          <RadioTower size={18} className="spin" aria-hidden="true" />
                          <span>Listening for Soulseek peers for up to 15 seconds…</span>
                        </div>
                      ) : soulseekCandidatesForAlbum.length ? (
                        <SoulseekSourceList
                          candidates={soulseekCandidatesForAlbum}
                          notice={soulseekSearch.notice}
                          target={{
                            artist: artistDiscovery.artist,
                            title: album.title,
                            year: album.year,
                            releaseGroupId: album.releaseGroupId,
                          }}
                          transfers={soulseekTransfers}
                          transferProgress={soulseekTransferProgress}
                          onDownload={(candidate) =>
                            void downloadArtistSoulseekRelease(album, candidate)
                          }
                        />
                      ) : soulseekSearch.status === "error" ? (
                        <div className="deemix-search-state empty">
                          <AlertTriangle size={18} aria-hidden="true" />
                          <strong>Soulseek search failed</strong>
                          <span>{soulseekSearch.error}</span>
                        </div>
                      ) : soulseekSearch.response ? (
                        <div className="deemix-search-state empty">
                          <RadioTower size={18} aria-hidden="true" />
                          <strong>No public audio folders answered</strong>
                          <span>Try the album again later or check its spelling.</span>
                        </div>
                      ) : null}
                    </section>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : searchingId && grouped.artists.some((item) => item.id === searchingId) ? (
        <section className="artist-albums-found" aria-live="polite">
          <div className="deemix-search-state">
            <RefreshCw size={19} className="spin" aria-hidden="true" />
            <span>
              Checking official MusicBrainz albums with Deemix; Soulseek starts
              automatically for every missing album…
            </span>
          </div>
        </section>
      ) : null}

      {soulseekTransfers?.transfers.length ? (
        <section className="deemix-download-queue soulseek-transfer-queue" aria-label="Soulseek download queue">
          <header>
            <div>
              <RadioTower size={18} aria-hidden="true" />
              <div>
                <h2>Soulseek transfers</h2>
                <p>
                  {soulseekTransfers.activeCount} active · {soulseekTransfers.transfers.length} files
                </p>
              </div>
            </div>
            {clearableSoulseekTransfers > 0 ? (
              <button
                className="secondary-button soulseek-clear-completed"
                type="button"
                disabled={isClearingSoulseekTransfers}
                onClick={() => void clearCompletedSoulseekDownloads()}
              >
                {isClearingSoulseekTransfers ? (
                  <RefreshCw size={14} className="spin" aria-hidden="true" />
                ) : (
                  <Trash2 size={14} aria-hidden="true" />
                )}
                {isClearingSoulseekTransfers
                  ? "Clearing…"
                  : `Clear completed (${clearableSoulseekTransfers})`}
              </button>
            ) : null}
          </header>
          <div className="deemix-download-queue-list">
            {soulseekTransfers.transfers.slice(-30).map((transfer) => {
              return (
                <article key={transfer.id} className={transfer.status}>
                  {transfer.status === "downloading" || transfer.status === "connecting" ? (
                    <RefreshCw size={16} className="spin" aria-hidden="true" />
                  ) : transfer.status === "completed" ? (
                    <CheckCircle2 size={16} aria-hidden="true" />
                  ) : transfer.status === "failed" ? (
                    <AlertTriangle size={16} aria-hidden="true" />
                  ) : (
                    <Clock3 size={16} aria-hidden="true" />
                  )}
                  <div>
                    <strong>{transfer.title}</strong>
                    <span>{soulseekTransferStatusDetail(transfer)}</span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {duplicatePrompt ? (
        <section className="deemix-duplicate-warning" role="alert">
          <AlertTriangle size={20} aria-hidden="true" />
          <div>
            <strong>Already in the Download folder</strong>
            <span>{duplicatePrompt.path}</span>
            <small>
              Download another copy creates a numbered sibling folder; existing files are never overwritten.
            </small>
          </div>
          <div>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setDuplicatePrompt(null)}
            >
              Cancel
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                enqueueDownload(
                  duplicatePrompt.match,
                  duplicatePrompt.context,
                  true,
                );
                setDuplicatePrompt(null);
              }}
            >
              <Download size={15} />
              Download another copy
            </button>
          </div>
        </section>
      ) : null}

      {downloadQueue.length ? (
        <section className="deemix-download-queue" aria-label="Deemix download queue">
          <header>
            <div>
              <ListPlus size={18} aria-hidden="true" />
              <div>
                <h2>Download queue</h2>
                <p>
                  {queueCounts.queued} queued · {queueCounts.complete} completed
                  {queueCounts.failed ? ` · ${queueCounts.failed} failed` : ""}
                </p>
              </div>
            </div>
          </header>
          <div className="deemix-download-queue-list">
            {downloadQueue.map((job) => (
              <article key={job.id} className={job.status}>
                {job.status === "downloading" ? (
                  <RefreshCw size={16} className="spin" aria-hidden="true" />
                ) : job.status === "complete" ? (
                  <CheckCircle2 size={16} aria-hidden="true" />
                ) : job.status === "failed" ? (
                  <AlertTriangle size={16} aria-hidden="true" />
                ) : (
                  <Clock3 size={16} aria-hidden="true" />
                )}
                <div>
                  <strong>{job.context.label}</strong>
                  <span>
                    {job.status === "downloading"
                      ? downloadProgress?.message ?? "Downloading…"
                      : job.status === "complete"
                        ? job.summary?.warning
                          ? `${job.summary.warning} · ${job.summary.destinationPath}`
                          : job.summary?.destinationPath ?? "Download complete"
                        : job.status === "failed"
                          ? job.error ?? "Download failed"
                          : "Waiting for the current album"}
                  </span>
                </div>
              </article>
            ))}
          </div>
          {downloadProgress ? (
            <div className="deemix-download-progress" role="status">
              <div>
                <RefreshCw size={17} className="spin" aria-hidden="true" />
                <div>
                  <strong>{downloadProgress.message}</strong>
                  {downloadProgress.currentTrack ? (
                    <span>{downloadProgress.currentTrack}</span>
                  ) : null}
                </div>
                {downloadProgress.totalTracks > 0 ? (
                  <small>
                    {downloadProgress.completedTracks}/{downloadProgress.totalTracks}
                  </small>
                ) : null}
              </div>
              <progress
                aria-label="Deemix album download progress"
                max={Math.max(downloadProgress.totalTracks, 1)}
                value={downloadProgress.completedTracks}
              />
            </div>
          ) : null}
          {downloadSummary ? (
            <div className="deemix-download-complete" role="status">
              <CheckCircle2 size={19} aria-hidden="true" />
              <div>
                <strong>Downloaded and tagged {downloadSummary.trackCount} tracks</strong>
                <span>{downloadSummary.destinationPath}</span>
                <small className={downloadSummary.warning ? "warning" : undefined}>
                  {downloadSummary.warning ?? (
                    downloadSummary.coverPath
                      ? `Cover embedded and saved as ${downloadSummary.coverPath.split(/[\\/]/).pop()}`
                      : "Downloaded without artwork"
                  )}
                </small>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
