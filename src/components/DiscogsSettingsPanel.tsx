import { useEffect, useState } from "react";
import { CircleCheck, Database, KeyRound, Radio, ShieldCheck, Trash2 } from "lucide-react";

import {
  deleteDiscogsCredentials,
  getDiscogsCredentialStatus,
  isTauriRuntime,
  saveDiscogsCredentials,
  testDiscogsConnection,
} from "../backend";
import type { DiscogsConnectionTest, DiscogsCredentialStatus } from "../types";

function statusLabel(status: DiscogsCredentialStatus | null) {
  return status?.configured
    ? "Consumer credentials stored securely in Windows Credential Manager"
    : "No Discogs consumer credentials configured";
}

export function DiscogsSettingsPanel() {
  const desktopRuntime = isTauriRuntime();
  const [status, setStatus] = useState<DiscogsCredentialStatus | null>(null);
  const [connection, setConnection] = useState<DiscogsConnectionTest | null>(null);
  const [consumerKey, setConsumerKey] = useState("");
  const [consumerSecret, setConsumerSecret] = useState("");
  const [busyAction, setBusyAction] = useState<"save" | "test" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getDiscogsCredentialStatus()
      .then((nextStatus) => {
        if (!cancelled) setStatus(nextStatus);
      })
      .catch((statusError) => {
        if (!cancelled) {
          setError(statusError instanceof Error ? statusError.message : String(statusError));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveCredentials() {
    setBusyAction("save");
    setError(null);
    setMessage(null);
    try {
      const nextConnection = await saveDiscogsCredentials({ consumerKey, consumerSecret });
      setStatus({ configured: true, source: "windowsCredentialManager" });
      setConnection(nextConnection);
      setConsumerKey("");
      setConsumerSecret("");
      setMessage("Discogs credentials validated and saved securely.");
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
      const nextConnection = await testDiscogsConnection();
      setConnection(nextConnection);
      setMessage(nextConnection.message);
    } catch (testError) {
      setConnection(null);
      setError(testError instanceof Error ? testError.message : String(testError));
    } finally {
      setBusyAction(null);
    }
  }

  async function removeCredentials() {
    setBusyAction("remove");
    setError(null);
    setMessage(null);
    try {
      const nextStatus = await deleteDiscogsCredentials();
      setStatus(nextStatus);
      setConnection(null);
      setConsumerKey("");
      setConsumerSecret("");
      setMessage("Stored Discogs credentials removed.");
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : String(removeError));
    } finally {
      setBusyAction(null);
    }
  }

  const isBusy = busyAction !== null;
  const canSave = consumerKey.trim().length >= 8 && consumerSecret.trim().length >= 8;

  return (
    <section className="settings-panel discogs-settings-panel">
      <div className="panel-heading compact">
        <div>
          <h2>Discogs fallback</h2>
          <p>{statusLabel(status)}</p>
        </div>
        <Database size={18} />
      </div>

      <div className="discogs-settings-toolbar">
        <label className="criterion">
          <span>Consumer Key</span>
          <div className="ai-key-input">
            <KeyRound size={16} />
            <input
              type="password"
              aria-label="Discogs Consumer Key"
              value={consumerKey}
              autoComplete="new-password"
              spellCheck={false}
              disabled={!desktopRuntime || isBusy}
              onChange={(event) => setConsumerKey(event.target.value)}
              placeholder={status?.configured ? "Enter a replacement key" : "Paste Consumer Key"}
            />
          </div>
        </label>
        <label className="criterion">
          <span>Consumer Secret</span>
          <div className="ai-key-input">
            <ShieldCheck size={16} />
            <input
              type="password"
              aria-label="Discogs Consumer Secret"
              value={consumerSecret}
              autoComplete="new-password"
              spellCheck={false}
              disabled={!desktopRuntime || isBusy}
              onChange={(event) => setConsumerSecret(event.target.value)}
              placeholder={status?.configured ? "Enter a replacement secret" : "Paste Consumer Secret"}
            />
          </div>
        </label>
        <div className="discogs-settings-actions">
          <button
            className="primary-button"
            type="button"
            disabled={!desktopRuntime || isBusy || !canSave}
            onClick={() => void saveCredentials()}
          >
            <ShieldCheck size={16} />
            <span>{busyAction === "save" ? "Validating" : "Save & test"}</span>
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={!desktopRuntime || isBusy || !status?.configured}
            onClick={() => void testConnection()}
          >
            <Radio size={16} />
            <span>{busyAction === "test" ? "Testing" : "Test connection"}</span>
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={!desktopRuntime || isBusy || !status?.configured}
            onClick={() => void removeCredentials()}
          >
            <Trash2 size={16} />
            <span>{busyAction === "remove" ? "Removing" : "Remove"}</span>
          </button>
        </div>
      </div>

      <div className="ai-settings-notes">
        <span>MusicBrainz remains first; Discogs runs only after a no-match or ambiguous result.</span>
        <span>Discogs calls are serialized at a conservative rate below the authenticated API limit.</span>
        <span>Keys are never written to SQLite, browser storage, logs, or backups.</span>
      </div>

      {!desktopRuntime ? (
        <p className="error-message">
          Secure Discogs credential storage is available in the Tauri desktop app.
        </p>
      ) : null}
      {error ? <p className="error-message" role="alert">{error}</p> : null}
      {connection ? (
        <div className="deemix-account-card" aria-label="Connected Discogs application">
          <CircleCheck size={18} />
          <div>
            <strong>Discogs database connected</strong>
            <span>
              {connection.rateLimitRemaining != null && connection.rateLimit != null
                ? `${connection.rateLimitRemaining} of ${connection.rateLimit} requests currently available`
                : "Authenticated database access is ready"}
            </span>
          </div>
        </div>
      ) : null}
      {message ? <p className="success-message">{message}</p> : null}
    </section>
  );
}
