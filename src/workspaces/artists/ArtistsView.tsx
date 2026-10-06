import { ArtistsWorkspace, ArtistDetailTabs } from "../ArtistsWorkspace";
import {
  RotateCcw,
  Database,
  UsersRound,
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
import { ArtistIndexTable, ArtistAlbumTable } from "./ArtistTables";
import { ArtistPortrait } from "../../components/ArtistPortrait";
import {
  ArtistPopularTracksPanel,
  ArtistSimilarArtistsPanel,
  ArtistBiographyPanel,
  ArtistLovedTracksPanel,
  ArtistChartBustersPanel,
} from "./ArtistLazyPanels";
import {
  MusicBrainzArtistInfoPanel,
  MusicBrainzArtistDiscographyPanel,
} from "./MusicBrainzPanels";
import { ArtistAlbumCoverBoard } from "./ArtistDetails";
import type { AppModel } from "../../app/useAppController";
export function ArtistsView({
  model,
}: {
  model: Pick<
    AppModel,
    | "clearArtistQuery"
    | "loadData"
    | "setArtistRequest"
    | "statistics"
    | "artistTotal"
    | "selectedArtistAlbumCount"
    | "selectedArtist"
    | "artistRequest"
    | "isArtistLoading"
    | "artistPageStart"
    | "artistPageEnd"
    | "artistError"
    | "artistResponse"
    | "selectedArtistId"
    | "selectArtist"
    | "settings"
    | "artistDetailTab"
    | "setArtistDetailTab"
    | "artistPopularity"
    | "isArtistPopularityLoading"
    | "artistPopularityError"
    | "refreshArtistPopularity"
    | "openLastFmSource"
    | "artistSimilarity"
    | "isArtistSimilarityLoading"
    | "artistSimilarityError"
    | "refreshArtistSimilarity"
    | "expandArtistConstellation"
    | "openArtistFromMusicMap"
    | "artistBiography"
    | "isArtistBiographyLoading"
    | "artistBiographyError"
    | "refreshArtistBiography"
    | "openArtistBiographySource"
    | "artistTrackHighlights"
    | "isArtistTrackHighlightsLoading"
    | "artistTrackHighlightsError"
    | "isPreparingArtistCharts"
    | "isArtistAlbumsLoading"
    | "artistAlbumsResponse"
    | "artistAlbumsError"
    | "selectedArtistAlbumId"
    | "selectArtistAlbum"
    | "musicBrainzArtistDiscography"
    | "isMusicBrainzArtistLoading"
    | "isMusicBrainzArtistUpdating"
    | "musicBrainzArtistError"
    | "updateArtistMusicBrainzInfo"
    | "openMusicBrainzArtistPage"
    | "setArtistMusicBrainzLink"
    | "saveArtistOriginCountry"
    | "musicBrainzArtistRefreshResult"
    | "musicBrainzArtistOriginResult"
    | "originCountryOptions"
    | "refreshArtistMusicBrainz"
    | "setArtistMusicBrainzReleaseDecision"
    | "runArtistMusicBrainzExport"
    | "musicBrainzArtistExportResult"
    | "isArtistAlbumTracksLoading"
    | "artistAlbumTracksResponse"
    | "selectedArtistAlbumTrackCount"
    | "selectedArtistAlbum"
    | "artistAlbumTracksError"
    | "artistAlbumPopularity"
    | "artistAlbumPopularityError"
    | "isArtistAlbumPopularityLoading"
    | "clearSelectedArtistAlbum"
  >;
}) {
  const {
    clearArtistQuery,
    loadData,
    setArtistRequest,
    statistics,
    artistTotal,
    selectedArtistAlbumCount,
    selectedArtist,
    artistRequest,
    isArtistLoading,
    artistPageStart,
    artistPageEnd,
    artistError,
    artistResponse,
    selectedArtistId,
    selectArtist,
    settings,
    artistDetailTab,
    setArtistDetailTab,
    artistPopularity,
    isArtistPopularityLoading,
    artistPopularityError,
    refreshArtistPopularity,
    openLastFmSource,
    artistSimilarity,
    isArtistSimilarityLoading,
    artistSimilarityError,
    refreshArtistSimilarity,
    expandArtistConstellation,
    openArtistFromMusicMap,
    artistBiography,
    isArtistBiographyLoading,
    artistBiographyError,
    refreshArtistBiography,
    openArtistBiographySource,
    artistTrackHighlights,
    isArtistTrackHighlightsLoading,
    artistTrackHighlightsError,
    isPreparingArtistCharts,
    isArtistAlbumsLoading,
    artistAlbumsResponse,
    artistAlbumsError,
    selectedArtistAlbumId,
    selectArtistAlbum,
    musicBrainzArtistDiscography,
    isMusicBrainzArtistLoading,
    isMusicBrainzArtistUpdating,
    musicBrainzArtistError,
    updateArtistMusicBrainzInfo,
    openMusicBrainzArtistPage,
    setArtistMusicBrainzLink,
    saveArtistOriginCountry,
    musicBrainzArtistRefreshResult,
    musicBrainzArtistOriginResult,
    originCountryOptions,
    refreshArtistMusicBrainz,
    setArtistMusicBrainzReleaseDecision,
    runArtistMusicBrainzExport,
    musicBrainzArtistExportResult,
    isArtistAlbumTracksLoading,
    artistAlbumTracksResponse,
    selectedArtistAlbumTrackCount,
    selectedArtistAlbum,
    artistAlbumTracksError,
    artistAlbumPopularity,
    artistAlbumPopularityError,
    isArtistAlbumPopularityLoading,
    clearSelectedArtistAlbum,
  } = model;
  return (
    <ArtistsWorkspace
      actions={
        <>
          <button
            className="icon-button"
            type="button"
            aria-label="Clear artist filters"
            onClick={clearArtistQuery}
          >
            <RotateCcw size={18} />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="Refresh artists"
            onClick={() => {
              void loadData();
              setArtistRequest((previous) => ({ ...previous }));
            }}
          >
            <Database size={18} />
          </button>
        </>
      }
    >
      <section className="metric-grid" aria-label="Artist summary">
        <Metric
          label="Album artists"
          value={formatNumber(statistics?.overview.albumArtistCount)}
          tone="teal"
          icon={UsersRound}
        />
        <Metric
          label="Matches"
          value={formatNumber(artistTotal)}
          tone="amber"
          icon={Search}
        />
        <Metric
          label="Artist albums"
          value={formatNumber(selectedArtistAlbumCount)}
          icon={Album}
        />
        <Metric
          label="Loved tracks"
          value={formatNumber(selectedArtist?.lovedTracks)}
          icon={Heart}
        />
      </section>

      <section className="query-panel artist-query-panel">
        <div className="search-row artist-search-row">
          <div className="search-input">
            <Search size={18} />
            <input
              value={artistRequest.searchText}
              onChange={(event) =>
                setArtistRequest((previous) => ({
                  ...previous,
                  searchText: event.target.value,
                  offset: 0,
                }))
              }
              placeholder="Search album artists"
            />
          </div>
          <SelectField
            label="Sort"
            value={artistRequest.sort.field}
            onChange={(field) =>
              setArtistRequest((previous) => ({
                ...previous,
                sort: { ...previous.sort, field },
                offset: 0,
              }))
            }
            options={[
              { value: "name", label: "Artist" },
              { value: "albumCount", label: "Albums" },
              { value: "trackCount", label: "Tracks" },
              { value: "lovedTracks", label: "Loved tracks" },
              { value: "averageCompleteness", label: "Completeness" },
              { value: "averageRating", label: "Average rating" },
              { value: "averageScore", label: "Average score" },
              { value: "firstYear", label: "First year" },
              { value: "lastYear", label: "Last year" },
              { value: "topGenre", label: "Top genre" },
            ]}
          />
        </div>

        <div className="query-footer">
          <div className="chip-row inline" aria-label="Active artist filters">
            {artistRequest.searchText.trim() ? (
              <button
                className="filter-chip"
                type="button"
                onClick={() =>
                  setArtistRequest((previous) => ({
                    ...previous,
                    searchText: "",
                    offset: 0,
                  }))
                }
              >
                <span>Search "{artistRequest.searchText.trim()}"</span>
                <X size={14} />
              </button>
            ) : (
              <span className="chip-empty">No active filters</span>
            )}
          </div>

          <div className="sort-controls">
            <SelectField
              label="Direction"
              value={artistRequest.sort.direction}
              onChange={(direction) =>
                setArtistRequest((previous) => ({
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
              value={artistRequest.limit}
              min={10}
              max={500}
              onChange={(value) =>
                setArtistRequest((previous) => ({
                  ...previous,
                  limit: value ?? 50,
                  offset: 0,
                }))
              }
            />
          </div>
        </div>
      </section>

      <section className="table-panel" aria-label="Artist index">
        <div className="panel-heading compact">
          <div>
            <h2>Artist index</h2>
            <p>
              {isArtistLoading
                ? "Loading artists"
                : `${formatNumber(artistPageStart)}-${formatNumber(artistPageEnd)} of ${formatNumber(artistTotal)}`}
            </p>
          </div>
          <div className="pager">
            <button
              className="icon-button"
              type="button"
              aria-label="Previous artist page"
              disabled={artistRequest.offset === 0}
              onClick={() =>
                setArtistRequest((previous) => ({
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
              aria-label="Next artist page"
              disabled={
                artistRequest.offset + artistRequest.limit >= artistTotal
              }
              onClick={() =>
                setArtistRequest((previous) => ({
                  ...previous,
                  offset: previous.offset + previous.limit,
                }))
              }
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>

        {artistError ? <p className="error-message">{artistError}</p> : null}
        <ArtistIndexTable
          response={artistResponse}
          selectedArtistId={selectedArtistId}
          onSelect={selectArtist}
          countryFlagDisplay={settings.countryFlagDisplay}
        />
      </section>

      <ArtistDetailTabs
        activeTab={artistDetailTab}
        onChange={setArtistDetailTab}
      >
        {artistDetailTab === "overview" ? (
          <section className="artist-overview" aria-label="Artist overview">
            <div className="artist-overview-identity">
              {selectedArtist ? (
                <ArtistPortrait
                  artistId={selectedArtist.id}
                  artistName={selectedArtist.name}
                  portraitAvailable={selectedArtist.portraitAvailable}
                  representativeAlbumId={selectedArtist.representativeAlbumId}
                  representativeAlbum={selectedArtist.representativeAlbum}
                  representativeCoverPath={
                    selectedArtist.representativeCoverPath
                  }
                />
              ) : null}
              <div>
                <span className="eyebrow">Artist overview</span>
                <h2>{selectedArtist?.name ?? "Select an artist"}</h2>
                <p>
                  {[selectedArtist?.topGenre, selectedArtist?.firstYear]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </div>
            <ArtistPopularTracksPanel
              popularity={artistPopularity}
              isLoading={isArtistPopularityLoading}
              error={artistPopularityError}
              onRefresh={() => void refreshArtistPopularity()}
              onOpenSource={(url) => void openLastFmSource(url)}
            />
            <ArtistSimilarArtistsPanel
              similarity={artistSimilarity}
              isLoading={isArtistSimilarityLoading}
              error={artistSimilarityError}
              onRefresh={() => void refreshArtistSimilarity()}
              onExpandArtist={expandArtistConstellation}
              onOpenArtist={openArtistFromMusicMap}
              onOpenSource={(url) => void openLastFmSource(url)}
            />
            <ArtistBiographyPanel
              biography={artistBiography}
              isLoading={isArtistBiographyLoading}
              error={artistBiographyError}
              onRefresh={() => void refreshArtistBiography()}
              onOpenSource={(url) => void openArtistBiographySource(url)}
            />
          </section>
        ) : null}

        {artistDetailTab === "loved-tracks" ? (
          <ArtistLovedTracksPanel
            highlights={artistTrackHighlights}
            isLoading={isArtistTrackHighlightsLoading}
            error={artistTrackHighlightsError}
          />
        ) : null}

        {artistDetailTab === "chart-busters" ? (
          <ArtistChartBustersPanel
            key={selectedArtist?.id}
            isPreparingCharts={isPreparingArtistCharts}
            highlights={artistTrackHighlights}
            isLoading={isArtistTrackHighlightsLoading}
            error={artistTrackHighlightsError}
          />
        ) : null}

        {artistDetailTab === "local-albums" ? (
          <section className="table-panel" aria-label="Selected artist albums">
            <div className="panel-heading compact">
              <div className="artist-detail-heading">
                {selectedArtist ? (
                  <ArtistPortrait
                    artistId={selectedArtist.id}
                    artistName={selectedArtist.name}
                    portraitAvailable={selectedArtist.portraitAvailable}
                    representativeAlbumId={selectedArtist.representativeAlbumId}
                    representativeAlbum={selectedArtist.representativeAlbum}
                    representativeCoverPath={
                      selectedArtist.representativeCoverPath
                    }
                  />
                ) : null}
                <div>
                  <h2>{selectedArtist?.name ?? "Artist albums"}</h2>
                  <p>
                    {isArtistAlbumsLoading
                      ? "Loading albums"
                      : `${formatNumber(artistAlbumsResponse?.rows.length ?? 0)} of ${formatNumber(selectedArtistAlbumCount)} albums`}
                  </p>
                </div>
              </div>
              <span className="run-status">
                {selectedArtist?.topGenre ?? "Artist"}
              </span>
            </div>

            {artistAlbumsError ? (
              <p className="error-message">{artistAlbumsError}</p>
            ) : null}
            <ArtistAlbumTable
              response={artistAlbumsResponse}
              selectedAlbumId={selectedArtistAlbumId}
              onSelect={selectArtistAlbum}
            />
          </section>
        ) : null}

        {artistDetailTab === "artist-info" ? (
          <MusicBrainzArtistInfoPanel
            artist={selectedArtist}
            response={musicBrainzArtistDiscography}
            isLoading={isMusicBrainzArtistLoading}
            isUpdating={isMusicBrainzArtistUpdating}
            error={musicBrainzArtistError}
            onUpdateInfo={() => void updateArtistMusicBrainzInfo()}
            onOpenExternalUrl={(url) => void openMusicBrainzArtistPage(url)}
            onSetArtistLink={(action, musicbrainzMbid, canonicalName) =>
              void setArtistMusicBrainzLink(
                action,
                musicbrainzMbid,
                canonicalName,
              )
            }
            onSetOriginCountry={(countryCode, countryName) =>
              void saveArtistOriginCountry(countryCode, countryName)
            }
            refreshResult={musicBrainzArtistRefreshResult}
            originResult={musicBrainzArtistOriginResult}
            countryOptions={originCountryOptions}
            countryFlagDisplay={settings.countryFlagDisplay}
          />
        ) : null}

        {artistDetailTab === "discography" ? (
          <MusicBrainzArtistDiscographyPanel
            artist={selectedArtist}
            response={musicBrainzArtistDiscography}
            isLoading={isMusicBrainzArtistLoading}
            isUpdating={isMusicBrainzArtistUpdating}
            onRefresh={() => void refreshArtistMusicBrainz()}
            onOpenExternalUrl={(url) => void openMusicBrainzArtistPage(url)}
            onSetArtistLink={(action, musicbrainzMbid, canonicalName) =>
              void setArtistMusicBrainzLink(
                action,
                musicbrainzMbid,
                canonicalName,
              )
            }
            onSetReleaseDecision={(row, decision) =>
              void setArtistMusicBrainzReleaseDecision(row, decision)
            }
            onExport={(format) => void runArtistMusicBrainzExport(format)}
            exportResult={musicBrainzArtistExportResult}
          />
        ) : null}

        {artistDetailTab === "cover-view" ? (
          <section
            className="table-panel"
            aria-label="Selected artist cover view"
          >
            <div className="artist-album-board-heading">
              <div>
                <h3>Cover view</h3>
                <p>
                  {isArtistAlbumTracksLoading
                    ? "Loading tracks"
                    : `${formatNumber(artistAlbumTracksResponse?.rows.length ?? 0)} of ${formatNumber(selectedArtistAlbumTrackCount)} tracks`}
                </p>
              </div>
              <span className="run-status">
                {selectedArtistAlbum?.year ?? "Album"}
              </span>
            </div>

            {artistAlbumTracksError ? (
              <p className="error-message">{artistAlbumTracksError}</p>
            ) : null}
            <ArtistAlbumCoverBoard
              response={artistAlbumsResponse}
              selectedAlbumId={selectedArtistAlbumId}
              selectedAlbum={selectedArtistAlbum}
              tracks={artistAlbumTracksResponse}
              isLoading={isArtistAlbumTracksLoading}
              popularity={artistAlbumPopularity}
              popularityError={artistAlbumPopularityError}
              isPopularityLoading={isArtistAlbumPopularityLoading}
              onOpenSource={(url) => void openLastFmSource(url)}
              onSelect={selectArtistAlbum}
              onClose={clearSelectedArtistAlbum}
            />
          </section>
        ) : null}
      </ArtistDetailTabs>
    </ArtistsWorkspace>
  );
}
