import {
  type Dispatch,
  type SetStateAction,
  useMemo,
  useState,
  useEffect,
} from "react";
import {
  type YearProgressStats,
  type GenreProgressStats,
  type RatingEvent,
} from "../../types";
import {
  type InsightCohort,
  genreCohort,
  ratingEventCohort,
} from "../../app/insightCohorts";
import {
  yearProgressExtent,
  completeYearProgressRows,
} from "../../app/yearProgress";
import { clampHeatmapYear, YearRangeSlider } from "../discovery/DiscoveryPlots";
import { completionHeatmapDecades } from "../../app/completionHeatmap";
import { getYearProgress, getGenreProgress } from "../../backend";
import {
  GenreListCriterion,
  SelectField,
} from "../../components/catalog/SearchCriteria";
import { RotateCcw, Tags, Activity } from "lucide-react";
import { formatNumber, formatPercent, formatAverage } from "../../app/display";
import { TransitionRegion } from "../../components/TransitionRegion";
import { YearLedger } from "../../components/YearLedger";
import {
  type GenreProgressLimit,
  type GenreProgressSort,
  selectGenreProgressRows,
  genreProgressLimits,
  fullyRatedGenreRatio,
} from "../../app/genreProgress";
import { discoveryKeyOpen } from "../../app/visualizationMath";

export type YearLedgerSelection = {
  yearFrom: number | null;
  yearTo: number | null;
  includedGenres: string[];
  excludedGenres: string[];
  selectedYear: number | null;
};

export function YearProgressExplorer({
  rows,
  genreOptions,
  onRequestGenreOptions,
  onSelect,
  selection,
  onSelectionChange,
}: {
  selection: YearLedgerSelection;
  onSelectionChange: Dispatch<SetStateAction<YearLedgerSelection>>;
  rows: YearProgressStats[];
  genreOptions: string[];
  onRequestGenreOptions?: () => void;
  onSelect: (cohort: InsightCohort) => void;
}) {
  const extent = useMemo(() => yearProgressExtent(rows), [rows]);
  const minYear = extent?.min ?? 0;
  const maxYear = extent?.max ?? 0;
  const { yearFrom, yearTo, includedGenres, excludedGenres } = selection;
  const setYearFrom = (yearFrom: number | null) =>
    onSelectionChange((current) => ({ ...current, yearFrom }));
  const setYearTo = (yearTo: number | null) =>
    onSelectionChange((current) => ({ ...current, yearTo }));
  const setIncludedGenres = (includedGenres: string[]) =>
    onSelectionChange((current) => ({ ...current, includedGenres }));
  const setExcludedGenres = (excludedGenres: string[]) =>
    onSelectionChange((current) => ({ ...current, excludedGenres }));
  const genreKey = JSON.stringify([includedGenres, excludedGenres]);
  const [resolvedGenreKey, setResolvedGenreKey] = useState<string | null>(null);
  const [genreRows, setGenreRows] = useState<YearProgressStats[]>(rows);
  const [isGenreLoading, setIsGenreLoading] = useState(false);
  const [genreError, setGenreError] = useState<string | null>(null);
  const effectiveYearFrom = clampHeatmapYear(yearFrom ?? minYear, 1, 9999);
  const effectiveYearTo = clampHeatmapYear(
    yearTo ?? maxYear,
    effectiveYearFrom,
    9999,
  );
  const decades = useMemo(
    () => (extent ? completionHeatmapDecades(minYear, maxYear) : []),
    [extent, maxYear, minYear],
  );
  const selectedDecade = useMemo(() => {
    if (effectiveYearFrom === minYear && effectiveYearTo === maxYear) {
      return "all";
    }
    const matchingDecade = decades.find(
      (decade) =>
        effectiveYearFrom === decade && effectiveYearTo === decade + 9,
    );
    return matchingDecade == null ? "custom" : String(matchingDecade);
  }, [decades, effectiveYearFrom, effectiveYearTo, maxYear, minYear]);
  const visibleRows = useMemo(
    () =>
      completeYearProgressRows(
        includedGenres.length || excludedGenres.length ? genreRows : rows,
        effectiveYearFrom,
        effectiveYearTo,
      ),
    [
      effectiveYearFrom,
      effectiveYearTo,
      genreRows,
      rows,
      includedGenres,
      excludedGenres,
    ],
  );
  const hasGenreFilters =
    includedGenres.length > 0 || excludedGenres.length > 0;
  const hasActiveFilters =
    hasGenreFilters ||
    effectiveYearFrom !== minYear ||
    effectiveYearTo !== maxYear;

  useEffect(() => {
    let cancelled = false;
    if (!hasGenreFilters) {
      setGenreRows(rows);
      setGenreError(null);
      setIsGenreLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setIsGenreLoading(true);
    setGenreError(null);
    const timeoutId = window.setTimeout(() => {
      void getYearProgress({
        genres: includedGenres,
        excludedGenres,
      })
        .then((nextRows) => {
          if (!cancelled) {
            setGenreRows(nextRows);
            setResolvedGenreKey(genreKey);
          }
        })
        .catch((error) => {
          if (!cancelled) {
            setGenreError(
              error instanceof Error
                ? error.message
                : "Could not filter year progress.",
            );
          }
        })
        .finally(() => {
          if (!cancelled) setIsGenreLoading(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [excludedGenres, hasGenreFilters, includedGenres, rows, genreKey]);

  const isPending =
    !genreError &&
    (isGenreLoading || (hasGenreFilters && resolvedGenreKey !== genreKey));

  function selectDecade(value: string) {
    if (value === "all") {
      onSelectionChange((current) => ({
        ...current,
        yearFrom: null,
        yearTo: null,
      }));
      return;
    }
    if (value === "custom") return;
    const decade = Number(value);
    onSelectionChange((current) => ({
      ...current,
      yearFrom: decade,
      yearTo: decade + 9,
    }));
  }

  function resetFilters() {
    onSelectionChange({
      yearFrom: null,
      yearTo: null,
      includedGenres: [],
      excludedGenres: [],
      selectedYear: null,
    });
  }

  return (
    <div className="year-progress-explorer">
      <div className="year-progress-controls ledger-controls">
        <div className="ledger-filter-row">
          <GenreListCriterion
            label="Genres"
            values={includedGenres}
            onChange={setIncludedGenres}
            genreOptions={genreOptions}
            onRequestOptions={onRequestGenreOptions}
            placeholder="Add genres…"
          />
          <div className="ledger-year-inputs" aria-label="Album year range">
            <label>
              From
              <input
                type="number"
                aria-label="Year progress year from"
                min={1}
                max={effectiveYearTo}
                key={`from-${effectiveYearFrom}`}
                defaultValue={extent ? effectiveYearFrom : ""}
                disabled={!extent}
                onBlur={(event) => {
                  const value = clampHeatmapYear(
                    Number(event.target.value),
                    1,
                    effectiveYearTo,
                  );
                  event.target.value = String(value);
                  setYearFrom(value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
            </label>
            <label>
              To
              <input
                type="number"
                aria-label="Year progress year to"
                min={effectiveYearFrom}
                max={9999}
                key={`to-${effectiveYearTo}`}
                defaultValue={extent ? effectiveYearTo : ""}
                disabled={!extent}
                onBlur={(event) => {
                  const value = clampHeatmapYear(
                    Number(event.target.value),
                    effectiveYearFrom,
                    9999,
                  );
                  event.target.value = String(value);
                  setYearTo(value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
            </label>
          </div>
          <button
            className="secondary-button"
            type="button"
            disabled={!hasActiveFilters}
            onClick={resetFilters}
          >
            <RotateCcw size={15} />
            Reset
          </button>
        </div>
        <div className="ledger-secondary-filters">
          <div className="ledger-decades" aria-label="Decade shortcuts">
            {["all", ...decades.map(String)].map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={selectedDecade === value}
                onClick={() => selectDecade(value)}
              >
                {value === "all" ? "All years" : `${value}s`}
              </button>
            ))}
          </div>
          <details className="ledger-exclusions">
            <summary>
              Exclude genres
              {excludedGenres.length ? ` (${excludedGenres.length})` : ""}
            </summary>
            <GenreListCriterion
              label="Exclude genres"
              values={excludedGenres}
              onChange={setExcludedGenres}
              genreOptions={genreOptions}
              onRequestOptions={onRequestGenreOptions}
              placeholder="Comedy, TV"
            />
          </details>
        </div>
        <div className="heatmap-selection-summary" aria-live="polite">
          <span>
            {isPending
              ? "Updating genre totals…"
              : `Showing ${formatNumber(visibleRows.length)} years · oldest first`}
          </span>
          <small>
            {hasGenreFilters
              ? "Genre filters use canonical album genres; scores includes film, TV, and game scores."
              : "All canonical album genres included."}
          </small>
        </div>
        {genreError ? (
          <p className="year-progress-error" role="alert">
            {genreError}
          </p>
        ) : null}
      </div>
      <TransitionRegion>
        <YearLedger
          selectedYear={selection.selectedYear}
          onSelectedYearChange={(selectedYear) =>
            onSelectionChange((current) => ({ ...current, selectedYear }))
          }
          busy={isPending}
          error={genreError}
          rows={!extent || isPending || genreError ? [] : visibleRows}
          genres={includedGenres}
          excludedGenres={excludedGenres}
          onOpen={onSelect}
        />
      </TransitionRegion>
    </div>
  );
}

export function GenreProgressExplorer({
  rows,
  yearRows,
  genreOptions,
  onRequestGenreOptions,
  onSelect,
}: {
  rows: GenreProgressStats[];
  yearRows: YearProgressStats[];
  genreOptions: string[];
  onRequestGenreOptions?: () => void;
  onSelect: (cohort: InsightCohort) => void;
}) {
  const extent = useMemo(() => yearProgressExtent(yearRows), [yearRows]);
  const minYear = extent?.min ?? 0;
  const maxYear = extent?.max ?? 0;
  const [yearFrom, setYearFrom] = useState<number | null>(null);
  const [yearTo, setYearTo] = useState<number | null>(null);
  const [includedGenres, setIncludedGenres] = useState<string[]>([]);
  const [excludedGenres, setExcludedGenres] = useState<string[]>([]);
  const [genreLimit, setGenreLimit] = useState<GenreProgressLimit>(12);
  const [genreSort, setGenreSort] = useState<GenreProgressSort>("popularity");
  const [filteredRows, setFilteredRows] = useState<GenreProgressStats[]>(rows);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  const decades = useMemo(
    () => (extent ? completionHeatmapDecades(minYear, maxYear) : []),
    [extent, maxYear, minYear],
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
  const hasYearFilter =
    extent != null &&
    (effectiveYearFrom !== minYear || effectiveYearTo !== maxYear);
  const hasAggregationFilters =
    hasYearFilter || includedGenres.length > 0 || excludedGenres.length > 0;
  const hasActiveControls =
    hasAggregationFilters || genreLimit !== 12 || genreSort !== "popularity";
  const visibleRows = useMemo(
    () => selectGenreProgressRows(filteredRows, genreLimit, genreSort),
    [filteredRows, genreLimit, genreSort],
  );

  useEffect(() => {
    let cancelled = false;
    if (!hasAggregationFilters) {
      setFilteredRows(rows);
      setError(null);
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const timeoutId = window.setTimeout(() => {
      setIsLoading(true);
      setError(null);
      void getGenreProgress({
        yearFrom: hasYearFilter ? effectiveYearFrom : null,
        yearTo: hasYearFilter ? effectiveYearTo : null,
        genres: includedGenres,
        excludedGenres,
      })
        .then((nextRows) => {
          if (!cancelled) setFilteredRows(nextRows);
        })
        .catch((nextError) => {
          if (!cancelled) {
            setError(
              nextError instanceof Error
                ? nextError.message
                : "Could not filter genre progress.",
            );
          }
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    effectiveYearFrom,
    effectiveYearTo,
    excludedGenres,
    hasAggregationFilters,
    hasYearFilter,
    includedGenres,
    rows,
  ]);

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

  function resetFilters() {
    setYearFrom(null);
    setYearTo(null);
    setIncludedGenres([]);
    setExcludedGenres([]);
    setGenreLimit(12);
    setGenreSort("popularity");
  }

  return (
    <div className="genre-progress-explorer">
      {extent ? (
        <div className="heatmap-controls genre-progress-controls">
          <div className="heatmap-filter-grid genre-progress-filter-grid">
            <SelectField
              label="Genres shown"
              value={String(genreLimit)}
              onChange={(value) =>
                setGenreLimit(
                  value === "all"
                    ? "all"
                    : (Number(value) as GenreProgressLimit),
                )
              }
              options={genreProgressLimits.map((limit) => ({
                value: String(limit),
                label: limit === "all" ? "All genres" : `Top ${limit}`,
              }))}
            />
            <SelectField
              label="Sort genres"
              value={genreSort}
              onChange={(value) => setGenreSort(value as GenreProgressSort)}
              options={[
                { value: "popularity", label: "Popularity" },
                { value: "name", label: "Name A–Z" },
              ]}
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
              onRequestOptions={onRequestGenreOptions}
              placeholder="Synthpop, scores"
            />
            <GenreListCriterion
              label="Exclude genres"
              values={excludedGenres}
              onChange={setExcludedGenres}
              genreOptions={genreOptions}
              onRequestOptions={onRequestGenreOptions}
              placeholder="Comedy, TV"
            />
            <button
              className="secondary-button heatmap-reset-button"
              type="button"
              disabled={!hasActiveControls}
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
            scopeLabel="Genre progress"
            onChange={(range) => {
              setYearFrom(range.from);
              setYearTo(range.to);
            }}
          />
          <div className="heatmap-selection-summary" aria-live="polite">
            <span>
              {isLoading
                ? "Updating genre totals…"
                : `Showing ${formatNumber(visibleRows.length)} of ${formatNumber(filteredRows.length)} matching genres`}
            </span>
            <small>
              {genreSort === "popularity"
                ? "Ranked by album popularity"
                : "Sorted by name"}
              {
                " · oldest decades listed first · scores includes film, TV, and game scores"
              }
            </small>
          </div>
          {error ? (
            <p className="year-progress-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
      <TransitionRegion>
        <GenreProgressTable
          rows={visibleRows}
          filtered={hasAggregationFilters}
          yearFrom={hasYearFilter ? effectiveYearFrom : null}
          yearTo={hasYearFilter ? effectiveYearTo : null}
          excludedGenres={excludedGenres}
          onSelect={onSelect}
        />
      </TransitionRegion>
    </div>
  );
}

export function GenreProgressTable({
  rows,
  filtered = false,
  yearFrom,
  yearTo,
  excludedGenres,
  onSelect,
}: {
  rows: GenreProgressStats[];
  filtered?: boolean;
  yearFrom: number | null;
  yearTo: number | null;
  excludedGenres: string[];
  onSelect: (cohort: InsightCohort) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <Tags size={20} />
        <span>
          {filtered
            ? "No genres match these filters."
            : "No genre statistics yet."}
        </span>
      </div>
    );
  }

  return (
    <div className="stats-table genre-stats-table" role="table">
      <div className="stats-table-head" role="row">
        <span role="columnheader">Genre</span>
        <span role="columnheader">Albums</span>
        <span role="columnheader">Rated</span>
        <span role="columnheader">Fully rated %</span>
        <span role="columnheader">Partial</span>
        <span role="columnheader">Loved</span>
        <span role="columnheader">Score</span>
      </div>
      {rows.map((row) => (
        <div
          className="stats-table-row actionable-cohort"
          role="row"
          tabIndex={0}
          key={row.genre}
          onClick={() =>
            onSelect(genreCohort(row, yearFrom, yearTo, excludedGenres))
          }
          onKeyDown={(event) =>
            discoveryKeyOpen(event, () =>
              onSelect(genreCohort(row, yearFrom, yearTo, excludedGenres)),
            )
          }
        >
          <span role="cell">{row.genre}</span>
          <span role="cell">{formatNumber(row.albumCount)}</span>
          <span role="cell">{formatNumber(row.ratedAlbumCount)}</span>
          <span role="cell">{formatPercent(fullyRatedGenreRatio(row))}</span>
          <span role="cell">{formatNumber(row.partialAlbumCount)}</span>
          <span role="cell">{formatNumber(row.lovedTracks)}</span>
          <span role="cell">{formatAverage(row.averageAlbumScore, 1)}</span>
        </div>
      ))}
    </div>
  );
}

export function eventLabel(eventType: string) {
  const labels: Record<string, string> = {
    addedPartial: "Added partial",
    addedRated: "Added rated",
    completed: "Completed",
    ratedLess: "Rated less",
    ratedMore: "Rated more",
    ratingChanged: "Rating changed",
    ratingUpdated: "Rating updated",
    removedRated: "Removed rated",
  };
  return labels[eventType] ?? eventType;
}

export function RatingEventList({
  events,
  onSelect,
}: {
  events: RatingEvent[];
  onSelect: (cohort: InsightCohort) => void;
}) {
  if (events.length === 0) {
    return (
      <div className="empty-state">
        <Activity size={20} />
        <span>No rating events yet.</span>
      </div>
    );
  }

  return (
    <div className="rating-event-list">
      {events.slice(0, 8).map((event) => (
        <article
          className="rating-event actionable-cohort"
          role="button"
          tabIndex={0}
          key={event.id}
          onClick={() => onSelect(ratingEventCohort(event))}
          onKeyDown={(keyboardEvent) =>
            discoveryKeyOpen(keyboardEvent, () =>
              onSelect(ratingEventCohort(event)),
            )
          }
        >
          <strong>{eventLabel(event.eventType)}</strong>
          <span>
            {[event.albumArtistDisplay, event.album, event.year]
              .filter(Boolean)
              .join(" / ")}
          </span>
          <small>
            {formatPercent(event.previousRatingCompleteness, 0) || "New"}
            {" -> "}
            {formatPercent(event.currentRatingCompleteness, 0) || "Removed"}
          </small>
        </article>
      ))}
    </div>
  );
}
