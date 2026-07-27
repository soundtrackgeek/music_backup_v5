import "@fontsource/cormorant-garamond/latin-600.css";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";

import {
  ArrowsOutSimple,
  CalendarBlank,
  CaretDown,
  CaretLeft,
  CaretRight,
  CornersIn,
  MagnifyingGlass,
  Play,
  Plus,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import type {
  AlbumDebutTimelineAlbum,
  AlbumDebutTimelineResponse,
  AlbumDebutTimelineYear,
} from "../types";
import { AlbumCover } from "./AlbumCover";

type SeasonId = "year" | "winter" | "spring" | "summer" | "autumn";

type SeasonDefinition = {
  id: SeasonId;
  label: string;
  months: number[];
  contextMonths: number[];
};

export type AlbumTimeRibbonPlaylist = {
  title: string;
  prompt: string;
  albumIds: string[];
};

type AlbumTimeRibbonProps = {
  data: AlbumDebutTimelineResponse | null;
  error: string | null;
  isLoading: boolean;
  onCreatePlaylist: (selection: AlbumTimeRibbonPlaylist) => void;
  onOpenAlbum: (albumId: string) => void;
  onOpenSearch: () => void;
  onRetry: () => void;
  onSelectYear: (year: number) => void;
};

const seasons: SeasonDefinition[] = [
  {
    id: "summer",
    label: "Summer",
    months: [6, 7, 8],
    contextMonths: [5, 6, 7, 8, 9],
  },
  {
    id: "autumn",
    label: "Autumn",
    months: [9, 10, 11],
    contextMonths: [8, 9, 10, 11, 12],
  },
  {
    id: "winter",
    label: "Winter",
    months: [12, 1, 2],
    contextMonths: [11, 12, 1, 2, 3],
  },
  {
    id: "spring",
    label: "Spring",
    months: [3, 4, 5],
    contextMonths: [2, 3, 4, 5, 6],
  },
  {
    id: "year",
    label: "Full year",
    months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    contextMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  },
];

function monthLabel(month: number, format: "long" | "short" = "long") {
  return new Intl.DateTimeFormat(undefined, {
    month: format,
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2000, month - 1, 1)));
}

function seasonFor(id: SeasonId) {
  return seasons.find((season) => season.id === id) ?? seasons[0];
}

export function albumsForSeason(
  albums: AlbumDebutTimelineAlbum[],
  seasonId: SeasonId,
) {
  const definition = seasonFor(seasonId);
  return albums.filter((album) =>
    definition.months.includes(album.billboardDebutMonth),
  );
}

function albumChronology(
  left: AlbumDebutTimelineAlbum,
  right: AlbumDebutTimelineAlbum,
) {
  return (
    left.billboardDebutWeekKey.localeCompare(right.billboardDebutWeekKey) ||
    (left.album ?? "").localeCompare(right.album ?? "")
  );
}

function isoWeek(date: Date) {
  const working = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = working.getUTCDay() || 7;
  working.setUTCDate(working.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(working.getUTCFullYear(), 0, 1));
  return Math.ceil(
    ((working.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
}

function weeksForMonth(year: number, month: number) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const weeks = new Set<number>();
  for (let day = 1; day <= lastDay; day += 1) {
    weeks.add(isoWeek(new Date(Date.UTC(year, month - 1, day))));
  }
  return [...weeks];
}

function yearPosition(
  year: number,
  firstYear: number,
  lastYear: number,
  selectedYear: number,
) {
  if (firstYear === lastYear) {
    return 50;
  }
  if (year === selectedYear) {
    return 48;
  }
  if (year < selectedYear) {
    return selectedYear === firstYear
      ? 0
      : ((year - firstYear) / (selectedYear - firstYear)) * 48;
  }
  return selectedYear === lastYear
    ? 100
    : 60 + ((year - selectedYear) / (lastYear - selectedYear)) * 40;
}

export function representativeTimelineYears(
  years: AlbumDebutTimelineYear[],
  selectedYear: number,
  maximum = 12,
) {
  if (years.length <= maximum) {
    return years;
  }
  const selectedIndex = years.findIndex((year) => year.year === selectedYear);
  const indexes = new Set<number>([0, years.length - 1, selectedIndex]);
  for (let index = 1; index <= maximum - 3; index += 1) {
    indexes.add(Math.round((index / (maximum - 2)) * (years.length - 1)));
  }
  for (let index = 0; index < years.length && indexes.size < maximum; index += 1) {
    indexes.add(index);
  }
  return [...indexes]
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)
    .map((index) => years[index]);
}

function decadeLabels(firstYear: number, lastYear: number, selectedYear: number) {
  const labels = new Set<number>([selectedYear]);
  for (
    let year = Math.ceil(firstYear / 10) * 10;
    year <= lastYear;
    year += 10
  ) {
    labels.add(year);
  }
  if (firstYear % 10 !== 0) {
    labels.add(firstYear);
  }
  if (lastYear % 10 >= 7) {
    labels.add(lastYear);
  }
  return [...labels].sort((left, right) => left - right);
}

function seasonRangeLabel(season: SeasonDefinition) {
  if (season.id === "year") {
    return "January – December";
  }
  return `${monthLabel(season.months[0])} – ${monthLabel(
    season.months[season.months.length - 1],
  )}`;
}

function LoadingTimeline() {
  return (
    <section className="album-time-ribbon-state" aria-live="polite">
      <div className="album-time-ribbon-skeleton-title" />
      <div className="album-time-ribbon-skeleton-line" />
      <div className="album-time-ribbon-skeleton-covers">
        {Array.from({ length: 8 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
      <strong>Mapping chart arrivals across your library</strong>
    </section>
  );
}

export function AlbumTimeRibbon({
  data,
  error,
  isLoading,
  onCreatePlaylist,
  onOpenAlbum,
  onOpenSearch,
  onRetry,
  onSelectYear,
}: AlbumTimeRibbonProps) {
  const rootRef = useRef<HTMLElement | null>(null);
  const [seasonId, setSeasonId] = useState<SeasonId>("summer");
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === rootRef.current);
      if (document.fullscreenElement === rootRef.current) {
        setFullscreenError(null);
      }
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const selectedYear = data?.selectedYear ?? null;
  const years = data?.years ?? [];
  const selectedSeason = seasonFor(seasonId);
  const seasonAlbums = useMemo(
    () =>
      albumsForSeason(data?.albums ?? [], seasonId).sort(albumChronology),
    [data?.albums, seasonId],
  );
  const selectedAlbum =
    seasonAlbums.find((album) => album.id === selectedAlbumId) ??
    seasonAlbums[0] ??
    null;

  if (!data && isLoading) {
    return <LoadingTimeline />;
  }

  if (error && !data) {
    return (
      <section className="album-time-ribbon-state error" role="alert">
        <WarningCircle size={30} weight="light" aria-hidden="true" />
        <strong>The album timeline could not be loaded</strong>
        <span>{error}</span>
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      </section>
    );
  }

  if (!data || selectedYear == null || years.length === 0) {
    return (
      <section className="album-time-ribbon-state">
        <CalendarBlank size={30} weight="light" aria-hidden="true" />
        <strong>No album debut weeks yet</strong>
        <span>
          Import the CSV_ALBUMS folder to place your collection on this
          timeline.
        </span>
      </section>
    );
  }

  const firstYear = years[0].year;
  const lastYear = years[years.length - 1].year;
  const activePosition = yearPosition(
    selectedYear,
    firstYear,
    lastYear,
    selectedYear,
  );
  const markerYears = representativeTimelineYears(years, selectedYear);
  const labels = decadeLabels(firstYear, lastYear, selectedYear);
  const selectedYearIndex = years.findIndex((year) => year.year === selectedYear);
  const previousYear = years[selectedYearIndex - 1]?.year ?? null;
  const nextYear = years[selectedYearIndex + 1]?.year ?? null;
  const yearSummary = years[selectedYearIndex];
  const selectedMonth = selectedAlbum?.billboardDebutMonth ?? null;
  const selectedWeek = selectedAlbum?.billboardDebutWeek ?? null;
  const selectorLabel =
    selectedSeason.id === "year"
      ? `Explore ${selectedYear}`
      : `Relive ${selectedSeason.label} ${selectedYear}`;
  const timelineStyle = {
    "--album-time-active-x": `${activePosition}%`,
  } as CSSProperties;

  async function toggleFullscreen() {
    setFullscreenError(null);
    try {
      if (document.fullscreenElement === rootRef.current) {
        await document.exitFullscreen();
      } else if (rootRef.current?.requestFullscreen) {
        await rootRef.current.requestFullscreen();
      } else {
        setFullscreenError("Fullscreen is not available in this window.");
      }
    } catch (fullscreenRequestError) {
      setFullscreenError(
        fullscreenRequestError instanceof Error
          ? fullscreenRequestError.message
          : "Fullscreen could not be opened.",
      );
    }
  }

  function createPlaylist() {
    if (seasonAlbums.length === 0) {
      return;
    }
    const title = selectorLabel;
    onCreatePlaylist({
      title,
      albumIds: seasonAlbums.map((album) => album.albumId),
      prompt: `Create a playlist that relives ${
        selectedSeason.id === "year"
          ? `the album arrivals of ${selectedYear}`
          : `${selectedSeason.label.toLowerCase()} ${selectedYear}`
      }. Use only music from these albums and let the sequence move chronologically through their Billboard debut weeks.`,
    });
  }

  return (
    <section
      ref={rootRef}
      className={`album-time-ribbon-page${isFullscreen ? " is-fullscreen" : ""}`}
      aria-busy={isLoading}
      style={timelineStyle}
    >
      <div className="album-time-ribbon-utility-bar">
        <button type="button" onClick={onOpenSearch}>
          <MagnifyingGlass size={18} weight="light" aria-hidden="true" />
          <span>Search your library</span>
          <kbd>⌘ K</kbd>
        </button>
      </div>
      <header className="album-time-ribbon-header">
        <div>
          <h1>Albums through the years</h1>
          <p>
            Explore {data.datedAlbumCount.toLocaleString()} album arrivals week
            by week across decades.
          </p>
        </div>
        <div className="album-time-ribbon-actions">
          <label className="album-time-ribbon-season-select">
            <CalendarBlank size={18} weight="light" aria-hidden="true" />
            <span className="sr-only">Timeline season</span>
            <select
              value={seasonId}
              onChange={(event) =>
                setSeasonId(event.target.value as SeasonId)
              }
              aria-label="Timeline season"
            >
              {seasons.map((season) => (
                <option value={season.id} key={season.id}>
                  {season.id === "year"
                    ? `Explore ${selectedYear}`
                    : `Relive ${season.label} ${selectedYear}`}
                </option>
              ))}
            </select>
            <CaretDown size={14} weight="bold" aria-hidden="true" />
          </label>
          <button
            type="button"
            className="album-time-ribbon-square-action"
            disabled={previousYear == null}
            aria-label="Previous chart year"
            onClick={() => previousYear != null && onSelectYear(previousYear)}
          >
            <CaretLeft size={19} weight="light" />
          </button>
          <button
            type="button"
            className="album-time-ribbon-square-action"
            disabled={nextYear == null}
            aria-label="Next chart year"
            onClick={() => nextYear != null && onSelectYear(nextYear)}
          >
            <CaretRight size={19} weight="light" />
          </button>
          <button
            type="button"
            className="album-time-ribbon-square-action"
            aria-label={isFullscreen ? "Exit fullscreen" : "Open fullscreen"}
            aria-pressed={isFullscreen}
            onClick={() => void toggleFullscreen()}
          >
            {isFullscreen ? (
              <CornersIn size={19} weight="light" />
            ) : (
              <ArrowsOutSimple size={19} weight="light" />
            )}
          </button>
        </div>
      </header>

      <div className="album-time-ribbon-stage">
        <div className="album-time-ribbon-labels" aria-hidden="true">
          {labels.map((year) => (
            <span
              className={year === selectedYear ? "active" : ""}
              style={{
                left: `${yearPosition(
                  year,
                  firstYear,
                  lastYear,
                  selectedYear,
                )}%`,
              }}
              key={year}
            >
              {year}
            </span>
          ))}
        </div>

        <div className="album-time-ribbon-focus" aria-hidden="true" />
        <div className="album-time-ribbon-baseline" aria-hidden="true" />
        <div className="album-time-ribbon-year-ticks" role="list" aria-label="Chart years">
          {years.map((year) => (
            <button
              type="button"
              role="listitem"
              className={year.year === selectedYear ? "active" : ""}
              style={{
                left: `${yearPosition(
                  year.year,
                  firstYear,
                  lastYear,
                  selectedYear,
                )}%`,
              }}
              aria-label={`${year.year}, ${year.albumCount} album${
                year.albumCount === 1 ? "" : "s"
              }`}
              aria-pressed={year.year === selectedYear}
              onClick={() => onSelectYear(year.year)}
              key={year.year}
            />
          ))}
        </div>

        <div
          className="album-time-ribbon-markers"
          role="group"
          aria-label="Representative album years"
        >
          {markerYears.map((year, index) => {
            const album = year.representativeAlbum;
            if (!album) {
              return null;
            }
            const side = index % 2 === 0 ? "above" : "below";
            return (
              <button
                type="button"
                className={`album-time-ribbon-marker ${side}${
                  year.year === selectedYear ? " active" : ""
                }`}
                style={{
                  left: `${yearPosition(
                    year.year,
                    firstYear,
                    lastYear,
                    selectedYear,
                  )}%`,
                }}
                onClick={() => onSelectYear(year.year)}
                aria-label={`${year.year}: ${album.album ?? "Untitled"}`}
                aria-pressed={year.year === selectedYear}
                title={`${album.album ?? "Untitled"} · ${year.year}`}
                key={year.year}
              >
                <AlbumCover row={album} />
              </button>
            );
          })}
        </div>

        <div className="album-time-ribbon-active-line" aria-hidden="true">
          <span />
        </div>
      </div>

      <section className="album-time-ribbon-weeks" aria-label={`${selectorLabel} weeks`}>
        <div className="album-time-ribbon-week-pointer" aria-hidden="true" />
        <div className="album-time-ribbon-months">
          {selectedSeason.contextMonths.map((month) => (
            <div
              className={`album-time-ribbon-month${
                selectedSeason.months.includes(month) ? " in-season" : ""
              }`}
              key={month}
            >
              <strong>
                <span className="album-time-ribbon-month-long">
                  {monthLabel(month)}
                </span>
                <span className="album-time-ribbon-month-short" aria-hidden="true">
                  {monthLabel(month, "short")}
                </span>
              </strong>
              <div>
                {weeksForMonth(selectedYear, month).map((week, weekIndex) => (
                  <button
                    type="button"
                    className={
                      selectedMonth === month && selectedWeek === week
                        ? "active"
                        : ""
                    }
                    onClick={() => {
                      const album = seasonAlbums.find(
                        (candidate) =>
                          candidate.billboardDebutMonth === month &&
                          candidate.billboardDebutWeek === week,
                      );
                      if (album) {
                        setSelectedAlbumId(album.id);
                      }
                    }}
                    disabled={!seasonAlbums.some(
                      (album) =>
                        album.billboardDebutMonth === month &&
                        album.billboardDebutWeek === week,
                    )}
                    aria-label={`${monthLabel(month)} week ${week}`}
                    key={week}
                  >
                    W{weekIndex + 1}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="album-time-ribbon-drawer" aria-live="polite">
        <header>
          <div>
            <strong>{selectorLabel.replace("Relive ", "")}</strong>
            <span>
              {seasonRangeLabel(selectedSeason)} · {seasonAlbums.length} of{" "}
              {yearSummary.albumCount} album arrivals
            </span>
            {selectedAlbum ? (
              <small>
                {selectedAlbum.album ?? "Untitled"} —{" "}
                {selectedAlbum.albumArtistDisplay ?? "Unknown artist"} · Week{" "}
                {selectedAlbum.billboardDebutWeek}
              </small>
            ) : null}
          </div>
          <div className="album-time-ribbon-drawer-actions">
            {selectedAlbum ? (
              <button
                type="button"
                className="album-time-ribbon-open-album"
                onClick={() => onOpenAlbum(selectedAlbum.albumId)}
              >
                Open album
              </button>
            ) : null}
            <button
              type="button"
              className="album-time-ribbon-playlist"
              disabled={seasonAlbums.length === 0}
              onClick={createPlaylist}
            >
              <Play size={15} weight="fill" aria-hidden="true" />
              Create playlist
              <Plus size={16} weight="bold" aria-hidden="true" />
            </button>
          </div>
        </header>

        {seasonAlbums.length > 0 ? (
          <div className="album-time-ribbon-covers" role="list">
            {seasonAlbums.map((album, index) => (
              <button
                type="button"
                role="listitem"
                className={album.id === selectedAlbum?.id ? "active" : ""}
                aria-label={`${album.album ?? "Untitled"} by ${
                  album.albumArtistDisplay ?? "Unknown artist"
                }, ${monthLabel(album.billboardDebutMonth, "short")} ${
                  album.billboardDebutYear
                }, week ${album.billboardDebutWeek}`}
                aria-pressed={album.id === selectedAlbum?.id}
                onClick={() => setSelectedAlbumId(album.id)}
                style={{ "--album-time-cover-index": index } as CSSProperties}
                key={album.id}
              >
                <AlbumCover row={album} decorative={false} previewOnHover />
              </button>
            ))}
          </div>
        ) : (
          <div className="album-time-ribbon-season-empty">
            <CalendarBlank size={24} weight="light" aria-hidden="true" />
            <strong>No {selectedSeason.label.toLowerCase()} arrivals in {selectedYear}</strong>
            <span>Choose another season or move to the next chart year.</span>
          </div>
        )}
      </section>

      <footer className="album-time-ribbon-footnote">
        <span>
          Billboard chart debut is used as the historical date marker.
        </span>
        {data.undatedAlbumCount > 0 ? (
          <span>{data.undatedAlbumCount.toLocaleString()} albums have no debut week.</span>
        ) : null}
      </footer>
      {isLoading ? (
        <div className="album-time-ribbon-loading-bar" aria-hidden="true" />
      ) : null}
      {error ? <p className="album-time-ribbon-inline-error">{error}</p> : null}
      {fullscreenError ? (
        <p className="album-time-ribbon-inline-error">{fullscreenError}</p>
      ) : null}
    </section>
  );
}
