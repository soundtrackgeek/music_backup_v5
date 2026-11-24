import { useState } from "react";
import { ListPlus, Play } from "lucide-react";
import { openAuroraPlayback, type AuroraPlaybackTarget } from "../backend/auroraPlayback";

export function AuroraPlaybackActions({ target, compact = false }: {
  target: AuroraPlaybackTarget;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(action: "play" | "queue") {
    setBusy(true);
    setError(null);
    try {
      await openAuroraPlayback(action, target);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="aurora-playback-actions" role="group" aria-label="Aurora playback">
      <button type="button" className={compact ? "icon-button" : "secondary-button"} aria-label="Play in Aurora" title="Play in Aurora" disabled={busy} onClick={() => void send("play")}>
        <Play size={compact ? 14 : 16} aria-hidden="true" />{compact ? null : "Play in Aurora"}
      </button>
      <button type="button" className={compact ? "icon-button" : "secondary-button"} aria-label="Queue in Aurora" title="Queue in Aurora" disabled={busy} onClick={() => void send("queue")}>
        <ListPlus size={compact ? 14 : 16} aria-hidden="true" />{compact ? null : "Queue in Aurora"}
      </button>
      {error && <span className="error-message aurora-playback-error" role="alert">{error}</span>}
    </span>
  );
}
