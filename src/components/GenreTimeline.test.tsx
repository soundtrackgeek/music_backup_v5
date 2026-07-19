import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { GenreSummary } from "../types";
import { GenreTimeline } from "./GenreTimeline";

function genre(
  id: string,
  name: string,
  firstYear: number,
  lastYear: number,
  albumCount: number,
  completeness: number,
): GenreSummary {
  return {
    id,
    name,
    albumCount,
    ratedAlbumCount: 0,
    partialAlbumCount: 0,
    unratedAlbumCount: albumCount,
    trackCount: albumCount * 10,
    totalSeconds: 0,
    lovedTracks: 2,
    tmoeSeconds: 0,
    averageRatingCompleteness: completeness,
    averageAlbumRating: null,
    averageAlbumScore: null,
    firstYear,
    lastYear,
    topArtist: null,
  };
}

const genres = [
  genre("rock", "Rock", 1970, 1999, 20, 0.5),
  genre("synthpop", "Synthpop", 1981, 2005, 12, 1),
];

describe("GenreTimeline", () => {
  it("filters timeline rows and selects a genre", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <GenreTimeline
        genres={genres}
        totalGenres={318}
        isLoading={false}
        error={null}
        selectedGenreId="rock"
        resetSignal={0}
        onSelect={onSelect}
      />,
    );

    expect(
      screen.getByText(
        "Observed years describe this library, not the historical origin or end of a genre.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText("1970").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2005").length).toBeGreaterThan(0);

    await user.type(
      screen.getByRole("textbox", { name: "Search timeline genres" }),
      "synth",
    );

    expect(screen.queryByText("Rock")).not.toBeInTheDocument();
    const synthpopRow = screen.getByRole("button", {
      name: /Synthpop, observed 1981 to 2005/,
    });
    await user.click(synthpopRow);
    expect(onSelect).toHaveBeenCalledWith("synthpop");
  });

  it("updates the visible redundant metric when color encoding changes", async () => {
    const user = userEvent.setup();
    render(
      <GenreTimeline
        genres={genres}
        totalGenres={318}
        isLoading={false}
        error={null}
        selectedGenreId={null}
        resetSignal={0}
        onSelect={() => undefined}
      />,
    );

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Color by" }),
      "completeness",
    );

    expect(screen.getByText("50.0% complete")).toBeInTheDocument();
    expect(screen.getByText("100.0% complete")).toBeInTheDocument();
  });

  it("collapses and expands without removing the section heading", async () => {
    const user = userEvent.setup();
    render(
      <GenreTimeline
        genres={genres}
        totalGenres={318}
        isLoading={false}
        error={null}
        selectedGenreId={null}
        resetSignal={0}
        onSelect={() => undefined}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Collapse genre timeline" }),
    );
    expect(screen.getByRole("heading", { name: "Genre timeline" })).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Search timeline genres" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Expand genre timeline" }));
    expect(
      screen.getByRole("textbox", { name: "Search timeline genres" }),
    ).toBeInTheDocument();
  });
});
