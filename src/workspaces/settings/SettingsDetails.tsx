import { Settings, ShieldCheck, Moon, Download } from "lucide-react";
import { formatDate, formatNumber } from "../../app/display";
import {
  leftSidebarModeLabels,
  rightSidebarModeLabels,
  countryFlagDisplayLabels,
} from "../../app/config";
import { appUpdateStatusLabel } from "./settingsDisplay";
import type { AppModel } from "../../app/useAppController";
export function SettingsDetails({
  model,
}: {
  model: Pick<
    AppModel,
    "settings" | "appUpdateAutoCheckMinutes" | "appUpdateStatus" | "canImport"
  >;
}) {
  const { settings, appUpdateAutoCheckMinutes, appUpdateStatus, canImport } =
    model;
  return (
    <aside
      className="detail-panel settings-detail"
      aria-label="Settings details"
    >
      <div className="detail-header">
        <Settings size={20} />
        <div>
          <h2>Preferences</h2>
          <p>
            {settings.updatedAt
              ? formatDate(settings.updatedAt)
              : "Default settings"}
          </p>
        </div>
      </div>

      <dl className="run-details">
        <div>
          <dt>Rolling backups</dt>
          <dd>{formatNumber(settings.backupRetention)}</dd>
        </div>
        <div>
          <dt>Theme</dt>
          <dd>{settings.darkMode ? "Dark" : "Light"}</dd>
        </div>
        <div>
          <dt>Navigation</dt>
          <dd>{leftSidebarModeLabels[settings.leftSidebarDefault]}</dd>
        </div>
        <div>
          <dt>Details</dt>
          <dd>{rightSidebarModeLabels[settings.rightSidebarDefault]}</dd>
        </div>
        <div>
          <dt>Origin display</dt>
          <dd>{countryFlagDisplayLabels[settings.countryFlagDisplay]}</dd>
        </div>
        <div>
          <dt>Updates</dt>
          <dd>
            {appUpdateAutoCheckMinutes > 0
              ? `${appUpdateAutoCheckMinutes} min`
              : appUpdateStatusLabel(appUpdateStatus)}
          </dd>
        </div>
        <div>
          <dt>Runtime</dt>
          <dd>{canImport ? "Tauri desktop" : "Web preview"}</dd>
        </div>
      </dl>

      <section className="calculation-list settings-signals">
        <div>
          <ShieldCheck size={17} />
          <span>Backups pruned after import</span>
        </div>
        <div>
          <Moon size={17} />
          <span>
            {settings.darkMode ? "Dark mode active" : "Light mode active"}
          </span>
        </div>
        <div>
          <Download size={17} />
          <span>{appUpdateStatusLabel(appUpdateStatus)}</span>
        </div>
      </section>
    </aside>
  );
}
