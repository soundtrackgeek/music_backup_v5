import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type {
  AlbumDebutTimelineAlbum,
  AlbumDebutTimelineResponse,
} from "../types";
import {
  AlbumTimeRibbon,
  albumsForSeason,
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
  const summerAlbum = album("summer", 1989, 7, 28);
  const autumnAlbum = album("autumn", 1989, 10, 42);
  return {
    years: [
      { year: 1987, albumCount: 1, representativeAlbum: album("early", 1987, 5, 20) },
      { year: 1989, albumCount: 2, representativeAlbum: summerAlbum },
      { year: 1990, albumCount: 1, representativeAlbum: album("late", 1990, 2, 7) },
    ],
    selectedYear: 1989,
    albums: [summerAlbum, autumnAlbum],
    datedAlbumCount: 4,
    undatedAlbumCount: 1,
  };
}

describe("AlbumTimeRibbon", () => {
  it("filters the selected year by season and hands exact albums to playlists", async () => {
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
    expect(screen.getByText(/June – August · 1 of 2 album arrivals/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Search your library/ }));
    expect(onOpenSearch).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Create playlist" }));
    expect(onCreatePlaylist).toHaveBeenCalledWith(
      expect.objectContaining({ albumIds: ["summer"], title: "Relive Summer 1989" }),
    );

    await user.selectOptions(screen.getByLabelText("Timeline season"), "autumn");
    expect(screen.getByText(/September – November · 1 of 2 album arrivals/)).toBeInTheDocument();
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

  it("keeps season and representative sampling deterministic", () => {
    const years = Array.from({ length: 30 }, (_, index) => ({
      year: 1970 + index,
      albumCount: index + 1,
      representativeAlbum: album(`album-${index}`, 1970 + index, 7, 28),
    }));

    expect(albumsForSeason(response().albums, "summer").map((item) => item.id)).toEqual([
      "summer",
    ]);
    const representatives = representativeTimelineYears(years, 1989, 8);
    expect(representatives).toHaveLength(8);
    expect(representatives.some((year) => year.year === 1989)).toBe(true);
  });
});
