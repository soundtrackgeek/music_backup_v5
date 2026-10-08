import { useEffect, useRef, useState } from "react";
import { findSonicAlbums, type SonicAlbumMatches } from "../backend/sonic";
import "./SonicAnalysisPanel.css";

interface Props { albumId: string; onOpenAlbum: (id: string) => void; }
export function SonicAlbumPanel(props: Props) { return <AlbumSimilarity key={props.albumId} {...props} />; }
function AlbumSimilarity({ albumId, onOpenAlbum }: Props) {
  const [coverage, setCoverage] = useState(50);
  const [result, setResult] = useState<SonicAlbumMatches | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const serial = useRef(0);
  useEffect(() => { const control = serial; return () => { control.current++; }; }, []);
  async function find() {
    const id = ++serial.current; setBusy(true); setError(null); setResult(null);
    try { const next = await findSonicAlbums(albumId, coverage); if (id === serial.current) setResult(next); }
    catch (e) { if (id === serial.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (id === serial.current) setBusy(false); }
  }
  return <section className="sonic-analysis" aria-label="Similar sounding albums">
    <h2>Sounds like this album</h2>
    <p>Find albums in your library by their sound. Partial albums need at least three analyzed tracks, or all tracks for shorter albums.</p>
    <label className="sonic-seed">Minimum analysis coverage<select value={coverage} disabled={busy} onChange={e => { setCoverage(Number(e.target.value)); setResult(null); }}>
      <option value="50">50% or more</option><option value="80">80% or more</option><option value="100">Complete albums only</option>
    </select></label>
    <div className="sonic-analysis-actions"><button type="button" disabled={busy} onClick={() => void find()}>{busy ? "Finding albums…" : "Find similar albums"}</button></div>
    {result && <p role="status">{result.seed ? `${result.seed.analyzedTracks} of ${result.seed.totalTracks} MP3 tracks usable in this album.` : "This album is no longer in the library."} {result.seedReady ? `Comparing ${result.analyzedAlbums.toLocaleString()} albums with enough saved analysis.` : "Analyze this album above, then find again."}</p>}
    {result?.seedReady && !result.albums.length && <p>No similar albums qualify yet. Analyze more albums or lower the coverage setting.</p>}
    {result?.albums.map(album => <button type="button" className="sonic-result sonic-album-result" key={album.albumId} onClick={() => onOpenAlbum(album.albumId)} aria-label={`Open ${album.title} by ${album.albumArtist}`}>
      <strong>{album.title}</strong><span>{album.albumArtist}</span><span>{album.analyzedTracks}/{album.totalTracks} tracks analyzed{album.analyzedTracks < album.totalTracks ? " · Partial analysis" : " · Complete analysis"}</span>
    </button>)}
    {error && <p role="alert">{error}</p>}
  </section>;
}
