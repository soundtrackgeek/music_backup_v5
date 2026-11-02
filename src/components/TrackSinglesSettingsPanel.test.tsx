import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TrackSinglesSettingsPanel } from "./TrackSinglesSettingsPanel";

const refreshTrackSingles = vi.fn();

vi.mock("../backend", () => ({
  isTauriRuntime: () => true,
  refreshTrackSingles: (...args: unknown[]) => refreshTrackSingles(...args),
}));

describe("TrackSinglesSettingsPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("finds singles in one bounded batch and reports what remains", async () => {
    refreshTrackSingles.mockResolvedValue({
      requested: 25, artistsChecked: 24, singlesFound: 61, failed: 1, remaining: 300, message: "done",
    });
    render(<TrackSinglesSettingsPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Find singles for 25 artists/ }));

    expect(await screen.findByText("61 singles found for 24 artists")).toBeInTheDocument();
    expect(screen.getByText("1 failed · 300 artists remaining")).toBeInTheDocument();
    expect(refreshTrackSingles).toHaveBeenCalledWith(25);
  });

  it("checks every due artist when asked, using the backend's 0 = all convention", async () => {
    refreshTrackSingles.mockResolvedValue({
      requested: 2400, artistsChecked: 2390, singlesFound: 5200, failed: 10, remaining: 10, message: "done",
    });
    render(<TrackSinglesSettingsPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Find singles for all artists" }));

    expect(await screen.findByText("5200 singles found for 2390 artists")).toBeInTheDocument();
    expect(refreshTrackSingles).toHaveBeenCalledWith(0);
  });

  it("shows the failure instead of an empty result", async () => {
    refreshTrackSingles.mockRejectedValue(new Error("MusicBrainz is unreachable"));
    render(<TrackSinglesSettingsPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Find singles for 25/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("MusicBrainz is unreachable");
  });
});
