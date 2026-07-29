import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LibraryCompletionWorkspace } from "./LibraryCompletionWorkspace";

const getLibraryCompletion = vi.fn();
const getLibraryCompletionVerificationStatus = vi.fn();
const startLibraryCompletionVerification = vi.fn();
const setLibraryCompletionVerificationState = vi.fn();
const retryLibraryCompletionVerificationFailures = vi.fn();
const setLibraryCompletionDecision = vi.fn();
const searchWishListMusicBrainz = vi.fn();
const addWishListMusicBrainzCandidate = vi.fn();
const searchDeemixAlbums = vi.fn();

vi.mock("../backend", () => ({
  getLibraryCompletion: (...args: unknown[]) => getLibraryCompletion(...args),
  getLibraryCompletionVerificationStatus: (...args: unknown[]) =>
    getLibraryCompletionVerificationStatus(...args),
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
      verificationStatus: "unverified",
      verificationMessage: null,
      verificationCheckedAt: null,
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
      message: null,
      musicbrainzId: null,
      musicbrainzUrl: null,
      updatedAt: "2026-07-29T10:05:00Z",
    },
  ],
} as const;

describe("LibraryCompletionWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLibraryCompletion.mockResolvedValue(response);
    getLibraryCompletionVerificationStatus.mockResolvedValue(emptyVerificationStatus);
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
    expect(screen.getByText("1 open loaded")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "The Colour of Spring" })).toBeInTheDocument();
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
    expect(screen.getByText(/Checking Talk Talk — The Colour of Spring/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("keeps a manual review path when a queued check finds no studio album", async () => {
    getLibraryCompletion.mockResolvedValueOnce({
      ...response,
      candidates: [{
        ...response.candidates[0],
        verificationStatus: "noMatch",
        verificationMessage: "MusicBrainz returned no exact artist and primary Album title match.",
        verificationCheckedAt: "2026-07-29T10:05:00Z",
      }],
    });
    render(<LibraryCompletionWorkspace onOpenWishList={vi.fn()} />);

    await screen.findByRole("heading", { name: "The Colour of Spring" });
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
    expect(screen.getByText(/Checking Talk Talk — The Colour of Spring/i)).toBeInTheDocument();
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
});
