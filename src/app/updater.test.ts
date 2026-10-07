import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkForAppUpdate, getAppUpdateStatus, installAppUpdate, listenToAppUpdateChecks } from "./updater";

const mocks = vi.hoisted(() => ({
  installAppUpdate: vi.fn(),
  listenChecked: vi.fn(),
  listenInstall: vi.fn(),
  relaunch: vi.fn(),
  getAppUpdateStatus: vi.fn(),
  checkAppUpdate: vi.fn(),
}));
vi.mock("../bindings", () => ({
  commands: {
    getAppUpdateStatus: mocks.getAppUpdateStatus,
    checkAppUpdate: mocks.checkAppUpdate,
    installAppUpdate: mocks.installAppUpdate,
  },
  events: {
    appUpdateChecked: { listen: mocks.listenChecked },
    appUpdateInstallProgress: { listen: mocks.listenInstall },
  },
}));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: mocks.relaunch }));

const info = { currentVersion: "1.0.0", version: "1.1.0", date: null, notes: "Changes" };

describe("Rust updater bridge", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads the startup snapshot and receives scheduled checks without another provider call", async () => {
    const snapshot = { checkedAt: "now", info, error: null };
    mocks.getAppUpdateStatus.mockResolvedValue(snapshot);
    expect(await getAppUpdateStatus()).toEqual(snapshot);
    expect(mocks.getAppUpdateStatus).toHaveBeenCalledTimes(1);
    const receive = vi.fn();
    await listenToAppUpdateChecks(receive);
    mocks.listenChecked.mock.calls[0][0]({ payload: snapshot });
    expect(receive).toHaveBeenCalledWith(snapshot);
  });

  it("manual checks use the shared backend update and report failures", async () => {
    mocks.checkAppUpdate.mockResolvedValue({ info, error: null });
    expect(await checkForAppUpdate()).toEqual({ info, update: "1.1.0" });
    expect(mocks.checkAppUpdate).toHaveBeenCalledTimes(1);
    mocks.checkAppUpdate.mockResolvedValue({ info: null, error: null });
    expect(await checkForAppUpdate()).toBeNull();
    mocks.checkAppUpdate.mockResolvedValue({ info, error: "offline" });
    await expect(checkForAppUpdate()).rejects.toThrow("offline");
  });

  it("subscribes before installing the selected version and cleans up after success", async () => {
    const cleanup = vi.fn();
    mocks.listenInstall.mockResolvedValue(cleanup);
    mocks.installAppUpdate.mockImplementation(async () => {
      expect(mocks.listenInstall).toHaveBeenCalledWith(expect.any(Function));
      mocks.listenInstall.mock.calls[0][0]({ payload: { phase: "downloading", percent: 50 } });
    });
    const progress = vi.fn();
    await installAppUpdate("1.1.0", progress);
    expect(mocks.installAppUpdate).toHaveBeenCalledWith("1.1.0");
    expect(progress).toHaveBeenCalledWith({ phase: "downloading", percent: 50 });
    expect(mocks.relaunch).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("cleans up failed installations without relaunching", async () => {
    const cleanup = vi.fn();
    mocks.listenInstall.mockResolvedValue(cleanup);
    mocks.installAppUpdate.mockRejectedValue(new Error("signature mismatch"));
    await expect(installAppUpdate("1.1.0", vi.fn())).rejects.toThrow("signature mismatch");
    expect(cleanup).toHaveBeenCalledOnce();
    expect(mocks.relaunch).not.toHaveBeenCalled();
  });
});
