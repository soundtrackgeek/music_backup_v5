import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createArtistChartRequest } from "../../app/artistChart";
import { rankingLabel } from "../../app/display";
import { createChartConfig } from "../../app/requests";
import type { SavedChart } from "../../types";
import { ChartsDetails } from "./ChartsDetails";

function renderDetails(
  runChartExport: (format: string) => Promise<void> = () => Promise.resolve(),
  savedCharts: SavedChart[] = [],
) {
  const model = {
    chartName: "",
    setChartName: vi.fn(),
    saveCurrentChart: vi.fn(),
    savedCharts,
    openSavedChart: vi.fn(),
    setActiveSection: vi.fn(),
    removeSavedChart: vi.fn(),
    runChartExport,
    chartExportResult: null,
  };
  render(<ChartsDetails model={model as unknown as Parameters<typeof ChartsDetails>[0]["model"]} />);
  return model;
}

describe("ChartsDetails export", () => {
  it("shows progress and locks the buttons while an export runs", async () => {
    let finish: () => void = () => undefined;
    renderDetails(() => new Promise<void>((resolve) => (finish = resolve)));

    fireEvent.click(screen.getByRole("button", { name: "XLSX" }));

    expect(await screen.findByRole("status")).toHaveProperty("textContent", "Exporting XLSX…");
    expect((screen.getByRole("button", { name: "CSV" }) as HTMLButtonElement).disabled).toBe(true);

    finish();
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect((screen.getByRole("button", { name: "CSV" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("reports a failed export", async () => {
    renderDetails(() => Promise.reject(new Error("disk full")));

    fireEvent.click(screen.getByRole("button", { name: "JSON" }));

    expect((await screen.findByRole("alert")).textContent).toBe("Export failed: disk full");
  });
});

describe("ChartsDetails saved charts", () => {
  const artistChart: SavedChart = {
    id: 1,
    name: "Artist Avg.Score",
    config: {
      ...createChartConfig("albums"),
      artistChart: { ...createArtistChartRequest(), metric: "averageAlbumScore" },
    },
    createdAt: "",
    updatedAt: "",
  };
  const trackChart: SavedChart = {
    id: 2,
    name: "Top tracks",
    config: createChartConfig("tracks"),
    createdAt: "",
    updatedAt: "",
  };

  it("labels each saved chart with the tab it belongs to", () => {
    renderDetails(undefined, [artistChart, trackChart]);

    expect(screen.getByText("Artists · Highest average album score")).toBeTruthy();
    expect(screen.getByText(`Tracks · ${rankingLabel("trackRating")} / table`)).toBeTruthy();
  });

  it("opens the clicked saved chart in the Charts section", () => {
    const model = renderDetails(undefined, [artistChart]);

    fireEvent.click(screen.getByText("Artist Avg.Score"));

    expect(model.openSavedChart).toHaveBeenCalledWith(artistChart);
    expect(model.setActiveSection).toHaveBeenCalledWith("Charts");
  });
});
