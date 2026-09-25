import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PublishedChartsWorkspace } from "./PublishedChartsWorkspace";

const getCatalog = vi.fn();
const listWeeks = vi.fn();
const getEntries = vi.fn();

vi.mock("../backend/publishedCharts", () => ({
  getPublishedChartCatalog: (...args: unknown[]) => getCatalog(...args),
  listPublishedChartWeeks: (...args: unknown[]) => listWeeks(...args),
  getPublishedChartEntries: (...args: unknown[]) => getEntries(...args),
  importPublishedCharts: vi.fn(),
  selectPublishedChartsFolder: vi.fn(),
  subscribePublishedChartsImportProgress: vi.fn(),
}));

const baseEntry = {
  id: 1, position: 1, lastWeek: "", weeksOnChart: "1", entryStatus: "NEW",
  movement: "", title: "First song", artist: "First artist", numberOneMarker: "#1",
  label: "Test", format: "7''", catalogueNumber: "123", releaseType: "S",
  duration: "03:01", peakPosition: "1", entryDate: "2019-01-05",
  peakDate: "2019-01-05", bpiAward: "", sourcePage: "137", book: "2019_us_singles",
};

describe("PublishedChartsWorkspace", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    getCatalog.mockResolvedValue({
      importedYears: 1, totalRows: 3,
      series: [{ chart: "Billboard Hot 100", years: [2019], firstWeek: "2019-01-05", lastWeek: "2019-01-12", rows: 3 }],
    });
    listWeeks.mockResolvedValue([
      { weekEnding: "2019-01-05", rows: 2 },
      { weekEnding: "2019-01-12", rows: 1 },
    ]);
    getEntries.mockImplementation((_chart: string, week: string) => Promise.resolve(
      week === "2019-01-05"
        ? { totalRows: 2, entries: [baseEntry, { ...baseEntry, id: 2, title: "Second song" }] }
        : { totalRows: 1, entries: [{ ...baseEntry, id: 3, position: 2, title: "Later song" }] },
    ));
  });

  it("browses exact weeks and keeps printed duplicate positions", async () => {
    render(<PublishedChartsWorkspace />);
    expect(await screen.findByText("Later song")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Previous chart week" }));
    expect(await screen.findByText("First song")).toBeInTheDocument();
    expect(screen.getByText("Second song")).toBeInTheDocument();
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell")[0].textContent)).toEqual(["1", "1"]);
    fireEvent.click(screen.getByRole("button", { name: /First song/ }));
    expect(screen.getByText("2019_us_singles · page 137")).toBeInTheDocument();
    await waitFor(() => expect(getEntries).toHaveBeenCalledWith("Billboard Hot 100", "2019-01-05", 0));
  });
});
