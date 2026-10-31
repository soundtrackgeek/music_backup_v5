import { commands, type SonicMatches, type SonicStatus, type SonicTrack, type SonicSchedule } from "../bindings";
import { isTauriRuntime } from "./tauriClient";
import { previewActivity } from "./activity";
import { mockRows } from "./webPreview";
import { clearPreviewFailures, previewFailureCount } from "./sonicDiagnostics";
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
export async function getSonicStatus(): Promise<SonicStatus> { return isTauriRuntime() ? commands.sonicStatus() : { analyzed: previewReady ? 3 : 0, pending: 0, failed: previewFailureCount(), total: 1096288, timelines: previewReady ? 3 : 0, timelineBytes: previewReady ? 33792 : 0, profile: "Browser preview", idleSupported: true, schedule: previewSchedule }; }
export async function configureSonicSchedule(schedule: SonicSchedule): Promise<SonicStatus> { if (isTauriRuntime()) return commands.sonicConfigure(schedule); previewSchedule = schedule; return getSonicStatus(); }
export async function getSonicSeeds(): Promise<SonicTrack[]> { return isTauriRuntime() ? commands.sonicSeeds() : previewReady ? seeds : []; }
export async function startSonicAnalysis(scope: "all" | "favorites" | "album" | "reuse" | "failed", albumId: string | null): Promise<number> {
  if (isTauriRuntime()) return commands.sonicAnalyze({ scope, albumId, batchId: null });
  if (scope === "failed") clearPreviewFailures();
  previewReady = true; previewActivity(scope === "reuse" ? "sonicReuse" : "sonicAnalysis", scope === "reuse" ? "Verify reused analysis" : "Audio analysis", "completed", 3, 3, true); return 1;
}
export async function findSonicMatches(trackKey: string): Promise<SonicMatches> { return isTauriRuntime() ? commands.sonicMatches(trackKey, 30) : { analyzed: 3, total: 1096288, seedReady: true, tracks: seeds.filter(t => t.trackKey !== trackKey) }; }
export async function saveSonicPlaylist(seedKey: string, name: string): Promise<string> {
  if (isTauriRuntime()) { const saved = await commands.sonicSavePlaylist(seedKey, name); return `Saved ${saved.name} in Playlists.`; }
  return `Browser preview: ${name} (${seedKey})`;
}
export type { AlbumTimelines, TimelinePoint, TimelineTrack, TrackTimeline } from "../bindings";
export async function getAlbumTimelines(albumId: string): Promise<import("../bindings").AlbumTimelines> {
  if (isTauriRuntime()) return commands.sonicAlbumTimelines(albumId);
  const tracks = [
    { trackId: 951, title: "Opening Titles", discNumber: 1, trackNumber: 1, seconds: 214, state: "ready" },
    { trackId: 952, title: "The Long Road", discNumber: 1, trackNumber: 2, seconds: 388, state: "ready" },
    { trackId: 953, title: "Interlude", discNumber: 1, trackNumber: 3, seconds: 95, state: "missing" },
    { trackId: 954, title: "End Credits", discNumber: 1, trackNumber: 4, seconds: 301, state: "notAnalyzed" },
  ];
  return { tracks, ready: 2 };
}
/** Browser preview: a quiet start, a loud middle and a fade, with a narrow mono-like bridge. */
export async function getTrackTimeline(trackId: number): Promise<import("../bindings").TrackTimeline> {
  if (isTauriRuntime()) return commands.sonicTrackTimeline(trackId);
  const album = await getAlbumTimelines("preview");
  const track = album.tracks.find(t => t.trackId === trackId);
  const base = { trackId, title: track?.title ?? "", error: null, seconds: 0, bucketSeconds: 1, channels: null, sampleRate: null, leftDb: null, rightDb: null, truncated: false, points: [] };
  if (!track) return { ...base, state: "gone" };
  if (track.state !== "ready") return { ...base, state: track.state };
  const seconds = track.seconds ?? 200;
  const points = Array.from({ length: seconds }, (_, i) => {
    const t = i / seconds, swell = Math.sin(Math.PI * t), bridge = t > 0.55 && t < 0.65;
    const chroma = Array.from({ length: 12 }, (_, c) => [0, 4, 7].includes((c + (t < 0.5 ? 0 : 9)) % 12) ? 0.25 : 0.25 / 9);
    return { start: i, level: -38 + 26 * swell + 2 * Math.sin(i / 3), brightness: 900 + 2600 * swell, width: bridge ? -34 : -14 + 4 * Math.sin(i / 11), correlation: bridge ? 0.98 : 0.7 + 0.15 * Math.sin(i / 7), chroma };
  });
  return { ...base, state: "ready", seconds, channels: 2, sampleRate: 44100, leftDb: -17.8, rightDb: -18.4, points };
}
