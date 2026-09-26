import { useEffect, useRef, useState } from "react";
import { getPublishedSongHistory, type PublishedSongRow, type PublishedSongWeek } from "../backend/publishedCharts";

export function PublishedSongHistory({ chart, song, onClose }: { chart: string; song: PublishedSongRow; onClose: () => void }) {
  const panel = useRef<HTMLElement>(null);
  const [weeks, setWeeks] = useState<PublishedSongWeek[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
    panel.current?.scrollIntoView?.({ block: "start" });
    let active = true;
    setLoading(true); setWeeks([]); setError("");
    void getPublishedSongHistory(chart, song.artist, song.title)
      .then((rows) => { if (active) setWeeks(rows); })
      .catch((cause) => { if (active) setError(String(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [chart, song.artist, song.title]);
  const peak = weeks.length ? Math.min(...weeks.map((week) => week.position)) : null;
  const peakWeek = weeks.find((week) => week.position === peak);
  return <section ref={panel} tabIndex={-1} className="published-history" aria-label="Song chart history">
    <div className="published-chart-heading"><div><span className="published-detail-kicker">Song history · {chart}</span><h3>{song.artist} – {song.title}</h3></div><button type="button" className="secondary-button" onClick={onClose}>Close history</button></div>
    {loading ? <p role="status">Loading song history…</p> : error ? <p role="alert">{error}</p> : !weeks.length ? <p>No archived weeks found.</p> : <>
      <dl className="published-song-stats">
        <div><dt>First archived appearance</dt><dd>{weeks[0].weekEnding}<small>Entered at #{weeks[0].position}</small></dd></div>
        <div><dt>Archive peak</dt><dd>#{peak}<small>First reached {peakWeek?.weekEnding}</small></dd></div>
        <div><dt>Weeks charted</dt><dd>{weeks.length}<small>{weeks.filter((week) => week.position === 1).length} weeks at #1</small></dd></div>
        <div><dt>Last archived appearance</dt><dd>{weeks[weeks.length - 1].weekEnding}<small>Position #{weeks[weeks.length - 1].position}</small></dd></div>
      </dl>
      <p className="published-source-note">Full available history, beyond your selected range. Archive coverage and printed credits can vary; the first archived appearance is not necessarily the original debut. Gaps are not automatically treated as re-entries.</p>
      <div className="published-history-weeks" tabIndex={0} aria-label="Weekly song positions"><table className="published-chart-table"><thead><tr><th>Week ending</th><th>Position</th><th>Source status</th><th>Printed entry date</th></tr></thead><tbody>{weeks.map((week) => <tr key={week.weekEnding}><td>{week.weekEnding}</td><td className="published-rank">#{week.position}</td><td>{week.entryStatus || "—"}</td><td>{week.entryDate || "—"}</td></tr>)}</tbody></table></div>
    </>}
  </section>;
}
