import { useWorkspaceNavigation } from "./navigation";
import {
  workspaceHasUsefulDetails,
  useAdaptiveDetailsLayout,
} from "./adaptiveDetails";
import { type AiMusicResearchContext } from "../types";
import { formatNumber } from "./display";
import {
  type LunaMode,
  type LunaHistorySelection,
} from "../components/LunaPanel";
import { normalizeBrowseRequestForClient } from "./requests";
import { useEffect, type KeyboardEvent } from "react";
import type { WorkspaceStores } from "./WorkspaceStoresProvider";
import type { useAlbumsWorkspace } from "../workspaces/albums/useAlbumsWorkspace";
import type { useGenresWorkspace } from "../workspaces/genres/useGenresWorkspace";
import type { useToolsWorkspace } from "../workspaces/tools/useToolsWorkspace";
type Inputs = Pick<
  WorkspaceStores,
  | "activeSection"
  | "setActiveSection"
  | "leftSidebarMode"
  | "selectedArtist"
  | "statistics"
  | "statisticsView"
  | "rightSidebarMode"
  | "lunaLaunchIdRef"
  | "setChartLunaLaunch"
  | "setSearchLunaLaunch"
  | "setIsLunaOpen"
  | "setSavedPlaylistToOpen"
  | "setSavedDiscoveryToOpen"
  | "setRequest"
  | "setAnalystSnapshotToOpen"
  | "detailDrawerRef"
  | "detailToggleRef"
  | "setRightSidebarMode"
> &
  Pick<ReturnType<typeof useAlbumsWorkspace>, "selectedAlbum"> &
  Pick<ReturnType<typeof useGenresWorkspace>, "selectedGenre"> &
  Pick<ReturnType<typeof useToolsWorkspace>, "selectedTool">;

export function useShellWorkspace({
  activeSection,
  setActiveSection,
  leftSidebarMode,
  selectedArtist,
  statistics,
  statisticsView,
  rightSidebarMode,
  lunaLaunchIdRef,
  setChartLunaLaunch,
  setSearchLunaLaunch,
  setIsLunaOpen,
  setSavedPlaylistToOpen,
  setSavedDiscoveryToOpen,
  setRequest,
  setAnalystSnapshotToOpen,
  detailDrawerRef,
  detailToggleRef,
  setRightSidebarMode,
  selectedAlbum,
  selectedGenre,
  selectedTool,
}: Inputs) {
  useWorkspaceNavigation(activeSection, setActiveSection);

  const isLeftSidebarHidden = leftSidebarMode === "hidden";

  const hasUsefulDetailContent = workspaceHasUsefulDetails(activeSection, {
    hasDiscovery: false,
    hasSelectedAlbum: selectedAlbum != null,
    hasSelectedArtist: selectedArtist != null,
    hasSelectedGenre: selectedGenre != null,
    hasSelectedTool: selectedTool != null,
    hasStatistics: statistics != null && statisticsView === "overview",
  });

  const {
    isDrawerLayout: isDetailsDrawerLayout,
    isDrawerOpen: isDetailsDrawerOpen,
    openDrawer: openDetailsDrawer,
    closeDrawer: closeDetailsDrawer,
  } = useAdaptiveDetailsLayout(activeSection, hasUsefulDetailContent);

  const effectiveRightSidebarMode = hasUsefulDetailContent
    ? rightSidebarMode
    : "hidden";

  const isRightSidebarHidden =
    !hasUsefulDetailContent ||
    (isDetailsDrawerLayout
      ? !isDetailsDrawerOpen
      : rightSidebarMode === "hidden");

  const musicResearchContext: AiMusicResearchContext = (() => {
    if (activeSection === "Albums" && selectedAlbum) {
      return {
        workspace: activeSection,
        selectedEntityType: "album",
        selectedEntityId: selectedAlbum.albumId,
        selectedLabel: selectedAlbum.album ?? "Untitled album",
        selectedSubtitle: [selectedAlbum.albumArtistDisplay, selectedAlbum.year]
          .filter((value) => value != null && value !== "")
          .join(" · "),
      };
    }
    if (activeSection === "Artists" && selectedArtist) {
      return {
        workspace: activeSection,
        selectedEntityType: "artist",
        selectedEntityId: selectedArtist.id,
        selectedLabel: selectedArtist.name,
        selectedSubtitle: [
          selectedArtist.topGenre,
          selectedArtist.firstYear && selectedArtist.lastYear
            ? `${selectedArtist.firstYear}–${selectedArtist.lastYear}`
            : null,
        ]
          .filter((value) => value != null && value !== "")
          .join(" · "),
      };
    }
    if (activeSection === "Genres" && selectedGenre) {
      return {
        workspace: activeSection,
        selectedEntityType: "genre",
        selectedEntityId: selectedGenre.id,
        selectedLabel: selectedGenre.name,
        selectedSubtitle: `${formatNumber(selectedGenre.albumCount)} ${selectedGenre.albumCount === 1 ? "album" : "albums"} in your library`,
      };
    }
    return {
      workspace: activeSection,
      selectedEntityType: null,
      selectedEntityId: null,
      selectedLabel: null,
      selectedSubtitle: null,
    };
  })();

  function nextLunaLaunchId() {
    const id = lunaLaunchIdRef.current;
    lunaLaunchIdRef.current += 1;
    return id;
  }

  function openLunaMode(mode: Exclude<LunaMode, "research">) {
    if (mode === "plan" || mode === "ask") {
      const launch = {
        id: nextLunaLaunchId(),
        mode: mode === "plan" ? ("build" as const) : ("results" as const),
        snapshot: null,
      };
      if (activeSection === "Charts") {
        setChartLunaLaunch(launch);
        setActiveSection("Charts");
      } else {
        setSearchLunaLaunch(launch);
        setActiveSection("Search");
      }
    } else if (mode === "analyze") {
      setActiveSection("Statistics");
    } else if (mode === "playlist") {
      setActiveSection("Playlists");
    } else if (mode === "discover") {
      setActiveSection("Discovery");
    }
    setIsLunaOpen(false);
  }

  function openLunaHistory(selection: LunaHistorySelection) {
    if (selection.source === "playlist") {
      setSavedPlaylistToOpen(selection.item);
      setActiveSection("Playlists");
      setIsLunaOpen(false);
      return;
    }
    if (selection.source === "discovery") {
      setSavedDiscoveryToOpen(selection.item);
      setActiveSection("Discovery");
      setIsLunaOpen(false);
      return;
    }

    const snapshot = selection.item;
    switch (snapshot.content.kind) {
      case "search":
        setSearchLunaLaunch({
          id: nextLunaLaunchId(),
          mode: "build",
          snapshot,
        });
        setActiveSection("Search");
        break;
      case "chart":
        setChartLunaLaunch({
          id: nextLunaLaunchId(),
          mode: "build",
          snapshot,
        });
        setActiveSection("Charts");
        break;
      case "searchAnswer":
        setRequest(normalizeBrowseRequestForClient(snapshot.content.request));
        setSearchLunaLaunch({
          id: nextLunaLaunchId(),
          mode: "results",
          snapshot,
        });
        setActiveSection("Search");
        break;
      case "chartAnswer":
        setChartLunaLaunch({
          id: nextLunaLaunchId(),
          mode: "results",
          snapshot,
        });
        setActiveSection("Charts");
        break;
      case "libraryAnalysis":
        setAnalystSnapshotToOpen(snapshot);
        setActiveSection("Statistics");
        break;
      case "musicResearch":
        return;
    }
    setIsLunaOpen(false);
  }

  const leftSidebarClass =
    leftSidebarMode === "iconOnly"
      ? "left-sidebar-icon-only"
      : `left-sidebar-${leftSidebarMode}`;

  const appShellClassName = [
    "app-shell",
    leftSidebarClass,
    `right-sidebar-${effectiveRightSidebarMode}`,
    hasUsefulDetailContent ? "has-detail-content" : "no-detail-content",
    isDetailsDrawerLayout ? "details-drawer-layout" : "",
    isDetailsDrawerOpen ? "details-drawer-open" : "",
    activeSection === "Timelines" ? "albums-years-active" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const leftIconOnlyToggleLabel =
    leftSidebarMode === "iconOnly"
      ? "Show navigation labels"
      : "Show navigation icons only";

  const rightSidebarToggleLabel = isDetailsDrawerLayout
    ? isDetailsDrawerOpen
      ? "Close details drawer"
      : "Open details drawer"
    : isRightSidebarHidden
      ? "Show details sidebar"
      : "Hide details sidebar";

  useEffect(() => {
    if (!isDetailsDrawerLayout || !isDetailsDrawerOpen) {
      return undefined;
    }

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frameId = window.requestAnimationFrame(() => {
      detailDrawerRef.current?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frameId);
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [isDetailsDrawerLayout, isDetailsDrawerOpen]);

  function closeDetailDrawerAndRestoreFocus() {
    closeDetailsDrawer();
    window.requestAnimationFrame(() => detailToggleRef.current?.focus());
  }

  function toggleRightSidebar() {
    if (isDetailsDrawerLayout) {
      if (isDetailsDrawerOpen) {
        closeDetailDrawerAndRestoreFocus();
      } else {
        setIsLunaOpen(false);
        openDetailsDrawer();
      }
      return;
    }

    setRightSidebarMode(isRightSidebarHidden ? "expanded" : "hidden");
  }

  function handleDetailDrawerKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!isDetailsDrawerLayout || !isDetailsDrawerOpen) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeDetailDrawerAndRestoreFocus();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter(
      (element) =>
        element.getAttribute("aria-hidden") !== "true" &&
        element.getClientRects().length > 0,
    );
    if (focusableElements.length === 0) {
      event.preventDefault();
      event.currentTarget.focus();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    if (
      event.shiftKey &&
      (document.activeElement === firstElement ||
        document.activeElement === event.currentTarget)
    ) {
      event.preventDefault();
      lastElement.focus();
    } else if (
      !event.shiftKey &&
      (document.activeElement === lastElement ||
        document.activeElement === event.currentTarget)
    ) {
      event.preventDefault();
      firstElement.focus();
    }
  }
  return {
    isLeftSidebarHidden,
    hasUsefulDetailContent,
    isDetailsDrawerLayout,
    isDetailsDrawerOpen,
    openDetailsDrawer,
    closeDetailsDrawer,
    effectiveRightSidebarMode,
    isRightSidebarHidden,
    musicResearchContext,
    nextLunaLaunchId,
    openLunaMode,
    openLunaHistory,
    leftSidebarClass,
    appShellClassName,
    leftIconOnlyToggleLabel,
    rightSidebarToggleLabel,
    closeDetailDrawerAndRestoreFocus,
    toggleRightSidebar,
    handleDetailDrawerKeyDown,
  };
}
