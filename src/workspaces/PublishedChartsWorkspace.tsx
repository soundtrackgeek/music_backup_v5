import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, FolderOpen, RotateCcw } from "lucide-react";
import {
  getPublishedChartCatalog,
  getPublishedChartEntries,
  importPublishedCharts,
  listPublishedChartWeeks,
  selectPublishedChartsFolder,
  subscribePublishedChartsImportProgress,
  type PublishedChartCatalog,
  type PublishedChartEntry,
  type PublishedChartEntries,
  type PublishedChartWeek,
  type PublishedChartsImportProgress,
} from "../backend/publishedCharts";

const pageSize = 100;
const emptyEntries: PublishedChartEntries = { totalRows: 0, entries: [] };

function savedValue(key: string, fallback: string) {
  try {
    return window.localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function formatWeek(value: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function formatCount(value: number) {
  return new Intl.NumberFormat().format(value);
}

function detail(label: string, value: string | undefined) {
  if (!value?.trim()) return null;
  return <div className="published-detail-field"><dt>{label}</dt><dd>{value}</dd></div>;
}

export function PublishedChartsWorkspace() {
  const [folder, setFolder] = useState(() => savedValue("publishedCharts.folder", "Charts"));
  const [catalog, setCatalog] = useState<PublishedChartCatalog | null>(null);
  const [chart, setChart] = useState(() => savedValue("publishedCharts.chart", "Billboard Hot 100"));
  const [year, setYear] = useState(() => Number(savedValue("publishedCharts.year", "0")));
  const [week, setWeek] = useState(() => savedValue("publishedCharts.week", ""));
  const [weeks, setWeeks] = useState<PublishedChartWeek[]>([]);
  const [entries, setEntries] = useState<PublishedChartEntries>(emptyEntries);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<PublishedChartEntry | null>(null);
  const [seriesSearch, setSeriesSearch] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState<PublishedChartsImportProgress | null>(null);
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const refreshCatalog = useCallback(async () => {
    try {
      const result = await getPublishedChartCatalog();
      setCatalog(result);
    } catch (cause) {
      setError(String(cause));
    }
  }, []);

  useEffect(() => { void refreshCatalog(); }, [refreshCatalog]);
  useEffect(() => {
    try { window.localStorage.setItem("publishedCharts.folder", folder); } catch { /* unavailable */ }
  }, [folder]);
  useEffect(() => {
    try {
      window.localStorage.setItem("publishedCharts.chart", chart);
      window.localStorage.setItem("publishedCharts.year", String(year));
      window.localStorage.setItem("publishedCharts.week", week);
    } catch { /* unavailable */ }
  }, [chart, year, week]);

  const series = catalog?.series.find((item) => item.chart === chart);
  const visibleSeries = useMemo(() => {
    const search = seriesSearch.trim().toLocaleLowerCase();
    return (catalog?.series ?? []).filter(
      (item) => item.chart === chart || item.chart.toLocaleLowerCase().includes(search),
    );
  }, [catalog, chart, seriesSearch]);

  useEffect(() => {
    if (catalog?.series.length && !series) {
      setChart(catalog.series.find((item) => item.chart === "Billboard Hot 100")?.chart ?? catalog.series[0].chart);
    }
  }, [catalog, series]);

  useEffect(() => {
    if (series && !series.years.includes(year)) {
      setYear(series.years[series.years.length - 1]);
    }
  }, [series, year]);

  useEffect(() => {
    if (!series || !series.years.includes(year)) return;
    let active = true;
    setWeeks([]);
    setEntries(emptyEntries);
    setSelected(null);
    void listPublishedChartWeeks(chart, year)
      .then((result) => {
        if (!active) return;
        setWeeks(result);
        setWeek((previous) => result.some((item) => item.weekEnding === previous)
          ? previous : result[result.length - 1]?.weekEnding ?? "");
      })
      .catch((cause) => { if (active) setError(String(cause)); });
    return () => { active = false; };
  }, [chart, year, series]);

  useEffect(() => {
    if (!week || !weeks.some((item) => item.weekEnding === week)) return;
    let active = true;
    setIsLoading(true);
    setSelected(null);
    void getPublishedChartEntries(chart, week, offset)
      .then((result) => { if (active) { setEntries(result); setError(""); } })
      .catch((cause) => { if (active) setError(String(cause)); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [chart, week, weeks, offset]);

  async function chooseFolder() {
    try {
      const chosen = await selectPublishedChartsFolder(folder === "Charts" ? undefined : folder);
      if (chosen) setFolder(chosen);
    } catch (cause) {
      setError(String(cause));
    }
  }

  async function runImport() {
    setIsImporting(true);
    setProgress(null);
    setImportMessage("");
    setImportError("");
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = await subscribePublishedChartsImportProgress(setProgress);
      const result = await importPublishedCharts(folder);
      setImportMessage(`Imported ${formatCount(result.rowsImported)} rows from ${result.yearsImported} years across ${result.chartSeries} charts.`);
    } catch (cause) {
      setImportError(String(cause));
    } finally {
      unsubscribe?.();
      setIsImporting(false);
      await refreshCatalog();
    }
  }

  const weekIndex = weeks.findIndex((item) => item.weekEnding === week);
  const currentPage = Math.floor(offset / pageSize) + 1;
  const pageCount = Math.max(1, Math.ceil(entries.totalRows / pageSize));

  return (
    <section className="workspace published-charts-workspace">
      <header className="topbar">
        <div>
          <h1>Published Charts</h1>
          <p>Explore the original weekly US rankings, including songs outside your library.</p>
        </div>
        <button className="icon-button" type="button" aria-label="Refresh published charts" onClick={() => { setError(""); void refreshCatalog(); }}>
          <RotateCcw size={18} />
        </button>
      </header>

      <section className="published-import-panel" aria-label="Import published charts">
        <div className="published-import-heading">
          <div><strong>US singles source</strong><span>Uses each year’s all_charts.csv and chart_inventory.csv.</span></div>
          {catalog ? <span className="published-count">{formatCount(catalog.totalRows)} rows · {catalog.importedYears} years · {catalog.series.length} charts</span> : null}
        </div>
        <div className="published-import-controls">
          <label><span>Charts folder</span><input value={folder} onChange={(event) => setFolder(event.target.value)} disabled={isImporting} /></label>
          <button className="secondary-button" type="button" onClick={() => void chooseFolder()} disabled={isImporting}><FolderOpen size={16} /> Browse</button>
          <button className="primary-button" type="button" onClick={() => void runImport()} disabled={isImporting || !folder.trim()}>{isImporting ? "Importing…" : catalog?.importedYears ? "Reimport US charts" : "Import US charts"}</button>
        </div>
        {progress ? <p className="published-progress" role="status">Imported {progress.completedYears} of {progress.totalYears} years · through {progress.currentYear} · {formatCount(progress.importedRows)} rows</p> : null}
        {importMessage ? <p className="published-success" role="status">{importMessage}</p> : null}
        {importError ? <p className="published-error" role="alert">{importError}</p> : null}
        {error ? <p className="published-error" role="alert">{error}</p> : null}
      </section>

      {catalog?.series.length ? (
        <>
          <section className="published-picker" aria-label="Choose published chart and week">
            <label><span>Find a chart</span><input type="search" value={seriesSearch} onChange={(event) => setSeriesSearch(event.target.value)} placeholder="Rock, rap, airplay…" /></label>
            <label><span>Chart</span><select value={chart} onChange={(event) => { setChart(event.target.value); setOffset(0); }}>
              {visibleSeries.map((item) => <option key={item.chart} value={item.chart}>{item.chart}</option>)}
            </select></label>
            <label><span>Year</span><select value={year} onChange={(event) => { setYear(Number(event.target.value)); setOffset(0); }}>
              {[...(series?.years ?? [])].reverse().map((value) => <option key={value} value={value}>{value}</option>)}
            </select></label>
            <label><span>Week ending</span><select value={week} onChange={(event) => { setWeek(event.target.value); setOffset(0); }}>
              {[...weeks].reverse().map((item) => <option key={item.weekEnding} value={item.weekEnding}>{formatWeek(item.weekEnding)} · {item.rows} entries</option>)}
            </select></label>
          </section>

          <section className="published-chart-panel" aria-label="Published chart rankings">
            <div className="published-chart-heading">
              <div><h2>{chart}</h2><p>{week ? `Week ending ${formatWeek(week)}` : "Choose a week"} · {formatCount(entries.totalRows)} positions</p></div>
              <div className="published-week-nav">
                <button className="icon-button" type="button" aria-label="Previous chart week" disabled={weekIndex <= 0} onClick={() => { setWeek(weeks[weekIndex - 1].weekEnding); setOffset(0); }}><ChevronLeft size={18} /></button>
                <button className="icon-button" type="button" aria-label="Next chart week" disabled={weekIndex < 0 || weekIndex >= weeks.length - 1} onClick={() => { setWeek(weeks[weekIndex + 1].weekEnding); setOffset(0); }}><ChevronRight size={18} /></button>
              </div>
            </div>
            <div className="published-chart-layout">
              <div className="published-table-wrap">
                <table className="published-chart-table"><thead><tr><th scope="col">#</th><th scope="col">Song / artist</th><th scope="col">Last</th><th scope="col">Weeks</th><th scope="col">Peak*</th></tr></thead>
                  <tbody>{entries.entries.map((entry) => <tr key={entry.id} className={selected?.id === entry.id ? "selected" : ""}>
                    <td className="published-rank">{entry.position}</td>
                    <td><button type="button" className="published-song" aria-pressed={selected?.id === entry.id} onClick={() => setSelected(entry)}><strong>{entry.title}</strong><span>{entry.artist}</span></button></td>
                    <td>{entry.entryStatus || entry.lastWeek || "—"}</td><td>{entry.weeksOnChart || "—"}</td><td>{entry.peakPosition || "—"}</td>
                  </tr>)}</tbody></table>
                {isLoading ? <p className="published-table-message">Loading chart…</p> : !entries.entries.length ? <p className="published-table-message">No rows for this week.</p> : null}
                <p className="published-source-note">* Stated peak can refer to a week after this chart date.</p>
                {entries.totalRows > pageSize ? <div className="published-pager"><button type="button" className="secondary-button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - pageSize))}>Previous</button><span>Page {currentPage} of {pageCount}</span><button type="button" className="secondary-button" disabled={currentPage >= pageCount} onClick={() => setOffset(offset + pageSize)}>Next</button></div> : null}
              </div>
              <aside className="published-entry-detail" aria-label="Selected chart entry">
                {selected ? <><span className="published-detail-kicker">#{selected.position} · {formatWeek(week)}</span><h3>{selected.title}</h3><p className="published-detail-artist">{selected.artist}</p>
                  <dl>{detail("Last week", selected.lastWeek)}{detail("Weeks on chart", selected.weeksOnChart)}{detail("Entry", selected.entryStatus)}{detail("Movement", selected.movement)}{detail("Stated peak", selected.peakPosition)}{detail("First entered", selected.entryDate)}{detail("Stated peak date", selected.peakDate)}{detail("Label", selected.label)}{detail("Format", selected.format)}{detail("Catalog / ISRC", selected.catalogueNumber)}{detail("Duration", selected.duration)}{detail("Release type", selected.releaseType)}{detail("Number one marker", selected.numberOneMarker)}{detail("Source", `${selected.book} · page ${selected.sourcePage}`)}</dl>
                  <p className="published-source-note">* Peak fields are retrospective source annotations; they may refer to a later week.</p>
                </> : <p>Select a song to see its source details.</p>}
              </aside>
            </div>
          </section>
        </>
      ) : <section className="published-empty"><h2>Ready to explore US chart history</h2><p>Choose the local Charts folder and import its US singles books. The original year-end Billboard rankings remain separate.</p></section>}
    </section>
  );
}
