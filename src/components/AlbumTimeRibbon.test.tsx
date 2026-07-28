import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type {
  AlbumDebutTimelineAlbum,
  AlbumDebutTimelineResponse,
  TrackDebutTimelineResponse,
  TrackDebutTimelineTrack,
} from "../types";
import {
  AlbumTimeRibbon,
  albumsForPeriod,
  monthsInRange,
  orderTimelineAlbums,
  representativeTimelineYears,
} from "./AlbumTimeRibbon";

type AlbumOverrides = {
  album?: string;
  albumArtistDisplay?: string;
  albumScore?: number | null;
  billboardRank?: number | null;
};

function album(
  id: string,
  year: number,
  month: number,
  week: number,
  overrides: AlbumOverrides = {},
): AlbumDebutTimelineAlbum {
  return {
    id,
    albumId: id,
    album: overrides.album ?? `Album ${id}`,
    albumArtistDisplay: overrides.albumArtistDisplay ?? "Pet Shop Boys",
    canonicalGenre: "Synthpop",
    year,
    albumScore:
      overrides.albumScore === undefined ? 8.4 : overrides.albumScore,
    billboardRank:
      overrides.billboardRank === undefined ? 17 : overrides.billboardRank,
    billboardYear: year,
    billboardDebutYear: year,
    billboardDebutMonth: month,
    billboardDebutWeek: week,
    billboardDebutWeekKey: `${year}-W${String(week).padStart(2, "0")}`,
    coverPath: null,
    coverMimeType: null,
  };
}

function orderingResponse(): AlbumDebutTimelineResponse {
  const gamma = album("gamma", 1989, 6, 23, {
    album: "Gamma",
    albumArtistDisplay: "Aster",
    albumScore: 8,
    billboardRank: 90,
  });
  const beta = album("beta", 1989, 6, 24, {
    album: "Beta",
    albumArtistDisplay: "Cinder",
    albumScore: 6,
    billboardRank: 2,
  });
  const alpha = album("alpha", 1989, 6, 25, {
    album: "Alpha",
    albumArtistDisplay: "Beacon",
    albumScore: 10,
    billboardRank: 45,
  });
  return {
    years: [{ year: 1989, albumCount: 3, representativeAlbum: alpha }],
    selectedYear: 1989,
    albums: [alpha, gamma, beta],
    datedAlbumCount: 3,
    undatedAlbumCount: 0,
  };
}

function response(): AlbumDebutTimelineResponse {
  const januaryAlbum = album("january", 1989, 1, 2);
  const summerAlbum = album("summer", 1989, 7, 28);
  const fallAlbum = album("fall", 1989, 10, 42);
  const christmasAlbum = album("christmas", 1989, 12, 51);
  return {
    years: [
      { year: 1987, albumCount: 1, representativeAlbum: album("early", 1987, 5, 20) },
      { year: 1989, albumCount: 4, representativeAlbum: summerAlbum },
      { year: 1990, albumCount: 1, representativeAlbum: album("late", 1990, 2, 7) },
    ],
    selectedYear: 1989,
    albums: [januaryAlbum, summerAlbum, fallAlbum, christmasAlbum],
    datedAlbumCount: 6,
    undatedAlbumCount: 1,
  };
}

function trackResponse(): TrackDebutTimelineResponse {
  const track: TrackDebutTimelineTrack = {
    id: "track:42",
    trackId: 42,
    albumId: "album-42",
    title: "Summer Song",
    displayArtist: "The Satellites",
    album: "Night Signals",
    albumArtistDisplay: "The Satellites",
    canonicalGenre: "Synthpop",
    year: 1989,
    normalizedRating: 180,
    love: "L",
    billboardSingleRank: 4,
    billboardSingleYear: 1989,
    billboardSingleDebutDate: "1989-06-17",
    billboardSingleDebutYear: 1989,
    billboardSingleDebutMonth: 6,
    billboardSingleDebutWeek: 24,
    billboardSingleDebutWeekKey: "1989-W24",
    coverPath: null,
    coverMimeType: null,
  };
  return {
    years: [{ year: 1989, trackCount: 1, representativeTrack: track }],
    selectedYear: 1989,
    tracks: [track],
    datedTrackCount: 1,
    undatedTrackCount: 2,
  };
}

function trackWeekResponse(): TrackDebutTimelineResponse {
  const firstTrack = trackResponse().tracks[0];
  const secondTrack: TrackDebutTimelineTrack = {
    ...firstTrack,
    id: "track:43",
    trackId: 43,
    albumId: "album-43",
    title: "Late Summer Song",
    album: "Signals After Dark",
    billboardSingleRank: 12,
    billboardSingleDebutDate: "1989-06-30",
    billboardSingleDebutWeek: 26,
    billboardSingleDebutWeekKey: "1989-W26",
  };
  return {
    years: [{ year: 1989, trackCount: 2, representativeTrack: firstTrack }],
    selectedYear: 1989,
    tracks: [firstTrack, secondTrack],
    datedTrackCount: 2,
    undatedTrackCount: 0,
  };
}

function visibleCoverTitles() {
  return within(
    screen.getByRole("list", { name: "Albums in selected period" }),
  )
    .getAllByRole("listitem")
    .map((item) => item.getAttribute("aria-label")?.split(" by ")[0]);
}

describe("AlbumTimeRibbon", () => {
  it("renders the selected-year light stage and a node for every year label", () => {
    const { container } = render(
      <AlbumTimeRibbon
        data={response()}
        error={null}
        isLoading={false}
        onCreatePlaylist={vi.fn()}
        onOpenAlbum={vi.fn()}
        onOpenSearch={vi.fn()}
        onRetry={vi.fn()}
        onSelectYear={vi.fn()}
      />,
    );

    const labels = container.querySelectorAll(".album-time-ribbon-labels span");
    const nodes = container.querySelectorAll(
      ".album-time-ribbon-decade-nodes span",
    );

    expect(container.querySelector(".album-time-ribbon-decade-rail")).toBeInTheDocument();
    expect(container.querySelector(".album-time-ribbon-focus")).toBeInTheDocument();
    expect(container.querySelector(".album-time-ribbon-active-line")).toBeInTheDocument();
    expect(container.querySelector(".album-time-ribbon-marker.active")).not.toBeInTheDocument();
    expect(nodes).toHaveLength(labels.length);
    expect(
      container.querySelectorAll(".album-time-ribbon-decade-nodes span.active"),
    ).toHaveLength(1);
    const albumList = screen.getByRole("list", {
      name: "Albums in selected period",
    });
    expect(within(albumList).getByText("Album summer")).toBeInTheDocument();
    expect(within(albumList).getByText("Pet Shop Boys")).toBeInTheDocument();
  });

  it("offers every preset and hands the selected period to playlists", async () => {
    const user = userEvent.setup();
    const onCreatePlaylist = vi.fn();
    const onOpenSearch = vi.fn();
    render(
      <AlbumTimeRibbon
        data={response()}
        error={null}
        isLoading={false}
        onCreatePlaylist={onCreatePlaylist}
        onOpenAlbum={vi.fn()}
        onOpenSearch={onOpenSearch}
        onRetry={vi.fn()}
        onSelectYear={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Albums through the years" })).toBeInTheDocument();
    expect(screen.getByText(/June – August · 1 of 4 album arrivals/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Search your library/ }));
    expect(onOpenSearch).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Create playlist" }));
    expect(onCreatePlaylist).toHaveBeenCalledWith(
      expect.objectContaining({ albumIds: ["summer"], title: "Relive Summer 1989" }),
    );

    await user.click(screen.getByRole("button", { name: "Period: Summer 1989" }));
    expect(screen.getByRole("dialog", { name: "Choose timeline period" })).toBeInTheDocument();
    for (const preset of [
      "Spring",
      "Summer",
      "Fall",
      "Winter",
      "Christmas",
      "New Year",
      "Full year",
    ]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${preset}`) })).toBeInTheDocument();
    }

    await user.click(screen.getByRole("button", { name: /^Fall/ }));
    expect(screen.getByText(/September – November · 1 of 4 album arrivals/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create playlist" }));
    expect(onCreatePlaylist).toHaveBeenLastCalledWith(
      expect.objectContaining({ albumIds: ["fall"], title: "Relive Fall 1989" }),
    );
  });

  it("supports a single custom month and wrapping month ranges", async () => {
    const user = userEvent.setup();
    const onCreatePlaylist = vi.fn();
    render(
      <AlbumTimeRibbon
        data={response()}
        error={null}
        isLoading={false}
        onCreatePlaylist={onCreatePlaylist}
        onOpenAlbum={vi.fn()}
        onOpenSearch={vi.fn()}
        onRetry={vi.fn()}
        onSelectYear={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Period: Summer 1989" }));
    await user.selectOptions(screen.getByLabelText("Custom period from month"), "1");
    await user.selectOptions(screen.getByLabelText("Custom period to month"), "1");
    await user.click(screen.getByRole("button", { name: "Show January" }));

    expect(screen.getByRole("button", { name: "Period: January 1989" })).toBeInTheDocument();
    expect(screen.getByText(/January · 1 of 4 album arrivals/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create playlist" }));
    expect(onCreatePlaylist).toHaveBeenCalledWith(
      expect.objectContaining({ albumIds: ["january"], title: "Relive January 1989" }),
    );
    expect(monthsInRange(11, 2)).toEqual([11, 12, 1, 2]);
  });

  it("starts with every album week visible and filters the cover strip by week", async () => {
    const user = userEvent.setup();
    render(
      <AlbumTimeRibbon
        data={orderingResponse()}
        error={null}
        isLoading={false}
        onCreatePlaylist={vi.fn()}
        onOpenAlbum={vi.fn()}
        onOpenSearch={vi.fn()}
        onRetry={vi.fn()}
        onSelectYear={vi.fn()}
      />,
    );

    const allWeeks = screen.getByRole("button", {
      name: "All weeks in Summer 1989",
    });
    expect(allWeeks).toHaveAttribute("aria-pressed", "true");
    expect(visibleCoverTitles()).toEqual(["Gamma", "Beta", "Alpha"]);

    await user.click(screen.getByRole("button", { name: "June week 24" }));
    expect(allWeeks).toHaveAttribute("aria-pressed", "false");
    expect(visibleCoverTitles()).toEqual(["Beta"]);
    expect(
      screen.getByText(/June · Week 24 · 1 of 3 album arrivals/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Period: Summer 1989" }));
    await user.click(screen.getByRole("button", { name: /^Summer/ }));
    expect(allWeeks).toHaveAttribute("aria-pressed", "true");
    expect(visibleCoverTitles()).toEqual(["Gamma", "Beta", "Alpha"]);
  });

  it("navigates to another available chart year", async () => {
    const user = userEvent.setup();
    const onSelectYear = vi.fn();
    render(
      <AlbumTimeRibbon
        data={response()}
        error={null}
        isLoading={false}
        onCreatePlaylist={vi.fn()}
        onOpenAlbum={vi.fn()}
        onOpenSearch={vi.fn()}
        onRetry={vi.fn()}
        onSelectYear={onSelectYear}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Next chart year" }));
    expect(onSelectYear).toHaveBeenCalledWith(1990);
  });

  it("switches to a track timeline and keeps exact tracks in playlist actions", async () => {
    const user = userEvent.setup();
    const onCreatePlaylist = vi.fn();
    const onModeChange = vi.fn();
    const onOpenTrack = vi.fn();
    const { container } = render(
      <AlbumTimeRibbon
        data={trackResponse()}
        mode="tracks"
        error={null}
        isLoading={false}
        onCreatePlaylist={onCreatePlaylist}
        onModeChange={onModeChange}
        onOpenAlbum={vi.fn()}
        onOpenTrack={onOpenTrack}
        onOpenSearch={vi.fn()}
        onRetry={vi.fn()}
        onSelectYear={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Tracks through the years" }),
    ).toBeInTheDocument();
    const trackList = screen.getByRole("list", {
      name: "Tracks in selected period",
    });
    expect(within(trackList).getByText("Summer Song")).toBeInTheDocument();
    expect(within(trackList).getByText("The Satellites")).toBeInTheDocument();
    expect(within(trackList).getByText("Night Signals")).toBeInTheDocument();
    await user.click(within(trackList).getByRole("listitem"));
    expect(container.querySelector(".album-time-ribbon-drawer small")).toHaveTextContent(
      /1989 · Week 24/,
    );

    await user.click(screen.getByRole("button", { name: "Open track" }));
    expect(onOpenTrack).toHaveBeenCalledWith(42);

    await user.click(screen.getByRole("button", { name: "Create playlist" }));
    expect(onCreatePlaylist).toHaveBeenCalledWith(
      expect.objectContaining({
        albumIds: [],
        trackIds: [42],
        mode: "tracks",
      }),
    );

    await user.click(screen.getByRole("button", { name: "Albums" }));
    expect(onModeChange).toHaveBeenCalledWith("albums");
  });

  it("filters tracks and playlist handoff to the selected chart week", async () => {
    const user = userEvent.setup();
    const onCreatePlaylist = vi.fn();
    render(
      <AlbumTimeRibbon
        data={trackWeekResponse()}
        mode="tracks"
        error={null}
        isLoading={false}
        onCreatePlaylist={onCreatePlaylist}
        onOpenAlbum={vi.fn()}
        onOpenTrack={vi.fn()}
        onOpenSearch={vi.fn()}
        onRetry={vi.fn()}
        onSelectYear={vi.fn()}
      />,
    );

    const trackList = screen.getByRole("list", {
      name: "Tracks in selected period",
    });
    expect(within(trackList).getAllByRole("listitem")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "June week 24" }));
    expect(within(trackList).getAllByRole("listitem")).toHaveLength(1);
    expect(within(trackList).getByText("Summer Song")).toBeInTheDocument();
    expect(
      within(trackList).queryByText("Late Summer Song"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create playlist" }));
    expect(onCreatePlaylist).toHaveBeenCalledWith(
      expect.objectContaining({
        trackIds: [42],
        title: "Relive Summer 1989 · June week 24",
        prompt: expect.stringContaining(
          "narrowed to Billboard chart-entry week 24",
        ),
      }),
    );

    await user.click(
      screen.getByRole("button", { name: "All weeks in Summer 1989" }),
    );
    expect(within(trackList).getAllByRole("listitem")).toHaveLength(2);
  });

  it("orders the cover strip by score and Billboard rank in either direction", async () => {
    const user = userEvent.setup();
    const onCreatePlaylist = vi.fn();
    render(
      <AlbumTimeRibbon
        data={orderingResponse()}
        error={null}
        isLoading={false}
        onCreatePlaylist={onCreatePlaylist}
        onOpenAlbum={vi.fn()}
        onOpenSearch={vi.fn()}
        onRetry={vi.fn()}
        onSelectYear={vi.fn()}
      />,
    );

    expect(visibleCoverTitles()).toEqual(["Gamma", "Beta", "Alpha"]);
    await user.selectOptions(screen.getByLabelText("Album order"), "score");
    expect(visibleCoverTitles()).toEqual(["Alpha", "Gamma", "Beta"]);
    expect(screen.getByText(/High score first; albums without a score stay last/)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Reverse album order; currently High score first",
      }),
    );
    expect(visibleCoverTitles()).toEqual(["Beta", "Gamma", "Alpha"]);

    await user.selectOptions(screen.getByLabelText("Album order"), "billboard");
    expect(visibleCoverTitles()).toEqual(["Beta", "Alpha", "Gamma"]);
    await user.click(screen.getByRole("button", { name: "Create playlist" }));
    expect(onCreatePlaylist).toHaveBeenLastCalledWith(
      expect.objectContaining({ albumIds: ["beta", "alpha", "gamma"] }),
    );
  });

  it("lets the selected album move through a resettable custom order", async () => {
    const user = userEvent.setup();
    const onCreatePlaylist = vi.fn();
    render(
      <AlbumTimeRibbon
        data={orderingResponse()}
        error={null}
        isLoading={false}
        onCreatePlaylist={onCreatePlaylist}
        onOpenAlbum={vi.fn()}
        onOpenSearch={vi.fn()}
        onRetry={vi.fn()}
        onSelectYear={vi.fn()}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Album order"), "billboard");
    await user.selectOptions(screen.getByLabelText("Album order"), "custom");
    expect(visibleCoverTitles()).toEqual(["Beta", "Alpha", "Gamma"]);

    await user.click(
      screen.getByRole("listitem", {
        name: /Alpha by Beacon.*custom position 2/,
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Move selected album earlier" }),
    );
    expect(visibleCoverTitles()).toEqual(["Alpha", "Beta", "Gamma"]);

    await user.click(screen.getByRole("button", { name: "Create playlist" }));
    expect(onCreatePlaylist).toHaveBeenLastCalledWith(
      expect.objectContaining({
        albumIds: ["alpha", "beta", "gamma"],
        prompt: expect.stringContaining("follow the custom album order exactly"),
      }),
    );

    await user.click(
      screen.getByRole("button", { name: "Reset custom album order" }),
    );
    expect(visibleCoverTitles()).toEqual(["Gamma", "Beta", "Alpha"]);
    expect(
      screen.getByRole("button", { name: "Reset custom album order" }),
    ).toBeDisabled();
  });

  it("keeps period and representative sampling deterministic", () => {
    const years = Array.from({ length: 30 }, (_, index) => ({
      year: 1970 + index,
      albumCount: index + 1,
      representativeAlbum: album(`album-${index}`, 1970 + index, 7, 28),
    }));

    expect(albumsForPeriod(response().albums, [6, 7, 8]).map((item) => item.id)).toEqual([
      "summer",
    ]);
    const sortableAlbums = orderingResponse().albums;
    expect(
      orderTimelineAlbums(sortableAlbums, "score", "descending").map(
        (item) => item.id,
      ),
    ).toEqual(["alpha", "gamma", "beta"]);
    expect(
      orderTimelineAlbums(sortableAlbums, "billboard", "ascending").map(
        (item) => item.id,
      ),
    ).toEqual(["beta", "alpha", "gamma"]);
    const missingMetrics = album("missing", 1989, 6, 26, {
      albumScore: null,
      billboardRank: null,
    });
    const ascendingScoresWithMissing = orderTimelineAlbums(
      [...sortableAlbums, missingMetrics],
      "score",
      "ascending",
    );
    expect(
      ascendingScoresWithMissing[ascendingScoresWithMissing.length - 1]?.id,
    ).toBe("missing");
    const descendingRanksWithMissing = orderTimelineAlbums(
      [...sortableAlbums, missingMetrics],
      "billboard",
      "descending",
    );
    expect(
      descendingRanksWithMissing[descendingRanksWithMissing.length - 1]?.id,
    ).toBe("missing");
    const representatives = representativeTimelineYears(years, 1989, 8);
    expect(representatives).toHaveLength(8);
    expect(representatives.some((year) => year.year === 1989)).toBe(true);
  });
});
