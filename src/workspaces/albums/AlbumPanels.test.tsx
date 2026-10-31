import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BrowseResponse, BrowseRow } from "../../types";
import { AlbumTrackTable } from "./AlbumPanels";

function trackRow(overrides: Partial<BrowseRow>): BrowseRow {
  return {
    id: "track",
    trackId: null,
    albumId: "album",
    title: "Untitled",
    canonicalGenre: "Soundtrack",
    love: null,
    ...overrides,
  } as BrowseRow;
}

describe("AlbumTrackTable", () => {
  it("marks loved tracks with a heart and keeps the genre", () => {
    const response = {
      view: "tracks",
      rows: [
        trackRow({ id: "a", title: "Bit by Bit", love: "L" }),
        trackRow({ id: "b", title: "Running for Love" }),
      ],
      total: 2,
      limit: 2,
      offset: 0,
    } as BrowseResponse;

    render(
      <AlbumTrackTable response={response} isLoading={false} popularity={null} />,
    );

    expect(screen.getByRole("columnheader", { name: /loved/i })).toBeTruthy();
    expect(screen.getAllByLabelText("Loved")).toHaveLength(1);
    expect(screen.getAllByLabelText("Not loved")).toHaveLength(1);
    expect(screen.getAllByText("Soundtrack")).toHaveLength(2);
  });
});
