import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UsenetSettingsPanel } from "./UsenetSettingsPanel";

const getUsenetBootstrap = vi.fn();
const resetUsenet = vi.fn();
const saveUsenetProfile = vi.fn();
const selectUsenetDownloadDirectory = vi.fn();
const testUsenetConnections = vi.fn();

vi.mock("../backend", () => ({
  getUsenetBootstrap: (...args: unknown[]) => getUsenetBootstrap(...args),
  isTauriRuntime: () => true,
  resetUsenet: (...args: unknown[]) => resetUsenet(...args),
  saveUsenetProfile: (...args: unknown[]) => saveUsenetProfile(...args),
  selectUsenetDownloadDirectory: (...args: unknown[]) =>
    selectUsenetDownloadDirectory(...args),
  testUsenetConnections: (...args: unknown[]) => testUsenetConnections(...args),
}));

const profile = {
  prowlarrUrl: "http://127.0.0.1:9696",
  newsHost: "news.newsgroup.ninja",
  newsPort: 563,
  useTls: true,
  username: "",
  downloadDirectory: "D:\\Music\\Usenet",
  connections: 8,
};

describe("UsenetSettingsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUsenetBootstrap.mockResolvedValue({
      profile,
      hasProwlarrApiKey: false,
      hasNewsPassword: false,
      extractorPath: "C:\\Tools\\UnRAR\\UnRAR.exe",
      par2Path: "C:\\Tools\\par2cmdline-turbo\\par2.exe",
    });
    saveUsenetProfile.mockImplementation(async (request) => ({
      profile: request.profile,
      hasProwlarrApiKey: true,
      hasNewsPassword: true,
      extractorPath: "C:\\Tools\\UnRAR\\UnRAR.exe",
      par2Path: "C:\\Tools\\par2cmdline-turbo\\par2.exe",
    }));
    testUsenetConnections.mockResolvedValue({
      prowlarrVersion: "1.37.0",
      newsServer: "news.newsgroup.ninja:563",
      extractorPath: "C:\\Tools\\UnRAR\\UnRAR.exe",
      par2Path: "C:\\Tools\\par2cmdline-turbo\\par2.exe",
      message:
        "Prowlarr search, Newsgroup Ninja authentication, PAR2 repair, and UnRAR are ready.",
    });
    selectUsenetDownloadDirectory.mockResolvedValue("E:\\Incoming\\Usenet");
  });

  it("stores both provider secrets and tests the configured services", async () => {
    render(<UsenetSettingsPanel />);
    await screen.findByText(/Connect Prowlarr search/);
    expect(
      screen.getByText(
        "PAR2 recovery ready: C:\\Tools\\par2cmdline-turbo\\par2.exe",
      ),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Prowlarr API key"), {
      target: { value: "prowlarr-secret" },
    });
    fireEvent.change(screen.getByLabelText("Usenet username"), {
      target: { value: "ninja-listener" },
    });
    fireEvent.change(screen.getByLabelText("Usenet password"), {
      target: { value: "news-secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save & test" }));

    await waitFor(() =>
      expect(saveUsenetProfile).toHaveBeenCalledWith({
        profile: expect.objectContaining({
          prowlarrUrl: "http://127.0.0.1:9696",
          newsHost: "news.newsgroup.ninja",
          newsPort: 563,
          useTls: true,
          username: "ninja-listener",
        }),
        prowlarrApiKey: "prowlarr-secret",
        newsPassword: "news-secret",
      }),
    );
    expect(await screen.findByText("Prowlarr 1.37.0")).toBeInTheDocument();
    expect(screen.getByLabelText("Prowlarr API key")).toHaveValue("");
    expect(screen.getByLabelText("Usenet password")).toHaveValue("");
    expect(screen.queryByText("prowlarr-secret")).not.toBeInTheDocument();
    expect(screen.queryByText("news-secret")).not.toBeInTheDocument();
  });

  it("selects the Usenet destination without saving secrets", async () => {
    render(<UsenetSettingsPanel />);
    await screen.findByText(/Connect Prowlarr search/);

    fireEvent.click(screen.getByRole("button", { name: "Browse" }));
    await waitFor(() =>
      expect(selectUsenetDownloadDirectory).toHaveBeenCalledWith(
        "D:\\Music\\Usenet",
      ),
    );
    expect(screen.getByLabelText("Usenet download folder")).toHaveValue(
      "E:\\Incoming\\Usenet",
    );
  });
});
