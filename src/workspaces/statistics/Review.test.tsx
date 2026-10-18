import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Review } from "./Review";
import { StatisticsStoreProvider } from "./useStatisticsStore";
import {
  getReview,
  saveReviewMarkdown,
  saveReviewPng,
  type ReviewReport,
} from "../../backend/review";
import { reviewCard, reviewMarkdown } from "./reviewExport";
import { reviewRange } from "./reviewPeriods";

vi.mock("../../backend/review", () => ({
  getReview: vi.fn(),
  saveReviewMarkdown: vi.fn(),
  saveReviewPng: vi.fn(),
}));
vi.mock("./reviewExport", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./reviewExport")>()),
  reviewCard: vi.fn(),
}));
vi.mock("../../components/ExportResultStatus", () => ({
  ExportResultStatus: () => <p>Review exported</p>,
}));
const listening = {
  plays: 0,
  matchedPlays: 0,
  tracks: 0,
  topTracks: [],
  topAlbums: [],
  topArtists: [],
  discovery: null,
  historySince: null,
};
const metrics = {
  albumsAdded: 3,
  newArtists: 1,
  albumRatingsGiven: 2,
  newlyRatedTracks: 8,
  completionChange: null,
  listening,
};
const fixture: ReviewReport = {
  startAt: 1,
  endAt: 2,
  previousStartAt: 0,
  activitySince: null,
  current: metrics,
  previous: metrics,
  topGenres: [],
  ratingChanges: [],
  tasteDrift: [],
};
const props = {
  onOpenAlbum: vi.fn(),
  onOpenArtist: vi.fn(),
  onOpenListening: vi.fn(),
};
beforeEach(() => {
  vi.mocked(getReview).mockResolvedValue(fixture);
});
afterEach(() => vi.resetAllMocks());

it("loads every period with exact boundaries and provides listening setup for empty history", async () => {
  render(<Review {...props} />, { wrapper: StatisticsStoreProvider });
  await screen.findByText("No recorded album additions.");
  fireEvent.click(screen.getByRole("button", { name: "Month" }));
  fireEvent.change(screen.getByLabelText("Review date"), {
    target: { value: "2026-02" },
  });
  await screen.findByRole("heading", { name: "February 2026 in Review" });
  await waitFor(() =>
    expect(getReview).toHaveBeenLastCalledWith(
      expect.objectContaining({
        startAt: reviewRange("month", "2026-02-01")!.startAt,
        endAt: reviewRange("month", "2026-02-01")!.endAt,
      }),
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Week" }));
  await screen.findByRole("heading", { name: "Week in Review" });
  fireEvent.click(
    screen.getByRole("button", { name: "Open listening sources" }),
  );
  expect(props.onOpenListening).toHaveBeenCalled();
  expect(screen.getByText("No baseline snapshot")).toBeInTheDocument();
});

it("discards a slow response after a period change and hides stale exports", async () => {
  let resolveOld!: (r: ReviewReport) => void;
  vi.mocked(getReview).mockReturnValueOnce(
    new Promise((resolve) => {
      resolveOld = resolve;
    }),
  );
  render(<Review {...props} />, { wrapper: StatisticsStoreProvider });
  fireEvent.click(screen.getByRole("button", { name: "Month" }));
  await screen.findByRole("button", { name: "Export Markdown" });
  await act(async () =>
    resolveOld({ ...fixture, current: { ...metrics, albumsAdded: 999 } }),
  );
  expect(screen.queryByText("999")).not.toBeInTheDocument();
  vi.mocked(getReview).mockReturnValueOnce(new Promise(() => {}));
  fireEvent.click(
    screen.getByRole("button", { name: "Previous review period" }),
  );
  expect(
    screen.queryByRole("button", { name: "Export Markdown" }),
  ).not.toBeInTheDocument();
});

it("reports errors and retries without leaving a loading screen", async () => {
  vi.mocked(getReview).mockRejectedValueOnce(new Error("History unavailable"));
  render(<Review {...props} />, { wrapper: StatisticsStoreProvider });
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "History unavailable",
  );
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("No recorded album additions.");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("navigates to the reviewed artist identity and exports the loaded report", async () => {
  const row = {
    key: "second",
    title: "Creed",
    artist: "Creed",
    artistId: "artist:second",
    artistDisambiguation: "Second group",
    album: null,
    albumId: null,
    trackId: null,
    rating: null,
    plays: 5,
    lastPlayedAt: null,
    source: null,
  };
  vi.mocked(getReview).mockResolvedValue({
    ...fixture,
    current: {
      ...metrics,
      listening: { ...listening, plays: 5, matchedPlays: 5, topArtists: [row] },
    },
  });
  vi.mocked(saveReviewMarkdown).mockResolvedValue("review.md");
  vi.mocked(reviewCard).mockResolvedValue(new Blob(["png"]));
  vi.mocked(saveReviewPng).mockResolvedValue("review.png");
  render(<Review {...props} />, { wrapper: StatisticsStoreProvider });
  fireEvent.click(await screen.findByRole("button", { name: "Creed" }));
  expect(props.onOpenArtist).toHaveBeenCalledWith("artist:second", "Creed");
  expect(screen.getByText("Second group")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Export Markdown" }));
  await waitFor(() =>
    expect(saveReviewMarkdown).toHaveBeenCalledWith(
      expect.stringContaining("Most-played artists"),
      expect.stringContaining("in Review"),
    ),
  );
  await screen.findByText("Review exported");
  fireEvent.click(screen.getByRole("button", { name: "Share PNG card" }));
  await waitFor(() => expect(saveReviewPng).toHaveBeenCalled());
});

it("exports complete genre shares, coverage and escaped catalog text", () => {
  const report = {
    ...fixture,
    topGenres: [{ genre: "Pop | Rock", albums: 1 }],
    tasteDrift: [
      {
        year: 2025,
        total: 2,
        genres: [
          { genre: "Pop", albums: 1 },
          { genre: "Rock", albums: 1 },
        ],
      },
    ],
  };
  const md = reviewMarkdown(report, reviewRange("year", "2026-01-01")!);
  expect(md).toContain("Pop \\| Rock");
  expect(md).toContain("| 2025 | Pop | 1 | 50.0% |");
  expect(md).toContain("no baseline means unavailable");
  expect(md).toContain("Missing imports");
});

it("retains the period and date after leaving the review", async () => {
  const view = render(<Review {...props} />, {
    wrapper: StatisticsStoreProvider,
  });
  await screen.findByRole("button", { name: "Export Markdown" });
  fireEvent.click(screen.getByRole("button", { name: "Month" }));
  fireEvent.change(screen.getByLabelText("Review date"), {
    target: { value: "2025-03" },
  });
  await screen.findByRole("heading", { name: "March 2025 in Review" });
  view.rerender(<p>Album details</p>);
  view.rerender(<Review {...props} />);
  expect(
    await screen.findByRole("heading", { name: "March 2025 in Review" }),
  ).toBeInTheDocument();
});
