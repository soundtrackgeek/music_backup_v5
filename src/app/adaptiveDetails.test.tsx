import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  adaptiveDetailsMediaQuery,
  useAdaptiveDetailsLayout,
  workspaceHasUsefulDetails,
} from "./adaptiveDetails";

type MediaQueryListener = (event: MediaQueryListEvent) => void;

function createMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<MediaQueryListener>();
  const mediaQuery = {
    get matches() {
      return matches;
    },
    media: adaptiveDetailsMediaQuery,
    onchange: null,
    addEventListener: (_type: string, listener: MediaQueryListener) =>
      listeners.add(listener),
    removeEventListener: (_type: string, listener: MediaQueryListener) =>
      listeners.delete(listener),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };

  return {
    matchMedia: vi.fn(() => mediaQuery as MediaQueryList),
    setMatches(nextMatches: boolean) {
      matches = nextMatches;
      listeners.forEach((listener) =>
        listener({ matches: nextMatches } as MediaQueryListEvent),
      );
    },
  };
}

function AdaptiveDetailsHarness() {
  const [workspace, setWorkspace] = useState("Search");
  const details = useAdaptiveDetailsLayout(workspace, true);

  return (
    <>
      <output aria-label="Drawer layout">
        {details.isDrawerLayout ? "drawer" : "sidebar"}
      </output>
      <output aria-label="Drawer state">
        {details.isDrawerOpen ? "open" : "closed"}
      </output>
      <button type="button" onClick={details.toggleDrawer}>
        Toggle details
      </button>
      <button type="button" onClick={() => setWorkspace("Charts")}>
        Open charts
      </button>
    </>
  );
}

describe("adaptive details", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("only reserves details for useful contextual or actionable content", () => {
    const emptyContext = {
      hasDiscovery: false,
      hasSelectedAlbum: false,
      hasSelectedArtist: false,
      hasSelectedGenre: false,
      hasSelectedTool: false,
      hasStatistics: false,
    };

    expect(workspaceHasUsefulDetails("Search", emptyContext)).toBe(true);
    expect(workspaceHasUsefulDetails("Charts", emptyContext)).toBe(true);
    expect(workspaceHasUsefulDetails("Albums", emptyContext)).toBe(false);
    expect(
      workspaceHasUsefulDetails("Albums", {
        ...emptyContext,
        hasSelectedAlbum: true,
      }),
    ).toBe(true);
    expect(workspaceHasUsefulDetails("Playlists", emptyContext)).toBe(false);
    expect(workspaceHasUsefulDetails("Wish List", emptyContext)).toBe(false);
    expect(workspaceHasUsefulDetails("Settings", emptyContext)).toBe(false);
  });

  it("starts closed in the drawer layout and closes after navigation", () => {
    const media = createMatchMedia(true);
    vi.stubGlobal("matchMedia", media.matchMedia);
    render(<AdaptiveDetailsHarness />);

    expect(screen.getByLabelText("Drawer layout")).toHaveTextContent("drawer");
    expect(screen.getByLabelText("Drawer state")).toHaveTextContent("closed");

    fireEvent.click(screen.getByRole("button", { name: "Toggle details" }));
    expect(screen.getByLabelText("Drawer state")).toHaveTextContent("open");

    fireEvent.click(screen.getByRole("button", { name: "Open charts" }));
    expect(screen.getByLabelText("Drawer state")).toHaveTextContent("closed");
  });

  it("closes an open drawer when the viewport crosses the breakpoint", () => {
    const media = createMatchMedia(true);
    vi.stubGlobal("matchMedia", media.matchMedia);
    render(<AdaptiveDetailsHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Toggle details" }));
    expect(screen.getByLabelText("Drawer state")).toHaveTextContent("open");

    act(() => media.setMatches(false));
    expect(screen.getByLabelText("Drawer layout")).toHaveTextContent("sidebar");
    expect(screen.getByLabelText("Drawer state")).toHaveTextContent("closed");
  });
});
