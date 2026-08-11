import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import {
  ArtistDetailTabs,
  artistDetailTabNeedsMusicBrainz,
  artistDetailTabNeedsPopularity,
  artistDetailTabNeedsTracks,
  type ArtistDetailTab,
} from "./ArtistsWorkspace";

function ArtistDetailTabsHarness() {
  const [activeTab, setActiveTab] = useState<ArtistDetailTab>("overview");

  return (
    <ArtistDetailTabs activeTab={activeTab} onChange={setActiveTab}>
      <p>{`Active panel: ${activeTab}`}</p>
    </ArtistDetailTabs>
  );
}

describe("artist detail tabs", () => {
  it("opens the overview first and changes only the active panel", () => {
    render(<ArtistDetailTabsHarness />);

    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tabpanel")).toHaveTextContent(
      "Active panel: overview",
    );

    fireEvent.click(screen.getByRole("tab", { name: "Artist info" }));

    expect(screen.getByRole("tab", { name: "Artist info" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tabpanel")).toHaveTextContent(
      "Active panel: artist-info",
    );
  });

  it("supports arrow, Home, and End keyboard navigation", () => {
    render(<ArtistDetailTabsHarness />);

    const overviewTab = screen.getByRole("tab", { name: "Overview" });
    overviewTab.focus();
    fireEvent.keyDown(overviewTab, { key: "ArrowRight" });

    const localAlbumsTab = screen.getByRole("tab", { name: "Local albums" });
    expect(localAlbumsTab).toHaveFocus();
    expect(localAlbumsTab).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(localAlbumsTab, { key: "End" });
    const coverViewTab = screen.getByRole("tab", { name: "Cover view" });
    expect(coverViewTab).toHaveFocus();
    expect(coverViewTab).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(coverViewTab, { key: "Home" });
    expect(overviewTab).toHaveFocus();
    expect(overviewTab).toHaveAttribute("aria-selected", "true");
  });

  it("identifies the views that may start deferred data requests", () => {
    expect(artistDetailTabNeedsMusicBrainz("local-albums")).toBe(false);
    expect(artistDetailTabNeedsMusicBrainz("artist-info")).toBe(true);
    expect(artistDetailTabNeedsMusicBrainz("discography")).toBe(true);
    expect(artistDetailTabNeedsMusicBrainz("cover-view")).toBe(false);

    expect(artistDetailTabNeedsTracks("local-albums")).toBe(false);
    expect(artistDetailTabNeedsTracks("artist-info")).toBe(false);
    expect(artistDetailTabNeedsTracks("discography")).toBe(false);
    expect(artistDetailTabNeedsTracks("cover-view")).toBe(true);

    expect(artistDetailTabNeedsPopularity("overview")).toBe(true);
    expect(artistDetailTabNeedsPopularity("local-albums")).toBe(false);
    expect(artistDetailTabNeedsPopularity("artist-info")).toBe(false);
    expect(artistDetailTabNeedsPopularity("discography")).toBe(false);
    expect(artistDetailTabNeedsPopularity("cover-view")).toBe(false);
  });
});
