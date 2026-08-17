import {
  downloadDeemixAlbum,
  listenToDeemixDownloadProgress,
} from "../backend";
import type {
  DeemixAlbumDownloadProgress,
  DeemixAlbumDownloadSummary,
  DeemixAlbumMatch,
} from "../types";

export type DeemixDownloadContext = {
  wishListItemId: number | null;
  musicbrainzReleaseGroupId: string | null;
  label: string;
};

export type DeemixDownloadQueueJob = {
  id: string;
  key: string;
  match: DeemixAlbumMatch;
  context: DeemixDownloadContext;
  allowDuplicate: boolean;
  status: "queued" | "downloading" | "complete" | "failed";
  summary: DeemixAlbumDownloadSummary | null;
  error: string | null;
};

export type DeemixDownloadQueueSnapshot = {
  jobs: DeemixDownloadQueueJob[];
  progress: DeemixAlbumDownloadProgress | null;
  summary: DeemixAlbumDownloadSummary | null;
  error: string | null;
};

const emptySnapshot: DeemixDownloadQueueSnapshot = {
  jobs: [],
  progress: null,
  summary: null,
  error: null,
};

let snapshot = emptySnapshot;
let activeRequestId: string | null = null;
let isProcessing = false;
let generation = 0;
let progressListenerPromise: Promise<void> | null = null;
let unlistenProgress: (() => void) | null = null;
const subscribers = new Set<() => void>();

function publish(next: DeemixDownloadQueueSnapshot) {
  snapshot = next;
  subscribers.forEach((subscriber) => subscriber());
}

function updateSnapshot(
  update: (previous: DeemixDownloadQueueSnapshot) => DeemixDownloadQueueSnapshot,
) {
  publish(update(snapshot));
}

function replaceJobs(
  update: (previous: DeemixDownloadQueueJob[]) => DeemixDownloadQueueJob[],
) {
  updateSnapshot((previous) => ({
    ...previous,
    jobs: update(previous.jobs),
  }));
}

function ensureProgressListener() {
  if (!progressListenerPromise) {
    progressListenerPromise = listenToDeemixDownloadProgress((progress) => {
      if (progress.requestId !== activeRequestId) return;
      updateSnapshot((previous) => ({ ...previous, progress }));
    })
      .then((unlisten) => {
        unlistenProgress = unlisten;
      })
      .catch(() => {
        progressListenerPromise = null;
      });
  }
  return progressListenerPromise;
}

function createRequestId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `download-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;
  const processingGeneration = generation;
  try {
    await ensureProgressListener();
    while (generation === processingGeneration) {
      const next = snapshot.jobs.find((job) => job.status === "queued");
      if (!next) break;

      const requestId = createRequestId();
      activeRequestId = requestId;
      updateSnapshot((previous) => ({
        ...previous,
        summary: null,
        error: null,
        progress: {
          requestId,
          albumId: next.match.id,
          phase: "metadata",
          message: `Preparing ${next.match.title}…`,
          currentTrack: null,
          completedTracks: 0,
          totalTracks: next.match.trackCount ?? 0,
        },
        jobs: previous.jobs.map((job) =>
          job.id === next.id ? { ...job, status: "downloading" } : job,
        ),
      }));

      try {
        const summary = await downloadDeemixAlbum({
          albumId: next.match.id,
          requestId,
          wishListItemId: next.context.wishListItemId,
          musicbrainzReleaseGroupId: next.context.musicbrainzReleaseGroupId,
          expectedArtist: next.match.artist,
          expectedAlbum: next.match.title,
          expectedYear: next.match.year,
          allowDuplicate: next.allowDuplicate,
        });
        if (generation !== processingGeneration) return;
        updateSnapshot((previous) => ({
          ...previous,
          summary,
          jobs: previous.jobs.map((job) =>
            job.id === next.id
              ? { ...job, status: "complete", summary, error: null }
              : job,
          ),
        }));
      } catch (downloadError) {
        if (generation !== processingGeneration) return;
        const error =
          downloadError instanceof Error
            ? downloadError.message
            : String(downloadError);
        updateSnapshot((previous) => ({
          ...previous,
          error,
          jobs: previous.jobs.map((job) =>
            job.id === next.id ? { ...job, status: "failed", error } : job,
          ),
        }));
      } finally {
        if (generation === processingGeneration) {
          activeRequestId = null;
          updateSnapshot((previous) => ({ ...previous, progress: null }));
        }
      }
    }
  } finally {
    if (generation === processingGeneration) isProcessing = false;
  }
}

export function deemixDownloadKey(
  match: DeemixAlbumMatch,
  context: DeemixDownloadContext,
) {
  return `${context.musicbrainzReleaseGroupId ?? context.wishListItemId ?? "deezer"}:${match.id}`;
}

export function enqueueDeemixDownload(
  match: DeemixAlbumMatch,
  context: DeemixDownloadContext,
  allowDuplicate: boolean,
) {
  const key = deemixDownloadKey(match, context);
  if (
    snapshot.jobs.some(
      (job) =>
        job.key === key &&
        (job.status === "queued" || job.status === "downloading"),
    )
  ) {
    return false;
  }

  const job: DeemixDownloadQueueJob = {
    id: `${key}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    key,
    match,
    context,
    allowDuplicate,
    status: "queued",
    summary: null,
    error: null,
  };
  replaceJobs((previous) => [...previous, job]);
  void processQueue();
  return true;
}

export function subscribeToDeemixDownloadQueue(subscriber: () => void) {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

export function getDeemixDownloadQueueSnapshot() {
  return snapshot;
}

export function resetDeemixDownloadQueueForTests() {
  generation += 1;
  activeRequestId = null;
  isProcessing = false;
  unlistenProgress?.();
  unlistenProgress = null;
  progressListenerPromise = null;
  publish(emptySnapshot);
}
