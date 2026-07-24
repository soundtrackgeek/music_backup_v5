import type {
  BrowseFilters,
  BrowseRequest,
  BrowseSort,
  DecadeProgressStats,
  DiscoveryAlbumPoint,
  DiscoveryArtistPoint,
  DiscoveryGenrePoint,
  DiscoveryHeatmapCell,
  DiscoveryMission,
  DurationAlbumStat,
  GenreProgressStats,
  LovedDensityStat,
  MetadataCoverageMetric,
  OutlierStat,
  RatingBucket,
  RatingEvent,
  YearProgressStats,
} from "../types";
import {
  createDiscoveryAlbumPointRequest,
  createDiscoveryArtistRequest,
  createDiscoveryGenreRequest,
  createDiscoveryHeatmapRequest,
  createDiscoveryMissionRequest,
  createRequest,
} from "./requests";

export type InsightCohort = {
  id: string;
  title: string;
  description: string;
  count: number | null;
  request: BrowseRequest;
  playlistPrompt: string;
};

type CohortOptions = {
  id: string;
  title: string;
  description: string;
  count?: number | null;
  view?: "albums" | "tracks";
  filters?: Partial<BrowseFilters>;
  sort?: BrowseSort;
  limit?: number;
  playlistPrompt?: string;
};

function cohort(options: CohortOptions): InsightCohort {
  const view = options.view ?? "albums";
  const request = createRequest(view);
  request.filters = { ...request.filters, ...(options.filters ?? {}) };
  request.sort =
    options.sort ??
    (view === "tracks"
      ? { field: "trackRating", direction: "desc" }
      : { field: "albumScore", direction: "desc" });
  request.limit = options.limit ?? 100;
  return {
    id: options.id,
    title: options.title,
    description: options.description,
    count: options.count ?? null,
    request,
    playlistPrompt:
      options.playlistPrompt ??
      `Build a varied playlist using only tracks from the ${options.title} cohort. ${options.description}`,
  };
}

function requestCohort(
  id: string,
  title: string,
  description: string,
  request: BrowseRequest,
  count: number | null,
): InsightCohort {
  return {
    id,
    title,
    description,
    count,
    request: { ...request, offset: 0 },
    playlistPrompt: `Build a varied playlist using only tracks from the ${title} cohort. ${description}`,
  };
}

export function discoveryMissionCohort(mission: DiscoveryMission) {
  return requestCohort(
    `discovery-mission:${mission.id}`,
    mission.title,
    mission.description,
    createDiscoveryMissionRequest(mission),
    mission.albumCount,
  );
}

export function discoveryHeatmapCohort(cell: DiscoveryHeatmapCell) {
  return requestCohort(
    `discovery-heatmap:${cell.genreId}:${cell.year}`,
    `${cell.genre} · ${cell.year}`,
    `${cell.albumCount.toLocaleString()} albums at ${Math.round((cell.averageRatingCompleteness ?? 0) * 100)}% average completion.`,
    createDiscoveryHeatmapRequest(cell),
    cell.albumCount,
  );
}

export function discoveryAlbumCohort(point: DiscoveryAlbumPoint) {
  return requestCohort(
    `discovery-album:${point.albumId}`,
    point.album ?? "Untitled album",
    [point.albumArtistDisplay, point.year, point.genre]
      .filter(Boolean)
      .join(" · "),
    createDiscoveryAlbumPointRequest(point),
    1,
  );
}

export function discoveryGenreCohort(point: DiscoveryGenrePoint) {
  return requestCohort(
    `discovery-genre:${point.genreId}`,
    point.genre,
    `${point.albumCount.toLocaleString()} albums at ${Math.round((point.averageRatingCompleteness ?? 0) * 100)}% average completion.`,
    createDiscoveryGenreRequest(point),
    point.albumCount,
  );
}

export function discoveryArtistCohort(point: DiscoveryArtistPoint) {
  return requestCohort(
    `discovery-artist:${point.artistId}`,
    point.artist,
    `${point.albumCount.toLocaleString()} albums${point.topGenre ? ` · ${point.topGenre}` : ""}.`,
    createDiscoveryArtistRequest(point),
    point.albumCount,
  );
}

export function decadeCohort(
  row: DecadeProgressStats,
  source = "Statistics",
) {
  return cohort({
    id: `statistics-decade:${row.decade}`,
    title: `${row.decade}s albums`,
    description: `${row.albumCount.toLocaleString()} albums surfaced from ${source}.`,
    count: row.albumCount,
    filters: { yearFrom: row.decade, yearTo: row.decade + 9 },
  });
}

export function yearCohort(
  row: YearProgressStats,
  genres: string[] = [],
  excludedGenres: string[] = [],
) {
  return cohort({
    id: `statistics-year:${row.year}:${genres.join(",")}:${excludedGenres.join(",")}`,
    title: `${row.year} albums`,
    description: `${row.albumCount.toLocaleString()} albums in the selected year-progress scope.`,
    count: row.albumCount,
    filters: {
      yearFrom: row.year,
      yearTo: row.year,
      genres,
      excludedGenres,
    },
  });
}

export function genreCohort(
  row: GenreProgressStats,
  yearFrom: number | null = null,
  yearTo: number | null = null,
  excludedGenres: string[] = [],
) {
  return cohort({
    id: `statistics-genre:${row.genre}:${yearFrom ?? "all"}:${yearTo ?? "all"}`,
    title: `${row.genre} albums`,
    description: `${row.albumCount.toLocaleString()} albums in the selected genre-progress scope.`,
    count: row.albumCount,
    filters: {
      genres: [row.genre],
      excludedGenres,
      yearFrom,
      yearTo,
    },
  });
}

function numericBucket(label: string) {
  if (/^\d+$/.test(label)) {
    const value = Number(label);
    return { min: value, max: value };
  }
  const match = label.match(/^(\d+)-(\d+)$/);
  return match ? { min: Number(match[1]), max: Number(match[2]) } : null;
}

export function ratingBucketCohort(
  bucket: RatingBucket,
  view: "albums" | "tracks",
) {
  const range = numericBucket(bucket.label);
  if (!range) return null;
  const isTracks = view === "tracks";
  return cohort({
    id: `statistics-${view}-rating:${bucket.label}`,
    title: `${bucket.label}${isTracks ? "-star tracks" : " rated albums"}`,
    description: `${bucket.count.toLocaleString()} ${view} in this rating band.`,
    count: bucket.count,
    view,
    filters: isTracks
      ? { trackRatingMin: range.min, trackRatingMax: range.max }
      : { albumRatingMin: range.min, albumRatingMax: range.max },
  });
}

export function trackCountBucketCohort(bucket: RatingBucket) {
  const plus = bucket.label.match(/^(\d+)\+$/);
  const range = numericBucket(bucket.label);
  if (!plus && !range) return null;
  const min = plus ? Number(plus[1]) : range!.min;
  const max = plus ? null : range!.max;
  return cohort({
    id: `statistics-track-count:${bucket.label}`,
    title: `${bucket.label} tracks per album`,
    description: `${bucket.count.toLocaleString()} albums in this track-count band.`,
    count: bucket.count,
    filters: { trackCountMin: min, trackCountMax: max },
  });
}

export function lovedDensityCohort(row: LovedDensityStat) {
  if (row.scope === "Genre") {
    return cohort({
      id: `statistics-loved-genre:${row.label}`,
      title: `${row.label} loved tracks`,
      description: `${row.albumCount.toLocaleString()} albums and ${row.trackCount.toLocaleString()} total tracks in the density calculation.`,
      count: row.lovedTracks,
      view: "tracks",
      filters: { genres: [row.label], lovedTracksMin: 1 },
    });
  }
  if (row.scope === "Decade") {
    const decade = Number.parseInt(row.label, 10);
    return cohort({
      id: `statistics-loved-decade:${decade}`,
      title: `${row.label} albums with loved tracks`,
      description: `${row.lovedTracks.toLocaleString()} loved tracks across ${row.albumCount.toLocaleString()} albums.`,
      count: row.albumCount,
      filters: {
        yearFrom: decade,
        yearTo: decade + 9,
        lovedTracksMin: 1,
      },
    });
  }
  if (row.scope === "Rating bucket") {
    if (row.label === "Unrated") {
      return cohort({
        id: "statistics-loved-rating:unrated",
        title: "Unrated albums with loved tracks",
        description: `${row.lovedTracks.toLocaleString()} loved tracks in unrated albums.`,
        count: row.albumCount,
        filters: { missingFields: ["rating"], lovedTracksMin: 1 },
      });
    }
    const range = numericBucket(row.label);
    if (range) {
      return cohort({
        id: `statistics-loved-rating:${row.label}`,
        title: `${row.label} rated albums with loved tracks`,
        description: `${row.lovedTracks.toLocaleString()} loved tracks in this album-rating band.`,
        count: row.albumCount,
        filters: {
          albumRatingMin: range.min,
          albumRatingMax: range.max,
          lovedTracksMin: 1,
        },
      });
    }
  }
  return null;
}

export function durationAlbumCohort(album: DurationAlbumStat) {
  return cohort({
    id: `statistics-duration:${album.albumId}`,
    title: album.album ?? "Untitled album",
    description: [album.albumArtistDisplay, album.year, `${album.totalTracks} tracks`]
      .filter(Boolean)
      .join(" · "),
    count: 1,
    filters: { albumIds: [album.albumId] },
    limit: 20,
  });
}

const metadataFieldById: Record<string, { view: "albums" | "tracks"; field: string }> = {
  "album-title": { view: "albums", field: "album" },
  "album-artist": { view: "albums", field: "albumArtist" },
  genre: { view: "albums", field: "genre" },
  year: { view: "albums", field: "year" },
  "release-year": { view: "albums", field: "releaseYear" },
  publisher: { view: "albums", field: "publisher" },
  "track-title": { view: "tracks", field: "trackTitle" },
  "display-artist": { view: "tracks", field: "displayArtist" },
  "track-number": { view: "tracks", field: "trackNumber" },
  "disc-number": { view: "tracks", field: "discNumber" },
  filename: { view: "tracks", field: "filename" },
  "cover-art": { view: "albums", field: "coverArt" },
  "album-rating": { view: "albums", field: "rating" },
  duration: { view: "tracks", field: "time" },
  "track-rating": { view: "tracks", field: "rating" },
};

export function missingMetadataCohort(metric: MetadataCoverageMetric) {
  const mapping = metadataFieldById[metric.id];
  const missingCount = Math.max(0, metric.totalCount - metric.coveredCount);
  if (!mapping || missingCount === 0) return null;
  return cohort({
    id: `statistics-metadata:${metric.id}`,
    title: `Missing ${metric.label.toLowerCase()}`,
    description: `${missingCount.toLocaleString()} ${metric.scope.toLowerCase()} need this metadata.`,
    count: missingCount,
    view: mapping.view,
    filters: { missingFields: [mapping.field] },
    sort: mapping.view === "tracks"
      ? { field: "title", direction: "asc" }
      : { field: "album", direction: "asc" },
  });
}

export function outlierCohort(row: OutlierStat) {
  switch (row.id) {
    case "longest-unrated-album":
      return cohort({
        id: `statistics-outlier:${row.id}`,
        title: row.label,
        description: row.detail,
        count: 1,
        filters: { ratingCompletenessMax: 0 },
        sort: { field: "totalMinutes", direction: "desc" },
        limit: 1,
      });
    case "highest-score-incomplete-album":
      return cohort({
        id: `statistics-outlier:${row.id}`,
        title: row.label,
        description: row.detail,
        count: 1,
        filters: { notFullyRated: true },
        sort: { field: "albumScore", direction: "desc" },
        limit: 1,
      });
    case "largest-track-count-album":
      return cohort({
        id: `statistics-outlier:${row.id}`,
        title: row.label,
        description: row.detail,
        count: 1,
        sort: { field: "trackCount", direction: "desc" },
        limit: 1,
      });
    case "highest-loved-density-genre": {
      const genre = row.detail.split(":")[0]?.trim();
      return genre
        ? cohort({
            id: `statistics-outlier:${row.id}`,
            title: row.label,
            description: row.detail,
            filters: { genres: [genre], lovedTracksMin: 1 },
            sort: { field: "lovedTracks", direction: "desc" },
          })
        : null;
    }
    case "lowest-completion-decade": {
      const decade = Number.parseInt(row.detail, 10);
      return Number.isFinite(decade)
        ? cohort({
            id: `statistics-outlier:${row.id}`,
            title: row.label,
            description: row.detail,
            filters: { yearFrom: decade, yearTo: decade + 9 },
            sort: { field: "ratingCompleteness", direction: "asc" },
          })
        : null;
    }
    default:
      return null;
  }
}

export function ratingEventCohort(event: RatingEvent) {
  return cohort({
    id: `statistics-rating-event:${event.id}`,
    title: event.album ?? "Rating event album",
    description: [event.albumArtistDisplay, event.year].filter(Boolean).join(" · "),
    count: 1,
    filters: { albumIds: [event.albumId] },
    limit: 20,
  });
}

export function ratingProgressCohort(
  kind: "fully-rated" | "partially-rated" | "unrated" | "rated-tracks" | "unrated-tracks",
  count: number,
) {
  const definitions = {
    "fully-rated": {
      title: "Fully rated albums",
      view: "albums" as const,
      filters: { ratingCompletenessMin: 100, ratingCompletenessMax: 100 },
    },
    "partially-rated": {
      title: "Partially rated albums",
      view: "albums" as const,
      filters: { ratingCompletenessMin: 0.0001, ratingCompletenessMax: 99.9999 },
    },
    unrated: {
      title: "Unrated albums",
      view: "albums" as const,
      filters: { missingFields: ["rating"] },
    },
    "rated-tracks": {
      title: "Rated tracks",
      view: "tracks" as const,
      filters: { trackRatingMin: 0 },
    },
    "unrated-tracks": {
      title: "Unrated tracks",
      view: "tracks" as const,
      filters: { missingFields: ["rating"] },
    },
  };
  const definition = definitions[kind];
  return cohort({
    id: `statistics-rating-progress:${kind}`,
    title: definition.title,
    description: `${count.toLocaleString()} items in the current library snapshot.`,
    count,
    view: definition.view,
    filters: definition.filters,
  });
}

export function lovedTracksCohort(count: number) {
  return cohort({
    id: "statistics-loved-tracks",
    title: "Loved tracks",
    description: `${count.toLocaleString()} loved tracks in the current library.`,
    count,
    view: "tracks",
    filters: { lovedTracksMin: 1 },
  });
}

export function albumsWithLovedTracksCohort(count: number) {
  return cohort({
    id: "statistics-albums-with-loved-tracks",
    title: "Albums with loved tracks",
    description: `${count.toLocaleString()} albums contain at least one loved track.`,
    count,
    filters: { lovedTracksMin: 1 },
  });
}

export function lovedGenreCohort(
  genre: string,
  albumCount: number | null = null,
) {
  return cohort({
    id: `statistics-loved-top-genre:${genre}`,
    title: `Loved ${genre}`,
    description: `Albums in ${genre} that contain loved tracks.`,
    count: albumCount,
    filters: { genres: [genre], lovedTracksMin: 1 },
  });
}

export function lovedYearCohort(year: number, albumCount: number | null = null) {
  return cohort({
    id: `statistics-loved-top-year:${year}`,
    title: `Loved tracks from ${year}`,
    description: `Albums released in ${year} that contain loved tracks.`,
    count: albumCount,
    filters: { yearFrom: year, yearTo: year, lovedTracksMin: 1 },
  });
}

export function catalogArtistCohort(
  artist: string,
  albumCount: number | null = null,
) {
  return cohort({
    id: `statistics-catalog-artist:${artist}`,
    title: `${artist} albums`,
    description: `Albums credited to ${artist}.`,
    count: albumCount,
    filters: {
      albumArtist: { operator: "equals", value: artist },
    },
  });
}

export function catalogGenreCohort(
  genre: string,
  albumCount: number | null = null,
) {
  return cohort({
    id: `statistics-catalog-genre:${genre}`,
    title: `${genre} albums`,
    description: `Albums in the ${genre} catalog cohort.`,
    count: albumCount,
    filters: { genres: [genre] },
  });
}
