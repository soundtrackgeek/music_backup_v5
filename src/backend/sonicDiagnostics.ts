import { save } from "@tauri-apps/plugin-dialog";
import { commands, type AnalysisCoverage, type FailedTrack, type FailedTracksExport, type FailedTracksPage } from "../bindings";
import { isTauriRuntime } from "./tauriClient";
export type { AnalysisCoverage, FailedTrack, FailedTracksPage } from "../bindings";

let previewFailures: FailedTrack[] = [{ trackKey: "preview:missing", directory: "D:\\Music\\Example album", filename: "Missing track.mp3", error: "The system cannot find the file specified.", lastFailedAt: null }];
export function clearPreviewFailures() { previewFailures = []; }
export function previewFailureCount() { return previewFailures.length; }
export async function getFailedTracks(after: string | null = null): Promise<FailedTracksPage> {
  return isTauriRuntime() ? commands.sonicFailedTracks(after) : { rows: structuredClone(previewFailures.filter(row => !after || row.trackKey > after)), total: previewFailures.length, nextCursor: null };
}
export async function checkAnalysisCoverage(after: number | null = null): Promise<AnalysisCoverage> {
  if (isTauriRuntime()) return commands.sonicCheckCoverage(after);
  const failures = previewFailures.map(row => ({ trackId: 1, directory: row.directory, filename: row.filename, reason: row.error, failed: true }));
  const rows = [...failures, { trackId: 2, directory: "D:\\Music\\New album", filename: "New track.mp3", reason: "No saved analysis", failed: false }];
  return { rows: rows.filter(row => row.trackId > (after ?? 0)), total: 3, analyzed: 3 - rows.length, missing: rows.length, failed: failures.length, nextCursor: null };
}
function downloadPreview(name: string, records: string[][]): void {
  const text = records.map(row => row.map(value => `"${(/^[\s]*[=+@-]|^[\t\r\n]/.test(value) ? "'" : "") + value.replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\ufeff", text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
export async function exportFailedTracks(): Promise<FailedTracksExport | null> {
  if (!isTauriRuntime()) {
    downloadPreview("failed-tracks.csv", [["Filename", "Folder", "Failure reason", "Last failed (UTC)", "Track key"], ...previewFailures.map(row => [row.filename, row.directory, row.error, row.lastFailedAt ?? "", row.trackKey])]);
    return { path: "failed-tracks.csv", rowCount: previewFailures.length };
  }
  const path = await save({ title: "Export failed tracks", defaultPath: "failed-tracks.csv", filters: [{ name: "CSV", extensions: ["csv"] }] });
  return path ? commands.sonicExportFailedTracks(path) : null;
}
export async function exportMissingAnalysis(): Promise<FailedTracksExport | null> {
  if (!isTauriRuntime()) {
    const report = await checkAnalysisCoverage();
    downloadPreview("missing-analysis.csv", [["Filename", "Folder", "Status", "Reason", "Catalog track ID"], ...report.rows.map(row => [row.filename, row.directory, row.failed ? "Failed" : "Needs analysis", row.reason, String(row.trackId)])]);
    return { path: "missing-analysis.csv", rowCount: report.missing };
  }
  const path = await save({ title: "Export missing analysis", defaultPath: "missing-analysis.csv", filters: [{ name: "CSV", extensions: ["csv"] }] });
  return path ? commands.sonicExportMissingAnalysis(path) : null;
}
