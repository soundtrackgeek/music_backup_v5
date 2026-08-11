import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { LastFmArtistPopularity } from "../types";
import { ArtistPopularTracksPanel } from "./ArtistPopularTracksPanel";

const popularity: LastFmArtistPopularity = {
  artistId: "beastie boys",
  artistName: "Beastie Boys",
  sourceUrl: "https://www.last.fm/music/Beastie+Boys/+tracks",
  fetchedAt: "2026-08-11T12:00:00Z",
  cached: true,
  stale: false,
  message: "Popular local tracks matched from Last.fm.",
  tracks: Array.from({ length: 10 }, (_, index) => ({
    rank: index + 1,
    trackId: index + 1,
    albumId: `album-${index}`,
    album: index === 0 ? "Ill Communication" : "Licensed to Ill",
    year: 1986 + index,
    title: `Popular track ${index + 1}`,
    artist: "Beastie Boys",
    listeners: 500_000 - index * 10_000,
    playCount: 1_000_000 - index * 20_000,
    seconds: 180 + index,
    sourceUrl: null,
  })),
};

describe("ArtistPopularTracksPanel", () => {
  it("shows five tracks initially and expands to ten on demand", () => {
    render(
      <ArtistPopularTracksPanel
        popularity={popularity}
        isLoading={false}
        error={null}
        onRefresh={() => undefined}
        onOpenSource={() => undefined}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Popular Tracks" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText("Cached from Last.fm")).toBeInTheDocument();
    expect(screen.queryByText("Popular track 6")).not.toBeInTheDocument();

    const showMore = screen.getByRole("button", { name: "Show more" });
    expect(showMore).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(showMore);

    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    expect(screen.getByText("Popular track 10")).toBeInTheDocument();
    const showLess = screen.getByRole("button", { name: "Show less" });
    expect(showLess).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(showLess);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("does not show an expansion control when five tracks are available", () => {
    render(
      <ArtistPopularTracksPanel
        popularity={{ ...popularity, tracks: popularity.tracks.slice(0, 5) }}
        isLoading={false}
        error={null}
        onRefresh={() => undefined}
        onOpenSource={() => undefined}
      />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(
      screen.queryByRole("button", { name: "Show more" }),
    ).not.toBeInTheDocument();
  });

  it("exposes refresh and the provider source", () => {
    const onRefresh = vi.fn();
    const onOpenSource = vi.fn();
    render(
      <ArtistPopularTracksPanel
        popularity={popularity}
        isLoading={false}
        error={null}
        onRefresh={onRefresh}
        onOpenSource={onOpenSource}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    fireEvent.click(screen.getByRole("button", { name: /View source/ }));

    expect(onRefresh).toHaveBeenCalledOnce();
    expect(onOpenSource).toHaveBeenCalledWith(popularity.sourceUrl);
  });
});
