import {
  BarChart3,
  Activity,
  RotateCcw,
  ListMusic,
  Album,
  UsersRound,
  Clock3,
  ShieldCheck,
  Tags,
  FolderInput,
  Heart,
  Sparkles,
  Gauge,
  ChevronRight,
  FileSearch,
  Headphones,
} from "lucide-react";
import { ListeningHistory } from "./ListeningHistory";
import { TransitionRegion } from "../../components/TransitionRegion";
import {
  YearProgressExplorer,
  GenreProgressExplorer,
  RatingEventList,
} from "./ProgressExplorers";
import { Metric, RunStatus } from "../../components/catalog/CatalogValues";
import {
  formatNumber,
  formatHours,
  formatPercent,
  percentOf,
  formatDate,
} from "../../app/display";
import { PageLunaCommandArea } from "../../components/SearchProgressiveDisclosure";
import { LibraryAnalystPanel } from "../../components/LibraryAnalystPanel";
import { InsightActionDock } from "../../components/InsightActionDock";
import {
  LibraryHealthScorePanel,
  RatingCompletionBurndown,
  DecadeProgressTimeline,
  GenrePortfolioMatrix,
  MetadataCoveragePanel,
  ImportDeltaTimeline,
  LibraryShapeByTime,
  LovedDensityPanel,
  CatalogConcentrationPanel,
  DurationAnalyticsPanel,
  OutlierStatsPanel,
  Meter,
  DistributionBars,
} from "./StatisticsPanels";
import { CountryCatalogChart } from "../../components/CountryCatalogChart";
import {
  ratingProgressCohort,
  lovedTracksCohort,
  albumsWithLovedTracksCohort,
  lovedGenreCohort,
  lovedYearCohort,
  ratingBucketCohort,
} from "../../app/insightCohorts";
import { discoveryKeyOpen } from "../../app/visualizationMath";
import type { AppModel } from "../../app/useAppController";
export function StatisticsView({
  model,
}: {
  model: Pick<
    AppModel,
    | "statisticsView"
    | "setStatisticsView"
    | "refreshStatistics"
    | "statsError"
    | "yearLedgerSelection"
    | "setYearLedgerSelection"
    | "statistics"
    | "genreSuggestionOptions"
    | "requestGenreSuggestionRefresh"
    | "openInsightInSearch"
    | "status"
    | "analystSnapshotToOpen"
    | "statisticsCohort"
    | "saveInsightView"
    | "openInsightInPlaylist"
    | "setStatisticsCohort"
    | "isStatsLoading"
    | "ratingAlbumTotal"
    | "ratingTrackTotal"
    | "openTimelineAlbum"
  >;
}) {
  const {
    statisticsView,
    setStatisticsView,
    refreshStatistics,
    statsError,
    yearLedgerSelection,
    setYearLedgerSelection,
    statistics,
    genreSuggestionOptions,
    requestGenreSuggestionRefresh,
    openInsightInSearch,
    status,
    analystSnapshotToOpen,
    statisticsCohort,
    saveInsightView,
    openInsightInPlaylist,
    setStatisticsCohort,
    isStatsLoading,
    ratingAlbumTotal,
    ratingTrackTotal,
    openTimelineAlbum,
  } = model;
  return (
    <section
      className={`workspace statistics-workspace ${statisticsView === "rating" ? "rating-ledger-active" : ""}`}
    >
      <header className="topbar">
        <div>
          <h1>Statistics</h1>
          <p>
            Library health, rating progress, metadata coverage, time shape,
            duration, and outlier signals.
          </p>
        </div>
        <div
          className="statistics-view-tabs"
          role="tablist"
          aria-label="Statistics views"
        >
          <button
            type="button"
            role="tab"
            id="statistics-overview-tab"
            aria-controls="statistics-overview"
            aria-selected={statisticsView === "overview"}
            onClick={() => setStatisticsView("overview")}
          >
            <BarChart3 size={16} />
            Overview
          </button>
          <button
            type="button"
            role="tab"
            id="statistics-rating-tab"
            aria-controls="statistics-rating"
            aria-selected={statisticsView === "rating"}
            onClick={() => setStatisticsView("rating")}
          >
            <Activity size={16} />
            Rating progress
          </button>
          <button
            type="button"
            role="tab"
            id="statistics-listening-tab"
            aria-controls="statistics-listening"
            aria-selected={statisticsView === "listening"}
            onClick={() => setStatisticsView("listening")}
          >
            <Headphones size={16} />
            Listening
          </button>
        </div>
        <div className="topbar-actions">
          <button
            className="icon-button"
            type="button"
            aria-label="Refresh statistics"
            onClick={() => void refreshStatistics()}
          >
            <RotateCcw size={18} />
          </button>
        </div>
      </header>

      {statisticsView === "listening" ? (
        <section
          id="statistics-listening"
          role="tabpanel"
          aria-labelledby="statistics-listening-tab"
        >
          <ListeningHistory onOpenAlbum={openTimelineAlbum} />
        </section>
      ) : null}
      <TransitionRegion>
        <section
          id="statistics-rating"
          role="tabpanel"
          aria-labelledby="statistics-rating-tab"
          hidden={statisticsView !== "rating"}
          className="rating-progress-page"
        >
          <header className="rating-progress-heading">
            <h2>Rating progress</h2>
            <p>Album year · selected genres combined</p>
          </header>
          {statsError ? (
            <p className="error-message" role="alert">
              {statsError}
            </p>
          ) : null}
          <YearProgressExplorer
            selection={yearLedgerSelection}
            onSelectionChange={setYearLedgerSelection}
            rows={statistics?.yearProgress ?? []}
            genreOptions={genreSuggestionOptions}
            onRequestGenreOptions={requestGenreSuggestionRefresh}
            onSelect={openInsightInSearch}
          />
        </section>
      </TransitionRegion>
      <TransitionRegion>
        <div
          id="statistics-overview"
          role="tabpanel"
          aria-labelledby="statistics-overview-tab"
          hidden={statisticsView !== "overview"}
        >
          <section className="metric-grid" aria-label="Statistics summary">
            <Metric
              label="Tracks"
              value={formatNumber(
                statistics?.overview.trackCount ?? status?.trackCount,
              )}
              tone="teal"
              icon={ListMusic}
            />
            <Metric
              label="Albums"
              value={formatNumber(
                statistics?.overview.albumCount ?? status?.albumCount,
              )}
              tone="amber"
              icon={Album}
            />
            <Metric
              label="Artists"
              value={formatNumber(statistics?.overview.albumArtistCount)}
              icon={UsersRound}
            />
            <Metric
              label="Duration"
              value={formatHours(statistics?.overview.totalSeconds)}
              icon={Clock3}
            />
          </section>

          {statsError ? <p className="error-message">{statsError}</p> : null}

          <PageLunaCommandArea
            idPrefix="statistics"
            label="Statistics Luna commands"
            description="Analyze collection-wide patterns from bounded local aggregates."
            openRequestId={analystSnapshotToOpen?.id}
          >
            <LibraryAnalystPanel
              isAvailable={Boolean(
                statistics && statistics.overview.albumCount > 0,
              )}
              showSnapshotHistory={false}
              snapshotToOpen={analystSnapshotToOpen}
            />
          </PageLunaCommandArea>

          <section
            className="stats-dashboard-grid"
            aria-label="Statistics dashboards"
          >
            <InsightActionDock
              cohort={statisticsCohort}
              onOpenInSearch={openInsightInSearch}
              onSaveView={saveInsightView}
              onBuildPlaylist={openInsightInPlaylist}
              onClear={() => setStatisticsCohort(null)}
            />

            <section className="stats-panel health-panel">
              <div className="panel-heading compact">
                <div>
                  <h2>Library health score</h2>
                  <p>
                    {statistics
                      ? "Ratings, metadata, covers, and score coverage"
                      : "Waiting for library data"}
                  </p>
                </div>
                <ShieldCheck size={18} />
              </div>
              <LibraryHealthScorePanel statistics={statistics} />
            </section>

            <section className="stats-panel">
              <div className="panel-heading compact">
                <div>
                  <h2>Rating completion burndown</h2>
                  <p>Unrated tracks remaining across rating snapshots.</p>
                </div>
                <Activity size={18} />
              </div>
              <RatingCompletionBurndown
                statistics={statistics}
                onSelect={setStatisticsCohort}
              />
            </section>

            <section className="stats-panel wide">
              <div className="panel-heading compact">
                <div>
                  <h2>Decade progress timeline</h2>
                  <p>Rated, partial, and open albums by release decade.</p>
                </div>
                <Clock3 size={18} />
              </div>
              <DecadeProgressTimeline
                rows={statistics?.decadeProgress ?? []}
                onSelect={setStatisticsCohort}
              />
            </section>

            <section className="stats-panel wide">
              <div className="panel-heading compact">
                <div>
                  <h2>Genre portfolio matrix</h2>
                  <p>
                    Catalog size, completion, and average Album Score by genre.
                  </p>
                </div>
                <Tags size={18} />
              </div>
              <GenrePortfolioMatrix
                rows={statistics?.genreProgress ?? []}
                onSelect={setStatisticsCohort}
              />
            </section>

            <section className="stats-panel wide country-catalog-panel">
              <div className="panel-heading compact">
                <div>
                  <h2>Countries in your library</h2>
                  <p>Artists and albums ranked by origin country.</p>
                </div>
                <BarChart3 size={18} />
              </div>
              <CountryCatalogChart rows={statistics?.countryCatalog ?? []} />
            </section>

            <section className="stats-panel wide">
              <div className="panel-heading compact">
                <div>
                  <h2>Metadata coverage</h2>
                  <p>Core album, track, artwork, and rating fields.</p>
                </div>
                <ShieldCheck size={18} />
              </div>
              <MetadataCoveragePanel
                metrics={statistics?.metadataCoverage ?? []}
                onSelect={setStatisticsCohort}
              />
            </section>

            <section className="stats-panel wide">
              <div className="panel-heading compact">
                <div>
                  <h2>Import delta timeline</h2>
                  <p>
                    Added, changed, removed, and rating-event movement by
                    import.
                  </p>
                </div>
                <FolderInput size={18} />
              </div>
              <ImportDeltaTimeline runs={statistics?.importHistory ?? []} />
            </section>

            <section className="stats-panel wide">
              <div className="panel-heading compact">
                <div>
                  <h2>Library shape by time</h2>
                  <p>
                    Albums, tracks, duration, and release-year center of
                    gravity.
                  </p>
                </div>
                <Clock3 size={18} />
              </div>
              <LibraryShapeByTime
                statistics={statistics}
                onSelect={setStatisticsCohort}
              />
            </section>

            <section className="stats-panel wide">
              <div className="panel-heading compact">
                <div>
                  <h2>Loved density</h2>
                  <p>
                    Loved tracks per 100 tracks by genre, decade, and rating
                    bucket.
                  </p>
                </div>
                <Heart size={18} />
              </div>
              <LovedDensityPanel
                rows={statistics?.lovedDensity ?? []}
                onSelect={setStatisticsCohort}
              />
            </section>

            <section className="stats-panel wide">
              <div className="panel-heading compact">
                <div>
                  <h2>Catalog concentration</h2>
                  <p>
                    Top artist and genre slices as a share of the album library.
                  </p>
                </div>
                <UsersRound size={18} />
              </div>
              <CatalogConcentrationPanel
                statistics={statistics}
                onSelect={setStatisticsCohort}
              />
            </section>

            <section className="stats-panel wide">
              <div className="panel-heading compact">
                <div>
                  <h2>Duration analytics</h2>
                  <p>
                    Listening time, album length extremes, and tracks-per-album
                    shape.
                  </p>
                </div>
                <Clock3 size={18} />
              </div>
              <DurationAnalyticsPanel
                statistics={statistics}
                onSelect={setStatisticsCohort}
              />
            </section>

            <section className="stats-panel wide">
              <div className="panel-heading compact">
                <div>
                  <h2>Outlier stats</h2>
                  <p>
                    Aggregate oddities worth knowing without leaving Statistics.
                  </p>
                </div>
                <Sparkles size={18} />
              </div>
              <OutlierStatsPanel
                rows={statistics?.outlierStats ?? []}
                onSelect={setStatisticsCohort}
              />
            </section>

            <section className="stats-panel rating-progress-panel">
              <div className="panel-heading compact">
                <div>
                  <h2>Rating progress</h2>
                  <p>
                    {isStatsLoading
                      ? "Refreshing"
                      : formatPercent(
                          statistics?.ratingProgress.averageRatingCompleteness,
                        )}
                  </p>
                </div>
                <Gauge size={18} />
              </div>

              {statistics ? (
                <div className="meter-stack">
                  <Meter
                    label="Fully rated albums"
                    value={statistics.ratingProgress.fullyRatedAlbums}
                    total={ratingAlbumTotal}
                    detail={`${percentOf(statistics.ratingProgress.fullyRatedAlbums, ratingAlbumTotal).toFixed(1)}%`}
                    onSelect={() =>
                      setStatisticsCohort(
                        ratingProgressCohort(
                          "fully-rated",
                          statistics.ratingProgress.fullyRatedAlbums,
                        ),
                      )
                    }
                  />
                  <Meter
                    label="Partially rated albums"
                    value={statistics.ratingProgress.partiallyRatedAlbums}
                    total={ratingAlbumTotal}
                    detail={`${percentOf(statistics.ratingProgress.partiallyRatedAlbums, ratingAlbumTotal).toFixed(1)}%`}
                    onSelect={() =>
                      setStatisticsCohort(
                        ratingProgressCohort(
                          "partially-rated",
                          statistics.ratingProgress.partiallyRatedAlbums,
                        ),
                      )
                    }
                  />
                  <Meter
                    label="Rated tracks"
                    value={statistics.ratingProgress.ratedTracks}
                    total={ratingTrackTotal}
                    detail={`${percentOf(statistics.ratingProgress.ratedTracks, ratingTrackTotal).toFixed(1)}%`}
                    onSelect={() =>
                      setStatisticsCohort(
                        ratingProgressCohort(
                          "rated-tracks",
                          statistics.ratingProgress.ratedTracks,
                        ),
                      )
                    }
                  />
                </div>
              ) : (
                <div className="empty-state">
                  <Activity size={20} />
                  <span>No statistics loaded.</span>
                </div>
              )}
            </section>

            <section className="stats-panel loved-panel">
              <div className="panel-heading compact">
                <div>
                  <h2>Loved tracks</h2>
                  <p>
                    {statistics?.lovedTracks.topLovedGenre ??
                      "Waiting for library data"}
                  </p>
                </div>
                <Heart size={18} />
              </div>
              <div className="stat-pairs">
                <div
                  className={statistics ? "actionable-cohort" : undefined}
                  role={statistics ? "button" : undefined}
                  tabIndex={statistics ? 0 : undefined}
                  onClick={() => {
                    if (statistics) {
                      setStatisticsCohort(
                        lovedTracksCohort(statistics.lovedTracks.lovedTracks),
                      );
                    }
                  }}
                  onKeyDown={(event) => {
                    if (statistics) {
                      discoveryKeyOpen(event, () =>
                        setStatisticsCohort(
                          lovedTracksCohort(statistics.lovedTracks.lovedTracks),
                        ),
                      );
                    }
                  }}
                >
                  <span>Loved tracks</span>
                  <strong>
                    {formatNumber(statistics?.lovedTracks.lovedTracks)}
                  </strong>
                </div>
                <div
                  className={statistics ? "actionable-cohort" : undefined}
                  role={statistics ? "button" : undefined}
                  tabIndex={statistics ? 0 : undefined}
                  onClick={() => {
                    if (statistics) {
                      setStatisticsCohort(
                        albumsWithLovedTracksCohort(
                          statistics.lovedTracks.albumsWithLovedTracks,
                        ),
                      );
                    }
                  }}
                  onKeyDown={(event) => {
                    if (statistics) {
                      discoveryKeyOpen(event, () =>
                        setStatisticsCohort(
                          albumsWithLovedTracksCohort(
                            statistics.lovedTracks.albumsWithLovedTracks,
                          ),
                        ),
                      );
                    }
                  }}
                >
                  <span>Albums with love</span>
                  <strong>
                    {formatNumber(
                      statistics?.lovedTracks.albumsWithLovedTracks,
                    )}
                  </strong>
                </div>
                <div
                  className={
                    statistics?.lovedTracks.topLovedGenre
                      ? "actionable-cohort"
                      : undefined
                  }
                  role={
                    statistics?.lovedTracks.topLovedGenre ? "button" : undefined
                  }
                  tabIndex={
                    statistics?.lovedTracks.topLovedGenre ? 0 : undefined
                  }
                  onClick={() => {
                    const genre = statistics?.lovedTracks.topLovedGenre;
                    if (genre) {
                      const albumCount =
                        statistics.genreProgress.find(
                          (row) => row.genre === genre,
                        )?.albumCount ?? null;
                      setStatisticsCohort(lovedGenreCohort(genre, albumCount));
                    }
                  }}
                  onKeyDown={(event) => {
                    const genre = statistics?.lovedTracks.topLovedGenre;
                    if (genre) {
                      const albumCount =
                        statistics?.genreProgress.find(
                          (row) => row.genre === genre,
                        )?.albumCount ?? null;
                      discoveryKeyOpen(event, () =>
                        setStatisticsCohort(
                          lovedGenreCohort(genre, albumCount),
                        ),
                      );
                    }
                  }}
                >
                  <span>Top genre</span>
                  <strong>{statistics?.lovedTracks.topLovedGenre ?? ""}</strong>
                </div>
                <div
                  className={
                    statistics?.lovedTracks.topLovedYear != null
                      ? "actionable-cohort"
                      : undefined
                  }
                  role={
                    statistics?.lovedTracks.topLovedYear != null
                      ? "button"
                      : undefined
                  }
                  tabIndex={
                    statistics?.lovedTracks.topLovedYear != null ? 0 : undefined
                  }
                  onClick={() => {
                    const year = statistics?.lovedTracks.topLovedYear;
                    if (year != null) {
                      const albumCount =
                        statistics?.yearProgress.find(
                          (row) => row.year === year,
                        )?.albumCount ?? null;
                      setStatisticsCohort(lovedYearCohort(year, albumCount));
                    }
                  }}
                  onKeyDown={(event) => {
                    const year = statistics?.lovedTracks.topLovedYear;
                    if (year != null) {
                      const albumCount =
                        statistics?.yearProgress.find(
                          (row) => row.year === year,
                        )?.albumCount ?? null;
                      discoveryKeyOpen(event, () =>
                        setStatisticsCohort(lovedYearCohort(year, albumCount)),
                      );
                    }
                  }}
                >
                  <span>Top year</span>
                  <strong>{statistics?.lovedTracks.topLovedYear ?? ""}</strong>
                </div>
              </div>
            </section>

            <section className="stats-panel wide">
              <div className="panel-heading compact">
                <div>
                  <h2>Year progress</h2>
                  <p>
                    Explore fully rated, partial, and unrated albums by album
                    year and genre.
                  </p>
                </div>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setStatisticsView("rating")}
                >
                  Open Year Ledger
                  <ChevronRight size={16} />
                </button>
              </div>
            </section>

            <section className="stats-panel wide">
              <div className="panel-heading compact">
                <div>
                  <h2>Genre progress</h2>
                  <p>
                    {formatNumber(statistics?.overview.genreCount)} canonical
                    genres
                  </p>
                </div>
                <Tags size={18} />
              </div>
              <GenreProgressExplorer
                rows={statistics?.genreProgress ?? []}
                yearRows={statistics?.yearProgress ?? []}
                genreOptions={genreSuggestionOptions}
                onRequestGenreOptions={requestGenreSuggestionRefresh}
                onSelect={setStatisticsCohort}
              />
            </section>

            <section className="stats-panel">
              <div className="panel-heading compact">
                <div>
                  <h2>Track ratings</h2>
                  <p>
                    {formatNumber(statistics?.ratingProgress.ratedTracks)} rated
                    tracks
                  </p>
                </div>
                <ListMusic size={18} />
              </div>
              <DistributionBars
                buckets={statistics?.trackRatingDistribution ?? []}
                onSelect={(bucket) => {
                  const insight = ratingBucketCohort(bucket, "tracks");
                  if (insight) setStatisticsCohort(insight);
                }}
              />
            </section>

            <section className="stats-panel">
              <div className="panel-heading compact">
                <div>
                  <h2>Album ratings</h2>
                  <p>
                    {formatNumber(
                      statistics?.ratingProgress.albumsWithEffectiveRating,
                    )}{" "}
                    scored albums
                  </p>
                </div>
                <Album size={18} />
              </div>
              <DistributionBars
                buckets={statistics?.albumRatingDistribution ?? []}
                onSelect={(bucket) => {
                  const insight = ratingBucketCohort(bucket, "albums");
                  if (insight) setStatisticsCohort(insight);
                }}
              />
            </section>

            <section className="stats-panel wide">
              <div className="panel-heading compact">
                <div>
                  <h2>Import history</h2>
                  <p>Track and album deltas recorded during imports.</p>
                </div>
                <FolderInput size={18} />
              </div>
              <div className="stats-table import-stats-table" role="table">
                <div className="stats-table-head" role="row">
                  <span role="columnheader">Status</span>
                  <span role="columnheader">Completed</span>
                  <span role="columnheader">Tracks</span>
                  <span role="columnheader">Track delta</span>
                  <span role="columnheader">Albums</span>
                  <span role="columnheader">Album delta</span>
                </div>
                {(statistics?.importHistory ?? []).length === 0 ? (
                  <div className="empty-state">
                    <FileSearch size={20} />
                    <span>No imports yet.</span>
                  </div>
                ) : (
                  statistics?.importHistory.map((run) => (
                    <div className="stats-table-row" role="row" key={run.id}>
                      <span role="cell">
                        <RunStatus status={run.status} />
                      </span>
                      <span role="cell">{formatDate(run.completedAt)}</span>
                      <span role="cell">{formatNumber(run.trackRows)}</span>
                      <span role="cell">
                        +{formatNumber(run.addedTracks)} / ~
                        {formatNumber(run.changedTracks)} / -
                        {formatNumber(run.removedTracks)}
                      </span>
                      <span role="cell">{formatNumber(run.albumCount)}</span>
                      <span role="cell">
                        +{formatNumber(run.addedAlbums)} / ~
                        {formatNumber(run.changedAlbums)} / -
                        {formatNumber(run.removedAlbums)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="stats-panel wide">
              <div className="panel-heading compact">
                <div>
                  <h2>Rating history</h2>
                  <p>
                    {formatNumber(statistics?.recentRatingEvents.length)} recent
                    rating events
                  </p>
                </div>
                <Activity size={18} />
              </div>
              <div className="rating-history-strip">
                {(statistics?.ratingHistory ?? []).slice(-8).map((point) => (
                  <article className="history-point" key={point.importRunId}>
                    <span>{formatDate(point.createdAt)}</span>
                    <strong>
                      {formatPercent(
                        point.ratedTracks / Math.max(1, point.trackCount),
                      )}
                    </strong>
                    <small>
                      {formatNumber(point.ratingEventsCount)} events
                    </small>
                  </article>
                ))}
              </div>
              <RatingEventList
                events={statistics?.recentRatingEvents ?? []}
                onSelect={setStatisticsCohort}
              />
            </section>
          </section>
        </div>
      </TransitionRegion>
    </section>
  );
}
