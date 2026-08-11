import { useEffect, useId, useState } from "react";
import { BookOpen, ExternalLink, RotateCcw } from "lucide-react";

import type { ArtistBiography } from "../types";

const WIKIPEDIA_LICENSE_URL =
  "https://creativecommons.org/licenses/by-sa/4.0/";
const COLLAPSE_THRESHOLD = 480;

export function ArtistBiographyPanel({
  biography,
  isLoading,
  error,
  onRefresh,
  onOpenSource,
}: {
  biography: ArtistBiography | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpenSource: (url: string) => void;
}) {
  const headingId = useId();
  const [expanded, setExpanded] = useState(false);
  const text = biography?.biography ?? "";
  const canExpand = text.length > COLLAPSE_THRESHOLD;

  useEffect(() => {
    setExpanded(false);
  }, [biography?.artistId, biography?.fetchedAt]);

  return (
    <section className="artist-biography" aria-labelledby={headingId}>
      <div className="artist-biography-heading">
        <div>
          <span className="eyebrow">MusicBrainz-linked Wikipedia</span>
          <h2 id={headingId}>Biography</h2>
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
      {!biography && isLoading ? (
        <div className="empty-state large">
          <BookOpen size={19} />
          <span>Loading artist biography.</span>
        </div>
      ) : null}
      {text ? (
        <>
          <p
            className={`artist-biography-copy${expanded ? " expanded" : ""}`}
          >
            {text}
          </p>
          {canExpand ? (
            <button
              className="artist-biography-expand"
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? "Show less" : "Read more"}
            </button>
          ) : null}
        </>
      ) : null}
      {biography && !text ? (
        <div className="empty-state large">
          <BookOpen size={19} />
          <span>{biography.message}</span>
        </div>
      ) : null}

      {biography && text ? (
        <footer className="artist-biography-source">
          <span>
            {biography.stale
              ? "Cached Wikipedia text (refresh failed)"
              : biography.cached
                ? "Cached from Wikipedia"
                : "From Wikipedia"}
          </span>
          <span className="artist-biography-source-actions">
            <button
              type="button"
              onClick={() => onOpenSource(WIKIPEDIA_LICENSE_URL)}
            >
              CC BY-SA 4.0 <ExternalLink size={13} aria-hidden="true" />
            </button>
            {biography.sourceUrl ? (
              <button
                type="button"
                onClick={() => onOpenSource(biography.sourceUrl!)}
              >
                Read on Wikipedia <ExternalLink size={13} aria-hidden="true" />
              </button>
            ) : null}
          </span>
        </footer>
      ) : null}
    </section>
  );
}
