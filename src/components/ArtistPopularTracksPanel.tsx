import { ExternalLink, Flame, RotateCcw } from "lucide-react";

import type { LastFmArtistPopularity } from "../types";

function formatListeners(value: number) {
  return new Intl.NumberFormat(undefined, { notation: "compact" }).format(
    value,
  );
}

function formatDuration(seconds: number | null) {
  if (seconds == null || seconds <= 0) return "";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function ArtistPopularTracksPanel({
  popularity,
  isLoading,
  error,
  onRefresh,
  onOpenSource,
}: {
  popularity: LastFmArtistPopularity | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpenSource: (url: string) => void;
}) {
  return (
    <section
      className="artist-popular-tracks"
      aria-labelledby="popular-tracks-heading"
    >
      <div className="artist-popular-tracks-heading">
        <div>
          <span className="eyebrow">Last.fm listening data</span>
          <h2 id="popular-tracks-heading">Popular Tracks</h2>
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
      {!popularity && isLoading ? (
        <div className="empty-state large">
          <Flame size={19} />
          <span>Loading popular tracks.</span>
        </div>
      ) : null}
      {popularity && popularity.tracks.length > 0 ? (
        <ol className="artist-popular-track-list">
          {popularity.tracks.slice(0, 5).map((track) => (
            <li key={track.trackId}>
              <span className="artist-popular-track-rank">{track.rank}</span>
              <span className="artist-popular-track-title">
                <strong>{track.title}</strong>
                <small>
                  {[track.album, track.year].filter(Boolean).join(" · ")}
                </small>
              </span>
              <span className="artist-popular-track-listeners">
                {formatListeners(track.listeners)} listeners
              </span>
              <time>{formatDuration(track.seconds)}</time>
            </li>
          ))}
        </ol>
      ) : null}
      {popularity && popularity.tracks.length === 0 ? (
        <div className="empty-state large">
          <Flame size={19} />
          <span>{popularity.message}</span>
        </div>
      ) : null}

      {popularity ? (
        <footer className="artist-popular-tracks-source">
          <span>
            {popularity.stale
              ? "Cached Last.fm data (refresh failed)"
              : popularity.cached
                ? "Cached from Last.fm"
                : "From Last.fm"}
          </span>
          {popularity.sourceUrl ? (
            <button
              type="button"
              onClick={() => onOpenSource(popularity.sourceUrl!)}
            >
              View source <ExternalLink size={13} aria-hidden="true" />
            </button>
          ) : null}
        </footer>
      ) : null}
    </section>
  );
}
