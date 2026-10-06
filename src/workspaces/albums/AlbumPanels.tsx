import {
  type BrowseSort,
  type BrowseResponse,
  type CountryFlagDisplay,
  type BrowseRow,
  type LastFmAlbumPopularity,
  type ExportResult,
} from "../../types";
import {
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  FileSearch,
  Album,
  ListMusic,
  Download,
} from "lucide-react";
import {
  ResizableColumnHeader,
  ResizableTable,
} from "../../components/ResizableTable";
import {
  formatBillboardSingleRank,
  formatBillboardRank,
  formatBillboardDebutWeek,
  formatBillboardSingleDebut,
  formatVgListaRank,
  formatVgListaDebutWeek,
  formatOfficialUkRank,
  formatOfficialUkDebutWeek,
  formatTiISkuddetRank,
  formatTiISkuddetDebut,
  formatNorsktoppenRank,
  formatNorsktoppenDebut,
  formatTrackRating,
  formatPercent,
  formatMinutes,
  formatNumber,
} from "../../app/display";
import {
  normalizeArtistKey,
  normalizeGenreKey,
} from "../../backend/normalization";
import { CountryDisplay } from "../../components/catalog/CatalogValues";
import { type ReactNode, useMemo } from "react";
import { AlbumCover } from "../../components/AlbumCover";
import { TrackPopularityFire } from "../../components/TrackPopularityFire";
import { ExportResultStatus } from "../../components/ExportResultStatus";

export function SortableColumnHeader({
  label,
  field,
  sort,
  onSort,
}: {
  label: string;
  field: string;
  sort: BrowseSort;
  onSort: (field: string) => void;
}) {
  const isActive = sort.field === field;
  const Icon = isActive
    ? sort.direction === "asc"
      ? ArrowUp
      : ArrowDown
    : ArrowUpDown;
  const nextDirection =
    isActive && sort.direction === "asc" ? "descending" : "ascending";

  return (
    <ResizableColumnHeader
      columnId={field}
      label={label}
      aria-sort={
        isActive
          ? sort.direction === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      <button
        className={`table-sort-button${isActive ? " active" : ""}`}
        type="button"
        aria-label={`Sort by ${label} ${nextDirection}`}
        onClick={() => onSort(field)}
      >
        <span>{label}</span>
        <Icon size={13} strokeWidth={2.2} aria-hidden="true" />
      </button>
    </ResizableColumnHeader>
  );
}

export function ResultTable({
  response,
  sort,
  onSort,
  countryFlagDisplay,
  visibleColumns,
  onOpenAlbum,
  onOpenArtist,
  onOpenGenre,
}: {
  response: BrowseResponse | null;
  sort: BrowseSort;
  onSort: (field: string) => void;
  countryFlagDisplay: CountryFlagDisplay;
  visibleColumns: string[];
  onOpenAlbum?: (albumId: string) => void;
  onOpenArtist?: (artistId: string, artistName: string) => void;
  onOpenGenre?: (genreId: string, genreName: string) => void;
}) {
  if (!response) {
    return (
      <div className="empty-state large">
        <FileSearch size={20} />
        <span>No results loaded.</span>
      </div>
    );
  }

  if (response.rows.length === 0) {
    return (
      <div className="empty-state large">
        <FileSearch size={20} />
        <span>No matches.</span>
      </div>
    );
  }

  const visibleColumnSet = new Set(visibleColumns);
  const showQualityColumn = visibleColumnSet.has("audioQuality");
  const showBillboardColumn = visibleColumnSet.has("billboard");
  const showDebutColumn = visibleColumnSet.has("billboardDebut");
  const showBillboardSingleColumn =
    response.view === "tracks" && visibleColumnSet.has("billboardSingle");
  const showSingleDebutColumn = visibleColumnSet.has("billboardSingleDebut");
  const showVgListaColumn = visibleColumnSet.has("vgLista");
  const showVgListaDebutColumn = visibleColumnSet.has("vgListaDebut");
  const showOfficialUkColumn = visibleColumnSet.has("officialUk");
  const showOfficialUkDebutColumn = visibleColumnSet.has("officialUkDebut");
  const showTiISkuddetColumn =
    response.view === "tracks" && visibleColumnSet.has("tiISkuddet");
  const showTiISkuddetDebutColumn =
    response.view === "tracks" && visibleColumnSet.has("tiISkuddetDebut");
  const showNorsktoppenColumn =
    response.view === "tracks" && visibleColumnSet.has("norsktoppen");
  const showNorsktoppenDebutColumn =
    response.view === "tracks" && visibleColumnSet.has("norsktoppenDebut");
  const albumTableColumns = {
    album: "minmax(220px, 2fr)",
    artist: "minmax(140px, 1.35fr)",
    originCountry: "minmax(96px, 0.9fr)",
    year: "64px",
    genre: "minmax(104px, 1fr)",
    ...(showBillboardColumn ? { billboardRank: "82px" } : {}),
    ...(showDebutColumn ? { billboardDebut: "minmax(104px, 0.9fr)" } : {}),
    ...(showVgListaColumn ? { vgListaRank: "88px" } : {}),
    ...(showVgListaDebutColumn ? { vgListaDebut: "minmax(132px, 1fr)" } : {}),
    ...(showOfficialUkColumn ? { officialUkRank: "88px" } : {}),
    ...(showOfficialUkDebutColumn
      ? { officialUkDebut: "minmax(132px, 1fr)" }
      : {}),
    ...(showQualityColumn ? { bitrate: "minmax(126px, 1fr)" } : {}),
    trackCount: "64px",
    ratingCompleteness: "84px",
    albumScore: "72px",
  };
  const trackTableColumns = {
    title: "minmax(190px, 2fr)",
    album: "minmax(210px, 1.5fr)",
    displayArtist: "minmax(132px, 1.1fr)",
    originCountry: "minmax(96px, 0.8fr)",
    year: "64px",
    ...(showBillboardColumn ? { billboardRank: "96px" } : {}),
    ...(showDebutColumn ? { billboardDebut: "minmax(104px, 0.9fr)" } : {}),
    ...(showBillboardSingleColumn ? { billboardSingleRank: "96px" } : {}),
    ...(showSingleDebutColumn
      ? { billboardSingleDebut: "minmax(132px, 1fr)" }
      : {}),
    ...(showVgListaColumn ? { vgListaRank: "88px" } : {}),
    ...(showVgListaDebutColumn ? { vgListaDebut: "minmax(132px, 1fr)" } : {}),
    ...(showOfficialUkColumn ? { officialUkRank: "88px" } : {}),
    ...(showOfficialUkDebutColumn
      ? { officialUkDebut: "minmax(132px, 1fr)" }
      : {}),
    ...(showTiISkuddetColumn ? { tiISkuddetRank: "104px" } : {}),
    ...(showTiISkuddetDebutColumn
      ? { tiISkuddetDebut: "minmax(144px, 1fr)" }
      : {}),
    ...(showNorsktoppenColumn ? { norsktoppenRank: "104px" } : {}),
    ...(showNorsktoppenDebutColumn
      ? { norsktoppenDebut: "minmax(144px, 1fr)" }
      : {}),
    ...(showQualityColumn ? { bitrate: "minmax(118px, 0.9fr)" } : {}),
    trackRating: "64px",
    File: "minmax(140px, 1.1fr)",
  };
  return response.view === "tracks" ? (
    <ResizableTable
      tableId="search-tracks"
      columns={trackTableColumns}
      className={`result-table track-results${showBillboardColumn ? " with-billboard" : ""}${showDebutColumn ? " with-debut" : ""}${showBillboardSingleColumn ? " with-billboard-single" : ""}${showSingleDebutColumn ? " with-single-debut" : ""}${showVgListaColumn ? " with-vg-lista" : ""}${showVgListaDebutColumn ? " with-vg-lista-debut" : ""}${showTiISkuddetColumn ? " with-ti-i-skuddet" : ""}${showTiISkuddetDebutColumn ? " with-ti-i-skuddet-debut" : ""}${showNorsktoppenColumn ? " with-norsktoppen" : ""}${showNorsktoppenDebutColumn ? " with-norsktoppen-debut" : ""}`}
      items={response.rows}
      getRowKey={(row) => row.id}
      renderRow={(row) => {
        const singleLabel = formatBillboardSingleRank(row);
        const artistName = row.displayArtist ?? row.albumArtistDisplay ?? "";
        return (
          <div className="result-table-row" role="row" key={row.id}>
            <span role="cell">
              <strong>
                <span>{row.title ?? "Untitled"}</span>
                {singleLabel ? (
                  <span className="billboard-badge">{singleLabel}</span>
                ) : null}
              </strong>
              <small>
                {[row.discNumber, row.trackNumber]
                  .filter((value) => value != null)
                  .join(".")}
                {row.love === "L" ? "  Loved" : ""}
              </small>
            </span>
            <span className="album-title-cell" role="cell">
              {onOpenAlbum ? (
                <TableEntityButton
                  label={`Open album ${row.album ?? "Untitled"}`}
                  onClick={() => onOpenAlbum(row.albumId)}
                >
                  <AlbumTitleContents
                    row={row}
                    subtitle={
                      row.albumArtistDisplay ?? row.year?.toString() ?? null
                    }
                    showBillboardBadge={!showBillboardColumn}
                  />
                </TableEntityButton>
              ) : (
                <AlbumTitleContents
                  row={row}
                  subtitle={
                    row.albumArtistDisplay ?? row.year?.toString() ?? null
                  }
                  showBillboardBadge={!showBillboardColumn}
                />
              )}
            </span>
            <span role="cell">
              {artistName && onOpenArtist ? (
                <TableEntityButton
                  label={`Open artist ${artistName}`}
                  onClick={() =>
                    onOpenArtist(normalizeArtistKey(artistName), artistName)
                  }
                >
                  {artistName}
                </TableEntityButton>
              ) : (
                artistName
              )}
            </span>
            <span role="cell">
              <CountryDisplay value={row} mode={countryFlagDisplay} />
            </span>
            <span role="cell">{row.year ?? ""}</span>
            {showBillboardColumn ? (
              <span role="cell">{formatBillboardRank(row)}</span>
            ) : null}
            {showDebutColumn ? (
              <span role="cell">{formatBillboardDebutWeek(row)}</span>
            ) : null}
            {showBillboardSingleColumn ? (
              <span role="cell">{singleLabel}</span>
            ) : null}
            {showSingleDebutColumn ? (
              <span role="cell">{formatBillboardSingleDebut(row)}</span>
            ) : null}
            {showVgListaColumn ? (
              <span role="cell">{formatVgListaRank(row)}</span>
            ) : null}
            {showVgListaDebutColumn ? (
              <span role="cell">{formatVgListaDebutWeek(row)}</span>
            ) : null}
            {showOfficialUkColumn ? (
              <span role="cell">{formatOfficialUkRank(row)}</span>
            ) : null}
            {showOfficialUkDebutColumn ? (
              <span role="cell">{formatOfficialUkDebutWeek(row)}</span>
            ) : null}
            {showTiISkuddetColumn ? (
              <span role="cell">{formatTiISkuddetRank(row)}</span>
            ) : null}
            {showTiISkuddetDebutColumn ? (
              <span role="cell">{formatTiISkuddetDebut(row)}</span>
            ) : null}
            {showNorsktoppenColumn ? (
              <span role="cell">{formatNorsktoppenRank(row)}</span>
            ) : null}
            {showNorsktoppenDebutColumn ? (
              <span role="cell">{formatNorsktoppenDebut(row)}</span>
            ) : null}
            {showQualityColumn ? (
              <span role="cell">{formatAudioQuality(row)}</span>
            ) : null}
            <span role="cell">{formatTrackRating(row.normalizedRating)}</span>
            <span role="cell" title={row.filePath ?? ""}>
              {row.filename ?? ""}
            </span>
          </div>
        );
      }}
    >
      <div className="result-table-head" role="row">
        <SortableColumnHeader
          label="Track"
          field="title"
          sort={sort}
          onSort={onSort}
        />
        <SortableColumnHeader
          label="Album"
          field="album"
          sort={sort}
          onSort={onSort}
        />
        <SortableColumnHeader
          label="Artist"
          field="displayArtist"
          sort={sort}
          onSort={onSort}
        />
        <SortableColumnHeader
          label="Origin"
          field="originCountry"
          sort={sort}
          onSort={onSort}
        />
        <SortableColumnHeader
          label="Year"
          field="year"
          sort={sort}
          onSort={onSort}
        />
        {showBillboardColumn ? (
          <SortableColumnHeader
            label="Album Billboard"
            field="billboardRank"
            sort={sort}
            onSort={onSort}
          />
        ) : null}
        {showDebutColumn ? (
          <SortableColumnHeader
            label="Album Billboard debut"
            field="billboardDebut"
            sort={sort}
            onSort={onSort}
          />
        ) : null}
        {showBillboardSingleColumn ? (
          <SortableColumnHeader
            label="Billboard single"
            field="billboardSingleRank"
            sort={sort}
            onSort={onSort}
          />
        ) : null}
        {showSingleDebutColumn ? (
          <SortableColumnHeader
            label="Billboard single debut"
            field="billboardSingleDebut"
            sort={sort}
            onSort={onSort}
          />
        ) : null}
        {showVgListaColumn ? (
          <SortableColumnHeader
            label="VG Lista"
            field="vgListaRank"
            sort={sort}
            onSort={onSort}
          />
        ) : null}
        {showVgListaDebutColumn ? (
          <SortableColumnHeader
            label="VG Lista debut week"
            field="vgListaDebut"
            sort={sort}
            onSort={onSort}
          />
        ) : null}
        {showOfficialUkColumn ? (
          <SortableColumnHeader
            label="Official UK"
            field="officialUkRank"
            sort={sort}
            onSort={onSort}
          />
        ) : null}
        {showOfficialUkDebutColumn ? (
          <SortableColumnHeader
            label="Official UK debut week"
            field="officialUkDebut"
            sort={sort}
            onSort={onSort}
          />
        ) : null}
        {showTiISkuddetColumn ? (
          <SortableColumnHeader
            label="Ti i Skuddet"
            field="tiISkuddetRank"
            sort={sort}
            onSort={onSort}
          />
        ) : null}
        {showTiISkuddetDebutColumn ? (
          <SortableColumnHeader
            label="Ti i Skuddet debut"
            field="tiISkuddetDebut"
            sort={sort}
            onSort={onSort}
          />
        ) : null}
        {showNorsktoppenColumn ? (
          <SortableColumnHeader
            label="Norsktoppen"
            field="norsktoppenRank"
            sort={sort}
            onSort={onSort}
          />
        ) : null}
        {showNorsktoppenDebutColumn ? (
          <SortableColumnHeader
            label="Norsktoppen debut"
            field="norsktoppenDebut"
            sort={sort}
            onSort={onSort}
          />
        ) : null}
        {showQualityColumn ? (
          <SortableColumnHeader
            label="Quality"
            field="bitrate"
            sort={sort}
            onSort={onSort}
          />
        ) : null}
        <SortableColumnHeader
          label="Rating"
          field="trackRating"
          sort={sort}
          onSort={onSort}
        />
        <ResizableColumnHeader columnId="File" label="File" />
      </div>
    </ResizableTable>
  ) : (
    <ResizableTable
      tableId="search-albums"
      columns={albumTableColumns}
      className={`result-table album-results${showBillboardColumn ? " with-billboard" : ""}${showDebutColumn ? " with-debut" : ""}${showVgListaColumn ? " with-vg-lista" : ""}${showVgListaDebutColumn ? " with-vg-lista-debut" : ""}`}
      items={response.rows}
      getRowKey={(row) => row.id}
      renderRow={(row) => {
        const artistName = row.albumArtistDisplay;
        const genreName = row.canonicalGenre;
        return (
          <div className="result-table-row" role="row" key={row.id}>
            <span className="album-title-cell" role="cell">
              {onOpenAlbum ? (
                <TableEntityButton
                  label={`Open album ${row.album ?? "Untitled"}`}
                  onClick={() => onOpenAlbum(row.albumId)}
                >
                  <AlbumTitleContents
                    row={row}
                    showBillboardBadge={!showBillboardColumn}
                  />
                </TableEntityButton>
              ) : (
                <AlbumTitleContents
                  row={row}
                  showBillboardBadge={!showBillboardColumn}
                />
              )}
            </span>
            <span role="cell">
              {artistName && onOpenArtist ? (
                <TableEntityButton
                  label={`Open artist ${artistName}`}
                  onClick={() =>
                    onOpenArtist(normalizeArtistKey(artistName), artistName)
                  }
                >
                  {artistName}
                </TableEntityButton>
              ) : (
                (artistName ?? "")
              )}
            </span>
            <span role="cell">
              <CountryDisplay value={row} mode={countryFlagDisplay} />
            </span>
            <span role="cell">{row.year ?? ""}</span>
            <span role="cell">
              {genreName && onOpenGenre ? (
                <TableEntityButton
                  label={`Open genre ${genreName}`}
                  onClick={() =>
                    onOpenGenre(normalizeGenreKey(genreName), genreName)
                  }
                >
                  {genreName}
                </TableEntityButton>
              ) : (
                (genreName ?? "")
              )}
            </span>
            {showBillboardColumn ? (
              <span role="cell">{formatBillboardRank(row)}</span>
            ) : null}
            {showDebutColumn ? (
              <span role="cell">{formatBillboardDebutWeek(row)}</span>
            ) : null}
            {showVgListaColumn ? (
              <span role="cell">{formatVgListaRank(row)}</span>
            ) : null}
            {showVgListaDebutColumn ? (
              <span role="cell">{formatVgListaDebutWeek(row)}</span>
            ) : null}
            {showOfficialUkColumn ? (
              <span role="cell">{formatOfficialUkRank(row)}</span>
            ) : null}
            {showOfficialUkDebutColumn ? (
              <span role="cell">{formatOfficialUkDebutWeek(row)}</span>
            ) : null}
            {showQualityColumn ? (
              <span role="cell">{formatAudioQuality(row, true)}</span>
            ) : null}
            <span role="cell">{row.totalTracks ?? ""}</span>
            <span role="cell">{formatPercent(row.ratingCompleteness)}</span>
            <span role="cell">{row.albumScore?.toFixed(3) ?? ""}</span>
          </div>
        );
      }}
    >
      <div className="result-table-head" role="row">
        <SortableColumnHeader
          label="Album"
          field="album"
          sort={sort}
          onSort={onSort}
        />
        <SortableColumnHeader
          label="Artist"
          field="artist"
          sort={sort}
          onSort={onSort}
        />
        <SortableColumnHeader
          label="Origin"
          field="originCountry"
          sort={sort}
          onSort={onSort}
        />
        <SortableColumnHeader
          label="Year"
          field="year"
          sort={sort}
          onSort={onSort}
        />
        <SortableColumnHeader
          label="Genre"
          field="genre"
          sort={sort}
          onSort={onSort}
        />
        {showBillboardColumn ? (
          <SortableColumnHeader
            label="Billboard"
            field="billboardRank"
            sort={sort}
            onSort={onSort}
          />
        ) : null}
        {showDebutColumn ? (
          <SortableColumnHeader
            label="Debut week"
            field="billboardDebut"
            sort={sort}
            onSort={onSort}
          />
        ) : null}
        {showVgListaColumn ? (
          <SortableColumnHeader
            label="VG Lista"
            field="vgListaRank"
            sort={sort}
            onSort={onSort}
          />
        ) : null}
        {showVgListaDebutColumn ? (
          <SortableColumnHeader
            label="VG Lista debut week"
            field="vgListaDebut"
            sort={sort}
            onSort={onSort}
          />
        ) : null}
        {showOfficialUkColumn ? (
          <SortableColumnHeader
            label="Official UK"
            field="officialUkRank"
            sort={sort}
            onSort={onSort}
          />
        ) : null}
        {showOfficialUkDebutColumn ? (
          <SortableColumnHeader
            label="Official UK debut week"
            field="officialUkDebut"
            sort={sort}
            onSort={onSort}
          />
        ) : null}
        {showQualityColumn ? (
          <SortableColumnHeader
            label="Quality"
            field="bitrate"
            sort={sort}
            onSort={onSort}
          />
        ) : null}
        <SortableColumnHeader
          label="Tracks"
          field="trackCount"
          sort={sort}
          onSort={onSort}
        />
        <SortableColumnHeader
          label="Complete"
          field="ratingCompleteness"
          sort={sort}
          onSort={onSort}
        />
        <SortableColumnHeader
          label="Score"
          field="albumScore"
          sort={sort}
          onSort={onSort}
        />
      </div>
    </ResizableTable>
  );
}

export function TableEntityButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="table-entity-button"
      type="button"
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function AlbumTitleContents({
  row,
  subtitle = formatMinutes(row.totalSeconds),
  showBillboardBadge = true,
}: {
  row: BrowseRow;
  subtitle?: string | null;
  showBillboardBadge?: boolean;
}) {
  const billboardLabel = formatBillboardRank(row);
  return (
    <>
      <AlbumCover row={row} className="cover-mini" previewOnHover />
      <span>
        <strong>
          <span>{row.album ?? "Untitled"}</span>
          {showBillboardBadge && billboardLabel ? (
            <span className="billboard-badge">{billboardLabel}</span>
          ) : null}
        </strong>
        {subtitle ? <small>{subtitle}</small> : null}
      </span>
    </>
  );
}

export function formatTrackPosition(row: BrowseRow) {
  const disc = row.discNumber?.toString() ?? "";
  const track = row.trackNumber?.toString() ?? "";
  if (disc && track) return `${disc}.${track}`;
  return disc || track;
}

export function formatAudioQuality(row: BrowseRow, album = false) {
  if (album) {
    if (row.minBitrateKbps == null) return "Not synced";
    const bitrate =
      row.maxBitrateKbps != null && row.maxBitrateKbps !== row.minBitrateKbps
        ? `${row.minBitrateKbps}–${row.maxBitrateKbps} kbps`
        : `${row.minBitrateKbps} kbps`;
    return `${bitrate}${row.fileFormat ? ` · ${row.fileFormat}` : ""}`;
  }
  if (row.bitrateKbps == null) return "Not synced";
  return `${row.bitrateKbps} kbps${row.fileFormat ? ` · ${row.fileFormat}` : ""}`;
}

export function AlbumIndexTable({
  response,
  selectedAlbumId,
  onSelect,
  sort,
  onSort,
  countryFlagDisplay,
}: {
  response: BrowseResponse | null;
  selectedAlbumId: string | null;
  onSelect: (albumId: string) => void;
  sort: BrowseSort;
  onSort: (field: string) => void;
  countryFlagDisplay: CountryFlagDisplay;
}) {
  if (!response) {
    return (
      <div className="empty-state large">
        <Album size={20} />
        <span>No albums loaded.</span>
      </div>
    );
  }

  if (response.rows.length === 0) {
    return (
      <div className="empty-state large">
        <FileSearch size={20} />
        <span>No albums match.</span>
      </div>
    );
  }

  return (
    <ResizableTable
      tableId="album-index-results"
      className="result-table album-index-results"
      columns={{
        album: "minmax(240px, 2.2fr)",
        artist: "minmax(150px, 1.3fr)",
        originCountry: "minmax(96px, 0.85fr)",
        year: "64px",
        genre: "minmax(104px, 1fr)",
        trackCount: "64px",
        bitrate: "minmax(126px, 1fr)",
        ratingCompleteness: "84px",
        albumScore: "72px",
      }}
      items={response.rows}
      getRowKey={(row) => row.id}
      renderRow={(row) => {
        const isSelected = row.albumId === selectedAlbumId;
        return (
          <div
            className={`result-table-row selectable${isSelected ? " selected" : ""}`}
            role="row"
            aria-selected={isSelected}
            tabIndex={0}
            key={row.id}
            onClick={() => onSelect(row.albumId)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(row.albumId);
              }
            }}
          >
            <span className="album-title-cell" role="cell">
              <AlbumTitleContents row={row} />
            </span>
            <span role="cell">{row.albumArtistDisplay ?? ""}</span>
            <span role="cell">
              <CountryDisplay value={row} mode={countryFlagDisplay} />
            </span>
            <span role="cell">{row.year ?? ""}</span>
            <span role="cell">{row.canonicalGenre ?? ""}</span>
            <span role="cell">{row.totalTracks ?? ""}</span>
            <span role="cell" title={formatAudioQuality(row, true)}>
              {formatAudioQuality(row, true)}
            </span>
            <span role="cell">{formatPercent(row.ratingCompleteness)}</span>
            <span role="cell">{row.albumScore?.toFixed(3) ?? ""}</span>
          </div>
        );
      }}
    >
      <div className="result-table-head" role="row">
        <SortableColumnHeader
          label="Album"
          field="album"
          sort={sort}
          onSort={onSort}
        />
        <SortableColumnHeader
          label="Artist"
          field="artist"
          sort={sort}
          onSort={onSort}
        />
        <SortableColumnHeader
          label="Origin"
          field="originCountry"
          sort={sort}
          onSort={onSort}
        />
        <SortableColumnHeader
          label="Year"
          field="year"
          sort={sort}
          onSort={onSort}
        />
        <SortableColumnHeader
          label="Genre"
          field="genre"
          sort={sort}
          onSort={onSort}
        />
        <SortableColumnHeader
          label="Tracks"
          field="trackCount"
          sort={sort}
          onSort={onSort}
        />
        <SortableColumnHeader
          label="Quality"
          field="bitrate"
          sort={sort}
          onSort={onSort}
        />
        <SortableColumnHeader
          label="Complete"
          field="ratingCompleteness"
          sort={sort}
          onSort={onSort}
        />
        <SortableColumnHeader
          label="Score"
          field="albumScore"
          sort={sort}
          onSort={onSort}
        />
      </div>
    </ResizableTable>
  );
}

export function AlbumTrackTable({
  response,
  isLoading,
  popularity,
}: {
  response: BrowseResponse | null;
  isLoading: boolean;
  popularity: LastFmAlbumPopularity | null;
}) {
  const popularityByTrackId = useMemo(
    () =>
      new Map(popularity?.tracks.map((track) => [track.trackId, track]) ?? []),
    [popularity],
  );

  if (!response) {
    return (
      <div className="empty-state large">
        <ListMusic size={20} />
        <span>{isLoading ? "Loading track list." : "Select an album."}</span>
      </div>
    );
  }

  if (response.rows.length === 0) {
    return (
      <div className="empty-state large">
        <FileSearch size={20} />
        <span>No tracks found.</span>
      </div>
    );
  }

  return (
    <ResizableTable
      tableId="album-track-results"
      className="result-table album-track-results"
      columns={{
        "#": "58px",
        Track: "minmax(220px, 2fr)",
        Artist: "minmax(150px, 1.25fr)",
        Time: "72px",
        Rating: "72px",
        Quality: "minmax(118px, 0.9fr)",
        File: "minmax(170px, 1.2fr)",
      }}
      items={response.rows}
      getRowKey={(row) => row.id}
      renderRow={(row) => {
        const trackPopularity =
          row.trackId == null ? null : popularityByTrackId.get(row.trackId);
        return (
          <div className="result-table-row" role="row" key={row.id}>
            <span role="cell">{formatTrackPosition(row)}</span>
            <span role="cell">
              <strong className="track-title-with-popularity">
                <TrackPopularityFire
                  rank={trackPopularity?.albumRank ?? null}
                />
                <span>{row.title ?? "Untitled"}</span>
              </strong>
              <small>
                {row.love === "L" ? "Loved" : (row.canonicalGenre ?? "")}
              </small>
            </span>
            <span role="cell">
              {row.displayArtist ?? row.albumArtistDisplay ?? ""}
            </span>
            <span role="cell">{formatMinutes(row.trackSeconds)}</span>
            <span role="cell">{formatTrackRating(row.normalizedRating)}</span>
            <span role="cell">{formatAudioQuality(row)}</span>
            <span role="cell" title={row.filePath ?? ""}>
              {row.filename ?? ""}
            </span>
          </div>
        );
      }}
    >
      <div className="result-table-head" role="row">
        <ResizableColumnHeader columnId="#" label="#" />
        <ResizableColumnHeader columnId="Track" label="Track" />
        <ResizableColumnHeader columnId="Artist" label="Artist" />
        <ResizableColumnHeader columnId="Time" label="Time" />
        <ResizableColumnHeader columnId="Rating" label="Rating" />
        <ResizableColumnHeader columnId="Quality" label="Quality" />
        <ResizableColumnHeader columnId="File" label="File" />
      </div>
    </ResizableTable>
  );
}

export function AlbumDetailPanel({
  album,
  tracks,
  isLoading,
  includeCalculated,
  onIncludeCalculatedChange,
  exportResult,
  onExport,
  countryFlagDisplay,
}: {
  album: BrowseRow | null;
  tracks: BrowseResponse | null;
  isLoading: boolean;
  includeCalculated: boolean;
  onIncludeCalculatedChange: (value: boolean) => void;
  exportResult: ExportResult | null;
  onExport: (format: string) => Promise<void>;
  countryFlagDisplay: CountryFlagDisplay;
}) {
  if (!album) {
    return (
      <aside className="detail-panel album-detail" aria-label="Album details">
        <div className="detail-header">
          <Album size={20} />
          <div>
            <h2>Album Detail</h2>
            <p>Select an album from the index</p>
          </div>
        </div>
        <div className="empty-state">
          <FileSearch size={20} />
          <span>No album selected.</span>
        </div>
      </aside>
    );
  }

  return (
    <aside className="detail-panel album-detail" aria-label="Album details">
      <div className="detail-header">
        <Album size={20} />
        <div>
          <h2>{album.album ?? "Untitled"}</h2>
          <p>
            {[album.albumArtistDisplay, album.year, album.canonicalGenre]
              .filter(Boolean)
              .join(" / ")}
          </p>
        </div>
      </div>

      <AlbumCover
        row={album}
        className="album-cover-large"
        decorative={false}
      />

      <dl className="run-details album-detail-stats">
        <div>
          <dt>Tracks</dt>
          <dd>
            {album.ratedTracks != null
              ? formatNumber(album.ratedTracks)
              : formatNumber(album.totalTracks)}
            {album.ratedTracks != null
              ? ` / ${formatNumber(album.totalTracks)} rated`
              : ""}
            {isLoading ? " / loading" : ""}
          </dd>
        </div>
        <div>
          <dt>Total time</dt>
          <dd>{formatMinutes(album.totalSeconds)}</dd>
        </div>
        <div>
          <dt>Rating completeness</dt>
          <dd>{formatPercent(album.ratingCompleteness)}</dd>
        </div>
        <div>
          <dt>Album rating</dt>
          <dd>{album.effectiveAlbumRating ?? ""}</dd>
        </div>
        <div>
          <dt>TMOE</dt>
          <dd>{formatMinutes(album.tmoeSeconds)}</dd>
        </div>
        <div>
          <dt>AE</dt>
          <dd>{formatPercent(album.aeRatio, 2)}</dd>
        </div>
        <div>
          <dt>Loved tracks</dt>
          <dd>{formatNumber(album.lovedTracks)}</dd>
        </div>
        <div>
          <dt>Album Score</dt>
          <dd>{album.albumScore?.toFixed(3) ?? ""}</dd>
        </div>
        <div>
          <dt>Billboard</dt>
          <dd>{formatBillboardRank(album)}</dd>
        </div>
        <div>
          <dt>Billboard debut</dt>
          <dd>{formatBillboardDebutWeek(album)}</dd>
        </div>
        <div>
          <dt>Origin Country</dt>
          <dd>
            <CountryDisplay
              value={album}
              mode={countryFlagDisplay}
              fallback="Not imported"
            />
          </dd>
        </div>
        <div>
          <dt>Publisher</dt>
          <dd>{album.publisher ?? ""}</dd>
        </div>
        <div>
          <dt>Release year</dt>
          <dd>{album.releaseYear ?? ""}</dd>
        </div>
      </dl>

      <section className="export-box">
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={includeCalculated}
            onChange={(event) =>
              onIncludeCalculatedChange(event.target.checked)
            }
          />
          <span>Calculated columns</span>
        </label>
        <div className="export-grid">
          {["csv", "tsv", "xlsx", "json", "txt"].map((format) => (
            <button
              type="button"
              key={format}
              onClick={() => void onExport(format)}
            >
              <Download size={16} />
              <span>{format.toUpperCase()}</span>
            </button>
          ))}
        </div>
        {exportResult ? (
          <ExportResultStatus result={exportResult} itemLabel="track" />
        ) : null}
      </section>
    </aside>
  );
}
