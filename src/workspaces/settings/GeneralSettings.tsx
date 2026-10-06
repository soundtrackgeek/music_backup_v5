import { SettingsSection } from "../SettingsWorkspace";
import {
  Download,
  Database,
  ShieldCheck,
  Moon,
  Library,
  SlidersHorizontal,
} from "lucide-react";
import { formatNumber } from "../../app/display";
import { Metric } from "../../components/catalog/CatalogValues";
import {
  leftSidebarModeLabels,
  rightSidebarModeLabels,
  leftSidebarModeOptions,
  rightSidebarModeOptions,
  countryFlagDisplayOptions,
} from "../../app/config";
import type { AppModel } from "../../app/useAppController";

type Model = Pick<
  AppModel,
  | "settings"
  | "saveAppSettings"
  | "isSavingSettings"
  | "musicBrainzStatusLabel"
  | "musicBrainzMetricTone"
  | "appUpdateMetricValue"
  | "saveLeftSidebarDefault"
  | "saveRightSidebarDefault"
  | "saveCountryFlagDisplay"
>;

export function GeneralSettings({ model }: { model: Model }) {
  const {
    settings,
    saveAppSettings,
    isSavingSettings,
    musicBrainzStatusLabel,
    musicBrainzMetricTone,
    appUpdateMetricValue,
    saveLeftSidebarDefault,
    saveRightSidebarDefault,
    saveCountryFlagDisplay,
  } = model;
  return (
    <SettingsSection id="general">
      <section
        className="metric-grid settings-summary-grid"
        aria-label="Settings summary"
      >
        <Metric
          label="Rolling backups"
          value={formatNumber(settings.backupRetention)}
          tone="teal"
          icon={Database}
        />
        <Metric
          label="Theme"
          value={settings.darkMode ? "Dark" : "Light"}
          tone="amber"
          icon={Moon}
        />
        <Metric
          label="Navigation"
          value={leftSidebarModeLabels[settings.leftSidebarDefault]}
          icon={Library}
        />
        <Metric
          label="Details"
          value={rightSidebarModeLabels[settings.rightSidebarDefault]}
          icon={SlidersHorizontal}
        />
        <Metric
          label="MusicBrainz"
          value={musicBrainzStatusLabel}
          tone={musicBrainzMetricTone}
          icon={ShieldCheck}
        />
        <Metric
          label="Updates"
          value={appUpdateMetricValue}
          tone="teal"
          icon={Download}
        />
      </section>

      <section className="settings-panel">
        <div className="panel-heading compact">
          <div>
            <h2>Appearance</h2>
            <p>{settings.darkMode ? "Dark mode" : "Light mode"}</p>
          </div>
          <Moon size={18} />
        </div>

        <label className="setting-toggle">
          <input
            type="checkbox"
            aria-label="Dark mode"
            checked={settings.darkMode}
            onChange={(event) =>
              void saveAppSettings({ darkMode: event.target.checked })
            }
          />
          <span>
            <strong>Dark mode</strong>
            <small>{settings.darkMode ? "On" : "Off"}</small>
          </span>
        </label>
      </section>

      <section className="settings-panel layout-settings-panel">
        <div className="panel-heading compact">
          <div>
            <h2>Layout</h2>
            <p>
              {isSavingSettings ? "Saving preferences" : "Preferences saved"}
            </p>
          </div>
          <SlidersHorizontal size={18} />
        </div>

        <div className="layout-setting-stack">
          <div className="layout-setting">
            <span>Left sidebar default</span>
            <div
              className="segmented-control layout-mode-control left-layout-mode-control"
              role="group"
              aria-label="Left sidebar default"
            >
              {leftSidebarModeOptions.map((option) => (
                <button
                  className={
                    settings.leftSidebarDefault === option.value ? "active" : ""
                  }
                  type="button"
                  key={option.value}
                  onClick={() => saveLeftSidebarDefault(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="layout-setting">
            <span>Right sidebar default</span>
            <div
              className="segmented-control layout-mode-control right-layout-mode-control"
              role="group"
              aria-label="Right sidebar default"
            >
              {rightSidebarModeOptions.map((option) => (
                <button
                  className={
                    settings.rightSidebarDefault === option.value
                      ? "active"
                      : ""
                  }
                  type="button"
                  key={option.value}
                  onClick={() => saveRightSidebarDefault(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="layout-setting">
            <span>Origin country display</span>
            <div
              className="segmented-control layout-mode-control country-display-mode-control"
              role="group"
              aria-label="Origin country display"
            >
              {countryFlagDisplayOptions.map((option) => (
                <button
                  className={
                    settings.countryFlagDisplay === option.value ? "active" : ""
                  }
                  type="button"
                  key={option.value}
                  onClick={() => saveCountryFlagDisplay(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </SettingsSection>
  );
}
