import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import {
  getPublishedArtistRankings,
  getPublishedChartCatalog,
  getPublishedChartEntries,
  importPublishedCharts,
  listPublishedChartWeeks,
  subscribePublishedChartsImportProgress,
  type PublishedArtistRanking,
  type PublishedChartCatalog,
  type PublishedChartEntry,
  type PublishedChartEntries,
  type PublishedChartWeek,
  type PublishedChartsImportProgress,
} from "../backend/publishedCharts";

const pageSize = 100;
const emptyRanking: PublishedArtistRanking = { totalArtists: 0, chartWeeks: 0, totalEntries: 0, artists: [] };
const emptyEntries: PublishedChartEntries = { totalRows: 0, entries: [] };

function savedValue(key: string, fallback: string) {
  try { return window.localStorage.getItem(key) || fallback; } catch { return fallback; }
}

function formatWeek(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}

function formatCount(value: number) { return new Intl.NumberFormat().format(value); }

function detail(label: string, value: string | undefined) {
  if (!value?.trim()) return null;
  return <div className="published-detail-field"><dt>{label}</dt><dd>{value}</dd></div>;
}

export function PublishedChartsWorkspace() {
  const [folder, setFolder] = useState(() => savedValue("publishedCharts.folder", "Charts"));
  const [catalog, setCatalog] = useState<PublishedChartCatalog | null>(null);
  const [chart, setChart] = useState(() => savedValue("publishedCharts.chart", "Billboard Hot 100"));
  const [fromYear, setFromYear] = useState(() => Number(savedValue("publishedCharts.fromYear", "0")));
  const [toYear, setToYear] = useState(() => Number(savedValue("publishedCharts.toYear", "0")));
  const [fromWeek, setFromWeek] = useState(() => savedValue("publishedCharts.fromWeek", ""));
  const [toWeek, setToWeek] = useState(() => savedValue("publishedCharts.toWeek", ""));
  const [fromWeeks, setFromWeeks] = useState<PublishedChartWeek[]>([]);
  const [toWeeks, setToWeeks] = useState<PublishedChartWeek[]>([]);
  const [ranking, setRanking] = useState<PublishedArtistRanking>(emptyRanking);
  const [entries, setEntries] = useState<PublishedChartEntries>(emptyEntries);
  const [offset, setOffset] = useState(0);
  const [entryOffset, setEntryOffset] = useState(0);
  const [selected, setSelected] = useState<PublishedChartEntry | null>(null);
  const [seriesSearch, setSeriesSearch] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState<PublishedChartsImportProgress | null>(null);
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const autoImportAttempted = useRef("");

  const refreshCatalog = useCallback(async () => {
    try {
      const result = await getPublishedChartCatalog(folder);
      setCatalog(result);
      setError("");
    } catch (cause) { setError(String(cause)); }
  }, [folder]);

  useEffect(() => { void refreshCatalog(); }, [refreshCatalog]);
  useEffect(() => {
    try { window.localStorage.setItem("publishedCharts.folder", folder); } catch { /* unavailable */ }
  }, [folder]);
  useEffect(() => {
    try {
      window.localStorage.setItem("publishedCharts.chart", chart);
      window.localStorage.setItem("publishedCharts.fromYear", String(fromYear));
      window.localStorage.setItem("publishedCharts.toYear", String(toYear));
      window.localStorage.setItem("publishedCharts.fromWeek", fromWeek);
      window.localStorage.setItem("publishedCharts.toWeek", toWeek);
    } catch { /* unavailable */ }
  }, [chart, fromYear, toYear, fromWeek, toWeek]);

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
    if (!series) return;
    const latest = series.years[series.years.length - 1];
    if (!series.years.includes(fromYear)) setFromYear(latest);
    if (!series.years.includes(toYear)) setToYear(latest);
  }, [series, fromYear, toYear]);

  useEffect(() => {
    if (!series?.years.includes(fromYear) || !catalog?.importedYears) { setFromWeeks([]); return; }
    let active = true;
    void listPublishedChartWeeks(chart, fromYear)
      .then((result) => {
        if (!active) return;
        setFromWeeks(result);
        setFromWeek((value) => result.some((item) => item.weekEnding === value) ? value : "");
      })
      .catch((cause) => { if (active) setError(String(cause)); });
    return () => { active = false; };
  }, [chart, fromYear, series, catalog?.importedYears]);

  useEffect(() => {
    if (!series?.years.includes(toYear) || !catalog?.importedYears) { setToWeeks([]); return; }
    let active = true;
    void listPublishedChartWeeks(chart, toYear)
      .then((result) => {
        if (!active) return;
        setToWeeks(result);
        setToWeek((value) => result.some((item) => item.weekEnding === value) ? value : "");
      })
      .catch((cause) => { if (active) setError(String(cause)); });
    return () => { active = false; };
  }, [chart, toYear, series, catalog?.importedYears]);

  const effectiveFromWeek = fromWeeks.some((item) => item.weekEnding === fromWeek) ? fromWeek : "";
  const effectiveToWeek = toWeeks.some((item) => item.weekEnding === toWeek) ? toWeek : "";
  const validRange = fromYear <= toYear &&
    (fromYear !== toYear || !effectiveFromWeek || !effectiveToWeek || effectiveFromWeek <= effectiveToWeek);
  const exactWeek = fromYear === toYear && effectiveFromWeek && effectiveFromWeek === effectiveToWeek
    ? effectiveFromWeek : "";

  useEffect(() => {
    if (!series || !catalog?.importedYears || !validRange || isImporting) {
      setRanking(emptyRanking);
      return;
    }
    let active = true;
    setIsLoading(true);
    void getPublishedArtistRankings(chart, fromYear, toYear, effectiveFromWeek || null, effectiveToWeek || null, offset)
      .then((result) => { if (active) { setRanking(result); setError(""); } })
      .catch((cause) => { if (active) setError(String(cause)); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [chart, fromYear, toYear, effectiveFromWeek, effectiveToWeek, offset, series, catalog?.importedYears, validRange, isImporting]);

  useEffect(() => {
    if (!exactWeek || !catalog?.importedYears || isImporting) {
      setEntries(emptyEntries);
      setSelected(null);
      return;
    }
    let active = true;
    setSelected(null);
    void getPublishedChartEntries(chart, exactWeek, entryOffset)
      .then((result) => { if (active) setEntries(result); })
      .catch((cause) => { if (active) setError(String(cause)); });
    return () => { active = false; };
  }, [chart, exactWeek, entryOffset, catalog?.importedYears, isImporting]);

  async function runImport() {
    if (isImporting) return;
    setIsImporting(true);
    setProgress(null);
    setImportMessage("");
    setImportError("");
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = await subscribePublishedChartsImportProgress(setProgress);
      const result = await importPublishedCharts(folder);
      setImportMessage(`Imported ${formatCount(result.rowsImported)} rows from ${result.yearsImported} years across ${result.chartSeries} charts.`);
    } catch (cause) { setImportError(String(cause)); }
    finally {
      unsubscribe?.();
      setIsImporting(false);
      await refreshCatalog();
    }
  }

  useEffect(() => {
    if (catalog?.needsImport && autoImportAttempted.current !== folder) {
      autoImportAttempted.current = folder;
      void runImport();
    }
  }, [catalog, folder]);

  const pageCount = Math.max(1, Math.ceil(ranking.totalArtists / pageSize));
  const entryPageCount = Math.max(1, Math.ceil(entries.totalRows / pageSize));
  const dateLabel = fromYear === toYear ? String(fromYear) : `${fromYear}–${toYear}`;

  return <section className="workspace published-charts-workspace">
    <header className="topbar">
      <div><h1>Published Charts</h1><p>US chart history, ranked by published artist credit.</p></div>
      <button className="icon-button" type="button" aria-label="Refresh published charts" onClick={() => { setError(""); void refreshCatalog(); }}><RotateCcw size={18} /></button>
    </header>

    {catalog?.series.length ? <section className="published-picker" aria-label="Choose published chart range">
      <label><span>Find a chart</span><input type="search" value={seriesSearch} onChange={(event) => setSeriesSearch(event.target.value)} placeholder="Rock, rap, airplay…" /></label>
      <label><span>Chart</span><select value={chart} onChange={(event) => { setChart(event.target.value); setFromWeek(""); setToWeek(""); setOffset(0); setEntryOffset(0); }}>
        {visibleSeries.map((item) => <option key={item.chart} value={item.chart}>{item.chart}</option>)}
      </select></label>
      <label><span>From year</span><select value={fromYear} onChange={(event) => {
        const value = Number(event.target.value); setFromYear(value); if (value > toYear) setToYear(value);
        setFromWeek(""); setOffset(0); setEntryOffset(0);
      }}>{series?.years.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label><span>From week</span><select value={effectiveFromWeek} onChange={(event) => { setFromWeek(event.target.value); setOffset(0); setEntryOffset(0); }}>
        <option value="">First week of year</option>{fromWeeks.map((item) => <option key={item.weekEnding} value={item.weekEnding}>{formatWeek(item.weekEnding)}</option>)}
      </select></label>
      <label><span>To year</span><select value={toYear} onChange={(event) => {
        const value = Number(event.target.value); setToYear(value); if (value < fromYear) setFromYear(value);
        setToWeek(""); setOffset(0); setEntryOffset(0);
      }}>{series?.years.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label><span>To week</span><select value={effectiveToWeek} onChange={(event) => { setToWeek(event.target.value); setOffset(0); setEntryOffset(0); }}>
        <option value="">Last week of year</option>{toWeeks.map((item) => <option key={item.weekEnding} value={item.weekEnding}>{formatWeek(item.weekEnding)}</option>)}
      </select></label>
    </section> : null}

    <details className="published-import-panel">
      <summary>Chart source · {catalog?.inventoryYears ?? 0} years available · {catalog?.importedYears ?? 0} imported</summary>
      <p>Chart choices come from chart_inventory.csv. The local US weekly rows import automatically when the folder is found.</p>
      <div className="published-import-controls">
        <label><span>Charts folder</span><input value={folder} onChange={(event) => { setFolder(event.target.value); setCatalog(null); autoImportAttempted.current = ""; }} disabled={isImporting} /></label>
        <button className="secondary-button" type="button" onClick={() => void runImport()} disabled={isImporting || !folder.trim()}>{isImporting ? "Importing…" : "Reimport US charts"}</button>
      </div>
      {progress ? <p className="published-progress" role="status">Imported {progress.completedYears} of {progress.totalYears} years · through {progress.currentYear} · {formatCount(progress.importedRows)} rows</p> : null}
      {importMessage ? <p className="published-success" role="status">{importMessage}</p> : null}
    </details>
    {isImporting ? <p className="published-progress" role="status">Importing US charts… {progress ? `${progress.completedYears} of ${progress.totalYears} years` : "Starting"}</p> : null}
    {importError ? <p className="published-error" role="alert">{importError}</p> : null}
    {error ? <p className="published-error" role="alert">{error}</p> : null}

    {series ? <section className="published-chart-panel" aria-label="Published artist ranking">
      <div className="published-chart-heading"><div><h2>{chart}</h2><p>{dateLabel}{effectiveFromWeek || effectiveToWeek ? ` · ${effectiveFromWeek ? formatWeek(effectiveFromWeek) : "first week"} to ${effectiveToWeek ? formatWeek(effectiveToWeek) : "last week"}` : " · all weeks"}</p></div>
        {catalog ? <span className="published-count">{formatCount(ranking.totalArtists)} artists · {formatCount(ranking.chartWeeks)} chart weeks · {formatCount(ranking.totalEntries)} entries</span> : null}
      </div>
      <p className="published-source-note">Artists are credited exactly as printed. Each distinct week at position 1 counts once per credit; ties use chart weeks, then appearances, then name.</p>
      {!validRange ? <p className="published-error">Choose a last week on or after the first week.</p> : null}
      {validRange && catalog?.importedYears ? <div className="published-table-wrap">
        <table className="published-chart-table published-artist-table"><thead><tr><th scope="col">#</th><th scope="col">Artist credit</th><th scope="col">#1 weeks</th><th scope="col">Chart weeks</th><th scope="col">Entries</th><th scope="col">Best</th></tr></thead>
          <tbody>{ranking.artists.map((item) => <tr key={item.artist}><td className="published-rank">{item.rank}</td><td>{item.artist}</td><td>{item.numberOneWeeks}</td><td>{item.chartWeeks}</td><td>{item.appearances}</td><td>{item.bestPosition}</td></tr>)}</tbody>
        </table>
        {isLoading ? <p className="published-table-message">Calculating artist ranks…</p> : !ranking.artists.length ? <p className="published-table-message">No chart entries in this range.</p> : null}
        {ranking.totalArtists > pageSize ? <div className="published-pager"><button className="secondary-button" type="button" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - pageSize))}>Previous</button><span>Page {Math.floor(offset / pageSize) + 1} of {pageCount}</span><button className="secondary-button" type="button" disabled={Math.floor(offset / pageSize) + 1 >= pageCount} onClick={() => setOffset(offset + pageSize)}>Next</button></div> : null}
      </div> : <p className="published-table-message">{isImporting ? "Importing the weekly chart data…" : "Set a Charts folder containing chart_inventory.csv to load the weekly rows."}</p>}
    </section> : <section className="published-empty"><h2>Chart inventory unavailable</h2><p>Enter the local Charts folder under Chart source. All US chart series will then appear here.</p></section>}

    {exactWeek && catalog?.importedYears ? <section className="published-chart-panel" aria-label="Weekly published chart">
      <div className="published-chart-heading"><div><h2>Published positions</h2><p>Week ending {formatWeek(exactWeek)} · {formatCount(entries.totalRows)} entries</p></div></div>
      <div className="published-chart-layout"><div className="published-table-wrap">
        <table className="published-chart-table"><thead><tr><th scope="col">#</th><th scope="col">Song / artist</th><th scope="col">Last</th><th scope="col">Weeks</th><th scope="col">Peak*</th></tr></thead>
          <tbody>{entries.entries.map((entry) => <tr key={entry.id} className={selected?.id === entry.id ? "selected" : ""}><td className="published-rank">{entry.position}</td><td><button type="button" className="published-song" aria-pressed={selected?.id === entry.id} onClick={() => setSelected(entry)}><strong>{entry.title}</strong><span>{entry.artist}</span></button></td><td>{entry.entryStatus || entry.lastWeek || "—"}</td><td>{entry.weeksOnChart || "—"}</td><td>{entry.peakPosition || "—"}</td></tr>)}</tbody>
        </table>
        <p className="published-source-note">* Source peak fields can refer to a later week.</p>
        {entries.totalRows > pageSize ? <div className="published-pager"><button className="secondary-button" type="button" disabled={!entryOffset} onClick={() => setEntryOffset(Math.max(0, entryOffset - pageSize))}>Previous</button><span>Page {Math.floor(entryOffset / pageSize) + 1} of {entryPageCount}</span><button className="secondary-button" type="button" disabled={Math.floor(entryOffset / pageSize) + 1 >= entryPageCount} onClick={() => setEntryOffset(entryOffset + pageSize)}>Next</button></div> : null}
      </div><aside className="published-entry-detail" aria-label="Selected chart entry">
        {selected ? <><span className="published-detail-kicker">#{selected.position} · {formatWeek(exactWeek)}</span><h3>{selected.title}</h3><p className="published-detail-artist">{selected.artist}</p><dl>{detail("Last week", selected.lastWeek)}{detail("Weeks on chart", selected.weeksOnChart)}{detail("Entry", selected.entryStatus)}{detail("Movement", selected.movement)}{detail("Stated peak", selected.peakPosition)}{detail("First entered", selected.entryDate)}{detail("Stated peak date", selected.peakDate)}{detail("Label", selected.label)}{detail("Format", selected.format)}{detail("Catalog / ISRC", selected.catalogueNumber)}{detail("Duration", selected.duration)}{detail("Release type", selected.releaseType)}{detail("Number one marker", selected.numberOneMarker)}{detail("Source", `${selected.book} · page ${selected.sourcePage}`)}</dl></> : <p>Select a song to see its source details.</p>}
      </aside></div>
    </section> : null}
  </section>;
}
