import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, SlidersHorizontal, Sparkles } from "lucide-react";

type LunaCommandMode = "build" | "results";
export type LunaCommandLaunch = {
  id: number;
  mode: LunaCommandMode;
};

function LunaCommandArea({
  idPrefix,
  label,
  description,
  buildLabel,
  resultsLabel,
  buildCommand,
  resultsCommand,
  launch,
}: {
  idPrefix: string;
  label: string;
  description: string;
  buildLabel: string;
  resultsLabel: string;
  buildCommand: ReactNode;
  resultsCommand: ReactNode;
  launch?: LunaCommandLaunch | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<LunaCommandMode>("build");
  const contentId = `${idPrefix}-luna-command-content`;
  const buildTabId = `${idPrefix}-luna-build-tab`;
  const buildPanelId = `${idPrefix}-luna-build-panel`;
  const resultsTabId = `${idPrefix}-luna-results-tab`;
  const resultsPanelId = `${idPrefix}-luna-results-panel`;

  useEffect(() => {
    if (!launch) return;
    setMode(launch.mode);
    setIsOpen(true);
  }, [launch?.id]);

  return (
    <section className="search-luna-command-area" aria-label={label}>
      <header className="search-disclosure-header">
        <div className="search-disclosure-heading">
          <span className="search-disclosure-icon" aria-hidden="true">
            <Sparkles size={18} />
          </span>
          <span>
            <strong>Luna commands</strong>
            <small>{description}</small>
          </span>
        </div>
        <button
          className="search-disclosure-toggle"
          type="button"
          aria-controls={contentId}
          aria-expanded={isOpen}
          onClick={() => setIsOpen((previous) => !previous)}
        >
          <span>{isOpen ? "Close" : "Open"}</span>
          <ChevronDown size={17} aria-hidden="true" />
        </button>
      </header>

      <div
        id={contentId}
        className="search-luna-command-content"
        hidden={!isOpen}
      >
        <div
          className="segmented-control search-luna-mode-control"
          role="tablist"
          aria-label="Luna command"
        >
          <button
            id={buildTabId}
            className={mode === "build" ? "active" : ""}
            type="button"
            role="tab"
            aria-controls={buildPanelId}
            aria-selected={mode === "build"}
            onClick={() => setMode("build")}
          >
            {buildLabel}
          </button>
          <button
            id={resultsTabId}
            className={mode === "results" ? "active" : ""}
            type="button"
            role="tab"
            aria-controls={resultsPanelId}
            aria-selected={mode === "results"}
            onClick={() => setMode("results")}
          >
            {resultsLabel}
          </button>
        </div>

        <div
          id={buildPanelId}
          className="search-luna-command-panel"
          role="tabpanel"
          aria-labelledby={buildTabId}
          hidden={mode !== "build"}
        >
          {buildCommand}
        </div>
        <div
          id={resultsPanelId}
          className="search-luna-command-panel"
          role="tabpanel"
          aria-labelledby={resultsTabId}
          hidden={mode !== "results"}
        >
          {resultsCommand}
        </div>
      </div>
    </section>
  );
}

export function SearchLunaCommandArea({
  searchCommand,
  resultsCommand,
  launch,
}: {
  searchCommand: ReactNode;
  resultsCommand: ReactNode;
  launch?: LunaCommandLaunch | null;
}) {
  return (
    <LunaCommandArea
      idPrefix="search"
      label="Luna commands"
      description="Build a search or ask about the current results."
      buildLabel="Find and filter"
      resultsLabel="Ask these results"
      buildCommand={searchCommand}
      resultsCommand={resultsCommand}
      launch={launch}
    />
  );
}

export function ChartLunaCommandArea({
  chartCommand,
  resultsCommand,
  launch,
}: {
  chartCommand: ReactNode;
  resultsCommand: ReactNode;
  launch?: LunaCommandLaunch | null;
}) {
  return (
    <LunaCommandArea
      idPrefix="chart"
      label="Chart Luna commands"
      description="Build a chart or ask about the current ranking."
      buildLabel="Build a chart"
      resultsLabel="Ask this chart"
      buildCommand={chartCommand}
      resultsCommand={resultsCommand}
      launch={launch}
    />
  );
}

function AdvancedDisclosure({
  className,
  title,
  description,
  activeCount,
  children,
}: {
  className?: string;
  title: string;
  description: string;
  activeCount: number;
  children: ReactNode;
}) {
  return (
    <details
      className={["search-advanced-filters", className]
        .filter(Boolean)
        .join(" ")}
    >
      <summary>
        <span className="search-disclosure-heading">
          <span className="search-disclosure-icon" aria-hidden="true">
            <SlidersHorizontal size={18} />
          </span>
          <span>
            <strong>{title}</strong>
            <small>{description}</small>
          </span>
        </span>
        <span className="search-advanced-summary-meta">
          <span>{activeCount > 0 ? `${activeCount} active` : "Optional"}</span>
          <ChevronDown size={17} aria-hidden="true" />
        </span>
      </summary>
      <div className="search-advanced-content">{children}</div>
    </details>
  );
}

export function SearchAdvancedFilters({
  activeFilterCount,
  children,
}: {
  activeFilterCount: number;
  children: ReactNode;
}) {
  return (
    <AdvancedDisclosure
      title="Advanced filters"
      description="Lifecycle, MusicBrainz, metadata, file, and scoring controls."
      activeCount={activeFilterCount}
    >
      {children}
    </AdvancedDisclosure>
  );
}

export function ChartAdvancedControls({
  activeControlCount,
  children,
}: {
  activeControlCount: number;
  children: ReactNode;
}) {
  return (
    <AdvancedDisclosure
      className="chart-advanced-controls"
      title="Advanced chart controls"
      description="Presets, lifecycle, scoring, columns, and export settings."
      activeCount={activeControlCount}
    >
      {children}
    </AdvancedDisclosure>
  );
}
