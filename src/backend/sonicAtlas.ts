import { commands } from "../bindings";
import { isTauriRuntime } from "./tauriClient";
import { journeyPreviewTracks, searchJourneyTracks } from "./sonicJourney";
export type { AtlasRequest, AtlasPoint, AtlasRegion, AtlasCounts, SonicAtlas, SonicTrack } from "../bindings";
import type { AtlasRequest, AtlasCounts, SonicAtlas, SonicTrack } from "../bindings";
export { searchJourneyTracks as searchAtlasTracks };

export function atlasCounts(points: SonicAtlas["regions"][number]["points"]): AtlasCounts {
  const available = points.filter(p => p.available);
  return { owned: available.length, rated: available.filter(p => (p.track.rating ?? 0) > 0).length, loved: available.filter(p => p.track.loved).length,
    absentFromHistory: available.filter(p => !p.inHistory).length, unavailable: points.length - available.length };
}
export function demoAtlas(tracks: SonicTrack[], seedKey: string): SonicAtlas {
  const seed = tracks.find(t => t.trackKey === seedKey) ?? tracks[0];
  const regions = Array.from({ length: Math.min(3, tracks.length) }, (_, i) => {
    const members = tracks.filter((_, n) => n % 3 === i);
    const points = members.map((track, n) => ({ track, x: Math.min(.95, .12 + i * .3 + (n % 3) * .035), y: Math.min(.92, .2 + i * .24 + Math.floor(n / 3) * .04), available: true, inHistory: n % 3 === 0 }));
    return { id: members[0].trackKey, label: `Near ${members[0].title}`, representativeKey: members[0].trackKey, points, counts: atlasCounts(points) };
  });
  return { version: "sonic-atlas-v1", profile: "Browser demonstration · illustrative positions and regions", revision: `preview-${seedKey}`, generatedAt: new Date().toISOString(), seed,
    regions, counts: atlasCounts(regions.flatMap(r => r.points)), historyPlays: 12, historySince: null, message: null };
}
const cache = new Map<string, SonicAtlas>();
export async function operateSonicAtlas(request: AtlasRequest): Promise<SonicAtlas> {
  if (isTauriRuntime()) return commands.sonicAtlas(request);
  let atlas = cache.get(request.seedKey);
  if (!atlas || request.action === "rebuild") {
    atlas = demoAtlas(journeyPreviewTracks.map(t => ({ ...t, distance: null })), request.seedKey); cache.set(request.seedKey, atlas);
  }
  return { ...atlas, message: request.action === "save" ? `Browser demonstration: saved ${request.name}.` : null };
}
