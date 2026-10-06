import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityCenter } from "./ActivityCenter";
import type { ActivityJob } from "../backend/activity";

const mocks = vi.hoisted(() => ({ read: vi.fn(), listen: vi.fn(), control: vi.fn() }));
vi.mock("../backend/activity", async importOriginal => ({ ...(await importOriginal<typeof import("../backend/activity")>()), listActivityJobs: mocks.read, listenToActivityJobs: mocks.listen, controlActivityJob: mocks.control }));
const job = (id: number, state: ActivityJob["state"], resumable = true): ActivityJob => ({ id, kind: "albumVerification", label: `Verification ${id}`, state, progress: 40, completed: 2, total: 5, etaSeconds: 90, message: "2 of 5 checks complete", error: state === "failed" ? "Provider unavailable" : null, createdAt: "2026-10-06T12:00:00Z", updatedAt: "2026-10-06T12:00:00Z", resumable, canCancel: resumable, canRetry: true });
let emit: (jobs: ActivityJob[]) => void;
beforeEach(() => {
  mocks.read.mockResolvedValue([]);
  mocks.listen.mockImplementation(async handler => { emit = handler; return vi.fn(); });
  mocks.control.mockResolvedValue([]);
});
describe("Activity Center", () => {
  it("lists jobs from every workspace, filters and restores keyboard focus", async () => {
    mocks.read.mockResolvedValue([job(1, "running"), job(2, "paused"), job(3, "failed"), job(4, "completed")]);
    const user = userEvent.setup(); render(<ActivityCenter />);
    const trigger = await screen.findByRole("button", { name: "Open Activity Center, 1 active jobs" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Activity Center" });
    expect(within(dialog).getByRole("button", { name: "Pause Verification 1" })).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Resume Verification 2" })).toBeVisible();
    expect(within(dialog).getByRole("button", { name: "Retry Verification 3" })).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Needs attention" }));
    expect(within(dialog).queryByText("Verification 1")).not.toBeInTheDocument();
    expect(within(dialog).getByText("Provider unavailable")).toBeVisible();
    await user.keyboard("{Escape}"); expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(trigger).toHaveFocus();
  });
  it("keeps a newer worker event when a control response arrives late", async () => {
    mocks.read.mockResolvedValue([job(1, "running")]);
    let resolve!: (jobs: ActivityJob[]) => void;
    mocks.control.mockImplementation(() => new Promise<ActivityJob[]>(done => { resolve = done; }));
    const user = userEvent.setup(); render(<ActivityCenter />);
    await user.click(await screen.findByRole("button", { name: "Open Activity Center, 1 active jobs" }));
    await user.click(screen.getByRole("button", { name: "Pause Verification 1" }));
    act(() => emit([job(1, "completed")]));
    await act(async () => resolve([job(1, "pausing")]));
    expect(screen.getByText("Finished", { selector: "span" })).toBeVisible(); expect(screen.queryByText("Pausing after this check")).not.toBeInTheDocument();
  });
  it("hides unsupported controls and reports failures without closing the drawer", async () => {
    mocks.read.mockResolvedValue([job(1, "running", false), job(2, "failed")]);
    mocks.control.mockRejectedValue(new Error("Another verification job is active"));
    const user = userEvent.setup(); render(<ActivityCenter />);
    await user.click(await screen.findByRole("button", { name: "Open Activity Center, 1 active jobs" }));
    expect(screen.queryByRole("button", { name: "Pause Verification 1" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel Verification 1" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry Verification 2" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Another verification job is active"));
    expect(screen.getByRole("dialog")).toBeVisible();
  });
});
