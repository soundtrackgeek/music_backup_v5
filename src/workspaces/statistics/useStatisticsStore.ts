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
import { localDate, type ReviewPeriod } from "./reviewPeriods";
import { emptyRatedAlbumFilters, type RatedAlbumFilters } from "./ratedAlbumFilters";
type StatisticsState = {
  yearLedgerSelection: YearLedgerSelection;
  statisticsView: "overview" | "rating" | "listening" | "review" | "ratedAlbums";
  ratedAlbumFilters: RatedAlbumFilters;
  reviewPeriod: ReviewPeriod;
  reviewAnchor: string;
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
  const statisticsView: StatisticsState["statisticsView"] =
    "overview";
  const statisticsCohort: InsightCohort | null = null;
  const statistics: StatisticsResponse | null = null;
  const statsError: string | null = null;
  const isStatsLoading: boolean = false;
  return {
    yearLedgerSelection,
    statisticsView,
    ratedAlbumFilters: { ...emptyRatedAlbumFilters },
    reviewPeriod: "year",
    reviewAnchor: localDate(new Date()),
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
    reviewPeriod,
    ratedAlbumFilters,
    reviewAnchor,
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
        "ratedAlbumFilters",
        "reviewPeriod",
        "reviewAnchor",
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
    setRatedAlbumFilters,
    setReviewPeriod,
    setReviewAnchor,
    setStatisticsCohort,
    setStatistics,
    setStatsError,
    setIsStatsLoading,
  } = setters;

  return {
    yearLedgerSelection,
    setYearLedgerSelection,
    statisticsView,
    ratedAlbumFilters,
    setRatedAlbumFilters,
    reviewPeriod,
    setReviewPeriod,
    reviewAnchor,
    setReviewAnchor,
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
