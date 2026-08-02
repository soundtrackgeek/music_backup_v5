import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ArtistCompletionWorkspace } from "./ArtistCompletionWorkspace";

const getLibraryCompletionArtists = vi.fn();
const getLibraryCompletionArtistVerificationStatus = vi.fn();
const getDiscogsCredentialStatus = vi.fn();
const startLibraryCompletionArtistVerification = vi.fn();
const setLibraryCompletionArtistVerificationState = vi.fn();
const retryLibraryCompletionArtistVerificationFailures = vi.fn();
const searchWishListMusicBrainz = vi.fn();
const openExternalUrl = vi.fn();
const confirmLibraryCompletionArtistMatch = vi.fn();
const setLibraryCompletionArtistDecision = vi.fn();

vi.mock("../backend", () => ({
  getLibraryCompletionArtists: (...args: unknown[]) => getLibraryCompletionArtists(...args),
  getLibraryCompletionArtistVerificationStatus: (...args: unknown[]) =>
    getLibraryCompletionArtistVerificationStatus(...args),
  getDiscogsCredentialStatus: (...args: unknown[]) => getDiscogsCredentialStatus(...args),
  startLibraryCompletionArtistVerification: (...args: unknown[]) =>
    startLibraryCompletionArtistVerification(...args),
  setLibraryCompletionArtistVerificationState: (...args: unknown[]) =>
    setLibraryCompletionArtistVerificationState(...args),
  retryLibraryCompletionArtistVerificationFailures: (...args: unknown[]) =>
    retryLibraryCompletionArtistVerificationFailures(...args),
  searchWishListMusicBrainz: (...args: unknown[]) => searchWishListMusicBrainz(...args),
  openExternalUrl: (...args: unknown[]) => openExternalUrl(...args),
  confirmLibraryCompletionArtistMatch: (...args: unknown[]) =>
    confirmLibraryCompletionArtistMatch(...args),
  setLibraryCompletionArtistDecision: (...args: unknown[]) =>
    setLibraryCompletionArtistDecision(...args),
}));

const candidate = {
  id: "talk talk",
  artist: "Talk Talk",
  firstChartYear: 1982,
  confidence: "best",
  status: "candidate",
  wishListItemId: null,
  verificationStatus: "unverified",
  verificationMessage: null,
  verificationCheckedAt: null,
  musicbrainzVerificationStatus: null,
  musicbrainzVerificationMessage: null,
  musicbrainzId: null,
  musicbrainzUrl: null,
  officialAlbumCount: 0,
  discogsVerificationStatus: null,
  discogsVerificationMessage: null,
  discogsMasterId: null,
  discogsUrl: null,
  discogsStudioAlbumTitle: null,
  evidence: [
    {
      source: "officialUk",
      chartKind: "albums",
      label: "Official UK Albums",
      bestRank: 1,
      firstYear: 1984,
      lastYear: 1991,
      appearances: 73,
    },
    {
      source: "billboard",
      chartKind: "singles",
      label: "Billboard Hot 100",
      bestRank: 31,
      firstYear: 1984,
      lastYear: 1984,
      appearances: 8,
    },
  ],
} as const;

const response = {
  generatedAt: "2026-07-29T10:00:00Z",
  totalChartArtists: 3_862,
  ownedArtistCount: 2_174,
  totalCandidates: 1_688,
  returnedCandidates: 1,
  truncated: false,
  candidates: [candidate],
} as const;

const emptyStatus = { batch: null, recentItems: [] } as const;

const runningStatus = {
  batch: {
    id: 17,
    label: "Selected chart artists (1)",
    state: "running",
    totalCount: 1,
    queuedCount: 0,
    checkingCount: 1,
    verifiedCount: 0,
    noMatchCount: 0,
    ambiguousCount: 0,
    failedCount: 0,
    completedCount: 0,
    estimatedSecondsRemaining: 18,
    createdAt: "2026-07-29T10:01:00Z",
    updatedAt: "2026-07-29T10:01:00Z",
    completedAt: null,
  },
  recentItems: [{
    artistId: "talk talk",
    artist: "Talk Talk",
    state: "checking",
    provider: "musicbrainz",
    message: null,
    officialAlbumCount: 0,
    updatedAt: "2026-07-29T10:01:00Z",
  }],
} as const;

const completedFailureStatus = {
  batch: {
    ...runningStatus.batch,
    state: "completed",
    checkingCount: 0,
    failedCount: 1,
    completedCount: 1,
    estimatedSecondsRemaining: 0,
    updatedAt: "2026-07-29T10:02:00Z",
    completedAt: "2026-07-29T10:02:00Z",
  },
  recentItems: [{
    ...runningStatus.recentItems[0],
    state: "failed",
    message: "MusicBrainz lookup failed.",
    updatedAt: "2026-07-29T10:02:00Z",
  }],
} as const;

describe("ArtistCompletionWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLibraryCompletionArtists.mockResolvedValue(response);
    getLibraryCompletionArtistVerificationStatus.mockResolvedValue(emptyStatus);
    getDiscogsCredentialStatus.mockResolvedValue({
      configured: true,
      source: "windowsCredentialManager",
    });
    startLibraryCompletionArtistVerification.mockResolvedValue(runningStatus);
    searchWishListMusicBrainz.mockResolvedValue({
      entity: "artist",
      query: "Talk Talk",
      candidates: [],
      searchedAt: "2026-07-29T10:02:00Z",
    });
    openExternalUrl.mockResolvedValue(undefined);
    setLibraryCompletionArtistDecision.mockResolvedValue({
      artistId: "talk talk",
      status: "wanted",
      wishListItemId: 91,
      missingAlbumCount: 5,
      message: "Added Talk Talk with 5 albums missing.",
      updatedAt: "2026-07-29T10:03:00Z",
    });
  });

  it("combines album and singles evidence while proving the artist is absent locally", async () => {
    render(<ArtistCompletionWorkspace refreshToken={0} onOpenWishList={vi.fn()} />);

    expect(await screen.findByRole("heading", { name: "Talk Talk" })).toBeInTheDocument();
    expect(screen.getAllByText("Official UK Albums").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Billboard Hot 100").length).toBeGreaterThan(0);
    expect(screen.getByText("Confirmed absent locally")).toBeInTheDocument();
    expect(screen.getByText(/track album artist, or track artist match/i)).toBeInTheDocument();
  });

  it("filters the artist queue to rows whose visible status is unverified", async () => {
    getLibraryCompletionArtists.mockResolvedValue({
      ...response,
      returnedCandidates: 3,
      candidates: [
        candidate,
        {
          ...candidate,
          id: "verified artist",
          artist: "Verified Artist",
          verificationStatus: "verified",
          officialAlbumCount: 2,
        },
        {
          ...candidate,
          id: "review artist",
          artist: "Review Artist",
          status: "needsReview",
        },
      ],
    });
    render(<ArtistCompletionWorkspace refreshToken={0} onOpenWishList={vi.fn()} />);

    const artistFilter = screen.getByRole("combobox", {
      name: "Filter missing chart artists",
    });
    expect(await screen.findByText("Verified Artist")).toBeInTheDocument();
    expect(screen.getByText("Review Artist")).toBeInTheDocument();

    fireEvent.change(artistFilter, { target: { value: "unverified" } });

    expect(artistFilter).toHaveValue("unverified");
    expect(screen.getByText("1 shown")).toBeInTheDocument();
    expect(screen.getAllByText("Talk Talk").length).toBeGreaterThan(0);
    expect(screen.queryByText("Verified Artist")).not.toBeInTheDocument();
    expect(screen.queryByText("Review Artist")).not.toBeInTheDocument();
  });

  it("keeps the active unverified queue static through verification and rebuilds it on refresh", async () => {
    const failedResponse = {
      ...response,
      candidates: [{
        ...candidate,
        verificationStatus: "failed",
        verificationMessage: "MusicBrainz lookup failed.",
        musicbrainzVerificationStatus: "failed",
        musicbrainzVerificationMessage: "MusicBrainz lookup failed.",
      }],
    } as const;
    getLibraryCompletionArtists
      .mockResolvedValueOnce(response)
      .mockResolvedValue(failedResponse);
    startLibraryCompletionArtistVerification.mockResolvedValue(completedFailureStatus);
    const { rerender } = render(
      <ArtistCompletionWorkspace refreshToken={0} onOpenWishList={vi.fn()} />,
    );

    await screen.findByRole("heading", { name: "Talk Talk" });
    fireEvent.change(screen.getByRole("combobox", {
      name: "Filter missing chart artists",
    }), { target: { value: "unverified" } });
    const queue = screen.getByLabelText("Artist discovery candidates");
    queue.scrollTop = 320;
    fireEvent.scroll(queue);
    fireEvent.click(screen.getByRole("button", { name: "Verify artist" }));

    await waitFor(() => expect(getLibraryCompletionArtists).toHaveBeenCalledTimes(2));
    expect(screen.getByText("1 shown")).toBeInTheDocument();
    expect(screen.getByRole("button", {
      name: /Talk Talk.*Failed/,
    })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Verify artist" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Talk Talk" })).toBeInTheDocument();
    expect(queue.scrollTop).toBe(320);

    rerender(<ArtistCompletionWorkspace refreshToken={1} onOpenWishList={vi.fn()} />);

    await waitFor(() => expect(getLibraryCompletionArtists).toHaveBeenCalledTimes(3));
    expect(screen.getByText("0 shown")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Talk Talk" })).not.toBeInTheDocument();
  });

  it("starts a persistent verification run for selected artists", async () => {
    render(<ArtistCompletionWorkspace refreshToken={0} onOpenWishList={vi.fn()} />);

    await screen.findByRole("heading", { name: "Talk Talk" });
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Talk Talk for verification" }));
    fireEvent.click(screen.getByRole("button", { name: "Verify selected (1)" }));

    await waitFor(() => {
      expect(startLibraryCompletionArtistVerification).toHaveBeenCalledWith({
        artistIds: ["talk talk"],
        label: "Selected chart artists (1)",
      });
    });
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
    expect(screen.getByText(/Checking MusicBrainz: Talk Talk/i)).toBeInTheDocument();
  });

  it("offers every artist chart and loads chart-specific year filters", async () => {
    render(<ArtistCompletionWorkspace refreshToken={0} onOpenWishList={vi.fn()} />);

    await screen.findByRole("heading", { name: "Talk Talk" });
    const chartFilter = screen.getByRole("combobox", {
      name: "Filter artist chart source",
    });
    for (const label of [
      "Billboard Charts Albums",
      "Billboard Charts Singles",
      "Official UK Charts Albums",
      "Official UK Charts Singles",
      "VG Lista Charts Albums",
      "VG Lista Charts Singles",
      "Ti i Skuddet Singles",
      "Norsktoppen Singles",
    ]) {
      expect(screen.getByRole("option", { name: label })).toBeInTheDocument();
    }
    fireEvent.change(chartFilter, {
      target: { value: "billboardSingles" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Artist chart year from" }), {
      target: { value: "1980" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Artist chart year to" }), {
      target: { value: "1989" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));

    await waitFor(() => {
      expect(getLibraryCompletionArtists).toHaveBeenLastCalledWith({
        source: "billboard",
        chartKind: "singles",
        yearFrom: 1980,
        yearTo: 1989,
      });
    });
    expect(screen.getByRole("button", { name: "Clear artist chart filters" })).toBeInTheDocument();
  });

  it("links every manual artist candidate to its exact MusicBrainz page", async () => {
    const musicbrainzUrl = "https://musicbrainz.org/artist/11111111-1111-4111-8111-111111111111";
    getLibraryCompletionArtists.mockResolvedValue({
      ...response,
      candidates: [{
        ...candidate,
        verificationStatus: "ambiguous",
        verificationMessage: "MusicBrainz returned multiple exact artists.",
        musicbrainzVerificationStatus: "ambiguous",
        musicbrainzVerificationMessage: "MusicBrainz returned multiple exact artists.",
      }],
    });
    searchWishListMusicBrainz.mockResolvedValue({
      entity: "artist",
      query: "Talk Talk",
      candidates: [{
        entity: "artist",
        title: "Talk Talk",
        artist: "Talk Talk",
        year: null,
        musicbrainzId: "11111111-1111-4111-8111-111111111111",
        musicbrainzUrl,
        disambiguation: "English band",
        country: "GB",
        score: 100,
      }],
      searchedAt: "2026-07-29T10:02:00Z",
    });
    render(<ArtistCompletionWorkspace refreshToken={0} onOpenWishList={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Review matches" }));
    const musicbrainzLink = await screen.findByRole("link", { name: "View Talk Talk on MusicBrainz" });

    expect(musicbrainzLink).toHaveAttribute("href", musicbrainzUrl);
    expect(screen.getByRole("button", { name: "Check Talk Talk identity" })).toBeInTheDocument();
    fireEvent.click(musicbrainzLink);

    await waitFor(() => expect(openExternalUrl).toHaveBeenCalledWith(musicbrainzUrl));
    expect(confirmLibraryCompletionArtistMatch).not.toHaveBeenCalled();
  });

  it("restores the artist queue position after verification data refreshes", async () => {
    let resolveRefresh!: (value: typeof response) => void;
    const refreshedArtists = new Promise<typeof response>((resolve) => {
      resolveRefresh = resolve;
    });
    getLibraryCompletionArtists
      .mockResolvedValueOnce(response)
      .mockReturnValueOnce(refreshedArtists);
    const { rerender } = render(
      <ArtistCompletionWorkspace refreshToken={0} onOpenWishList={vi.fn()} />,
    );

    await screen.findByRole("heading", { name: "Talk Talk" });
    const queue = screen.getByLabelText("Artist discovery candidates");
    queue.scrollTop = 320;
    fireEvent.scroll(queue);

    rerender(<ArtistCompletionWorkspace refreshToken={1} onOpenWishList={vi.fn()} />);
    await waitFor(() => expect(getLibraryCompletionArtists).toHaveBeenCalledTimes(2));
    queue.scrollTop = 0;
    await act(async () => resolveRefresh({ ...response }));

    await waitFor(() => expect(queue.scrollTop).toBe(320));
    expect(screen.getByRole("heading", { name: "Talk Talk" })).toBeInTheDocument();
  });

  it("shows both provider outcomes and promotes a verified artist into Wish List Artists", async () => {
    getLibraryCompletionArtists.mockResolvedValue({
      ...response,
      candidates: [{
        ...candidate,
        verificationStatus: "verified",
        verificationMessage: "MusicBrainz confirmed 5 official studio albums; Discogs corroborated the artist.",
        verificationCheckedAt: "2026-07-29T10:03:00Z",
        musicbrainzVerificationStatus: "verified",
        musicbrainzVerificationMessage: "MusicBrainz confirmed 5 official studio albums for this artist.",
        musicbrainzId: "11111111-1111-4111-8111-111111111111",
        musicbrainzUrl: "https://musicbrainz.org/artist/11111111-1111-4111-8111-111111111111",
        officialAlbumCount: 5,
        discogsVerificationStatus: "verified",
        discogsVerificationMessage: "Discogs corroborated this artist with an accepted studio-album master.",
        discogsMasterId: "424242",
        discogsUrl: "https://www.discogs.com/master/424242",
        discogsStudioAlbumTitle: "The Colour of Spring",
      }],
    });
    render(<ArtistCompletionWorkspace refreshToken={0} onOpenWishList={vi.fn()} />);

    expect(await screen.findByText("5 official studio albums found")).toBeInTheDocument();
    expect(screen.getAllByText("Checked · verified")).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "Add artist to Wish List" })[0]);

    await waitFor(() => {
      expect(setLibraryCompletionArtistDecision).toHaveBeenCalledWith({
        artistId: "talk talk",
        artist: "Talk Talk",
        status: "wanted",
      });
    });
    expect(screen.getByText("Added Talk Talk with 5 albums missing.")).toBeInTheDocument();
    expect(screen.getAllByText("In Wish List").length).toBeGreaterThan(0);
  });
});
