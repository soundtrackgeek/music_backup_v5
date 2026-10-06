import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Activity, Check, Clock3, Pause, Play, RotateCcw, X } from "lucide-react";
import { activeJob, controlActivityJob, jobActions, listActivityJobs, listenToActivityJobs, type ActivityJob, type JobAction } from "../backend/activity";
import { subscribeWithSnapshot } from "../app/backendEvents";
import "./ActivityCenter.css";

const actionLabels: Record<JobAction, string> = { pause: "Pause", resume: "Resume", retry: "Retry", cancel: "Cancel" };
const actionIcons = { pause: Pause, resume: Play, retry: RotateCcw, cancel: X };
const stateLabels: Record<ActivityJob["state"], string> = { queued: "Queued", running: "Running", pausing: "Pausing after this check", paused: "Paused", cancelling: "Cancelling at a safe boundary", cancelled: "Cancelled", failed: "Needs attention", completed: "Finished" };

export function ActivityCenter() {
  const [jobs, setJobs] = useState<ActivityJob[]>([]);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "attention" | "finished">("all");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLElement>(null);
  const eventRevision = useRef(0);
  const receive = (next: ActivityJob[]) => { eventRevision.current++; setJobs(next); };
  useEffect(() => subscribeWithSnapshot(listenToActivityJobs, listActivityJobs, receive, e => setError(String(e))), []);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawer.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { document.body.style.overflow = previous; trigger.current?.focus(); window.requestAnimationFrame(() => trigger.current?.focus()); };
  }, [open]);
  useLayoutEffect(() => {
    // Completing/cancelling work can remove the focused action button.
    if (open && drawer.current && !drawer.current.contains(document.activeElement)) {
      drawer.current.querySelector<HTMLButtonElement>("button")?.focus();
    }
  }, [open, jobs]);
  const count = jobs.filter(activeJob).length;
  const attention = jobs.filter(job => job.state === "failed" || job.state === "paused").length;
  const visible = jobs.filter(job => filter === "all" || (filter === "active" && activeJob(job)) || (filter === "attention" && ["failed", "paused"].includes(job.state)) || (filter === "finished" && ["completed", "cancelled"].includes(job.state)));
  async function control(job: ActivityJob, action: JobAction) {
    setBusy(job.id); setError(null);
    const revision = eventRevision.current;
    try {
      const next = await controlActivityJob(job.id, action);
      // A newer worker event wins over the command's earlier snapshot.
      if (revision === eventRevision.current) setJobs(next);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }
  function keys(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); }
    if (event.key !== "Tab") return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]'));
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  return <>
    <button ref={trigger} className={`icon-button activity-trigger${attention ? " activity-attention" : ""}`} type="button" aria-label={`Open Activity Center${count ? `, ${count} active jobs` : ""}`} title="Activity Center" aria-expanded={open} aria-controls="activity-center" onClick={() => setOpen(value => !value)}>
      <Activity size={18} />{count > 0 && <span className="activity-badge">{count}</span>}{!count && attention > 0 && <span className="activity-dot" />}
    </button>
    {open && <div className="activity-layer">
      <div className="activity-backdrop" onClick={() => setOpen(false)} />
      <section ref={drawer} id="activity-center" className="activity-drawer" role="dialog" aria-modal="true" aria-labelledby="activity-title" onKeyDown={keys}>
        <header className="activity-header"><div><span className="activity-eyebrow">Across your library</span><h2 id="activity-title">Activity Center</h2><p>{count} active · {attention} need attention</p></div><button className="icon-button" aria-label="Close Activity Center" onClick={() => setOpen(false)}><X size={18} /></button></header>
        <div className="activity-filters" aria-label="Filter jobs">{(["all", "active", "attention", "finished"] as const).map(value => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === "attention" ? "Needs attention" : value.charAt(0).toUpperCase() + value.slice(1)}</button>)}</div>
        {error && <div className="activity-error" role="alert">{error}<button className="secondary-button" onClick={() => { setError(null); void listActivityJobs().then(receive).catch(e => setError(String(e))); }}>Refresh</button></div>}
        <div className="activity-list">{visible.length === 0 ? <div className="activity-empty"><Check size={28} /><h3>{filter === "all" ? "Nothing running right now" : "No jobs here"}</h3><p>Imports, verification and sync work appear here automatically. You can keep browsing while they run.</p></div> : visible.map(job => <article key={job.id} className={`activity-job activity-job-${job.state}`}>
          <div className="activity-job-heading"><h3>{job.label}</h3><span>{stateLabels[job.state]}</span></div>
          {job.total > 0 && <div className="activity-progress" role="progressbar" aria-label={`${job.label} progress`} aria-valuenow={Math.round(job.progress)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${Math.max(0, Math.min(100, job.progress))}%` }} /></div>}
          <p className="activity-message">{job.message || (activeJob(job) ? "Preparing work…" : stateLabels[job.state])}</p>
          {job.etaSeconds != null && job.etaSeconds > 0 && activeJob(job) && <p className="activity-eta"><Clock3 size={13} /> About {Math.ceil(job.etaSeconds / 60)} min remaining</p>}
          {job.error && <p className="activity-job-error">{job.error}</p>}
          <div className="activity-job-footer"><time dateTime={job.createdAt}>{new Date(job.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time><div>{jobActions(job).map(action => { const Icon = actionIcons[action]; return <button key={action} className="secondary-button" type="button" disabled={busy != null} onClick={() => void control(job, action)} aria-label={`${actionLabels[action]} ${job.label}`}><Icon size={13} />{busy === job.id ? "Working…" : actionLabels[action]}</button>; })}</div></div>
          {job.state === "running" && !job.canCancel && <small>This operation will finish its current transaction.</small>}
        </article>)}</div>
      </section>
    </div>}
  </>;
}
