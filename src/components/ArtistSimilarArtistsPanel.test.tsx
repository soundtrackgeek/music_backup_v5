import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const branch: LastFmArtistSimilarity = {
  artistId: "poison",
  artistName: "Poison",
  sourceUrl: "https://www.last.fm/music/Poison/+similar",
  fetchedAt: "2026-08-13T12:00:00Z",
  cached: true,
  stale: false,
  message: "Showing 3 similar artists for Poison.",
  artists: [
    {
      rank: 1,
      name: "Def Leppard",
      musicbrainzMbid: null,
      matchScore: 0.94,
      sourceUrl: "https://www.last.fm/music/Def+Leppard",
      localArtistId: "def-leppard",
      localArtistName: "Def Leppard",
      localAlbumCount: 8,
      portraitAvailable: false,
      representativeAlbumId: null,
      representativeAlbum: null,
      representativeCoverPath: null,
    },
    {
      rank: 2,
      name: "Cinderella",
      musicbrainzMbid: null,
      matchScore: 0.84,
      sourceUrl: "https://www.last.fm/music/Cinderella",
      localArtistId: "cinderella",
      localArtistName: "Cinderella",
      localAlbumCount: 4,
      portraitAvailable: false,
      representativeAlbumId: null,
      representativeAlbum: null,
      representativeCoverPath: null,
    },
    {
      rank: 3,
      name: "Tuff",
      musicbrainzMbid: null,
      matchScore: 0.63,
      sourceUrl: "https://www.last.fm/music/Tuff",
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
        onExpandArtist={() => Promise.resolve(branch)}
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
        onExpandArtist={() => Promise.resolve(branch)}
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
        onExpandArtist={() => Promise.resolve(branch)}
        onOpenArtist={() => undefined}
        onOpenSource={onOpenSource}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    fireEvent.click(screen.getByRole("button", { name: /View all on Last.fm/ }));

    expect(onRefresh).toHaveBeenCalledOnce();
    expect(onOpenSource).toHaveBeenCalledWith(similarity.sourceUrl);
  });

  it("expands a first-hop artist once and reuses the in-panel cache", async () => {
    const user = userEvent.setup();
    const onExpandArtist = vi.fn().mockResolvedValue(branch);
    render(
      <ArtistSimilarArtistsPanel
        similarity={similarity}
        isLoading={false}
        error={null}
        onRefresh={() => undefined}
        onExpandArtist={onExpandArtist}
        onOpenArtist={() => undefined}
        onOpenSource={() => undefined}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Explore artist constellation/ }));
    await user.click(screen.getByRole("button", { name: "Expand connections" }));

    expect(
      await screen.findByRole("button", { name: /Select Cinderella/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Select Def Leppard/ }),
    ).not.toBeInTheDocument();
    expect(onExpandArtist).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: /Explore artist constellation/ }));
    await user.click(screen.getByRole("button", { name: /Explore artist constellation/ }));
    expect(screen.getByRole("button", { name: /Select Cinderella/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connections expanded" })).toBeDisabled();
    expect(onExpandArtist).toHaveBeenCalledOnce();
  });

  it("supports arrow-key traversal and a keyboard-usable list fallback", async () => {
    const user = userEvent.setup();
    render(
      <ArtistSimilarArtistsPanel
        similarity={similarity}
        isLoading={false}
        error={null}
        onRefresh={() => undefined}
        onExpandArtist={() => Promise.resolve(branch)}
        onOpenArtist={() => undefined}
        onOpenSource={() => undefined}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Explore artist constellation/ }));
    const poison = screen.getByRole("button", { name: /Select Poison/ });
    const britnyFox = screen.getByRole("button", { name: /Select Britny Fox/ });
    poison.focus();
    await user.keyboard("{ArrowRight}");
    expect(britnyFox).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(
      screen.getAllByRole("button", { name: "Explore Britny Fox on Last.fm" }),
    ).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "List" }));
    expect(screen.getByRole("heading", { name: "One hop" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand Poison connections" })).toBeEnabled();
  });

  it("shows stale cached branches during an offline refresh", async () => {
    const user = userEvent.setup();
    render(
      <ArtistSimilarArtistsPanel
        similarity={similarity}
        isLoading={false}
        error={null}
        onRefresh={() => undefined}
        onExpandArtist={() => Promise.resolve({ ...branch, stale: true })}
        onOpenArtist={() => undefined}
        onOpenSource={() => undefined}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Explore artist constellation/ }));
    await user.click(screen.getByRole("button", { name: "Expand connections" }));
    expect(
      await screen.findByText("Cached connections are shown because Last.fm is unavailable."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Select Cinderella/ })).toBeInTheDocument();
  });

  it("keeps the existing constellation visible when an uncached expansion is offline", async () => {
    const user = userEvent.setup();
    render(
      <ArtistSimilarArtistsPanel
        similarity={similarity}
        isLoading={false}
        error={null}
        onRefresh={() => undefined}
        onExpandArtist={() => Promise.reject(new Error("Could not reach Last.fm."))}
        onOpenArtist={() => undefined}
        onOpenSource={() => undefined}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Explore artist constellation/ }));
    await user.click(screen.getByRole("button", { name: "Expand connections" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not reach Last.fm. The existing constellation remains available.",
    );
    expect(screen.getByRole("button", { name: /Select Poison/ })).toBeInTheDocument();
  });
});
