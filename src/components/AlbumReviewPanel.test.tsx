import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AlbumReview } from "../types";
import { AlbumReviewPanel } from "./AlbumReviewPanel";

const longReview = Array.from(
  { length: 16 },
  () => "A detailed paragraph about the album and why its songs still matter.",
).join(" ");

function review(overrides: Partial<AlbumReview> = {}): AlbumReview {
  return {
    albumId: "album-1",
    albumArtist: "Beastie Boys",
    albumTitle: "Licensed to Ill",
    releaseGroupMbid: "57f5e7c8-2a6e-34a0-b4cd-0e77695bc36f",
    reviewId: "58496ed0-35c4-46b0-b87a-986ce03ce19d",
    review: longReview,
    reviewerName: "smcamp1234",
    rating: 5,
    language: "en",
    reviewSource: null,
    sourceUrl:
      "https://critiquebrainz.org/review/58496ed0-35c4-46b0-b87a-986ce03ce19d",
    licenseId: "CC BY-SA 3.0",
    licenseName: "Creative Commons Attribution-ShareAlike 3.0 Unported",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
    fetchedAt: "2026-08-11T14:00:00Z",
    cached: false,
    stale: false,
    message: "Album review loaded from CritiqueBrainz.",
    ...overrides,
  };
}

describe("AlbumReviewPanel", () => {
  it("renders attribution, rating, license, and expandable review text", () => {
    const openSource = vi.fn();
    render(
      <AlbumReviewPanel
        review={review()}
        isLoading={false}
        error={null}
        onRefresh={vi.fn()}
        onOpenSource={openSource}
      />,
    );

    expect(screen.getByRole("heading", { name: "Album Review" })).toBeVisible();
    expect(screen.getByText("Review by smcamp1234")).toBeVisible();
    expect(screen.getByLabelText("5 out of 5 stars")).toBeVisible();

    const expand = screen.getByRole("button", { name: "Read more" });
    fireEvent.click(expand);
    expect(expand).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Show less" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /CC BY-SA 3.0/ }));
    fireEvent.click(
      screen.getByRole("button", { name: /Read on CritiqueBrainz/ }),
    );
    expect(openSource).toHaveBeenNthCalledWith(
      1,
      "https://creativecommons.org/licenses/by-sa/3.0/",
    );
    expect(openSource).toHaveBeenNthCalledWith(
      2,
      "https://critiquebrainz.org/review/58496ed0-35c4-46b0-b87a-986ce03ce19d",
    );
  });

  it("shows the provider's unavailable message and refreshes on demand", () => {
    const refresh = vi.fn();
    render(
      <AlbumReviewPanel
        review={review({
          review: null,
          reviewId: null,
          reviewerName: null,
          rating: null,
          sourceUrl: null,
          message: "No written CritiqueBrainz review is available for this album yet.",
        })}
        isLoading={false}
        error={null}
        onRefresh={refresh}
        onOpenSource={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        "No written CritiqueBrainz review is available for this album yet.",
      ),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(refresh).toHaveBeenCalledOnce();
  });
});
