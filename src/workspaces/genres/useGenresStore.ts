import {
  type GenreListRequest,
  type GenreListResponse,
  type BrowseResponse,
  type ExportResult,
} from "../../types";
import { createGenreListRequest } from "../../app/requests";
import { useMemo } from "react";
import {
  createWorkspaceContext,
  createWorkspaceSetters,
  workspaceReducer,
} from "../../app/workspaceStore";
import { useReducer } from "react";
type GenresState = {
  genreRequest: GenreListRequest;
  genreResponse: GenreListResponse | null;
  genreError: string | null;
  isGenreLoading: boolean;
  selectedGenreId: string | null;
  genreAlbumsResponse: BrowseResponse | null;
  genreAlbumsError: string | null;
  isGenreAlbumsLoading: boolean;
  genreIncludeCalculated: boolean;
  genreExportResult: ExportResult | null;
  genreSuggestionNames: string[];
};

function createInitialState(): GenresState {
  const genreRequest: GenreListRequest = (() => createGenreListRequest())();
  const genreResponse: GenreListResponse | null = null;
  const genreError: string | null = null;
  const isGenreLoading: boolean = false;
  const selectedGenreId: string | null = null;
  const genreAlbumsResponse: BrowseResponse | null = null;
  const genreAlbumsError: string | null = null;
  const isGenreAlbumsLoading: boolean = false;
  const genreIncludeCalculated: boolean = false;
  const genreExportResult: ExportResult | null = null;
  const genreSuggestionNames: string[] = [];
  return {
    genreRequest,
    genreResponse,
    genreError,
    isGenreLoading,
    selectedGenreId,
    genreAlbumsResponse,
    genreAlbumsError,
    isGenreAlbumsLoading,
    genreIncludeCalculated,
    genreExportResult,
    genreSuggestionNames,
  };
}

function useGenresStoreValue() {
  const [state, dispatch] = useReducer(
    workspaceReducer<GenresState>,
    undefined,
    createInitialState,
  );
  const {
    genreRequest,
    genreResponse,
    genreError,
    isGenreLoading,
    selectedGenreId,
    genreAlbumsResponse,
    genreAlbumsError,
    isGenreAlbumsLoading,
    genreIncludeCalculated,
    genreExportResult,
    genreSuggestionNames,
  } = state;
  const setters = useMemo(
    () =>
      createWorkspaceSetters<GenresState>(dispatch, [
        "genreRequest",
        "genreResponse",
        "genreError",
        "isGenreLoading",
        "selectedGenreId",
        "genreAlbumsResponse",
        "genreAlbumsError",
        "isGenreAlbumsLoading",
        "genreIncludeCalculated",
        "genreExportResult",
        "genreSuggestionNames",
      ]),
    [dispatch],
  );
  const {
    setGenreRequest,
    setGenreResponse,
    setGenreError,
    setIsGenreLoading,
    setSelectedGenreId,
    setGenreAlbumsResponse,
    setGenreAlbumsError,
    setIsGenreAlbumsLoading,
    setGenreIncludeCalculated,
    setGenreExportResult,
    setGenreSuggestionNames,
  } = setters;

  return {
    genreRequest,
    setGenreRequest,
    genreResponse,
    setGenreResponse,
    genreError,
    setGenreError,
    isGenreLoading,
    setIsGenreLoading,
    selectedGenreId,
    setSelectedGenreId,
    genreAlbumsResponse,
    setGenreAlbumsResponse,
    genreAlbumsError,
    setGenreAlbumsError,
    isGenreAlbumsLoading,
    setIsGenreAlbumsLoading,
    genreIncludeCalculated,
    setGenreIncludeCalculated,
    genreExportResult,
    setGenreExportResult,
    genreSuggestionNames,
    setGenreSuggestionNames,
  };
}

export const { Provider: GenresStoreProvider, useStore: useGenresStore } =
  createWorkspaceContext(useGenresStoreValue, "genres");
