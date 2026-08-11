import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LastFmSettingsPanel } from "./LastFmSettingsPanel";

const getLastFmCredentialStatus = vi.fn();
const saveLastFmApiKey = vi.fn();
const testLastFmConnection = vi.fn();
const deleteLastFmApiKey = vi.fn();
const refreshLastFmArtistImages = vi.fn();

vi.mock("../backend", () => ({
  isTauriRuntime: () => true,
  getLastFmCredentialStatus: (...args: unknown[]) => getLastFmCredentialStatus(...args),
  saveLastFmApiKey: (...args: unknown[]) => saveLastFmApiKey(...args),
  testLastFmConnection: (...args: unknown[]) => testLastFmConnection(...args),
  deleteLastFmApiKey: (...args: unknown[]) => deleteLastFmApiKey(...args),
  refreshLastFmArtistImages: (...args: unknown[]) => refreshLastFmArtistImages(...args),
}));

describe("LastFmSettingsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLastFmCredentialStatus.mockResolvedValue({ configured: false, source: "none" });
    saveLastFmApiKey.mockResolvedValue({
      authenticated: true,
      message: "Last.fm connected. Popularity and artist enrichment are ready.",
    });
  });

  it("validates and saves only the read-only API key", async () => {
    render(<LastFmSettingsPanel />);
    fireEvent.change(screen.getByLabelText("Last.fm API key"), {
      target: { value: "lastfm-api-key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save & test" }));

    await waitFor(() => {
      expect(saveLastFmApiKey).toHaveBeenCalledWith({ apiKey: "lastfm-api-key" });
    });
    expect(
      await screen.findByText("Last.fm API key validated and stored securely."),
    ).toBeInTheDocument();
  });

  it("syncs portraits in an explicit bounded batch", async () => {
    getLastFmCredentialStatus.mockResolvedValue({
      configured: true,
      source: "windowsCredentialManager",
    });
    refreshLastFmArtistImages.mockResolvedValue({
      requested: 50,
      downloaded: 42,
      unavailable: 6,
      failed: 2,
      remaining: 100,
      message: "Portrait sync checked 50 artists and cached 42 images.",
    });
    render(<LastFmSettingsPanel />);

    const syncButton = await screen.findByRole("button", { name: "Sync 50 portraits" });
    fireEvent.click(syncButton);

    expect(await screen.findByText("42 portraits downloaded")).toBeInTheDocument();
    expect(refreshLastFmArtistImages).toHaveBeenCalledWith(50);
  });
});
