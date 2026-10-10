import {
  commands,
  type ListeningList,
  type ListeningOverview,
  type ListeningRow,
  type ListeningSource,
  type ListeningSourceRequest,
  type ListeningSyncResult,
} from "../bindings";
import { isTauriRuntime } from "./tauriClient";
import { previewActivity } from "./activity";
export type {
  ListeningList,
  ListeningOverview,
  ListeningRow,
  ListeningSource,
  ListeningSourceStatus,
  ListeningSyncResult,
} from "../bindings";

const DAY = 86_400;
const previewNow = () => Math.floor(Date.now() / 1000);
const previewUsers: Record<ListeningSource, string> = { lastfm: "", listenbrainz: "", aurora: "" };
let previewSynced = false;

const previewRows: ListeningRow[] = [
  { key: "901", title: "Midnight City", artist: "M83", album: "Hurry Up, We're Dreaming", albumId: "sonic-m83", trackId: 901, rating: 100, plays: 87, lastPlayedAt: null, source: null },
  { key: "903", title: "Nightcall", artist: "Kavinsky", album: "OutRun", albumId: "sonic-outrun", trackId: 903, rating: 80, plays: 54, lastPlayedAt: null, source: null },
  { key: "902", title: "A Real Hero", artist: "College & Electric Youth", album: "Drive", albumId: "sonic-drive", trackId: 902, rating: 100, plays: 12, lastPlayedAt: null, source: null },
];

function previewOverview(): ListeningOverview {
  const now = previewNow();
  const months = Array.from({ length: 12 }, (_, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() - 11 + index);
    return { month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`, plays: 120 + ((index * 37) % 90) };
  });
  const sources = (["lastfm", "listenbrainz", "aurora"] as const).map((source) => ({
    source,
    label: source === "lastfm" ? "Last.fm" : source === "listenbrainz" ? "ListenBrainz" : "Aurora",
    username: previewUsers[source],
    tokenConfigured: false,
    plays: previewSynced && source === "lastfm" ? 1_842 : 0,
    newestPlayedAt: previewSynced && source === "lastfm" ? now - 3600 : null,
    lastSyncedAt: previewSynced && source === "lastfm" ? new Date().toISOString() : null,
    lastError: null,
  }));
  if (!previewSynced) {
    return { sources, totalPlays: 0, matchedPlays: 0, playedTracks: 0, firstPlayedAt: null, lastPlayedAt: null, playsLast30Days: 0, playsLast365Days: 0, months: [] };
  }
  return {
    sources,
    totalPlays: 1_842,
    matchedPlays: 1_701,
    playedTracks: 644,
    firstPlayedAt: now - 700 * DAY,
    lastPlayedAt: now - 3600,
    playsLast30Days: 158,
    playsLast365Days: 1_204,
    months,
  };
}

export async function getListeningOverview(): Promise<ListeningOverview> {
  return isTauriRuntime() ? commands.listeningOverview() : previewOverview();
}

export async function getListeningList(list: ListeningList, periodDays: number | null, limit = 50): Promise<ListeningRow[]> {
  if (isTauriRuntime()) return commands.listeningList({ list, periodDays, limit });
  if (!previewSynced) return [];
  const now = previewNow();
  const rows = previewRows.map((row, index) => ({ ...row, lastPlayedAt: now - (index + 1) * 5 * DAY }));
  if (list === "rediscover") return [{ ...rows[2], lastPlayedAt: now - 1_300 * DAY }];
  if (list === "neverPlayedFavorites" || list === "leastPlayedAlbums") return rows.slice(2).map((row) => ({ ...row, plays: 0, lastPlayedAt: null }));
  if (list === "unmatched") return [{ key: "outside", title: "Song You Streamed", artist: "Outside Artist", album: null, albumId: null, trackId: null, rating: null, plays: 9, lastPlayedAt: now - DAY, source: null }];
  if (list === "recent") return rows.map((row) => ({ ...row, plays: 1, source: "lastfm" }));
  return rows.slice(0, limit);
}

export async function configureListeningSource(request: ListeningSourceRequest): Promise<ListeningOverview> {
  if (isTauriRuntime()) return commands.listeningConfigureSource(request);
  previewUsers[request.source] = request.username.trim();
  return previewOverview();
}

export async function clearListeningSource(source: ListeningSource): Promise<ListeningOverview> {
  if (isTauriRuntime()) return commands.listeningClearSource(source);
  previewSynced = false;
  return previewOverview();
}

export async function syncListeningSource(source: ListeningSource): Promise<ListeningSyncResult> {
  if (isTauriRuntime()) return commands.listeningSync(source);
  previewSynced = true;
  previewActivity("listeningSync", "Listening history sync", "completed", 1, 1);
  return { source, fetched: 1_842, inserted: 1_842, duplicates: 0, totalPlays: 1_842, matchedPlays: 1_701, message: "Browser preview: 1,842 new plays, 0 already known. 1701 of 1842 plays match library tracks." };
}
