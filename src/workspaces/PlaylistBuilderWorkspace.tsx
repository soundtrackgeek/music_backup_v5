import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  Clock3,
  Download,
  Heart,
  ListMusic,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";

import {
  buildPlaylist,
  deleteSavedPlaylist,
  exportPlaylist,
  listSavedPlaylists,
  refreshSmartPlaylist,
  savePlaylist,
  setPlaylistAutomation,
  syncPlexPlaylist,
} from "../backend";
import type {
  AiPlaylist,
  AiPlaylistTrack,
  BrowseRequest,
  ExportResult,
  SavedPlaylist,
} from "../types";
import { aiMarkdownTitle, playlistMarkdown } from "../aiMarkdownExport";
import { AiMarkdownExportButton } from "../components/AiMarkdownExportButton";
import { ExportResultStatus } from "../components/ExportResultStatus";
import { PageLunaCommandArea } from "../components/SearchProgressiveDisclosure";

export type PlaylistBuilderLaunch = {
  id: number;
  cohortTitle: string;
  prompt: string;
  request: BrowseRequest;
  draft?: AiPlaylist;
};

type PlaylistBuilderWorkspaceProps = {
  isAvailable: boolean;
  launch?: PlaylistBuilderLaunch | null;
  onLaunchConsumed?: () => void;
  savedPlaylistToOpen?: SavedPlaylist | null;
};

const examplePrompts = [
  "A 45-minute AOR mix from the 1980s with no artist repeated",
  "20 loved tracks for a late-night drive, mostly synthpop and post-punk",
  "Discover unrated deep cuts from highly rated albums",
];

const playlistReviewBatchSize = 500;

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
  launch = null,
  onLaunchConsumed,
  savedPlaylistToOpen = null,
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
  const [automationMessage, setAutomationMessage] = useState<string | null>(null);
  const [busyAutomation, setBusyAutomation] = useState<
    "smart" | "plex" | "refresh" | "sync" | null
  >(null);
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);
  const [sourceCohortTitle, setSourceCohortTitle] = useState<string | null>(null);
  const [directSearchTitle, setDirectSearchTitle] = useState<string | null>(null);
  const [visibleTrackCount, setVisibleTrackCount] = useState(
    playlistReviewBatchSize,
  );
  const [sourceRequest, setSourceRequest] =
    useState<BrowseRequest | null>(null);

  useEffect(() => {
    if (!launch) return;
    setPrompt(launch.draft?.prompt ?? launch.prompt);
    setPlaylist(launch.draft ?? null);
    setName(launch.draft?.name ?? "");
    setActiveSavedId(null);
    setError(null);
    setSavedError(null);
    setAutomationMessage(null);
    setExportResult(null);
    setDirectSearchTitle(launch.draft ? launch.cohortTitle : null);
    setVisibleTrackCount(playlistReviewBatchSize);
    setSourceCohortTitle(launch.draft ? null : launch.cohortTitle);
    setSourceRequest(launch.draft ? null : launch.request);
    onLaunchConsumed?.();
  }, [launch?.id]);

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

  useEffect(() => {
    if (!savedPlaylistToOpen) return;
    setSavedPlaylists((previous) =>
      previous.some((saved) => saved.id === savedPlaylistToOpen.id)
        ? previous
        : [savedPlaylistToOpen, ...previous],
    );
    openSaved(savedPlaylistToOpen);
  }, [savedPlaylistToOpen?.id]);

  async function createPlaylist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedPrompt = prompt.trim();
    if (!isAvailable || !normalizedPrompt || isBuilding) return;
    setIsBuilding(true);
    setError(null);
    setSavedError(null);
    setExportResult(null);
    try {
      const result = await buildPlaylist({
        prompt: normalizedPrompt,
        sourceRequest,
      });
      setPlaylist(result);
      setVisibleTrackCount(playlistReviewBatchSize);
      setName(result.name);
      setActiveSavedId(null);
      setAutomationMessage(null);
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
      setAutomationMessage(null);
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
    setVisibleTrackCount(playlistReviewBatchSize);
    setPrompt(saved.playlist.prompt);
    setName(saved.name);
    setActiveSavedId(saved.id);
    setError(null);
    setSavedError(null);
    setAutomationMessage(null);
    setExportResult(null);
    setSourceRequest(null);
    setSourceCohortTitle(null);
    setDirectSearchTitle(
      saved.playlist.model === "Local Search" ? saved.name : null,
    );
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

  function replaceSavedPlaylist(saved: SavedPlaylist) {
    setSavedPlaylists((previous) => [
      saved,
      ...previous.filter((entry) => entry.id !== saved.id),
    ]);
    if (activeSavedId === saved.id) {
      setPlaylist(saved.playlist);
      setVisibleTrackCount(playlistReviewBatchSize);
      setName(saved.name);
    }
  }

  async function updateAutomation(
    action: "smart" | "plex",
    smart: boolean,
    plexSyncEnabled: boolean,
  ) {
    if (activeSavedId == null) return;
    setBusyAutomation(action);
    setSavedError(null);
    setAutomationMessage(null);
    try {
      const saved = await setPlaylistAutomation({
        id: activeSavedId,
        smart,
        plexSyncEnabled,
      });
      replaceSavedPlaylist(saved);
      setAutomationMessage(
        action === "smart"
          ? smart
            ? "Smart rules enabled. The playlist now follows the saved filters."
            : "Smart rules and Plex auto-sync disabled."
          : plexSyncEnabled
            ? "Automatic Plex sync enabled for this playlist."
            : "Automatic Plex sync disabled for this playlist.",
      );
    } catch (automationError) {
      setSavedError(
        automationError instanceof Error
          ? automationError.message
          : String(automationError),
      );
    } finally {
      setBusyAutomation(null);
    }
  }

  async function refreshActiveSmartPlaylist() {
    if (activeSavedId == null) return;
    setBusyAutomation("refresh");
    setSavedError(null);
    setAutomationMessage(null);
    try {
      const result = await refreshSmartPlaylist(activeSavedId);
      replaceSavedPlaylist(result.playlist);
      setAutomationMessage(
        `Smart rules refreshed: ${result.desiredCount.toLocaleString()} matching tracks.`,
      );
    } catch (refreshError) {
      setSavedError(
        refreshError instanceof Error ? refreshError.message : String(refreshError),
      );
    } finally {
      setBusyAutomation(null);
    }
  }

  async function syncActivePlexPlaylist() {
    if (activeSavedId == null) return;
    setBusyAutomation("sync");
    setSavedError(null);
    setAutomationMessage(null);
    try {
      const result = await syncPlexPlaylist(activeSavedId);
      const refreshed = await listSavedPlaylists();
      setSavedPlaylists(refreshed);
      const active = refreshed.find((saved) => saved.id === activeSavedId);
      if (active) {
        setPlaylist(active.playlist);
        setVisibleTrackCount(playlistReviewBatchSize);
        setName(active.name);
      }
      setAutomationMessage(result.message);
    } catch (syncError) {
      setSavedError(syncError instanceof Error ? syncError.message : String(syncError));
    } finally {
      setBusyAutomation(null);
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

  const activeSavedPlaylist =
    savedPlaylists.find((saved) => saved.id === activeSavedId) ?? undefined;
  const isLocalSearchPlaylist = playlist?.model === "Local Search";
  const visibleTracks = playlist?.tracks.slice(0, visibleTrackCount) ?? [];
  const nextTrackBatchSize = playlist
    ? Math.min(
        playlistReviewBatchSize,
        playlist.tracks.length - visibleTrackCount,
      )
    : 0;

  return (
    <section className="workspace playlist-workspace">
      <header className="topbar">
        <div>
          <h1>Playlist Builder</h1>
          <p>
            {directSearchTitle
              ? "Your Search results are ready to review, save, and export."
              : "Describe a moment. Luna plans it; your local library supplies it."}
          </p>
        </div>
        <span className="playlist-local-badge">
          <ShieldCheck size={15} /> Local track selection
        </span>
      </header>

      {directSearchTitle && playlist ? (
        <section
          className="playlist-direct-source"
          aria-label="Search playlist created locally"
        >
          <span className="playlist-builder-mark" aria-hidden="true">
            <ListMusic size={20} />
          </span>
          <div>
            <span>Created locally from Search</span>
            <h2>{directSearchTitle}</h2>
            <p>
              {playlist.tracks.length.toLocaleString()} tracks loaded in Search
              order. No Luna request was made.
            </p>
          </div>
        </section>
      ) : (
        <PageLunaCommandArea
          idPrefix="playlist"
          label="Playlist Luna commands"
          description="Describe a mix for Luna to plan from your local tracks."
          openRequestId={launch?.id}
        >
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
                  never leave this device. A launched insight cohort remains locked
                  as the local source.
                </p>
              </div>
            </div>

            {sourceCohortTitle ? (
              <div className="playlist-cohort-source" aria-label="Playlist source cohort">
                <ListMusic size={16} />
                <div>
                  <span>Source cohort</span>
                  <strong>{sourceCohortTitle}</strong>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Clear cohort source"
                  title="Clear cohort source"
                  onClick={() => {
                    setSourceCohortTitle(null);
                    setSourceRequest(null);
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            ) : null}

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
        </PageLunaCommandArea>
      )}

      <div className="playlist-content-grid">
        <section className="playlist-result-panel" aria-label="Playlist review">
          {playlist ? (
            <>
              <header className="playlist-result-heading">
                <div>
                  <span>
                    {isLocalSearchPlaylist
                      ? "Local Search order · no Luna"
                      : `${playlist.strategy} recipe`}
                  </span>
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

              <AiMarkdownExportButton
                title={aiMarkdownTitle(
                  isLocalSearchPlaylist ? "Search playlist" : "Luna playlist",
                  name,
                )}
                markdown={playlistMarkdown(
                  name,
                  { ...playlist, name: name.trim() || playlist.name },
                  activeSavedPlaylist,
                )}
              />

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
                  <dt>{isLocalSearchPlaylist ? "Order" : "Repeat cap"}</dt>
                  <dd>
                    {isLocalSearchPlaylist
                      ? "Search results"
                      : `${playlist.maxTracksPerArtist} / artist`}
                  </dd>
                </div>
              </dl>

              {activeSavedPlaylist ? (
                <section
                  className="playlist-automation-panel"
                  aria-label="Smart playlist and Plex synchronization"
                >
                  <div className="playlist-automation-heading">
                    <div>
                      <span>Automation</span>
                      <h3>Smart playlist & Plex</h3>
                    </div>
                    {activeSavedPlaylist.automation.lastPlexSuccessAt ? (
                      <small>
                        Last Plex sync {new Date(activeSavedPlaylist.automation.lastPlexSuccessAt).toLocaleString()}
                      </small>
                    ) : null}
                  </div>
                  <div className="playlist-automation-options">
                    <label>
                      <input
                        type="checkbox"
                        checked={activeSavedPlaylist.automation.smart}
                        disabled={busyAutomation !== null}
                        onChange={(event) =>
                          void updateAutomation(
                            "smart",
                            event.target.checked,
                            event.target.checked &&
                              activeSavedPlaylist.automation.plexSyncEnabled,
                          )
                        }
                      />
                      <span>
                        <strong>Smart playlist</strong>
                        <small>Rebuild from the saved filters as the library changes.</small>
                      </span>
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={activeSavedPlaylist.automation.plexSyncEnabled}
                        disabled={
                          busyAutomation !== null ||
                          !activeSavedPlaylist.automation.smart
                        }
                        onChange={(event) =>
                          void updateAutomation(
                            "plex",
                            true,
                            event.target.checked,
                          )
                        }
                      />
                      <span>
                        <strong>Sync automatically to Plex</strong>
                        <small>Update the managed Plex playlist on the global schedule.</small>
                      </span>
                    </label>
                  </div>
                  <div className="playlist-automation-status">
                    <span>
                      <strong>{activeSavedPlaylist.automation.desiredCount.toLocaleString()}</strong>
                      matching locally
                    </span>
                    <span>
                      <strong>{activeSavedPlaylist.automation.matchedCount.toLocaleString()}</strong>
                      found in Plex
                    </span>
                    <span>
                      <strong>{activeSavedPlaylist.automation.missingCount.toLocaleString()}</strong>
                      waiting for Plex
                    </span>
                  </div>
                  <div className="playlist-automation-actions">
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={
                        busyAutomation !== null ||
                        !activeSavedPlaylist.automation.smart
                      }
                      onClick={() => void refreshActiveSmartPlaylist()}
                    >
                      <RefreshCw size={15} />
                      <span>
                        {busyAutomation === "refresh" ? "Refreshing" : "Refresh rules"}
                      </span>
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={
                        busyAutomation !== null ||
                        !activeSavedPlaylist.automation.plexSyncEnabled
                      }
                      onClick={() => void syncActivePlexPlaylist()}
                    >
                      <Server size={15} />
                      <span>{busyAutomation === "sync" ? "Syncing" : "Sync to Plex"}</span>
                    </button>
                  </div>
                  {activeSavedPlaylist.automation.lastPlexError ? (
                    <p className="error-message">
                      {activeSavedPlaylist.automation.lastPlexError}
                    </p>
                  ) : null}
                  {automationMessage ? (
                    <p className="success-message">{automationMessage}</p>
                  ) : null}
                </section>
              ) : null}

              <div className="playlist-track-list">
                {playlist.tracks.length === 0 ? (
                  <div className="playlist-empty-state">
                    <ListMusic size={24} />
                    <strong>No tracks remain in this draft.</strong>
                    <span>Build again or reopen a saved playlist.</span>
                  </div>
                ) : (
                  visibleTracks.map((track, index) => (
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

              {playlist.tracks.length > visibleTrackCount ? (
                <div className="playlist-track-load-more">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() =>
                      setVisibleTrackCount((count) =>
                        Math.min(
                          playlist.tracks.length,
                          count + playlistReviewBatchSize,
                        ),
                      )
                    }
                  >
                    Show next {nextTrackBatchSize.toLocaleString()}{" "}
                    {nextTrackBatchSize === 1 ? "track" : "tracks"}
                  </button>
                  <span>
                    {visibleTrackCount.toLocaleString()} of{" "}
                    {playlist.tracks.length.toLocaleString()} shown
                  </span>
                </div>
              ) : null}

              <footer className="playlist-result-footer">
                <span>
                  {isLocalSearchPlaylist
                    ? `${playlist.candidateCount.toLocaleString()} local Search tracks loaded directly · no Luna request`
                    : `Luna inspected your request only · ${playlist.candidateCount} local candidates reviewed`}
                </span>
                <span>{playlist.model}</span>
              </footer>
              {exportResult ? (
                <ExportResultStatus result={exportResult} itemLabel="track" />
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
              <span>Saved playlist library</span>
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
                      {saved.automation.smart
                        ? `${saved.automation.desiredCount.toLocaleString()} matching tracks`
                        : `${saved.playlist.tracks.length} tracks`} · {totalDurationLabel(saved.playlist.totalSeconds)}
                    </span>
                    {saved.automation.smart ? (
                      <span className="playlist-automation-badges">
                        <em>Smart</em>
                        {saved.automation.plexSyncEnabled ? <em>Plex</em> : null}
                        {saved.automation.missingCount > 0 ? (
                          <em>{saved.automation.missingCount} waiting</em>
                        ) : null}
                      </span>
                    ) : null}
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
