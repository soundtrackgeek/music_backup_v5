import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import {
  listen as tauriListen,
  type EventCallback,
  type UnlistenFn,
} from "@tauri-apps/api/event";
import { openUrl as tauriOpenUrl } from "@tauri-apps/plugin-opener";

export type { UnlistenFn };

export function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function invoke<T>(
  command: string,
  args?: Record<string, unknown>,
) {
  return tauriInvoke<T>(command, args);
}

export function listen<T>(event: string, handler: EventCallback<T>) {
  return tauriListen<T>(event, handler);
}

export function openUrl(url: string) {
  return tauriOpenUrl(url);
}
