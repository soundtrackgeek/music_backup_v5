import {
  discoveryKeyOpen,
  numericExtent,
  normalizedValue,
} from "../../app/visualizationMath";
import {
  formatNumber,
  percentOf,
  formatPercent,
  formatDate,
  ratioOf,
  formatHours,
  formatAverage,
  formatSignedNumber,
  formatMinutes,
} from "../../app/display";
import {
  type RatingBucket,
  type StatisticsResponse,
  type DecadeProgressStats,
  type GenreProgressStats,
  type ImportRun,
  type MetadataCoverageMetric,
  type LovedDensityStat,
  type ConcentrationPoint,
  type DurationAlbumStat,
  type OutlierStat,
} from "../../types";
import {
  ShieldCheck,
  Activity,
  Clock3,
  Tags,
  FolderInput,
  Heart,
  UsersRound,
  Sparkles,
} from "lucide-react";
import { type CSSProperties } from "react";
import {
  type InsightCohort,
  ratingProgressCohort,
  decadeCohort,
  genreCohort,
  missingMetadataCohort,
  lovedDensityCohort,
  catalogArtistCohort,
  catalogGenreCohort,
  durationAlbumCohort,
  trackCountBucketCohort,
  outlierCohort,
} from "../../app/insightCohorts";

export function Meter({
  label,
  value,
  total,
  detail,
  onSelect,
}: {
  label: string;
  value: number;
  total: number;
  detail: string;
  onSelect?: () => void;
}) {
  return (
    <div
      className={`meter-row${onSelect ? " actionable-cohort" : ""}`}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onClick={onSelect}
      onKeyDown={
        onSelect ? (event) => discoveryKeyOpen(event, onSelect) : undefined
      }
    >
      <div>
        <span>{label}</span>
        <strong>{formatNumber(value)}</strong>
      </div>
      <div className="meter-track" aria-hidden="true">
        <div
          className="meter-fill"
          style={{ width: `${percentOf(value, total)}%` }}
        />
      </div>
      <small>{detail}</small>
    </div>
  );
}

export function DistributionBars({
  buckets,
  onSelect,
}: {
  buckets: RatingBucket[];
  onSelect?: (bucket: RatingBucket) => void;
}) {
  const maxCount = Math.max(1, ...buckets.map((bucket) => bucket.count));
  return (
    <div className="distribution-bars">
      {buckets.map((bucket) => (
        <div
          className={`distribution-row${onSelect ? " actionable-cohort" : ""}`}
          role={onSelect ? "button" : undefined}
          tabIndex={onSelect ? 0 : undefined}
          key={bucket.label}
          onClick={onSelect ? () => onSelect(bucket) : undefined}
          onKeyDown={
            onSelect
              ? (event) => discoveryKeyOpen(event, () => onSelect(bucket))
              : undefined
          }
        >
          <span>{bucket.label}</span>
          <div className="meter-track" aria-hidden="true">
            <div
              className="meter-fill"
              style={{ width: `${percentOf(bucket.count, maxCount)}` + "%" }}
            />
          </div>
          <strong>{formatNumber(bucket.count)}</strong>
        </div>
      ))}
    </div>
  );
}

export function LibraryHealthScorePanel({
  statistics,
}: {
  statistics: StatisticsResponse | null;
}) {
  if (!statistics) {
    return (
      <div className="empty-state">
        <ShieldCheck size={20} />
        <span>No health score yet.</span>
      </div>
    );
  }

  const health = statistics.healthScore;
  const score = Math.round(health.score ?? 0);
  const ringStyle = {
    "--score": `${Math.max(0, Math.min(100, health.score ?? 0))}%`,
  } as CSSProperties & Record<"--score", string>;
  const components = [
    { label: "Ratings", value: health.ratingCoverage },
    { label: "Albums complete", value: health.albumCompletion },
    { label: "Metadata", value: health.metadataCoverage },
    { label: "Covers", value: health.coverCoverage },
    { label: "Scored albums", value: health.scoreCoverage },
  ];

  return (
    <div className="health-score-panel">
      <div
        className="health-score-ring"
        style={ringStyle}
        aria-label={`Library health score ${score} of 100`}
      >
        <strong>{score}</strong>
        <span>/100</span>
      </div>
      <div className="health-score-components">
        {components.map((component) => (
          <div className="health-component" key={component.label}>
            <div>
              <span>{component.label}</span>
              <strong>{formatPercent(component.value, 0)}</strong>
            </div>
            <div className="meter-track" aria-hidden="true">
              <div
                className="meter-fill"
                style={{ width: `${(component.value ?? 0) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function nextMilestone(ratedTracks: number, totalTracks: number) {
  if (totalTracks <= 0) return null;
  const ratio = ratedTracks / totalTracks;
  const milestone = [0.25, 0.5, 0.75, 0.9, 1].find((target) => ratio < target);
  if (!milestone) return null;
  return {
    label: formatPercent(milestone, 0),
    remaining: Math.max(0, Math.ceil(totalTracks * milestone - ratedTracks)),
  };
}

export function RatingCompletionBurndown({
  statistics,
  onSelect,
}: {
  statistics: StatisticsResponse | null;
  onSelect: (cohort: InsightCohort) => void;
}) {
  const points = (statistics?.ratingHistory ?? []).slice(-10);
  if (!statistics || points.length === 0) {
    return (
      <div className="empty-state">
        <Activity size={20} />
        <span>No rating history yet.</span>
      </div>
    );
  }

  const maxUnrated = Math.max(1, ...points.map((point) => point.unratedTracks));
  const path = points
    .map((point, index) => {
      const x =
        42 + (points.length === 1 ? 0.5 : index / (points.length - 1)) * 320;
      const y = 194 - (point.unratedTracks / maxUnrated) * 152;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const latest = points[points.length - 1];
  const totalTracks = latest.trackCount || statistics.overview.trackCount;
  const milestone = nextMilestone(latest.ratedTracks, totalTracks);

  return (
    <div className="burndown-panel">
      <svg
        className="burndown-chart"
        viewBox="0 0 400 230"
        role="img"
        aria-label="Unrated tracks over rating history"
      >
        <line x1="42" y1="194" x2="372" y2="194" />
        <line x1="42" y1="34" x2="42" y2="194" />
        <text x="42" y="218">
          Older
        </text>
        <text x="326" y="218">
          Latest
        </text>
        <text x="8" y="28">
          Unrated
        </text>
        <path d={path} />
        {points.map((point, index) => {
          const x =
            42 +
            (points.length === 1 ? 0.5 : index / (points.length - 1)) * 320;
          const y = 194 - (point.unratedTracks / maxUnrated) * 152;
          return (
            <circle key={point.importRunId} cx={x} cy={y} r={5}>
              <title>
                {formatDate(point.createdAt)}:{" "}
                {formatNumber(point.unratedTracks)} unrated tracks
              </title>
            </circle>
          );
        })}
      </svg>
      <div className="burndown-summary">
        <div
          className="actionable-cohort"
          role="button"
          tabIndex={0}
          onClick={() =>
            onSelect(ratingProgressCohort("rated-tracks", latest.ratedTracks))
          }
          onKeyDown={(event) =>
            discoveryKeyOpen(event, () =>
              onSelect(
                ratingProgressCohort("rated-tracks", latest.ratedTracks),
              ),
            )
          }
        >
          <span>Rated now</span>
          <strong>
            {formatPercent(ratioOf(latest.ratedTracks, totalTracks))}
          </strong>
        </div>
        <div
          className="actionable-cohort"
          role="button"
          tabIndex={0}
          onClick={() =>
            onSelect(
              ratingProgressCohort("unrated-tracks", latest.unratedTracks),
            )
          }
          onKeyDown={(event) =>
            discoveryKeyOpen(event, () =>
              onSelect(
                ratingProgressCohort("unrated-tracks", latest.unratedTracks),
              ),
            )
          }
        >
          <span>Remaining</span>
          <strong>{formatNumber(latest.unratedTracks)}</strong>
        </div>
        <div>
          <span>Next milestone</span>
          <strong>
            {milestone
              ? `${formatNumber(milestone.remaining)} to ${milestone.label}`
              : "Complete"}
          </strong>
        </div>
      </div>
    </div>
  );
}

export function DecadeProgressTimeline({
  rows,
  onSelect,
}: {
  rows: DecadeProgressStats[];
  onSelect: (cohort: InsightCohort) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <Clock3 size={20} />
        <span>No decade statistics yet.</span>
      </div>
    );
  }

  return (
    <div className="decade-timeline">
      {rows.map((row) => (
        <div
          className="decade-row actionable-cohort"
          role="button"
          tabIndex={0}
          key={row.decade}
          onClick={() => onSelect(decadeCohort(row, "Decade progress"))}
          onKeyDown={(event) =>
            discoveryKeyOpen(event, () =>
              onSelect(decadeCohort(row, "Decade progress")),
            )
          }
        >
          <div>
            <strong>{row.decade}s</strong>
            <span>
              {formatNumber(row.albumCount)} albums /{" "}
              {formatHours(row.totalSeconds)}
            </span>
          </div>
          <div
            className="stacked-track"
            aria-label={`${row.decade}s rating progress`}
          >
            <span
              className="segment rated"
              style={{
                width: `${percentOf(row.ratedAlbumCount, row.albumCount)}%`,
              }}
            />
            <span
              className="segment partial"
              style={{
                width: `${percentOf(row.partialAlbumCount, row.albumCount)}%`,
              }}
            />
            <span
              className="segment unrated"
              style={{
                width: `${percentOf(row.unratedAlbumCount, row.albumCount)}%`,
              }}
            />
          </div>
          <small>
            {formatNumber(row.ratedAlbumCount)} rated /{" "}
            {formatNumber(row.partialAlbumCount)} partial /{" "}
            {formatNumber(row.unratedAlbumCount)} open
          </small>
        </div>
      ))}
    </div>
  );
}

export function genreCompletionRatio(row: GenreProgressStats) {
  if (row.albumCount <= 0) return 0;
  return Math.max(
    0,
    Math.min(
      1,
      (row.ratedAlbumCount + row.partialAlbumCount * 0.5) / row.albumCount,
    ),
  );
}

export function GenrePortfolioMatrix({
  rows,
  onSelect,
}: {
  rows: GenreProgressStats[];
  onSelect: (cohort: InsightCohort) => void;
}) {
  const points = rows.slice(0, 24);
  if (points.length === 0) {
    return (
      <div className="empty-state">
        <Tags size={20} />
        <span>No genre portfolio yet.</span>
      </div>
    );
  }

  const scoreExtent = numericExtent(points, (row) => row.averageAlbumScore);
  const albumExtent = numericExtent(points, (row) => row.albumCount);

  return (
    <svg
      className="genre-portfolio-chart"
      viewBox="0 0 430 250"
      role="img"
      aria-label="Genre size, score, and completion matrix"
    >
      <line x1="44" y1="204" x2="398" y2="204" />
      <line x1="44" y1="34" x2="44" y2="204" />
      <text x="302" y="232">
        Average score
      </text>
      <text x="8" y="24">
        Completion
      </text>
      <line className="matrix-guide" x1="44" y1="119" x2="398" y2="119" />
      <line className="matrix-guide" x1="221" y1="34" x2="221" y2="204" />
      {points.map((row, index) => {
        const completion = genreCompletionRatio(row);
        const x =
          44 +
          normalizedValue(
            row.averageAlbumScore,
            scoreExtent.min,
            scoreExtent.max,
          ) *
            354;
        const y = 204 - completion * 170;
        const radius =
          7 +
          Math.sqrt(
            normalizedValue(row.albumCount, albumExtent.min, albumExtent.max),
          ) *
            17;
        const fill = `hsl(${185 - completion * 40} 62% ${72 - completion * 18}%)`;
        return (
          <g
            className="genre-portfolio-point actionable-cohort"
            role="button"
            tabIndex={0}
            key={row.genre}
            onClick={() => onSelect(genreCohort(row))}
            onKeyDown={(event) =>
              discoveryKeyOpen(event, () => onSelect(genreCohort(row)))
            }
          >
            <circle cx={x} cy={y} r={radius} style={{ fill }}>
              <title>
                {row.genre}: {formatNumber(row.albumCount)} albums /{" "}
                {formatPercent(completion)} complete /{" "}
                {formatAverage(row.averageAlbumScore, 1)} score
              </title>
            </circle>
            {index < 8 ? (
              <text x={x} y={y - radius - 5}>
                {row.genre}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

export function ImportDeltaTimeline({ runs }: { runs: ImportRun[] }) {
  const rows = [...runs].sort((left, right) => left.id - right.id).slice(-8);
  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <FolderInput size={20} />
        <span>No import deltas yet.</span>
      </div>
    );
  }

  const maxDelta = Math.max(
    1,
    ...rows.map(
      (run) => run.addedTracks + run.changedTracks + run.removedTracks,
    ),
  );

  return (
    <div className="import-delta-timeline">
      {rows.map((run) => {
        const totalDelta =
          run.addedTracks + run.changedTracks + run.removedTracks;
        return (
          <div className="import-delta-row" key={run.id}>
            <div>
              <strong>{formatDate(run.completedAt)}</strong>
              <span>{formatNumber(run.ratingEventsCount)} rating events</span>
            </div>
            <div
              className="delta-track"
              aria-label={`Import ${run.id} track deltas`}
            >
              <span
                className="delta added"
                style={{ width: `${percentOf(run.addedTracks, maxDelta)}%` }}
              />
              <span
                className="delta changed"
                style={{ width: `${percentOf(run.changedTracks, maxDelta)}%` }}
              />
              <span
                className="delta removed"
                style={{ width: `${percentOf(run.removedTracks, maxDelta)}%` }}
              />
            </div>
            <small>
              {formatSignedNumber(run.addedTracks)} added /{" "}
              {formatNumber(run.changedTracks)} changed /{" "}
              {formatNumber(run.removedTracks)} removed /{" "}
              {formatNumber(totalDelta)} touched
            </small>
          </div>
        );
      })}
    </div>
  );
}

export function MetadataCoveragePanel({
  metrics,
  onSelect,
}: {
  metrics: MetadataCoverageMetric[];
  onSelect: (cohort: InsightCohort) => void;
}) {
  if (metrics.length === 0) {
    return (
      <div className="empty-state">
        <ShieldCheck size={20} />
        <span>No metadata coverage yet.</span>
      </div>
    );
  }

  return (
    <div className="metadata-coverage-list">
      {metrics.map((metric) => {
        const coverage = ratioOf(metric.coveredCount, metric.totalCount);
        const insight = missingMetadataCohort(metric);
        return (
          <div
            className={`metadata-coverage-row${insight ? " actionable-cohort" : ""}`}
            role={insight ? "button" : undefined}
            tabIndex={insight ? 0 : undefined}
            key={metric.id}
            onClick={insight ? () => onSelect(insight) : undefined}
            onKeyDown={
              insight
                ? (event) => discoveryKeyOpen(event, () => onSelect(insight))
                : undefined
            }
          >
            <div>
              <strong>{metric.label}</strong>
              <span>{metric.scope}</span>
            </div>
            <div className="meter-track" aria-hidden="true">
              <div
                className="meter-fill"
                style={{ width: `${coverage * 100}%` }}
              />
            </div>
            <small>
              {formatPercent(coverage, 0)} / {formatNumber(metric.coveredCount)}{" "}
              of {formatNumber(metric.totalCount)}
            </small>
          </div>
        );
      })}
    </div>
  );
}

export function LibraryShapeByTime({
  statistics,
  onSelect,
}: {
  statistics: StatisticsResponse | null;
  onSelect: (cohort: InsightCohort) => void;
}) {
  const rows = statistics?.decadeProgress ?? [];
  if (!statistics || rows.length === 0) {
    return (
      <div className="empty-state">
        <Clock3 size={20} />
        <span>No library shape data yet.</span>
      </div>
    );
  }

  const maxAlbums = Math.max(1, ...rows.map((row) => row.albumCount));
  const maxTracks = Math.max(1, ...rows.map((row) => row.trackCount));
  const maxSeconds = Math.max(1, ...rows.map((row) => row.totalSeconds));
  const shape = statistics.libraryShape;

  return (
    <div className="shape-by-time-panel">
      <div className="shape-summary">
        <div>
          <span>Median year</span>
          <strong>{shape.medianYear ?? "Unknown"}</strong>
        </div>
        <div>
          <span>Most represented decade</span>
          <strong>
            {shape.mostRepresentedDecade == null
              ? "Unknown"
              : `${shape.mostRepresentedDecade}s / ${formatNumber(shape.mostRepresentedDecadeAlbums)}`}
          </strong>
        </div>
        <div>
          <span>Peak release year</span>
          <strong>
            {shape.peakYear == null
              ? "Unknown"
              : `${shape.peakYear} / ${formatNumber(shape.peakYearAlbums)}`}
          </strong>
        </div>
      </div>
      <div className="shape-time-bars">
        {rows.map((row) => (
          <div
            className="shape-time-row actionable-cohort"
            role="button"
            tabIndex={0}
            key={row.decade}
            onClick={() => onSelect(decadeCohort(row, "Library shape"))}
            onKeyDown={(event) =>
              discoveryKeyOpen(event, () =>
                onSelect(decadeCohort(row, "Library shape")),
              )
            }
          >
            <strong>{row.decade}s</strong>
            <div>
              <span>Albums</span>
              <div className="meter-track" aria-hidden="true">
                <div
                  className="meter-fill"
                  style={{ width: `${percentOf(row.albumCount, maxAlbums)}%` }}
                />
              </div>
            </div>
            <div>
              <span>Tracks</span>
              <div className="meter-track" aria-hidden="true">
                <div
                  className="meter-fill secondary"
                  style={{ width: `${percentOf(row.trackCount, maxTracks)}%` }}
                />
              </div>
            </div>
            <div>
              <span>Hours</span>
              <div className="meter-track" aria-hidden="true">
                <div
                  className="meter-fill warm"
                  style={{
                    width: `${percentOf(row.totalSeconds, maxSeconds)}%`,
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LovedDensityPanel({
  rows,
  onSelect,
}: {
  rows: LovedDensityStat[];
  onSelect: (cohort: InsightCohort) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <Heart size={20} />
        <span>No loved-density data yet.</span>
      </div>
    );
  }

  const maxDensity = Math.max(1, ...rows.map((row) => row.lovedPer100Tracks ?? 0));
  return (
    <div className="loved-density-list">
      {rows.slice(0, 12).map((row) => {
        const insight = lovedDensityCohort(row);
        return (
          <div
            className={`loved-density-row${insight ? " actionable-cohort" : ""}`}
            role={insight ? "button" : undefined}
            tabIndex={insight ? 0 : undefined}
            key={`${row.scope}:${row.label}`}
            onClick={insight ? () => onSelect(insight) : undefined}
            onKeyDown={
              insight
                ? (event) => discoveryKeyOpen(event, () => onSelect(insight))
                : undefined
            }
          >
            <div>
              <strong>{row.label}</strong>
              <span>{row.scope}</span>
            </div>
            <div className="meter-track" aria-hidden="true">
              <div
                className="meter-fill"
                style={{
                  width: `${percentOf(row.lovedPer100Tracks ?? 0, maxDensity)}%`,
                }}
              />
            </div>
            <small>
              {(row.lovedPer100Tracks ?? 0).toFixed(2)} / 100 /{" "}
              {formatNumber(row.lovedTracks)} loved
            </small>
          </div>
        );
      })}
    </div>
  );
}

export function concentrationLabel(scope: string, point: ConcentrationPoint) {
  return `Top ${point.topN} ${scope}`;
}

export function ConcentrationBars({
  scope,
  points,
}: {
  scope: string;
  points: ConcentrationPoint[];
}) {
  return (
    <div className="concentration-bars">
      {points.map((point) => (
        <div className="concentration-row" key={`${scope}:${point.topN}`}>
          <div>
            <strong>{concentrationLabel(scope, point)}</strong>
            <span>{formatNumber(point.albumCount)} albums</span>
          </div>
          <div className="meter-track" aria-hidden="true">
            <div
              className="meter-fill"
              style={{ width: `${(point.share ?? 0) * 100}%` }}
            />
          </div>
          <small>{formatPercent(point.share, 1)}</small>
        </div>
      ))}
    </div>
  );
}

export function CatalogConcentrationPanel({
  statistics,
  onSelect,
}: {
  statistics: StatisticsResponse | null;
  onSelect: (cohort: InsightCohort) => void;
}) {
  if (!statistics) {
    return (
      <div className="empty-state">
        <UsersRound size={20} />
        <span>No concentration data yet.</span>
      </div>
    );
  }

  const concentration = statistics.catalogConcentration;
  return (
    <div className="catalog-concentration-panel">
      <div className="concentration-summary">
        <div
          className={concentration.topArtist ? "actionable-cohort" : undefined}
          role={concentration.topArtist ? "button" : undefined}
          tabIndex={concentration.topArtist ? 0 : undefined}
          onClick={() => {
            const artist = concentration.topArtist;
            if (artist) {
              onSelect(
                catalogArtistCohort(artist, concentration.topArtistAlbumCount),
              );
            }
          }}
          onKeyDown={(event) => {
            const artist = concentration.topArtist;
            if (artist) {
              discoveryKeyOpen(event, () =>
                onSelect(
                  catalogArtistCohort(
                    artist,
                    concentration.topArtistAlbumCount,
                  ),
                ),
              );
            }
          }}
        >
          <span>Top artist</span>
          <strong>{concentration.topArtist ?? "Unknown"}</strong>
          <small>
            {formatNumber(concentration.topArtistAlbumCount)} albums
          </small>
        </div>
        <div
          className={concentration.topGenre ? "actionable-cohort" : undefined}
          role={concentration.topGenre ? "button" : undefined}
          tabIndex={concentration.topGenre ? 0 : undefined}
          onClick={() => {
            const genre = concentration.topGenre;
            if (genre) {
              onSelect(
                catalogGenreCohort(genre, concentration.topGenreAlbumCount),
              );
            }
          }}
          onKeyDown={(event) => {
            const genre = concentration.topGenre;
            if (genre) {
              discoveryKeyOpen(event, () =>
                onSelect(
                  catalogGenreCohort(genre, concentration.topGenreAlbumCount),
                ),
              );
            }
          }}
        >
          <span>Top genre</span>
          <strong>{concentration.topGenre ?? "Unknown"}</strong>
          <small>{formatNumber(concentration.topGenreAlbumCount)} albums</small>
        </div>
      </div>
      <ConcentrationBars scope="artists" points={concentration.artistPoints} />
      <ConcentrationBars scope="genres" points={concentration.genrePoints} />
    </div>
  );
}

export function durationAlbumLabel(album: DurationAlbumStat) {
  return [album.albumArtistDisplay, album.album, album.year]
    .filter(Boolean)
    .join(" / ");
}

export function DurationAlbumList({
  title,
  albums,
  onSelect,
}: {
  title: string;
  albums: DurationAlbumStat[];
  onSelect: (cohort: InsightCohort) => void;
}) {
  return (
    <div className="duration-album-list">
      <span>{title}</span>
      {albums.slice(0, 4).map((album) => (
        <div
          className="duration-album-row actionable-cohort"
          role="button"
          tabIndex={0}
          key={album.albumId}
          onClick={() => onSelect(durationAlbumCohort(album))}
          onKeyDown={(event) =>
            discoveryKeyOpen(event, () => onSelect(durationAlbumCohort(album)))
          }
        >
          <strong>{durationAlbumLabel(album) || "Untitled"}</strong>
          <small>
            {formatHours(album.totalSeconds)} /{" "}
            {formatNumber(album.totalTracks)} tracks /{" "}
            {formatPercent(album.ratingCompleteness, 0)} complete
          </small>
        </div>
      ))}
    </div>
  );
}

export function DurationAnalyticsPanel({
  statistics,
  onSelect,
}: {
  statistics: StatisticsResponse | null;
  onSelect: (cohort: InsightCohort) => void;
}) {
  if (!statistics) {
    return (
      <div className="empty-state">
        <Clock3 size={20} />
        <span>No duration analytics yet.</span>
      </div>
    );
  }

  const analytics = statistics.durationAnalytics;
  return (
    <div className="duration-analytics-panel">
      <div className="duration-summary">
        <div>
          <span>Average album</span>
          <strong>{formatHours(analytics.averageAlbumSeconds)}</strong>
        </div>
        <div>
          <span>Average track</span>
          <strong>{formatMinutes(analytics.averageTrackSeconds)}</strong>
        </div>
      </div>
      <DistributionBars
        buckets={analytics.trackCountBuckets}
        onSelect={(bucket) => {
          const insight = trackCountBucketCohort(bucket);
          if (insight) onSelect(insight);
        }}
      />
      <DurationAlbumList
        title="Longest albums"
        albums={analytics.longestAlbums}
        onSelect={onSelect}
      />
      <DurationAlbumList
        title="Shortest albums"
        albums={analytics.shortestAlbums}
        onSelect={onSelect}
      />
    </div>
  );
}

export function OutlierStatsPanel({
  rows,
  onSelect,
}: {
  rows: OutlierStat[];
  onSelect: (cohort: InsightCohort) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <Sparkles size={20} />
        <span>No outlier stats yet.</span>
      </div>
    );
  }

  return (
    <div className="outlier-stat-grid">
      {rows.map((row) => {
        const insight = outlierCohort(row);
        return (
          <article
            className={`outlier-stat${insight ? " actionable-cohort" : ""}`}
            role={insight ? "button" : undefined}
            tabIndex={insight ? 0 : undefined}
            key={row.id}
            onClick={insight ? () => onSelect(insight) : undefined}
            onKeyDown={
              insight
                ? (event) => discoveryKeyOpen(event, () => onSelect(insight))
                : undefined
            }
          >
            <span>{row.label}</span>
            <strong>{row.value}</strong>
            <small>{row.detail}</small>
          </article>
        );
      })}
    </div>
  );
}
