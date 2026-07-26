import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WishListWorkspace } from "./WishListWorkspace";

const discoverWishListArtistAlbums = vi.fn();
const downloadDeemixAlbum = vi.fn();
const listWishList = vi.fn();
const listenToDeemixDownloadProgress = vi.fn();
const openExternalUrl = vi.fn();
const preflightDeemixAlbumDownload = vi.fn();
const removeWishListItem = vi.fn();
const searchDeemixAlbums = vi.fn();

vi.mock("../backend", () => ({
  discoverWishListArtistAlbums: (...args: unknown[]) =>
    discoverWishListArtistAlbums(...args),
  downloadDeemixAlbum: (...args: unknown[]) => downloadDeemixAlbum(...args),
  listWishList: (...args: unknown[]) => listWishList(...args),
  listenToDeemixDownloadProgress: (...args: unknown[]) =>
    listenToDeemixDownloadProgress(...args),
  openExternalUrl: (...args: unknown[]) => openExternalUrl(...args),
  preflightDeemixAlbumDownload: (...args: unknown[]) =>
    preflightDeemixAlbumDownload(...args),
  removeWishListItem: (...args: unknown[]) => removeWishListItem(...args),
  searchDeemixAlbums: (...args: unknown[]) => searchDeemixAlbums(...args),
}));

const artistMbid = "056e4f3e-d505-4dad-8ec1-d04f521cbb56";
const albumMbid = "3d5ca740-5f1b-3b6c-87f3-88a7fca8bcea";

function match(id: string, title: string, year: number) {
  return {
    id,
    title,
    artist: "Pet Shop Boys",
    year,
    trackCount: 10,
    recordType: "album",
    explicit: false,
    deezerUrl: `https://www.deezer.com/album/${id}`,
    matchScore: 100,
    matchLevel: "exact",
    downloadedAt: null,
    downloadedPath: null,
  };
}

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
          title: "Pet Shop Boys",
          artist: "",
          year: null,
          musicbrainzId: artistMbid,
          musicbrainzUrl: `https://musicbrainz.org/artist/${artistMbid}`,
          source: "MusicBrainz",
          createdAt: "2026-07-19T00:00:00Z",
          downloadedDeezerAlbumId: null,
          downloadedPath: null,
          downloadedAt: null,
        },
        {
          id: 2,
          entity: "album",
          title: "Release",
          artist: "Pet Shop Boys",
          year: 2002,
          musicbrainzId: albumMbid,
          musicbrainzUrl: `https://musicbrainz.org/release-group/${albumMbid}`,
          source: "MusicBrainz",
          createdAt: "2026-07-19T00:00:00Z",
          downloadedDeezerAlbumId: null,
          downloadedPath: null,
          downloadedAt: null,
        },
      ],
    });
    removeWishListItem.mockResolvedValue(undefined);
    openExternalUrl.mockResolvedValue(undefined);
    preflightDeemixAlbumDownload.mockResolvedValue({
      alreadyDownloaded: false,
      destinationPath: null,
      downloadedAt: null,
      message: "Not downloaded.",
    });
    searchDeemixAlbums.mockResolvedValue({
      query: "Pet Shop Boys Release",
      total: 1,
      searchedAt: "2026-07-26T12:00:00Z",
      matches: [match("123", "Release (2017 Remaster)", 2002)],
    });
    discoverWishListArtistAlbums.mockResolvedValue({
      wishListItemId: 1,
      artist: "Pet Shop Boys",
      musicbrainzId: artistMbid,
      officialAlbumCount: 2,
      searchedAlbumCount: 2,
      matchedAlbumCount: 2,
      truncated: false,
      searchedAt: "2026-07-26T12:00:00Z",
      albums: [
        {
          releaseGroupId: "00000000-0000-4000-8000-000000000001",
          title: "Please",
          year: 1986,
          secondaryTypes: [],
          musicbrainzUrl:
            "https://musicbrainz.org/release-group/00000000-0000-4000-8000-000000000001",
          deemixMatches: [match("101", "Please", 1986)],
          deemixError: null,
          downloadedDeezerAlbumId: null,
          downloadedPath: null,
          downloadedAt: null,
        },
        {
          releaseGroupId: "00000000-0000-4000-8000-000000000002",
          title: "Actually",
          year: 1987,
          secondaryTypes: [],
          musicbrainzUrl:
            "https://musicbrainz.org/release-group/00000000-0000-4000-8000-000000000002",
          deemixMatches: [match("102", "Actually", 1987)],
          deemixError: null,
          downloadedDeezerAlbumId: null,
          downloadedPath: null,
          downloadedAt: null,
        },
      ],
    });
    downloadDeemixAlbum.mockImplementation(
      async (input: {
        albumId: string;
        expectedArtist: string;
        expectedAlbum: string;
        expectedYear: number | null;
        requestId: string;
      }) => ({
        requestId: input.requestId,
        albumId: input.albumId,
        artist: input.expectedArtist,
        album: input.expectedAlbum,
        year: input.expectedYear,
        quality: "mp3_320",
        destinationPath: `D:\\Music\\${input.expectedArtist} - ${input.expectedAlbum} (${input.expectedYear})`,
        coverPath: `D:\\Music\\${input.expectedArtist} - ${input.expectedAlbum} (${input.expectedYear})\\cover.jpg`,
        trackCount: 10,
        completedAt: "2026-07-26T12:30:00Z",
      }),
    );
  });

  it("separates artists and albums and reports automatic reconciliation", async () => {
    render(<WishListWorkspace />);

    expect(await screen.findByText("Pet Shop Boys")).toBeInTheDocument();
    expect(screen.getByText("Release")).toBeInTheDocument();
    expect(screen.getByText(/Removed 1 item now found/)).toBeInTheDocument();
    expect(screen.getByText("Pet Shop Boys · 2002")).toBeInTheDocument();
  });

  it("searches an album, downloads it, and adds the persistent badge", async () => {
    render(<WishListWorkspace />);
    await screen.findByText("Release");

    fireEvent.click(screen.getByLabelText("Search Release with Deemix"));
    await screen.findByText("Release (2017 Remaster)");
    fireEvent.click(
      screen.getByRole("button", { name: "Download Release (2017 Remaster)" }),
    );

    await waitFor(() => {
      expect(downloadDeemixAlbum).toHaveBeenCalledWith({
        albumId: "123",
        requestId: expect.any(String),
        wishListItemId: 2,
        musicbrainzReleaseGroupId: albumMbid,
        expectedArtist: "Pet Shop Boys",
        expectedAlbum: "Release (2017 Remaster)",
        expectedYear: 2002,
        allowDuplicate: false,
      });
    });
    expect(await screen.findByText("Downloaded and tagged 10 tracks")).toBeInTheDocument();
    expect(screen.getAllByText("Downloaded").length).toBeGreaterThan(0);
  });

  it("warns before a duplicate and only queues another copy after confirmation", async () => {
    preflightDeemixAlbumDownload.mockResolvedValue({
      alreadyDownloaded: true,
      destinationPath: "D:\\Music\\Pet Shop Boys - Release (2002)",
      downloadedAt: "2026-07-26T12:30:00Z",
      message: "Already downloaded.",
    });
    render(<WishListWorkspace />);
    await screen.findByText("Release");
    fireEvent.click(screen.getByLabelText("Search Release with Deemix"));
    await screen.findByText("Release (2017 Remaster)");
    fireEvent.click(
      screen.getByRole("button", { name: "Download Release (2017 Remaster)" }),
    );

    expect(await screen.findByText("Already in the Download folder")).toBeInTheDocument();
    expect(downloadDeemixAlbum).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Download another copy" }));
    await waitFor(() => {
      expect(downloadDeemixAlbum).toHaveBeenCalledWith(
        expect.objectContaining({ albumId: "123", allowDuplicate: true }),
      );
    });
  });

  it("discovers official artist albums and queues a second album behind the first", async () => {
    let resolveFirst: ((value: unknown) => void) | undefined;
    downloadDeemixAlbum
      .mockImplementationOnce(
        (input: { requestId: string }) =>
          new Promise((resolve) => {
            resolveFirst = () =>
              resolve({
                requestId: input.requestId,
                albumId: "101",
                artist: "Pet Shop Boys",
                album: "Please",
                year: 1986,
                quality: "mp3_320",
                destinationPath: "D:\\Music\\Pet Shop Boys - Please (1986)",
                coverPath: "D:\\Music\\Pet Shop Boys - Please (1986)\\cover.jpg",
                trackCount: 10,
                completedAt: "2026-07-26T12:30:00Z",
              });
          }),
      )
      .mockImplementationOnce(async (input: { requestId: string }) => ({
        requestId: input.requestId,
        albumId: "102",
        artist: "Pet Shop Boys",
        album: "Actually",
        year: 1987,
        quality: "mp3_320",
        destinationPath: "D:\\Music\\Pet Shop Boys - Actually (1987)",
        coverPath: "D:\\Music\\Pet Shop Boys - Actually (1987)\\cover.jpg",
        trackCount: 10,
        completedAt: "2026-07-26T12:31:00Z",
      }));

    render(<WishListWorkspace />);
    await screen.findByText("Pet Shop Boys");
    fireEvent.click(
      screen.getByLabelText("Search Pet Shop Boys official albums with Deezer"),
    );

    expect(await screen.findByRole("heading", { name: "Albums found" })).toBeInTheDocument();
    expect(discoverWishListArtistAlbums).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole("button", { name: "Download Please" }));
    await waitFor(() => expect(downloadDeemixAlbum).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Download Actually" }));
    expect(await screen.findByText("Waiting for the current album")).toBeInTheDocument();

    resolveFirst?.(undefined);
    await waitFor(() => expect(downloadDeemixAlbum).toHaveBeenCalledTimes(2));
    expect(downloadDeemixAlbum.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        albumId: "102",
        musicbrainzReleaseGroupId:
          "00000000-0000-4000-8000-000000000002",
      }),
    );
  });

  it("queues every missing matched artist album with Download all", async () => {
    render(<WishListWorkspace />);
    await screen.findByText("Pet Shop Boys");
    fireEvent.click(
      screen.getByLabelText("Search Pet Shop Boys official albums with Deezer"),
    );
    await screen.findByRole("heading", { name: "Albums found" });

    fireEvent.click(screen.getByRole("button", { name: "Download all albums" }));

    await waitFor(() => expect(downloadDeemixAlbum).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/2 albums added to the queue/)).toBeInTheDocument();
  });

  it("opens MusicBrainz and removes an item", async () => {
    render(<WishListWorkspace />);
    await screen.findByText("Release");

    fireEvent.click(screen.getByLabelText("Open Release in MusicBrainz"));
    await waitFor(() => {
      expect(openExternalUrl).toHaveBeenCalledWith(
        `https://musicbrainz.org/release-group/${albumMbid}`,
      );
    });

    fireEvent.click(screen.getByLabelText("Remove Release from Wish List"));
    await waitFor(() => expect(removeWishListItem).toHaveBeenCalledWith(2));
    expect(screen.queryByText("Release")).not.toBeInTheDocument();
  });
});
