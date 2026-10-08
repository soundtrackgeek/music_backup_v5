import { useEffect, useRef, useState } from "react";
import { analysisBackupFolder, chooseAnalysisBackup, chooseAnalysisBackupFolder, exportAnalysisBackup, inspectAnalysisBackup, restoreAnalysisBackup, type AnalysisBackup } from "../backend/sonicBackup";
import { SonicAutomaticBackup } from "./SonicAutomaticBackup";

export function SonicBackupPanel({ onVerify }: { onVerify: () => Promise<void> }) {
  const [folder, setFolder] = useState("");
  const [review, setReview] = useState<AnalysisBackup | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    void analysisBackupFolder().then(path => { if (live.current) setFolder(path ?? ""); }).catch(e => { if (live.current) setError(String(e)); });
    return () => { live.current = false; };
  }, []);
  async function perform(action: () => Promise<void>) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); }
    catch (e) { if (live.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (live.current) setBusy(false); }
  }
  return <details className="sonic-backup"><summary>Backup and cross-PC reuse</summary>
    <p>Save completed audio features to OneDrive, then restore them in Music Library on another computer.</p>
    <p className="sonic-backup-path">Backup folder: {folder || "Choose your OneDrive _musicbackup folder below."}</p>
    <div className="sonic-analysis-actions">
      <button type="button" disabled={busy} onClick={() => void perform(async () => { const next = await chooseAnalysisBackupFolder(folder); if (next && live.current) setFolder(next); })}>Choose backup folder</button>
      <button type="button" disabled={busy || !folder} onClick={() => void perform(async () => { const saved = await exportAnalysisBackup(folder); if (live.current) setMessage(`Saved ${saved.audioCount.toLocaleString()} audio results to ${saved.path}. Wait for OneDrive to finish uploading before using the backup on another computer.`); })}>Back up analysis</button>
      <button type="button" disabled={busy} onClick={() => void perform(async () => { setReview(null); const path = await chooseAnalysisBackup(folder); if (path) { const info = await inspectAnalysisBackup(path); if (live.current) setReview(info); } })}>Choose backup to restore</button>
    </div>
    {review && <div className="sonic-backup-review">
      <p><strong>{review.audioCount.toLocaleString()} reusable audio results</strong> · {new Date(review.createdAt).toLocaleString()} · {(review.databaseBytes / 1024 / 1024).toFixed(1)} MiB</p>
      <p className="sonic-backup-path">{review.path}</p>
      <p>Merge with this computer’s results. Existing compatible results are backed up locally first. Pause audio analysis in Activity Center before restoring.</p>
      <button type="button" disabled={busy} onClick={() => void perform(async () => { const result = await restoreAnalysisBackup(review); if (live.current) { setReview(null); setMessage(`Merged ${result.added.toLocaleString()} audio results; ${result.alreadyPresent.toLocaleString()} already present.${result.safetyBackup ? ` Safety backup: ${result.safetyBackup}.` : ""} Run Verify reused analysis to match these results to your local files.`); } })}>Merge this backup</button>
    </div>}
    <SonicAutomaticBackup folder={folder} disabled={busy} />
    <div className="sonic-analysis-actions"><button type="button" disabled={busy} onClick={() => void perform(onVerify)}>Verify reused analysis</button></div>
    <p>Verification checks cataloged MP3 fingerprints without decoding. It follows your idle schedule and supports pause, resume and cancel in Activity Center. Each verified track becomes available to Aurora immediately. Normal analysis also reuses restored results.</p>
    <p>Catalog and music files must be available on this computer. Restoring preserves local settings and jobs. No music files are included.</p>
    {busy && <p role="status">Working on analysis backup…</p>}{message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </details>;
}
