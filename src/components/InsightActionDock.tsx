import { Check, FileSearch, ListMusic, Save, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { InsightCohort } from "../app/insightCohorts";

type InsightActionDockProps = {
  cohort: InsightCohort | null;
  onOpenInSearch: (cohort: InsightCohort) => void;
  onSaveView: (cohort: InsightCohort) => Promise<void>;
  onBuildPlaylist: (cohort: InsightCohort) => void;
  onClear: () => void;
};

export function InsightActionDock({
  cohort,
  onOpenInSearch,
  onSaveView,
  onBuildPlaylist,
  onClear,
}: InsightActionDockProps) {
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  useEffect(() => {
    setSaveState("idle");
  }, [cohort?.id]);

  if (!cohort) {
    return (
      <aside className="insight-action-dock empty" aria-label="Insight actions">
        <div>
          <strong>Select a cohort to take action</strong>
          <span>
            Choose a chart point, mission, year, genre, rating band, or album.
          </span>
        </div>
      </aside>
    );
  }

  async function saveView() {
    if (saveState === "saving" || !cohort) return;
    setSaveState("saving");
    try {
      await onSaveView(cohort);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  return (
    <aside className="insight-action-dock" aria-label={`Actions for ${cohort.title}`}>
      <div className="insight-action-copy">
        <span>Selected cohort</span>
        <strong>{cohort.title}</strong>
        <small>
          {cohort.count == null
            ? cohort.description
            : `${cohort.count.toLocaleString()} items · ${cohort.description}`}
        </small>
      </div>
      <div className="insight-action-buttons">
        <button
          className="primary-button"
          type="button"
          onClick={() => onOpenInSearch(cohort)}
        >
          <FileSearch size={15} />
          <span>Open in Search</span>
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={saveState === "saving" || saveState === "saved"}
          onClick={() => void saveView()}
        >
          {saveState === "saved" ? <Check size={15} /> : <Save size={15} />}
          <span>
            {saveState === "saving"
              ? "Saving"
              : saveState === "saved"
                ? "View saved"
                : saveState === "error"
                  ? "Retry save"
                  : "Save view"}
          </span>
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={() => onBuildPlaylist(cohort)}
        >
          <ListMusic size={15} />
          <span>Build playlist</span>
        </button>
        <button
          className="icon-button"
          type="button"
          aria-label="Clear selected cohort"
          onClick={onClear}
        >
          <X size={15} />
        </button>
      </div>
      <span className="insight-action-status" aria-live="polite">
        {saveState === "error" ? "Could not save this view." : ""}
      </span>
    </aside>
  );
}
