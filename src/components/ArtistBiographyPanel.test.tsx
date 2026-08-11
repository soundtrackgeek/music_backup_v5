import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ArtistBiography } from "../types";
import { ArtistBiographyPanel } from "./ArtistBiographyPanel";

const biography: ArtistBiography = {
  artistId: "beastie boys",
  artistName: "Beastie Boys",
  musicbrainzMbid: "9beb62b2-88db-4cea-801e-162cd344ee53",
  wikidataId: "Q214039",
  wikipediaLanguage: "en",
  wikipediaTitle: "Beastie Boys",
  biography: "A".repeat(600),
  sourceUrl: "https://en.wikipedia.org/wiki/Beastie_Boys",
  fetchedAt: "2026-08-11T12:00:00Z",
  cached: true,
  stale: false,
  message: "Biography loaded from Wikipedia.",
};

describe("ArtistBiographyPanel", () => {
  it("shows cached attribution and expands long biographies", () => {
    render(
      <ArtistBiographyPanel
        biography={biography}
        isLoading={false}
        error={null}
        onRefresh={() => undefined}
        onOpenSource={() => undefined}
      />,
    );

    expect(screen.getByRole("heading", { name: "Biography" })).toBeInTheDocument();
    expect(screen.getByText("Cached from Wikipedia")).toBeInTheDocument();
    const expand = screen.getByRole("button", { name: "Read more" });
    fireEvent.click(expand);
    expect(screen.getByRole("button", { name: "Show less" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("exposes refresh, source, and license actions", () => {
    const onRefresh = vi.fn();
    const onOpenSource = vi.fn();
    render(
      <ArtistBiographyPanel
        biography={biography}
        isLoading={false}
        error={null}
        onRefresh={onRefresh}
        onOpenSource={onOpenSource}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    fireEvent.click(screen.getByRole("button", { name: /Read on Wikipedia/ }));
    fireEvent.click(screen.getByRole("button", { name: /CC BY-SA 4.0/ }));

    expect(onRefresh).toHaveBeenCalledOnce();
    expect(onOpenSource).toHaveBeenCalledWith(biography.sourceUrl);
    expect(onOpenSource).toHaveBeenCalledWith(
      "https://creativecommons.org/licenses/by-sa/4.0/",
    );
  });
});
