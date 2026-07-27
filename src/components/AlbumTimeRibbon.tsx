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
  Check,
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

type PeriodId =
  | "spring"
  | "summer"
  | "fall"
  | "winter"
  | "christmas"
  | "new-year"
  | "year"
  | "custom";
type PresetPeriodId = Exclude<PeriodId, "custom">;

type PeriodDefinition = {
  id: PeriodId;
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

const periodPresets: Array<{
  id: PresetPeriodId;
  label: string;
  months: number[];
}> = [
  {
    id: "spring",
    label: "Spring",
    months: [3, 4, 5],
  },
  {
    id: "summer",
    label: "Summer",
    months: [6, 7, 8],
  },
  {
    id: "fall",
    label: "Fall",
    months: [9, 10, 11],
  },
  {
    id: "winter",
    label: "Winter",
    months: [12, 1, 2],
  },
  {
    id: "christmas",
    label: "Christmas",
    months: [12],
  },
  {
    id: "new-year",
    label: "New Year",
    months: [1],
  },
  {
    id: "year",
    label: "Full year",
    months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  },
];

const calendarMonths = Array.from({ length: 12 }, (_, index) => index + 1);

function monthLabel(month: number, format: "long" | "short" = "long") {
  return new Intl.DateTimeFormat(undefined, {
    month: format,
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2000, month - 1, 1)));
}

function offsetMonth(month: number, offset: number) {
  return ((month - 1 + offset + 120) % 12) + 1;
}

export function monthsInRange(startMonth: number, endMonth: number) {
  const months = [startMonth];
  let currentMonth = startMonth;
  while (currentMonth !== endMonth && months.length < 12) {
    currentMonth = offsetMonth(currentMonth, 1);
    months.push(currentMonth);
  }
  return months;
}

function contextMonthsFor(months: number[]) {
  if (months.length >= 12) {
    return calendarMonths;
  }
  return [
    offsetMonth(months[0], -1),
    ...months,
    offsetMonth(months[months.length - 1], 1),
  ].filter((month, index, values) => values.indexOf(month) === index);
}

function periodFor(
  id: PeriodId,
  customStartMonth: number,
  customEndMonth: number,
): PeriodDefinition {
  if (id === "custom") {
    const months = monthsInRange(customStartMonth, customEndMonth);
    return {
      id,
      label:
        customStartMonth === customEndMonth
          ? monthLabel(customStartMonth)
          : `${monthLabel(customStartMonth)} – ${monthLabel(customEndMonth)}`,
      months,
      contextMonths: contextMonthsFor(months),
    };
  }
  const preset =
    periodPresets.find((candidate) => candidate.id === id) ?? periodPresets[1];
  return {
    ...preset,
    contextMonths: contextMonthsFor(preset.months),
  };
}

export function albumsForPeriod(
  albums: AlbumDebutTimelineAlbum[],
  months: number[],
) {
  return albums.filter((album) =>
    months.includes(album.billboardDebutMonth),
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

function periodRangeLabel(period: PeriodDefinition) {
  if (period.id === "year") {
    return "January – December";
  }
  if (period.months.length === 1) {
    return monthLabel(period.months[0]);
  }
  return `${monthLabel(period.months[0])} – ${monthLabel(
    period.months[period.months.length - 1],
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
  const periodMenuRef = useRef<HTMLDivElement | null>(null);
  const [periodId, setPeriodId] = useState<PeriodId>("summer");
  const [customStartMonth, setCustomStartMonth] = useState(1);
  const [customEndMonth, setCustomEndMonth] = useState(1);
  const [isPeriodMenuOpen, setIsPeriodMenuOpen] = useState(false);
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

  useEffect(() => {
    if (!isPeriodMenuOpen) {
      return;
    }
    function closeOnOutsidePointer(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !periodMenuRef.current?.contains(event.target)
      ) {
        setIsPeriodMenuOpen(false);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsPeriodMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isPeriodMenuOpen]);

  const selectedYear = data?.selectedYear ?? null;
  const years = data?.years ?? [];
  const selectedPeriod = useMemo(
    () => periodFor(periodId, customStartMonth, customEndMonth),
    [customEndMonth, customStartMonth, periodId],
  );
  const periodAlbums = useMemo(
    () =>
      albumsForPeriod(data?.albums ?? [], selectedPeriod.months).sort(
        albumChronology,
      ),
    [data?.albums, selectedPeriod],
  );
  const selectedAlbum =
    periodAlbums.find((album) => album.id === selectedAlbumId) ??
    periodAlbums[0] ??
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
    selectedPeriod.id === "year"
      ? `Explore ${selectedYear}`
      : `Relive ${selectedPeriod.label} ${selectedYear}`;
  const customPeriodLabel = periodFor(
    "custom",
    customStartMonth,
    customEndMonth,
  ).label;
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
    if (periodAlbums.length === 0) {
      return;
    }
    const title = selectorLabel;
    onCreatePlaylist({
      title,
      albumIds: periodAlbums.map((album) => album.albumId),
      prompt: `Create a playlist that relives ${
        selectedPeriod.id === "year"
          ? `the album arrivals of ${selectedYear}`
          : `${selectedPeriod.label.toLowerCase()} ${selectedYear}`
      }. Use only music from these albums and let the sequence move chronologically through their Billboard debut weeks.`,
    });
  }

  function choosePreset(nextPeriodId: PresetPeriodId) {
    setPeriodId(nextPeriodId);
    setSelectedAlbumId(null);
    setIsPeriodMenuOpen(false);
  }

  function applyCustomPeriod() {
    setPeriodId("custom");
    setSelectedAlbumId(null);
    setIsPeriodMenuOpen(false);
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
          <div className="album-time-ribbon-period-picker" ref={periodMenuRef}>
            <button
              type="button"
              className="album-time-ribbon-season-select"
              aria-label={`Period: ${selectedPeriod.label} ${selectedYear}`}
              aria-haspopup="dialog"
              aria-expanded={isPeriodMenuOpen}
              onClick={() => setIsPeriodMenuOpen((current) => !current)}
            >
              <CalendarBlank size={18} weight="light" aria-hidden="true" />
              <span className="album-time-ribbon-period-copy">
                <small>Period</small>
                <strong>
                  {selectedPeriod.label} {selectedYear}
                </strong>
              </span>
              <CaretDown
                className={isPeriodMenuOpen ? "is-open" : ""}
                size={14}
                weight="bold"
                aria-hidden="true"
              />
            </button>
            {isPeriodMenuOpen ? (
              <div
                className="album-time-ribbon-period-menu"
                role="dialog"
                aria-label="Choose timeline period"
              >
                <header>
                  <strong>Choose a period</strong>
                  <span>Use a ready-made moment or build your own.</span>
                </header>
                <div
                  className="album-time-ribbon-period-presets"
                  role="group"
                  aria-label="Period presets"
                >
                  {periodPresets.map((preset) => (
                    <button
                      type="button"
                      className={periodId === preset.id ? "active" : ""}
                      aria-pressed={periodId === preset.id}
                      onClick={() => choosePreset(preset.id)}
                      key={preset.id}
                    >
                      <span>
                        <strong>{preset.label}</strong>
                        <small>
                          {periodRangeLabel(periodFor(preset.id, 1, 1))}
                        </small>
                      </span>
                      {periodId === preset.id ? (
                        <Check size={15} weight="bold" aria-hidden="true" />
                      ) : null}
                    </button>
                  ))}
                </div>
                <div className="album-time-ribbon-custom-period">
                  <div>
                    <strong>Custom months</strong>
                    <span>Single months and ranges can wrap across December.</span>
                  </div>
                  <div className="album-time-ribbon-custom-fields">
                    <label>
                      <span>From</span>
                      <select
                        value={customStartMonth}
                        onChange={(event) =>
                          setCustomStartMonth(Number(event.target.value))
                        }
                        aria-label="Custom period from month"
                      >
                        {calendarMonths.map((month) => (
                          <option value={month} key={month}>
                            {monthLabel(month)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <span aria-hidden="true">through</span>
                    <label>
                      <span>To</span>
                      <select
                        value={customEndMonth}
                        onChange={(event) =>
                          setCustomEndMonth(Number(event.target.value))
                        }
                        aria-label="Custom period to month"
                      >
                        {calendarMonths.map((month) => (
                          <option value={month} key={month}>
                            {monthLabel(month)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <button
                    type="button"
                    className="album-time-ribbon-apply-period"
                    onClick={applyCustomPeriod}
                  >
                    Show {customPeriodLabel}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
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
        <div
          className={`album-time-ribbon-months${
            selectedPeriod.contextMonths.length > 6 ? " is-wide" : ""
          }`}
          style={
            {
              "--album-time-month-count": selectedPeriod.contextMonths.length,
            } as CSSProperties
          }
        >
          {selectedPeriod.contextMonths.map((month) => (
            <div
              className={`album-time-ribbon-month${
                selectedPeriod.months.includes(month) ? " in-season" : ""
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
                      const album = periodAlbums.find(
                        (candidate) =>
                          candidate.billboardDebutMonth === month &&
                          candidate.billboardDebutWeek === week,
                      );
                      if (album) {
                        setSelectedAlbumId(album.id);
                      }
                    }}
                    disabled={!periodAlbums.some(
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
              {periodRangeLabel(selectedPeriod)} · {periodAlbums.length} of{" "}
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
              disabled={periodAlbums.length === 0}
              onClick={createPlaylist}
            >
              <Play size={15} weight="fill" aria-hidden="true" />
              Create playlist
              <Plus size={16} weight="bold" aria-hidden="true" />
            </button>
          </div>
        </header>

        {periodAlbums.length > 0 ? (
          <div className="album-time-ribbon-covers" role="list">
            {periodAlbums.map((album, index) => (
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
            <strong>No {selectedPeriod.label.toLowerCase()} arrivals in {selectedYear}</strong>
            <span>Choose another period or move to the next chart year.</span>
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
