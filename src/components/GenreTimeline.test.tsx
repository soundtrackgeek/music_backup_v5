import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getGenreTimeline } from "../backend";
import type { GenreTimelineResponse } from "../types";
import { GenreTimeline } from "./GenreTimeline";

vi.mock("../backend", () => ({
  getGenreTimeline: vi.fn(),
}));

const timelineResponse: GenreTimelineResponse = {
  genres: [
    {
      id: "rock",
      name: "Rock",
      albumCount: 3,
      firstYear: 1970,
      lastYear: 1990,
      peakYear: 1980,
      peakAlbumCount: 2,
    },
    {
      id: "jazz",
      name: "Jazz",
      albumCount: 2,
      firstYear: 1960,
      lastYear: 1980,
      peakYear: 1970,
      peakAlbumCount: 1,
    },
  ],
  yearCounts: [
    { genreId: "rock", year: 1970, albumCount: 1 },
    { genreId: "rock", year: 1980, albumCount: 2 },
    { genreId: "jazz", year: 1960, albumCount: 1 },
    { genreId: "jazz", year: 1970, albumCount: 1 },
  ],
  albums: [
    {
      albumId: "rock-1",
      album: "River Album",
      albumArtistDisplay: "River Artist",
      genreId: "rock",
      genre: "Rock",
      year: 1980,
    },
  ],
  matchingAlbumCount: 5,
  matchingGenreCount: 2,
  datedAlbumCount: 5,
  availableYearFrom: 1960,
  availableYearTo: 1990,
};

describe("GenreTimeline", () => {
  beforeEach(() => {
    vi.mocked(getGenreTimeline).mockResolvedValue(timelineResponse);
  });

  it("renders the constellation and focuses a selected genre", async () => {
    const user = userEvent.setup();
    render(
      <GenreTimeline
        genreOptions={["Jazz", "Rock", "Scores"]}
        onOpenAlbum={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "Genre constellation" }),
    ).toBeInTheDocument();
    const rockButtons = await screen.findAllByRole("button", {
      name: /Rock, 3 albums/,
    });
    await user.click(rockButtons[0]);

    expect(screen.getByLabelText("Focused genre")).toHaveTextContent("Rock");
    expect(screen.getByLabelText("Focused genre")).toHaveTextContent("1970–1990");
  });

  it("applies include, exclude, and year filters", async () => {
    const user = userEvent.setup();
    render(
      <GenreTimeline
        genreOptions={["Horror", "Rock", "Scores"]}
        onOpenAlbum={vi.fn()}
      />,
    );
    await screen.findByRole("heading", { name: "Genre constellation" });
    await user.click(
      screen.getByRole("button", { name: "Genre constellation filters" }),
    );

    await user.type(screen.getByRole("combobox", { name: "Include genre" }), "Scores{Enter}");
    await user.type(screen.getByRole("combobox", { name: "Exclude genre" }), "Horror{Enter}");
    const yearFrom = screen.getByRole("spinbutton", { name: "Year from" });
    await user.clear(yearFrom);
    await user.type(yearFrom, "1975");

    await waitFor(() =>
      expect(getGenreTimeline).toHaveBeenLastCalledWith(
        expect.objectContaining({
          yearFrom: 1975,
          genres: ["Scores"],
          excludedGenres: ["Horror"],
        }),
      ),
    );
  });

  it("opens the album represented by a constellation dot", async () => {
    const user = userEvent.setup();
    const onOpenAlbum = vi.fn();
    render(
      <GenreTimeline genreOptions={["Rock"]} onOpenAlbum={onOpenAlbum} />,
    );

    const albumPoint = await screen.findByRole("button", {
      name: "River Album by River Artist, 1980, Rock",
    });
    await user.click(albumPoint);

    expect(onOpenAlbum).toHaveBeenCalledWith("rock-1");
  });
});
