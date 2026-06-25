export type ImportRun = {
  id: number;
  sourcePath: string;
  sourceSizeBytes: number;
  startedAt: string;
  completedAt: string | null;
  status: string;
  trackRows: number;
  albumCount: number;
  durationMs: number;
  backupPath: string | null;
  errorMessage: string | null;
};

export type LibraryStatus = {
  dbPath: string;
  hasDatabase: boolean;
  trackCount: number;
  albumCount: number;
  importRunCount: number;
  lastImport: ImportRun | null;
};

export type ImportProgress = {
  status: string;
  processedRows: number;
  albumCount: number;
  message: string;
};

export type ImportSummary = {
  importRun: ImportRun;
  trackRows: number;
  albumCount: number;
  durationMs: number;
  backupPath: string | null;
};

