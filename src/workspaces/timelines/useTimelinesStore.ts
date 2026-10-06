import {
  type AlbumDebutTimelineResponse,
  type TrackDebutTimelineResponse,
  type TimelineChartSource,
} from "../../types";
import { type TimelineMode } from "../../components/AlbumTimeRibbon";
import { type TimelinesView } from "../../components/TimelinesWorkspace";
import { useMemo } from "react";
import {
  createWorkspaceContext,
  createWorkspaceSetters,
  workspaceReducer,
} from "../../app/workspaceStore";
import { useReducer } from "react";
type TimelinesState = {
  albumTimelineResponse: AlbumDebutTimelineResponse | null;
  trackTimelineResponse: TrackDebutTimelineResponse | null;
  timelineMode: TimelineMode;
  timelinesView: TimelinesView;
  timelineChartSource: TimelineChartSource;
  albumTimelineYear: number | null;
  trackTimelineYear: number | null;
  albumTimelineError: string | null;
  isAlbumTimelineLoading: boolean;
  albumTimelineRefreshKey: number;
};

function createInitialState(): TimelinesState {
  const albumTimelineResponse: AlbumDebutTimelineResponse | null = null;
  const trackTimelineResponse: TrackDebutTimelineResponse | null = null;
  const timelineMode: TimelineMode = "albums";
  const timelinesView: TimelinesView = "charts";
  const timelineChartSource: TimelineChartSource = "billboard";
  const albumTimelineYear: number | null = null;
  const trackTimelineYear: number | null = null;
  const albumTimelineError: string | null = null;
  const isAlbumTimelineLoading: boolean = false;
  const albumTimelineRefreshKey: number = 0;
  return {
    albumTimelineResponse,
    trackTimelineResponse,
    timelineMode,
    timelinesView,
    timelineChartSource,
    albumTimelineYear,
    trackTimelineYear,
    albumTimelineError,
    isAlbumTimelineLoading,
    albumTimelineRefreshKey,
  };
}

function useTimelinesStoreValue() {
  const [state, dispatch] = useReducer(
    workspaceReducer<TimelinesState>,
    undefined,
    createInitialState,
  );
  const {
    albumTimelineResponse,
    trackTimelineResponse,
    timelineMode,
    timelinesView,
    timelineChartSource,
    albumTimelineYear,
    trackTimelineYear,
    albumTimelineError,
    isAlbumTimelineLoading,
    albumTimelineRefreshKey,
  } = state;
  const setters = useMemo(
    () =>
      createWorkspaceSetters<TimelinesState>(dispatch, [
        "albumTimelineResponse",
        "trackTimelineResponse",
        "timelineMode",
        "timelinesView",
        "timelineChartSource",
        "albumTimelineYear",
        "trackTimelineYear",
        "albumTimelineError",
        "isAlbumTimelineLoading",
        "albumTimelineRefreshKey",
      ]),
    [dispatch],
  );
  const {
    setAlbumTimelineResponse,
    setTrackTimelineResponse,
    setTimelineMode,
    setTimelinesView,
    setTimelineChartSource,
    setAlbumTimelineYear,
    setTrackTimelineYear,
    setAlbumTimelineError,
    setIsAlbumTimelineLoading,
    setAlbumTimelineRefreshKey,
  } = setters;

  return {
    albumTimelineResponse,
    setAlbumTimelineResponse,
    trackTimelineResponse,
    setTrackTimelineResponse,
    timelineMode,
    setTimelineMode,
    timelinesView,
    setTimelinesView,
    timelineChartSource,
    setTimelineChartSource,
    albumTimelineYear,
    setAlbumTimelineYear,
    trackTimelineYear,
    setTrackTimelineYear,
    albumTimelineError,
    setAlbumTimelineError,
    isAlbumTimelineLoading,
    setIsAlbumTimelineLoading,
    albumTimelineRefreshKey,
    setAlbumTimelineRefreshKey,
  };
}

export const { Provider: TimelinesStoreProvider, useStore: useTimelinesStore } =
  createWorkspaceContext(useTimelinesStoreValue, "timelines");
