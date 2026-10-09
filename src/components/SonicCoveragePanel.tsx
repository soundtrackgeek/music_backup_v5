import { useRef, useState } from "react";
import { checkAnalysisCoverage, exportMissingAnalysis, type AnalysisCoverage } from "../backend/sonicDiagnostics";

export function SonicCoveragePanel() {
  const [report, setReport] = useState<AnalysisCoverage | null>(null);
  const [cursors, setCursors] = useState<(number | null)[]>([null]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [checkedAt, setCheckedAt] = useState("");
  const serial = useRef(0);
  async function check(next: (number | null)[] = [null]) {
    const id = ++serial.current; setBusy(true); setError(""); setMessage("");
    try { const result = await checkAnalysisCoverage(next[next.length - 1] ?? null); if (id === serial.current) { setReport(result); setCursors(next); setCheckedAt(new Date().toISOString()); } }
    catch (e) { if (id === serial.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (id === serial.current) setBusy(false); }
  }
  async function exportCsv() {
    setBusy(true); setError(""); setMessage("");
    try { const result = await exportMissingAnalysis(); if (result) setMessage(`Exported ${result.rowCount.toLocaleString()} tracks missing analysis to ${result.path}.`); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  return <details className="sonic-diagnostics">
    <summary>Analysis coverage check</summary>
    <p>Compare every cataloged MP3 in Music Library’s master database with completed results for the current analysis profile. Run this after your library scan to find anything left over.</p>
    <div className="sonic-analysis-actions"><button type="button" disabled={busy} onClick={() => void check()}>Check analysis coverage</button><button type="button" disabled={busy || !report?.missing} onClick={() => void exportCsv()}>Export missing analysis CSV</button></div>
    <p>This checks saved database results without decoding audio or checking whether every music file is currently accessible. Tracks without results are listed separately from recorded failures.</p>
    {busy && <p role="status">Checking saved analysis…</p>}
    {report && <>
      <p>Checked {new Date(checkedAt).toLocaleString()}. Recheck for newly completed results.</p>
      <p role="status">{report.analyzed.toLocaleString()} of {report.total.toLocaleString()} MP3s have saved analysis · {report.missing.toLocaleString()} missing · {report.failed.toLocaleString()} recorded failures · {(report.missing - report.failed).toLocaleString()} need analysis.</p>
      {!report.missing && <p>Every cataloged MP3 has completed analysis for the current profile.</p>}
      <ol className="sonic-diagnostic-list" aria-label="Tracks missing analysis">{report.rows.map(row => <li key={row.trackId}><strong>{row.filename}</strong><span>{row.directory}</span><p><b>{row.failed ? "Failed" : "Needs analysis"}:</b> {row.reason}</p></li>)}</ol>
      {report.missing > 0 && <div className="sonic-analysis-actions"><button type="button" disabled={busy || cursors.length === 1} onClick={() => void check(cursors.slice(0, -1))}>Previous missing tracks</button><span>Page {cursors.length}</span><button type="button" disabled={busy || report.nextCursor === null} onClick={() => void check([...cursors, report.nextCursor])}>Next missing tracks</button></div>}
      <p>Use Retry failed tracks for recorded errors. Analyze library picks up other missing results and reuses completed work. CSV export includes all gaps at the time of export.</p>
    </>}
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </details>;
}
