import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { openExternalUrl } from "../../backend";
import type { useArtistAutoResolve } from "./useArtistAutoResolve";

export function MusicBrainzArtistLink({ mbid, children = "MusicBrainz" }: { mbid: string; children?: React.ReactNode }) {
  const [error, setError] = useState("");
  const href = `https://musicbrainz.org/artist/${encodeURIComponent(mbid)}`;
  return <>
    <a className="artist-musicbrainz-link" href={href} target="_blank" rel="noreferrer" onClick={(event) => {
      event.preventDefault();
      setError("");
      void openExternalUrl(href).catch((reason) => setError(String(reason)));
    }}>{children}<ExternalLink size={13} aria-hidden="true" /></a>
    {error ? <small role="alert">{error}</small> : null}
  </>;
}

const statusLabels: Record<string, string> = {
  updated: "Updated", review: "Needs review", "not-found": "No match", skipped: "Skipped", failed: "Failed",
};

export function ArtistAutoResolve({ batch }: {
  batch: ReturnType<typeof useArtistAutoResolve>;
}) {
  const updated = batch.results.filter((row) => row.status === "updated").length;
  return <section className="artist-auto-resolve query-panel" aria-label="Auto-resolve artists">
    <div className="artist-auto-resolve-heading">
      <div><h2>Auto-resolve missing MBIDs</h2>
        <p>Search MusicBrainz, save unique exact-name matches, then update their artist info and discography.</p></div>
      <div className="artist-auto-resolve-actions">
        <label>Artists to try<input type="number" min="1" max="1000" step="1" value={batch.count}
          disabled={batch.running} aria-invalid={!batch.validCount} onChange={(event) => batch.setCount(event.target.value)} /></label>
        <button type="button" className="primary-button" disabled={batch.running || !batch.validCount || !batch.validYears}
          onClick={() => { void batch.start(); }}>Auto-resolve & update</button>
        {batch.running ? <button type="button" className="secondary-button" disabled={batch.stopping} onClick={batch.stop}>
          {batch.stopping ? "Stopping…" : "Stop"}</button> : null}
      </div>
    </div>
    <p className="artist-auto-resolve-help">Uses your current filters and sort order, starting at the first match across all pages. Ambiguous matches need review; unlinked, ignored and split artists are skipped.</p>
    {!batch.validCount ? <p role="alert">Enter a whole number from 1 to 1,000.</p> : null}
    <div role="status" aria-live="polite">
      {batch.running && batch.total > 0 ? <p>{batch.results.length} of {batch.total} checked · {updated} updated · {batch.stopping ? "Finishing current artist" : `Checking ${batch.current || "next artist"}`}…</p> : null}
      {batch.message ? <p>{batch.message} {batch.results.length > 0 ? `${updated} updated · ${batch.results.length - updated} need review or were skipped.` : ""}</p> : null}
    </div>
    {batch.running && batch.total > 0 ? <progress aria-label="Artist auto-resolve progress" value={batch.results.length} max={batch.total} /> : null}
    {batch.results.length > 0 ? <details open className="artist-auto-resolve-results">
      <summary>Results ({batch.results.length})</summary>
      <ul>{batch.results.map((result) => <li key={result.artistId}>
        <div className="artist-auto-resolve-result-heading"><strong>{result.artistName}</strong>
          <span data-status={result.status}>{statusLabels[result.status] ?? result.status}</span></div>
        <p>{result.message}</p>
        <div className="artist-auto-resolve-links">{result.candidates.map((candidate) => <MusicBrainzArtistLink key={candidate.id} mbid={candidate.id}>
          {result.candidates.length === 1 ? "MusicBrainz" : candidate.name}
          {candidate.disambiguation ? ` — ${candidate.disambiguation}` : ""}{candidate.country ? ` (${candidate.country})` : ""}
        </MusicBrainzArtistLink>)}</div>
      </li>)}</ul>
    </details> : null}
  </section>;
}
