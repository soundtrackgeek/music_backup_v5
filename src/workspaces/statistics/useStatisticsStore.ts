import { type YearLedgerSelection } from "./ProgressExplorers";
import { type InsightCohort } from "../../app/insightCohorts";
import { type StatisticsResponse } from "../../types";
import { useMemo } from "react";
import {
  createWorkspaceContext,
  createWorkspaceSetters,
  workspaceReducer,
} from "../../app/workspaceStore";
import { useReducer } from "react";
type StatisticsState = {
  yearLedgerSelection: YearLedgerSelection;
  statisticsView: "overview" | "rating";
  statisticsCohort: InsightCohort | null;
  statistics: StatisticsResponse | null;
  statsError: string | null;
  isStatsLoading: boolean;
};

function createInitialState(): StatisticsState {
  const yearLedgerSelection: YearLedgerSelection = {
    yearFrom: null,
    yearTo: null,
    includedGenres: [],
    excludedGenres: [],
    selectedYear: null,
  };
  const statisticsView: "overview" | "rating" = "overview";
  const statisticsCohort: InsightCohort | null = null;
  const statistics: StatisticsResponse | null = null;
  const statsError: string | null = null;
  const isStatsLoading: boolean = false;
  return {
    yearLedgerSelection,
    statisticsView,
    statisticsCohort,
    statistics,
    statsError,
    isStatsLoading,
  };
}

function useStatisticsStoreValue() {
  const [state, dispatch] = useReducer(
    workspaceReducer<StatisticsState>,
    undefined,
    createInitialState,
  );
  const {
    yearLedgerSelection,
    statisticsView,
    statisticsCohort,
    statistics,
    statsError,
    isStatsLoading,
  } = state;
  const setters = useMemo(
    () =>
      createWorkspaceSetters<StatisticsState>(dispatch, [
        "yearLedgerSelection",
        "statisticsView",
        "statisticsCohort",
        "statistics",
        "statsError",
        "isStatsLoading",
      ]),
    [dispatch],
  );
  const {
    setYearLedgerSelection,
    setStatisticsView,
    setStatisticsCohort,
    setStatistics,
    setStatsError,
    setIsStatsLoading,
  } = setters;

  return {
    yearLedgerSelection,
    setYearLedgerSelection,
    statisticsView,
    setStatisticsView,
    statisticsCohort,
    setStatisticsCohort,
    statistics,
    setStatistics,
    statsError,
    setStatsError,
    isStatsLoading,
    setIsStatsLoading,
  };
}

export const {
  Provider: StatisticsStoreProvider,
  useStore: useStatisticsStore,
} = createWorkspaceContext(useStatisticsStoreValue, "statistics");
