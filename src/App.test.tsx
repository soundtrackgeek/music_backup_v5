import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getStatisticsMock = vi.hoisted(() => vi.fn());

vi.mock("./backend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./backend")>();
  return {
    ...actual,
    getStatistics: getStatisticsMock,
  };
});

import App from "./App";

describe("App startup", () => {
  beforeEach(() => {
    getStatisticsMock.mockReset();
    getStatisticsMock.mockReturnValue(new Promise(() => undefined));
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
    getStatisticsMock.mockImplementation(actual.getStatistics);
    render(<App />);
    const navigation = within(screen.getByRole("complementary", { name: "Main navigation" }));
    fireEvent.click(navigation.getByRole("button", { name: "Statistics" }));
    fireEvent.click(screen.getByRole("tab", { name: "Rating progress" }));
    const ledger = () => within(screen.getByRole("tabpanel", { name: "Rating progress" }));
    // Loading replaces this keyed input; resolve the current node on every retry.
    await waitFor(() => expect(ledger().getByRole("spinbutton", { name: "Year progress year from" })).not.toBeDisabled());
    const from = ledger().getByRole("spinbutton", { name: "Year progress year from" });
    fireEvent.change(from, { target: { value: "1955" } });
    fireEvent.blur(from);
    expect(ledger().getAllByRole("button", { name: /^Select \d/ })).toHaveLength(67);
    fireEvent.change(ledger().getByRole("textbox", { name: "Genres" }), { target: { value: "Synthpop, New Wave" } });
    const year = await ledger().findByRole("button", { name: "Select 1987" });
    fireEvent.click(year);
    fireEvent.click(ledger().getByRole("button", { name: "Browse 1987 fully rated albums" }));
    expect(await screen.findByRole("heading", { name: "Search" })).toBeVisible();
    fireEvent.click(navigation.getByRole("button", { name: "Statistics" }));
    expect(await ledger().findByRole("button", { name: "Select 1987" })).toHaveAttribute("aria-pressed", "true");
    expect(ledger().getByRole("spinbutton", { name: "Year progress year from" })).toHaveValue(1955);
    expect(ledger().getByRole("textbox", { name: "Genres" })).toHaveValue("Synthpop, New Wave");
    expect(ledger().getAllByRole("button", { name: /^Select \d/ })).toHaveLength(67);
  });

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
