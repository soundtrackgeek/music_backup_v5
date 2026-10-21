import { useEffect, useMemo, useState } from "react";
import { CheckCheck, ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react";
import { getRatedAlbums, type RatedAlbum } from "../../backend/ratedAlbums";
import { isTauriRuntime } from "../../backend/tauriClient";
import { AlbumCover } from "../../components/AlbumCover";
import { RatingStars } from "../../components/catalog/CatalogValues";
import { formatClockTime } from "../../app/display";
import { useStatisticsStore } from "./useStatisticsStore";
import { emptyRatedAlbumFilters, filterRatedAlbums, ratedFilterError, RATED_ALBUM_PAGE_SIZE, type RatedAlbumFilters } from "./ratedAlbumFilters";
import "./RatedAlbums.css";

function AlbumEntry({ album, onOpenAlbum }: { album: RatedAlbum; onOpenAlbum: (id: string) => void }) {
  const date = album.ratedAt === null ? null : new Date(album.ratedAt * 1000);
  return <li className="rated-album-row">
    <button type="button" className="rated-album-title" disabled={!album.inLibrary}
      onClick={() => onOpenAlbum(album.albumId)} aria-label={`Open ${album.album} by ${album.artist}`}>
      <AlbumCover row={album} className="rated-album-cover" size={96} />
      <span><span className="rated-album-artist">{album.artist}</span><strong>{album.album}</strong>
        {!album.inLibrary ? <small>No longer in library</small> : !album.currentlyComplete ? <small>Ratings changed since completion</small> : null}
      </span>
    </button>
    <div className="rated-album-details"><span>{album.year ?? "Unknown year"} <span aria-hidden="true">·</span> {album.genre || "Unknown genre"}</span>
      <small>{album.country || "Unknown country"}</small>
      <small>{album.tracks} tracks <span aria-hidden="true">·</span> {album.seconds === null ? "Length unavailable" : formatClockTime(album.seconds)}</small>
    </div>
    <div className="rated-album-rating"><small>Album Rating</small><RatingStars value={album.albumRating} label="Album Rating" /></div>
    <div className="rated-album-score"><small>Score</small><strong>{album.score?.toFixed(1) ?? "—"}</strong></div>
    <div className="rated-album-date">{date ? <time dateTime={date.toISOString()} title={date.toLocaleString()}>{date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</time> : <span>Date unknown</span>}
      <small>{album.dateKind === "completed" ? "Completed" : album.dateKind === "firstSeen" ? "First seen fully rated" : "Already fully rated"}</small>
    </div>
  </li>;
}

export function RatedAlbums({ onOpenAlbum, refreshToken, catalogRevision }: { onOpenAlbum: (id: string) => void; refreshToken?: unknown; catalogRevision?: number }) {
  const { ratedAlbumFilters: filters, setRatedAlbumFilters: setFilters } = useStatisticsStore();
  const [rows, setRows] = useState<RatedAlbum[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getRatedAlbums().then(next => {
      if (!cancelled) { setRows(next); setError(null); }
    }, reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshToken, catalogRevision, retry]);
  const options = useMemo(() => ({
    genres: [...new Set((rows ?? []).map(row => row.genre || "Unknown genre"))].sort(),
    countries: [...new Set((rows ?? []).map(row => row.country || "Unknown country"))].sort(),
  }), [rows]);
  const filtered = useMemo(() => filterRatedAlbums(rows ?? [], filters), [rows, filters]);
  const filterError = ratedFilterError(filters);
  const page = Math.min(filters.page, Math.max(0, Math.ceil(filtered.length / RATED_ALBUM_PAGE_SIZE) - 1));
  const start = page * RATED_ALBUM_PAGE_SIZE;
  const update = (key: keyof RatedAlbumFilters, value: string) => setFilters({ ...filters, [key]: value, page: 0 });
  const hasFilters = Object.entries(filters).some(([key, value]) => key !== "sort" && key !== "page" && value !== "");
  return <div className="rated-albums-page">
    <header className="rated-albums-heading"><div><h2>Rated albums</h2><p>Every album finished. A history of your listening, one rating at a time.</p></div>
      <button type="button" className="secondary-button" disabled={loading} onClick={() => setRetry(value => value + 1)}><RefreshCw size={15} />{loading ? "Refreshing…" : "Refresh history"}</button>
    </header>
    {!isTauriRuntime() ? <p className="rated-preview">Preview data · Your desktop library supplies the real history.</p> : null}
    <div className="rated-albums-filters" role="search" aria-label="Filter rated albums">
      <label className="rated-search">Artist or album<span><Search size={16} aria-hidden="true" /><input type="search" placeholder="Find an album or artist…" value={filters.query} onChange={e => update("query", e.target.value)} /></span></label>
      <label>Genre<select value={filters.genre} onChange={e => update("genre", e.target.value)}><option value="">All genres</option>{options.genres.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Country<select value={filters.country} onChange={e => update("country", e.target.value)}><option value="">All countries</option>{options.countries.map(value => <option key={value}>{value}</option>)}</select></label>
      <fieldset><legend>Album year</legend><div><input type="number" aria-label="Album year from" placeholder="From" min="1" max="9999" value={filters.yearFrom} onChange={e => update("yearFrom", e.target.value)} /><span aria-hidden="true">–</span><input type="number" aria-label="Album year to" placeholder="To" min="1" max="9999" value={filters.yearTo} onChange={e => update("yearTo", e.target.value)} /></div></fieldset>
      <label>Rated from<input type="date" value={filters.dateFrom} onChange={e => update("dateFrom", e.target.value)} /></label>
      <label>Rated through<input type="date" value={filters.dateTo} onChange={e => update("dateTo", e.target.value)} /></label>
      <label>Date evidence<select value={filters.dateKind} onChange={e => update("dateKind", e.target.value)}><option value="">All history</option><option value="completed">Recorded completion</option><option value="firstSeen">First seen fully rated</option><option value="unknown">Date unknown</option></select></label>
      <button className="secondary-button rated-reset" type="button" disabled={!hasFilters} onClick={() => setFilters({ ...emptyRatedAlbumFilters, sort: filters.sort })}>Clear filters</button>
    </div>
    <div className="rated-albums-toolbar"><p role="status" aria-live="polite"><CheckCheck size={17} aria-hidden="true" />{rows === null ? (error ? "History unavailable" : "Loading history…") : <><strong>{filtered.length.toLocaleString()}</strong> {hasFilters ? `of ${rows.length.toLocaleString()} albums` : `album${rows.length === 1 ? "" : "s"} in your history`}</>}</p>
      <label>Sort by<select value={filters.sort} onChange={e => update("sort", e.target.value)}><option value="newest">Date rated · newest first</option><option value="oldest">Date rated · oldest first</option><option value="score">Album Score · highest first</option><option value="scoreAsc">Album Score · lowest first</option><option value="rating">Album Rating · highest first</option><option value="artist">Artist · A–Z</option><option value="album">Album · A–Z</option><option value="year">Album year · newest first</option><option value="yearAsc">Album year · oldest first</option></select></label>
    </div>
    {error ? <div className="rated-albums-error" role="alert"><p>Could not refresh history: {error}</p><button className="secondary-button" type="button" onClick={() => setRetry(value => value + 1)}>Try again</button>{rows ? <small>Showing the last loaded history.</small> : null}</div> : null}
    {filterError ? <p className="error-message" role="alert">{filterError}</p> : null}
    {rows !== null && !filterError && filtered.length === 0 ? <div className="rated-albums-empty"><CheckCheck size={32} /><h3>{hasFilters ? "No albums match these filters" : "Your next finished album starts here"}</h3><p>{hasFilters ? "Try a wider year or date range, or clear your filters." : "Rate every track in an album in Aurora. It will appear here automatically after the ratings sync to Music Library."}</p>{hasFilters ? <button className="secondary-button" type="button" onClick={() => setFilters({ ...emptyRatedAlbumFilters })}>Clear filters</button> : null}</div> : null}
    <ul className="rated-albums-list" aria-label="Rated album history" aria-busy={loading}>{filtered.slice(start, start + RATED_ALBUM_PAGE_SIZE).map(album => <AlbumEntry key={album.albumId} album={album} onOpenAlbum={onOpenAlbum} />)}</ul>
    {filtered.length > RATED_ALBUM_PAGE_SIZE ? <nav className="rated-albums-pagination" aria-label="History pages"><span>{start + 1}–{Math.min(start + RATED_ALBUM_PAGE_SIZE, filtered.length)} of {filtered.length.toLocaleString()}</span><button type="button" className="secondary-button" disabled={page === 0} aria-label="Previous history page" onClick={() => setFilters({ ...filters, page: page - 1 })}><ChevronLeft size={16} />Previous</button><button type="button" className="secondary-button" disabled={start + RATED_ALBUM_PAGE_SIZE >= filtered.length} aria-label="Next history page" onClick={() => setFilters({ ...filters, page: page + 1 })}>Next<ChevronRight size={16} /></button></nav> : null}
    <details className="rated-albums-notes"><summary>About this history</summary><p>Fully rated means every track has a rating. Each album appears once, at its first recorded completion. Aurora completions appear after a successful library sync; the date is when Music Library recorded that completion.</p><p>“First seen fully rated” means the album was already complete when recorded. Its original completion date is unknown. Albums without dated evidence show “Date unknown” and are excluded by date filters. Ratings and metadata reflect the current library; removed albums retain the details available in the history.</p></details>
  </div>;
}
