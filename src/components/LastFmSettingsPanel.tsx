import { useEffect, useState } from "react";
import {
  CircleCheck,
  Images,
  KeyRound,
  Radio,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import {
  deleteLastFmApiKey,
  getLastFmCredentialStatus,
  isTauriRuntime,
  refreshLastFmArtistImages,
  saveLastFmApiKey,
  testLastFmConnection,
} from "../backend";
import type {
  LastFmArtistImageRefreshSummary,
  LastFmConnectionTest,
  LastFmCredentialStatus,
} from "../types";

export function LastFmSettingsPanel() {
  const desktopRuntime = isTauriRuntime();
  const [status, setStatus] = useState<LastFmCredentialStatus | null>(null);
  const [connection, setConnection] = useState<LastFmConnectionTest | null>(null);
  const [sync, setSync] = useState<LastFmArtistImageRefreshSummary | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [busyAction, setBusyAction] = useState<"save" | "test" | "remove" | "sync" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getLastFmCredentialStatus()
      .then((nextStatus) => {
        if (!cancelled) setStatus(nextStatus);
      })
      .catch((statusError) => {
        if (!cancelled) setError(statusError instanceof Error ? statusError.message : String(statusError));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function run(action: "save" | "test" | "remove" | "sync") {
    setBusyAction(action);
    setError(null);
    setMessage(null);
    try {
      if (action === "save") {
        const nextConnection = await saveLastFmApiKey({ apiKey });
        setStatus({ configured: true, source: "windowsCredentialManager" });
        setConnection(nextConnection);
        setApiKey("");
        setMessage("Last.fm API key validated and stored securely.");
      } else if (action === "test") {
        const nextConnection = await testLastFmConnection();
        setConnection(nextConnection);
        setMessage(nextConnection.message);
      } else if (action === "remove") {
        setStatus(await deleteLastFmApiKey());
        setConnection(null);
        setSync(null);
        setApiKey("");
        setMessage("Stored Last.fm API key removed.");
      } else {
        const nextSync = await refreshLastFmArtistImages(50);
        setSync(nextSync);
        setMessage(nextSync.message);
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setBusyAction(null);
    }
  }

  const isBusy = busyAction !== null;
  return (
    <section className="settings-panel lastfm-settings-panel">
      <div className="panel-heading compact">
        <div>
          <h2>Last.fm metadata</h2>
          <p>
            {status?.configured
              ? "API key stored securely in Windows Credential Manager"
              : "Connect Last.fm for popular tracks, album heat, and artist portraits"}
          </p>
        </div>
        <Images size={18} />
      </div>

      <div className="lastfm-settings-toolbar">
        <label className="criterion">
          <span>API key</span>
          <div className="ai-key-input">
            <KeyRound size={16} />
            <input
              type="password"
              aria-label="Last.fm API key"
              value={apiKey}
              autoComplete="new-password"
              spellCheck={false}
              disabled={!desktopRuntime || isBusy}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={status?.configured ? "Enter a replacement key" : "Paste API key"}
            />
          </div>
        </label>
        <div className="lastfm-settings-actions">
          <button className="primary-button" type="button" disabled={!desktopRuntime || isBusy || apiKey.trim().length < 8} onClick={() => void run("save")}>
            <ShieldCheck size={16} />
            <span>{busyAction === "save" ? "Validating" : "Save & test"}</span>
          </button>
          <button className="secondary-button" type="button" disabled={!desktopRuntime || isBusy || !status?.configured} onClick={() => void run("test")}>
            <Radio size={16} />
            <span>{busyAction === "test" ? "Testing" : "Test connection"}</span>
          </button>
          <button className="secondary-button" type="button" disabled={!desktopRuntime || isBusy || !status?.configured} onClick={() => void run("sync")}>
            <Images size={16} />
            <span>{busyAction === "sync" ? "Syncing" : "Sync 50 portraits"}</span>
          </button>
          <button className="secondary-button" type="button" disabled={!desktopRuntime || isBusy || !status?.configured} onClick={() => void run("remove")}>
            <Trash2 size={16} />
            <span>{busyAction === "remove" ? "Removing" : "Remove"}</span>
          </button>
        </div>
      </div>

      <div className="ai-settings-notes">
        <span>Read-only metadata needs the API key; the Last.fm secret is not required.</span>
        <span>Popular Tracks and album fire rankings load on demand, then reuse a local SQLite cache.</span>
        <span>Portraits are downloaded in explicit batches and reused in Timelines, Artists, and Artist Index.</span>
        <span>The API key is never written to SQLite, browser storage, logs, or backups.</span>
      </div>

      {!desktopRuntime ? <p className="error-message">Secure Last.fm credentials and metadata enrichment are available in the Tauri desktop app.</p> : null}
      {error ? <p className="error-message" role="alert">{error}</p> : null}
      {connection ? (
        <div className="deemix-account-card" aria-label="Connected Last.fm application">
          <CircleCheck size={18} />
          <div><strong>Last.fm connected</strong><span>Popularity and artist enrichment are ready</span></div>
        </div>
      ) : null}
      {sync ? (
        <div className="lastfm-sync-summary">
          <strong>{sync.downloaded} portraits downloaded</strong>
          <span>{sync.unavailable} unavailable · {sync.failed} failed · {sync.remaining} remaining</span>
        </div>
      ) : null}
      {message ? <p className="success-message">{message}</p> : null}
    </section>
  );
}
