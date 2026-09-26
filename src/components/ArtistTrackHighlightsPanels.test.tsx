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
  it("shows archive preparation, errors, and empty results clearly", () => {
    const { rerender } = render(<ArtistChartBustersPanel highlights={null} isLoading isPreparingCharts error={null} />);
    expect(screen.getByRole("status")).toHaveTextContent("Preparing US charts");
    rerender(<ArtistChartBustersPanel highlights={null} isLoading={false} error="Archive unavailable" />);
    expect(screen.getByText("Archive unavailable")).toBeInTheDocument();
    rerender(<ArtistChartBustersPanel highlights={{ ...highlights, chartTracks: [] }} isLoading={false} error={null} />);
    expect(screen.getByText("No local tracks by this artist are matched to an imported singles chart.")).toBeInTheDocument();
  });
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

  it("groups every chart by name, filters countries, and sorts within each chart", () => {
    render(
      <ArtistChartBustersPanel
        highlights={{ ...highlights, chartTracks: highlights.chartTracks.map((track) => ({
          ...track,
          charts: [...track.charts, { chart: "published:Hot Dance Club Play", entryDate: "1994-01-01", endDate: "1994-02-01", weeksOnChart: 5, peak: 1 }],
        })) }}
        isLoading={false}
        error={null}
      />,
    );

    const uk = screen.getByRole("region", { name: "Official UK Singles" });
    expect(within(uk).getAllByRole("article")[0]).toHaveTextContent("West End Girls");
    fireEvent.change(screen.getByLabelText("Sort charted tracks"), { target: { value: "date-desc" } });
    expect(within(uk).getAllByRole("article")[0]).toHaveTextContent("Go West");
    expect(screen.getByRole("region", { name: "Hot Dance Club Play" })).toHaveTextContent("First seen");
    expect(screen.getByRole("region", { name: "Billboard · Annual singles ranking" })).toHaveTextContent("Best rank");
    fireEvent.click(screen.getByRole("button", { name: /^US / }));
    expect(screen.queryByRole("region", { name: "Official UK Singles" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Hot Dance Club Play" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^NO / }));
    expect(screen.getByRole("region", { name: "VG-lista" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Hot Dance Club Play" })).not.toBeInTheDocument();
  });
});
