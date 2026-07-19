import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WishListWorkspace } from "./WishListWorkspace";

const listWishList = vi.fn();
const openExternalUrl = vi.fn();
const removeWishListItem = vi.fn();

vi.mock("../backend", () => ({
  listWishList: (...args: unknown[]) => listWishList(...args),
  openExternalUrl: (...args: unknown[]) => openExternalUrl(...args),
  removeWishListItem: (...args: unknown[]) => removeWishListItem(...args),
}));

describe("WishListWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listWishList.mockResolvedValue({
      autoRemovedCount: 1,
      items: [
        {
          id: 1,
          entity: "artist",
          title: "Stereolab",
          artist: "",
          year: null,
          musicbrainzId: "artist-1",
          musicbrainzUrl: "https://musicbrainz.org/artist/artist-1",
          source: "MusicBrainz",
          createdAt: "2026-07-19T00:00:00Z",
        },
        {
          id: 2,
          entity: "album",
          title: "Meantime",
          artist: "Helmet",
          year: 1992,
          musicbrainzId: "album-1",
          musicbrainzUrl: "https://musicbrainz.org/release-group/album-1",
          source: "MusicBrainz",
          createdAt: "2026-07-19T00:00:00Z",
        },
      ],
    });
    removeWishListItem.mockResolvedValue(undefined);
    openExternalUrl.mockResolvedValue(undefined);
  });

  it("separates artists and albums and reports automatic reconciliation", async () => {
    render(<WishListWorkspace />);

    expect(await screen.findByText("Stereolab")).toBeInTheDocument();
    expect(screen.getByText("Meantime")).toBeInTheDocument();
    expect(screen.getByText(/Removed 1 item now found/)).toBeInTheDocument();
    expect(screen.getByText("Helmet · 1992")).toBeInTheDocument();
  });

  it("opens MusicBrainz and removes an item", async () => {
    render(<WishListWorkspace />);
    await screen.findByText("Stereolab");

    fireEvent.click(screen.getByLabelText("Open Meantime in MusicBrainz"));
    await waitFor(() => {
      expect(openExternalUrl).toHaveBeenCalledWith(
        "https://musicbrainz.org/release-group/album-1",
      );
    });

    fireEvent.click(screen.getByLabelText("Remove Meantime from Wish List"));
    await waitFor(() => expect(removeWishListItem).toHaveBeenCalledWith(2));
    expect(screen.queryByText("Meantime")).not.toBeInTheDocument();
  });
});
