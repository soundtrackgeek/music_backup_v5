import { SettingsSection } from "../SettingsWorkspace";
import { RotateCcw, Database, Check } from "lucide-react";
import { MusicDoctorSettingsPanel } from "../../components/MusicDoctorSettingsPanel";
import { formatNumber, formatDate, formatBytes } from "../../app/display";
import { clampBackupRetention, numberValue } from "../../app/input";
import type { AppModel } from "../../app/useAppController";

type Model = Pick<
  AppModel,
  | "loadData"
  | "settings"
  | "saveAppSettings"
  | "catalogRefreshKey"
  | "isSavingSettings"
  | "databaseBackups"
  | "backupError"
  | "restoreSummary"
  | "canImport"
  | "isRestoringBackup"
  | "restoreBackup"
>;

export function DataSettings({ model }: { model: Model }) {
  const {
    loadData,
    settings,
    saveAppSettings,
    catalogRefreshKey,
    isSavingSettings,
    databaseBackups,
    backupError,
    restoreSummary,
    canImport,
    isRestoringBackup,
    restoreBackup,
  } = model;
  return (
    <SettingsSection id="data">
      <MusicDoctorSettingsPanel
        refreshToken={catalogRefreshKey}
        databasePath={settings.musicDoctorDatabasePath}
        autoSync={settings.musicDoctorAutoSync}
        isSavingSettings={isSavingSettings}
        onSaveSettings={saveAppSettings}
      />
      <section className="settings-panel backup-settings-panel">
        <div className="panel-heading compact">
          <div>
            <h2>Backups</h2>
            <p>
              {formatNumber(databaseBackups.length)} available /{" "}
              {settings.backupRetention} retained
            </p>
          </div>
          <Database size={18} />
        </div>

        <div className="backup-settings-toolbar">
          <label className="criterion setting-number">
            <span>Rolling backups</span>
            <input
              type="number"
              min={1}
              max={50}
              value={settings.backupRetention}
              onChange={(event) =>
                void saveAppSettings({
                  backupRetention: clampBackupRetention(
                    numberValue(event.target.value),
                  ),
                })
              }
            />
          </label>
          <button
            className="icon-button"
            type="button"
            aria-label="Refresh backups"
            onClick={() => void loadData()}
          >
            <RotateCcw size={18} />
          </button>
        </div>

        {backupError ? <p className="error-message">{backupError}</p> : null}
        {restoreSummary ? (
          <div className="export-result restore-result">
            <Check size={17} />
            <span>
              Restored {formatNumber(restoreSummary.trackCount)} tracks /{" "}
              {formatNumber(restoreSummary.albumCount)} albums. Safety copy:{" "}
              {restoreSummary.preRestoreBackupPath ?? "not needed"}
            </span>
          </div>
        ) : null}

        {!canImport ? (
          <div className="empty-state">
            <Database size={20} />
            <span>Desktop runtime required.</span>
          </div>
        ) : databaseBackups.length === 0 ? (
          <div className="empty-state">
            <Database size={20} />
            <span>No backups found.</span>
          </div>
        ) : (
          <div className="database-backup-list">
            {databaseBackups.map((backup) => (
              <article className="database-backup-card" key={backup.backupPath}>
                <div>
                  <strong>{formatDate(backup.createdAt)}</strong>
                  <span>{backup.operation}</span>
                </div>
                <dl>
                  <div>
                    <dt>Rows</dt>
                    <dd>
                      {backup.trackRows == null
                        ? "Unknown"
                        : formatNumber(backup.trackRows)}
                    </dd>
                  </div>
                  <div>
                    <dt>Albums</dt>
                    <dd>
                      {backup.albumCount == null
                        ? "Unknown"
                        : formatNumber(backup.albumCount)}
                    </dd>
                  </div>
                  <div>
                    <dt>Schema</dt>
                    <dd>
                      {backup.schemaVersion == null
                        ? "Unknown"
                        : backup.schemaVersion}
                    </dd>
                  </div>
                  <div>
                    <dt>Size</dt>
                    <dd>{formatBytes(backup.fileSizeBytes)}</dd>
                  </div>
                </dl>
                <small>{backup.backupPath}</small>
                <button
                  className="primary-button"
                  type="button"
                  disabled={!backup.canRestore || isRestoringBackup}
                  onClick={() => void restoreBackup(backup)}
                >
                  <Database size={16} />
                  <span>
                    {isRestoringBackup
                      ? "Restoring"
                      : backup.canRestore
                        ? "Restore"
                        : "Unavailable"}
                  </span>
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </SettingsSection>
  );
}
