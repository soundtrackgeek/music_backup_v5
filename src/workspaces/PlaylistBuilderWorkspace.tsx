import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Clock3,
  Download,
  Heart,
  ListMusic,
  Save,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";

import {
  buildPlaylist,
  deleteSavedPlaylist,
  exportPlaylist,
  listSavedPlaylists,
  savePlaylist,
} from "../backend";
import type {
  AiPlaylist,
  AiPlaylistTrack,
  ExportResult,
  SavedPlaylist,
} from "../types";

type PlaylistBuilderWorkspaceProps = {
  isAvailable: boolean;
};

const examplePrompts = [
  "A 45-minute AOR mix from the 1980s with no artist repeated",
  "20 loved tracks for a late-night drive, mostly synthpop and post-punk",
  "Discover unrated deep cuts from highly rated albums",
];

function durationLabel(seconds: number | null | undefined) {
  if (!seconds) return "—";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function totalDurationLabel(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes} min`;
}

function editedPlaylist(playlist: AiPlaylist, tracks: AiPlaylistTrack[]) {
  return {
    ...playlist,
    tracks,
    totalSeconds: tracks.reduce(
      (total, track) => total + track.seconds,
      0,
    ),
  };
}

export function PlaylistBuilderWorkspace({
  isAvailable,
}: PlaylistBuilderWorkspaceProps) {
  const [prompt, setPrompt] = useState("");
  const [playlist, setPlaylist] = useState<AiPlaylist | null>(null);
  const [name, setName] = useState("");
  const [activeSavedId, setActiveSavedId] = useState<number | null>(null);
  const [savedPlaylists, setSavedPlaylists] = useState<SavedPlaylist[]>([]);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);

  useEffect(() => {
    let disposed = false;
    void listSavedPlaylists()
      .then((saved) => {
        if (!disposed) setSavedPlaylists(saved);
      })
      .catch((loadError) => {
        if (!disposed) {
          setSavedError(
            loadError instanceof Error ? loadError.message : String(loadError),
          );
        }
      });
    return () => {
      disposed = true;
    };
  }, []);

  async function createPlaylist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedPrompt = prompt.trim();
    if (!isAvailable || !normalizedPrompt || isBuilding) return;
    setIsBuilding(true);
    setError(null);
    setSavedError(null);
    setExportResult(null);
    try {
      const result = await buildPlaylist({ prompt: normalizedPrompt });
      setPlaylist(result);
      setName(result.name);
      setActiveSavedId(null);
    } catch (buildError) {
      setError(
        buildError instanceof Error ? buildError.message : String(buildError),
      );
    } finally {
      setIsBuilding(false);
    }
  }

  function moveTrack(index: number, offset: -1 | 1) {
    if (!playlist) return;
    const target = index + offset;
    if (target < 0 || target >= playlist.tracks.length) return;
    const tracks = [...playlist.tracks];
    [tracks[index], tracks[target]] = [tracks[target], tracks[index]];
    setPlaylist(editedPlaylist(playlist, tracks));
    setExportResult(null);
  }

  function removeTrack(index: number) {
    if (!playlist) return;
    setPlaylist(
      editedPlaylist(
        playlist,
        playlist.tracks.filter((_, trackIndex) => trackIndex !== index),
      ),
    );
    setExportResult(null);
  }

  async function persistPlaylist() {
    if (!playlist || !name.trim() || playlist.tracks.length === 0) return;
    setIsSaving(true);
    setSavedError(null);
    try {
      const saved = await savePlaylist({
        id: activeSavedId,
        name: name.trim(),
        playlist: { ...playlist, name: name.trim() },
      });
      setPlaylist(saved.playlist);
      setName(saved.name);
      setActiveSavedId(saved.id);
      setSavedPlaylists((previous) => [
        saved,
        ...previous.filter((entry) => entry.id !== saved.id),
      ]);
    } catch (saveError) {
      setSavedError(
        saveError instanceof Error ? saveError.message : String(saveError),
      );
    } finally {
      setIsSaving(false);
    }
  }

  function openSaved(saved: SavedPlaylist) {
    setPlaylist(saved.playlist);
    setPrompt(saved.playlist.prompt);
    setName(saved.name);
    setActiveSavedId(saved.id);
    setError(null);
    setSavedError(null);
    setExportResult(null);
  }

  async function removeSaved(saved: SavedPlaylist) {
    setSavedError(null);
    try {
      await deleteSavedPlaylist(saved.id);
      setSavedPlaylists((previous) =>
        previous.filter((entry) => entry.id !== saved.id),
      );
      if (activeSavedId === saved.id) setActiveSavedId(null);
    } catch (deleteError) {
      setSavedError(
        deleteError instanceof Error
          ? deleteError.message
          : String(deleteError),
      );
    }
  }

  async function exportCurrentPlaylist() {
    if (!playlist || !name.trim() || playlist.tracks.length === 0) return;
    setSavedError(null);
    try {
      setExportResult(
        await exportPlaylist({
          name: name.trim(),
          playlist: { ...playlist, name: name.trim() },
        }),
      );
    } catch (exportError) {
      setSavedError(
        exportError instanceof Error
          ? exportError.message
          : String(exportError),
      );
    }
  }

  return (
    <section className="workspace playlist-workspace">
      <header className="topbar">
        <div>
          <h1>Playlist Builder</h1>
          <p>Describe a moment. Luna plans it; your local library supplies it.</p>
        </div>
        <span className="playlist-local-badge">
          <ShieldCheck size={15} /> Local track selection
        </span>
      </header>

      <section className="playlist-builder-card" aria-label="Build a playlist">
        <div className="playlist-builder-heading">
          <span className="playlist-builder-mark" aria-hidden="true">
            <Sparkles size={20} />
          </span>
          <div>
            <span>Luna · Playlist planner</span>
            <h2>What should this playlist feel like?</h2>
            <p>
              Luna receives your words and returns filters, targets, and repeat
              limits. SQLite finds and sequences the tracks; names and paths
              never leave this device.
            </p>
          </div>
        </div>

        <form className="playlist-prompt-form" onSubmit={createPlaylist}>
          <label>
            <span>Playlist request</span>
            <textarea
              value={prompt}
              maxLength={2000}
              rows={3}
              disabled={isBuilding || !isAvailable}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="e.g. A 60-minute Sunday morning mix: warm soul, mellow AOR, no artist twice"
            />
          </label>
          <button
            className="primary-button"
            type="submit"
            disabled={
              isBuilding || !isAvailable || prompt.trim().length === 0
            }
          >
            <Sparkles size={16} />
            <span>{isBuilding ? "Building" : "Build playlist"}</span>
          </button>
        </form>

        <div className="playlist-examples" aria-label="Playlist examples">
          {examplePrompts.map((example) => (
            <button
              key={example}
              type="button"
              disabled={isBuilding}
              onClick={() => setPrompt(example)}
            >
              {example}
            </button>
          ))}
        </div>
        {!isAvailable ? (
          <p className="playlist-note">Import a library before building a playlist.</p>
        ) : null}
        {error ? <p className="error-message playlist-note">{error}</p> : null}
      </section>

      <div className="playlist-content-grid">
        <section className="playlist-result-panel" aria-label="Playlist review">
          {playlist ? (
            <>
              <header className="playlist-result-heading">
                <div>
                  <span>{playlist.strategy} recipe</span>
                  <input
                    aria-label="Playlist name"
                    value={name}
                    maxLength={120}
                    onChange={(event) => setName(event.target.value)}
                  />
                  <p>{playlist.description}</p>
                </div>
                <div className="playlist-result-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={isSaving || playlist.tracks.length === 0}
                    onClick={() => void persistPlaylist()}
                  >
                    <Save size={16} />
                    <span>
                      {isSaving
                        ? "Saving"
                        : activeSavedId == null
                          ? "Save playlist"
                          : "Update saved"}
                    </span>
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    disabled={playlist.tracks.length === 0}
                    onClick={() => void exportCurrentPlaylist()}
                  >
                    <Download size={16} />
                    <span>Export M3U8</span>
                  </button>
                </div>
              </header>

              <dl className="playlist-recipe-stats">
                <div>
                  <dt>Selected</dt>
                  <dd>{playlist.tracks.length} tracks</dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd>{totalDurationLabel(playlist.totalSeconds)}</dd>
                </div>
                <div>
                  <dt>Local matches</dt>
                  <dd>{playlist.matchingTrackCount.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Repeat cap</dt>
                  <dd>{playlist.maxTracksPerArtist} / artist</dd>
                </div>
              </dl>

              <div className="playlist-track-list">
                {playlist.tracks.length === 0 ? (
                  <div className="playlist-empty-state">
                    <ListMusic size={24} />
                    <strong>No tracks remain in this draft.</strong>
                    <span>Build again or reopen a saved playlist.</span>
                  </div>
                ) : (
                  playlist.tracks.map((track, index) => (
                    <article
                      className="playlist-track"
                      key={`${track.trackId}-${index}`}
                    >
                      <span className="playlist-track-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div className="playlist-track-copy">
                        <strong>{track.title || "Unknown track"}</strong>
                        <span>
                          {track.displayArtist || track.albumArtist || "Unknown artist"} · {track.album || "Unknown album"}
                        </span>
                        <div className="playlist-track-metadata">
                          {track.year != null ? (
                            <span className="playlist-track-year">
                              {track.year}
                            </span>
                          ) : null}
                          {track.rating != null ? (
                            <span
                              className="playlist-track-rating"
                              aria-label={`Track rating ${track.rating} out of 100`}
                              title={`Rating ${track.rating} out of 100`}
                            >
                              <Star size={11} fill="currentColor" aria-hidden="true" />
                              {track.rating}
                            </span>
                          ) : null}
                          {track.loved ? (
                            <span
                              className="playlist-loved"
                              aria-label="Loved track"
                              title="Loved track"
                            >
                              <Heart size={12} fill="currentColor" aria-hidden="true" />
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <span className="playlist-track-genre">
                        {track.genre || "Unknown"}
                      </span>
                      <span className="playlist-track-duration">
                        {durationLabel(track.seconds)}
                      </span>
                      <div className="playlist-track-actions">
                        <button
                          type="button"
                          aria-label={`Move ${track.title || "track"} up`}
                          disabled={index === 0}
                          onClick={() => moveTrack(index, -1)}
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${track.title || "track"} down`}
                          disabled={index === playlist.tracks.length - 1}
                          onClick={() => moveTrack(index, 1)}
                        >
                          <ArrowDown size={14} />
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${track.title || "track"}`}
                          onClick={() => removeTrack(index)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>

              <footer className="playlist-result-footer">
                <span>
                  Luna inspected your request only · {playlist.candidateCount} local candidates reviewed
                </span>
                <span>{playlist.model}</span>
              </footer>
              {exportResult ? (
                <div className="export-result playlist-export-result" role="status">
                  <Check size={17} />
                  <span>
                    {exportResult.rowCount} tracks exported to {exportResult.path}
                  </span>
                </div>
              ) : null}
            </>
          ) : (
            <div className="playlist-empty-state playlist-empty-draft">
              <ListMusic size={28} />
              <strong>Your draft will appear here.</strong>
              <span>Review, reorder, remove, save, then export.</span>
            </div>
          )}
        </section>

        <aside className="playlist-saved-panel" aria-label="Saved playlists">
          <header>
            <div>
              <span>Local snapshots</span>
              <h2>Saved playlists</h2>
            </div>
            <strong>{savedPlaylists.length}</strong>
          </header>
          <p>
            Reopen the exact track order without calling Luna or spending tokens.
          </p>
          {savedError ? <p className="error-message">{savedError}</p> : null}
          <div className="playlist-saved-list">
            {savedPlaylists.length === 0 ? (
              <div className="playlist-empty-state">
                <Clock3 size={21} />
                <strong>No saved playlists yet.</strong>
                <span>Saving is always explicit.</span>
              </div>
            ) : (
              savedPlaylists.map((saved) => (
                <article
                  className={saved.id === activeSavedId ? "active" : ""}
                  key={saved.id}
                >
                  <button type="button" onClick={() => openSaved(saved)}>
                    <strong>{saved.name}</strong>
                    <span>
                      {saved.playlist.tracks.length} tracks · {totalDurationLabel(saved.playlist.totalSeconds)}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${saved.name}`}
                    onClick={() => void removeSaved(saved)}
                  >
                    <Trash2 size={15} />
                  </button>
                </article>
              ))
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
