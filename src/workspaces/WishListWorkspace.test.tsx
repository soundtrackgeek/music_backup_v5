import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SoulseekTransferQueue } from "../types";
import { WishListWorkspace } from "./WishListWorkspace";

const discoverWishListArtistAlbums = vi.fn();
const addWishListMusicBrainzCandidate = vi.fn();
const clearCompletedSoulseekTransfers = vi.fn();
const downloadDeemixAlbum = vi.fn();
const enqueueSoulseekRelease = vi.fn();
const getSoulseekTransfers = vi.fn();
const listWishList = vi.fn();
const listenToDeemixDownloadProgress = vi.fn();
const listenToSoulseekTransfers = vi.fn();
const openExternalUrl = vi.fn();
const preflightDeemixAlbumDownload = vi.fn();
const refreshWishListArtistAlbumSummary = vi.fn();
const removeWishListItem = vi.fn();
const searchDeemixAlbums = vi.fn();
const searchSoulseekAlbum = vi.fn();
const searchWishListMusicBrainz = vi.fn();
let soulseekTransferListener:
  | ((snapshot: SoulseekTransferQueue) => void)
  | null = null;

vi.mock("../backend", () => ({
  addWishListMusicBrainzCandidate: (...args: unknown[]) =>
    addWishListMusicBrainzCandidate(...args),
  clearCompletedSoulseekTransfers: (...args: unknown[]) =>
    clearCompletedSoulseekTransfers(...args),
  discoverWishListArtistAlbums: (...args: unknown[]) =>
    discoverWishListArtistAlbums(...args),
  downloadDeemixAlbum: (...args: unknown[]) => downloadDeemixAlbum(...args),
  enqueueSoulseekRelease: (...args: unknown[]) => enqueueSoulseekRelease(...args),
  getSoulseekTransfers: (...args: unknown[]) => getSoulseekTransfers(...args),
  listWishList: (...args: unknown[]) => listWishList(...args),
  listenToDeemixDownloadProgress: (...args: unknown[]) =>
    listenToDeemixDownloadProgress(...args),
  listenToSoulseekTransfers: (...args: unknown[]) =>
    listenToSoulseekTransfers(...args),
  openExternalUrl: (...args: unknown[]) => openExternalUrl(...args),
  preflightDeemixAlbumDownload: (...args: unknown[]) =>
    preflightDeemixAlbumDownload(...args),
  refreshWishListArtistAlbumSummary: (...args: unknown[]) =>
    refreshWishListArtistAlbumSummary(...args),
  removeWishListItem: (...args: unknown[]) => removeWishListItem(...args),
  searchDeemixAlbums: (...args: unknown[]) => searchDeemixAlbums(...args),
  searchSoulseekAlbum: (...args: unknown[]) => searchSoulseekAlbum(...args),
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

function soulseekResponse(title: string, year: number) {
  const query = `Pet Shop Boys ${title}`;
  return {
    query,
    snapshot: {
      state: "completed",
      token: 7,
      clientId: "wishlist-test",
      query,
      resultCount: 2,
      peerCount: 1,
      message: "Found 2 files from 1 person.",
      startedAtMs: 1,
      finishedAtMs: 2,
    },
    searchedAt: "2026-07-29T12:00:00Z",
    results: [1, 2].map((index) => ({
      id: `soulseek-${title}-${index}`,
      token: 7,
      username: "lossless-listener",
      filename: `Music\\Pet Shop Boys\\${title} (${year})\\0${index} - Track ${index}.flac`,
      sizeBytes: 30_000_000,
      extension: "flac",
      bitrate: 900,
      durationSeconds: 220,
      vbr: false,
      sampleRate: 44_100,
      bitDepth: 16,
      slotFree: true,
      averageSpeed: 5_000_000,
      queueLength: 0,
      isPrivate: false,
    })),
  };
}

describe("WishListWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    soulseekTransferListener = null;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 768 });
    listenToDeemixDownloadProgress.mockResolvedValue(() => undefined);
    listenToSoulseekTransfers.mockImplementation(
      async (handler: (snapshot: SoulseekTransferQueue) => void) => {
        soulseekTransferListener = handler;
        return () => undefined;
      },
    );
    getSoulseekTransfers.mockResolvedValue({
      transfers: [],
      activeCount: 0,
      maxConcurrentDownloads: 3,
      relaySuggestionMinutes: 10,
      soundcheckEnabled: true,
      safetyState: "running",
    });
    clearCompletedSoulseekTransfers.mockResolvedValue({
      transfers: [],
      activeCount: 0,
      maxConcurrentDownloads: 3,
      relaySuggestionMinutes: 10,
      soundcheckEnabled: true,
      safetyState: "running",
    });
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
    searchSoulseekAlbum.mockImplementation(
      async (input: { title: string; year: number | null }) =>
        soulseekResponse(input.title, input.year ?? 0),
    );
    enqueueSoulseekRelease.mockImplementation(
      async (request: { files: Array<{ title: string; remoteFilename: string; sizeBytes: number }> }) => ({
        transfers: request.files.map((file, index) => ({
          id: `transfer-${index}`,
          releaseId: "release-1",
          releaseTitle: "Pet Shop Boys - Release (2002)",
          releaseFolder: "Pet Shop Boys - Release (2002)",
          fileIndex: index + 1,
          fileCount: request.files.length,
          expectedTrackCount: request.files.length,
          releaseGroupId: albumMbid,
          title: file.title,
          username: "lossless-listener",
          remoteFilename: file.remoteFilename,
          sizeBytes: file.sizeBytes,
          transferredBytes: 0,
          speedBytesPerSecond: 0,
          etaSeconds: null,
          status: "queued",
          queuePosition: index + 1,
          localPath: `D:\\Music\\${file.title}`,
          error: null,
          createdAtMs: 1,
          updatedAtMs: 1,
        })),
        activeCount: 0,
        maxConcurrentDownloads: 3,
        relaySuggestionMinutes: 10,
        soundcheckEnabled: true,
        safetyState: "running",
      }),
    );
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
        warning: null,
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

  it("searches Soulseek, groups a peer folder, and queues the release", async () => {
    render(<WishListWorkspace />);
    await screen.findByText("Release");

    fireEvent.click(screen.getByLabelText("Search Release with Soulseek"));
    expect(await screen.findByText("Soulseek sources")).toBeInTheDocument();
    expect(screen.getByText("Release (2002)")).toBeInTheDocument();
    expect(screen.getByText("2 files")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Download Release from lossless-listener",
      }),
    );

    await waitFor(() =>
      expect(enqueueSoulseekRelease).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Pet Shop Boys - Release (2002)",
          username: "lossless-listener",
          remoteFolder: "Music\\Pet Shop Boys\\Release (2002)",
          expectedTrackCount: 2,
          releaseGroupId: albumMbid,
        }),
      ),
    );
    expect(await screen.findByText("2 files queued from lossless-listener.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Soulseek download queue" })).toBeInTheDocument();

    const releaseStatus = screen.getByRole("status", {
      name: "Download status for Release from lossless-listener",
    });
    expect(within(releaseStatus).getByText("Queued locally")).toBeInTheDocument();
    expect(
      within(releaseStatus).getByText(
        "0 of 2 files complete · Queued in this app · 0 of 3 transfer slots active",
      ),
    ).toBeInTheDocument();
    expect(
      within(releaseStatus).getByRole("progressbar", {
        name: "Release download progress",
      }),
    ).toHaveAttribute("value", "0");

    const queuedSnapshot = (await enqueueSoulseekRelease.mock.results[0]
      ?.value) as SoulseekTransferQueue;
    act(() => {
      soulseekTransferListener?.({
        ...queuedSnapshot,
        activeCount: 1,
        transfers: queuedSnapshot.transfers.map((transfer, index) =>
          index === 0
            ? { ...transfer, status: "remotelyQueued", queuePosition: 7 }
            : transfer,
        ),
      });
    });
    expect(await within(releaseStatus).findByText("Peer queue #7")).toBeInTheDocument();
    expect(
      within(releaseStatus).getByText(
        "0 of 2 files complete · Waiting in lossless-listener's peer queue at position 7",
      ),
    ).toBeInTheDocument();

    act(() => {
      soulseekTransferListener?.({
        ...queuedSnapshot,
        activeCount: 1,
        transfers: queuedSnapshot.transfers.map((transfer, index) =>
          index === 0
            ? {
                ...transfer,
                status: "completed",
                transferredBytes: transfer.sizeBytes,
              }
            : {
                ...transfer,
                status: "downloading",
                transferredBytes: transfer.sizeBytes / 2,
                speedBytesPerSecond: 2_500_000,
                etaSeconds: 45,
                queuePosition: null,
              },
        ),
      });
    });
    expect(await within(releaseStatus).findByText("Downloading 75%")).toBeInTheDocument();
    expect(within(releaseStatus).getByText(/1 of 2 files complete/)).toBeInTheDocument();
    expect(within(releaseStatus).getByText(/2\.4 MB\/s/)).toBeInTheDocument();
    expect(
      within(releaseStatus).getByRole("progressbar", {
        name: "Release download progress",
      }),
    ).toHaveAttribute("value", "75");
  });

  it("shows searched albums before transfer history and clears completed Soulseek releases", async () => {
    const completedQueue = {
      transfers: [1, 2].map((index) => ({
        id: `completed-transfer-${index}`,
        releaseId: "completed-release",
        releaseTitle: "Pet Shop Boys - Please (1986)",
        releaseFolder: "Pet Shop Boys - Please (1986)",
        fileIndex: index,
        fileCount: 2,
        expectedTrackCount: 2,
        releaseGroupId: "00000000-0000-4000-8000-000000000001",
        title: `0${index} - Track ${index}.flac`,
        username: "lossless-listener",
        remoteFilename: `Music\\Pet Shop Boys\\Please (1986)\\0${index} - Track ${index}.flac`,
        sizeBytes: 30_000_000,
        transferredBytes: 30_000_000,
        speedBytesPerSecond: 0,
        etaSeconds: null,
        status: "completed" as const,
        queuePosition: null,
        localPath: `D:\\Music\\Pet Shop Boys - Please (1986)\\0${index} - Track ${index}.flac`,
        error: null,
        createdAtMs: index,
        updatedAtMs: index,
      })),
      activeCount: 0,
      maxConcurrentDownloads: 3,
      relaySuggestionMinutes: 10,
      soundcheckEnabled: true,
      safetyState: "running" as const,
    } satisfies SoulseekTransferQueue;
    getSoulseekTransfers.mockResolvedValueOnce(completedQueue);
    render(<WishListWorkspace />);

    await screen.findByText("Pet Shop Boys");
    fireEvent.click(
      screen.getByLabelText(
        "Search Pet Shop Boys official albums with Deemix and Soulseek",
      ),
    );
    const albumsHeading = await screen.findByRole("heading", { name: "Albums found" });
    const transfersHeading = screen.getByRole("heading", { name: "Soulseek transfers" });

    expect(
      albumsHeading.compareDocumentPosition(transfersHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear completed (2)" }));

    await waitFor(() => expect(clearCompletedSoulseekTransfers).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("region", { name: "Soulseek download queue" })).not.toBeInTheDocument();
  });

  it("completes the download with a warning when Deezer has no artwork", async () => {
    downloadDeemixAlbum.mockResolvedValueOnce({
      requestId: "no-cover-request",
      albumId: "123",
      artist: "Pet Shop Boys",
      album: "Release (2017 Remaster)",
      year: 2002,
      quality: "mp3_320",
      destinationPath: "D:\\Music\\Pet Shop Boys - Release (2017 Remaster) (2002)",
      coverPath: null,
      warning: "Downloaded without artwork because Deezer did not provide an album image.",
      trackCount: 10,
      completedAt: "2026-07-26T12:30:00Z",
    });
    render(<WishListWorkspace />);
    await screen.findByText("Release");

    fireEvent.click(screen.getByLabelText("Search Release with Deemix"));
    await screen.findByText("Release (2017 Remaster)");
    fireEvent.click(
      screen.getByRole("button", { name: "Download Release (2017 Remaster)" }),
    );

    expect(await screen.findByText("Downloaded and tagged 10 tracks")).toBeInTheDocument();
    expect(
      screen.getAllByText(
        "Downloaded without artwork because Deezer did not provide an album image.",
        { exact: false },
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("0 queued · 1 completed")).toBeInTheDocument();
    expect(screen.queryByText(/1 failed/)).not.toBeInTheDocument();
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
                warning: null,
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
        warning: null,
        trackCount: 10,
        completedAt: "2026-07-26T12:31:00Z",
      }));

    render(<WishListWorkspace />);
    await screen.findByText("Pet Shop Boys");
    fireEvent.click(
      screen.getByLabelText(
        "Search Pet Shop Boys official albums with Deemix and Soulseek",
      ),
    );

    expect(await screen.findByRole("heading", { name: "Albums found" })).toBeInTheDocument();
    expect(discoverWishListArtistAlbums).toHaveBeenCalledWith(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Download Please with Deemix" }),
    );
    await waitFor(() => expect(downloadDeemixAlbum).toHaveBeenCalledTimes(1));
    fireEvent.click(
      screen.getByRole("button", { name: "Download Actually with Deemix" }),
    );
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

  it("automatically searches Soulseek for every missing artist album and queues a selected source", async () => {
    render(<WishListWorkspace />);
    await screen.findByText("Pet Shop Boys");
    fireEvent.click(
      screen.getByLabelText(
        "Search Pet Shop Boys official albums with Deemix and Soulseek",
      ),
    );
    await screen.findByRole("heading", { name: "Albums found" });

    await waitFor(() =>
      expect(searchSoulseekAlbum).toHaveBeenCalledWith({
        artist: "Pet Shop Boys",
        title: "Please",
        year: 1986,
      }),
    );
    expect(searchSoulseekAlbum).toHaveBeenCalledWith({
      artist: "Pet Shop Boys",
      title: "Actually",
      year: 1987,
    });
    expect(
      screen.getByRole("button", { name: "Download Please with Deemix" }),
    ).toBeInTheDocument();

    const sources = await screen.findByRole("region", {
      name: "Soulseek sources for Please",
    });
    expect(
      screen.getByRole("region", { name: "Soulseek sources for Actually" }),
    ).toBeInTheDocument();
    expect(within(sources).getByText("Please (1986)")).toBeInTheDocument();
    expect(within(sources).getByText("2 files")).toBeInTheDocument();
    fireEvent.click(
      within(sources).getByRole("button", {
        name: "Download Please from lossless-listener",
      }),
    );

    await waitFor(() =>
      expect(enqueueSoulseekRelease).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Pet Shop Boys - Please (1986)",
          username: "lossless-listener",
          remoteFolder: "Music\\Pet Shop Boys\\Please (1986)",
          expectedTrackCount: 2,
          releaseGroupId: "00000000-0000-4000-8000-000000000001",
        }),
      ),
    );
    expect(
      await within(sources).findByText("2 files queued from lossless-listener."),
    ).toBeInTheDocument();
  });

  it("queues every missing matched artist album with Download all", async () => {
    render(<WishListWorkspace />);
    await screen.findByText("Pet Shop Boys");
    fireEvent.click(
      screen.getByLabelText(
        "Search Pet Shop Boys official albums with Deemix and Soulseek",
      ),
    );
    await screen.findByRole("heading", { name: "Albums found" });

    fireEvent.click(
      screen.getByRole("button", { name: "Download all with Deemix" }),
    );

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
