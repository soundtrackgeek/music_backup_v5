import {
  type BrowseRequest,
  type BrowseResponse,
  type SavedSearch,
  type ExportResult,
} from "../../types";
import { createRequest } from "../../app/requests";
import { useMemo } from "react";
import {
  createWorkspaceContext,
  createWorkspaceSetters,
  workspaceReducer,
} from "../../app/workspaceStore";
import { useReducer } from "react";
type SearchState = {
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
