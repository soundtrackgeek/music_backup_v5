import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";

import {
  ArrowCounterClockwise,
  CalendarBlank,
  FunnelSimple,
  Info,
  MagnifyingGlass,
  Plus,
  SlidersHorizontal,
  WarningCircle,
  WaveSine,
  X,
} from "@phosphor-icons/react";
import {
  useEffect,
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
} from "react";

import { getGenreTimeline } from "../backend";
import {
  buildGenreConstellationLayout,
  createGenreTimelineRequest,
  genreConstellationAlbumPosition,
  genreConstellationLimits,
  type GenreConstellationLimit,
} from "../app/genreTimeline";
import type { GenreTimelineResponse } from "../types";

type GenreTimelineProps = {
  genreOptions: string[];
  onOpenAlbum: (albumId: string) => void;
  onRequestGenreOptions?: () => void;
};

type GenreTokenFieldProps = {
  label: string;
  tone: "include" | "exclude";
  values: string[];
  options: string[];
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  onRequestOptions?: () => void;
};

function formatCount(value: number) {
  return new Intl.NumberFormat().format(value);
}

function normalizedGenre(value: string) {
  return value.trim().toLocaleLowerCase();
}

function GenreTokenField({
  label,
  tone,
  values,
  options,
  onAdd,
  onRemove,
  onRequestOptions,
}: GenreTokenFieldProps) {
  const [draft, setDraft] = useState("");
  const listId = useId();

  function commitDraft() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    const canonical =
      options.find(
        (option) => normalizedGenre(option) === normalizedGenre(trimmed),
      ) ?? trimmed;
    onAdd(canonical);
    setDraft("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commitDraft();
    }
  }

  return (
    <div className={`genre-constellation-token-field ${tone}`}>
      <span className="genre-constellation-control-label">{label}</span>
      <div className="genre-constellation-token-input">
        <FunnelSimple size={15} aria-hidden="true" />
        <input
          aria-label={`${label} genre`}
          value={draft}
          list={listId}
          placeholder={tone === "include" ? "Add genre or Scores" : "Hide a genre"}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={onRequestOptions}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          aria-label={`Add ${label.toLocaleLowerCase()} genre`}
          disabled={!draft.trim()}
          onClick={commitDraft}
        >
          <Plus size={14} />
        </button>
      </div>
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      {values.length > 0 ? (
        <div
          className="genre-constellation-filter-chips"
          aria-label={`${label} filters`}
        >
          {values.map((value) => (
            <button
              type="button"
              key={value}
              onClick={() => onRemove(value)}
              aria-label={`Remove ${value} from ${label.toLocaleLowerCase()}`}
            >
              <span>{value}</span>
              <X size={11} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function GenreTimeline({
  genreOptions,
  onOpenAlbum,
  onRequestGenreOptions,
}: GenreTimelineProps) {
  const [response, setResponse] = useState<GenreTimelineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [yearFromInput, setYearFromInput] = useState<string | null>(null);
  const [yearToInput, setYearToInput] = useState<string | null>(null);
  const [includedGenres, setIncludedGenres] = useState<string[]>([]);
  const [excludedGenres, setExcludedGenres] = useState<string[]>([]);
  const [genreLimit, setGenreLimit] = useState<GenreConstellationLimit>(7);
  const [focusedGenreId, setFocusedGenreId] = useState<string | null>(null);
  const [hoveredGenreId, setHoveredGenreId] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<"dots" | "density">("dots");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [genreSearch, setGenreSearch] = useState("");
  const yearFrom =
    yearFromInput != null && yearFromInput.trim()
      ? Number(yearFromInput)
      : null;
  const yearTo =
    yearToInput != null && yearToInput.trim() ? Number(yearToInput) : null;

  const request = useMemo(
    () =>
      createGenreTimelineRequest({
        yearFrom,
        yearTo,
        includedGenres,
        excludedGenres,
        genreLimit,
      }),
    [excludedGenres, genreLimit, includedGenres, yearFrom, yearTo],
  );

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      setError(null);
      void getGenreTimeline(request)
        .then((nextResponse) => {
          if (!cancelled) {
            setResponse(nextResponse);
            setFocusedGenreId((current) =>
              current && nextResponse.genres.some((genre) => genre.id === current)
                ? current
                : null,
            );
          }
        })
        .catch((timelineError) => {
          if (!cancelled) {
            setError(
              timelineError instanceof Error
                ? timelineError.message
                : String(timelineError),
            );
          }
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [request]);

  const effectiveYearFrom =
    yearFrom ?? response?.availableYearFrom ?? new Date().getFullYear();
  const effectiveYearTo = yearTo ?? response?.availableYearTo ?? effectiveYearFrom;
  const layout = useMemo(
    () =>
      response
        ? buildGenreConstellationLayout(response, {
            yearFrom: effectiveYearFrom,
            yearTo: effectiveYearTo,
          })
        : null,
    [effectiveYearFrom, effectiveYearTo, response],
  );
  const activeGenreId = hoveredGenreId ?? focusedGenreId;
  const focusedGenre =
    response?.genres.find((genre) => genre.id === focusedGenreId) ?? null;
  const bandByGenre = useMemo(
    () => new Map(layout?.bands.map((band) => [band.genre.id, band]) ?? []),
    [layout],
  );
  const albumDots = useMemo(() => {
    if (!response || !layout) return [];
    return response.albums.flatMap((album) => {
      const band = bandByGenre.get(album.genreId);
      if (!band) return [];
      const position = genreConstellationAlbumPosition(album, band, layout);
      return [{ album, band, ...position }];
    });
  }, [bandByGenre, layout, response]);
  const normalizedSearch = normalizedGenre(genreSearch);
  const searchMatches = useMemo(
    () =>
      new Set(
        response?.genres
          .filter((genre) =>
            normalizedGenre(genre.name).includes(normalizedSearch),
          )
          .map((genre) => genre.id) ?? [],
      ),
    [normalizedSearch, response],
  );

  function isGenreDimmed(genreId: string) {
    if (activeGenreId) return activeGenreId !== genreId;
    return Boolean(normalizedSearch && !searchMatches.has(genreId));
  }

  function toggleGenreFocus(genreId: string) {
    setFocusedGenreId((current) => (current === genreId ? null : genreId));
  }

  function addGenreFilter(tone: "include" | "exclude", value: string) {
    const normalized = normalizedGenre(value);
    if (!normalized) return;
    const addUnique = (items: string[]) =>
      items.some((item) => normalizedGenre(item) === normalized)
        ? items
        : [...items, value];
    const removeMatching = (items: string[]) =>
      items.filter((item) => normalizedGenre(item) !== normalized);

    if (tone === "include") {
      setIncludedGenres(addUnique);
      setExcludedGenres(removeMatching);
    } else {
      setExcludedGenres(addUnique);
      setIncludedGenres(removeMatching);
    }
  }

  function resetFilters() {
    setYearFromInput(null);
    setYearToInput(null);
    setIncludedGenres([]);
    setExcludedGenres([]);
    setGenreLimit(7);
    setFocusedGenreId(null);
    setGenreSearch("");
  }

  const genreOptionsWithScores = useMemo(
    () =>
      Array.from(new Set(["Scores", ...genreOptions])).sort((left, right) =>
        left.localeCompare(right),
      ),
    [genreOptions],
  );
  const overviewLeft = response?.availableYearFrom != null && layout
    ? ((layout.yearFrom - response.availableYearFrom) /
        Math.max(1, (response.availableYearTo ?? layout.yearTo) - response.availableYearFrom)) *
      100
    : 0;
  const overviewRight = response?.availableYearTo != null && layout
    ? ((response.availableYearTo - layout.yearTo) /
        Math.max(1, response.availableYearTo - (response.availableYearFrom ?? layout.yearFrom))) *
      100
    : 0;

  return (
    <section
      className={`genre-constellation-page mode-${displayMode}`}
      aria-label="Genre constellation timeline"
    >
      <header className="genre-constellation-toolbar">
        <div className="genre-constellation-title">
          <h2>Genre constellation</h2>
          <span aria-live="polite">
            {formatCount(response?.matchingAlbumCount ?? 0)} albums ·{" "}
            {formatCount(response?.matchingGenreCount ?? 0)} genres
          </span>
        </div>
        <div className="genre-constellation-actions">
          <div className="genre-constellation-mode" aria-label="Constellation display">
            <button
              type="button"
              className={displayMode === "dots" ? "active" : ""}
              aria-pressed={displayMode === "dots"}
              onClick={() => setDisplayMode("dots")}
            >
              <span />
              Dots
            </button>
            <button
              type="button"
              className={displayMode === "density" ? "active" : ""}
              aria-pressed={displayMode === "density"}
              onClick={() => setDisplayMode("density")}
            >
              Density
            </button>
          </div>
          <button
            type="button"
            className={searchOpen ? "active" : ""}
            aria-label="Search visible genres"
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((current) => !current)}
          >
            <MagnifyingGlass size={18} />
          </button>
          <button
            type="button"
            className={filtersOpen ? "active" : ""}
            aria-label="Genre constellation filters"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((current) => !current)}
          >
            <SlidersHorizontal size={18} />
          </button>
        </div>
      </header>

      {searchOpen ? (
        <label className="genre-constellation-search">
          <MagnifyingGlass size={16} />
          <input
            autoFocus
            type="search"
            aria-label="Find visible genre"
            placeholder="Find a visible genre"
            value={genreSearch}
            onChange={(event) => setGenreSearch(event.target.value)}
          />
          {genreSearch ? (
            <button
              type="button"
              aria-label="Clear genre search"
              onClick={() => setGenreSearch("")}
            >
              <X size={14} />
            </button>
          ) : null}
        </label>
      ) : null}

      {filtersOpen ? (
        <section
          className="genre-constellation-controls"
          aria-label="Genre constellation filters"
        >
          <GenreTokenField
            label="Include"
            tone="include"
            values={includedGenres}
            options={genreOptionsWithScores}
            onAdd={(value) => addGenreFilter("include", value)}
            onRemove={(value) =>
              setIncludedGenres((current) =>
                current.filter((item) => item !== value),
              )
            }
            onRequestOptions={onRequestGenreOptions}
          />
          <GenreTokenField
            label="Exclude"
            tone="exclude"
            values={excludedGenres}
            options={genreOptionsWithScores}
            onAdd={(value) => addGenreFilter("exclude", value)}
            onRemove={(value) =>
              setExcludedGenres((current) =>
                current.filter((item) => item !== value),
              )
            }
            onRequestOptions={onRequestGenreOptions}
          />
          <label className="genre-constellation-number-field">
            <span className="genre-constellation-control-label">Year from</span>
            <span>
              <CalendarBlank size={15} />
              <input
                type="number"
                aria-label="Year from"
                value={
                  yearFromInput ??
                  (response?.availableYearFrom != null
                    ? String(response.availableYearFrom)
                    : "")
                }
                onChange={(event) => setYearFromInput(event.target.value)}
              />
            </span>
          </label>
          <label className="genre-constellation-number-field">
            <span className="genre-constellation-control-label">Year to</span>
            <span>
              <CalendarBlank size={15} />
              <input
                type="number"
                aria-label="Year to"
                value={
                  yearToInput ??
                  (response?.availableYearTo != null
                    ? String(response.availableYearTo)
                    : "")
                }
                onChange={(event) => setYearToInput(event.target.value)}
              />
            </span>
          </label>
          <label className="genre-constellation-limit-field">
            <span className="genre-constellation-control-label">Show</span>
            <select
              aria-label="Genres to show"
              value={genreLimit}
              onChange={(event) =>
                setGenreLimit(
                  Number(event.target.value) as GenreConstellationLimit,
                )
              }
            >
              {genreConstellationLimits.map((limit) => (
                <option key={limit} value={limit}>
                  Top {limit}
                </option>
              ))}
            </select>
          </label>
          <button
            className="genre-constellation-reset"
            type="button"
            onClick={resetFilters}
          >
            <ArrowCounterClockwise size={15} />
            Reset
          </button>
        </section>
      ) : null}

      {error && !response ? (
        <div className="genre-constellation-state error" role="alert">
          <WarningCircle size={24} />
          <strong>The genre constellation could not be loaded</strong>
          <span>{error}</span>
        </div>
      ) : !response && isLoading ? (
        <div className="genre-constellation-state" aria-live="polite">
          <WaveSine size={24} />
          <strong>Mapping your genre constellation</strong>
        </div>
      ) : !layout || layout.bands.length === 0 ? (
        <div className="genre-constellation-state">
          <FunnelSimple size={24} />
          <strong>No albums match these filters</strong>
          <span>Remove a genre or widen the year range.</span>
        </div>
      ) : (
        <>
          <div
            className={`genre-constellation-chart${isLoading ? " is-refreshing" : ""}`}
            aria-busy={isLoading}
          >
            <svg
              viewBox="0 0 1200 500"
              role="img"
              aria-label={`Genre constellation from ${layout.yearFrom} to ${layout.yearTo}`}
              preserveAspectRatio="none"
            >
              <g className="genre-constellation-grid" aria-hidden="true">
                {layout.ticks.map((tick) => {
                  const x =
                    layout.plotLeft +
                    ((tick - layout.yearFrom) /
                      Math.max(1, layout.yearTo - layout.yearFrom)) *
                      (layout.plotRight - layout.plotLeft);
                  return (
                    <g key={tick}>
                      <line
                        x1={x}
                        x2={x}
                        y1={layout.plotTop - 22}
                        y2={layout.plotBottom}
                      />
                      <text x={x} y={23} textAnchor="middle">
                        {tick}
                      </text>
                    </g>
                  );
                })}
              </g>

              <g className="genre-constellation-clouds">
                {layout.bands.map((band) => {
                  const isActive = activeGenreId === band.genre.id;
                  const isDimmed = isGenreDimmed(band.genre.id);
                  return (
                    <g
                      key={band.genre.id}
                      className={`${isActive ? "is-active" : ""}${isDimmed ? " is-dimmed" : ""}`}
                    >
                      <path
                        className="genre-constellation-haze"
                        d={band.outerPath}
                        fill={band.color}
                        stroke={band.color}
                        role="button"
                        tabIndex={0}
                        aria-label={`${band.genre.name}, ${formatCount(band.genre.albumCount)} albums, ${band.genre.firstYear} to ${band.genre.lastYear}`}
                        aria-pressed={focusedGenreId === band.genre.id}
                        onMouseEnter={() => setHoveredGenreId(band.genre.id)}
                        onMouseLeave={() => setHoveredGenreId(null)}
                        onFocus={() => setHoveredGenreId(band.genre.id)}
                        onBlur={() => setHoveredGenreId(null)}
                        onClick={() => toggleGenreFocus(band.genre.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggleGenreFocus(band.genre.id);
                          }
                        }}
                      />
                      {band.contourPaths.map((path, contourIndex) => (
                        <path
                          key={contourIndex}
                          className="genre-constellation-contour"
                          d={path}
                          fill="none"
                          stroke={band.color}
                          aria-hidden="true"
                        />
                      ))}
                      <line
                        className="genre-constellation-baseline"
                        x1={layout.plotLeft}
                        x2={layout.plotRight}
                        y1={band.centerY}
                        y2={band.centerY}
                        stroke={band.color}
                        aria-hidden="true"
                      />
                      <text
                        className="genre-constellation-label"
                        x={10}
                        y={band.centerY + 4}
                        fill={band.color}
                        role="button"
                        tabIndex={0}
                        aria-label={`Focus ${band.genre.name}`}
                        onClick={() => toggleGenreFocus(band.genre.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggleGenreFocus(band.genre.id);
                          }
                        }}
                      >
                        {band.genre.name}
                      </text>
                    </g>
                  );
                })}
              </g>

              <g className="genre-constellation-album-dots">
                {albumDots.map(({ album, band, x, y }) => {
                  const isActive = activeGenreId === album.genreId;
                  const isDimmed = isGenreDimmed(album.genreId);
                  return (
                    <circle
                      key={album.albumId}
                      cx={x}
                      cy={y}
                      r={isActive ? 2 : 1.15}
                      fill={band.color}
                      className={`${isActive ? "is-active" : ""}${isDimmed ? " is-dimmed" : ""}`}
                      role="button"
                      tabIndex={0}
                      aria-label={`${album.album ?? "Untitled album"} by ${album.albumArtistDisplay ?? "Unknown artist"}, ${album.year}, ${album.genre}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenAlbum(album.albumId);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onOpenAlbum(album.albumId);
                        }
                      }}
                    >
                      <title>
                        {album.album ?? "Untitled album"} —{" "}
                        {album.albumArtistDisplay ?? "Unknown artist"} ({album.year})
                      </title>
                    </circle>
                  );
                })}
              </g>
            </svg>

            {focusedGenre ? (
              <aside
                className="genre-constellation-focus-card"
                aria-label="Focused genre"
              >
                <button
                  type="button"
                  aria-label="Clear focused genre"
                  onClick={() => setFocusedGenreId(null)}
                >
                  <X size={14} />
                </button>
                <h3
                  style={{ color: bandByGenre.get(focusedGenre.id)?.color }}
                >
                  {focusedGenre.name}
                </h3>
                <dl>
                  <div>
                    <dt>Span</dt>
                    <dd>
                      {focusedGenre.firstYear}–{focusedGenre.lastYear}
                    </dd>
                  </div>
                  <div>
                    <dt>Peak year</dt>
                    <dd>{focusedGenre.peakYear}</dd>
                  </div>
                  <div>
                    <dt>Albums</dt>
                    <dd>{formatCount(focusedGenre.albumCount)}</dd>
                  </div>
                </dl>
              </aside>
            ) : null}
          </div>

          <div className="genre-constellation-overview" aria-label="Timeline overview">
            <svg viewBox="0 0 1200 80" preserveAspectRatio="none" aria-hidden="true">
              <g transform="scale(1 0.16)">
                {layout.bands.map((band) => (
                  <path
                    key={band.genre.id}
                    d={band.outerPath}
                    fill={band.color}
                    stroke={band.color}
                  />
                ))}
              </g>
            </svg>
            <div
              className="genre-constellation-overview-window"
              style={{ left: `${overviewLeft}%`, right: `${overviewRight}%` }}
            >
              <span />
              <span />
            </div>
          </div>
        </>
      )}

      <footer className="genre-constellation-note">
        <Info size={14} />
        <span>
          Every dot is an album. Density contours summarize the same album points;
          large views sample dots evenly above 3,600 albums. “Scores” includes film,
          TV, animation, anime, and video-game score genres.
        </span>
      </footer>
    </section>
  );
}
