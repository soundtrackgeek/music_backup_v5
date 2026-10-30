import {
  useEffect,
  useMemo,
  useRef
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
  getArtistChart,
  exportArtistChart,
  searchLibrary,
  saveChart,
  deleteSavedChart,
  exportSearch
} from "../../backend";
import {
  type ChartConfig,
  type BrowseFilters,
  type BrowseSort,
  type BrowseView,
  type ArtistChartRequest,
  type SavedChart
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
import { artistChartMetricLabel, createArtistChartRequest } from "../../app/artistChart";
import type { WorkspaceStores } from "../../app/WorkspaceStoresProvider";

type Inputs = Pick<WorkspaceStores, "chartConfig" | "activeSection" | "setIsChartLoading" | "setChartError" | "setChartResponse" | "catalogRefreshKey" | "setChartConfig" | "setChartExportResult" | "setChartTableSort" | "chartName" | "setSavedCharts" | "setChartName" | "chartResponse" | "artistChartActive" | "setArtistChartActive" | "artistChartRequest" | "setArtistChartRequest" | "setArtistChartResponse" | "setArtistChartError" | "setIsArtistChartLoading">;

export function useChartsWorkspace({ chartConfig, activeSection, setIsChartLoading, setChartError, setChartResponse, catalogRefreshKey, setChartConfig, setChartExportResult, setChartTableSort, chartName, setSavedCharts, setChartName, chartResponse, artistChartActive, setArtistChartActive, artistChartRequest, setArtistChartRequest, setArtistChartResponse, setArtistChartError, setIsArtistChartLoading }: Inputs) {
  const chartRequest = useMemo(
    () => chartRequestFromConfig(chartConfig),
    [chartConfig],
  );

  useEffect(() => {
    if (activeSection !== "Charts" || artistChartActive) {
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
  }, [activeSection, catalogRefreshKey, chartRequest, artistChartActive]);

  const artistChartQueue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    if (activeSection !== "Charts" || !artistChartActive) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      // Run one artist chart query at a time. A running query cannot be cancelled in
      // the backend, so toggling several chart sources quickly would otherwise occupy
      // every catalog reader at once; superseded requests are skipped before starting.
      artistChartQueue.current = artistChartQueue.current.then(() => {
        if (cancelled) {
          return;
        }
        setIsArtistChartLoading(true);
        setArtistChartError(null);
        return getArtistChart(artistChartRequest)
        .then((nextResponse) => {
          if (!cancelled) {
            setArtistChartResponse(nextResponse);
          }
        })
        .catch((chartError) => {
          if (!cancelled) {
            setArtistChartError(
              chartError instanceof Error
                ? chartError.message
                : String(chartError),
            );
            setArtistChartResponse(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsArtistChartLoading(false);
          }
        });
      });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeSection, catalogRefreshKey, artistChartRequest, artistChartActive]);

  function updateArtistChartRequest(values: Partial<ArtistChartRequest>) {
    setArtistChartRequest((previous) => ({ ...previous, ...values, offset: 0 }));
    setChartExportResult(null);
  }

  function updateArtistChartFilters(values: Partial<BrowseFilters>) {
    setArtistChartRequest((previous) => ({
      ...previous,
      filters: { ...previous.filters, ...values },
      offset: 0,
    }));
    setChartExportResult(null);
  }

  function resetArtistChart() {
    setArtistChartRequest(createArtistChartRequest());
  }

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
    // The Artists tab keeps its settings in its own request, so store that request too.
    // Loading the chart later uses it to reopen the Artists tab instead of Albums.
    const nextConfig = {
      ...normalizeChartConfigForClient(chartConfig),
      sortField: chartConfig.sortField ?? chartConfig.rankingMetric,
      gridCoverSize: normalizeChartGridCoverSize(chartConfig.gridCoverSize),
      request: chartRequest,
      artistChart: artistChartActive ? { ...artistChartRequest, offset: 0 } : null,
    };
    const fallbackName = artistChartActive
      ? `Artists: ${artistChartMetricLabel(artistChartRequest.metric)}`
      : `${rankingLabel(nextConfig.rankingMetric)} chart`;
    const saved = await saveChart(chartName.trim() || fallbackName, nextConfig);
    setSavedCharts((previous) => [
      saved,
      ...previous.filter((chart) => chart.id !== saved.id),
    ]);
    setChartName("");
  }

  /** Load a saved chart and switch to the tab it was saved from (Albums, Tracks or Artists). */
  function openSavedChart(chart: SavedChart) {
    const config = normalizeChartConfigForClient(chart.config);
    if (config.artistChart) {
      const defaults = createArtistChartRequest();
      setArtistChartRequest({
        ...defaults,
        ...config.artistChart,
        filters: { ...defaults.filters, ...config.artistChart.filters },
        offset: 0,
      });
      setArtistChartActive(true);
    } else {
      // Albums and Tracks share chartConfig; its request.view picks the tab.
      setArtistChartActive(false);
      setChartConfig(config);
      setChartTableSort(null);
    }
    setChartExportResult(null);
  }

  async function removeSavedChart(id: number) {
    await deleteSavedChart(id);
    setSavedCharts((previous) => previous.filter((chart) => chart.id !== id));
  }

  async function runChartExport(format: string) {
    // The Artists tab has its own request and result shape, so it needs its own export.
    const result = artistChartActive
      ? await exportArtistChart(artistChartRequest, format)
      : await exportSearch(
          chartRequest,
          format,
          chartConfig.exportColumns.includes("calculated"),
          chartConfig.exportColumns,
        );
    setChartExportResult(result);
  }

  function setChartBrowseView(view: BrowseView) {
    setArtistChartActive(false);
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
  return { updateArtistChartRequest, updateArtistChartFilters, resetArtistChart, chartRequest, updateChartConfig, updateChartFilters, sortChartBy, toggleChartColumn, applyChartTemplate, saveCurrentChart, openSavedChart, removeSavedChart, runChartExport, setChartBrowseView, chartTotal, chartRows, currentChartGridCoverSize, currentChartCompletenessRange, advancedChartControlCount, chartSourceFilterCount };
}
