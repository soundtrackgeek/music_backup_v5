import { convertFileSrc } from "@tauri-apps/api/core";
import { useSyncExternalStore } from "react";
import { isTauriRuntime } from "./tauriClient";

export type ThumbnailSize = 96 | 300 | 600;
type ArtworkKind = "album" | "artist" | "completion";
let revision = 0;
const listeners = new Set<() => void>();

export function artworkUrl(kind: ArtworkKind, id: string, size: ThumbnailSize = 300) {
  if (!isTauriRuntime()) return null;
  // Tauri handles Windows' HTTP origin and the native scheme on other platforms.
  // The protocol resolves IDs through SQLite; paths never come from the browser.
  return `${convertFileSrc(`${kind}/${id}`, "cover")}?size=${size}&r=${revision}`;
}

export function invalidateArtwork() {
  revision += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useArtworkRevision() {
  return useSyncExternalStore(subscribe, () => revision, () => 0);
}
