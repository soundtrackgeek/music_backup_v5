import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SoulseekSettingsPanel } from "./SoulseekSettingsPanel";

const addSoulseekLocalShare = vi.fn();
const connectSoulseek = vi.fn();
const disconnectSoulseek = vi.fn();
const getSoulseekConnection = vi.fn();
const getSoulseekLocalShares = vi.fn();
const getSoulseekUploads = vi.fn();
const removeSoulseekLocalShare = vi.fn();
const resetSoulseekConnection = vi.fn();
const rescanSoulseekLocalShares = vi.fn();
const saveSoulseekConnection = vi.fn();
const selectSoulseekDownloadDirectory = vi.fn();
const selectSoulseekShareDirectory = vi.fn();
const setSoulseekLocalShareEnabled = vi.fn();
const setSoulseekUploadSlots = vi.fn();

vi.mock("../backend", () => ({
  addSoulseekLocalShare: (...args: unknown[]) => addSoulseekLocalShare(...args),
  connectSoulseek: (...args: unknown[]) => connectSoulseek(...args),
  disconnectSoulseek: (...args: unknown[]) => disconnectSoulseek(...args),
  getSoulseekConnection: (...args: unknown[]) => getSoulseekConnection(...args),
  getSoulseekLocalShares: (...args: unknown[]) => getSoulseekLocalShares(...args),
  getSoulseekUploads: (...args: unknown[]) => getSoulseekUploads(...args),
  isTauriRuntime: () => true,
  listenToSoulseekConnection: () => Promise.resolve(() => undefined),
  listenToSoulseekLocalShares: () => Promise.resolve(() => undefined),
  listenToSoulseekUploads: () => Promise.resolve(() => undefined),
  removeSoulseekLocalShare: (...args: unknown[]) => removeSoulseekLocalShare(...args),
  resetSoulseekConnection: (...args: unknown[]) => resetSoulseekConnection(...args),
  rescanSoulseekLocalShares: (...args: unknown[]) => rescanSoulseekLocalShares(...args),
  saveSoulseekConnection: (...args: unknown[]) => saveSoulseekConnection(...args),
  selectSoulseekDownloadDirectory: (...args: unknown[]) =>
    selectSoulseekDownloadDirectory(...args),
  selectSoulseekShareDirectory: (...args: unknown[]) => selectSoulseekShareDirectory(...args),
  setSoulseekLocalShareEnabled: (...args: unknown[]) =>
    setSoulseekLocalShareEnabled(...args),
  setSoulseekUploadSlots: (...args: unknown[]) => setSoulseekUploadSlots(...args),
}));

const profile = {
  username: "",
  serverHost: "server.slsknet.org",
  serverPort: 2242,
  downloadDirectory: "D:\\Music\\Soulseek",
  rememberPassword: true,
  autoConnect: true,
};

const offline = {
  state: "unconfigured",
  username: null,
  server: null,
  message: "Add your Soulseek account to get started.",
  attempt: 0,
  connectedAtMs: null,
  retryInSeconds: null,
  updatedAtMs: 1,
};

const emptyShares = {
  roots: [],
  uploadSlots: 1,
  scanning: false,
  totalFileCount: 0,
  totalDirectoryCount: 0,
  totalSizeBytes: 0,
  lastScanAtMs: null,
};

describe("SoulseekSettingsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSoulseekConnection.mockResolvedValue({
      profile: null,
      suggestedProfile: profile,
      hasPassword: false,
      snapshot: offline,
      diagnosticsPath: "connection.log",
    });
    getSoulseekLocalShares.mockResolvedValue(emptyShares);
    getSoulseekUploads.mockResolvedValue({
      uploads: [],
      activeCount: 0,
      queuedCount: 0,
      sessionUploadedBytes: 0,
    });
    saveSoulseekConnection.mockImplementation(async (nextProfile) => ({
      profile: nextProfile,
      suggestedProfile: profile,
      hasPassword: true,
      snapshot: { ...offline, state: "offline", username: nextProfile.username },
      diagnosticsPath: "connection.log",
    }));
    connectSoulseek.mockResolvedValue({
      ...offline,
      state: "online",
      username: "library-listener",
      server: "server.slsknet.org:2242",
      message: "Connected to Soulseek.",
    });
    selectSoulseekShareDirectory.mockResolvedValue("D:\\Music\\Shared");
    addSoulseekLocalShare.mockResolvedValue({
      ...emptyShares,
      totalFileCount: 42,
      totalSizeBytes: 1_073_741_824,
      roots: [
        {
          id: "share-1",
          path: "D:\\Music\\Shared",
          alias: "Shared",
          enabled: true,
          fileCount: 42,
          directoryCount: 4,
          totalSizeBytes: 1_073_741_824,
          error: null,
        },
      ],
    });
  });

  it("stores an account and connects without redisplaying the password", async () => {
    render(<SoulseekSettingsPanel />);
    await screen.findByText("Add your Soulseek account to get started.");

    fireEvent.change(screen.getByLabelText("Soulseek username"), {
      target: { value: "library-listener" },
    });
    fireEvent.change(screen.getByLabelText("Soulseek password"), {
      target: { value: "unique-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save & connect" }));

    await waitFor(() =>
      expect(saveSoulseekConnection).toHaveBeenCalledWith(
        expect.objectContaining({ username: "library-listener" }),
        "unique-password",
      ),
    );
    expect(await screen.findByText(/ready for Wish List searches/)).toBeInTheDocument();
    expect(screen.getByLabelText("Soulseek password")).toHaveValue("");
    expect(screen.queryByText("unique-password")).not.toBeInTheDocument();
  });

  it("adds an explicit shared folder and reports its indexed files", async () => {
    render(<SoulseekSettingsPanel />);
    await screen.findByText("Nothing is shared until you add a folder.");

    fireEvent.click(screen.getByRole("button", { name: "Add folder" }));

    await waitFor(() =>
      expect(addSoulseekLocalShare).toHaveBeenCalledWith("D:\\Music\\Shared"),
    );
    expect(await screen.findByText("Shared")).toBeInTheDocument();
    expect(screen.getAllByText("42 files · 1.0 GB")).toHaveLength(2);
  });
});
