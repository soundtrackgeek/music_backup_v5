import { useEffect } from "react";
import {
  searchLibrary,
  getDiscoveryDailyEdition,
  getDiscoveryAnniversaries,
  getDiscoveryChartSnapshot,
  getDiscoveryDeepCutSnapshot,
  getDiscoveryCompletionSnapshot,
  getDiscoveryRecommendationSnapshot,
} from "../../backend";
import {
  type DiscoverySourceHealthAction,
  type DiscoveryChartSnapshotRequest,
  type DiscoveryDeepCutSnapshotRequest,
  type DiscoveryCompletionSnapshotRequest,
  type DiscoveryRecommendationSnapshotRequest,
  type BrowseRequest,
  type DiscoveryMission,
  type DiscoveryHeatmapCell,
  type DiscoveryAlbumPoint,
  type DiscoveryGenrePoint,
  type DiscoveryArtistPoint,
} from "../../types";
import {
  type DiscoverySelection,
  createDiscoveryMissionRequest,
  createDiscoveryHeatmapRequest,
  createDiscoveryAlbumPointRequest,
  createDiscoveryGenreRequest,
  createDiscoveryArtistRequest,
  nextSort,
} from "../../app/requests";
import {
  discoveryMissionCohort,
  discoveryHeatmapCohort,
  discoveryAlbumCohort,
  discoveryGenreCohort,
  discoveryArtistCohort,
} from "../../app/insightCohorts";
import { formatNumber, formatPercent } from "../../app/display";
import type { WorkspaceStores } from "../../app/WorkspaceStoresProvider";
import type { useCatalogWorkspace } from "../../app/useCatalogWorkspace";
type Inputs = Pick<
  WorkspaceStores,
  | "activeSection"
  | "discoverySelection"
  | "setIsDiscoveryAlbumsLoading"
  | "setDiscoveryAlbumError"
  | "discoveryAlbumRequest"
  | "setDiscoveryAlbumResponse"
  | "catalogRefreshKey"
  | "setDiscoveryError"
  | "discovery"
  | "setIsDiscoveryLoading"
  | "setActiveSection"
  | "discoveryDateRequestRef"
  | "discoveryChartRequestRef"
  | "discoveryDeepCutRequestRef"
  | "discoveryCompletionRequestRef"
  | "discoveryRecommendationRequestRef"
  | "setDiscovery"
  | "discoveryAnniversaryYearsRef"
  | "setIsDiscoveryAnniversaryLoading"
  | "setIsDiscoveryChartLoading"
  | "setIsDiscoveryDeepCutLoading"
  | "setIsDiscoveryCompletionLoading"
  | "setIsDiscoveryRecommendationLoading"
  | "setDiscoverySelection"
  | "setDiscoveryAlbumRequest"
  | "setDiscoveryCohort"
  | "isDiscoveryLoading"
  | "discoveryAlbumResponse"
> &
  Pick<ReturnType<typeof useCatalogWorkspace>, "loadDiscoveryData">;

export function useDiscoveryWorkspace({
  activeSection,
  discoverySelection,
  setIsDiscoveryAlbumsLoading,
  setDiscoveryAlbumError,
  discoveryAlbumRequest,
  setDiscoveryAlbumResponse,
  catalogRefreshKey,
  setDiscoveryError,
  discovery,
  setIsDiscoveryLoading,
  setActiveSection,
  discoveryDateRequestRef,
  discoveryChartRequestRef,
  discoveryDeepCutRequestRef,
  discoveryCompletionRequestRef,
  discoveryRecommendationRequestRef,
  setDiscovery,
  discoveryAnniversaryYearsRef,
  setIsDiscoveryAnniversaryLoading,
  setIsDiscoveryChartLoading,
  setIsDiscoveryDeepCutLoading,
  setIsDiscoveryCompletionLoading,
  setIsDiscoveryRecommendationLoading,
  setDiscoverySelection,
  setDiscoveryAlbumRequest,
  setDiscoveryCohort,
  isDiscoveryLoading,
  discoveryAlbumResponse,
  loadDiscoveryData,
}: Inputs) {
  useEffect(() => {
    if (activeSection !== "Discovery" || !discoverySelection) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsDiscoveryAlbumsLoading(true);
      setDiscoveryAlbumError(null);
      void searchLibrary(discoveryAlbumRequest)
        .then((nextResponse) => {
          if (!cancelled) {
            setDiscoveryAlbumResponse(nextResponse);
          }
        })
        .catch((searchError) => {
          if (!cancelled) {
            setDiscoveryAlbumError(
              searchError instanceof Error
                ? searchError.message
                : String(searchError),
            );
            setDiscoveryAlbumResponse(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsDiscoveryAlbumsLoading(false);
          }
        });
    }, 160);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    activeSection,
    catalogRefreshKey,
    discoveryAlbumRequest,
    discoverySelection,
  ]);

  async function refreshDiscovery() {
    setDiscoveryError(null);
    try {
      if (discovery?.dailyEditionArchive.isArchived) {
        await changeDiscoveryEditionDate(discovery.dailyEdition.date);
      } else {
        await loadDiscoveryData(true);
      }
    } catch (error) {
      setDiscoveryError(error instanceof Error ? error.message : String(error));
      setIsDiscoveryLoading(false);
    }
  }

  function openDiscoverySourceAction(action: DiscoverySourceHealthAction) {
    if (action === "open-musicbrainz") {
      sessionStorage.setItem("music-library:settings-section", "musicbrainz");
      setActiveSection("Settings");
      return;
    }
    if (action === "open-lastfm") {
      sessionStorage.setItem("music-library:settings-section", "providers");
      setActiveSection("Settings");
      return;
    }
    setActiveSection("Imports");
  }

  async function changeDiscoveryEditionDate(date: string) {
    const requestId = discoveryDateRequestRef.current + 1;
    discoveryDateRequestRef.current = requestId;
    discoveryChartRequestRef.current += 1;
    discoveryDeepCutRequestRef.current += 1;
    discoveryCompletionRequestRef.current += 1;
    discoveryRecommendationRequestRef.current += 1;
    setIsDiscoveryLoading(true);
    setDiscoveryError(null);
    try {
      const snapshot = await getDiscoveryDailyEdition(date);
      if (discoveryDateRequestRef.current !== requestId) return;
      setDiscovery((current) =>
        current
          ? {
              ...current,
              dailyEdition: snapshot.dailyEdition,
              dailyEditionArchive: snapshot.archive,
            }
          : current,
      );
      if (!snapshot.archive.isArchived) {
        discoveryAnniversaryYearsRef.current =
          snapshot.dailyEdition.anniversaryYears;
      }
    } catch (error) {
      setDiscoveryError(error instanceof Error ? error.message : String(error));
    } finally {
      if (discoveryDateRequestRef.current === requestId) {
        setIsDiscoveryLoading(false);
      }
    }
  }

  async function changeDiscoveryAnniversaryYears(anniversaryYears: number) {
    discoveryAnniversaryYearsRef.current = anniversaryYears;
    setIsDiscoveryAnniversaryLoading(true);
    setDiscoveryError(null);
    try {
      const anniversaries = await getDiscoveryAnniversaries(anniversaryYears);
      if (discoveryAnniversaryYearsRef.current !== anniversaryYears) return;
      setDiscovery((current) =>
        current
          ? {
              ...current,
              dailyEdition: {
                ...current.dailyEdition,
                anniversaryYears,
                anniversaries,
              },
            }
          : current,
      );
    } catch (error) {
      setDiscoveryError(error instanceof Error ? error.message : String(error));
    } finally {
      if (discoveryAnniversaryYearsRef.current === anniversaryYears) {
        setIsDiscoveryAnniversaryLoading(false);
      }
    }
  }

  async function changeDiscoveryChartSnapshot(
    request: DiscoveryChartSnapshotRequest,
  ) {
    const requestId = discoveryChartRequestRef.current + 1;
    discoveryChartRequestRef.current = requestId;
    setIsDiscoveryChartLoading(true);
    setDiscoveryError(null);
    try {
      const chartSnapshot = await getDiscoveryChartSnapshot(request);
      if (discoveryChartRequestRef.current !== requestId) return;
      setDiscovery((current) =>
        current
          ? {
              ...current,
              dailyEdition: {
                ...current.dailyEdition,
                chartSnapshot,
              },
            }
          : current,
      );
    } catch (error) {
      setDiscoveryError(error instanceof Error ? error.message : String(error));
    } finally {
      if (discoveryChartRequestRef.current === requestId) {
        setIsDiscoveryChartLoading(false);
      }
    }
  }

  async function changeDiscoveryDeepCutSnapshot(
    request: DiscoveryDeepCutSnapshotRequest,
  ) {
    const requestId = discoveryDeepCutRequestRef.current + 1;
    discoveryDeepCutRequestRef.current = requestId;
    setIsDiscoveryDeepCutLoading(true);
    setDiscoveryError(null);
    try {
      const deepCutSnapshot = await getDiscoveryDeepCutSnapshot(request);
      if (discoveryDeepCutRequestRef.current !== requestId) return;
      setDiscovery((current) =>
        current
          ? {
              ...current,
              dailyEdition: {
                ...current.dailyEdition,
                deepCutSnapshot,
              },
            }
          : current,
      );
    } catch (error) {
      setDiscoveryError(error instanceof Error ? error.message : String(error));
    } finally {
      if (discoveryDeepCutRequestRef.current === requestId) {
        setIsDiscoveryDeepCutLoading(false);
      }
    }
  }

  async function changeDiscoveryCompletionSnapshot(
    request: DiscoveryCompletionSnapshotRequest,
  ) {
    const requestId = discoveryCompletionRequestRef.current + 1;
    discoveryCompletionRequestRef.current = requestId;
    setIsDiscoveryCompletionLoading(true);
    setDiscoveryError(null);
    try {
      const completionSnapshot = await getDiscoveryCompletionSnapshot(request);
      if (discoveryCompletionRequestRef.current !== requestId) return;
      setDiscovery((current) =>
        current
          ? {
              ...current,
              dailyEdition: {
                ...current.dailyEdition,
                completionSnapshot,
              },
            }
          : current,
      );
    } catch (error) {
      setDiscoveryError(error instanceof Error ? error.message : String(error));
    } finally {
      if (discoveryCompletionRequestRef.current === requestId) {
        setIsDiscoveryCompletionLoading(false);
      }
    }
  }

  async function changeDiscoveryRecommendationSnapshot(
    request: DiscoveryRecommendationSnapshotRequest,
  ) {
    const requestId = discoveryRecommendationRequestRef.current + 1;
    discoveryRecommendationRequestRef.current = requestId;
    setIsDiscoveryRecommendationLoading(true);
    setDiscoveryError(null);
    try {
      const recommendationSnapshot =
        await getDiscoveryRecommendationSnapshot(request);
      if (discoveryRecommendationRequestRef.current !== requestId) return;
      setDiscovery((current) =>
        current
          ? {
              ...current,
              dailyEdition: {
                ...current.dailyEdition,
                recommendationSnapshot,
              },
            }
          : current,
      );
    } catch (error) {
      setDiscoveryError(error instanceof Error ? error.message : String(error));
    } finally {
      if (discoveryRecommendationRequestRef.current === requestId) {
        setIsDiscoveryRecommendationLoading(false);
      }
    }
  }

  function openDiscoveryAlbums(
    selection: DiscoverySelection,
    nextRequest: BrowseRequest,
  ) {
    setDiscoverySelection(selection);
    setDiscoveryAlbumRequest(nextRequest);
    setDiscoveryAlbumResponse(null);
    setDiscoveryAlbumError(null);
  }

  function openDiscoveryMission(mission: DiscoveryMission) {
    setDiscoveryCohort(discoveryMissionCohort(mission));
    openDiscoveryAlbums(
      {
        title: mission.title,
        caption: `${formatNumber(mission.albumCount)} albums / ${mission.actionLabel}`,
      },
      createDiscoveryMissionRequest(mission),
    );
  }

  function openDiscoveryHeatmapCell(cell: DiscoveryHeatmapCell) {
    setDiscoveryCohort(discoveryHeatmapCohort(cell));
    openDiscoveryAlbums(
      {
        title: `${cell.genre} / ${cell.year}`,
        caption: `${formatNumber(cell.albumCount)} albums, ${formatPercent(cell.averageRatingCompleteness)} complete`,
      },
      createDiscoveryHeatmapRequest(cell),
    );
  }

  function openDiscoveryAlbumPoint(point: DiscoveryAlbumPoint) {
    setDiscoveryCohort(discoveryAlbumCohort(point));
    openDiscoveryAlbums(
      {
        title: point.album ?? "Untitled album",
        caption: [point.albumArtistDisplay, point.year, point.genre]
          .filter(Boolean)
          .join(" / "),
      },
      createDiscoveryAlbumPointRequest(point),
    );
  }

  function openDiscoveryGenre(point: DiscoveryGenrePoint) {
    setDiscoveryCohort(discoveryGenreCohort(point));
    openDiscoveryAlbums(
      {
        title: point.genre,
        caption: `${formatNumber(point.albumCount)} albums / ${formatPercent(point.averageRatingCompleteness)} complete`,
      },
      createDiscoveryGenreRequest(point),
    );
  }

  function openDiscoveryArtist(point: DiscoveryArtistPoint) {
    setDiscoveryCohort(discoveryArtistCohort(point));
    openDiscoveryAlbums(
      {
        title: point.artist,
        caption: [formatNumber(point.albumCount), "albums", point.topGenre]
          .filter(Boolean)
          .join(" / "),
      },
      createDiscoveryArtistRequest(point),
    );
  }

  function sortDiscoveryAlbumsBy(field: string) {
    setDiscoveryAlbumRequest((previous) => ({
      ...previous,
      sort: nextSort(previous.sort, field),
      offset: 0,
    }));
  }

  const discoveryMissionTotal =
    (discovery?.backlogMissions.length ?? 0) +
    (discovery?.smartMissions.length ?? 0);

  const discoveryMetricValue = (value: number | null | undefined) =>
    isDiscoveryLoading && !discovery ? "Loading" : formatNumber(value);

  const discoveryHeatmapEmptyLabel = isDiscoveryLoading
    ? "Loading heatmap cells."
    : "No heatmap cells yet.";

  const discoveryBacklogEmptyLabel = isDiscoveryLoading
    ? "Loading backlog missions."
    : "No backlog missions yet.";

  const discoverySmartMissionEmptyLabel = isDiscoveryLoading
    ? "Loading smart missions."
    : "No smart missions yet.";

  const discoveryOutlierEmptyLabel = isDiscoveryLoading
    ? "Loading loved/rating outliers."
    : "No loved/rating outliers yet.";

  const discoveryGenreEmptyLabel = isDiscoveryLoading
    ? "Loading genre universe."
    : "No genre universe yet.";

  const discoveryArtistEmptyLabel = isDiscoveryLoading
    ? "Loading artist constellation."
    : "No artist constellation yet.";

  const discoveryAlbumTotal = discoveryAlbumResponse?.total ?? 0;

  const discoveryAlbumPageStart =
    discoveryAlbumTotal === 0 ? 0 : discoveryAlbumRequest.offset + 1;

  const discoveryAlbumPageEnd = Math.min(
    discoveryAlbumTotal,
    discoveryAlbumRequest.offset + discoveryAlbumRequest.limit,
  );
  return {
    refreshDiscovery,
    openDiscoverySourceAction,
    changeDiscoveryEditionDate,
    changeDiscoveryAnniversaryYears,
    changeDiscoveryChartSnapshot,
    changeDiscoveryDeepCutSnapshot,
    changeDiscoveryCompletionSnapshot,
    changeDiscoveryRecommendationSnapshot,
    openDiscoveryAlbums,
    openDiscoveryMission,
    openDiscoveryHeatmapCell,
    openDiscoveryAlbumPoint,
    openDiscoveryGenre,
    openDiscoveryArtist,
    sortDiscoveryAlbumsBy,
    discoveryMissionTotal,
    discoveryMetricValue,
    discoveryHeatmapEmptyLabel,
    discoveryBacklogEmptyLabel,
    discoverySmartMissionEmptyLabel,
    discoveryOutlierEmptyLabel,
    discoveryGenreEmptyLabel,
    discoveryArtistEmptyLabel,
    discoveryAlbumTotal,
    discoveryAlbumPageStart,
    discoveryAlbumPageEnd,
  };
}
