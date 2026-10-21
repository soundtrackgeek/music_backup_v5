import { commands, type RatedAlbum } from "../bindings";
import { isTauriRuntime } from "./tauriClient";
import { mockDiscovery } from "./preview/discovery";
export type { RatedAlbum } from "../bindings";

export async function getRatedAlbums(): Promise<RatedAlbum[]> {
  if (isTauriRuntime()) return commands.ratedAlbumHistory();
  return mockDiscovery.dailyEdition.anniversaries.map((album, index) => ({
    albumId: album.albumId, album: album.album, artist: album.artist,
    year: album.releaseYear, genre: ["Art Rock", "Folk", "Hard Rock", "Soul", "Pop"][index % 5],
    country: ["United Kingdom", "Canada", "United States"][index % 3],
    coverPath: album.coverPath, tracks: 8 + index, seconds: 2400 + index * 132,
    albumRating: 90 - index * 5, score: 106.5 - index * 3.2,
    ratedAt: index === 4 ? null : Math.floor(Date.now() / 1000) - index * 86400,
    dateKind: index === 4 ? "unknown" : index === 3 ? "firstSeen" : "completed",
    inLibrary: true, currentlyComplete: true,
  }));
}
