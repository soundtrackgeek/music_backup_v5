import { useId, useState } from "react";
import { ExternalLink, Flame, RotateCcw } from "lucide-react";

import type { LastFmArtistPopularity } from "../types";

const COLLAPSED_TRACK_LIMIT = 5;
const EXPANDED_TRACK_LIMIT = 10;

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
  const headingId = useId();
  const trackListId = useId();
  const resultKey = popularity
    ? `${popularity.artistId}:${popularity.fetchedAt ?? ""}`
    : null;
  const [expandedResultKey, setExpandedResultKey] = useState<string | null>(
    null,
  );
  const expanded = resultKey !== null && expandedResultKey === resultKey;
  const availableTracks =
    popularity?.tracks.slice(0, EXPANDED_TRACK_LIMIT) ?? [];
  const visibleTracks = availableTracks.slice(
    0,
    expanded ? EXPANDED_TRACK_LIMIT : COLLAPSED_TRACK_LIMIT,
  );
  const canExpand = availableTracks.length > COLLAPSED_TRACK_LIMIT;

  return (
    <section className="artist-popular-tracks" aria-labelledby={headingId}>
      <div className="artist-popular-tracks-heading">
        <div>
          <span className="eyebrow">Last.fm listening data</span>
          <h2 id={headingId}>Popular Tracks</h2>
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
        <ol className="artist-popular-track-list" id={trackListId}>
          {visibleTracks.map((track) => (
            <li key={`${track.trackId}-${track.rank}`}>
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
      {canExpand ? (
        <button
          className="artist-popular-tracks-expand"
          type="button"
          aria-controls={trackListId}
          aria-expanded={expanded}
          onClick={() =>
            setExpandedResultKey((current) =>
              current === resultKey ? null : resultKey,
            )
          }
        >
          {expanded ? "Show less" : "Show more"}
        </button>
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
