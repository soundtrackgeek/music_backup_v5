import { useEffect, useRef } from "react";
import { navigationShortcutMap } from "./config";

export function isEditableShortcutTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest("input, textarea, select, [contenteditable]"))
  );
}

export function workspaceForShortcut(event: globalThis.KeyboardEvent) {
  if (
    event.defaultPrevented ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.isComposing ||
    isEditableShortcutTarget(event.target)
  ) {
    return null;
  }

  const shortcut = navigationShortcutMap.get(event.key);
  return shortcut?.enabled ? shortcut.label : null;
}

export function scrollWorkspaceToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

export function useWorkspaceNavigation(
  activeWorkspace: string,
  onNavigate: (workspace: string) => void,
) {
  const initialWorkspace = useRef(true);

  useEffect(() => {
    function handleNavigationShortcut(event: globalThis.KeyboardEvent) {
      const workspace = workspaceForShortcut(event);
      if (!workspace) {
        return;
      }

      event.preventDefault();
      onNavigate(workspace);
    }

    window.addEventListener("keydown", handleNavigationShortcut);
    return () => window.removeEventListener("keydown", handleNavigationShortcut);
  }, [onNavigate]);

  useEffect(() => {
    if (initialWorkspace.current) {
      initialWorkspace.current = false;
      return;
    }

    scrollWorkspaceToTop();
  }, [activeWorkspace]);
}
