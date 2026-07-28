import { afterEach, describe, expect, it, vi } from "vitest";

import { createRequest } from "../app/requests";
import { searchLibrary } from "../backend";

describe("web preview library search", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("randomizes results locally when requested", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const request = createRequest("albums");
    request.sort = { field: "random", direction: "asc" };

    const response = await searchLibrary(request);

    expect(response.total).toBeGreaterThan(1);
    expect(response.rows[0]?.album).not.toBe("Actually");
    expect(response.rows.map((row) => row.album)).toContain("Actually");
  });

  it("filters albums by their Billboard debut week", async () => {
    const request = createRequest("albums");
    request.filters.billboardDebutWeekFrom = "1987-W01";
    request.filters.billboardDebutWeekTo = "1987-W53";

    const response = await searchLibrary(request);

    expect(response.rows.map((row) => row.album)).toEqual(["Actually"]);
  });

  it("filters tracks by their exact Billboard chart-entry dates", async () => {
    const request = createRequest("tracks");
    request.filters.billboardSingleDebutDateFrom = "1987-01-01";
    request.filters.billboardSingleDebutDateTo = "1987-12-31";
    request.sort = { field: "billboardSingleDebut", direction: "asc" };

    const response = await searchLibrary(request);

    expect(response.rows.length).toBeGreaterThan(0);
    expect(response.rows.every((row) => row.trackId !== null)).toBe(true);
    expect(
      response.rows.every(
        (row) =>
          row.billboardSingleDebutDate !== null &&
          row.billboardSingleDebutDate >= "1987-01-01" &&
          row.billboardSingleDebutDate <= "1987-12-31",
      ),
    ).toBe(true);
  });
});
