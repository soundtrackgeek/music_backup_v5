import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LibraryCompletionWorkspace } from "./LibraryCompletionWorkspace";

const getLibraryCompletion = vi.fn();
const getLibraryCompletionVerificationStatus = vi.fn();
const getDiscogsCredentialStatus = vi.fn();
const getLibraryCompletionCoverDataUrl = vi.fn();
const enrichLibraryCompletionCover = vi.fn();
const startLibraryCompletionVerification = vi.fn();
const setLibraryCompletionVerificationState = vi.fn();
const retryLibraryCompletionVerificationFailures = vi.fn();
const setLibraryCompletionDecision = vi.fn();
const searchWishListMusicBrainz = vi.fn();
const addWishListMusicBrainzCandidate = vi.fn();
const searchDeemixAlbums = vi.fn();
const getLibraryCompletionArtists = vi.fn();
const getLibraryCompletionArtistVerificationStatus = vi.fn();
const startLibraryCompletionArtistVerification = vi.fn();
const setLibraryCompletionArtistVerificationState = vi.fn();
const retryLibraryCompletionArtistVerificationFailures = vi.fn();
const confirmLibraryCompletionArtistMatch = vi.fn();
const setLibraryCompletionArtistDecision = vi.fn();

vi.mock("../backend", () => ({
  getLibraryCompletion: (...args: unknown[]) => getLibraryCompletion(...args),
  getLibraryCompletionVerificationStatus: (...args: unknown[]) =>
    getLibraryCompletionVerificationStatus(...args),
  getDiscogsCredentialStatus: (...args: unknown[]) =>
    getDiscogsCredentialStatus(...args),
  getLibraryCompletionCoverDataUrl: (...args: unknown[]) =>
    getLibraryCompletionCoverDataUrl(...args),
  enrichLibraryCompletionCover: (...args: unknown[]) =>
    enrichLibraryCompletionCover(...args),
  startLibraryCompletionVerification: (...args: unknown[]) =>
    startLibraryCompletionVerification(...args),
  setLibraryCompletionVerificationState: (...args: unknown[]) =>
    setLibraryCompletionVerificationState(...args),
  retryLibraryCompletionVerificationFailures: (...args: unknown[]) =>
    retryLibraryCompletionVerificationFailures(...args),
  setLibraryCompletionDecision: (...args: unknown[]) =>
    setLibraryCompletionDecision(...args),
  searchWishListMusicBrainz: (...args: unknown[]) =>
    searchWishListMusicBrainz(...args),
  addWishListMusicBrainzCandidate: (...args: unknown[]) =>
    addWishListMusicBrainzCandidate(...args),
  searchDeemixAlbums: (...args: unknown[]) => searchDeemixAlbums(...args),
  getLibraryCompletionArtists: (...args: unknown[]) => getLibraryCompletionArtists(...args),
  getLibraryCompletionArtistVerificationStatus: (...args: unknown[]) =>
    getLibraryCompletionArtistVerificationStatus(...args),
  startLibraryCompletionArtistVerification: (...args: unknown[]) =>
    startLibraryCompletionArtistVerification(...args),
  setLibraryCompletionArtistVerificationState: (...args: unknown[]) =>
    setLibraryCompletionArtistVerificationState(...args),
  retryLibraryCompletionArtistVerificationFailures: (...args: unknown[]) =>
    retryLibraryCompletionArtistVerificationFailures(...args),
  confirmLibraryCompletionArtistMatch: (...args: unknown[]) =>
    confirmLibraryCompletionArtistMatch(...args),
  setLibraryCompletionArtistDecision: (...args: unknown[]) =>
    setLibraryCompletionArtistDecision(...args),
}));

const response = {
  generatedAt: "2026-07-29T10:00:00Z",
  totalChartAlbums: 2_164,
  totalCandidates: 1_248,
  returnedCandidates: 1,
  truncated: true,
  candidates: [
    {
      id: "talk talk\u001fthe colour of spring",
      artist: "Talk Talk",
      title: "The Colour of Spring",
      chartYear: 1986,
      confidence: "best",
      status: "candidate",
      wishListItemId: null,
      musicbrainzId: null,
      musicbrainzUrl: null,
      coverUrl: null,
      coverStatus: null,
      coverProvider: null,
      coverMessage: null,
      coverCheckedAt: null,
      verificationStatus: "unverified",
      verificationProvider: null,
      verificationMessage: null,
      verificationCheckedAt: null,
      musicbrainzVerificationStatus: null,
      musicbrainzVerificationMessage: null,
      discogsVerificationStatus: null,
      discogsVerificationMessage: null,
      discogsMasterId: null,
      discogsUrl: null,
      evidence: [
        {
          source: "officialUk",
          label: "Official UK Albums",
          bestRank: 8,
          firstYear: 1986,
          lastYear: 1986,
          appearances: 12,
        },
      ],
    },
  ],
  atlas: [
    {
      source: "officialUk",
      label: "Official UK Albums",
      decade: 1980,
      owned: 159,
      candidates: 176,
      verified: 0,
      wanted: 17,
      needsReview: 63,
      excluded: 3,
      total: 418,
    },
  ],
} as const;

const emptyVerificationStatus = {
  batch: null,
  recentItems: [],
};

const runningVerificationStatus = {
  batch: {
    id: 7,
    label: "Talk Talk — The Colour of Spring",
    source: null,
    decade: null,
    state: "running",
    totalCount: 1,
    queuedCount: 0,
    checkingCount: 1,
    verifiedCount: 0,
    discogsVerifiedCount: 0,
    noMatchCount: 0,
    ambiguousCount: 0,
    failedCount: 0,
    cachedCount: 0,
    completedCount: 0,
    estimatedSecondsRemaining: 2,
    createdAt: "2026-07-29T10:05:00Z",
    updatedAt: "2026-07-29T10:05:00Z",
    completedAt: null,
  },
  recentItems: [
    {
      candidateId: response.candidates[0].id,
      artist: "Talk Talk",
      title: "The Colour of Spring",
      state: "checking",
      provider: "musicbrainz",
      message: null,
      musicbrainzId: null,
      musicbrainzUrl: null,
      musicbrainzVerificationStatus: null,
      musicbrainzVerificationMessage: null,
      discogsVerificationStatus: null,
      discogsVerificationMessage: null,
      discogsMasterId: null,
      discogsUrl: null,
      updatedAt: "2026-07-29T10:05:00Z",
    },
  ],
} as const;

const completedVerificationStatus = {
  batch: {
    ...runningVerificationStatus.batch,
    state: "completed",
    checkingCount: 0,
    verifiedCount: 1,
    completedCount: 1,
    estimatedSecondsRemaining: 0,
    completedAt: "2026-07-29T10:05:02Z",
  },
  recentItems: [{
    ...runningVerificationStatus.recentItems[0],
    state: "verified",
    message: "MusicBrainz confirmed an official studio-album release group.",
    musicbrainzId: "01234567-89ab-cdef-0123-456789abcdef",
    musicbrainzUrl: "https://musicbrainz.org/release-group/01234567-89ab-cdef-0123-456789abcdef",
    musicbrainzVerificationStatus: "verified",
    musicbrainzVerificationMessage: "MusicBrainz confirmed an official studio-album release group.",
    updatedAt: "2026-07-29T10:05:02Z",
  }],
} as const;

describe("LibraryCompletionWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    HTMLElement.prototype.scrollIntoView = vi.fn();
    getLibraryCompletion.mockResolvedValue(response);
    getLibraryCompletionVerificationStatus.mockResolvedValue(emptyVerificationStatus);
    getDiscogsCredentialStatus.mockResolvedValue({
      configured: true,
      source: "windowsCredentialManager",
    });
    getLibraryCompletionCoverDataUrl.mockResolvedValue(
      "data:image/png;base64,cHJldmlldw==",
    );
    enrichLibraryCompletionCover.mockResolvedValue({
      candidateId: response.candidates[0].id,
      state: "available",
      provider: "musicbrainz",
      message: "Cover Art Archive artwork is cached locally.",
      hasCover: true,
      checkedAt: "2026-07-29T10:06:00Z",
    });
    startLibraryCompletionVerification.mockResolvedValue(runningVerificationStatus);
    setLibraryCompletionVerificationState.mockResolvedValue({
      ...runningVerificationStatus,
      batch: { ...runningVerificationStatus.batch, state: "paused" },
    });
    retryLibraryCompletionVerificationFailures.mockResolvedValue(runningVerificationStatus);
    setLibraryCompletionDecision.mockResolvedValue({
      candidateId: response.candidates[0].id,
      status: "wanted",
      wishListItemId: 14,
      musicbrainzId: null,
      musicbrainzUrl: null,
      updatedAt: "2026-07-29T10:05:00Z",
    });
    searchWishListMusicBrainz.mockResolvedValue({
      entity: "album",
      query: "Talk Talk The Colour of Spring",
      candidates: [],
      searchedAt: "2026-07-29T10:05:00Z",
    });
    addWishListMusicBrainzCandidate.mockResolvedValue({
      added: true,
      item: null,
      message: "Added.",
      artistAlbumSummary: null,
    });
    searchDeemixAlbums.mockResolvedValue({
      query: "Talk Talk The Colour of Spring",
      total: 0,
      matches: [],
      searchedAt: "2026-07-29T10:05:00Z",
    });
    getLibraryCompletionArtists.mockResolvedValue({
      generatedAt: "2026-07-29T10:00:00Z",
      totalChartArtists: 0,
      ownedArtistCount: 0,
      totalCandidates: 0,
      returnedCandidates: 0,
      truncated: false,
      candidates: [],
    });
    getLibraryCompletionArtistVerificationStatus.mockResolvedValue({ batch: null, recentItems: [] });
  });

  it("moves from an Atlas cohort into a filtered Workbench campaign", async () => {
    render(<LibraryCompletionWorkspace onOpenWishList={vi.fn()} />);

    expect(
      await screen.findByRole("heading", { name: "The Colour of Spring" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Coverage Atlas/i }));
    expect(screen.getByRole("heading", { name: "Where the collection is thin" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Review candidates" }));

    await waitFor(() => {
      expect(getLibraryCompletion).toHaveBeenLastCalledWith({
        source: "officialUk",
        decade: 1980,
      });
    });
    expect(screen.getByText("Campaign")).toBeInTheDocument();
    expect(screen.getByText("Official UK Albums · 1980s")).toBeInTheDocument();
    expect(screen.getByText("1 album loaded · 1 to verify · 0 verified")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "The Colour of Spring" })).toBeInTheDocument();
  });

  it("loads album chart-source and year filters before the Workbench cap", async () => {
    render(<LibraryCompletionWorkspace onOpenWishList={vi.fn()} />);

    await screen.findByRole("heading", { name: "The Colour of Spring" });
    fireEvent.change(screen.getByRole("combobox", { name: "Filter album chart source" }), {
      target: { value: "vgLista" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Album chart year from" }), {
      target: { value: "1980" },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Album chart year to" }), {
      target: { value: "1989" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));

    await waitFor(() => {
      expect(getLibraryCompletion).toHaveBeenLastCalledWith({
        source: "vgLista",
        decade: null,
        yearFrom: 1980,
        yearTo: 1989,
      });
    });
    expect(screen.getByRole("button", { name: "Clear album chart filters" })).toBeInTheDocument();
  });

  it("queues the current album for persistent MusicBrainz verification", async () => {
    render(<LibraryCompletionWorkspace onOpenWishList={vi.fn()} />);

    await screen.findByRole("heading", { name: "The Colour of Spring" });
    fireEvent.click(screen.getByRole("button", { name: "Verify album" }));

    await waitFor(() => {
      expect(startLibraryCompletionVerification).toHaveBeenCalledWith({
        scope: "candidate",
        candidateIds: [response.candidates[0].id],
        source: null,
        decade: null,
        label: "Talk Talk — The Colour of Spring",
      });
    });
    expect(screen.getByText("0 / 1")).toBeInTheDocument();
    expect(screen.getByText(/Checking MusicBrainz: Talk Talk — The Colour of Spring/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("keeps a manual review path when a queued check finds no studio album", async () => {
    getLibraryCompletion.mockResolvedValueOnce({
      ...response,
      candidates: [{
        ...response.candidates[0],
        verificationStatus: "noMatch",
        verificationProvider: "musicbrainz",
        verificationMessage: "MusicBrainz returned no exact artist and primary Album title match.",
        verificationCheckedAt: "2026-07-29T10:05:00Z",
        musicbrainzVerificationStatus: "noMatch",
        musicbrainzVerificationMessage:
          "MusicBrainz returned no exact artist and primary Album title match.",
      }],
    });
    render(<LibraryCompletionWorkspace onOpenWishList={vi.fn()} />);

    await screen.findByRole("heading", { name: "The Colour of Spring" });
    expect(screen.getByText("Checked · no exact match")).toBeInTheDocument();
    expect(screen.getAllByText("Manual review").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Review matches" }));

    expect(await screen.findByText("No studio-album match found")).toBeInTheDocument();
    expect(screen.getByText(/candidate remains unverified/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review matches" })).toBeInTheDocument();
    expect(searchWishListMusicBrainz).toHaveBeenCalledWith({
      entity: "album",
      query: "The Colour of Spring",
      artist: "Talk Talk",
      year: 1986,
    });
  });

  it("starts verification directly from the selected Coverage Atlas cohort", async () => {
    render(<LibraryCompletionWorkspace onOpenWishList={vi.fn()} />);

    await screen.findByRole("heading", { name: "The Colour of Spring" });
    fireEvent.click(screen.getByRole("button", { name: /Coverage Atlas/i }));
    fireEvent.click(screen.getByRole("button", { name: "Verify this cohort" }));

    await waitFor(() => {
      expect(startLibraryCompletionVerification).toHaveBeenCalledWith({
        scope: "campaign",
        candidateIds: [],
        source: "officialUk",
        decade: 1980,
        label: "Official UK Albums · 1980s",
      });
    });
  });

  it("pauses a running verification batch without discarding progress", async () => {
    getLibraryCompletionVerificationStatus.mockResolvedValue(runningVerificationStatus);
    render(<LibraryCompletionWorkspace onOpenWishList={vi.fn()} />);

    expect(await screen.findByText("0 / 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));

    await waitFor(() => {
      expect(setLibraryCompletionVerificationState).toHaveBeenCalledWith({
        batchId: 7,
        state: "paused",
      });
    });
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
    expect(screen.getByText(/Checking MusicBrainz: Talk Talk — The Colour of Spring/i)).toBeInTheDocument();
  });

  it("persists a wanted decision with the chart evidence source", async () => {
    render(<LibraryCompletionWorkspace onOpenWishList={vi.fn()} />);

    await screen.findByRole("heading", { name: "The Colour of Spring" });
    fireEvent.click(screen.getByRole("button", { name: "Mark wanted" }));

    await waitFor(() => {
      expect(setLibraryCompletionDecision).toHaveBeenCalledWith(
        expect.objectContaining({
          candidateId: response.candidates[0].id,
          status: "wanted",
          source: "Official UK Albums",
        }),
      );
    });
    expect(screen.getAllByText("Wanted").length).toBeGreaterThan(0);
  });

  it("keeps the selected album in place while completion data refreshes", async () => {
    getLibraryCompletion.mockResolvedValue({
      ...response,
      returnedCandidates: 2,
      candidates: [
        response.candidates[0],
        {
          ...response.candidates[0],
          id: "second artist\u001fsecond album",
          artist: "Second Artist",
          title: "Second Album",
          chartYear: 1991,
        },
      ],
    });
    render(<LibraryCompletionWorkspace onOpenWishList={vi.fn()} />);

    await screen.findByRole("heading", { name: "The Colour of Spring" });
    fireEvent.click(screen.getByRole("button", { name: /Second Album/i }));
    expect(screen.getByRole("heading", { name: "Second Album" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Scan local charts" }));

    await waitFor(() => expect(getLibraryCompletion).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("heading", { name: "Second Album" })).toBeInTheDocument();
  });

  it("explains verified results and offers a direct Add to Wanted action", async () => {
    getLibraryCompletion.mockResolvedValue({
      ...response,
      candidates: [{
        ...response.candidates[0],
        verificationStatus: "verified",
        verificationMessage: "MusicBrainz confirmed an official studio-album release group.",
        verificationCheckedAt: "2026-07-29T10:05:02Z",
      }],
    });
    getLibraryCompletionVerificationStatus.mockResolvedValue(completedVerificationStatus);
    render(<LibraryCompletionWorkspace onOpenWishList={vi.fn()} />);

    expect(await screen.findByText(/official studio album was confirmed/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review verified (1)" }));
    expect(screen.getByRole("combobox", { name: "Filter completion candidates" })).toHaveValue("verified");

    fireEvent.click(screen.getAllByRole("button", { name: "Add to Wanted" })[0]);
    await waitFor(() => {
      expect(setLibraryCompletionDecision).toHaveBeenCalledWith(
        expect.objectContaining({ status: "wanted" }),
      );
    });
    expect(screen.getByText("Added to Wanted")).toBeInTheDocument();
  });

  it("offers Discogs fallback after MusicBrainz cannot confirm an exact album", async () => {
    getLibraryCompletion.mockResolvedValue({
      ...response,
      candidates: [{
        ...response.candidates[0],
        verificationStatus: "noMatch",
        verificationProvider: "musicbrainz",
        verificationMessage: "MusicBrainz returned no exact artist and primary Album title match.",
        verificationCheckedAt: "2026-07-29T10:05:00Z",
        musicbrainzVerificationStatus: "noMatch",
        musicbrainzVerificationMessage:
          "MusicBrainz returned no exact artist and primary Album title match.",
      }],
    });
    render(<LibraryCompletionWorkspace onOpenWishList={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Try fallback" }));

    await waitFor(() => {
      expect(startLibraryCompletionVerification).toHaveBeenCalledWith({
        scope: "candidate",
        candidateIds: [response.candidates[0].id],
        source: null,
        decade: null,
        label: "Talk Talk — The Colour of Spring",
      });
    });
  });

  it("shows explicit provider outcomes after both providers were checked", async () => {
    getLibraryCompletion.mockResolvedValue({
      ...response,
      candidates: [{
        ...response.candidates[0],
        verificationStatus: "noMatch",
        verificationProvider: "discogs",
        verificationMessage: "Neither provider returned one exact studio-album match.",
        verificationCheckedAt: "2026-07-29T10:05:02Z",
        musicbrainzVerificationStatus: "noMatch",
        musicbrainzVerificationMessage: "MusicBrainz returned no exact artist and primary Album title match.",
        discogsVerificationStatus: "noMatch",
        discogsVerificationMessage: "Discogs returned no exact artist and master-title match.",
      }],
    });
    render(<LibraryCompletionWorkspace onOpenWishList={vi.fn()} />);

    await screen.findByRole("heading", { name: "The Colour of Spring" });
    expect(screen.getAllByText("Checked · no exact match")).toHaveLength(2);
    expect(screen.queryByText("Review needed")).not.toBeInTheDocument();
  });

  it("fetches and displays a cover for a verified studio album", async () => {
    getLibraryCompletion.mockResolvedValue({
      ...response,
      candidates: [{
        ...response.candidates[0],
        verificationStatus: "verified",
        verificationProvider: "musicbrainz",
        verificationMessage: "MusicBrainz confirmed an official studio album.",
        verificationCheckedAt: "2026-07-29T10:05:02Z",
        musicbrainzId: "01234567-89ab-cdef-0123-456789abcdef",
        musicbrainzVerificationStatus: "verified",
        musicbrainzVerificationMessage: "MusicBrainz confirmed an official studio album.",
      }],
    });
    render(<LibraryCompletionWorkspace onOpenWishList={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Find cover" }));

    await waitFor(() => {
      expect(enrichLibraryCompletionCover).toHaveBeenCalledWith(response.candidates[0].id);
    });
    expect(await screen.findByText("Cached · Cover Art Archive")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "The Colour of Spring cover artwork" }))
      .toHaveAttribute("src", "data:image/png;base64,cHJldmlldw==");
  });
});
