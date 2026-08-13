import { addWishListItem, searchWishListMusicBrainz } from "../backend";
import type {
  LastFmRelatedAlbum,
  LastFmSimilarArtist,
  WishListItem,
  WishListMusicBrainzCandidate,
} from "../types";

const MAX_SOURCE_LENGTH = 80;
const MUSICBRAINZ_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function recommendationIdentityKey(value: string) {
  return value
    .replace(/&/g, " and ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function sameMusicBrainzId(left: string | null, right: string | null) {
  return Boolean(left && right && left.toLocaleLowerCase() === right.toLocaleLowerCase());
}

export function isSimilarArtistWishListed(
  items: readonly WishListItem[],
  artist: LastFmSimilarArtist,
) {
  const artistKey = recommendationIdentityKey(artist.name);
  return items.some(
    (item) =>
      item.entity === "artist" &&
      (sameMusicBrainzId(item.musicbrainzId, artist.musicbrainzMbid) ||
        recommendationIdentityKey(item.title) === artistKey),
  );
}

export function isRelatedAlbumWishListed(
  items: readonly WishListItem[],
  album: LastFmRelatedAlbum,
) {
  const artistKey = recommendationIdentityKey(album.artistName);
  const albumKey = recommendationIdentityKey(album.albumTitle);
  return items.some(
    (item) =>
      item.entity === "album" &&
      (sameMusicBrainzId(item.musicbrainzId, album.albumMbid) ||
        (recommendationIdentityKey(item.artist) === artistKey &&
          recommendationIdentityKey(item.title) === albumKey)),
  );
}

function recommendationSource(label: string, context: string) {
  return `${label} · ${context}`.slice(0, MAX_SOURCE_LENGTH).trim();
}

function highestScoringExactCandidate(
  candidates: readonly WishListMusicBrainzCandidate[],
  title: string,
  artist?: string,
) {
  const titleKey = recommendationIdentityKey(title);
  const artistKey = artist ? recommendationIdentityKey(artist) : null;
  return candidates
    .filter(
      (candidate) =>
        recommendationIdentityKey(candidate.title) === titleKey &&
        (artistKey === null || recommendationIdentityKey(candidate.artist) === artistKey),
    )
    .reduce<WishListMusicBrainzCandidate | null>(
      (best, candidate) => (!best || candidate.score > best.score ? candidate : best),
      null,
    );
}

async function findArtistCandidate(artist: LastFmSimilarArtist) {
  const mbid = artist.musicbrainzMbid?.trim() ?? "";
  if (MUSICBRAINZ_ID_PATTERN.test(mbid)) {
    return {
      title: artist.name,
      musicbrainzId: mbid.toLocaleLowerCase(),
      musicbrainzUrl: `https://musicbrainz.org/artist/${mbid.toLocaleLowerCase()}`,
    };
  }
  const response = await searchWishListMusicBrainz({
    entity: "artist",
    query: artist.name,
  });
  const candidate = highestScoringExactCandidate(response.candidates, artist.name);
  return candidate
    ? {
        title: candidate.title,
        musicbrainzId: candidate.musicbrainzId,
        musicbrainzUrl: candidate.musicbrainzUrl,
      }
    : { title: artist.name, musicbrainzId: null, musicbrainzUrl: null };
}

async function findAlbumCandidate(album: LastFmRelatedAlbum) {
  const response = await searchWishListMusicBrainz({
    entity: "album",
    query: album.albumTitle,
    artist: album.artistName,
  });
  const candidate = highestScoringExactCandidate(
    response.candidates,
    album.albumTitle,
    album.artistName,
  );
  return candidate
    ? {
        title: candidate.title,
        artist: candidate.artist,
        year: candidate.year,
        musicbrainzId: candidate.musicbrainzId,
        musicbrainzUrl: candidate.musicbrainzUrl,
      }
    : {
        title: album.albumTitle,
        artist: album.artistName,
        year: null,
        musicbrainzId: null,
        musicbrainzUrl: null,
      };
}

export async function addSimilarArtistRecommendation(
  artist: LastFmSimilarArtist,
  sourceArtistName: string,
) {
  const identity = await findArtistCandidate(artist);
  return addWishListItem({
    entity: "artist",
    title: identity.title,
    artist: "",
    year: null,
    musicbrainzId: identity.musicbrainzId,
    musicbrainzUrl: identity.musicbrainzUrl,
    source: recommendationSource("Last.fm Similar Artists", sourceArtistName),
  });
}

export async function addRelatedAlbumRecommendation(
  album: LastFmRelatedAlbum,
  sourceArtistName: string,
  sourceAlbumTitle: string,
) {
  const identity = await findAlbumCandidate(album);
  return addWishListItem({
    entity: "album",
    title: identity.title,
    artist: identity.artist,
    year: identity.year,
    musicbrainzId: identity.musicbrainzId,
    musicbrainzUrl: identity.musicbrainzUrl,
    source: recommendationSource(
      "Last.fm Related Albums",
      `${sourceArtistName} — ${sourceAlbumTitle}`,
    ),
  });
}
