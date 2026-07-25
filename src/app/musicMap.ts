import type { MusicMapPoint } from "../types";

export type MusicMapMetric = "artistCount" | "albumCount" | "lovedTracks";
export type MusicMapGeography = "auto" | "countries" | "areas";

const genrePalette = [
  "#ff8a5b",
  "#58cbb3",
  "#8fa8ff",
  "#f2c14e",
  "#d68ff0",
  "#66b7e8",
  "#ec6d91",
  "#9ac56d",
  "#d49767",
  "#b2a1ff",
];

export function genreColor(genre: string) {
  const normalized = genre.trim().toLowerCase() || "unknown";
  let hash = 0;
  for (const character of normalized) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return genrePalette[hash % genrePalette.length];
}

export function mapMetricValue(
  point: MusicMapPoint,
  metric: MusicMapMetric,
) {
  return point[metric];
}

export function geographyVisibility(
  geography: MusicMapGeography,
  zoom: number,
) {
  if (geography === "countries") {
    return { countries: true, areas: false };
  }
  if (geography === "areas") {
    return { countries: false, areas: true };
  }
  return {
    countries: zoom < 4.6,
    areas: zoom >= 2.5,
  };
}

export function topGenreLegend(points: MusicMapPoint[], limit = 7) {
  const totals = new Map<string, number>();
  for (const point of points) {
    totals.set(
      point.topGenre,
      (totals.get(point.topGenre) ?? 0) + point.albumCount,
    );
  }
  return [...totals]
    .sort(
      ([leftGenre, leftCount], [rightGenre, rightCount]) =>
        rightCount - leftCount || leftGenre.localeCompare(rightGenre),
    )
    .slice(0, limit)
    .map(([genre]) => ({ genre, color: genreColor(genre) }));
}
