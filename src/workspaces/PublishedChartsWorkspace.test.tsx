import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PublishedChartsWorkspace } from "./PublishedChartsWorkspace";

const getCatalog = vi.fn();
const listWeeks = vi.fn();
const getEntries = vi.fn();
const getRankings = vi.fn();
const importCharts = vi.fn();
const subscribeProgress = vi.fn();

vi.mock("../backend/publishedCharts", () => ({
  getPublishedChartCatalog: (...args: unknown[]) => getCatalog(...args),
  listPublishedChartWeeks: (...args: unknown[]) => listWeeks(...args),
  getPublishedChartEntries: (...args: unknown[]) => getEntries(...args),
  getPublishedArtistRankings: (...args: unknown[]) => getRankings(...args),
  importPublishedCharts: (...args: unknown[]) => importCharts(...args),
  subscribePublishedChartsImportProgress: (...args: unknown[]) => subscribeProgress(...args),
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
    subscribeProgress.mockResolvedValue(() => undefined);
    importCharts.mockResolvedValue({ rowsImported: 6, yearsImported: 2, chartSeries: 1 });
    getCatalog.mockResolvedValue({
      importedYears: 2, inventoryYears: 2, needsImport: false, totalRows: 6,
      series: [{ chart: "Billboard Hot 100", years: [2018, 2019], firstWeek: "2018-01-06", lastWeek: "2019-01-12", rows: 6 }],
    });
    listWeeks.mockImplementation((_chart: string, year: number) => Promise.resolve(year === 2019
      ? [{ weekEnding: "2019-01-05", rows: 2 }, { weekEnding: "2019-01-12", rows: 1 }]
      : [{ weekEnding: "2018-01-06", rows: 3 }]));
    getRankings.mockResolvedValue({
      totalArtists: 2, chartWeeks: 2, totalEntries: 3,
      artists: [
        { rank: 1, artist: "First artist", numberOneWeeks: 2, chartWeeks: 2, appearances: 2, bestPosition: 1 },
        { rank: 2, artist: "Second artist", numberOneWeeks: 0, chartWeeks: 1, appearances: 1, bestPosition: 2 },
      ],
    });
    getEntries.mockResolvedValue({ totalRows: 2, entries: [baseEntry, { ...baseEntry, id: 2, title: "Second song" }] });
  });

  it("ranks all artists for a chosen year without a week selection", async () => {
    render(<PublishedChartsWorkspace />);
    expect(await screen.findByText("First artist")).toBeInTheDocument();
    expect(screen.getByText("Second artist")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Browse" })).not.toBeInTheDocument();
    await waitFor(() => expect(getRankings).toHaveBeenCalledWith("Billboard Hot 100", 2019, 2019, null, null, 0));
  });

  it("shows bundled chart choices immediately and prepares missing rows automatically", async () => {
    getCatalog.mockResolvedValueOnce({
      importedYears: 0, inventoryYears: 2, needsImport: true, totalRows: 0,
      series: [{ chart: "Billboard Hot 100", years: [2018, 2019], firstWeek: "2018-01-06", lastWeek: "2019-01-12", rows: 6 }],
    });
    render(<PublishedChartsWorkspace />);
    expect(await screen.findByRole("option", { name: "Billboard Hot 100" })).toBeInTheDocument();
    await waitFor(() => expect(importCharts).toHaveBeenCalledWith());
    await waitFor(() => expect(getCatalog).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: "Browse" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Charts folder")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reimport US charts" })).not.toBeInTheDocument();
  });

  it("supports a range across years and an exact week with source positions", async () => {
    render(<PublishedChartsWorkspace />);
    await screen.findByText("First artist");
    fireEvent.change(screen.getByLabelText("From year"), { target: { value: "2018" } });
    await waitFor(() => expect(getRankings).toHaveBeenCalledWith("Billboard Hot 100", 2018, 2019, null, null, 0));
    fireEvent.change(screen.getByLabelText("From year"), { target: { value: "2019" } });
    await waitFor(() => expect(screen.getByLabelText("From week").querySelectorAll("option")).toHaveLength(3));
    fireEvent.change(screen.getByLabelText("From week"), { target: { value: "2019-01-05" } });
    fireEvent.change(screen.getByLabelText("To week"), { target: { value: "2019-01-05" } });
    await waitFor(() => expect(getRankings).toHaveBeenCalledWith("Billboard Hot 100", 2019, 2019, "2019-01-05", "2019-01-05", 0));
    expect(await screen.findByText("First song")).toBeInTheDocument();
    const weekly = screen.getByRole("region", { name: "Weekly published chart" });
    const rows = within(weekly).getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell")[0].textContent)).toEqual(["1", "1"]);
    fireEvent.click(within(weekly).getByRole("button", { name: /First song/ }));
    expect(screen.getByText("2019_us_singles · page 137")).toBeInTheDocument();
  });
});
