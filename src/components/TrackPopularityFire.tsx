import { ExternalLink, Flame } from "lucide-react";

import type { LastFmAlbumPopularity } from "../types";

export function TrackPopularityFire({ rank }: { rank: number | null }) {
  if (rank == null || rank < 1 || rank > 3) {
    return null;
  }

  const label = `#${rank} most popular track on this album according to Last.fm`;
  return (
    <span className="track-popularity-fire" aria-label={label} title={label}>
      <Flame size={15} fill="currentColor" aria-hidden="true" />
    </span>
  );
}

export function TrackPopularityAttribution({
  popularity,
  isLoading,
  error,
  onOpenSource,
}: {
  popularity: LastFmAlbumPopularity | null;
  isLoading: boolean;
  error: string | null;
  onOpenSource: (url: string) => void;
}) {
  if (!isLoading && !error && !popularity) return null;

  return (
    <div className="track-popularity-attribution">
      <span>
        {isLoading
          ? "Loading album popularity from Last.fm…"
          : error
            ? `Last.fm popularity unavailable: ${error}`
            : popularity?.message}
      </span>
      {popularity?.sourceUrl ? (
        <button
          type="button"
          onClick={() => onOpenSource(popularity.sourceUrl!)}
        >
          Last.fm <ExternalLink size={12} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
