import { useEffect, useRef, useState } from "react";
import { getArtistSplitContext, splitArtist } from "../../backend/artistIdentity";
import type { ArtistSplitContext, SplitArtistResult } from "../../bindings";

export function SplitArtistDialog({ artistId, onClose, onSaved }: {
  artistId: string; onClose: () => void; onSaved: (result: SplitArtistResult) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [context, setContext] = useState<ArtistSplitContext | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [description, setDescription] = useState("");
  const [sourceDescription, setSourceDescription] = useState("");
  const [targetId, setTargetId] = useState("");
  const [mbid, setMbid] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    element?.showModal();
    let cancelled = false;
    void getArtistSplitContext(artistId).then((result) => {
      if (!cancelled) { setContext(result); setSourceDescription(result.artist.disambiguation ?? ""); }
    }).catch((reason: unknown) => { if (!cancelled) setError(String(reason)); });
    return () => { cancelled = true; element?.close(); if (previousFocus instanceof HTMLElement) previousFocus.focus(); };
  }, [artistId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!context || !selected.size || busy) return;
    if (!targetId && mbid.trim() && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mbid.trim())) {
      setError("Enter a valid MusicBrainz artist ID, or leave it empty."); return;
    }
    setBusy(true); setError(null);
    try {
      const result = await splitArtist({ sourceArtistId: artistId, albumIds: [...selected],
        targetArtistId: targetId || null, disambiguation: description,
        sourceDisambiguation: sourceDescription, musicbrainzMbid: mbid.trim() || null });
      onSaved(result);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setBusy(false); }
  }
  const albums = context?.albums.filter((album) => `${album.title} ${album.year ?? ""}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())) ?? [];
  return <dialog ref={dialog} className="artist-split-dialog" aria-labelledby="artist-split-title"
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={(event) => void submit(event)}>
      <header><div><span className="eyebrow">Separate artists with the same name</span>
        <h2 id="artist-split-title">Split {context?.artist.name ?? "artist"}</h2></div>
        <button type="button" className="secondary-button" disabled={busy} onClick={onClose} aria-label="Close split artist">Close</button></header>
      <p>Choose the albums belonging to a different artist. Their music tags and files stay as they are.</p>
      {context ? <>
        <label>Current artist description<input maxLength={240} value={sourceDescription} disabled={busy}
          placeholder="For example, Norwegian rock group" onChange={(event) => setSourceDescription(event.target.value)} /></label>
        <label>Move albums to<select value={targetId} disabled={busy} onChange={(event) => setTargetId(event.target.value)}>
          <option value="">Create a separate artist</option>
          {context.otherArtists.map((artist) => <option key={artist.id} value={artist.id}>
            {artist.name} — {artist.disambiguation ?? artist.musicbrainzMbid ?? "Separate profile"}</option>)}
        </select></label>
        {!targetId ? <div className="artist-split-fields">
          <label>New artist description<input value={description} maxLength={240} required disabled={busy}
            placeholder="Country, group type, or active years" onChange={(event) => setDescription(event.target.value)} /></label>
          <label>MusicBrainz artist ID (optional)<input value={mbid} disabled={busy}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" onChange={(event) => setMbid(event.target.value)} /></label>
        </div> : null}
        <label>Find albums<input type="search" value={search} disabled={busy} onChange={(event) => setSearch(event.target.value)} /></label>
        <div className="artist-split-selection"><strong>{selected.size} of {context.albums.length} albums selected</strong>
          <button type="button" disabled={busy || !albums.length} onClick={() => setSelected((current) => new Set([...current, ...albums.map((album) => album.id)]))}>Select visible</button>
          <button type="button" disabled={busy || !selected.size} onClick={() => setSelected(new Set())}>Clear selection</button></div>
        <fieldset className="artist-split-albums" disabled={busy}><legend>Albums to move</legend>
          {albums.map((album) => <label key={album.id}><input type="checkbox" checked={selected.has(album.id)}
            onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(album.id); else next.delete(album.id); return next; })} />
            <span><strong>{album.title}</strong><small>{[album.year, `${album.tracks} tracks`].filter(Boolean).join(" · ")}</small></span></label>)}
          {!albums.length ? <p>No albums match.</p> : null}
        </fieldset>
        <p>{context.albums.length - selected.size} albums will remain with the current artist. You can move albums between these profiles later.</p>
      </> : !error ? <p role="status">Loading artist albums…</p> : null}
      {error ? <p role="alert" className="error-message">{error}</p> : null}
      <footer><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Cancel</button>
        <button type="submit" className="primary-button" disabled={!context || !selected.size || busy || (!targetId && !description.trim())}>
          {busy ? "Moving albums…" : `Move ${selected.size} ${selected.size === 1 ? "album" : "albums"}`}</button></footer>
    </form>
  </dialog>;
}
