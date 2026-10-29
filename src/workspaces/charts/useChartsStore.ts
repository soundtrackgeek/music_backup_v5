import {
  type SavedChart,
  type ChartConfig,
  type BrowseSort,
  type BrowseResponse,
  type ExportResult,
  type ArtistChartRequest,
  type ArtistChartResponse
} from "../../types";
import {
  createChartConfig
} from "../../app/requests";
import { createArtistChartRequest } from "../../app/artistChart";
import {
  useMemo
} from "react";
import { createWorkspaceContext, createWorkspaceSetters, workspaceReducer } from "../../app/workspaceStore";
import { useReducer } from "react";
type ChartsState = {
  savedCharts: SavedChart[];
  chartConfig: ChartConfig;
  chartTableSort: BrowseSort | null;
  chartResponse: BrowseResponse | null;
  chartName: string;
  chartError: string | null;
  isChartLoading: boolean;
  chartExportResult: ExportResult | null;
  artistChartActive: boolean;
  artistChartRequest: ArtistChartRequest;
  artistChartResponse: ArtistChartResponse | null;
  artistChartError: string | null;
  isArtistChartLoading: boolean;
};

function createInitialState(): ChartsState {
  const savedCharts: SavedChart[] = [];
  const chartConfig: ChartConfig = (() =>
    createChartConfig())();
  const chartTableSort: BrowseSort | null = null;
  const chartResponse: BrowseResponse | null = null;
  const chartName: string = "";
  const chartError: string | null = null;
  const isChartLoading: boolean = false;
  const chartExportResult: ExportResult | null = null;
  const artistChartActive: boolean = false;
  const artistChartRequest: ArtistChartRequest = createArtistChartRequest();
  const artistChartResponse: ArtistChartResponse | null = null;
  const artistChartError: string | null = null;
  const isArtistChartLoading: boolean = false;
  return { savedCharts, chartConfig, chartTableSort, chartResponse, chartName, chartError, isChartLoading, chartExportResult, artistChartActive, artistChartRequest, artistChartResponse, artistChartError, isArtistChartLoading };
}

function useChartsStoreValue() {
  const [state, dispatch] = useReducer(workspaceReducer<ChartsState>, undefined, createInitialState);
  const { savedCharts, chartConfig, chartTableSort, chartResponse, chartName, chartError, isChartLoading, chartExportResult, artistChartActive, artistChartRequest, artistChartResponse, artistChartError, isArtistChartLoading } = state;
  const setters = useMemo(() => createWorkspaceSetters<ChartsState>(dispatch, ["savedCharts", "chartConfig", "chartTableSort", "chartResponse", "chartName", "chartError", "isChartLoading", "chartExportResult", "artistChartActive", "artistChartRequest", "artistChartResponse", "artistChartError", "isArtistChartLoading"]), [dispatch]);
  const { setSavedCharts, setChartConfig, setChartTableSort, setChartResponse, setChartName, setChartError, setIsChartLoading, setChartExportResult, setArtistChartActive, setArtistChartRequest, setArtistChartResponse, setArtistChartError, setIsArtistChartLoading } = setters;

  return { savedCharts, setSavedCharts, chartConfig, setChartConfig, chartTableSort, setChartTableSort, chartResponse, setChartResponse, chartName, setChartName, chartError, setChartError, isChartLoading, setIsChartLoading, chartExportResult, setChartExportResult, artistChartActive, setArtistChartActive, artistChartRequest, setArtistChartRequest, artistChartResponse, setArtistChartResponse, artistChartError, setArtistChartError, isArtistChartLoading, setIsArtistChartLoading };
}

export const { Provider: ChartsStoreProvider, useStore: useChartsStore } = createWorkspaceContext(useChartsStoreValue, "charts");
