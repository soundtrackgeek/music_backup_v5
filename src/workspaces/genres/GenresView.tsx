import {
  RotateCcw,
  Database,
  Tags,
  Search,
  Album,
  Heart,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Metric } from "../../components/catalog/CatalogValues";
import { formatNumber } from "../../app/display";
import {
  SelectField,
  NumberField,
} from "../../components/catalog/SearchCriteria";
import { GenreIndexTable, GenreAlbumTable } from "./GenrePanels";
import type { AppModel } from "../../app/useAppController";
export function GenresView({
  model,
}: {
  model: Pick<
    AppModel,
    | "clearGenreQuery"
    | "loadData"
    | "setGenreRequest"
    | "statistics"
    | "genreTotal"
    | "selectedGenreAlbumCount"
    | "selectedGenre"
    | "genreRequest"
    | "isGenreLoading"
    | "genrePageStart"
    | "genrePageEnd"
    | "genreError"
    | "genreResponse"
    | "selectedGenreId"
    | "selectGenre"
    | "isGenreAlbumsLoading"
    | "genreAlbumsResponse"
    | "genreAlbumsError"
  >;
}) {
  const {
    clearGenreQuery,
    loadData,
    setGenreRequest,
    statistics,
    genreTotal,
    selectedGenreAlbumCount,
    selectedGenre,
    genreRequest,
    isGenreLoading,
    genrePageStart,
    genrePageEnd,
    genreError,
    genreResponse,
    selectedGenreId,
    selectGenre,
    isGenreAlbumsLoading,
    genreAlbumsResponse,
    genreAlbumsError,
  } = model;
  return (
    <section className="workspace genres-workspace">
      <header className="topbar">
        <div>
          <h1>Genres</h1>
          <p>
            Canonical-genre index, selected genre album lists, and genre-level
            summary stats.
          </p>
        </div>
        <div className="topbar-actions">
          <button
            className="icon-button"
            type="button"
            aria-label="Clear genre filters"
            onClick={clearGenreQuery}
          >
            <RotateCcw size={18} />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="Refresh genres"
            onClick={() => {
              void loadData();
              setGenreRequest((previous) => ({ ...previous }));
            }}
          >
            <Database size={18} />
          </button>
        </div>
      </header>

      <section className="metric-grid" aria-label="Genre summary">
        <Metric
          label="Canonical genres"
          value={formatNumber(statistics?.overview.genreCount)}
          tone="teal"
          icon={Tags}
        />
        <Metric
          label="Matches"
          value={formatNumber(genreTotal)}
          tone="amber"
          icon={Search}
        />
        <Metric
          label="Genre albums"
          value={formatNumber(selectedGenreAlbumCount)}
          icon={Album}
        />
        <Metric
          label="Loved tracks"
          value={formatNumber(selectedGenre?.lovedTracks)}
          icon={Heart}
        />
      </section>

      <section className="query-panel genre-query-panel">
        <div className="search-row genre-search-row">
          <div className="search-input">
            <Search size={18} />
            <input
              value={genreRequest.searchText}
              onChange={(event) =>
                setGenreRequest((previous) => ({
                  ...previous,
                  searchText: event.target.value,
                  offset: 0,
                }))
              }
              placeholder="Search canonical genres"
            />
          </div>
          <SelectField
            label="Sort"
            value={genreRequest.sort.field}
            onChange={(field) =>
              setGenreRequest((previous) => ({
                ...previous,
                sort: { ...previous.sort, field },
                offset: 0,
              }))
            }
            options={[
              { value: "name", label: "Genre" },
              { value: "albumCount", label: "Albums" },
              { value: "trackCount", label: "Tracks" },
              { value: "lovedTracks", label: "Loved tracks" },
              { value: "averageCompleteness", label: "Completeness" },
              { value: "averageRating", label: "Average rating" },
              { value: "averageScore", label: "Average score" },
              { value: "firstYear", label: "First year" },
              { value: "lastYear", label: "Last year" },
              { value: "topArtist", label: "Top artist" },
            ]}
          />
        </div>

        <div className="query-footer">
          <div className="chip-row inline" aria-label="Active genre filters">
            {genreRequest.searchText.trim() ? (
              <button
                className="filter-chip"
                type="button"
                onClick={() =>
                  setGenreRequest((previous) => ({
                    ...previous,
                    searchText: "",
                    offset: 0,
                  }))
                }
              >
                <span>Search "{genreRequest.searchText.trim()}"</span>
                <X size={14} />
              </button>
            ) : (
              <span className="chip-empty">No active filters</span>
            )}
          </div>

          <div className="sort-controls">
            <SelectField
              label="Direction"
              value={genreRequest.sort.direction}
              onChange={(direction) =>
                setGenreRequest((previous) => ({
                  ...previous,
                  sort: {
                    ...previous.sort,
                    direction: direction as "asc" | "desc",
                  },
                  offset: 0,
                }))
              }
              options={[
                { value: "asc", label: "Ascending" },
                { value: "desc", label: "Descending" },
              ]}
            />
            <NumberField
              label="Rows"
              value={genreRequest.limit}
              min={10}
              max={500}
              onChange={(value) =>
                setGenreRequest((previous) => ({
                  ...previous,
                  limit: value ?? 50,
                  offset: 0,
                }))
              }
            />
          </div>
        </div>
      </section>

      <section className="table-panel" aria-label="Genre index">
        <div className="panel-heading compact">
          <div>
            <h2>Genre index</h2>
            <p>
              {isGenreLoading
                ? "Loading genres"
                : `${formatNumber(genrePageStart)}-${formatNumber(genrePageEnd)} of ${formatNumber(genreTotal)}`}
            </p>
          </div>
          <div className="pager">
            <button
              className="icon-button"
              type="button"
              aria-label="Previous genre page"
              disabled={genreRequest.offset === 0}
              onClick={() =>
                setGenreRequest((previous) => ({
                  ...previous,
                  offset: Math.max(0, previous.offset - previous.limit),
                }))
              }
            >
              <ChevronLeft size={17} />
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label="Next genre page"
              disabled={genreRequest.offset + genreRequest.limit >= genreTotal}
              onClick={() =>
                setGenreRequest((previous) => ({
                  ...previous,
                  offset: previous.offset + previous.limit,
                }))
              }
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>

        {genreError ? <p className="error-message">{genreError}</p> : null}
        <GenreIndexTable
          response={genreResponse}
          selectedGenreId={selectedGenreId}
          onSelect={selectGenre}
        />
      </section>

      <section className="table-panel" aria-label="Selected genre albums">
        <div className="panel-heading compact">
          <div>
            <h2>{selectedGenre?.name ?? "Genre albums"}</h2>
            <p>
              {isGenreAlbumsLoading
                ? "Loading albums"
                : `${formatNumber(genreAlbumsResponse?.rows.length ?? 0)} of ${formatNumber(selectedGenreAlbumCount)} albums`}
            </p>
          </div>
          <span className="run-status">
            {selectedGenre?.topArtist ?? "Genre"}
          </span>
        </div>

        {genreAlbumsError ? (
          <p className="error-message">{genreAlbumsError}</p>
        ) : null}
        <GenreAlbumTable response={genreAlbumsResponse} />
      </section>
    </section>
  );
}
