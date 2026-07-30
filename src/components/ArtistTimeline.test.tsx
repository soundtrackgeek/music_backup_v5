import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ArtistTimelineResponse } from "../types";
import { ArtistTimeline } from "./ArtistTimeline";

const getArtistTimeline = vi.fn();
const listArtists = vi.fn();

vi.mock("../backend", () => ({
  getArtistTimeline: (...args: unknown[]) => getArtistTimeline(...args),
  listArtists: (...args: unknown[]) => listArtists(...args),
  getArtistImageDataUrl: vi.fn().mockResolvedValue(null),
  getAlbumCoverDataUrl: vi.fn().mockResolvedValue(null),
}));

const response: ArtistTimelineResponse = {
  artists: [
    {
      id: "kate bush",
      name: "Kate Bush",
      albumCount: 1,
      firstYear: 1985,
      lastYear: 1985,
      averageAlbumScore: 200,
      lovedTracks: 4,
      topGenre: "Art Pop",
      portraitAvailable: false,
      representativeAlbumId: null,
      representativeAlbum: null,
      representativeCoverPath: null,
    },
  ],
  albums: [
    {
      albumId: "album-1",
      album: "Hounds of Love",
      artistId: "kate bush",
      artist: "Kate Bush",
      year: 1985,
      albumScore: 200,
      lovedTracks: 4,
      billboardRank: 30,
      officialUkRank: 1,
      vgListaRank: 3,
      chartPeak: 0.84,
      coverPath: null,
    },
  ],
  matchingAlbumCount: 1,
  matchingArtistCount: 1,
  datedAlbumCount: 1,
  availableYearFrom: 1985,
  availableYearTo: 1985,
};

describe("ArtistTimeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getArtistTimeline.mockResolvedValue(response);
    listArtists.mockResolvedValue({ rows: [], total: 0, limit: 500, offset: 0 });
  });

  it("renders career peaks and switches to personal scores", async () => {
    const user = userEvent.setup();
    render(
      <ArtistTimeline
        genreOptions={["Art Pop"]}
        onOpenAlbum={vi.fn()}
        onOpenArtist={vi.fn()}
      />,
    );

    expect((await screen.findAllByText("Kate Bush")).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "My Scores" }));

    await waitFor(() => {
      expect(getArtistTimeline).toHaveBeenLastCalledWith(
        expect.objectContaining({ metric: "albumScore" }),
      );
    });
  });

  it("opens the selected artist from the detail card", async () => {
    const user = userEvent.setup();
    const onOpenArtist = vi.fn();
    render(
      <ArtistTimeline
        genreOptions={["Art Pop"]}
        onOpenAlbum={vi.fn()}
        onOpenArtist={onOpenArtist}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Open artist" }));
    expect(onOpenArtist).toHaveBeenCalledWith("kate bush", "Kate Bush");
  });

  it("keeps artist details outside the plot and gives every peak a cover marker", async () => {
    render(
      <ArtistTimeline
        genreOptions={["Art Pop"]}
        onOpenAlbum={vi.fn()}
        onOpenArtist={vi.fn()}
      />,
    );

    const marker = await screen.findByRole("button", {
      name: "Open Hounds of Love (1985)",
    });
    expect(marker).toHaveClass("artist-career-peak-marker");
    expect(document.querySelector(".artist-career-peaks-card")?.closest(
      ".artist-career-peaks-chart",
    )).toBeNull();
    expect(document.querySelector(".artist-career-peaks-chart title")).toBeNull();
  });
});
