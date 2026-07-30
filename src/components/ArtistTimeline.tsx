import {
  ArrowCounterClockwise,
  CalendarBlank,
  ChartLineUp,
  FunnelSimple,
  MagnifyingGlass,
  SlidersHorizontal,
  Sparkle,
  UsersThree,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import {
  useEffect,
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
} from "react";

import {
  getArtistTimeline,
  listArtists,
} from "../backend";
import {
  artistTimelineLimits,
  buildArtistCareerPeaksLayout,
  createArtistTimelineRequest,
  type ArtistTimelineLimit,
} from "../app/artistTimeline";
import type {
  ArtistTimelineMetric,
  ArtistTimelineResponse,
} from "../types";
import { AlbumCover } from "./AlbumCover";
import { ArtistPortrait } from "./ArtistPortrait";

type ArtistTimelineProps = {
  genreOptions: string[];
  onRequestGenreOptions?: () => void;
  onOpenAlbum: (albumId: string) => void;
  onOpenArtist: (artistId: string, artistName: string) => void;
};

type TokenFieldProps = {
  label: string;
  values: string[];
  options: string[];
  tone: "artist" | "include" | "exclude";
  placeholder: string;
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  onFocus?: () => void;
};

function TokenField({
  label,
  values,
  options,
  tone,
  placeholder,
  onAdd,
  onRemove,
  onFocus,
}: TokenFieldProps) {
  const [draft, setDraft] = useState("");
  const listId = useId();

  function commit() {
    const value = draft.trim();
    if (!value) return;
    onAdd(value);
    setDraft("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commit();
    }
  }

  return (
    <label className={`artist-peaks-token-field tone-${tone}`}>
      <span>{label}</span>
      <div>
        {values.map((value) => (
          <button
            type="button"
            key={value}
            aria-label={`Remove ${value} from ${label.toLocaleLowerCase()}`}
            onClick={() => onRemove(value)}
          >
            {value}
            <X size={10} />
          </button>
        ))}
        <input
          aria-label={label}
          list={listId}
          value={draft}
          placeholder={values.length > 0 ? "Add another" : placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={onFocus}
          onBlur={() => {
            if (options.some((option) => option === draft.trim())) commit();
          }}
          onKeyDown={handleKeyDown}
        />
        <datalist id={listId}>
          {options.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      </div>
    </label>
  );
}

function formatCount(value: number) {
  return new Intl.NumberFormat().format(value);
}

function formatScore(value: number | null) {
  return value == null ? "—" : value.toFixed(1);
}

function normalized(value: string) {
  return value.trim().toLocaleLowerCase();
}

export function ArtistTimeline({
  genreOptions,
  onRequestGenreOptions,
  onOpenAlbum,
  onOpenArtist,
}: ArtistTimelineProps) {
  const [response, setResponse] = useState<ArtistTimelineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [metric, setMetric] = useState<ArtistTimelineMetric>("charts");
  const [yearFromInput, setYearFromInput] = useState<string | null>(null);
  const [yearToInput, setYearToInput] = useState<string | null>(null);
  const [includedGenres, setIncludedGenres] = useState<string[]>([]);
  const [excludedGenres, setExcludedGenres] = useState<string[]>([]);
  const [artists, setArtists] = useState<string[]>([]);
  const [artistOptions, setArtistOptions] = useState<string[]>([]);
  const [artistLimit, setArtistLimit] = useState<ArtistTimelineLimit>(7);
  const [selectedArtistId, setSelectedArtistId] = useState<string | null>(null);
  const [hoveredArtistId, setHoveredArtistId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [artistSearch, setArtistSearch] = useState("");
  const yearFrom = yearFromInput?.trim() ? Number(yearFromInput) : null;
  const yearTo = yearToInput?.trim() ? Number(yearToInput) : null;

  const request = useMemo(
    () =>
      createArtistTimelineRequest({
        yearFrom,
        yearTo,
        includedGenres,
        excludedGenres,
        artists,
        artistLimit,
        metric,
      }),
    [
      artistLimit,
      artists,
      excludedGenres,
      includedGenres,
      metric,
      yearFrom,
      yearTo,
    ],
  );

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      setError(null);
      void getArtistTimeline(request)
        .then((nextResponse) => {
          if (cancelled) return;
          setResponse(nextResponse);
          setSelectedArtistId((current) =>
            current && nextResponse.artists.some((artist) => artist.id === current)
              ? current
              : (nextResponse.artists[0]?.id ?? null),
          );
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

  function requestArtistOptions() {
    if (artistOptions.length > 0) return;
    void listArtists({
      searchText: "",
      sort: { field: "name", direction: "asc" },
      limit: 500,
      offset: 0,
    }).then((nextResponse) =>
      setArtistOptions(nextResponse.rows.map((artist) => artist.name)),
    );
  }

  const effectiveYearFrom =
    yearFrom ?? response?.availableYearFrom ?? new Date().getFullYear();
  const effectiveYearTo =
    yearTo ?? response?.availableYearTo ?? effectiveYearFrom;
  const layout = useMemo(
    () =>
      response
        ? buildArtistCareerPeaksLayout(response, {
            metric,
            yearFrom: effectiveYearFrom,
            yearTo: effectiveYearTo,
          })
        : null,
    [effectiveYearFrom, effectiveYearTo, metric, response],
  );
  const activeArtistId = hoveredArtistId ?? selectedArtistId;
  const selectedRow =
    layout?.rows.find((row) => row.artist.id === selectedArtistId) ?? null;
  const normalizedSearch = normalized(artistSearch);

  function isDimmed(artistId: string, name: string) {
    if (activeArtistId) return activeArtistId !== artistId;
    return Boolean(normalizedSearch && !normalized(name).includes(normalizedSearch));
  }

  function addUnique(
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    value: string,
  ) {
    setter((current) =>
      current.some((item) => normalized(item) === normalized(value))
        ? current
        : [...current, value],
    );
  }

  function addGenre(tone: "include" | "exclude", value: string) {
    if (tone === "include") {
      addUnique(setIncludedGenres, value);
      setExcludedGenres((current) =>
        current.filter((item) => normalized(item) !== normalized(value)),
      );
    } else {
      addUnique(setExcludedGenres, value);
      setIncludedGenres((current) =>
        current.filter((item) => normalized(item) !== normalized(value)),
      );
    }
  }

  function resetFilters() {
    setYearFromInput(null);
    setYearToInput(null);
    setIncludedGenres([]);
    setExcludedGenres([]);
    setArtists([]);
    setArtistLimit(7);
    setArtistSearch("");
  }

  const genresWithScores = useMemo(
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
    <section className="artist-career-peaks-page" aria-label="Artist career peaks timeline">
      <header className="artist-career-peaks-toolbar">
        <div className="artist-career-peaks-title">
          <h2>Career peaks</h2>
          <span aria-live="polite">
            {formatCount(response?.matchingAlbumCount ?? 0)} albums ·{" "}
            {formatCount(response?.matchingArtistCount ?? 0)} artists
          </span>
        </div>
        <div className="artist-career-peaks-actions">
          <div className="artist-career-peaks-metric" aria-label="Peak metric">
            <button
              type="button"
              className={metric === "charts" ? "active" : ""}
              aria-pressed={metric === "charts"}
              onClick={() => setMetric("charts")}
            >
              <ChartLineUp size={15} />
              Charts
            </button>
            <button
              type="button"
              className={metric === "albumScore" ? "active" : ""}
              aria-pressed={metric === "albumScore"}
              onClick={() => setMetric("albumScore")}
            >
              <Sparkle size={15} />
              My Scores
            </button>
          </div>
          <button
            type="button"
            className={searchOpen ? "active" : ""}
            aria-label="Search visible artists"
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((current) => !current)}
          >
            <MagnifyingGlass size={18} />
          </button>
          <button
            type="button"
            className={filtersOpen ? "active" : ""}
            aria-label="Artist timeline filters"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((current) => !current)}
          >
            <SlidersHorizontal size={18} />
          </button>
        </div>
      </header>

      {searchOpen ? (
        <label className="artist-career-peaks-search">
          <MagnifyingGlass size={16} />
          <input
            autoFocus
            type="search"
            aria-label="Find visible artist"
            placeholder="Find a visible artist"
            value={artistSearch}
            onChange={(event) => setArtistSearch(event.target.value)}
          />
          {artistSearch ? (
            <button type="button" aria-label="Clear artist search" onClick={() => setArtistSearch("")}>
              <X size={14} />
            </button>
          ) : null}
        </label>
      ) : null}

      {filtersOpen ? (
        <section className="artist-career-peaks-filters" aria-label="Career peaks filters">
          <TokenField
            label="Artists"
            tone="artist"
            values={artists}
            options={artistOptions}
            placeholder="Add artists"
            onAdd={(value) => addUnique(setArtists, value)}
            onRemove={(value) => setArtists((current) => current.filter((item) => item !== value))}
            onFocus={requestArtistOptions}
          />
          <TokenField
            label="Include genres"
            tone="include"
            values={includedGenres}
            options={genresWithScores}
            placeholder="All genres"
            onAdd={(value) => addGenre("include", value)}
            onRemove={(value) => setIncludedGenres((current) => current.filter((item) => item !== value))}
            onFocus={onRequestGenreOptions}
          />
          <TokenField
            label="Exclude genres"
            tone="exclude"
            values={excludedGenres}
            options={genresWithScores}
            placeholder="None excluded"
            onAdd={(value) => addGenre("exclude", value)}
            onRemove={(value) => setExcludedGenres((current) => current.filter((item) => item !== value))}
            onFocus={onRequestGenreOptions}
          />
          <label className="artist-career-peaks-number">
            <span>Year from</span>
            <span>
              <CalendarBlank size={14} />
              <input
                type="number"
                aria-label="Artist year from"
                value={yearFromInput ?? response?.availableYearFrom ?? ""}
                onChange={(event) => setYearFromInput(event.target.value)}
              />
            </span>
          </label>
          <label className="artist-career-peaks-number">
            <span>Year to</span>
            <span>
              <CalendarBlank size={14} />
              <input
                type="number"
                aria-label="Artist year to"
                value={yearToInput ?? response?.availableYearTo ?? ""}
                onChange={(event) => setYearToInput(event.target.value)}
              />
            </span>
          </label>
          <label className="artist-career-peaks-limit">
            <span>Show</span>
            <select
              aria-label="Artists to show"
              value={artistLimit}
              onChange={(event) => setArtistLimit(Number(event.target.value) as ArtistTimelineLimit)}
            >
              {artistTimelineLimits.map((limit) => (
                <option key={limit} value={limit}>Top {limit}</option>
              ))}
            </select>
          </label>
          <button className="artist-career-peaks-reset" type="button" onClick={resetFilters}>
            <ArrowCounterClockwise size={15} />
            Reset
          </button>
        </section>
      ) : null}

      {error && !response ? (
        <div className="artist-career-peaks-state error" role="alert">
          <WarningCircle size={24} />
          <strong>The artist timeline could not be loaded</strong>
          <span>{error}</span>
        </div>
      ) : !response && isLoading ? (
        <div className="artist-career-peaks-state" aria-live="polite">
          <UsersThree size={24} />
          <strong>Mapping artist careers</strong>
        </div>
      ) : !layout || layout.rows.length === 0 ? (
        <div className="artist-career-peaks-state">
          <FunnelSimple size={24} />
          <strong>No albums match these filters</strong>
          <span>Remove an artist or genre, or widen the year range.</span>
        </div>
      ) : (
        <>
          <div className="artist-career-peaks-visual">
            <div className={`artist-career-peaks-chart${isLoading ? " is-refreshing" : ""}`} aria-busy={isLoading}>
              <svg
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              role="img"
              aria-label={`Artist career peaks from ${layout.yearFrom} to ${layout.yearTo}`}
              preserveAspectRatio="none"
            >
              <defs>
                {layout.rows.map((row) => (
                  <filter id={`artist-peak-glow-${row.artist.id.replace(/[^a-z0-9]/gi, "")}`} key={row.artist.id} x="-80%" y="-160%" width="260%" height="420%">
                    <feGaussianBlur stdDeviation="3.6" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                ))}
              </defs>
              <g className="artist-career-peaks-grid" aria-hidden="true">
                {layout.ticks.map((tick) => {
                  const x = layout.plotLeft + ((tick - layout.yearFrom) / Math.max(1, layout.yearTo - layout.yearFrom)) * (layout.plotRight - layout.plotLeft);
                  return (
                    <g key={tick}>
                      <line x1={x} x2={x} y1={layout.plotTop - 28} y2={layout.plotBottom} />
                      <text x={x} y={24} textAnchor="middle">{tick}</text>
                    </g>
                  );
                })}
              </g>
              <g className="artist-career-peaks-rows">
                {layout.rows.map((row) => {
                  const dimmed = isDimmed(row.artist.id, row.artist.name);
                  const active = activeArtistId === row.artist.id;
                  const filterId = `artist-peak-glow-${row.artist.id.replace(/[^a-z0-9]/gi, "")}`;
                  return (
                    <g
                      key={row.artist.id}
                      className={`${active ? "is-active" : ""}${dimmed ? " is-dimmed" : ""}`}
                      onMouseEnter={() => setHoveredArtistId(row.artist.id)}
                      onMouseLeave={() => setHoveredArtistId(null)}
                      onClick={() => setSelectedArtistId(row.artist.id)}
                    >
                      <line className="artist-career-peaks-baseline" x1={layout.plotLeft} x2={layout.plotRight} y1={row.baselineY} y2={row.baselineY} stroke={row.color} />
                      {row.points.map((point) => (
                        <path
                          key={point.album.albumId}
                          d={point.path}
                          className="artist-career-peak"
                          fill={row.color}
                          stroke={row.color}
                          strokeWidth={active ? 2.1 : 1.45}
                          style={{ filter: point.strength > 0.35 ? `url(#${filterId})` : undefined }}
                          role="button"
                          tabIndex={0}
                          aria-label={`${point.album.album ?? "Untitled album"}, ${point.album.year}`}
                          onClick={(event) => { event.stopPropagation(); onOpenAlbum(point.album.albumId); }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onOpenAlbum(point.album.albumId);
                            }
                          }}
                        />
                      ))}
                    </g>
                  );
                })}
              </g>
              </svg>

              <div className="artist-career-peaks-labels">
                {layout.rows.map((row) => {
                  const top = `${(row.baselineY / layout.height) * 100}%`;
                  const dimmed = isDimmed(row.artist.id, row.artist.name);
                  return (
                    <button
                      type="button"
                      key={row.artist.id}
                      className={`${selectedArtistId === row.artist.id ? "is-selected" : ""}${dimmed ? " is-dimmed" : ""}`}
                      style={{ top }}
                      onMouseEnter={() => setHoveredArtistId(row.artist.id)}
                      onMouseLeave={() => setHoveredArtistId(null)}
                      onClick={() => setSelectedArtistId(row.artist.id)}
                    >
                      <ArtistPortrait
                        artistId={row.artist.id}
                        artistName={row.artist.name}
                        portraitAvailable={row.artist.portraitAvailable}
                        representativeAlbumId={row.artist.representativeAlbumId}
                        representativeAlbum={row.artist.representativeAlbum}
                        representativeCoverPath={row.artist.representativeCoverPath}
                      />
                      <span><strong>{row.artist.name}</strong><small>{row.artist.firstYear}–{row.artist.lastYear}</small></span>
                    </button>
                  );
                })}
              </div>

              <div className="artist-career-peaks-markers" aria-label="Album peak markers">
                {layout.rows.flatMap((row) => {
                  const dimmed = isDimmed(row.artist.id, row.artist.name);
                  return row.points.map((point) => {
                    const caption = `${point.album.album ?? "Untitled album"} (${point.album.year})`;
                    return (
                      <button
                        type="button"
                        key={point.album.albumId}
                        className={`artist-career-peak-marker${dimmed ? " is-dimmed" : ""}`}
                        style={{
                          color: row.color,
                          left: `${(point.x / layout.width) * 100}%`,
                          top: `${(point.peakY / layout.height) * 100}%`,
                        }}
                        aria-label={`Open ${caption}`}
                        onMouseEnter={() => setHoveredArtistId(row.artist.id)}
                        onMouseLeave={() => setHoveredArtistId(null)}
                        onClick={() => onOpenAlbum(point.album.albumId)}
                      >
                        <AlbumCover
                          row={point.album}
                          previewOnHover
                          previewCaption={caption}
                        />
                      </button>
                    );
                  });
                })}
              </div>

              {selectedRow ? (
                <div className="artist-career-peaks-covers" aria-label={`${selectedRow.artist.name} strongest peaks`}>
                  {selectedRow.strongest.map((point) => (
                    <button
                      type="button"
                      key={point.album.albumId}
                      style={{
                        left: `${(point.x / layout.width) * 100}%`,
                        top: `${((point.peakY - 36) / layout.height) * 100}%`,
                      }}
                      aria-label={`Open ${point.album.album ?? "album"}`}
                      onClick={() => onOpenAlbum(point.album.albumId)}
                    >
                      <AlbumCover
                        row={point.album}
                        previewOnHover
                        previewCaption={`${point.album.album ?? "Untitled album"} (${point.album.year})`}
                      />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {selectedRow ? (
              <aside className="artist-career-peaks-card">
                  <header>
                    <ArtistPortrait
                      artistId={selectedRow.artist.id}
                      artistName={selectedRow.artist.name}
                      portraitAvailable={selectedRow.artist.portraitAvailable}
                      representativeAlbumId={selectedRow.artist.representativeAlbumId}
                      representativeAlbum={selectedRow.artist.representativeAlbum}
                      representativeCoverPath={selectedRow.artist.representativeCoverPath}
                    />
                    <div><strong>{selectedRow.artist.name}</strong><span>{selectedRow.artist.topGenre ?? "Artist"}</span></div>
                  </header>
                  <dl>
                    <div><dt>Span</dt><dd>{selectedRow.artist.firstYear}–{selectedRow.artist.lastYear}</dd></div>
                    <div><dt>Albums</dt><dd>{formatCount(selectedRow.artist.albumCount)}</dd></div>
                    <div><dt>Average score</dt><dd>{formatScore(selectedRow.artist.averageAlbumScore)}</dd></div>
                    <div><dt>Loved</dt><dd>{formatCount(selectedRow.artist.lovedTracks)}</dd></div>
                  </dl>
                  <button type="button" onClick={() => onOpenArtist(selectedRow.artist.id, selectedRow.artist.name)}>Open artist</button>
              </aside>
            ) : null}
          </div>

          <div className="artist-career-peaks-overview" aria-hidden="true">
            <svg viewBox={`0 0 ${layout.width} 84`} preserveAspectRatio="none">
              {layout.rows.map((row, index) => {
                const baseline = 9 + index * (64 / Math.max(1, layout.rows.length - 1));
                return (
                  <g key={row.artist.id} stroke={row.color} fill={row.color}>
                    <line x1={layout.plotLeft} x2={layout.plotRight} y1={baseline} y2={baseline} />
                    {row.points.map((point) => {
                      const height = 1.5 + point.strength * 7;
                      return (
                        <path
                          key={point.album.albumId}
                          d={`M ${(point.x - 3.5).toFixed(2)} ${baseline.toFixed(2)} L ${point.x.toFixed(2)} ${(baseline - height).toFixed(2)} L ${(point.x + 3.5).toFixed(2)} ${baseline.toFixed(2)} Z`}
                        />
                      );
                    })}
                  </g>
                );
              })}
            </svg>
            <div className="artist-career-peaks-window" style={{ left: `${overviewLeft}%`, right: `${overviewRight}%` }}><i /><i /></div>
            <span>{response?.availableYearFrom}</span><span>{response?.availableYearTo}</span>
          </div>
        </>
      )}
    </section>
  );
}
