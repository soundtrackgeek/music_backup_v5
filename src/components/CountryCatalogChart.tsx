import { useMemo, useState, type CSSProperties } from "react";

import { resolveCountryName } from "../app/countryNames";
import type { CountryCatalogStats } from "../types";

type CountryCatalogMetric = "artists" | "albums";

const numberFormatter = new Intl.NumberFormat();
const countryCollator = new Intl.Collator(undefined, {
  sensitivity: "base",
  numeric: true,
});

function metricValue(row: CountryCatalogStats, metric: CountryCatalogMetric) {
  return metric === "artists" ? row.artistCount : row.albumCount;
}

function metricLabel(metric: CountryCatalogMetric, count: number) {
  const singular = metric === "artists" ? "artist" : "album";
  return count === 1 ? singular : `${singular}s`;
}

function countryFlagClass(countryCode: string) {
  const normalized = countryCode.trim().toLowerCase();
  return /^[a-z]{2}$/.test(normalized) ? ` fi-${normalized}` : "";
}

export function CountryCatalogChart({ rows }: { rows: CountryCatalogStats[] }) {
  const [metric, setMetric] = useState<CountryCatalogMetric>("artists");
  const rankedRows = useMemo(() => {
    return rows
      .map((row) => ({
        ...row,
        displayName: resolveCountryName(row.countryCode, row.countryName),
      }))
      .sort((left, right) => {
        const metricDifference =
          metricValue(right, metric) - metricValue(left, metric);
        if (metricDifference !== 0) return metricDifference;

        const secondaryMetric = metric === "artists" ? "albums" : "artists";
        const secondaryDifference =
          metricValue(right, secondaryMetric) -
          metricValue(left, secondaryMetric);
        if (secondaryDifference !== 0) return secondaryDifference;

        return (
          countryCollator.compare(left.displayName, right.displayName) ||
          countryCollator.compare(left.countryCode, right.countryCode)
        );
      });
  }, [metric, rows]);
  const maxValue = Math.max(
    1,
    ...rankedRows.map((row) => metricValue(row, metric)),
  );
  const metricTitle = metric === "artists" ? "Artists" : "Albums";

  if (rows.length === 0) {
    return (
      <div className="empty-state country-catalog-empty">
        <span>No country statistics yet.</span>
      </div>
    );
  }

  return (
    <div className="country-catalog-chart">
      <div className="country-catalog-toolbar">
        <div
          className="segmented-control country-catalog-metric-control"
          role="group"
          aria-label="Country chart metric"
        >
          <button
            className={metric === "artists" ? "active" : ""}
            type="button"
            aria-pressed={metric === "artists"}
            onClick={() => setMetric("artists")}
          >
            Artists
          </button>
          <button
            className={metric === "albums" ? "active" : ""}
            type="button"
            aria-pressed={metric === "albums"}
            onClick={() => setMetric("albums")}
          >
            Albums
          </button>
        </div>
        <p aria-live="polite">
          <strong>{numberFormatter.format(rows.length)}</strong> countries ·
          Ranked by {metricTitle.toLowerCase()}
        </p>
      </div>

      <div className="country-catalog-scroll" tabIndex={0}>
        <ol
          className="country-catalog-list"
          aria-label={`Countries ranked by ${metricTitle.toLowerCase()}`}
        >
          {rankedRows.map((row, index) => {
            const value = metricValue(row, metric);
            const width = `${(value / maxValue) * 100}%`;
            const rowStyle = {
              "--country-bar-width": width,
            } as CSSProperties & Record<"--country-bar-width", string>;
            return (
              <li
                className="country-catalog-row"
                style={rowStyle}
                key={row.countryCode}
                aria-label={`${index + 1}. ${row.displayName}: ${numberFormatter.format(value)} ${metricLabel(metric, value)}`}
              >
                <span className="country-catalog-rank" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="country-catalog-track" aria-hidden="true">
                  <span className="country-catalog-bar" />
                </span>
                <strong className="country-catalog-value" aria-hidden="true">
                  {numberFormatter.format(value)}
                </strong>
                <span className="country-catalog-name" aria-hidden="true">
                  {row.displayName}
                </span>
                <span
                  className={`country-catalog-flag country-flag fi${countryFlagClass(
                    row.countryCode,
                  )}`}
                  title={`${row.displayName} flag`}
                  aria-hidden="true"
                />
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
