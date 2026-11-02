import { useEffect, useRef, useState } from "react";
import { Disc3 } from "lucide-react";

import { getTrackSinglesStatus, isTauriRuntime, startTrackSingles } from "../backend";
import {
  controlActivityJob,
  jobActions,
  listActivityJobs,
  listenToActivityJobs,
  type ActivityJob,
  type JobAction,
} from "../backend/activity";
import type { TrackSinglesStatus } from "../types";
import "./TrackSinglesSettingsPanel.css";

const BATCH_SIZE = 25;
/** The backend reads 0 as "every artist that is due". */
const ALL_ARTISTS = 0;
const JOB_KIND = "trackSingles";
const OPEN_STATES = ["queued", "running", "pausing", "paused", "cancelling"];
const STATUS_REFRESH_MS = 5000;

function timeLeft(seconds: number | null | undefined): string | null {
  if (!seconds || seconds < 60) return seconds ? "under a minute left" : null;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `about ${minutes} min left`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `about ${hours} h${rest ? ` ${rest} min` : ""} left`;
}

const STATE_LABEL: Record<string, string> = {
  queued: "waiting to start",
  running: "running",
  pausing: "pausing after the current artist",
  paused: "paused",
  cancelling: "cancelling",
  cancelled: "cancelled",
  failed: "stopped",
  completed: "finished",
};

/** Finds official singles for album tracks so Aurora and Tonehavn can show a 💿. */
export function TrackSinglesSettingsPanel() {
  const desktopRuntime = isTauriRuntime();
  const [status, setStatus] = useState<TrackSinglesStatus | null>(null);
  const [jobs, setJobs] = useState<ActivityJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = useRef(true);
  const lastStatusAt = useRef(0);

  async function refreshStatus() {
    lastStatusAt.current = Date.now();
    try {
      const next = await getTrackSinglesStatus();
      if (live.current) setStatus(next);
    } catch (statusError) {
      if (live.current) setError(statusError instanceof Error ? statusError.message : String(statusError));
    }
  }

  useEffect(() => {
    live.current = true;
    let disposed = false;
    let release: (() => void) | undefined;
    let previousState = "";
    let revision = 0;
    void refreshStatus();
    void listenToActivityJobs((next) => {
      if (disposed) return;
      revision += 1;
      setJobs(next);
      const job = next.find((item) => item.kind === JOB_KIND);
      // Counts change as artists are saved; refresh them on a state change and
      // otherwise at most every few seconds so a long run stays cheap to watch.
      const state = job?.state ?? "";
      const changed = state !== previousState;
      previousState = state;
      if (job && (changed || (job.state === "running" && Date.now() - lastStatusAt.current > STATUS_REFRESH_MS))) {
        void refreshStatus();
      }
    })
      .then(async (stop) => {
        if (disposed) {
          stop();
          return;
        }
        release = stop;
        const seen = revision;
        const initial = await listActivityJobs();
        if (!disposed && revision === seen) setJobs(initial);
      })
      .catch((listenError: unknown) => {
        if (!disposed) setError(listenError instanceof Error ? listenError.message : String(listenError));
      });
    return () => {
      disposed = true;
      live.current = false;
      release?.();
    };
  }, []);

  const singlesJobs = jobs.filter((job) => job.kind === JOB_KIND);
  const current = singlesJobs.find((job) => OPEN_STATES.includes(job.state)) ?? null;
  const latest = current ?? [...singlesJobs].sort((left, right) => right.id - left.id)[0] ?? null;
  const actions = latest ? jobActions(latest) : [];

  async function start(limit: number, force = false) {
    setBusy(true);
    setError(null);
    try {
      await startTrackSingles(limit, force);
    } catch (startError) {
      if (live.current) setError(startError instanceof Error ? startError.message : String(startError));
    } finally {
      if (live.current) setBusy(false);
    }
  }

  async function control(action: JobAction) {
    if (!latest) return;
    setBusy(true);
    setError(null);
    try {
      const next = await controlActivityJob(latest.id, action);
      if (live.current) setJobs(next);
      void refreshStatus();
    } catch (controlError) {
      if (live.current) setError(controlError instanceof Error ? controlError.message : String(controlError));
    } finally {
      if (live.current) setBusy(false);
    }
  }

  const startDisabled = !desktopRuntime || busy || current !== null;
  const eta = latest && current ? timeLeft(latest.etaSeconds) : null;

  return (
    <section className="settings-panel track-singles-settings-panel" aria-label="Album singles">
      <div className="panel-heading compact">
        <div>
          <h2>Album singles</h2>
          <p>Mark tracks that MusicBrainz lists as official singles</p>
        </div>
        <Disc3 size={18} />
      </div>

      <p className="track-singles-status">
        {status
          ? `${status.checkedArtists.toLocaleString()} of ${status.checkableArtists.toLocaleString()} artists checked · ${status.confirmedSingles.toLocaleString()} confirmed singles`
          : "Reading album singles coverage…"}
      </p>
      {status ? (
        <p className="track-singles-status track-singles-status--detail">
          {status.dueArtists > 0
            ? `${status.dueArtists.toLocaleString()} artists still to check`
            : status.checkableArtists > 0
              ? "Every artist is up to date"
              : "No artists are linked to MusicBrainz yet"}
          {status.nameMatchedArtists > 0
            ? ` · ${status.nameMatchedArtists.toLocaleString()} matched by name only`
            : ""}
          {status.possibleSingles > 0 ? ` · ${status.possibleSingles.toLocaleString()} possible matches saved but not shown` : ""}
          {status.lastCheckedAt ? ` · last check ${new Date(status.lastCheckedAt).toLocaleString()}` : ""}
        </p>
      ) : null}

      {latest ? (
        <div className="track-singles-current" aria-label="Album singles job">
          <strong>Finding singles · {STATE_LABEL[latest.state] ?? latest.state}</strong>
          <span>
            {latest.total > 0
              ? `${latest.completed.toLocaleString()} of ${latest.total.toLocaleString()} artists checked`
              : "Preparing…"}
            {eta ? ` · ${eta}` : ""}
          </span>
          {latest.total > 0 ? (
            <progress aria-label="Album singles progress" max={latest.total} value={latest.completed} />
          ) : null}
          {latest.message ? <p>{latest.message}</p> : null}
          {latest.error ? <p className="error-message" role="alert">{latest.error}</p> : null}
          {actions.length > 0 ? (
            <div className="lastfm-settings-actions">
              {actions.includes("pause") ? (
                <button className="secondary-button" type="button" disabled={busy} onClick={() => void control("pause")}>Pause</button>
              ) : null}
              {actions.includes("resume") ? (
                <button className="secondary-button" type="button" disabled={busy} onClick={() => void control("resume")}>Continue</button>
              ) : null}
              {actions.includes("retry") ? (
                <button className="secondary-button" type="button" disabled={busy} onClick={() => void control("retry")}>Continue</button>
              ) : null}
              {actions.includes("cancel") ? (
                <button className="secondary-button" type="button" disabled={busy} onClick={() => void control("cancel")}>Cancel</button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="lastfm-settings-actions">
        <button className="secondary-button" type="button" disabled={startDisabled} onClick={() => void start(BATCH_SIZE)}>
          <Disc3 size={16} />
          <span>{`Find singles for ${BATCH_SIZE} artists`}</span>
        </button>
        <button className="secondary-button" type="button" disabled={startDisabled} onClick={() => void start(ALL_ARTISTS)}>
          <Disc3 size={16} />
          <span>Find singles for all artists</span>
        </button>
        <button className="secondary-button" type="button" disabled={startDisabled} onClick={() => void start(ALL_ARTISTS, true)}>
          <Disc3 size={16} />
          <span>Recheck every artist</span>
        </button>
      </div>

      <div className="ai-settings-notes">
        <span>Artists are checked again automatically when you add or remove albums for them, link them to a different MusicBrainz artist, or after 90 days; new links are picked up the next time you start or continue. &quot;Recheck every artist&quot; ignores all that and checks everyone once more.</span>
        <span>Artists you linked to MusicBrainz are checked first. Artists matched by name only are checked afterwards, and their singles are shown only when one of your albums is in that MusicBrainz artist&apos;s discography (or two of your tracks match singles); otherwise the result is kept but hidden. Requests stay under MusicBrainz&apos;s limit of one per second, so a full pass over a large library can take hours. You can pause and continue: every finished artist is saved.</span>
        <span>A single counts when MusicBrainz links it to the album, or when an official single with the same title was first released within about three years of the album.</span>
        <span>Aurora and Tonehavn read the result from the shared catalog and show a 💿 on those tracks.</span>
      </div>
      {!desktopRuntime ? <p className="error-message">Finding singles is available in the Tauri desktop app.</p> : null}
      {error ? <p className="error-message" role="alert">{error}</p> : null}
    </section>
  );
}
