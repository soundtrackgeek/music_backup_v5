import { ChevronDown, Heart } from "lucide-react";
import { useMemo, useState } from "react";

import type {
  ArtistChartTrack,
  ArtistTrackChartHistory,
  ArtistTrackHighlights,
} from "../types";

const chartLabels: Record<ArtistTrackChartHistory["chart"], string> = {
  billboard: "Billboard Hot 100",
  officialUk: "Official UK Singles",
  vgLista: "VG-lista",
  tiISkuddet: "Ti i Skuddet",
  norsktoppen: "Norsktoppen",
};

const chartOrder: ArtistTrackChartHistory["chart"][] = [
  "billboard",
  "officialUk",
  "vgLista",
  "tiISkuddet",
  "norsktoppen",
];

const chartPriority = new Map(
  chartOrder.map((chart, index) => [chart, index]),
);

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatChartDate(value: string | null) {
  if (!value) return "—";
  const weekMatch = /^(\d{4})-W(\d{2})$/.exec(value);
  if (weekMatch) return `Week ${Number(weekMatch[2])}, ${weekMatch[1]}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return dateFormatter.format(new Date(`${value}T00:00:00Z`));
}

function formatDuration(seconds: number | null) {
  if (seconds == null) return "—";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function compareNullable<T extends number | string>(
  left: T | null,
  right: T | null,
  direction: "asc" | "desc",
) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  const compared = left < right ? -1 : left > right ? 1 : 0;
  return direction === "asc" ? compared : -compared;
}

function earliestChartDate(track: ArtistChartTrack) {
  let earliest: string | null = null;
  for (const chart of track.charts) {
    if (chart.entryDate && (earliest == null || chart.entryDate < earliest)) {
      earliest = chart.entryDate;
    }
  }
  return earliest;
}

function bestChartPeak(track: ArtistChartTrack) {
  let peak: number | null = null;
  for (const chart of track.charts) {
    if (peak == null || chart.peak < peak) peak = chart.peak;
  }
  return peak;
}

function longestChartRun(track: ArtistChartTrack) {
  let weeks: number | null = null;
  for (const chart of track.charts) {
    if (
      chart.weeksOnChart != null &&
      (weeks == null || chart.weeksOnChart > weeks)
    ) {
      weeks = chart.weeksOnChart;
    }
  }
  return weeks;
}

function HighlightState({
  isLoading,
  error,
  empty,
}: {
  isLoading: boolean;
  error: string | null;
  empty: string;
}) {
  if (isLoading) {
    return <div className="artist-highlight-state">Loading artist tracks…</div>;
  }
  if (error) {
    return <p className="error-message">{error}</p>;
  }
  return <div className="artist-highlight-state">{empty}</div>;
}

function PanelSort({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  label: string;
}) {
  return (
    <label className="artist-highlight-sort">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ArtistLovedTracksPanel({
  highlights,
  isLoading,
  error,
}: {
  highlights: ArtistTrackHighlights | null;
  isLoading: boolean;
  error: string | null;
}) {
  const [sort, setSort] = useState("year-asc");
  const tracks = useMemo(() => {
    const sorted = [...(highlights?.lovedTracks ?? [])];
    sorted.sort((left, right) => {
      if (sort === "year-desc") {
        return (
          compareNullable(left.year, right.year, "desc") ||
          left.title.localeCompare(right.title)
        );
      }
      if (sort === "title-asc") {
        return left.title.localeCompare(right.title);
      }
      if (sort === "rating-desc") {
        return (
          compareNullable(left.rating, right.rating, "desc") ||
          left.title.localeCompare(right.title)
        );
      }
      return (
        compareNullable(left.year, right.year, "asc") ||
        left.title.localeCompare(right.title)
      );
    });
    return sorted;
  }, [highlights, sort]);

  return (
    <section className="artist-highlight-panel" aria-label="Loved Tracks">
      <header className="artist-highlight-heading">
        <div>
          <span className="eyebrow">Local library</span>
          <h2>Loved Tracks</h2>
          <p>
            {highlights
              ? `${tracks.length.toLocaleString()} ${tracks.length === 1 ? "track" : "tracks"} marked loved`
              : "Tracks marked loved in the selected artist's local albums"}
          </p>
        </div>
        <PanelSort
          value={sort}
          onChange={setSort}
          label="Sort loved tracks"
          options={[
            { value: "year-asc", label: "Oldest to newest" },
            { value: "year-desc", label: "Newest to oldest" },
            { value: "title-asc", label: "Title A–Z" },
            { value: "rating-desc", label: "Highest rating" },
          ]}
        />
      </header>

      {tracks.length > 0 ? (
        <div className="artist-loved-track-list" role="list">
          {tracks.map((track) => (
            <article className="artist-loved-track-row" key={track.trackId} role="listitem">
              <Heart size={16} fill="currentColor" aria-hidden="true" />
              <div className="artist-highlight-track-copy">
                <strong>{track.title}</strong>
                <span>
                  {[track.album, track.year].filter((value) => value != null).join(" · ") ||
                    track.displayArtist}
                </span>
              </div>
              <span>{track.rating == null ? "Unrated" : `${track.rating}/100`}</span>
              <time>{formatDuration(track.seconds)}</time>
            </article>
          ))}
        </div>
      ) : (
        <HighlightState
          isLoading={isLoading || (highlights == null && error == null)}
          error={error}
          empty="No tracks by this artist are marked loved."
        />
      )}
    </section>
  );
}

function ChartHistorySummary({
  history,
  compact = false,
}: {
  history: ArtistTrackChartHistory;
  compact?: boolean;
}) {
  return (
    <div className={`artist-chart-history${compact ? " compact" : ""}`}>
      <strong className="artist-chart-source">{chartLabels[history.chart]}</strong>
      <dl>
        <div>
          <dt>Entry</dt>
          <dd>{formatChartDate(history.entryDate)}</dd>
        </div>
        <div>
          <dt>End</dt>
          <dd>{formatChartDate(history.endDate)}</dd>
        </div>
        <div>
          <dt>Weeks</dt>
          <dd>{history.weeksOnChart ?? "—"}</dd>
        </div>
        <div>
          <dt>Peak</dt>
          <dd>#{history.peak}</dd>
        </div>
      </dl>
    </div>
  );
}

export function ArtistChartBustersPanel({
  highlights,
  isLoading,
  error,
}: {
  highlights: ArtistTrackHighlights | null;
  isLoading: boolean;
  error: string | null;
}) {
  const [sort, setSort] = useState("date-asc");
  const [expandedTracks, setExpandedTracks] = useState<Set<number>>(
    () => new Set(),
  );
  const tracks = useMemo(() => {
    const sorted = [...(highlights?.chartTracks ?? [])];
    sorted.sort((left, right) => {
      if (sort === "date-desc") {
        return (
          compareNullable(
            earliestChartDate(left),
            earliestChartDate(right),
            "desc",
          ) || left.title.localeCompare(right.title)
        );
      }
      if (sort === "peak-asc") {
        return (
          compareNullable(bestChartPeak(left), bestChartPeak(right), "asc") ||
          left.title.localeCompare(right.title)
        );
      }
      if (sort === "weeks-desc") {
        return (
          compareNullable(
            longestChartRun(left),
            longestChartRun(right),
            "desc",
          ) || left.title.localeCompare(right.title)
        );
      }
      if (sort === "title-asc") {
        return left.title.localeCompare(right.title);
      }
      return (
        compareNullable(
          earliestChartDate(left),
          earliestChartDate(right),
          "asc",
        ) || left.title.localeCompare(right.title)
      );
    });
    return sorted;
  }, [highlights, sort]);

  function toggleTrack(trackId: number) {
    setExpandedTracks((current) => {
      const next = new Set(current);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });
  }

  return (
    <section className="artist-highlight-panel" aria-label="Chart Busters">
      <header className="artist-highlight-heading">
        <div>
          <span className="eyebrow">Imported singles charts</span>
          <h2>Chart Busters</h2>
          <p>
            {highlights
              ? `${tracks.length.toLocaleString()} charted ${tracks.length === 1 ? "track" : "tracks"} across five sources`
              : "Every locally owned track matched to an imported singles chart"}
          </p>
        </div>
        <PanelSort
          value={sort}
          onChange={setSort}
          label="Sort charted tracks"
          options={[
            { value: "date-asc", label: "Oldest to newest" },
            { value: "date-desc", label: "Newest to oldest" },
            { value: "peak-asc", label: "Best peak" },
            { value: "weeks-desc", label: "Most weeks" },
            { value: "title-asc", label: "Title A–Z" },
          ]}
        />
      </header>

      {tracks.length > 0 ? (
        <div className="artist-chart-track-list">
          {tracks.map((track) => {
            const charts = [...track.charts].sort(
              (left, right) =>
                (chartPriority.get(left.chart) ?? Number.MAX_SAFE_INTEGER) -
                (chartPriority.get(right.chart) ?? Number.MAX_SAFE_INTEGER),
            );
            const primary = charts[0];
            const additional = charts.slice(1);
            const isExpanded = expandedTracks.has(track.trackId);
            const detailsId = `artist-chart-details-${track.trackId}`;
            return (
              <article className="artist-chart-track-row" key={track.trackId}>
                <div className="artist-chart-track-main">
                  <div className="artist-highlight-track-copy">
                    <strong>{track.title}</strong>
                    <span>
                      {[track.album, track.year]
                        .filter((value) => value != null)
                        .join(" · ") || track.displayArtist}
                    </span>
                  </div>
                  <ChartHistorySummary history={primary} compact />
                  {additional.length > 0 ? (
                    <button
                      className="artist-chart-expand"
                      type="button"
                      aria-expanded={isExpanded}
                      aria-controls={detailsId}
                      onClick={() => toggleTrack(track.trackId)}
                    >
                      <span>
                        {isExpanded
                          ? "Hide other charts"
                          : `Show ${additional.length} more ${additional.length === 1 ? "chart" : "charts"}`}
                      </span>
                      <ChevronDown size={15} aria-hidden="true" />
                    </button>
                  ) : (
                    <span className="artist-chart-only-source">Only chart</span>
                  )}
                </div>
                {isExpanded ? (
                  <div className="artist-chart-track-details" id={detailsId}>
                    {additional.map((history) => (
                      <ChartHistorySummary key={history.chart} history={history} />
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <HighlightState
          isLoading={isLoading || (highlights == null && error == null)}
          error={error}
          empty="No local tracks by this artist are matched to an imported singles chart."
        />
      )}
    </section>
  );
}
