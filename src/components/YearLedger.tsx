import { useState } from "react";
import { ArrowRight, BarChart3, ChevronLeft, ChevronRight, Database, Gauge, Grid2X2 } from "lucide-react";
import type { YearProgressStats } from "../types";
import { fullyRatedAlbumRatio } from "../app/yearProgress";
import { yearRatingCohort, type InsightCohort, type YearRatingStatus } from "../app/insightCohorts";
import "./YearLedger.css";

const number = (value: number) => value.toLocaleString();
const percent = (value: number) => `${Math.round(value * 100)}%`;
const statuses = ["fully-rated", "partial", "unrated"] as const;
const labels = { "fully-rated": "Fully rated", partial: "Partial", unrated: "Unrated" };
const countFor = (row: YearProgressStats, status: typeof statuses[number]) =>
  status === "fully-rated" ? row.ratedAlbumCount : status === "partial" ? row.partialAlbumCount : row.unratedAlbumCount;

export function YearLedger({ rows, genres, excludedGenres, onOpen, busy = false, error, selectedYear: controlledYear, onSelectedYearChange }: {
  rows: YearProgressStats[];
  genres: string[];
  excludedGenres: string[];
  onOpen: (cohort: InsightCohort) => void;
  busy?: boolean;
  error?: string | null;
  selectedYear?: number | null;
  onSelectedYearChange?: (year: number) => void;
}) {
  const [localYear, setLocalYear] = useState<number | null>(null);
  const selectedYear = controlledYear === undefined ? localYear : controlledYear;
  const setSelectedYear = (year: number) => { setLocalYear(year); onSelectedYearChange?.(year); };
  const selected = rows.find(row => row.year === selectedYear) ?? rows[0];
  const selectedIndex = selected ? rows.indexOf(selected) : -1;
  const totals = rows.reduce((sum, row) => ({
    albums: sum.albums + row.albumCount,
    rated: sum.rated + row.ratedAlbumCount,
    partial: sum.partial + row.partialAlbumCount,
    unrated: sum.unrated + row.unratedAlbumCount,
  }), { albums: 0, rated: 0, partial: 0, unrated: 0 });
  const largest = rows.reduce((max, row) => Math.max(max, row.albumCount), 1);
  const scale = Math.max(5, Math.ceil(largest / 5) * 5);
  const best = rows.reduce<YearProgressStats | undefined>((winner, row) =>
    row.albumCount > 0 && (!winner || fullyRatedAlbumRatio(row) > fullyRatedAlbumRatio(winner)) ? row : winner, undefined);
  const completion = totals.albums ? totals.rated / totals.albums : 0;
  const populatedYears = rows.filter(row => row.albumCount > 0).length;
  const open = (row: YearProgressStats, status: YearRatingStatus) => {
    if (!busy) onOpen(yearRatingCohort(row, genres, excludedGenres, status));
  };

  return <div className="year-ledger" aria-busy={busy}>
    <section className="ledger-summary" aria-label="Filtered rating totals">
      {([
        [totals.albums, "albums", "in selected years", ""],
        [totals.rated, "fully rated", percent(completion), "fully-rated"],
        [totals.partial, "partial", percent(totals.albums ? totals.partial / totals.albums : 0), "partial"],
        [totals.unrated, "unrated", percent(totals.albums ? totals.unrated / totals.albums : 0), "unrated"],
        [totals.partial + totals.unrated, "left to finish", "partial + unrated", ""],
      ] as const).map(([value, label, detail, tone]) => <div className={`ledger-metric ${tone}`} key={label}>
        <strong>{busy || error ? "—" : number(value)}</strong><span>{label}</span><small>{error ? "Unavailable" : busy ? "Updating…" : detail}</small>
      </div>)}
      <div className="ledger-legend">{statuses.map(status => <span key={status}>
        <i className={status} />{labels[status]} <small>{status === "fully-rated" ? "(all tracks rated)" : status === "partial" ? "(some tracks rated)" : "(no tracks rated)"}</small>
      </span>)}</div>
    </section>

    {!selected ? <div className="ledger-empty" role="status">{error ? "Year progress is unavailable. Adjust the filters or refresh Statistics to retry." : busy ? "Updating year progress…" : "No albums with a known year match these filters."}</div> : <>
      <div className="ledger-body">
        <section className="ledger-table-panel" aria-label="Year ledger">
          <div className="ledger-panel-title">Year ledger <small>Album counts · oldest first</small></div>
          <div className="ledger-table-scroll">
            <table className="ledger-table">
              <thead><tr><th scope="col">Year</th><th scope="col">Progress <span className="ledger-axis">{Array.from({ length: 6 }, (_, i) => <span key={i}>{number(scale * i / 5)}</span>)}</span></th><th scope="col">Fully rated</th><th scope="col">Partial</th><th scope="col">Unrated</th><th scope="col">Complete %</th></tr></thead>
              <tbody>{rows.map(row => <tr key={row.year} className={selected.year === row.year ? "selected" : ""}>
                <th scope="row"><button type="button" aria-pressed={selected.year === row.year} onClick={() => setSelectedYear(row.year)} aria-label={`Select ${row.year}`}>{row.year}</button></th>
                <td><div className="ledger-bar" aria-label={`${row.year}: ${row.albumCount} albums`}>
                  {statuses.map(status => <button type="button" key={status} className={status} style={{ width: `${countFor(row, status) / scale * 100}%` }} disabled={busy || countFor(row, status) === 0} onClick={() => open(row, status)} title={`${row.year}: ${number(countFor(row, status))} ${labels[status].toLowerCase()} albums`} aria-label={`${row.year}: ${number(countFor(row, status))} ${labels[status].toLowerCase()} albums`} />)}
                </div></td>
                {statuses.map(status => <td key={status}><button type="button" className={`ledger-count ${status}`} disabled={busy || countFor(row, status) === 0} onClick={() => open(row, status)} aria-label={`Browse ${row.year} ${labels[status].toLowerCase()} albums`}>{number(countFor(row, status))}</button></td>)}
                <td>{percent(fullyRatedAlbumRatio(row))}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>
        <aside className="ledger-inspector" aria-label="Selected year summary">
          <header><h3>{selected.year}</h3><div className="ledger-year-buttons"><button className="icon-button" type="button" aria-label="Previous year" disabled={selectedIndex <= 0} onClick={() => setSelectedYear(rows[selectedIndex - 1].year)}><ChevronLeft size={16} /></button><button className="icon-button" type="button" aria-label="Next year" disabled={selectedIndex >= rows.length - 1} onClick={() => setSelectedYear(rows[selectedIndex + 1].year)}><ChevronRight size={16} /></button></div></header>
          <div className="ledger-selected-total"><span><strong>{number(selected.albumCount)}</strong> albums total</span><small>{percent(fullyRatedAlbumRatio(selected))} complete</small></div>
          <progress max={selected.albumCount || 1} value={selected.ratedAlbumCount} aria-label={`${selected.year} fully rated albums`} />
          <div className="ledger-breakdown">{statuses.map(status => <button type="button" key={status} disabled={busy || countFor(selected, status) === 0} onClick={() => open(selected, status)}><i className={status} /><strong>{number(countFor(selected, status))}</strong><span>{labels[status]}</span><small>{percent(countFor(selected, status) / Math.max(1, selected.albumCount))}</small></button>)}</div>
          <div className="ledger-remaining"><strong>{number(selected.partialAlbumCount + selected.unratedAlbumCount)}</strong><span>albums left</span><small>partial + unrated</small></div>
          <button type="button" className="ledger-browse" disabled={busy || selected.partialAlbumCount + selected.unratedAlbumCount === 0} onClick={() => open(selected, "remaining")}>Browse remaining albums <ArrowRight size={17} /></button>
        </aside>
      </div>
      <section className="ledger-footer" aria-label="Year ledger insights">
        <article><Database size={27} /><div><strong>{number(totals.albums)}</strong><span>Total albums</span><small>{rows[0].year}–{rows[rows.length - 1].year} · {genres.length ? `${genres.length} selected genres` : "all genres"}</small></div></article>
        <article><Gauge size={27} /><div><strong>{percent(completion)}</strong><span>Fully rated albums</span><small>{number(totals.rated)} of {number(totals.albums)} albums</small></div></article>
        <article><Grid2X2 size={27} /><div><strong>{(totals.albums / Math.max(1, populatedYears)).toLocaleString(undefined, { maximumFractionDigits: 1 })}</strong><span>Avg. albums per populated year</span><small>{populatedYears} years with albums · {rows.length} years shown</small></div></article>
        <article><BarChart3 size={27} /><div><strong>{best?.year ?? "—"}</strong><span>Most complete year</span><small>{best ? `${percent(fullyRatedAlbumRatio(best))} · ${number(best.ratedAlbumCount)} of ${number(best.albumCount)}` : "No matching albums"}</small></div></article>
      </section>
    </>}
  </div>;
}
