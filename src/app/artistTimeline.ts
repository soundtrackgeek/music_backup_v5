import type {
  ArtistTimelineAlbum,
  ArtistTimelineArtist,
  ArtistTimelineMetric,
  ArtistTimelineRequest,
  ArtistTimelineResponse,
} from "../types";

export const artistTimelineLimits = [7, 12, 20] as const;
export type ArtistTimelineLimit = (typeof artistTimelineLimits)[number];

export const artistTimelinePalette = [
  "#f0a33b",
  "#4ed8d0",
  "#718de7",
  "#dd6797",
  "#ed6c52",
  "#9fbb70",
  "#a887df",
  "#59b89f",
  "#e1c557",
  "#5bafd2",
  "#cf7eaa",
  "#7dac8a",
] as const;

export type ArtistPeakPoint = {
  album: ArtistTimelineAlbum;
  x: number;
  baselineY: number;
  peakY: number;
  strength: number;
  path: string;
};

export type ArtistCareerRow = {
  artist: ArtistTimelineArtist;
  color: string;
  baselineY: number;
  points: ArtistPeakPoint[];
  strongest: ArtistPeakPoint[];
};

export type ArtistCareerPeaksLayout = {
  rows: ArtistCareerRow[];
  ticks: number[];
  yearFrom: number;
  yearTo: number;
  plotLeft: number;
  plotRight: number;
  plotTop: number;
  plotBottom: number;
  width: number;
  height: number;
};

export function createArtistTimelineRequest(options: {
  yearFrom: number | null;
  yearTo: number | null;
  includedGenres: string[];
  excludedGenres: string[];
  artists: string[];
  artistLimit: ArtistTimelineLimit;
  metric: ArtistTimelineMetric;
}): ArtistTimelineRequest {
  const bothYears = options.yearFrom != null && options.yearTo != null;
  return {
    yearFrom: bothYears
      ? Math.min(options.yearFrom as number, options.yearTo as number)
      : options.yearFrom,
    yearTo: bothYears
      ? Math.max(options.yearFrom as number, options.yearTo as number)
      : options.yearTo,
    genres: options.includedGenres,
    excludedGenres: options.excludedGenres,
    artists: options.artists,
    artistLimit: options.artistLimit,
    metric: options.metric,
  };
}

export function artistTimelineTicks(yearFrom: number, yearTo: number) {
  const from = Math.min(yearFrom, yearTo);
  const to = Math.max(yearFrom, yearTo);
  const span = Math.max(1, to - from);
  const roughStep = span / 7;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const step = Math.max(
    1,
    (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) *
      magnitude,
  );
  const ticks: number[] = [];
  for (let year = Math.ceil(from / step) * step; year <= to; year += step) {
    ticks.push(year);
  }
  if (!ticks.includes(from)) ticks.unshift(from);
  if (!ticks.includes(to)) ticks.push(to);
  return Array.from(new Set(ticks));
}

function peakPath(x: number, baselineY: number, peakY: number, width: number) {
  const shoulder = Math.max(3.4, width * 0.34);
  return [
    `M ${(x - width).toFixed(2)} ${baselineY.toFixed(2)}`,
    `C ${(x - shoulder).toFixed(2)} ${baselineY.toFixed(2)}, ${(x - shoulder).toFixed(2)} ${(peakY + 3).toFixed(2)}, ${x.toFixed(2)} ${peakY.toFixed(2)}`,
    `C ${(x + shoulder).toFixed(2)} ${(peakY + 3).toFixed(2)}, ${(x + shoulder).toFixed(2)} ${baselineY.toFixed(2)}, ${(x + width).toFixed(2)} ${baselineY.toFixed(2)} Z`,
  ].join(" ");
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function artistPeakStrength(
  album: ArtistTimelineAlbum,
  metric: ArtistTimelineMetric,
  scoreMaximum: number,
) {
  if (metric === "albumScore") {
    return album.albumScore == null
      ? 0.06
      : clamp01(album.albumScore / Math.max(1, scoreMaximum));
  }
  return clamp01(album.chartPeak);
}

export function buildArtistCareerPeaksLayout(
  response: ArtistTimelineResponse,
  options: {
    metric: ArtistTimelineMetric;
    yearFrom?: number | null;
    yearTo?: number | null;
    width?: number;
    height?: number;
  },
): ArtistCareerPeaksLayout {
  const width = options.width ?? 1200;
  const height = options.height ?? 540;
  const fallbackFrom = response.availableYearFrom ?? 1950;
  const fallbackTo = response.availableYearTo ?? fallbackFrom + 1;
  const requestedFrom = options.yearFrom ?? fallbackFrom;
  const requestedTo = options.yearTo ?? fallbackTo;
  const yearFrom = Math.max(fallbackFrom, Math.min(fallbackTo, requestedFrom));
  const yearTo = Math.max(yearFrom, Math.min(fallbackTo, requestedTo));
  const plotLeft = 174;
  const plotRight = width - 28;
  const plotTop = 58;
  const plotBottom = height - 28;
  const rowHeight = (plotBottom - plotTop) / Math.max(1, response.artists.length);
  const scoreMaximum = Math.max(
    1,
    ...response.albums.map((album) => album.albumScore ?? 0),
  );
  const albumsByArtist = new Map<string, ArtistTimelineAlbum[]>();
  response.albums.forEach((album) => {
    const albums = albumsByArtist.get(album.artistId) ?? [];
    albums.push(album);
    albumsByArtist.set(album.artistId, albums);
  });

  const rows = response.artists.map((artist, artistIndex) => {
    const baselineY = plotTop + rowHeight * (artistIndex + 0.72);
    const color = artistTimelinePalette[artistIndex % artistTimelinePalette.length];
    const albums = albumsByArtist.get(artist.id) ?? [];
    const points = albums.map((album) => {
      const strength = artistPeakStrength(album, options.metric, scoreMaximum);
      const x =
        plotLeft +
        ((album.year - yearFrom) / Math.max(1, yearTo - yearFrom)) *
          (plotRight - plotLeft);
      const height = 5 + strength * Math.min(47, rowHeight * 0.72);
      const peakY = baselineY - height;
      const peakWidth = 6 + strength * 9;
      return {
        album,
        x,
        baselineY,
        peakY,
        strength,
        path: peakPath(x, baselineY, peakY, peakWidth),
      } satisfies ArtistPeakPoint;
    });
    const strongest = [...points]
      .sort(
        (left, right) =>
          right.strength - left.strength || left.album.year - right.album.year,
      )
      .slice(0, 4);
    return { artist, color, baselineY, points, strongest };
  });

  return {
    rows,
    ticks: artistTimelineTicks(yearFrom, yearTo),
    yearFrom,
    yearTo,
    plotLeft,
    plotRight,
    plotTop,
    plotBottom,
    width,
    height,
  };
}
