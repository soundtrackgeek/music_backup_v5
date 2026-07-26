import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WishListWorkspace } from "./WishListWorkspace";

const listWishList = vi.fn();
const downloadDeemixAlbum = vi.fn();
const listenToDeemixDownloadProgress = vi.fn();
const openExternalUrl = vi.fn();
const removeWishListItem = vi.fn();
const searchDeemixAlbums = vi.fn();

vi.mock("../backend", () => ({
  downloadDeemixAlbum: (...args: unknown[]) => downloadDeemixAlbum(...args),
  listWishList: (...args: unknown[]) => listWishList(...args),
  listenToDeemixDownloadProgress: (...args: unknown[]) =>
    listenToDeemixDownloadProgress(...args),
  openExternalUrl: (...args: unknown[]) => openExternalUrl(...args),
  removeWishListItem: (...args: unknown[]) => removeWishListItem(...args),
  searchDeemixAlbums: (...args: unknown[]) => searchDeemixAlbums(...args),
}));

describe("WishListWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listenToDeemixDownloadProgress.mockResolvedValue(() => undefined);
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
    searchDeemixAlbums.mockResolvedValue({
      query: "Helmet Meantime",
      total: 1,
      searchedAt: "2026-07-26T12:00:00Z",
      matches: [
        {
          id: "123",
          title: "Meantime",
          artist: "Helmet",
          year: 1992,
          trackCount: 10,
          recordType: "album",
          explicit: false,
          deezerUrl: "https://www.deezer.com/album/123",
          matchScore: 100,
          matchLevel: "exact",
        },
      ],
    });
    downloadDeemixAlbum.mockResolvedValue({
      requestId: "request-1",
      albumId: "123",
      artist: "Helmet",
      album: "Meantime",
      year: 1992,
      quality: "mp3_320",
      destinationPath: "D:\\Music\\Helmet - Meantime (1992)",
      coverPath: "D:\\Music\\Helmet - Meantime (1992)\\cover.jpg",
      trackCount: 10,
      completedAt: "2026-07-26T12:30:00Z",
    });
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

  it("searches an album with Deemix and opens an exact result", async () => {
    render(<WishListWorkspace />);
    await screen.findByText("Stereolab");

    fireEvent.click(screen.getByLabelText("Search Meantime with Deemix"));

    await waitFor(() => {
      expect(searchDeemixAlbums).toHaveBeenCalledWith({
        title: "Meantime",
        artist: "Helmet",
        year: 1992,
        limit: 8,
      });
    });
    expect(await screen.findByText(/100% match/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open in Deezer" }));
    await waitFor(() => {
      expect(openExternalUrl).toHaveBeenCalledWith(
        "https://www.deezer.com/album/123",
      );
    });
  });

  it("downloads an exact result and reports its tagged destination", async () => {
    render(<WishListWorkspace />);
    await screen.findByText("Stereolab");
    fireEvent.click(screen.getByLabelText("Search Meantime with Deemix"));
    await screen.findByText(/100% match/);

    fireEvent.click(screen.getByRole("button", { name: "Download Meantime" }));
    await waitFor(() => {
      expect(downloadDeemixAlbum).toHaveBeenCalledWith({
        albumId: "123",
        requestId: expect.any(String),
      });
    });
    expect(
      await screen.findByText("Downloaded and tagged 10 tracks"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("D:\\Music\\Helmet - Meantime (1992)"),
    ).toBeInTheDocument();
    expect(screen.getByText(/cover.jpg/)).toBeInTheDocument();
  });
});
