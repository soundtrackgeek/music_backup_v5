import { commands, type HiddenRequest, type HiddenShelf, type SonicTrack } from "../bindings";
import { isTauriRuntime } from "./tauriClient";
import { mockRows } from "./webPreview";
export type { HiddenShelf, HiddenSuggestion, SonicTrack } from "../bindings";

const storageKey = "music-library:hidden-favorites-preview:v1";
function preview(): HiddenShelf {
  const tracks: SonicTrack[] = mockRows.slice(0, 9).map((r, i) => ({ trackId: r.trackId ?? 9000 + i, trackKey: `preview:hidden-${r.trackId ?? 9000 + i}`, title: r.title ?? `Sample from ${r.album}`, artist: r.displayArtist ?? r.albumArtistDisplay ?? "Unknown artist", albumArtist: r.albumArtistDisplay ?? "Unknown artist", album: r.album ?? "Unknown album", albumId: r.albumId, filePath: "Preview", filename: `${r.trackId}.mp3`, genre: r.canonicalGenre, rating: r.normalizedRating, seconds: r.trackSeconds ?? 180, loved: r.love === "L", distance: null }));
  return { revision: String(Date.now()), generatedAt: new Date().toISOString(), profile: "Browser preview", modelVersion: "Sample evidence", modelAuc: null, trainingTracks: 0, validationTracks: 0, historySince: null, historyPlays: 0, excludedDays: 90, note: "Browser preview with sample tracks. The installed app uses your saved sound analysis and ratings.", suggestions: tracks.slice(2, 7).map((track, i) => ({ track, anchors: tracks.slice(0, 2), fit: "Favorite neighbors", broader: i === 4, kept: false })), kept: [], message: null };
}
export async function operateHiddenFavorites(action: HiddenRequest["action"], revision: string | null = null, trackKey: string | null = null, trackKeys: string[] | null = null): Promise<HiddenShelf> {
  if (isTauriRuntime()) return commands.hiddenFavorites({ action, revision, trackKey, trackKeys });
  const stored = localStorage.getItem(storageKey);
  let shelf: HiddenShelf = stored ? JSON.parse(stored) : { ...preview(), generatedAt: null, suggestions: [] };
  shelf.message = null;
  if (action === "refresh") shelf = { ...preview(), kept: shelf.kept };
  if (action === "keep") {
    const item = shelf.suggestions.find(s => s.track.trackKey === trackKey);
    if (item && !shelf.kept.some(t => t.trackKey === trackKey)) shelf.kept.push(item.track);
  }
  if (action === "dismiss") shelf.suggestions = shelf.suggestions.filter(s => s.track.trackKey !== trackKey);
  if (action === "remove") shelf.kept = shelf.kept.filter(t => t.trackKey !== trackKey);
  if (action === "save") shelf.message = "Browser preview: saved Hidden favorites — kept for later.";
  shelf.suggestions = shelf.suggestions.map(s => ({ ...s, kept: shelf.kept.some(t => t.trackKey === s.track.trackKey) }));
  localStorage.setItem(storageKey, JSON.stringify(shelf));
  return shelf;
}
