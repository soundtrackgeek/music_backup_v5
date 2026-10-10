import { useCallback, useEffect, useRef, useState } from "react";
import { Clock3, Headphones, Library, ListMusic, RefreshCw, Save, Trash2 } from "lucide-react";
import { Metric } from "../../components/catalog/CatalogValues";
import {
  clearListeningSource,
  configureListeningSource,
  getListeningList,
  getListeningOverview,
  syncListeningSource,
  type ListeningList,
  type ListeningOverview,
  type ListeningRow,
  type ListeningSource,
  type ListeningSourceStatus,
} from "../../backend/listening";
import { formatNumber, formatPercent, formatTrackRating } from "../../app/display";
import "./ListeningHistory.css";

const LISTS: { id: ListeningList; label: string; description: string; periodic: boolean }[] = [
  { id: "topTracks", label: "Most played", description: "Library tracks with the most plays.", periodic: true },
  { id: "topAlbums", label: "Top albums", description: "Albums ranked by plays across their tracks.", periodic: true },
  { id: "topArtists", label: "Top artists", description: "Album artists ranked by plays.", periodic: true },
  { id: "recent", label: "Recent plays", description: "Every imported play, newest first.", periodic: true },
  { id: "rediscover", label: "Rediscover", description: "5★ tracks you have not played in three years.", periodic: false },
  { id: "neverPlayedFavorites", label: "Unplayed 5★", description: "5★ tracks with no play in your imported history.", periodic: false },
  { id: "leastPlayedAlbums", label: "Least played 4★+", description: "Albums rated 4★ or higher, fewest plays first.", periodic: false },
  { id: "unmatched", label: "Not in library", description: "Plays that match no library track.", periodic: true },
];

const PERIODS: { days: number | null; label: string }[] = [
  { days: null, label: "All time" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
  { days: 365, label: "Last 12 months" },
];

function formatPlayedAt(seconds: number | null | undefined) {
  if (seconds == null) return "Never";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(seconds * 1000));
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function ListeningHistory({ onOpenAlbum }: { onOpenAlbum: (albumId: string) => void }) {
  const [overview, setOverview] = useState<ListeningOverview | null>(null);
  const [list, setList] = useState<ListeningList>("topTracks");
  const [periodDays, setPeriodDays] = useState<number | null>(null);
  const [rows, setRows] = useState<ListeningRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const request = useRef(0);

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await getListeningOverview());
    } catch (loadError) {
      setError(errorText(loadError));
    }
  }, []);

  const loadRows = useCallback(async () => {
    const id = ++request.current;
    const selected = LISTS.find((entry) => entry.id === list);
    setLoadingRows(true);
    try {
      const next = await getListeningList(list, selected?.periodic ? periodDays : null, 100);
      if (id === request.current) setRows(next);
    } catch (loadError) {
      if (id === request.current) setError(errorText(loadError));
    } finally {
      if (id === request.current) setLoadingRows(false);
    }
  }, [list, periodDays]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);
  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  async function afterSourceChange(action: () => Promise<string | null>) {
    setError(null);
    setMessage(null);
    try {
      setMessage(await action());
      await Promise.all([loadOverview(), loadRows()]);
    } catch (actionError) {
      setError(errorText(actionError));
      void loadOverview();
    }
  }

  const selected = LISTS.find((entry) => entry.id === list) ?? LISTS[0];
  const matchedShare = overview && overview.totalPlays > 0 ? overview.matchedPlays / overview.totalPlays : null;
  const peakMonth = Math.max(1, ...(overview?.months.map((month) => month.plays) ?? [1]));
  const isAlbumList = list === "topAlbums" || list === "leastPlayedAlbums";
  const isArtistList = list === "topArtists";

  return (
    <div className="listening-history">
      <section className="metric-grid" aria-label="Listening summary">
        <Metric label="Plays" value={formatNumber(overview?.totalPlays ?? 0)} tone="teal" icon={Headphones} />
        <Metric
          label="Matched to library"
          value={matchedShare == null ? "–" : formatPercent(matchedShare)}
          tone="amber"
          icon={Library}
        />
        <Metric label="Tracks played" value={formatNumber(overview?.playedTracks ?? 0)} icon={ListMusic} />
        <Metric label="Last 30 days" value={formatNumber(overview?.playsLast30Days ?? 0)} icon={Clock3} />
      </section>

      {error ? <p className="error-message" role="alert">{error}</p> : null}
      {message ? <p className="listening-message" role="status">{message}</p> : null}

      <section className="stats-panel listening-sources" aria-label="Listening sources">
        <div className="panel-heading compact">
          <div>
            <h2>Sources</h2>
            <p>
              Plays are imported read-only and matched to library tracks by artist and title. A play reported by
              two sources within ten minutes is counted once.
            </p>
          </div>
          <Headphones size={18} />
        </div>
        <div className="listening-source-grid">
          {overview?.sources.map((source) => (
            <ListeningSourceCard
              key={source.source}
              source={source}
              onSave={(username, token, clearToken) =>
                afterSourceChange(async () => {
                  setOverview(await configureListeningSource({ source: source.source, username, token, clearToken }));
                  return `${source.label} account saved.`;
                })
              }
              onSync={() => afterSourceChange(async () => (await syncListeningSource(source.source)).message)}
              onClear={() =>
                afterSourceChange(async () => {
                  setOverview(await clearListeningSource(source.source));
                  return `${source.label} plays removed.`;
                })
              }
            />
          ))}
        </div>
      </section>

      {overview && overview.months.length > 0 ? (
        <section className="stats-panel" aria-label="Plays per month">
          <div className="panel-heading compact">
            <div>
              <h2>Plays per month</h2>
              <p>
                {formatNumber(overview.playsLast365Days)} plays in the last 12 months · history since{" "}
                {formatPlayedAt(overview.firstPlayedAt)}
              </p>
            </div>
          </div>
          <ol className="listening-months">
            {overview.months.map((month) => (
              <li key={month.month} title={`${month.month}: ${formatNumber(month.plays)} plays`}>
                <span className="listening-month-bar" style={{ height: `${Math.max(4, (month.plays / peakMonth) * 100)}%` }} />
                <span className="listening-month-label">{month.month.slice(2)}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="stats-panel listening-lists" aria-label="Listening insights">
        <div className="listening-list-tabs" role="tablist" aria-label="Listening lists">
          {LISTS.map((entry) => (
            <button key={entry.id} type="button" role="tab" aria-selected={entry.id === list} onClick={() => setList(entry.id)}>
              {entry.label}
            </button>
          ))}
        </div>
        <div className="listening-list-toolbar">
          <p>{selected.description}</p>
          {selected.periodic ? (
            <label>
              <span>Period</span>
              <select
                aria-label="Listening period"
                value={periodDays ?? ""}
                onChange={(event) => setPeriodDays(event.target.value ? Number(event.target.value) : null)}
              >
                {PERIODS.map((period) => (
                  <option key={period.label} value={period.days ?? ""}>
                    {period.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        {loadingRows && rows.length === 0 ? <p>Loading…</p> : null}
        {!loadingRows && rows.length === 0 ? (
          <p className="listening-empty">
            {overview?.totalPlays ? "Nothing to show for this list yet." : "Add a source above and sync to import your plays."}
          </p>
        ) : null}
        {rows.length > 0 ? (
          <table className="listening-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">{isAlbumList ? "Album" : isArtistList ? "Artist" : "Title"}</th>
                {isArtistList ? null : <th scope="col">Artist</th>}
                {isAlbumList || isArtistList ? null : <th scope="col">Album</th>}
                {isArtistList ? null : <th scope="col">Rating</th>}
                <th scope="col">{list === "recent" ? "Source" : "Plays"}</th>
                <th scope="col">{list === "recent" ? "Played" : "Last played"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.key}>
                  <td>{index + 1}</td>
                  <td>{row.title}</td>
                  {isArtistList ? null : <td>{row.artist}</td>}
                  {isAlbumList || isArtistList ? null : (
                    <td>
                      {row.albumId ? (
                        <button type="button" className="listening-link" onClick={() => onOpenAlbum(row.albumId!)}>
                          {row.album}
                        </button>
                      ) : (
                        row.album
                      )}
                    </td>
                  )}
                  {isArtistList ? null : (
                    <td>
                      {isAlbumList && row.albumId ? (
                        <button
                          type="button"
                          className="listening-link"
                          aria-label={`Open ${row.title}`}
                          onClick={() => onOpenAlbum(row.albumId!)}
                        >
                          {row.rating == null ? "Open" : `${formatTrackRating(row.rating)}★`}
                        </button>
                      ) : row.rating == null ? (
                        ""
                      ) : (
                        `${formatTrackRating(row.rating)}★`
                      )}
                    </td>
                  )}
                  <td>{list === "recent" ? row.source : formatNumber(row.plays)}</td>
                  <td>{formatPlayedAt(row.lastPlayedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>
    </div>
  );
}

function ListeningSourceCard({
  source,
  onSave,
  onSync,
  onClear,
}: {
  source: ListeningSourceStatus;
  onSave: (username: string, token: string | null, clearToken: boolean) => Promise<void>;
  onSync: () => Promise<void>;
  onClear: () => Promise<void>;
}) {
  const [username, setUsername] = useState(source.username);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<"save" | "sync" | "clear" | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => setUsername(source.username), [source.username]);

  async function run(action: "save" | "sync" | "clear", task: () => Promise<void>) {
    setBusy(action);
    setConfirmClear(false);
    try {
      await task();
      if (action === "save") setToken("");
    } finally {
      setBusy(null);
    }
  }

  const isAurora = source.source === "aurora";
  const usernameChanged = username.trim() !== source.username;
  return (
    <article className="listening-source" aria-label={`${source.label} listening source`}>
      <header>
        <strong>{source.label}</strong>
        <span>
          {formatNumber(source.plays)} plays
          {source.lastSyncedAt ? ` · updated ${new Date(source.lastSyncedAt).toLocaleString()}` : ""}
        </span>
      </header>
      {isAurora ? (
        <p>Aurora sends plays to Music Library through the bridge. No account is needed.</p>
      ) : (
        <>
          <label className="criterion">
            <span>User name</span>
            <input
              aria-label={`${source.label} user name`}
              value={username}
              spellCheck={false}
              disabled={busy !== null}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          {source.source === "listenbrainz" ? (
            <label className="criterion">
              <span>User token (optional)</span>
              <input
                type="password"
                aria-label="ListenBrainz user token"
                autoComplete="new-password"
                value={token}
                placeholder={source.tokenConfigured ? "Stored in the system keychain" : "Only needed for private listens"}
                disabled={busy !== null}
                onChange={(event) => setToken(event.target.value)}
              />
            </label>
          ) : (
            <p className="listening-note">Uses the Last.fm API key from Settings › Providers.</p>
          )}
        </>
      )}
      {source.lastError ? <p className="error-message">{source.lastError}</p> : null}
      <div className="listening-source-actions">
        {isAurora ? null : (
          <>
            <button
              type="button"
              className="secondary-button"
              disabled={busy !== null || (!usernameChanged && !token.trim())}
              onClick={() => void run("save", () => onSave(username, token.trim() || null, false))}
            >
              <Save size={16} />
              <span>{busy === "save" ? "Saving" : "Save"}</span>
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={busy !== null || !source.username || usernameChanged}
              onClick={() => void run("sync", onSync)}
            >
              <RefreshCw size={16} />
              <span>{busy === "sync" ? "Syncing" : source.newestPlayedAt ? "Sync new plays" : "Import history"}</span>
            </button>
          </>
        )}
        {source.source === "listenbrainz" && source.tokenConfigured ? (
          <button
            type="button"
            className="secondary-button"
            disabled={busy !== null}
            onClick={() => void run("save", () => onSave(source.username, null, true))}
          >
            <span>Forget token</span>
          </button>
        ) : null}
        <button
          type="button"
          className="secondary-button"
          disabled={busy !== null || source.plays === 0}
          aria-label={confirmClear ? `Confirm removing ${formatNumber(source.plays)} ${source.label} plays` : undefined}
          onClick={() => (confirmClear ? void run("clear", onClear) : setConfirmClear(true))}
        >
          <Trash2 size={16} />
          <span>
            {busy === "clear" ? "Removing" : confirmClear ? `Remove ${formatNumber(source.plays)} plays?` : "Remove plays"}
          </span>
        </button>
      </div>
    </article>
  );
}
