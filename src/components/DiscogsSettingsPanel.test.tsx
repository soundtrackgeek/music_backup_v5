import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DiscogsSettingsPanel } from "./DiscogsSettingsPanel";

const getDiscogsCredentialStatus = vi.fn();
const saveDiscogsCredentials = vi.fn();
const testDiscogsConnection = vi.fn();
const deleteDiscogsCredentials = vi.fn();

vi.mock("../backend", () => ({
  isTauriRuntime: () => true,
  getDiscogsCredentialStatus: (...args: unknown[]) => getDiscogsCredentialStatus(...args),
  saveDiscogsCredentials: (...args: unknown[]) => saveDiscogsCredentials(...args),
  testDiscogsConnection: (...args: unknown[]) => testDiscogsConnection(...args),
  deleteDiscogsCredentials: (...args: unknown[]) => deleteDiscogsCredentials(...args),
}));

describe("DiscogsSettingsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDiscogsCredentialStatus.mockResolvedValue({ configured: false, source: "none" });
    saveDiscogsCredentials.mockResolvedValue({
      authenticated: true,
      rateLimit: 60,
      rateLimitRemaining: 59,
      message: "Discogs credentials connected. Database fallback is ready.",
    });
  });

  it("validates and saves both consumer credentials together", async () => {
    render(<DiscogsSettingsPanel />);

    fireEvent.change(screen.getByLabelText("Discogs Consumer Key"), {
      target: { value: "consumer-key" },
    });
    fireEvent.change(screen.getByLabelText("Discogs Consumer Secret"), {
      target: { value: "consumer-secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save & test" }));

    await waitFor(() => {
      expect(saveDiscogsCredentials).toHaveBeenCalledWith({
        consumerKey: "consumer-key",
        consumerSecret: "consumer-secret",
      });
    });
    expect(await screen.findByText("Discogs credentials validated and saved securely.")).toBeInTheDocument();
    expect(screen.getByLabelText("Connected Discogs application")).toHaveTextContent(
      "59 of 60 requests currently available",
    );
  });

  it("tests an existing secure credential without revealing it", async () => {
    getDiscogsCredentialStatus.mockResolvedValue({
      configured: true,
      source: "windowsCredentialManager",
    });
    testDiscogsConnection.mockResolvedValue({
      authenticated: true,
      rateLimit: 60,
      rateLimitRemaining: 42,
      message: "Discogs credentials connected. Database fallback is ready.",
    });
    render(<DiscogsSettingsPanel />);

    const button = await screen.findByRole("button", { name: "Test connection" });
    fireEvent.click(button);

    expect(await screen.findByText("Discogs credentials connected. Database fallback is ready.")).toBeInTheDocument();
    expect(testDiscogsConnection).toHaveBeenCalledTimes(1);
  });
});
