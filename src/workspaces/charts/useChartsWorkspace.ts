import {
  useMemo,
  useEffect
} from "react";
import {
  chartRequestFromConfig,
  normalizeChartGridCoverSize,
  defaultSort,
  nextSort,
  normalizeChartConfigForClient,
  createChartConfig,
  chartCompletenessRange
} from "../../app/requests";
import {
  searchLibrary,
  saveChart,
  deleteSavedChart,
  exportSearch
} from "../../backend";
import {
  type ChartConfig,
  type BrowseFilters,
  type BrowseSort,
  type BrowseView
} from "../../types";
import {
  type ChartTemplate
} from "../../app/chartTemplates";
import {
  rankingLabel
} from "../../app/display";
import {
  countAdvancedChartControls,
  countChartSourceFilters
} from "../../app/chartProgressive";
import type { WorkspaceStores } from "../../app/WorkspaceStoresProvider";

type Inputs = Pick<WorkspaceStores, "chartConfig" | "activeSection" | "setIsChartLoading" | "setChartError" | "setChartResponse" | "catalogRefreshKey" | "setChartConfig" | "setChartExportResult" | "setChartTableSort" | "chartName" | "setSavedCharts" | "setChartName" | "chartResponse">;

export function useChartsWorkspace({ chartConfig, activeSection, setIsChartLoading, setChartError, setChartResponse, catalogRefreshKey, setChartConfig, setChartExportResult, setChartTableSort, chartName, setSavedCharts, setChartName, chartResponse }: Inputs) {
  const chartRequest = useMemo(
    () => chartRequestFromConfig(chartConfig),
    [chartConfig],
  );

  useEffect(() => {
    if (activeSection !== "Charts") {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsChartLoading(true);
      setChartError(null);
      void searchLibrary(chartRequest)
        .then((nextResponse) => {
          if (!cancelled) {
            setChartResponse(nextResponse);
          }
        })
        .catch((searchError) => {
          if (!cancelled) {
            setChartError(
              searchError instanceof Error
                ? searchError.message
                : String(searchError),
            );
            setChartResponse(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsChartLoading(false);
          }
        });
    }, 160);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeSection, catalogRefreshKey, chartRequest]);

  function updateChartConfig(values: Partial<ChartConfig>) {
    setChartConfig((previous) => {
      const nextConfig = {
        ...previous,
        ...values,
        sortField:
          values.sortField ??
          (values.rankingMetric ? values.rankingMetric : previous.sortField),
        request: values.request ?? previous.request,
      };
      if (values.gridCoverSize != null) {
        nextConfig.gridCoverSize = normalizeChartGridCoverSize(
          values.gridCoverSize,
        );
      }
      return nextConfig;
    });
    setChartExportResult(null);
  }

  function updateChartFilters(values: Partial<BrowseFilters>) {
    setChartConfig((previous) => ({
      ...previous,
      request: {
        ...previous.request,
        filters: {
          ...previous.request.filters,
          ...values,
        },
        offset: 0,
      },
    }));
    setChartExportResult(null);
  }

  function sortChartBy(field: string) {
    const defaultSort: BrowseSort = {
      field: chartConfig.rankingMetric,
      direction: chartConfig.sortDirection,
    };
    setChartTableSort((previous) => nextSort(previous ?? defaultSort, field));
  }

  function toggleChartColumn(
    value: string,
    key: "visibleColumns" | "exportColumns",
  ) {
    setChartConfig((previous) => {
      const current = previous[key];
      const nextValues = current.includes(value)
        ? current.filter((column) => column !== value)
        : [...current, value];
      return { ...previous, [key]: nextValues };
    });
    setChartExportResult(null);
  }

  function applyChartTemplate(template: ChartTemplate) {
    setChartConfig(template.createConfig());
    setChartTableSort(null);
    setChartExportResult(null);
  }

  async function saveCurrentChart() {
    const nextConfig = {
      ...normalizeChartConfigForClient(chartConfig),
      sortField: chartConfig.sortField ?? chartConfig.rankingMetric,
      gridCoverSize: normalizeChartGridCoverSize(chartConfig.gridCoverSize),
      request: chartRequest,
    };
    const fallbackName = `${rankingLabel(nextConfig.rankingMetric)} chart`;
    const saved = await saveChart(chartName.trim() || fallbackName, nextConfig);
    setSavedCharts((previous) => [
      saved,
      ...previous.filter((chart) => chart.id !== saved.id),
    ]);
    setChartName("");
  }

  async function removeSavedChart(id: number) {
    await deleteSavedChart(id);
    setSavedCharts((previous) => previous.filter((chart) => chart.id !== id));
  }

  async function runChartExport(format: string) {
    const result = await exportSearch(
      chartRequest,
      format,
      chartConfig.exportColumns.includes("calculated"),
      chartConfig.exportColumns,
    );
    setChartExportResult(result);
  }

  function setChartBrowseView(view: BrowseView) {
    setChartConfig((previous) => ({
      ...createChartConfig(view),
      viewMode: previous.viewMode,
      gridCoverSize: previous.gridCoverSize,
      resultLimit: previous.resultLimit,
    }));
    setChartTableSort(null);
    setChartExportResult(null);
  }

  const chartTotal = chartResponse?.total ?? 0;

  const chartRows = chartResponse?.rows.length ?? 0;

  const currentChartGridCoverSize = normalizeChartGridCoverSize(
    chartConfig.gridCoverSize,
  );

  const currentChartCompletenessRange = chartCompletenessRange(chartConfig);

  const advancedChartControlCount =
    countAdvancedChartControls(chartConfig);

  const chartSourceFilterCount = countChartSourceFilters(chartConfig);
  return { chartRequest, updateChartConfig, updateChartFilters, sortChartBy, toggleChartColumn, applyChartTemplate, saveCurrentChart, removeSavedChart, runChartExport, setChartBrowseView, chartTotal, chartRows, currentChartGridCoverSize, currentChartCompletenessRange, advancedChartControlCount, chartSourceFilterCount };
}
