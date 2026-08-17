import { searchLibrary } from "../backend";
import type {
  AiPlaylist,
  AiPlaylistTrack,
  BrowseRequest,
  BrowseResponse,
} from "../types";
import { normalizeBrowseRequestForClient } from "./requests";

// BrowseRequest.limit is a u32 across the Tauri boundary. Asking for its full
// range lets the dedicated Search handoff return every matching local track in
// one stable query, including when Search is using random ordering.
export const completePlaylistRequestLimit = 0xffff_ffff;

export function createSearchPlaylistRequest(
  sourceRequest: BrowseRequest,
): BrowseRequest {
  return normalizeBrowseRequestForClient({
    ...sourceRequest,
    view: "tracks",
    offset: 0,
    limit: completePlaylistRequestLimit,
  });
}

function searchPlaylistName(sourceTitle: string) {
  const sourceName = sourceTitle.replace(/^Search:\s*/i, "").trim();
  const baseName = /^Current (album|track) search$/i.test(sourceName)
    ? sourceName.replace(/^Current\s+/i, "")
    : sourceName;
  return [...`${baseName || "Search"} playlist`].slice(0, 120).join("");
}

function playlistTrackFromRow(
  row: BrowseResponse["rows"][number],
): AiPlaylistTrack | null {
  if (row.trackId == null) return null;
  return {
    trackId: row.trackId,
    albumId: row.albumId,
    album: row.album,
    albumArtist: row.albumArtistDisplay,
    displayArtist: row.displayArtist,
    title: row.title,
    genre: row.canonicalGenre,
    year: row.year,
    seconds: Math.max(0, row.trackSeconds ?? 0),
    rating: row.normalizedRating,
    loved: row.love?.trim().toUpperCase() === "L",
    filePath: row.filePath,
    filename: row.filename,
  };
}

export function localSearchPlaylistFromResponse(
  sourceTitle: string,
  request: BrowseRequest,
  response: BrowseResponse,
): AiPlaylist {
  const tracks = response.rows.flatMap((row) => {
    const track = playlistTrackFromRow(row);
    return track ? [track] : [];
  });
  if (tracks.length === 0) {
    throw new Error("The current search did not return any playlist tracks.");
  }
  const description = `${tracks.length.toLocaleString()} matching tracks preserved in Search order.`;

  return {
    prompt: `Created directly from ${sourceTitle} without Luna.`,
    name: searchPlaylistName(sourceTitle),
    description,
    request,
    strategy: "ranked",
    targetTrackCount: tracks.length,
    targetMinutes: 0,
    maxTracksPerArtist: 10,
    maxTracksPerAlbum: 10,
    model: "Local Search",
    usage: {
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
    },
    matchingTrackCount: response.total,
    candidateCount: tracks.length,
    totalSeconds: tracks.reduce(
      (total, track) => total + track.seconds,
      0,
    ),
    tracks,
  };
}

export async function createLocalSearchPlaylist(
  sourceTitle: string,
  sourceRequest: BrowseRequest,
) {
  const request = createSearchPlaylistRequest(sourceRequest);
  const response = await searchLibrary(request);
  return localSearchPlaylistFromResponse(sourceTitle, request, response);
}
