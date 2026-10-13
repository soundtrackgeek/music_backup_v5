import { commands } from "../bindings";
import type { ArtistSplitContext, SplitArtistRequest, SplitArtistResult } from "../bindings";
import { isTauriRuntime } from "./tauriClient";
import { mockArtists, mockRows } from "./webPreview";
import { normalizeArtistKey } from "./normalization";

const previewAssignments = new Map<string, string>();
export function previewArtistId(albumId: string, name: string | null) {
  return previewAssignments.get(albumId) ?? normalizeArtistKey(name);
}

export async function getArtistSplitContext(artistId: string): Promise<ArtistSplitContext> {
  if (isTauriRuntime()) return commands.getArtistSplitContext(artistId);
  const artist = mockArtists.find((item) => item.id === artistId);
  if (!artist) throw new Error("This artist is no longer available.");
  const choice = (item: typeof artist) => ({ id: item.id, name: item.name,
    disambiguation: item.disambiguation ?? null, musicbrainzMbid: item.musicBrainzMbid });
  return { artist: choice(artist),
    albums: mockRows.filter((row) => row.trackId === null && previewArtistId(row.albumId, row.albumArtistDisplay) === artistId)
      .map((row) => ({ id: row.albumId, title: row.album ?? "Untitled", year: row.releaseYear ?? row.year, tracks: row.totalTracks ?? 0 })),
    otherArtists: mockArtists.filter((item) => item.id !== artistId && normalizeArtistKey(item.name) === normalizeArtistKey(artist.name)).map(choice),
  };
}

export async function splitArtist(request: SplitArtistRequest): Promise<SplitArtistResult> {
  if (isTauriRuntime()) return commands.splitArtist(request);
  const context = await getArtistSplitContext(request.sourceArtistId);
  if (!request.albumIds.length || new Set(request.albumIds).size !== request.albumIds.length ||
      request.albumIds.some((id) => !context.albums.some((album) => album.id === id))) {
    throw new Error("Select albums that still belong to this artist.");
  }
  const source = mockArtists.find((artist) => artist.id === request.sourceArtistId)!;
  let target = mockArtists.find((artist) => artist.id === request.targetArtistId);
  if (request.targetArtistId && !context.otherArtists.some((artist) => artist.id === request.targetArtistId)) {
    throw new Error("Choose a different artist with the same name.");
  }
  if (!target) {
    if (!request.disambiguation.trim()) throw new Error("Add a description to distinguish the new artist.");
    target = { ...source, id: `artist:${crypto.randomUUID().replace(/-/g, "")}`,
      disambiguation: request.disambiguation.trim(), musicBrainzMbid: request.musicbrainzMbid,
      musicBrainzSortName: null, musicBrainzArtistType: null, musicBrainzGender: null,
      musicBrainzBeginDate: null, musicBrainzBeginYear: null, musicBrainzEndDate: null,
      musicBrainzEndYear: null, musicBrainzEnded: null, musicBrainzBeginAreaName: null,
      musicBrainzEndAreaName: null, musicBrainzInfoReviewState: null, musicBrainzInfoFetchedAt: null,
      originCountryCode: null, originCountryName: null, originCountryRawArea: null,
      originCountryReviewState: null, portraitAvailable: false,
    };
    mockArtists.push(target);
  }
  source.disambiguation = request.sourceDisambiguation?.trim() || undefined;
  for (const id of request.albumIds) previewAssignments.set(id, target.id);
  for (const artist of [source, target]) {
    const albums = mockRows.filter((row) => row.trackId === null && previewArtistId(row.albumId, row.albumArtistDisplay) === artist.id);
    artist.albumCount = albums.length;
    artist.trackCount = albums.reduce((sum, row) => sum + (row.totalTracks ?? 0), 0);
    artist.representativeAlbumId = albums[0]?.albumId ?? null;
    artist.representativeAlbum = albums[0]?.album ?? null;
    artist.representativeCoverPath = albums[0]?.coverPath ?? null;
  }
  return { artistId: target.id, movedAlbums: request.albumIds.length };
}
