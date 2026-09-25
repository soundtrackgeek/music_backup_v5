import { invoke, isTauriRuntime, listen, selectDirectory } from "./tauriClient";

export type PublishedChartSeries = {
  chart: string;
  years: number[];
  firstWeek: string;
  lastWeek: string;
  rows: number;
};

export type PublishedChartCatalog = {
  importedYears: number;
  totalRows: number;
  series: PublishedChartSeries[];
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

export function getPublishedChartCatalog(): Promise<PublishedChartCatalog> {
  if (!isTauriRuntime()) {
    return Promise.resolve({ importedYears: 0, totalRows: 0, series: [] });
  }
  return invoke("get_published_chart_catalog");
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
  return invoke("import_published_charts", { sourcePath });
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

export function selectPublishedChartsFolder(defaultPath?: string) {
  if (!isTauriRuntime()) return Promise.resolve(null);
  return selectDirectory(defaultPath, "Choose Charts folder");
}
