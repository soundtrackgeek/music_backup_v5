import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";

import {
  addWishListMusicBrainzCandidate,
  discoverWishListArtistAlbums,
  downloadDeemixAlbum,
  listWishList,
  listenToDeemixDownloadProgress,
  openExternalUrl,
  preflightDeemixAlbumDownload,
  refreshWishListArtistAlbumSummary,
  removeWishListItem,
  searchWishListMusicBrainz,
  searchDeemixAlbums,
} from "../backend";
import type {
  DeemixAlbumDownloadProgress,
  DeemixAlbumDownloadSummary,
  DeemixAlbumMatch,
  DeemixAlbumSearchResponse,
  WishListArtistAlbumDiscoveryResponse,
  WishListArtistAlbumSummary,
  WishListEntity,
  WishListItem,
  WishListMusicBrainzCandidate,
  WishListMusicBrainzSearchResponse,
} from "../types";

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

function WishListGroup({
  entity,
  items,
  onOpen,
  onRemove,
  onSearchAlbum,
  onDiscoverArtist,
  searchingId,
  checkingArtistIds,
  artistSummaryErrors,
}: {
  entity: WishListEntity;
  items: WishListItem[];
  onOpen: (item: WishListItem) => void;
  onRemove: (item: WishListItem) => void;
  onSearchAlbum: (item: WishListItem) => void;
  onDiscoverArtist: (item: WishListItem) => void;
  searchingId: number | null;
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
                  <div className="wish-list-missing-popover">
                    <button
                      className="icon-button wish-list-missing-trigger"
                      type="button"
                      aria-label={`Show ${missingAlbumLabel(item.artistAlbumSummary.missingAlbumCount)} for ${item.title}`}
                      aria-describedby={`wish-list-missing-${item.id}`}
                      title="Show missing albums"
                    >
                      <Eye size={16} />
                    </button>
                    <div
                      className="wish-list-missing-popup"
                      id={`wish-list-missing-${item.id}`}
                      role="tooltip"
                    >
                      <div>
                        <strong>{missingAlbumLabel(item.artistAlbumSummary.missingAlbumCount)}</strong>
                        <span>
                          {item.artistAlbumSummary.ownedAlbumCount} of {item.artistAlbumSummary.officialAlbumCount} official albums acquired
                        </span>
                      </div>
                      {item.artistAlbumSummary.missingAlbums.length ? (
                        <ol>
                          {item.artistAlbumSummary.missingAlbums.map((album) => (
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
                  </div>
                ) : null}
                <button
                  className="icon-button"
                  type="button"
                  title={
                    isArtist
                      ? "Find official albums with MusicBrainz and Deezer"
                      : "Search with Deemix"
                  }
                  aria-label={
                    isArtist
                      ? `Search ${item.title} official albums with Deezer`
                      : `Search ${item.title} with Deemix`
                  }
                  disabled={searchingId !== null || (isArtist && !item.musicbrainzId)}
                  onClick={() =>
                    isArtist ? onDiscoverArtist(item) : onSearchAlbum(item)
                  }
                >
                  <Search size={16} className={searchingId === item.id ? "spin" : ""} />
                </button>
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
  const [artistDiscovery, setArtistDiscovery] =
    useState<WishListArtistAlbumDiscoveryResponse | null>(null);
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

  const grouped = useMemo(
    () => ({
      artists: items.filter((item) => item.entity === "artist"),
      albums: items.filter((item) => item.entity === "album"),
    }),
    [items],
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
      if (artistDiscovery?.wishListItemId === item.id) {
        setArtistDiscovery(null);
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
    setArtistDiscovery(null);
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

  async function discoverArtist(item: WishListItem) {
    if (item.entity !== "artist") return;
    setSearchingId(item.id);
    setSearchedItem(null);
    setDeemixResults(null);
    setArtistDiscovery(null);
    setQueueNotice(null);
    setError(null);
    try {
      const response = await discoverWishListArtistAlbums(item.id);
      setArtistDiscovery(response);
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
          onDiscoverArtist={(item) => void discoverArtist(item)}
          searchingId={searchingId}
          checkingArtistIds={checkingArtistIds}
          artistSummaryErrors={artistSummaryErrors}
        />
        <WishListGroup
          entity="album"
          items={grouped.albums}
          onOpen={(item) => item.musicbrainzUrl && void openUrl(item.musicbrainzUrl)}
          onRemove={(item) => void removeItem(item)}
          onSearchAlbum={(item) => void searchItemWithDeemix(item)}
          onDiscoverArtist={(item) => void discoverArtist(item)}
          searchingId={searchingId}
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
                <span>{isQueueingAll ? "Checking folders" : "Download all albums"}</span>
              </button>
              <button
                className="icon-button"
                type="button"
                title="Close Albums found"
                aria-label="Close Albums found"
                onClick={() => setArtistDiscovery(null)}
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
                        aria-label={`Download ${album.title}`}
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
                              : album.downloadedAt
                                ? "Download again"
                                : album.inLibrary
                                  ? "Download copy"
                                : "Download"}
                        </span>
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : searchingId && grouped.artists.some((item) => item.id === searchingId) ? (
        <section className="artist-albums-found" aria-live="polite">
          <div className="deemix-search-state">
            <RefreshCw size={19} className="spin" aria-hidden="true" />
            <span>Checking official MusicBrainz albums and matching them with Deezer…</span>
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
                        ? job.summary?.destinationPath ?? "Download complete"
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
                <small>
                  Cover embedded and saved as {downloadSummary.coverPath.split(/[\\/]/).pop()}
                </small>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
