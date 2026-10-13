import { commands } from "../bindings";
import type { ArtistArtwork, ArtworkCredit, FanartCredentialStatus, SaveFanartKeysRequest } from "../bindings";
import { invalidateArtwork } from "./artwork";
import { isTauriRuntime } from "./tauriClient";

let creditRevision = -1;
const credits = new Map<string, Promise<ArtworkCredit | null>>();
export function getArtistPortraitCredit(artistId: string, revision: number) {
  if (revision !== creditRevision) { credits.clear(); creditRevision = revision; }
  if (!isTauriRuntime()) return Promise.resolve(null);
  let pending = credits.get(artistId);
  if (!pending) { pending = commands.getArtistPortraitCredit(artistId).catch(() => null); credits.set(artistId, pending); }
  return pending;
}

export async function getArtistArtwork(artistId: string, artistName: string, forceRefresh = false): Promise<ArtistArtwork> {
  if (!isTauriRuntime()) {
    return { artistId, artistName, musicbrainzMbid: null, portrait: null, logo: null, background: null,
      fetchedAt: null, cached: false, stale: false, message: "Artist artwork loads in the desktop app." };
  }
  const artwork = await commands.getArtistArtwork(artistId, forceRefresh);
  if (!artwork.cached) invalidateArtwork();
  return artwork;
}

export async function getFanartCredentialStatus(): Promise<FanartCredentialStatus> {
  if (!isTauriRuntime()) return { configured: false, personalKeyConfigured: false, source: "none" };
  return commands.getFanartCredentialStatus();
}
export async function saveFanartKeys(input: SaveFanartKeysRequest) {
  const status = await commands.saveFanartKeys(input); invalidateArtwork(); return status;
}
export async function deleteFanartKeys() { const status = await commands.deleteFanartKeys(); invalidateArtwork(); return status; }
export async function testFanartConnection() { return commands.testFanartConnection(); }
export async function syncArtistArtwork(limit = 50) {
  try { return await commands.syncArtistArtwork(limit); }
  finally { invalidateArtwork(); } // Completed items remain visible after cancellation.
}
