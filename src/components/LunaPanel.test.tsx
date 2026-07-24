import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AiMusicResearchContext,
  AiSnapshot,
  SavedExternalDiscovery,
  SavedPlaylist,
} from "../types";
import { LunaPanel } from "./LunaPanel";

const backend = vi.hoisted(() => ({
  deleteAiSnapshot: vi.fn(),
  deleteSavedExternalDiscovery: vi.fn(),
  deleteSavedPlaylist: vi.fn(),
  listAiSnapshots: vi.fn(),
  listSavedExternalDiscoveries: vi.fn(),
  listSavedPlaylists: vi.fn(),
}));

vi.mock("../backend", () => backend);

const researchContext = {
  workspace: "Search",
  selectedEntityType: null,
  selectedEntityId: null,
  selectedLabel: null,
  selectedSubtitle: null,
} satisfies AiMusicResearchContext;

const searchSnapshot = {
  id: 7,
  title: "Unrated synthpop",
  content: {
    kind: "search",
    prompt: "Find unrated synthpop",
    result: {
      summary: "Unrated synthpop albums",
    },
  },
  libraryImportRunId: 3,
  libraryImportedAt: "2026-07-23T08:00:00Z",
  libraryAlbumCount: 100,
  libraryTrackCount: 1_000,
  createdAt: "2026-07-23T10:00:00Z",
} as AiSnapshot;

const researchSnapshot = {
  id: 8,
  title: "History of synthpop",
  content: {
    kind: "musicResearch",
    prompt: "Trace synthpop",
    context: researchContext,
    exchanges: [],
  },
  libraryImportRunId: 3,
  libraryImportedAt: "2026-07-23T08:00:00Z",
  libraryAlbumCount: 100,
  libraryTrackCount: 1_000,
  createdAt: "2026-07-23T11:00:00Z",
} as AiSnapshot;

const savedPlaylist = {
  id: 9,
  name: "Night drive",
  playlist: {
    tracks: [{ trackId: 1 }, { trackId: 2 }],
  },
  createdAt: "2026-07-23T12:00:00Z",
  updatedAt: "2026-07-23T12:00:00Z",
} as SavedPlaylist;

const savedDiscovery = {
  id: 10,
  name: "Missing AOR",
  response: {
    plan: { entity: "album" },
    items: [{ id: "one" }],
  },
  createdAt: "2026-07-23T13:00:00Z",
  updatedAt: "2026-07-23T13:00:00Z",
} as SavedExternalDiscovery;

function renderPanel(overrides: Partial<Parameters<typeof LunaPanel>[0]> = {}) {
  const props: Parameters<typeof LunaPanel>[0] = {
    isOpen: true,
    activeSection: "Search",
    currentView: "tracks",
    currentResultCount: 139,
    chartResultCount: 25,
    albumCount: 100,
    trackCount: 1_000,
    researchContext,
    researchPanel: (snapshot) => (
      <div>{snapshot ? `Research snapshot ${snapshot.id}` : "Research composer"}</div>
    ),
    onClose: vi.fn(),
    onOpenMode: vi.fn(),
    onOpenHistory: vi.fn(),
    ...overrides,
  };
  return { ...render(<LunaPanel {...props} />), props };
}

describe("LunaPanel", () => {
  beforeEach(() => {
    backend.deleteAiSnapshot.mockReset();
    backend.deleteAiSnapshot.mockResolvedValue(undefined);
    backend.deleteSavedExternalDiscovery.mockReset();
    backend.deleteSavedExternalDiscovery.mockResolvedValue(undefined);
    backend.deleteSavedPlaylist.mockReset();
    backend.deleteSavedPlaylist.mockResolvedValue(undefined);
    backend.listAiSnapshots.mockReset();
    backend.listAiSnapshots.mockResolvedValue([]);
    backend.listSavedExternalDiscoveries.mockReset();
    backend.listSavedExternalDiscoveries.mockResolvedValue([]);
    backend.listSavedPlaylists.mockReset();
    backend.listSavedPlaylists.mockResolvedValue([]);
  });

  it("shows six explicit modes with a visible context and privacy boundary", async () => {
    const user = userEvent.setup();
    const { props } = renderPanel();

    expect(screen.getAllByRole("tab", { name: /Plan & filter|Ask this view|Analyze library|Build playlist|Discover outside|Research music/ })).toHaveLength(6);
    expect(screen.getByText("Search · tracks · 139 matches")).toBeVisible();
    expect(screen.getByText("Privacy boundary")).toBeVisible();

    await user.click(screen.getByRole("tab", { name: "Analyze library" }));
    expect(screen.getByText("100 albums · 1,000 tracks")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Open Library Analyst" }),
    );
    expect(props.onOpenMode).toHaveBeenCalledWith("analyze");
  });

  it("combines AI snapshots, playlists, and discoveries in one timeline", async () => {
    const user = userEvent.setup();
    backend.listAiSnapshots.mockResolvedValue([
      searchSnapshot,
      researchSnapshot,
    ]);
    backend.listSavedPlaylists.mockResolvedValue([savedPlaylist]);
    backend.listSavedExternalDiscoveries.mockResolvedValue([savedDiscovery]);
    const { props } = renderPanel();

    await user.click(screen.getByRole("tab", { name: /History/ }));
    expect(await screen.findByText("Unrated synthpop")).toBeVisible();
    expect(screen.getByText("Night drive")).toBeVisible();
    expect(screen.getByText("Missing AOR")).toBeVisible();
    expect(screen.getByText("History of synthpop")).toBeVisible();

    await user.click(screen.getByText("Night drive"));
    expect(props.onOpenHistory).toHaveBeenCalledWith({
      source: "playlist",
      item: savedPlaylist,
    });

    await user.click(screen.getByText("History of synthpop"));
    expect(screen.getByText("Research snapshot 8")).toBeVisible();
    expect(props.onOpenHistory).toHaveBeenCalledTimes(1);
  });

  it("deletes an item from the shared local timeline", async () => {
    const user = userEvent.setup();
    backend.listAiSnapshots.mockResolvedValue([searchSnapshot]);
    renderPanel();

    await user.click(screen.getByRole("tab", { name: /History/ }));
    expect(await screen.findByText("Unrated synthpop")).toBeVisible();
    await user.click(
      screen.getByRole("button", { name: "Delete Unrated synthpop" }),
    );

    await waitFor(() =>
      expect(backend.deleteAiSnapshot).toHaveBeenCalledWith(searchSnapshot.id),
    );
    expect(screen.queryByText("Unrated synthpop")).not.toBeInTheDocument();
  });
});
