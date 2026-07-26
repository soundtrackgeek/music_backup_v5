import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Album,
  CheckCircle2,
  Download,
  ExternalLink,
  Heart,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";

import {
  listWishList,
  downloadDeemixAlbum,
  listenToDeemixDownloadProgress,
  openExternalUrl,
  removeWishListItem,
  searchDeemixAlbums,
} from "../backend";
import type {
  DeemixAlbumMatch,
  DeemixAlbumDownloadProgress,
  DeemixAlbumDownloadSummary,
  DeemixAlbumSearchResponse,
  WishListEntity,
  WishListItem,
} from "../types";

function WishListGroup({
  entity,
  items,
  onOpen,
  onRemove,
  onSearch,
  searchingId,
}: {
  entity: WishListEntity;
  items: WishListItem[];
  onOpen: (item: WishListItem) => void;
  onRemove: (item: WishListItem) => void;
  onSearch: (item: WishListItem) => void;
  searchingId: number | null;
}) {
  const isArtist = entity === "artist";
  const Icon = isArtist ? UsersRound : Album;
  const heading = isArtist ? "Artists" : "Albums";
  const emptyCopy = isArtist
    ? "Artists added from Luna discovery will appear here."
    : "Missing MusicBrainz albums and Luna discoveries will appear here.";

  return (
    <section className="wish-list-group" aria-labelledby={`wish-list-${entity}-heading`}>
      <header>
        <div>
          <span className={`wish-list-group-icon ${entity}`}>
            <Icon size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 id={`wish-list-${entity}-heading`}>{heading}</h2>
            <p>{items.length} waiting</p>
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
              </div>
              <div className="wish-list-item-actions">
                {!isArtist ? (
                  <button
                    className="icon-button"
                    type="button"
                    title="Search with Deemix"
                    aria-label={`Search ${item.title} with Deemix`}
                    disabled={searchingId !== null}
                    onClick={() => onSearch(item)}
                  >
                    <Search
                      size={16}
                      className={searchingId === item.id ? "spin" : ""}
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

export function WishListWorkspace() {
  const [items, setItems] = useState<WishListItem[]>([]);
  const [autoRemovedCount, setAutoRemovedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [searchingId, setSearchingId] = useState<number | null>(null);
  const [searchedItem, setSearchedItem] = useState<WishListItem | null>(null);
  const [deemixResults, setDeemixResults] =
    useState<DeemixAlbumSearchResponse | null>(null);
  const [downloadingAlbumId, setDownloadingAlbumId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] =
    useState<DeemixAlbumDownloadProgress | null>(null);
  const [downloadSummary, setDownloadSummary] =
    useState<DeemixAlbumDownloadSummary | null>(null);
  const activeDownloadRequest = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await listWishList();
      setItems(response.items);
      setAutoRemovedCount(response.autoRemovedCount);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setIsLoading(false);
    }
  }, []);

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

  async function removeItem(item: WishListItem) {
    setError(null);
    try {
      await removeWishListItem(item.id);
      setItems((previous) => previous.filter((entry) => entry.id !== item.id));
      if (searchedItem?.id === item.id) {
        setSearchedItem(null);
        setDeemixResults(null);
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
    setDownloadProgress(null);
    setDownloadSummary(null);
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
      setError(
        searchError instanceof Error ? searchError.message : String(searchError),
      );
    } finally {
      setSearchingId(null);
    }
  }

  async function downloadMatch(match: DeemixAlbumMatch) {
    if (downloadingAlbumId) return;
    const requestId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `download-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    activeDownloadRequest.current = requestId;
    setDownloadingAlbumId(match.id);
    setDownloadProgress({
      requestId,
      albumId: match.id,
      phase: "metadata",
      message: "Preparing the album download…",
      currentTrack: null,
      completedTracks: 0,
      totalTracks: match.trackCount ?? 0,
    });
    setDownloadSummary(null);
    setError(null);
    try {
      const summary = await downloadDeemixAlbum({
        albumId: match.id,
        requestId,
      });
      setDownloadSummary(summary);
    } catch (downloadError) {
      setDownloadProgress(null);
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : String(downloadError),
      );
    } finally {
      activeDownloadRequest.current = null;
      setDownloadingAlbumId(null);
    }
  }

  async function openDeezerMatch(match: DeemixAlbumMatch) {
    setError(null);
    try {
      await openExternalUrl(match.deezerUrl);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : String(openError));
    }
  }

  async function openItem(item: WishListItem) {
    if (!item.musicbrainzUrl) return;
    setError(null);
    try {
      await openExternalUrl(item.musicbrainzUrl);
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
            className="icon-button"
            type="button"
            aria-label="Refresh Wish List"
            title="Refresh Wish List"
            disabled={isLoading}
            onClick={() => void load()}
          >
            <RefreshCw size={18} className={isLoading ? "spin" : ""} />
          </button>
        </div>
      </header>

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
          onOpen={(item) => void openItem(item)}
          onRemove={(item) => void removeItem(item)}
          onSearch={(item) => void searchItemWithDeemix(item)}
          searchingId={searchingId}
        />
        <WishListGroup
          entity="album"
          items={grouped.albums}
          onOpen={(item) => void openItem(item)}
          onRemove={(item) => void removeItem(item)}
          onSearch={(item) => void searchItemWithDeemix(item)}
          searchingId={searchingId}
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
                if (downloadingAlbumId) return;
                setSearchedItem(null);
                setDeemixResults(null);
                setDownloadProgress(null);
                setDownloadSummary(null);
              }}
              disabled={downloadingAlbumId !== null}
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
              {deemixResults.matches.map((match) => (
                <article key={match.id}>
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
                  </div>
                  <div className="deemix-match-actions">
                    <button
                      className="primary-button deemix-download-button"
                      type="button"
                      disabled={downloadingAlbumId !== null}
                      aria-label={`Download ${match.title}`}
                      onClick={() => void downloadMatch(match)}
                    >
                      {downloadingAlbumId === match.id ? (
                        <RefreshCw size={15} className="spin" />
                      ) : (
                        <Download size={15} />
                      )}
                      <span>
                        {downloadingAlbumId === match.id
                          ? "Downloading"
                          : "Download album"}
                      </span>
                    </button>
                    <button
                      className="secondary-button deemix-open-button"
                      type="button"
                      disabled={downloadingAlbumId !== null}
                      onClick={() => void openDeezerMatch(match)}
                    >
                      <ExternalLink size={15} />
                      <span>Open in Deezer</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : deemixResults ? (
            <div className="deemix-search-state empty">
              <Search size={19} aria-hidden="true" />
              <strong>No Deezer album matches found</strong>
              <span>This wish remains on the list for another provider.</span>
            </div>
          ) : null}

          {downloadProgress && !downloadSummary ? (
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
                <strong>
                  Downloaded and tagged {downloadSummary.trackCount} tracks
                </strong>
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
