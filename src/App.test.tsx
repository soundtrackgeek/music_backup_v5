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

  it("opens album, artist, and genre pages from Search table cells", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click((await screen.findAllByRole("button", { name: /^Open album / }))[0]);
    expect(await screen.findByRole("heading", { name: "Albums" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click((await screen.findAllByRole("button", { name: /^Open artist / }))[0]);
    expect(await screen.findByRole("heading", { name: "Artists" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click((await screen.findAllByRole("button", { name: /^Open genre / }))[0]);
    expect(await screen.findByRole("heading", { name: "Genres" })).toBeVisible();
  });

  it("opens album, artist, and genre pages from Charts table cells", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Charts" }));
    await user.click((await screen.findAllByRole("button", { name: /^Open album / }))[0]);
    expect(await screen.findByRole("heading", { name: "Albums" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Charts" }));
    await user.click((await screen.findAllByRole("button", { name: /^Open artist / }))[0]);
    expect(await screen.findByRole("heading", { name: "Artists" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Charts" }));
    await user.click((await screen.findAllByRole("button", { name: /^Open genre / }))[0]);
    expect(await screen.findByRole("heading", { name: "Genres" })).toBeVisible();
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
