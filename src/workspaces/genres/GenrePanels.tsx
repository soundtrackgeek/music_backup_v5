import {
  type GenreSummary,
  type GenreListResponse,
  type BrowseResponse,
  type ExportResult,
} from "../../types";
import { Tags, FileSearch, Album, Download } from "lucide-react";
import {
  ResizableTable,
  ResizableColumnHeader,
} from "../../components/ResizableTable";
import {
  formatNumber,
  formatPercent,
  formatAverage,
  formatHours,
  formatMinutes,
} from "../../app/display";
import { formatYearSpan } from "../artists/ArtistTables";
import { AlbumTitleContents } from "../albums/AlbumPanels";
import { ExportResultStatus } from "../../components/ExportResultStatus";

export function genreInitial(genre: GenreSummary | null) {
  return genre?.name.trim().slice(0, 1).toUpperCase() || "G";
}

export function GenreIndexTable({
  response,
  selectedGenreId,
  onSelect,
}: {
  response: GenreListResponse | null;
  selectedGenreId: string | null;
  onSelect: (genreId: string) => void;
}) {
  if (!response) {
    return (
      <div className="empty-state large">
        <Tags size={20} />
        <span>No genres loaded.</span>
      </div>
    );
  }

  if (response.rows.length === 0) {
    return (
      <div className="empty-state large">
        <FileSearch size={20} />
        <span>No genres match.</span>
      </div>
    );
  }

  return (
    <ResizableTable
      tableId="genre-index-results"
      className="result-table genre-index-results"
      columns={{
        Genre: "minmax(220px, 2fr)",
        Albums: "72px",
        Years: "88px",
        "Top artist": "minmax(144px, 1.25fr)",
        Complete: "88px",
        "Avg score": "88px",
        Loved: "72px",
      }}
      items={response.rows}
      getRowKey={(genre) => genre.id}
      renderRow={(genre) => {
        const isSelected = genre.id === selectedGenreId;
        return (
          <div
            className={`result-table-row selectable${isSelected ? " selected" : ""}`}
            role="row"
            aria-selected={isSelected}
            tabIndex={0}
            key={genre.id}
            onClick={() => onSelect(genre.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(genre.id);
              }
            }}
          >
            <span className="album-index-title" role="cell">
              <span
                className="cover-placeholder cover-mini genre-mini"
                aria-hidden="true"
              >
                <span>{genreInitial(genre)}</span>
              </span>
              <span>
                <strong>{genre.name}</strong>
                <small>{formatNumber(genre.trackCount)} tracks</small>
              </span>
            </span>
            <span role="cell">{formatNumber(genre.albumCount)}</span>
            <span role="cell">
              {formatYearSpan(genre.firstYear, genre.lastYear)}
            </span>
            <span role="cell">{genre.topArtist ?? ""}</span>
            <span role="cell">
              {formatPercent(genre.averageRatingCompleteness)}
            </span>
            <span role="cell">{formatAverage(genre.averageAlbumScore, 2)}</span>
            <span role="cell">{formatNumber(genre.lovedTracks)}</span>
          </div>
        );
      }}
    >
      <div className="result-table-head" role="row">
        <ResizableColumnHeader columnId="Genre" label="Genre" />
        <ResizableColumnHeader columnId="Albums" label="Albums" />
        <ResizableColumnHeader columnId="Years" label="Years" />
        <ResizableColumnHeader columnId="Top artist" label="Top artist" />
        <ResizableColumnHeader columnId="Complete" label="Complete" />
        <ResizableColumnHeader columnId="Avg score" label="Avg score" />
        <ResizableColumnHeader columnId="Loved" label="Loved" />
      </div>
    </ResizableTable>
  );
}

export function GenreAlbumTable({
  response,
}: {
  response: BrowseResponse | null;
}) {
  if (!response) {
    return (
      <div className="empty-state large">
        <Album size={20} />
        <span>Select a genre.</span>
      </div>
    );
  }

  if (response.rows.length === 0) {
    return (
      <div className="empty-state large">
        <FileSearch size={20} />
        <span>No albums found.</span>
      </div>
    );
  }

  return (
    <ResizableTable
      tableId="genre-album-results"
      className="result-table genre-album-results"
      columns={{
        Album: "minmax(240px, 2fr)",
        Artist: "minmax(150px, 1.25fr)",
        Year: "72px",
        Tracks: "72px",
        Complete: "88px",
        Rating: "72px",
        Score: "80px",
      }}
      items={response.rows}
      getRowKey={(row) => row.id}
      renderRow={(row) => (
        <div className="result-table-row" role="row" key={row.id}>
          <span className="album-title-cell" role="cell">
            <AlbumTitleContents row={row} />
          </span>
          <span role="cell">{row.albumArtistDisplay ?? ""}</span>
          <span role="cell">{row.year ?? ""}</span>
          <span role="cell">{formatNumber(row.totalTracks)}</span>
          <span role="cell">{formatPercent(row.ratingCompleteness)}</span>
          <span role="cell">{row.effectiveAlbumRating ?? ""}</span>
          <span role="cell">{row.albumScore?.toFixed(3) ?? ""}</span>
        </div>
      )}
    >
      <div className="result-table-head" role="row">
        <ResizableColumnHeader columnId="Album" label="Album" />
        <ResizableColumnHeader columnId="Artist" label="Artist" />
        <ResizableColumnHeader columnId="Year" label="Year" />
        <ResizableColumnHeader columnId="Tracks" label="Tracks" />
        <ResizableColumnHeader columnId="Complete" label="Complete" />
        <ResizableColumnHeader columnId="Rating" label="Rating" />
        <ResizableColumnHeader columnId="Score" label="Score" />
      </div>
    </ResizableTable>
  );
}

export function GenreDetailPanel({
  genre,
  includeCalculated,
  onIncludeCalculatedChange,
  exportResult,
  onExport,
}: {
  genre: GenreSummary | null;
  includeCalculated: boolean;
  onIncludeCalculatedChange: (value: boolean) => void;
  exportResult: ExportResult | null;
  onExport: (format: string) => Promise<void>;
}) {
  if (!genre) {
    return (
      <aside className="detail-panel genre-detail" aria-label="Genre details">
        <div className="detail-header">
          <Tags size={20} />
          <div>
            <h2>Genre Detail</h2>
            <p>Select a canonical genre from the index</p>
          </div>
        </div>
        <div className="empty-state">
          <FileSearch size={20} />
          <span>No genre selected.</span>
        </div>
      </aside>
    );
  }

  return (
    <aside className="detail-panel genre-detail" aria-label="Genre details">
      <div className="detail-header">
        <Tags size={20} />
        <div>
          <h2>{genre.name}</h2>
          <p>
            {[formatYearSpan(genre.firstYear, genre.lastYear), genre.topArtist]
              .filter(Boolean)
              .join(" / ")}
          </p>
        </div>
      </div>

      <div
        className="cover-placeholder album-cover-large genre-cover-large"
        aria-hidden="true"
      >
        <span>{genreInitial(genre)}</span>
      </div>

      <dl className="run-details genre-detail-stats">
        <div>
          <dt>Albums</dt>
          <dd>{`${formatNumber(genre.ratedAlbumCount)} / ${formatNumber(genre.albumCount)} fully rated`}</dd>
        </div>
        <div>
          <dt>Partial albums</dt>
          <dd>{formatNumber(genre.partialAlbumCount)}</dd>
        </div>
        <div>
          <dt>Unrated albums</dt>
          <dd>{formatNumber(genre.unratedAlbumCount)}</dd>
        </div>
        <div>
          <dt>Tracks</dt>
          <dd>{formatNumber(genre.trackCount)}</dd>
        </div>
        <div>
          <dt>Total time</dt>
          <dd>{formatHours(genre.totalSeconds)}</dd>
        </div>
        <div>
          <dt>Top artist</dt>
          <dd>{genre.topArtist ?? ""}</dd>
        </div>
        <div>
          <dt>Average complete</dt>
          <dd>{formatPercent(genre.averageRatingCompleteness)}</dd>
        </div>
        <div>
          <dt>Average rating</dt>
          <dd>{formatAverage(genre.averageAlbumRating, 1)}</dd>
        </div>
        <div>
          <dt>Average score</dt>
          <dd>{formatAverage(genre.averageAlbumScore, 2)}</dd>
        </div>
        <div>
          <dt>Loved tracks</dt>
          <dd>{formatNumber(genre.lovedTracks)}</dd>
        </div>
        <div>
          <dt>TMOE</dt>
          <dd>{formatMinutes(genre.tmoeSeconds)}</dd>
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
          <ExportResultStatus result={exportResult} itemLabel="album" />
        ) : null}
      </section>
    </aside>
  );
}
