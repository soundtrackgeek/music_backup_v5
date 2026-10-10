import { commands, type ReleaseRadar } from "../bindings";
import { isTauriRuntime } from "./tauriClient";
import { mockArtists } from "./webPreview";

export type { ReleaseRadar, RadarRelease, RadarArtist } from "../bindings";

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

let pending: Promise<ReleaseRadar> | null = null;
// Share simultaneous mounts (Daily Edition, full radar, artist page).
export function getReleaseRadar(refresh = false): Promise<ReleaseRadar> {
  if (pending) return pending;
  const request = isTauriRuntime() ? commands.getReleaseRadar(refresh) : Promise.resolve(previewRadar());
  pending = request;
  void request.finally(() => { if (pending === request) pending = null; }).catch(() => undefined);
  return request;
}

function previewRadar(): ReleaseRadar {
  const today = new Date();
  const day = (offset: number) => { const d = new Date(today); d.setDate(d.getDate() + offset); return dateKey(d); };
  const end = new Date(today); end.setDate(1); end.setMonth(end.getMonth() + 2); end.setDate(0);
  end.setDate(Math.min(today.getDate(), end.getDate()));
  const artists = mockArtists.slice(0, 3).map((artist) => ({ id: artist.id, name: artist.name, musicbrainzId: artist.musicBrainzMbid }));
  return {
    today: dateKey(today), upcomingUntil: dateKey(end), recentSince: day(-30), checkedAt: today.toISOString(),
    stale: false, warning: null, artistCount: 128, identifiedArtistCount: 124, unresolvedArtistIds: [],
    releases: [
      { releaseGroupId: "preview-release-1", title: "Signals from tomorrow", artist: artists[0].name, artists: [artists[0]], releaseDate: day(6), releaseType: "Album", secondaryType: null, musicbrainzUrl: "https://musicbrainz.org", owned: false, onWishList: false },
      { releaseGroupId: "preview-release-2", title: "After the lights", artist: artists[1].name, artists: [artists[1]], releaseDate: day(20), releaseType: "EP", secondaryType: null, musicbrainzUrl: "https://musicbrainz.org", owned: false, onWishList: true },
      { releaseGroupId: "preview-release-3", title: "A room of echoes", artist: artists[2].name, artists: [artists[2]], releaseDate: day(-3), releaseType: "Single", secondaryType: null, musicbrainzUrl: "https://musicbrainz.org", owned: false, onWishList: false },
    ],
  };
}
