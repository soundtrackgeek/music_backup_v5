import { useEffect, useRef, useState } from "react";
import { configureSonicSchedule, findSonicMatches, getSonicSeeds, getSonicStatus, saveSonicPlaylist, startSonicAnalysis, type SonicMatches, type SonicStatus, type SonicTrack, type SonicSchedule } from "../backend/sonic";
import { controlActivityJob, listActivityJobs, listenToActivityJobs, type ActivityJob } from "../backend/activity";
import "./SonicAnalysisPanel.css";
import { SonicBackupPanel } from "./SonicBackupPanel";
import { SonicFailuresPanel } from "./SonicFailuresPanel";
import { SonicCoveragePanel } from "./SonicCoveragePanel";
import { SonicAtlas } from "./SonicAtlas";
export function storageSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.round(bytes / 1024 ** 2).toLocaleString()} MB`;
}

export function SonicAnalysisPanel({ albumId, onOpenAlbum }: { albumId?: string; onOpenAlbum?: (id: string) => void }) {
  const [atlasOpen, setAtlasOpen] = useState(false);
  const [status, setStatus] = useState<SonicStatus | null>(null);
  const [seeds, setSeeds] = useState<SonicTrack[]>([]);
  const [seed, setSeed] = useState("");
  const [matches, setMatches] = useState<SonicMatches | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<SonicSchedule | null>(null);
  const [diagnosticsRevision, setDiagnosticsRevision] = useState(0);
  const [jobs, setJobs] = useState<ActivityJob[]>([]);
  const refreshing = useRef(false);
  const dirty = useRef(false);
  const serial = useRef(0);
  const selected = useRef(seed); selected.current = seed;
  const live = useRef(true);
  async function refresh() {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const [next, items] = await Promise.all([getSonicStatus(), getSonicSeeds()]);
      if (!live.current) return;
      setStatus(next); setSeeds(items); setDiagnosticsRevision(n => n + 1);
      if (!dirty.current) setSchedule(next.schedule);
    } finally { refreshing.current = false; }
  }
  useEffect(() => {
    live.current = true; let disposed = false; let release: (() => void) | undefined; let last = 0; let previous = ""; let revision = 0;
    void refresh().catch((e: unknown) => { if (!disposed) setError(String(e)); });
    void listenToActivityJobs(next => {
      if (disposed) return;
      revision++; setJobs(next);
      const job = next.find(j => j.kind === "sonicAnalysis" || j.kind === "sonicReuse");
      const key = job ? `${job.id}:${job.updatedAt}` : "";
      // Coverage cannot change during queue cleanup. Avoid opening another long
      // read snapshot just as the worker is trying to reclaim database space.
      if (job?.state === "running" && /^(Reclaiming older audio analysis queues|Compacting audio analysis queue storage)/.test(job.message)) return;
      if (!job || key === previous || Date.now() - last < 15000 && job.state === "running") return;
      previous = key; last = Date.now();
      void refresh().catch((e: unknown) => { if (!disposed) setError(String(e)); });
    }).then(async fn => {
      if (disposed) { fn(); return; }
      release = fn;
      const initialRevision = revision;
      const initial = await listActivityJobs();
      if (!disposed && revision === initialRevision) setJobs(initial);
    }).catch((e: unknown) => { if (!disposed) setError(String(e)); });
    return () => { disposed = true; live.current = false; serial.current++; release?.(); };
  }, []);
  const sonicJobs = jobs.filter(j => j.kind === "sonicAnalysis" || j.kind === "sonicReuse");
  const activeStates = ["queued", "running", "pausing", "paused", "cancelling"];
  const active = sonicJobs.find(j => activeStates.includes(j.state));
  const stopped = [sonicJobs.find(j => j.kind === "sonicAnalysis"), sonicJobs.find(j => j.kind === "sonicReuse")]
    .filter((job): job is ActivityJob => Boolean(job && job.state !== "completed" && job.canRetry))
    .sort((a, b) => b.id - a.id);
  const saved = active ?? stopped[0] ?? null;
  const canContinue = saved?.state === "paused" || saved?.canRetry && (saved.state === "failed" || saved.state === "cancelled");
  async function controlSaved(action: "resume" | "retry" | "pause") {
    if (!saved) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      if (action !== "pause" && dirty.current && !await persistSchedule()) return;
      const next = await controlActivityJob(saved.id, action);
      if (!live.current) return;
      setJobs(next);
      setMessage(action === "pause" ? "Analysis will pause at its next safe checkpoint." : "Continuing saved analysis. Completed results are reused.");
      void refresh().catch((e: unknown) => { if (live.current) setError(String(e)); });
    } catch (e) { if (live.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (live.current) setBusy(false); }
  }
  function changeSchedule(change: Partial<SonicSchedule>) { dirty.current = true; setSchedule(s => s ? { ...s, ...change } : s); }
  async function persistSchedule() {
    if (!schedule) throw new Error("Wait for the analysis schedule to load before starting.");
    const next = await configureSonicSchedule(schedule);
    if (!live.current) return false;
    setStatus(next); setSchedule(next.schedule); dirty.current = false;
    return true;
  }
  async function saveSchedule() {
    if (!schedule) return;
    setBusy(true); setError(null);
    try { if (await persistSchedule()) setMessage("Analysis schedule saved. Running jobs use it before their next track."); }
    catch (e) { if (live.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (live.current) setBusy(false); }
  }
  async function analyze(scope: "all" | "favorites" | "album" | "reuse" | "failed") {
    setBusy(true); setError(null); setMessage(null);
    try { if (!await persistSchedule()) return; await startSonicAnalysis(scope, albumId ?? null); if (!live.current) return; setMessage(`${scope === "reuse" ? "Verification" : "Analysis"} queued. Use Activity Center to pause, resume, cancel, or retry.`); await refresh(); }
    catch (e) { if (live.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (live.current) setBusy(false); }
  }
  async function find() {
    const key = seed, id = ++serial.current; setBusy(true); setError(null); setMessage(null);
    try { const result = await findSonicMatches(key); if (live.current && id === serial.current && selected.current === key) setMatches(result); }
    catch (e) { if (live.current && id === serial.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (live.current && id === serial.current) setBusy(false); }
  }
  async function save() {
    setBusy(true); setError(null);
    try { const title = seeds.find(t => t.trackKey === seed)?.title ?? "Selected track"; const result = await saveSonicPlaylist(seed, `Sounds like ${title}`); if (live.current) setMessage(result); }
    catch (e) { if (live.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (live.current) setBusy(false); }
  }
  return <section className="sonic-analysis" aria-label="Audio analysis">
    {onOpenAlbum && <><button type="button" onClick={() => setAtlasOpen(true)}>Open sonic atlas</button>{atlasOpen && <SonicAtlas onClose={() => setAtlasOpen(false)} onOpenAlbum={t => onOpenAlbum(t.albumId)} />}</>}
    <div><h2>Audio analysis</h2><p>Discover connections by sound. Analysis runs locally and resumes from saved track checkpoints.</p></div>
    <p>{status ? `${status.analyzed.toLocaleString()} of ${status.total.toLocaleString()} tracks analyzed · ${status.pending.toLocaleString()} pending · ${status.failed.toLocaleString()} failed` : "Reading analysis coverage…"}</p>
    {status && <p>{`Per-second timelines: ${status.timelines.toLocaleString()} of ${status.analyzed.toLocaleString()} analyzed tracks · ${storageSize(status.timelineBytes)} on this computer`}</p>}
    {saved && <div className="sonic-current-work" aria-label="Saved audio analysis">
      <strong>{saved.kind === "sonicReuse" ? "Saved verification" : "Saved analysis"} · {saved.state}</strong>
      <span>{saved.completed.toLocaleString()} of {saved.total.toLocaleString()} queue entries checked</span>
      {saved.total > 0 && <progress aria-label="Saved analysis progress" max={saved.total} value={saved.completed} />}
      {saved.message && <p>{saved.message}</p>}
      {saved.error && <p className="sonic-job-error">{saved.error}</p>}
      <div className="sonic-analysis-actions">
        <button type="button" disabled={busy || !canContinue} onClick={() => void controlSaved(saved.state === "paused" ? "resume" : "retry")}>{canContinue ? saved.kind === "sonicReuse" ? "Continue verification" : "Continue analysis" : saved.state === "running" ? "Analysis running" : saved.state === "queued" ? "Analysis queued" : "Stopping analysis…"}</button>
        {(saved.state === "running" || saved.state === "queued") && saved.resumable && <button type="button" disabled={busy} onClick={() => void controlSaved("pause")}>Pause analysis</button>}
      </div>
      <p>Continue this saved job to keep its place. Unchanged tracks reuse completed analysis.</p>
    </div>}
    {schedule && <fieldset className="sonic-schedule" disabled={busy}><legend>When to analyze</legend>
      <label><input type="checkbox" disabled={!status?.idleSupported || busy} checked={schedule.idleOnly} onChange={e => changeSchedule({ idleOnly: e.target.checked })} />Only when the computer is idle</label>
      {schedule.idleOnly && <label>Idle for <input aria-label="Idle minutes" type="number" min="1" max="120" value={schedule.idleMinutes} onChange={e => changeSchedule({ idleMinutes: Number(e.target.value) })} /> minutes</label>}
      <label><input type="checkbox" checked={schedule.startHour !== null} disabled={busy} onChange={e => changeSchedule({ startHour: e.target.checked ? 22 : null, endHour: e.target.checked ? 8 : null })} />Limit to certain hours</label>
      {schedule.startHour !== null && <><label>From <select aria-label="Analysis start hour" value={schedule.startHour} onChange={e => changeSchedule({ startHour: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>)}</select></label><label>Until <select aria-label="Analysis end hour" value={schedule.endHour ?? 8} onChange={e => changeSchedule({ endHour: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>)}</select></label></>}
      <button type="button" disabled={busy} onClick={() => void saveSchedule()}>Save schedule</button>
      <p>Starting analysis saves these settings. Use Save schedule to apply changes to a running job.</p>
      <p>Local time. {schedule.idleOnly ? "Returning to the computer pauses new work after the current track. " : "Idle detection is off. "}Keep Music Library running and the computer awake.</p>
    </fieldset>}
    <div className="sonic-analysis-actions">{albumId && <button type="button" disabled={busy || !schedule || Boolean(active)} onClick={() => void analyze("album")}>Analyze this album</button>}<button type="button" disabled={busy || !schedule || Boolean(active)} onClick={() => void analyze("favorites")}>Analyze favorites</button><button type="button" disabled={busy || !schedule || Boolean(active)} onClick={() => void analyze("all")}>Analyze library</button><button type="button" disabled={busy} onClick={() => void refresh().catch(e => setError(String(e)))}>Refresh coverage</button></div>
    {!seeds.length && <p>Start with an album or your favorites. Aurora can use completed results while the rest of the library is still analyzing.</p>}
    {seeds.length > 0 && <><label className="sonic-seed">Sounds like<select disabled={busy} value={seed} onChange={e => { serial.current++; setBusy(false); setSeed(e.target.value); setMatches(null); }}><option value="">Choose an analyzed track</option>{seeds.map(t => <option key={t.trackKey} value={t.trackKey}>{t.artist} — {t.title}</option>)}</select></label><div className="sonic-analysis-actions"><button type="button" disabled={!seed || busy} onClick={() => void find()}>Find similar tracks</button><button type="button" disabled={!matches?.tracks.length || busy} onClick={() => void save()}>Save as playlist</button></div></>}
    {matches && <p>Matches among {matches.analyzed.toLocaleString()} analyzed tracks. {matches.seedReady ? "" : "This seed needs analysis."}</p>}
    {matches?.seedReady && !matches.tracks.length && <p>No eligible matches yet. Analyze more music.</p>}
    {matches?.tracks.map(t => <div className="sonic-result" key={t.trackKey}><strong>{t.title}</strong><span>{t.artist} · {t.album}</span></div>)}
    {!albumId && <SonicBackupPanel onVerify={() => analyze("reuse")} />}
    {!albumId && <><SonicFailuresPanel disabled={busy || !schedule} revision={diagnosticsRevision} onRetry={() => analyze("failed")} /><SonicCoveragePanel /></>}
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </section>;
}
