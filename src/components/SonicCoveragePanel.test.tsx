import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { SonicCoveragePanel } from "./SonicCoveragePanel";
import * as backend from "../backend/sonicDiagnostics";

vi.mock("../backend/sonicDiagnostics", () => ({ checkAnalysisCoverage: vi.fn(), exportMissingAnalysis: vi.fn() }));
const report = { rows: [{ trackId: 1, directory: "Music", filename: "broken.mp3", reason: "Missing file", failed: true }, { trackId: 2, directory: "Music", filename: "new.mp3", reason: "No saved analysis", failed: false }], total: 100, analyzed: 80, missing: 20, failed: 3, nextCursor: 2 };
beforeEach(() => { vi.resetAllMocks(); vi.mocked(backend.checkAnalysisCoverage).mockResolvedValue(report); });

it("checks the master database only on request and separates failures from other gaps", async () => {
  render(<SonicCoveragePanel />);
  expect(backend.checkAnalysisCoverage).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Check analysis coverage"));
  expect(await screen.findByText(/80 of 100 MP3s have saved analysis.*20 missing.*3 recorded failures.*17 need analysis/)).toBeInTheDocument();
  expect(screen.getByText("Failed:")).toBeInTheDocument();
  expect(screen.getByText("Needs analysis:")).toBeInTheDocument();
  vi.mocked(backend.exportMissingAnalysis).mockResolvedValue({ rowCount: 20, path: "missing.csv" });
  fireEvent.click(screen.getByText("Export missing analysis CSV"));
  expect(await screen.findByText(/Exported 20 tracks missing analysis/)).toBeInTheDocument();
});

it("pages the report and keeps the previous result when a recheck fails", async () => {
  render(<SonicCoveragePanel />);
  fireEvent.click(screen.getByText("Check analysis coverage"));
  await screen.findByText("new.mp3");
  vi.mocked(backend.checkAnalysisCoverage).mockResolvedValueOnce({ ...report, rows: [{ ...report.rows[1], trackId: 3, filename: "next.mp3" }], nextCursor: null });
  fireEvent.click(screen.getByText("Next missing tracks"));
  await screen.findByText("next.mp3");
  expect(backend.checkAnalysisCoverage).toHaveBeenLastCalledWith(2);
  vi.mocked(backend.checkAnalysisCoverage).mockRejectedValueOnce(new Error("Master database unavailable"));
  fireEvent.click(screen.getByText("Check analysis coverage"));
  expect(await screen.findByRole("alert")).toHaveTextContent("Master database unavailable");
  expect(screen.getByText("next.mp3")).toBeInTheDocument();
});

it("shows completion only after a successful check finds no gaps", async () => {
  vi.mocked(backend.checkAnalysisCoverage).mockResolvedValue({ ...report, rows: [], analyzed: 100, missing: 0, failed: 0, nextCursor: null });
  render(<SonicCoveragePanel />);
  fireEvent.click(screen.getByText("Check analysis coverage"));
  await screen.findByText("Every cataloged MP3 has completed analysis for the current profile.");
  expect(screen.getByText("Export missing analysis CSV")).toBeDisabled();
});
