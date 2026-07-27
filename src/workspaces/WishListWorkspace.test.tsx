import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WishListWorkspace } from "./WishListWorkspace";

const discoverWishListArtistAlbums = vi.fn();
const addWishListMusicBrainzCandidate = vi.fn();
const downloadDeemixAlbum = vi.fn();
const listWishList = vi.fn();
const listenToDeemixDownloadProgress = vi.fn();
const openExternalUrl = vi.fn();
const preflightDeemixAlbumDownload = vi.fn();
const refreshWishListArtistAlbumSummary = vi.fn();
const removeWishListItem = vi.fn();
const searchDeemixAlbums = vi.fn();
const searchWishListMusicBrainz = vi.fn();

vi.mock("../backend", () => ({
  addWishListMusicBrainzCandidate: (...args: unknown[]) =>
    addWishListMusicBrainzCandidate(...args),
  discoverWishListArtistAlbums: (...args: unknown[]) =>
    discoverWishListArtistAlbums(...args),
  downloadDeemixAlbum: (...args: unknown[]) => downloadDeemixAlbum(...args),
  listWishList: (...args: unknown[]) => listWishList(...args),
  listenToDeemixDownloadProgress: (...args: unknown[]) =>
    listenToDeemixDownloadProgress(...args),
  openExternalUrl: (...args: unknown[]) => openExternalUrl(...args),
  preflightDeemixAlbumDownload: (...args: unknown[]) =>
    preflightDeemixAlbumDownload(...args),
  refreshWishListArtistAlbumSummary: (...args: unknown[]) =>
    refreshWishListArtistAlbumSummary(...args),
  removeWishListItem: (...args: unknown[]) => removeWishListItem(...args),
  searchDeemixAlbums: (...args: unknown[]) => searchDeemixAlbums(...args),
  searchWishListMusicBrainz: (...args: unknown[]) =>
    searchWishListMusicBrainz(...args),
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
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 768 });
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
          artistAlbumSummary: {
            officialAlbumCount: 4,
            ownedAlbumCount: 2,
            missingAlbumCount: 2,
            missingAlbums: [
              {
                releaseGroupId: "00000000-0000-4000-8000-000000000001",
                title: "Please",
                year: 1986,
                musicbrainzUrl:
                  "https://musicbrainz.org/release-group/00000000-0000-4000-8000-000000000001",
              },
              {
                releaseGroupId: "00000000-0000-4000-8000-000000000002",
                title: "Actually",
                year: 1987,
                musicbrainzUrl:
                  "https://musicbrainz.org/release-group/00000000-0000-4000-8000-000000000002",
              },
            ],
            updatedAt: "2026-07-26T12:00:00Z",
          },
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
          artistAlbumSummary: null,
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
    refreshWishListArtistAlbumSummary.mockResolvedValue({
      officialAlbumCount: 4,
      ownedAlbumCount: 2,
      missingAlbumCount: 2,
      missingAlbums: [
        {
          releaseGroupId: "00000000-0000-4000-8000-000000000001",
          title: "Please",
          year: 1986,
          musicbrainzUrl:
            "https://musicbrainz.org/release-group/00000000-0000-4000-8000-000000000001",
        },
        {
          releaseGroupId: "00000000-0000-4000-8000-000000000002",
          title: "Actually",
          year: 1987,
          musicbrainzUrl:
            "https://musicbrainz.org/release-group/00000000-0000-4000-8000-000000000002",
        },
      ],
      updatedAt: "2026-07-26T12:00:00Z",
    });
    searchDeemixAlbums.mockResolvedValue({
      query: "Pet Shop Boys Release",
      total: 1,
      searchedAt: "2026-07-26T12:00:00Z",
      matches: [match("123", "Release (2017 Remaster)", 2002)],
    });
    searchWishListMusicBrainz.mockResolvedValue({
      entity: "artist",
      query: "Engine Alley",
      candidates: [
        {
          entity: "artist",
          title: "Engine Alley",
          artist: "",
          year: null,
          musicbrainzId: "11111111-1111-4111-8111-111111111111",
          musicbrainzUrl:
            "https://musicbrainz.org/artist/11111111-1111-4111-8111-111111111111",
          disambiguation: "Irish alternative rock band",
          country: "IE",
          score: 100,
        },
      ],
      searchedAt: "2026-07-26T12:00:00Z",
    });
    addWishListMusicBrainzCandidate.mockResolvedValue({
      added: true,
      item: {
        id: 7,
        entity: "artist",
        title: "Engine Alley",
        artist: "",
        year: null,
        musicbrainzId: "11111111-1111-4111-8111-111111111111",
        musicbrainzUrl:
          "https://musicbrainz.org/artist/11111111-1111-4111-8111-111111111111",
        source: "MusicBrainz search",
        createdAt: "2026-07-26T13:00:00Z",
        downloadedDeezerAlbumId: null,
        downloadedPath: null,
        downloadedAt: null,
        artistAlbumSummary: {
          officialAlbumCount: 4,
          ownedAlbumCount: 2,
          missingAlbumCount: 2,
          missingAlbums: [
            {
              releaseGroupId: "engine-release-3",
              title: "Engine Alley",
              year: 1998,
              musicbrainzUrl:
                "https://musicbrainz.org/release-group/engine-release-3",
            },
            {
              releaseGroupId: "engine-release-4",
              title: "Showroom",
              year: 2018,
              musicbrainzUrl:
                "https://musicbrainz.org/release-group/engine-release-4",
            },
          ],
          updatedAt: "2026-07-26T13:00:00Z",
        },
      },
      message: "Added Engine Alley with 2 albums missing.",
      artistAlbumSummary: {
        officialAlbumCount: 4,
        ownedAlbumCount: 2,
        missingAlbumCount: 2,
        missingAlbums: [],
        updatedAt: "2026-07-26T13:00:00Z",
      },
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
          inLibrary: false,
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
          inLibrary: false,
        },
      ],
      albumSummary: {
        officialAlbumCount: 2,
        ownedAlbumCount: 0,
        missingAlbumCount: 2,
        missingAlbums: [
          {
            releaseGroupId: "00000000-0000-4000-8000-000000000001",
            title: "Please",
            year: 1986,
            musicbrainzUrl:
              "https://musicbrainz.org/release-group/00000000-0000-4000-8000-000000000001",
          },
          {
            releaseGroupId: "00000000-0000-4000-8000-000000000002",
            title: "Actually",
            year: 1987,
            musicbrainzUrl:
              "https://musicbrainz.org/release-group/00000000-0000-4000-8000-000000000002",
          },
        ],
        updatedAt: "2026-07-26T12:00:00Z",
      },
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
    const missingAlbumsTrigger = screen.getByLabelText(
      "Show 2 albums missing for Pet Shop Boys",
    );
    expect(screen.getAllByText("2 albums missing")).toHaveLength(1);
    fireEvent.mouseEnter(missingAlbumsTrigger);
    expect(await screen.findByRole("tooltip")).toBeInTheDocument();
    expect(screen.getAllByText("2 albums missing")).toHaveLength(2);
    expect(screen.getByText("2 of 4 official albums acquired")).toBeInTheDocument();
    expect(screen.getByText("Please")).toBeInTheDocument();
    expect(screen.getByText("Actually")).toBeInTheDocument();
  });

  it("portals and flips the missing-album popup above a trigger near the viewport bottom", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 300 });
    render(<WishListWorkspace />);

    await screen.findByText("Pet Shop Boys");
    const trigger = screen.getByLabelText("Show 2 albums missing for Pet Shop Boys");
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      x: 700,
      y: 260,
      top: 260,
      right: 731,
      bottom: 291,
      left: 700,
      width: 31,
      height: 31,
      toJSON: () => ({}),
    });

    fireEvent.mouseEnter(trigger);
    const popup = await screen.findByRole("tooltip");

    expect(popup.parentElement).toBe(document.body);
    expect(popup).toHaveAttribute("data-placement", "above");
    expect(popup.style.bottom).toBe("47px");
    expect(popup.style.maxHeight).toBe("245px");
  });

  it("loads an uncached artist album summary without removing the artist", async () => {
    listWishList.mockResolvedValueOnce({
      autoRemovedCount: 0,
      items: [
        {
          id: 7,
          entity: "artist",
          title: "Engine Alley",
          artist: "",
          year: null,
          musicbrainzId: artistMbid,
          musicbrainzUrl: `https://musicbrainz.org/artist/${artistMbid}`,
          source: "MusicBrainz",
          createdAt: "2026-07-27T00:00:00Z",
          downloadedDeezerAlbumId: null,
          downloadedPath: null,
          downloadedAt: null,
          artistAlbumSummary: null,
        },
      ],
    });
    refreshWishListArtistAlbumSummary.mockResolvedValueOnce({
      officialAlbumCount: 4,
      ownedAlbumCount: 2,
      missingAlbumCount: 2,
      missingAlbums: [
        {
          releaseGroupId: "engine-release-3",
          title: "Engine Alley",
          year: 1998,
          musicbrainzUrl:
            "https://musicbrainz.org/release-group/engine-release-3",
        },
        {
          releaseGroupId: "engine-release-4",
          title: "Showroom",
          year: 2018,
          musicbrainzUrl:
            "https://musicbrainz.org/release-group/engine-release-4",
        },
      ],
      updatedAt: "2026-07-27T12:00:00Z",
    });

    render(<WishListWorkspace />);

    expect(
      await screen.findByText("Engine Alley", {
        selector: ".wish-list-item-copy > strong",
      }),
    ).toBeInTheDocument();
    expect(await screen.findAllByText("2 albums missing")).toHaveLength(1);
    expect(refreshWishListArtistAlbumSummary).toHaveBeenCalledWith(7);
    fireEvent.mouseEnter(screen.getByLabelText("Show 2 albums missing for Engine Alley"));
    expect(await screen.findByText("2 of 4 official albums acquired")).toBeInTheDocument();
  });

  it("searches MusicBrainz and adds an artist only after missing albums are verified", async () => {
    render(<WishListWorkspace />);
    await screen.findByText("Pet Shop Boys");

    fireEvent.click(screen.getByRole("button", { name: "Add artist or album" }));
    fireEvent.change(screen.getByLabelText("Artist name"), {
      target: { value: "Engine Alley" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search MusicBrainz" }));

    expect(
      await screen.findByText("Irish alternative rock band", { exact: false }),
    ).toBeInTheDocument();
    expect(searchWishListMusicBrainz).toHaveBeenCalledWith({
      entity: "artist",
      query: "Engine Alley",
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Engine Alley to Wish List" }));

    expect(await screen.findByText("Added Engine Alley with 2 albums missing.")).toBeInTheDocument();
    expect(addWishListMusicBrainzCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: "artist",
        title: "Engine Alley",
        musicbrainzId: "11111111-1111-4111-8111-111111111111",
      }),
    );
    expect(
      screen.getByText("Engine Alley", { selector: ".wish-list-item-copy > strong" }),
    ).toBeInTheDocument();
  });

  it("does not add an artist when every official album is already acquired", async () => {
    addWishListMusicBrainzCandidate.mockResolvedValueOnce({
      added: false,
      item: null,
      message:
        "You already have all 4 official albums by Engine Alley. The artist was not added.",
      artistAlbumSummary: {
        officialAlbumCount: 4,
        ownedAlbumCount: 4,
        missingAlbumCount: 0,
        missingAlbums: [],
        updatedAt: "2026-07-26T13:00:00Z",
      },
    });
    render(<WishListWorkspace />);
    await screen.findByText("Pet Shop Boys");

    fireEvent.click(screen.getByRole("button", { name: "Add artist or album" }));
    fireEvent.change(screen.getByLabelText("Artist name"), {
      target: { value: "Engine Alley" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search MusicBrainz" }));
    await screen.findByText("Irish alternative rock band", { exact: false });
    fireEvent.click(screen.getByRole("button", { name: "Add Engine Alley to Wish List" }));

    expect(
      await screen.findByText(
        "You already have all 4 official albums by Engine Alley. The artist was not added.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Engine Alley", {
        selector: ".wish-list-item-copy > strong",
      }),
    ).not.toBeInTheDocument();
  });

  it("searches MusicBrainz release groups before adding an album", async () => {
    searchWishListMusicBrainz.mockResolvedValueOnce({
      entity: "album",
      query: "Fundamental",
      candidates: [
        {
          entity: "album",
          title: "Fundamental",
          artist: "Pet Shop Boys",
          year: 2006,
          musicbrainzId: "22222222-2222-4222-8222-222222222222",
          musicbrainzUrl:
            "https://musicbrainz.org/release-group/22222222-2222-4222-8222-222222222222",
          disambiguation: null,
          country: null,
          score: 100,
        },
      ],
      searchedAt: "2026-07-26T12:00:00Z",
    });
    addWishListMusicBrainzCandidate.mockResolvedValueOnce({
      added: true,
      item: {
        id: 8,
        entity: "album",
        title: "Fundamental",
        artist: "Pet Shop Boys",
        year: 2006,
        musicbrainzId: "22222222-2222-4222-8222-222222222222",
        musicbrainzUrl:
          "https://musicbrainz.org/release-group/22222222-2222-4222-8222-222222222222",
        source: "MusicBrainz search",
        createdAt: "2026-07-26T13:00:00Z",
        downloadedDeezerAlbumId: null,
        downloadedPath: null,
        downloadedAt: null,
        artistAlbumSummary: null,
      },
      message: "Added Fundamental by Pet Shop Boys.",
      artistAlbumSummary: null,
    });
    render(<WishListWorkspace />);
    await screen.findByText("Pet Shop Boys");

    fireEvent.click(screen.getByRole("button", { name: "Add artist or album" }));
    fireEvent.click(screen.getByRole("button", { name: "Album" }));
    fireEvent.change(screen.getByLabelText("Album title"), {
      target: { value: "Fundamental" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search MusicBrainz" }));
    expect(await screen.findByText("Pet Shop Boys · 2006")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add Fundamental to Wish List" }));

    expect(await screen.findByText("Added Fundamental by Pet Shop Boys.")).toBeInTheDocument();
    expect(searchWishListMusicBrainz).toHaveBeenCalledWith({
      entity: "album",
      query: "Fundamental",
    });
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
    await waitFor(() =>
      expect(screen.getAllByText("No albums missing")).toHaveLength(1),
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
