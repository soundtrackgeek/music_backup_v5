import type { ArtistListRequest, ArtistSummary } from "../types";

export const artistInfoFields = [
  { value: "mbid", label: "MusicBrainz ID" },
  { value: "originCountry", label: "Origin country" },
  { value: "artistType", label: "Artist type" },
  { value: "sortName", label: "Sort name" },
  { value: "beginDate", label: "Born / founded" },
  { value: "beginArea", label: "Begin area" },
  { value: "endStatus", label: "End date / status" },
] as const;

// Same core-field contract as db/artists_genres.rs. Gender and end area are
// optional; living people and active groups do not need an end date.
export function missingArtistInfo(artist: ArtistSummary) {
  const missing = {
    mbid: !artist.musicBrainzMbid?.trim(),
    originCountry: !artist.originCountryCode?.trim(),
    artistType: !artist.musicBrainzArtistType?.trim(),
    sortName: !artist.musicBrainzSortName?.trim(),
    beginDate: !artist.musicBrainzBeginDate?.trim() && artist.musicBrainzBeginYear == null,
    beginArea: !artist.musicBrainzBeginAreaName?.trim(),
    endStatus: !artist.musicBrainzEndDate?.trim() && artist.musicBrainzEndYear == null && artist.musicBrainzEnded !== false,
  };
  return artistInfoFields.filter((field) => missing[field.value]);
}

export function matchesArtistInfo(artist: ArtistSummary, request: ArtistListRequest) {
  const missing = missingArtistInfo(artist);
  return request.missingInfo
    ? missing.some((field) => field.value === request.missingInfo) && (!request.onlyMissingField || missing.length === 1)
    : !request.unresolvedOnly || missing.length > 0;
}
