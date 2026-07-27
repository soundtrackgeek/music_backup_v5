import { useEffect, useState } from "react";
import {
  CircleCheck,
  FolderOpen,
  KeyRound,
  Radio,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import {
  deleteDeemixArl,
  getDeemixCredentialStatus,
  isTauriRuntime,
  saveDeemixArl,
  selectDeemixDownloadDirectory,
  testDeemixConnection,
} from "../backend";
import type {
  DeemixConnectionTest,
  DeemixCredentialStatus,
  DeemixDownloadOrganization,
  DeemixDownloadQuality,
} from "../types";

function sourceLabel(status: DeemixCredentialStatus | null) {
  return status?.configured
    ? "ARL stored securely in Windows Credential Manager"
    : "No Deezer ARL configured";
}

function capabilityLabel(connection: DeemixConnectionTest) {
  if (connection.canStreamLossless) return "Lossless available";
  if (connection.canStreamHq) return "High quality available";
  return "Standard quality reported";
}

type DeemixSettingsPanelProps = {
  downloadPath?: string;
  onDownloadPathChange?: (
    path: string,
  ) => Promise<boolean | void> | boolean | void;
  quality?: DeemixDownloadQuality;
  fallback?: boolean;
  organization?: DeemixDownloadOrganization;
  onQualityChange?: (
    quality: DeemixDownloadQuality,
  ) => Promise<boolean | void> | boolean | void;
  onFallbackChange?: (
    fallback: boolean,
  ) => Promise<boolean | void> | boolean | void;
  onOrganizationChange?: (
    organization: DeemixDownloadOrganization,
  ) => Promise<boolean | void> | boolean | void;
};

export function DeemixSettingsPanel({
  downloadPath = "",
  onDownloadPathChange,
  quality = "mp3_320",
  fallback = true,
  organization = "flat_artist_album_year",
  onQualityChange,
  onFallbackChange,
  onOrganizationChange,
}: DeemixSettingsPanelProps) {
  const desktopRuntime = isTauriRuntime();
  const [status, setStatus] = useState<DeemixCredentialStatus | null>(null);
  const [connection, setConnection] = useState<DeemixConnectionTest | null>(null);
  const [arl, setArl] = useState("");
  const [busyAction, setBusyAction] = useState<
    "save" | "test" | "remove" | "folder" | "preference" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getDeemixCredentialStatus()
      .then((nextStatus) => {
        if (!cancelled) setStatus(nextStatus);
      })
      .catch((statusError) => {
        if (!cancelled) {
          setError(
            statusError instanceof Error
              ? statusError.message
              : String(statusError),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveCredential() {
    setBusyAction("save");
    setError(null);
    setMessage(null);
    try {
      const nextConnection = await saveDeemixArl(arl);
      setStatus({ configured: true, source: "windowsCredentialManager" });
      setConnection(nextConnection);
      setArl("");
      setMessage("ARL validated and saved securely.");
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
      const nextConnection = await testDeemixConnection();
      setConnection(nextConnection);
      setMessage(nextConnection.message);
    } catch (testError) {
      setConnection(null);
      setError(testError instanceof Error ? testError.message : String(testError));
    } finally {
      setBusyAction(null);
    }
  }

  async function removeCredential() {
    setBusyAction("remove");
    setError(null);
    setMessage(null);
    try {
      const nextStatus = await deleteDeemixArl();
      setStatus(nextStatus);
      setConnection(null);
      setArl("");
      setMessage("Stored Deemix ARL removed.");
    } catch (removeError) {
      setError(
        removeError instanceof Error ? removeError.message : String(removeError),
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function chooseDownloadFolder() {
    setBusyAction("folder");
    setError(null);
    setMessage(null);
    try {
      const selected = await selectDeemixDownloadDirectory(downloadPath);
      if (selected) {
        const saved = await onDownloadPathChange?.(selected);
        if (saved !== false) setMessage("Deemix download folder saved.");
      }
    } catch (folderError) {
      setError(
        folderError instanceof Error ? folderError.message : String(folderError),
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function clearDownloadFolder() {
    setBusyAction("folder");
    setError(null);
    setMessage(null);
    try {
      const saved = await onDownloadPathChange?.("");
      if (saved !== false) setMessage("Deemix download folder cleared.");
    } catch (folderError) {
      setError(
        folderError instanceof Error ? folderError.message : String(folderError),
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function saveQuality(nextQuality: DeemixDownloadQuality) {
    setBusyAction("preference");
    setError(null);
    setMessage(null);
    try {
      const saved = await onQualityChange?.(nextQuality);
      if (saved !== false) setMessage("Deemix audio quality saved.");
    } catch (preferenceError) {
      setError(
        preferenceError instanceof Error
          ? preferenceError.message
          : String(preferenceError),
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function saveOrganization(
    nextOrganization: DeemixDownloadOrganization,
  ) {
    setBusyAction("preference");
    setError(null);
    setMessage(null);
    try {
      const saved = await onOrganizationChange?.(nextOrganization);
      if (saved !== false) setMessage("Deemix folder organization saved.");
    } catch (preferenceError) {
      setError(
        preferenceError instanceof Error
          ? preferenceError.message
          : String(preferenceError),
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function saveFallback(nextFallback: boolean) {
    setBusyAction("preference");
    setError(null);
    setMessage(null);
    try {
      const saved = await onFallbackChange?.(nextFallback);
      if (saved !== false) setMessage("Deemix quality fallback saved.");
    } catch (preferenceError) {
      setError(
        preferenceError instanceof Error
          ? preferenceError.message
          : String(preferenceError),
      );
    } finally {
      setBusyAction(null);
    }
  }

  const isBusy = busyAction !== null;

  return (
    <section className="settings-panel deemix-settings-panel">
      <div className="panel-heading compact">
        <div>
          <h2>Deemix &amp; Deezer</h2>
          <p>{sourceLabel(status)}</p>
        </div>
        <Radio size={18} />
      </div>

      <div className="deemix-preference-grid">
        <label className="criterion">
          <span>Audio quality</span>
          <select
            aria-label="Deemix audio quality"
            value={quality}
            disabled={isBusy}
            onChange={(event) =>
              void saveQuality(event.target.value as DeemixDownloadQuality)
            }
          >
            <option value="flac">FLAC · lossless</option>
            <option value="mp3_320">MP3 · 320 kbps</option>
            <option value="mp3_128">MP3 · 128 kbps</option>
          </select>
        </label>
        <label className="criterion">
          <span>Quality fallback</span>
          <select
            aria-label="Deemix quality fallback"
            value={fallback ? "lower" : "exact"}
            disabled={isBusy}
            onChange={(event) => void saveFallback(event.target.value === "lower")}
          >
            <option value="lower">Accept lower qualities</option>
            <option value="exact">Exact quality only</option>
          </select>
        </label>
        <label className="criterion">
          <span>Folder organization</span>
          <select
            aria-label="Deemix folder organization"
            value={organization}
            disabled={isBusy}
            onChange={(event) =>
              void saveOrganization(
                event.target.value as DeemixDownloadOrganization,
              )
            }
          >
            <option value="flat_artist_album_year">
              Artist - Album (Year)
            </option>
            <option value="artist_album_year_folders">
              Artist / Album (Year)
            </option>
          </select>
        </label>
      </div>

      <div className="deemix-download-toolbar">
        <label className="criterion deemix-download-field">
          <span>Download folder</span>
          <div className="ai-key-input">
            <FolderOpen size={16} />
            <input
              type="text"
              aria-label="Deemix download folder"
              value={downloadPath}
              readOnly
              placeholder="Choose where future Deemix downloads will go"
            />
          </div>
        </label>
        <button
          className="secondary-button"
          type="button"
          disabled={!desktopRuntime || isBusy}
          onClick={() => void chooseDownloadFolder()}
        >
          <FolderOpen size={16} />
          <span>{busyAction === "folder" ? "Choosing" : "Browse"}</span>
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={!desktopRuntime || isBusy || !downloadPath}
          onClick={() => void clearDownloadFolder()}
        >
          <Trash2 size={16} />
          <span>Clear</span>
        </button>
      </div>

      <div className="deemix-settings-toolbar">
        <label className="criterion deemix-arl-field">
          <span>Deezer ARL</span>
          <div className="ai-key-input">
            <KeyRound size={16} />
            <input
              type="password"
              value={arl}
              autoComplete="new-password"
              spellCheck={false}
              disabled={!desktopRuntime || isBusy}
              onChange={(event) => setArl(event.target.value)}
              placeholder={
                status?.configured
                  ? "Enter a replacement ARL"
                  : "Paste the ARL from your Deezer session"
              }
            />
          </div>
        </label>
        <button
          className="primary-button"
          type="button"
          disabled={!desktopRuntime || isBusy || arl.replace(/\s/g, "").length < 32}
          onClick={() => void saveCredential()}
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
          onClick={() => void removeCredential()}
        >
          <Trash2 size={16} />
          <span>{busyAction === "remove" ? "Removing" : "Remove ARL"}</span>
        </button>
      </div>

      <div className="ai-settings-notes deemix-settings-notes">
        <span>The ARL is validated before it is stored.</span>
        <span>It is never written to SQLite, browser storage, logs, or backups.</span>
        <span>{fallback ? "Fallback uses FLAC → MP3 320 → MP3 128 and never substitutes a higher quality." : "Exact quality only is enabled; unavailable tracks fail instead of being substituted."}</span>
        <span>Album art is embedded in every MP3 or FLAC and saved beside the tracks as cover.jpg or cover.png.</span>
        <span>Connection and searches go directly from the Rust backend to Deezer; the Deemix GUI is not used.</span>
      </div>

      {!desktopRuntime ? (
        <p className="error-message">
          Secure Deemix credential storage is available in the Tauri desktop app.
        </p>
      ) : null}
      {error ? <p className="error-message">{error}</p> : null}
      {connection ? (
        <div className="deemix-account-card" aria-label="Connected Deezer account">
          <CircleCheck size={18} />
          <div>
            <strong>{connection.accountName}</strong>
            <span>
              Deezer user {connection.userId}
              {connection.country ? ` · ${connection.country}` : ""}
              {` · ${capabilityLabel(connection)}`}
            </span>
          </div>
        </div>
      ) : null}
      {message ? <p className="success-message">{message}</p> : null}
    </section>
  );
}
