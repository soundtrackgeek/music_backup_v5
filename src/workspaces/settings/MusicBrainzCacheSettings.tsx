import { ShieldCheck } from "lucide-react";
import {
  musicBrainzYearRange,
  musicBrainzCacheDateRange,
} from "./settingsDisplay";
import { formatNumber, formatBytes } from "../../app/display";
import { defaultMusicBrainzCachePath } from "../../backend";
import { RunStatus } from "../../components/catalog/CatalogValues";
import type { AppModel } from "../../app/useAppController";

type Model = Pick<
  AppModel,
  | "musicBrainzStatusText"
  | "musicBrainzCachePathDraft"
  | "setMusicBrainzCachePathDraft"
  | "isMusicBrainzChecking"
  | "checkMusicBrainzCache"
  | "musicBrainzStatusError"
  | "musicBrainzStatus"
  | "musicBrainzHasWarnings"
>;

export function MusicBrainzCacheSettings({ model }: { model: Model }) {
  const {
    musicBrainzStatusText,
    musicBrainzCachePathDraft,
    setMusicBrainzCachePathDraft,
    isMusicBrainzChecking,
    checkMusicBrainzCache,
    musicBrainzStatusError,
    musicBrainzStatus,
    musicBrainzHasWarnings,
  } = model;
  return (
    <section className="settings-panel musicbrainz-settings-panel">
      <div className="panel-heading compact">
        <div>
          <h2>MusicBrainz Cache</h2>
          <p>{musicBrainzStatusText}</p>
        </div>
        <ShieldCheck size={18} />
      </div>

      <div className="musicbrainz-toolbar">
        <label className="criterion musicbrainz-cache-path">
          <span>Cache path</span>
          <input
            type="text"
            value={musicBrainzCachePathDraft}
            onChange={(event) =>
              setMusicBrainzCachePathDraft(event.target.value)
            }
            placeholder={defaultMusicBrainzCachePath}
          />
        </label>
        <button
          className="primary-button"
          type="button"
          disabled={isMusicBrainzChecking}
          onClick={() => void checkMusicBrainzCache()}
        >
          <ShieldCheck size={16} />
          <span>{isMusicBrainzChecking ? "Checking" : "Save and check"}</span>
        </button>
      </div>

      {musicBrainzStatusError ? (
        <p className="error-message">{musicBrainzStatusError}</p>
      ) : null}

      {musicBrainzStatus ? (
        <>
          <div
            className={`musicbrainz-status-strip musicbrainz-status-${musicBrainzStatus.state}`}
          >
            <RunStatus status={musicBrainzStatus.state} />
            <span>{musicBrainzStatus.message}</span>
          </div>

          <dl className="performance-summary musicbrainz-summary">
            <div>
              <dt>File</dt>
              <dd>
                {musicBrainzStatus.exists
                  ? formatBytes(musicBrainzStatus.fileSizeBytes)
                  : "Missing"}
              </dd>
            </div>
            <div>
              <dt>Artists</dt>
              <dd>{formatNumber(musicBrainzStatus.artistCount)}</dd>
            </div>
            <div>
              <dt>MBIDs</dt>
              <dd>{formatNumber(musicBrainzStatus.distinctMbidCount)}</dd>
            </div>
            <div>
              <dt>Releases</dt>
              <dd>{formatNumber(musicBrainzStatus.releaseGroupCount)}</dd>
            </div>
            <div>
              <dt>Pure albums</dt>
              <dd>
                {formatNumber(musicBrainzStatus.pureAlbumReleaseGroupCount)}
              </dd>
            </div>
            <div>
              <dt>Years</dt>
              <dd>{musicBrainzYearRange(musicBrainzStatus)}</dd>
            </div>
          </dl>

          <dl className="musicbrainz-quality-grid">
            <div>
              <dt>Official releases</dt>
              <dd>
                {formatNumber(musicBrainzStatus.officialReleaseGroupCount)}
              </dd>
            </div>
            <div>
              <dt>Duplicate MBIDs</dt>
              <dd>{formatNumber(musicBrainzStatus.duplicateMbidCount)}</dd>
            </div>
            <div>
              <dt>Mapping warnings</dt>
              <dd>{formatNumber(musicBrainzStatus.suspiciousMappingCount)}</dd>
            </div>
            <div>
              <dt>Cache dates</dt>
              <dd>{musicBrainzCacheDateRange(musicBrainzStatus)}</dd>
            </div>
          </dl>

          {musicBrainzHasWarnings ? (
            <div className="musicbrainz-warning-list">
              {musicBrainzStatus.warningExamples.map((example) => (
                <article key={example.mbid}>
                  <div>
                    <strong>
                      {example.cachedNames.join(", ") || example.mbid}
                    </strong>
                    <span>{example.mbid}</span>
                  </div>
                  <dl>
                    <div>
                      <dt>Names</dt>
                      <dd>{formatNumber(example.cachedNameCount)}</dd>
                    </div>
                    <div>
                      <dt>Releases</dt>
                      <dd>{formatNumber(example.releaseGroupCount)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          ) : null}

          <small className="performance-database-path">
            {musicBrainzStatus.resolvedPath}
          </small>
        </>
      ) : (
        <div className="empty-state">
          <ShieldCheck size={20} />
          <span>No MusicBrainz cache check has run yet.</span>
        </div>
      )}
    </section>
  );
}
