import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { SonicFailuresPanel } from "./SonicFailuresPanel";
import * as backend from "../backend/sonicDiagnostics";

vi.mock("../backend/sonicDiagnostics", () => ({ getFailedTracks: vi.fn(), exportFailedTracks: vi.fn() }));
const row = { trackKey: "a", directory: "D:\\Music\\Música", filename: "missing.mp3", error: "Missing file\nCheck the drive", lastFailedAt: null };
beforeEach(() => { vi.resetAllMocks(); vi.mocked(backend.getFailedTracks).mockResolvedValue({ rows: [row], total: 1, nextCursor: null }); });

it("shows persisted reasons and queues a failed-only retry", async () => {
  const retry = vi.fn().mockResolvedValue(undefined);
  render(<SonicFailuresPanel disabled={false} revision={0} onRetry={retry} />);
  expect(await screen.findByText("missing.mp3")).toBeInTheDocument();
  expect(screen.getByText(/Missing file.*Check the drive/)).toBeInTheDocument();
  expect(screen.getByText("D:\\Music\\Música")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Retry failed tracks"));
  expect(retry).toHaveBeenCalledOnce();
});

it("exports all saved failures while navigating bounded pages", async () => {
  vi.mocked(backend.getFailedTracks).mockResolvedValueOnce({ rows: [row], total: 105, nextCursor: "a" }).mockResolvedValue({ rows: [{ ...row, trackKey: "b", filename: "later.mp3" }], total: 105, nextCursor: null });
  vi.mocked(backend.exportFailedTracks).mockResolvedValue({ path: "C:\\Reports\\failures.csv", rowCount: 105 });
  render(<SonicFailuresPanel disabled={false} revision={0} onRetry={vi.fn()} />);
  await screen.findByText("missing.mp3");
  fireEvent.click(screen.getByText("Next failed tracks"));
  await screen.findByText("later.mp3");
  expect(backend.getFailedTracks).toHaveBeenLastCalledWith("a");
  fireEvent.click(screen.getByText("Export failed tracks CSV"));
  expect(await screen.findByText(/Exported 105 failed tracks/)).toBeInTheDocument();
  expect(backend.exportFailedTracks).toHaveBeenCalledWith();
});

it("refreshes resolved failures without enabling an empty retry or export", async () => {
  const { rerender } = render(<SonicFailuresPanel disabled={true} revision={0} onRetry={vi.fn()} />);
  await screen.findByText("missing.mp3");
  expect(screen.getByText("Retry failed tracks")).toBeDisabled();
  vi.mocked(backend.getFailedTracks).mockResolvedValue({ rows: [], total: 0, nextCursor: null });
  rerender(<SonicFailuresPanel disabled={false} revision={1} onRetry={vi.fn()} />);
  await screen.findByText("No unresolved analysis failures.");
  expect(screen.getByText("Retry failed tracks")).toBeDisabled();
  expect(screen.getByText("Export failed tracks CSV")).toBeDisabled();
});

it("keeps the list when export is cancelled and shows write failures", async () => {
  vi.mocked(backend.exportFailedTracks).mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("Disk is full"));
  render(<SonicFailuresPanel disabled={false} revision={0} onRetry={vi.fn()} />);
  await screen.findByText("missing.mp3");
  fireEvent.click(screen.getByText("Export failed tracks CSV"));
  await waitFor(() => expect(screen.getByText("Export failed tracks CSV")).toBeEnabled());
  expect(screen.queryByText(/Exported/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Export failed tracks CSV"));
  expect(await screen.findByRole("alert")).toHaveTextContent("Disk is full");
  expect(screen.getByText("missing.mp3")).toBeInTheDocument();
});
