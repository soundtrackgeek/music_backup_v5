import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LibraryCompletionWorkspace } from "./LibraryCompletionWorkspace";

const getLibraryCompletion = vi.fn();
const setLibraryCompletionDecision = vi.fn();
const searchWishListMusicBrainz = vi.fn();
const addWishListMusicBrainzCandidate = vi.fn();
const searchDeemixAlbums = vi.fn();

vi.mock("../backend", () => ({
  getLibraryCompletion: (...args: unknown[]) => getLibraryCompletion(...args),
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
      wanted: 17,
      needsReview: 63,
      excluded: 3,
      total: 418,
    },
  ],
} as const;

describe("LibraryCompletionWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLibraryCompletion.mockResolvedValue(response);
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

    expect(screen.getByText("Campaign")).toBeInTheDocument();
    expect(screen.getByText("Official UK Albums · 1980s")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "The Colour of Spring" })).toBeInTheDocument();
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
