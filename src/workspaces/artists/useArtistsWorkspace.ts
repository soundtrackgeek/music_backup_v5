import { useMemo, useEffect } from "react";
import {
  createArtistAlbumsRequest,
  createAlbumTracksRequest,
  createArtistListRequest,
} from "../../app/requests";
import {
  artistDetailTabNeedsTracks,
  artistDetailTabNeedsPopularity,
  artistDetailTabNeedsHighlights,
  artistDetailTabNeedsMusicBrainz,
} from "../ArtistsWorkspace";
import {
  listArtists,
  getLastFmArtistPopularity,
  getLastFmArtistSimilarity,
  getArtistBiography,
  getArtistTrackHighlights,
  searchLibrary,
  getLastFmAlbumPopularity,
  getMusicBrainzArtistDiscography,
  exportSearch,
  getLastFmArtistConstellationBranch,
  openExternalUrl,
  setMusicBrainzReleaseDecision,
  setMusicBrainzArtistLink,
  refreshMusicBrainzArtistInfo,
  setMusicBrainzArtistOriginCountry,
  exportMusicBrainzArtistReleases,
} from "../../backend";
import {
  getPublishedChartCatalog,
  importPublishedCharts,
} from "../../backend/publishedCharts";
import {
  type MusicBrainzArtistOriginCountryUpdate,
  type LastFmSimilarArtist,
  type MusicBrainzArtistReleaseRow,
  type MusicBrainzArtistExportRequest,
} from "../../types";
import type { WorkspaceStores } from "../../app/WorkspaceStoresProvider";
import type { useNavigationWorkspace } from "../../app/useNavigationWorkspace";
import type { useCatalogWorkspace } from "../../app/useCatalogWorkspace";
type Inputs = Pick<
  WorkspaceStores,
  | "selectedArtist"
  | "artistAlbumsResponse"
  | "selectedArtistAlbumId"
  | "artistDetailTab"
  | "activeSection"
  | "setIsArtistLoading"
  | "setArtistError"
  | "artistRequest"
  | "setArtistResponse"
  | "catalogRefreshKey"
  | "artistResponse"
  | "selectedArtistId"
  | "setSelectedArtistId"
  | "setIsArtistPopularityLoading"
  | "setArtistPopularityError"
  | "setArtistPopularity"
  | "setIsArtistSimilarityLoading"
  | "setArtistSimilarityError"
  | "setArtistSimilarity"
  | "setIsArtistBiographyLoading"
  | "setArtistBiographyError"
  | "setArtistBiography"
  | "setIsArtistTrackHighlightsLoading"
  | "setArtistTrackHighlightsError"
  | "setArtistTrackHighlights"
  | "setIsPreparingArtistCharts"
  | "setArtistAlbumsResponse"
  | "setIsArtistAlbumsLoading"
  | "setArtistAlbumsError"
  | "setSelectedArtistAlbumId"
  | "setIsArtistAlbumTracksLoading"
  | "setArtistAlbumTracksError"
  | "setArtistAlbumTracksResponse"
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
  | "musicBrainzArtistDiscography"
  | "setArtistRequest"
  | "setArtistExportResult"
  | "artistIncludeCalculated"
  | "artistAlbumTracksResponse"
> &
  Pick<
    ReturnType<typeof useNavigationWorkspace>,
    "resetDeferredArtistDetails"
  > &
  Pick<
    ReturnType<typeof useCatalogWorkspace>,
    | "refreshOriginJoinedViews"
    | "refreshMusicBrainzOriginCountryStatus"
    | "refreshMusicBrainzArtistInfoStatus"
  >;

export function useArtistsWorkspace({
  selectedArtist,
  artistAlbumsResponse,
  selectedArtistAlbumId,
  artistDetailTab,
  activeSection,
  setIsArtistLoading,
  setArtistError,
  artistRequest,
  setArtistResponse,
  catalogRefreshKey,
  artistResponse,
  selectedArtistId,
  setSelectedArtistId,
  setIsArtistPopularityLoading,
  setArtistPopularityError,
  setArtistPopularity,
  setIsArtistSimilarityLoading,
  setArtistSimilarityError,
  setArtistSimilarity,
  setIsArtistBiographyLoading,
  setArtistBiographyError,
  setArtistBiography,
  setIsArtistTrackHighlightsLoading,
  setArtistTrackHighlightsError,
  setArtistTrackHighlights,
  setIsPreparingArtistCharts,
  setArtistAlbumsResponse,
  setIsArtistAlbumsLoading,
  setArtistAlbumsError,
  setSelectedArtistAlbumId,
  setIsArtistAlbumTracksLoading,
  setArtistAlbumTracksError,
  setArtistAlbumTracksResponse,
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
  musicBrainzArtistDiscography,
  setArtistRequest,
  setArtistExportResult,
  artistIncludeCalculated,
  artistAlbumTracksResponse,
  resetDeferredArtistDetails,
  refreshOriginJoinedViews,
  refreshMusicBrainzOriginCountryStatus,
  refreshMusicBrainzArtistInfoStatus,
}: Inputs) {
  const artistAlbumsRequest = useMemo(
    () => (selectedArtist ? createArtistAlbumsRequest(selectedArtist) : null),
    [selectedArtist],
  );

  const selectedArtistAlbum =
    artistAlbumsResponse?.rows.find(
      (row) => row.albumId === selectedArtistAlbumId,
    ) ?? null;

  const artistAlbumTracksRequest = useMemo(
    () =>
      selectedArtistAlbumId
        ? createAlbumTracksRequest(selectedArtistAlbumId)
        : null,
    [selectedArtistAlbumId],
  );

  const shouldLoadArtistAlbumTracks =
    artistDetailTabNeedsTracks(artistDetailTab);

  const shouldLoadArtistPopularity =
    artistDetailTabNeedsPopularity(artistDetailTab);

  const shouldLoadArtistTrackHighlights =
    artistDetailTabNeedsHighlights(artistDetailTab);

  const shouldLoadArtistMusicBrainz =
    artistDetailTabNeedsMusicBrainz(artistDetailTab);

  useEffect(() => {
    if (activeSection !== "Artists") {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsArtistLoading(true);
      setArtistError(null);
      void listArtists(artistRequest)
        .then((nextResponse) => {
          if (!cancelled) {
            setArtistResponse(nextResponse);
          }
        })
        .catch((searchError) => {
          if (!cancelled) {
            setArtistError(
              searchError instanceof Error
                ? searchError.message
                : String(searchError),
            );
            setArtistResponse(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsArtistLoading(false);
          }
        });
    }, 160);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeSection, artistRequest, catalogRefreshKey]);

  useEffect(() => {
    if (activeSection !== "Artists") {
      return;
    }

    const rows = artistResponse?.rows ?? [];
    const nextArtistId =
      selectedArtistId && rows.some((artist) => artist.id === selectedArtistId)
        ? selectedArtistId
        : (rows[0]?.id ?? null);

    if (nextArtistId === selectedArtistId) {
      return;
    }

    resetDeferredArtistDetails();
    setSelectedArtistId(nextArtistId);
  }, [activeSection, artistResponse, selectedArtistId]);

  useEffect(() => {
    if (
      activeSection !== "Artists" ||
      !shouldLoadArtistPopularity ||
      !selectedArtist
    ) {
      return;
    }

    let cancelled = false;
    setIsArtistPopularityLoading(true);
    setArtistPopularityError(null);
    void getLastFmArtistPopularity(selectedArtist.id)
      .then((result) => {
        if (!cancelled) setArtistPopularity(result);
      })
      .catch((error) => {
        if (!cancelled) {
          setArtistPopularityError(
            error instanceof Error ? error.message : String(error),
          );
          setArtistPopularity(null);
        }
      })
      .finally(() => {
        if (!cancelled) setIsArtistPopularityLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection, selectedArtist, shouldLoadArtistPopularity]);

  useEffect(() => {
    if (
      activeSection !== "Artists" ||
      !shouldLoadArtistPopularity ||
      !selectedArtist
    ) {
      return;
    }

    let cancelled = false;
    setIsArtistSimilarityLoading(true);
    setArtistSimilarityError(null);
    void getLastFmArtistSimilarity(selectedArtist.id)
      .then((result) => {
        if (!cancelled) setArtistSimilarity(result);
      })
      .catch((error) => {
        if (!cancelled) {
          setArtistSimilarityError(
            error instanceof Error ? error.message : String(error),
          );
          setArtistSimilarity(null);
        }
      })
      .finally(() => {
        if (!cancelled) setIsArtistSimilarityLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection, selectedArtist, shouldLoadArtistPopularity]);

  useEffect(() => {
    if (
      activeSection !== "Artists" ||
      !shouldLoadArtistPopularity ||
      !selectedArtist
    ) {
      return;
    }

    let cancelled = false;
    setIsArtistBiographyLoading(true);
    setArtistBiographyError(null);
    void getArtistBiography(selectedArtist.id)
      .then((result) => {
        if (!cancelled) setArtistBiography(result);
      })
      .catch((error) => {
        if (!cancelled) {
          setArtistBiographyError(
            error instanceof Error ? error.message : String(error),
          );
          setArtistBiography(null);
        }
      })
      .finally(() => {
        if (!cancelled) setIsArtistBiographyLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection, selectedArtist, shouldLoadArtistPopularity]);

  useEffect(() => {
    if (
      activeSection !== "Artists" ||
      !shouldLoadArtistTrackHighlights ||
      !selectedArtist
    ) {
      return;
    }

    let cancelled = false;
    setIsArtistTrackHighlightsLoading(true);
    setArtistTrackHighlightsError(null);
    setArtistTrackHighlights(null);
    setIsPreparingArtistCharts(false);
    void (async () => {
      if (artistDetailTab === "chart-busters") {
        const catalog = await getPublishedChartCatalog();
        if (cancelled) return null;
        if (catalog.needsImport) {
          setIsPreparingArtistCharts(true);
          await importPublishedCharts();
        }
      }
      if (cancelled) return null;
      return getArtistTrackHighlights(selectedArtist.id);
    })()
      .then((result) => {
        if (!cancelled) setArtistTrackHighlights(result);
      })
      .catch((error) => {
        if (!cancelled) {
          setArtistTrackHighlightsError(
            error instanceof Error ? error.message : String(error),
          );
          setArtistTrackHighlights(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsArtistTrackHighlightsLoading(false);
          setIsPreparingArtistCharts(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeSection,
    catalogRefreshKey,
    selectedArtist,
    shouldLoadArtistTrackHighlights,
    artistDetailTab,
  ]);

  useEffect(() => {
    if (activeSection !== "Artists" || !artistAlbumsRequest) {
      setArtistAlbumsResponse(null);
      return;
    }

    let cancelled = false;
    setIsArtistAlbumsLoading(true);
    setArtistAlbumsError(null);
    void searchLibrary(artistAlbumsRequest)
      .then((nextResponse) => {
        if (!cancelled) {
          setArtistAlbumsResponse(nextResponse);
        }
      })
      .catch((searchError) => {
        if (!cancelled) {
          setArtistAlbumsError(
            searchError instanceof Error
              ? searchError.message
              : String(searchError),
          );
          setArtistAlbumsResponse(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsArtistAlbumsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection, artistAlbumsRequest, catalogRefreshKey]);

  useEffect(() => {
    if (activeSection !== "Artists") {
      return;
    }

    const rows = artistAlbumsResponse?.rows ?? [];
    if (rows.length === 0) {
      setSelectedArtistAlbumId(null);
      return;
    }

    setSelectedArtistAlbumId((previous) =>
      previous && rows.some((row) => row.albumId === previous)
        ? previous
        : rows[0].albumId,
    );
  }, [activeSection, artistAlbumsResponse]);

  useEffect(() => {
    if (
      activeSection !== "Artists" ||
      !shouldLoadArtistAlbumTracks ||
      !artistAlbumTracksRequest
    ) {
      return;
    }

    let cancelled = false;
    setIsArtistAlbumTracksLoading(true);
    setArtistAlbumTracksError(null);
    void searchLibrary(artistAlbumTracksRequest)
      .then((nextResponse) => {
        if (!cancelled) {
          setArtistAlbumTracksResponse(nextResponse);
        }
      })
      .catch((searchError) => {
        if (!cancelled) {
          setArtistAlbumTracksError(
            searchError instanceof Error
              ? searchError.message
              : String(searchError),
          );
          setArtistAlbumTracksResponse(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsArtistAlbumTracksLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeSection,
    artistAlbumTracksRequest,
    catalogRefreshKey,
    shouldLoadArtistAlbumTracks,
  ]);

  useEffect(() => {
    if (
      activeSection !== "Artists" ||
      !shouldLoadArtistAlbumTracks ||
      !selectedArtist ||
      !selectedArtistAlbum?.albumId
    ) {
      setArtistAlbumPopularity(null);
      setArtistAlbumPopularityError(null);
      setIsArtistAlbumPopularityLoading(false);
      return;
    }

    let cancelled = false;
    setIsArtistAlbumPopularityLoading(true);
    setArtistAlbumPopularityError(null);
    void getLastFmAlbumPopularity(
      selectedArtist.id,
      selectedArtistAlbum.albumId,
    )
      .then((result) => {
        if (!cancelled) setArtistAlbumPopularity(result);
      })
      .catch((error) => {
        if (!cancelled) {
          setArtistAlbumPopularityError(
            error instanceof Error ? error.message : String(error),
          );
          setArtistAlbumPopularity(null);
        }
      })
      .finally(() => {
        if (!cancelled) setIsArtistAlbumPopularityLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeSection,
    selectedArtist,
    selectedArtistAlbum,
    shouldLoadArtistAlbumTracks,
  ]);

  useEffect(() => {
    if (activeSection !== "Artists") {
      return;
    }

    if (!selectedArtist) {
      setMusicBrainzArtistDiscography(null);
      setMusicBrainzArtistError(null);
      setIsMusicBrainzArtistLoading(false);
      setIsMusicBrainzArtistUpdating(false);
      setMusicBrainzArtistExportResult(null);
      setMusicBrainzArtistRefreshResult(null);
      setMusicBrainzArtistOriginResult(null);
      return;
    }

    if (
      !shouldLoadArtistMusicBrainz ||
      musicBrainzArtistDiscography?.artistKey === selectedArtist.id
    ) {
      return;
    }

    let cancelled = false;
    setIsMusicBrainzArtistLoading(true);
    setIsMusicBrainzArtistUpdating(false);
    setMusicBrainzArtistError(null);
    setMusicBrainzArtistExportResult(null);
    setMusicBrainzArtistRefreshResult(null);
    setMusicBrainzArtistOriginResult(null);
    void getMusicBrainzArtistDiscography(selectedArtist.id, selectedArtist.name)
      .then((nextResponse) => {
        if (!cancelled) {
          setMusicBrainzArtistDiscography(nextResponse);
        }
      })
      .catch((discographyError) => {
        if (!cancelled) {
          setMusicBrainzArtistError(
            discographyError instanceof Error
              ? discographyError.message
              : String(discographyError),
          );
          setMusicBrainzArtistDiscography(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsMusicBrainzArtistLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeSection,
    musicBrainzArtistDiscography?.artistKey,
    selectedArtist,
    shouldLoadArtistMusicBrainz,
  ]);

  function applyArtistOriginUpdate(
    update: MusicBrainzArtistOriginCountryUpdate | null,
  ) {
    if (!update) {
      return;
    }

    setArtistResponse((current) =>
      current
        ? {
            ...current,
            rows: current.rows.map((artist) =>
              artist.id === update.artistKey
                ? {
                    ...artist,
                    originCountryCode: update.originCountryCode,
                    originCountryName: update.originCountryName,
                    originCountryRawArea: update.originCountryRawArea,
                    originCountryReviewState: update.originCountryReviewState,
                  }
                : artist,
            ),
          }
        : current,
    );
    refreshOriginJoinedViews();
  }

  function clearArtistQuery() {
    setArtistRequest((previous) => ({
      ...createArtistListRequest(),
      limit: previous.limit,
    }));
    resetDeferredArtistDetails();
    setArtistExportResult(null);
  }

  function selectArtist(artistId: string) {
    resetDeferredArtistDetails();
    setSelectedArtistId(artistId);
    setArtistExportResult(null);
  }

  function selectArtistAlbum(albumId: string) {
    setSelectedArtistAlbumId(albumId);
    setArtistAlbumTracksResponse(null);
    setArtistAlbumTracksError(null);
    setArtistAlbumPopularity(null);
    setArtistAlbumPopularityError(null);
  }

  function clearSelectedArtistAlbum() {
    setSelectedArtistAlbumId(null);
    setArtistAlbumTracksResponse(null);
    setArtistAlbumTracksError(null);
    setArtistAlbumPopularity(null);
    setArtistAlbumPopularityError(null);
  }

  async function runArtistExport(format: string) {
    if (!artistAlbumsRequest) {
      return;
    }
    const result = await exportSearch(
      artistAlbumsRequest,
      format,
      artistIncludeCalculated,
    );
    setArtistExportResult(result);
  }

  async function refreshArtistPopularity() {
    if (!selectedArtist) return;

    setIsArtistPopularityLoading(true);
    setArtistPopularityError(null);
    try {
      setArtistPopularity(
        await getLastFmArtistPopularity(selectedArtist.id, true),
      );
    } catch (error) {
      setArtistPopularityError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIsArtistPopularityLoading(false);
    }
  }

  async function refreshArtistSimilarity() {
    if (!selectedArtist) return;

    setIsArtistSimilarityLoading(true);
    setArtistSimilarityError(null);
    try {
      setArtistSimilarity(
        await getLastFmArtistSimilarity(selectedArtist.id, true),
      );
    } catch (error) {
      setArtistSimilarityError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIsArtistSimilarityLoading(false);
    }
  }

  function expandArtistConstellation(artist: LastFmSimilarArtist) {
    if (!selectedArtist) {
      return Promise.reject(
        new Error("Select an artist before expanding the constellation."),
      );
    }
    return getLastFmArtistConstellationBranch(
      selectedArtist.id,
      artist.name,
      artist.musicbrainzMbid,
    );
  }

  async function refreshArtistBiography() {
    if (!selectedArtist) return;

    setIsArtistBiographyLoading(true);
    setArtistBiographyError(null);
    try {
      setArtistBiography(await getArtistBiography(selectedArtist.id, true));
    } catch (error) {
      setArtistBiographyError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIsArtistBiographyLoading(false);
    }
  }

  async function openArtistBiographySource(url: string) {
    try {
      await openExternalUrl(url);
    } catch (error) {
      setArtistBiographyError(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async function refreshArtistMusicBrainz() {
    if (!selectedArtist) {
      return;
    }

    setIsMusicBrainzArtistLoading(true);
    setIsMusicBrainzArtistUpdating(false);
    setMusicBrainzArtistError(null);
    setMusicBrainzArtistExportResult(null);
    setMusicBrainzArtistRefreshResult(null);
    setMusicBrainzArtistOriginResult(null);
    setMusicBrainzArtistOriginResult(null);

    try {
      const result = await getMusicBrainzArtistDiscography(
        selectedArtist.id,
        selectedArtist.name,
      );
      setMusicBrainzArtistDiscography(result);
      setArtistRequest((current) => ({ ...current }));
    } catch (error) {
      setMusicBrainzArtistError(
        error instanceof Error ? error.message : String(error),
      );
      setMusicBrainzArtistDiscography(null);
    } finally {
      setIsMusicBrainzArtistLoading(false);
    }
  }

  async function setArtistMusicBrainzReleaseDecision(
    row: MusicBrainzArtistReleaseRow,
    decision: "not-in-scope" | "include",
  ) {
    if (!selectedArtist || !musicBrainzArtistDiscography) {
      return;
    }

    setIsMusicBrainzArtistLoading(true);
    setIsMusicBrainzArtistUpdating(false);
    setMusicBrainzArtistError(null);
    setMusicBrainzArtistExportResult(null);
    setMusicBrainzArtistRefreshResult(null);
    setMusicBrainzArtistOriginResult(null);

    try {
      await setMusicBrainzReleaseDecision({
        artistKey: selectedArtist.id,
        artistName: selectedArtist.name,
        musicbrainzMbid: musicBrainzArtistDiscography.musicbrainzMbid,
        releaseMbid: row.releaseMbid,
        decision,
        localAlbumId: row.localAlbumId,
      });
      const result = await getMusicBrainzArtistDiscography(
        selectedArtist.id,
        selectedArtist.name,
      );
      setMusicBrainzArtistDiscography(result);
      setArtistRequest((current) => ({ ...current }));
    } catch (error) {
      setMusicBrainzArtistError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIsMusicBrainzArtistLoading(false);
    }
  }

  async function setArtistMusicBrainzLink(
    action: "verify" | "ignore" | "unlink" | "set",
    musicbrainzMbid?: string | null,
    canonicalName?: string | null,
  ) {
    if (!selectedArtist) {
      return;
    }

    setIsMusicBrainzArtistLoading(true);
    setIsMusicBrainzArtistUpdating(false);
    setMusicBrainzArtistError(null);
    setMusicBrainzArtistExportResult(null);
    setMusicBrainzArtistRefreshResult(null);
    setMusicBrainzArtistOriginResult(null);

    try {
      await setMusicBrainzArtistLink({
        artistKey: selectedArtist.id,
        artistName: selectedArtist.name,
        action,
        musicbrainzMbid:
          musicbrainzMbid ??
          musicBrainzArtistDiscography?.musicbrainzMbid ??
          null,
        canonicalName:
          canonicalName ??
          musicBrainzArtistDiscography?.matchedCacheName ??
          selectedArtist.name,
      });
      const result = await getMusicBrainzArtistDiscography(
        selectedArtist.id,
        selectedArtist.name,
      );
      setMusicBrainzArtistDiscography(result);
      setArtistRequest((current) => ({ ...current }));
    } catch (error) {
      setMusicBrainzArtistError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIsMusicBrainzArtistLoading(false);
    }
  }

  async function updateArtistMusicBrainzInfo() {
    const musicBrainzMbid =
      musicBrainzArtistDiscography?.musicbrainzMbid ??
      selectedArtist?.musicBrainzMbid ??
      null;
    if (!selectedArtist || !musicBrainzMbid) {
      return;
    }

    setIsMusicBrainzArtistLoading(true);
    setIsMusicBrainzArtistUpdating(true);
    setMusicBrainzArtistError(null);
    setMusicBrainzArtistExportResult(null);
    setMusicBrainzArtistRefreshResult(null);

    try {
      const refreshResult = await refreshMusicBrainzArtistInfo({
        artistKey: selectedArtist.id,
        artistName: selectedArtist.name,
        musicbrainzMbid: musicBrainzMbid,
      });
      const discography = await getMusicBrainzArtistDiscography(
        selectedArtist.id,
        selectedArtist.name,
      );
      setMusicBrainzArtistDiscography(discography);
      setMusicBrainzArtistRefreshResult(refreshResult);
      setMusicBrainzArtistOriginResult(null);
      applyArtistOriginUpdate(refreshResult.origin);
      setArtistRequest((current) => ({ ...current }));
      await Promise.all([
        refreshMusicBrainzOriginCountryStatus(),
        refreshMusicBrainzArtistInfoStatus(),
      ]);
    } catch (error) {
      setMusicBrainzArtistError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIsMusicBrainzArtistUpdating(false);
      setIsMusicBrainzArtistLoading(false);
    }
  }

  async function saveArtistOriginCountry(
    countryCode: string,
    countryName?: string | null,
  ) {
    if (!selectedArtist) {
      return;
    }

    setIsMusicBrainzArtistLoading(true);
    setIsMusicBrainzArtistUpdating(false);
    setMusicBrainzArtistError(null);
    setMusicBrainzArtistExportResult(null);
    setMusicBrainzArtistRefreshResult(null);
    setMusicBrainzArtistOriginResult(null);

    try {
      const origin = await setMusicBrainzArtistOriginCountry({
        artistKey: selectedArtist.id,
        artistName: selectedArtist.name,
        musicbrainzMbid:
          musicBrainzArtistDiscography?.musicbrainzMbid ??
          selectedArtist.musicBrainzMbid ??
          null,
        countryCode,
        countryName,
      });
      setMusicBrainzArtistOriginResult(origin);
      applyArtistOriginUpdate(origin);
      await refreshMusicBrainzOriginCountryStatus();
    } catch (error) {
      setMusicBrainzArtistError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIsMusicBrainzArtistLoading(false);
    }
  }

  async function runArtistMusicBrainzExport(format: "csv" | "xlsx") {
    if (
      !selectedArtist ||
      !musicBrainzArtistDiscography ||
      musicBrainzArtistDiscography.artistLinkIgnored
    ) {
      return;
    }

    const rows = musicBrainzArtistDiscography.releases
      .filter((row) => row.status !== "excluded")
      .map((row) => ({
        releaseMbid: row.releaseMbid,
        title: row.title,
        year: row.year,
        status: row.status,
        localAlbumTitle: row.localAlbumTitle,
        localYear: row.localYear,
        matchMethod: row.matchMethod,
        confidence: row.confidence,
      }));

    if (rows.length === 0) {
      return;
    }

    const request: Omit<MusicBrainzArtistExportRequest, "format"> = {
      artistKey: selectedArtist.id,
      artistName: selectedArtist.name,
      musicbrainzMbid: musicBrainzArtistDiscography.musicbrainzMbid,
      matchedCacheName: musicBrainzArtistDiscography.matchedCacheName,
      matchMethod: musicBrainzArtistDiscography.matchMethod,
      artistLinkState: musicBrainzArtistDiscography.artistLinkState,
      artistLinkIgnored: musicBrainzArtistDiscography.artistLinkIgnored,
      rows,
    };

    setMusicBrainzArtistError(null);
    try {
      const result = await exportMusicBrainzArtistReleases(request, format);
      setMusicBrainzArtistExportResult(result);
    } catch (error) {
      setMusicBrainzArtistError(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async function openMusicBrainzArtistPage(url: string) {
    setMusicBrainzArtistError(null);
    try {
      await openExternalUrl(url);
    } catch (error) {
      setMusicBrainzArtistError(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  const artistTotal = artistResponse?.total ?? 0;

  const artistPageStart = artistTotal === 0 ? 0 : artistRequest.offset + 1;

  const artistPageEnd = Math.min(
    artistTotal,
    artistRequest.offset + artistRequest.limit,
  );

  const selectedArtistAlbumCount =
    selectedArtist?.albumCount ?? artistAlbumsResponse?.total ?? 0;

  const selectedArtistAlbumTrackCount =
    selectedArtistAlbum?.totalTracks ?? artistAlbumTracksResponse?.total ?? 0;
  return {
    artistAlbumsRequest,
    selectedArtistAlbum,
    artistAlbumTracksRequest,
    shouldLoadArtistAlbumTracks,
    shouldLoadArtistPopularity,
    shouldLoadArtistTrackHighlights,
    shouldLoadArtistMusicBrainz,
    applyArtistOriginUpdate,
    clearArtistQuery,
    selectArtist,
    selectArtistAlbum,
    clearSelectedArtistAlbum,
    runArtistExport,
    refreshArtistPopularity,
    refreshArtistSimilarity,
    expandArtistConstellation,
    refreshArtistBiography,
    openArtistBiographySource,
    refreshArtistMusicBrainz,
    setArtistMusicBrainzReleaseDecision,
    setArtistMusicBrainzLink,
    updateArtistMusicBrainzInfo,
    saveArtistOriginCountry,
    runArtistMusicBrainzExport,
    openMusicBrainzArtistPage,
    artistTotal,
    artistPageStart,
    artistPageEnd,
    selectedArtistAlbumCount,
    selectedArtistAlbumTrackCount,
  };
}
