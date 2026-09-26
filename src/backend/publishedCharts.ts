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

export function getPublishedChartCatalog(): Promise<PublishedChartCatalog> {
  if (!isTauriRuntime()) {
    return Promise.resolve({ importedYears: 0, inventoryYears: 0, needsImport: false, totalRows: 0, series: [] });
  }
  return invoke("get_published_chart_catalog");
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

export function importPublishedCharts(): Promise<PublishedChartsImportSummary> {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Published Charts import is available in the desktop app."));
  }
  if (!ongoingImport) {
    ongoingImport = invoke<PublishedChartsImportSummary>("import_published_charts")
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

export type PublishedSongRow = PublishedArtistRow & { title: string; firstWeek: string; lastWeek: string };
export type PublishedSongRanking = { totalSongs: number; chartWeeks: number; totalEntries: number; songs: PublishedSongRow[] };
export type PublishedSongWeek = { weekEnding: string; position: number; entryStatus: string; entryDate: string };
export function getPublishedSongRankings(chart: string, fromYear: number, toYear: number, fromWeek: string | null, toWeek: string | null, offset: number): Promise<PublishedSongRanking> {
  if (!isTauriRuntime()) return Promise.resolve({ totalSongs: 0, chartWeeks: 0, totalEntries: 0, songs: [] });
  return invoke("get_published_song_rankings", { chart, fromYear, toYear, fromWeek, toWeek, offset });
}
export function getPublishedSongHistory(chart: string, artist: string, title: string): Promise<PublishedSongWeek[]> {
  if (!isTauriRuntime()) return Promise.resolve([]);
  return invoke("get_published_song_history", { chart, artist, title });
}
