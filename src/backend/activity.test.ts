import { describe, expect, it } from "vitest";
import { activeJob, jobActions, type ActivityJob } from "./activity";
function row(state: ActivityJob["state"], resumable = false, canCancel = false): ActivityJob {
  return { id: 1, kind: "covers", label: "Covers", state, progress: 0, completed: 0, total: 0, etaSeconds: null, message: "", error: null, createdAt: "", updatedAt: "", resumable, canCancel, canRetry: true };
}
describe("job capabilities", () => {
  it("offers pause only for checkpoints and queued cancellation for every kind", () => {
    expect(jobActions(row("running"))).toEqual([]);
    expect(jobActions(row("queued"))).toEqual(["cancel"]);
    expect(jobActions(row("running", true, true))).toEqual(["pause", "cancel"]);
    expect(jobActions(row("paused", true, true))).toEqual(["resume", "cancel"]);
  });
  it("counts transitional work but excludes paused, failed and terminal jobs", () => {
    for (const state of ["queued", "running", "pausing", "cancelling"] as const) expect(activeJob(row(state))).toBe(true);
    for (const state of ["paused", "failed", "completed", "cancelled"] as const) expect(activeJob(row(state))).toBe(false);
    expect(jobActions(row("completed"))).toEqual([]);
    expect(jobActions(row("cancelling", true, true))).toEqual([]);
  });
});
