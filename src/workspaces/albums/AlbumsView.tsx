import {
  RotateCcw,
  Database,
  Album,
  Search,
  ListMusic,
  Gauge,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Metric } from "../../components/catalog/CatalogValues";
import { formatNumber, formatPercent } from "../../app/display";
import {
  SelectField,
  TextCriterion,
  GenreListCriterion,
  NumberField,
  CompletenessRangeCriterion,
} from "../../components/catalog/SearchCriteria";
import { toCompletenessFilterRange } from "../../app/requests";
import { AlbumIndexTable, AlbumTrackTable } from "./AlbumPanels";
import { TransitionRegion } from "../../components/TransitionRegion";
import { AlbumReviewPanel } from "../../components/AlbumReviewPanel";
import { AlbumRelatedAlbumsPanel } from "../../components/AlbumRelatedAlbumsPanel";
import { TrackPopularityAttribution } from "../../components/TrackPopularityFire";
import type { AppModel } from "../../app/useAppController";
export function AlbumsView({
  model,
}: {
  model: Pick<
    AppModel,
    | "clearAlbumQuery"
    | "setCatalogRefreshKey"
    | "loadData"
    | "status"
    | "albumTotal"
    | "selectedAlbumTrackCount"
    | "selectedAlbum"
    | "albumRequest"
    | "setAlbumRequest"
    | "albumFilters"
    | "updateAlbumFilter"
    | "genreSuggestionOptions"
    | "requestGenreSuggestionRefresh"
    | "updateAlbumFilters"
    | "albumChips"
    | "isAlbumLoading"
    | "albumPageStart"
    | "albumPageEnd"
    | "albumError"
    | "albumResponse"
    | "selectedAlbumId"
    | "sortAlbumsBy"
    | "selectAlbum"
    | "settings"
    | "albumReview"
    | "isAlbumReviewLoading"
    | "albumReviewError"
    | "refreshAlbumReview"
    | "openAlbumReviewSource"
    | "relatedAlbums"
    | "isRelatedAlbumsLoading"
    | "relatedAlbumsError"
    | "refreshRelatedAlbums"
    | "openTimelineAlbum"
    | "openLastFmSource"
    | "isAlbumTracksLoading"
    | "albumTracksResponse"
    | "albumTracksError"
    | "albumPopularity"
    | "isAlbumPopularityLoading"
    | "albumPopularityError"
  >;
}) {
  const {
    clearAlbumQuery,
    setCatalogRefreshKey,
    loadData,
    status,
    albumTotal,
    selectedAlbumTrackCount,
    selectedAlbum,
    albumRequest,
    setAlbumRequest,
    albumFilters,
    updateAlbumFilter,
    genreSuggestionOptions,
    requestGenreSuggestionRefresh,
    updateAlbumFilters,
    albumChips,
    isAlbumLoading,
    albumPageStart,
    albumPageEnd,
    albumError,
    albumResponse,
    selectedAlbumId,
    sortAlbumsBy,
    selectAlbum,
    settings,
    albumReview,
    isAlbumReviewLoading,
    albumReviewError,
    refreshAlbumReview,
    openAlbumReviewSource,
    relatedAlbums,
    isRelatedAlbumsLoading,
    relatedAlbumsError,
    refreshRelatedAlbums,
    openTimelineAlbum,
    openLastFmSource,
    isAlbumTracksLoading,
    albumTracksResponse,
    albumTracksError,
    albumPopularity,
    isAlbumPopularityLoading,
    albumPopularityError,
  } = model;
  return (
    <section className="workspace albums-workspace">
      <header className="topbar">
        <div>
          <h1>Albums</h1>
          <p>
            Dedicated album index, attributed reviews, drill-down calculations,
            ordered tracks, and album export.
          </p>
        </div>
        <div className="topbar-actions">
          <button
            className="icon-button"
            type="button"
            aria-label="Clear album filters"
            onClick={clearAlbumQuery}
          >
            <RotateCcw size={18} />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="Refresh albums"
            onClick={() => {
              setCatalogRefreshKey((current) => current + 1);
              void loadData();
            }}
          >
            <Database size={18} />
          </button>
        </div>
      </header>

      <section className="metric-grid" aria-label="Album summary">
        <Metric
          label="Library albums"
          value={formatNumber(status?.albumCount)}
          tone="teal"
          icon={Album}
        />
        <Metric
          label="Matches"
          value={formatNumber(albumTotal)}
          tone="amber"
          icon={Search}
        />
        <Metric
          label="Tracks"
          value={formatNumber(selectedAlbumTrackCount)}
          icon={ListMusic}
        />
        <Metric
          label="Complete"
          value={
            selectedAlbum
              ? formatPercent(selectedAlbum.ratingCompleteness)
              : "Select"
          }
          icon={Gauge}
        />
      </section>

      <section className="query-panel album-query-panel">
        <div className="search-row album-search-row">
          <div className="search-input">
            <Search size={18} />
            <input
              value={albumRequest.searchText}
              onChange={(event) =>
                setAlbumRequest((previous) => ({
                  ...previous,
                  searchText: event.target.value,
                  offset: 0,
                }))
              }
              placeholder="Search albums, artists, genres, publishers"
            />
          </div>
          <SelectField
            label="Sort"
            value={albumRequest.sort.field}
            onChange={(field) =>
              setAlbumRequest((previous) => ({
                ...previous,
                sort: { ...previous.sort, field },
                offset: 0,
              }))
            }
            options={[
              { value: "album", label: "Album" },
              { value: "artist", label: "Artist" },
              { value: "year", label: "Year" },
              { value: "genre", label: "Genre" },
              { value: "totalMinutes", label: "Minutes" },
              { value: "trackCount", label: "Tracks" },
              { value: "bitrate", label: "Lowest bitrate" },
              { value: "albumRating", label: "Rating" },
              { value: "ratingCompleteness", label: "Completeness" },
              { value: "lovedTracks", label: "Loved" },
              { value: "albumScore", label: "Score" },
            ]}
          />
        </div>

        <div className="filter-grid">
          <TextCriterion
            label="Album title"
            filter={albumFilters.albumTitle}
            onChange={(filter) => updateAlbumFilter("albumTitle", filter)}
          />
          <TextCriterion
            label="Album artist"
            filter={albumFilters.albumArtist}
            onChange={(filter) => updateAlbumFilter("albumArtist", filter)}
          />
          <TextCriterion
            label="Publisher"
            filter={albumFilters.publisher}
            onChange={(filter) => updateAlbumFilter("publisher", filter)}
          />
          <GenreListCriterion
            label="Genres"
            values={albumFilters.genres}
            onChange={(genres) => updateAlbumFilter("genres", genres)}
            genreOptions={genreSuggestionOptions}
            onRequestOptions={requestGenreSuggestionRefresh}
            placeholder="Synthpop, AOR"
          />
          <GenreListCriterion
            label="Exclude genres"
            values={albumFilters.excludedGenres}
            onChange={(excludedGenres) =>
              updateAlbumFilter("excludedGenres", excludedGenres)
            }
            genreOptions={genreSuggestionOptions}
            onRequestOptions={requestGenreSuggestionRefresh}
          />
          <NumberField
            label="Year from"
            value={albumFilters.yearFrom}
            onChange={(value) => updateAlbumFilter("yearFrom", value)}
          />
          <NumberField
            label="Year to"
            value={albumFilters.yearTo}
            onChange={(value) => updateAlbumFilter("yearTo", value)}
          />
          <NumberField
            label="Billboard min"
            value={albumFilters.billboardRankMin}
            min={1}
            onChange={(value) => updateAlbumFilter("billboardRankMin", value)}
          />
          <NumberField
            label="Billboard max"
            value={albumFilters.billboardRankMax}
            min={1}
            onChange={(value) => updateAlbumFilter("billboardRankMax", value)}
          />
          <NumberField
            label="Minutes min"
            value={albumFilters.totalMinutesMin}
            step={0.5}
            onChange={(value) => updateAlbumFilter("totalMinutesMin", value)}
          />
          <NumberField
            label="Minutes max"
            value={albumFilters.totalMinutesMax}
            step={0.5}
            onChange={(value) => updateAlbumFilter("totalMinutesMax", value)}
          />
          <NumberField
            label="Bitrate min"
            value={albumFilters.bitrateKbpsMin}
            min={0}
            onChange={(value) => updateAlbumFilter("bitrateKbpsMin", value)}
          />
          <NumberField
            label="Bitrate max"
            value={albumFilters.bitrateKbpsMax}
            min={0}
            onChange={(value) => updateAlbumFilter("bitrateKbpsMax", value)}
          />
          <label className="criterion audio-quality-toggle">
            <span>Audio quality</span>
            <span className="criterion-checkbox-row">
              <input
                type="checkbox"
                checked={albumFilters.mixedAudioQuality}
                onChange={(event) =>
                  updateAlbumFilter("mixedAudioQuality", event.target.checked)
                }
              />
              Mixed bitrates only
            </span>
          </label>
          <NumberField
            label="Tracks min"
            value={albumFilters.trackCountMin}
            onChange={(value) => updateAlbumFilter("trackCountMin", value)}
          />
          <NumberField
            label="Album rating min"
            value={albumFilters.albumRatingMin}
            min={0}
            max={100}
            onChange={(value) => updateAlbumFilter("albumRatingMin", value)}
          />
          <CompletenessRangeCriterion
            minValue={albumFilters.ratingCompletenessMin}
            maxValue={albumFilters.ratingCompletenessMax}
            onChange={(range) =>
              updateAlbumFilters(
                toCompletenessFilterRange(range.min, range.max),
              )
            }
          />
        </div>

        <div className="query-footer">
          <div className="chip-row inline" aria-label="Active album filters">
            {albumChips.length === 0 ? (
              <span className="chip-empty">No active filters</span>
            ) : (
              albumChips.map((chip) => (
                <button
                  className="filter-chip"
                  type="button"
                  key={chip.key}
                  onClick={chip.remove}
                >
                  <span>{chip.label}</span>
                  <X size={14} />
                </button>
              ))
            )}
          </div>

          <div className="sort-controls">
            <SelectField
              label="Direction"
              value={albumRequest.sort.direction}
              onChange={(direction) =>
                setAlbumRequest((previous) => ({
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
              value={albumRequest.limit}
              min={10}
              max={500}
              onChange={(value) =>
                setAlbumRequest((previous) => ({
                  ...previous,
                  limit: value ?? 25,
                  offset: 0,
                }))
              }
            />
          </div>
        </div>
      </section>

      <section className="table-panel" aria-label="Album index">
        <div className="panel-heading compact">
          <div>
            <h2>Album index</h2>
            <p>
              {isAlbumLoading
                ? "Loading albums"
                : `${formatNumber(albumPageStart)}-${formatNumber(albumPageEnd)} of ${formatNumber(albumTotal)}`}
            </p>
          </div>
          <div className="pager">
            <button
              className="icon-button"
              type="button"
              aria-label="Previous album page"
              disabled={albumRequest.offset === 0}
              onClick={() =>
                setAlbumRequest((previous) => ({
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
              aria-label="Next album page"
              disabled={albumRequest.offset + albumRequest.limit >= albumTotal}
              onClick={() =>
                setAlbumRequest((previous) => ({
                  ...previous,
                  offset: previous.offset + previous.limit,
                }))
              }
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>

        {albumError ? <p className="error-message">{albumError}</p> : null}
        <AlbumIndexTable
          response={albumResponse}
          selectedAlbumId={selectedAlbumId}
          sort={albumRequest.sort}
          onSort={sortAlbumsBy}
          onSelect={selectAlbum}
          countryFlagDisplay={settings.countryFlagDisplay}
        />
      </section>

      <TransitionRegion>
        <AlbumReviewPanel
          review={albumReview}
          isLoading={isAlbumReviewLoading}
          error={albumReviewError}
          onRefresh={() => void refreshAlbumReview()}
          onOpenSource={(url) => void openAlbumReviewSource(url)}
        />
      </TransitionRegion>

      <TransitionRegion>
        <AlbumRelatedAlbumsPanel
          related={relatedAlbums}
          isLoading={isRelatedAlbumsLoading}
          error={relatedAlbumsError}
          onRefresh={() => void refreshRelatedAlbums()}
          onOpenAlbum={openTimelineAlbum}
          onOpenSource={(url) => void openLastFmSource(url)}
        />
      </TransitionRegion>

      <TransitionRegion>
        <section className="table-panel" aria-label="Selected album tracks">
          <div className="panel-heading compact">
            <div>
              <h2>{selectedAlbum?.album ?? "Track list"}</h2>
              <p>
                {isAlbumTracksLoading
                  ? "Loading tracks"
                  : `${formatNumber(albumTracksResponse?.rows.length ?? 0)} of ${formatNumber(selectedAlbumTrackCount)} tracks`}
              </p>
            </div>
            <span className="run-status">{selectedAlbum?.year ?? "Album"}</span>
          </div>

          {albumTracksError ? (
            <p className="error-message">{albumTracksError}</p>
          ) : null}
          <AlbumTrackTable
            response={albumTracksResponse}
            isLoading={isAlbumTracksLoading}
            popularity={albumPopularity}
          />
          <TransitionRegion>
            <TrackPopularityAttribution
              popularity={albumPopularity}
              isLoading={isAlbumPopularityLoading}
              error={albumPopularityError}
              onOpenSource={(url) => void openLastFmSource(url)}
            />
          </TransitionRegion>
        </section>
      </TransitionRegion>
    </section>
  );
}
