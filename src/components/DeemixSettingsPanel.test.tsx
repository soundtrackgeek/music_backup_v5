import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DeemixSettingsPanel } from "./DeemixSettingsPanel";

const deleteDeemixArl = vi.fn();
const getDeemixCredentialStatus = vi.fn();
const saveDeemixArl = vi.fn();
const selectDeemixDownloadDirectory = vi.fn();
const testDeemixConnection = vi.fn();

vi.mock("../backend", () => ({
  deleteDeemixArl: (...args: unknown[]) => deleteDeemixArl(...args),
  getDeemixCredentialStatus: (...args: unknown[]) =>
    getDeemixCredentialStatus(...args),
  isTauriRuntime: () => true,
  saveDeemixArl: (...args: unknown[]) => saveDeemixArl(...args),
  selectDeemixDownloadDirectory: (...args: unknown[]) =>
    selectDeemixDownloadDirectory(...args),
  testDeemixConnection: (...args: unknown[]) =>
    testDeemixConnection(...args),
}));

const connectedAccount = {
  accountName: "Paid account",
  userId: "12345",
  country: "NO",
  canStreamHq: true,
  canStreamLossless: true,
  message: "Connected to Deezer. Lossless streaming is available.",
};

describe("DeemixSettingsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDeemixCredentialStatus.mockResolvedValue({
      configured: false,
      source: "none",
    });
    saveDeemixArl.mockResolvedValue(connectedAccount);
    selectDeemixDownloadDirectory.mockResolvedValue("D:\\Music\\Incoming");
    testDeemixConnection.mockResolvedValue(connectedAccount);
    deleteDeemixArl.mockResolvedValue({ configured: false, source: "none" });
  });

  it("validates and saves an ARL without displaying it again", async () => {
    render(<DeemixSettingsPanel />);
    await screen.findByText("No Deezer ARL configured");

    const input = screen.getByLabelText("Deezer ARL");
    const arl = "ab".repeat(48);
    fireEvent.change(input, { target: { value: arl } });
    fireEvent.click(screen.getByRole("button", { name: "Save & test" }));

    await waitFor(() => expect(saveDeemixArl).toHaveBeenCalledWith(arl));
    expect(await screen.findByText("Paid account")).toBeInTheDocument();
    expect(screen.getByText(/Lossless available/)).toBeInTheDocument();
    expect(input).toHaveValue("");
    expect(screen.queryByText(arl)).not.toBeInTheDocument();
  });

  it("tests and removes an existing stored ARL", async () => {
    getDeemixCredentialStatus.mockResolvedValue({
      configured: true,
      source: "windowsCredentialManager",
    });
    render(<DeemixSettingsPanel />);
    await screen.findByText(/ARL stored securely/);

    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    expect(await screen.findByText("Paid account")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove ARL" }));
    await waitFor(() => expect(deleteDeemixArl).toHaveBeenCalled());
    expect(await screen.findByText("Stored Deemix ARL removed.")).toBeInTheDocument();
  });

  it("selects and clears the future download folder", async () => {
    const onDownloadPathChange = vi.fn().mockResolvedValue(undefined);
    render(
      <DeemixSettingsPanel
        downloadPath={"D:\\Music\\Existing"}
        onDownloadPathChange={onDownloadPathChange}
      />,
    );
    await screen.findByText("No Deezer ARL configured");

    fireEvent.click(screen.getByRole("button", { name: "Browse" }));
    await waitFor(() =>
      expect(selectDeemixDownloadDirectory).toHaveBeenCalledWith(
        "D:\\Music\\Existing",
      ),
    );
    expect(onDownloadPathChange).toHaveBeenCalledWith("D:\\Music\\Incoming");
    expect(
      await screen.findByText("Deemix download folder saved."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() => expect(onDownloadPathChange).toHaveBeenCalledWith(""));
  });

  it("saves FLAC, fallback, and album-folder organization preferences", async () => {
    const onQualityChange = vi.fn().mockResolvedValue(true);
    const onFallbackChange = vi.fn().mockResolvedValue(true);
    const onOrganizationChange = vi.fn().mockResolvedValue(true);
    render(
      <DeemixSettingsPanel
        quality="mp3_320"
        organization="flat_artist_album_year"
        onQualityChange={onQualityChange}
        onFallbackChange={onFallbackChange}
        onOrganizationChange={onOrganizationChange}
      />,
    );
    await screen.findByText("No Deezer ARL configured");

    fireEvent.change(screen.getByLabelText("Deemix audio quality"), {
      target: { value: "flac" },
    });
    await waitFor(() => expect(onQualityChange).toHaveBeenCalledWith("flac"));

    fireEvent.change(screen.getByLabelText("Deemix quality fallback"), {
      target: { value: "exact" },
    });
    await waitFor(() => expect(onFallbackChange).toHaveBeenCalledWith(false));

    fireEvent.change(screen.getByLabelText("Deemix folder organization"), {
      target: { value: "artist_album_year_folders" },
    });
    await waitFor(() =>
      expect(onOrganizationChange).toHaveBeenCalledWith(
        "artist_album_year_folders",
      ),
    );
  });
});
