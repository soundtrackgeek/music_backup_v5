import type { RatedAlbum } from "../../backend/ratedAlbums";
import { localDate } from "./reviewPeriods";

export type RatedAlbumFilters = {
  query: string; genre: string; country: string; yearFrom: string; yearTo: string;
  dateFrom: string; dateTo: string; dateKind: string; sort: string; page: number;
};
export const emptyRatedAlbumFilters: RatedAlbumFilters = {
  query: "", genre: "", country: "", yearFrom: "", yearTo: "", dateFrom: "",
  dateTo: "", dateKind: "", sort: "newest", page: 0,
};
export const RATED_ALBUM_PAGE_SIZE = 40;
export function ratedFilterError(filters: RatedAlbumFilters) {
  if (filters.yearFrom && filters.yearTo && Number(filters.yearFrom) > Number(filters.yearTo))
    return "Album year from must be before or equal to album year to.";
  if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo)
    return "Rated from must be before or equal to rated through.";
  return null;
}
const textOrder = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
// Unknown values always follow known values, including ascending sorts.
function numberOrder(a: number | null, b: number | null, ascending = false) {
  return a === null ? (b === null ? 0 : 1) : b === null ? -1 : (a - b) * (ascending ? 1 : -1);
}
export function filterRatedAlbums(rows: RatedAlbum[], filters: RatedAlbumFilters) {
  if (ratedFilterError(filters)) return [];
  const query = filters.query.trim().toLocaleLowerCase();
  return rows.filter(row => {
    const day = row.ratedAt === null ? null : localDate(new Date(row.ratedAt * 1000));
    return (!query || `${row.artist} ${row.album}`.toLocaleLowerCase().includes(query)) &&
      (!filters.genre || (row.genre || "Unknown genre") === filters.genre) &&
      (!filters.country || (row.country || "Unknown country") === filters.country) &&
      (!filters.yearFrom || (row.year !== null && row.year >= Number(filters.yearFrom))) &&
      (!filters.yearTo || (row.year !== null && row.year <= Number(filters.yearTo))) &&
      (!filters.dateFrom || (day !== null && day >= filters.dateFrom)) &&
      (!filters.dateTo || (day !== null && day <= filters.dateTo)) &&
      (!filters.dateKind || row.dateKind === filters.dateKind);
  }).sort((a, b) => {
    let comparison = 0;
    switch (filters.sort) {
      case "oldest": comparison = numberOrder(a.ratedAt, b.ratedAt, true); break;
      case "score": comparison = numberOrder(a.score, b.score); break;
      case "scoreAsc": comparison = numberOrder(a.score, b.score, true); break;
      case "rating": comparison = numberOrder(a.albumRating, b.albumRating); break;
      case "artist": comparison = textOrder(a.artist, b.artist); break;
      case "album": comparison = textOrder(a.album, b.album); break;
      case "year": comparison = numberOrder(a.year, b.year); break;
      case "yearAsc": comparison = numberOrder(a.year, b.year, true); break;
      default: comparison = numberOrder(a.ratedAt, b.ratedAt);
    }
    return comparison || textOrder(a.artist, b.artist) || textOrder(a.album, b.album) || textOrder(a.albumId, b.albumId);
  });
}
