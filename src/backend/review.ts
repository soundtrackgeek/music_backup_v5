import { commands, type ReviewReport, type ReviewRequest } from "../bindings";
import { isTauriRuntime } from "./tauriClient";
export type { ReviewReport, ReviewMetrics, ReviewGenre } from "../bindings";

export async function getReview(request: ReviewRequest): Promise<ReviewReport> {
  if (isTauriRuntime()) return commands.reviewReport(request);
  const endAt = Math.min(request.endAt, Math.floor(Date.now() / 1000) + 1);
  if (endAt <= request.startAt)
    throw new Error("Choose a period that has already started.");
  const scale = Math.max(1, Math.round((endAt - request.startAt) / 86400));
  const row = {
    key: "review-m83",
    title: "Hurry Up, We're Dreaming",
    artist: "M83",
    artistId: "m83",
    artistDisambiguation: null,
    album: "Hurry Up, We're Dreaming",
    albumId: "sonic-m83",
    trackId: null,
    rating: 100,
    plays: scale * 3,
    lastPlayedAt: endAt - 3600,
    source: null,
  };
  const listening = {
    plays: scale * 28,
    matchedPlays: scale * 25,
    tracks: Math.min(scale * 6, 824),
    topTracks: [{ ...row, key: "901", title: "Midnight City", trackId: 901 }],
    topAlbums: [
      row,
      {
        ...row,
        key: "review-outrun",
        title: "OutRun",
        album: "OutRun",
        artist: "Kavinsky",
        artistId: "kavinsky",
        albumId: "sonic-outrun",
        plays: scale * 2,
      },
    ],
    topArtists: [
      { ...row, title: "M83", album: null, albumId: null, plays: scale * 7 },
    ],
    discovery: row,
    historySince: request.previousStartAt - 86400 * 365,
  };
  const current = {
    albumsAdded: Math.ceil(scale / 3),
    newArtists: Math.ceil(scale / 9),
    albumRatingsGiven: Math.ceil(scale / 2),
    newlyRatedTracks: scale * 5,
    completionChange: 0.027,
    listening,
  };
  const year = new Date((endAt - 1) * 1000).getUTCFullYear();
  return {
    ...request,
    endAt,
    activitySince: request.previousStartAt - 86400 * 365,
    current,
    previous: {
      ...current,
      albumsAdded: Math.ceil(scale / 4),
      newArtists: Math.ceil(scale / 12),
      albumRatingsGiven: Math.ceil(scale / 3),
      newlyRatedTracks: scale * 4,
      completionChange: 0.019,
      listening: {
        ...listening,
        plays: scale * 24,
        matchedPlays: scale * 21,
        tracks: Math.min(scale * 5, 700),
        topTracks: [],
        topAlbums: [],
        topArtists: [],
        discovery: null,
      },
    },
    topGenres: [
      { genre: "Synthpop", albums: Math.ceil(current.albumsAdded / 2) },
      { genre: "Dream Pop", albums: Math.floor(current.albumsAdded / 3) },
      {
        genre: "Electronic",
        albums:
          current.albumsAdded -
          Math.ceil(current.albumsAdded / 2) -
          Math.floor(current.albumsAdded / 3),
      },
    ],
    ratingChanges: [
      {
        albumId: "sonic-m83",
        album: row.title,
        artist: "M83",
        previous: 60,
        current: 100,
      },
    ],
    tasteDrift: Array.from({ length: 5 }, (_, i) => ({
      year: year - 4 + i,
      total: 100,
      genres: [
        { genre: "Synthpop", albums: 20 + i * 9 },
        { genre: "Dream Pop", albums: 45 - i * 5 },
        { genre: "Electronic", albums: 35 - i * 4 },
      ],
    })),
  };
}

export function downloadReviewBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function saveReviewPng(blob: Blob, name: string): Promise<string> {
  if (!isTauriRuntime()) {
    downloadReviewBlob(blob, name);
    return name;
  }
  return commands.reviewExportPng(
    Array.from(new Uint8Array(await blob.arrayBuffer())),
  );
}

export async function saveReviewMarkdown(
  markdown: string,
  title: string,
): Promise<string> {
  if (!isTauriRuntime()) {
    const name = `${title.replace(/[^a-z0-9]+/gi, "-")}.md`;
    downloadReviewBlob(
      new Blob([markdown], { type: "text/markdown;charset=utf-8" }),
      name,
    );
    return name;
  }
  return (await commands.exportAiMarkdown({ title, markdown })).path;
}
