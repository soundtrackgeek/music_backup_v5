import {
  createArtistListRequest,
  createGenreListRequest,
  normalizeBrowseRequestForClient,
  createRequest,
} from "./requests";
import { normalizeArtistKey } from "../backend/normalization";
import { type InsightCohort } from "./insightCohorts";
import { saveSearch, openExternalUrl } from "../backend";
import { type AlbumTimeRibbonPlaylist } from "../components/AlbumTimeRibbon";
import type { WorkspaceStores } from "./WorkspaceStoresProvider";

type Inputs = Pick<
  WorkspaceStores,
  | "setArtistDetailTab"
  | "setArtistPopularity"
  | "setArtistPopularityError"
  | "setIsArtistPopularityLoading"
  | "setArtistSimilarity"
  | "setArtistSimilarityError"
  | "setIsArtistSimilarityLoading"
  | "setArtistBiography"
  | "setArtistBiographyError"
  | "setIsArtistBiographyLoading"
  | "setArtistTrackHighlights"
  | "setArtistTrackHighlightsError"
  | "setIsArtistTrackHighlightsLoading"
  | "setSelectedArtistAlbumId"
  | "setArtistAlbumTracksResponse"
  | "setArtistAlbumTracksError"
  | "setIsArtistAlbumTracksLoading"
  | "setArtistAlbumPopularity"
  | "setArtistAlbumPopularityError"
  | "setIsArtistAlbumPopularityLoading"
  | "setMusicBrainzArtistDiscography"
  | "setMusicBrainzArtistError"
  | "setIsMusicBrainzArtistLoading"
  | "setIsMusicBrainzArtistUpdating"
  | "setMusicBrainzArtistExportResult"
  | "setMusicBrainzArtistRefreshResult"
  | "setMusicBrainzArtistOriginResult"
  | "setArtistRequest"
  | "setSelectedArtistId"
  | "setArtistExportResult"
  | "setActiveSection"
  | "setGenreRequest"
  | "setSelectedGenreId"
  | "setGenreExportResult"
  | "setRequest"
  | "setSavedSearches"
  | "setPlaylistLaunch"
  | "setAlbumRequest"
  | "setSelectedAlbumId"
  | "setAlbumPopularityError"
  | "setRelatedAlbumsError"
>;

export function useNavigationWorkspace({
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
  setArtistRequest,
  setSelectedArtistId,
  setArtistExportResult,
  setActiveSection,
  setGenreRequest,
  setSelectedGenreId,
  setGenreExportResult,
  setRequest,
  setSavedSearches,
  setPlaylistLaunch,
  setAlbumRequest,
  setSelectedAlbumId,
  setAlbumPopularityError,
  setRelatedAlbumsError,
}: Inputs) {
  function resetDeferredArtistDetails() {
    setArtistDetailTab("overview");
    setArtistPopularity(null);
    setArtistPopularityError(null);
    setIsArtistPopularityLoading(false);
    setArtistSimilarity(null);
    setArtistSimilarityError(null);
    setIsArtistSimilarityLoading(false);
    setArtistBiography(null);
    setArtistBiographyError(null);
    setIsArtistBiographyLoading(false);
    setArtistTrackHighlights(null);
    setArtistTrackHighlightsError(null);
    setIsArtistTrackHighlightsLoading(false);
    setSelectedArtistAlbumId(null);
    setArtistAlbumTracksResponse(null);
    setArtistAlbumTracksError(null);
    setIsArtistAlbumTracksLoading(false);
    setArtistAlbumPopularity(null);
    setArtistAlbumPopularityError(null);
    setIsArtistAlbumPopularityLoading(false);
    setMusicBrainzArtistDiscography(null);
    setMusicBrainzArtistError(null);
    setIsMusicBrainzArtistLoading(false);
    setIsMusicBrainzArtistUpdating(false);
    setMusicBrainzArtistExportResult(null);
    setMusicBrainzArtistRefreshResult(null);
    setMusicBrainzArtistOriginResult(null);
  }

  function openArtistFromMusicMap(artistKey: string, artistName: string) {
    resetDeferredArtistDetails();
    setArtistRequest((previous) => ({
      ...createArtistListRequest(),
      searchText: artistName,
      limit: previous.limit,
    }));
    setSelectedArtistId(artistKey);
    setArtistExportResult(null);
    setActiveSection("Artists");
  }

  function openArtistFromUpdates(artistName: string) {
    openArtistFromMusicMap(normalizeArtistKey(artistName), artistName);
  }

  function openGenreFromBrowse(genreId: string, genreName: string) {
    setGenreRequest((previous) => ({
      ...createGenreListRequest(),
      searchText: genreName,
      limit: previous.limit,
    }));
    setSelectedGenreId(genreId);
    setGenreExportResult(null);
    setActiveSection("Genres");
  }

  function openInsightInSearch(cohort: InsightCohort) {
    setRequest(normalizeBrowseRequestForClient(cohort.request));
    setActiveSection("Search");
  }

  async function saveInsightView(cohort: InsightCohort) {
    const saved = await saveSearch(
      cohort.title,
      normalizeBrowseRequestForClient(cohort.request),
    );
    setSavedSearches((previous) => [
      saved,
      ...previous.filter((search) => search.id !== saved.id),
    ]);
  }

  function openInsightInPlaylist(cohort: InsightCohort) {
    setPlaylistLaunch({
      id: Date.now(),
      cohortTitle: cohort.title,
      prompt: cohort.playlistPrompt,
      request: normalizeBrowseRequestForClient(cohort.request),
    });
    setActiveSection("Playlists");
  }

  function openTimelinePlaylist(selection: AlbumTimeRibbonPlaylist) {
    const playlistRequest = createRequest("tracks");
    if (selection.mode === "tracks") {
      playlistRequest.filters.trackIds = selection.trackIds;
    } else {
      playlistRequest.filters.albumIds = selection.albumIds;
    }
    playlistRequest.limit = 500;
    setPlaylistLaunch({
      id: Date.now(),
      cohortTitle: selection.title,
      prompt: selection.prompt,
      request: normalizeBrowseRequestForClient(playlistRequest),
    });
    setActiveSection("Playlists");
  }

  function openTimelineAlbum(albumId: string) {
    const nextAlbumRequest = createRequest("albums");
    nextAlbumRequest.filters.albumIds = [albumId];
    nextAlbumRequest.limit = 25;
    setAlbumRequest(nextAlbumRequest);
    setSelectedAlbumId(albumId);
    setActiveSection("Albums");
  }

  function openTimelineTrack(trackId: number) {
    const nextRequest = createRequest("tracks");
    nextRequest.filters.trackIds = [trackId];
    nextRequest.limit = 50;
    setRequest(nextRequest);
    setActiveSection("Search");
  }

  async function openLastFmSource(url: string) {
    try {
      await openExternalUrl(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setArtistPopularityError(message);
      setArtistSimilarityError(message);
      setAlbumPopularityError(message);
      setRelatedAlbumsError(message);
      setArtistAlbumPopularityError(message);
    }
  }
  return {
    resetDeferredArtistDetails,
    openArtistFromMusicMap,
    openArtistFromUpdates,
    openGenreFromBrowse,
    openInsightInSearch,
    saveInsightView,
    openInsightInPlaylist,
    openTimelinePlaylist,
    openTimelineAlbum,
    openTimelineTrack,
    openLastFmSource,
  };
}
