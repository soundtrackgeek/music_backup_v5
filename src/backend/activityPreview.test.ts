import { afterEach, describe, expect, it, vi } from "vitest";
import { getLibraryCompletionVerificationStatus, startLibraryCompletionVerification } from "../backend";
import { controlActivityJob, listActivityJobs } from "./activity";
afterEach(() => vi.useRealTimers());
describe("preview jobs share the workspace checkpoint", () => {
  it("keeps cancellation across snapshot reads and retries remaining checks", async () => {
    vi.useFakeTimers();
    await startLibraryCompletionVerification({ scope: "selection", candidateIds: ["massive attack\u001fmezzanine"], source: null, decade: null, label: "Preview album verification" });
    const current = (await listActivityJobs()).find(job => job.label === "Preview album verification")!;
    expect(current.state).toBe("running");
    await controlActivityJob(current.id, "pause");
    expect((await getLibraryCompletionVerificationStatus()).batch?.state).toBe("paused");
    await controlActivityJob(current.id, "cancel");
    await getLibraryCompletionVerificationStatus();
    expect((await listActivityJobs()).find(job => job.id === current.id)?.state).toBe("cancelled");
    await controlActivityJob(current.id, "retry");
    expect((await getLibraryCompletionVerificationStatus()).batch?.state).toBe("running");
    await vi.advanceTimersByTimeAsync(2000);
    expect((await listActivityJobs()).find(job => job.id === current.id)?.state).toBe("completed");
  });
});
