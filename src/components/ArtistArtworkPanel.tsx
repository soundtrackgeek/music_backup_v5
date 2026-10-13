import { useEffect, useRef, useState } from "react";
import { getArtistArtwork } from "../backend/artistArtwork";
import { artworkUrl, useArtworkRevision } from "../backend/artwork";
import { openUrl } from "../backend/tauriClient";
import type { ArtistArtwork, ArtworkCredit } from "../bindings";

function Credit({ credit }: { credit: ArtworkCredit }) {
  const label = [credit.author, credit.license, credit.provider].filter(Boolean).join(" · ");
  return <figcaption>
    <button type="button" onClick={() => void openUrl(credit.sourceUrl)}>{label}</button>
    {credit.licenseUrl ? <button type="button" onClick={() => void openUrl(credit.licenseUrl!)}>License</button> : null}
  </figcaption>;
}

export function ArtistArtworkPanel({ artistId, artistName, compact = false }: { artistId: string; artistName: string; compact?: boolean }) {
  const [artwork, setArtwork] = useState<ArtistArtwork | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const request = useRef(0);
  const revision = useArtworkRevision();
  useEffect(() => {
    const token = ++request.current;
    setFailed([]); setBusy(true); setError(null);
    void getArtistArtwork(artistId, artistName).then(value => { if (token === request.current) setArtwork(value); })
      .catch(error => { if (token === request.current) setError(String(error)); })
      .finally(() => { if (token === request.current) setBusy(false); });
    return () => { request.current++; };
  }, [artistId, artistName, revision]);
  async function refresh() {
    const token = ++request.current; setBusy(true); setError(null);
    try { const value = await getArtistArtwork(artistId, artistName, true); if (token === request.current) { setArtwork(value); setFailed([]); } }
    catch (error) { if (token === request.current) setError(String(error)); }
    finally { if (token === request.current) setBusy(false); }
  }
  const current = artwork?.artistId === artistId ? artwork : null;
  return <section className={`artist-artwork-panel${compact ? " compact" : ""}`} aria-label={`${artistName} artwork`}>
    <header><strong>Artist imagery</strong><button type="button" className="secondary-button compact-button" disabled={busy} onClick={() => void refresh()}>{busy ? "Loading artwork" : "Refresh artwork"}</button></header>
    <div className="artist-artwork-gallery" key={revision}>
      {(["background", "logo", "portrait"] as const).map(kind => {
        const credit = current?.[kind];
        const url = artworkUrl(kind === "portrait" ? "artist" : kind === "logo" ? "artist-logo" : "artist-background", artistId, 600);
        return credit && url && !failed.includes(kind) ? <figure className={`artist-artwork-${kind}`} key={kind}>
          <img src={url} alt={`${artistName} ${kind}`} loading="lazy" decoding="async" onError={() => setFailed(previous => [...previous, kind])} />
          <Credit credit={credit} />
        </figure> : null;
      })}
    </div>
    {error ? <p role="alert" className="error-message">{error}</p> : null}
    {current && (current.stale || (!current.portrait && !current.logo && !current.background)) ? <p className="artist-artwork-message">{current.message}</p> : null}
  </section>;
}
