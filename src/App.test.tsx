import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getStatisticsMock = vi.hoisted(() => vi.fn());
const getYearProgressMock = vi.hoisted(() => vi.fn());

vi.mock("./backend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./backend")>();
  return {
    ...actual,
    getStatistics: getStatisticsMock,
    getYearProgress: getYearProgressMock,
  };
});

import App from "./App";

describe("App startup", () => {
  beforeEach(() => {
    getStatisticsMock.mockReset();
    getStatisticsMock.mockReturnValue(new Promise(() => undefined));
    getYearProgressMock.mockReset();
  });

  it("shows library counts while statistics are still loading", async () => {
    render(<App />);

    const summary = await screen.findByRole("region", {
      name: "Library summary",
    });

    expect(await within(summary).findByText("1,130,882")).toBeVisible();
    expect(within(summary).getByText("76,789")).toBeVisible();
  });

  it("keeps every selected year and restores Year Ledger filters after browsing", async () => {
    const actual = await vi.importActual<typeof import("./backend")>("./backend");
    const genreRequest = { genres: ["Synthpop", "New Wave"], excludedGenres: [] };
    const genreRows = await actual.getYearProgress(genreRequest);
    let resolveGenreRows!: (rows: typeof genreRows) => void;
    const pendingGenreRows = new Promise<typeof genreRows>(resolve => { resolveGenreRows = resolve; });
    getYearProgressMock.mockReturnValueOnce(pendingGenreRows).mockResolvedValue(genreRows);
    getStatisticsMock.mockImplementation(actual.getStatistics);
    render(<App />);
    const navigation = within(screen.getByRole("complementary", { name: "Main navigation" }));
    fireEvent.click(navigation.getByRole("button", { name: "Statistics" }));
    fireEvent.click(screen.getByRole("tab", { name: "Rating progress" }));
    let ledger = within(screen.getByRole("tabpanel", { name: "Rating progress" }));
    // Query explicit labels without recomputing accessible roles for all 469 row buttons.
    const expectEveryYear = () => expect(
      ledger.getAllByLabelText(/^Select \d+$/).map(button => button.textContent),
    ).toEqual(Array.from({ length: 67 }, (_, index) => String(1955 + index)));
    // Loading replaces this keyed input; resolve the current node on every retry.
    await waitFor(() => expect(ledger.getByLabelText("Year progress year from")).toBeEnabled());
    const from = ledger.getByLabelText("Year progress year from");
    fireEvent.change(from, { target: { value: "1955" } });
    fireEvent.blur(from);
    expectEveryYear();
    fireEvent.change(ledger.getByRole("textbox", { name: "Genres" }), { target: { value: "Synthpop, New Wave" } });
    const browseAlbums = () => ledger.getByLabelText("Browse 1987 fully rated albums");
    expect(ledger.getByRole("status")).toHaveTextContent("Updating year progress…");
    expect(ledger.queryByLabelText("Browse 1987 fully rated albums")).not.toBeInTheDocument();
    await waitFor(() => expect(getYearProgressMock).toHaveBeenCalledWith(genreRequest));
    await act(async () => { resolveGenreRows(genreRows); });
    await waitFor(() => expect(browseAlbums()).toBeEnabled());
    fireEvent.click(ledger.getByLabelText("Select 1987"));
    fireEvent.click(browseAlbums());
    expect(await screen.findByRole("heading", { name: "Search" })).toBeVisible();
    fireEvent.click(navigation.getByRole("button", { name: "Statistics" }));
    // Navigation remounts the panel; discard the previous query scope.
    ledger = within(screen.getByRole("tabpanel", { name: "Rating progress" }));
    await waitFor(() => expect(browseAlbums()).toBeEnabled());
    expect(getYearProgressMock).toHaveBeenCalledTimes(2);
    expect(getYearProgressMock).toHaveBeenLastCalledWith(genreRequest);
    expect(ledger.getByLabelText("Select 1987")).toHaveAttribute("aria-pressed", "true");
    expect(ledger.getByLabelText("Year progress year from")).toHaveValue(1955);
    expect(ledger.getByLabelText("Year progress year to")).toHaveValue(2021);
    expect(ledger.getByRole("textbox", { name: "Genres" })).toHaveValue("Synthpop, New Wave");
    expectEveryYear();
    // Allow CI headroom for full App startup, two Statistics mounts and debounced requests.
  }, 10_000);

  // Each destination gets the default timeout instead of sharing it across three page visits.
  describe.each([
    ["Search", "Search results"],
    ["Charts", "Chart results"],
  ])("%s table cells", (workspace, resultsLabel) => {
    it.each([
      ["album", "Open album Actually", "Albums"],
      ["artist", "Open artist Pet Shop Boys", "Artists"],
      ["genre", "Open genre Synthpop", "Genres"],
    ])("opens the %s page and returns to the results", async (_entity, buttonName, destination) => {
      const user = userEvent.setup();
      render(<App />);
      const navigation = within(screen.getByRole("complementary", { name: "Main navigation" }));
      if (workspace !== "Search") {
        await user.click(navigation.getByRole("button", { name: workspace }));
      }

      const results = within(await screen.findByRole("region", { name: resultsLabel }));
      await user.click(await results.findByRole("button", { name: buttonName }));
      expect(await screen.findByRole("heading", { name: destination, level: 1 })).toBeVisible();

      await user.click(navigation.getByRole("button", { name: workspace }));
      expect(await screen.findByRole("heading", { name: workspace, level: 1 })).toBeVisible();
      // Returning remounts the table; query the new result region instead of retaining detached nodes.
      const restoredResults = within(await screen.findByRole("region", { name: resultsLabel }));
      expect(await restoredResults.findByRole("button", { name: buttonName })).toBeVisible();
    });
  });

  it("resizes Search and Charts columns independently without changing the chart sort", async () => {
    const searchKey = "music-library.table-widths.v1.search-albums";
    const chartKey = "music-library.table-widths.v1.chart-albums";
    localStorage.removeItem(searchKey);
    localStorage.removeItem(chartKey);
    const user = userEvent.setup();
    render(<App />);

    const searchHandle = await screen.findByRole("separator", { name: "Resize Album column" });
    fireEvent.keyDown(searchHandle, { key: "ArrowRight" });
    expect(searchHandle).toHaveAttribute("aria-valuenow", "230");

    await user.click(screen.getByRole("button", { name: "Charts" }));
    const chartHandle = await screen.findByRole("separator", { name: "Resize Album column" });
    expect(chartHandle).not.toHaveAttribute("aria-valuenow");
    const scoreHeader = screen.getByRole("button", { name: /Sort by Score/ }).closest("[role='columnheader']")!;
    const priorSort = scoreHeader.getAttribute("aria-sort");
    fireEvent.keyDown(chartHandle, { key: "ArrowRight", shiftKey: true });
    expect(chartHandle).toHaveAttribute("aria-valuenow", "260");
    expect(scoreHeader).toHaveAttribute("aria-sort", priorSort);

    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByRole("separator", { name: "Resize Album column" })).toHaveAttribute("aria-valuenow", "230");
    localStorage.removeItem(searchKey);
    localStorage.removeItem(chartKey);
  });

  it("offers display-artist exclusion in Search and Charts", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByText("Advanced filters"));
    const searchArtistCriterion = screen.getByText("Display artist").closest("label");
    expect(searchArtistCriterion).not.toBeNull();
    expect(
      within(searchArtistCriterion!).getByRole("option", {
        name: "Does not contain",
      }),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Charts" }));
    await user.click(screen.getByRole("button", { name: "Tracks" }));
    await user.click(screen.getByText("Advanced chart controls"));
    const chartArtistCriterion = screen.getByText("Display artist").closest("label");
    expect(chartArtistCriterion).not.toBeNull();
    expect(
      within(chartArtistCriterion!).getByRole("option", {
        name: "Does not contain",
      }),
    ).toBeVisible();
  });
});
