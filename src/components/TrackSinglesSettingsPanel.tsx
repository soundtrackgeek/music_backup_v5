import { useState } from "react";
import { Disc3 } from "lucide-react";

import { isTauriRuntime, refreshTrackSingles } from "../backend";
import type { TrackSinglesRefreshSummary } from "../types";

const BATCH_SIZE = 25;

/** Finds official singles for album tracks so Aurora and Tonehavn can show a 💿. */
export function TrackSinglesSettingsPanel() {
  const desktopRuntime = isTauriRuntime();
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<TrackSinglesRefreshSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setSummary(await refreshTrackSingles(BATCH_SIZE));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-panel track-singles-settings-panel">
      <div className="panel-heading compact">
        <div>
          <h2>Album singles</h2>
          <p>Mark tracks that MusicBrainz lists as official singles</p>
        </div>
        <Disc3 size={18} />
      </div>
      <div className="lastfm-settings-actions">
        <button className="secondary-button" type="button" disabled={!desktopRuntime || busy} onClick={() => void run()}>
          <Disc3 size={16} />
          <span>{busy ? "Finding singles" : `Find singles for ${BATCH_SIZE} artists`}</span>
        </button>
      </div>
      <div className="ai-settings-notes">
        <span>Uses artists linked to MusicBrainz; unlinked artists are skipped. Requests are rate limited, so work runs in small batches you can repeat.</span>
        <span>A single counts when MusicBrainz links it to the album, or when an official single with the same title was first released within about three years of the album.</span>
        <span>Aurora and Tonehavn read the result from the shared catalog and show a 💿 on those tracks.</span>
      </div>
      {!desktopRuntime ? <p className="error-message">Finding singles is available in the Tauri desktop app.</p> : null}
      {error ? <p className="error-message" role="alert">{error}</p> : null}
      {summary ? (
        <div className="lastfm-sync-summary">
          <strong>{summary.singlesFound} singles found for {summary.artistsChecked} artists</strong>
          <span>{summary.failed} failed · {summary.remaining} artists remaining</span>
        </div>
      ) : null}
    </section>
  );
}
