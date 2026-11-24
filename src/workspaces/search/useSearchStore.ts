import {
  type BrowseRequest,
  type BrowseResponse,
  type SavedSearch,
  type ExportResult,
} from "../../types";
import type { SoundSearchResults } from "../../backend/sonic";
import { createRequest } from "../../app/requests";
import { useMemo } from "react";
import {
  createWorkspaceContext,
  createWorkspaceSetters,
  workspaceReducer,
} from "../../app/workspaceStore";
import { useReducer } from "react";
export type SoundSearchDraft = {
  query: string;
  yearFrom: number | null;
  yearTo: number | null;
  rating: string;
  result: SoundSearchResults | null;
};

export const emptySoundSearch: SoundSearchDraft = {
  query: "",
  yearFrom: null,
  yearTo: null,
  rating: "",
  result: null,
};

type SearchState = {
  searchMode: "catalog" | "sound";
  soundSearch: SoundSearchDraft;
  request: BrowseRequest;
  response: BrowseResponse | null;
  savedSearches: SavedSearch[];
  saveName: string;
  browseError: string | null;
  isSearching: boolean;
  isCreatingSearchPlaylist: boolean;
  searchPlaylistError: string | null;
  includeCalculated: boolean;
  searchTableColumns: string[];
  searchExportColumns: string[];
  exportResult: ExportResult | null;
};

function createInitialState(): SearchState {
  const request: BrowseRequest = (() => createRequest("albums"))();
  const response: BrowseResponse | null = null;
  const savedSearches: SavedSearch[] = [];
  const saveName: string = "";
  const browseError: string | null = null;
  const isSearching: boolean = false;
  const isCreatingSearchPlaylist: boolean = false;
  const searchPlaylistError: string | null = null;
  const includeCalculated: boolean = false;
  const searchTableColumns: string[] = [
    "audioQuality",
    "billboard",
    "billboardDebut",
    "billboardSingle",
    "billboardSingleDebut",
  ];
  const searchExportColumns: string[] = [];
  const exportResult: ExportResult | null = null;
  return {
    searchMode: "catalog",
    soundSearch: emptySoundSearch,
    request,
    response,
    savedSearches,
    saveName,
    browseError,
    isSearching,
    isCreatingSearchPlaylist,
    searchPlaylistError,
    includeCalculated,
    searchTableColumns,
    searchExportColumns,
    exportResult,
  };
}

function useSearchStoreValue() {
  const [state, dispatch] = useReducer(
    workspaceReducer<SearchState>,
    undefined,
    createInitialState,
  );
  const {
    request,
    response,
    savedSearches,
    saveName,
    browseError,
    isSearching,
    isCreatingSearchPlaylist,
    searchPlaylistError,
    includeCalculated,
    searchTableColumns,
    searchExportColumns,
    exportResult,
  } = state;
  const setters = useMemo(
    () =>
      createWorkspaceSetters<SearchState>(dispatch, [
        "searchMode",
        "soundSearch",
        "request",
        "response",
        "savedSearches",
        "saveName",
        "browseError",
        "isSearching",
        "isCreatingSearchPlaylist",
        "searchPlaylistError",
        "includeCalculated",
        "searchTableColumns",
        "searchExportColumns",
        "exportResult",
      ]),
    [dispatch],
  );
  const {
    setRequest,
    setResponse,
    setSavedSearches,
    setSaveName,
    setBrowseError,
    setIsSearching,
    setIsCreatingSearchPlaylist,
    setSearchPlaylistError,
    setIncludeCalculated,
    setSearchTableColumns,
    setSearchExportColumns,
    setExportResult,
  } = setters;

  return {
    searchMode: state.searchMode,
    soundSearch: state.soundSearch,
    setSearchMode: setters.setSearchMode,
    setSoundSearch: setters.setSoundSearch,
    request,
    setRequest,
    response,
    setResponse,
    savedSearches,
    setSavedSearches,
    saveName,
    setSaveName,
    browseError,
    setBrowseError,
    isSearching,
    setIsSearching,
    isCreatingSearchPlaylist,
    setIsCreatingSearchPlaylist,
    searchPlaylistError,
    setSearchPlaylistError,
    includeCalculated,
    setIncludeCalculated,
    searchTableColumns,
    setSearchTableColumns,
    searchExportColumns,
    setSearchExportColumns,
    exportResult,
    setExportResult,
  };
}

export const { Provider: SearchStoreProvider, useStore: useSearchStore } =
  createWorkspaceContext(useSearchStoreValue, "search");
