import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ArtistTrackHighlights } from "../types";
import {
  ArtistChartBustersPanel,
  ArtistLovedTracksPanel,
} from "./ArtistTrackHighlightsPanels";

const highlights: ArtistTrackHighlights = {
  artistId: "pet shop boys",
  artistName: "Pet Shop Boys",
  lovedTracks: [
    {
      trackId: 2,
      title: "Go West",
      displayArtist: "Pet Shop Boys",
      album: "Very",
      year: 1993,
      seconds: 303,
      rating: 90,
    },
    {
      trackId: 1,
      title: "West End Girls",
      displayArtist: "Pet Shop Boys",
      album: "Please",
      year: 1986,
      seconds: 286,
      rating: 70,
    },
  ],
  chartTracks: [
    {
      trackId: 1,
      title: "West End Girls",
      displayArtist: "Pet Shop Boys",
      album: "Please",
      year: 1986,
      charts: [
        {
          chart: "norsktoppen",
          entryDate: "1986-05-05",
          endDate: "1986-05-12",
          weeksOnChart: 2,
          peak: 2,
        },
        {
          chart: "vgLista",
          entryDate: "1986-03-10",
          endDate: "1986-04-07",
          weeksOnChart: 5,
          peak: 3,
        },
        {
          chart: "billboard",
          entryDate: "1986-01-11",
          endDate: null,
          weeksOnChart: null,
          peak: 1,
        },
        {
          chart: "tiISkuddet",
          entryDate: "1986-04-14",
          endDate: "1986-04-28",
          weeksOnChart: 3,
          peak: 1,
        },
        {
          chart: "officialUk",
          entryDate: "1985-10-26",
          endDate: "1986-01-18",
          weeksOnChart: 13,
          peak: 1,
        },
      ],
    },
    {
      trackId: 2,
      title: "Go West",
      displayArtist: "Pet Shop Boys",
      album: "Very",
      year: 1993,
      charts: [
        {
          chart: "vgLista",
          entryDate: "1993-10-11",
          endDate: "1993-11-08",
          weeksOnChart: 5,
          peak: 4,
        },
        {
          chart: "officialUk",
          entryDate: "1993-09-18",
          endDate: "1993-11-06",
          weeksOnChart: 8,
          peak: 2,
        },
      ],
    },
  ],
};

describe("artist track highlight panels", () => {
  it("sorts loved tracks oldest first by default and supports rating order", () => {
    render(
      <ArtistLovedTracksPanel
        highlights={highlights}
        isLoading={false}
        error={null}
      />,
    );

    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent(
      "West End Girls",
    );

    fireEvent.change(screen.getByLabelText("Sort loved tracks"), {
      target: { value: "rating-desc" },
    });
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Go West");
  });

  it("prioritizes Billboard, expands the other charts, and falls back to UK", () => {
    render(
      <ArtistChartBustersPanel
        highlights={highlights}
        isLoading={false}
        error={null}
      />,
    );

    const westEndGirls = screen.getByText("West End Girls").closest("article");
    expect(westEndGirls).not.toBeNull();
    expect(within(westEndGirls!).getByText("Billboard Hot 100")).toBeInTheDocument();
    expect(
      within(westEndGirls!).queryByText("Official UK Singles"),
    ).not.toBeInTheDocument();

    fireEvent.click(within(westEndGirls!).getByRole("button", { name: /Show 4 more charts/ }));
    expect(within(westEndGirls!).getByText("Official UK Singles")).toBeInTheDocument();
    expect(within(westEndGirls!).getByText("VG-lista")).toBeInTheDocument();
    expect(within(westEndGirls!).getByText("Ti i Skuddet")).toBeInTheDocument();
    expect(within(westEndGirls!).getByText("Norsktoppen")).toBeInTheDocument();

    const goWest = screen.getByText("Go West").closest("article");
    expect(goWest).not.toBeNull();
    expect(within(goWest!).getByText("Official UK Singles")).toBeInTheDocument();
    expect(within(goWest!).queryByText("VG-lista")).not.toBeInTheDocument();
  });
});
