export function formatMusicBrainzReviewState(
  state: string | null | undefined,
  fallback = "Missing",
) {
  const normalized = state?.trim();
  if (!normalized) {
    return fallback;
  }

  return normalized
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function MusicBrainzReviewState({
  state,
  fallback = "Missing",
}: {
  state: string | null | undefined;
  fallback?: string;
}) {
  const normalizedClassName = state?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") ||
    "unavailable";

  return (
    <span
      className={`run-status run-status-${normalizedClassName}`}
      data-review-state={state?.trim() || "unavailable"}
    >
      {formatMusicBrainzReviewState(state, fallback)}
    </span>
  );
}
