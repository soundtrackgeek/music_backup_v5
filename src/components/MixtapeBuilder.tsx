import { useEffect, useRef, useState } from "react";
import { CassetteTape, LockKeyhole, RefreshCw, Sparkles } from "lucide-react";
import { searchLibrary, scoreMixtapeCandidates } from "../backend";
import { createRequest } from "../app/requests";
import { localSearchPlaylistFromResponse } from "../app/searchPlaylist";
import type { AiPlaylist, AiPlaylistTrack, BrowseRequest } from "../types";
import {
  candidateScore, defaultMixtapeConfig, mixtapeDuration, mixtapePlaylist,
  mixtapeRoles, sequenceMixtape, slotProtected, swapMixtapeTrack, validateMixtape,
  type JevResult, type MixtapeConfig, type MixtapeDraft, type MixtapeRole,
} from "../mixtape";
import "./MixtapeBuilder.css";

const emptyUsage = { inputTokens: null, outputTokens: null, cachedInputTokens: null };
const cacheKey = (pool: AiPlaylistTrack[], briefs: [string, string], notes: Record<string, string>) => JSON.stringify({ pool, briefs, notes });
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

function eligiblePool(tracks: AiPlaylistTrack[]) {
  const seen = new Set<number>();
  return tracks.filter((track) => {
    if (track.seconds <= 0 || !Number.isSafeInteger(track.seconds) || seen.has(track.trackId)) return false;
    seen.add(track.trackId);
    return true;
  }).slice(0, 60);
}

export function MixtapeBuilder({ playlist, sourceRequest, sourceTitle, isAvailable, onBuilt, onBusyChange }: {
  playlist: AiPlaylist | null;
  sourceRequest: BrowseRequest | null;
  sourceTitle: string | null;
  isAvailable: boolean;
  onBuilt: (playlist: AiPlaylist) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const tape = playlist?.mixtape;
  const [config, setConfig] = useState<MixtapeConfig>(() => structuredClone(tape?.config ?? defaultMixtapeConfig));
  const [pool, setPool] = useState<AiPlaylistTrack[]>(() => tape?.pool ?? []);
  const [notes, setNotes] = useState<Record<string, string>>(() => tape?.notes ?? {});
  const [query, setQuery] = useState("");
  const [request, setRequest] = useState<BrowseRequest>(() => tape && playlist ? playlist.request : createRequest("tracks"));
  const [cached, setCached] = useState<{ key: string; result: JevResult } | null>(() => tape?.scoredBriefs && playlist ? { key: cacheKey(tape.pool, tape.scoredBriefs, tape.notes), result: { assessments: tape.assessments, model: playlist.model, usage: playlist.usage } } : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);

  function updateConfig<K extends keyof MixtapeConfig>(key: K, value: MixtapeConfig[K]) {
    setConfig((previous) => ({ ...previous, [key]: value }));
  }

  function useTracks(tracks: AiPlaylistTrack[], nextRequest: BrowseRequest) {
    const eligible = eligiblePool(tracks);
    // Preserve every locked selection when replacing the candidate pool.
    const lockedIds = new Set(tape?.sides.flatMap((slots) => slots.filter((_, index) => slotProtected(slots, index)).map((slot) => slot.trackId)) ?? []);
    if ([...lockedIds].some((id) => !eligible.some((track) => track.trackId === id))) throw new Error("This pool would remove a locked selection. Keep the current pool or unlock it first.");
    setPool(eligible); setRequest(nextRequest); setNotes({}); setCached(null);
    setNotice(`${eligible.length} candidates ready. Tracks without a known duration are excluded; at most 60 are shared.`);
    if (!eligible.length) throw new Error("No candidates have a known positive duration. Try another Search or import track durations.");
  }

  async function loadCandidates() {
    setBusy(true); onBusyChange(true); setError(null); const current = ++generation.current;
    try {
      const nextRequest: BrowseRequest = { ...(sourceRequest ?? createRequest("tracks")), view: "tracks", offset: 0, limit: 500 };
      if (!sourceRequest) { nextRequest.searchText = query.trim(); nextRequest.sort = { field: "trackRating", direction: "desc" }; }
      const response = await searchLibrary(nextRequest);
      if (current !== generation.current) return;
      const tracks = localSearchPlaylistFromResponse("Mixtape candidates", nextRequest, response).tracks;
      // Spread the bounded local shortlist across artists before any remote scoring.
      const groups = new Map<string, AiPlaylistTrack[]>();
      tracks.forEach((track) => { const key = (track.displayArtist || track.albumArtist || "Unknown").toLowerCase(); groups.set(key, [...(groups.get(key) ?? []), track]); });
      const varied: AiPlaylistTrack[] = [];
      for (let round = 0; round < tracks.length && varied.length < 60; round++) {
        for (const group of groups.values()) { if (group[round] && group[round].seconds > 0) varied.push(group[round]); if (varied.length === 60) break; }
      }
      useTracks(varied, nextRequest);
    } catch (failure) { if (current === generation.current) setError(errorText(failure)); }
    finally { setBusy(false); onBusyChange(false); }
  }

  const validCache = cached?.key === cacheKey(pool, config.briefs, notes) ? cached.result : null;

  async function build(mode: "jev" | "cached" | "local") {
    setError(null); setBusy(true); onBusyChange(true); const current = ++generation.current;
    try {
      let result = mode === "cached" ? validCache : null;
      const draft: MixtapeDraft = { version: 1, config, pool, notes, assessments: [], scoredBriefs: null, sides: tape?.sides ?? [[], []] };
      // Validate exact constraints and locked feasibility before spending tokens.
      sequenceMixtape(draft);
      if (mode === "jev") {
        result = await scoreMixtapeCandidates({ tracks: pool, briefs: config.briefs, notes });
        if (current !== generation.current) return;
        setCached({ key: cacheKey(pool, config.briefs, notes), result });
      }
      if (mode === "cached" && !result) throw new Error("The briefs, notes or candidates changed. Score with Jev again or build locally.");
      const built = sequenceMixtape({ ...draft, assessments: result?.assessments ?? [], scoredBriefs: result ? [...config.briefs] : null });
      onBuilt(mixtapePlaylist(built, request, result?.model ?? "Local mixtape", result?.usage ?? emptyUsage));
      setNotice(result ? "Both sides are ready. Adjust weights and rebuild from saved scores without another API call." : "Built locally by rating and exact constraints. No atmosphere or role judgments were made.");
    } catch (failure) { if (current === generation.current) setError(errorText(failure)); }
    finally { setBusy(false); onBusyChange(false); }
  }

  return <section className="mixtape-builder" aria-label="Two-sided mixtape architect">
    <header className="mixtape-heading"><CassetteTape size={30} /><div><span>C90 · YOUR LIBRARY, TWO SIDES</span><h2>Make a night of it.</h2><p>Give each side a feeling. Jev judges the fit; you make the final cut.</p></div><strong>{config.minutes[0]} / {config.minutes[1]}</strong></header>
    <fieldset disabled={busy || !isAvailable}>
      <div className="mixtape-briefs">{([0, 1] as const).map((side) => <div className={`mixtape-brief side-${side}`} key={side}>
        <label><span>Side {side === 0 ? "A" : "B"} brief</span><textarea rows={2} maxLength={600} value={config.briefs[side]} onChange={(event) => { const briefs = [...config.briefs] as [string, string]; briefs[side] = event.target.value; updateConfig("briefs", briefs); }} /></label>
        <label className="mixtape-limit"><span>Side {side === 0 ? "A" : "B"} minutes</span><input type="number" min={1} max={90} value={config.minutes[side]} onChange={(event) => { const minutes = [...config.minutes] as [number, number]; minutes[side] = Number(event.target.value); updateConfig("minutes", minutes); }} /></label>
      </div>)}</div>
      <div className="mixtape-controls">
        <label><span>Max per artist · whole tape</span><input type="number" min={1} max={10} value={config.maxArtist} onChange={(event) => updateConfig("maxArtist", Number(event.target.value))} /></label>
        <label><span>Max per album · whole tape</span><input type="number" min={1} max={10} value={config.maxAlbum} onChange={(event) => updateConfig("maxAlbum", Number(event.target.value))} /></label>
        {(["atmosphere", "role", "rating"] as const).map((dimension) => <label key={dimension}><span>{dimension[0].toUpperCase() + dimension.slice(1)} weight · {config.weights[dimension]}</span><input aria-label={`${dimension} weight`} type="range" min={0} max={100} value={config.weights[dimension]} onChange={(event) => updateConfig("weights", { ...config.weights, [dimension]: Number(event.target.value) })} /></label>)}
      </div>
      <div className="mixtape-source">
        {sourceRequest ? <p>Source: <strong>{sourceTitle || "Current cohort"}</strong></p> : <label><span>Candidate search</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. Depeche Mode — or leave blank" /></label>}
        <button className="secondary-button" type="button" onClick={() => void loadCandidates()}>Load candidates</button>
        {playlist && !tape ? <button className="secondary-button" type="button" onClick={() => { setError(null); try { useTracks(playlist.tracks, playlist.request); } catch (failure) { setError(errorText(failure)); } }}>Use current draft</button> : null}
      </div>
      {pool.length > 0 ? <details className="mixtape-candidates" open={!tape}>
        <summary>Review {pool.length} candidates &amp; add musical notes</summary>
        <p>Jev receives the titles, artists, albums, genres, years, side briefs and notes shown here. File paths, ratings and listening history stay local. Sparse metadata gives weaker judgments.</p>
        <div className="mixtape-candidate-list">{pool.map((track) => <article key={track.trackId}>
          <div><strong>{track.title || "Unknown track"}</strong><span>{track.displayArtist || track.albumArtist} · {track.album}</span><small>{track.genre || "Genre unknown"} · {track.year ?? "Year unknown"} · {mixtapeDuration(track.seconds)}</small></div>
          <input aria-label={`Notes for ${track.title}`} maxLength={600} placeholder="Optional: shimmering synths, patient build…" value={notes[track.trackId] ?? ""} onChange={(event) => setNotes((previous) => ({ ...previous, [track.trackId]: event.target.value }))} />
          <button type="button" className="secondary-button" aria-label={`Exclude ${track.title}`} disabled={tape?.sides.some((slots) => slots.some((slot, index) => slot.trackId === track.trackId && slotProtected(slots, index)))} onClick={() => { setPool((previous) => previous.filter((entry) => entry.trackId !== track.trackId)); setNotes((previous) => { const next = { ...previous }; delete next[track.trackId]; return next; }); }}>Exclude</button>
        </article>)}</div>
      </details> : <p className="mixtape-hint">Start with a local shortlist, or bring tracks here from Search. Nothing is sent while loading candidates.</p>}
      <div className="mixtape-build-actions">
        <button className="primary-button" type="button" disabled={!pool.length} onClick={() => void build("jev")}><Sparkles size={16} />{busy ? "Working…" : "Score with Jev & build"}</button>
        <button className="secondary-button" type="button" disabled={!validCache} onClick={() => void build("cached")}><RefreshCw size={15} />Rebuild from saved scores</button>
        <button className="secondary-button" type="button" disabled={!pool.length} onClick={() => void build("local")}>Build locally</button>
      </div>
    </fieldset>
    <p className="mixtape-hint">Thematic sequencing from metadata and notes. No audio analysis or beat-matching. Scoring makes paid OpenRouter requests; local edits are free.</p>
    {busy ? <p role="status">Working on your mixtape. Existing selections stay visible while scoring.</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {error ? <p className="error-message" role="alert">{error}</p> : null}
  </section>;
}

export function MixtapeReview({ playlist, disabled, onChange }: { playlist: AiPlaylist; disabled: boolean; onChange: (playlist: AiPlaylist) => void }) {
  const [error, setError] = useState<string | null>(null);
  const tape = playlist.mixtape!;
  const pool = new Map(tape.pool.map((track) => [track.trackId, track]));
  function change(update: () => MixtapeDraft) {
    setError(null);
    try {
      const updated = update(); validateMixtape(updated);
      if (updated.sides.some((side) => !side.length)) throw new Error("Keep at least one track on each side.");
      onChange({ ...mixtapePlaylist(updated, playlist.request, playlist.model, playlist.usage), name: playlist.name });
    } catch (failure) { setError(errorText(failure)); }
  }
  function editSlot(side: 0 | 1, index: number, patch: Partial<MixtapeDraft["sides"][0][0]>) {
    change(() => ({ ...tape, sides: tape.sides.map((slots, s) => slots.map((slot, i) => s === side && i === index ? { ...slot, ...patch } : slot)) as MixtapeDraft["sides"] }));
  }
  function move(side: 0 | 1, index: number, offset: number) {
    change(() => {
      const sides = structuredClone(tape.sides); const target = index + offset;
      if (slotProtected(sides[side], index) || slotProtected(sides[side], target)) throw new Error("Unlock these selections before moving them.");
      [sides[side][index], sides[side][target]] = [sides[side][target], sides[side][index]];
      return { ...tape, sides };
    });
  }
  return <section className="mixtape-review" aria-label="Mixtape side previews">
    <p><LockKeyhole size={14} /> Lock a selection to keep its position. Lock a transition to keep both tracks together. Swaps use unused candidates that fit every limit.</p>
    <div className="mixtape-sides">{([0, 1] as const).map((side) => {
      const slots = tape.sides[side]; const seconds = slots.reduce((sum, slot) => sum + pool.get(slot.trackId)!.seconds, 0); const limit = tape.config.minutes[side] * 60;
      return <section className={`mixtape-side side-${side}`} key={side} aria-label={`Side ${side === 0 ? "A" : "B"} preview`}>
        <header><div><span>SIDE {side === 0 ? "A" : "B"}</span><h3>{tape.config.briefs[side]}</h3></div><strong>{mixtapeDuration(seconds)}<small> / {mixtapeDuration(limit)}</small></strong></header>
        <progress aria-label={`Side ${side === 0 ? "A" : "B"} duration`} value={seconds} max={limit} /><p className="mixtape-space">{mixtapeDuration(limit - seconds)} left · {slots.length} {slots.length === 1 ? "track" : "tracks"}</p>
        <ol>{slots.map((slot, index) => {
          const track = pool.get(slot.trackId)!; const protectedSlot = slotProtected(slots, index); const assessment = tape.assessments.find((entry) => entry.trackId === slot.trackId);
          return <li key={slot.trackId} className={protectedSlot ? "is-locked" : ""}>
            <div className="mixtape-track-title"><b>{String(index + 1).padStart(2, "0")}</b><div><strong>{track.title || "Unknown track"}</strong><span>{track.displayArtist || track.albumArtist} · {track.album}</span></div><time>{mixtapeDuration(track.seconds)}</time></div>
            <div className="mixtape-track-edit"><label><span className="sr-only">Role for {track.title}</span><select aria-label={`Role for ${track.title}`} value={slot.role} disabled={disabled || protectedSlot} onChange={(event) => editSlot(side, index, { role: event.target.value as MixtapeRole })}>{mixtapeRoles.map((role) => <option key={role} value={role}>{role[0].toUpperCase() + role.slice(1)}</option>)}</select></label>
              <button type="button" disabled={disabled} aria-pressed={slot.locked} onClick={() => editSlot(side, index, { locked: !slot.locked })}>{slot.locked ? "Unlock" : "Lock"} <span className="sr-only">{track.title}</span></button>
              <button type="button" disabled={disabled || protectedSlot} aria-label={`Swap ${track.title}`} onClick={() => change(() => swapMixtapeTrack(tape, side, index))}>Swap</button>
              <button type="button" disabled={disabled || index === 0 || protectedSlot || slotProtected(slots, index - 1)} aria-label={`Move ${track.title} up`} onClick={() => move(side, index, -1)}>↑</button>
              <button type="button" disabled={disabled || index === slots.length - 1 || protectedSlot || slotProtected(slots, index + 1)} aria-label={`Move ${track.title} down`} onClick={() => move(side, index, 1)}>↓</button>
            </div>
            {assessment ? <small className="mixtape-fit">Fit {Math.round(candidateScore(tape, track, side, slot.role) * 100)} · atmosphere {Math.round(assessment[side === 0 ? "sideA" : "sideB"].score * 100)} · role {Math.round(assessment[slot.role].score * 100)}<br />Confidence: atmosphere {Math.round(assessment[side === 0 ? "sideA" : "sideB"].confidence * 100)}%, role {Math.round(assessment[slot.role].confidence * 100)}% · judgment, not audio measurement</small> : <small className="mixtape-fit">Local selection · no Jev judgment</small>}
            {index < slots.length - 1 ? <button className="mixtape-transition" type="button" disabled={disabled} aria-pressed={slot.transitionToNext} aria-label={`${slot.transitionToNext ? "Unlock" : "Lock"} transition after ${track.title}`} onClick={() => editSlot(side, index, { transitionToNext: !slot.transitionToNext })}>{slot.transitionToNext ? "Locked transition ↓" : "Lock transition ↓"}</button> : null}
          </li>;
        })}</ol>
      </section>;
    })}</div>
    <p>Save keeps both sides, notes, roles, locks and scores. Playback order is Side A → Side B in the saved playlist and M3U8 export.</p>
    {error ? <p className="error-message" role="alert">{error}</p> : null}
  </section>;
}
