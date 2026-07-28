import "@fontsource/cormorant-garamond/latin-600.css";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-500.css";
import "@fontsource/manrope/latin-600.css";

import {
  ArrowCounterClockwise,
  ArrowsDownUp,
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
  TrackDebutTimelineResponse,
  TrackDebutTimelineTrack,
  TimelineChartSource,
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
type AlbumOrderMode =
  | "debut"
  | "score"
  | "billboard"
  | "title"
  | "artist"
  | "custom";
type AlbumOrderDirection = "ascending" | "descending";
export type TimelineMode = "albums" | "tracks";

type TimelineWeekSelection = {
  scope: string;
  month: number;
  week: number;
};

type TimelineRibbonItem = AlbumDebutTimelineAlbum & {
  trackId?: number | null;
  sourceAlbumTitle?: string | null;
  debutDate?: string | null;
};

type TimelineRibbonYear = {
  year: number;
  albumCount: number;
  representativeAlbum: TimelineRibbonItem | null;
};

type TimelineRibbonData = {
  years: TimelineRibbonYear[];
  selectedYear: number | null;
  albums: TimelineRibbonItem[];
  datedAlbumCount: number;
  undatedAlbumCount: number;
};

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
  trackIds: number[];
  mode: TimelineMode;
};

type AlbumTimeRibbonProps = {
  data: AlbumDebutTimelineResponse | TrackDebutTimelineResponse | null;
  mode?: TimelineMode;
  chartSource?: TimelineChartSource;
  error: string | null;
  isLoading: boolean;
  onCreatePlaylist: (selection: AlbumTimeRibbonPlaylist) => void;
  onModeChange?: (mode: TimelineMode) => void;
  onChartSourceChange?: (source: TimelineChartSource) => void;
  onOpenAlbum: (albumId: string) => void;
  onOpenTrack?: (trackId: number) => void;
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
const emptyAlbumOrder: string[] = [];

const albumOrderOptions: Array<{
  id: AlbumOrderMode;
  label: string;
  defaultDirection: AlbumOrderDirection;
}> = [
  { id: "debut", label: "First appearance", defaultDirection: "ascending" },
  { id: "score", label: "Album score", defaultDirection: "descending" },
  { id: "billboard", label: "Chart rank", defaultDirection: "ascending" },
  { id: "title", label: "Album title", defaultDirection: "ascending" },
  { id: "artist", label: "Artist", defaultDirection: "ascending" },
  { id: "custom", label: "Custom order", defaultDirection: "ascending" },
];

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
  albums: TimelineRibbonItem[],
  months: number[],
) {
  return albums.filter((album) =>
    months.includes(album.billboardDebutMonth),
  );
}

function albumChronology(
  left: TimelineRibbonItem,
  right: TimelineRibbonItem,
) {
  return (
    left.billboardDebutWeekKey.localeCompare(right.billboardDebutWeekKey) ||
    (left.album ?? "").localeCompare(right.album ?? "")
  );
}

function compareOptionalNumber(
  left: number | null,
  right: number | null,
  direction: AlbumOrderDirection,
) {
  if (left == null && right == null) {
    return 0;
  }
  if (left == null) {
    return 1;
  }
  if (right == null) {
    return -1;
  }
  const comparison = left - right;
  return direction === "ascending" ? comparison : -comparison;
}

export function orderTimelineAlbums(
  albums: TimelineRibbonItem[],
  mode: AlbumOrderMode,
  direction: AlbumOrderDirection,
  customOrder: string[] = [],
) {
  if (mode === "custom") {
    const customIndexes = new Map(
      customOrder.map((albumId, index) => [albumId, index]),
    );
    return [...albums].sort((left, right) => {
      const leftIndex = customIndexes.get(left.id);
      const rightIndex = customIndexes.get(right.id);
      if (leftIndex == null && rightIndex == null) {
        return albumChronology(left, right);
      }
      if (leftIndex == null) {
        return 1;
      }
      if (rightIndex == null) {
        return -1;
      }
      return leftIndex - rightIndex;
    });
  }

  return [...albums].sort((left, right) => {
    let comparison = 0;
    switch (mode) {
      case "debut":
        comparison = albumChronology(left, right);
        break;
      case "score":
        comparison = compareOptionalNumber(
          left.albumScore,
          right.albumScore,
          direction,
        );
        break;
      case "billboard":
        comparison = compareOptionalNumber(
          left.billboardRank,
          right.billboardRank,
          direction,
        );
        break;
      case "title":
        comparison = (left.album ?? "").localeCompare(right.album ?? "");
        break;
      case "artist":
        comparison = (left.albumArtistDisplay ?? "").localeCompare(
          right.albumArtistDisplay ?? "",
        );
        break;
    }
    if (mode === "debut") {
      return direction === "ascending" ? comparison : -comparison;
    }
    if (mode === "title" || mode === "artist") {
      comparison = direction === "ascending" ? comparison : -comparison;
    }
    return comparison || albumChronology(left, right);
  });
}

function albumOrderDirectionLabel(
  mode: AlbumOrderMode,
  direction: AlbumOrderDirection,
) {
  switch (mode) {
    case "debut":
      return direction === "ascending" ? "Oldest first" : "Newest first";
    case "score":
      return direction === "ascending" ? "Low score first" : "High score first";
    case "billboard":
      return direction === "ascending" ? "Best rank first" : "Lowest rank first";
    case "title":
    case "artist":
      return direction === "ascending" ? "A–Z" : "Z–A";
    case "custom":
      return "Custom order";
  }
}

function albumOrderDescription(
  mode: AlbumOrderMode,
  direction: AlbumOrderDirection,
  timelineMode: TimelineMode = "albums",
) {
  const directionLabel = albumOrderDirectionLabel(mode, direction);
  if (mode === "score") {
    return `${directionLabel}; ${
      timelineMode === "tracks" ? "tracks without a rating" : "albums without a score"
    } stay last.`;
  }
  if (mode === "billboard") {
    return `${directionLabel}; unranked ${timelineMode === "tracks" ? "tracks" : "albums"} stay last.`;
  }
  if (mode === "debut") {
    return `${directionLabel} by chart first-appearance week.`;
  }
  if (mode === "custom") {
    return "Select a cover, then move it earlier or later.";
  }
  return directionLabel;
}

function albumOrderMetricLabel(
  album: TimelineRibbonItem,
  mode: AlbumOrderMode,
  timelineMode: TimelineMode = "albums",
) {
  if (mode === "score") {
    return album.albumScore == null
      ? "No score"
      : `${timelineMode === "tracks" ? "Rating" : "Score"} ${album.albumScore.toLocaleString(undefined, {
          maximumFractionDigits: 3,
        })}`;
  }
  if (mode === "billboard") {
    return album.billboardRank == null
      ? "Unranked"
      : `#${album.billboardRank.toLocaleString()}`;
  }
  return null;
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
  years: TimelineRibbonYear[],
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

function trackToTimelineItem(track: TrackDebutTimelineTrack): TimelineRibbonItem {
  return {
    id: `track:${track.id}`,
    albumId: track.albumId,
    album: track.title,
    albumArtistDisplay: track.displayArtist ?? track.albumArtistDisplay,
    canonicalGenre: track.canonicalGenre,
    year: track.year,
    albumScore:
      track.normalizedRating == null ? null : track.normalizedRating / 20,
    billboardRank: track.billboardSingleRank,
    billboardYear: track.billboardSingleYear,
    billboardDebutYear: track.billboardSingleDebutYear,
    billboardDebutMonth: track.billboardSingleDebutMonth,
    billboardDebutWeek: track.billboardSingleDebutWeek,
    billboardDebutWeekKey: track.billboardSingleDebutWeekKey,
    coverPath: track.coverPath,
    coverMimeType: track.coverMimeType,
    trackId: track.trackId,
    sourceAlbumTitle: track.album,
    debutDate: track.billboardSingleDebutDate,
  };
}

function normalizeTimelineData(
  data: AlbumDebutTimelineResponse | TrackDebutTimelineResponse | null,
  mode: TimelineMode,
): TimelineRibbonData | null {
  if (!data) return null;
  if (mode === "albums") {
    const albumData = data as AlbumDebutTimelineResponse;
    return {
      ...albumData,
      albums: albumData.albums.map((album) => ({
        ...album,
        trackId: null,
        sourceAlbumTitle: album.album,
        debutDate: null,
      })),
      years: albumData.years.map((year) => ({
        year: year.year,
        albumCount: year.albumCount,
        representativeAlbum: year.representativeAlbum
          ? {
              ...year.representativeAlbum,
              trackId: null,
              sourceAlbumTitle: year.representativeAlbum.album,
              debutDate: null,
            }
          : null,
      })),
    };
  }

  const trackData = data as TrackDebutTimelineResponse;
  return {
    selectedYear: trackData.selectedYear,
    albums: trackData.tracks.map(trackToTimelineItem),
    years: trackData.years.map((year) => ({
      year: year.year,
      albumCount: year.trackCount,
      representativeAlbum: year.representativeTrack
        ? trackToTimelineItem(year.representativeTrack)
        : null,
    })),
    datedAlbumCount: trackData.datedTrackCount,
    undatedAlbumCount: trackData.undatedTrackCount,
  };
}

function LoadingTimeline({ mode }: { mode: TimelineMode }) {
  return (
    <section className="album-time-ribbon-state" aria-live="polite">
      <div className="album-time-ribbon-skeleton-title" />
      <div className="album-time-ribbon-skeleton-line" />
      <div className="album-time-ribbon-skeleton-covers">
        {Array.from({ length: 8 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
      <strong>
        Mapping {mode === "tracks" ? "track" : "album"} chart arrivals across
        your library
      </strong>
    </section>
  );
}

function ChartSourceToggle({
  chartSource,
  mode,
  onChange,
}: {
  chartSource: TimelineChartSource;
  mode: TimelineMode;
  onChange: (source: TimelineChartSource) => void;
}) {
  return (
    <div
      className="album-time-ribbon-mode album-time-ribbon-country"
      role="group"
      aria-label="Timeline chart source"
    >
      <button
        type="button"
        className={chartSource === "billboard" ? "active" : ""}
        aria-pressed={chartSource === "billboard"}
        onClick={() => onChange("billboard")}
      >
        US · Billboard
      </button>
      <button
        type="button"
        className={chartSource === "vgLista" ? "active" : ""}
        aria-pressed={chartSource === "vgLista"}
        onClick={() => onChange("vgLista")}
      >
        NO · VG Lista
      </button>
      {mode === "tracks" ? (
        <button
          type="button"
          className={chartSource === "tiISkuddet" ? "active" : ""}
          aria-pressed={chartSource === "tiISkuddet"}
          onClick={() => onChange("tiISkuddet")}
        >
          NO · Ti i Skuddet
        </button>
      ) : null}
      {mode === "tracks" ? (
        <button
          type="button"
          className={chartSource === "norsktoppen" ? "active" : ""}
          aria-pressed={chartSource === "norsktoppen"}
          onClick={() => onChange("norsktoppen")}
        >
          NO · Norsktoppen
        </button>
      ) : null}
    </div>
  );
}

export function AlbumTimeRibbon({
  data,
  mode = "albums",
  chartSource = "billboard",
  error,
  isLoading,
  onCreatePlaylist,
  onModeChange = () => undefined,
  onChartSourceChange = () => undefined,
  onOpenAlbum,
  onOpenTrack = () => undefined,
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
  const [albumOrderMode, setAlbumOrderMode] =
    useState<AlbumOrderMode>("debut");
  const [albumOrderDirection, setAlbumOrderDirection] =
    useState<AlbumOrderDirection>("ascending");
  const [customAlbumOrders, setCustomAlbumOrders] = useState<
    Record<string, string[]>
  >({});
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [selectedWeekSelection, setSelectedWeekSelection] =
    useState<TimelineWeekSelection | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const normalizedData = useMemo(
    () => normalizeTimelineData(data, mode),
    [data, mode],
  );
  const chartSourceLabel =
    chartSource === "norsktoppen"
      ? "Norsktoppen"
      : chartSource === "tiISkuddet"
      ? "Ti i Skuddet"
      : chartSource === "vgLista"
        ? "VG Lista"
        : "Billboard";

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

  const selectedYear = normalizedData?.selectedYear ?? null;
  const years = normalizedData?.years ?? [];
  const selectedPeriod = useMemo(
    () => periodFor(periodId, customStartMonth, customEndMonth),
    [customEndMonth, customStartMonth, periodId],
  );
  const periodScope = `${mode}:${selectedYear ?? "none"}:${
    selectedPeriod.id
  }:${selectedPeriod.months.join("-")}`;
  const activeWeekSelection =
    selectedWeekSelection?.scope === periodScope
      ? selectedWeekSelection
      : null;
  const activeWeekMonth = activeWeekSelection?.month ?? null;
  const activeWeek = activeWeekSelection?.week ?? null;
  const albumOrderScope = `${periodScope}:${
    activeWeekMonth == null || activeWeek == null
      ? "all"
      : `${activeWeekMonth}-${activeWeek}`
  }`;
  const cohortAlbums = useMemo(
    () =>
      orderTimelineAlbums(
        albumsForPeriod(normalizedData?.albums ?? [], selectedPeriod.months),
        "debut",
        "ascending",
      ),
    [normalizedData?.albums, selectedPeriod],
  );
  const visibleAlbums = useMemo(
    () =>
      activeWeekMonth == null || activeWeek == null
        ? cohortAlbums
        : cohortAlbums.filter(
            (album) =>
              album.billboardDebutMonth === activeWeekMonth &&
              album.billboardDebutWeek === activeWeek,
          ),
    [activeWeek, activeWeekMonth, cohortAlbums],
  );
  const customOrderForScope =
    customAlbumOrders[albumOrderScope] ?? emptyAlbumOrder;
  const orderedAlbums = useMemo(
    () =>
      orderTimelineAlbums(
        visibleAlbums,
        albumOrderMode,
        albumOrderDirection,
        customOrderForScope,
      ),
    [
      albumOrderDirection,
      albumOrderMode,
      visibleAlbums,
      customOrderForScope,
    ],
  );
  const selectedAlbum =
    orderedAlbums.find((album) => album.id === selectedAlbumId) ??
    orderedAlbums[0] ??
    null;

  if (!normalizedData && isLoading) {
    return <LoadingTimeline mode={mode} />;
  }

  if (error && !normalizedData) {
    return (
      <section className="album-time-ribbon-state error" role="alert">
        <WarningCircle size={30} weight="light" aria-hidden="true" />
        <strong>
          The {mode === "tracks" ? "track" : "album"} timeline could not be
          loaded
        </strong>
        <span>{error}</span>
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      </section>
    );
  }

  if (!normalizedData || selectedYear == null || years.length === 0) {
    return (
      <section className="album-time-ribbon-state">
        <ChartSourceToggle
          chartSource={chartSource}
          mode={mode}
          onChange={onChartSourceChange}
        />
        <CalendarBlank size={30} weight="light" aria-hidden="true" />
        <strong>No {mode === "tracks" ? "track debut dates" : "album debut weeks"} yet</strong>
        <span>
          Import the{" "}
          {chartSource === "norsktoppen"
            ? "CSV_NORSKTOPPEN_NO"
            : chartSource === "tiISkuddet"
            ? "CSV_TIISKUDDET_NO"
            : chartSource === "vgLista"
              ? mode === "tracks"
                ? "CSV_SINGLES_NO"
                : "CSV_ALBUMS_NO"
              : mode === "tracks"
                ? "CSV_SINGLES"
                : "CSV_ALBUMS"}{" "}
          folder to place your collection on this timeline.
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
  const selectedAlbumWeek = selectedAlbum?.billboardDebutWeek ?? null;
  const selectedDebutLabel =
    mode === "tracks" && selectedAlbum?.debutDate
      ? `${new Intl.DateTimeFormat(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        }).format(new Date(`${selectedAlbum.debutDate}T00:00:00Z`))}${
          selectedAlbumWeek == null ? "" : ` · Week ${selectedAlbumWeek}`
        }`
      : selectedAlbumWeek == null
        ? null
        : `Week ${selectedAlbumWeek}`;
  const selectorLabel =
    selectedPeriod.id === "year"
      ? `Explore ${selectedYear}`
      : `Relive ${selectedPeriod.label} ${selectedYear}`;
  const customPeriodLabel = periodFor(
    "custom",
    customStartMonth,
    customEndMonth,
  ).label;
  const selectedAlbumOrderIndex = selectedAlbum
    ? orderedAlbums.findIndex((album) => album.id === selectedAlbum.id)
    : -1;
  const chronologicalAlbumIds = visibleAlbums.map((album) => album.id);
  const customOrderIsModified =
    albumOrderMode === "custom" &&
    orderedAlbums.some(
      (album, index) => album.id !== chronologicalAlbumIds[index],
    );
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
    if (orderedAlbums.length === 0) {
      return;
    }
    const title =
      activeWeekMonth == null || activeWeek == null
        ? selectorLabel
        : `${selectorLabel} · ${monthLabel(activeWeekMonth)} week ${activeWeek}`;
    const orderLabel =
      albumOrderOptions.find((option) => option.id === albumOrderMode)?.label ??
      "First appearance";
    const orderInstruction =
      albumOrderMode === "debut"
        ? `let the sequence move ${
            albumOrderDirection === "ascending" ? "forward" : "backward"
          } through ${chartSourceLabel} debut weeks`
        : albumOrderMode === "custom"
          ? `follow the custom ${mode === "tracks" ? "track" : "album"} order exactly`
          : `follow the visible ${orderLabel.toLowerCase()} order`;
    onCreatePlaylist({
      title,
      albumIds:
        mode === "albums" ? orderedAlbums.map((album) => album.albumId) : [],
      trackIds:
        mode === "tracks"
          ? orderedAlbums.flatMap((album) =>
              album.trackId == null ? [] : [album.trackId],
            )
          : [],
      mode,
      prompt: `Create a playlist that relives ${
        selectedPeriod.id === "year"
          ? `the ${mode === "tracks" ? "track" : "album"} arrivals of ${selectedYear}`
          : `${selectedPeriod.label.toLowerCase()} ${selectedYear}`
      }${
        activeWeek == null
          ? ""
          : `, narrowed to ${chartSourceLabel} ${
              mode === "tracks" ? "chart-entry" : "first-appearance"
            } week ${activeWeek}`
      }. Use only ${mode === "tracks" ? "these tracks" : "music from these albums"} and ${orderInstruction}.`,
    });
  }

  function chooseMode(nextMode: TimelineMode) {
    setSelectedAlbumId(null);
    setSelectedWeekSelection(null);
    if (
      nextMode === "albums" &&
      (chartSource === "tiISkuddet" || chartSource === "norsktoppen")
    ) {
      onChartSourceChange("vgLista");
    }
    onModeChange(nextMode);
  }

  function chooseChartSource(nextSource: TimelineChartSource) {
    setSelectedAlbumId(null);
    setSelectedWeekSelection(null);
    onChartSourceChange(nextSource);
  }

  function chooseYear(year: number) {
    setSelectedAlbumId(null);
    setSelectedWeekSelection(null);
    onSelectYear(year);
  }

  function chooseAllWeeks() {
    setSelectedAlbumId(null);
    setSelectedWeekSelection(null);
  }

  function chooseWeek(month: number, week: number) {
    setSelectedAlbumId(null);
    setSelectedWeekSelection((current) =>
      current?.scope === periodScope &&
      current.month === month &&
      current.week === week
        ? null
        : { scope: periodScope, month, week },
    );
  }

  function chooseAlbumOrder(nextMode: AlbumOrderMode) {
    const option =
      albumOrderOptions.find((candidate) => candidate.id === nextMode) ??
      albumOrderOptions[0];
    if (nextMode === "custom") {
      setCustomAlbumOrders((current) =>
        Object.prototype.hasOwnProperty.call(current, albumOrderScope)
          ? current
          : {
              ...current,
              [albumOrderScope]: orderedAlbums.map((album) => album.id),
            },
      );
    }
    setAlbumOrderMode(nextMode);
    setAlbumOrderDirection(option.defaultDirection);
  }

  function toggleAlbumOrderDirection() {
    setAlbumOrderDirection((current) =>
      current === "ascending" ? "descending" : "ascending",
    );
  }

  function moveSelectedAlbum(offset: -1 | 1) {
    if (!selectedAlbum || selectedAlbumOrderIndex < 0) {
      return;
    }
    const destinationIndex = selectedAlbumOrderIndex + offset;
    if (destinationIndex < 0 || destinationIndex >= orderedAlbums.length) {
      return;
    }
    const nextOrder = orderedAlbums.map((album) => album.id);
    [nextOrder[selectedAlbumOrderIndex], nextOrder[destinationIndex]] = [
      nextOrder[destinationIndex],
      nextOrder[selectedAlbumOrderIndex],
    ];
    setCustomAlbumOrders((current) => ({
      ...current,
      [albumOrderScope]: nextOrder,
    }));
  }

  function resetCustomAlbumOrder() {
    setCustomAlbumOrders((current) => ({
      ...current,
      [albumOrderScope]: chronologicalAlbumIds,
    }));
  }

  function choosePreset(nextPeriodId: PresetPeriodId) {
    setPeriodId(nextPeriodId);
    setSelectedAlbumId(null);
    setSelectedWeekSelection(null);
    setIsPeriodMenuOpen(false);
  }

  function applyCustomPeriod() {
    setPeriodId("custom");
    setSelectedAlbumId(null);
    setSelectedWeekSelection(null);
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
        <div className="album-time-ribbon-heading">
          <div
            className="album-time-ribbon-mode"
            role="group"
            aria-label="Timeline content"
          >
            <button
              type="button"
              className={mode === "albums" ? "active" : ""}
              aria-pressed={mode === "albums"}
              onClick={() => chooseMode("albums")}
            >
              Albums
            </button>
            <button
              type="button"
              className={mode === "tracks" ? "active" : ""}
              aria-pressed={mode === "tracks"}
              onClick={() => chooseMode("tracks")}
            >
              Tracks
            </button>
          </div>
          <ChartSourceToggle
            chartSource={chartSource}
            mode={mode}
            onChange={chooseChartSource}
          />
          <h1>{mode === "tracks" ? "Tracks" : "Albums"} through the years</h1>
          <p>
            Explore {normalizedData.datedAlbumCount.toLocaleString()} {mode === "tracks" ? "track" : "album"}
            {normalizedData.datedAlbumCount === 1 ? " arrival" : " arrivals"} week by week across decades.
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
            onClick={() => previousYear != null && chooseYear(previousYear)}
          >
            <CaretLeft size={19} weight="light" />
          </button>
          <button
            type="button"
            className="album-time-ribbon-square-action"
            disabled={nextYear == null}
            aria-label="Next chart year"
            onClick={() => nextYear != null && chooseYear(nextYear)}
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

        <div className="album-time-ribbon-decade-rail" aria-hidden="true" />
        <div className="album-time-ribbon-decade-nodes" aria-hidden="true">
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
              key={`decade-node-${year}`}
            />
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
              aria-label={`${year.year}, ${year.albumCount} ${mode === "tracks" ? "track" : "album"}${
                year.albumCount === 1 ? "" : "s"
              }`}
              aria-pressed={year.year === selectedYear}
              onClick={() => chooseYear(year.year)}
              key={year.year}
            />
          ))}
        </div>

        <div
          className="album-time-ribbon-markers"
          role="group"
          aria-label={`Representative ${mode === "tracks" ? "track" : "album"} years`}
        >
          {markerYears.map((year, index) => {
            const album = year.representativeAlbum;
            if (!album || year.year === selectedYear) {
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
                onClick={() => chooseYear(year.year)}
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
                      activeWeekMonth === month && activeWeek === week
                        ? "active"
                        : ""
                    }
                    onClick={() => chooseWeek(month, week)}
                    disabled={!cohortAlbums.some(
                      (album) =>
                        album.billboardDebutMonth === month &&
                        album.billboardDebutWeek === week,
                    )}
                    aria-label={`${monthLabel(month)} week ${week}`}
                    aria-pressed={
                      activeWeekMonth === month && activeWeek === week
                    }
                    key={week}
                  >
                    W{weekIndex + 1}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="album-time-ribbon-week-filter">
          <span>View</span>
          <button
            type="button"
            className={activeWeek == null ? "active" : ""}
            aria-pressed={activeWeek == null}
            aria-label={`All weeks in ${selectedPeriod.label} ${selectedYear}`}
            onClick={chooseAllWeeks}
          >
            All weeks
          </button>
          <small>
            {activeWeekMonth == null || activeWeek == null
              ? "Entire period"
              : `${monthLabel(activeWeekMonth)} · Week ${activeWeek}`}
          </small>
        </div>
      </section>

      <section className="album-time-ribbon-drawer" aria-live="polite">
        <header>
          <div>
            <strong>{selectorLabel.replace("Relive ", "")}</strong>
            <span>
              {activeWeekMonth == null || activeWeek == null
                ? periodRangeLabel(selectedPeriod)
                : `${monthLabel(activeWeekMonth)} · Week ${activeWeek}`} ·{" "}
              {orderedAlbums.length} of{" "}
              {yearSummary.albumCount} {mode === "tracks" ? "track" : "album"}
              {yearSummary.albumCount === 1 ? " arrival" : " arrivals"}
            </span>
            {selectedAlbum ? (
              <small>
                {selectedAlbum.album ?? "Untitled"} —{" "}
                {selectedAlbum.albumArtistDisplay ?? "Unknown artist"}
                {selectedDebutLabel ? ` · ${selectedDebutLabel}` : ""}
              </small>
            ) : null}
          </div>
          <div className="album-time-ribbon-drawer-actions">
            {selectedAlbum ? (
              <button
                type="button"
                className="album-time-ribbon-open-album"
                onClick={() =>
                  mode === "tracks" && selectedAlbum.trackId != null
                    ? onOpenTrack(selectedAlbum.trackId)
                    : onOpenAlbum(selectedAlbum.albumId)
                }
              >
                {mode === "tracks" ? "Open track" : "Open album"}
              </button>
            ) : null}
            <button
              type="button"
              className="album-time-ribbon-playlist"
              disabled={orderedAlbums.length === 0}
              onClick={createPlaylist}
            >
              <Play size={15} weight="fill" aria-hidden="true" />
              Create playlist
              <Plus size={16} weight="bold" aria-hidden="true" />
            </button>
          </div>
        </header>

        {orderedAlbums.length > 0 ? (
          <div
            className="album-time-ribbon-order-bar"
            aria-label={`${mode === "tracks" ? "Track" : "Album"} order controls`}
          >
            <div className="album-time-ribbon-order-controls">
              <label className="album-time-ribbon-order-select">
                <ArrowsDownUp size={16} weight="bold" aria-hidden="true" />
                <span>Order</span>
                <select
                  value={albumOrderMode}
                  onChange={(event) =>
                    chooseAlbumOrder(event.target.value as AlbumOrderMode)
                  }
                  aria-label={`${mode === "tracks" ? "Track" : "Album"} order`}
                >
                  {albumOrderOptions.map((option) => (
                    <option value={option.id} key={option.id}>
                      {mode === "tracks" && option.id === "score"
                        ? "Track rating"
                        : mode === "tracks" && option.id === "title"
                          ? "Track title"
                          : option.label}
                    </option>
                  ))}
                </select>
              </label>
              {albumOrderMode === "custom" ? (
                <div
                  className="album-time-ribbon-custom-order-actions"
                  role="group"
                  aria-label={`Custom ${mode === "tracks" ? "track" : "album"} order`}
                >
                  <button
                    type="button"
                    onClick={() => moveSelectedAlbum(-1)}
                    disabled={selectedAlbumOrderIndex <= 0}
                    aria-label="Move selected album earlier"
                  >
                    <CaretLeft size={13} weight="bold" aria-hidden="true" />
                    Earlier
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSelectedAlbum(1)}
                    disabled={
                      selectedAlbumOrderIndex < 0 ||
                      selectedAlbumOrderIndex >= orderedAlbums.length - 1
                    }
                    aria-label="Move selected album later"
                  >
                    Later
                    <CaretRight size={13} weight="bold" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={resetCustomAlbumOrder}
                    disabled={!customOrderIsModified}
                    aria-label="Reset custom album order"
                  >
                    <ArrowCounterClockwise
                      size={13}
                      weight="bold"
                      aria-hidden="true"
                    />
                    Reset
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="album-time-ribbon-order-direction"
                  onClick={toggleAlbumOrderDirection}
                    aria-label={`Reverse ${mode === "tracks" ? "track" : "album"} order; currently ${albumOrderDirectionLabel(
                    albumOrderMode,
                    albumOrderDirection,
                  )}`}
                >
                  {albumOrderDirectionLabel(
                    albumOrderMode,
                    albumOrderDirection,
                  )}
                  <ArrowsDownUp size={13} weight="bold" aria-hidden="true" />
                </button>
              )}
            </div>
            <span className="album-time-ribbon-order-description">
              {albumOrderDescription(albumOrderMode, albumOrderDirection, mode)}
            </span>
          </div>
        ) : null}

        {orderedAlbums.length > 0 ? (
          <div
            className="album-time-ribbon-covers"
            role="list"
            aria-label={`${mode === "tracks" ? "Tracks" : "Albums"} in selected period`}
          >
            {orderedAlbums.map((album, index) => {
              const orderMetricLabel = albumOrderMetricLabel(
                album,
                albumOrderMode,
                mode,
              );
              return (
                <button
                  type="button"
                  role="listitem"
                  className={`${album.id === selectedAlbum?.id ? "active" : ""}${
                    mode === "tracks" ? " is-track" : ""
                  }`}
                  aria-label={`${album.album ?? "Untitled"} by ${
                    album.albumArtistDisplay ?? "Unknown artist"
                  }, ${monthLabel(album.billboardDebutMonth, "short")} ${
                    album.billboardDebutYear
                  }, week ${album.billboardDebutWeek}${
                    albumOrderMode === "custom"
                      ? `, custom position ${index + 1}`
                      : ""
                  }`}
                  aria-pressed={album.id === selectedAlbum?.id}
                  onClick={() => setSelectedAlbumId(album.id)}
                  style={{ "--album-time-cover-index": index } as CSSProperties}
                  key={album.id}
                >
                  <span className="album-time-ribbon-cover-art">
                    {albumOrderMode === "custom" ? (
                      <span
                        className="album-time-ribbon-order-index"
                        aria-hidden="true"
                      >
                        {index + 1}
                      </span>
                    ) : null}
                    {orderMetricLabel ? (
                      <span
                        className="album-time-ribbon-order-value"
                        aria-hidden="true"
                      >
                        {orderMetricLabel}
                      </span>
                    ) : null}
                    <AlbumCover row={album} decorative={false} previewOnHover />
                  </span>
                  <span className="album-time-ribbon-cover-info" aria-hidden="true">
                    <strong>{album.album ?? "Untitled"}</strong>
                    <span>{album.albumArtistDisplay ?? "Unknown artist"}</span>
                    {mode === "tracks" && album.sourceAlbumTitle ? (
                      <small>{album.sourceAlbumTitle}</small>
                    ) : null}
                  </span>
                </button>
              );
            })}
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
          {chartSourceLabel} chart debut is used as the historical date marker.
        </span>
        {normalizedData.undatedAlbumCount > 0 ? (
          <span>
            {normalizedData.undatedAlbumCount.toLocaleString()} {mode === "tracks"
              ? normalizedData.undatedAlbumCount === 1
                ? "track has no chart-entry date"
                : "tracks have no chart-entry date"
              : normalizedData.undatedAlbumCount === 1
                ? "album has no debut week"
                : "albums have no debut week"}.
          </span>
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
