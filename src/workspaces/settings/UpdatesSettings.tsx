import { SettingsSection } from "../SettingsWorkspace";
import { RotateCcw, Download } from "lucide-react";
import { appUpdateStatusLabel } from "./settingsDisplay";
import type { AppModel } from "../../app/useAppController";

type Model = Pick<
  AppModel,
  | "appUpdatePanelText"
  | "appUpdateAutoCheckDraft"
  | "setAppUpdateAutoCheckDraft"
  | "commitAppUpdateAutoCheckMinutes"
  | "appUpdateIsBusy"
  | "checkAppUpdate"
  | "appUpdateStatus"
  | "appUpdateCanInstall"
  | "runAppUpdateInstall"
  | "appUpdateError"
  | "appUpdateInfo"
  | "appUpdateLastCheckedText"
  | "appUpdateAutoCheckMinutes"
  | "appUpdateProgress"
>;

export function UpdatesSettings({ model }: { model: Model }) {
  const {
    appUpdatePanelText,
    appUpdateAutoCheckDraft,
    setAppUpdateAutoCheckDraft,
    commitAppUpdateAutoCheckMinutes,
    appUpdateIsBusy,
    checkAppUpdate,
    appUpdateStatus,
    appUpdateCanInstall,
    runAppUpdateInstall,
    appUpdateError,
    appUpdateInfo,
    appUpdateLastCheckedText,
    appUpdateAutoCheckMinutes,
    appUpdateProgress,
  } = model;
  return (
    <SettingsSection id="updates">
      <section className="settings-panel update-settings-panel">
        <div className="panel-heading compact">
          <div>
            <h2>App Updates</h2>
            <p>{appUpdatePanelText}</p>
          </div>
          <Download size={18} />
        </div>

        <div className="app-update-settings-toolbar">
          <label className="criterion setting-number app-update-interval">
            <span>Auto minutes</span>
            <input
              type="number"
              min={0}
              max={1440}
              value={appUpdateAutoCheckDraft}
              onChange={(event) =>
                setAppUpdateAutoCheckDraft(event.target.value)
              }
              onBlur={() => void commitAppUpdateAutoCheckMinutes()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
            />
          </label>
          <button
            className="secondary-button"
            type="button"
            disabled={appUpdateIsBusy}
            onClick={() => void checkAppUpdate("manual")}
          >
            <RotateCcw size={16} />
            <span>
              {appUpdateStatus === "checking" ? "Checking" : "Check now"}
            </span>
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={!appUpdateCanInstall || appUpdateIsBusy}
            onClick={() => void runAppUpdateInstall()}
          >
            <Download size={16} />
            <span>
              {appUpdateStatus === "downloading" ||
              appUpdateStatus === "installing" ||
              appUpdateStatus === "restarting"
                ? appUpdateStatusLabel(appUpdateStatus)
                : "Update now"}
            </span>
          </button>
        </div>

        {appUpdateError ? (
          <p className="error-message">{appUpdateError}</p>
        ) : null}

        <dl className="performance-summary app-update-summary">
          <div>
            <dt>Installed</dt>
            <dd>{appUpdateInfo?.currentVersion ?? "Current build"}</dd>
          </div>
          <div>
            <dt>Available</dt>
            <dd>{appUpdateInfo?.version ?? "None"}</dd>
          </div>
          <div>
            <dt>Last check</dt>
            <dd>{appUpdateLastCheckedText}</dd>
          </div>
          <div>
            <dt>Auto</dt>
            <dd>
              {appUpdateAutoCheckMinutes > 0
                ? `${appUpdateAutoCheckMinutes} min`
                : "Off"}
            </dd>
          </div>
        </dl>

        {appUpdateStatus === "downloading" &&
        appUpdateProgress?.percent != null ? (
          <div
            className="app-update-progress app-update-progress-settings"
            aria-hidden="true"
          >
            <div style={{ width: `${appUpdateProgress.percent}%` }} />
          </div>
        ) : null}
      </section>
    </SettingsSection>
  );
}
