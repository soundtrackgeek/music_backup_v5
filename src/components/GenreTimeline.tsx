import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Clock3,
  Info,
  RotateCcw,
  Search,
  Tags,
} from "lucide-react";
import {
  genreTimelineColor,
  genreTimelineExtent,
  genreTimelineLimits,
  genreTimelineTicks,
  selectGenreTimelineRows,
  summarizeGenreTimeline,
  type GenreTimelineColorMetric,
  type GenreTimelineLimit,
  type GenreTimelineRangeMode,
  type GenreTimelineSort,
} from "../app/genreTimeline";
import type { GenreSummary } from "../types";

type GenreTimelineProps = {
  genres: GenreSummary[] | null;
  totalGenres: number;
  isLoading: boolean;
  error: string | null;
  selectedGenreId: string | null;
  resetSignal: number;
  onSelect: (genreId: string) => void;
};

const rangeOptions: { value: GenreTimelineRangeMode; label: string }[] = [
  { value: "overlaps", label: "Overlaps" },
  { value: "starts", label: "Starts in" },
  { value: "ends", label: "Ends in" },
  { value: "contained", label: "Contained" },
];

const sortOptions: { value: GenreTimelineSort; label: string }[] = [
  { value: "earliest", label: "Earliest start" },
  { value: "latest", label: "Latest release" },
  { value: "longest", label: "Longest span" },
  { value: "albums", label: "Most albums" },
  { value: "name", label: "Genre name" },
];

const colorOptions: { value: GenreTimelineColorMetric; label: string }[] = [
  { value: "none", label: "None" },
  { value: "albums", label: "Albums" },
  { value: "completeness", label: "Completeness" },
  { value: "loved", label: "Loved tracks" },
];

function formatCount(value: number) {
  return new Intl.NumberFormat().format(value);
}

function albumCountLabel(value: number) {
  return `${formatCount(value)} ${value === 1 ? "album" : "albums"}`;
}

function colorMetricLabel(
  genre: GenreSummary,
  metric: GenreTimelineColorMetric,
) {
  switch (metric) {
    case "completeness":
      return `${((genre.averageRatingCompleteness ?? 0) * 100).toFixed(1)}% complete`;
    case "loved":
      return `${formatCount(genre.lovedTracks)} loved`;
    default:
      return albumCountLabel(genre.albumCount);
  }
}

export function GenreTimeline({
  genres,
  totalGenres,
  isLoading,
  error,
  selectedGenreId,
  resetSignal,
  onSelect,
}: GenreTimelineProps) {
  const [searchText, setSearchText] = useState("");
  const [yearFrom, setYearFrom] = useState<number | null>(null);
  const [yearTo, setYearTo] = useState<number | null>(null);
  const [rangeMode, setRangeMode] =
    useState<GenreTimelineRangeMode>("overlaps");
  const [minimumAlbums, setMinimumAlbums] = useState(1);
  const [sort, setSort] = useState<GenreTimelineSort>("earliest");
  const [limit, setLimit] = useState<GenreTimelineLimit>(25);
  const [colorMetric, setColorMetric] =
    useState<GenreTimelineColorMetric>("none");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const allGenres = genres ?? [];
  const extent = useMemo(() => genreTimelineExtent(allGenres), [allGenres]);
  const effectiveYearFrom = yearFrom ?? extent?.minimum ?? 0;
  const effectiveYearTo = yearTo ?? extent?.maximum ?? 0;
  const axisFrom = Math.min(effectiveYearFrom, effectiveYearTo);
  const axisTo = Math.max(effectiveYearFrom, effectiveYearTo);

  useEffect(() => {
    setSearchText("");
    setYearFrom(null);
    setYearTo(null);
    setRangeMode("overlaps");
    setMinimumAlbums(1);
    setSort("earliest");
    setLimit(25);
    setColorMetric("none");
  }, [resetSignal]);

  const selection = useMemo(
    () =>
      selectGenreTimelineRows(allGenres, {
        searchText,
        yearFrom: effectiveYearFrom,
        yearTo: effectiveYearTo,
        rangeMode,
        minimumAlbums,
        sort,
        limit,
      }),
    [
      allGenres,
      effectiveYearFrom,
      effectiveYearTo,
      limit,
      minimumAlbums,
      rangeMode,
      searchText,
      sort,
    ],
  );
  const summary = useMemo(
    () => summarizeGenreTimeline(selection.matchedRows),
    [selection.matchedRows],
  );
  const ticks = useMemo(
    () => genreTimelineTicks(axisFrom, axisTo),
    [axisFrom, axisTo],
  );
  const plotSpan = Math.max(1, axisTo - axisFrom);

  function resetTimeline() {
    setSearchText("");
    setYearFrom(null);
    setYearTo(null);
    setRangeMode("overlaps");
    setMinimumAlbums(1);
    setSort("earliest");
    setLimit(25);
    setColorMetric("none");
  }

  return (
    <section className="table-panel genre-timeline-panel" aria-label="Genre timeline">
      <div className="panel-heading compact genre-timeline-heading">
        <div>
          <h2>Genre timeline</h2>
          <p>First and last release years observed in your library.</p>
        </div>
        <div className="genre-timeline-heading-actions">
          <button
            className="icon-button"
            type="button"
            aria-label="Reset genre timeline filters"
            onClick={resetTimeline}
          >
            <RotateCcw size={17} />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label={isCollapsed ? "Expand genre timeline" : "Collapse genre timeline"}
            aria-expanded={!isCollapsed}
            onClick={() => setIsCollapsed((value) => !value)}
          >
            {isCollapsed ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
          </button>
        </div>
      </div>

      {!isCollapsed ? (
        <>
          <div className="genre-timeline-summary" aria-label="Filtered timeline summary">
            <div>
              <span className="genre-timeline-summary-icon">
                <CalendarDays size={17} />
              </span>
              <span>
                <small>Earliest start</small>
                <strong>{summary.earliestStart ?? "—"}</strong>
              </span>
            </div>
            <div>
              <span className="genre-timeline-summary-icon">
                <CalendarDays size={17} />
              </span>
              <span>
                <small>Latest release</small>
                <strong>{summary.latestRelease ?? "—"}</strong>
              </span>
            </div>
            <div>
              <span className="genre-timeline-summary-icon">
                <Clock3 size={17} />
              </span>
              <span>
                <small>Longest span</small>
                <strong>
                  {summary.longestSpan
                    ? `${summary.longestSpan} ${summary.longestSpan === 1 ? "year" : "years"}`
                    : "—"}
                </strong>
              </span>
            </div>
          </div>

          <div className="genre-timeline-controls">
            <label className="genre-timeline-search">
              <span className="sr-only">Search timeline genres</span>
              <Search size={17} />
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search timeline genres"
              />
            </label>
            <label className="genre-timeline-field">
              <span>Year from</span>
              <input
                type="number"
                value={effectiveYearFrom || ""}
                disabled={!extent}
                onChange={(event) =>
                  setYearFrom(event.target.value ? Number(event.target.value) : null)
                }
              />
            </label>
            <label className="genre-timeline-field">
              <span>Year to</span>
              <input
                type="number"
                value={effectiveYearTo || ""}
                disabled={!extent}
                onChange={(event) =>
                  setYearTo(event.target.value ? Number(event.target.value) : null)
                }
              />
            </label>
            <div className="genre-timeline-range-control">
              <span>Range match</span>
              <div role="group" aria-label="Timeline year range match">
                {rangeOptions.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    aria-pressed={rangeMode === option.value}
                    onClick={() => setRangeMode(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="genre-timeline-field genre-timeline-minimum">
              <span>Min albums</span>
              <input
                type="number"
                min={0}
                value={minimumAlbums}
                onChange={(event) =>
                  setMinimumAlbums(Math.max(0, Number(event.target.value) || 0))
                }
              />
            </label>
            <label className="genre-timeline-field">
              <span>Sort</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as GenreTimelineSort)}
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="genre-timeline-field">
              <span>Show</span>
              <select
                value={String(limit)}
                onChange={(event) =>
                  setLimit(
                    event.target.value === "all"
                      ? "all"
                      : (Number(event.target.value) as GenreTimelineLimit),
                  )
                }
              >
                {genreTimelineLimits.map((value) => (
                  <option key={value} value={value}>
                    {value === "all" ? "All" : value}
                  </option>
                ))}
              </select>
            </label>
            <label className="genre-timeline-field">
              <span>Color by</span>
              <select
                value={colorMetric}
                onChange={(event) =>
                  setColorMetric(event.target.value as GenreTimelineColorMetric)
                }
              >
                {colorOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button className="genre-timeline-reset" type="button" onClick={resetTimeline}>
              Reset
            </button>
          </div>

          {error ? <p className="error-message">{error}</p> : null}

          <div className="genre-timeline-results-meta" aria-live="polite">
            <span>
              {isLoading
                ? "Loading genre timeline"
                : `${formatCount(selection.rows.length)} of ${formatCount(selection.matchedRows.length)} matching`}
            </span>
            <span>
              {formatCount(selection.datedTotal)} of {formatCount(totalGenres)} genres have observed years
            </span>
          </div>

          {!genres && isLoading ? (
            <div className="empty-state large">
              <Tags size={20} />
              <span>Loading genre timeline.</span>
            </div>
          ) : selection.rows.length === 0 ? (
            <div className="empty-state large">
              <Tags size={20} />
              <span>No genres match the timeline filters.</span>
            </div>
          ) : (
            <div className="genre-timeline-chart">
              <div className="genre-timeline-axis" aria-hidden="true">
                <span />
                <span className="genre-timeline-axis-track">
                  {ticks.map((tick) => (
                    <span
                      className="genre-timeline-tick"
                      key={tick}
                      style={{ left: `${((tick - axisFrom) / plotSpan) * 100}%` }}
                    >
                      {tick}
                    </span>
                  ))}
                </span>
                <span>Observed span</span>
              </div>
              <div className="genre-timeline-rows">
                {selection.rows.map((genre) => {
                  const firstYear = genre.firstYear ?? axisFrom;
                  const lastYear = genre.lastYear ?? axisTo;
                  const visibleStart = Math.max(firstYear, axisFrom);
                  const visibleEnd = Math.min(lastYear, axisTo);
                  const left = ((visibleStart - axisFrom) / plotSpan) * 100;
                  const width = Math.max(
                    1.5,
                    ((Math.max(visibleStart, visibleEnd) - visibleStart) / plotSpan) *
                      100,
                  );
                  const isSelected = genre.id === selectedGenreId;
                  return (
                    <button
                      className={`genre-timeline-row${isSelected ? " selected" : ""}`}
                      type="button"
                      key={genre.id}
                      aria-pressed={isSelected}
                      aria-label={`${genre.name}, observed ${firstYear} to ${lastYear}, ${albumCountLabel(genre.albumCount)}${colorMetric === "none" || colorMetric === "albums" ? "" : `, ${colorMetricLabel(genre, colorMetric)}`}`}
                      onClick={() => onSelect(genre.id)}
                    >
                      <span className="genre-timeline-label">
                        <span className="genre-timeline-initial" aria-hidden="true">
                          {genre.name.trim().slice(0, 1).toUpperCase() || "G"}
                        </span>
                        <span>
                          <strong>{genre.name}</strong>
                          <small>{colorMetricLabel(genre, colorMetric)}</small>
                        </span>
                      </span>
                      <span className="genre-timeline-track" aria-hidden="true">
                        {ticks.map((tick) => (
                          <span
                            className="genre-timeline-guide"
                            key={tick}
                            style={{ left: `${((tick - axisFrom) / plotSpan) * 100}%` }}
                          />
                        ))}
                        <span
                          className="genre-timeline-bar"
                          style={{
                            left: `${left}%`,
                            width: `${Math.min(100 - left, width)}%`,
                            backgroundColor: genreTimelineColor(
                              genre,
                              selection.matchedRows,
                              colorMetric,
                            ),
                          }}
                        />
                      </span>
                      <span className="genre-timeline-years">
                        {firstYear === lastYear ? firstYear : `${firstYear}–${lastYear}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <p className="genre-timeline-note">
            <Info size={15} />
            <span>
              Observed years describe this library, not the historical origin or end of a genre.
            </span>
          </p>
        </>
      ) : null}
    </section>
  );
}
