import { lazy, Suspense, useState, type Dispatch, type SetStateAction } from "react";
import { AudioLines, Map, Search } from "lucide-react";
import { savePlaylist } from "../../backend";
import { describeSound, type SoundSearchResults } from "../../backend/sonic";
import { normalizeArtistKey } from "../../backend/normalization";
import { formatNumber, formatTrackRating } from "../../app/display";
import { createRequest } from "../../app/requests";
import { AlbumCover } from "../../components/AlbumCover";
import { NumberField } from "../../components/catalog/SearchCriteria";
import type { AiPlaylistTrack } from "../../types";
import { emptySoundSearch, type SoundSearchDraft } from "./useSearchStore";

const SonicAtlas = lazy(() => import("../../components/SonicAtlas").then(module => ({ default: module.SonicAtlas })));

function saveMatches(result: SoundSearchResults) {
  const request = createRequest("tracks");
  const tracks: AiPlaylistTrack[] = result.tracks.map(({ track, year }) => ({
    trackId: track.trackId,
    albumId: track.albumId,
    album: track.album,
    albumArtist: track.albumArtist,
    displayArtist: track.artist,
    title: track.title,
    genre: track.genre,
    year,
    seconds: Math.max(0, track.seconds),
    rating: track.rating,
    loved: track.loved,
    filePath: track.filePath,
    filename: track.filename,
  }));
  request.filters.trackIds = tracks.map(track => track.trackId);
  const name = [...`Sounds like ${result.query}`].slice(0, 120).join("");
  return savePlaylist({
    id: null,
    expectedUpdatedAt: null,
    name,
    playlist: {
      name,
      description: `${tracks.length} matches for “${result.query}”, saved in sound similarity order.`,
      prompt: result.query,
      mixtape: null,
      request,
      strategy: "ranked",
      targetTrackCount: tracks.length,
      targetMinutes: 0,
      maxTracksPerArtist: 3,
      maxTracksPerAlbum: 10,
      matchingTrackCount: result.searched,
      candidateCount: tracks.length,
      totalSeconds: tracks.reduce((total, track) => total + track.seconds, 0),
      tracks,
      model: "local sound search",
      usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null },
    },
  });
}

export function SoundSearch({ draft, setDraft, onOpenAlbum, onOpenArtist }: {
  draft: SoundSearchDraft;
  setDraft: Dispatch<SetStateAction<SoundSearchDraft>>;
  onOpenAlbum: (albumId: string) => void;
  onOpenArtist: (artistKey: string, artistName: string) => void;
}) {
  const [working, setWorking] = useState<"search" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [atlasOpen, setAtlasOpen] = useState(false);
  const { query, yearFrom, yearTo, rating, result } = draft;

  function update(patch: Partial<Omit<SoundSearchDraft, "result">>) {
    setDraft(previous => ({ ...previous, ...patch, result: null }));
    setError(null);
    setMessage(null);
  }

  async function search() {
    if (working || !query.trim()) return;
    if (yearFrom !== null && yearTo !== null && yearFrom > yearTo) {
      setError("Year from must be earlier than or equal to Year to.");
      return;
    }
    setWorking("search");
    setError(null);
    setMessage(null);
    const request = createRequest("tracks");
    request.filters.yearFrom = yearFrom;
    request.filters.yearTo = yearTo;
    if (rating === "unrated") request.filters.missingFields = ["rating"];
    else if (rating) request.filters.trackRatingMin = Number(rating);
    try {
      const next = await describeSound(query, request);
      setDraft(previous => previous === draft ? { ...previous, result: next } : previous);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setWorking(null);
    }
  }

  async function save() {
    if (working || !result?.tracks.length) return;
    setWorking("save");
    setError(null);
    setMessage(null);
    try {
      const saved = await saveMatches(result);
      setMessage(`Saved “${saved.name}” in Playlists.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setWorking(null);
    }
  }

  return (
    <>
      <form className="query-panel sound-search-form" aria-label="Describe a sound" onSubmit={event => {
        event.preventDefault();
        void search();
      }}>
        <div className="sound-search-heading">
          <div>
            <h2><AudioLines size={21} /> Describe a sound</h2>
            <p>Find tracks by how they sound. Searches use tracks that finished sound analysis.</p>
          </div>
          <button className="secondary-button" type="button" onClick={() => setAtlasOpen(true)}>
            <Map size={16} /> Open Sonic Atlas
          </button>
        </div>
        <fieldset disabled={working !== null}>
          <label className="criterion">
            <span>Sound description</span>
            <input type="search" maxLength={300} required value={query} placeholder="Rainy Sunday jazz" onChange={event => update({ query: event.target.value })} />
          </label>
          <div className="filter-grid sound-search-filters">
            <NumberField label="Year from" value={yearFrom} min={1} max={9999} onChange={value => update({ yearFrom: value })} />
            <NumberField label="Year to" value={yearTo} min={1} max={9999} onChange={value => update({ yearTo: value })} />
            <label className="criterion">
              <span>Track rating</span>
              <select value={rating} onChange={event => update({ rating: event.target.value })}>
                <option value="">Any rating</option>
                <option value="unrated">Unrated</option>
                <option value="3">3 stars and up</option>
                <option value="3.5">3.5 stars and up</option>
                <option value="4">4 stars and up</option>
                <option value="4.5">4.5 stars and up</option>
                <option value="5">5 stars</option>
              </select>
            </label>
          </div>
          <div className="sound-search-actions">
            <button className="primary-button" type="submit" disabled={!query.trim()}>
              <Search size={16} /> {working === "search" ? "Finding tracks…" : "Find tracks"}
            </button>
            <button className="secondary-button" type="button" onClick={() => {
              setDraft(emptySoundSearch);
              setError(null);
              setMessage(null);
            }}>Clear</button>
          </div>
        </fieldset>
        {error && <p className="error-message" role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
      </form>
      {result && (
        <section className="query-panel sound-search-results" aria-label="Sound matches" aria-busy={working === "search"}>
          <div className="sound-search-heading">
            <div>
              <h2>Sound matches</h2>
              <p role="status">
                {result.tracks.length
                  ? `Showing ${formatNumber(result.tracks.length)} matches for “${result.query}” from ${formatNumber(result.searched)} analyzed audio candidates.`
                  : "No analyzed tracks match these filters. Try clearing the filters or run Tools → Audio analysis."}
              </p>
            </div>
            {result.tracks.length > 0 && (
              <button className="secondary-button" type="button" disabled={working !== null} onClick={() => void save()}>
                {working === "save" ? "Saving…" : "Save as playlist"}
              </button>
            )}
          </div>
          {result.tracks.length > 0 && (
            <ul className="sound-search-list">
              {result.tracks.map(({ track, year, coverPath }) => {
                const artist = track.artist || track.albumArtist;
                const score = track.distance === null ? null : Math.max(0, Math.min(100, Math.round((1 - track.distance) * 100)));
                return (
                  <li key={track.trackKey}>
                    <button className="sound-search-album" type="button" aria-label={`Open album ${track.album} for ${track.title}`} onClick={() => onOpenAlbum(track.albumId)}>
                      <AlbumCover row={{ album: track.album, albumId: track.albumId, coverPath }} className="cover-mini" />
                      <span><strong>{track.title || "Untitled track"}</strong><small>{track.album || "Unknown album"}</small></span>
                    </button>
                    <div className="sound-search-meta">
                      {artist && <button className="sound-search-artist" type="button" aria-label={`Open artist ${artist}`} onClick={() => onOpenArtist(normalizeArtistKey(artist), artist)}>{artist}</button>}
                      <span>{year ?? "Year unknown"}</span>
                      <span>{track.rating == null ? "Unrated" : `${formatTrackRating(track.rating)} ★`}</span>
                      {score !== null && <strong title="Cosine similarity between the description and track audio">{score}% match</strong>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
      {atlasOpen && (
        <Suspense fallback={<p role="status">Opening Sonic Atlas…</p>}>
          <SonicAtlas onClose={() => setAtlasOpen(false)} onOpenAlbum={track => onOpenAlbum(track.albumId)} />
        </Suspense>
      )}
    </>
  );
}
