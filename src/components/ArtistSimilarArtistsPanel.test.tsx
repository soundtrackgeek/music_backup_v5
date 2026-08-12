import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { LastFmArtistSimilarity } from "../types";
import { ArtistSimilarArtistsPanel } from "./ArtistSimilarArtistsPanel";

const similarity: LastFmArtistSimilarity = {
  artistId: "def leppard",
  artistName: "Def Leppard",
  sourceUrl: "https://www.last.fm/music/Def+Leppard/+similar",
  fetchedAt: "2026-08-12T12:00:00Z",
  cached: true,
  stale: false,
  message: "Showing 2 similar artists; 1 is in this library.",
  artists: [
    {
      rank: 1,
      name: "Poison",
      musicbrainzMbid: "c79c43d4-cbed-4373-89ce-6560f62eb7d8",
      matchScore: 0.91,
      sourceUrl: "https://www.last.fm/music/Poison",
      localArtistId: "poison",
      localArtistName: "Poison",
      localAlbumCount: 6,
      portraitAvailable: false,
      representativeAlbumId: null,
      representativeAlbum: null,
      representativeCoverPath: null,
    },
    {
      rank: 2,
      name: "Britny Fox",
      musicbrainzMbid: null,
      matchScore: 0.68,
      sourceUrl: "https://www.last.fm/music/Britny+Fox",
      localArtistId: null,
      localArtistName: null,
      localAlbumCount: 0,
      portraitAvailable: false,
      representativeAlbumId: null,
      representativeAlbum: null,
      representativeCoverPath: null,
    },
  ],
};

describe("ArtistSimilarArtistsPanel", () => {
  it("separates owned and missing artists and exposes similarity evidence", () => {
    render(
      <ArtistSimilarArtistsPanel
        similarity={similarity}
        isLoading={false}
        error={null}
        onRefresh={() => undefined}
        onOpenArtist={() => undefined}
        onOpenSource={() => undefined}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Similar Artists" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "In your library" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Explore" })).toBeInTheDocument();
    expect(screen.getByText("6 albums in your library")).toBeInTheDocument();
    expect(screen.getByText("91% match")).toBeInTheDocument();
    expect(screen.getByText("Not in your library")).toBeInTheDocument();
    expect(screen.getByText("Cached from Last.fm")).toBeInTheDocument();
  });

  it("opens owned artists locally and missing artists on Last.fm", () => {
    const onOpenArtist = vi.fn();
    const onOpenSource = vi.fn();
    render(
      <ArtistSimilarArtistsPanel
        similarity={similarity}
        isLoading={false}
        error={null}
        onRefresh={() => undefined}
        onOpenArtist={onOpenArtist}
        onOpenSource={onOpenSource}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Poison in Artists" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Explore Britny Fox on Last.fm" }),
    );

    expect(onOpenArtist).toHaveBeenCalledWith("poison", "Poison");
    expect(onOpenSource).toHaveBeenCalledWith(
      "https://www.last.fm/music/Britny+Fox",
    );
  });

  it("exposes refresh and the complete provider source", () => {
    const onRefresh = vi.fn();
    const onOpenSource = vi.fn();
    render(
      <ArtistSimilarArtistsPanel
        similarity={similarity}
        isLoading={false}
        error={null}
        onRefresh={onRefresh}
        onOpenArtist={() => undefined}
        onOpenSource={onOpenSource}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    fireEvent.click(screen.getByRole("button", { name: /View all on Last.fm/ }));

    expect(onRefresh).toHaveBeenCalledOnce();
    expect(onOpenSource).toHaveBeenCalledWith(similarity.sourceUrl);
  });
});
