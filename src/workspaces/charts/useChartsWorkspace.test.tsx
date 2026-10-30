import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createArtistChartRequest } from "../../app/artistChart";
import { createChartConfig } from "../../app/requests";
import type { ChartConfig, SavedChart } from "../../types";
import { useChartsWorkspace } from "./useChartsWorkspace";

const backend = vi.hoisted(() => ({
  exportArtistChart: vi.fn(),
  exportSearch: vi.fn(),
  getArtistChart: vi.fn(),
  searchLibrary: vi.fn(),
  saveChart: vi.fn(),
  deleteSavedChart: vi.fn(),
}));

vi.mock("../../backend", () => backend);

const exported = { path: "x", format: "csv", rowCount: 1, pathCopied: false };

function renderWorkspace(artistChartActive: boolean) {
  const setChartExportResult = vi.fn();
  const setters = {
    setArtistChartActive: vi.fn(),
    setArtistChartRequest: vi.fn(),
    setChartConfig: vi.fn(),
    setChartTableSort: vi.fn(),
    setSavedCharts: vi.fn(),
    setChartName: vi.fn(),
  };
  const artistChartRequest = { ...createArtistChartRequest(), metric: "averageAlbumScore", offset: 100 };
  const chartConfig = createChartConfig("albums");
  const hook = renderHook(() =>
    useChartsWorkspace({
      chartConfig,
      activeSection: "Albums",
      artistChartActive,
      artistChartRequest,
      setChartExportResult,
      chartResponse: null,
      chartName: "",
      ...setters,
    } as unknown as Parameters<typeof useChartsWorkspace>[0]),
  );
  return { hook, setChartExportResult, artistChartRequest, setters };
}

describe("useChartsWorkspace export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    backend.exportArtistChart.mockResolvedValue(exported);
    backend.exportSearch.mockResolvedValue(exported);
  });

  it("exports the artist ranking while the Artists tab is active", async () => {
    const { hook, setChartExportResult, artistChartRequest } = renderWorkspace(true);

    await act(() => hook.result.current.runChartExport("xlsx"));

    expect(backend.exportArtistChart).toHaveBeenCalledWith(artistChartRequest, "xlsx");
    expect(backend.exportSearch).not.toHaveBeenCalled();
    expect(setChartExportResult).toHaveBeenCalledWith(exported);
  });

  it("keeps exporting the album and track chart on the other tabs", async () => {
    const { hook } = renderWorkspace(false);

    await act(() => hook.result.current.runChartExport("csv"));

    expect(backend.exportSearch).toHaveBeenCalledTimes(1);
    expect(backend.exportArtistChart).not.toHaveBeenCalled();
  });
});

function savedChart(config: ChartConfig): SavedChart {
  return { id: 1, name: "Saved", config, createdAt: "", updatedAt: "" };
}

describe("useChartsWorkspace saved charts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    backend.saveChart.mockImplementation((name: string, config: ChartConfig) =>
      Promise.resolve(savedChart(config)),
    );
  });

  it("stores the artist request when saving from the Artists tab", async () => {
    const { hook, artistChartRequest } = renderWorkspace(true);

    await act(() => hook.result.current.saveCurrentChart());

    const [name, config] = backend.saveChart.mock.calls[0];
    expect(name).toBe("Artists: Highest average album score");
    expect(config.artistChart).toEqual({ ...artistChartRequest, offset: 0 });
  });

  it("stores no artist request when saving an album chart", async () => {
    const { hook } = renderWorkspace(false);

    await act(() => hook.result.current.saveCurrentChart());

    expect(backend.saveChart.mock.calls[0][1].artistChart).toBeNull();
  });

  it("opens an artist chart on the Artists tab", () => {
    const { hook, setters } = renderWorkspace(false);
    const artistChart = { ...createArtistChartRequest(), metric: "chartedAlbums" };

    act(() =>
      hook.result.current.openSavedChart(
        savedChart({ ...createChartConfig("albums"), artistChart }),
      ),
    );

    expect(setters.setArtistChartActive).toHaveBeenCalledWith(true);
    expect(setters.setArtistChartRequest).toHaveBeenCalledWith({ ...artistChart, offset: 0 });
    expect(setters.setChartConfig).not.toHaveBeenCalled();
  });

  it("leaves the Artists tab when opening a track chart", () => {
    const { hook, setters } = renderWorkspace(true);

    act(() => hook.result.current.openSavedChart(savedChart(createChartConfig("tracks"))));

    expect(setters.setArtistChartActive).toHaveBeenCalledWith(false);
    const config = setters.setChartConfig.mock.calls[0][0] as ChartConfig;
    expect(config.request.view).toBe("tracks");
    expect(setters.setArtistChartRequest).not.toHaveBeenCalled();
  });
});
