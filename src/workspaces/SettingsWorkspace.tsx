import {
  createContext,
  useContext,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  Activity,
  Database,
  Download,
  Radio,
  SlidersHorizontal,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export type SettingsSectionId =
  | "general"
  | "ai"
  | "data"
  | "musicbrainz"
  | "updates"
  | "diagnostics";

type SettingsSectionDefinition = {
  id: SettingsSectionId;
  label: string;
  description: string;
  icon: LucideIcon;
};

const settingsSections: SettingsSectionDefinition[] = [
  {
    id: "general",
    label: "General",
    description: "Appearance and workspace defaults",
    icon: SlidersHorizontal,
  },
  {
    id: "ai",
    label: "AI",
    description: "Luna access and secure credentials",
    icon: Sparkles,
  },
  {
    id: "data",
    label: "Data & Backups",
    description: "Retention, restore, and local snapshots",
    icon: Database,
  },
  {
    id: "musicbrainz",
    label: "MusicBrainz",
    description: "Cache, enrichment, and overlay sync",
    icon: Radio,
  },
  {
    id: "updates",
    label: "Updates",
    description: "Automatic checks and app releases",
    icon: Download,
  },
  {
    id: "diagnostics",
    label: "Diagnostics",
    description: "Performance proof and runtime checks",
    icon: Activity,
  },
];

const SettingsSectionContext = createContext<SettingsSectionId>("general");

export function SettingsWorkspace({
  reloadAction,
  children,
}: {
  reloadAction: ReactNode;
  children: ReactNode;
}) {
  const [activeSection, setActiveSection] =
    useState<SettingsSectionId>("general");

  const handleSectionKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) => {
    let nextIndex: number | null = null;

    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % settingsSections.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex =
        (currentIndex - 1 + settingsSections.length) % settingsSections.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = settingsSections.length - 1;
    }

    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    const nextSection = settingsSections[nextIndex];
    setActiveSection(nextSection.id);
    document.getElementById(`settings-${nextSection.id}-tab`)?.focus();
  };

  return (
    <section className="workspace settings-workspace">
      <header className="topbar">
        <div>
          <h1>Settings</h1>
          <p>Configure one area at a time without losing your place.</p>
        </div>
        {reloadAction}
      </header>

      <nav
        className="settings-section-nav"
        role="tablist"
        aria-label="Settings sections"
      >
        {settingsSections.map((section, index) => {
          const Icon = section.icon;
          const isActive = activeSection === section.id;
          return (
            <button
              id={`settings-${section.id}-tab`}
              className={isActive ? "active" : ""}
              type="button"
              role="tab"
              aria-controls={`settings-${section.id}-panel`}
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              onKeyDown={(event) => handleSectionKeyDown(event, index)}
            >
              <span aria-hidden="true">
                <Icon size={17} />
              </span>
              <span>
                <strong>{section.label}</strong>
                <small>{section.description}</small>
              </span>
            </button>
          );
        })}
      </nav>

      <SettingsSectionContext.Provider value={activeSection}>
        {children}
      </SettingsSectionContext.Provider>
    </section>
  );
}

export function SettingsSection({
  id,
  children,
}: {
  id: SettingsSectionId;
  children: ReactNode;
}) {
  const activeSection = useContext(SettingsSectionContext);
  const section =
    settingsSections.find((candidate) => candidate.id === id) ??
    settingsSections[0];
  const Icon = section.icon;

  return (
    <section
      id={`settings-${id}-panel`}
      className="settings-section"
      role="tabpanel"
      aria-labelledby={`settings-${id}-tab`}
      hidden={activeSection !== id}
    >
      <header className="settings-section-heading">
        <span aria-hidden="true">
          <Icon size={19} />
        </span>
        <div>
          <h2>{section.label}</h2>
          <p>{section.description}</p>
        </div>
      </header>
      <div className="settings-section-grid">{children}</div>
    </section>
  );
}
