import { useEffect, useState } from "react";
import { exportFailedTracks, getFailedTracks, type FailedTracksPage } from "../backend/sonicDiagnostics";

export function SonicFailuresPanel({ disabled, revision, onRetry }: { disabled: boolean; revision: number; onRetry: () => Promise<void> }) {
  const [page, setPage] = useState<FailedTracksPage | null>(null);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const after = cursors[cursors.length - 1] ?? null;
  useEffect(() => {
    let live = true; setLoading(true); setError("");
    void getFailedTracks(after).then(next => { if (live) setPage(next); }).catch(e => { if (live) setError(String(e)); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [after, refresh, revision]);
  async function exportCsv() {
    setExporting(true); setError(""); setMessage("");
    try { const result = await exportFailedTracks(); if (result) setMessage(`Exported ${result.rowCount.toLocaleString()} failed tracks to ${result.path}.`); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setExporting(false); }
  }
  function reset() { setCursors([null]); setRefresh(n => n + 1); }
  return <details className="sonic-diagnostics">
    <summary>Failed tracks{page ? ` (${page.total.toLocaleString()})` : ""}</summary>
    <p>Saved failures across analysis runs. Reasons stay here until that track succeeds. Retrying uses your analysis schedule and keeps completed work.</p>
    <div className="sonic-analysis-actions">
      <button type="button" disabled={disabled || loading || exporting || !page?.total} onClick={() => void onRetry()}>Retry failed tracks</button>
      <button type="button" disabled={loading || exporting || !page?.total} onClick={() => void exportCsv()}>Export failed tracks CSV</button>
      <button type="button" disabled={loading || exporting} onClick={reset}>Refresh failed tracks</button>
    </div>
    <p>Retry queues only the saved failures. Finish or cancel an existing audio analysis job before starting a separate retry.</p>
    {loading ? <p role="status">Loading failed tracks…</p> : page?.total === 0 ? <p>No unresolved analysis failures.</p> : <>
      <ol className="sonic-diagnostic-list" aria-label="Failed tracks">
        {page?.rows.map(row => <li key={row.trackKey}><strong>{row.filename}</strong><span>{row.directory}</span><p>{row.error}</p><small>{row.lastFailedAt ? `Last failed: ${new Date(row.lastFailedAt).toLocaleString()}` : "Failure time unavailable."}</small></li>)}
      </ol>
      <div className="sonic-analysis-actions"><button type="button" disabled={cursors.length === 1} onClick={() => setCursors(items => items.slice(0, -1))}>Previous failed tracks</button><span>Page {cursors.length} · {page?.total.toLocaleString()} unresolved</span><button type="button" disabled={!page?.nextCursor} onClick={() => setCursors(items => [...items, page!.nextCursor])}>Next failed tracks</button></div>
    </>}
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </details>;
}
