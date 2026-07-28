import { describe, expect, it } from "vitest";

import { createFilters } from "./requests";
import { countAdvancedSearchFilters } from "./searchProgressive";

describe("progressive Search filter summary", () => {
  it("does not count common album controls as advanced", () => {
    const filters = createFilters();
    filters.albumTitle.value = "Actually";
    filters.albumArtist.value = "Pet Shop Boys";
    filters.genres = ["Synthpop"];
    filters.yearFrom = 1987;
    filters.yearTo = 1987;
    filters.vgListaDebutWeekFrom = "1987-W20";
    filters.vgListaDebutWeekTo = "1987-W30";
    filters.excludedGenres = ["Comedy"];

    expect(countAdvancedSearchFilters(filters, "albums")).toBe(0);
  });

  it("counts grouped long-tail filters without counting both ends twice", () => {
    const filters = createFilters();
    filters.filePath.value = "Lossless";
    filters.artistBornYearFrom = 1950;
    filters.artistBornYearTo = 1970;
    filters.originCountryCodes = ["GB", "US"];
    filters.missingFields = ["genre", "year"];

    expect(countAdvancedSearchFilters(filters, "albums")).toBe(4);
  });

  it("counts rating ranges as advanced controls", () => {
    const filters = createFilters();
    filters.trackRatingMin = 3;

    expect(countAdvancedSearchFilters(filters, "tracks")).toBe(1);

    filters.trackRatingMax = 5;
    expect(countAdvancedSearchFilters(filters, "tracks")).toBe(1);

    filters.albumRatingMin = 80;
    expect(countAdvancedSearchFilters(filters, "tracks")).toBe(2);
  });

  it("counts a VG Lista rank range as one advanced group", () => {
    const filters = createFilters();
    filters.vgListaRankMin = 1;
    filters.vgListaRankMax = 20;

    expect(countAdvancedSearchFilters(filters, "albums")).toBe(1);
  });
});
