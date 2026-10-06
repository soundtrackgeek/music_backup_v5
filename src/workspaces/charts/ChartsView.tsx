import {
  createChartConfig,
  normalizeChartConfigForClient
} from "../../app/requests";
import {
  RotateCcw,
  Database,
  Album,
  BarChart3,
  ListMusic,
  Save,
  Search
} from "lucide-react";
import {
  Metric
} from "../../components/catalog/CatalogValues";
import {
  formatNumber,
  rankingLabel,
  formatCompletenessRange
} from "../../app/display";
import {
  ChartLunaCommandArea,
  ChartAdvancedControls,
  ChartFiltersDisclosure,
  ChartFilterSourceGroup
} from "../../components/SearchProgressiveDisclosure";
import {
  NaturalLanguageQueryPanel
} from "../../components/NaturalLanguageQueryPanel";
import {
  CurrentViewQuestionPanel
} from "../../components/CurrentViewQuestionPanel";
import {
  chartViewModes,
  trackRankingOptions,
  albumRankingOptions,
  artistTypeOptions,
  artistGenderOptions,
  chartGridCoverSize,
  chartColumnOptions
} from "../../app/config";
import {
  SelectField,
  GenreListCriterion,
  NumberField,
  DateField,
  WeekField,
  CountryListCriterion,
  TextCriterion,
  CompletenessRangeCriterion
} from "../../components/catalog/SearchCriteria";
import {
  chartTemplates
} from "../../app/chartTemplates";
import {
  TransitionRegion
} from "../../components/TransitionRegion";
import {
  ChartResults
} from "./ChartResults";
import type { AppModel } from "../../app/useAppController";
export function ChartsView({ model }: { model: Pick<AppModel, "setChartConfig" | "setChartTableSort" | "loadData" | "chartConfig" | "status" | "chartTotal" | "chartRows" | "savedCharts" | "chartLunaLaunch" | "setChartError" | "chartRequest" | "updateChartConfig" | "setChartBrowseView" | "updateChartFilters" | "genreSuggestionOptions" | "requestGenreSuggestionRefresh" | "advancedChartControlCount" | "applyChartTemplate" | "chartSourceFilterCount" | "originCountryOptions" | "settings" | "currentChartCompletenessRange" | "currentChartGridCoverSize" | "toggleChartColumn" | "isChartLoading" | "chartError" | "chartResponse" | "chartTableSort" | "sortChartBy" | "openTimelineAlbum" | "openArtistFromMusicMap" | "openGenreFromBrowse"> }) {
  const { setChartConfig, setChartTableSort, loadData, chartConfig, status, chartTotal, chartRows, savedCharts, chartLunaLaunch, setChartError, chartRequest, updateChartConfig, setChartBrowseView, updateChartFilters, genreSuggestionOptions, requestGenreSuggestionRefresh, advancedChartControlCount, applyChartTemplate, chartSourceFilterCount, originCountryOptions, settings, currentChartCompletenessRange, currentChartGridCoverSize, toggleChartColumn, isChartLoading, chartError, chartResponse, chartTableSort, sortChartBy, openTimelineAlbum, openArtistFromMusicMap, openGenreFromBrowse } = model;
  return (
          <section className="workspace charts-workspace">
            <header className="topbar">
              <div>
                <h1>Charts</h1>
                <p>
                  Rank albums or tracks from scores, ratings, Billboard and VG
                  Lista performance, and chart-entry dates.
                </p>
              </div>
              <div className="topbar-actions">
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Reset chart"
                  onClick={() => {
                    setChartConfig(createChartConfig());
                    setChartTableSort(null);
                  }}
                >
                  <RotateCcw size={18} />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Refresh"
                  onClick={() => void loadData()}
                >
                  <Database size={18} />
                </button>
              </div>
            </header>

            <section className="metric-grid" aria-label="Chart summary">
              <Metric
                label={chartConfig.request.view === "tracks" ? "Tracks" : "Albums"}
                value={formatNumber(
                  chartConfig.request.view === "tracks"
                    ? status?.trackCount
                    : status?.albumCount,
                )}
                tone="teal"
                icon={Album}
              />
              <Metric
                label="Ranked"
                value={formatNumber(chartTotal)}
                tone="amber"
                icon={BarChart3}
              />
              <Metric
                label="Showing"
                value={formatNumber(chartRows)}
                icon={ListMusic}
              />
              <Metric
                label="Saved"
                value={formatNumber(savedCharts.length)}
                icon={Save}
              />
            </section>

            <ChartLunaCommandArea
              launch={chartLunaLaunch}
              chartCommand={
                <NaturalLanguageQueryPanel
                  target="chart"
                  currentView={chartConfig.request.view}
                  showSnapshotHistory={false}
                  snapshotToOpen={
                    chartLunaLaunch?.mode === "build"
                      ? chartLunaLaunch.snapshot
                      : null
                  }
                  onApply={(compiled) => {
                    if (compiled.chartConfig) {
                      setChartConfig(
                        normalizeChartConfigForClient(compiled.chartConfig),
                      );
                      setChartTableSort(null);
                      setChartError(null);
                    }
                  }}
                />
              }
              resultsCommand={
                <CurrentViewQuestionPanel
                  context="chart"
                  request={chartRequest}
                  showSnapshotHistory={false}
                  snapshotToOpen={
                    chartLunaLaunch?.mode === "results"
                      ? chartLunaLaunch.snapshot
                      : null
                  }
                />
              }
            />

            <section className="query-panel chart-builder">
              <div className="search-row">
                <div className="search-input">
                  <Search size={18} />
                  <input
                    value={chartConfig.request.searchText}
                    onChange={(event) =>
                      updateChartConfig({
                        request: {
                          ...chartConfig.request,
                          searchText: event.target.value,
                          offset: 0,
                        },
                      })
                    }
                    placeholder={`Search within chart ${
                      chartConfig.request.view === "tracks" ? "tracks" : "albums"
                    }, artists, genres, publishers`}
                  />
                </div>

                <div
                  className="segmented-control chart-content-control"
                  aria-label="Chart content"
                >
                  <button
                    className={
                      chartConfig.request.view === "albums" ? "active" : ""
                    }
                    type="button"
                    onClick={() => setChartBrowseView("albums")}
                  >
                    <Album size={16} />
                    <span>Albums</span>
                  </button>
                  <button
                    className={
                      chartConfig.request.view === "tracks" ? "active" : ""
                    }
                    type="button"
                    onClick={() => setChartBrowseView("tracks")}
                  >
                    <ListMusic size={16} />
                    <span>Tracks</span>
                  </button>
                </div>

                <div
                  className="segmented-control chart-display-control"
                  aria-label="Chart view mode"
                >
                  {chartViewModes.map((mode) => {
                    const Icon = mode.icon;
                    return (
                      <button
                        className={
                          chartConfig.viewMode === mode.value ? "active" : ""
                        }
                        type="button"
                        key={mode.value}
                        onClick={() =>
                          updateChartConfig({ viewMode: mode.value })
                        }
                      >
                        <Icon size={16} />
                        <span>{mode.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div
                className="filter-grid chart-common-filter-grid"
                aria-label="Common chart controls"
              >
                <SelectField
                  label="Ranking"
                  value={chartConfig.rankingMetric}
                  onChange={(rankingMetric) =>
                    updateChartConfig({ rankingMetric })
                  }
                  options={
                    chartConfig.request.view === "tracks"
                      ? trackRankingOptions
                      : albumRankingOptions
                  }
                />
                <SelectField
                  label="Direction"
                  value={chartConfig.sortDirection}
                  onChange={(sortDirection) =>
                    updateChartConfig({
                      sortDirection: sortDirection as "asc" | "desc",
                    })
                  }
                  options={[
                    { value: "desc", label: "Descending" },
                    { value: "asc", label: "Ascending" },
                  ]}
                />
                <GenreListCriterion
                  label="Genres"
                  values={chartConfig.request.filters.genres}
                  onChange={(genres) => updateChartFilters({ genres })}
                  genreOptions={genreSuggestionOptions}
                  onRequestOptions={requestGenreSuggestionRefresh}
                  placeholder="Synthpop, AOR"
                />
                <NumberField
                  label="Year from"
                  value={chartConfig.request.filters.yearFrom}
                  onChange={(value) => updateChartFilters({ yearFrom: value })}
                />
                <NumberField
                  label="Year to"
                  value={chartConfig.request.filters.yearTo}
                  onChange={(value) => updateChartFilters({ yearTo: value })}
                />
                <GenreListCriterion
                  label="Exclude genres"
                  values={chartConfig.request.filters.excludedGenres}
                  onChange={(excludedGenres) =>
                    updateChartFilters({ excludedGenres })
                  }
                  genreOptions={genreSuggestionOptions}
                  onRequestOptions={requestGenreSuggestionRefresh}
                />
              </div>

              <ChartAdvancedControls
                activeControlCount={advancedChartControlCount}
              >
                {chartConfig.request.view === "albums" ? (
                  <>
                    <div className="chart-advanced-section-heading">
                      <div>
                        <strong>Built-in charts</strong>
                        <small>
                          Start from a focused ranking, then refine any control.
                        </small>
                      </div>
                    </div>
                    <section
                      className="chart-template-panel"
                      aria-label="Built-in charts"
                    >
                      {chartTemplates.map((template) => {
                        const Icon = template.icon;
                        return (
                          <button
                            type="button"
                            key={template.id}
                            onClick={() => applyChartTemplate(template)}
                          >
                            <Icon size={17} />
                            <span>
                              <strong>{template.label}</strong>
                              <small>{template.description}</small>
                            </span>
                          </button>
                        );
                      })}
                    </section>
                  </>
                ) : null}

                <ChartFiltersDisclosure
                  activeFilterCount={chartSourceFilterCount}
                >
                  <ChartFilterSourceGroup
                    title="US · Billboard"
                    description={
                      chartConfig.request.view === "tracks"
                        ? "Year-end single peak and exact chart-entry date."
                        : "Year-end album peak and first chart week."
                    }
                  >
                    <NumberField
                      label="Rank min"
                      value={
                        chartConfig.request.view === "tracks"
                          ? chartConfig.request.filters.billboardSingleRankMin
                          : chartConfig.request.filters.billboardRankMin
                      }
                      min={1}
                      onChange={(value) =>
                        chartConfig.request.view === "tracks"
                          ? updateChartFilters({ billboardSingleRankMin: value })
                          : updateChartFilters({ billboardRankMin: value })
                      }
                    />
                    <NumberField
                      label="Rank max"
                      value={
                        chartConfig.request.view === "tracks"
                          ? chartConfig.request.filters.billboardSingleRankMax
                          : chartConfig.request.filters.billboardRankMax
                      }
                      min={1}
                      onChange={(value) =>
                        chartConfig.request.view === "tracks"
                          ? updateChartFilters({ billboardSingleRankMax: value })
                          : updateChartFilters({ billboardRankMax: value })
                      }
                    />
                    {chartConfig.request.view === "tracks" ? (
                      <>
                        <DateField
                          label="Debut from"
                          value={
                            chartConfig.request.filters
                              .billboardSingleDebutDateFrom
                          }
                          onChange={(billboardSingleDebutDateFrom) =>
                            updateChartFilters({
                              billboardSingleDebutDateFrom,
                            })
                          }
                        />
                        <DateField
                          label="Debut to"
                          value={
                            chartConfig.request.filters
                              .billboardSingleDebutDateTo
                          }
                          onChange={(billboardSingleDebutDateTo) =>
                            updateChartFilters({ billboardSingleDebutDateTo })
                          }
                        />
                      </>
                    ) : (
                      <>
                        <WeekField
                          label="Debut from"
                          value={
                            chartConfig.request.filters.billboardDebutWeekFrom
                          }
                          onChange={(billboardDebutWeekFrom) =>
                            updateChartFilters({ billboardDebutWeekFrom })
                          }
                        />
                        <WeekField
                          label="Debut to"
                          value={
                            chartConfig.request.filters.billboardDebutWeekTo
                          }
                          onChange={(billboardDebutWeekTo) =>
                            updateChartFilters({ billboardDebutWeekTo })
                          }
                        />
                      </>
                    )}
                  </ChartFilterSourceGroup>

                  <ChartFilterSourceGroup
                    title="UK · Official Charts"
                    description="Official UK weekly chart history."
                  >
                    <NumberField
                      label="Rank min"
                      value={chartConfig.request.filters.officialUkRankMin}
                      min={1}
                      onChange={(officialUkRankMin) =>
                        updateChartFilters({ officialUkRankMin })
                      }
                    />
                    <NumberField
                      label="Rank max"
                      value={chartConfig.request.filters.officialUkRankMax}
                      min={1}
                      onChange={(officialUkRankMax) =>
                        updateChartFilters({ officialUkRankMax })
                      }
                    />
                    <WeekField
                      label="Debut from"
                      value={
                        chartConfig.request.filters.officialUkDebutWeekFrom
                      }
                      onChange={(officialUkDebutWeekFrom) =>
                        updateChartFilters({ officialUkDebutWeekFrom })
                      }
                    />
                    <WeekField
                      label="Debut to"
                      value={chartConfig.request.filters.officialUkDebutWeekTo}
                      onChange={(officialUkDebutWeekTo) =>
                        updateChartFilters({ officialUkDebutWeekTo })
                      }
                    />
                  </ChartFilterSourceGroup>

                  <ChartFilterSourceGroup
                    title="NO · VG Lista"
                    description="Official Norwegian weekly chart history."
                  >
                    <NumberField
                      label="Rank min"
                      value={chartConfig.request.filters.vgListaRankMin}
                      min={1}
                      onChange={(vgListaRankMin) =>
                        updateChartFilters({ vgListaRankMin })
                      }
                    />
                    <NumberField
                      label="Rank max"
                      value={chartConfig.request.filters.vgListaRankMax}
                      min={1}
                      onChange={(vgListaRankMax) =>
                        updateChartFilters({ vgListaRankMax })
                      }
                    />
                    <WeekField
                      label="Debut from"
                      value={chartConfig.request.filters.vgListaDebutWeekFrom}
                      onChange={(vgListaDebutWeekFrom) =>
                        updateChartFilters({ vgListaDebutWeekFrom })
                      }
                    />
                    <WeekField
                      label="Debut to"
                      value={chartConfig.request.filters.vgListaDebutWeekTo}
                      onChange={(vgListaDebutWeekTo) =>
                        updateChartFilters({ vgListaDebutWeekTo })
                      }
                    />
                  </ChartFilterSourceGroup>

                  <ChartFilterSourceGroup
                    title="NO · Ti i Skuddet"
                    description="Unofficial Norwegian singles chart history."
                    unavailableMessage={
                      chartConfig.request.view === "tracks"
                        ? undefined
                        : "Tracks-only source. Switch to Tracks to use rank and debut filters."
                    }
                    unavailableAction={
                      chartConfig.request.view === "tracks" ? undefined : (
                        <button
                          className="secondary-button chart-filter-source-action"
                          type="button"
                          onClick={() => setChartBrowseView("tracks")}
                        >
                          <ListMusic size={15} />
                          <span>Switch to Tracks</span>
                        </button>
                      )
                    }
                  >
                      <NumberField
                        label="Rank min"
                        value={chartConfig.request.filters.tiISkuddetRankMin}
                        min={1}
                        onChange={(tiISkuddetRankMin) =>
                          updateChartFilters({ tiISkuddetRankMin })
                        }
                      />
                      <NumberField
                        label="Rank max"
                        value={chartConfig.request.filters.tiISkuddetRankMax}
                        min={1}
                        onChange={(tiISkuddetRankMax) =>
                          updateChartFilters({ tiISkuddetRankMax })
                        }
                      />
                      <WeekField
                        label="Debut from"
                        value={
                          chartConfig.request.filters
                            .tiISkuddetDebutWeekFrom
                        }
                        onChange={(tiISkuddetDebutWeekFrom) =>
                          updateChartFilters({ tiISkuddetDebutWeekFrom })
                        }
                      />
                      <WeekField
                        label="Debut to"
                        value={
                          chartConfig.request.filters.tiISkuddetDebutWeekTo
                        }
                        onChange={(tiISkuddetDebutWeekTo) =>
                          updateChartFilters({ tiISkuddetDebutWeekTo })
                        }
                      />
                  </ChartFilterSourceGroup>
                  <ChartFilterSourceGroup
                    title="NO · Norsktoppen"
                    description="Norwegian-language singles chart history."
                    unavailableMessage={
                      chartConfig.request.view === "tracks"
                        ? undefined
                        : "Tracks-only source. Switch to Tracks to use rank and debut filters."
                    }
                    unavailableAction={
                      chartConfig.request.view === "tracks" ? undefined : (
                        <button
                          className="secondary-button chart-filter-source-action"
                          type="button"
                          onClick={() => setChartBrowseView("tracks")}
                        >
                          <ListMusic size={15} />
                          <span>Switch to Tracks</span>
                        </button>
                      )
                    }
                  >
                      <NumberField
                        label="Rank min"
                        value={chartConfig.request.filters.norsktoppenRankMin}
                        min={1}
                        onChange={(norsktoppenRankMin) =>
                          updateChartFilters({ norsktoppenRankMin })
                        }
                      />
                      <NumberField
                        label="Rank max"
                        value={chartConfig.request.filters.norsktoppenRankMax}
                        min={1}
                        onChange={(norsktoppenRankMax) =>
                          updateChartFilters({ norsktoppenRankMax })
                        }
                      />
                      <WeekField
                        label="Debut from"
                        value={
                          chartConfig.request.filters
                            .norsktoppenDebutWeekFrom
                        }
                        onChange={(norsktoppenDebutWeekFrom) =>
                          updateChartFilters({ norsktoppenDebutWeekFrom })
                        }
                      />
                      <WeekField
                        label="Debut to"
                        value={
                          chartConfig.request.filters.norsktoppenDebutWeekTo
                        }
                        onChange={(norsktoppenDebutWeekTo) =>
                          updateChartFilters({ norsktoppenDebutWeekTo })
                        }
                      />
                  </ChartFilterSourceGroup>
                </ChartFiltersDisclosure>

                <div className="filter-grid chart-advanced-filter-grid">
                <NumberField
                  label="Limit"
                  value={chartConfig.resultLimit}
                  min={10}
                  max={500}
                  onChange={(value) =>
                    updateChartConfig({ resultLimit: value ?? 50 })
                  }
                />
                <CountryListCriterion
                  label="Origin countries"
                  values={chartConfig.request.filters.originCountryCodes}
                  onChange={(originCountryCodes) =>
                    updateChartFilters({ originCountryCodes })
                  }
                  countryOptions={originCountryOptions}
                  displayMode={settings.countryFlagDisplay}
                />
                <CountryListCriterion
                  label="Exclude origin countries"
                  values={
                    chartConfig.request.filters.excludedOriginCountryCodes
                  }
                  onChange={(excludedOriginCountryCodes) =>
                    updateChartFilters({ excludedOriginCountryCodes })
                  }
                  countryOptions={originCountryOptions}
                  displayMode={settings.countryFlagDisplay}
                />
                <SelectField
                  label="Artist type"
                  value={chartConfig.request.filters.artistType}
                  onChange={(artistType) => updateChartFilters({ artistType })}
                  options={artistTypeOptions}
                />
                <SelectField
                  label="Gender"
                  value={chartConfig.request.filters.artistGender}
                  onChange={(artistGender) =>
                    updateChartFilters({ artistGender })
                  }
                  options={artistGenderOptions}
                />
                <TextCriterion
                  label={
                    chartConfig.request.view === "tracks"
                      ? "Display artist"
                      : "Album artist"
                  }
                  filter={
                    chartConfig.request.view === "tracks"
                      ? chartConfig.request.filters.displayArtist
                      : chartConfig.request.filters.albumArtist
                  }
                  onChange={(filter) =>
                    chartConfig.request.view === "tracks"
                      ? updateChartFilters({ displayArtist: filter })
                      : updateChartFilters({ albumArtist: filter })
                  }
                />
                <TextCriterion
                  label={
                    chartConfig.request.view === "tracks"
                      ? "Track title"
                      : "Album title"
                  }
                  filter={
                    chartConfig.request.view === "tracks"
                      ? chartConfig.request.filters.trackTitle
                      : chartConfig.request.filters.albumTitle
                  }
                  onChange={(filter) =>
                    chartConfig.request.view === "tracks"
                      ? updateChartFilters({ trackTitle: filter })
                      : updateChartFilters({ albumTitle: filter })
                  }
                />
                <TextCriterion
                  label="Publisher"
                  filter={chartConfig.request.filters.publisher}
                  onChange={(filter) =>
                    updateChartFilters({ publisher: filter })
                  }
                />
                <NumberField
                  label="Born after"
                  value={chartConfig.request.filters.artistBornYearFrom}
                  onChange={(value) =>
                    updateChartFilters({ artistBornYearFrom: value })
                  }
                />
                <NumberField
                  label="Born before"
                  value={chartConfig.request.filters.artistBornYearTo}
                  onChange={(value) =>
                    updateChartFilters({ artistBornYearTo: value })
                  }
                />
                <NumberField
                  label="Died after"
                  value={chartConfig.request.filters.artistDiedYearFrom}
                  onChange={(value) =>
                    updateChartFilters({ artistDiedYearFrom: value })
                  }
                />
                <NumberField
                  label="Died before"
                  value={chartConfig.request.filters.artistDiedYearTo}
                  onChange={(value) =>
                    updateChartFilters({ artistDiedYearTo: value })
                  }
                />
                <NumberField
                  label="Founded after"
                  value={chartConfig.request.filters.artistFoundedYearFrom}
                  onChange={(value) =>
                    updateChartFilters({ artistFoundedYearFrom: value })
                  }
                />
                <NumberField
                  label="Founded before"
                  value={chartConfig.request.filters.artistFoundedYearTo}
                  onChange={(value) =>
                    updateChartFilters({ artistFoundedYearTo: value })
                  }
                />
                <NumberField
                  label="Dissolved after"
                  value={chartConfig.request.filters.artistDissolvedYearFrom}
                  onChange={(value) =>
                    updateChartFilters({ artistDissolvedYearFrom: value })
                  }
                />
                <NumberField
                  label="Dissolved before"
                  value={chartConfig.request.filters.artistDissolvedYearTo}
                  onChange={(value) =>
                    updateChartFilters({ artistDissolvedYearTo: value })
                  }
                />
                <NumberField
                  label="Minutes min"
                  value={chartConfig.request.filters.totalMinutesMin}
                  step={0.5}
                  onChange={(value) =>
                    updateChartFilters({ totalMinutesMin: value })
                  }
                />
                <NumberField
                  label="Minutes max"
                  value={chartConfig.request.filters.totalMinutesMax}
                  step={0.5}
                  onChange={(value) =>
                    updateChartFilters({ totalMinutesMax: value })
                  }
                />
                <NumberField
                  label="Album rating min"
                  value={chartConfig.request.filters.albumRatingMin}
                  min={0}
                  max={100}
                  onChange={(value) =>
                    updateChartFilters({ albumRatingMin: value })
                  }
                />
                <NumberField
                  label="Album rating max"
                  value={chartConfig.request.filters.albumRatingMax}
                  min={0}
                  max={100}
                  onChange={(value) =>
                    updateChartFilters({ albumRatingMax: value })
                  }
                />
                <NumberField
                  label="Loved min"
                  value={chartConfig.request.filters.lovedTracksMin}
                  min={0}
                  onChange={(value) =>
                    updateChartFilters({ lovedTracksMin: value })
                  }
                />
                <NumberField
                  label="Loved max"
                  value={chartConfig.request.filters.lovedTracksMax}
                  min={0}
                  onChange={(value) =>
                    updateChartFilters({ lovedTracksMax: value })
                  }
                />
                <CompletenessRangeCriterion
                  minValue={currentChartCompletenessRange.min}
                  maxValue={currentChartCompletenessRange.max}
                  className="chart-slider"
                  onChange={(range) =>
                    updateChartConfig({
                      ratingCompletenessMin: range.min,
                      ratingCompletenessMax: range.max,
                      ratingCompletenessThreshold: null,
                    })
                  }
                />
                {chartConfig.viewMode === "grid" ? (
                  <label className="criterion slider-criterion chart-slider">
                    <span>Cover size</span>
                    <div>
                      <input
                        type="range"
                        min={chartGridCoverSize.min}
                        max={chartGridCoverSize.max}
                        step={chartGridCoverSize.step}
                        value={currentChartGridCoverSize}
                        onChange={(event) =>
                          updateChartConfig({
                            gridCoverSize: Number(event.target.value),
                          })
                        }
                      />
                      <strong>{currentChartGridCoverSize}px</strong>
                    </div>
                  </label>
                ) : null}
              </div>

              <div className="query-footer chart-options">
                <div
                  className="missing-flags"
                  aria-label="Visible chart columns"
                >
                  {chartColumnOptions
                    .filter((option) =>
                      chartConfig.request.view === "tracks"
                        ? [
                            "originCountry",
                            "billboardSingle",
                            "billboardSingleDebut",
                            "vgLista",
                            "vgListaDebut",
                            "officialUk",
                            "officialUkDebut",
                            "tiISkuddet",
                            "tiISkuddetDebut",
                            "norsktoppen",
                            "norsktoppenDebut",
                            "trackRating",
                          ].includes(option.value)
                        : ![
                            "billboardSingle",
                            "billboardSingleDebut",
                            "tiISkuddet",
                            "tiISkuddetDebut",
                            "norsktoppen",
                            "norsktoppenDebut",
                            "trackRating",
                          ].includes(option.value),
                    )
                    .map((option) => (
                    <label key={option.value}>
                      <input
                        type="checkbox"
                        checked={chartConfig.visibleColumns.includes(
                          option.value,
                        )}
                        onChange={() =>
                          toggleChartColumn(option.value, "visibleColumns")
                        }
                      />
                      <span>{option.label}</span>
                    </label>
                    ))}
                </div>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={chartConfig.exportColumns.includes("calculated")}
                    onChange={() =>
                      toggleChartColumn("calculated", "exportColumns")
                    }
                  />
                  <span>Calculated export columns</span>
                </label>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={chartConfig.request.filters.missingOriginCountry}
                    onChange={(event) =>
                      updateChartFilters({
                        missingOriginCountry: event.target.checked,
                      })
                    }
                  />
                  <span>Missing origin country</span>
                </label>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={chartConfig.request.filters.artistDied}
                    onChange={(event) =>
                      updateChartFilters({
                        artistDied: event.target.checked,
                      })
                    }
                  />
                  <span>Dead artists</span>
                </label>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={chartConfig.request.filters.artistDissolved}
                    onChange={(event) =>
                      updateChartFilters({
                        artistDissolved: event.target.checked,
                      })
                    }
                  />
                  <span>Dissolved groups</span>
                </label>
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={chartConfig.exportColumns.includes(
                      "originCountry",
                    )}
                    onChange={() =>
                      toggleChartColumn("originCountry", "exportColumns")
                    }
                  />
                  <span>Origin country export column</span>
                </label>
              </div>
              </ChartAdvancedControls>
            </section>

            <TransitionRegion><section className="table-panel" aria-label="Chart results">
              <div className="panel-heading compact">
                <div>
                  <h2>{rankingLabel(chartConfig.rankingMetric)} chart</h2>
                  <p>
                    {isChartLoading
                      ? "Ranking"
                      : `${formatNumber(chartRows)} shown from ${formatNumber(chartTotal)} matches`}
                  </p>
                </div>
                <span className="run-status">
                  {chartConfig.request.view === "tracks"
                    ? "Track chart"
                    : `${formatCompletenessRange(
                        currentChartCompletenessRange.min,
                        currentChartCompletenessRange.max,
                      )} complete`}
                </span>
              </div>

              {chartError ? (
                <p className="error-message">{chartError}</p>
              ) : null}
              <ChartResults
                response={chartResponse}
                config={chartConfig}
                displaySort={chartTableSort}
                onSort={sortChartBy}
                countryFlagDisplay={settings.countryFlagDisplay}
                onOpenAlbum={openTimelineAlbum}
                onOpenArtist={openArtistFromMusicMap}
                onOpenGenre={openGenreFromBrowse}
              />
            </section></TransitionRegion>
          </section>
        );
}
