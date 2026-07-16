import { useEffect, useState } from "react";
import { Check, KeyRound, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";

import {
  deleteOpenAiApiKey,
  getAiKeyStatus,
  isTauriRuntime,
  saveOpenAiApiKey,
  testOpenAiConnection,
} from "../backend";
import type { AiKeyStatus, AiUsage } from "../types";

function sourceLabel(status: AiKeyStatus | null) {
  switch (status?.source) {
    case "windowsCredentialManager":
      return "Stored securely in Windows Credential Manager";
    case "environment":
      return "Using the development OPENAI_API_KEY fallback";
    default:
      return "No OpenAI key configured";
  }
}

function usageLabel(usage: AiUsage) {
  const input = usage.inputTokens ?? 0;
  const output = usage.outputTokens ?? 0;
  return `${input.toLocaleString()} input / ${output.toLocaleString()} output tokens`;
}

export function AiSettingsPanel() {
  const desktopRuntime = isTauriRuntime();
  const [status, setStatus] = useState<AiKeyStatus | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getAiKeyStatus()
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

  async function saveKey() {
    setIsBusy(true);
    setError(null);
    setMessage(null);
    try {
      const nextStatus = await saveOpenAiApiKey(apiKey);
      setStatus(nextStatus);
      setApiKey("");
      setMessage("OpenAI key saved securely.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setIsBusy(false);
    }
  }

  async function removeKey() {
    setIsBusy(true);
    setError(null);
    setMessage(null);
    try {
      const nextStatus = await deleteOpenAiApiKey();
      setStatus(nextStatus);
      setApiKey("");
      setMessage(
        nextStatus.source === "environment"
          ? "Stored key removed; the development environment fallback is still active."
          : "Stored OpenAI key removed.",
      );
    } catch (removeError) {
      setError(
        removeError instanceof Error ? removeError.message : String(removeError),
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function testConnection() {
    setIsBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await testOpenAiConnection();
      setMessage(`${result.message} ${usageLabel(result.usage)}.`);
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : String(testError));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <section className="settings-panel ai-settings-panel">
      <div className="panel-heading compact">
        <div>
          <h2>Luna &amp; OpenAI</h2>
          <p>{sourceLabel(status)}</p>
        </div>
        <ShieldCheck size={18} />
      </div>

      <div className="ai-settings-toolbar">
        <label className="criterion ai-key-field">
          <span>OpenAI API key</span>
          <div className="ai-key-input">
            <KeyRound size={16} />
            <input
              type="password"
              value={apiKey}
              autoComplete="new-password"
              spellCheck={false}
              disabled={!desktopRuntime || isBusy}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={
                status?.configured
                  ? "Enter a replacement key"
                  : "Enter an OpenAI API key"
              }
            />
          </div>
        </label>
        <button
          className="primary-button"
          type="button"
          disabled={!desktopRuntime || isBusy || apiKey.trim().length < 20}
          onClick={() => void saveKey()}
        >
          <ShieldCheck size={16} />
          <span>Save securely</span>
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={!desktopRuntime || isBusy || !status?.configured}
          onClick={() => void testConnection()}
        >
          <RotateCcw size={16} />
          <span>{isBusy ? "Working" : "Test"}</span>
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={
            !desktopRuntime ||
            isBusy ||
            status?.source !== "windowsCredentialManager"
          }
          onClick={() => void removeKey()}
        >
          <Trash2 size={16} />
          <span>Remove stored key</span>
        </button>
      </div>

      <div className="ai-settings-notes">
        <span>
          Model: <strong>{status?.model ?? "gpt-5.6-luna"}</strong>
        </span>
        <span>The key is never written to SQLite, browser storage, logs, or backups.</span>
        <span>Test makes one small paid API request.</span>
        {status?.source === "environment" ? (
          <span>
            The environment fallback is intended for local development only. Save a
            key here to move it into Windows Credential Manager.
          </span>
        ) : null}
      </div>

      {!desktopRuntime ? (
        <p className="error-message">
          Secure key storage is available in the Tauri desktop app.
        </p>
      ) : null}
      {error ? <p className="error-message">{error}</p> : null}
      {message ? (
        <div className="export-result ai-settings-result">
          <Check size={17} />
          <span>{message}</span>
        </div>
      ) : null}
    </section>
  );
}
