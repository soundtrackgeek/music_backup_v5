import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  countArtistChartFilters,
  createArtistChartRequest,
} from "../../app/artistChart";
import type { ArtistChartResponse } from "../../types";
import { ArtistChartPanel } from "./ArtistChartPanel";

const response: ArtistChartResponse = {
  metric: "albums",
  total: 2,
  limit: 100,
  offset: 0,
  rows: [
    {
      rank: 1,
      artistKey: "alpha",
      artistName: "Alpha",
      albumCount: 2,
      trackCount: 3,
      fiveStarTracks: 2,
      lovedTracks: 2,
      chartedAlbums: 2,
      chartedTracks: 1,
      completeAlbums: 1,
      averageAlbumScore: 75,
    },
    {
      rank: 2,
      artistKey: "zulu",
      artistName: "Zulu",
      albumCount: 1,
      trackCount: 1,
      fiveStarTracks: 1,
      lovedTracks: 0,
      chartedAlbums: 0,
      chartedTracks: 1,
      completeAlbums: 1,
      averageAlbumScore: null,
    },
  ],
};

function renderPanel(overrides: Partial<Parameters<typeof ArtistChartPanel>[0]> = {}) {
  const props = {
    request: createArtistChartRequest(),
    response,
    error: null,
    isLoading: false,
    genreOptions: [],
    onRequestGenreOptions: vi.fn(),
    countryOptions: [],
    countryFlagDisplay: "flag" as const,
    contentControl: <div>content control</div>,
    onChange: vi.fn(),
    onChangeFilters: vi.fn(),
    onOpenArtist: vi.fn(),
    ...overrides,
  };
  render(<ArtistChartPanel {...props} />);
  return props;
}

describe("ArtistChartPanel", () => {
  it("shows every ranking column and opens an artist from its name", () => {
    const props = renderPanel();

    for (const heading of [
      "Albums",
      "Tracks",
      "5★ tracks",
      "Loved",
      "Charted albums",
      "Charted tracks",
      "100% rated",
      "Avg score",
    ]) {
      expect(screen.getByRole("columnheader", { name: heading })).toBeTruthy();
    }
    expect(screen.getByText("75.0")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Open artist Alpha" }));
    expect(props.onOpenArtist).toHaveBeenCalledWith("alpha", "Alpha");
  });

  it("reports ranking and chart source changes", () => {
    const props = renderPanel();

    fireEvent.change(screen.getByLabelText("Ranking"), {
      target: { value: "fiveStarTracks" },
    });
    expect(props.onChange).toHaveBeenCalledWith({ metric: "fiveStarTracks" });

    fireEvent.click(screen.getAllByLabelText("Norsktoppen")[0]);
    expect(props.onChange).toHaveBeenCalledWith({
      singleChartSources: ["billboard", "officialUk", "vgLista", "tiISkuddet"],
    });
  });

  it("sorts by a column header and flips the direction on the active one", () => {
    const props = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Loved" }));
    expect(props.onChange).toHaveBeenCalledWith({
      metric: "lovedTracks",
      direction: "desc",
    });

    fireEvent.click(screen.getByRole("button", { name: "Albums" }));
    expect(props.onChange).toHaveBeenCalledWith({ direction: "asc" });
  });

  it("explains an empty chart", () => {
    renderPanel({ response: { ...response, rows: [], total: 0 } });
    expect(screen.getByText("No ranked artists.")).toBeTruthy();
  });
});

describe("countArtistChartFilters", () => {
  it("counts only controls that differ from the defaults", () => {
    const request = createArtistChartRequest();
    expect(countArtistChartFilters(request)).toBe(0);

    request.filters.genres = ["rock"];
    request.excludedYearFrom = 1980;
    request.albumChartSources = ["billboard"];
    request.includeVariousArtists = true;
    expect(countArtistChartFilters(request)).toBe(4);
  });
});
