import { render, screen, within } from "@testing-library/react";
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
});
