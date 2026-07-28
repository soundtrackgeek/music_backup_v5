import { describe, expect, it } from "vitest";

import { createChartConfig } from "./requests";
import {
  countAdvancedChartControls,
  countChartSourceFilters,
} from "./chartProgressive";

describe("progressive Charts control summary", () => {
  it("does not count common chart controls as advanced", () => {
    const config = createChartConfig();
    const baseline = countAdvancedChartControls(config);

    config.rankingMetric = "lovedTracks";
    config.sortDirection = "asc";
    config.request.filters.genres = ["Synthpop"];
    config.request.filters.yearFrom = 1980;
    config.request.filters.yearTo = 1989;
    config.request.filters.excludedGenres = ["Comedy"];

    expect(countAdvancedChartControls(config)).toBe(baseline);
  });

  it("counts the result limit as an advanced control", () => {
    const config = createChartConfig();
    const baseline = countAdvancedChartControls(config);

    config.resultLimit = 25;

    expect(countAdvancedChartControls(config)).toBe(baseline + 1);
  });

  it("counts grouped long-tail chart filters once per control group", () => {
    const config = createChartConfig();
    const baseline = countAdvancedChartControls(config);

    config.request.filters.albumTitle.value = "Actually";
    config.request.filters.artistBornYearFrom = 1950;
    config.request.filters.artistBornYearTo = 1970;
    config.request.filters.missingOriginCountry = true;

    expect(countAdvancedChartControls(config)).toBe(baseline + 3);
  });

  it("summarizes presentation and export customizations", () => {
    const config = createChartConfig();
    const baseline = countAdvancedChartControls(config);

    config.visibleColumns = ["billboard", "rating"];
    config.exportColumns = [];
    config.viewMode = "grid";
    config.gridCoverSize = 200;

    expect(countAdvancedChartControls(config)).toBe(baseline + 3);
  });

  it("counts a VG Lista rank range as one advanced group", () => {
    const config = createChartConfig();
    const baseline = countAdvancedChartControls(config);
    config.request.filters.vgListaRankMin = 1;
    config.request.filters.vgListaRankMax = 20;

    expect(countAdvancedChartControls(config)).toBe(baseline + 1);
  });

  it("counts Billboard and VG Lista debut ranges as advanced groups", () => {
    const config = createChartConfig();
    const baseline = countAdvancedChartControls(config);
    config.request.filters.billboardDebutWeekFrom = "1987-W20";
    config.request.filters.billboardDebutWeekTo = "1987-W30";
    config.request.filters.vgListaDebutWeekFrom = "1987-W20";
    config.request.filters.vgListaDebutWeekTo = "1987-W30";

    expect(countAdvancedChartControls(config)).toBe(baseline + 2);
  });

  it("counts Official UK rank and debut groups for album and track charts", () => {
    const config = createChartConfig();
    const baseline = countAdvancedChartControls(config);
    config.request.filters.officialUkRankMin = 1;
    config.request.filters.officialUkRankMax = 40;
    config.request.filters.officialUkDebutWeekFrom = "1995-W01";
    config.request.filters.officialUkDebutWeekTo = "1995-W52";

    expect(countChartSourceFilters(config)).toBe(2);
    expect(countAdvancedChartControls(config)).toBe(baseline + 2);

    config.request.view = "tracks";
    expect(countChartSourceFilters(config)).toBe(2);
  });

  it("counts Ti i Skuddet chart groups only for track charts", () => {
    const config = createChartConfig();
    config.request.view = "tracks";
    const baseline = countAdvancedChartControls(config);
    config.request.filters.tiISkuddetRankMin = 1;
    config.request.filters.tiISkuddetRankMax = 10;
    config.request.filters.tiISkuddetDebutWeekFrom = "1989-W20";
    config.request.filters.tiISkuddetDebutWeekTo = "1989-W30";

    expect(countChartSourceFilters(config)).toBe(2);
    expect(countAdvancedChartControls(config)).toBe(baseline + 2);

    config.request.view = "albums";
    expect(countChartSourceFilters(config)).toBe(0);
  });

  it("counts Norsktoppen chart groups only for track charts", () => {
    const config = createChartConfig();
    config.request.view = "tracks";
    const baseline = countAdvancedChartControls(config);
    config.request.filters.norsktoppenRankMin = 1;
    config.request.filters.norsktoppenRankMax = 10;
    config.request.filters.norsktoppenDebutWeekFrom = "1989-W20";
    config.request.filters.norsktoppenDebutWeekTo = "1989-W30";

    expect(countChartSourceFilters(config)).toBe(2);
    expect(countAdvancedChartControls(config)).toBe(baseline + 2);

    config.request.view = "albums";
    expect(countChartSourceFilters(config)).toBe(0);
  });
});
