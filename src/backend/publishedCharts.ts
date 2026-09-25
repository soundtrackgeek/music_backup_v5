import { invoke, isTauriRuntime, listen } from "./tauriClient";

export type PublishedChartSeries = {
  chart: string;
  years: number[];
  firstWeek: string;
  lastWeek: string;
  rows: number;
};

export type PublishedChartCatalog = {
  importedYears: number;
  inventoryYears: number;
  needsImport: boolean;
  totalRows: number;
  series: PublishedChartSeries[];
};

export type PublishedArtistRow = {
  rank: number;
  artist: string;
  numberOneWeeks: number;
  chartWeeks: number;
  appearances: number;
  bestPosition: number;
};

export type PublishedArtistRanking = {
  totalArtists: number;
  chartWeeks: number;
  totalEntries: number;
  artists: PublishedArtistRow[];
};

export type PublishedChartWeek = {
  weekEnding: string;
  rows: number;
};

export type PublishedChartEntry = {
  id: number;
  position: number;
  lastWeek: string;
  weeksOnChart: string;
  entryStatus: string;
  movement: string;
  title: string;
  artist: string;
  numberOneMarker: string;
  label: string;
  format: string;
  catalogueNumber: string;
  releaseType: string;
  duration: string;
  peakPosition: string;
  entryDate: string;
  peakDate: string;
  bpiAward: string;
  sourcePage: string;
  book: string;
};

export type PublishedChartEntries = {
  totalRows: number;
  entries: PublishedChartEntry[];
};

export type PublishedChartsImportProgress = {
  completedYears: number;
  totalYears: number;
  currentYear: number;
  importedRows: number;
};

export type PublishedChartsImportSummary = {
  sourcePath: string;
  yearsImported: number;
  chartSeries: number;
  rowsImported: number;
  durationMs: number;
};

let ongoingImport: Promise<PublishedChartsImportSummary> | null = null;

export function getPublishedChartCatalog(sourcePath: string): Promise<PublishedChartCatalog> {
  if (!isTauriRuntime()) {
    return Promise.resolve({ importedYears: 0, inventoryYears: 0, needsImport: false, totalRows: 0, series: [] });
  }
  return invoke("get_published_chart_catalog", { sourcePath });
}

export function getPublishedArtistRankings(
  chart: string,
  fromYear: number,
  toYear: number,
  fromWeek: string | null,
  toWeek: string | null,
  offset: number,
): Promise<PublishedArtistRanking> {
  if (!isTauriRuntime()) return Promise.resolve({ totalArtists: 0, chartWeeks: 0, totalEntries: 0, artists: [] });
  return invoke("get_published_artist_rankings", { chart, fromYear, toYear, fromWeek, toWeek, offset });
}

export function listPublishedChartWeeks(chart: string, year: number): Promise<PublishedChartWeek[]> {
  if (!isTauriRuntime()) return Promise.resolve([]);
  return invoke("list_published_chart_weeks", { chart, year });
}

export function getPublishedChartEntries(
  chart: string,
  week: string,
  offset: number,
): Promise<PublishedChartEntries> {
  if (!isTauriRuntime()) return Promise.resolve({ totalRows: 0, entries: [] });
  return invoke("get_published_chart_entries", { chart, week, offset });
}

export function importPublishedCharts(sourcePath: string): Promise<PublishedChartsImportSummary> {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Published Charts import is available in the desktop app."));
  }
  if (!ongoingImport) {
    ongoingImport = invoke<PublishedChartsImportSummary>("import_published_charts", { sourcePath })
      .finally(() => { ongoingImport = null; });
  }
  return ongoingImport;
}

export function subscribePublishedChartsImportProgress(
  callback: (progress: PublishedChartsImportProgress) => void,
) {
  if (!isTauriRuntime()) return Promise.resolve(() => undefined);
  return listen<PublishedChartsImportProgress>(
    "published-charts-import-progress",
    (event) => callback(event.payload),
  );
}
