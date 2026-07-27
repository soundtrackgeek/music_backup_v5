import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type {
  AlbumDebutTimelineAlbum,
  AlbumDebutTimelineResponse,
} from "../types";
import {
  AlbumTimeRibbon,
  albumsForPeriod,
  monthsInRange,
  representativeTimelineYears,
} from "./AlbumTimeRibbon";

function album(
  id: string,
  year: number,
  month: number,
  week: number,
): AlbumDebutTimelineAlbum {
  return {
    id,
    albumId: id,
    album: `Album ${id}`,
    albumArtistDisplay: "Pet Shop Boys",
    canonicalGenre: "Synthpop",
    year,
    albumScore: 8.4,
    billboardRank: 17,
    billboardYear: year,
    billboardDebutYear: year,
    billboardDebutMonth: month,
    billboardDebutWeek: week,
    billboardDebutWeekKey: `${year}-W${String(week).padStart(2, "0")}`,
    coverPath: null,
    coverMimeType: null,
  };
}

function response(): AlbumDebutTimelineResponse {
  const januaryAlbum = album("january", 1989, 1, 2);
  const summerAlbum = album("summer", 1989, 7, 28);
  const fallAlbum = album("fall", 1989, 10, 42);
  const christmasAlbum = album("christmas", 1989, 12, 51);
  return {
    years: [
      { year: 1987, albumCount: 1, representativeAlbum: album("early", 1987, 5, 20) },
      { year: 1989, albumCount: 4, representativeAlbum: summerAlbum },
      { year: 1990, albumCount: 1, representativeAlbum: album("late", 1990, 2, 7) },
    ],
    selectedYear: 1989,
    albums: [januaryAlbum, summerAlbum, fallAlbum, christmasAlbum],
    datedAlbumCount: 6,
    undatedAlbumCount: 1,
  };
}

describe("AlbumTimeRibbon", () => {
  it("offers every preset and hands the selected period to playlists", async () => {
    const user = userEvent.setup();
    const onCreatePlaylist = vi.fn();
    const onOpenSearch = vi.fn();
    render(
      <AlbumTimeRibbon
        data={response()}
        error={null}
        isLoading={false}
        onCreatePlaylist={onCreatePlaylist}
        onOpenAlbum={vi.fn()}
        onOpenSearch={onOpenSearch}
        onRetry={vi.fn()}
        onSelectYear={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Albums through the years" })).toBeInTheDocument();
    expect(screen.getByText(/June – August · 1 of 4 album arrivals/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Search your library/ }));
    expect(onOpenSearch).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Create playlist" }));
    expect(onCreatePlaylist).toHaveBeenCalledWith(
      expect.objectContaining({ albumIds: ["summer"], title: "Relive Summer 1989" }),
    );

    await user.click(screen.getByRole("button", { name: "Period: Summer 1989" }));
    expect(screen.getByRole("dialog", { name: "Choose timeline period" })).toBeInTheDocument();
    for (const preset of [
      "Spring",
      "Summer",
      "Fall",
      "Winter",
      "Christmas",
      "New Year",
      "Full year",
    ]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${preset}`) })).toBeInTheDocument();
    }

    await user.click(screen.getByRole("button", { name: /^Fall/ }));
    expect(screen.getByText(/September – November · 1 of 4 album arrivals/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create playlist" }));
    expect(onCreatePlaylist).toHaveBeenLastCalledWith(
      expect.objectContaining({ albumIds: ["fall"], title: "Relive Fall 1989" }),
    );
  });

  it("supports a single custom month and wrapping month ranges", async () => {
    const user = userEvent.setup();
    const onCreatePlaylist = vi.fn();
    render(
      <AlbumTimeRibbon
        data={response()}
        error={null}
        isLoading={false}
        onCreatePlaylist={onCreatePlaylist}
        onOpenAlbum={vi.fn()}
        onOpenSearch={vi.fn()}
        onRetry={vi.fn()}
        onSelectYear={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Period: Summer 1989" }));
    await user.selectOptions(screen.getByLabelText("Custom period from month"), "1");
    await user.selectOptions(screen.getByLabelText("Custom period to month"), "1");
    await user.click(screen.getByRole("button", { name: "Show January" }));

    expect(screen.getByRole("button", { name: "Period: January 1989" })).toBeInTheDocument();
    expect(screen.getByText(/January · 1 of 4 album arrivals/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create playlist" }));
    expect(onCreatePlaylist).toHaveBeenCalledWith(
      expect.objectContaining({ albumIds: ["january"], title: "Relive January 1989" }),
    );
    expect(monthsInRange(11, 2)).toEqual([11, 12, 1, 2]);
  });

  it("navigates to another available chart year", async () => {
    const user = userEvent.setup();
    const onSelectYear = vi.fn();
    render(
      <AlbumTimeRibbon
        data={response()}
        error={null}
        isLoading={false}
        onCreatePlaylist={vi.fn()}
        onOpenAlbum={vi.fn()}
        onOpenSearch={vi.fn()}
        onRetry={vi.fn()}
        onSelectYear={onSelectYear}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Next chart year" }));
    expect(onSelectYear).toHaveBeenCalledWith(1990);
  });

  it("keeps period and representative sampling deterministic", () => {
    const years = Array.from({ length: 30 }, (_, index) => ({
      year: 1970 + index,
      albumCount: index + 1,
      representativeAlbum: album(`album-${index}`, 1970 + index, 7, 28),
    }));

    expect(albumsForPeriod(response().albums, [6, 7, 8]).map((item) => item.id)).toEqual([
      "summer",
    ]);
    const representatives = representativeTimelineYears(years, 1989, 8);
    expect(representatives).toHaveLength(8);
    expect(representatives.some((year) => year.year === 1989)).toBe(true);
  });
});
