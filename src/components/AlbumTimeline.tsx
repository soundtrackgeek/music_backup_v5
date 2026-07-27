import { useMemo, useState } from "react";
import { CalendarDays, Clock3 } from "lucide-react";
import type { CSSProperties } from "react";
import type { BrowseRow } from "../types";
import {
  billboardDebutWeekKey,
  formatBillboardDebutWeek,
} from "../app/display";
import { AlbumCover } from "./AlbumCover";

type TimelineYear = {
  year: number;
  rows: BrowseRow[];
};

function monthLabel(row: BrowseRow) {
  if (row.billboardDebutMonth == null) {
    return "Unknown month";
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2000, row.billboardDebutMonth - 1, 1)));
}

function timelineYears(rows: BrowseRow[]) {
  const grouped = new Map<number, BrowseRow[]>();
  for (const row of rows) {
    if (row.billboardDebutYear == null || row.billboardDebutWeek == null) {
      continue;
    }
    const yearRows = grouped.get(row.billboardDebutYear) ?? [];
    yearRows.push(row);
    grouped.set(row.billboardDebutYear, yearRows);
  }
  return [...grouped.entries()]
    .map(([year, yearRows]) => ({
      year,
      rows: [...yearRows].sort((left, right) =>
        billboardDebutWeekKey(left).localeCompare(billboardDebutWeekKey(right)),
      ),
    }))
    .sort((left, right) => left.year - right.year);
}

export function AlbumTimeline({ rows }: { rows: BrowseRow[] }) {
  const years = useMemo(() => timelineYears(rows), [rows]);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const maxCount = Math.max(1, ...years.map((year) => year.rows.length));
  const datedCount = years.reduce((sum, year) => sum + year.rows.length, 0);
  const undatedCount = rows.length - datedCount;

  if (years.length === 0) {
    return (
      <div className="album-timeline-empty">
        <CalendarDays size={24} aria-hidden="true" />
        <strong>No debut weeks in this chart yet</strong>
        <span>
          Import the CSV_ALBUMS folder, or widen the current filters, to place
          albums on the timeline.
        </span>
      </div>
    );
  }

  const focalYear = years.reduce((best, candidate) =>
    candidate.rows.length > best.rows.length ||
    (candidate.rows.length === best.rows.length && candidate.year > best.year)
      ? candidate
      : best,
  );
  const activeYear =
    years.find((year) => year.year === selectedYear) ?? focalYear;
  const yearSpan =
    years.length === 1
      ? `${years[0].year}`
      : `${years[0].year}–${years[years.length - 1].year}`;

  return (
    <section className="album-timeline" aria-labelledby="album-timeline-title">
      <header className="album-timeline-heading">
        <div>
          <span className="album-timeline-kicker">
            <Clock3 size={14} aria-hidden="true" /> Billboard debut weeks
          </span>
          <h3 id="album-timeline-title">Albums through the years</h3>
          <p>
            {datedCount.toLocaleString()} albums across {yearSpan}. Select a year
            to relive its chart arrivals week by week.
          </p>
        </div>
        {undatedCount > 0 ? (
          <span className="album-timeline-caveat">
            {undatedCount.toLocaleString()} without debut data
          </span>
        ) : null}
      </header>

      <div
        className="album-timeline-chart"
        role="list"
        aria-label={`Album debut distribution from ${yearSpan}`}
      >
        {years.map((year) => {
          const style = {
            "--timeline-density": year.rows.length / maxCount,
          } as CSSProperties;
          return (
            <div className="album-timeline-point" role="listitem" style={style} key={year.year}>
              <button
                type="button"
                className={year.year === activeYear.year ? "active" : ""}
                aria-pressed={year.year === activeYear.year}
                aria-label={`${year.year}: ${year.rows.length} album${year.rows.length === 1 ? "" : "s"}`}
                onClick={() => setSelectedYear(year.year)}
              >
                <span className="album-timeline-count">{year.rows.length}</span>
                <span className="album-timeline-bar" aria-hidden="true" />
                <strong>{year.year}</strong>
              </button>
            </div>
          );
        })}
      </div>

      <section className="album-timeline-year" aria-live="polite">
        <header>
          <div>
            <span>Selected year</span>
            <h4>{activeYear.year}</h4>
          </div>
          <strong>
            {activeYear.rows.length} album{activeYear.rows.length === 1 ? "" : "s"}
          </strong>
        </header>
        <div className="album-timeline-albums" role="list">
          {activeYear.rows.map((row) => (
            <article role="listitem" key={row.id}>
              <AlbumCover row={row} className="album-timeline-cover" previewOnHover />
              <div>
                <span>{monthLabel(row)}</span>
                <strong>{row.album ?? "Untitled"}</strong>
                <small>{row.albumArtistDisplay ?? "Unknown artist"}</small>
                <time dateTime={billboardDebutWeekKey(row)}>
                  {formatBillboardDebutWeek(row)}
                </time>
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
