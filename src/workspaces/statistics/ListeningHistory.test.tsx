import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ListeningHistory } from "./ListeningHistory";
import {
  clearListeningSource,
  configureListeningSource,
  getListeningList,
  getListeningOverview,
  syncListeningSource,
  type ListeningOverview,
  type ListeningRow,
} from "../../backend/listening";

vi.mock("../../backend/listening", () => ({
  clearListeningSource: vi.fn(),
  configureListeningSource: vi.fn(),
  getListeningList: vi.fn(),
  getListeningOverview: vi.fn(),
  syncListeningSource: vi.fn(),
}));

const source = (id: "lastfm" | "listenbrainz" | "aurora", label: string, username = "", plays = 0) => ({
  source: id, label, username, tokenConfigured: false, plays, newestPlayedAt: plays ? 1_790_000_000 : null,
  lastSyncedAt: null, lastError: null,
});
const overview: ListeningOverview = {
  sources: [source("lastfm", "Last.fm", "listener", 120), source("listenbrainz", "ListenBrainz"), source("aurora", "Aurora")],
  totalPlays: 120, matchedPlays: 90, playedTracks: 40, firstPlayedAt: 1_700_000_000, lastPlayedAt: 1_790_000_000,
  playsLast30Days: 12, playsLast365Days: 100, months: [{ month: "2026-09", plays: 30 }, { month: "2026-10", plays: 12 }],
};
const row: ListeningRow = {
  key: "1", title: "Running Up That Hill", artist: "Kate Bush", album: "Hounds of Love", albumId: "hounds",
  trackId: 1, rating: 100, plays: 42, lastPlayedAt: 1_790_000_000, source: null,
};

beforeEach(() => {
  vi.mocked(getListeningOverview).mockResolvedValue(overview);
  vi.mocked(getListeningList).mockResolvedValue([row]);
});
afterEach(() => vi.resetAllMocks());

it("summarizes plays, lists top tracks, and opens albums", async () => {
  const open = vi.fn();
  render(<ListeningHistory onOpenAlbum={open} />);
  expect(await screen.findByText("Running Up That Hill")).toBeInTheDocument();
  expect(screen.getByText("75.0%")).toBeInTheDocument();
  expect(getListeningList).toHaveBeenCalledWith("topTracks", null, 100);
  fireEvent.click(screen.getByRole("button", { name: "Hounds of Love" }));
  expect(open).toHaveBeenCalledWith("hounds");

  fireEvent.change(screen.getByLabelText("Listening period"), { target: { value: "30" } });
  await waitFor(() => expect(getListeningList).toHaveBeenLastCalledWith("topTracks", 30, 100));

  // Rediscovery ignores the period: it is always "not played in three years".
  fireEvent.click(screen.getByRole("tab", { name: "Rediscover" }));
  await waitFor(() => expect(getListeningList).toHaveBeenLastCalledWith("rediscover", null, 100));
  expect(screen.queryByLabelText("Listening period")).not.toBeInTheDocument();
});

it("saves an account before syncing and reports the sync summary", async () => {
  const saved = {
    ...overview,
    sources: [overview.sources[0], source("listenbrainz", "ListenBrainz", "brainz"), overview.sources[2]],
  };
  vi.mocked(configureListeningSource).mockImplementation(async () => {
    vi.mocked(getListeningOverview).mockResolvedValue(saved);
    return saved;
  });
  vi.mocked(syncListeningSource).mockResolvedValue({
    source: "listenbrainz", fetched: 10, inserted: 8, duplicates: 2, totalPlays: 128, matchedPlays: 96,
    message: "ListenBrainz: 8 new plays, 2 already known.",
  });
  render(<ListeningHistory onOpenAlbum={vi.fn()} />);
  const name = await screen.findByLabelText("ListenBrainz user name");
  fireEvent.change(name, { target: { value: "brainz" } });
  const card = screen.getByRole("article", { name: "ListenBrainz listening source" });
  const syncButton = () => card.querySelector<HTMLButtonElement>(".primary-button")!;
  expect(syncButton()).toBeDisabled();
  fireEvent.click(screen.getAllByRole("button", { name: "Save" })[1]);
  await waitFor(() =>
    expect(configureListeningSource).toHaveBeenCalledWith({ source: "listenbrainz", username: "brainz", token: null, clearToken: false }),
  );
  await waitFor(() => expect(syncButton()).toBeEnabled());
  fireEvent.click(syncButton());
  expect(await screen.findByRole("status")).toHaveTextContent("8 new plays");
  expect(syncListeningSource).toHaveBeenCalledWith("listenbrainz");
});

it("asks for confirmation before removing a source's plays", async () => {
  vi.mocked(clearListeningSource).mockResolvedValue({ ...overview, totalPlays: 0 });
  render(<ListeningHistory onOpenAlbum={vi.fn()} />);
  fireEvent.click((await screen.findAllByRole("button", { name: "Remove plays" }))[0]);
  expect(clearListeningSource).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm removing 120 Last.fm plays" }));
  await waitFor(() => expect(clearListeningSource).toHaveBeenCalledWith("lastfm"));
});

it("shows provider failures", async () => {
  vi.mocked(syncListeningSource).mockRejectedValue(new Error("Last.fm error 6: User not found"));
  render(<ListeningHistory onOpenAlbum={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Sync new plays" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("User not found");
});
