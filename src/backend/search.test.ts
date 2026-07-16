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
});
