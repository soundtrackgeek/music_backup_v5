import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  vi.mocked(backend.configureSonicSchedule).mockResolvedValue(status);
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
