import {
  RotateCcw,
  Database,
  Compass,
  Gauge,
  Tags,
  Heart,
  Sparkles,
  UsersRound,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { DiscoveryDailyEdition } from "../../components/DiscoveryDailyEdition";
import { NewReleases, ReleaseRadarProvider } from "../../components/NewReleases";
import {
  getDiscoveryShelfExplorer,
  getDiscoverySourceHealth,
  rebuildDiscoveryChartMatches,
  getDiscoveryMixerSeedOptions,
  getDiscoveryMixer,
} from "../../backend";
import { DiscoveryMixer } from "../../components/DiscoveryMixer";
import { PageLunaCommandArea } from "../../components/SearchProgressiveDisclosure";
import { OutsideLibraryDiscovery } from "../../components/OutsideLibraryDiscovery";
import { Metric } from "../../components/catalog/CatalogValues";
import { InsightActionDock } from "../../components/InsightActionDock";
import { formatNumber } from "../../app/display";
import {
  CompletionHeatmap,
  DiscoveryMissionGrid,
  LoveRatingScatter,
  GenreUniverse,
  ArtistConstellation,
} from "./DiscoveryPlots";
import { ResultTable } from "../albums/AlbumPanels";
import type { AppModel } from "../../app/useAppController";
export function DiscoveryView({
  model,
}: {
  model: Pick<
    AppModel,
    | "discovery"
    | "refreshDiscovery"
    | "loadData"
    | "isDiscoveryLoading"
    | "isDiscoveryAnniversaryLoading"
    | "isDiscoveryChartLoading"
    | "isDiscoveryDeepCutLoading"
    | "isDiscoveryCompletionLoading"
    | "isDiscoveryRecommendationLoading"
    | "changeDiscoveryAnniversaryYears"
    | "changeDiscoveryChartSnapshot"
    | "changeDiscoveryDeepCutSnapshot"
    | "changeDiscoveryCompletionSnapshot"
    | "changeDiscoveryRecommendationSnapshot"
    | "changeDiscoveryEditionDate"
    | "loadDiscoveryData"
    | "openDiscoverySourceAction"
    | "openTimelineAlbum"
    | "openArtistFromMusicMap"
    | "openTimelineTrack"
    | "savedDiscoveryToOpen"
    | "status"
    | "discoveryMetricValue"
    | "discoveryMissionTotal"
    | "discoveryError"
    | "discoveryCohort"
    | "openInsightInSearch"
    | "saveInsightView"
    | "openInsightInPlaylist"
    | "setDiscoveryCohort"
    | "discoveryHeatmapEmptyLabel"
    | "openDiscoveryHeatmapCell"
    | "discoveryBacklogEmptyLabel"
    | "openDiscoveryMission"
    | "discoverySmartMissionEmptyLabel"
    | "discoveryOutlierEmptyLabel"
    | "openDiscoveryAlbumPoint"
    | "discoveryGenreEmptyLabel"
    | "openDiscoveryGenre"
    | "discoveryArtistEmptyLabel"
    | "openDiscoveryArtist"
    | "discoverySelection"
    | "isDiscoveryAlbumsLoading"
    | "discoveryAlbumPageStart"
    | "discoveryAlbumPageEnd"
    | "discoveryAlbumTotal"
    | "discoveryAlbumRequest"
    | "setDiscoveryAlbumRequest"
    | "discoveryAlbumError"
    | "discoveryAlbumResponse"
    | "sortDiscoveryAlbumsBy"
    | "settings"
  >;
}) {
  const {
    discovery,
    refreshDiscovery,
    loadData,
    isDiscoveryLoading,
    isDiscoveryAnniversaryLoading,
    isDiscoveryChartLoading,
    isDiscoveryDeepCutLoading,
    isDiscoveryCompletionLoading,
    isDiscoveryRecommendationLoading,
    changeDiscoveryAnniversaryYears,
    changeDiscoveryChartSnapshot,
    changeDiscoveryDeepCutSnapshot,
    changeDiscoveryCompletionSnapshot,
    changeDiscoveryRecommendationSnapshot,
    changeDiscoveryEditionDate,
    loadDiscoveryData,
    openDiscoverySourceAction,
    openTimelineAlbum,
    openArtistFromMusicMap,
    openTimelineTrack,
    savedDiscoveryToOpen,
    status,
    discoveryMetricValue,
    discoveryMissionTotal,
    discoveryError,
    discoveryCohort,
    openInsightInSearch,
    saveInsightView,
    openInsightInPlaylist,
    setDiscoveryCohort,
    discoveryHeatmapEmptyLabel,
    openDiscoveryHeatmapCell,
    discoveryBacklogEmptyLabel,
    openDiscoveryMission,
    discoverySmartMissionEmptyLabel,
    discoveryOutlierEmptyLabel,
    openDiscoveryAlbumPoint,
    discoveryGenreEmptyLabel,
    openDiscoveryGenre,
    discoveryArtistEmptyLabel,
    openDiscoveryArtist,
    discoverySelection,
    isDiscoveryAlbumsLoading,
    discoveryAlbumPageStart,
    discoveryAlbumPageEnd,
    discoveryAlbumTotal,
    discoveryAlbumRequest,
    setDiscoveryAlbumRequest,
    discoveryAlbumError,
    discoveryAlbumResponse,
    sortDiscoveryAlbumsBy,
    settings,
  } = model;
  return (
    <section className="workspace discovery-workspace">
      <header className="topbar">
        <div>
          <h1>Discovery</h1>
          <p>Your library has a new edition.</p>
        </div>
        <div className="topbar-actions">
          <button
            className="icon-button"
            type="button"
            aria-label={
              discovery?.dailyEditionArchive.isArchived
                ? "Reload archived edition"
                : "Refresh today's discovery"
            }
            onClick={() => void refreshDiscovery()}
          >
            <RotateCcw size={18} />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="Refresh library data"
            onClick={() => void loadData()}
          >
            <Database size={18} />
          </button>
        </div>
      </header>

      <ReleaseRadarProvider available={Boolean(status?.hasDatabase)}>
      <DiscoveryDailyEdition
        edition={discovery?.dailyEdition ?? null}
        archive={discovery?.dailyEditionArchive}
        isLoading={isDiscoveryLoading}
        isAnniversaryLoading={isDiscoveryAnniversaryLoading}
        isChartLoading={isDiscoveryChartLoading}
        isDeepCutLoading={isDiscoveryDeepCutLoading}
        isCompletionLoading={isDiscoveryCompletionLoading}
        isRecommendationLoading={isDiscoveryRecommendationLoading}
        onAnniversaryYearsChange={changeDiscoveryAnniversaryYears}
        onChartSnapshotChange={changeDiscoveryChartSnapshot}
        onDeepCutSnapshotChange={changeDiscoveryDeepCutSnapshot}
        onCompletionSnapshotChange={changeDiscoveryCompletionSnapshot}
        onRecommendationSnapshotChange={changeDiscoveryRecommendationSnapshot}
        onEditionDateChange={changeDiscoveryEditionDate}
        onLoadExplorer={getDiscoveryShelfExplorer}
        onLoadSourceHealth={getDiscoverySourceHealth}
        onRebuildChartMatches={rebuildDiscoveryChartMatches}
        onRebuildEdition={async () => {
          await loadDiscoveryData(true);
        }}
        onOpenSourceHealthAction={openDiscoverySourceAction}
        onOpenAlbum={openTimelineAlbum}
        onOpenArtist={openArtistFromMusicMap}
        onOpenTrack={openTimelineTrack}
      />

      <NewReleases compact available={Boolean(status?.hasDatabase)} onOpenArtist={openArtistFromMusicMap} />
      <div id="discovery-new-releases">
      <NewReleases
        available={Boolean(status?.hasDatabase)}
        onOpenArtist={openArtistFromMusicMap}
      />
      </div>
      </ReleaseRadarProvider>

      <DiscoveryMixer
        onSearchSeeds={getDiscoveryMixerSeedOptions}
        onGenerate={getDiscoveryMixer}
        onOpenAlbum={openTimelineAlbum}
      />

      <details className="discovery-archive-tools">
        <summary>More discovery tools</summary>
        <PageLunaCommandArea
          idPrefix="discovery"
          label="Discovery Luna commands"
          description="Find verified music outside your current library."
          openRequestId={savedDiscoveryToOpen?.id}
        >
          <OutsideLibraryDiscovery
            isAvailable={Boolean(status?.hasDatabase && status.trackCount > 0)}
            savedDiscoveryToOpen={savedDiscoveryToOpen}
          />
        </PageLunaCommandArea>

        <section className="metric-grid" aria-label="Discovery summary">
          <Metric
            label="Missions"
            value={discoveryMetricValue(discoveryMissionTotal)}
            tone="teal"
            icon={Compass}
          />
          <Metric
            label="Heatmap cells"
            value={discoveryMetricValue(discovery?.heatmap.length)}
            tone="amber"
            icon={Gauge}
          />
          <Metric
            label="Genre bubbles"
            value={discoveryMetricValue(discovery?.genrePoints.length)}
            icon={Tags}
          />
          <Metric
            label="Outliers"
            value={discoveryMetricValue(discovery?.loveRatingPoints.length)}
            icon={Heart}
          />
        </section>

        {discoveryError ? (
          <p className="error-message">{discoveryError}</p>
        ) : null}

        <section
          className="discovery-dashboard-grid"
          aria-label="Discovery charts"
        >
          <InsightActionDock
            cohort={discoveryCohort}
            onOpenInSearch={openInsightInSearch}
            onSaveView={saveInsightView}
            onBuildPlaylist={openInsightInPlaylist}
            onClear={() => setDiscoveryCohort(null)}
          />

          <section className="discovery-panel wide">
            <div className="panel-heading compact">
              <div>
                <h2>Completion heatmap</h2>
                <p>
                  {isDiscoveryLoading
                    ? "Loading"
                    : `${formatNumber(discovery?.heatmap.length)} populated intersections available`}
                </p>
              </div>
              <Gauge size={18} />
            </div>
            <CompletionHeatmap
              cells={discovery?.heatmap ?? []}
              emptyLabel={discoveryHeatmapEmptyLabel}
              onOpen={openDiscoveryHeatmapCell}
            />
          </section>

          <section className="discovery-panel">
            <div className="panel-heading compact">
              <div>
                <h2>Backlog quest board</h2>
                <p>Rating paths with the strongest payoff signals.</p>
              </div>
              <Compass size={18} />
            </div>
            <DiscoveryMissionGrid
              missions={discovery?.backlogMissions ?? []}
              emptyLabel={discoveryBacklogEmptyLabel}
              onOpen={openDiscoveryMission}
            />
          </section>

          <section className="discovery-panel">
            <div className="panel-heading compact">
              <div>
                <h2>Smart missions</h2>
                <p>Generated shortcuts into focused album sets.</p>
              </div>
              <Sparkles size={18} />
            </div>
            <DiscoveryMissionGrid
              missions={discovery?.smartMissions ?? []}
              emptyLabel={discoverySmartMissionEmptyLabel}
              onOpen={openDiscoveryMission}
            />
          </section>

          <section className="discovery-panel wide">
            <div className="panel-heading compact">
              <div>
                <h2>Love vs rating scatter</h2>
                <p>Click a point to inspect the album behind an outlier.</p>
              </div>
              <Heart size={18} />
            </div>
            <LoveRatingScatter
              points={discovery?.loveRatingPoints ?? []}
              emptyLabel={discoveryOutlierEmptyLabel}
              onOpen={openDiscoveryAlbumPoint}
            />
          </section>

          <section className="discovery-panel">
            <div className="panel-heading compact">
              <div>
                <h2>Genre universe</h2>
                <p>Bubble size is catalog depth; height is completion.</p>
              </div>
              <Tags size={18} />
            </div>
            <GenreUniverse
              points={discovery?.genrePoints ?? []}
              emptyLabel={discoveryGenreEmptyLabel}
              onOpen={openDiscoveryGenre}
            />
          </section>

          <section className="discovery-panel">
            <div className="panel-heading compact">
              <div>
                <h2>Artist constellation</h2>
                <p>Find deep catalogs, favorites, and neglected artists.</p>
              </div>
              <UsersRound size={18} />
            </div>
            <ArtistConstellation
              points={discovery?.artistPoints ?? []}
              emptyLabel={discoveryArtistEmptyLabel}
              onOpen={openDiscoveryArtist}
            />
          </section>

          <section
            className="table-panel discovery-results-panel"
            aria-label="Discovery album results"
          >
            <div className="panel-heading compact">
              <div>
                <h2>{discoverySelection?.title ?? "Discovery albums"}</h2>
                <p>
                  {!discoverySelection
                    ? "Click a chart item or mission to open matching albums."
                    : isDiscoveryAlbumsLoading
                      ? "Loading"
                      : `${formatNumber(discoveryAlbumPageStart)}-${formatNumber(discoveryAlbumPageEnd)} of ${formatNumber(discoveryAlbumTotal)} / ${discoverySelection.caption}`}
                </p>
              </div>
              <div className="pager">
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Previous discovery page"
                  disabled={
                    !discoverySelection || discoveryAlbumRequest.offset === 0
                  }
                  onClick={() =>
                    setDiscoveryAlbumRequest((previous) => ({
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
                  aria-label="Next discovery page"
                  disabled={
                    !discoverySelection ||
                    discoveryAlbumRequest.offset +
                      discoveryAlbumRequest.limit >=
                      discoveryAlbumTotal
                  }
                  onClick={() =>
                    setDiscoveryAlbumRequest((previous) => ({
                      ...previous,
                      offset: previous.offset + previous.limit,
                    }))
                  }
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>

            {discoveryAlbumError ? (
              <p className="error-message">{discoveryAlbumError}</p>
            ) : null}
            <ResultTable
              response={discoverySelection ? discoveryAlbumResponse : null}
              sort={discoveryAlbumRequest.sort}
              onSort={sortDiscoveryAlbumsBy}
              countryFlagDisplay={settings.countryFlagDisplay}
              visibleColumns={[]}
            />
          </section>
        </section>
      </details>
    </section>
  );
}
