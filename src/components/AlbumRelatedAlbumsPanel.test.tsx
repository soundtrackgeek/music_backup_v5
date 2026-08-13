import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LastFmRelatedAlbums } from "../types";
import { AlbumRelatedAlbumsPanel } from "./AlbumRelatedAlbumsPanel";

const backendMocks = vi.hoisted(() => ({
  addWishListItem: vi.fn(),
  listWishList: vi.fn(),
  searchWishListMusicBrainz: vi.fn(),
}));

vi.mock("../backend", () => backendMocks);

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
  beforeEach(() => {
    vi.clearAllMocks();
    backendMocks.listWishList.mockResolvedValue({ items: [], autoRemovedCount: 0 });
    backendMocks.searchWishListMusicBrainz.mockResolvedValue({
      entity: "album",
      query: "Girls, Girls, Girls",
      candidates: [
        {
          entity: "album",
          title: "Girls, Girls, Girls",
          artist: "Mötley Crüe",
          year: 1987,
          musicbrainzId: "b032340f-ef67-388f-b225-61e20b87e39b",
          musicbrainzUrl:
            "https://musicbrainz.org/release-group/b032340f-ef67-388f-b225-61e20b87e39b",
          disambiguation: null,
          country: null,
          score: 100,
        },
      ],
      searchedAt: "2026-08-13T12:00:00Z",
    });
    backendMocks.addWishListItem.mockImplementation(async (input) => ({
      ...input,
      id: 42,
      createdAt: "2026-08-13T12:00:00Z",
      downloadedDeezerAlbumId: null,
      downloadedPath: null,
      downloadedAt: null,
      artistAlbumSummary: null,
    }));
  });

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

  it("adds a missing album with MusicBrainz identity and recommendation provenance", async () => {
    const user = userEvent.setup();
    const onOpenSource = vi.fn();
    render(
      <AlbumRelatedAlbumsPanel
        related={related}
        isLoading={false}
        error={null}
        onRefresh={() => undefined}
        onOpenAlbum={() => undefined}
        onOpenSource={onOpenSource}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Add Girls, Girls, Girls by Mötley Crüe to Wish List",
      }),
    );

    await waitFor(() =>
      expect(backendMocks.addWishListItem).toHaveBeenCalledWith(
        expect.objectContaining({
          entity: "album",
          title: "Girls, Girls, Girls",
          artist: "Mötley Crüe",
          year: 1987,
          musicbrainzId: "b032340f-ef67-388f-b225-61e20b87e39b",
          source: "Last.fm Related Albums · Def Leppard — Hysteria",
        }),
      ),
    );
    expect(
      screen.getByRole("button", {
        name: "Girls, Girls, Girls by Mötley Crüe is on Wish List",
      }),
    ).toBeDisabled();

    await user.click(
      screen.getByRole("button", {
        name: "Explore Girls, Girls, Girls by Mötley Crüe on Last.fm",
      }),
    );
    expect(onOpenSource).toHaveBeenCalledWith(
      "https://www.last.fm/music/Mötley+Crüe/Girls,+Girls,+Girls",
    );
  });

  it("detects album duplicates by normalized artist and title", async () => {
    backendMocks.listWishList.mockResolvedValue({
      autoRemovedCount: 0,
      items: [
        {
          id: 9,
          entity: "album",
          title: "Girls Girls Girls",
          artist: "MOTLEY CRUE",
          year: 1987,
          musicbrainzId: null,
          musicbrainzUrl: null,
          source: "Manual",
          createdAt: "2026-08-13T12:00:00Z",
          downloadedDeezerAlbumId: null,
          downloadedPath: null,
          downloadedAt: null,
          artistAlbumSummary: null,
        },
      ],
    });
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

    expect(
      await screen.findByRole("button", {
        name: "Girls, Girls, Girls by Mötley Crüe is on Wish List",
      }),
    ).toBeDisabled();
    expect(backendMocks.searchWishListMusicBrainz).not.toHaveBeenCalled();
  });

  it("transitions a recommended album to owned navigation after import", async () => {
    backendMocks.listWishList.mockResolvedValue({
      autoRemovedCount: 0,
      items: [
        {
          id: 9,
          entity: "album",
          title: "Girls, Girls, Girls",
          artist: "Mötley Crüe",
          year: 1987,
          musicbrainzId: null,
          musicbrainzUrl: null,
          source: "Last.fm Related Albums · Def Leppard — Hysteria",
          createdAt: "2026-08-13T12:00:00Z",
          downloadedDeezerAlbumId: null,
          downloadedPath: null,
          downloadedAt: null,
          artistAlbumSummary: null,
        },
      ],
    });
    const onOpenAlbum = vi.fn();
    const { rerender } = render(
      <AlbumRelatedAlbumsPanel
        related={related}
        isLoading={false}
        error={null}
        onRefresh={() => undefined}
        onOpenAlbum={onOpenAlbum}
        onOpenSource={() => undefined}
      />,
    );
    expect(
      await screen.findByRole("button", {
        name: "Girls, Girls, Girls by Mötley Crüe is on Wish List",
      }),
    ).toBeDisabled();

    rerender(
      <AlbumRelatedAlbumsPanel
        related={{
          ...related,
          albums: related.albums.map((album) =>
            album.albumTitle === "Girls, Girls, Girls"
              ? {
                  ...album,
                  localAlbumId: "girls-girls-girls",
                  localAlbumArtist: "Mötley Crüe",
                  localAlbumTitle: "Girls, Girls, Girls",
                  localYear: 1987,
                }
              : album,
          ),
        }}
        isLoading={false}
        error={null}
        onRefresh={() => undefined}
        onOpenAlbum={onOpenAlbum}
        onOpenSource={() => undefined}
      />,
    );

    expect(
      screen.queryByRole("button", {
        name: /Girls, Girls, Girls by Mötley Crüe is on Wish List/,
      }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", {
        name: "Open Girls, Girls, Girls by Mötley Crüe in Albums",
      }),
    );
    expect(onOpenAlbum).toHaveBeenCalledWith("girls-girls-girls");
  });
});
