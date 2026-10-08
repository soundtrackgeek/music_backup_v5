import { commands, type SonicMatches, type SonicStatus, type SonicTrack, type SonicSchedule } from "../bindings";
import { isTauriRuntime } from "./tauriClient";
import { previewActivity } from "./activity";
import { mockRows } from "./webPreview";
export type { SonicMatches, SonicStatus, SonicTrack, SonicSchedule } from "../bindings";
export type { SonicAlbum, SonicAlbumMatches } from "../bindings";
export async function findSonicAlbums(albumId: string, minimumCoverage: number): Promise<import("../bindings").SonicAlbumMatches> {
  if (isTauriRuntime()) return commands.sonicAlbumMatches({ albumId, minimumCoverage, limit: 20 });
  const albums = mockRows.filter(row => row.trackId === null).map((row, index) => ({ albumId: row.albumId, title: row.album ?? "Unknown album", albumArtist: row.albumArtistDisplay ?? "Unknown artist", genre: row.canonicalGenre,
    totalTracks: row.totalTracks ?? 1, analyzedTracks: previewReady ? (index % 2 ? Math.ceil((row.totalTracks ?? 1) * 0.8) : row.totalTracks ?? 1) : 0, distance: 0.12 + index / 10 }));
  const seed = albums.find(a => a.albumId === albumId) ?? null;
  const ready = (a: typeof albums[number]) => a.analyzedTracks >= Math.min(3, a.totalTracks) && a.analyzedTracks * 100 >= a.totalTracks * minimumCoverage;
  return { seed, seedReady: Boolean(seed && ready(seed)), analyzedAlbums: albums.filter(ready).length, albums: seed && ready(seed) ? albums.filter(a => a.albumId !== albumId && ready(a)) : [] };
}
let previewReady = false;
let previewSchedule: SonicSchedule = { idleOnly: true, idleMinutes: 5, startHour: null, endHour: null };
const seeds: SonicTrack[] = [
  { trackId: 901, trackKey: "preview:sonic-901", title: "Midnight City", artist: "M83", album: "Hurry Up, We're Dreaming", albumId: "sonic-m83", albumArtist: "M83", filePath: "Preview", filename: "901.mp3", genre: "Electronic", rating: 90, seconds: 244, loved: true, distance: null },
  { trackId: 902, trackKey: "preview:sonic-902", title: "A Real Hero", artist: "College & Electric Youth", album: "Drive", albumId: "sonic-drive", albumArtist: "Various Artists", filePath: "Preview", filename: "902.mp3", genre: "Electronic", rating: 80, seconds: 268, loved: false, distance: 0.18 },
  { trackId: 903, trackKey: "preview:sonic-903", title: "Nightcall", artist: "Kavinsky", album: "OutRun", albumId: "sonic-outrun", albumArtist: "Kavinsky", filePath: "Preview", filename: "903.mp3", genre: "Electronic", rating: 80, seconds: 258, loved: false, distance: 0.24 },
];
export async function getSonicStatus(): Promise<SonicStatus> { return isTauriRuntime() ? commands.sonicStatus() : { analyzed: previewReady ? 3 : 0, pending: 0, failed: 0, total: 1096288, profile: "Browser preview", idleSupported: true, schedule: previewSchedule }; }
export async function configureSonicSchedule(schedule: SonicSchedule): Promise<SonicStatus> { if (isTauriRuntime()) return commands.sonicConfigure(schedule); previewSchedule = schedule; return getSonicStatus(); }
export async function getSonicSeeds(): Promise<SonicTrack[]> { return isTauriRuntime() ? commands.sonicSeeds() : previewReady ? seeds : []; }
export async function startSonicAnalysis(scope: "all" | "favorites" | "album" | "reuse", albumId: string | null): Promise<number> {
  if (isTauriRuntime()) return commands.sonicAnalyze({ scope, albumId, batchId: null });
  previewReady = true; previewActivity(scope === "reuse" ? "sonicReuse" : "sonicAnalysis", scope === "reuse" ? "Verify reused analysis" : "Audio analysis", "completed", 3, 3, true); return 1;
}
export async function findSonicMatches(trackKey: string): Promise<SonicMatches> { return isTauriRuntime() ? commands.sonicMatches(trackKey, 30) : { analyzed: 3, total: 1096288, seedReady: true, tracks: seeds.filter(t => t.trackKey !== trackKey) }; }
export async function saveSonicPlaylist(seedKey: string, name: string): Promise<string> {
  if (isTauriRuntime()) { const saved = await commands.sonicSavePlaylist(seedKey, name); return `Saved ${saved.name} in Playlists.`; }
  return `Browser preview: ${name} (${seedKey})`;
}
