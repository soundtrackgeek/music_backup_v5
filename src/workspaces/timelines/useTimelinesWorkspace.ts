import { useEffect } from "react";
import { getTrackDebutTimeline, getAlbumDebutTimeline } from "../../backend";
import {
  type TrackDebutTimelineResponse,
  type AlbumDebutTimelineResponse,
} from "../../types";
import type { WorkspaceStores } from "../../app/WorkspaceStoresProvider";

type Inputs = Pick<
  WorkspaceStores,
  | "activeSection"
  | "timelinesView"
  | "setIsAlbumTimelineLoading"
  | "setAlbumTimelineError"
  | "timelineMode"
  | "trackTimelineYear"
  | "timelineChartSource"
  | "albumTimelineYear"
  | "setTrackTimelineResponse"
  | "setAlbumTimelineResponse"
  | "albumTimelineRefreshKey"
  | "catalogRefreshKey"
>;

export function useTimelinesWorkspace({
  activeSection,
  timelinesView,
  setIsAlbumTimelineLoading,
  setAlbumTimelineError,
  timelineMode,
  trackTimelineYear,
  timelineChartSource,
  albumTimelineYear,
  setTrackTimelineResponse,
  setAlbumTimelineResponse,
  albumTimelineRefreshKey,
  catalogRefreshKey,
}: Inputs) {
  useEffect(() => {
    if (activeSection !== "Timelines" || timelinesView !== "charts") {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsAlbumTimelineLoading(true);
      setAlbumTimelineError(null);
      const timelineRequest =
        timelineMode === "tracks"
          ? getTrackDebutTimeline(trackTimelineYear, timelineChartSource)
          : getAlbumDebutTimeline(albumTimelineYear, timelineChartSource);
      void timelineRequest
        .then((nextResponse) => {
          if (!cancelled) {
            if (timelineMode === "tracks") {
              setTrackTimelineResponse(
                nextResponse as TrackDebutTimelineResponse,
              );
            } else {
              setAlbumTimelineResponse(
                nextResponse as AlbumDebutTimelineResponse,
              );
            }
          }
        })
        .catch((timelineError) => {
          if (!cancelled) {
            setAlbumTimelineError(
              timelineError instanceof Error
                ? timelineError.message
                : String(timelineError),
            );
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsAlbumTimelineLoading(false);
          }
        });
    }, 80);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    activeSection,
    timelinesView,
    albumTimelineYear,
    trackTimelineYear,
    timelineMode,
    timelineChartSource,
    albumTimelineRefreshKey,
    catalogRefreshKey,
  ]);
  return {};
}
