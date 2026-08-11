import { useEffect, useId, useState } from "react";
import {
  BookOpenText,
  ExternalLink,
  RotateCcw,
  Star,
} from "lucide-react";

import type { AlbumReview } from "../types";

const COLLAPSE_THRESHOLD = 650;

export function AlbumReviewPanel({
  review,
  isLoading,
  error,
  onRefresh,
  onOpenSource,
}: {
  review: AlbumReview | null;
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpenSource: (url: string) => void;
}) {
  const headingId = useId();
  const [expanded, setExpanded] = useState(false);
  const text = review?.review ?? "";
  const canExpand = text.length > COLLAPSE_THRESHOLD;

  useEffect(() => {
    setExpanded(false);
  }, [review?.albumId, review?.fetchedAt]);

  return (
    <section className="album-review" aria-labelledby={headingId}>
      <div className="album-review-heading">
        <div>
          <span className="eyebrow">MusicBrainz-linked CritiqueBrainz</span>
          <h2 id={headingId}>Album Review</h2>
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
      {!review && isLoading ? (
        <div className="empty-state large">
          <BookOpenText size={19} />
          <span>Loading album review.</span>
        </div>
      ) : null}
      {text ? (
        <>
          <div className="album-review-byline">
            <span>
              Review by {review?.reviewerName ?? "a CritiqueBrainz contributor"}
              {review?.reviewSource ? ` · ${review.reviewSource}` : ""}
            </span>
            {review?.rating ? (
              <span
                className="album-review-rating"
                aria-label={`${review.rating} out of 5 stars`}
              >
                {Array.from({ length: 5 }, (_, index) => (
                  <Star
                    key={index}
                    size={14}
                    fill={index < review.rating! ? "currentColor" : "none"}
                    aria-hidden="true"
                  />
                ))}
              </span>
            ) : null}
          </div>
          <p className={`album-review-copy${expanded ? " expanded" : ""}`}>
            {text}
          </p>
          {canExpand ? (
            <button
              className="album-review-expand"
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? "Show less" : "Read more"}
            </button>
          ) : null}
        </>
      ) : null}
      {review && !text ? (
        <div className="empty-state large">
          <BookOpenText size={19} />
          <span>{review.message}</span>
        </div>
      ) : null}

      {review && text ? (
        <footer className="album-review-source">
          <span>
            {review.stale
              ? "Cached review (refresh failed)"
              : review.cached
                ? "Cached from CritiqueBrainz"
                : "From CritiqueBrainz"}
            {review.language ? ` · ${review.language.toUpperCase()}` : ""}
          </span>
          <span className="album-review-source-actions">
            {review.licenseUrl ? (
              <button
                type="button"
                title={review.licenseName ?? undefined}
                onClick={() => onOpenSource(review.licenseUrl!)}
              >
                {review.licenseId ?? "Review license"}{" "}
                <ExternalLink size={13} aria-hidden="true" />
              </button>
            ) : review.licenseId ? (
              <span title={review.licenseName ?? undefined}>
                {review.licenseId}
              </span>
            ) : null}
            {review.sourceUrl ? (
              <button
                type="button"
                onClick={() => onOpenSource(review.sourceUrl!)}
              >
                Read on CritiqueBrainz{" "}
                <ExternalLink size={13} aria-hidden="true" />
              </button>
            ) : null}
          </span>
        </footer>
      ) : null}
    </section>
  );
}
