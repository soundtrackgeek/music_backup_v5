import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createRequest } from "../app/requests";
import type { InsightCohort } from "../app/insightCohorts";
import { InsightActionDock } from "./InsightActionDock";

const cohort: InsightCohort = {
  id: "decade:1980",
  title: "1980s albums",
  description: "A focused decade cohort.",
  count: 120,
  request: createRequest("albums"),
  playlistPrompt: "Build from the 1980s.",
};

describe("InsightActionDock", () => {
  it("offers the consistent cohort actions and saves once", async () => {
    const open = vi.fn();
    const save = vi.fn().mockResolvedValue(undefined);
    const playlist = vi.fn();

    render(
      <InsightActionDock
        cohort={cohort}
        onOpenInSearch={open}
        onSaveView={save}
        onBuildPlaylist={playlist}
        onClear={vi.fn()}
      />,
    );

    expect(
      screen.getByText("120 albums · A focused decade cohort."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open in Search" }));
    fireEvent.click(screen.getByRole("button", { name: "Save view" }));
    fireEvent.click(screen.getByRole("button", { name: "Build playlist" }));

    expect(open).toHaveBeenCalledWith(cohort);
    expect(save).toHaveBeenCalledWith(cohort);
    expect(playlist).toHaveBeenCalledWith(cohort);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "View saved" })).toBeDisabled(),
    );
  });

  it("explains how to activate actions before a cohort is selected", () => {
    render(
      <InsightActionDock
        cohort={null}
        onOpenInSearch={vi.fn()}
        onSaveView={vi.fn()}
        onBuildPlaylist={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    expect(screen.getByText("Select a cohort to take action")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open in Search" })).toBeNull();
  });
});
