import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { LastFmRelatedAlbums } from "../types";
import { AlbumRelatedAlbumsPanel } from "./AlbumRelatedAlbumsPanel";

const related: LastFmRelatedAlbums = {
  albumId: "hysteria",
  albumArtist: "Def Leppard",
  albumTitle: "Hysteria",
  sourceUrl: "https://www.last.fm/music/Def+Leppard/Hysteria",
  sourceTags: ["hard rock", "1980s", "glam metal"],
  fetchedAt: "2026-08-12T12:00:00Z",
  cached: true,
  stale: false,
  message: "Showing 2 related albums; 1 is in this library.",
  albums: [
    {
      rank: 1,
      artistName: "Bon Jovi",
      artistMbid: null,
      albumTitle: "Slippery When Wet",
      albumMbid: null,
      sourceUrl: "https://www.last.fm/music/Bon+Jovi/Slippery+When+Wet",
      sharedTags: ["hard rock", "1980s"],
      artistSimilarity: 0.87,
      localAlbumId: "slippery-when-wet",
      localAlbumArtist: "Bon Jovi",
      localAlbumTitle: "Slippery When Wet",
      localYear: 1986,
      localCoverPath: null,
      localCoverMimeType: null,
    },
    {
      rank: 2,
      artistName: "Mötley Crüe",
      artistMbid: null,
      albumTitle: "Girls, Girls, Girls",
      albumMbid: null,
      sourceUrl: "https://www.last.fm/music/Mötley+Crüe/Girls,+Girls,+Girls",
      sharedTags: ["hard rock", "glam metal"],
      artistSimilarity: 0.72,
      localAlbumId: null,
      localAlbumArtist: null,
      localAlbumTitle: null,
      localYear: null,
      localCoverPath: null,
      localCoverMimeType: null,
    },
  ],
};

describe("AlbumRelatedAlbumsPanel", () => {
  it("separates owned and missing albums with transparent evidence", () => {
    render(
      <AlbumRelatedAlbumsPanel
        related={related}
        isLoading={false}
        error={null}
        onRefresh={() => undefined}
        onOpenAlbum={() => undefined}
        onOpenSource={() => undefined}
      />,
    );

    expect(screen.getByRole("heading", { name: "Related Albums" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "In your library" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Explore" })).toBeInTheDocument();
    expect(
      screen.getByText("Based on hard rock · 1980s · glam metal"),
    ).toBeInTheDocument();
    expect(screen.getByText("hard rock · 1980s · similar artist")).toBeInTheDocument();
    expect(screen.getByText("Cached API-derived relationships")).toBeInTheDocument();
  });

  it("opens owned albums locally and missing albums on Last.fm", () => {
    const onOpenAlbum = vi.fn();
    const onOpenSource = vi.fn();
    render(
      <AlbumRelatedAlbumsPanel
        related={related}
        isLoading={false}
        error={null}
        onRefresh={() => undefined}
        onOpenAlbum={onOpenAlbum}
        onOpenSource={onOpenSource}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Open Slippery When Wet by Bon Jovi in Albums",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Explore Girls, Girls, Girls by Mötley Crüe on Last.fm",
      }),
    );

    expect(onOpenAlbum).toHaveBeenCalledWith("slippery-when-wet");
    expect(onOpenSource).toHaveBeenCalledWith(
      "https://www.last.fm/music/Mötley+Crüe/Girls,+Girls,+Girls",
    );
  });

  it("supports refresh and exact source navigation", () => {
    const onRefresh = vi.fn();
    const onOpenSource = vi.fn();
    render(
      <AlbumRelatedAlbumsPanel
        related={related}
        isLoading={false}
        error={null}
        onRefresh={onRefresh}
        onOpenAlbum={() => undefined}
        onOpenSource={onOpenSource}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    fireEvent.click(
      screen.getByRole("button", { name: /Open album on Last.fm/ }),
    );

    expect(onRefresh).toHaveBeenCalledOnce();
    expect(onOpenSource).toHaveBeenCalledWith(related.sourceUrl);
  });
});
