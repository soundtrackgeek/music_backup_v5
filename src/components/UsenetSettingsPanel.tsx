import { useEffect, useState } from "react";
import {
  CircleCheck,
  FolderOpen,
  KeyRound,
  RefreshCw,
  Server,
  Trash2,
} from "lucide-react";

import {
  getUsenetBootstrap,
  isTauriRuntime,
  resetUsenet,
  saveUsenetProfile,
  selectUsenetDownloadDirectory,
  testUsenetConnections,
} from "../backend";
import type {
  UsenetBootstrap,
  UsenetConnectionTest,
  UsenetProfile,
} from "../types";

export function UsenetSettingsPanel() {
  const desktopRuntime = isTauriRuntime();
  const [bootstrap, setBootstrap] = useState<UsenetBootstrap | null>(null);
  const [profile, setProfile] = useState<UsenetProfile | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [connection, setConnection] = useState<UsenetConnectionTest | null>(null);

  useEffect(() => {
    let disposed = false;
    void getUsenetBootstrap()
      .then((next) => {
        if (disposed) return;
        setBootstrap(next);
        setProfile(next.profile);
      })
      .catch((loadError) => {
        if (!disposed) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      });
    return () => {
      disposed = true;
    };
  }, []);

  function updateProfile<K extends keyof UsenetProfile>(
    key: K,
    value: UsenetProfile[K],
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

  async function saveAndTest() {
    if (!profile) return;
    await run("save", async () => {
      const next = await saveUsenetProfile({
        profile,
        prowlarrApiKey: apiKey || null,
        newsPassword: password || null,
      });
      setBootstrap(next);
      setProfile(next.profile);
      setApiKey("");
      setPassword("");
      const test = await testUsenetConnections();
      setConnection(test);
      setMessage(test.message);
    });
  }

  async function chooseDownloadFolder() {
    if (!profile) return;
    await run("folder", async () => {
      const selected = await selectUsenetDownloadDirectory(profile.downloadDirectory);
      if (selected) {
        updateProfile("downloadDirectory", selected);
        setMessage("Download folder selected. Save & test to apply it.");
      }
    });
  }

  const configured = Boolean(
    bootstrap?.hasProwlarrApiKey && bootstrap.hasNewsPassword,
  );
  const hasStoredCredential = Boolean(
    bootstrap?.hasProwlarrApiKey || bootstrap?.hasNewsPassword,
  );
  const usernameChanged =
    profile?.username.trim() !== bootstrap?.profile.username.trim();
  const isBusy = busy !== null;

  return (
    <section className="settings-panel usenet-settings-panel">
      <div className="panel-heading compact">
        <div>
          <h2>Usenet</h2>
          <p>
            {configured
              ? "Prowlarr search and Newsgroup Ninja credentials configured"
              : "Connect Prowlarr search to a native Newsgroup Ninja downloader"}
          </p>
        </div>
        <Server size={18} />
      </div>

      {profile ? (
        <>
          <div className="usenet-settings-group">
            <h3>Prowlarr search</h3>
            <div className="soulseek-connection-grid">
              <label className="criterion">
                <span>Prowlarr URL</span>
                <input
                  aria-label="Prowlarr URL"
                  value={profile.prowlarrUrl}
                  disabled={!desktopRuntime || isBusy}
                  spellCheck={false}
                  onChange={(event) => updateProfile("prowlarrUrl", event.target.value)}
                />
              </label>
              <label className="criterion">
                <span>API key</span>
                <div className="ai-key-input">
                  <KeyRound size={16} />
                  <input
                    aria-label="Prowlarr API key"
                    type="password"
                    value={apiKey}
                    disabled={!desktopRuntime || isBusy}
                    autoComplete="new-password"
                    placeholder={
                      bootstrap?.hasProwlarrApiKey
                        ? "Stored securely · enter to replace"
                        : "Settings → General → Security"
                    }
                    onChange={(event) => setApiKey(event.target.value)}
                  />
                </div>
              </label>
            </div>
          </div>

          <div className="usenet-settings-group">
            <h3>Newsgroup Ninja</h3>
            <div className="usenet-connection-grid">
              <label className="criterion">
                <span>Server</span>
                <input
                  aria-label="Usenet server"
                  value={profile.newsHost}
                  disabled={!desktopRuntime || isBusy}
                  spellCheck={false}
                  onChange={(event) => updateProfile("newsHost", event.target.value)}
                />
              </label>
              <label className="criterion setting-number">
                <span>SSL port</span>
                <input
                  aria-label="Usenet server port"
                  type="number"
                  min={1}
                  max={65_535}
                  value={profile.newsPort}
                  disabled={!desktopRuntime || isBusy}
                  onChange={(event) => updateProfile("newsPort", Number(event.target.value))}
                />
              </label>
              <label className="criterion">
                <span>Username</span>
                <input
                  aria-label="Usenet username"
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
                    aria-label="Usenet password"
                    type="password"
                    value={password}
                    disabled={!desktopRuntime || isBusy}
                    autoComplete="new-password"
                    placeholder={
                      bootstrap?.hasNewsPassword
                        ? "Stored securely · enter to replace"
                        : "Provider password"
                    }
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
              </label>
              <label className="criterion setting-number">
                <span>Connections</span>
                <input
                  aria-label="Usenet connections"
                  type="number"
                  min={1}
                  max={50}
                  value={profile.connections}
                  disabled={!desktopRuntime || isBusy}
                  onChange={(event) => updateProfile("connections", Number(event.target.value))}
                />
              </label>
              <label className="usenet-tls-toggle">
                <input
                  type="checkbox"
                  checked={profile.useTls}
                  disabled={!desktopRuntime || isBusy}
                  onChange={(event) => updateProfile("useTls", event.target.checked)}
                />
                Use encrypted TLS/SSL
              </label>
            </div>
          </div>

          <div className="deemix-download-toolbar">
            <label className="criterion deemix-download-field">
              <span>Download folder</span>
              <div className="ai-key-input">
                <FolderOpen size={16} />
                <input
                  aria-label="Usenet download folder"
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

          <div className="deemix-settings-toolbar usenet-settings-actions">
            <button
              className="primary-button"
              type="button"
              disabled={
                !desktopRuntime ||
                isBusy ||
                !profile.prowlarrUrl.trim() ||
                !profile.newsHost.trim() ||
                !profile.username.trim() ||
                (!bootstrap?.hasProwlarrApiKey && !apiKey) ||
                ((!bootstrap?.hasNewsPassword || usernameChanged) && !password)
              }
              onClick={() => void saveAndTest()}
            >
              <RefreshCw size={16} className={busy === "save" ? "spin" : ""} />
              <span>{busy === "save" ? "Testing" : "Save & test"}</span>
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={!desktopRuntime || isBusy || !configured}
              onClick={() =>
                void run("test", async () => {
                  const test = await testUsenetConnections();
                  setConnection(test);
                  setMessage(test.message);
                })
              }
            >
              <RefreshCw size={16} className={busy === "test" ? "spin" : ""} />
              <span>Test</span>
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={!desktopRuntime || isBusy || !hasStoredCredential}
              onClick={() =>
                void run("remove", async () => {
                  const next = await resetUsenet();
                  setBootstrap(next);
                  setProfile(next.profile);
                  setConnection(null);
                  setApiKey("");
                  setPassword("");
                  setMessage("Stored Usenet settings and credentials removed.");
                })
              }
            >
              <Trash2 size={16} />
              <span>Remove</span>
            </button>
          </div>
        </>
      ) : null}

      <div className="ai-settings-notes deemix-settings-notes">
        <span>Prowlarr searches the Audio category through the local service on port 9696.</span>
        <span>Newsgroup Ninja defaults to encrypted port 563; up to 50 provider connections are supported.</span>
        <span>API keys and passwords stay in Windows Credential Manager, never SQLite or backups.</span>
        <span>
          {bootstrap?.extractorPath
            ? `RAR extraction ready: ${bootstrap.extractorPath}`
            : "Install UnRAR to unpack compressed releases automatically."}
        </span>
        <span>
          {bootstrap?.par2Path
            ? `PAR2 recovery ready: ${bootstrap.par2Path}`
            : "Install par2cmdline-turbo to repair missing or corrupt Usenet articles."}
        </span>
      </div>

      {!desktopRuntime ? (
        <p className="error-message">Usenet networking and secure credentials require the Tauri desktop app.</p>
      ) : null}
      {error ? <p className="error-message">{error}</p> : null}
      {connection ? (
        <div className="deemix-account-card" aria-label="Connected Usenet providers">
          <CircleCheck size={18} />
          <div>
            <strong>Prowlarr {connection.prowlarrVersion}</strong>
            <span>{connection.newsServer} · authenticated and ready</span>
          </div>
        </div>
      ) : null}
      {message ? <p className="success-message">{message}</p> : null}
    </section>
  );
}
