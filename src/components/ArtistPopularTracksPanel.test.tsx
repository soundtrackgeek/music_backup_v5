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
  tracks: Array.from({ length: 6 }, (_, index) => ({
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
  it("shows at most five local matches with Last.fm attribution", () => {
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
