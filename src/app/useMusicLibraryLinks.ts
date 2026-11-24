import { useEffect, useEffectEvent } from "react";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { isTauriRuntime } from "../backend/tauriClient";

export function albumIdFromLink(value: string): string | null {
  if (value.length > 8192) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "musiclibrary:" || url.hostname !== "album"
      || url.username || url.password || url.port || url.hash) return null;
    const [, encodedId, extra] = url.pathname.split("/");
    if (!encodedId || extra !== undefined) return null;
    const id = decodeURIComponent(encodedId);
    return id.trim() && id.length <= 512 && !/\p{Cc}/u.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function useMusicLibraryLinks(openAlbum: (albumId: string) => void) {
  const navigate = useEffectEvent((albumId: string) => openAlbum(albumId));
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let closed = false;
    let release: (() => void) | undefined;

    function receive(urls: string[]) {
      if (closed) return;
      for (const url of urls) {
        const albumId = albumIdFromLink(url);
        if (albumId) navigate(albumId);
      }
    }

    void onOpenUrl(receive).then(async unlisten => {
      if (closed) {
        unlisten();
        return;
      }
      release = unlisten;
      const initial = await getCurrent();
      if (initial) receive(initial);
    }).catch(error => { if (!closed) console.warn("Could not listen for Music Library album links", error); });

    return () => {
      closed = true;
      release?.();
    };
  }, []);
}
