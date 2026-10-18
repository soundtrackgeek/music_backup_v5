import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, RefreshCw } from "lucide-react";
import {
  getReview,
  saveReviewMarkdown,
  saveReviewPng,
  type ReviewReport,
} from "../../backend/review";
import type { ListeningRow } from "../../backend/listening";
import { isTauriRuntime } from "../../backend/tauriClient";
import { ExportResultStatus } from "../../components/ExportResultStatus";
import {
  reviewRange,
  localDate,
  type ReviewPeriod,
  type ReviewRange,
} from "./reviewPeriods";
import { reviewCard, reviewMarkdown, reviewNotes } from "./reviewExport";
import "./Review.css";
import { useStatisticsStore } from "./useStatisticsStore";

const PERIODS: { id: ReviewPeriod; label: string }[] = [
  { id: "year", label: "Year" },
  { id: "month", label: "Month" },
  { id: "week", label: "Week" },
  { id: "rolling", label: "Rolling 12 months" },
];
const COLORS = [
  "#287f6b",
  "#b77b30",
  "#597db0",
  "#af6685",
  "#8a79ac",
  "#8c9690",
];
const number = (value: number) => value.toLocaleString();
const date = (seconds: number | null) =>
  seconds == null
    ? "No recorded history"
    : new Date(seconds * 1000).toLocaleDateString();
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
const signed = (value: number) => `${value > 0 ? "+" : ""}${number(value)}`;

export function Review({
  onOpenAlbum,
  onOpenArtist,
  onOpenListening,
  refreshToken,
}: {
  onOpenAlbum: (id: string) => void;
  onOpenArtist?: (id: string, name: string) => void;
  onOpenListening: () => void;
  refreshToken?: unknown;
}) {
  const {
    reviewPeriod: period,
    setReviewPeriod: setPeriod,
    reviewAnchor: anchor,
    setReviewAnchor: setAnchor,
  } = useStatisticsStore();
  const [retry, setRetry] = useState(0);
  const range = useMemo(() => reviewRange(period, anchor), [period, anchor]);
  const key = range
    ? `${range.startAt}/${range.endAt}/${range.previousStartAt}`
    : "invalid";
  const [loaded, setLoaded] = useState<{
    key: string;
    report?: ReviewReport;
    error?: string;
  } | null>(null);
  useEffect(() => {
    if (!range) return;
    let cancelled = false;
    const { startAt, endAt, previousStartAt } = range;
    void getReview({ startAt, endAt, previousStartAt }).then(
      (report) => {
        if (!cancelled) setLoaded({ key, report });
      },
      (error) => {
        if (!cancelled) setLoaded({ key, error: errorText(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [range, key, retry, refreshToken]);
  const report = loaded?.key === key ? loaded.report : undefined;
  const error = loaded?.key === key ? loaded.error : undefined;

  function move(direction: number) {
    if (!range) return;
    const d = new Date(range.startAt * 1000);
    if (period === "week") d.setDate(d.getDate() + direction * 7);
    else if (period === "month") d.setMonth(d.getMonth() + direction);
    else if (period === "year") d.setFullYear(d.getFullYear() + direction);
    else {
      const current = new Date(`${anchor}T12:00:00`);
      current.setFullYear(current.getFullYear() + direction);
      setAnchor(localDate(current));
      return;
    }
    setAnchor(localDate(d));
  }

  const openRow = (row: ListeningRow, artist = false) =>
    artist && row.artistId && onOpenArtist
      ? () => onOpenArtist(row.artistId!, row.artist)
      : row.albumId
        ? () => onOpenAlbum(row.albumId!)
        : undefined;

  return (
    <div className="review-page">
      <div className="review-controls">
        <div role="group" aria-label="Review period" className="review-periods">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={p.id === period}
              onClick={() => setPeriod(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="review-date-controls">
          <button
            type="button"
            className="icon-button"
            aria-label="Previous review period"
            disabled={!range}
            onClick={() => move(-1)}
          >
            <ChevronLeft size={18} />
          </button>
          <label>
            {period === "year"
              ? "Year"
              : period === "month"
                ? "Month"
                : period === "week"
                  ? "Week containing"
                  : "Through date"}
            <input
              aria-label="Review date"
              type={
                period === "year"
                  ? "number"
                  : period === "month"
                    ? "month"
                    : "date"
              }
              min={
                period === "year"
                  ? "1972"
                  : period === "month"
                    ? "1972-01"
                    : "1972-01-01"
              }
              max={
                period === "year"
                  ? "9997"
                  : period === "month"
                    ? "9997-12"
                    : "9997-12-31"
              }
              value={
                period === "year"
                  ? anchor.slice(0, 4)
                  : period === "month"
                    ? anchor.slice(0, 7)
                    : anchor
              }
              onChange={(e) =>
                setAnchor(
                  period === "year"
                    ? `${e.target.value}-01-01`
                    : period === "month"
                      ? `${e.target.value}-01`
                      : e.target.value,
                )
              }
            />
          </label>
          <button
            type="button"
            className="icon-button"
            aria-label="Next review period"
            disabled={!range || range.endAt > Date.now() / 1000}
            onClick={() => move(1)}
          >
            <ChevronRight size={18} />
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setAnchor(localDate(new Date()))}
          >
            Today
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Refresh review"
            onClick={() => {
              setLoaded(null);
              setRetry((n) => n + 1);
            }}
          >
            <RefreshCw size={17} />
          </button>
        </div>
      </div>
      {!range ? (
        <p role="status">Choose a valid date from 1972 onwards.</p>
      ) : (
        <>
          <header className="review-heading">
            <div>
              <p className="review-eyebrow">YOUR COLLECTION, OVER TIME</p>
              <h2>{range.title}</h2>
              <p>{range.dates}</p>
              <p className="review-comparison">
                Compared with {range.previousDates} ·{" "}
                {Intl.DateTimeFormat().resolvedOptions().timeZone}
              </p>
              {report && report.endAt < range.endAt ? (
                <p className="review-comparison">
                  Period in progress · through{" "}
                  {new Date((report.endAt - 1) * 1000).toLocaleString()}
                </p>
              ) : null}
            </div>
            {report ? (
              <ReviewExports key={key} report={report} range={range} />
            ) : null}
          </header>
          {!isTauriRuntime() ? (
            <p className="review-preview">
              Browser preview · illustrative sample data
            </p>
          ) : null}
          {error ? (
            <p className="error-message" role="alert">
              {error}{" "}
              <button type="button" onClick={() => setRetry((n) => n + 1)}>
                Try again
              </button>
            </p>
          ) : null}
          {!report && !error ? <p role="status">Loading your review…</p> : null}
          {report ? (
            <>
              <ReviewSummary report={report} />
              <div className="review-coverage" role="note">
                Collection history: {date(report.activitySince)} · Listening
                history: {date(report.current.listening.historySince)}.
                {report.activitySince != null &&
                report.activitySince > report.previousStartAt
                  ? " Collection history does not cover the full comparison."
                  : ""}
                {report.current.listening.historySince != null &&
                report.current.listening.historySince > report.previousStartAt
                  ? " Listening history does not cover the full comparison."
                  : ""}
              </div>
              <section className="stats-panel review-discovery">
                <p className="review-eyebrow">
                  DISCOVERY OF THE{" "}
                  {period === "year"
                    ? "YEAR"
                    : period === "month"
                      ? "MONTH"
                      : period === "week"
                        ? "WEEK"
                        : "PERIOD"}
                </p>
                {report.current.listening.discovery ? (
                  <>
                    <h3>
                      <button
                        type="button"
                        className="review-link"
                        onClick={openRow(report.current.listening.discovery)}
                      >
                        {report.current.listening.discovery.title}
                      </button>
                    </h3>
                    <p>
                      {report.current.listening.discovery.artist}
                      {report.current.listening.discovery.artistDisambiguation
                        ? ` · ${report.current.listening.discovery.artistDisambiguation}`
                        : ""}{" "}
                      · {number(report.current.listening.discovery.plays)} plays
                    </p>
                  </>
                ) : (
                  <h3>No first-heard album found in this period</h3>
                )}
                <p>
                  Most-played library album first heard during this period in
                  your imported listening history.
                </p>
              </section>
              {report.current.listening.plays === 0 ? (
                <div className="review-coverage">
                  <p>
                    No imported plays in this period. Collection and rating
                    activity still appear below.
                  </p>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={onOpenListening}
                  >
                    Open listening sources
                  </button>
                </div>
              ) : (
                <p className="review-coverage">
                  {number(report.current.listening.matchedPlays)} of{" "}
                  {number(report.current.listening.plays)} plays match the
                  library · {number(report.current.listening.tracks)} distinct
                  tracks. Rankings include matched library plays; unmatched
                  plays remain in the total.
                </p>
              )}
              <div className="review-rankings">
                {(
                  [
                    [
                      "Most-played artists",
                      report.current.listening.topArtists,
                      true,
                    ],
                    [
                      "Most-played albums",
                      report.current.listening.topAlbums,
                      false,
                    ],
                    [
                      "Most-played tracks",
                      report.current.listening.topTracks,
                      false,
                    ],
                  ] as const
                ).map(([title, rows, artist]) => (
                  <section className="stats-panel" key={title}>
                    <h3>{title}</h3>
                    {rows.length ? (
                      <ol className="review-ranking-list">
                        {rows.map((row) => {
                          const open = openRow(row, artist);
                          return (
                            <li key={row.key}>
                              <div>
                                {open ? (
                                  <button
                                    type="button"
                                    className="review-link"
                                    onClick={open}
                                  >
                                    {row.title}
                                  </button>
                                ) : (
                                  <span>{row.title}</span>
                                )}
                                {!artist ? <small>{row.artist}</small> : null}
                                {row.artistDisambiguation ? (
                                  <small>{row.artistDisambiguation}</small>
                                ) : null}
                              </div>
                              <span>
                                {number(row.plays)}
                                <small>plays</small>
                              </span>
                            </li>
                          );
                        })}
                      </ol>
                    ) : (
                      <p>No matched plays in this period.</p>
                    )}
                  </section>
                ))}
              </div>
              <div className="review-detail-grid">
                <section className="stats-panel">
                  <h3>Genres you brought home</h3>
                  <p>
                    Top current genres of albums first added during this period.
                  </p>
                  {report.topGenres.length ? (
                    <ol className="review-ranking-list">
                      {report.topGenres.slice(0, 10).map((g) => (
                        <li key={g.genre}>
                          <span>{g.genre}</span>
                          <span>
                            {number(g.albums)}
                            <small>albums</small>
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p>No recorded album additions.</p>
                  )}
                </section>
                <section className="stats-panel">
                  <h3>Biggest changes of heart</h3>
                  <p>Net album-rating changes across the selected period.</p>
                  {report.ratingChanges.length ? (
                    <ol className="review-ranking-list">
                      {report.ratingChanges.map((r, i) => (
                        <li key={`${r.albumId}/${i}`}>
                          <div>
                            {r.albumId ? (
                              <button
                                type="button"
                                className="review-link"
                                onClick={() => onOpenAlbum(r.albumId!)}
                              >
                                {r.album}
                              </button>
                            ) : (
                              r.album
                            )}
                            <small>{r.artist}</small>
                          </div>
                          <span>
                            {r.previous / 20}★ → {r.current / 20}★
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p>No numeric before-and-after rating changes.</p>
                  )}
                </section>
              </div>
              <TasteDrift report={report} />
              <details className="review-method">
                <summary>How this review is calculated</summary>
                <p>{reviewNotes}</p>
              </details>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

function ReviewSummary({ report }: { report: ReviewReport }) {
  const c = report.current,
    p = report.previous;
  const metrics = [
    ["Albums added", c.albumsAdded, p.albumsAdded],
    ["New artists", c.newArtists, p.newArtists],
    ["Album ratings given", c.albumRatingsGiven, p.albumRatingsGiven],
    ["Newly rated tracks", c.newlyRatedTracks, p.newlyRatedTracks],
    ["Plays", c.listening.plays, p.listening.plays],
  ] as const;
  return (
    <dl className="review-metrics" aria-label="Review summary">
      {metrics.map(([label, value, previous]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{number(value)}</dd>
          <small>
            {signed(value - previous)} vs previous · {number(previous)} before
          </small>
        </div>
      ))}
      <div>
        <dt>Completion gained</dt>
        <dd>
          {c.completionChange == null
            ? "—"
            : `${c.completionChange > 0 ? "+" : ""}${(c.completionChange * 100).toFixed(1)} pp`}
        </dd>
        <small>
          {c.completionChange == null
            ? "No baseline snapshot"
            : `${p.completionChange == null ? "No previous baseline" : `${(p.completionChange * 100).toFixed(1)} pp before`} · rated-track share`}
        </small>
      </div>
    </dl>
  );
}

function TasteDrift({ report }: { report: ReviewReport }) {
  const genres = useMemo(() => {
    const totals = new Map<string, number>();
    for (const year of report.tasteDrift)
      for (const g of year.genres)
        totals.set(g.genre, (totals.get(g.genre) ?? 0) + g.albums);
    return [...totals]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5)
      .map(([genre]) => genre);
  }, [report.tasteDrift]);
  return (
    <section className="stats-panel review-drift">
      <h3>How your taste is moving</h3>
      <p>
        Genre share of recorded 4★+ album ratings at each UTC year end. The last
        year runs through the selected period. Current genre labels are used.
      </p>
      {!report.tasteDrift.length ? (
        <p>Import rating history to start a taste timeline.</p>
      ) : (
        <>
          <ul className="review-legend">
            {[...genres, "Other genres"].map((genre, i) => (
              <li key={genre}>
                <span style={{ background: COLORS[i] }} />
                {genre}
              </li>
            ))}
          </ul>
          <div className="review-drift-chart" aria-label="Taste drift by year">
            {report.tasteDrift.map((year) => {
              const counts = genres.map(
                (genre) =>
                  year.genres.find((g) => g.genre === genre)?.albums ?? 0,
              );
              counts.push(year.total - counts.reduce((a, b) => a + b, 0));
              return (
                <div className="review-drift-row" key={year.year}>
                  <span>{year.year}</span>
                  <div className="review-drift-bar">
                    {year.total ? (
                      counts.map((count, i) =>
                        count ? (
                          <span
                            key={i}
                            style={{
                              width: `${(count / year.total) * 100}%`,
                              background: COLORS[i],
                            }}
                            title={`${genres[i] ?? "Other genres"}: ${count} albums (${((count / year.total) * 100).toFixed(1)}%)`}
                          />
                        ) : null,
                      )
                    ) : (
                      <small>No recorded favorites</small>
                    )}
                  </div>
                  <small>{number(year.total)} albums</small>
                </div>
              );
            })}
          </div>
          <details>
            <summary>Show exact genre shares</summary>
            <div className="review-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Year</th>
                    <th>Genre</th>
                    <th>4★+ albums</th>
                    <th>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {report.tasteDrift.flatMap((year) =>
                    year.genres.map((g) => (
                      <tr key={`${year.year}/${g.genre}`}>
                        <td>{year.year}</td>
                        <td>{g.genre}</td>
                        <td>{number(g.albums)}</td>
                        <td>{((g.albums / year.total) * 100).toFixed(1)}%</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}

function ReviewExports({
  report,
  range,
}: {
  report: ReviewReport;
  range: ReviewRange;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{
    path: string;
    format: string;
    rowCount: number;
  } | null>(null);
  async function run(png: boolean) {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const path = png
        ? await saveReviewPng(
            await reviewCard(report, range),
            "music-review.png",
          )
        : await saveReviewMarkdown(reviewMarkdown(report, range), range.title);
      setSaved({ path, format: png ? "png" : "md", rowCount: 1 });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="review-exports">
      <div>
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() => void run(false)}
        >
          <Download size={15} />
          Export Markdown
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() => void run(true)}
        >
          <Download size={15} />
          {busy ? "Exporting…" : "Share PNG card"}
        </button>
      </div>
      {saved ? (
        <ExportResultStatus
          result={{ ...saved, pathCopied: false }}
          itemLabel="review"
          summary="Review exported"
          compact
        />
      ) : null}
      {error ? (
        <small className="error-message" role="alert">
          {error}
        </small>
      ) : null}
    </div>
  );
}
