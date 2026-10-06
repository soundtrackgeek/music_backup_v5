import {
  type SavedChart,
  type ChartConfig,
  type BrowseSort,
  type BrowseResponse,
  type ExportResult
} from "../../types";
import {
  createChartConfig
} from "../../app/requests";
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
  return { savedCharts, chartConfig, chartTableSort, chartResponse, chartName, chartError, isChartLoading, chartExportResult };
}

function useChartsStoreValue() {
  const [state, dispatch] = useReducer(workspaceReducer<ChartsState>, undefined, createInitialState);
  const { savedCharts, chartConfig, chartTableSort, chartResponse, chartName, chartError, isChartLoading, chartExportResult } = state;
  const setters = useMemo(() => createWorkspaceSetters<ChartsState>(dispatch, ["savedCharts", "chartConfig", "chartTableSort", "chartResponse", "chartName", "chartError", "isChartLoading", "chartExportResult"]), [dispatch]);
  const { setSavedCharts, setChartConfig, setChartTableSort, setChartResponse, setChartName, setChartError, setIsChartLoading, setChartExportResult } = setters;

  return { savedCharts, setSavedCharts, chartConfig, setChartConfig, chartTableSort, setChartTableSort, chartResponse, setChartResponse, chartName, setChartName, chartError, setChartError, isChartLoading, setIsChartLoading, chartExportResult, setChartExportResult };
}

export const { Provider: ChartsStoreProvider, useStore: useChartsStore } = createWorkspaceContext(useChartsStoreValue, "charts");
