import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CalendarDays, ExternalLink, Plus, RefreshCw, Radio } from "lucide-react";
import { getReleaseRadar, type ReleaseRadar, type RadarRelease } from "../backend/releaseRadar";
import { addWishListItem, isTauriRuntime, openExternalUrl } from "../backend";
import { VirtualList } from "./VirtualList";
import "./NewReleases.css";

type View = "upcoming" | "recent" | "weekly";

export function radarReleases(radar: ReleaseRadar, view: View, artistId?: string) {
  const weeklyEnd = new Date(`${radar.today}T12:00:00`);
  weeklyEnd.setDate(weeklyEnd.getDate() + 7);
  const key = `${weeklyEnd.getFullYear()}-${String(weeklyEnd.getMonth() + 1).padStart(2, "0")}-${String(weeklyEnd.getDate()).padStart(2, "0")}`;
  return radar.releases.filter((row) =>
    (!artistId || row.artists.some((artist) => artist.id === artistId)) &&
    (view === "recent" ? row.releaseDate < radar.today : row.releaseDate >= radar.today) &&
    (view !== "weekly" || row.releaseDate <= key),
  ).sort((a, b) => view === "recent" ? b.releaseDate.localeCompare(a.releaseDate) : a.releaseDate.localeCompare(b.releaseDate));
}

function displayDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function useRadarResource(available: boolean) {
  const [radar, setRadar] = useState<ReleaseRadar | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    const request = ++generation.current;
    if (available) {
      setLoading(true);
      void getReleaseRadar().then((next) => { if (generation.current === request) { setRadar(next); setError(null); } })
        .catch((e: unknown) => { if (generation.current === request) setError(String(e)); })
        .finally(() => { if (generation.current === request) setLoading(false); });
    }
    return () => { generation.current++; };
  }, [available]);

  async function refresh() {
    const request = ++generation.current;
    setLoading(true); setError(null);
    try { const next = await getReleaseRadar(true); if (generation.current === request) setRadar(next); }
    catch (e) { if (generation.current === request) setError(String(e)); }
    finally { if (generation.current === request) setLoading(false); }
  }
  return { radar, setRadar, loading, error, setError, refresh };
}

const RadarContext = createContext<ReturnType<typeof useRadarResource> | null>(null);
export function ReleaseRadarProvider({ available, children }: { available: boolean; children: ReactNode }) {
  const resource = useRadarResource(available);
  return <RadarContext value={resource}>{children}</RadarContext>;
}

export function NewReleases({ artistId, artistName, onOpenArtist, available = true, compact = false }: {
  artistId?: string;
  artistName?: string;
  onOpenArtist?: (id: string, name: string) => void;
  available?: boolean;
  compact?: boolean;
}) {
  const shared = useContext(RadarContext);
  const local = useRadarResource(available && !shared);
  const { radar, setRadar, loading, error, setError, refresh } = shared ?? local;
  const [view, setView] = useState<View>("upcoming");
  const [type, setType] = useState("all");
  const [query, setQuery] = useState("");
  const [hideOwned, setHideOwned] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const label = compact ? "New & upcoming" : artistName ? `${artistName} new releases` : "New Releases";

  async function add(row: RadarRelease) {
    setAdding(row.releaseGroupId); setNotice(null); setError(null);
    try {
      await addWishListItem({ entity: "album", title: row.title, artist: row.artist, year: Number(row.releaseDate.slice(0, 4)),
        musicbrainzId: row.releaseGroupId, musicbrainzUrl: row.musicbrainzUrl, source: "New-release radar" });
      if (!mounted.current) return;
      setRadar((current) => current && ({ ...current, releases: current.releases.map((item) =>
        item.releaseGroupId === row.releaseGroupId ? { ...item, onWishList: true } : item) }));
      setNotice(`${row.title} added to Wish List.`);
    } catch (e) { if (mounted.current) setError(String(e)); }
    finally { if (mounted.current) setAdding(null); }
  }

  const all = radar ? compact ? radar.releases : radarReleases(radar, view, artistId) : [];
  const filtered = all.filter((row) => (!hideOwned || !row.owned) && (type === "all" || row.releaseType === type) &&
    `${row.artist} ${row.title}`.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()));
  const rows = compact ? filtered.filter((row) => row.releaseDate >= (radar?.today ?? "")).slice(0, 4) : filtered;

  return <section className="new-releases discovery-panel" aria-label={label}>
    <header className="panel-heading compact">
      <div><h2><Radio size={20} aria-hidden="true" />{label}</h2>
        <p>New &amp; upcoming music from {artistName ?? "every artist in your library and your Wish List"}.</p></div>
      <button className="secondary-button" type="button" onClick={() => void refresh()} disabled={loading || !available || adding !== null} aria-label="Refresh new releases">
        <RefreshCw size={16} aria-hidden="true" />{loading ? "Checking releases…" : "Refresh"}</button>
    </header>
    {!isTauriRuntime() && <p className="new-releases-note">Web preview · illustrative releases, not real announcements.</p>}
    {!available ? <p className="empty-state">Import a library to check your artists.</p> : <>
      {!compact && <><div className="new-releases-tabs" role="group" aria-label="Release window">
        {([["upcoming", "Coming soon"], ["recent", "Recently released"], ["weekly", "Weekly digest"]] as const).map(([id, title]) =>
          <button type="button" key={id} aria-pressed={view === id} onClick={() => setView(id)}>{title}</button>)}
      </div>
      <div className="new-releases-filters">
        <label>Search releases<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Artist or release title" /></label>
        <label>Release type<select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="all">All types</option><option>Album</option><option>EP</option><option>Single</option><option>Other</option>
        </select></label>
        <label className="toggle-row"><input type="checkbox" checked={hideOwned} onChange={(e) => setHideOwned(e.target.checked)} />Hide owned releases</label>
      </div>
      </>}
      {radar && <p className="new-releases-note">
        {view === "recent" ? `Last 30 days · ${displayDate(radar.recentSince)}–${displayDate(radar.today)}` : view === "weekly" ? "Your releases for the next seven days" : `Through ${displayDate(radar.upcomingUntil)} · up to one month ahead`}
        {` · ${rows.length.toLocaleString()} ${rows.length === 1 ? "release" : "releases"}`}
      </p>}
      {loading && <p role="status">Checking the release feed and artist identities…</p>}
      {error && <p className="error-message" role="alert">{error}</p>}
      {radar?.warning && <p className="error-message" role="alert">{radar.warning}</p>}
      {radar?.stale && <p className="new-releases-note">Showing saved results{radar.checkedAt ? ` from ${new Date(radar.checkedAt).toLocaleString()}` : " when available"}. Refresh to try again.</p>}
      {notice && <p role="status">{notice}</p>}
      <VirtualList items={rows} getKey={(row) => row.releaseGroupId} className="new-releases-list" estimateSize={112} resetKey={`${view}:${type}:${query}:${artistId ?? "all"}:${hideOwned}`}
        renderItem={(row) => <article className="new-release-row">
          <div className="new-release-date"><CalendarDays size={18} aria-hidden="true" /><time dateTime={row.releaseDate}>{displayDate(row.releaseDate)}</time></div>
          <div className="new-release-title"><h3>{row.title}</h3><p>{row.artist}</p><span>{[row.releaseType, row.secondaryType].filter(Boolean).join(" · ")}</span>
            {onOpenArtist && <div>{row.artists.map((artist) => <button className="text-button" type="button" key={artist.id}
              onClick={() => onOpenArtist(artist.id, artist.name)}>View {artist.name}</button>)}</div>}</div>
          <div className="new-release-actions">
            <button className="secondary-button" type="button" aria-label={`Open ${row.title} on MusicBrainz`} onClick={() => void openExternalUrl(row.musicbrainzUrl).catch((e: unknown) => setError(String(e)))}><ExternalLink size={16} />MusicBrainz</button>
            <button className="secondary-button" type="button" onClick={() => void add(row)} disabled={adding !== null || loading || row.owned || row.onWishList}>
              <Plus size={16} />{row.owned ? "Owned" : row.onWishList ? "On Wish List" : adding === row.releaseGroupId ? "Adding…" : "Add to Wish List"}</button>
          </div>
        </article>} />
      {!loading && rows.length === 0 && <p className="empty-state">{artistId && radar?.unresolvedArtistIds.includes(artistId) ? "This artist needs a MusicBrainz identity. Link the artist in Artist info to check their releases." : radar?.stale && !radar.checkedAt ? "The release feed is unavailable. Try Refresh." : query || type !== "all" ? "No releases match these filters." : "No announced releases found in this window."}</p>}
      {compact && <a className="text-button" href="#discovery-new-releases">See all new releases and your weekly digest</a>}
      {radar && !compact && <footer className="new-releases-note">
        {radar.identifiedArtistCount.toLocaleString()} of {radar.artistCount.toLocaleString()} watched artists have a MusicBrainz identity.
        {radar.identifiedArtistCount < radar.artistCount && " Unresolved or ambiguous names need an artist link in Artists → Artist info. Exact feed candidates are checked automatically on refresh."}
        {radar.checkedAt && ` Last checked ${new Date(radar.checkedAt).toLocaleString()}.`}
        {" Dates and availability depend on announcements recorded in "}<a href="https://listenbrainz.org/explore/fresh-releases/" target="_blank" rel="noreferrer">ListenBrainz / MusicBrainz</a>.
      </footer>}
    </>}
  </section>;
}
