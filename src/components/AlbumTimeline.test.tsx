import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { BrowseRow } from "../types";
import { AlbumTimeline } from "./AlbumTimeline";

function album(
  id: string,
  title: string,
  year: number,
  month: number,
  week: number,
  weekKey = `${year}-W${String(week).padStart(2, "0")}`,
): BrowseRow {
  return {
    id,
    albumId: id,
    album: title,
    albumArtistDisplay: "Pet Shop Boys",
    billboardDebutYear: year,
    billboardDebutMonth: month,
    billboardDebutWeek: week,
    billboardDebutWeekKey: weekKey,
    coverPath: null,
    coverMimeType: null,
  } as BrowseRow;
}

describe("AlbumTimeline", () => {
  it("opens on the busiest year and lets users explore another year", async () => {
    const user = userEvent.setup();
    render(
      <AlbumTimeline
        rows={[
          album("actually", "Actually", 1989, 6, 24),
          album("behaviour", "Behaviour", 1989, 8, 34),
          album("very", "Very", 1993, 1, 53, "1992-W53"),
        ]}
      />,
    );

    expect(screen.getByText(/3 albums across 1989–1993/)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "1989: 2 albums" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    expect(screen.getByText("June")).toBeInTheDocument();
    expect(screen.getByText("Jun 1989 · Week 24")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "1993: 1 album" }));

    expect(screen.getByText("Very")).toBeInTheDocument();
    expect(screen.getByText("Jan 1993 · Week 53")).toBeInTheDocument();
  });

  it("explains how to populate an empty timeline", () => {
    render(<AlbumTimeline rows={[]} />);

    expect(screen.getByText("No debut weeks in this chart yet")).toBeInTheDocument();
    expect(screen.getByText(/Import the CSV_ALBUMS folder/)).toBeInTheDocument();
  });
});
