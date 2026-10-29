import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createArtistChartRequest } from "../../app/artistChart";
import { createChartConfig } from "../../app/requests";
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
  const artistChartRequest = createArtistChartRequest();
  const chartConfig = createChartConfig("albums");
  const hook = renderHook(() =>
    useChartsWorkspace({
      chartConfig,
      activeSection: "Albums",
      artistChartActive,
      artistChartRequest,
      setChartExportResult,
      chartResponse: null,
    } as unknown as Parameters<typeof useChartsWorkspace>[0]),
  );
  return { hook, setChartExportResult, artistChartRequest };
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
