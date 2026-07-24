import { describe, expect, it } from "vitest";

import { createChartConfig } from "./requests";
import { countAdvancedChartControls } from "./chartProgressive";

describe("progressive Charts control summary", () => {
  it("does not count the six common chart controls as advanced", () => {
    const config = createChartConfig();
    const baseline = countAdvancedChartControls(config);

    config.rankingMetric = "lovedTracks";
    config.sortDirection = "asc";
    config.resultLimit = 25;
    config.request.filters.genres = ["Synthpop"];
    config.request.filters.yearFrom = 1980;
    config.request.filters.yearTo = 1989;

    expect(countAdvancedChartControls(config)).toBe(baseline);
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
});
