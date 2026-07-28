import { describe, expect, it } from "vitest";

import { createFilters } from "./requests";
import {
  countAdvancedSearchFilters,
  countSearchChartFilters,
} from "./searchProgressive";

describe("progressive Search filter summary", () => {
  it("does not count common album controls as advanced", () => {
    const filters = createFilters();
    filters.albumTitle.value = "Actually";
    filters.albumArtist.value = "Pet Shop Boys";
    filters.genres = ["Synthpop"];
    filters.yearFrom = 1987;
    filters.yearTo = 1987;
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

  it("counts Billboard and VG Lista debut ranges as advanced groups", () => {
    const filters = createFilters();
    filters.billboardDebutWeekFrom = "1987-W20";
    filters.billboardDebutWeekTo = "1987-W30";
    filters.vgListaDebutWeekFrom = "1987-W20";
    filters.vgListaDebutWeekTo = "1987-W30";

    expect(countAdvancedSearchFilters(filters, "albums")).toBe(2);
  });

  it("counts Ti i Skuddet chart groups only for track searches", () => {
    const filters = createFilters();
    filters.tiISkuddetRankMin = 1;
    filters.tiISkuddetRankMax = 10;
    filters.tiISkuddetDebutWeekFrom = "1989-W20";
    filters.tiISkuddetDebutWeekTo = "1989-W30";

    expect(countSearchChartFilters(filters, "tracks")).toBe(2);
    expect(countAdvancedSearchFilters(filters, "tracks")).toBe(2);
    expect(countSearchChartFilters(filters, "albums")).toBe(0);
    expect(countAdvancedSearchFilters(filters, "albums")).toBe(0);
  });

  it("counts Norsktoppen chart groups only for track searches", () => {
    const filters = createFilters();
    filters.norsktoppenRankMin = 1;
    filters.norsktoppenRankMax = 10;
    filters.norsktoppenDebutWeekFrom = "1989-W20";
    filters.norsktoppenDebutWeekTo = "1989-W30";

    expect(countSearchChartFilters(filters, "tracks")).toBe(2);
    expect(countAdvancedSearchFilters(filters, "tracks")).toBe(2);
    expect(countSearchChartFilters(filters, "albums")).toBe(0);
    expect(countAdvancedSearchFilters(filters, "albums")).toBe(0);
  });
});
