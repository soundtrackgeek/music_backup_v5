import {
  Check,
  UsersRound,
  FileSearch,
  CloudDownload,
  X,
  ExternalLink,
} from "lucide-react";
import {
  originImportStatusLabel,
  musicBrainzArtistUrl,
  artistInfoPreviewStatusLabel,
  artistInfoLifeStartLabel,
  artistInfoDateLabel,
  artistInfoLifeEndLabel,
  artistInfoPreviewMatchLabel,
  artistInfoPreviewReason,
} from "./settingsDisplay";
import { formatNumber, formatDate, formatPercent } from "../../app/display";
import { openExternalUrl } from "../../backend";
import { RunStatus } from "../../components/catalog/CatalogValues";
import { artistInfoReportFilterOptions } from "../../app/defaults";
import type { AppModel } from "../../app/useAppController";

type Model = Pick<
  AppModel,
  | "musicBrainzArtistInfoStatus"
  | "isMusicBrainzArtistInfoPreviewing"
  | "isMusicBrainzArtistInfoImporting"
  | "previewMusicBrainzArtistInfos"
  | "runMusicBrainzArtistInfoImport"
  | "cancelMusicBrainzArtistInfoImportRun"
  | "musicBrainzArtistInfoError"
  | "musicBrainzArtistInfoImportSummary"
  | "musicBrainzArtistInfoProgress"
  | "musicBrainzArtistInfoProgressPercent"
  | "musicBrainzArtistInfoLog"
  | "musicBrainzArtistInfoPreview"
  | "musicBrainzArtistInfoReportRows"
  | "musicBrainzArtistInfoReportSearch"
  | "setMusicBrainzArtistInfoReportSearch"
  | "musicBrainzArtistInfoReportFilter"
  | "setMusicBrainzArtistInfoReportFilter"
  | "musicBrainzArtistInfoReportCounts"
  | "musicBrainzArtistInfoVisibleReportRows"
>;

export function ArtistInformationSettings({ model }: { model: Model }) {
  const {
    musicBrainzArtistInfoStatus,
    isMusicBrainzArtistInfoPreviewing,
    isMusicBrainzArtistInfoImporting,
    previewMusicBrainzArtistInfos,
    runMusicBrainzArtistInfoImport,
    cancelMusicBrainzArtistInfoImportRun,
    musicBrainzArtistInfoError,
    musicBrainzArtistInfoImportSummary,
    musicBrainzArtistInfoProgress,
    musicBrainzArtistInfoProgressPercent,
    musicBrainzArtistInfoLog,
    musicBrainzArtistInfoPreview,
    musicBrainzArtistInfoReportRows,
    musicBrainzArtistInfoReportSearch,
    setMusicBrainzArtistInfoReportSearch,
    musicBrainzArtistInfoReportFilter,
    setMusicBrainzArtistInfoReportFilter,
    musicBrainzArtistInfoReportCounts,
    musicBrainzArtistInfoVisibleReportRows,
  } = model;
  return (
    <section className="settings-panel musicbrainz-origin-settings-panel musicbrainz-artist-info-settings-panel">
      <div className="panel-heading compact">
        <div>
          <h2>MusicBrainz Artist Information</h2>
          <p>
            {musicBrainzArtistInfoStatus
              ? `${formatNumber(musicBrainzArtistInfoStatus.importedInfos)} imported / ${formatNumber(musicBrainzArtistInfoStatus.totalAlbumArtists)} artists`
              : "Not checked"}
          </p>
        </div>
        <UsersRound size={18} />
      </div>

      <div className="musicbrainz-origin-grid">
        <div className="musicbrainz-origin-workflow">
          <div className="musicbrainz-toolbar">
            <button
              className="secondary-button"
              type="button"
              disabled={
                isMusicBrainzArtistInfoPreviewing ||
                isMusicBrainzArtistInfoImporting
              }
              onClick={() => void previewMusicBrainzArtistInfos()}
            >
              <FileSearch size={16} />
              <span>
                {isMusicBrainzArtistInfoPreviewing ? "Previewing" : "Preview"}
              </span>
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={
                isMusicBrainzArtistInfoPreviewing ||
                isMusicBrainzArtistInfoImporting
              }
              onClick={() => void runMusicBrainzArtistInfoImport()}
            >
              <CloudDownload size={16} />
              <span>
                {isMusicBrainzArtistInfoImporting ? "Importing" : "Import info"}
              </span>
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label="Cancel MusicBrainz artist-info import"
              disabled={!isMusicBrainzArtistInfoImporting}
              onClick={() => void cancelMusicBrainzArtistInfoImportRun()}
            >
              <X size={18} />
            </button>
          </div>

          {musicBrainzArtistInfoError ? (
            <p className="error-message">{musicBrainzArtistInfoError}</p>
          ) : null}

          {musicBrainzArtistInfoStatus ? (
            <dl className="performance-summary musicbrainz-summary">
              <div>
                <dt>People</dt>
                <dd>
                  {formatNumber(musicBrainzArtistInfoStatus.personArtists)}
                </dd>
              </div>
              <div>
                <dt>Groups</dt>
                <dd>
                  {formatNumber(musicBrainzArtistInfoStatus.groupArtists)}
                </dd>
              </div>
              <div>
                <dt>Gender</dt>
                <dd>
                  {formatNumber(musicBrainzArtistInfoStatus.genderedArtists)}
                </dd>
              </div>
              <div>
                <dt>Born</dt>
                <dd>{formatNumber(musicBrainzArtistInfoStatus.bornArtists)}</dd>
              </div>
              <div>
                <dt>Died</dt>
                <dd>{formatNumber(musicBrainzArtistInfoStatus.diedArtists)}</dd>
              </div>
              <div>
                <dt>Founded</dt>
                <dd>
                  {formatNumber(musicBrainzArtistInfoStatus.foundedArtists)}
                </dd>
              </div>
              <div>
                <dt>Dissolved</dt>
                <dd>
                  {formatNumber(musicBrainzArtistInfoStatus.dissolvedArtists)}
                </dd>
              </div>
              <div>
                <dt>Missing</dt>
                <dd>
                  {formatNumber(musicBrainzArtistInfoStatus.missingInfos)}
                </dd>
              </div>
              <div>
                <dt>Last run</dt>
                <dd>
                  {musicBrainzArtistInfoStatus.lastRun
                    ? formatDate(
                        musicBrainzArtistInfoStatus.lastRun.completedAt,
                      )
                    : "Not yet"}
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{musicBrainzArtistInfoStatus.lastRun?.status ?? "Idle"}</dd>
              </div>
            </dl>
          ) : null}

          {musicBrainzArtistInfoImportSummary ? (
            <div className="export-result">
              <Check size={17} />
              <span>
                {formatNumber(musicBrainzArtistInfoImportSummary.fetchedCount)}{" "}
                fetched /{" "}
                {formatNumber(musicBrainzArtistInfoImportSummary.storedCount)}{" "}
                stored /{" "}
                {formatNumber(
                  musicBrainzArtistInfoImportSummary.unresolvedCount,
                )}{" "}
                unresolved
              </span>
            </div>
          ) : null}
        </div>

        <aside className="musicbrainz-origin-live-panel" aria-live="polite">
          <div className="musicbrainz-origin-live-heading">
            <div>
              <h3>Live import</h3>
              <p>{musicBrainzArtistInfoProgress?.message ?? "Idle"}</p>
            </div>
            <span
              className={`run-status run-status-${(musicBrainzArtistInfoProgress?.status ?? "idle").toLowerCase()}`}
            >
              {originImportStatusLabel(musicBrainzArtistInfoProgress?.status)}
            </span>
          </div>

          <div className="progress-block musicbrainz-origin-progress-block">
            <div className="progress-row">
              <span>
                {formatNumber(
                  musicBrainzArtistInfoProgress?.processedCount ?? 0,
                )}{" "}
                done /{" "}
                {formatNumber(
                  musicBrainzArtistInfoProgress?.remainingCount ?? 0,
                )}{" "}
                left
              </span>
              <strong>
                {formatPercent(musicBrainzArtistInfoProgressPercent / 100, 0) ||
                  "0%"}
              </strong>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{
                  width: `${musicBrainzArtistInfoProgressPercent}%`,
                }}
              />
            </div>
            <div className="progress-meta">
              <span>
                {formatNumber(
                  musicBrainzArtistInfoProgress?.eligibleCount ?? 0,
                )}{" "}
                eligible
              </span>
              <span>
                {formatNumber(musicBrainzArtistInfoProgress?.totalArtists ?? 0)}{" "}
                artists total
              </span>
            </div>
          </div>

          <dl className="musicbrainz-origin-live-stats">
            <div>
              <dt>Succeeded</dt>
              <dd>
                {formatNumber(musicBrainzArtistInfoProgress?.storedCount ?? 0)}
              </dd>
            </div>
            <div>
              <dt>Skipped</dt>
              <dd>
                {formatNumber(musicBrainzArtistInfoProgress?.skippedCount ?? 0)}
              </dd>
            </div>
            <div>
              <dt>Unresolved</dt>
              <dd>
                {formatNumber(
                  musicBrainzArtistInfoProgress?.unresolvedCount ?? 0,
                )}
              </dd>
            </div>
            <div>
              <dt>Failed</dt>
              <dd>
                {formatNumber(musicBrainzArtistInfoProgress?.failedCount ?? 0)}
              </dd>
            </div>
          </dl>

          {musicBrainzArtistInfoLog.length > 0 ? (
            <div className="musicbrainz-origin-log">
              {musicBrainzArtistInfoLog.map((entry, index) => (
                <article
                  key={`${entry.status}-${entry.processedCount}-${entry.currentArtistKey ?? index}`}
                >
                  <div>
                    <strong>{originImportStatusLabel(entry.status)}</strong>
                    <span>
                      {entry.currentArtist ??
                        entry.currentMbid ??
                        "Artist info importer"}
                    </span>
                  </div>
                  <small>{entry.message}</small>
                </article>
              ))}
            </div>
          ) : musicBrainzArtistInfoPreview ? (
            <div className="musicbrainz-warning-list musicbrainz-origin-preview-list">
              {musicBrainzArtistInfoPreview.rows.slice(0, 8).map((row) => (
                <article key={row.localArtistKey}>
                  <div>
                    <strong>{row.displayArtist}</strong>
                    <span>
                      {row.musicbrainzMbid ?? row.skippedReason ?? "No MBID"}
                    </span>
                  </div>
                  <dl>
                    <div>
                      <dt>Status</dt>
                      <dd>{row.status}</dd>
                    </div>
                    <div>
                      <dt>Type</dt>
                      <dd>{row.existingArtistType ?? "Missing"}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <FileSearch size={20} />
              <span>No artist-info preview yet.</span>
            </div>
          )}
        </aside>
      </div>

      {musicBrainzArtistInfoPreview ? (
        <section
          className="musicbrainz-origin-report"
          aria-label="MusicBrainz artist-info coverage report"
        >
          <div className="musicbrainz-origin-report-heading">
            <div>
              <h3>Artist information report</h3>
              <p>
                {formatNumber(musicBrainzArtistInfoReportRows.length)} matching
                / {formatNumber(musicBrainzArtistInfoPreview.rows.length)}{" "}
                previewed
              </p>
            </div>
            <label className="criterion musicbrainz-origin-report-search">
              <span>Find artist</span>
              <input
                type="search"
                value={musicBrainzArtistInfoReportSearch}
                onChange={(event) =>
                  setMusicBrainzArtistInfoReportSearch(event.target.value)
                }
                placeholder="David Bowie"
              />
            </label>
          </div>

          <div
            className="segmented-control musicbrainz-origin-report-tabs"
            role="group"
            aria-label="Artist information report filter"
          >
            {artistInfoReportFilterOptions.map((option) => (
              <button
                className={
                  musicBrainzArtistInfoReportFilter === option.value
                    ? "active"
                    : ""
                }
                type="button"
                key={option.value}
                onClick={() =>
                  setMusicBrainzArtistInfoReportFilter(option.value)
                }
              >
                {option.label}
                <span>
                  {formatNumber(
                    musicBrainzArtistInfoReportCounts[option.value],
                  )}
                </span>
              </button>
            ))}
          </div>

          <div
            className="musicbrainz-origin-report-table musicbrainz-artist-info-report-table"
            role="table"
          >
            <div className="musicbrainz-artist-info-report-head" role="row">
              <span role="columnheader">Artist</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Type</span>
              <span role="columnheader">Gender</span>
              <span role="columnheader">Life</span>
              <span role="columnheader">Match</span>
              <span role="columnheader">Reason</span>
            </div>
            {musicBrainzArtistInfoVisibleReportRows.length === 0 ? (
              <div className="empty-state musicbrainz-origin-report-empty">
                <FileSearch size={20} />
                <span>No matching artist-info rows.</span>
              </div>
            ) : (
              musicBrainzArtistInfoVisibleReportRows.map((row) => (
                <div
                  className={`musicbrainz-artist-info-report-row origin-report-status-${row.status.toLowerCase()}`}
                  role="row"
                  key={row.localArtistKey}
                >
                  <span role="cell">
                    <strong>{row.displayArtist}</strong>
                    <small>
                      {row.existingSortName ??
                        `${formatNumber(row.albumCount)} albums`}
                    </small>
                  </span>
                  <span role="cell">
                    <RunStatus
                      status={artistInfoPreviewStatusLabel(row.status)}
                    />
                  </span>
                  <span role="cell">{row.existingArtistType ?? "Missing"}</span>
                  <span role="cell">{row.existingGender ?? "Missing"}</span>
                  <span role="cell">
                    <strong>{artistInfoLifeStartLabel(row)}</strong>
                    <small>
                      {artistInfoDateLabel(
                        row.existingBeginDate,
                        row.existingBeginYear,
                        row.existingBeginAreaName,
                      )}
                    </small>
                    <strong>{artistInfoLifeEndLabel(row)}</strong>
                    <small>
                      {artistInfoDateLabel(
                        row.existingEndDate,
                        row.existingEndYear,
                        row.existingEndAreaName,
                      )}
                    </small>
                  </span>
                  <span role="cell">
                    <span>{artistInfoPreviewMatchLabel(row)}</span>
                    {row.musicbrainzMbid ? (
                      <button
                        className="icon-button musicbrainz-origin-report-link"
                        type="button"
                        aria-label={`Open ${row.displayArtist} in MusicBrainz`}
                        onClick={() =>
                          void openExternalUrl(
                            musicBrainzArtistUrl(row.musicbrainzMbid!),
                          )
                        }
                      >
                        <ExternalLink size={14} />
                      </button>
                    ) : null}
                  </span>
                  <span role="cell">{artistInfoPreviewReason(row)}</span>
                </div>
              ))
            )}
          </div>
          {musicBrainzArtistInfoReportRows.length >
          musicBrainzArtistInfoVisibleReportRows.length ? (
            <small className="musicbrainz-origin-report-limit">
              Showing{" "}
              {formatNumber(musicBrainzArtistInfoVisibleReportRows.length)} of{" "}
              {formatNumber(musicBrainzArtistInfoReportRows.length)} matching
              rows.
            </small>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
