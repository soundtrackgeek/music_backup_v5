import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkForAppUpdate, getAppUpdateStatus, installAppUpdate, listenToAppUpdateChecks } from "./updater";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn(), relaunch: vi.fn() }));
vi.mock("../backend/tauriClient", () => ({ invoke: mocks.invoke, listen: mocks.listen }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: mocks.relaunch }));

const info = { currentVersion: "1.0.0", version: "1.1.0", date: null, notes: "Changes" };

describe("Rust updater bridge", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads the startup snapshot and receives scheduled checks without another provider call", async () => {
    const snapshot = { checkedAt: "now", info, error: null };
    mocks.invoke.mockResolvedValue(snapshot);
    expect(await getAppUpdateStatus()).toEqual(snapshot);
    expect(mocks.invoke).toHaveBeenCalledWith("get_app_update_status");
    const receive = vi.fn();
    await listenToAppUpdateChecks(receive);
    mocks.listen.mock.calls[0][1]({ payload: snapshot });
    expect(receive).toHaveBeenCalledWith(snapshot);
  });

  it("manual checks use the shared backend update and report failures", async () => {
    mocks.invoke.mockResolvedValue({ info, error: null });
    expect(await checkForAppUpdate()).toEqual({ info, update: "1.1.0" });
    expect(mocks.invoke).toHaveBeenCalledWith("check_app_update");
    mocks.invoke.mockResolvedValue({ info: null, error: null });
    expect(await checkForAppUpdate()).toBeNull();
    mocks.invoke.mockResolvedValue({ info, error: "offline" });
    await expect(checkForAppUpdate()).rejects.toThrow("offline");
  });

  it("subscribes before installing the selected version and cleans up after success", async () => {
    const cleanup = vi.fn();
    mocks.listen.mockResolvedValue(cleanup);
    mocks.invoke.mockImplementation(async () => {
      expect(mocks.listen).toHaveBeenCalledWith("app-update-install-progress", expect.any(Function));
      mocks.listen.mock.calls[0][1]({ payload: { phase: "downloading", percent: 50 } });
    });
    const progress = vi.fn();
    await installAppUpdate("1.1.0", progress);
    expect(mocks.invoke).toHaveBeenCalledWith("install_app_update", { version: "1.1.0" });
    expect(progress).toHaveBeenCalledWith({ phase: "downloading", percent: 50 });
    expect(mocks.relaunch).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("cleans up failed installations without relaunching", async () => {
    const cleanup = vi.fn();
    mocks.listen.mockResolvedValue(cleanup);
    mocks.invoke.mockRejectedValue(new Error("signature mismatch"));
    await expect(installAppUpdate("1.1.0", vi.fn())).rejects.toThrow("signature mismatch");
    expect(cleanup).toHaveBeenCalledOnce();
    expect(mocks.relaunch).not.toHaveBeenCalled();
  });
});
