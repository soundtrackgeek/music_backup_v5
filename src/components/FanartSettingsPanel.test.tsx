import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FanartSettingsPanel } from "./FanartSettingsPanel";

const api = vi.hoisted(() => ({ getFanartCredentialStatus: vi.fn(), saveFanartKeys: vi.fn(), deleteFanartKeys: vi.fn(), testFanartConnection: vi.fn(), syncArtistArtwork: vi.fn() }));
vi.mock("../backend/artistArtwork", () => api);
vi.mock("../backend/tauriClient", () => ({ isTauriRuntime: () => true }));
describe("FanartSettingsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getFanartCredentialStatus.mockResolvedValue({ configured: false, personalKeyConfigured: false, source: "none" });
    api.saveFanartKeys.mockResolvedValue({ configured: true, personalKeyConfigured: true, source: "windowsCredentialManager" });
  });
  it("validates project and optional personal credentials then clears both inputs", async () => {
    render(<FanartSettingsPanel />);
    await screen.findByText("No personal key configured.");
    fireEvent.change(screen.getByLabelText("fanart.tv project API key"), { target: { value: "a".repeat(32) } });
    fireEvent.change(screen.getByLabelText("fanart.tv personal API key"), { target: { value: "b".repeat(32) } });
    fireEvent.click(screen.getByRole("button", { name: "Save & test" }));
    await screen.findByText("fanart.tv keys validated and stored securely.");
    expect(api.saveFanartKeys).toHaveBeenCalledWith({ apiKey: "a".repeat(32), personalKey: "b".repeat(32) });
    expect(screen.getByLabelText("fanart.tv project API key")).toHaveValue("");
    expect(screen.getByLabelText("fanart.tv personal API key")).toHaveValue("");
    expect(screen.getByText("Personal key configured.")).toBeInTheDocument();
  });
  it("allows a Commons batch without fanart credentials", async () => {
    api.syncArtistArtwork.mockResolvedValue({ message: "Checked 50 artists: 12 with artwork." });
    render(<FanartSettingsPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Sync 50 artists" }));
    await screen.findByText("Checked 50 artists: 12 with artwork.");
    expect(api.syncArtistArtwork).toHaveBeenCalledWith(50);
    expect(screen.getByRole("button", { name: "Test connection" })).toBeDisabled();
  });
  it("surfaces failed validation without claiming stored credentials", async () => {
    api.saveFanartKeys.mockRejectedValue(new Error("fanart.tv request failed (HTTP 401)."));
    render(<FanartSettingsPanel />);
    await waitFor(() => expect(api.getFanartCredentialStatus).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText("fanart.tv project API key"), { target: { value: "a".repeat(32) } });
    fireEvent.click(screen.getByRole("button", { name: "Save & test" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("HTTP 401");
    expect(screen.getByRole("button", { name: "Test connection" })).toBeDisabled();
  });
});
