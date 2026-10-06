import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceErrorBoundary } from "./WorkspaceErrorBoundary";
import * as backend from "../backend";
import packageMetadata from "../../package.json";

const clipboard = vi.hoisted(() => ({ writeText: vi.fn() }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => clipboard);

let shouldFail = true;
function BrokenPanel() {
  if (shouldFail) throw new Error("Map rendering failed");
  return <h2>Recovered map</h2>;
}

describe("workspace error recovery", () => {
  beforeEach(() => {
    shouldFail = true;
    clipboard.writeText.mockReset().mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("isolates a failed panel and remounts it on reload", () => {
    render(
      <>
        <nav>Navigation stays available</nav>
        <WorkspaceErrorBoundary name="Music Map">
          <BrokenPanel />
        </WorkspaceErrorBoundary>
      </>,
    );
    expect(screen.getByText("Navigation stays available")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Music Map could not be displayed",
    );
    shouldFail = false;
    fireEvent.click(screen.getByRole("button", { name: "Reload this view" }));
    expect(
      screen.getByRole("heading", { name: "Recovered map" }),
    ).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("copies the workspace, version, error and component stack", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(
      <WorkspaceErrorBoundary name="Music Map">
        <BrokenPanel />
      </WorkspaceErrorBoundary>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy error details" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Error details copied.",
      ),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("Music Map"),
    );
    expect(writeText.mock.calls[0][0]).toContain("Map rendering failed");
    expect(writeText.mock.calls[0][0]).toContain("BrokenPanel");
    expect(writeText.mock.calls[0][0]).toContain(packageMetadata.version);
  });

  it("keeps recovery available when a component throws a non-Error value", () => {
    function InvalidPanel(): never {
      throw "Rendering data is unavailable";
    }
    render(
      <WorkspaceErrorBoundary name="Genres">
        <InvalidPanel />
      </WorkspaceErrorBoundary>,
    );
    expect(screen.getByRole("alert", { name: "Genres error" })).toBeVisible();
    expect(
      screen.getByText(/Rendering data is unavailable/, { selector: "pre" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reload this view" }),
    ).toBeEnabled();
  });

  it("uses the desktop clipboard plugin in Tauri", async () => {
    vi.spyOn(backend, "isTauriRuntime").mockReturnValue(true);
    render(
      <WorkspaceErrorBoundary name="Charts">
        <BrokenPanel />
      </WorkspaceErrorBoundary>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy error details" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Error details copied.",
      ),
    );
    expect(clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("Charts"),
    );
  });

  it("leaves selectable details when the clipboard fails", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    render(
      <WorkspaceErrorBoundary name="Luna">
        <BrokenPanel />
      </WorkspaceErrorBoundary>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy error details" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Could not copy."),
    );
    expect(
      screen.getByText(/Map rendering failed/, { selector: "pre" }),
    ).toHaveTextContent(packageMetadata.version);
  });
});
