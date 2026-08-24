import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileClock,
  MinusCircle,
  Pencil,
  PlusCircle,
  RotateCcw,
  Search,
  Star,
  UsersRound,
} from "lucide-react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { listLibraryUpdateArtists, listLibraryUpdates } from "../backend";
import type {
  LibraryUpdate,
  LibraryUpdateArtistResponse,
  LibraryUpdateArtistSummary,
  LibraryUpdateKind,
  LibraryUpdateResponse,
  NewLibraryArtist,
} from "../types";

type UpdatesWorkspaceProps = {
  catalogRefreshKey?: number;
  selectedUpdateId: number | null;
  onSelectUpdate: (update: LibraryUpdate | null) => void;
  onOpenArtist: (artistName: string) => void;
};

type UpdateDateRange = "all" | "today" | "7d" | "30d" | "365d";
type UpdatesView = "activity" | "artists";

const PAGE_SIZE = 50;

const emptyResponse: LibraryUpdateResponse = {
  rows: [],
  total: 0,
  summary: { all: 0, new: 0, changed: 0, removed: 0 },
  limit: PAGE_SIZE,
  offset: 0,
};

const emptyArtistResponse: LibraryUpdateArtistResponse = {
  rows: [],
  newArtists: [],
  total: 0,
  summary: { all: 0, new: 0, changed: 0, removed: 0 },
  limit: PAGE_SIZE,
  offset: 0,
};

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function formatUpdateDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(new Date(value));
}

function formatUpdateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatUpdateTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function dateFromRange(range: UpdateDateRange) {
  if (range === "all") return null;
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  if (range !== "today") {
    const days = range === "7d" ? 7 : range === "30d" ? 30 : 365;
    date.setDate(date.getDate() - (days - 1));
  }
  return date.toISOString();
}

function updateGroupKey(update: LibraryUpdate) {
  const date = new Date(update.createdAt);
  const localDate = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  return `${localDate}\u001f${update.sourceLabel}`;
}

function UpdateStatus({ update }: { update: LibraryUpdate }) {
  if (update.category === "ratings") {
    return (
      <span className="update-status update-status-ratings">
        <Star size={16} aria-hidden="true" />
        <span>Ratings</span>
      </span>
    );
  }
  if (update.changeKind === "new") {
    return (
      <span className="update-status update-status-new">
        <PlusCircle size={16} aria-hidden="true" />
        <span>New</span>
      </span>
    );
  }
  if (update.changeKind === "removed") {
    return (
      <span className="update-status update-status-removed">
        <MinusCircle size={16} aria-hidden="true" />
        <span>Removed</span>
      </span>
    );
  }
  return (
    <span className="update-status update-status-changed">
      <Pencil size={16} aria-hidden="true" />
      <span>Changed</span>
    </span>
  );
}

function UpdateDescription({ update }: { update: LibraryUpdate }) {
  if (
    update.changeKind === "changed" &&
    update.fieldLabel &&
    update.previousValue != null &&
    update.currentValue != null &&
    update.category === "metadata"
  ) {
    return (
      <span className="update-description update-description-values">
        <span>{update.fieldLabel} changed from</span>
        <del>{update.previousValue}</del>
        <span>to</span>
        <ins>{update.currentValue}</ins>
      </span>
    );
  }
  return <span className="update-description">{update.description}</span>;
}

function UpdateArtistLink({
  artistName,
  onOpenArtist,
}: {
  artistName: string | null;
  onOpenArtist: (artistName: string) => void;
}) {
  const displayName = artistName?.trim();
  if (!displayName) {
    return <strong>Unknown artist</strong>;
  }

  return (
    <button
      className="update-artist-link"
      type="button"
      aria-label={`Open ${displayName} in Artists`}
      onClick={() => onOpenArtist(displayName)}
    >
      <strong>{displayName}</strong>
    </button>
  );
}

function SummaryButton({
  label,
  count,
  kind,
  activeKind,
  onSelect,
}: {
  label: string;
  count: number;
  kind: LibraryUpdateKind | null;
  activeKind: LibraryUpdateKind | null;
  onSelect: (kind: LibraryUpdateKind | null) => void;
}) {
  const Icon =
    kind === "new"
      ? PlusCircle
      : kind === "removed"
        ? MinusCircle
        : kind === "changed"
          ? Pencil
          : FileClock;
  return (
    <button
      className={`update-summary-item update-summary-${kind ?? "all"}`}
      type="button"
      aria-pressed={activeKind === kind}
      onClick={() => onSelect(kind)}
    >
      <span className="update-summary-icon" aria-hidden="true">
        <Icon size={19} />
      </span>
      <span>
        <small>{label}</small>
        <strong>{formatNumber(count)}</strong>
      </span>
    </button>
  );
}

function countLabel(count: number, singular: string, plural: string) {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

function artistUpdateHeadline(artist: LibraryUpdateArtistSummary) {
  const impactKinds = [
    artist.tracksAdded > 0,
    artist.tracksRemoved > 0,
    artist.otherChanges > 0,
  ].filter(Boolean).length;
  if (impactKinds === 1 && artist.tracksAdded > 0) {
    return countLabel(artist.tracksAdded, "track added", "tracks added");
  }
  if (impactKinds === 1 && artist.tracksRemoved > 0) {
    return countLabel(
      artist.tracksRemoved,
      "track removed",
      "tracks removed",
    );
  }
  if (artist.totalChanges > 0) {
    return countLabel(artist.totalChanges, "change", "changes");
  }
  if (artist.albumsAdded > 0 && artist.albumsDeleted === 0) {
    return countLabel(artist.albumsAdded, "album added", "albums added");
  }
  return countLabel(
    artist.albumsDeleted,
    "album removed",
    "albums removed",
  );
}

function albumImpactLabels(artist: LibraryUpdateArtistSummary) {
  if (artist.totalChanges === 0) return [];
  const labels: string[] = [];
  if (artist.albumsAdded > 0) {
    labels.push(countLabel(artist.albumsAdded, "album added", "albums added"));
  }
  if (artist.albumsDeleted > 0) {
    labels.push(
      countLabel(artist.albumsDeleted, "album removed", "albums removed"),
    );
  }
  return labels;
}

function NewArtistsSection({
  artists,
  onOpenArtist,
}: {
  artists: NewLibraryArtist[];
  onOpenArtist: (artistName: string) => void;
}) {
  if (artists.length === 0) return null;
  return (
    <section className="updates-new-artists" aria-labelledby="new-artists-title">
      <header>
        <span className="updates-section-icon" aria-hidden="true">
          <PlusCircle size={17} />
        </span>
        <span>
          <h2 id="new-artists-title">New artists</h2>
          <p>First appearances recorded by library imports.</p>
        </span>
        <strong>{formatNumber(artists.length)}</strong>
      </header>
      <div className="updates-new-artist-list">
        {artists.map((artist) => (
          <button
            key={`${artist.artistKey}-${artist.addedAt}`}
            type="button"
            aria-label={`Open ${artist.artistName} in Artists`}
            onClick={() => onOpenArtist(artist.artistName)}
          >
            <strong>{artist.artistName}</strong>
            <span>
              Added <time dateTime={artist.addedAt}>{formatUpdateDate(artist.addedAt)}</time>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ArtistUpdateList({
  artists,
  onOpenArtist,
}: {
  artists: LibraryUpdateArtistSummary[];
  onOpenArtist: (artistName: string) => void;
}) {
  return (
    <section className="updates-artist-ledger" aria-label="Artist update overview">
      <header className="updates-artist-ledger-heading">
        <span>
          <UsersRound size={17} aria-hidden="true" />
          <strong>Artist changes</strong>
        </span>
        <span>Largest impact first</span>
      </header>
      <div className="updates-artist-list">
        {artists.map((artist) => {
          const albumLabels = albumImpactLabels(artist);
          return (
            <button
              className="updates-artist-row"
              key={artist.artistKey}
              type="button"
              aria-label={`Open ${artist.artistName} in Artists`}
              onClick={() => onOpenArtist(artist.artistName)}
            >
              <span className="updates-artist-name">
                <strong>{artist.artistName}</strong>
                <time dateTime={artist.lastUpdatedAt}>
                  Latest {formatUpdateDate(artist.lastUpdatedAt)}
                </time>
              </span>
              <span className="updates-artist-impact">
                <strong>{artistUpdateHeadline(artist)}</strong>
                {albumLabels.length > 0 ? (
                  <small>{albumLabels.join(" · ")}</small>
                ) : null}
              </span>
              <ChevronRight size={17} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function UpdatesWorkspace({
  catalogRefreshKey = 0,
  selectedUpdateId,
  onSelectUpdate,
  onOpenArtist,
}: UpdatesWorkspaceProps) {
  const [view, setView] = useState<UpdatesView>("activity");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [changeKind, setChangeKind] = useState<LibraryUpdateKind | null>(null);
  const [dateRange, setDateRange] = useState<UpdateDateRange>("all");
  const [offset, setOffset] = useState(0);
  const [response, setResponse] =
    useState<LibraryUpdateResponse>(emptyResponse);
  const [artistResponse, setArtistResponse] =
    useState<LibraryUpdateArtistResponse>(emptyArtistResponse);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const selectedUpdateIdRef = useRef(selectedUpdateId);

  useEffect(() => {
    selectedUpdateIdRef.current = selectedUpdateId;
  }, [selectedUpdateId]);

  const loadUpdates = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const request = {
        query: deferredQuery,
        changeKind,
        dateFrom: dateFromRange(dateRange),
        limit: PAGE_SIZE,
        offset,
      };
      if (view === "artists") {
        const next = await listLibraryUpdateArtists(request);
        setArtistResponse(next);
        onSelectUpdate(null);
      } else {
        const next = await listLibraryUpdates(request);
        setResponse(next);
        const selected = next.rows.find(
          (row) => row.id === selectedUpdateIdRef.current,
        );
        if (selected) {
          onSelectUpdate(selected);
        } else if (next.rows.length > 0) {
          onSelectUpdate(next.rows[0]);
        } else {
          onSelectUpdate(null);
        }
      }
    } catch (loadError) {
      if (view === "artists") {
        setArtistResponse(emptyArtistResponse);
      } else {
        setResponse(emptyResponse);
      }
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load update history.",
      );
      onSelectUpdate(null);
    } finally {
      setIsLoading(false);
    }
  }, [
    changeKind,
    catalogRefreshKey,
    dateRange,
    deferredQuery,
    offset,
    onSelectUpdate,
    refreshKey,
    view,
  ]);

  useEffect(() => {
    void loadUpdates();
  }, [loadUpdates]);

  useEffect(() => {
    setOffset(0);
  }, [changeKind, dateRange, deferredQuery, view]);

  const groups = useMemo(() => {
    const grouped = new Map<string, LibraryUpdate[]>();
    for (const update of response.rows) {
      const key = updateGroupKey(update);
      grouped.set(key, [...(grouped.get(key) ?? []), update]);
    }
    return [...grouped.values()];
  }, [response.rows]);

  const activeResponse = view === "artists" ? artistResponse : response;
  const pageStart = activeResponse.total === 0 ? 0 : activeResponse.offset + 1;
  const pageEnd = Math.min(
    activeResponse.total,
    activeResponse.offset + activeResponse.rows.length,
  );
  const hasFilters =
    query.trim().length > 0 || changeKind != null || dateRange !== "all";

  function resetFilters() {
    setQuery("");
    setChangeKind(null);
    setDateRange("all");
    setOffset(0);
  }

  function selectView(nextView: UpdatesView) {
    setView(nextView);
    setOffset(0);
    if (nextView === "artists") {
      onSelectUpdate(null);
    }
  }

  return (
    <section className="workspace updates-workspace">
      <header className="topbar">
        <div>
          <h1>Updates</h1>
          <p>A permanent history of changes to your music database.</p>
        </div>
        <div className="topbar-actions">
          <button
            className="icon-button"
            type="button"
            aria-label="Refresh update history"
            onClick={() => setRefreshKey((current) => current + 1)}
          >
            <RotateCcw size={18} />
          </button>
        </div>
      </header>

      <nav className="updates-view-switch" aria-label="Updates view">
        <button
          type="button"
          aria-pressed={view === "activity"}
          onClick={() => selectView("activity")}
        >
          <FileClock size={16} aria-hidden="true" />
          Activity
        </button>
        <button
          type="button"
          aria-pressed={view === "artists"}
          onClick={() => selectView("artists")}
        >
          <UsersRound size={16} aria-hidden="true" />
          Artists
        </button>
      </nav>

      <section className="update-summary" aria-label="Update summary">
        <SummaryButton
          label="All changes"
          count={activeResponse.summary.all}
          kind={null}
          activeKind={changeKind}
          onSelect={setChangeKind}
        />
        <SummaryButton
          label="New"
          count={activeResponse.summary.new}
          kind="new"
          activeKind={changeKind}
          onSelect={setChangeKind}
        />
        <SummaryButton
          label="Changed"
          count={activeResponse.summary.changed}
          kind="changed"
          activeKind={changeKind}
          onSelect={setChangeKind}
        />
        <SummaryButton
          label="Removed"
          count={activeResponse.summary.removed}
          kind="removed"
          activeKind={changeKind}
          onSelect={setChangeKind}
        />
      </section>

      <section className="updates-command-bar" aria-label="Update filters">
        <label className="updates-search">
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">Search updates</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              view === "artists"
                ? "Search artists or their changes"
                : "Search artist, album, field, or value"
            }
          />
        </label>
        <label className="updates-filter">
          <span className="sr-only">Change type</span>
          <select
            value={changeKind ?? ""}
            onChange={(event) =>
              setChangeKind(
                (event.target.value || null) as LibraryUpdateKind | null,
              )
            }
          >
            <option value="">All change types</option>
            <option value="new">New</option>
            <option value="changed">Changed</option>
            <option value="removed">Removed</option>
          </select>
        </label>
        <label className="updates-filter updates-date-filter">
          <CalendarDays size={16} aria-hidden="true" />
          <span className="sr-only">Date range</span>
          <select
            value={dateRange}
            onChange={(event) =>
              setDateRange(event.target.value as UpdateDateRange)
            }
          >
            <option value="all">All time</option>
            <option value="today">Today</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="365d">Last year</option>
          </select>
        </label>
        <button
          className="updates-reset"
          type="button"
          disabled={!hasFilters}
          onClick={resetFilters}
        >
          Reset
        </button>
      </section>

      {error ? <p className="error-message">{error}</p> : null}
      {view === "artists" ? (
        <div className="updates-artist-view">
          {isLoading && artistResponse.rows.length === 0 ? (
            <div className="empty-state updates-artist-loading">
              <UsersRound size={20} />
              <span>Building artist overview…</span>
            </div>
          ) : !error && artistResponse.rows.length === 0 ? (
            <div className="empty-state updates-empty updates-artist-loading">
              <UsersRound size={22} />
              <strong>No matching artists</strong>
              <span>
                {hasFilters
                  ? "Try a broader search or reset the filters."
                  : "Artist summaries will appear after a library change is recorded."}
              </span>
            </div>
          ) : (
            <>
              <NewArtistsSection
                artists={artistResponse.newArtists}
                onOpenArtist={onOpenArtist}
              />
              <ArtistUpdateList
                artists={artistResponse.rows}
                onOpenArtist={onOpenArtist}
              />
            </>
          )}
        </div>
      ) : (
        <section className="updates-ledger" aria-label="Database update history">
          {isLoading && response.rows.length === 0 ? (
            <div className="empty-state">
              <FileClock size={20} />
              <span>Loading update history…</span>
            </div>
          ) : !error && groups.length === 0 ? (
            <div className="empty-state updates-empty">
              <FileClock size={22} />
              <strong>No matching updates</strong>
              <span>
                {hasFilters
                  ? "Try a broader search or reset the filters."
                  : "Your next completed library import will start this permanent history."}
              </span>
            </div>
          ) : (
            groups.map((updates) => {
              const first = updates[0];
              return (
                <section
                  className="updates-group"
                  key={updateGroupKey(first)}
                  aria-label={`${formatUpdateDate(first.createdAt)} — ${first.sourceLabel}`}
                >
                  <header className="updates-group-heading">
                    <span>
                      <strong>{formatUpdateDate(first.createdAt)}</strong>
                      <small>
                        {updates.length}{" "}
                        {updates.length === 1 ? "change" : "changes"}
                      </small>
                    </span>
                    <span title={first.sourcePath ?? undefined}>
                      {first.sourceLabel}
                    </span>
                  </header>
                  <div className="updates-list">
                    {updates.map((update) => (
                      <div
                        className={`update-row${selectedUpdateId === update.id ? " selected" : ""}`}
                        key={update.id}
                      >
                        <button
                          className="update-row-select"
                          type="button"
                          aria-label={`Select update for ${update.albumArtistDisplay ?? "Unknown artist"} — ${update.album ?? "Untitled album"}`}
                          aria-pressed={selectedUpdateId === update.id}
                          onClick={() => onSelectUpdate(update)}
                        />
                        <time dateTime={update.createdAt}>
                          {formatUpdateTime(update.createdAt)}
                        </time>
                        <UpdateStatus update={update} />
                        <span className="update-identity">
                          <UpdateArtistLink
                            artistName={update.albumArtistDisplay}
                            onOpenArtist={onOpenArtist}
                          />
                          <span>
                            {update.album ?? "Untitled album"}
                            {update.year != null ? ` (${update.year})` : ""}
                          </span>
                        </span>
                        <UpdateDescription update={update} />
                      </div>
                    ))}
                  </div>
                </section>
              );
            })
          )}
        </section>
      )}

      <footer className="updates-footer">
        <span>
          Showing {formatNumber(pageStart)}–{formatNumber(pageEnd)} of{" "}
          {formatNumber(activeResponse.total)} {view === "artists" ? "artists" : "changes"}
        </span>
        <div className="pager">
          <button
            className="icon-button"
            type="button"
            aria-label="Previous updates page"
            disabled={offset === 0 || isLoading}
            onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="Next updates page"
            disabled={offset + PAGE_SIZE >= activeResponse.total || isLoading}
            onClick={() => setOffset((current) => current + PAGE_SIZE)}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </footer>
    </section>
  );
}

export function UpdateDetailPanel({
  update,
  onOpenArtist,
}: {
  update: LibraryUpdate | null;
  onOpenArtist: (artistName: string) => void;
}) {
  if (!update) {
    return (
      <aside className="detail-panel update-detail" aria-label="Update details">
        <div className="detail-header">
          <FileClock size={20} />
          <div>
            <h2>Update details</h2>
            <p>Select a history row</p>
          </div>
        </div>
        <div className="empty-state">
          <FileClock size={20} />
          <span>No update selected.</span>
        </div>
      </aside>
    );
  }

  return (
    <aside className="detail-panel update-detail" aria-label="Selected update details">
      <div className="detail-header">
        {update.category === "ratings" ? (
          <Star size={20} />
        ) : update.changeKind === "new" ? (
          <PlusCircle size={20} />
        ) : update.changeKind === "removed" ? (
          <MinusCircle size={20} />
        ) : (
          <Pencil size={20} />
        )}
        <div>
          <h2>Selected change</h2>
          <p>{update.description}</p>
        </div>
      </div>

      <UpdateStatus update={update} />

      <dl className="run-details update-detail-list">
        <div>
          <dt>Artist</dt>
          <dd>
            <UpdateArtistLink
              artistName={update.albumArtistDisplay}
              onOpenArtist={onOpenArtist}
            />
          </dd>
        </div>
        <div>
          <dt>Album</dt>
          <dd>{update.album ?? "Untitled album"}</dd>
        </div>
        <div>
          <dt>Year</dt>
          <dd>{update.year ?? "Unknown"}</dd>
        </div>
        {update.fieldLabel ? (
          <div>
            <dt>Field</dt>
            <dd>{update.fieldLabel}</dd>
          </div>
        ) : null}
        {update.previousValue != null ? (
          <div>
            <dt>Previous value</dt>
            <dd className="update-previous-value">{update.previousValue}</dd>
          </div>
        ) : null}
        {update.currentValue != null ? (
          <div>
            <dt>New value</dt>
            <dd className="update-current-value">{update.currentValue}</dd>
          </div>
        ) : null}
        <div>
          <dt>Source / import</dt>
          <dd>{update.sourceLabel}</dd>
        </div>
        <div>
          <dt>Timestamp</dt>
          <dd>{formatUpdateTimestamp(update.createdAt)}</dd>
        </div>
        <div>
          <dt>Event ID</dt>
          <dd>#{update.id}</dd>
        </div>
      </dl>
      {update.sourcePath ? (
        <p className="update-source-path" title={update.sourcePath}>
          {update.sourcePath}
        </p>
      ) : null}
    </aside>
  );
}
