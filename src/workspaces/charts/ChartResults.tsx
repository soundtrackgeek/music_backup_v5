import {
  type BrowseResponse,
  type ChartConfig,
  type BrowseSort,
  type CountryFlagDisplay,
  type BrowseRow
} from "../../types";
import {
  BarChart3,
  FileSearch
} from "lucide-react";
import {
  AlbumCover
} from "../../components/AlbumCover";
import {
  formatBillboardSingleRank,
  formatBillboardRank,
  formatOriginCountry,
  formatBillboardSingleDebut,
  formatBillboardDebutWeek,
  rankingLabel,
  formatChartMetric,
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
  compareBrowseRows
} from "../../app/display";
import {
  CountryDisplay
} from "../../components/catalog/CatalogValues";
import {
  normalizeChartGridCoverSize
} from "../../app/requests";
import {
  type CSSProperties,
  type ReactNode
} from "react";
import {
  TableEntityButton,
  AlbumTitleContents,
  SortableColumnHeader
} from "../albums/AlbumPanels";
import {
  normalizeArtistKey,
  normalizeGenreKey
} from "../../backend/normalization";
import {
  ResizableTable,
  ResizableColumnHeader
} from "../../components/ResizableTable";

export function ChartResults({
  response,
  config,
  displaySort,
  onSort,
  countryFlagDisplay,
  onOpenAlbum,
  onOpenArtist,
  onOpenGenre,
}: {
  response: BrowseResponse | null;
  config: ChartConfig;
  displaySort: BrowseSort | null;
  onSort: (field: string) => void;
  countryFlagDisplay: CountryFlagDisplay;
  onOpenAlbum: (albumId: string) => void;
  onOpenArtist: (artistId: string, artistName: string) => void;
  onOpenGenre: (genreId: string, genreName: string) => void;
}) {
  if (!response) {
    return (
      <div className="empty-state large">
        <BarChart3 size={20} />
        <span>No chart loaded.</span>
      </div>
    );
  }

  if (response.rows.length === 0) {
    return (
      <div className="empty-state large">
        <FileSearch size={20} />
        <span>No ranked {response.view === "tracks" ? "tracks" : "albums"}.</span>
      </div>
    );
  }

  const isTracks = response.view === "tracks";

  if (config.viewMode === "compact") {
    return (
      <div className="chart-list" role="list">
        {response.rows.map((row, index) => (
          <article className="chart-list-row" role="listitem" key={row.id}>
            <strong className="rank-number">{index + 1}</strong>
            <AlbumCover row={row} className="cover-list" previewOnHover />
            <div>
              <h3>
                <span>{isTracks ? row.title ?? "Untitled" : row.album ?? "Untitled"}</span>
                {(isTracks
                  ? formatBillboardSingleRank(row)
                  : formatBillboardRank(row)) ? (
                  <span className="billboard-badge">
                    {isTracks
                      ? formatBillboardSingleRank(row)
                      : formatBillboardRank(row)}
                  </span>
                ) : null}
              </h3>
              <p className="chart-list-meta">
                {(isTracks ? row.displayArtist : row.albumArtistDisplay) ? (
                  <span>
                    {isTracks ? row.displayArtist : row.albumArtistDisplay}
                  </span>
                ) : null}
                {formatOriginCountry(row) ? (
                  <CountryDisplay value={row} mode={countryFlagDisplay} />
                ) : null}
                {row.year ? <span>{row.year}</span> : null}
                {(isTracks
                  ? formatBillboardSingleDebut(row)
                  : formatBillboardDebutWeek(row)) ? (
                  <span>
                    {isTracks
                      ? formatBillboardSingleDebut(row)
                      : formatBillboardDebutWeek(row)}
                  </span>
                ) : null}
                {row.canonicalGenre ? <span>{row.canonicalGenre}</span> : null}
              </p>
            </div>
            <div className="rank-metric">
              <span>{rankingLabel(config.rankingMetric)}</span>
              <strong>{formatChartMetric(row, config.rankingMetric)}</strong>
            </div>
          </article>
        ))}
      </div>
    );
  }

  if (config.viewMode === "grid") {
    const coverSize = normalizeChartGridCoverSize(config.gridCoverSize);
    const gridStyle = {
      "--chart-grid-cover-size": `${coverSize}px`,
    } as CSSProperties & Record<"--chart-grid-cover-size", string>;

    return (
      <div className="chart-grid" role="list" style={gridStyle}>
        {response.rows.map((row, index) => {
          const albumTitle = isTracks
            ? row.title ?? "Untitled"
            : row.album ?? "Untitled";
          const billboardLabel = isTracks
            ? formatBillboardSingleRank(row)
            : formatBillboardRank(row);

          return (
            <article className="chart-grid-item" role="listitem" key={row.id}>
              <AlbumCover
                row={row}
                className="chart-grid-cover"
                previewOnHover
              />
              <div className="chart-grid-meta">
                <strong className="chart-grid-rank">#{index + 1}</strong>
                <h3 className="chart-grid-title" title={albumTitle}>
                  {albumTitle}
                </h3>
                <p
                  className="chart-grid-artist"
                  title={(isTracks ? row.displayArtist : row.albumArtistDisplay) ?? ""}
                >
                  {(isTracks ? row.displayArtist : row.albumArtistDisplay) ?? ""}
                </p>
                {billboardLabel ? (
                  <span className="billboard-badge chart-grid-billboard">
                    {billboardLabel}
                  </span>
                ) : null}
                {(isTracks
                  ? formatBillboardSingleDebut(row)
                  : formatBillboardDebutWeek(row)) ? (
                  <span className="chart-grid-debut">
                    {isTracks
                      ? formatBillboardSingleDebut(row)
                      : formatBillboardDebutWeek(row)}
                  </span>
                ) : null}
                <span className="chart-grid-score">
                  {formatChartMetric(row, config.rankingMetric)}
                </span>
              </div>
            </article>
          );
        })}
      </div>
    );
  }

  const visibleColumns = new Set(config.visibleColumns);
  const columns: {
    key: string;
    label: string;
    sortField?: string;
    className?: string;
    value: (row: BrowseRow, index: number) => ReactNode;
  }[] = [
    {
      key: "rank",
      label: "#",
      value: (_row: BrowseRow, rank: number) => `${rank}`,
    },
    {
      key: "track",
      label: "Track",
      sortField: "title",
      className: "album-title-cell",
      value: (row: BrowseRow) => (
        <span>
          <strong>{row.title ?? "Untitled"}</strong>
          <small>{row.album ?? ""}</small>
        </span>
      ),
    },
    {
      key: "album",
      label: "Album",
      sortField: "album",
      className: "album-title-cell",
      value: (row: BrowseRow) => (
        <TableEntityButton
          label={`Open album ${row.album ?? "Untitled"}`}
          onClick={() => onOpenAlbum(row.albumId)}
        >
          <AlbumTitleContents row={row} showBillboardBadge={false} />
        </TableEntityButton>
      ),
    },
    {
      key: "artist",
      label: "Artist",
      sortField: isTracks ? "displayArtist" : "artist",
      value: (row: BrowseRow) => {
        const artistName =
          (isTracks ? row.displayArtist : row.albumArtistDisplay) ?? "";
        return artistName ? (
          <TableEntityButton
            label={`Open artist ${artistName}`}
            onClick={() =>
              onOpenArtist(normalizeArtistKey(artistName), artistName)
            }
          >
            {artistName}
          </TableEntityButton>
        ) : (
          ""
        );
      },
    },
    {
      key: "year",
      label: "Year",
      sortField: "year",
      value: (row: BrowseRow) => row.year?.toString() ?? "",
    },
    {
      key: "genre",
      label: "Genre",
      sortField: "genre",
      value: (row: BrowseRow) => {
        const genreName = row.canonicalGenre;
        return genreName ? (
          <TableEntityButton
            label={`Open genre ${genreName}`}
            onClick={() =>
              onOpenGenre(normalizeGenreKey(genreName), genreName)
            }
          >
            {genreName}
          </TableEntityButton>
        ) : (
          ""
        );
      },
    },
    {
      key: "originCountry",
      label: "Origin",
      sortField: "originCountry",
      value: (row: BrowseRow) => (
        <CountryDisplay value={row} mode={countryFlagDisplay} />
      ),
    },
    {
      key: "billboard",
      label: "Billboard",
      sortField: "billboardRank",
      value: (row: BrowseRow) => formatBillboardRank(row),
    },
    {
      key: "billboardDebut",
      label: "Debut week",
      sortField: "billboardDebut",
      value: (row: BrowseRow) => formatBillboardDebutWeek(row),
    },
    {
      key: "billboardSingle",
      label: "Billboard single",
      sortField: "billboardSingleRank",
      value: (row: BrowseRow) => formatBillboardSingleRank(row),
    },
    {
      key: "billboardSingleDebut",
      label: "Billboard single debut",
      sortField: "billboardSingleDebut",
      value: (row: BrowseRow) => formatBillboardSingleDebut(row),
    },
    {
      key: "vgLista",
      label: "VG Lista",
      sortField: "vgListaRank",
      value: (row: BrowseRow) => formatVgListaRank(row),
    },
    {
      key: "vgListaDebut",
      label: "VG Lista debut week",
      sortField: "vgListaDebut",
      value: (row: BrowseRow) => formatVgListaDebutWeek(row),
    },
    {
      key: "officialUk",
      label: "Official UK",
      sortField: "officialUkRank",
      value: (row: BrowseRow) => formatOfficialUkRank(row),
    },
    {
      key: "officialUkDebut",
      label: "Official UK debut week",
      sortField: "officialUkDebut",
      value: (row: BrowseRow) => formatOfficialUkDebutWeek(row),
    },
    {
      key: "tiISkuddet",
      label: "Ti i Skuddet",
      sortField: "tiISkuddetRank",
      value: (row: BrowseRow) => formatTiISkuddetRank(row),
    },
    {
      key: "tiISkuddetDebut",
      label: "Ti i Skuddet debut week",
      sortField: "tiISkuddetDebut",
      value: (row: BrowseRow) => formatTiISkuddetDebut(row),
    },
    {
      key: "norsktoppen",
      label: "Norsktoppen",
      sortField: "norsktoppenRank",
      value: (row: BrowseRow) => formatNorsktoppenRank(row),
    },
    {
      key: "norsktoppenDebut",
      label: "Norsktoppen debut week",
      sortField: "norsktoppenDebut",
      value: (row: BrowseRow) => formatNorsktoppenDebut(row),
    },
    {
      key: "rating",
      label: "Rating",
      sortField: "albumRating",
      value: (row: BrowseRow) => row.effectiveAlbumRating?.toString() ?? "",
    },
    {
      key: "trackRating",
      label: "Track rating",
      sortField: "trackRating",
      value: (row: BrowseRow) => formatTrackRating(row.normalizedRating),
    },
    {
      key: "complete",
      label: "Complete",
      sortField: "ratingCompleteness",
      value: (row: BrowseRow) => formatPercent(row.ratingCompleteness),
    },
    {
      key: "score",
      label: "Score",
      sortField: "albumScore",
      value: (row: BrowseRow) => row.albumScore?.toFixed(3) ?? "",
    },
    {
      key: "loved",
      label: "Loved",
      sortField: "lovedTracks",
      value: (row: BrowseRow) => row.lovedTracks?.toString() ?? "0",
    },
    {
      key: "ae",
      label: "AE",
      sortField: "ae",
      value: (row: BrowseRow) => formatPercent(row.aeRatio, 2),
    },
    {
      key: "tmoe",
      label: "TMOE",
      sortField: "tmoe",
      value: (row: BrowseRow) => formatMinutes(row.tmoeSeconds),
    },
    {
      key: "minutes",
      label: "Minutes",
      sortField: "totalMinutes",
      value: (row: BrowseRow) => formatMinutes(row.totalSeconds),
    },
  ].filter((column) => {
    const requiredColumns = isTracks
      ? ["rank", "track", "artist", "year"]
      : ["rank", "album", "artist", "year", "genre"];
    if (requiredColumns.includes(column.key)) return true;
    if (
      isTracks &&
      [
        "album",
        "billboard",
        "billboardDebut",
        "rating",
        "complete",
        "score",
        "loved",
        "ae",
        "tmoe",
        "minutes",
      ].includes(column.key)
    ) {
      return false;
    }
    if (
      !isTracks &&
      [
        "track",
        "billboardSingle",
        "billboardSingleDebut",
        "tiISkuddet",
        "tiISkuddetDebut",
        "norsktoppen",
        "norsktoppenDebut",
        "trackRating",
      ].includes(
        column.key,
      )
    ) {
      return false;
    }
    return visibleColumns.has(column.key);
  });
  const activeSort: BrowseSort = displaySort ?? {
    field: config.rankingMetric,
    direction: config.sortDirection,
  };
  const displayRows = response.rows.map((row, index) => ({
    row,
    rank: index + 1,
  }));
  if (displaySort) {
    displayRows.sort((left, right) => {
      const comparison = compareBrowseRows(
        left.row,
        right.row,
        displaySort.field,
      );
      return displaySort.direction === "desc" ? -comparison : comparison;
    });
  }

  return (
    <ResizableTable
      tableId={isTracks ? "chart-tracks" : "chart-albums"}
      className="result-table chart-results"
      unbounded
      columns={Object.fromEntries(columns.map((column) => [
        column.sortField ?? column.key,
        column.key === "rank" ? "48px"
          : ["album", "track"].includes(column.key) ? "minmax(220px, 2fr)"
          : column.key === "artist" ? "minmax(140px, 1.35fr)"
          : column.key === "year" ? "64px"
          : column.key === "genre" ? "minmax(104px, 1fr)"
          : "minmax(88px, 0.8fr)",
      ]))}
      items={displayRows}
      getRowKey={({ row, rank }) => row.id}
      renderRow={({ row, rank }) => (
        <div className="result-table-row" role="row" key={row.id}>
          {columns.map((column) => (
            <span className={column.className} role="cell" key={column.key}>
              {column.value(row, rank)}
            </span>
          ))}
        </div>
      )}
    >
      <div className="result-table-head" role="row">
        {columns.map((column) =>
          column.sortField ? (
            <SortableColumnHeader
              label={column.label}
              field={column.sortField}
              sort={activeSort}
              onSort={onSort}
              key={column.key}
            />
          ) : (
            <ResizableColumnHeader columnId={column.key} label={column.label} key={column.key} />
          ),
        )}
      </div>

    </ResizableTable>
  );
}
