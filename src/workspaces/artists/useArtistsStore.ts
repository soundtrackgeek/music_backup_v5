import {
  type ArtistListRequest,
  type ArtistListResponse,
  type LastFmArtistPopularity,
  type LastFmArtistSimilarity,
  type ArtistBiography,
  type ArtistTrackHighlights,
  type BrowseResponse,
  type LastFmAlbumPopularity,
  type MusicBrainzArtistDiscographyResponse,
  type ExportResult,
  type MusicBrainzArtistRefreshResult,
  type MusicBrainzArtistOriginCountryUpdate,
} from "../../types";
import { type ArtistDetailTab } from "../ArtistsWorkspace";
import { createArtistListRequest } from "../../app/requests";
import { useMemo } from "react";
import {
  createWorkspaceContext,
  createWorkspaceSetters,
  workspaceReducer,
} from "../../app/workspaceStore";
import { useReducer } from "react";
type ArtistsState = {
  artistRequest: ArtistListRequest;
  artistResponse: ArtistListResponse | null;
  artistError: string | null;
  isArtistLoading: boolean;
  selectedArtistId: string | null;
  artistDetailTab: ArtistDetailTab;
  artistPopularity: LastFmArtistPopularity | null;
  artistPopularityError: string | null;
  isArtistPopularityLoading: boolean;
  artistSimilarity: LastFmArtistSimilarity | null;
  artistSimilarityError: string | null;
  isArtistSimilarityLoading: boolean;
  artistBiography: ArtistBiography | null;
  artistBiographyError: string | null;
  isArtistBiographyLoading: boolean;
  artistTrackHighlights: ArtistTrackHighlights | null;
  artistTrackHighlightsError: string | null;
  isArtistTrackHighlightsLoading: boolean;
  isPreparingArtistCharts: boolean;
  artistAlbumsResponse: BrowseResponse | null;
  artistAlbumsError: string | null;
  isArtistAlbumsLoading: boolean;
  selectedArtistAlbumId: string | null;
  artistAlbumTracksResponse: BrowseResponse | null;
  artistAlbumTracksError: string | null;
  isArtistAlbumTracksLoading: boolean;
  artistAlbumPopularity: LastFmAlbumPopularity | null;
  artistAlbumPopularityError: string | null;
  isArtistAlbumPopularityLoading: boolean;
  musicBrainzArtistDiscography: MusicBrainzArtistDiscographyResponse | null;
  musicBrainzArtistError: string | null;
  isMusicBrainzArtistLoading: boolean;
  isMusicBrainzArtistUpdating: boolean;
  musicBrainzArtistExportResult: ExportResult | null;
  musicBrainzArtistRefreshResult: MusicBrainzArtistRefreshResult | null;
  musicBrainzArtistOriginResult: MusicBrainzArtistOriginCountryUpdate | null;
  artistIncludeCalculated: boolean;
  artistExportResult: ExportResult | null;
};

function createInitialState(): ArtistsState {
  const artistRequest: ArtistListRequest = (() => createArtistListRequest())();
  const artistResponse: ArtistListResponse | null = null;
  const artistError: string | null = null;
  const isArtistLoading: boolean = false;
  const selectedArtistId: string | null = null;
  const artistDetailTab: ArtistDetailTab = "overview";
  const artistPopularity: LastFmArtistPopularity | null = null;
  const artistPopularityError: string | null = null;
  const isArtistPopularityLoading: boolean = false;
  const artistSimilarity: LastFmArtistSimilarity | null = null;
  const artistSimilarityError: string | null = null;
  const isArtistSimilarityLoading: boolean = false;
  const artistBiography: ArtistBiography | null = null;
  const artistBiographyError: string | null = null;
  const isArtistBiographyLoading: boolean = false;
  const artistTrackHighlights: ArtistTrackHighlights | null = null;
  const artistTrackHighlightsError: string | null = null;
  const isArtistTrackHighlightsLoading: boolean = false;
  const isPreparingArtistCharts: boolean = false;
  const artistAlbumsResponse: BrowseResponse | null = null;
  const artistAlbumsError: string | null = null;
  const isArtistAlbumsLoading: boolean = false;
  const selectedArtistAlbumId: string | null = null;
  const artistAlbumTracksResponse: BrowseResponse | null = null;
  const artistAlbumTracksError: string | null = null;
  const isArtistAlbumTracksLoading: boolean = false;
  const artistAlbumPopularity: LastFmAlbumPopularity | null = null;
  const artistAlbumPopularityError: string | null = null;
  const isArtistAlbumPopularityLoading: boolean = false;
  const musicBrainzArtistDiscography: MusicBrainzArtistDiscographyResponse | null =
    null;
  const musicBrainzArtistError: string | null = null;
  const isMusicBrainzArtistLoading: boolean = false;
  const isMusicBrainzArtistUpdating: boolean = false;
  const musicBrainzArtistExportResult: ExportResult | null = null;
  const musicBrainzArtistRefreshResult: MusicBrainzArtistRefreshResult | null =
    null;
  const musicBrainzArtistOriginResult: MusicBrainzArtistOriginCountryUpdate | null =
    null;
  const artistIncludeCalculated: boolean = false;
  const artistExportResult: ExportResult | null = null;
  return {
    artistRequest,
    artistResponse,
    artistError,
    isArtistLoading,
    selectedArtistId,
    artistDetailTab,
    artistPopularity,
    artistPopularityError,
    isArtistPopularityLoading,
    artistSimilarity,
    artistSimilarityError,
    isArtistSimilarityLoading,
    artistBiography,
    artistBiographyError,
    isArtistBiographyLoading,
    artistTrackHighlights,
    artistTrackHighlightsError,
    isArtistTrackHighlightsLoading,
    isPreparingArtistCharts,
    artistAlbumsResponse,
    artistAlbumsError,
    isArtistAlbumsLoading,
    selectedArtistAlbumId,
    artistAlbumTracksResponse,
    artistAlbumTracksError,
    isArtistAlbumTracksLoading,
    artistAlbumPopularity,
    artistAlbumPopularityError,
    isArtistAlbumPopularityLoading,
    musicBrainzArtistDiscography,
    musicBrainzArtistError,
    isMusicBrainzArtistLoading,
    isMusicBrainzArtistUpdating,
    musicBrainzArtistExportResult,
    musicBrainzArtistRefreshResult,
    musicBrainzArtistOriginResult,
    artistIncludeCalculated,
    artistExportResult,
  };
}

function useArtistsStoreValue() {
  const [state, dispatch] = useReducer(
    workspaceReducer<ArtistsState>,
    undefined,
    createInitialState,
  );
  const {
    artistRequest,
    artistResponse,
    artistError,
    isArtistLoading,
    selectedArtistId,
    artistDetailTab,
    artistPopularity,
    artistPopularityError,
    isArtistPopularityLoading,
    artistSimilarity,
    artistSimilarityError,
    isArtistSimilarityLoading,
    artistBiography,
    artistBiographyError,
    isArtistBiographyLoading,
    artistTrackHighlights,
    artistTrackHighlightsError,
    isArtistTrackHighlightsLoading,
    isPreparingArtistCharts,
    artistAlbumsResponse,
    artistAlbumsError,
    isArtistAlbumsLoading,
    selectedArtistAlbumId,
    artistAlbumTracksResponse,
    artistAlbumTracksError,
    isArtistAlbumTracksLoading,
    artistAlbumPopularity,
    artistAlbumPopularityError,
    isArtistAlbumPopularityLoading,
    musicBrainzArtistDiscography,
    musicBrainzArtistError,
    isMusicBrainzArtistLoading,
    isMusicBrainzArtistUpdating,
    musicBrainzArtistExportResult,
    musicBrainzArtistRefreshResult,
    musicBrainzArtistOriginResult,
    artistIncludeCalculated,
    artistExportResult,
  } = state;
  const setters = useMemo(
    () =>
      createWorkspaceSetters<ArtistsState>(dispatch, [
        "artistRequest",
        "artistResponse",
        "artistError",
        "isArtistLoading",
        "selectedArtistId",
        "artistDetailTab",
        "artistPopularity",
        "artistPopularityError",
        "isArtistPopularityLoading",
        "artistSimilarity",
        "artistSimilarityError",
        "isArtistSimilarityLoading",
        "artistBiography",
        "artistBiographyError",
        "isArtistBiographyLoading",
        "artistTrackHighlights",
        "artistTrackHighlightsError",
        "isArtistTrackHighlightsLoading",
        "isPreparingArtistCharts",
        "artistAlbumsResponse",
        "artistAlbumsError",
        "isArtistAlbumsLoading",
        "selectedArtistAlbumId",
        "artistAlbumTracksResponse",
        "artistAlbumTracksError",
        "isArtistAlbumTracksLoading",
        "artistAlbumPopularity",
        "artistAlbumPopularityError",
        "isArtistAlbumPopularityLoading",
        "musicBrainzArtistDiscography",
        "musicBrainzArtistError",
        "isMusicBrainzArtistLoading",
        "isMusicBrainzArtistUpdating",
        "musicBrainzArtistExportResult",
        "musicBrainzArtistRefreshResult",
        "musicBrainzArtistOriginResult",
        "artistIncludeCalculated",
        "artistExportResult",
      ]),
    [dispatch],
  );
  const {
    setArtistRequest,
    setArtistResponse,
    setArtistError,
    setIsArtistLoading,
    setSelectedArtistId,
    setArtistDetailTab,
    setArtistPopularity,
    setArtistPopularityError,
    setIsArtistPopularityLoading,
    setArtistSimilarity,
    setArtistSimilarityError,
    setIsArtistSimilarityLoading,
    setArtistBiography,
    setArtistBiographyError,
    setIsArtistBiographyLoading,
    setArtistTrackHighlights,
    setArtistTrackHighlightsError,
    setIsArtistTrackHighlightsLoading,
    setIsPreparingArtistCharts,
    setArtistAlbumsResponse,
    setArtistAlbumsError,
    setIsArtistAlbumsLoading,
    setSelectedArtistAlbumId,
    setArtistAlbumTracksResponse,
    setArtistAlbumTracksError,
    setIsArtistAlbumTracksLoading,
    setArtistAlbumPopularity,
    setArtistAlbumPopularityError,
    setIsArtistAlbumPopularityLoading,
    setMusicBrainzArtistDiscography,
    setMusicBrainzArtistError,
    setIsMusicBrainzArtistLoading,
    setIsMusicBrainzArtistUpdating,
    setMusicBrainzArtistExportResult,
    setMusicBrainzArtistRefreshResult,
    setMusicBrainzArtistOriginResult,
    setArtistIncludeCalculated,
    setArtistExportResult,
  } = setters;
  const selectedArtist =
    artistResponse?.rows.find((artist) => artist.id === selectedArtistId) ??
    null;
  return {
    artistRequest,
    setArtistRequest,
    artistResponse,
    setArtistResponse,
    artistError,
    setArtistError,
    isArtistLoading,
    setIsArtistLoading,
    selectedArtistId,
    setSelectedArtistId,
    artistDetailTab,
    setArtistDetailTab,
    artistPopularity,
    setArtistPopularity,
    artistPopularityError,
    setArtistPopularityError,
    isArtistPopularityLoading,
    setIsArtistPopularityLoading,
    artistSimilarity,
    setArtistSimilarity,
    artistSimilarityError,
    setArtistSimilarityError,
    isArtistSimilarityLoading,
    setIsArtistSimilarityLoading,
    artistBiography,
    setArtistBiography,
    artistBiographyError,
    setArtistBiographyError,
    isArtistBiographyLoading,
    setIsArtistBiographyLoading,
    artistTrackHighlights,
    setArtistTrackHighlights,
    artistTrackHighlightsError,
    setArtistTrackHighlightsError,
    isArtistTrackHighlightsLoading,
    setIsArtistTrackHighlightsLoading,
    isPreparingArtistCharts,
    setIsPreparingArtistCharts,
    artistAlbumsResponse,
    setArtistAlbumsResponse,
    artistAlbumsError,
    setArtistAlbumsError,
    isArtistAlbumsLoading,
    setIsArtistAlbumsLoading,
    selectedArtistAlbumId,
    setSelectedArtistAlbumId,
    artistAlbumTracksResponse,
    setArtistAlbumTracksResponse,
    artistAlbumTracksError,
    setArtistAlbumTracksError,
    isArtistAlbumTracksLoading,
    setIsArtistAlbumTracksLoading,
    artistAlbumPopularity,
    setArtistAlbumPopularity,
    artistAlbumPopularityError,
    setArtistAlbumPopularityError,
    isArtistAlbumPopularityLoading,
    setIsArtistAlbumPopularityLoading,
    musicBrainzArtistDiscography,
    setMusicBrainzArtistDiscography,
    musicBrainzArtistError,
    setMusicBrainzArtistError,
    isMusicBrainzArtistLoading,
    setIsMusicBrainzArtistLoading,
    isMusicBrainzArtistUpdating,
    setIsMusicBrainzArtistUpdating,
    musicBrainzArtistExportResult,
    setMusicBrainzArtistExportResult,
    musicBrainzArtistRefreshResult,
    setMusicBrainzArtistRefreshResult,
    musicBrainzArtistOriginResult,
    setMusicBrainzArtistOriginResult,
    artistIncludeCalculated,
    setArtistIncludeCalculated,
    artistExportResult,
    setArtistExportResult,
    selectedArtist,
  };
}

export const { Provider: ArtistsStoreProvider, useStore: useArtistsStore } =
  createWorkspaceContext(useArtistsStoreValue, "artists");
