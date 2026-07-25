import { describe, expect, it } from "vitest";

import type { MusicMapPoint } from "../types";
import {
  geographyVisibility,
  genreColor,
  mapMetricValue,
  topGenreLegend,
} from "./musicMap";

const point: MusicMapPoint = {
  id: "country:NO",
  name: "Norway",
  countryCode: "NO",
  countryName: "Norway",
  precision: "country",
  latitude: 61,
  longitude: 8,
  artistCount: 10,
  albumCount: 30,
  trackCount: 300,
  lovedTracks: 8,
  topGenre: "Electronic",
};

describe("music map helpers", () => {
  it("keeps genre colors stable", () => {
    expect(genreColor("Electronic")).toBe(genreColor("Electronic"));
    expect(genreColor("Electronic")).not.toBe(genreColor("Rock"));
  });

  it("switches from countries to precise areas as auto mode zooms", () => {
    expect(geographyVisibility("auto", 2)).toEqual({
      countries: true,
      areas: false,
    });
    expect(geographyVisibility("auto", 3)).toEqual({
      countries: true,
      areas: true,
    });
    expect(geographyVisibility("auto", 6)).toEqual({
      countries: false,
      areas: true,
    });
  });

  it("uses the selected size metric and ranks the legend by albums", () => {
    expect(mapMetricValue(point, "lovedTracks")).toBe(8);
    expect(
      topGenreLegend([
        point,
        { ...point, id: "country:GB", topGenre: "Rock", albumCount: 100 },
      ])[0].genre,
    ).toBe("Rock");
  });
});
