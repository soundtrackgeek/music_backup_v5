import { describe, expect, it } from "vitest";

import { normalizeAllowedExternalUrl } from "./externalUrl";

describe("external URL policy", () => {
  it("allows supported MusicBrainz pages and numeric Deezer albums", () => {
    expect(
      normalizeAllowedExternalUrl(
        "https://musicbrainz.org/release-group/1234?source=wish-list",
      ),
    ).toBe("https://musicbrainz.org/release-group/1234?source=wish-list");
    expect(
      normalizeAllowedExternalUrl("https://www.deezer.com/album/123456"),
    ).toBe("https://www.deezer.com/album/123456");
  });

  it("rejects lookalike hosts, non-HTTPS URLs, and non-numeric album paths", () => {
    for (const url of [
      "https://www.deezer.com.evil.example/album/123456",
      "http://www.deezer.com/album/123456",
      "https://www.deezer.com/album/not-a-number",
      "https://www.deezer.com/artist/123456",
    ]) {
      expect(() => normalizeAllowedExternalUrl(url)).toThrow(
        /Only supported MusicBrainz pages and numeric Deezer album URLs/,
      );
    }
  });
});
