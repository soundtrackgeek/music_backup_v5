import { useEffect, useState } from "react";
import { AlbumCover } from "../../components/AlbumCover";
import { AuroraPlaybackActions } from "../../components/AuroraPlaybackActions";
import { searchLibrary } from "../../backend";
import { formatLastPlayed, formatNumber } from "../../app/display";
import { createFilters, createRequest } from "../../app/requests";
import { searchRequestCohort, type InsightCohort } from "../../app/insightCohorts";
import type { BrowseRequest, BrowseResponse } from "../../types";

const rediscoverRequest: BrowseRequest = {
  ...createRequest("tracks"),
  filters: {
    ...createFilters(),
    playCountMin: 1,
    notPlayedWithinDays: 365,
    trackRatingMin: 4,
  },
  sort: { field: "lastPlayed", direction: "asc" },
  limit: 6,
};

export function RediscoverShelf({ catalogRevision, onOpenTrack, onOpenSearch }: {
  catalogRevision: number;
  onOpenTrack: (trackId: number) => void;
  onOpenSearch: (cohort: InsightCohort) => void;
}) {
  const [result, setResult] = useState<BrowseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void searchLibrary(rediscoverRequest).then(next => {
      if (!cancelled) {
        setResult(next);
        setError(null);
      }
    }).catch((reason: unknown) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
    });
    return () => { cancelled = true; };
  }, [catalogRevision]);

  return (
    <section className="discovery-panel rediscover-shelf" aria-labelledby="rediscover-title">
      <div className="panel-heading compact">
        <div>
          <h2 id="rediscover-title">Rediscover</h2>
          <p>Tracks you’ve played before, rated 4 stars or higher, and haven’t played in the past year.</p>
        </div>
        {result && result.total > 0 && <button type="button" className="secondary-button" onClick={() => onOpenSearch(searchRequestCohort({ ...rediscoverRequest, limit: 50 }, result.total))}>
          See all {formatNumber(result.total)}
        </button>}
      </div>
      {error ? <p className="error-message" role="alert">{error}</p>
        : !result ? <p role="status">Checking listening history…</p>
          : !result.rows.length ? <p>No tracks match your recorded listening history.</p>
            : <ul>{result.rows.map(row => row.trackId == null ? null : (
              <li key={row.id}>
                <AlbumCover row={row} className="cover-mini" />
                <div>
                  <button type="button" className="rediscover-track" onClick={() => onOpenTrack(row.trackId!)}>{row.title || "Untitled track"}</button>
                  <small>{row.displayArtist || row.albumArtistDisplay} · {formatNumber(row.playCount)} plays · Last played {formatLastPlayed(row.lastPlayedAt)}</small>
                </div>
                <AuroraPlaybackActions compact target={{ kind: "track", albumId: row.albumId, trackId: row.trackId }} />
              </li>
            ))}</ul>}
    </section>
  );
}
