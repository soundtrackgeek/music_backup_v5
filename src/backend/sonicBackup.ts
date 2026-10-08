import { open } from "@tauri-apps/plugin-dialog";
import { commands, type AnalysisBackup, type AnalysisRestore, type BackupSchedule, type BackupStatus } from "../bindings";
import { isTauriRuntime, selectDirectory } from "./tauriClient";
export type { AnalysisBackup, BackupSchedule, BackupStatus } from "../bindings";
const previewFolder = "OneDrive\\_musicbackup\\sonic-analysis";
const previewBackup: AnalysisBackup = { path: `${previewFolder}\\analysis-preview.sonic-backup`, createdAt: "2026-10-08T12:00:00Z", archiveVersion: 1, profile: "Browser preview", dimensions: 23, audioCount: 54125, databaseBytes: 50000000, sha256: "preview" };
let previewStatus: BackupStatus = { schedule: { enabled: false, intervalHours: 6, backupsToKeep: 7, folder: previewFolder }, lastBackup: null, nextBackupAt: null, lastError: null, running: false };
export async function analysisBackupStatus(): Promise<BackupStatus> { return isTauriRuntime() ? commands.sonicBackupStatus() : structuredClone(previewStatus); }
export async function configureAnalysisBackup(schedule: BackupSchedule): Promise<BackupStatus> {
  if (!Number.isInteger(schedule.intervalHours) || schedule.intervalHours < 1 || schedule.intervalHours > 168 || !Number.isInteger(schedule.backupsToKeep) || schedule.backupsToKeep < 1 || schedule.backupsToKeep > 1000) throw new Error("Choose a backup interval of 1–168 hours and keep 1–1000 automatic backups.");
  if (schedule.enabled && !schedule.folder.trim()) throw new Error("Choose a backup folder before enabling automatic backups.");
  if (isTauriRuntime()) return commands.sonicBackupConfigure(schedule);
  previewStatus = { ...previewStatus, schedule, nextBackupAt: schedule.enabled ? new Date().toISOString() : null, lastError: null };
  return structuredClone(previewStatus);
}
export async function analysisBackupFolder(): Promise<string | null> { return isTauriRuntime() ? (await analysisBackupStatus()).schedule.folder || null : previewFolder; }
export async function chooseAnalysisBackupFolder(current: string): Promise<string | null> { return isTauriRuntime() ? selectDirectory(current, "Choose analysis backup folder") : previewFolder; }
export async function chooseAnalysisBackup(current: string): Promise<string | null> {
  if (!isTauriRuntime()) return previewBackup.path;
  const result = await open({ title: "Choose analysis backup", multiple: false, defaultPath: current || undefined, filters: [{ name: "Sonic analysis backup", extensions: ["sonic-backup"] }] });
  return typeof result === "string" ? result : null;
}
export async function exportAnalysisBackup(folder: string): Promise<AnalysisBackup> { return isTauriRuntime() ? commands.sonicBackupExport(folder) : { ...previewBackup, path: `${folder}\\analysis-preview.sonic-backup` }; }
export async function inspectAnalysisBackup(path: string): Promise<AnalysisBackup> { return isTauriRuntime() ? commands.sonicBackupInspect(path) : { ...previewBackup, path }; }
export async function restoreAnalysisBackup(backup: AnalysisBackup): Promise<AnalysisRestore> { return isTauriRuntime() ? commands.sonicBackupRestore(backup.path, backup.sha256) : { added: backup.audioCount, alreadyPresent: 0, safetyBackup: null }; }
