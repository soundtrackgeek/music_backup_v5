import { describe, expect, it } from "vitest";

import { externalDiscoveryMarkdown } from "./aiMarkdownExport";
import type { ExternalDiscoveryResponse } from "./types";

describe("external discovery Markdown", () => {
  it("exports an inclusive requested year range", () => {
    const response: ExternalDiscoveryResponse = {
      prompt: "Find 5 AOR albums from the 80s",
      title: "1980s AOR Albums",
      summary: "Five AOR albums from the 1980s.",
      plan: {
        prompt: "Find 5 AOR albums from the 80s",
        entity: "album",
        count: 5,
        year: 0,
        yearFrom: 1980,
        yearTo: 1989,
        yearMeaning: "releaseYear",
        genres: ["AOR"],
        countries: [],
        keywords: "",
        title: "1980s AOR Albums",
        summary: "Five AOR albums from the 1980s.",
        model: "gpt-5.6-luna",
        usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null },
      },
      items: [
        {
          id: "release-group-1",
          entity: "album",
          title: "Example Album",
          artist: "Example Artist",
          anchor: null,
          year: 1984,
          country: null,
          itemType: "Album",
          tags: ["aor"],
          score: 100,
          evidence: "MusicBrainz verifies this album's first release in 1984.",
          url: "https://musicbrainz.org/release-group/release-group-1",
        },
      ],
      source: "MusicBrainz",
      fetchedAt: "2026-07-26T18:00:00Z",
      catalogCandidateCount: 60,
      excludedOwnedCount: 3,
      limitations: [],
    };

    expect(externalDiscoveryMarkdown(response.title, response)).toContain(
      "- Year: 1980–1989",
    );
  });
});
