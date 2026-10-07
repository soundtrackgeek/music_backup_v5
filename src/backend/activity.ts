import { commands } from "../bindings";
import { listen } from "@tauri-apps/api/event";
import { isTauriRuntime } from "./tauriClient";

export type ActivityJob = {
  id: number;
  kind: string;
  label: string;
  state: "queued" | "running" | "pausing" | "paused" | "cancelling" | "cancelled" | "failed" | "completed";
  progress: number;
  completed: number;
  total: number;
  etaSeconds: number | null;
  message: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  resumable: boolean;
  canCancel: boolean;
  canRetry: boolean;
};
export type JobAction = "pause" | "resume" | "retry" | "cancel";
export function jobActions(job: ActivityJob): JobAction[] {
  if (job.state === "paused") return ["resume", "cancel"];
  if (job.state === "failed" || job.state === "cancelled") return job.canRetry ? ["retry"] : [];
  if (job.state === "queued") return job.resumable ? ["pause", "cancel"] : ["cancel"];
  if (job.state === "running") return [...(job.resumable ? ["pause" as const] : []), ...(job.canCancel ? ["cancel" as const] : [])];
  if (job.state === "pausing" && job.canCancel) return ["cancel"];
  return [];
}
export function activeJob(job: ActivityJob) {
  return ["queued", "running", "pausing", "cancelling"].includes(job.state);
}

const handlers = new Set<(jobs: ActivityJob[]) => void>();
let previewJobs: ActivityJob[] = [];
let nextId = 1;
function emitPreview() { handlers.forEach(handler => handler([...previewJobs])); }
export function previewActivity(kind: string, label: string, state: ActivityJob["state"], completed = 0, total = 0, resumable = false, externalId?: number) {
  const previous = previewJobs.find(job => job.kind === kind && (externalId ? job.id === externalId : activeJob(job)));
  if (previous?.state === "cancelled" && state === "completed") return;
  const now = new Date().toISOString();
  const job: ActivityJob = {
    id: externalId ?? previous?.id ?? nextId++, kind, label, state, completed, total,
    progress: total ? Math.min(100, completed / total * 100) : state === "completed" ? 100 : 0,
    etaSeconds: null, message: total ? `${completed} of ${total} checks complete` : "Browser preview",
    error: state === "failed" ? "Some checks failed. Retry only the failed checks." : null,
    createdAt: previous?.createdAt ?? now, updatedAt: now, resumable, canCancel: resumable, canRetry: resumable,
  };
  previewJobs = [job, ...previewJobs.filter(row => row.id !== job.id)].slice(0, 100);
  emitPreview();
}
// Used by the browser's existing checkpoint queues so Activity controls exercise the same state.
const previewControls = new Map<string, (action: JobAction) => Promise<void>>();
export function registerPreviewControl(kind: string, control: (action: JobAction) => Promise<void>) { previewControls.set(kind, control); }
export async function listActivityJobs() {
  return isTauriRuntime() ? commands.listActivityJobs() as Promise<ActivityJob[]> : [...previewJobs];
}
export async function listenToActivityJobs(handler: (jobs: ActivityJob[]) => void) {
  if (isTauriRuntime()) return listen<ActivityJob[]>("activity-jobs-changed", event => handler(event.payload));
  handlers.add(handler); return () => { handlers.delete(handler); };
}
export async function controlActivityJob(id: number, action: JobAction) {
  if (isTauriRuntime()) return commands.controlActivityJob(id, action) as Promise<ActivityJob[]>;
  const job = previewJobs.find(row => row.id === id);
  if (!job || !jobActions(job).includes(action)) throw new Error("The job changed; refresh Activity and try again.");
  await previewControls.get(job.kind)?.(action);
  const state = action === "pause" ? "paused" : action === "cancel" ? "cancelled" : "running";
  previewJobs = previewJobs.map(row => row.id === id ? { ...row, state, error: null, updatedAt: new Date().toISOString() } : row);
  emitPreview(); return [...previewJobs];
}
