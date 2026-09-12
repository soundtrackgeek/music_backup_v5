import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { YearLedger } from "./YearLedger";
import { completeYearProgressRows } from "../app/yearProgress";
import { yearRatingCohort } from "../app/insightCohorts";
import type { YearProgressStats } from "../types";

const row: YearProgressStats = { year: 1984, albumCount: 50, ratedAlbumCount: 30, partialAlbumCount: 12, unratedAlbumCount: 8, trackCount: 500, totalSeconds: 10000, lovedTracks: 0, averageAlbumScore: null };

describe("Year Ledger", () => {
  it("shows each year's rating shares on a fixed 0–100% scale regardless of other years' totals", () => {
    const rows = completeYearProgressRows([
      { ...row, year: 1986, albumCount: 45, ratedAlbumCount: 28, partialAlbumCount: 2, unratedAlbumCount: 15 },
      { ...row, year: 1987, albumCount: 305, ratedAlbumCount: 305, partialAlbumCount: 0, unratedAlbumCount: 0 },
    ], 1986, 1988);
    render(<YearLedger rows={rows} genres={[]} excludedGenres={[]} onOpen={vi.fn()} />);
    const progressHeader = screen.getByRole("columnheader", { name: /^Progress/ });
    expect(within(progressHeader).getAllByText(/^\d+%$/).map(tick => tick.textContent))
      .toEqual(["0%", "20%", "40%", "60%", "80%", "100%"]);
    const segments = within(screen.getByLabelText("1986: 45 albums")).getAllByRole("button");
    const widths = segments.map(segment => Number.parseFloat(segment.style.width));
    expect(widths[0]).toBeCloseTo(62.2222, 3);
    expect(widths[1]).toBeCloseTo(4.4444, 3);
    expect(widths[2]).toBeCloseTo(33.3333, 3);
    expect(widths.reduce((sum, width) => sum + width, 0)).toBeCloseTo(100);
    expect(segments[0]).toHaveAttribute("title", "1986: 28 fully rated albums (62%)");
    const yearRow = screen.getByLabelText("Select 1986").closest("tr")!;
    expect(within(yearRow).getByText("62%")).toBeInTheDocument();
    expect(screen.getByLabelText("1987: 305 fully rated albums")).toHaveStyle({ width: "100%" });
    for (const segment of within(screen.getByLabelText("1988: 0 albums")).getAllByRole("button")) {
      expect(segment).toHaveStyle({ width: "0%" });
      expect(segment).toBeDisabled();
    }
  });

  it("renders every year of 1955–2021, including empty years, without changing totals", () => {
    const rows = completeYearProgressRows([row], 1955, 2021);
    expect(rows).toHaveLength(67);
    expect(rows.map(row => row.year)).toEqual(Array.from({ length: 67 }, (_, i) => 1955 + i));
    render(<YearLedger rows={rows} genres={[]} excludedGenres={[]} onOpen={vi.fn()} />);
    expect(screen.getAllByRole("button", { name: /^Select \d/ })).toHaveLength(67);
    fireEvent.click(screen.getByRole("button", { name: "Select 1984" }));
    const inspector = screen.getByRole("complementary", { name: "Selected year summary" });
    expect(within(inspector).getByText("20")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next year" }));
    expect(within(inspector).getByRole("heading", { name: "1985" })).toBeInTheDocument();
    expect(within(inspector).getByRole("button", { name: "Browse remaining albums" })).toBeDisabled();
    expect(within(screen.getByRole("region", { name: "Filtered rating totals" })).getByText("50")).toBeInTheDocument();
  });

  it("browses exact remaining albums with the year and both genre filters", () => {
    const onOpen = vi.fn();
    render(<YearLedger rows={[row]} genres={["Synthpop", "New Wave"]} excludedGenres={["Comedy"]} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: "Browse remaining albums" }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ count: 20, request: expect.objectContaining({ view: "albums", filters: expect.objectContaining({ yearFrom: 1984, yearTo: 1984, releaseYearFrom: null, releaseYearTo: null, genres: ["Synthpop", "New Wave"], excludedGenres: ["Comedy"], notFullyRated: true, ratingCompletenessMax: null }) }) }));
  });

  it("uses exact not-fully-rated semantics for near-complete partial albums", () => {
    const request = yearRatingCohort(row, [], [], "partial").request;
    expect(request.filters.notFullyRated).toBe(true);
    expect(request.filters.ratingCompletenessMax).toBeNull();
    expect(request.filters.ratingCompletenessMin).toBeGreaterThan(0);
    expect(yearRatingCohort(row, [], [], "fully-rated").request.filters.ratingCompletenessMin).toBe(100);
    expect(yearRatingCohort(row, [], [], "unrated").request.filters.ratingCompletenessMax).toBe(0);
  });

  it("keeps a valid selected year after refresh and falls back when its range is removed", () => {
    const props = { genres: [], excludedGenres: [], onOpen: vi.fn() };
    const { rerender } = render(<YearLedger {...props} rows={completeYearProgressRows([row], 1980, 1989)} />);
    fireEvent.click(screen.getByRole("button", { name: "Select 1984" }));
    rerender(<YearLedger {...props} rows={completeYearProgressRows([{ ...row, ratedAlbumCount: 31, partialAlbumCount: 11 }], 1980, 1989)} />);
    expect(screen.getByRole("button", { name: "Select 1984" })).toHaveAttribute("aria-pressed", "true");
    rerender(<YearLedger {...props} rows={completeYearProgressRows([], 1990, 1999)} />);
    expect(screen.getByRole("button", { name: "Select 1990" })).toHaveAttribute("aria-pressed", "true");
  });
});
