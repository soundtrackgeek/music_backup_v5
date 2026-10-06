import {
  type LibraryUpdate,
  type AiSnapshot,
  type SavedPlaylist,
  type SavedExternalDiscovery,
  type LeftSidebarMode,
  type RightSidebarMode,
} from "../../types";
import { type PlaylistBuilderLaunch } from "../PlaylistBuilderWorkspace";
import {
  createDefaultLeftSidebarMode,
  createDefaultRightSidebarMode,
} from "../../app/defaults";
import { useMemo, useRef } from "react";
import {
  createWorkspaceContext,
  createWorkspaceSetters,
  workspaceReducer,
} from "../../app/workspaceStore";
import { useReducer } from "react";
type ShellState = {
  activeSection: string;
  selectedUpdate: LibraryUpdate | null;
  isLunaOpen: boolean;
  searchLunaLaunch: {
    id: number;
    mode: "build" | "results";
    snapshot: AiSnapshot | null;
  } | null;
  chartLunaLaunch: {
    id: number;
    mode: "build" | "results";
    snapshot: AiSnapshot | null;
  } | null;
  analystSnapshotToOpen: AiSnapshot | null;
  savedPlaylistToOpen: SavedPlaylist | null;
  savedDiscoveryToOpen: SavedExternalDiscovery | null;
  playlistLaunch: PlaylistBuilderLaunch | null;
  leftSidebarMode: LeftSidebarMode;
  rightSidebarMode: RightSidebarMode;
};

function createInitialState(): ShellState {
  const activeSection: string = "Search";
  const selectedUpdate: LibraryUpdate | null = null;
  const isLunaOpen: boolean = false;
  const searchLunaLaunch: {
    id: number;
    mode: "build" | "results";
    snapshot: AiSnapshot | null;
  } | null = null;
  const chartLunaLaunch: {
    id: number;
    mode: "build" | "results";
    snapshot: AiSnapshot | null;
  } | null = null;
  const analystSnapshotToOpen: AiSnapshot | null = null;
  const savedPlaylistToOpen: SavedPlaylist | null = null;
  const savedDiscoveryToOpen: SavedExternalDiscovery | null = null;
  const playlistLaunch: PlaylistBuilderLaunch | null = null;
  const leftSidebarMode: LeftSidebarMode = (() =>
    createDefaultLeftSidebarMode())();
  const rightSidebarMode: RightSidebarMode = (() =>
    createDefaultRightSidebarMode())();
  return {
    activeSection,
    selectedUpdate,
    isLunaOpen,
    searchLunaLaunch,
    chartLunaLaunch,
    analystSnapshotToOpen,
    savedPlaylistToOpen,
    savedDiscoveryToOpen,
    playlistLaunch,
    leftSidebarMode,
    rightSidebarMode,
  };
}

function useShellStoreValue() {
  const [state, dispatch] = useReducer(
    workspaceReducer<ShellState>,
    undefined,
    createInitialState,
  );
  const {
    activeSection,
    selectedUpdate,
    isLunaOpen,
    searchLunaLaunch,
    chartLunaLaunch,
    analystSnapshotToOpen,
    savedPlaylistToOpen,
    savedDiscoveryToOpen,
    playlistLaunch,
    leftSidebarMode,
    rightSidebarMode,
  } = state;
  const setters = useMemo(
    () =>
      createWorkspaceSetters<ShellState>(dispatch, [
        "activeSection",
        "selectedUpdate",
        "isLunaOpen",
        "searchLunaLaunch",
        "chartLunaLaunch",
        "analystSnapshotToOpen",
        "savedPlaylistToOpen",
        "savedDiscoveryToOpen",
        "playlistLaunch",
        "leftSidebarMode",
        "rightSidebarMode",
      ]),
    [dispatch],
  );
  const {
    setActiveSection,
    setSelectedUpdate,
    setIsLunaOpen,
    setSearchLunaLaunch,
    setChartLunaLaunch,
    setAnalystSnapshotToOpen,
    setSavedPlaylistToOpen,
    setSavedDiscoveryToOpen,
    setPlaylistLaunch,
    setLeftSidebarMode,
    setRightSidebarMode,
  } = setters;
  const lunaLaunchIdRef = useRef(1);
  const detailDrawerRef = useRef<HTMLElement | null>(null);
  const detailToggleRef = useRef<HTMLButtonElement | null>(null);
  return {
    activeSection,
    setActiveSection,
    selectedUpdate,
    setSelectedUpdate,
    isLunaOpen,
    setIsLunaOpen,
    lunaLaunchIdRef,
    searchLunaLaunch,
    setSearchLunaLaunch,
    chartLunaLaunch,
    setChartLunaLaunch,
    analystSnapshotToOpen,
    setAnalystSnapshotToOpen,
    savedPlaylistToOpen,
    setSavedPlaylistToOpen,
    savedDiscoveryToOpen,
    setSavedDiscoveryToOpen,
    playlistLaunch,
    setPlaylistLaunch,
    leftSidebarMode,
    setLeftSidebarMode,
    rightSidebarMode,
    setRightSidebarMode,
    detailDrawerRef,
    detailToggleRef,
  };
}

export const { Provider: ShellStoreProvider, useStore: useShellStore } =
  createWorkspaceContext(useShellStoreValue, "shell");
