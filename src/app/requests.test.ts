import { describe, expect, it } from "vitest";
import type { ChartConfig, SavedChart, SavedSearch } from "../types";
import {
  createRequest,
  deserializeBrowseRequest,
  normalizeSavedChartForClient,
  normalizeSavedSearchForClient,
  serializeBrowseRequest,
} from "./requests";

describe("browse request creation and serialization", () => {
  it("creates a complete album request with independent filter values", () => {
    const first = createRequest("albums");
    const second = createRequest("albums");

    first.filters.genres.push("Synthpop");

    expect(first).toMatchObject({
      view: "albums",
      searchText: "",
      sort: { field: "album", direction: "asc" },
      limit: 50,
      offset: 0,
    });
    expect(second.filters.genres).toEqual([]);
    expect(first.filters.artistDissolvedYearTo).toBeNull();
  });

  it("serializes and restores every active filter without losing defaults", () => {
    const request = createRequest("tracks");
    request.searchText = "Bowie";
    request.filters.genres = ["Art Rock"];
    request.filters.originCountryCodes = ["GB"];
    request.filters.artistBornYearFrom = 1940;
    request.filters.billboardSingleRankMax = 20;
    request.sort = { field: "billboardSingleRank", direction: "asc" };

    const serialized = serializeBrowseRequest(request);
    const restored = deserializeBrowseRequest(serialized);

    expect(JSON.parse(serialized)).toMatchObject({
      view: "tracks",
      filters: {
        genres: ["Art Rock"],
        originCountryCodes: ["GB"],
        artistBornYearFrom: 1940,
        billboardSingleRankMax: 20,
      },
    });
    expect(restored).toEqual(request);
  });
});

describe("saved search and chart normalization", () => {
  it("fills newly added browse fields in a legacy saved search", () => {
    const search = {
      id: 7,
      name: "Legacy tracks",
      view: "tracks",
      request: {
        view: "tracks",
        searchText: "single",
        filters: { genres: ["Pop"] },
      },
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    } as unknown as SavedSearch;

    const normalized = normalizeSavedSearchForClient(search);

    expect(normalized.view).toBe("tracks");
    expect(normalized.request.sort).toEqual({ field: "title", direction: "asc" });
    expect(normalized.request.filters.genres).toEqual(["Pop"]);
    expect(normalized.request.filters.originCountryCodes).toEqual([]);
    expect(normalized.request.filters.artistType).toBe("");
  });

  it("converts a legacy chart threshold and clamps its cover size", () => {
    const config = {
      ...({} as ChartConfig),
      request: createRequest("albums"),
      rankingMetric: "albumScore",
      sortDirection: "desc",
      resultLimit: 25,
      visibleColumns: [],
      exportColumns: [],
      viewMode: "grid",
      gridCoverSize: 9999,
      ratingCompletenessThreshold: 75,
      ratingCompletenessMin: undefined,
      ratingCompletenessMax: undefined,
    } as unknown as ChartConfig;
    const chart = {
      id: 9,
      name: "Legacy chart",
      config,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    } satisfies SavedChart;

    const normalized = normalizeSavedChartForClient(chart);

    expect(normalized.config.ratingCompletenessMin).toBe(75);
    expect(normalized.config.ratingCompletenessMax).toBe(100);
    expect(normalized.config.ratingCompletenessThreshold).toBeNull();
    expect(normalized.config.gridCoverSize).toBe(224);
    expect(normalized.config.request.view).toBe("albums");
  });
});
