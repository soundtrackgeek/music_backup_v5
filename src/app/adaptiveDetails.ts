import { useCallback, useEffect, useState } from "react";

export const adaptiveDetailsMediaQuery = "(max-width: 1280px)";

type WorkspaceDetailContext = {
  hasDiscovery: boolean;
  hasSelectedAlbum: boolean;
  hasSelectedArtist: boolean;
  hasSelectedGenre: boolean;
  hasSelectedTool: boolean;
  hasStatistics: boolean;
};

export function workspaceHasUsefulDetails(
  activeWorkspace: string,
  context: WorkspaceDetailContext,
) {
  switch (activeWorkspace) {
    case "Albums":
      return context.hasSelectedAlbum;
    case "Artists":
      return context.hasSelectedArtist;
    case "Genres":
      return context.hasSelectedGenre;
    case "Tools":
      return context.hasSelectedTool;
    case "Discovery":
      return context.hasDiscovery;
    case "Statistics":
      return context.hasStatistics;
    case "Imports":
    case "Charts":
    case "Search":
      return true;
    case "Playlists":
    case "Wish List":
    case "Settings":
    default:
      return false;
  }
}

function matchesAdaptiveDetailsViewport() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(adaptiveDetailsMediaQuery).matches
  );
}

export function useAdaptiveDetailsLayout(
  activeWorkspace: string,
  hasUsefulDetails: boolean,
) {
  const [isDrawerLayout, setIsDrawerLayout] = useState(
    matchesAdaptiveDetailsViewport,
  );
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return undefined;
    }

    const mediaQuery = window.matchMedia(adaptiveDetailsMediaQuery);
    const handleChange = (event: MediaQueryListEvent) => {
      setIsDrawerLayout(event.matches);
      setIsDrawerOpen(false);
    };

    setIsDrawerLayout(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    setIsDrawerOpen(false);
  }, [activeWorkspace, hasUsefulDetails]);

  const openDrawer = useCallback(() => {
    if (hasUsefulDetails) {
      setIsDrawerOpen(true);
    }
  }, [hasUsefulDetails]);
  const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);
  const toggleDrawer = useCallback(() => {
    if (hasUsefulDetails) {
      setIsDrawerOpen((previous) => !previous);
    }
  }, [hasUsefulDetails]);

  return {
    isDrawerLayout,
    isDrawerOpen,
    openDrawer,
    closeDrawer,
    toggleDrawer,
  };
}
