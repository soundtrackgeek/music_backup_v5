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
  originPreviewStatusLabel,
  originPreviewMatchLabel,
  musicBrainzArtistUrl,
  originPreviewReason,
} from "./settingsDisplay";
import { formatNumber, formatDate, formatPercent } from "../../app/display";
import { openExternalUrl } from "../../backend";
import {
  RunStatus,
  CountryDisplay,
} from "../../components/catalog/CatalogValues";
import { originReportFilterOptions } from "../../app/defaults";
import type { AppModel } from "../../app/useAppController";

type Model = Pick<
  AppModel,
  | "settings"
  | "musicBrainzOriginStatus"
  | "isMusicBrainzOriginPreviewing"
  | "isMusicBrainzOriginImporting"
  | "previewMusicBrainzOriginCountries"
  | "runMusicBrainzOriginCountryImport"
  | "cancelMusicBrainzOriginImport"
  | "musicBrainzOriginError"
  | "musicBrainzOriginImportSummary"
  | "musicBrainzOriginProgress"
  | "musicBrainzOriginProgressPercent"
  | "musicBrainzOriginLog"
  | "musicBrainzOriginPreview"
  | "musicBrainzOriginReportRows"
  | "musicBrainzOriginReportSearch"
  | "setMusicBrainzOriginReportSearch"
  | "musicBrainzOriginReportFilter"
  | "setMusicBrainzOriginReportFilter"
  | "musicBrainzOriginReportCounts"
  | "musicBrainzOriginVisibleReportRows"
>;

export function OriginCountrySettings({ model }: { model: Model }) {
  const {
    settings,
    musicBrainzOriginStatus,
    isMusicBrainzOriginPreviewing,
    isMusicBrainzOriginImporting,
    previewMusicBrainzOriginCountries,
    runMusicBrainzOriginCountryImport,
    cancelMusicBrainzOriginImport,
    musicBrainzOriginError,
    musicBrainzOriginImportSummary,
    musicBrainzOriginProgress,
    musicBrainzOriginProgressPercent,
    musicBrainzOriginLog,
    musicBrainzOriginPreview,
    musicBrainzOriginReportRows,
    musicBrainzOriginReportSearch,
    setMusicBrainzOriginReportSearch,
    musicBrainzOriginReportFilter,
    setMusicBrainzOriginReportFilter,
    musicBrainzOriginReportCounts,
    musicBrainzOriginVisibleReportRows,
  } = model;
  return (
    <section className="settings-panel musicbrainz-origin-settings-panel">
      <div className="panel-heading compact">
        <div>
          <h2>MusicBrainz Origin Countries</h2>
          <p>
            {musicBrainzOriginStatus
              ? `${formatNumber(musicBrainzOriginStatus.importedOrigins)} imported / ${formatNumber(musicBrainzOriginStatus.totalAlbumArtists)} artists`
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
                isMusicBrainzOriginPreviewing || isMusicBrainzOriginImporting
              }
              onClick={() => void previewMusicBrainzOriginCountries()}
            >
              <FileSearch size={16} />
              <span>
                {isMusicBrainzOriginPreviewing ? "Previewing" : "Preview"}
              </span>
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={
                isMusicBrainzOriginPreviewing || isMusicBrainzOriginImporting
              }
              onClick={() => void runMusicBrainzOriginCountryImport()}
            >
              <CloudDownload size={16} />
              <span>
                {isMusicBrainzOriginImporting ? "Importing" : "Import origins"}
              </span>
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label="Cancel MusicBrainz origin import"
              disabled={!isMusicBrainzOriginImporting}
              onClick={() => void cancelMusicBrainzOriginImport()}
            >
              <X size={18} />
            </button>
          </div>

          {musicBrainzOriginError ? (
            <p className="error-message">{musicBrainzOriginError}</p>
          ) : null}

          {musicBrainzOriginStatus ? (
            <dl className="performance-summary musicbrainz-summary">
              <div>
                <dt>Countries</dt>
                <dd>{formatNumber(musicBrainzOriginStatus.countryCount)}</dd>
              </div>
              <div>
                <dt>Manual</dt>
                <dd>{formatNumber(musicBrainzOriginStatus.manualOrigins)}</dd>
              </div>
              <div>
                <dt>Unresolved</dt>
                <dd>
                  {formatNumber(musicBrainzOriginStatus.unresolvedOrigins)}
                </dd>
              </div>
              <div>
                <dt>Missing</dt>
                <dd>{formatNumber(musicBrainzOriginStatus.missingOrigins)}</dd>
              </div>
              <div>
                <dt>Last run</dt>
                <dd>
                  {musicBrainzOriginStatus.lastRun
                    ? formatDate(musicBrainzOriginStatus.lastRun.completedAt)
                    : "Not yet"}
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{musicBrainzOriginStatus.lastRun?.status ?? "Idle"}</dd>
              </div>
            </dl>
          ) : null}

          {musicBrainzOriginImportSummary ? (
            <div className="export-result">
              <Check size={17} />
              <span>
                {formatNumber(musicBrainzOriginImportSummary.fetchedCount)}{" "}
                fetched /{" "}
                {formatNumber(musicBrainzOriginImportSummary.storedCount)}{" "}
                stored /{" "}
                {formatNumber(musicBrainzOriginImportSummary.unresolvedCount)}{" "}
                unresolved
              </span>
            </div>
          ) : null}
        </div>

        <aside className="musicbrainz-origin-live-panel" aria-live="polite">
          <div className="musicbrainz-origin-live-heading">
            <div>
              <h3>Live import</h3>
              <p>{musicBrainzOriginProgress?.message ?? "Idle"}</p>
            </div>
            <span
              className={`run-status run-status-${(musicBrainzOriginProgress?.status ?? "idle").toLowerCase()}`}
            >
              {originImportStatusLabel(musicBrainzOriginProgress?.status)}
            </span>
          </div>

          <div className="progress-block musicbrainz-origin-progress-block">
            <div className="progress-row">
              <span>
                {formatNumber(musicBrainzOriginProgress?.processedCount ?? 0)}{" "}
                done /{" "}
                {formatNumber(musicBrainzOriginProgress?.remainingCount ?? 0)}{" "}
                left
              </span>
              <strong>
                {formatPercent(musicBrainzOriginProgressPercent / 100, 0) ||
                  "0%"}
              </strong>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{
                  width: `${musicBrainzOriginProgressPercent}%`,
                }}
              />
            </div>
            <div className="progress-meta">
              <span>
                {formatNumber(musicBrainzOriginProgress?.eligibleCount ?? 0)}{" "}
                eligible
              </span>
              <span>
                {formatNumber(musicBrainzOriginProgress?.totalArtists ?? 0)}{" "}
                artists total
              </span>
            </div>
          </div>

          <dl className="musicbrainz-origin-live-stats">
            <div>
              <dt>Succeeded</dt>
              <dd>
                {formatNumber(musicBrainzOriginProgress?.storedCount ?? 0)}
              </dd>
            </div>
            <div>
              <dt>Skipped</dt>
              <dd>
                {formatNumber(musicBrainzOriginProgress?.skippedCount ?? 0)}
              </dd>
            </div>
            <div>
              <dt>Unresolved</dt>
              <dd>
                {formatNumber(musicBrainzOriginProgress?.unresolvedCount ?? 0)}
              </dd>
            </div>
            <div>
              <dt>Failed</dt>
              <dd>
                {formatNumber(musicBrainzOriginProgress?.failedCount ?? 0)}
              </dd>
            </div>
          </dl>

          {musicBrainzOriginLog.length > 0 ? (
            <div className="musicbrainz-origin-log">
              {musicBrainzOriginLog.map((entry, index) => (
                <article
                  key={`${entry.status}-${entry.processedCount}-${entry.currentArtistKey ?? index}`}
                >
                  <div>
                    <strong>{originImportStatusLabel(entry.status)}</strong>
                    <span>
                      {entry.currentArtist ??
                        entry.currentMbid ??
                        "Origin importer"}
                    </span>
                  </div>
                  <small>{entry.message}</small>
                </article>
              ))}
            </div>
          ) : musicBrainzOriginPreview ? (
            <div className="musicbrainz-warning-list musicbrainz-origin-preview-list">
              {musicBrainzOriginPreview.rows.slice(0, 8).map((row) => (
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
                      <dt>Country</dt>
                      <dd>
                        <CountryDisplay
                          value={{
                            originCountryCode: row.existingCountryCode,
                            originCountryName: row.existingCountryName,
                            originCountryRawArea: null,
                          }}
                          mode={settings.countryFlagDisplay}
                          fallback="Missing"
                        />
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <FileSearch size={20} />
              <span>No origin preview yet.</span>
            </div>
          )}
        </aside>
      </div>

      {musicBrainzOriginPreview ? (
        <section
          className="musicbrainz-origin-report"
          aria-label="MusicBrainz origin coverage report"
        >
          <div className="musicbrainz-origin-report-heading">
            <div>
              <h3>Origin coverage report</h3>
              <p>
                {formatNumber(musicBrainzOriginReportRows.length)} matching /{" "}
                {formatNumber(musicBrainzOriginPreview.rows.length)} previewed
              </p>
            </div>
            <label className="criterion musicbrainz-origin-report-search">
              <span>Find artist</span>
              <input
                type="search"
                value={musicBrainzOriginReportSearch}
                onChange={(event) =>
                  setMusicBrainzOriginReportSearch(event.target.value)
                }
                placeholder="Beastie Boys"
              />
            </label>
          </div>

          <div
            className="segmented-control musicbrainz-origin-report-tabs"
            role="group"
            aria-label="Origin report filter"
          >
            {originReportFilterOptions.map((option) => (
              <button
                className={
                  musicBrainzOriginReportFilter === option.value ? "active" : ""
                }
                type="button"
                key={option.value}
                onClick={() => setMusicBrainzOriginReportFilter(option.value)}
              >
                {option.label}
                <span>
                  {formatNumber(musicBrainzOriginReportCounts[option.value])}
                </span>
              </button>
            ))}
          </div>

          <div className="musicbrainz-origin-report-table" role="table">
            <div className="musicbrainz-origin-report-head" role="row">
              <span role="columnheader">Artist</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Country</span>
              <span role="columnheader">Match</span>
              <span role="columnheader">Reason</span>
            </div>
            {musicBrainzOriginVisibleReportRows.length === 0 ? (
              <div className="empty-state musicbrainz-origin-report-empty">
                <FileSearch size={20} />
                <span>No matching origin rows.</span>
              </div>
            ) : (
              musicBrainzOriginVisibleReportRows.map((row) => (
                <div
                  className={`musicbrainz-origin-report-row origin-report-status-${row.status.toLowerCase()}`}
                  role="row"
                  key={row.localArtistKey}
                >
                  <span role="cell">
                    <strong>{row.displayArtist}</strong>
                    <small>{formatNumber(row.albumCount)} albums</small>
                  </span>
                  <span role="cell">
                    <RunStatus status={originPreviewStatusLabel(row.status)} />
                  </span>
                  <span role="cell">
                    <CountryDisplay
                      value={{
                        originCountryCode: row.existingCountryCode,
                        originCountryName: row.existingCountryName,
                        originCountryRawArea: null,
                      }}
                      mode={settings.countryFlagDisplay}
                      fallback="Missing"
                    />
                  </span>
                  <span role="cell">
                    <span>{originPreviewMatchLabel(row)}</span>
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
                  <span role="cell">{originPreviewReason(row)}</span>
                </div>
              ))
            )}
          </div>
          {musicBrainzOriginReportRows.length >
          musicBrainzOriginVisibleReportRows.length ? (
            <small className="musicbrainz-origin-report-limit">
              Showing {formatNumber(musicBrainzOriginVisibleReportRows.length)}{" "}
              of {formatNumber(musicBrainzOriginReportRows.length)} matching
              rows.
            </small>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
