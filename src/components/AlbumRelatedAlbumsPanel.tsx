import { useEffect, useState } from "react";
import { Check, Disc3, ExternalLink, Heart, RotateCcw } from "lucide-react";

import { listWishList } from "../backend";
import {
  addRelatedAlbumRecommendation,
  isRelatedAlbumWishListed,
  recommendationIdentityKey,
} from "../app/recommendationWishList";
import type { LastFmRelatedAlbum, LastFmRelatedAlbums } from "../types";
import { AlbumCover } from "./AlbumCover";

function relationshipEvidence(album: LastFmRelatedAlbum) {
  const evidence = album.sharedTags.slice(0, 2).map((tag) => tag.toLocaleLowerCase());
  if (album.artistSimilarity !== null) evidence.push("similar artist");
  return evidence.length ? evidence.join(" · ") : "Last.fm tag relationship";
}

function RelatedAlbumCard({
  album,
  isWishListed,
  isAddingToWishList,
  onAddToWishList,
  onOpenAlbum,
  onOpenSource,
}: {
  album: LastFmRelatedAlbum;
  isWishListed: boolean;
  isAddingToWishList: boolean;
  onAddToWishList: (album: LastFmRelatedAlbum) => void;
  onOpenAlbum: (albumId: string) => void;
  onOpenSource: (url: string) => void;
}) {
  const localAlbumId = album.localAlbumId;
  const isOwned = localAlbumId !== null;
  const albumTitle = album.localAlbumTitle ?? album.albumTitle;
  const artistName = album.localAlbumArtist ?? album.artistName;

  return (
    <li className={`album-related-card${isOwned ? " is-owned" : ""}`}>
      <button
        className="album-related-card-main"
        type="button"
        onClick={() => {
          if (localAlbumId) {
            onOpenAlbum(localAlbumId);
          } else if (album.sourceUrl) {
            onOpenSource(album.sourceUrl);
          }
        }}
        disabled={!localAlbumId && !album.sourceUrl}
        aria-label={
          isOwned
            ? `Open ${albumTitle} by ${artistName} in Albums`
            : `Explore ${albumTitle} by ${artistName} on Last.fm`
        }
      >
        {isOwned ? (
          <AlbumCover
            row={{
              album: albumTitle,
              albumId: localAlbumId,
              coverPath: album.localCoverPath,
            }}
            className="album-related-cover"
          />
        ) : (
          <span className="album-related-fallback" aria-hidden="true">
            {albumTitle.trim().slice(0, 1).toLocaleUpperCase() || "A"}
          </span>
        )}
        <span className="album-related-copy">
          <strong>{albumTitle}</strong>
          <small>
            {artistName}
            {album.localYear ? ` · ${album.localYear}` : ""}
          </small>
          <small className="album-related-evidence">
            {relationshipEvidence(album)}
          </small>
        </span>
        {!isOwned ? <ExternalLink size={14} aria-hidden="true" /> : null}
      </button>
      {!isOwned ? (
        <button
          className={`recommendation-wish-action${isWishListed ? " active" : ""}`}
          type="button"
          disabled={isWishListed || isAddingToWishList}
          aria-label={
            isWishListed
              ? `${albumTitle} by ${artistName} is on Wish List`
              : `Add ${albumTitle} by ${artistName} to Wish List`
          }
          onClick={() => onAddToWishList(album)}
        >
          {isWishListed ? (
            <Check size={13} aria-hidden="true" />
          ) : (
            <Heart size={13} aria-hidden="true" />
          )}
          <span>
            {isWishListed
              ? "On Wish List"
              : isAddingToWishList
                ? "Adding…"
                : "Wish List"}
          </span>
        </button>
      ) : null}
    </li>
  );
}

function albumIdentityKey(album: LastFmRelatedAlbum) {
  return `${recommendationIdentityKey(album.artistName)}\u001f${recommendationIdentityKey(album.albumTitle)}`;
}

export function AlbumRelatedAlbumsPanel({
  related,
  isLoading,
  error,
  onRefresh,
  onOpenAlbum,
  onOpenSource,
}: {
  related: LastFmRelatedAlbums | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpenAlbum: (albumId: string) => void;
  onOpenSource: (url: string) => void;
}) {
  const owned =
    related?.albums.filter((album) => album.localAlbumId !== null) ?? [];
  const explore =
    related?.albums.filter((album) => album.localAlbumId === null) ?? [];
  const [wishListItems, setWishListItems] = useState<
    Awaited<ReturnType<typeof listWishList>>["items"]
  >([]);
  const [addingAlbumKey, setAddingAlbumKey] = useState<string | null>(null);
  const [wishListError, setWishListError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listWishList()
      .then((response) => {
        if (!cancelled) setWishListItems(response.items);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setWishListError(
            loadError instanceof Error ? loadError.message : String(loadError),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [related]);

  async function addAlbumToWishList(album: LastFmRelatedAlbum) {
    const key = albumIdentityKey(album);
    if (addingAlbumKey || isRelatedAlbumWishListed(wishListItems, album)) return;
    setAddingAlbumKey(key);
    setWishListError(null);
    try {
      const item = await addRelatedAlbumRecommendation(
        album,
        related?.albumArtist ?? "Related Albums",
        related?.albumTitle ?? "Album",
      );
      setWishListItems((current) =>
        current.some((candidate) => candidate.id === item.id)
          ? current
          : [item, ...current],
      );
    } catch (addError) {
      setWishListError(
        addError instanceof Error ? addError.message : String(addError),
      );
    } finally {
      setAddingAlbumKey(null);
    }
  }

  return (
    <section className="album-related" aria-label="Related albums">
      <div className="album-related-heading">
        <div>
          <span className="eyebrow">Last.fm tags + artist relationships</span>
          <h2>Related Albums</h2>
        </div>
        <button
          className="secondary-button compact-button"
          type="button"
          disabled={isLoading}
          onClick={onRefresh}
        >
          <RotateCcw size={15} aria-hidden="true" />
          <span>{isLoading ? "Loading" : "Refresh"}</span>
        </button>
      </div>

      {error ? (
        <p className="error-message" role="alert">
          {error}
        </p>
      ) : null}
      {wishListError ? (
        <p className="error-message recommendation-wish-error" role="alert">
          {wishListError}
        </p>
      ) : null}
      {!related && isLoading ? (
        <div className="empty-state large">
          <Disc3 size={19} />
          <span>Building related albums from Last.fm evidence.</span>
        </div>
      ) : null}
      {related?.sourceTags.length ? (
        <p className="album-related-basis">
          Based on {related.sourceTags.join(" · ")}
        </p>
      ) : null}
      {owned.length ? (
        <div className="album-related-group">
          <h3>In your library</h3>
          <ul className="album-related-grid">
            {owned.map((album) => (
              <RelatedAlbumCard
                key={`${album.rank}-${album.artistName}-${album.albumTitle}`}
                album={album}
                isWishListed={isRelatedAlbumWishListed(wishListItems, album)}
                isAddingToWishList={addingAlbumKey === albumIdentityKey(album)}
                onAddToWishList={(candidate) => void addAlbumToWishList(candidate)}
                onOpenAlbum={onOpenAlbum}
                onOpenSource={onOpenSource}
              />
            ))}
          </ul>
        </div>
      ) : null}
      {explore.length ? (
        <div className="album-related-group">
          <h3>Explore</h3>
          <ul className="album-related-grid">
            {explore.map((album) => (
              <RelatedAlbumCard
                key={`${album.rank}-${album.artistName}-${album.albumTitle}`}
                album={album}
                isWishListed={isRelatedAlbumWishListed(wishListItems, album)}
                isAddingToWishList={addingAlbumKey === albumIdentityKey(album)}
                onAddToWishList={(candidate) => void addAlbumToWishList(candidate)}
                onOpenAlbum={onOpenAlbum}
                onOpenSource={onOpenSource}
              />
            ))}
          </ul>
        </div>
      ) : null}
      {related && related.albums.length === 0 ? (
        <div className="empty-state large">
          <Disc3 size={19} />
          <span>{related.message}</span>
        </div>
      ) : null}

      {related ? (
        <footer className="album-related-source">
          <span>
            {related.stale
              ? "Cached relationship data (refresh failed)"
              : related.cached
                ? "Cached API-derived relationships"
                : "API-derived relationships"}
          </span>
          {related.sourceUrl ? (
            <button type="button" onClick={() => onOpenSource(related.sourceUrl!)}>
              Open album on Last.fm <ExternalLink size={13} aria-hidden="true" />
            </button>
          ) : null}
        </footer>
      ) : null}
    </section>
  );
}
