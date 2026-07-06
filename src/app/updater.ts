import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";

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

export type AppUpdateCheckResult = {
  update: Update;
  info: AppUpdateInfo;
};

export async function checkForAppUpdate() {
  const update = await check({ timeout: 15_000 });
  if (!update) {
    return null;
  }

  return {
    update,
    info: {
      currentVersion: update.currentVersion,
      version: update.version,
      date: update.date ?? null,
      notes: update.body ?? null,
    },
  } satisfies AppUpdateCheckResult;
}

export async function installAppUpdate(
  update: Update,
  onProgress: (progress: AppUpdateInstallProgress) => void,
) {
  let downloadedBytes = 0;
  let totalBytes: number | null = null;

  await update.download((event: DownloadEvent) => {
    if (event.event === "Started") {
      downloadedBytes = 0;
      totalBytes = event.data.contentLength ?? null;
    } else if (event.event === "Progress") {
      downloadedBytes += event.data.chunkLength;
    }

    const percent = totalBytes && totalBytes > 0 ? Math.min(100, (downloadedBytes / totalBytes) * 100) : null;
    onProgress({ phase: "downloading", downloadedBytes, totalBytes, percent });
  });

  onProgress({ phase: "installing", downloadedBytes, totalBytes, percent: 100 });
  await update.install();
  onProgress({ phase: "restarting", downloadedBytes, totalBytes, percent: 100 });
  await relaunch();
}
