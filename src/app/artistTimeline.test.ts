import { describe, expect, it } from "vitest";

import type { ArtistTimelineResponse } from "../types";
import {
  artistPeakStrength,
  buildArtistCareerPeaksLayout,
  createArtistTimelineRequest,
} from "./artistTimeline";

const response: ArtistTimelineResponse = {
  artists: [
    {
      id: "kate bush",
      name: "Kate Bush",
      albumCount: 2,
      firstYear: 1978,
      lastYear: 1985,
      averageAlbumScore: 150,
      lovedTracks: 5,
      topGenre: "Art Pop",
      portraitAvailable: false,
      representativeAlbumId: "album-1",
      representativeAlbum: "The Kick Inside",
      representativeCoverPath: null,
    },
  ],
  albums: [
    {
      albumId: "album-1",
      album: "The Kick Inside",
      artistId: "kate bush",
      artist: "Kate Bush",
      year: 1978,
      albumScore: 100,
      lovedTracks: 2,
      billboardRank: 30,
      officialUkRank: 3,
      vgListaRank: null,
      chartPeak: 0.72,
      coverPath: null,
    },
    {
      albumId: "album-2",
      album: "Hounds of Love",
      artistId: "kate bush",
      artist: "Kate Bush",
      year: 1985,
      albumScore: 200,
      lovedTracks: 3,
      billboardRank: 12,
      officialUkRank: 1,
      vgListaRank: 4,
      chartPeak: 0.91,
      coverPath: null,
    },
  ],
  matchingAlbumCount: 2,
  matchingArtistCount: 1,
  datedAlbumCount: 2,
  availableYearFrom: 1978,
  availableYearTo: 1985,
};

describe("artist timeline layout", () => {
  it("normalizes reversed years and keeps requested filters", () => {
    expect(
      createArtistTimelineRequest({
        yearFrom: 2020,
        yearTo: 1980,
        includedGenres: ["Scores"],
        excludedGenres: ["Metal"],
        artists: ["Kate Bush"],
        artistLimit: 7,
        metric: "charts",
      }),
    ).toEqual({
      yearFrom: 1980,
      yearTo: 2020,
      genres: ["Scores"],
      excludedGenres: ["Metal"],
      artists: ["Kate Bush"],
      artistLimit: 7,
      metric: "charts",
    });
  });

  it("makes the strongest metric result the tallest peak", () => {
    const layout = buildArtistCareerPeaksLayout(response, { metric: "charts" });
    expect(layout.rows[0].strongest[0].album.albumId).toBe("album-2");
    expect(layout.rows[0].points[1].peakY).toBeLessThan(layout.rows[0].points[0].peakY);
  });

  it("uses the highest personal album score as a full-strength peak", () => {
    expect(artistPeakStrength(response.albums[1], "albumScore", 200)).toBe(1);
    expect(artistPeakStrength(response.albums[0], "albumScore", 200)).toBe(0.5);
  });
});
