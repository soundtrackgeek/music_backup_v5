import { isTauriRuntime, openUrl } from "./tauriClient";

export type AuroraPlaybackTarget =
  | { kind: "album"; albumId: string }
  | { kind: "track"; albumId: string; trackId: number }
  | { kind: "playlist"; playlistId: number };

export function auroraPlaybackUrl(action: "play" | "queue", target: AuroraPlaybackTarget, requestId: string) {
  const id = target.kind === "album" ? target.albumId
    : target.kind === "track" ? target.trackId
    : target.playlistId;
  const url = new URL(`aurora://${action}/${target.kind}/${encodeURIComponent(id)}`);
  if (target.kind === "track") url.searchParams.set("album", target.albumId);
  url.searchParams.set("request", requestId);
  return url.href;
}

export async function openAuroraPlayback(action: "play" | "queue", target: AuroraPlaybackTarget) {
  if (!isTauriRuntime()) throw new Error("Aurora playback is available in the Music Library desktop app.");
  try {
    await openUrl(auroraPlaybackUrl(action, target, crypto.randomUUID()));
  } catch {
    throw new Error("Could not open Aurora. Install Aurora 0.80.0 or later on this computer.");
  }
}
