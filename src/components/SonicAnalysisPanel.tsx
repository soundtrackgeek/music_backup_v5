import { useEffect, useRef, useState } from "react";
import { configureSonicSchedule, findSonicMatches, getSonicSeeds, getSonicStatus, saveSonicPlaylist, startSonicAnalysis, type SonicMatches, type SonicStatus, type SonicTrack, type SonicSchedule } from "../backend/sonic";
import { listenToActivityJobs } from "../backend/activity";
import "./SonicAnalysisPanel.css";
export function SonicAnalysisPanel({ albumId }: { albumId?: string }) {
  const [status, setStatus] = useState<SonicStatus | null>(null);
  const [seeds, setSeeds] = useState<SonicTrack[]>([]);
  const [seed, setSeed] = useState("");
  const [matches, setMatches] = useState<SonicMatches | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<SonicSchedule | null>(null);
  const dirty = useRef(false);
  const serial = useRef(0);
  const selected = useRef(seed); selected.current = seed;
  const live = useRef(true);
  async function refresh() { const [next, items] = await Promise.all([getSonicStatus(), getSonicSeeds()]); if (!live.current) return; setStatus(next); setSeeds(items); if (!dirty.current) setSchedule(next.schedule); }
  useEffect(() => {
    live.current = true; let disposed = false; let release: (() => void) | undefined; let last = 0; let previous = "";
    void refresh().catch((e: unknown) => { if (!disposed) setError(String(e)); });
    void listenToActivityJobs(jobs => { const job = jobs.find(j => j.kind === "sonicAnalysis"); const key = job ? `${job.id}:${job.updatedAt}` : ""; if (!job || key === previous || Date.now() - last < 15000 && job.state === "running") return; previous = key; last = Date.now(); void refresh().catch((e: unknown) => { if (!disposed) setError(String(e)); }); }).then(fn => { if (disposed) fn(); else release = fn; });
    return () => { disposed = true; live.current = false; serial.current++; release?.(); };
  }, []);
  function changeSchedule(change: Partial<SonicSchedule>) { dirty.current = true; setSchedule(s => s ? { ...s, ...change } : s); }
  async function saveSchedule() {
    if (!schedule) return;
    setBusy(true); setError(null);
    try { const next = await configureSonicSchedule(schedule); if (live.current) { setStatus(next); dirty.current = false; setMessage("Analysis schedule saved. Running jobs use it before their next track."); } }
    catch (e) { if (live.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (live.current) setBusy(false); }
  }
  async function analyze(scope: "all" | "favorites" | "album") {
    setBusy(true); setError(null); setMessage(null);
    try { await startSonicAnalysis(scope, albumId ?? null); if (!live.current) return; setMessage("Analysis queued. Use Activity Center to pause, resume, cancel, or retry."); await refresh(); }
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
    <div><h2>Audio analysis</h2><p>Discover connections by sound. Analysis runs locally and resumes from saved track checkpoints.</p></div>
    <p>{status ? `${status.analyzed.toLocaleString()} of ${status.total.toLocaleString()} tracks analyzed · ${status.pending.toLocaleString()} pending · ${status.failed.toLocaleString()} failed` : "Reading analysis coverage…"}</p>
    {schedule && <fieldset className="sonic-schedule"><legend>When to analyze</legend>
      <label><input type="checkbox" disabled={!status?.idleSupported || busy} checked={schedule.idleOnly} onChange={e => changeSchedule({ idleOnly: e.target.checked })} />Only when the computer is idle</label>
      {schedule.idleOnly && <label>Idle for <input aria-label="Idle minutes" type="number" min="1" max="120" value={schedule.idleMinutes} onChange={e => changeSchedule({ idleMinutes: Number(e.target.value) })} /> minutes</label>}
      <label><input type="checkbox" checked={schedule.startHour !== null} disabled={busy} onChange={e => changeSchedule({ startHour: e.target.checked ? 22 : null, endHour: e.target.checked ? 8 : null })} />Limit to certain hours</label>
      {schedule.startHour !== null && <><label>From <select aria-label="Analysis start hour" value={schedule.startHour} onChange={e => changeSchedule({ startHour: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>)}</select></label><label>Until <select aria-label="Analysis end hour" value={schedule.endHour ?? 8} onChange={e => changeSchedule({ endHour: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>)}</select></label></>}
      <button type="button" disabled={busy} onClick={() => void saveSchedule()}>Save schedule</button>
      <p>Local time. Returning to the computer pauses new work after the current track. Keep Music Library running and the computer awake.</p>
    </fieldset>}
    <div className="sonic-analysis-actions">{albumId && <button type="button" disabled={busy} onClick={() => void analyze("album")}>Analyze this album</button>}<button type="button" disabled={busy} onClick={() => void analyze("favorites")}>Analyze favorites</button><button type="button" disabled={busy} onClick={() => void analyze("all")}>Analyze library</button><button type="button" disabled={busy} onClick={() => void refresh().catch(e => setError(String(e)))}>Refresh coverage</button></div>
    {!seeds.length && <p>Start with an album or your favorites. Aurora can use completed results while the rest of the library is still analyzing.</p>}
    {seeds.length > 0 && <><label className="sonic-seed">Sounds like<select value={seed} onChange={e => { serial.current++; setBusy(false); setSeed(e.target.value); setMatches(null); }}><option value="">Choose an analyzed track</option>{seeds.map(t => <option key={t.trackKey} value={t.trackKey}>{t.artist} — {t.title}</option>)}</select></label><div className="sonic-analysis-actions"><button type="button" disabled={!seed || busy} onClick={() => void find()}>Find similar tracks</button><button type="button" disabled={!matches?.tracks.length || busy} onClick={() => void save()}>Save as playlist</button></div></>}
    {matches && <p>Matches among {matches.analyzed.toLocaleString()} analyzed tracks. {matches.seedReady ? "" : "This seed needs analysis."}</p>}
    {matches?.seedReady && !matches.tracks.length && <p>No eligible matches yet. Analyze more music.</p>}
    {matches?.tracks.map(t => <div className="sonic-result" key={t.trackKey}><strong>{t.title}</strong><span>{t.artist} · {t.album}</span></div>)}
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </section>;
}
