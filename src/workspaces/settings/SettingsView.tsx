import { SettingsWorkspace, SettingsSection } from "../SettingsWorkspace";
import { RotateCcw } from "lucide-react";
import { AiSettingsPanel } from "../../components/AiSettingsPanel";
import { DiscogsSettingsPanel } from "../../components/DiscogsSettingsPanel";
import { LastFmSettingsPanel } from "../../components/LastFmSettingsPanel";
import { DeemixSettingsPanel } from "../../components/DeemixSettingsPanel";
import { SoulseekSettingsPanel } from "../../components/SoulseekSettingsPanel";
import { UsenetSettingsPanel } from "../../components/UsenetSettingsPanel";
import type { AppModel } from "../../app/useAppController";
import { UpdatesSettings } from "./UpdatesSettings";
import { DataSettings } from "./DataSettings";
import { MusicBrainzCacheSettings } from "./MusicBrainzCacheSettings";
import { OriginCountrySettings } from "./OriginCountrySettings";
import { ArtistInformationSettings } from "./ArtistInformationSettings";
import { OverlaySyncSettings } from "./OverlaySyncSettings";
import { DiagnosticsSettings } from "./DiagnosticsSettings";
import { GeneralSettings } from "./GeneralSettings";

export function SettingsView({ model }: { model: AppModel }) {
  const { loadData, settingsError, settings, saveAppSettings } = model;
  return (
    <SettingsWorkspace
      reloadAction={
        <button
          className="icon-button"
          type="button"
          aria-label="Reload settings"
          onClick={() => void loadData()}
        >
          <RotateCcw size={18} />
        </button>
      }
    >
      {settingsError ? <p className="error-message">{settingsError}</p> : null}

      <section className="settings-grid" aria-label="Application settings">
        <SettingsSection id="ai">
          <AiSettingsPanel />
          <AiSettingsPanel provider="OpenRouter" />
        </SettingsSection>

        <SettingsSection id="providers">
          <DiscogsSettingsPanel />
          <LastFmSettingsPanel />
          <DeemixSettingsPanel
            downloadPath={settings.deemixDownloadPath}
            quality={settings.deemixDownloadQuality}
            fallback={settings.deemixDownloadFallback}
            organization={settings.deemixDownloadOrganization}
            onDownloadPathChange={(path) =>
              saveAppSettings({ deemixDownloadPath: path })
            }
            onQualityChange={(quality) =>
              saveAppSettings({ deemixDownloadQuality: quality })
            }
            onFallbackChange={(fallback) =>
              saveAppSettings({ deemixDownloadFallback: fallback })
            }
            onOrganizationChange={(organization) =>
              saveAppSettings({ deemixDownloadOrganization: organization })
            }
          />
          <SoulseekSettingsPanel />
          <UsenetSettingsPanel />
        </SettingsSection>

        <UpdatesSettings model={model} />

        <DataSettings model={model} />

        <SettingsSection id="musicbrainz">
          <MusicBrainzCacheSettings model={model} />

          <OriginCountrySettings model={model} />

          <ArtistInformationSettings model={model} />

          <OverlaySyncSettings model={model} />
        </SettingsSection>

        <DiagnosticsSettings model={model} />

        <GeneralSettings model={model} />
      </section>
    </SettingsWorkspace>
  );
}
