import { useEffect, useState } from "react";
import { Images, ShieldCheck, Trash2 } from "lucide-react";
import { deleteFanartKeys, getFanartCredentialStatus, saveFanartKeys, syncArtistArtwork, testFanartConnection } from "../backend/artistArtwork";
import { isTauriRuntime } from "../backend/tauriClient";
import type { FanartCredentialStatus } from "../bindings";

export function FanartSettingsPanel() {
  const desktop = isTauriRuntime();
  const [status, setStatus] = useState<FanartCredentialStatus | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [personalKey, setPersonalKey] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getFanartCredentialStatus().then(value => { if (!cancelled) setStatus(value); })
      .catch(error => { if (!cancelled) setError(String(error)); });
    return () => { cancelled = true; };
  }, []);

  async function run(action: "save" | "test" | "remove" | "sync") {
    setBusy(action); setError(null); setMessage(null);
    try {
      if (action === "save") {
        setStatus(await saveFanartKeys({ apiKey, personalKey: personalKey.trim() || null }));
        setApiKey(""); setPersonalKey("");
        setMessage("fanart.tv keys validated and stored securely.");
      } else if (action === "remove") {
        const status = await deleteFanartKeys(); setStatus(status);
        setApiKey(""); setPersonalKey("");
        setMessage(status.source === "environment" ? "Stored keys removed. The development .env key is still available." : "Stored fanart.tv keys removed.");
      } else if (action === "test") setMessage((await testFanartConnection()).message);
      else setMessage((await syncArtistArtwork(50)).message);
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(null); }
  }

  return <section className="settings-panel fanart-settings-panel">
    <div className="panel-heading compact">
      <div><h2>Artist imagery · fanart.tv</h2><p>{status?.source === "environment" ? "Using the development .env key" : status?.configured ? "Keys stored securely in Windows Credential Manager" : "Artist portraits, HD logos, and backgrounds"}</p></div>
      <Images size={18} />
    </div>
    <div className="fanart-settings-fields">
      <label className="criterion"><span>Project API key</span><input type="password" aria-label="fanart.tv project API key" autoComplete="new-password" spellCheck={false} value={apiKey} disabled={!desktop || !!busy} placeholder={status?.configured ? "Enter replacement project key" : "Paste project API key"} onChange={e => setApiKey(e.target.value)} /></label>
      <label className="criterion"><span>Personal API key (optional)</span><input type="password" aria-label="fanart.tv personal API key" autoComplete="new-password" spellCheck={false} value={personalKey} disabled={!desktop || !!busy} placeholder="Paste personal key" onChange={e => setPersonalKey(e.target.value)} /></label>
    </div>
    <div className="fanart-settings-actions">
      <button className="primary-button" type="button" disabled={!desktop || !!busy || apiKey.trim().length !== 32} onClick={() => void run("save")}><ShieldCheck size={16} />{busy === "save" ? "Validating" : "Save & test"}</button>
      <button className="secondary-button" type="button" disabled={!desktop || !!busy || !status?.configured} onClick={() => void run("test")}>{busy === "test" ? "Testing" : "Test connection"}</button>
      <button className="secondary-button" type="button" disabled={!desktop || !!busy} onClick={() => void run("sync")}><Images size={16} />{busy === "sync" ? "Syncing artwork" : "Sync 50 artists"}</button>
      <button className="secondary-button" type="button" disabled={!desktop || !!busy || status?.source !== "windowsCredentialManager"} onClick={() => void run("remove")}><Trash2 size={16} />Remove</button>
    </div>
    <div className="ai-settings-notes">
      <span>fanart.tv requires a project key. An optional personal key enables its personal-key benefits; leave it blank to save only the project key.</span>
      <span>{status?.personalKeyConfigured ? "Personal key configured." : "No personal key configured."}</span>
      <span>Without fanart.tv, portraits use Wikidata and Wikimedia Commons with per-image attribution. No Commons key is needed.</span>
      <span>Artwork loads on Artists and Career Peaks and is cached locally. Sync processes the next 50 artists in Activity Center.</span>
      {import.meta.env.DEV ? <span>Development builds can use FANART_TV or FANART_TV_API_KEY in .env.</span> : null}
    </div>
    {!desktop ? <p className="error-message">Artist imagery and secure credentials are available in the desktop app.</p> : null}
    {error ? <p role="alert" className="error-message">{error}</p> : null}
    {message ? <p role="status" className="success-message">{message}</p> : null}
  </section>;
}
