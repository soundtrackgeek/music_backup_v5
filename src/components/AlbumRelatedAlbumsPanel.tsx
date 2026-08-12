import { Disc3, ExternalLink, RotateCcw } from "lucide-react";

import type { LastFmRelatedAlbum, LastFmRelatedAlbums } from "../types";
import { AlbumCover } from "./AlbumCover";

function relationshipEvidence(album: LastFmRelatedAlbum) {
  const evidence = album.sharedTags.slice(0, 2).map((tag) => tag.toLocaleLowerCase());
  if (album.artistSimilarity !== null) evidence.push("similar artist");
  return evidence.length ? evidence.join(" · ") : "Last.fm tag relationship";
}

function RelatedAlbumCard({
  album,
  onOpenAlbum,
  onOpenSource,
}: {
  album: LastFmRelatedAlbum;
  onOpenAlbum: (albumId: string) => void;
  onOpenSource: (url: string) => void;
}) {
  const localAlbumId = album.localAlbumId;
  const isOwned = localAlbumId !== null;
  const albumTitle = album.localAlbumTitle ?? album.albumTitle;
  const artistName = album.localAlbumArtist ?? album.artistName;

  return (
    <li>
      <button
        className={`album-related-card${isOwned ? " is-owned" : ""}`}
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
    </li>
  );
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
