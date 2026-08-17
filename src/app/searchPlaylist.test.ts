import { describe, expect, it } from "vitest";

import type { BrowseResponse, BrowseRow } from "../types";
import { createRequest } from "./requests";
import {
  createSearchPlaylistRequest,
  completePlaylistRequestLimit,
  localSearchPlaylistFromResponse,
} from "./searchPlaylist";

function trackRow(values: Partial<BrowseRow>): BrowseRow {
  return {
    trackId: 1,
    albumId: "album:1",
    album: "Holy Diver",
    albumArtistDisplay: "Dio",
    displayArtist: "Dio",
    title: "Stand Up and Shout",
    canonicalGenre: "Heavy Metal",
    year: 1983,
    trackSeconds: 198,
    normalizedRating: 90,
    love: "L",
    filePath: "Dio/Holy Diver",
    filename: "01 Stand Up and Shout.mp3",
    ...values,
  } as BrowseRow;
}

describe("local Search playlists", () => {
  it("requests the complete track scope without changing filters or sort", () => {
    const source = createRequest("albums");
    source.searchText = "Dio";
    source.filters.genres = ["Heavy Metal"];
    source.sort = { field: "albumScore", direction: "desc" };
    source.limit = 25;
    source.offset = 100;

    expect(createSearchPlaylistRequest(source)).toMatchObject({
      view: "tracks",
      searchText: "Dio",
      filters: { genres: ["Heavy Metal"] },
      sort: { field: "albumScore", direction: "desc" },
      limit: completePlaylistRequestLimit,
      offset: 0,
    });
  });

  it("builds a ready-to-review local draft in Search order", () => {
    const request = createSearchPlaylistRequest(createRequest("tracks"));
    const response = {
      view: "tracks",
      rows: [
        trackRow({}),
        trackRow({
          trackId: 2,
          title: "Holy Diver",
          trackSeconds: 341,
          normalizedRating: null,
          love: null,
          filename: "04 Holy Diver.mp3",
        }),
      ],
      total: 2,
      limit: completePlaylistRequestLimit,
      offset: 0,
    } satisfies BrowseResponse;

    const playlist = localSearchPlaylistFromResponse(
      "Search: Dio",
      request,
      response,
    );

    expect(playlist).toMatchObject({
      name: "Dio playlist",
      description: "2 matching tracks preserved in Search order.",
      model: "Local Search",
      targetTrackCount: 2,
      matchingTrackCount: 2,
      candidateCount: 2,
      totalSeconds: 539,
    });
    expect(playlist.tracks.map((track) => track.title)).toEqual([
      "Stand Up and Shout",
      "Holy Diver",
    ]);
    expect(playlist.tracks[0]).toMatchObject({ loved: true, rating: 90 });
  });
});
