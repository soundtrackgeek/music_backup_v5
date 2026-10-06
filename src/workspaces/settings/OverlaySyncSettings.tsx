import { Check, CloudDownload, Clock3 } from "lucide-react";
import { musicBrainzOverlaySyncDetails } from "./settingsDisplay";
import { formatDate } from "../../app/display";
import type { AppModel } from "../../app/useAppController";

type Model = Pick<
  AppModel,
  | "settings"
  | "musicBrainzOverlaySyncResult"
  | "musicBrainzOverlaySyncLog"
  | "musicBrainzOverlaySyncPathDraft"
  | "setMusicBrainzOverlaySyncPathDraft"
  | "musicBrainzOverlayAutoSyncDraft"
  | "setMusicBrainzOverlayAutoSyncDraft"
  | "commitMusicBrainzOverlayAutoSyncMinutes"
  | "isMusicBrainzOverlaySyncing"
  | "runMusicBrainzOverlaySync"
  | "musicBrainzOverlaySyncError"
>;

export function OverlaySyncSettings({ model }: { model: Model }) {
  const {
    settings,
    musicBrainzOverlaySyncResult,
    musicBrainzOverlaySyncLog,
    musicBrainzOverlaySyncPathDraft,
    setMusicBrainzOverlaySyncPathDraft,
    musicBrainzOverlayAutoSyncDraft,
    setMusicBrainzOverlayAutoSyncDraft,
    commitMusicBrainzOverlayAutoSyncMinutes,
    isMusicBrainzOverlaySyncing,
    runMusicBrainzOverlaySync,
    musicBrainzOverlaySyncError,
  } = model;
  return (
    <section className="settings-panel musicbrainz-sync-settings-panel">
      <div className="panel-heading compact">
        <div>
          <h2>MusicBrainz Overlay Sync</h2>
          <p>
            {musicBrainzOverlaySyncResult
              ? musicBrainzOverlaySyncResult.summary
              : (musicBrainzOverlaySyncLog[0]?.summary ?? "Not synced")}
          </p>
        </div>
        <CloudDownload size={18} />
      </div>

      <div className="musicbrainz-sync-toolbar">
        <label className="criterion musicbrainz-sync-path">
          <span>Sync database</span>
          <input
            type="text"
            value={musicBrainzOverlaySyncPathDraft}
            onChange={(event) =>
              setMusicBrainzOverlaySyncPathDraft(event.target.value)
            }
            placeholder="Choose a shared .sqlite3 file path"
          />
        </label>
        <label className="criterion setting-number musicbrainz-sync-interval">
          <span>Auto minutes</span>
          <input
            type="number"
            min={0}
            max={1440}
            value={musicBrainzOverlayAutoSyncDraft}
            onChange={(event) =>
              setMusicBrainzOverlayAutoSyncDraft(event.target.value)
            }
            onBlur={() => void commitMusicBrainzOverlayAutoSyncMinutes()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              }
            }}
          />
        </label>
        <button
          className="primary-button"
          type="button"
          disabled={
            isMusicBrainzOverlaySyncing ||
            !musicBrainzOverlaySyncPathDraft.trim()
          }
          onClick={() => void runMusicBrainzOverlaySync()}
        >
          <CloudDownload size={16} />
          <span>{isMusicBrainzOverlaySyncing ? "Syncing" : "Sync now"}</span>
        </button>
      </div>

      {musicBrainzOverlaySyncError ? (
        <p className="error-message">{musicBrainzOverlaySyncError}</p>
      ) : null}

      {musicBrainzOverlaySyncResult ? (
        <div className="export-result musicbrainz-sync-result">
          <Check size={17} />
          <span>
            {musicBrainzOverlaySyncResult.summary}{" "}
            {musicBrainzOverlaySyncDetails(musicBrainzOverlaySyncResult)}.
          </span>
        </div>
      ) : null}

      {musicBrainzOverlaySyncLog.length > 0 ? (
        <div
          className="musicbrainz-sync-log"
          aria-label="MusicBrainz overlay sync log"
        >
          {musicBrainzOverlaySyncLog.map((entry) => (
            <article key={entry.id}>
              <div>
                <strong>{formatDate(entry.syncedAt)}</strong>
                <span>{entry.summary}</span>
              </div>
              <small>{musicBrainzOverlaySyncDetails(entry)}</small>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <Clock3 size={20} />
          <span>No overlay sync runs logged yet.</span>
        </div>
      )}

      <small className="performance-database-path">
        {settings.musicBrainzOverlaySyncPath || "Not configured"}
      </small>
    </section>
  );
}
