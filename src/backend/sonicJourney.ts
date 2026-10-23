import { commands, type JourneyRequest, type JourneyResponse, type JourneyTrack } from "../bindings";
import { isTauriRuntime } from "./tauriClient";
import { mockRows } from "./webPreview";
export type { JourneyRequest, JourneyResponse, JourneyTrack } from "../bindings";
export { demo as journeyPreviewTracks };
const demo: JourneyTrack[] = [...mockRows.filter(row => row.trackId !== null).map(row => ({ trackId: row.trackId!, trackKey: `preview:journey-${row.trackId}`, title: row.title ?? "Untitled", artist: row.displayArtist ?? row.albumArtistDisplay ?? "Unknown artist", album: row.album ?? "Unknown album", albumId: row.albumId, albumArtist: row.albumArtistDisplay ?? "Unknown artist", filePath: "Preview", filename: `${row.trackId}.mp3`, genre: row.canonicalGenre, rating: row.normalizedRating, seconds: row.trackSeconds ?? 180, loved: row.love === "L" })),
  ...mockRows.filter(row => row.trackId === null).flatMap((row, index) => Array.from({ length: 3 }, (_, i) => ({ trackId: 1000 + index * 3 + i, trackKey: `preview:journey-example-${index}-${i}`, title: `Example track ${i + 1}`, artist: row.albumArtistDisplay ?? "Unknown artist", album: row.album ?? "Unknown album", albumId: row.albumId, albumArtist: row.albumArtistDisplay ?? "Unknown artist", filePath: "Preview", filename: `example-${index}-${i}.mp3`, genre: row.canonicalGenre, rating: 80, seconds: 180, loved: false })))];
export async function searchJourneyTracks(text: string): Promise<JourneyTrack[]> {
  if (isTauriRuntime()) return commands.sonicJourneySearch(text);
  const query = text.trim().toLowerCase();
  return query.length < 2 ? [] : demo.filter(t => `${t.artist} ${t.title}`.toLowerCase().includes(query)).slice(0, 20);
}
export async function buildSonicJourney(request: JourneyRequest): Promise<JourneyResponse> {
  if (isTauriRuntime()) return commands.sonicJourney(request);
  const stops = request.stopKeys.map(key => demo.find(t => t.trackKey === key));
  const pool = demo.filter(t => !request.stopKeys.includes(t.trackKey) && (request.minimumRating === null || (t.rating ?? -1) >= request.minimumRating) && (!request.sameGenre || t.genre === stops[0]?.genre));
  if (request.targetSeconds != null) {
    if (!stops.every(Boolean)) throw new Error("Choose available preview stops.");
    const groups = stops.map(t => t!.trackKey === request.albumStopKey ? demo.filter(d => d.albumId === t!.albumId) : [t!]);
    const required = groups.flat();
    if (new Set(required.map(t => t.trackKey)).size !== required.length) throw new Error("Required stops overlap the whole album.");
    let seconds = required.reduce((sum,t) => sum + t.seconds,0);
    const bytesPerSecond = 24000;
    const cap = Math.min(request.targetSeconds, request.maxMib == null ? Infinity : Math.floor(request.maxMib * 1048576 / bytesPerSecond));
    if (seconds > cap) throw new Error("The required stops and whole album exceed your limits.");
    const connectors = pool.filter(t => !required.some(r => r.trackKey === t.trackKey)).filter(t => { if (seconds + t.seconds > cap) return false; seconds += t.seconds; return true; });
    const tracks = groups.flatMap((g,i) => i < groups.length - 1 ? [...g,...connectors.filter((_,n) => n % (groups.length-1) === i)] : g);
    return { analyzed: demo.length, stopsReady: stops.map(Boolean), complete: true, tracks, timing: { totalSeconds: seconds, totalBytes: seconds * bytesPerSecond, shortfallSeconds: request.targetSeconds - seconds, albumTrackKeys: groups.flat().filter(t => groups.some(g => g.length>1 && g.includes(t))).map(t => t.trackKey) } };
  }
  const ready = stops.every(Boolean) && pool.length >= (stops.length - 1) * request.connectingTracks;
  const tracks: JourneyTrack[] = [];
  if (ready) for (let i = 0; i < stops.length; i++) { if (i) tracks.push(...pool.splice(0, request.connectingTracks)); tracks.push(stops[i]!); }
  return { timing: null, analyzed: demo.length, stopsReady: stops.map(Boolean), complete: ready, tracks };
}
export async function saveSonicJourney(request: JourneyRequest, tracks: JourneyTrack[], name: string): Promise<string> {
  if (isTauriRuntime()) { const saved = await commands.sonicSaveJourney({ journey: request, trackKeys: tracks.map(t => t.trackKey), name }); return `Saved ${saved.name} in Playlists.`; }
  return `Browser preview: saved ${name} (${tracks.length} tracks).`;
}
