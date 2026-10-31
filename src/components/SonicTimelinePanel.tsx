import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { getAlbumTimelines, getTrackTimeline, type AlbumTimelines, type TimelinePoint, type TrackTimeline } from "../backend/sonic";
import "./SonicAnalysisPanel.css";
import "./SonicTimelinePanel.css";

const PITCH_CLASSES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const HEAT_COLUMNS = 150;

const TRACK_STATE: Record<string, string> = {
  ready: "Timeline ready",
  missing: "Analyzed, no timeline yet",
  notAnalyzed: "Not analyzed",
  notMp3: "Not an MP3",
  failed: "Timeline failed",
};

const DETAIL_STATE: Record<string, string> = {
  missing: "This track is analyzed but has no timeline yet. Use Analyze this album above to add it.",
  notAnalyzed: "This track is not analyzed yet. Use Analyze this album above.",
  notMp3: "Only MP3 files are analyzed.",
  changed: "The file changed after it was analyzed. Analyze this album again to refresh its timeline.",
  unreadable: "The saved timeline is damaged. Analyze this album again to rebuild it.",
  gone: "This track is no longer in the library.",
};

type Metric = "level" | "brightness" | "width" | "correlation";
interface Lane { key: Metric; label: string; min: number; max: number; fill?: boolean; zero?: number; format: (v: number) => string; }

export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, rest = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${rest}` : `${m}:${rest}`;
}

function lanes(points: TimelinePoint[]): Lane[] {
  // Brightness has no natural ceiling; scale to the track, but never flatter than 4 kHz.
  const brightest = Math.max(4000, ...points.map(p => p.brightness ?? 0));
  return [
    { key: "level", label: "Level", min: -60, max: 0, fill: true, format: v => `${v.toFixed(1)} dBFS` },
    { key: "brightness", label: "Brightness", min: 0, max: brightest, fill: true, format: v => `${Math.round(v).toLocaleString()} Hz` },
    { key: "width", label: "Stereo width", min: -40, max: 0, format: v => `${v.toFixed(1)} dB` },
    { key: "correlation", label: "Left/right correlation", min: -1, max: 1, zero: 0, format: v => v.toFixed(2) },
  ];
}

/** SVG path for one lane, breaking the line where a value is missing. */
export function lanePath(points: TimelinePoint[], lane: Lane, height: number): string {
  const y = (v: number) => {
    const t = (Math.min(lane.max, Math.max(lane.min, v)) - lane.min) / (lane.max - lane.min);
    return (height * (1 - t)).toFixed(2);
  };
  let d = "", run: [number, string][] = [];
  const flush = () => {
    if (!run.length) return;
    if (lane.fill) d += `M${run[0][0]} ${height}` + run.map(([x, v]) => `L${x} ${v}L${x + 1} ${v}`).join("") + `L${run[run.length - 1][0] + 1} ${height}Z`;
    else d += run.map(([x, v], i) => `${i ? "L" : "M"}${x + 0.5} ${v}`).join("");
    run = [];
  };
  points.forEach((p, x) => {
    const v = p[lane.key];
    if (v === null || !Number.isFinite(v)) flush();
    else run.push([x, y(v)]);
  });
  flush();
  return d;
}

/** Pitch-class energy grouped into at most HEAT_COLUMNS columns, each scaled to its own strongest class. */
export function heatColumns(points: TimelinePoint[]): number[][] {
  const per = Math.max(1, Math.ceil(points.length / HEAT_COLUMNS)), out: number[][] = [];
  for (let i = 0; i < points.length; i += per) {
    const group = points.slice(i, i + per), sums = Array.from({ length: 12 }, (_, c) => group.reduce((s, p) => s + (p.chroma[c] ?? 0), 0));
    const top = Math.max(...sums);
    out.push(sums.map(v => (top > 0 ? v / top : 0)));
  }
  return out;
}

function strongestPitch(point: TimelinePoint): string | null {
  const energy = point.chroma.map(v => v ?? 0), top = Math.max(...energy);
  return top > 0 ? PITCH_CLASSES[energy.indexOf(top)] : null;
}

function describe(t: TrackTimeline): string {
  const parts = [clock(t.seconds), t.channels === 1 ? "mono" : t.channels === 2 ? "stereo" : `${t.channels ?? "?"} channels`];
  if (t.sampleRate) parts.push(`${(t.sampleRate / 1000).toLocaleString()} kHz`);
  if (t.leftDb !== null && t.rightDb !== null) parts.push(`left ${t.leftDb.toFixed(1)} dBFS, right ${t.rightDb.toFixed(1)} dBFS`);
  else if (t.leftDb !== null) parts.push(`${t.leftDb.toFixed(1)} dBFS`);
  if (t.bucketSeconds > 1) parts.push(`each point averages ${t.bucketSeconds} seconds`);
  return parts.join(" · ");
}

export function SonicTimelinePanel({ albumId }: { albumId: string }) {
  return <AlbumTimelineView key={albumId} albumId={albumId} />;
}

function AlbumTimelineView({ albumId }: { albumId: string }) {
  const [album, setAlbum] = useState<AlbumTimelines | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [timeline, setTimeline] = useState<TrackTimeline | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const serial = useRef(0);

  async function open(trackId: number) {
    const id = ++serial.current;
    setSelected(trackId); setTimeline(null); setBusy(true); setError(null);
    try { const next = await getTrackTimeline(trackId); if (id === serial.current) setTimeline(next); }
    catch (e) { if (id === serial.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (id === serial.current) setBusy(false); }
  }

  useEffect(() => {
    const control = serial, id = ++control.current;
    void getAlbumTimelines(albumId).then(next => {
      if (id !== control.current) return;
      setAlbum(next);
      const first = next.tracks.find(t => t.state === "ready");
      if (first) void open(first.trackId);
    }).catch((e: unknown) => { if (id === control.current) setError(e instanceof Error ? e.message : String(e)); });
    return () => { control.current++; };
  }, [albumId]);

  const mp3 = album?.tracks.filter(t => t.state !== "notMp3").length ?? 0;
  return <section className="sonic-analysis sonic-timeline" aria-label="Sound timeline">
    <h2>Sound timeline</h2>
    <p>How each track's level, brightness, stereo image and pitch content change second by second, measured from the audio.</p>
    {!album && !error && <p>Reading saved timelines…</p>}
    {album && <p role="status">{album.ready ? `${album.ready} of ${mp3} MP3 tracks have a timeline.` : mp3 ? "No track on this album has a timeline yet. Use Analyze this album above to add them." : "This album has no MP3 tracks to analyze."}</p>}
    {album && album.tracks.length > 0 && <ol className="sonic-timeline-tracks">
      {album.tracks.map(t => <li key={t.trackId}>
        <button type="button" aria-pressed={selected === t.trackId} disabled={t.state === "notMp3"} onClick={() => void open(t.trackId)}>
          <span>{t.trackNumber ? `${t.trackNumber}. ` : ""}{t.title || "Untitled"}</span>
          <small>{t.seconds ? `${clock(t.seconds)} · ` : ""}{TRACK_STATE[t.state] ?? t.state}</small>
        </button>
      </li>)}
    </ol>}
    {busy && <p>Loading timeline…</p>}
    {timeline && timeline.state === "ready" && <TimelineChart timeline={timeline} />}
    {timeline && timeline.state === "failed" && <p>The timeline could not be measured from this file{timeline.error ? `: ${timeline.error}` : "."}</p>}
    {timeline && timeline.state !== "ready" && timeline.state !== "failed" && <p>{DETAIL_STATE[timeline.state] ?? timeline.state}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}

function TimelineChart({ timeline }: { timeline: TrackTimeline }) {
  const { points } = timeline;
  const [cursor, setCursor] = useState<number | null>(null);
  const laneList = useMemo(() => lanes(points), [points]);
  const paths = useMemo(() => laneList.map(lane => lanePath(points, lane, 40)), [laneList, points]);
  const heat = useMemo(() => heatColumns(points), [points]);
  const stereo = points.some(p => p.width !== null);
  const point = cursor === null ? null : points[cursor];

  function move(e: PointerEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    if (box.width <= 0) return;
    setCursor(Math.min(points.length - 1, Math.max(0, Math.floor(((e.clientX - box.left) / box.width) * points.length))));
  }
  function key(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : e.key === "PageDown" ? 10 : e.key === "PageUp" ? -10 : 0;
    if (e.key === "Home") setCursor(0);
    else if (e.key === "End") setCursor(points.length - 1);
    else if (step) setCursor(c => Math.min(points.length - 1, Math.max(0, (c ?? -step) + step)));
    else return;
    e.preventDefault();
  }

  const shown = stereo ? laneList : laneList.filter(l => l.key !== "width" && l.key !== "correlation");
  return <div className="sonic-timeline-chart">
    <p>{describe(timeline)}{timeline.truncated ? " · only the first three hours are measured" : ""}</p>
    {!stereo && <p>{timeline.channels === 1 ? "Mono file: there is no stereo width or correlation to show." : "No stereo signal was measured in this file."}</p>}
    <div className="sonic-timeline-lanes" tabIndex={0} role="group"
      aria-label="Timeline. Use the arrow keys to move through the track."
      onPointerMove={move} onPointerLeave={() => setCursor(null)} onKeyDown={key} onBlur={() => setCursor(null)}>
      {shown.map(lane => <div className={`sonic-timeline-lane sonic-timeline-${lane.key}`} key={lane.key}>
        <span className="sonic-timeline-label">{lane.label}</span>
        <svg viewBox={`0 0 ${points.length} 40`} preserveAspectRatio="none" role="img" aria-label={`${lane.label} over time`}>
          {lane.zero !== undefined && <line x1="0" x2={points.length} y1="20" y2="20" className="sonic-timeline-zero" vectorEffect="non-scaling-stroke" />}
          <path d={paths[laneList.indexOf(lane)]} className={lane.fill ? "sonic-timeline-area" : "sonic-timeline-line"} vectorEffect="non-scaling-stroke" />
        </svg>
      </div>)}
      <div className="sonic-timeline-lane sonic-timeline-chroma">
        <span className="sonic-timeline-label">Pitch classes</span>
        <svg viewBox={`0 0 ${heat.length} 12`} preserveAspectRatio="none" role="img" aria-label="Pitch-class energy over time, C at the bottom, B at the top">
          {heat.flatMap((column, x) => column.map((v, c) => v > 0.05 && <rect key={`${x}-${c}`} x={x} y={11 - c} width="1.02" height="1.02" opacity={v.toFixed(2)} />))}
        </svg>
      </div>
      {cursor !== null && <div className="sonic-timeline-cursor" style={{ left: `${((cursor + 0.5) / points.length) * 100}%` }} aria-hidden="true" />}
    </div>
    <div className="sonic-timeline-axis" aria-hidden="true"><span>0:00</span><span>{clock(timeline.seconds / 2)}</span><span>{clock(timeline.seconds)}</span></div>
    <p className="sonic-timeline-readout" aria-live="polite">{point
      ? [clock(point.start), ...shown.map(l => point[l.key] === null ? `${l.label} —` : `${l.label} ${l.format(point[l.key] as number)}`), strongestPitch(point) ? `Strongest pitch class ${strongestPitch(point)}` : null].filter(Boolean).join(" · ")
      : "Point at the timeline, or focus it and use the arrow keys, to read the values at a moment."}</p>
    <details className="sonic-timeline-help"><summary>What these measure</summary>
      <p><strong>Level</strong> is the loudness of the mixed channels in dBFS (0 is the loudest a file can hold). <strong>Brightness</strong> is the spectral centroid: higher means more treble energy. <strong>Stereo width</strong> compares the difference between the channels with what they share; lower is narrower, and identical channels show no line. <strong>Left/right correlation</strong> is near 1 when the channels move together and below 0 when they cancel. <strong>Pitch classes</strong> show which of the twelve notes, in any octave, carry the most energy; they are not chords or a key.</p>
    </details>
  </div>;
}
