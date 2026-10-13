import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import { listSavedPlaylists, refreshSavedSmartPlaylists } from "../../backend";
import type { SavedPlaylist } from "../../types";

export function useSavedPlaylists() {
  const [savedPlaylists, setSavedPlaylists] = useState<SavedPlaylist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshingSmart, setIsRefreshingSmart] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadRevision, setReloadRevision] = useState(0);
  const mutationRevision = useRef(0);

  const updateSavedPlaylists = useCallback((update: SetStateAction<SavedPlaylist[]>) => {
    // A late list response must not undo a save/delete performed on this page.
    mutationRevision.current += 1;
    setSavedPlaylists(update);
  }, []);
  const reloadSavedPlaylists = useCallback(() => setReloadRevision((value) => value + 1), []);
  const includeSavedPlaylist = useCallback((saved: SavedPlaylist) => {
    // Opening a history item is hydration, not a mutation. It must not discard
    // the pending initial read of the rest of the saved library.
    setSavedPlaylists((previous) => previous.some((entry) => entry.id === saved.id)
      ? previous : [saved, ...previous]);
  }, []);

  useEffect(() => {
    let disposed = false;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      const revision = mutationRevision.current;
      setIsLoading(true);
      setLoadError(null);
      try {
        const saved = await listSavedPlaylists();
        if (disposed) return;
        if (revision === mutationRevision.current) setSavedPlaylists(saved);
        setIsLoading(false);
        if (!saved.some((entry) => entry.automation.smart &&
          entry.playlist.smartSettings?.refreshPolicy !== "manual")) return;

        setIsRefreshingSmart(true);
        const refreshed = await refreshSavedSmartPlaylists();
        if (!disposed && revision === mutationRevision.current) setSavedPlaylists(refreshed);
      } catch (error) {
        if (!disposed) setLoadError(error instanceof Error ? error.message : String(error));
      } finally {
        pending = false;
        if (!disposed) {
          setIsLoading(false);
          setIsRefreshingSmart(false);
        }
      }
    };
    void refresh();
    window.addEventListener("focus", refresh);
    return () => {
      disposed = true;
      window.removeEventListener("focus", refresh);
    };
  }, [reloadRevision]);

  return { savedPlaylists, updateSavedPlaylists, includeSavedPlaylist, reloadSavedPlaylists, isLoading, isRefreshingSmart, loadError };
}
