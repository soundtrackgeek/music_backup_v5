import { describe, expect, it } from "vitest";

import type { MusicMapLocationDetails } from "../types";
import {
  createMusicMapQuestionRequest,
  musicMapScopeLabel,
} from "./musicMapLuna";

function details(
  precision: "area" | "country",
): MusicMapLocationDetails {
  return {
    point: {
      id: precision === "area" ? "area:oslo" : "country:NO",
      name: precision === "area" ? "Oslo" : "Norway",
      countryCode: "NO",
      countryName: "Norway",
      precision,
      latitude: 59.91,
      longitude: 10.75,
      artistCount: 3,
      albumCount: 9,
      trackCount: 90,
      lovedTracks: 12,
      topGenre: "Electronic",
    },
    genres: [],
    artists: [],
    artistKeys: ["a-ha", "royksopp", "susanne sundfor"],
  };
}

describe("Music Map Luna scope", () => {
  it("uses the country filter for a selected country", () => {
    const selected = details("country");
    const request = createMusicMapQuestionRequest(selected);

    expect(request.filters.originCountryCodes).toEqual(["NO"]);
    expect(request.filters.artistKeys).toEqual([]);
    expect(musicMapScopeLabel(selected)).toBe("Norway");
  });

  it("uses every mapped artist key for an exact selected area", () => {
    const selected = details("area");
    const request = createMusicMapQuestionRequest(selected);

    expect(request.filters.artistKeys).toEqual(selected.artistKeys);
    expect(request.filters.originCountryCodes).toEqual([]);
    expect(musicMapScopeLabel(selected)).toBe("Oslo, Norway");
  });
});
