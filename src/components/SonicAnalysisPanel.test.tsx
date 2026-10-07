import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SonicAnalysisPanel } from "./SonicAnalysisPanel";
import * as backend from "../backend/sonic";

vi.mock("../backend/sonic", () => ({ getSonicStatus: vi.fn(), getSonicSeeds: vi.fn(), configureSonicSchedule: vi.fn(), startSonicAnalysis: vi.fn(), findSonicMatches: vi.fn(), saveSonicPlaylist: vi.fn() }));
vi.mock("../backend/activity", () => ({ listenToActivityJobs: () => Promise.resolve(() => undefined) }));
afterEach(() => vi.resetAllMocks());
it("saves idle and overnight settings separately from queueing an album", async () => {
  const status = { analyzed: 2, total: 100, pending: 98, failed: 0, profile: "test", idleSupported: true, schedule: { idleOnly: true, idleMinutes: 5, startHour: null, endHour: null } };
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
] as const)("saves the visible schedule before starting %s analysis", async (scope, button) => {
  const status = { analyzed: 0, total: 100, pending: 0, failed: 0, profile: "test", idleSupported: true, schedule: { idleOnly: true, idleMinutes: 5, startHour: 22, endHour: 8 } };
  const unrestricted = { idleOnly: false, idleMinutes: 5, startHour: null, endHour: null };
  vi.mocked(backend.getSonicStatus).mockResolvedValueOnce(status).mockResolvedValue({ ...status, schedule: unrestricted });
  vi.mocked(backend.getSonicSeeds).mockResolvedValue([]);
  let finishSave!: (status: backend.SonicStatus) => void;
  vi.mocked(backend.configureSonicSchedule).mockReturnValue(new Promise(resolve => { finishSave = resolve; }));
  vi.mocked(backend.startSonicAnalysis).mockResolvedValue(1);
  render(<SonicAnalysisPanel albumId={scope === "album" ? "album-a" : undefined} />);
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
  const status = { analyzed: 0, total: 100, pending: 0, failed: 0, profile: "test", idleSupported: true, schedule: { idleOnly: true, idleMinutes: 5, startHour: null, endHour: null } };
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
