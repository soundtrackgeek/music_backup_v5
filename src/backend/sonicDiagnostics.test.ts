import { beforeEach, expect, it, vi } from "vitest";
import { save } from "@tauri-apps/plugin-dialog";
import { commands } from "../bindings";
import { exportFailedTracks, exportMissingAnalysis } from "./sonicDiagnostics";
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));
vi.mock("./tauriClient", () => ({ isTauriRuntime: () => true }));
vi.mock("../bindings", () => ({ commands: { sonicExportFailedTracks: vi.fn(), sonicExportMissingAnalysis: vi.fn() } }));
beforeEach(() => vi.resetAllMocks());

it("does not export or touch the queue after cancelling the Save dialog", async () => {
  vi.mocked(save).mockResolvedValue(null);
  expect(await exportFailedTracks()).toBeNull();
  expect(await exportMissingAnalysis()).toBeNull();
  expect(commands.sonicExportFailedTracks).not.toHaveBeenCalled();
  expect(commands.sonicExportMissingAnalysis).not.toHaveBeenCalled();
});

it("exports to the chosen CSV path", async () => {
  vi.mocked(save).mockResolvedValue("D:\\Reports\\failures.csv");
  vi.mocked(commands.sonicExportFailedTracks).mockResolvedValue({ path: "D:\\Reports\\failures.csv", rowCount: 105 });
  expect((await exportFailedTracks())?.rowCount).toBe(105);
  expect(commands.sonicExportFailedTracks).toHaveBeenCalledWith("D:\\Reports\\failures.csv");
});
