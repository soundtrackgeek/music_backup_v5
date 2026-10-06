import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const failures = vi.hoisted(() => ({ map: false, results: false, luna: false }));

vi.mock("./components/LunaPanel", () => ({
  LunaPanel: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
    if (isOpen && failures.luna) throw new Error("Luna view failed");
    return isOpen ? (
      <aside role="dialog" aria-label="Luna">
        <button onClick={onClose}>Close Luna</button>
      </aside>
    ) : null;
  },
}));

vi.mock("./workspaces/MusicMapWorkspace", () => ({
  MusicMapWorkspace: () => {
    if (failures.map) throw new Error("Map view failed");
    return (
      <section className="workspace">
        <h1>Music Map</h1>
      </section>
    );
  },
}));

vi.mock("./workspaces/albums/AlbumPanels", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./workspaces/albums/AlbumPanels")>();
  return {
    ...actual,
    ResultTable: (props: Parameters<typeof actual.ResultTable>[0]) => {
      if (failures.results) throw new Error("Results view failed");
      return <actual.ResultTable {...props} />;
    },
  };
});

import App from "./App";

describe("app workspace isolation", () => {
  beforeEach(() => {
    failures.map = false;
    failures.results = false;
    failures.luna = false;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  });

  it("keeps navigation available and Search state intact when another workspace fails", async () => {
    render(<App />);
    const query = screen.getByPlaceholderText(
      "Search albums, artists, genres, tracks, publishers, files",
    );
    fireEvent.change(query, { target: { value: "Queen" } });
    failures.map = true;
    const nav = within(
      screen.getByRole("complementary", { name: "Main navigation" }),
    );
    fireEvent.click(nav.getByRole("button", { name: "Music Map" }));
    expect(
      screen.getByRole("alert", { name: "Music Map error" }),
    ).toBeVisible();
    fireEvent.click(nav.getByRole("button", { name: "Search" }));
    expect(
      screen.getByPlaceholderText(
        "Search albums, artists, genres, tracks, publishers, files",
      ),
    ).toHaveValue("Queen");
    fireEvent.click(nav.getByRole("button", { name: "Music Map" }));
    failures.map = false;
    fireEvent.click(screen.getByRole("button", { name: "Reload this view" }));
    expect(screen.getByRole("heading", { name: "Music Map" })).toBeVisible();
  });

  it("retries Search panels without resetting their workspace store", async () => {
    render(<App />);
    await screen.findByRole("region", { name: "Search results" });
    failures.results = true;
    fireEvent.change(
      screen.getByPlaceholderText(
        "Search albums, artists, genres, tracks, publishers, files",
      ),
      {
        target: { value: "Dio" },
      },
    );
    await screen.findByRole("alert", { name: "Search error" });
    expect(
      screen.getByRole("complementary", { name: "Main navigation" }),
    ).toBeVisible();
    expect(
      screen.getByRole("complementary", { name: "Search actions" }),
    ).toBeVisible();
    failures.results = false;
    fireEvent.click(screen.getByRole("button", { name: "Reload this view" }));
    expect(
      screen.getByPlaceholderText(
        "Search albums, artists, genres, tracks, publishers, files",
      ),
    ).toHaveValue("Dio");
    expect(
      screen.getByRole("region", { name: "Search results" }),
    ).toBeVisible();
  });

  it("dismisses and retries a failed Luna panel while Search stays available", async () => {
    render(<App />);
    await screen.findByRole("region", { name: "Search results" });
    fireEvent.change(
      screen.getByPlaceholderText(
        "Search albums, artists, genres, tracks, publishers, files",
      ),
      { target: { value: "Queen" } },
    );
    failures.luna = true;
    const trigger = screen.getByRole("button", { name: "Open Luna" });
    fireEvent.click(trigger);
    expect(screen.getByRole("alert", { name: "Luna error" })).toHaveClass(
      "luna-panel",
    );
    expect(screen.getByRole("region", { name: "Search results" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Close Luna" }));
    expect(screen.queryByRole("alert", { name: "Luna error" })).toBeNull();
    expect(trigger).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(trigger);
    failures.luna = false;
    fireEvent.click(screen.getByRole("button", { name: "Reload this view" }));
    expect(screen.getByRole("dialog", { name: "Luna" })).toBeVisible();
    expect(
      screen.getByPlaceholderText(
        "Search albums, artists, genres, tracks, publishers, files",
      ),
    ).toHaveValue("Queen");
  });
});
