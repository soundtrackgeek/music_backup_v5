const MUSICBRAINZ_PATH_PREFIXES = [
  "/artist/",
  "/release-group/",
  "/recording/",
] as const;

export function normalizeAllowedExternalUrl(url: string) {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("Invalid external URL.");
  }

  const isAllowedMusicBrainzUrl =
    parsedUrl.origin === "https://musicbrainz.org" &&
    MUSICBRAINZ_PATH_PREFIXES.some((prefix) =>
      parsedUrl.pathname.startsWith(prefix),
    );
  const isAllowedDeezerAlbumUrl =
    parsedUrl.origin === "https://www.deezer.com" &&
    /^\/album\/\d+\/?$/.test(parsedUrl.pathname);

  if (!isAllowedMusicBrainzUrl && !isAllowedDeezerAlbumUrl) {
    throw new Error(
      "Only supported MusicBrainz pages and numeric Deezer album URLs can be opened from this view.",
    );
  }

  return parsedUrl.toString();
}
