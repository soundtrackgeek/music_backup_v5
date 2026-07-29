import { useEffect, useState } from "react";
import {
  CircleCheck,
  FolderOpen,
  KeyRound,
  Radio,
  RefreshCw,
  Share2,
  Trash2,
  Upload,
} from "lucide-react";

import {
  addSoulseekLocalShare,
  connectSoulseek,
  disconnectSoulseek,
  getSoulseekConnection,
  getSoulseekLocalShares,
  getSoulseekUploads,
  isTauriRuntime,
  listenToSoulseekConnection,
  listenToSoulseekLocalShares,
  listenToSoulseekUploads,
  removeSoulseekLocalShare,
  rescanSoulseekLocalShares,
  resetSoulseekConnection,
  saveSoulseekConnection,
  selectSoulseekDownloadDirectory,
  selectSoulseekShareDirectory,
  setSoulseekLocalShareEnabled,
  setSoulseekUploadSlots,
} from "../backend";
import type {
  SoulseekConnectionProfile,
  SoulseekConnectionSnapshot,
  SoulseekLocalShares,
  SoulseekUploadQueue,
} from "../types";

function formatBytes(value: number) {
  if (value < 1_024) return `${value} B`;
  if (value < 1_048_576) return `${(value / 1_024).toFixed(1)} KB`;
  if (value < 1_073_741_824) return `${(value / 1_048_576).toFixed(1)} MB`;
  return `${(value / 1_073_741_824).toFixed(1)} GB`;
}

function statusLabel(snapshot: SoulseekConnectionSnapshot | null) {
  if (!snapshot) return "Loading Soulseek connection";
  if (snapshot.state === "online") return `Online as ${snapshot.username}`;
  return snapshot.message;
}

export function SoulseekSettingsPanel() {
  const desktopRuntime = isTauriRuntime();
  const [profile, setProfile] = useState<SoulseekConnectionProfile | null>(null);
  const [snapshot, setSnapshot] = useState<SoulseekConnectionSnapshot | null>(null);
  const [shares, setShares] = useState<SoulseekLocalShares | null>(null);
  const [uploads, setUploads] = useState<SoulseekUploadQueue | null>(null);
  const [password, setPassword] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    const unlisteners: Array<() => void> = [];
    void Promise.all([getSoulseekConnection(), getSoulseekLocalShares(), getSoulseekUploads()])
      .then(([bootstrap, localShares, uploadQueue]) => {
        if (disposed) return;
        setProfile(bootstrap.profile ?? bootstrap.suggestedProfile);
        setSnapshot(bootstrap.snapshot);
        setHasPassword(bootstrap.hasPassword);
        setShares(localShares);
        setUploads(uploadQueue);
      })
      .catch((loadError) => {
        if (!disposed) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      });
    void listenToSoulseekConnection((next) => setSnapshot(next)).then((unlisten) => {
      if (disposed) unlisten();
      else unlisteners.push(unlisten);
    });
    void listenToSoulseekLocalShares((next) => setShares(next)).then((unlisten) => {
      if (disposed) unlisten();
      else unlisteners.push(unlisten);
    });
    void listenToSoulseekUploads((next) => setUploads(next)).then((unlisten) => {
      if (disposed) unlisten();
      else unlisteners.push(unlisten);
    });
    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  function updateProfile<K extends keyof SoulseekConnectionProfile>(
    key: K,
    value: SoulseekConnectionProfile[K],
  ) {
    setProfile((current) => (current ? { ...current, [key]: value } : current));
  }

  async function run(action: string, task: () => Promise<void>) {
    setBusy(action);
    setError(null);
    setMessage(null);
    try {
      await task();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setBusy(null);
    }
  }

  async function saveAndConnect() {
    if (!profile) return;
    await run("save", async () => {
      const bootstrap = await saveSoulseekConnection(
        profile,
        password || null,
      );
      setProfile(bootstrap.profile ?? profile);
      setHasPassword(bootstrap.hasPassword);
      setPassword("");
      const next = await connectSoulseek();
      setSnapshot(next);
      setMessage("Soulseek account saved. Connecting in the background…");
    });
  }

  async function chooseDownloadFolder() {
    if (!profile) return;
    await run("download-folder", async () => {
      const selected = await selectSoulseekDownloadDirectory(profile.downloadDirectory);
      if (selected) {
        updateProfile("downloadDirectory", selected);
        setMessage("Download folder selected. Save the account to apply it.");
      }
    });
  }

  async function addShare() {
    await run("share", async () => {
      const selected = await selectSoulseekShareDirectory();
      if (!selected) return;
      setShares(await addSoulseekLocalShare(selected));
      setMessage("Shared folder added and indexed. Only enabled folders are advertised.");
    });
  }

  const isBusy = busy !== null;
  const online = snapshot?.state === "online";

  return (
    <section className="settings-panel soulseek-settings-panel">
      <div className="panel-heading compact">
        <div>
          <h2>Soulseek</h2>
          <p>{statusLabel(snapshot)}</p>
        </div>
        <Share2 size={18} />
      </div>

      {profile ? (
        <>
          <div className="soulseek-connection-grid">
            <label className="criterion">
              <span>Username</span>
              <input
                aria-label="Soulseek username"
                value={profile.username}
                disabled={!desktopRuntime || isBusy}
                autoComplete="username"
                spellCheck={false}
                onChange={(event) => updateProfile("username", event.target.value)}
              />
            </label>
            <label className="criterion">
              <span>Password</span>
              <div className="ai-key-input">
                <KeyRound size={16} />
                <input
                  aria-label="Soulseek password"
                  type="password"
                  value={password}
                  disabled={!desktopRuntime || isBusy}
                  autoComplete="new-password"
                  placeholder={hasPassword ? "Stored securely · enter to replace" : "Soulseek password"}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
            </label>
            <label className="criterion">
              <span>Server</span>
              <input
                aria-label="Soulseek server"
                value={profile.serverHost}
                disabled={!desktopRuntime || isBusy}
                onChange={(event) => updateProfile("serverHost", event.target.value)}
              />
            </label>
            <label className="criterion">
              <span>Port</span>
              <input
                aria-label="Soulseek server port"
                type="number"
                min={1}
                max={65_535}
                value={profile.serverPort}
                disabled={!desktopRuntime || isBusy}
                onChange={(event) => updateProfile("serverPort", Number(event.target.value))}
              />
            </label>
          </div>

          <div className="deemix-download-toolbar">
            <label className="criterion deemix-download-field">
              <span>Download folder</span>
              <div className="ai-key-input">
                <FolderOpen size={16} />
                <input
                  aria-label="Soulseek download folder"
                  value={profile.downloadDirectory}
                  readOnly
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
              <span>Browse</span>
            </button>
          </div>

          <div className="soulseek-option-row">
            <label>
              <input
                type="checkbox"
                checked={profile.rememberPassword}
                disabled={!desktopRuntime || isBusy}
                onChange={(event) => updateProfile("rememberPassword", event.target.checked)}
              />
              Store password in Windows Credential Manager
            </label>
            <label>
              <input
                type="checkbox"
                checked={profile.autoConnect}
                disabled={!desktopRuntime || isBusy}
                onChange={(event) => updateProfile("autoConnect", event.target.checked)}
              />
              Connect when Music Library starts
            </label>
          </div>

          <div className="deemix-settings-toolbar soulseek-settings-actions">
            <button
              className="primary-button"
              type="button"
              disabled={
                !desktopRuntime ||
                isBusy ||
                !profile.username.trim() ||
                (!hasPassword && !password)
              }
              onClick={() => void saveAndConnect()}
            >
              <Radio size={16} />
              <span>{busy === "save" ? "Saving" : "Save & connect"}</span>
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={!desktopRuntime || isBusy || !hasPassword || online}
              onClick={() => void run("connect", async () => setSnapshot(await connectSoulseek()))}
            >
              <Radio size={16} />
              <span>Connect</span>
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={!desktopRuntime || isBusy || !online}
              onClick={() => void run("disconnect", async () => setSnapshot(await disconnectSoulseek()))}
            >
              <span>Disconnect</span>
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={!desktopRuntime || isBusy || (!hasPassword && !profile.username)}
              onClick={() =>
                void run("remove", async () => {
                  const bootstrap = await resetSoulseekConnection();
                  setProfile(bootstrap.suggestedProfile);
                  setSnapshot(bootstrap.snapshot);
                  setHasPassword(false);
                  setPassword("");
                  setMessage("Stored Soulseek account removed.");
                })
              }
            >
              <Trash2 size={16} />
              <span>Remove account</span>
            </button>
          </div>
        </>
      ) : null}

      <div className="soulseek-share-heading">
        <div>
          <h3>Shared music</h3>
          <p>
            {shares?.scanning
              ? "Indexing enabled folders…"
              : `${shares?.totalFileCount ?? 0} files · ${formatBytes(shares?.totalSizeBytes ?? 0)}`}
          </p>
        </div>
        <label className="criterion setting-number">
          <span>Upload slots</span>
          <input
            aria-label="Soulseek upload slots"
            type="number"
            min={1}
            max={3}
            value={shares?.uploadSlots ?? 1}
            disabled={!desktopRuntime || isBusy}
            onChange={(event) =>
              void run("slots", async () =>
                setShares(await setSoulseekUploadSlots(Number(event.target.value))),
              )
            }
          />
        </label>
        <button
          className="secondary-button"
          type="button"
          disabled={!desktopRuntime || isBusy}
          onClick={() => void addShare()}
        >
          <FolderOpen size={16} />
          <span>Add folder</span>
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={!desktopRuntime || isBusy || !shares?.roots.length}
          onClick={() =>
            void run("rescan", async () => setShares(await rescanSoulseekLocalShares()))
          }
        >
          <RefreshCw size={16} className={shares?.scanning ? "spin" : ""} />
          <span>Rescan</span>
        </button>
      </div>

      {shares?.roots.length ? (
        <div className="soulseek-share-list">
          {shares.roots.map((root) => (
            <article key={root.id}>
              <label>
                <input
                  type="checkbox"
                  checked={root.enabled}
                  disabled={isBusy}
                  onChange={(event) =>
                    void run("share-toggle", async () =>
                      setShares(
                        await setSoulseekLocalShareEnabled(root.id, event.target.checked),
                      ),
                    )
                  }
                />
                <span>
                  <strong>{root.alias}</strong>
                  <small>{root.path}</small>
                </span>
              </label>
              <span>{root.error ?? `${root.fileCount} files · ${formatBytes(root.totalSizeBytes)}`}</span>
              <button
                className="icon-button"
                type="button"
                title={`Stop sharing ${root.alias}`}
                aria-label={`Stop sharing ${root.alias}`}
                disabled={isBusy}
                onClick={() =>
                  void run("share-remove", async () =>
                    setShares(await removeSoulseekLocalShare(root.id)),
                  )
                }
              >
                <Trash2 size={15} />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <p className="soulseek-share-empty">Nothing is shared until you add a folder.</p>
      )}

      <div className="ai-settings-notes deemix-settings-notes">
        <span>Soulseek creates a new account when an unused username and password connect for the first time.</span>
        <span>Sharing is opt-in: only enabled folders are indexed, advertised, and available for upload.</span>
        <span>Passwords stay in Windows Credential Manager and are never written to SQLite or backups.</span>
        <span>{uploads?.activeCount ?? 0} active uploads · {uploads?.sessionUploadedBytes ? `${formatBytes(uploads.sessionUploadedBytes)} sent this session` : "nothing uploaded this session"}.</span>
      </div>

      {!desktopRuntime ? (
        <p className="error-message">Soulseek networking and secure credentials require the Tauri desktop app.</p>
      ) : null}
      {error ? <p className="error-message">{error}</p> : null}
      {online ? (
        <div className="deemix-account-card" aria-label="Connected Soulseek account">
          <CircleCheck size={18} />
          <div>
            <strong>{snapshot?.username}</strong>
            <span>{snapshot?.server} · ready for Wish List searches</span>
          </div>
        </div>
      ) : null}
      {message ? <p className="success-message">{message}</p> : null}
      {uploads?.queuedCount ? (
        <p className="success-message"><Upload size={15} /> {uploads.queuedCount} uploads waiting.</p>
      ) : null}
    </section>
  );
}
