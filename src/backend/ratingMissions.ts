import { commands, type MissionRequest, type MissionShelf, type RatingMission, type SonicTrack } from "../bindings";
import { isTauriRuntime } from "./tauriClient";
import { mockRows } from "./webPreview";
export type { MissionRequest, MissionShelf, RatingMission, SonicTrack } from "../bindings";

const storageKey = "music-library:rating-missions-preview:v1";
function empty(): MissionShelf {
  return { revision: "preview-empty", generatedAt: null, minutes: 40, mode: "albums", note: "Browser preview with sample missions. The installed app uses your saved ratings and sound analysis.", modelVersion: "Sample evidence", modelAuc: null, trainingTracks: 0, validationTracks: 0, choices: [], active: null, startedMissions: 0, completedMissions: 0, completedArtists: 0, completedNeighborhoods: 0, message: null };
}
function demo(shelf: MissionShelf): RatingMission[] {
  return ["fit", "finish", "stretch"].map((kind, i) => {
    const r = mockRows[i + 2];
    const track: SonicTrack = { trackId: r.trackId ?? 9100 + i, trackKey: `preview:mission-${i}`, title: r.title ?? `Sample from ${r.album}`, artist: r.displayArtist ?? r.albumArtistDisplay ?? "Unknown artist", albumArtist: r.albumArtistDisplay ?? "Unknown artist", album: r.album ?? "Sample album", albumId: r.albumId, filePath: "Preview", filename: `sample-${i}.mp3`, genre: r.canonicalGenre, rating: null, seconds: 180, loved: false, distance: null };
    return { id: `${Date.now()}-${kind}`, kind, title: shelf.mode === "mix" ? "A short sample mix" : track.album, reason: "Sample audition choice. Ratings remain your decision.", fit: "Sample sound evidence", tracks: [track], anchors: [], seconds: 180, albumTotal: shelf.mode === "mix" ? 0 : 10, albumRated: shelf.mode === "mix" ? 0 : 9, completedTracks: 0, status: "choice", startedAt: null, completedAt: null };
  });
}
export async function operateRatingMissions(request: MissionRequest): Promise<MissionShelf> {
  if (isTauriRuntime()) return commands.ratingMissions(request);
  let shelf: MissionShelf;
  try { shelf = JSON.parse(localStorage.getItem(storageKey) ?? "null") ?? empty(); } catch { shelf = empty(); }
  shelf.message = null;
  if (request.action === "refresh") { shelf = { ...shelf, minutes: request.minutes ?? 40, mode: request.mode ?? "albums", generatedAt: new Date().toISOString() }; shelf.choices = demo(shelf); }
  if (request.action === "start") { shelf.active = { ...shelf.choices.find(m => m.id === request.missionId)!, status: "active", startedAt: new Date().toISOString() }; shelf.choices = shelf.choices.filter(m => m.id !== request.missionId); shelf.startedMissions++; }
  if (request.action === "abandon") shelf.active = null;
  if (request.action === "save") shelf.message = "Browser preview: saved the reviewed mission in Playlists.";
  shelf.revision = String(Date.now()); localStorage.setItem(storageKey, JSON.stringify(shelf));
  return shelf;
}
