import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PlexSettingsPanel } from "./PlexSettingsPanel";

const getPlexBootstrap = vi.fn();
const savePlexProfile = vi.fn();
const savePlexToken = vi.fn();
const deletePlexToken = vi.fn();
const testPlexConnection = vi.fn();
const syncAllPlexPlaylists = vi.fn();

vi.mock("../backend", () => ({
  isTauriRuntime: () => true,
  getPlexBootstrap: (...args: unknown[]) => getPlexBootstrap(...args),
  savePlexProfile: (...args: unknown[]) => savePlexProfile(...args),
  savePlexToken: (...args: unknown[]) => savePlexToken(...args),
  deletePlexToken: (...args: unknown[]) => deletePlexToken(...args),
  testPlexConnection: (...args: unknown[]) => testPlexConnection(...args),
  syncAllPlexPlaylists: (...args: unknown[]) => syncAllPlexPlaylists(...args),
}));

const bootstrap = {
  profile: {
    baseUrl: "http://localhost:32400",
    libraryName: "Music",
    autoSyncEnabled: true,
    autoSyncMinutes: 360,
  },
  credential: { configured: false, source: "none" as const },
  schedule: {
    nextAutoSyncAt: null,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastError: null,
    cacheTrackCount: 0,
  },
};

describe("PlexSettingsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPlexBootstrap.mockResolvedValue(bootstrap);
    savePlexProfile.mockImplementation(async (profile) => ({
      ...bootstrap,
      profile,
    }));
    savePlexToken.mockResolvedValue({
      configured: true,
      source: "windowsCredentialManager",
    });
  });

  it("saves the server profile and token through separate secure actions", async () => {
    render(<PlexSettingsPanel />);

    await screen.findByDisplayValue("http://localhost:32400");
    fireEvent.change(screen.getByLabelText("Plex music library"), {
      target: { value: "Lossless Music" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => {
      expect(savePlexProfile).toHaveBeenCalledWith({
        baseUrl: "http://localhost:32400",
        libraryName: "Lossless Music",
        autoSyncEnabled: true,
        autoSyncMinutes: 360,
      });
    });

    fireEvent.change(screen.getByLabelText("Plex token"), {
      target: { value: "replacement-token" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save token" }));

    await waitFor(() => {
      expect(savePlexToken).toHaveBeenCalledWith("replacement-token");
    });
    expect(screen.getByLabelText("Plex token")).toHaveValue("");
    expect(
      screen.getByText("Plex token saved securely. Test the connection when ready."),
    ).toBeInTheDocument();
  });

  it("reports tracks that are waiting for Plex without treating them as a failure", async () => {
    getPlexBootstrap.mockResolvedValue({
      ...bootstrap,
      credential: {
        configured: true,
        source: "windowsCredentialManager",
      },
    });
    syncAllPlexPlaylists.mockResolvedValue({
      trigger: "manual",
      playlistCount: 1,
      syncedCount: 1,
      failedCount: 0,
      desiredCount: 12,
      matchedCount: 10,
      missingCount: 2,
      cacheRefreshed: true,
      cacheTrackCount: 1000,
      completedAt: "2026-08-13T12:00:00Z",
      message: "Synchronized 1 Plex playlist; 2 tracks are waiting for Plex.",
      playlists: [],
    });

    render(<PlexSettingsPanel />);
    const syncButton = await screen.findByRole("button", { name: "Sync all now" });
    fireEvent.click(syncButton);

    expect(await screen.findByText("10 matched · 2 waiting for Plex")).toBeInTheDocument();
    expect(syncAllPlexPlaylists).toHaveBeenCalledOnce();
  });
});
