import type {
  GenreTimelineAlbumPoint,
  GenreTimelineGenre,
  GenreTimelineRequest,
  GenreTimelineResponse,
} from "../types";

export const genreConstellationLimits = [7, 12, 20] as const;
export type GenreConstellationLimit = (typeof genreConstellationLimits)[number];

export const genreConstellationPalette = [
  "#4ed8d0",
  "#6d8fe8",
  "#f2a33d",
  "#55b9a6",
  "#df5b8b",
  "#f06a4f",
  "#a9bd72",
  "#a482df",
  "#e7c75d",
  "#4fa9d3",
  "#d174a6",
  "#81b98e",
  "#e1845c",
  "#758bd0",
  "#c7995e",
  "#6ab9b1",
  "#ce6e7e",
  "#9aaccc",
  "#b48bc7",
  "#8faaa4",
] as const;

const genreConstellationOrder = new Map(
  ["classical", "jazz", "rock", "electronic", "hip-hop", "metal", "ambient"].map(
    (genre, index) => [genre, index],
  ),
);

const genreConstellationColor = new Map(
  Array.from(genreConstellationOrder, ([genre, index]) => [
    genre,
    genreConstellationPalette[index],
  ]),
);

export type GenreConstellationCoordinate = {
  x: number;
  y: number;
  year: number;
};

export type GenreConstellationBand = {
  genre: GenreTimelineGenre;
  color: string;
  centerY: number;
  amplitudeByYear: number[];
  outerPath: string;
  contourPaths: string[];
};

export type GenreConstellationLayout = {
  bands: GenreConstellationBand[];
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

export function createGenreTimelineRequest(options: {
  yearFrom: number | null;
  yearTo: number | null;
  includedGenres: string[];
  excludedGenres: string[];
  genreLimit: GenreConstellationLimit;
  albumPointLimit?: number;
}): GenreTimelineRequest {
  const hasBothYears = options.yearFrom != null && options.yearTo != null;
  return {
    yearFrom: hasBothYears
      ? Math.min(options.yearFrom as number, options.yearTo as number)
      : options.yearFrom,
    yearTo: hasBothYears
      ? Math.max(options.yearFrom as number, options.yearTo as number)
      : options.yearTo,
    genres: options.includedGenres,
    excludedGenres: options.excludedGenres,
    genreLimit: options.genreLimit,
    albumPointLimit: options.albumPointLimit ?? 3600,
  };
}

export function genreTimelineTicks(yearFrom: number, yearTo: number) {
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
  const first = Math.ceil(from / step) * step;
  const ticks: number[] = [];
  for (let year = first; year <= to; year += step) ticks.push(year);
  if (!ticks.includes(from)) ticks.unshift(from);
  if (!ticks.includes(to)) ticks.push(to);
  return Array.from(new Set(ticks));
}

function smoothSeries(values: number[], radius = 5) {
  return values.map((_, index) => {
    let total = 0;
    let weightTotal = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const source = values[index + offset];
      if (source == null) continue;
      const distance = Math.abs(offset) / Math.max(1, radius);
      const weight = Math.exp(-3.2 * distance * distance);
      total += source * weight;
      weightTotal += weight;
    }
    return weightTotal > 0 ? total / weightTotal : 0;
  });
}

function curvedLine(points: GenreConstellationCoordinate[]) {
  if (points.length === 0) return "";
  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const midX = (previous.x + current.x) / 2;
    path += ` C ${midX.toFixed(2)} ${previous.y.toFixed(2)}, ${midX.toFixed(2)} ${current.y.toFixed(2)}, ${current.x.toFixed(2)} ${current.y.toFixed(2)}`;
  }
  return path;
}

function densityAreaPath(
  years: number[],
  amplitudes: number[],
  centerY: number,
  plotLeft: number,
  plotRight: number,
  factor: number,
) {
  const points = years.map((year, index) => ({
    x:
      plotLeft +
      ((year - years[0]) / Math.max(1, years[years.length - 1] - years[0])) *
        (plotRight - plotLeft),
    y: centerY - amplitudes[index] * factor,
    year,
  }));
  const lower = years.map((year, index) => ({
    x:
      plotLeft +
      ((year - years[0]) / Math.max(1, years[years.length - 1] - years[0])) *
        (plotRight - plotLeft),
    y: centerY + amplitudes[index] * factor,
    year,
  }));
  if (points.length === 0 || lower.length === 0) return "";
  const reversedLower = [...lower].reverse();
  return `${curvedLine(points)} L ${reversedLower[0].x.toFixed(2)} ${reversedLower[0].y.toFixed(2)} ${curvedLine(reversedLower).replace(/^M [^C]+/, "")} Z`;
}

export function buildGenreConstellationLayout(
  response: GenreTimelineResponse,
  options: {
    width?: number;
    height?: number;
    yearFrom?: number | null;
    yearTo?: number | null;
  } = {},
): GenreConstellationLayout {
  const width = options.width ?? 1200;
  const height = options.height ?? 500;
  const fallbackFrom = response.availableYearFrom ?? 1900;
  const fallbackTo = response.availableYearTo ?? fallbackFrom + 1;
  const requestedFrom = options.yearFrom ?? fallbackFrom;
  const requestedTo = options.yearTo ?? fallbackTo;
  const requestedMinimum = Math.min(requestedFrom, requestedTo);
  const requestedMaximum = Math.max(requestedFrom, requestedTo);
  const yearFrom = Math.max(fallbackFrom, Math.min(fallbackTo, requestedMinimum));
  const yearTo = Math.max(
    yearFrom,
    Math.min(fallbackTo, Math.max(fallbackFrom, requestedMaximum)),
  );
  const plotLeft = 92;
  const plotRight = width - 24;
  const plotTop = 54;
  const plotBottom = height - 24;
  const years = Array.from(
    { length: Math.max(1, yearTo - yearFrom + 1) },
    (_, index) => yearFrom + index,
  );
  const orderedGenres = [...response.genres].sort((left, right) => {
    const leftOrder = genreConstellationOrder.get(left.name.toLocaleLowerCase());
    const rightOrder = genreConstellationOrder.get(right.name.toLocaleLowerCase());
    if (leftOrder != null || rightOrder != null) {
      return (leftOrder ?? Number.MAX_SAFE_INTEGER) -
        (rightOrder ?? Number.MAX_SAFE_INTEGER);
    }
    return right.albumCount - left.albumCount || left.name.localeCompare(right.name);
  });
  const rowHeight =
    (plotBottom - plotTop) / Math.max(1, orderedGenres.length);
  const cellCounts = new Map(
    response.yearCounts.map((cell) => [
      `${cell.genreId}\u0000${cell.year}`,
      cell.albumCount,
    ]),
  );
  const smoothedByGenre = orderedGenres.map((genre) =>
    smoothSeries(
      years.map((year) => cellCounts.get(`${genre.id}\u0000${year}`) ?? 0),
    ),
  );
  const globalMaximum = Math.max(1, ...smoothedByGenre.flat());
  const maximumGenreTotal = Math.max(
    1,
    ...orderedGenres.map((genre) => genre.albumCount),
  );

  const bands = orderedGenres.map((genre, index) => {
    const centerY = plotTop + rowHeight * (index + 0.5);
    const relativeTotal = Math.sqrt(genre.albumCount / maximumGenreTotal);
    const amplitudeByYear = smoothedByGenre[index].map((value) => {
      const density = Math.sqrt(value / globalMaximum);
      return value <= 0.01
        ? 0.15
        : 0.4 + rowHeight * (0.05 * relativeTotal + 0.4 * density);
    });
    return {
      genre,
      color:
        genreConstellationColor.get(genre.name.toLocaleLowerCase()) ??
        genreConstellationPalette[index % genreConstellationPalette.length],
      centerY,
      amplitudeByYear,
      outerPath: densityAreaPath(
        years,
        amplitudeByYear,
        centerY,
        plotLeft,
        plotRight,
        1,
      ),
      contourPaths: [0.82, 0.62, 0.42, 0.24].map((factor) =>
        densityAreaPath(
          years,
          amplitudeByYear,
          centerY,
          plotLeft,
          plotRight,
          factor,
        ),
      ),
    } satisfies GenreConstellationBand;
  });

  return {
    bands,
    ticks: genreTimelineTicks(yearFrom, yearTo),
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

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function genreConstellationAlbumPosition(
  album: GenreTimelineAlbumPoint,
  band: GenreConstellationBand,
  layout: GenreConstellationLayout,
) {
  const index = Math.max(
    0,
    Math.min(band.amplitudeByYear.length - 1, album.year - layout.yearFrom),
  );
  const hash = stableHash(album.albumId);
  const secondHash = stableHash(`${album.albumId}:vertical`);
  const horizontalRatio = ((hash >>> 8) % 10_000) / 10_000 - 0.5;
  const uniformA = Math.max(0.0001, (hash % 10_000) / 10_000);
  const uniformB = (secondHash % 10_000) / 10_000;
  const gaussian = Math.max(
    -2.35,
    Math.min(
      2.35,
      Math.sqrt(-2 * Math.log(uniformA)) * Math.cos(2 * Math.PI * uniformB),
    ),
  );
  const yearWidth =
    (layout.plotRight - layout.plotLeft) /
    Math.max(1, layout.yearTo - layout.yearFrom);
  const x =
    layout.plotLeft +
    ((album.year - layout.yearFrom) /
      Math.max(1, layout.yearTo - layout.yearFrom)) *
      (layout.plotRight - layout.plotLeft) +
    horizontalRatio * yearWidth * 0.82;
  return {
    x: Math.max(layout.plotLeft, Math.min(layout.plotRight, x)),
    y: band.centerY + (gaussian / 2.35) * band.amplitudeByYear[index] * 0.92,
  };
}
