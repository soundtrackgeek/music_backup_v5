import { ExternalLink, Network, RotateCcw } from "lucide-react";

import type { LastFmArtistSimilarity, LastFmSimilarArtist } from "../types";
import { ArtistPortrait } from "./ArtistPortrait";

function matchLabel(score: number) {
  return `${Math.round(Math.max(0, Math.min(score, 1)) * 100)}% match`;
}

function SimilarArtistCard({
  artist,
  onOpenArtist,
  onOpenSource,
}: {
  artist: LastFmSimilarArtist;
  onOpenArtist: (artistId: string, artistName: string) => void;
  onOpenSource: (url: string) => void;
}) {
  const localArtistId = artist.localArtistId;
  const displayName = artist.localArtistName ?? artist.name;
  const isOwned = localArtistId !== null;
  const description = isOwned
    ? `${artist.localAlbumCount} ${artist.localAlbumCount === 1 ? "album" : "albums"} in your library`
    : "Not in your library";

  return (
    <li>
      <button
        className={`artist-similar-card${isOwned ? " is-owned" : ""}`}
        type="button"
        onClick={() => {
          if (localArtistId) {
            onOpenArtist(localArtistId, displayName);
          } else if (artist.sourceUrl) {
            onOpenSource(artist.sourceUrl);
          }
        }}
        disabled={!localArtistId && !artist.sourceUrl}
        aria-label={
          isOwned
            ? `Open ${displayName} in Artists`
            : `Explore ${displayName} on Last.fm`
        }
      >
        {isOwned ? (
          <ArtistPortrait
            artistId={localArtistId}
            artistName={displayName}
            portraitAvailable={artist.portraitAvailable}
            representativeAlbumId={artist.representativeAlbumId}
            representativeAlbum={artist.representativeAlbum}
            representativeCoverPath={artist.representativeCoverPath}
          />
        ) : (
          <span className="artist-similar-fallback" aria-hidden="true">
            {displayName.trim().slice(0, 1).toLocaleUpperCase() || "A"}
          </span>
        )}
        <span className="artist-similar-copy">
          <strong>{displayName}</strong>
          <small>{description}</small>
        </span>
        <span className="artist-similar-match">{matchLabel(artist.matchScore)}</span>
        {!isOwned ? <ExternalLink size={14} aria-hidden="true" /> : null}
      </button>
    </li>
  );
}

export function ArtistSimilarArtistsPanel({
  similarity,
  isLoading,
  error,
  onRefresh,
  onOpenArtist,
  onOpenSource,
}: {
  similarity: LastFmArtistSimilarity | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpenArtist: (artistId: string, artistName: string) => void;
  onOpenSource: (url: string) => void;
}) {
  const owned =
    similarity?.artists.filter((artist) => artist.localArtistId !== null) ?? [];
  const explore =
    similarity?.artists.filter((artist) => artist.localArtistId === null) ?? [];

  return (
    <section className="artist-similar-artists" aria-label="Similar artists">
      <div className="artist-similar-heading">
        <div>
          <span className="eyebrow">Last.fm listener relationships</span>
          <h2>Similar Artists</h2>
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
      {!similarity && isLoading ? (
        <div className="empty-state large">
          <Network size={19} />
          <span>Loading similar artists.</span>
        </div>
      ) : null}
      {owned.length ? (
        <div className="artist-similar-group">
          <h3>In your library</h3>
          <ul className="artist-similar-grid">
            {owned.map((artist) => (
              <SimilarArtistCard
                key={`${artist.rank}-${artist.name}`}
                artist={artist}
                onOpenArtist={onOpenArtist}
                onOpenSource={onOpenSource}
              />
            ))}
          </ul>
        </div>
      ) : null}
      {explore.length ? (
        <div className="artist-similar-group">
          <h3>Explore</h3>
          <ul className="artist-similar-grid">
            {explore.map((artist) => (
              <SimilarArtistCard
                key={`${artist.rank}-${artist.name}`}
                artist={artist}
                onOpenArtist={onOpenArtist}
                onOpenSource={onOpenSource}
              />
            ))}
          </ul>
        </div>
      ) : null}
      {similarity && similarity.artists.length === 0 ? (
        <div className="empty-state large">
          <Network size={19} />
          <span>{similarity.message}</span>
        </div>
      ) : null}

      {similarity ? (
        <footer className="artist-similar-source">
          <span>
            {similarity.stale
              ? "Cached Last.fm data (refresh failed)"
              : similarity.cached
                ? "Cached from Last.fm"
                : "From Last.fm"}
          </span>
          {similarity.sourceUrl ? (
            <button
              type="button"
              onClick={() => onOpenSource(similarity.sourceUrl!)}
            >
              View all on Last.fm <ExternalLink size={13} aria-hidden="true" />
            </button>
          ) : null}
        </footer>
      ) : null}
    </section>
  );
}
