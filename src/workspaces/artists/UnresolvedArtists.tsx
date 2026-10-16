import type { Dispatch, SetStateAction } from "react";
import type { ArtistListRequest, ArtistListResponse } from "../../types";
import { NumberField, SelectField } from "../../components/catalog/SearchCriteria";
import { artistInfoFields, missingArtistInfo } from "../../app/artistInfo";
import { formatYearSpan } from "./ArtistTables";
import { MusicBrainzArtistLink } from "./ArtistAutoResolve";

export function UnresolvedArtistFilters({ request, onChange }: {
  request: ArtistListRequest;
  onChange: Dispatch<SetStateAction<ArtistListRequest>>;
}) {
  const update = (patch: Partial<ArtistListRequest>) => onChange((previous) => ({ ...previous, ...patch, offset: 0 }));
  return (
    <section className="unresolved-artist-filters" aria-label="Unresolved artist filters">
      <div className="unresolved-artist-filter-grid">
        <SelectField label="Missing information" value={request.missingInfo}
          onChange={(missingInfo) => update({ missingInfo, onlyMissingField: false })}
          options={[{ value: "", label: "Any missing information" }, ...artistInfoFields]} />
        <SelectField label="Artist order" value={request.sort.field === "addedAt" ? "recent" : request.sort.direction}
          onChange={(value) => update({ sort: value === "recent" ? { field: "addedAt", direction: "desc" } : { field: "name", direction: value === "desc" ? "desc" : "asc" } })}
          options={[{ value: "asc", label: "A–Z" }, { value: "desc", label: "Z–A" }, { value: "recent", label: "Recently added" }]} />
        <NumberField label="Year from" value={request.yearFrom} min={1} max={9999} onChange={(yearFrom) => update({ yearFrom })} />
        <NumberField label="Year to" value={request.yearTo} min={1} max={9999} onChange={(yearTo) => update({ yearTo })} />
      </div>
      <label className="toggle-row">
        <input type="checkbox" checked={request.onlyMissingField} disabled={!request.missingInfo}
          onChange={(event) => update({ onlyMissingField: event.target.checked })} />
        <span>Only this field missing</span>
      </label>
      <p>Year matches an album’s Year field, including both endpoints. Optional gender and end area are not required. Active groups and living people do not need an end date.</p>
      {request.yearFrom != null && request.yearTo != null && request.yearFrom > request.yearTo
        ? <p className="error-message" role="alert">Year from must not be later than Year to.</p> : null}
    </section>
  );
}

export function UnresolvedArtistTable({ response, selectedArtistId, onSelect }: {
  response: ArtistListResponse | null;
  selectedArtistId: string | null;
  onSelect: (id: string) => void;
}) {
  if (!response) return <div className="empty-state">No artists loaded.</div>;
  if (!response.rows.length) return <div className="empty-state">No unresolved artists match these filters.</div>;
  return (
    <div className="unresolved-artists-table-wrap">
      <table className="unresolved-artists-table">
        <thead><tr><th>Artist</th><th>Missing information</th><th>Years</th><th title="When this artist profile was first recorded">Added</th></tr></thead>
        <tbody>{response.rows.map((artist) => (
          <tr key={artist.id} className={artist.id === selectedArtistId ? "selected" : undefined}>
            <td><button type="button" aria-label={`Complete info for ${artist.name}${artist.disambiguation ? ` (${artist.disambiguation})` : ""}`} onClick={() => onSelect(artist.id)}>
              <strong>{artist.name}</strong>
              {artist.disambiguation ? <span>{artist.disambiguation}</span> : null}
              <small>{artist.albumCount} {artist.albumCount === 1 ? "album" : "albums"}</small>
            </button>{artist.musicBrainzMbid ? <MusicBrainzArtistLink mbid={artist.musicBrainzMbid} /> : null}</td>
            <td><div className="artist-missing-fields">{missingArtistInfo(artist).map((field) => <span key={field.value}>{field.label}</span>)}</div></td>
            <td>{formatYearSpan(artist.firstYear, artist.lastYear) || "Unknown"}</td>
            <td>{artist.addedAt?.slice(0, 10) || "Unknown"}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
