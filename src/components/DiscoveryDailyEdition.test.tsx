import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
  DiscoveryDailyEdition as DiscoveryDailyEditionData,
  DiscoveryShelfExplorerRequest,
  DiscoveryShelfExplorerResponse,
} from "../types";
import { DiscoveryDailyEdition } from "./DiscoveryDailyEdition";

const edition: DiscoveryDailyEditionData = {
  date: "2026-08-11",
  anniversaryYears: 50,
  anniversaries: [
    {
      albumId: "album-anniversary",
      album: "Hejira",
      artist: "Joni Mitchell",
      releaseYear: 1976,
      yearsAgo: 50,
      coverPath: null,
      evidence: "Billboard #13 · Official UK #11 · owned album",
      chartEvidence: ["Billboard #13", "Official UK #11"],
      selectionReason:
        "Selected because its best imported album-chart position is #11. Local Album Score and loved tracks only break chart ties.",
    },
    {
      albumId: "album-anniversary-2",
      album: "Destroyer",
      artist: "KISS",
      releaseYear: 1976,
      yearsAgo: 50,
      coverPath: null,
      evidence: "Billboard #11 · VG-lista #7 · owned album",
      chartEvidence: ["Billboard #11", "VG-lista #7"],
      selectionReason:
        "Selected because its best imported album-chart position is #7. Local Album Score and loved tracks only break chart ties.",
    },
  ],
  lifeEvents: [
    {
      artistId: "artist-birthday",
      artist: "Test Artist",
      eventType: "birthday",
      eventDate: "1969-08-11",
      years: 57,
      dayOffset: 0,
      albumCount: 2,
      lovedTracks: 1,
      portraitAvailable: false,
      representativeAlbumId: null,
      representativeAlbum: null,
      representativeCoverPath: null,
      evidence: "Born today · 2 albums in your library",
    },
    {
      artistId: "artist-memorial",
      artist: "Memorial Artist",
      eventType: "memorial",
      eventDate: "2001-08-11",
      years: 25,
      dayOffset: 0,
      albumCount: 3,
      lovedTracks: 2,
      portraitAvailable: false,
      representativeAlbumId: null,
      representativeAlbum: null,
      representativeCoverPath: null,
      evidence: "Remembered today · 2 loved tracks",
    },
  ],
  chartSnapshot: {
    source: "official-uk",
    sourceLabel: "Official UK Albums",
    year: 1986,
    week: 34,
    availableYears: [1986, 1982],
    availableWeeks: [32, 34, 50],
    stories: [{
      entity: "album",
      albumId: "album-chart",
      trackId: null,
      title: "Chart Album",
      artist: "Chart Artist",
      album: "Chart Album",
      chart: "Official UK Albums",
      rank: 1,
      chartDate: "1986-08-09",
      chartYear: 1986,
      loved: false,
      coverPath: null,
      evidence: "#1 on Official UK Albums · owned album",
    }],
  },
  deepCutSnapshot: {
    year: null,
    decade: null,
    genre: null,
    availableYears: [2001],
    availableGenres: [{ id: "rock", label: "Rock" }],
    matchingAlbumCount: 1,
    stories: [{
      trackId: 43,
      title: "Deep Track",
      albumId: "album-deep",
      album: "Deep Album",
      artist: "Deep Artist",
      trackNumber: 7,
      timeSeconds: 181,
      albumRating: 92,
      releaseYear: 2001,
      genre: "Rock",
      coverPath: null,
      evidence: "Album rated 92 · track unrated · no imported singles-chart match",
    }],
  },
  completionSnapshot: {
    mode: "artist",
    year: null,
    decade: null,
    genre: null,
    availableYears: [2001, 1999],
    availableGenres: [{ id: "rock", label: "Rock" }],
    matchingCount: 1,
    artistStories: [
      {
        artistId: "artist-gap",
        artist: "Gap Artist",
        musicbrainzMbid: "gap-mbid",
        ownedAlbumCount: 4,
        officialAlbumCount: 5,
        missingAlbumCount: 1,
        completionPercent: 0.8,
        missingReleaseTitle: "The Missing Album",
        missingReleaseYear: 1999,
        genre: "Rock",
        portraitAvailable: false,
        representativeAlbumId: null,
        representativeAlbum: null,
        representativeCoverPath: null,
        evidence: "4 of 5 official albums owned · 4 local albums",
      },
    ],
    albumStories: [
      {
        albumId: "album-gap",
        album: "Incomplete Album",
        artist: "Gap Artist",
        releaseYear: 2001,
        genre: "Rock",
        totalTracks: 10,
        ratedTracks: 7,
        unratedTracks: 3,
        completionPercent: 0.7,
        coverPath: null,
        evidence: "7 of 10 tracks rated",
      },
    ],
  },
  recommendationSnapshot: {
    mode: "played",
    anchors: [
      {
        albumId: "album-anchor",
        album: "Anchor Album",
        artist: "Anchor Artist",
        signal: "100% rated recently",
        coverPath: null,
        evidence: "10 of 10 tracks rated in recent activity",
      },
    ],
    matchingCount: 1,
    lastfmLinkedCount: 1,
    stories: [
      {
        albumId: "album-recommendation",
        album: "Connected Album",
        artist: "Connected Artist",
        lovedTracks: 0,
        albumScore: null,
        ratedTracks: 2,
        totalTracks: 10,
        ratingCompleteness: 0.2,
        coverPath: null,
        reason: "Similar artist",
        anchorAlbumId: "album-anchor",
        anchorAlbum: "Anchor Album",
        anchorArtist: "Anchor Artist",
        evidence: "Last.fm links Connected Artist to Anchor Artist · 20% rated",
      },
    ],
    evidence: "1 recent rating thread · suggestions are under 50% rated",
  },
  listeningEvidenceNote:
    "Listening stories use recent rating activity and loved tracks.",
};

function explorerResponse(
  request: DiscoveryShelfExplorerRequest,
): DiscoveryShelfExplorerResponse {
  return {
    shelf: request.shelf,
    title: request.shelf === "completion" ? "Complete the Collection" : "Shelf stories",
    evidenceNote: "The same local evidence used by the compact shelf.",
    total: 30,
    limit: request.limit ?? 24,
    offset: request.offset ?? 0,
    seed: request.seed ?? 90210,
    anniversaryYears: request.anniversaryYears ?? null,
    eventType: request.eventType ?? null,
    source: request.source ?? null,
    sourceLabel: request.shelf === "charts" ? "Official UK Albums" : null,
    year: request.year ?? null,
    week: request.week ?? null,
    decade: request.decade ?? null,
    genre: request.genre ?? null,
    mode: request.mode ?? null,
    connection: request.connection ?? null,
    query: request.query ?? null,
    sort: request.sort ?? "relevance",
    availableYears: [2001, 1999],
    availableWeeks: [34, 35],
    availableGenres: [{ id: "rock", label: "Rock" }],
    anniversaries: request.shelf === "anniversaries" ? edition.anniversaries : [],
    lifeEvents: request.shelf === "life-events" ? edition.lifeEvents : [],
    chartStories: request.shelf === "charts" ? edition.chartSnapshot.stories : [],
    deepCuts: request.shelf === "deep-cuts" ? edition.deepCutSnapshot.stories : [],
    artistCompletions:
      request.shelf === "completion" && request.mode !== "album"
        ? edition.completionSnapshot.artistStories
        : [],
    albumCompletions:
      request.shelf === "completion" && request.mode === "album"
        ? edition.completionSnapshot.albumStories
        : [],
    recommendations:
      request.shelf === "recommendations"
        ? edition.recommendationSnapshot.stories
        : [],
    anchors:
      request.shelf === "recommendations"
        ? edition.recommendationSnapshot.anchors
        : [],
  };
}

describe("DiscoveryDailyEdition", () => {
  it("navigates saved dates and locks reshuffling controls on an archived edition", () => {
    const onEditionDateChange = vi.fn();
    const commonProps = {
      isLoading: false,
      isAnniversaryLoading: false,
      isChartLoading: false,
      isDeepCutLoading: false,
      isCompletionLoading: false,
      isRecommendationLoading: false,
      onAnniversaryYearsChange: vi.fn(),
      onChartSnapshotChange: vi.fn(),
      onDeepCutSnapshotChange: vi.fn(),
      onCompletionSnapshotChange: vi.fn(),
      onRecommendationSnapshotChange: vi.fn(),
      onEditionDateChange,
      onOpenAlbum: vi.fn(),
      onOpenArtist: vi.fn(),
      onOpenTrack: vi.fn(),
    };
    const archive = {
      availableDates: ["2026-08-11", "2026-08-10"],
      snapshotCreatedAt: "2026-08-11T08:00:00Z",
      retentionDays: 90,
      isArchived: false,
      today: "2026-08-11",
    };
    const { rerender } = render(
      <DiscoveryDailyEdition edition={edition} archive={archive} {...commonProps} />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Open previous saved edition" }),
    );
    expect(onEditionDateChange).toHaveBeenLastCalledWith("2026-08-10");

    const archivedEdition = {
      ...edition,
      date: "2026-08-10",
      anniversaries: edition.anniversaries.map((story, index) =>
        index === 0 ? { ...story, album: "Frozen Archive Album" } : story,
      ),
    };
    rerender(
      <DiscoveryDailyEdition
        edition={archivedEdition}
        archive={{
          ...archive,
          snapshotCreatedAt: "2026-08-10T08:00:00Z",
          isArchived: true,
        }}
        {...commonProps}
      />,
    );

    expect(screen.getByText("Frozen Archive Album")).toBeInTheDocument();
    expect(screen.getByText(/Archived snapshot/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Random" })).toBeDisabled();
    expect(document.querySelector(".daily-edition-deep-cut-refresh")).toBeDisabled();
    expect(
      document.querySelectorAll("[data-daily-edition-see-all]:disabled"),
    ).toHaveLength(6);

    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(onEditionDateChange).toHaveBeenLastCalledWith("2026-08-11");
  });

  it("renders every story shelf and exposes the evidence model", () => {
    render(
      <DiscoveryDailyEdition
        edition={edition}
        isLoading={false}
        isAnniversaryLoading={false}
        isChartLoading={false}
        isDeepCutLoading={false}
        isCompletionLoading={false}
        isRecommendationLoading={false}
        onAnniversaryYearsChange={vi.fn()}
        onChartSnapshotChange={vi.fn()}
        onDeepCutSnapshotChange={vi.fn()}
        onCompletionSnapshotChange={vi.fn()}
        onRecommendationSnapshotChange={vi.fn()}
        onOpenAlbum={vi.fn()}
        onOpenArtist={vi.fn()}
        onOpenCompletion={vi.fn()}
        onOpenTrack={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Your Daily Edition" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Chart Toppers From…" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Deep Cuts" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Complete the Collection" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Because You Played…" })).toBeInTheDocument();
    expect(
      screen.getAllByText(
        "Listening stories use recent rating activity and loved tracks.",
      ),
    ).toHaveLength(2);

    fireEvent.click(screen.getByText("Why this?"));
    expect(
      screen.getByText(/best imported album-chart position is #11/i),
    ).toBeInTheDocument();
  });

  it("exposes a See all explorer from every compact shelf", () => {
    render(
      <DiscoveryDailyEdition
        edition={edition}
        isLoading={false}
        isAnniversaryLoading={false}
        isChartLoading={false}
        isDeepCutLoading={false}
        isCompletionLoading={false}
        isRecommendationLoading={false}
        onAnniversaryYearsChange={vi.fn()}
        onChartSnapshotChange={vi.fn()}
        onDeepCutSnapshotChange={vi.fn()}
        onCompletionSnapshotChange={vi.fn()}
        onRecommendationSnapshotChange={vi.fn()}
        onLoadExplorer={vi.fn(async (request) => explorerResponse(request))}
        onOpenAlbum={vi.fn()}
        onOpenArtist={vi.fn()}
        onOpenTrack={vi.fn()}
      />,
    );

    expect(
      document.querySelectorAll("[data-daily-edition-see-all]"),
    ).toHaveLength(6);
    expect(
      Array.from(document.querySelectorAll("[data-daily-edition-see-all]")).map(
        (element) => element.getAttribute("data-daily-edition-see-all"),
      ),
    ).toEqual([
      "anniversaries",
      "life-events",
      "charts",
      "deep-cuts",
      "completion",
      "recommendations",
    ]);
  });

  it("pages and sorts the explorer, opens a result, then restores shelf position and focus", async () => {
    const onLoadExplorer = vi.fn(async (request: DiscoveryShelfExplorerRequest) =>
      explorerResponse(request),
    );
    const onOpenArtist = vi.fn();
    const scrollTo = vi.fn();
    Object.defineProperty(window, "scrollY", { configurable: true, value: 640 });
    Object.defineProperty(window, "scrollTo", { configurable: true, value: scrollTo });
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      writable: true,
      value: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
    });

    render(
      <DiscoveryDailyEdition
        edition={edition}
        isLoading={false}
        isAnniversaryLoading={false}
        isChartLoading={false}
        isDeepCutLoading={false}
        isCompletionLoading={false}
        isRecommendationLoading={false}
        onAnniversaryYearsChange={vi.fn()}
        onChartSnapshotChange={vi.fn()}
        onDeepCutSnapshotChange={vi.fn()}
        onCompletionSnapshotChange={vi.fn()}
        onRecommendationSnapshotChange={vi.fn()}
        onLoadExplorer={onLoadExplorer}
        onOpenAlbum={vi.fn()}
        onOpenArtist={onOpenArtist}
        onOpenTrack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /see all 1 artist gaps/i }));
    expect(await screen.findByRole("button", { name: /back to daily edition/i })).toBeInTheDocument();
    await waitFor(() => expect(onLoadExplorer).toHaveBeenLastCalledWith(
      expect.objectContaining({ shelf: "completion", mode: "artist", offset: 0, limit: 24 }),
    ));

    fireEvent.change(screen.getByRole("combobox", { name: "Sort shelf explorer" }), {
      target: { value: "least-complete" },
    });
    await waitFor(() => expect(onLoadExplorer).toHaveBeenLastCalledWith(
      expect.objectContaining({ sort: "least-complete", offset: 0, seed: 90210 }),
    ));

    fireEvent.click(screen.getByRole("button", { name: /^Next$/ }));
    await waitFor(() => expect(onLoadExplorer).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 24, limit: 24, seed: 90210 }),
    ));
    fireEvent.click(screen.getByText("Gap Artist").closest("button")!);
    expect(onOpenArtist).toHaveBeenCalledWith("artist-gap", "Gap Artist");

    fireEvent.click(screen.getByRole("button", { name: /back to daily edition/i }));
    await waitFor(() => expect(
      screen.getByRole("heading", { name: "Your Daily Edition" }),
    ).toBeInTheDocument());
    const opener = document.getElementById("discovery-see-all-completion");
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 640, behavior: "auto" });
    expect(opener).toHaveFocus();
  });

  it("routes compact story actions to albums, tracks, and artists", () => {
    const onOpenAlbum = vi.fn();
    const onOpenArtist = vi.fn();
    const onOpenTrack = vi.fn();
    render(
      <DiscoveryDailyEdition
        edition={edition}
        isLoading={false}
        isAnniversaryLoading={false}
        isChartLoading={false}
        isDeepCutLoading={false}
        isCompletionLoading={false}
        isRecommendationLoading={false}
        onAnniversaryYearsChange={vi.fn()}
        onChartSnapshotChange={vi.fn()}
        onDeepCutSnapshotChange={vi.fn()}
        onCompletionSnapshotChange={vi.fn()}
        onRecommendationSnapshotChange={vi.fn()}
        onOpenAlbum={onOpenAlbum}
        onOpenArtist={onOpenArtist}
        onOpenCompletion={vi.fn()}
        onOpenTrack={onOpenTrack}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Read the story" }));
    expect(onOpenAlbum).toHaveBeenCalledWith("album-anniversary");

    fireEvent.click(screen.getByText("Chart Album").closest("button")!);
    fireEvent.click(screen.getByText("Deep Track").closest("button")!);
    expect(onOpenAlbum).toHaveBeenCalledWith("album-chart");
    expect(onOpenTrack).toHaveBeenCalledWith(43);

    fireEvent.click(screen.getByText("Gap Artist").closest("button")!);
    expect(onOpenArtist).toHaveBeenCalledWith("artist-gap", "Gap Artist");
  });

  it("chooses chart source, year, week, and a random owned-album snapshot", () => {
    const onChartSnapshotChange = vi.fn();
    render(
      <DiscoveryDailyEdition
        edition={edition}
        isLoading={false}
        isAnniversaryLoading={false}
        isChartLoading={false}
        isDeepCutLoading={false}
        isCompletionLoading={false}
        isRecommendationLoading={false}
        onAnniversaryYearsChange={vi.fn()}
        onChartSnapshotChange={onChartSnapshotChange}
        onDeepCutSnapshotChange={vi.fn()}
        onCompletionSnapshotChange={vi.fn()}
        onRecommendationSnapshotChange={vi.fn()}
        onOpenAlbum={vi.fn()}
        onOpenArtist={vi.fn()}
        onOpenCompletion={vi.fn()}
        onOpenTrack={vi.fn()}
      />,
    );

    expect(screen.getByText("Official UK Albums · Week 34, 1986")).toBeInTheDocument();
    expect(screen.getByText("Official UK Albums")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Choose album chart" }), {
      target: { value: "vg-lista" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Choose chart year" }), {
      target: { value: "1982" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Choose chart week" }), {
      target: { value: "50" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Random" }));

    expect(onChartSnapshotChange).toHaveBeenNthCalledWith(1, { source: "vg-lista" });
    expect(onChartSnapshotChange).toHaveBeenNthCalledWith(2, {
      source: "official-uk",
      year: 1982,
    });
    expect(onChartSnapshotChange).toHaveBeenNthCalledWith(3, {
      source: "official-uk",
      year: 1986,
      week: 50,
    });
    expect(onChartSnapshotChange).toHaveBeenNthCalledWith(4, { random: true });
  });

  it("filters and refreshes Deep Cuts while preserving active filters", () => {
    const onDeepCutSnapshotChange = vi.fn();
    const filteredEdition = {
      ...edition,
      deepCutSnapshot: {
        ...edition.deepCutSnapshot,
        decade: 2000,
        genre: "rock",
      },
    };
    render(
      <DiscoveryDailyEdition
        edition={filteredEdition}
        isLoading={false}
        isAnniversaryLoading={false}
        isChartLoading={false}
        isDeepCutLoading={false}
        isCompletionLoading={false}
        isRecommendationLoading={false}
        onAnniversaryYearsChange={vi.fn()}
        onChartSnapshotChange={vi.fn()}
        onDeepCutSnapshotChange={onDeepCutSnapshotChange}
        onCompletionSnapshotChange={vi.fn()}
        onRecommendationSnapshotChange={vi.fn()}
        onOpenAlbum={vi.fn()}
        onOpenArtist={vi.fn()}
        onOpenCompletion={vi.fn()}
        onOpenTrack={vi.fn()}
      />,
    );

    fireEvent.change(
      screen.getByRole("combobox", { name: "Filter Deep Cuts by period" }),
      { target: { value: "year:2001" } },
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Filter Deep Cuts by genre" }),
      { target: { value: "" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    expect(onDeepCutSnapshotChange).toHaveBeenNthCalledWith(1, {
      year: 2001,
      decade: undefined,
      genre: "rock",
    });
    expect(onDeepCutSnapshotChange).toHaveBeenNthCalledWith(2, {
      year: undefined,
      decade: 2000,
      genre: undefined,
    });
    expect(onDeepCutSnapshotChange).toHaveBeenNthCalledWith(3, {
      year: undefined,
      decade: 2000,
      genre: "rock",
    });
  });

  it("switches, filters, and refreshes completion suggestions", () => {
    const onCompletionSnapshotChange = vi.fn();
    const filteredEdition = {
      ...edition,
      completionSnapshot: {
        ...edition.completionSnapshot,
        decade: 1990,
        genre: "rock",
      },
    };
    render(
      <DiscoveryDailyEdition
        edition={filteredEdition}
        isLoading={false}
        isAnniversaryLoading={false}
        isChartLoading={false}
        isDeepCutLoading={false}
        isCompletionLoading={false}
        isRecommendationLoading={false}
        onAnniversaryYearsChange={vi.fn()}
        onChartSnapshotChange={vi.fn()}
        onDeepCutSnapshotChange={vi.fn()}
        onCompletionSnapshotChange={onCompletionSnapshotChange}
        onRecommendationSnapshotChange={vi.fn()}
        onOpenAlbum={vi.fn()}
        onOpenArtist={vi.fn()}
        onOpenCompletion={vi.fn()}
        onOpenTrack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Albums" }));
    fireEvent.change(
      screen.getByRole("combobox", { name: "Filter completion by period" }),
      { target: { value: "year:1999" } },
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Filter completion by genre" }),
      { target: { value: "" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh completion suggestions" }),
    );

    expect(onCompletionSnapshotChange).toHaveBeenNthCalledWith(1, { mode: "album" });
    expect(onCompletionSnapshotChange).toHaveBeenNthCalledWith(2, {
      mode: "artist",
      year: 1999,
      decade: undefined,
      genre: "rock",
    });
    expect(onCompletionSnapshotChange).toHaveBeenNthCalledWith(3, {
      mode: "artist",
      year: undefined,
      decade: 1990,
      genre: undefined,
    });
    expect(onCompletionSnapshotChange).toHaveBeenNthCalledWith(4, {
      mode: "artist",
      year: undefined,
      decade: 1990,
      genre: "rock",
    });
  });

  it("opens an album completion suggestion", () => {
    const onOpenAlbum = vi.fn();
    render(
      <DiscoveryDailyEdition
        edition={{
          ...edition,
          completionSnapshot: {
            ...edition.completionSnapshot,
            mode: "album",
            artistStories: [],
          },
        }}
        isLoading={false}
        isAnniversaryLoading={false}
        isChartLoading={false}
        isDeepCutLoading={false}
        isCompletionLoading={false}
        isRecommendationLoading={false}
        onAnniversaryYearsChange={vi.fn()}
        onChartSnapshotChange={vi.fn()}
        onDeepCutSnapshotChange={vi.fn()}
        onCompletionSnapshotChange={vi.fn()}
        onRecommendationSnapshotChange={vi.fn()}
        onOpenAlbum={onOpenAlbum}
        onOpenArtist={vi.fn()}
        onOpenCompletion={vi.fn()}
        onOpenTrack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Incomplete Album").closest("button")!);
    expect(onOpenAlbum).toHaveBeenCalledWith("album-gap");
  });

  it("supports manual selection, 10-second rotation, and anniversary changes", () => {
    vi.useFakeTimers();
    const onAnniversaryYearsChange = vi.fn();
    const view = render(
      <DiscoveryDailyEdition
        edition={edition}
        isLoading={false}
        isAnniversaryLoading={false}
        isChartLoading={false}
        isDeepCutLoading={false}
        isCompletionLoading={false}
        isRecommendationLoading={false}
        onAnniversaryYearsChange={onAnniversaryYearsChange}
        onChartSnapshotChange={vi.fn()}
        onDeepCutSnapshotChange={vi.fn()}
        onCompletionSnapshotChange={vi.fn()}
        onRecommendationSnapshotChange={vi.fn()}
        onOpenAlbum={vi.fn()}
        onOpenArtist={vi.fn()}
        onOpenCompletion={vi.fn()}
        onOpenTrack={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Show Destroyer by KISS" }),
    );
    expect(
      screen.getByRole("group", { name: "2 of 2: Destroyer by KISS" }),
    ).toBeInTheDocument();

    const firstThumbnail = screen.getByRole("button", {
      name: "Show Hejira by Joni Mitchell",
    });
    firstThumbnail.focus();
    fireEvent.click(firstThumbnail);
    expect(firstThumbnail).toHaveFocus();
    act(() => vi.advanceTimersByTime(9_000));
    expect(
      screen.getByRole("group", { name: "1 of 2: Hejira by Joni Mitchell" }),
    ).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1_000));
    expect(
      screen.getByRole("group", { name: "2 of 2: Destroyer by KISS" }),
    ).toBeInTheDocument();

    const anniversaryPicker = screen.getByRole("combobox", {
      name: "Choose anniversary milestone",
    });
    anniversaryPicker.focus();
    fireEvent.change(anniversaryPicker, { target: { value: "70" } });
    expect(onAnniversaryYearsChange).toHaveBeenCalledWith(70);

    view.rerender(
      <DiscoveryDailyEdition
        edition={edition}
        isLoading={false}
        isAnniversaryLoading
        isChartLoading={false}
        isDeepCutLoading={false}
        isCompletionLoading={false}
        isRecommendationLoading={false}
        onAnniversaryYearsChange={onAnniversaryYearsChange}
        onChartSnapshotChange={vi.fn()}
        onDeepCutSnapshotChange={vi.fn()}
        onCompletionSnapshotChange={vi.fn()}
        onRecommendationSnapshotChange={vi.fn()}
        onOpenAlbum={vi.fn()}
        onOpenArtist={vi.fn()}
        onOpenCompletion={vi.fn()}
        onOpenTrack={vi.fn()}
      />,
    );
    act(() => vi.advanceTimersByTime(20_000));
    expect(
      screen.getByRole("group", { name: "2 of 2: Destroyer by KISS" }),
    ).toBeInTheDocument();

    view.rerender(
      <DiscoveryDailyEdition
        edition={{
          ...edition,
          anniversaryYears: 70,
          anniversaries: edition.anniversaries.map((story, index) => ({
            ...story,
            albumId: `${story.albumId}-70`,
            album: index === 0 ? "First 70-year album" : "Second 70-year album",
            releaseYear: 1956,
          })),
        }}
        isLoading={false}
        isAnniversaryLoading={false}
        isChartLoading={false}
        isDeepCutLoading={false}
        isCompletionLoading={false}
        isRecommendationLoading={false}
        onAnniversaryYearsChange={onAnniversaryYearsChange}
        onChartSnapshotChange={vi.fn()}
        onDeepCutSnapshotChange={vi.fn()}
        onCompletionSnapshotChange={vi.fn()}
        onRecommendationSnapshotChange={vi.fn()}
        onOpenAlbum={vi.fn()}
        onOpenArtist={vi.fn()}
        onOpenCompletion={vi.fn()}
        onOpenTrack={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("group", {
        name: "1 of 2: First 70-year album by Joni Mitchell",
      }),
    ).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(10_000));
    expect(
      screen.getByRole("group", {
        name: "2 of 2: Second 70-year album by KISS",
      }),
    ).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("switches between birthdays and memorials without a dead view-all link", () => {
    render(
      <DiscoveryDailyEdition
        edition={edition}
        isLoading={false}
        isAnniversaryLoading={false}
        isChartLoading={false}
        isDeepCutLoading={false}
        isCompletionLoading={false}
        isRecommendationLoading={false}
        onAnniversaryYearsChange={vi.fn()}
        onChartSnapshotChange={vi.fn()}
        onDeepCutSnapshotChange={vi.fn()}
        onCompletionSnapshotChange={vi.fn()}
        onRecommendationSnapshotChange={vi.fn()}
        onOpenAlbum={vi.fn()}
        onOpenArtist={vi.fn()}
        onOpenCompletion={vi.fn()}
        onOpenTrack={vi.fn()}
      />,
    );

    expect(screen.getByText("Test Artist")).toBeInTheDocument();
    expect(screen.queryByText("Memorial Artist")).not.toBeInTheDocument();
    expect(screen.queryByText(/view all birthdays/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Memorials" }));
    expect(screen.getByText("Memorial Artist")).toBeInTheDocument();
    const memorialDate = new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date("2001-08-11T12:00:00"));
    expect(
      screen.getByText(`Died ${memorialDate} · 25 years ago`),
    ).toBeInTheDocument();
    expect(screen.queryByText("Test Artist")).not.toBeInTheDocument();
  });

  it("switches recommendation signals and refreshes the active mode", () => {
    const onRecommendationSnapshotChange = vi.fn();
    const view = render(
      <DiscoveryDailyEdition
        edition={edition}
        isLoading={false}
        isAnniversaryLoading={false}
        isChartLoading={false}
        isDeepCutLoading={false}
        isCompletionLoading={false}
        isRecommendationLoading={false}
        onAnniversaryYearsChange={vi.fn()}
        onChartSnapshotChange={vi.fn()}
        onDeepCutSnapshotChange={vi.fn()}
        onCompletionSnapshotChange={vi.fn()}
        onRecommendationSnapshotChange={onRecommendationSnapshotChange}
        onOpenAlbum={vi.fn()}
        onOpenArtist={vi.fn()}
        onOpenCompletion={vi.fn()}
        onOpenTrack={vi.fn()}
      />,
    );

    expect(screen.getByRole("tab", { name: "Played" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText(/suggestions are under 50% rated/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Loved" }));
    view.rerender(
      <DiscoveryDailyEdition
        edition={{
          ...edition,
          recommendationSnapshot: {
            ...edition.recommendationSnapshot,
            mode: "loved",
            evidence: "1 high-score or loved anchor · suggestions are under 50% rated",
          },
        }}
        isLoading={false}
        isAnniversaryLoading={false}
        isChartLoading={false}
        isDeepCutLoading={false}
        isCompletionLoading={false}
        isRecommendationLoading={false}
        onAnniversaryYearsChange={vi.fn()}
        onChartSnapshotChange={vi.fn()}
        onDeepCutSnapshotChange={vi.fn()}
        onCompletionSnapshotChange={vi.fn()}
        onRecommendationSnapshotChange={onRecommendationSnapshotChange}
        onOpenAlbum={vi.fn()}
        onOpenArtist={vi.fn()}
        onOpenCompletion={vi.fn()}
        onOpenTrack={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Refresh recommendation suggestions" }),
    );

    expect(onRecommendationSnapshotChange).toHaveBeenNthCalledWith(1, {
      mode: "loved",
    });
    expect(onRecommendationSnapshotChange).toHaveBeenNthCalledWith(2, {
      mode: "loved",
    });
  });

  it("uses the contents rail to focus and flash a selected story", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    render(
      <DiscoveryDailyEdition
        edition={edition}
        isLoading={false}
        isAnniversaryLoading={false}
        isChartLoading={false}
        isDeepCutLoading={false}
        isCompletionLoading={false}
        isRecommendationLoading={false}
        onAnniversaryYearsChange={vi.fn()}
        onChartSnapshotChange={vi.fn()}
        onDeepCutSnapshotChange={vi.fn()}
        onCompletionSnapshotChange={vi.fn()}
        onRecommendationSnapshotChange={vi.fn()}
        onOpenAlbum={vi.fn()}
        onOpenArtist={vi.fn()}
        onOpenCompletion={vi.fn()}
        onOpenTrack={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /^Because You Played \/ Loved$/ }),
    );
    const target = document.getElementById("discovery-because");
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
    expect(target).toHaveFocus();
    expect(target).toHaveClass("daily-edition-story-flash");
  });
});
