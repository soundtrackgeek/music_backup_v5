import { describe, expect, it } from "vitest";

import {
  canonicalCountryCode,
  countryFlagCodeFromCode,
  countryNameFromCode,
  resolveCountryName,
} from "./countryNames";

describe("country names", () => {
  it("canonicalizes the UK alias to the ISO GB country code", () => {
    expect(canonicalCountryCode("UK")).toBe("GB");
    expect(canonicalCountryCode(" uk ")).toBe("GB");
    expect(canonicalCountryCode("gb")).toBe("GB");
    expect(countryFlagCodeFromCode("UK")).toBe("gb");
  });

  it("resolves the UK alias to the United Kingdom", () => {
    expect(countryNameFromCode("UK")).toBe("United Kingdom");
    expect(resolveCountryName("UK", "UK")).toBe("United Kingdom");
  });
});
