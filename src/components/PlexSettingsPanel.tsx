import { useEffect, useState } from "react";
import {
  CircleCheck,
  Clock3,
  KeyRound,
  Radio,
  RefreshCw,
  Server,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import {
  deletePlexToken,
  getPlexBootstrap,
  isTauriRuntime,
  savePlexProfile,
  savePlexToken,
  syncAllPlexPlaylists,
  testPlexConnection,
} from "../backend";
import type {
  PlexBootstrap,
  PlexConnectionTest,
  PlexSyncSummary,
} from "../types";

function formatScheduleTime(value: string | null) {
  if (!value) return "Not yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function credentialLabel(bootstrap: PlexBootstrap | null) {
  if (!bootstrap?.credential.configured) return "No Plex token configured";
  if (bootstrap.credential.source === "environment") {
    return "Using PLEX_TOKEN from the development environment";
  }
  return "Token stored securely in Windows Credential Manager";
}

export function PlexSettingsPanel() {
  const desktopRuntime = isTauriRuntime();
  const [bootstrap, setBootstrap] = useState<PlexBootstrap | null>(null);
  const [connection, setConnection] = useState<PlexConnectionTest | null>(null);
  const [syncSummary, setSyncSummary] = useState<PlexSyncSummary | null>(null);
  const [baseUrl, setBaseUrl] = useState("http://localhost:32400");
  const [libraryName, setLibraryName] = useState("Music");
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [autoSyncMinutes, setAutoSyncMinutes] = useState("360");
  const [token, setToken] = useState("");
  const [busyAction, setBusyAction] = useState<
    "saveProfile" | "saveToken" | "test" | "sync" | "remove" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function applyBootstrap(next: PlexBootstrap) {
    setBootstrap(next);
    setBaseUrl(next.profile.baseUrl);
    setLibraryName(next.profile.libraryName);
    setAutoSyncEnabled(next.profile.autoSyncEnabled);
    setAutoSyncMinutes(String(next.profile.autoSyncMinutes));
  }

  useEffect(() => {
    let cancelled = false;
    void getPlexBootstrap()
      .then((next) => {
        if (!cancelled) applyBootstrap(next);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error ? loadError.message : String(loadError),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveProfile() {
    setBusyAction("saveProfile");
    setError(null);
    setMessage(null);
    try {
      const next = await savePlexProfile({
        baseUrl,
        libraryName,
        autoSyncEnabled,
        autoSyncMinutes: Number(autoSyncMinutes),
      });
      applyBootstrap(next);
      setConnection(null);
      setMessage("Plex server and schedule settings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setBusyAction(null);
    }
  }

  async function storeToken() {
    setBusyAction("saveToken");
    setError(null);
    setMessage(null);
    try {
      const credential = await savePlexToken(token);
      setBootstrap((current) =>
        current ? { ...current, credential } : current,
      );
      setToken("");
      setConnection(null);
      setMessage("Plex token saved securely. Test the connection when ready.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setBusyAction(null);
    }
  }

  async function testConnection() {
    setBusyAction("test");
    setError(null);
    setMessage(null);
    try {
      const next = await testPlexConnection();
      setConnection(next);
      setMessage(next.message);
    } catch (testError) {
      setConnection(null);
      setError(testError instanceof Error ? testError.message : String(testError));
    } finally {
      setBusyAction(null);
    }
  }

  async function syncAll() {
    setBusyAction("sync");
    setError(null);
    setMessage(null);
    try {
      const summary = await syncAllPlexPlaylists();
      setSyncSummary(summary);
      setMessage(summary.message);
      applyBootstrap(await getPlexBootstrap());
    } catch (syncError) {
      setSyncSummary(null);
      setError(syncError instanceof Error ? syncError.message : String(syncError));
    } finally {
      setBusyAction(null);
    }
  }

  async function removeToken() {
    setBusyAction("remove");
    setError(null);
    setMessage(null);
    try {
      const credential = await deletePlexToken();
      setBootstrap((current) =>
        current ? { ...current, credential } : current,
      );
      setConnection(null);
      setToken("");
      setMessage(
        credential.source === "environment"
          ? "Stored token removed; the development PLEX_TOKEN fallback is still active."
          : "Stored Plex token removed.",
      );
    } catch (removeError) {
      setError(
        removeError instanceof Error ? removeError.message : String(removeError),
      );
    } finally {
      setBusyAction(null);
    }
  }

  const isBusy = busyAction !== null;
  const interval = Number(autoSyncMinutes);
  const canSaveProfile =
    baseUrl.trim().length > 0 &&
    libraryName.trim().length > 0 &&
    Number.isInteger(interval) &&
    interval >= 15;

  return (
    <section className="settings-panel plex-settings-panel">
      <div className="panel-heading compact">
        <div>
          <h2>Plex playlists</h2>
          <p>{credentialLabel(bootstrap)}</p>
        </div>
        <Server size={18} />
      </div>

      <div className="plex-settings-grid">
        <label className="criterion plex-url-field">
          <span>Plex server URL</span>
          <input
            aria-label="Plex server URL"
            value={baseUrl}
            disabled={!desktopRuntime || isBusy}
            spellCheck={false}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="http://localhost:32400"
          />
        </label>
        <label className="criterion">
          <span>Music library</span>
          <input
            aria-label="Plex music library"
            value={libraryName}
            disabled={!desktopRuntime || isBusy}
            onChange={(event) => setLibraryName(event.target.value)}
            placeholder="Music"
          />
        </label>
        <label className="criterion plex-interval-field">
          <span>Sync interval (minutes)</span>
          <input
            type="number"
            min={15}
            step={15}
            aria-label="Plex sync interval in minutes"
            value={autoSyncMinutes}
            disabled={!desktopRuntime || isBusy || !autoSyncEnabled}
            onChange={(event) => setAutoSyncMinutes(event.target.value)}
          />
        </label>
        <label className="plex-auto-sync-toggle">
          <input
            type="checkbox"
            checked={autoSyncEnabled}
            disabled={!desktopRuntime || isBusy}
            onChange={(event) => setAutoSyncEnabled(event.target.checked)}
          />
          <span>
            <strong>Automatic playlist sync</strong>
            <small>Runs every six hours by default while this app is open.</small>
          </span>
        </label>
      </div>

      <div className="plex-settings-actions">
        <button
          className="primary-button"
          type="button"
          disabled={!desktopRuntime || isBusy || !canSaveProfile}
          onClick={() => void saveProfile()}
        >
          <ShieldCheck size={16} />
          <span>{busyAction === "saveProfile" ? "Saving" : "Save settings"}</span>
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={!desktopRuntime || isBusy || !bootstrap?.credential.configured}
          onClick={() => void testConnection()}
        >
          <Radio size={16} />
          <span>{busyAction === "test" ? "Testing" : "Test connection"}</span>
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={!desktopRuntime || isBusy || !bootstrap?.credential.configured}
          onClick={() => void syncAll()}
        >
          <RefreshCw size={16} />
          <span>{busyAction === "sync" ? "Syncing" : "Sync all now"}</span>
        </button>
      </div>

      <div className="plex-token-row">
        <label className="criterion">
          <span>Plex token</span>
          <div className="ai-key-input">
            <KeyRound size={16} />
            <input
              type="password"
              aria-label="Plex token"
              value={token}
              autoComplete="new-password"
              spellCheck={false}
              disabled={!desktopRuntime || isBusy}
              onChange={(event) => setToken(event.target.value)}
              placeholder={
                bootstrap?.credential.configured
                  ? "Enter a replacement token"
                  : "Paste Plex token"
              }
            />
          </div>
        </label>
        <button
          className="secondary-button"
          type="button"
          disabled={!desktopRuntime || isBusy || token.trim().length === 0}
          onClick={() => void storeToken()}
        >
          <ShieldCheck size={16} />
          <span>{busyAction === "saveToken" ? "Saving" : "Save token"}</span>
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={!desktopRuntime || isBusy || !bootstrap?.credential.configured}
          onClick={() => void removeToken()}
        >
          <Trash2 size={16} />
          <span>{busyAction === "remove" ? "Removing" : "Remove token"}</span>
        </button>
      </div>

      <div className="plex-schedule-grid" aria-label="Plex synchronization status">
        <article>
          <Clock3 size={16} />
          <span>Next automatic sync</span>
          <strong>{formatScheduleTime(bootstrap?.schedule.nextAutoSyncAt ?? null)}</strong>
        </article>
        <article>
          <CircleCheck size={16} />
          <span>Last successful sync</span>
          <strong>{formatScheduleTime(bootstrap?.schedule.lastSuccessAt ?? null)}</strong>
        </article>
        <article>
          <Server size={16} />
          <span>Cached Plex matches</span>
          <strong>{(bootstrap?.schedule.cacheTrackCount ?? 0).toLocaleString()}</strong>
        </article>
      </div>

      <div className="ai-settings-notes">
        <span>Track matching uses the complete local file path and filename.</span>
        <span>Tracks missing from Plex are skipped and retried after Plex catches up.</span>
        <span>Only playlists explicitly marked for Plex sync are managed.</span>
      </div>

      {!desktopRuntime ? (
        <p className="error-message">
          Secure Plex token storage and playlist sync are available in the Tauri desktop app.
        </p>
      ) : null}
      {error ? <p className="error-message" role="alert">{error}</p> : null}
      {connection ? (
        <div className="deemix-account-card" aria-label="Connected Plex server">
          <CircleCheck size={18} />
          <div>
            <strong>{connection.serverName || "Plex server"} connected</strong>
            <span>{connection.libraryName} · Plex {connection.serverVersion}</span>
          </div>
        </div>
      ) : null}
      {syncSummary ? (
        <p className="plex-sync-detail">
          {syncSummary.matchedCount.toLocaleString()} matched · {syncSummary.missingCount.toLocaleString()} waiting for Plex
        </p>
      ) : null}
      {message ? <p className="success-message">{message}</p> : null}
    </section>
  );
}
