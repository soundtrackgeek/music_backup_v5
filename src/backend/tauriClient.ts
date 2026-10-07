import {
  listen as tauriListen,
  type EventCallback,
  type UnlistenFn,
} from "@tauri-apps/api/event";
import { open as tauriOpenDialog } from "@tauri-apps/plugin-dialog";
import { openUrl as tauriOpenUrl } from "@tauri-apps/plugin-opener";

export type { UnlistenFn };

export function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function listen<T>(event: string, handler: EventCallback<T>) {
  return tauriListen<T>(event, handler);
}

export function openUrl(url: string) {
  return tauriOpenUrl(url);
}

export async function selectDirectory(
  defaultPath?: string,
  title = "Choose Deemix download folder",
) {
  const selected = await tauriOpenDialog({
    directory: true,
    multiple: false,
    defaultPath: defaultPath || undefined,
    title,
  });
  return typeof selected === "string" ? selected : null;
}
