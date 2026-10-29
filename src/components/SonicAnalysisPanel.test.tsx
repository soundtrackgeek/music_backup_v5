import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SonicAnalysisPanel } from "./SonicAnalysisPanel";
import * as backend from "../backend/sonic";
import * as activity from "../backend/activity";

vi.mock("../backend/sonic", () => ({ getSonicStatus: vi.fn(), getSonicSeeds: vi.fn(), configureSonicSchedule: vi.fn(), startSonicAnalysis: vi.fn(), findSonicMatches: vi.fn(), saveSonicPlaylist: vi.fn() }));
vi.mock("../backend/activity", () => ({ listActivityJobs: vi.fn(), controlActivityJob: vi.fn(), listenToActivityJobs: vi.fn() }));

beforeEach(() => {
  vi.mocked(activity.listActivityJobs).mockResolvedValue([]);
  vi.mocked(activity.listenToActivityJobs).mockResolvedValue(() => undefined);
});
afterEach(() => vi.resetAllMocks());
const savedJob: activity.ActivityJob = { id: 560, kind: "sonicAnalysis", label: "Audio analysis", state: "failed", progress: 22, completed: 249274, total: 1108247, etaSeconds: null, message: "Saved checkpoint", error: "Storage failed", createdAt: "2026-10-14", updatedAt: "2026-10-14", resumable: true, canCancel: true, canRetry: true };

it.each([["paused", "resume"], ["failed", "retry"], ["cancelled", "retry"]] as const)("continues %s analysis directly while coverage is still loading", async (state, action) => {
  vi.mocked(backend.getSonicStatus).mockReturnValue(new Promise(() => undefined));
  vi.mocked(backend.getSonicSeeds).mockResolvedValue([]);
  vi.mocked(activity.listActivityJobs).mockResolvedValue([{ ...savedJob, state }]);
  vi.mocked(activity.controlActivityJob).mockResolvedValue([{ ...savedJob, state: "queued" }]);
  render(<SonicAnalysisPanel />);
  fireEvent.click(await screen.findByRole("button", { name: "Continue analysis" }));
  await waitFor(() => expect(activity.controlActivityJob).toHaveBeenCalledWith(560, action));
  expect(backend.startSonicAnalysis).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Analysis queued" })).toBeDisabled();
  expect(screen.getByText("249,274 of 1,108,247 queue entries checked")).toBeInTheDocument();
});

it("updates the saved job from Activity events and pauses it without creating another job", async () => {
  vi.mocked(backend.getSonicStatus).mockReturnValue(new Promise(() => undefined));
  vi.mocked(backend.getSonicSeeds).mockResolvedValue([]);
  let publish!: (jobs: activity.ActivityJob[]) => void;
  vi.mocked(activity.listenToActivityJobs).mockImplementation(async handler => { publish = handler; return () => undefined; });
  vi.mocked(activity.listActivityJobs).mockResolvedValue([{ ...savedJob, state: "running" }]);
  vi.mocked(activity.controlActivityJob).mockResolvedValue([{ ...savedJob, state: "pausing" }]);
  render(<SonicAnalysisPanel />);
  fireEvent.click(await screen.findByRole("button", { name: "Pause analysis" }));
  await waitFor(() => expect(activity.controlActivityJob).toHaveBeenCalledWith(560, "pause"));
  await act(async () => publish([{ ...savedJob, state: "paused" }]));
  expect(screen.getByRole("button", { name: "Continue analysis" })).toBeEnabled();
  expect(backend.getSonicStatus).toHaveBeenCalledTimes(1);
});

it("keeps coverage readers out of queue compaction and refreshes when analysis advances", async () => {
  const status = { analyzed: 2, total: 100, pending: 98, failed: 0, timelines: 0, timelineBytes: 0, profile: "test", idleSupported: true, schedule: { idleOnly: true, idleMinutes: 5, startHour: null, endHour: null } };
  vi.mocked(backend.getSonicStatus).mockResolvedValue(status);
  vi.mocked(backend.getSonicSeeds).mockResolvedValue([]);
  let publish!: (jobs: activity.ActivityJob[]) => void;
  vi.mocked(activity.listenToActivityJobs).mockImplementation(async handler => { publish = handler; return () => undefined; });
  render(<SonicAnalysisPanel />);
  await screen.findByText("2 of 100 tracks analyzed · 98 pending · 0 failed");
  await act(async () => publish([{ ...savedJob, state: "running", message: "Compacting audio analysis queue storage. Saved analysis is preserved." }]));
  expect(backend.getSonicStatus).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/Compacting audio analysis queue storage/)).toBeInTheDocument();
  await act(async () => publish([{ ...savedJob, state: "running", message: "Analyzing next.mp3", updatedAt: "next" }]));
  await waitFor(() => expect(backend.getSonicStatus).toHaveBeenCalledTimes(2));
});

it("does not offer an older failed scan after a newer scan completed", async () => {
  vi.mocked(backend.getSonicStatus).mockReturnValue(new Promise(() => undefined));
  vi.mocked(backend.getSonicSeeds).mockResolvedValue([]);
  vi.mocked(activity.listActivityJobs).mockResolvedValue([{ ...savedJob, id: 561, state: "completed" }, savedJob]);
  render(<SonicAnalysisPanel />);
  await waitFor(() => expect(activity.listActivityJobs).toHaveBeenCalled());
  expect(screen.queryByRole("button", { name: "Continue analysis" })).not.toBeInTheDocument();
});

it("keeps unfinished analysis available after a newer reuse verification completes", async () => {
  vi.mocked(backend.getSonicStatus).mockReturnValue(new Promise(() => undefined));
  vi.mocked(backend.getSonicSeeds).mockResolvedValue([]);
  vi.mocked(activity.listActivityJobs).mockResolvedValue([{ ...savedJob, id: 561, kind: "sonicReuse", state: "completed" }, savedJob]);
  render(<SonicAnalysisPanel />);
  expect(await screen.findByRole("button", { name: "Continue analysis" })).toBeEnabled();
});

it("saves edited settings before continuing and leaves the saved job alone if saving fails", async () => {
  const status = { analyzed: 2, total: 100, pending: 98, failed: 0, timelines: 0, timelineBytes: 0, profile: "test", idleSupported: true, schedule: { idleOnly: true, idleMinutes: 5, startHour: null, endHour: null } };
  vi.mocked(backend.getSonicStatus).mockResolvedValue(status);
  vi.mocked(backend.getSonicSeeds).mockResolvedValue([]);
  vi.mocked(activity.listActivityJobs).mockResolvedValue([savedJob]);
  vi.mocked(backend.configureSonicSchedule).mockRejectedValue(new Error("Could not save schedule"));
  render(<SonicAnalysisPanel />);
  fireEvent.click(await screen.findByLabelText("Only when the computer is idle"));
  fireEvent.click(await screen.findByRole("button", { name: "Continue analysis" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not save schedule");
  expect(activity.controlActivityJob).not.toHaveBeenCalled();
  vi.mocked(backend.configureSonicSchedule).mockResolvedValue({ ...status, schedule: { ...status.schedule, idleOnly: false } });
  vi.mocked(activity.controlActivityJob).mockResolvedValue([{ ...savedJob, state: "queued" }]);
  fireEvent.click(screen.getByRole("button", { name: "Continue analysis" }));
  await waitFor(() => expect(activity.controlActivityJob).toHaveBeenCalledWith(560, "retry"));
  expect(backend.configureSonicSchedule).toHaveBeenLastCalledWith({ ...status.schedule, idleOnly: false });
});
it("saves idle and overnight settings separately from queueing an album", async () => {
  const status = { analyzed: 2, total: 100, pending: 98, failed: 0, timelines: 0, timelineBytes: 0, profile: "test", idleSupported: true, schedule: { idleOnly: true, idleMinutes: 5, startHour: null, endHour: null } };
  vi.mocked(backend.getSonicStatus).mockResolvedValue(status);
  vi.mocked(backend.getSonicSeeds).mockResolvedValue([]);
  vi.mocked(backend.configureSonicSchedule).mockImplementation(async schedule => ({ ...status, schedule }));
  vi.mocked(backend.startSonicAnalysis).mockResolvedValue(1);
  render(<SonicAnalysisPanel albumId="album-a" />);
  expect(await screen.findByText("2 of 100 tracks analyzed · 98 pending · 0 failed")).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Limit to certain hours"));
  fireEvent.click(screen.getByText("Save schedule"));
  await waitFor(() => expect(backend.configureSonicSchedule).toHaveBeenCalledWith({ idleOnly: true, idleMinutes: 5, startHour: 22, endHour: 8 }));
  expect(backend.startSonicAnalysis).not.toHaveBeenCalled();
  await screen.findByText(/Analysis schedule saved/);
  fireEvent.click(screen.getByText("Analyze this album"));
  await waitFor(() => expect(backend.startSonicAnalysis).toHaveBeenCalledWith("album", "album-a"));
});

it.each([
  ["all", "Analyze library"],
  ["favorites", "Analyze favorites"],
  ["album", "Analyze this album"],
  ["reuse", "Verify reused analysis"],
  ["failed", "Retry failed tracks"],
] as const)("saves the visible schedule before starting %s analysis", async (scope, button) => {
  const status = { analyzed: 0, total: 100, pending: 0, failed: 0, timelines: 0, timelineBytes: 0, profile: "test", idleSupported: true, schedule: { idleOnly: true, idleMinutes: 5, startHour: 22, endHour: 8 } };
  const unrestricted = { idleOnly: false, idleMinutes: 5, startHour: null, endHour: null };
  vi.mocked(backend.getSonicStatus).mockResolvedValueOnce(status).mockResolvedValue({ ...status, schedule: unrestricted });
  vi.mocked(backend.getSonicSeeds).mockResolvedValue([]);
  let finishSave!: (status: backend.SonicStatus) => void;
  vi.mocked(backend.configureSonicSchedule).mockReturnValue(new Promise(resolve => { finishSave = resolve; }));
  vi.mocked(backend.startSonicAnalysis).mockResolvedValue(1);
  render(<SonicAnalysisPanel albumId={scope === "album" ? "album-a" : undefined} />);
  if (scope === "reuse") fireEvent.click(screen.getByText("Backup and cross-PC reuse"));
  if (scope === "failed") fireEvent.click(await screen.findByText(/Failed tracks \(/));
  const idle = await screen.findByLabelText("Only when the computer is idle");
  fireEvent.click(idle);
  fireEvent.click(screen.getByLabelText("Limit to certain hours"));
  fireEvent.click(screen.getByText(button));
  await waitFor(() => expect(backend.configureSonicSchedule).toHaveBeenCalledWith(unrestricted));
  expect(backend.startSonicAnalysis).not.toHaveBeenCalled();
  expect(idle).toBeDisabled();
  await act(async () => finishSave({ ...status, schedule: unrestricted }));
  await waitFor(() => expect(backend.startSonicAnalysis).toHaveBeenCalledWith(scope, scope === "album" ? "album-a" : null));
  expect(screen.getByLabelText("Only when the computer is idle")).not.toBeChecked();
  expect(screen.getByLabelText("Limit to certain hours")).not.toBeChecked();
});

it("keeps analysis unqueued when the visible schedule cannot be saved", async () => {
  const status = { analyzed: 0, total: 100, pending: 0, failed: 0, timelines: 0, timelineBytes: 0, profile: "test", idleSupported: true, schedule: { idleOnly: true, idleMinutes: 5, startHour: null, endHour: null } };
  vi.mocked(backend.getSonicStatus).mockResolvedValue(status);
  vi.mocked(backend.getSonicSeeds).mockResolvedValue([]);
  vi.mocked(backend.configureSonicSchedule).mockRejectedValue(new Error("Could not save analysis schedule"));
  render(<SonicAnalysisPanel />);
  fireEvent.click(await screen.findByLabelText("Only when the computer is idle"));
  fireEvent.click(screen.getByText("Analyze favorites"));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not save analysis schedule");
  expect(backend.startSonicAnalysis).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Only when the computer is idle")).not.toBeChecked();
});

it("shows how many analyzed tracks have a per-second timeline and its size", async () => {
  const status = { analyzed: 1200, total: 1500, pending: 0, failed: 0, timelines: 800, timelineBytes: 9_100_000, profile: "test", idleSupported: true, schedule: { idleOnly: true, idleMinutes: 5, startHour: null, endHour: null } };
  vi.mocked(backend.getSonicStatus).mockResolvedValue(status);
  vi.mocked(backend.getSonicSeeds).mockResolvedValue([]);
  render(<SonicAnalysisPanel />);
  expect(await screen.findByText("Per-second timelines: 800 of 1,200 analyzed tracks · 9 MB on this computer")).toBeInTheDocument();
});

it("formats timeline storage in megabytes and gigabytes", async () => {
  const { storageSize } = await import("./SonicAnalysisPanel");
  expect(storageSize(0)).toBe("0 MB");
  expect(storageSize(13_528_000_000)).toBe("12.6 GB");
});
