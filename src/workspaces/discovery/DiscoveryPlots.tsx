import {
  type DiscoveryMission,
  type DiscoveryHeatmapCell,
  type DiscoveryAlbumPoint,
  type DiscoveryGenrePoint,
  type DiscoveryArtistPoint,
} from "../../types";
import {
  Compass,
  Gauge,
  RotateCcw,
  Heart,
  Tags,
  UsersRound,
} from "lucide-react";
import { formatNumber, formatPercent, formatAverage } from "../../app/display";
import {
  useRef,
  type CSSProperties,
  type PointerEvent,
  type KeyboardEvent,
  useMemo,
  useState,
} from "react";
import {
  completionHeatmapYearExtent,
  type CompletionHeatmapGenreLimit,
  completionHeatmapDecades,
  selectCompletionHeatmap,
  completionHeatmapGenreLimits,
} from "../../app/completionHeatmap";
import { uniqueGenreSuggestionOptions } from "../../app/genreSuggestions";
import { genreSuggestionAliases } from "../../app/config";
import {
  SelectField,
  GenreListCriterion,
} from "../../components/catalog/SearchCriteria";
import {
  heatmapColor,
  numericExtent,
  normalizedValue,
  clampRatio,
  discoveryKeyOpen,
} from "../../app/visualizationMath";

export function DiscoveryMissionGrid({
  missions,
  emptyLabel,
  onOpen,
}: {
  missions: DiscoveryMission[];
  emptyLabel: string;
  onOpen: (mission: DiscoveryMission) => void;
}) {
  if (missions.length === 0) {
    return (
      <div className="empty-state">
        <Compass size={20} />
        <span>{emptyLabel}</span>
      </div>
    );
  }

  return (
    <div className="discovery-mission-grid">
      {missions.map((mission) => (
        <button
          className="discovery-mission"
          type="button"
          key={mission.id}
          onClick={() => onOpen(mission)}
        >
          <span>{mission.actionLabel}</span>
          <strong>{mission.title}</strong>
          <small>{mission.description}</small>
          <dl>
            <div>
              <dt>Albums</dt>
              <dd>{formatNumber(mission.albumCount)}</dd>
            </div>
            <div>
              <dt>Complete</dt>
              <dd>{formatPercent(mission.averageRatingCompleteness)}</dd>
            </div>
            <div>
              <dt>Score</dt>
              <dd>{formatAverage(mission.averageAlbumScore, 1)}</dd>
            </div>
          </dl>
        </button>
      ))}
    </div>
  );
}

export function clampHeatmapYear(
  value: number,
  minYear: number,
  maxYear: number,
) {
  return Math.min(maxYear, Math.max(minYear, Math.round(value)));
}

export function YearRangeSlider({
  minYear,
  maxYear,
  yearFrom,
  yearTo,
  scopeLabel,
  onChange,
}: {
  minYear: number;
  maxYear: number;
  yearFrom: number;
  yearTo: number;
  scopeLabel: string;
  onChange: (range: { from: number; to: number }) => void;
}) {
  const controlRef = useRef<HTMLDivElement | null>(null);
  const yearSpan = Math.max(1, maxYear - minYear);
  const minPosition = ((yearFrom - minYear) / yearSpan) * 100;
  const maxPosition = ((yearTo - minYear) / yearSpan) * 100;
  const sliderStyle = {
    "--range-min": `${minPosition}%`,
    "--range-max": `${maxPosition}%`,
  } as CSSProperties;
  const minHandleStyle = {
    "--handle-position": `${minPosition}%`,
  } as CSSProperties;
  const maxHandleStyle = {
    "--handle-position": `${maxPosition}%`,
  } as CSSProperties;

  function updateMin(value: number) {
    onChange({
      from: Math.min(clampHeatmapYear(value, minYear, maxYear), yearTo),
      to: yearTo,
    });
  }

  function updateMax(value: number) {
    onChange({
      from: yearFrom,
      to: Math.max(clampHeatmapYear(value, minYear, maxYear), yearFrom),
    });
  }

  function valueFromPointer(clientX: number) {
    const rect = controlRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return minYear;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return clampHeatmapYear(
      minYear + ratio * (maxYear - minYear),
      minYear,
      maxYear,
    );
  }

  function updateHandle(handle: "min" | "max", value: number) {
    if (handle === "min") {
      updateMin(value);
    } else {
      updateMax(value);
    }
  }

  function handlePointerDown(
    event: PointerEvent<HTMLButtonElement>,
    handle: "min" | "max",
  ) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    updateHandle(handle, valueFromPointer(event.clientX));
  }

  function handlePointerMove(
    event: PointerEvent<HTMLButtonElement>,
    handle: "min" | "max",
  ) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      updateHandle(handle, valueFromPointer(event.clientX));
    }
  }

  function handlePointerUp(event: PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    handle: "min" | "max",
  ) {
    const current = handle === "min" ? yearFrom : yearTo;
    const step = event.shiftKey ? 10 : 1;
    let nextValue: number | null = null;

    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        nextValue = current - step;
        break;
      case "ArrowRight":
      case "ArrowUp":
        nextValue = current + step;
        break;
      case "PageDown":
        nextValue = current - 10;
        break;
      case "PageUp":
        nextValue = current + 10;
        break;
      case "Home":
        nextValue = minYear;
        break;
      case "End":
        nextValue = maxYear;
        break;
      default:
        break;
    }

    if (nextValue != null) {
      event.preventDefault();
      updateHandle(handle, nextValue);
    }
  }

  return (
    <section
      className="heatmap-year-range"
      aria-label={`${scopeLabel} year range`}
    >
      <div className="heatmap-year-range-heading">
        <div>
          <span>Year range</span>
          <strong>{`${yearFrom}–${yearTo}`}</strong>
        </div>
        <small>{`${formatNumber(yearTo - yearFrom + 1)} years`}</small>
      </div>
      <div className="heatmap-year-range-layout">
        <label className="heatmap-year-input">
          <span>From</span>
          <input
            type="number"
            aria-label={`${scopeLabel} year from`}
            min={minYear}
            max={yearTo}
            value={yearFrom}
            onChange={(event) => updateMin(Number(event.currentTarget.value))}
          />
        </label>
        <div className="range-slider heatmap-year-slider" style={sliderStyle}>
          <div className="range-control" ref={controlRef}>
            <span className="range-track" aria-hidden="true" />
            <button
              className={
                yearFrom === yearTo && yearFrom === maxYear
                  ? "range-handle range-handle-min range-handle-overlap"
                  : "range-handle range-handle-min"
              }
              type="button"
              role="slider"
              aria-label={`Earliest ${scopeLabel.toLowerCase()} year`}
              aria-valuemin={minYear}
              aria-valuemax={yearTo}
              aria-valuenow={yearFrom}
              style={minHandleStyle}
              onPointerDown={(event) => handlePointerDown(event, "min")}
              onPointerMove={(event) => handlePointerMove(event, "min")}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onKeyDown={(event) => handleKeyDown(event, "min")}
            />
            <button
              className="range-handle range-handle-max"
              type="button"
              role="slider"
              aria-label={`Latest ${scopeLabel.toLowerCase()} year`}
              aria-valuemin={yearFrom}
              aria-valuemax={maxYear}
              aria-valuenow={yearTo}
              style={maxHandleStyle}
              onPointerDown={(event) => handlePointerDown(event, "max")}
              onPointerMove={(event) => handlePointerMove(event, "max")}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onKeyDown={(event) => handleKeyDown(event, "max")}
            />
          </div>
          <div className="heatmap-year-scale" aria-hidden="true">
            <span>{minYear}</span>
            <span>{maxYear}</span>
          </div>
        </div>
        <label className="heatmap-year-input">
          <span>To</span>
          <input
            type="number"
            aria-label={`${scopeLabel} year to`}
            min={yearFrom}
            max={maxYear}
            value={yearTo}
            onChange={(event) => updateMax(Number(event.currentTarget.value))}
          />
        </label>
      </div>
    </section>
  );
}

export function CompletionHeatmap({
  cells,
  emptyLabel = "No heatmap cells yet.",
  onOpen,
}: {
  cells: DiscoveryHeatmapCell[];
  emptyLabel?: string;
  onOpen: (cell: DiscoveryHeatmapCell) => void;
}) {
  const yearExtent = useMemo(() => completionHeatmapYearExtent(cells), [cells]);
  const minYear = yearExtent?.min ?? 0;
  const maxYear = yearExtent?.max ?? 0;
  const [genreLimit, setGenreLimit] = useState<CompletionHeatmapGenreLimit>(12);
  const [yearFrom, setYearFrom] = useState<number | null>(null);
  const [yearTo, setYearTo] = useState<number | null>(null);
  const [includedGenres, setIncludedGenres] = useState<string[]>([]);
  const [excludedGenres, setExcludedGenres] = useState<string[]>([]);
  const effectiveYearFrom = clampHeatmapYear(
    yearFrom ?? minYear,
    minYear,
    maxYear,
  );
  const effectiveYearTo = clampHeatmapYear(
    yearTo ?? maxYear,
    effectiveYearFrom,
    maxYear,
  );
  const genreOptions = useMemo(() => {
    const seen = new Map<string, string>();
    cells.forEach((cell) => {
      if (!seen.has(cell.genreId)) seen.set(cell.genreId, cell.genre);
    });
    return uniqueGenreSuggestionOptions([
      ...genreSuggestionAliases,
      ...Array.from(seen.values()).sort((left, right) =>
        left.localeCompare(right),
      ),
    ]);
  }, [cells]);
  const decades = useMemo(
    () =>
      yearExtent
        ? completionHeatmapDecades(minYear, maxYear)
        : ([] as number[]),
    [maxYear, minYear, yearExtent],
  );
  const selectedDecade = useMemo(() => {
    if (effectiveYearFrom === minYear && effectiveYearTo === maxYear) {
      return "all";
    }
    const matchingDecade = decades.find(
      (decade) =>
        effectiveYearFrom === Math.max(minYear, decade) &&
        effectiveYearTo === Math.min(maxYear, decade + 9),
    );
    return matchingDecade == null ? "custom" : String(matchingDecade);
  }, [decades, effectiveYearFrom, effectiveYearTo, maxYear, minYear]);
  const selection = useMemo(
    () =>
      selectCompletionHeatmap(cells, {
        yearFrom: effectiveYearFrom,
        yearTo: effectiveYearTo,
        genreLimit,
        includedGenres,
        excludedGenres,
      }),
    [
      cells,
      effectiveYearFrom,
      effectiveYearTo,
      excludedGenres,
      genreLimit,
      includedGenres,
    ],
  );
  const cellLookup = useMemo(() => {
    const nextLookup = new Map<string, DiscoveryHeatmapCell>();
    selection.cells.forEach((cell) =>
      nextLookup.set(`${cell.genreId}:${cell.year}`, cell),
    );
    return nextLookup;
  }, [selection.cells]);
  const gridStyle = {
    "--heatmap-columns": selection.years.length,
  } as CSSProperties & Record<"--heatmap-columns", number>;
  const hasActiveFilters =
    genreLimit !== 12 ||
    effectiveYearFrom !== minYear ||
    effectiveYearTo !== maxYear ||
    includedGenres.length > 0 ||
    excludedGenres.length > 0;

  function resetFilters() {
    setGenreLimit(12);
    setYearFrom(null);
    setYearTo(null);
    setIncludedGenres([]);
    setExcludedGenres([]);
  }

  function selectDecade(value: string) {
    if (value === "all") {
      setYearFrom(null);
      setYearTo(null);
      return;
    }
    if (value === "custom") return;
    const decade = Number(value);
    setYearFrom(Math.max(minYear, decade));
    setYearTo(Math.min(maxYear, decade + 9));
  }

  if (cells.length === 0) {
    return (
      <div className="empty-state">
        <Gauge size={20} />
        <span>{emptyLabel}</span>
      </div>
    );
  }

  return (
    <div className="heatmap-explorer">
      <div className="heatmap-controls">
        <div className="heatmap-filter-grid">
          <SelectField
            label="Genre rows"
            value={String(genreLimit)}
            onChange={(value) =>
              setGenreLimit(Number(value) as CompletionHeatmapGenreLimit)
            }
            options={completionHeatmapGenreLimits.map((limit) => ({
              value: String(limit),
              label: `Top ${limit}`,
            }))}
          />
          <SelectField
            label="Jump to decade"
            value={selectedDecade}
            onChange={selectDecade}
            options={[
              ...(selectedDecade === "custom"
                ? [
                    {
                      value: "custom",
                      label: `${effectiveYearFrom}–${effectiveYearTo}`,
                    },
                  ]
                : []),
              { value: "all", label: "All years" },
              ...decades.map((decade) => ({
                value: String(decade),
                label: `${decade}s`,
              })),
            ]}
          />
          <GenreListCriterion
            label="Include genres"
            values={includedGenres}
            onChange={setIncludedGenres}
            genreOptions={genreOptions}
            placeholder="Synthpop, AOR"
          />
          <GenreListCriterion
            label="Exclude genres"
            values={excludedGenres}
            onChange={setExcludedGenres}
            genreOptions={genreOptions}
            placeholder="Comedy, TV"
          />
          <button
            className="secondary-button heatmap-reset-button"
            type="button"
            disabled={!hasActiveFilters}
            onClick={resetFilters}
          >
            <RotateCcw size={15} />
            <span>Reset</span>
          </button>
        </div>
        <YearRangeSlider
          minYear={minYear}
          maxYear={maxYear}
          yearFrom={effectiveYearFrom}
          yearTo={effectiveYearTo}
          scopeLabel="Heatmap"
          onChange={(range) => {
            setYearFrom(range.from);
            setYearTo(range.to);
          }}
        />
        <div className="heatmap-selection-summary" aria-live="polite">
          <span>
            {`Showing ${formatNumber(selection.genres.length)} genres across ${formatNumber(selection.years.length)} years`}
          </span>
          <small>
            {`${formatNumber(selection.cells.length)} populated intersections · rows ranked by album count`}
          </small>
        </div>
      </div>

      {selection.genres.length === 0 ? (
        <div className="empty-state heatmap-filter-empty">
          <span>No genre/year intersections match these filters.</span>
          <button
            className="secondary-button"
            type="button"
            onClick={resetFilters}
          >
            Reset filters
          </button>
        </div>
      ) : (
        <div
          className="completion-heatmap-scroll"
          tabIndex={0}
          aria-label={`Completion heatmap for ${effectiveYearFrom} through ${effectiveYearTo}. Scroll horizontally for more years.`}
        >
          <div className="completion-heatmap" style={gridStyle}>
            <div className="heatmap-corner" />
            <div className="heatmap-years">
              {selection.years.map((year) => (
                <span key={year}>{year}</span>
              ))}
            </div>
            {selection.genres.map((genre) => (
              <div className="heatmap-row" key={genre.genreId}>
                <span className="heatmap-genre">
                  <span>{genre.genre}</span>
                  <small>{formatNumber(genre.albumCount)}</small>
                </span>
                <div className="heatmap-cells">
                  {selection.years.map((year) => {
                    const cell =
                      cellLookup.get(`${genre.genreId}:${year}`) ?? null;
                    if (!cell) {
                      return (
                        <span
                          className="heatmap-cell empty"
                          key={year}
                          aria-hidden="true"
                        />
                      );
                    }
                    const completion = cell.averageRatingCompleteness ?? 0;
                    return (
                      <button
                        className="heatmap-cell"
                        type="button"
                        key={year}
                        style={{ backgroundColor: heatmapColor(completion) }}
                        title={`${cell.genre} / ${cell.year}: ${formatPercent(completion)} complete`}
                        aria-label={`${cell.genre}, ${cell.year}: ${formatPercent(completion)} complete across ${formatNumber(cell.albumCount)} albums`}
                        onClick={() => onOpen(cell)}
                      >
                        <strong>{formatPercent(completion, 0)}</strong>
                        <span>{formatNumber(cell.albumCount)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function LoveRatingScatter({
  points,
  emptyLabel = "No loved/rating outliers yet.",
  onOpen,
}: {
  points: DiscoveryAlbumPoint[];
  emptyLabel?: string;
  onOpen: (point: DiscoveryAlbumPoint) => void;
}) {
  const scoreExtent = numericExtent(
    points,
    (point) => point.albumScore ?? point.effectiveAlbumRating,
  );
  const lovedExtent = numericExtent(points, (point) => point.lovedTracks);
  const maxLoved = Math.max(1, lovedExtent.max);

  if (points.length === 0) {
    return (
      <div className="empty-state">
        <Heart size={20} />
        <span>{emptyLabel}</span>
      </div>
    );
  }

  return (
    <div className="scatter-shell">
      <svg
        className="discovery-scatter"
        viewBox="0 0 340 220"
        role="img"
        aria-label="Loved tracks by album score"
      >
        <line x1="38" y1="178" x2="316" y2="178" />
        <line x1="38" y1="178" x2="38" y2="22" />
        <text x="318" y="198">
          Score
        </text>
        <text x="8" y="20">
          Love
        </text>
        <line className="scatter-guide" x1="38" y1="100" x2="316" y2="100" />
        <line className="scatter-guide" x1="177" y1="22" x2="177" y2="178" />
        {points.map((point) => {
          const score =
            point.albumScore ?? point.effectiveAlbumRating ?? scoreExtent.min;
          const x =
            38 + normalizedValue(score, scoreExtent.min, scoreExtent.max) * 278;
          const y = 178 - normalizedValue(point.lovedTracks, 0, maxLoved) * 156;
          const radius = 5 + clampRatio(point.ratingCompleteness) * 5;
          const label = `${point.album ?? "Untitled"} / ${point.albumArtistDisplay ?? ""}`;
          return (
            <circle
              role="button"
              tabIndex={0}
              className="scatter-point"
              key={point.albumId}
              cx={x}
              cy={y}
              r={radius}
              aria-label={`Open ${label}`}
              onClick={() => onOpen(point)}
              onKeyDown={(event) =>
                discoveryKeyOpen(event, () => onOpen(point))
              }
            >
              <title>
                {label}: {formatNumber(point.lovedTracks)} loved /{" "}
                {formatAverage(point.albumScore, 1)} score
              </title>
            </circle>
          );
        })}
      </svg>
    </div>
  );
}

export function GenreUniverse({
  points,
  emptyLabel = "No genre universe yet.",
  onOpen,
}: {
  points: DiscoveryGenrePoint[];
  emptyLabel?: string;
  onOpen: (point: DiscoveryGenrePoint) => void;
}) {
  const albumExtent = numericExtent(points, (point) => point.albumCount);
  const scoreExtent = numericExtent(points, (point) => point.averageAlbumScore);

  if (points.length === 0) {
    return (
      <div className="empty-state">
        <Tags size={20} />
        <span>{emptyLabel}</span>
      </div>
    );
  }

  return (
    <div className="bubble-plot genre-universe" aria-label="Genre universe">
      <span className="plot-axis plot-axis-x">Average score</span>
      <span className="plot-axis plot-axis-y">Completeness</span>
      {points.map((point) => {
        const size =
          58 +
          Math.sqrt(
            normalizedValue(point.albumCount, albumExtent.min, albumExtent.max),
          ) *
            74;
        const x =
          10 +
          normalizedValue(
            point.averageAlbumScore,
            scoreExtent.min,
            scoreExtent.max,
          ) *
            80;
        const y = 10 + clampRatio(point.averageRatingCompleteness) * 78;
        const style = {
          left: `${x}%`,
          bottom: `${y}%`,
          width: `${size}px`,
          height: `${size}px`,
          "--bubble-strength": clampRatio(point.averageRatingCompleteness),
        } as CSSProperties & Record<"--bubble-strength", number>;
        return (
          <button
            className="bubble-point"
            type="button"
            key={point.genreId}
            style={style}
            onClick={() => onOpen(point)}
          >
            <strong>{point.genre}</strong>
            <span>{formatNumber(point.albumCount)}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ArtistConstellation({
  points,
  emptyLabel = "No artist constellation yet.",
  onOpen,
}: {
  points: DiscoveryArtistPoint[];
  emptyLabel?: string;
  onOpen: (point: DiscoveryArtistPoint) => void;
}) {
  const albumExtent = numericExtent(points, (point) => point.albumCount);
  const scoreExtent = numericExtent(points, (point) => point.averageAlbumScore);
  const lovedExtent = numericExtent(points, (point) => point.lovedTracks);

  if (points.length === 0) {
    return (
      <div className="empty-state">
        <UsersRound size={20} />
        <span>{emptyLabel}</span>
      </div>
    );
  }

  return (
    <div
      className="bubble-plot artist-constellation"
      aria-label="Artist constellation"
    >
      <span className="plot-axis plot-axis-x">Catalog depth</span>
      <span className="plot-axis plot-axis-y">Average score</span>
      {points.map((point) => {
        const size =
          58 +
          Math.sqrt(
            normalizedValue(
              point.lovedTracks,
              lovedExtent.min,
              lovedExtent.max,
            ),
          ) *
            68;
        const x =
          10 +
          normalizedValue(point.albumCount, albumExtent.min, albumExtent.max) *
            80;
        const y =
          10 +
          normalizedValue(
            point.averageAlbumScore,
            scoreExtent.min,
            scoreExtent.max,
          ) *
            78;
        const style = {
          left: `${x}%`,
          bottom: `${y}%`,
          width: `${size}px`,
          height: `${size}px`,
          "--bubble-strength": clampRatio(point.averageRatingCompleteness),
        } as CSSProperties & Record<"--bubble-strength", number>;
        return (
          <button
            className="bubble-point artist"
            type="button"
            key={point.artistId}
            style={style}
            onClick={() => onOpen(point)}
          >
            <strong>{point.artist}</strong>
            <span>{formatNumber(point.albumCount)} albums</span>
          </button>
        );
      })}
    </div>
  );
}
