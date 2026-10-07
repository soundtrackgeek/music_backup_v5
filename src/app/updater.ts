import { relaunch } from "@tauri-apps/plugin-process";
import { commands, events } from "../bindings";

export type AppUpdateInfo = {
  currentVersion: string;
  version: string;
  date: string | null;
  notes: string | null;
};

export type AppUpdateInstallProgress = {
  phase: "downloading" | "installing" | "restarting";
  downloadedBytes: number;
  totalBytes: number | null;
  percent: number | null;
};

export type AppUpdateCheckResult = { update: string; info: AppUpdateInfo };
export type AppUpdateSnapshot = {
  checkedAt: string | null;
  info: AppUpdateInfo | null;
  error: string | null;
};

export function getAppUpdateStatus() {
  return commands.getAppUpdateStatus();
}

export function listenToAppUpdateChecks(handler: (snapshot: AppUpdateSnapshot) => void) {
  return events.appUpdateChecked.listen((event) => handler(event.payload));
}

export async function checkForAppUpdate() {
  const snapshot = await commands.checkAppUpdate();
  if (snapshot.error) throw new Error(snapshot.error);
  return snapshot.info ? { update: snapshot.info.version, info: snapshot.info } : null;
}

export async function installAppUpdate(
  update: string,
  onProgress: (progress: AppUpdateInstallProgress) => void,
) {
  const unlisten = await events.appUpdateInstallProgress.listen((event) => onProgress(event.payload));
  try {
    await commands.installAppUpdate(update);
    onProgress({ phase: "restarting", downloadedBytes: 0, totalBytes: null, percent: 100 });
    await relaunch();
  } finally {
    unlisten();
  }
}
