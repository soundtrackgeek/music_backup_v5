import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceNavigation } from "./navigation";

function NavigationHarness() {
  const [workspace, setWorkspace] = useState("Search");
  useWorkspaceNavigation(workspace, setWorkspace);

  return (
    <>
      <output aria-label="Active workspace">{workspace}</output>
      <button type="button" onClick={() => setWorkspace("Artists")}>
        Open artists
      </button>
      <input aria-label="Search input" />
    </>
  );
}

describe("workspace navigation", () => {
  beforeEach(() => {
    vi.stubGlobal("scrollTo", vi.fn());
  });

  it("opens a clicked workspace at the top", () => {
    render(<NavigationHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Open artists" }));

    expect(screen.getByLabelText("Active workspace")).toHaveTextContent(
      "Artists",
    );
    expect(window.scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: "auto",
    });
  });

  it("uses number shortcuts but preserves typing in editable controls", () => {
    render(<NavigationHarness />);

    fireEvent.keyDown(window, { key: "2" });
    expect(screen.getByLabelText("Active workspace")).toHaveTextContent(
      "Charts",
    );

    const input = screen.getByLabelText("Search input");
    input.focus();
    fireEvent.keyDown(input, { key: "6" });
    expect(screen.getByLabelText("Active workspace")).toHaveTextContent(
      "Charts",
    );

    fireEvent.keyDown(window, { key: "0", ctrlKey: true });
    expect(screen.getByLabelText("Active workspace")).toHaveTextContent(
      "Charts",
    );

    fireEvent.keyDown(window, { key: "0" });
    expect(screen.getByLabelText("Active workspace")).toHaveTextContent(
      "Settings",
    );

    fireEvent.keyDown(window, { key: "w" });
    expect(screen.getByLabelText("Active workspace")).toHaveTextContent(
      "Wish List",
    );
  });
});
