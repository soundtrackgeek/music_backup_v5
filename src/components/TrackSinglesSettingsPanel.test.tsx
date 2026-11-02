import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActivityJob } from "../backend/activity";
import { TrackSinglesSettingsPanel } from "./TrackSinglesSettingsPanel";

const startTrackSingles = vi.fn();
const getTrackSinglesStatus = vi.fn();
const listActivityJobs = vi.fn();
const controlActivityJob = vi.fn();
let pushJobs: (jobs: ActivityJob[]) => void = () => undefined;

vi.mock("../backend", () => ({
  isTauriRuntime: () => true,
  startTrackSingles: (...args: unknown[]) => startTrackSingles(...args),
  getTrackSinglesStatus: (...args: unknown[]) => getTrackSinglesStatus(...args),
}));

vi.mock("../backend/activity", async () => {
  const actual = await vi.importActual<typeof import("../backend/activity")>("../backend/activity");
  return {
    ...actual,
    listActivityJobs: (...args: unknown[]) => listActivityJobs(...args),
    controlActivityJob: (...args: unknown[]) => controlActivityJob(...args),
    listenToActivityJobs: async (handler: (jobs: ActivityJob[]) => void) => {
      pushJobs = handler;
      return () => undefined;
    },
  };
});

const status = {
  linkedArtists: 3000,
  checkedArtists: 1234,
  dueArtists: 1766,
  confirmedSingles: 5200,
  possibleSingles: 40,
  lastCheckedAt: null,
};

function job(overrides: Partial<ActivityJob> = {}): ActivityJob {
  return {
    id: 7, kind: "trackSingles", label: "Find album singles", state: "running", progress: 41,
    completed: 1234, total: 3000, etaSeconds: 7200, message: "1234 of 3000 artists checked · now: Bob Seger",
    error: null, createdAt: "2026-11-02T10:00:00Z", updatedAt: "2026-11-02T10:05:00Z",
    resumable: true, canCancel: true, canRetry: true, ...overrides,
  } as ActivityJob;
}

describe("TrackSinglesSettingsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTrackSinglesStatus.mockResolvedValue(status);
    listActivityJobs.mockResolvedValue([]);
    startTrackSingles.mockResolvedValue(7);
  });

  it("shows how far the library has come even when nothing is running", async () => {
    render(<TrackSinglesSettingsPanel />);
    expect(await screen.findByText("1,234 of 3,000 linked artists checked · 5,200 confirmed singles")).toBeInTheDocument();
    expect(screen.getByText(/1,766 artists still to check/)).toBeInTheDocument();
    expect(screen.getByText(/40 possible matches saved but not shown/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Album singles job")).not.toBeInTheDocument();
  });

  it("starts a batch of 25 or every artist without waiting for the job to finish", async () => {
    render(<TrackSinglesSettingsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: /Find singles for 25 artists/ }));
    await waitFor(() => expect(startTrackSingles).toHaveBeenCalledWith(25, false));
    fireEvent.click(screen.getByRole("button", { name: "Find singles for all artists" }));
    await waitFor(() => expect(startTrackSingles).toHaveBeenLastCalledWith(0, false));
  });

  it("can force a recheck of every artist, which the normal buttons never do", async () => {
    render(<TrackSinglesSettingsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Recheck every artist" }));
    await waitFor(() => expect(startTrackSingles).toHaveBeenCalledWith(0, true));
  });

  it("explains when an artist is checked again on its own", async () => {
    render(<TrackSinglesSettingsPanel />);
    expect(await screen.findByText(/checked again automatically when you add or remove albums/)).toBeInTheDocument();
  });

  it("shows live progress and lets the job be paused, then continued", async () => {
    listActivityJobs.mockResolvedValue([job()]);
    controlActivityJob.mockResolvedValue([job({ state: "pausing" })]);
    render(<TrackSinglesSettingsPanel />);

    expect(await screen.findByText("Finding singles · running")).toBeInTheDocument();
    expect(screen.getByText(/1,234 of 3,000 artists checked · about 2 h left/)).toBeInTheDocument();
    expect(screen.getByLabelText("Album singles progress")).toHaveAttribute("value", "1234");
    // A running job blocks starting a second one.
    expect(screen.getByRole("button", { name: "Find singles for all artists" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    await waitFor(() => expect(controlActivityJob).toHaveBeenCalledWith(7, "pause"));

    act(() => pushJobs([job({ state: "paused", etaSeconds: null })]));
    expect(await screen.findByText("Finding singles · paused")).toBeInTheDocument();
    controlActivityJob.mockResolvedValue([job({ state: "queued" })]);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(controlActivityJob).toHaveBeenLastCalledWith(7, "resume"));
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("offers Continue for a stopped run and keeps the reason visible", async () => {
    listActivityJobs.mockResolvedValue([job({ state: "failed", error: "MusicBrainz stopped answering", etaSeconds: null })]);
    controlActivityJob.mockResolvedValue([job({ state: "queued" })]);
    render(<TrackSinglesSettingsPanel />);

    expect(await screen.findByText("MusicBrainz stopped answering")).toBeInTheDocument();
    // A stopped run no longer blocks starting a new one.
    expect(screen.getByRole("button", { name: "Find singles for all artists" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(controlActivityJob).toHaveBeenCalledWith(7, "retry"));
  });

  it("keeps the last finished run on screen", async () => {
    listActivityJobs.mockResolvedValue([job({ state: "completed", completed: 3000, message: "3000 of 3000 artists checked · 5200 singles found this run", etaSeconds: null })]);
    render(<TrackSinglesSettingsPanel />);
    expect(await screen.findByText("Finding singles · finished")).toBeInTheDocument();
    expect(screen.getByText(/5200 singles found this run/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
  });

  it("shows a start failure instead of hiding it", async () => {
    startTrackSingles.mockRejectedValue(new Error("Finding singles is already in progress."));
    render(<TrackSinglesSettingsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: /Find singles for 25 artists/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already in progress");
  });
});
