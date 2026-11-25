import type { BrowseFilters } from "../../types";
import { DateField, NumberField } from "./SearchCriteria";

function wholeNumber(value: number | null, min = 0) {
  return value == null ? null : Math.min(2_147_483_647, Math.max(min, Math.trunc(value)));
}

export function ListeningHistoryFields({ filters, onChange }: {
  filters: BrowseFilters;
  onChange: (values: Partial<BrowseFilters>) => void;
}) {
  return (
    <fieldset className="listening-history-filters">
      <legend>Listening history</legend>
      <div className="filter-grid">
        <NumberField label="Minimum plays" value={filters.playCountMin} min={0} onChange={playCountMin => onChange({ playCountMin: wholeNumber(playCountMin) })} />
        <NumberField label="Maximum plays" value={filters.playCountMax} min={0} onChange={playCountMax => onChange({ playCountMax: wholeNumber(playCountMax) })} />
        <DateField label="Last played from" value={filters.lastPlayedFrom} onChange={lastPlayedFrom => onChange({ lastPlayedFrom })} />
        <DateField label="Last played through" value={filters.lastPlayedTo} onChange={lastPlayedTo => onChange({ lastPlayedTo })} />
        <NumberField label="No plays in the last N days" value={filters.notPlayedWithinDays} min={1} onChange={notPlayedWithinDays => onChange({ notPlayedWithinDays: wholeNumber(notPlayedWithinDays, 1) })} />
      </div>
      <p>Counts use matched local listening history. Set maximum plays to 0 for items with no recorded plays.</p>
    </fieldset>
  );
}
