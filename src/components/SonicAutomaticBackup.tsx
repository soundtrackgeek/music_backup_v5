import { useEffect, useRef, useState } from "react";
import { analysisBackupStatus, configureAnalysisBackup, type BackupStatus } from "../backend/sonicBackup";

export function SonicAutomaticBackup({ folder, disabled }: { folder: string; disabled: boolean }) {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [hours, setHours] = useState(6);
  const [keep, setKeep] = useState(7);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const dirty = useRef(false);
  const live = useRef(false);
  const pending = useRef(false);
  const serial = useRef(0);
  useEffect(() => {
    live.current = true;
    async function refresh() {
      if (pending.current) return;
      const request = ++serial.current;
      try {
        const next = await analysisBackupStatus();
        if (!live.current || request !== serial.current) return;
        setStatus(next);
        if (!dirty.current) { setEnabled(next.schedule.enabled); setHours(next.schedule.intervalHours); setKeep(next.schedule.backupsToKeep); }
      } catch (e) { if (live.current && request === serial.current) setError(String(e)); }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => { live.current = false; serial.current++; window.clearInterval(timer); };
  }, []);
  async function save() {
    if (pending.current) return;
    pending.current = true; serial.current++; setSaving(true); setError(""); setMessage("");
    try {
      const next = await configureAnalysisBackup({ enabled, intervalHours: hours, backupsToKeep: keep, folder });
      if (live.current) { setStatus(next); dirty.current = false; setMessage(enabled ? "Automatic backup settings saved. Keep Music Library running; due backups start within a minute." : "Automatic backups disabled."); }
    } catch (e) { if (live.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { pending.current = false; if (live.current) setSaving(false); }
  }
  return <fieldset className="sonic-backup-automatic" disabled={disabled || saving || !status}>
    <legend>Automatic backups</legend>
    <div className="sonic-analysis-actions">
      <label><input type="checkbox" checked={enabled} onChange={e => { dirty.current = true; setEnabled(e.target.checked); setMessage(""); }} /> Enable automatic analysis backups</label>
      <label>Backup every (hours) <input type="number" min="1" max="168" value={hours} onChange={e => { dirty.current = true; setHours(Number(e.target.value)); setMessage(""); }} /></label>
      <label>Backups to keep <input type="number" min="1" max="1000" value={keep} onChange={e => { dirty.current = true; setKeep(Number(e.target.value)); setMessage(""); }} /></label>
      <button type="button" disabled={enabled && !folder} onClick={() => void save()}>Save automatic backup settings</button>
    </div>
    <p>Uses the backup folder shown above. Keep Music Library open. Missed backups run after sleep or restart; failed exports retry after five minutes. Enabling backups starts the first one within a minute.</p>
    <p>Only this computer’s automatic archives in the saved folder are pruned, after a new backup succeeds. Manual backups and other computers’ archives are kept. Save these settings after changing the folder.</p>
    {status?.running && <p role="status">Automatic analysis backup is running.</p>}
    {status?.lastBackup && <p className="sonic-backup-path">Last automatic backup: {new Date(status.lastBackup.createdAt).toLocaleString()} · {status.lastBackup.audioCount.toLocaleString()} results · {status.lastBackup.path}</p>}
    {status?.nextBackupAt && <p>Next automatic backup: {new Date(status.nextBackupAt).toLocaleString()}</p>}
    {status?.lastError && <p role="alert">Automatic backup: {status.lastError}</p>}
    {saving && <p role="status">Saving automatic backup settings…</p>}{message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </fieldset>;
}
