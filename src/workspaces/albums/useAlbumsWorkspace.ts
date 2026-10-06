import { useMemo, useEffect, type ReactNode } from "react";
import {
  createAlbumTracksRequest,
  createTextFilter,
  nextSort,
  createRequest,
} from "../../app/requests";
import {
  searchLibrary,
  getLastFmAlbumPopularity,
  getAlbumReview,
  getLastFmRelatedAlbums,
  exportSearch,
  openExternalUrl,
} from "../../backend";
import { normalizeArtistKey } from "../../backend/normalization";
import { type BrowseFilters, type TextFilter } from "../../types";
import { textFilterLabel } from "../../app/display";
import { addRangeChip } from "../../components/catalog/filterChips";
import type { WorkspaceStores } from "../../app/WorkspaceStoresProvider";

type Inputs = Pick<
  WorkspaceStores,
  | "albumRequest"
  | "selectedAlbumId"
  | "activeSection"
  | "setIsAlbumLoading"
  | "setAlbumError"
  | "setAlbumResponse"
  | "catalogRefreshKey"
  | "albumResponse"
  | "setSelectedAlbumId"
  | "setAlbumTracksResponse"
  | "setIsAlbumTracksLoading"
  | "setAlbumTracksError"
  | "setAlbumPopularity"
  | "setAlbumPopularityError"
  | "setIsAlbumPopularityLoading"
  | "setAlbumReview"
  | "setAlbumReviewError"
  | "setIsAlbumReviewLoading"
  | "setRelatedAlbums"
  | "setRelatedAlbumsError"
  | "setIsRelatedAlbumsLoading"
  | "setAlbumRequest"
  | "setAlbumExportResult"
  | "albumIncludeCalculated"
  | "albumTracksResponse"
>;

export function useAlbumsWorkspace({
  albumRequest,
  selectedAlbumId,
  activeSection,
  setIsAlbumLoading,
  setAlbumError,
  setAlbumResponse,
  catalogRefreshKey,
  albumResponse,
  setSelectedAlbumId,
  setAlbumTracksResponse,
  setIsAlbumTracksLoading,
  setAlbumTracksError,
  setAlbumPopularity,
  setAlbumPopularityError,
  setIsAlbumPopularityLoading,
  setAlbumReview,
  setAlbumReviewError,
  setIsAlbumReviewLoading,
  setRelatedAlbums,
  setRelatedAlbumsError,
  setIsRelatedAlbumsLoading,
  setAlbumRequest,
  setAlbumExportResult,
  albumIncludeCalculated,
  albumTracksResponse,
}: Inputs) {
  const albumFilters = albumRequest.filters;

  const albumTracksRequest = useMemo(
    () => (selectedAlbumId ? createAlbumTracksRequest(selectedAlbumId) : null),
    [selectedAlbumId],
  );

  useEffect(() => {
    if (activeSection !== "Albums") {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsAlbumLoading(true);
      setAlbumError(null);
      void searchLibrary(albumRequest)
        .then((nextResponse) => {
          if (!cancelled) {
            setAlbumResponse(nextResponse);
          }
        })
        .catch((searchError) => {
          if (!cancelled) {
            setAlbumError(
              searchError instanceof Error
                ? searchError.message
                : String(searchError),
            );
            setAlbumResponse(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsAlbumLoading(false);
          }
        });
    }, 160);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeSection, albumRequest, catalogRefreshKey]);

  useEffect(() => {
    if (activeSection !== "Albums") {
      return;
    }

    const rows = albumResponse?.rows ?? [];
    if (rows.length === 0) {
      setSelectedAlbumId(null);
      return;
    }

    setSelectedAlbumId((previous) =>
      previous && rows.some((row) => row.albumId === previous)
        ? previous
        : rows[0].albumId,
    );
  }, [activeSection, albumResponse]);

  useEffect(() => {
    if (activeSection !== "Albums" || !albumTracksRequest) {
      setAlbumTracksResponse(null);
      return;
    }

    let cancelled = false;
    setIsAlbumTracksLoading(true);
    setAlbumTracksError(null);
    void searchLibrary(albumTracksRequest)
      .then((nextResponse) => {
        if (!cancelled) {
          setAlbumTracksResponse(nextResponse);
        }
      })
      .catch((searchError) => {
        if (!cancelled) {
          setAlbumTracksError(
            searchError instanceof Error
              ? searchError.message
              : String(searchError),
          );
          setAlbumTracksResponse(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsAlbumTracksLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection, albumTracksRequest, catalogRefreshKey]);

  useEffect(() => {
    const album = albumResponse?.rows.find(
      (row) => row.albumId === selectedAlbumId,
    );
    const artistId = normalizeArtistKey(
      album?.albumArtistDisplay ?? album?.displayArtist ?? "",
    );
    if (activeSection !== "Albums" || !album?.albumId || !artistId) {
      setAlbumPopularity(null);
      setAlbumPopularityError(null);
      setIsAlbumPopularityLoading(false);
      return;
    }

    let cancelled = false;
    setIsAlbumPopularityLoading(true);
    setAlbumPopularityError(null);
    void getLastFmAlbumPopularity(artistId, album.albumId)
      .then((result) => {
        if (!cancelled) setAlbumPopularity(result);
      })
      .catch((error) => {
        if (!cancelled) {
          setAlbumPopularityError(
            error instanceof Error ? error.message : String(error),
          );
          setAlbumPopularity(null);
        }
      })
      .finally(() => {
        if (!cancelled) setIsAlbumPopularityLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection, albumResponse, selectedAlbumId]);

  useEffect(() => {
    if (activeSection !== "Albums" || !selectedAlbumId) {
      setAlbumReview(null);
      setAlbumReviewError(null);
      setIsAlbumReviewLoading(false);
      return;
    }

    let cancelled = false;
    setIsAlbumReviewLoading(true);
    setAlbumReviewError(null);
    void getAlbumReview(selectedAlbumId)
      .then((result) => {
        if (!cancelled) setAlbumReview(result);
      })
      .catch((error) => {
        if (!cancelled) {
          setAlbumReviewError(
            error instanceof Error ? error.message : String(error),
          );
          setAlbumReview(null);
        }
      })
      .finally(() => {
        if (!cancelled) setIsAlbumReviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection, selectedAlbumId]);

  useEffect(() => {
    if (activeSection !== "Albums" || !selectedAlbumId) {
      setRelatedAlbums(null);
      setRelatedAlbumsError(null);
      setIsRelatedAlbumsLoading(false);
      return;
    }

    let cancelled = false;
    setIsRelatedAlbumsLoading(true);
    setRelatedAlbumsError(null);
    setRelatedAlbums(null);
    void getLastFmRelatedAlbums(selectedAlbumId)
      .then((result) => {
        if (!cancelled) setRelatedAlbums(result);
      })
      .catch((error) => {
        if (!cancelled) {
          setRelatedAlbumsError(
            error instanceof Error ? error.message : String(error),
          );
          setRelatedAlbums(null);
        }
      })
      .finally(() => {
        if (!cancelled) setIsRelatedAlbumsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection, selectedAlbumId]);

  const albumChips = useMemo(() => {
    const nextChips: { key: string; label: ReactNode; remove: () => void }[] =
      [];
    const addTextChip = (
      key: keyof BrowseFilters,
      label: string,
      filter: TextFilter,
    ) => {
      const chipLabel = textFilterLabel(label, filter);
      if (chipLabel) {
        nextChips.push({
          key,
          label: chipLabel,
          remove: () => updateAlbumFilter(key, createTextFilter()),
        });
      }
    };

    if (albumRequest.searchText.trim()) {
      nextChips.push({
        key: "searchText",
        label: `Search "${albumRequest.searchText.trim()}"`,
        remove: () =>
          setAlbumRequest((previous) => ({
            ...previous,
            searchText: "",
            offset: 0,
          })),
      });
    }

    addTextChip("albumTitle", "Album", albumFilters.albumTitle);
    addTextChip("albumArtist", "Album artist", albumFilters.albumArtist);
    addTextChip("publisher", "Publisher", albumFilters.publisher);

    if (albumFilters.genres.length) {
      nextChips.push({
        key: "genres",
        label: `Genres: ${albumFilters.genres.join(", ")}`,
        remove: () => updateAlbumFilter("genres", []),
      });
    }
    if (albumFilters.excludedGenres.length) {
      nextChips.push({
        key: "excludedGenres",
        label: `Excluding: ${albumFilters.excludedGenres.join(", ")}`,
        remove: () => updateAlbumFilter("excludedGenres", []),
      });
    }

    addRangeChip(
      nextChips,
      "year",
      "Year",
      albumFilters.yearFrom,
      albumFilters.yearTo,
      () => {
        updateAlbumFilters({ yearFrom: null, yearTo: null });
      },
    );
    addRangeChip(
      nextChips,
      "billboard",
      "Billboard",
      albumFilters.billboardRankMin,
      albumFilters.billboardRankMax,
      () =>
        updateAlbumFilters({ billboardRankMin: null, billboardRankMax: null }),
    );
    addRangeChip(
      nextChips,
      "minutes",
      "Minutes",
      albumFilters.totalMinutesMin,
      albumFilters.totalMinutesMax,
      () =>
        updateAlbumFilters({ totalMinutesMin: null, totalMinutesMax: null }),
    );
    addRangeChip(
      nextChips,
      "albumRating",
      "Album rating",
      albumFilters.albumRatingMin,
      albumFilters.albumRatingMax,
      () => updateAlbumFilters({ albumRatingMin: null, albumRatingMax: null }),
    );
    addRangeChip(
      nextChips,
      "trackCount",
      "Tracks",
      albumFilters.trackCountMin,
      albumFilters.trackCountMax,
      () => updateAlbumFilters({ trackCountMin: null, trackCountMax: null }),
    );

    addRangeChip(
      nextChips,
      "ratingCompleteness",
      "Complete",
      albumFilters.ratingCompletenessMin,
      albumFilters.ratingCompletenessMax,
      () =>
        updateAlbumFilters({
          ratingCompletenessMin: null,
          ratingCompletenessMax: null,
        }),
      "%",
    );
    if (albumFilters.notFullyRated) {
      nextChips.push({
        key: "notFullyRated",
        label: "Not fully rated",
        remove: () => updateAlbumFilter("notFullyRated", false),
      });
    }
    if (
      albumFilters.lovedTracksMin != null ||
      albumFilters.lovedTracksMax != null
    ) {
      addRangeChip(
        nextChips,
        "lovedTracks",
        "Loved",
        albumFilters.lovedTracksMin,
        albumFilters.lovedTracksMax,
        () =>
          updateAlbumFilters({ lovedTracksMin: null, lovedTracksMax: null }),
      );
    }
    addRangeChip(
      nextChips,
      "bitrate",
      "Lowest bitrate",
      albumFilters.bitrateKbpsMin,
      albumFilters.bitrateKbpsMax,
      () => updateAlbumFilters({ bitrateKbpsMin: null, bitrateKbpsMax: null }),
      " kbps",
    );
    if (albumFilters.mixedAudioQuality) {
      nextChips.push({
        key: "mixedAudioQuality",
        label: "Mixed audio quality",
        remove: () => updateAlbumFilter("mixedAudioQuality", false),
      });
    }

    return nextChips;
  }, [albumFilters, albumRequest.searchText]);

  function updateAlbumFilter<K extends keyof BrowseFilters>(
    key: K,
    value: BrowseFilters[K],
  ) {
    setAlbumRequest((previous) => ({
      ...previous,
      filters: { ...previous.filters, [key]: value },
      offset: 0,
    }));
    setAlbumExportResult(null);
  }

  function updateAlbumFilters(values: Partial<BrowseFilters>) {
    setAlbumRequest((previous) => ({
      ...previous,
      filters: { ...previous.filters, ...values },
      offset: 0,
    }));
    setAlbumExportResult(null);
  }

  function sortAlbumsBy(field: string) {
    setAlbumRequest((previous) => ({
      ...previous,
      sort: nextSort(previous.sort, field),
      offset: 0,
    }));
    setAlbumExportResult(null);
  }

  function clearAlbumQuery() {
    setAlbumRequest((previous) => {
      const nextRequest = createRequest("albums");
      nextRequest.limit = previous.limit;
      return nextRequest;
    });
    setAlbumExportResult(null);
  }

  function selectAlbum(albumId: string) {
    setSelectedAlbumId(albumId);
    setAlbumPopularity(null);
    setAlbumPopularityError(null);
    setAlbumReview(null);
    setAlbumReviewError(null);
    setRelatedAlbums(null);
    setRelatedAlbumsError(null);
    setAlbumExportResult(null);
  }

  async function runAlbumExport(format: string) {
    if (!selectedAlbumId) {
      return;
    }
    const result = await exportSearch(
      createAlbumTracksRequest(selectedAlbumId),
      format,
      albumIncludeCalculated,
    );
    setAlbumExportResult(result);
  }

  async function refreshAlbumReview() {
    if (!selectedAlbumId) return;

    setIsAlbumReviewLoading(true);
    setAlbumReviewError(null);
    try {
      setAlbumReview(await getAlbumReview(selectedAlbumId, true));
    } catch (error) {
      setAlbumReviewError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIsAlbumReviewLoading(false);
    }
  }

  async function refreshRelatedAlbums() {
    if (!selectedAlbumId) return;

    setIsRelatedAlbumsLoading(true);
    setRelatedAlbumsError(null);
    try {
      setRelatedAlbums(await getLastFmRelatedAlbums(selectedAlbumId, true));
    } catch (error) {
      setRelatedAlbumsError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIsRelatedAlbumsLoading(false);
    }
  }

  async function openAlbumReviewSource(url: string) {
    try {
      await openExternalUrl(url);
    } catch (error) {
      setAlbumReviewError(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  const albumTotal = albumResponse?.total ?? 0;

  const albumPageStart = albumTotal === 0 ? 0 : albumRequest.offset + 1;

  const albumPageEnd = Math.min(
    albumTotal,
    albumRequest.offset + albumRequest.limit,
  );

  const selectedAlbum =
    albumResponse?.rows.find((row) => row.albumId === selectedAlbumId) ?? null;

  const selectedAlbumTrackCount =
    selectedAlbum?.totalTracks ?? albumTracksResponse?.total ?? 0;
  return {
    albumFilters,
    albumTracksRequest,
    albumChips,
    updateAlbumFilter,
    updateAlbumFilters,
    sortAlbumsBy,
    clearAlbumQuery,
    selectAlbum,
    runAlbumExport,
    refreshAlbumReview,
    refreshRelatedAlbums,
    openAlbumReviewSource,
    albumTotal,
    albumPageStart,
    albumPageEnd,
    selectedAlbum,
    selectedAlbumTrackCount,
  };
}
