import { describe, expect, it } from "vitest";
import { mockArtists } from "../backend/webPreview";
import { missingArtistInfo, matchesArtistInfo } from "./artistInfo";
import { createArtistListRequest } from "./requests";

describe("artist information completeness", () => {
  it("does not require optional facts or an end date for an active artist", () => {
    const artist = { ...mockArtists.find((row) => row.id === "pet shop boys")! };
    expect(missingArtistInfo(artist)).toEqual([]);
    artist.musicBrainzEnded = true;
    expect(missingArtistInfo(artist).map((field) => field.value)).toEqual(["endStatus"]);
    artist.musicBrainzEndYear = 2000;
    expect(missingArtistInfo(artist)).toEqual([]);
    artist.musicBrainzMbid = "  ";
    expect(missingArtistInfo(artist).map((field) => field.value)).toEqual(["mbid"]);
  });

  it("distinguishes a missing country from a country-only gap", () => {
    const artist = { ...mockArtists.find((row) => row.id === "pet shop boys")!, originCountryCode: null };
    const request = { ...createArtistListRequest(), unresolvedOnly: true, missingInfo: "originCountry", onlyMissingField: true };
    expect(matchesArtistInfo(artist, request)).toBe(true);
    artist.musicBrainzMbid = null;
    expect(matchesArtistInfo(artist, request)).toBe(false);
    expect(matchesArtistInfo(artist, { ...request, onlyMissingField: false })).toBe(true);
  });
});
