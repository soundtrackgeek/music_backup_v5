import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { DiscoveryDailyEdition as DiscoveryDailyEditionData } from "../types";
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
  deepCuts: [
    {
      trackId: 43,
      title: "Deep Track",
      albumId: "album-deep",
      album: "Deep Album",
      artist: "Deep Artist",
      trackNumber: 7,
      timeSeconds: 181,
      albumRating: 92,
      coverPath: null,
      evidence: "Album rated 92 · track unrated · no imported singles-chart match",
    },
  ],
  artistCompletions: [
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
      portraitAvailable: false,
      representativeAlbumId: null,
      representativeAlbum: null,
      representativeCoverPath: null,
      evidence: "4 of 5 official albums owned · 4 local albums",
    },
  ],
  ratingAnchor: {
    albumId: "album-anchor",
    album: "Anchor Album",
    artist: "Anchor Artist",
    createdAt: "2026-08-11T08:00:00Z",
    rating: 88,
    coverPath: null,
    evidence: "Rated 88 · recent library rating activity",
  },
  becauseYouPlayed: [
    {
      albumId: "album-recommendation",
      album: "Connected Album",
      artist: "Connected Artist",
      lovedTracks: 3,
      albumScore: 121,
      coverPath: null,
      reason: "Shared genre",
      evidence: "Shared genre · 3 loved tracks",
    },
  ],
  listeningEvidenceNote:
    "Listening stories use recent rating activity and loved tracks.",
};

describe("DiscoveryDailyEdition", () => {
  it("renders every story shelf and exposes the evidence model", () => {
    render(
      <DiscoveryDailyEdition
        edition={edition}
        isLoading={false}
        isAnniversaryLoading={false}
        isChartLoading={false}
        onAnniversaryYearsChange={vi.fn()}
        onChartSnapshotChange={vi.fn()}
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
    expect(screen.getByRole("heading", { name: "Complete the Artist" })).toBeInTheDocument();
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

  it("routes story actions to albums, tracks, artists, and completion", () => {
    const onOpenAlbum = vi.fn();
    const onOpenArtist = vi.fn();
    const onOpenCompletion = vi.fn();
    const onOpenTrack = vi.fn();
    render(
      <DiscoveryDailyEdition
        edition={edition}
        isLoading={false}
        isAnniversaryLoading={false}
        isChartLoading={false}
        onAnniversaryYearsChange={vi.fn()}
        onChartSnapshotChange={vi.fn()}
        onOpenAlbum={onOpenAlbum}
        onOpenArtist={onOpenArtist}
        onOpenCompletion={onOpenCompletion}
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

    fireEvent.click(screen.getByRole("button", { name: /view all artist gaps/i }));
    expect(onOpenCompletion).toHaveBeenCalledTimes(1);
  });

  it("chooses chart source, year, week, and a random owned-album snapshot", () => {
    const onChartSnapshotChange = vi.fn();
    render(
      <DiscoveryDailyEdition
        edition={edition}
        isLoading={false}
        isAnniversaryLoading={false}
        isChartLoading={false}
        onAnniversaryYearsChange={vi.fn()}
        onChartSnapshotChange={onChartSnapshotChange}
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

  it("supports manual selection, 10-second rotation, and anniversary changes", () => {
    vi.useFakeTimers();
    const onAnniversaryYearsChange = vi.fn();
    const view = render(
      <DiscoveryDailyEdition
        edition={edition}
        isLoading={false}
        isAnniversaryLoading={false}
        isChartLoading={false}
        onAnniversaryYearsChange={onAnniversaryYearsChange}
        onChartSnapshotChange={vi.fn()}
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
        onAnniversaryYearsChange={onAnniversaryYearsChange}
        onChartSnapshotChange={vi.fn()}
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
        onAnniversaryYearsChange={onAnniversaryYearsChange}
        onChartSnapshotChange={vi.fn()}
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
        onAnniversaryYearsChange={vi.fn()}
        onChartSnapshotChange={vi.fn()}
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
    expect(screen.getByText(/died 11 aug 2001 · 25 years ago/i)).toBeInTheDocument();
    expect(screen.queryByText("Test Artist")).not.toBeInTheDocument();
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
        onAnniversaryYearsChange={vi.fn()}
        onChartSnapshotChange={vi.fn()}
        onOpenAlbum={vi.fn()}
        onOpenArtist={vi.fn()}
        onOpenCompletion={vi.fn()}
        onOpenTrack={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /^Because You Played$/ }),
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
