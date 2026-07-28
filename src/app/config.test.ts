import { describe, expect, it } from "vitest";

import { searchTableColumnLabel, searchTableColumnOptions } from "./config";

describe("Search table column options", () => {
  it("offers both Billboard singles columns with explicit source labels", () => {
    expect(searchTableColumnOptions).toEqual(
      expect.arrayContaining([
        { value: "billboardSingle", label: "Billboard single" },
        {
          value: "billboardSingleDebut",
          label: "Billboard single debut",
        },
      ]),
    );
  });

  it("distinguishes album-level Billboard columns in Tracks view", () => {
    const albumRank = searchTableColumnOptions.find(
      (option) => option.value === "billboard",
    );
    const albumDebut = searchTableColumnOptions.find(
      (option) => option.value === "billboardDebut",
    );

    expect(albumRank && searchTableColumnLabel(albumRank, "tracks")).toBe(
      "Album Billboard",
    );
    expect(albumDebut && searchTableColumnLabel(albumDebut, "tracks")).toBe(
      "Album Billboard debut",
    );
  });
});
