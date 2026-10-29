import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChartsDetails } from "./ChartsDetails";

function renderDetails(runChartExport: (format: string) => Promise<void>) {
  const model = {
    chartName: "",
    setChartName: vi.fn(),
    saveCurrentChart: vi.fn(),
    savedCharts: [],
    setChartConfig: vi.fn(),
    setChartTableSort: vi.fn(),
    setActiveSection: vi.fn(),
    removeSavedChart: vi.fn(),
    runChartExport,
    chartExportResult: null,
  };
  render(<ChartsDetails model={model as unknown as Parameters<typeof ChartsDetails>[0]["model"]} />);
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
