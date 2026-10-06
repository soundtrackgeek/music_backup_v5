import {
  type BrowseRequest,
  type BrowseResponse,
  type LastFmAlbumPopularity,
  type AlbumReview,
  type LastFmRelatedAlbums,
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
type AlbumsState = {
  albumRequest: BrowseRequest;
  albumResponse: BrowseResponse | null;
  albumError: string | null;
  isAlbumLoading: boolean;
  selectedAlbumId: string | null;
  albumTracksResponse: BrowseResponse | null;
  albumTracksError: string | null;
  isAlbumTracksLoading: boolean;
  albumPopularity: LastFmAlbumPopularity | null;
  albumPopularityError: string | null;
  isAlbumPopularityLoading: boolean;
  albumReview: AlbumReview | null;
  albumReviewError: string | null;
  isAlbumReviewLoading: boolean;
  relatedAlbums: LastFmRelatedAlbums | null;
  relatedAlbumsError: string | null;
  isRelatedAlbumsLoading: boolean;
  albumIncludeCalculated: boolean;
  albumExportResult: ExportResult | null;
};

function createInitialState(): AlbumsState {
  const albumRequest: BrowseRequest = (() => {
    const request = createRequest("albums");
    request.limit = 25;
    return request;
  })();
  const albumResponse: BrowseResponse | null = null;
  const albumError: string | null = null;
  const isAlbumLoading: boolean = false;
  const selectedAlbumId: string | null = null;
  const albumTracksResponse: BrowseResponse | null = null;
  const albumTracksError: string | null = null;
  const isAlbumTracksLoading: boolean = false;
  const albumPopularity: LastFmAlbumPopularity | null = null;
  const albumPopularityError: string | null = null;
  const isAlbumPopularityLoading: boolean = false;
  const albumReview: AlbumReview | null = null;
  const albumReviewError: string | null = null;
  const isAlbumReviewLoading: boolean = false;
  const relatedAlbums: LastFmRelatedAlbums | null = null;
  const relatedAlbumsError: string | null = null;
  const isRelatedAlbumsLoading: boolean = false;
  const albumIncludeCalculated: boolean = false;
  const albumExportResult: ExportResult | null = null;
  return {
    albumRequest,
    albumResponse,
    albumError,
    isAlbumLoading,
    selectedAlbumId,
    albumTracksResponse,
    albumTracksError,
    isAlbumTracksLoading,
    albumPopularity,
    albumPopularityError,
    isAlbumPopularityLoading,
    albumReview,
    albumReviewError,
    isAlbumReviewLoading,
    relatedAlbums,
    relatedAlbumsError,
    isRelatedAlbumsLoading,
    albumIncludeCalculated,
    albumExportResult,
  };
}

function useAlbumsStoreValue() {
  const [state, dispatch] = useReducer(
    workspaceReducer<AlbumsState>,
    undefined,
    createInitialState,
  );
  const {
    albumRequest,
    albumResponse,
    albumError,
    isAlbumLoading,
    selectedAlbumId,
    albumTracksResponse,
    albumTracksError,
    isAlbumTracksLoading,
    albumPopularity,
    albumPopularityError,
    isAlbumPopularityLoading,
    albumReview,
    albumReviewError,
    isAlbumReviewLoading,
    relatedAlbums,
    relatedAlbumsError,
    isRelatedAlbumsLoading,
    albumIncludeCalculated,
    albumExportResult,
  } = state;
  const setters = useMemo(
    () =>
      createWorkspaceSetters<AlbumsState>(dispatch, [
        "albumRequest",
        "albumResponse",
        "albumError",
        "isAlbumLoading",
        "selectedAlbumId",
        "albumTracksResponse",
        "albumTracksError",
        "isAlbumTracksLoading",
        "albumPopularity",
        "albumPopularityError",
        "isAlbumPopularityLoading",
        "albumReview",
        "albumReviewError",
        "isAlbumReviewLoading",
        "relatedAlbums",
        "relatedAlbumsError",
        "isRelatedAlbumsLoading",
        "albumIncludeCalculated",
        "albumExportResult",
      ]),
    [dispatch],
  );
  const {
    setAlbumRequest,
    setAlbumResponse,
    setAlbumError,
    setIsAlbumLoading,
    setSelectedAlbumId,
    setAlbumTracksResponse,
    setAlbumTracksError,
    setIsAlbumTracksLoading,
    setAlbumPopularity,
    setAlbumPopularityError,
    setIsAlbumPopularityLoading,
    setAlbumReview,
    setAlbumReviewError,
    setIsAlbumReviewLoading,
    setRelatedAlbums,
    setRelatedAlbumsError,
    setIsRelatedAlbumsLoading,
    setAlbumIncludeCalculated,
    setAlbumExportResult,
  } = setters;

  return {
    albumRequest,
    setAlbumRequest,
    albumResponse,
    setAlbumResponse,
    albumError,
    setAlbumError,
    isAlbumLoading,
    setIsAlbumLoading,
    selectedAlbumId,
    setSelectedAlbumId,
    albumTracksResponse,
    setAlbumTracksResponse,
    albumTracksError,
    setAlbumTracksError,
    isAlbumTracksLoading,
    setIsAlbumTracksLoading,
    albumPopularity,
    setAlbumPopularity,
    albumPopularityError,
    setAlbumPopularityError,
    isAlbumPopularityLoading,
    setIsAlbumPopularityLoading,
    albumReview,
    setAlbumReview,
    albumReviewError,
    setAlbumReviewError,
    isAlbumReviewLoading,
    setIsAlbumReviewLoading,
    relatedAlbums,
    setRelatedAlbums,
    relatedAlbumsError,
    setRelatedAlbumsError,
    isRelatedAlbumsLoading,
    setIsRelatedAlbumsLoading,
    albumIncludeCalculated,
    setAlbumIncludeCalculated,
    albumExportResult,
    setAlbumExportResult,
  };
}

export const { Provider: AlbumsStoreProvider, useStore: useAlbumsStore } =
  createWorkspaceContext(useAlbumsStoreValue, "albums");
