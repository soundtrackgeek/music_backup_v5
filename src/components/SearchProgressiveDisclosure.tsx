import { useState, type ReactNode } from "react";
import { ChevronDown, SlidersHorizontal, Sparkles } from "lucide-react";

type LunaCommandMode = "search" | "results";

export function SearchLunaCommandArea({
  searchCommand,
  resultsCommand,
}: {
  searchCommand: ReactNode;
  resultsCommand: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<LunaCommandMode>("search");

  return (
    <section className="search-luna-command-area" aria-label="Luna commands">
      <header className="search-disclosure-header">
        <div className="search-disclosure-heading">
          <span className="search-disclosure-icon" aria-hidden="true">
            <Sparkles size={18} />
          </span>
          <span>
            <strong>Luna commands</strong>
            <small>Build a search or ask about the current results.</small>
          </span>
        </div>
        <button
          className="search-disclosure-toggle"
          type="button"
          aria-controls="search-luna-command-content"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((previous) => !previous)}
        >
          <span>{isOpen ? "Close" : "Open"}</span>
          <ChevronDown size={17} aria-hidden="true" />
        </button>
      </header>

      <div
        id="search-luna-command-content"
        className="search-luna-command-content"
        hidden={!isOpen}
      >
        <div
          className="segmented-control search-luna-mode-control"
          role="tablist"
          aria-label="Luna command"
        >
          <button
            id="search-luna-search-tab"
            className={mode === "search" ? "active" : ""}
            type="button"
            role="tab"
            aria-controls="search-luna-search-panel"
            aria-selected={mode === "search"}
            onClick={() => setMode("search")}
          >
            Find and filter
          </button>
          <button
            id="search-luna-results-tab"
            className={mode === "results" ? "active" : ""}
            type="button"
            role="tab"
            aria-controls="search-luna-results-panel"
            aria-selected={mode === "results"}
            onClick={() => setMode("results")}
          >
            Ask these results
          </button>
        </div>

        <div
          id="search-luna-search-panel"
          className="search-luna-command-panel"
          role="tabpanel"
          aria-labelledby="search-luna-search-tab"
          hidden={mode !== "search"}
        >
          {searchCommand}
        </div>
        <div
          id="search-luna-results-panel"
          className="search-luna-command-panel"
          role="tabpanel"
          aria-labelledby="search-luna-results-tab"
          hidden={mode !== "results"}
        >
          {resultsCommand}
        </div>
      </div>
    </section>
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
    <details className="search-advanced-filters">
      <summary>
        <span className="search-disclosure-heading">
          <span className="search-disclosure-icon" aria-hidden="true">
            <SlidersHorizontal size={18} />
          </span>
          <span>
            <strong>Advanced filters</strong>
            <small>
              Lifecycle, MusicBrainz, metadata, file, and scoring controls.
            </small>
          </span>
        </span>
        <span className="search-advanced-summary-meta">
          <span>{activeFilterCount > 0 ? `${activeFilterCount} active` : "Optional"}</span>
          <ChevronDown size={17} aria-hidden="true" />
        </span>
      </summary>
      <div className="search-advanced-content">{children}</div>
    </details>
  );
}
