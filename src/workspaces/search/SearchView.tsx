import { SearchWorkspace } from "../SearchWorkspace";
import {
  RotateCcw,
  Database,
  ListMusic,
  Album,
  Search,
  Save,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Metric } from "../../components/catalog/CatalogValues";
import { formatNumber } from "../../app/display";
import {
  SearchLunaCommandArea,
  SearchAdvancedFilters,
  ChartFiltersDisclosure,
  ChartFilterSourceGroup,
} from "../../components/SearchProgressiveDisclosure";
import { NaturalLanguageQueryPanel } from "../../components/NaturalLanguageQueryPanel";
import {
  normalizeBrowseRequestForClient,
  toCompletenessFilterRange,
} from "../../app/requests";
import { CurrentViewQuestionPanel } from "../../components/CurrentViewQuestionPanel";
import {
  TextCriterion,
  GenreListCriterion,
  NumberField,
  DateField,
  WeekField,
  CountryListCriterion,
  SelectField,
  CompletenessRangeCriterion,
} from "../../components/catalog/SearchCriteria";
import {
  artistTypeOptions,
  artistGenderOptions,
  missingFieldOptions,
  missingFieldLabel,
  searchTableColumnOptions,
  searchTableColumnLabel,
} from "../../app/config";
import { ResultTable } from "../albums/AlbumPanels";
import type { AppModel } from "../../app/useAppController";
export function SearchView({
  model,
}: {
  model: Pick<
    AppModel,
    | "clearQuery"
    | "loadData"
    | "status"
    | "total"
    | "savedSearches"
    | "searchLunaLaunch"
    | "request"
    | "setRequest"
    | "setBrowseError"
    | "setView"
    | "currentFilters"
    | "updateFilter"
    | "genreSuggestionOptions"
    | "requestGenreSuggestionRefresh"
    | "advancedSearchFilterCount"
    | "searchChartFilterCount"
    | "originCountryOptions"
    | "settings"
    | "updateFilters"
    | "chartConfig"
    | "updateChartFilters"
    | "searchTableColumns"
    | "toggleSearchTableColumn"
    | "chips"
    | "isSearching"
    | "pageStart"
    | "pageEnd"
    | "browseError"
    | "response"
    | "sortSearchBy"
    | "openTimelineAlbum"
    | "openArtistFromMusicMap"
    | "openGenreFromBrowse"
  >;
}) {
  const {
    clearQuery,
    loadData,
    status,
    total,
    savedSearches,
    searchLunaLaunch,
    request,
    setRequest,
    setBrowseError,
    setView,
    currentFilters,
    updateFilter,
    genreSuggestionOptions,
    requestGenreSuggestionRefresh,
    advancedSearchFilterCount,
    searchChartFilterCount,
    originCountryOptions,
    settings,
    updateFilters,
    chartConfig,
    updateChartFilters,
    searchTableColumns,
    toggleSearchTableColumn,
    chips,
    isSearching,
    pageStart,
    pageEnd,
    browseError,
    response,
    sortSearchBy,
    openTimelineAlbum,
    openArtistFromMusicMap,
    openGenreFromBrowse,
  } = model;
  return (
    <SearchWorkspace
      actions={
        <>
          <button
            className="icon-button"
            type="button"
            aria-label="Clear query"
            onClick={clearQuery}
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
        </>
      }
    >
      <section className="metric-grid" aria-label="Library summary">
        <Metric
          label="Tracks"
          value={formatNumber(status?.trackCount)}
          tone="teal"
          icon={ListMusic}
        />
        <Metric
          label="Albums"
          value={formatNumber(status?.albumCount)}
          tone="amber"
          icon={Album}
        />
        <Metric label="Matches" value={formatNumber(total)} icon={Search} />
        <Metric
          label="Saved"
          value={formatNumber(savedSearches.length)}
          icon={Save}
        />
      </section>

      <SearchLunaCommandArea
        launch={searchLunaLaunch}
        searchCommand={
          <NaturalLanguageQueryPanel
            target="search"
            currentView={request.view}
            showSnapshotHistory={false}
            snapshotToOpen={
              searchLunaLaunch?.mode === "build"
                ? searchLunaLaunch.snapshot
                : null
            }
            onApply={(compiled) => {
              setRequest(normalizeBrowseRequestForClient(compiled.request));
              setBrowseError(null);
            }}
          />
        }
        resultsCommand={
          <CurrentViewQuestionPanel
            context="search"
            request={request}
            showSnapshotHistory={false}
            snapshotToOpen={
              searchLunaLaunch?.mode === "results"
                ? searchLunaLaunch.snapshot
                : null
            }
          />
        }
      />

      <section className="query-panel">
        <div className="search-row">
          <div className="search-input">
            <Search size={18} />
            <input
              value={request.searchText}
              onChange={(event) =>
                setRequest((previous) => ({
                  ...previous,
                  searchText: event.target.value,
                  offset: 0,
                }))
              }
              placeholder="Search albums, artists, genres, tracks, publishers, files"
            />
          </div>

          <div className="segmented-control" aria-label="Browse view">
            <button
              className={request.view === "albums" ? "active" : ""}
              type="button"
              onClick={() => setView("albums")}
            >
              <Album size={16} />
              <span>Albums</span>
            </button>
            <button
              className={request.view === "tracks" ? "active" : ""}
              type="button"
              onClick={() => setView("tracks")}
            >
              <ListMusic size={16} />
              <span>Tracks</span>
            </button>
          </div>
        </div>

        <div
          className="filter-grid search-common-filter-grid"
          aria-label="Common filters"
        >
          {request.view === "albums" ? (
            <>
              <TextCriterion
                label="Album title"
                filter={currentFilters.albumTitle}
                onChange={(filter) => updateFilter("albumTitle", filter)}
              />
              <TextCriterion
                label="Album artist"
                filter={currentFilters.albumArtist}
                onChange={(filter) => updateFilter("albumArtist", filter)}
              />
            </>
          ) : (
            <>
              <TextCriterion
                label="Track title"
                filter={currentFilters.trackTitle}
                onChange={(filter) => updateFilter("trackTitle", filter)}
              />
              <TextCriterion
                label="Display artist"
                filter={currentFilters.displayArtist}
                onChange={(filter) => updateFilter("displayArtist", filter)}
              />
            </>
          )}
          <GenreListCriterion
            label="Genres"
            values={currentFilters.genres}
            onChange={(genres) => updateFilter("genres", genres)}
            genreOptions={genreSuggestionOptions}
            onRequestOptions={requestGenreSuggestionRefresh}
            placeholder="Synthpop, AOR"
          />
          <NumberField
            label="Year from"
            value={currentFilters.yearFrom}
            onChange={(value) => updateFilter("yearFrom", value)}
          />
          <NumberField
            label="Year to"
            value={currentFilters.yearTo}
            onChange={(value) => updateFilter("yearTo", value)}
          />
          <GenreListCriterion
            label="Exclude genres"
            values={currentFilters.excludedGenres}
            onChange={(excludedGenres) =>
              updateFilter("excludedGenres", excludedGenres)
            }
            genreOptions={genreSuggestionOptions}
            onRequestOptions={requestGenreSuggestionRefresh}
          />
        </div>

        <SearchAdvancedFilters activeFilterCount={advancedSearchFilterCount}>
          <ChartFiltersDisclosure activeFilterCount={searchChartFilterCount}>
            <ChartFilterSourceGroup
              title="US · Billboard"
              description={
                request.view === "tracks"
                  ? "Album and single year-end chart metadata."
                  : "Year-end album peak and first chart week."
              }
            >
              <NumberField
                label={
                  request.view === "tracks" ? "Album rank min" : "Rank min"
                }
                value={currentFilters.billboardRankMin}
                min={1}
                onChange={(value) => updateFilter("billboardRankMin", value)}
              />
              <NumberField
                label={
                  request.view === "tracks" ? "Album rank max" : "Rank max"
                }
                value={currentFilters.billboardRankMax}
                min={1}
                onChange={(value) => updateFilter("billboardRankMax", value)}
              />
              {request.view === "tracks" ? (
                <>
                  <NumberField
                    label="Single rank min"
                    value={currentFilters.billboardSingleRankMin}
                    min={1}
                    onChange={(value) =>
                      updateFilter("billboardSingleRankMin", value)
                    }
                  />
                  <NumberField
                    label="Single rank max"
                    value={currentFilters.billboardSingleRankMax}
                    min={1}
                    onChange={(value) =>
                      updateFilter("billboardSingleRankMax", value)
                    }
                  />
                  <DateField
                    label="Single debut from"
                    value={currentFilters.billboardSingleDebutDateFrom}
                    onChange={(value) =>
                      updateFilter("billboardSingleDebutDateFrom", value)
                    }
                  />
                  <DateField
                    label="Single debut to"
                    value={currentFilters.billboardSingleDebutDateTo}
                    onChange={(value) =>
                      updateFilter("billboardSingleDebutDateTo", value)
                    }
                  />
                </>
              ) : (
                <>
                  <WeekField
                    label="Debut from"
                    value={currentFilters.billboardDebutWeekFrom}
                    onChange={(value) =>
                      updateFilter("billboardDebutWeekFrom", value)
                    }
                  />
                  <WeekField
                    label="Debut to"
                    value={currentFilters.billboardDebutWeekTo}
                    onChange={(value) =>
                      updateFilter("billboardDebutWeekTo", value)
                    }
                  />
                </>
              )}
            </ChartFilterSourceGroup>

            <ChartFilterSourceGroup
              title="NO · VG Lista"
              description="Official Norwegian weekly chart history."
            >
              <NumberField
                label="Rank min"
                value={currentFilters.vgListaRankMin}
                min={1}
                onChange={(value) => updateFilter("vgListaRankMin", value)}
              />
              <NumberField
                label="Rank max"
                value={currentFilters.vgListaRankMax}
                min={1}
                onChange={(value) => updateFilter("vgListaRankMax", value)}
              />
              <WeekField
                label="Debut from"
                value={currentFilters.vgListaDebutWeekFrom}
                onChange={(value) =>
                  updateFilter("vgListaDebutWeekFrom", value)
                }
              />
              <WeekField
                label="Debut to"
                value={currentFilters.vgListaDebutWeekTo}
                onChange={(value) => updateFilter("vgListaDebutWeekTo", value)}
              />
            </ChartFilterSourceGroup>

            <ChartFilterSourceGroup
              title="UK · Official Charts"
              description="Official UK weekly chart history."
            >
              <NumberField
                label="Rank min"
                value={currentFilters.officialUkRankMin}
                min={1}
                onChange={(value) => updateFilter("officialUkRankMin", value)}
              />
              <NumberField
                label="Rank max"
                value={currentFilters.officialUkRankMax}
                min={1}
                onChange={(value) => updateFilter("officialUkRankMax", value)}
              />
              <WeekField
                label="Debut from"
                value={currentFilters.officialUkDebutWeekFrom}
                onChange={(value) =>
                  updateFilter("officialUkDebutWeekFrom", value)
                }
              />
              <WeekField
                label="Debut to"
                value={currentFilters.officialUkDebutWeekTo}
                onChange={(value) =>
                  updateFilter("officialUkDebutWeekTo", value)
                }
              />
            </ChartFilterSourceGroup>

            <ChartFilterSourceGroup
              title="NO · Ti i Skuddet"
              description="Unofficial Norwegian singles chart history."
              unavailableMessage={
                request.view === "tracks"
                  ? undefined
                  : "Tracks-only source. Switch to Tracks to use rank and debut filters."
              }
              unavailableAction={
                request.view === "tracks" ? undefined : (
                  <button
                    className="secondary-button chart-filter-source-action"
                    type="button"
                    onClick={() => setView("tracks")}
                  >
                    <ListMusic size={15} />
                    <span>Switch to Tracks</span>
                  </button>
                )
              }
            >
              <NumberField
                label="Rank min"
                value={currentFilters.tiISkuddetRankMin}
                min={1}
                onChange={(value) => updateFilter("tiISkuddetRankMin", value)}
              />
              <NumberField
                label="Rank max"
                value={currentFilters.tiISkuddetRankMax}
                min={1}
                onChange={(value) => updateFilter("tiISkuddetRankMax", value)}
              />
              <WeekField
                label="Debut from"
                value={currentFilters.tiISkuddetDebutWeekFrom}
                onChange={(value) =>
                  updateFilter("tiISkuddetDebutWeekFrom", value)
                }
              />
              <WeekField
                label="Debut to"
                value={currentFilters.tiISkuddetDebutWeekTo}
                onChange={(value) =>
                  updateFilter("tiISkuddetDebutWeekTo", value)
                }
              />
            </ChartFilterSourceGroup>
            <ChartFilterSourceGroup
              title="NO · Norsktoppen"
              description="Norwegian-language singles chart history."
              unavailableMessage={
                request.view === "tracks"
                  ? undefined
                  : "Tracks-only source. Switch to Tracks to use rank and debut filters."
              }
              unavailableAction={
                request.view === "tracks" ? undefined : (
                  <button
                    className="secondary-button chart-filter-source-action"
                    type="button"
                    onClick={() => setView("tracks")}
                  >
                    <ListMusic size={15} />
                    <span>Switch to Tracks</span>
                  </button>
                )
              }
            >
              <NumberField
                label="Rank min"
                value={currentFilters.norsktoppenRankMin}
                min={1}
                onChange={(value) => updateFilter("norsktoppenRankMin", value)}
              />
              <NumberField
                label="Rank max"
                value={currentFilters.norsktoppenRankMax}
                min={1}
                onChange={(value) => updateFilter("norsktoppenRankMax", value)}
              />
              <WeekField
                label="Debut from"
                value={currentFilters.norsktoppenDebutWeekFrom}
                onChange={(value) =>
                  updateFilter("norsktoppenDebutWeekFrom", value)
                }
              />
              <WeekField
                label="Debut to"
                value={currentFilters.norsktoppenDebutWeekTo}
                onChange={(value) =>
                  updateFilter("norsktoppenDebutWeekTo", value)
                }
              />
            </ChartFilterSourceGroup>
          </ChartFiltersDisclosure>

          <div className="filter-grid search-advanced-filter-grid">
            {request.view === "tracks" ? (
              <>
                <TextCriterion
                  label="Album title"
                  filter={currentFilters.albumTitle}
                  onChange={(filter) => updateFilter("albumTitle", filter)}
                />
                <TextCriterion
                  label="Album artist"
                  filter={currentFilters.albumArtist}
                  onChange={(filter) => updateFilter("albumArtist", filter)}
                />
              </>
            ) : (
              <>
                <TextCriterion
                  label="Track title"
                  filter={currentFilters.trackTitle}
                  onChange={(filter) => updateFilter("trackTitle", filter)}
                />
                <TextCriterion
                  label="Display artist"
                  filter={currentFilters.displayArtist}
                  onChange={(filter) => updateFilter("displayArtist", filter)}
                />
              </>
            )}
            <CountryListCriterion
              label="Origin countries"
              values={currentFilters.originCountryCodes}
              onChange={(originCountryCodes) =>
                updateFilter("originCountryCodes", originCountryCodes)
              }
              countryOptions={originCountryOptions}
              displayMode={settings.countryFlagDisplay}
            />
            <CountryListCriterion
              label="Exclude origin countries"
              values={currentFilters.excludedOriginCountryCodes}
              onChange={(excludedOriginCountryCodes) =>
                updateFilter(
                  "excludedOriginCountryCodes",
                  excludedOriginCountryCodes,
                )
              }
              countryOptions={originCountryOptions}
              displayMode={settings.countryFlagDisplay}
            />
            <SelectField
              label="Artist type"
              value={currentFilters.artistType}
              onChange={(artistType) => updateFilter("artistType", artistType)}
              options={artistTypeOptions}
            />
            <SelectField
              label="Gender"
              value={currentFilters.artistGender}
              onChange={(artistGender) =>
                updateFilter("artistGender", artistGender)
              }
              options={artistGenderOptions}
            />
            <TextCriterion
              label="Publisher"
              filter={currentFilters.publisher}
              onChange={(filter) => updateFilter("publisher", filter)}
            />
            <label className="criterion">
              <span>Track text</span>
              <input
                value={currentFilters.hasTrackText}
                onChange={(event) =>
                  updateFilter("hasTrackText", event.target.value)
                }
              />
            </label>

            <NumberField
              label="Release from"
              value={currentFilters.releaseYearFrom}
              onChange={(value) => updateFilter("releaseYearFrom", value)}
            />
            <NumberField
              label="Release to"
              value={currentFilters.releaseYearTo}
              onChange={(value) => updateFilter("releaseYearTo", value)}
            />
            <NumberField
              label="Born after"
              value={currentFilters.artistBornYearFrom}
              onChange={(value) => updateFilter("artistBornYearFrom", value)}
            />
            <NumberField
              label="Born before"
              value={currentFilters.artistBornYearTo}
              onChange={(value) => updateFilter("artistBornYearTo", value)}
            />
            <NumberField
              label="Died after"
              value={currentFilters.artistDiedYearFrom}
              onChange={(value) => updateFilter("artistDiedYearFrom", value)}
            />
            <NumberField
              label="Died before"
              value={currentFilters.artistDiedYearTo}
              onChange={(value) => updateFilter("artistDiedYearTo", value)}
            />
            <NumberField
              label="Founded after"
              value={currentFilters.artistFoundedYearFrom}
              onChange={(value) => updateFilter("artistFoundedYearFrom", value)}
            />
            <NumberField
              label="Founded before"
              value={currentFilters.artistFoundedYearTo}
              onChange={(value) => updateFilter("artistFoundedYearTo", value)}
            />
            <NumberField
              label="Dissolved after"
              value={currentFilters.artistDissolvedYearFrom}
              onChange={(value) =>
                updateFilter("artistDissolvedYearFrom", value)
              }
            />
            <NumberField
              label="Dissolved before"
              value={currentFilters.artistDissolvedYearTo}
              onChange={(value) => updateFilter("artistDissolvedYearTo", value)}
            />

            <NumberField
              label="Minutes min"
              value={currentFilters.totalMinutesMin}
              step={0.5}
              onChange={(value) => updateFilter("totalMinutesMin", value)}
            />
            <NumberField
              label="Minutes max"
              value={currentFilters.totalMinutesMax}
              step={0.5}
              onChange={(value) => updateFilter("totalMinutesMax", value)}
            />
            <NumberField
              label="Bitrate min"
              value={currentFilters.bitrateKbpsMin}
              min={0}
              onChange={(value) => updateFilter("bitrateKbpsMin", value)}
            />
            <NumberField
              label="Bitrate max"
              value={currentFilters.bitrateKbpsMax}
              min={0}
              onChange={(value) => updateFilter("bitrateKbpsMax", value)}
            />
            <NumberField
              label="Tracks min"
              value={currentFilters.trackCountMin}
              onChange={(value) => updateFilter("trackCountMin", value)}
            />
            <NumberField
              label="Tracks max"
              value={currentFilters.trackCountMax}
              onChange={(value) => updateFilter("trackCountMax", value)}
            />
            <NumberField
              label="Tracks rated min"
              value={currentFilters.ratedTracksMin}
              min={0}
              onChange={(value) => updateFilter("ratedTracksMin", value)}
            />
            <NumberField
              label="Tracks rated max"
              value={currentFilters.ratedTracksMax}
              min={0}
              onChange={(value) => updateFilter("ratedTracksMax", value)}
            />

            <NumberField
              label="Album rating min"
              value={currentFilters.albumRatingMin}
              min={0}
              max={100}
              onChange={(value) => updateFilter("albumRatingMin", value)}
            />
            <NumberField
              label="Album rating max"
              value={currentFilters.albumRatingMax}
              min={0}
              max={100}
              onChange={(value) => updateFilter("albumRatingMax", value)}
            />
            <NumberField
              label="Track rating min"
              value={currentFilters.trackRatingMin}
              min={0}
              max={5}
              step={0.5}
              onChange={(value) => updateFilter("trackRatingMin", value)}
            />
            <NumberField
              label="Track rating max"
              value={currentFilters.trackRatingMax}
              min={0}
              max={5}
              step={0.5}
              onChange={(value) => updateFilter("trackRatingMax", value)}
            />

            <CompletenessRangeCriterion
              minValue={currentFilters.ratingCompletenessMin}
              maxValue={currentFilters.ratingCompletenessMax}
              onChange={(range) =>
                updateFilters(toCompletenessFilterRange(range.min, range.max))
              }
            />
            {chartConfig.request.view === "tracks" ? (
              <>
                <NumberField
                  label="Track rating min"
                  value={chartConfig.request.filters.trackRatingMin}
                  min={0}
                  max={5}
                  step={0.5}
                  onChange={(value) =>
                    updateChartFilters({ trackRatingMin: value })
                  }
                />
                <NumberField
                  label="Track rating max"
                  value={chartConfig.request.filters.trackRatingMax}
                  min={0}
                  max={5}
                  step={0.5}
                  onChange={(value) =>
                    updateChartFilters({ trackRatingMax: value })
                  }
                />
              </>
            ) : null}
            <NumberField
              label="Loved min"
              value={currentFilters.lovedTracksMin}
              min={0}
              onChange={(value) => updateFilter("lovedTracksMin", value)}
            />
            <NumberField
              label="Loved max"
              value={currentFilters.lovedTracksMax}
              min={0}
              onChange={(value) => updateFilter("lovedTracksMax", value)}
            />
            <TextCriterion
              label="File path"
              filter={currentFilters.filePath}
              onChange={(filter) => updateFilter("filePath", filter)}
            />
            <TextCriterion
              label="Filename"
              filter={currentFilters.filename}
              onChange={(filter) => updateFilter("filename", filter)}
            />
          </div>

          <div className="query-footer">
            <div className="missing-flags" aria-label="Missing metadata">
              <span className="missing-flags-title">Missing fields</span>
              {missingFieldOptions
                .filter(
                  (option) =>
                    request.view === "tracks" ||
                    ![
                      "billboardSingle",
                      "billboardSingleDebut",
                      "tiISkuddet",
                      "tiISkuddetDebut",
                      "norsktoppen",
                      "norsktoppenDebut",
                    ].includes(option.value),
                )
                .map((option) => {
                  const checked = currentFilters.missingFields.includes(
                    option.value,
                  );
                  const label = missingFieldLabel(option.value, request.view);
                  return (
                    <label key={option.value}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          const nextValues = event.target.checked
                            ? [...currentFilters.missingFields, option.value]
                            : currentFilters.missingFields.filter(
                                (value) => value !== option.value,
                              );
                          updateFilter("missingFields", nextValues);
                        }}
                      />
                      <span>{label}</span>
                    </label>
                  );
                })}
              <label>
                <input
                  type="checkbox"
                  checked={currentFilters.missingOriginCountry}
                  onChange={(event) =>
                    updateFilter("missingOriginCountry", event.target.checked)
                  }
                />
                <span>Origin Country</span>
              </label>
            </div>

            <div
              className="missing-flags"
              aria-label="Artist lifecycle filters"
            >
              <span className="missing-flags-title">Artist status</span>
              <label>
                <input
                  type="checkbox"
                  checked={currentFilters.artistDied}
                  onChange={(event) =>
                    updateFilter("artistDied", event.target.checked)
                  }
                />
                <span>Dead artists</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={currentFilters.artistDissolved}
                  onChange={(event) =>
                    updateFilter("artistDissolved", event.target.checked)
                  }
                />
                <span>Dissolved groups</span>
              </label>
            </div>

            <div className="missing-flags" aria-label="Audio quality filters">
              <span className="missing-flags-title">Audio quality</span>
              <label>
                <input
                  type="checkbox"
                  checked={currentFilters.mixedAudioQuality}
                  onChange={(event) =>
                    updateFilter("mixedAudioQuality", event.target.checked)
                  }
                />
                <span>Mixed bitrates</span>
              </label>
            </div>

            <div className="missing-flags" aria-label="Visible Search columns">
              <span className="missing-flags-title">Table columns</span>
              {searchTableColumnOptions
                .filter(
                  (option) =>
                    request.view === "tracks" ||
                    ![
                      "billboardSingle",
                      "billboardSingleDebut",
                      "tiISkuddet",
                      "tiISkuddetDebut",
                      "norsktoppen",
                      "norsktoppenDebut",
                    ].includes(option.value),
                )
                .map((option) => (
                  <label key={option.value}>
                    <input
                      type="checkbox"
                      checked={searchTableColumns.includes(option.value)}
                      onChange={() => toggleSearchTableColumn(option.value)}
                    />
                    <span>{searchTableColumnLabel(option, request.view)}</span>
                  </label>
                ))}
            </div>

            <div className="sort-controls">
              <SelectField
                label="Sort"
                value={request.sort.field}
                onChange={(field) =>
                  setRequest((previous) => ({
                    ...previous,
                    sort: {
                      ...previous.sort,
                      field,
                      direction:
                        field === "random" ? "asc" : previous.sort.direction,
                    },
                    offset: 0,
                  }))
                }
                options={
                  request.view === "tracks"
                    ? [
                        { value: "random", label: "Random" },
                        { value: "title", label: "Title" },
                        { value: "album", label: "Album" },
                        { value: "displayArtist", label: "Display artist" },
                        { value: "year", label: "Year" },
                        { value: "originCountry", label: "Origin country" },
                        {
                          value: "billboardRank",
                          label: "Album Billboard",
                        },
                        {
                          value: "billboardSingleRank",
                          label: "Billboard single",
                        },
                        {
                          value: "billboardSingleDebut",
                          label: "Billboard single debut",
                        },
                        {
                          value: "vgListaRank",
                          label: "VG Lista",
                        },
                        {
                          value: "vgListaDebut",
                          label: "VG Lista debut week",
                        },
                        {
                          value: "officialUkRank",
                          label: "Official UK",
                        },
                        {
                          value: "officialUkDebut",
                          label: "Official UK debut week",
                        },
                        {
                          value: "tiISkuddetRank",
                          label: "Ti i Skuddet",
                        },
                        {
                          value: "tiISkuddetDebut",
                          label: "Ti i Skuddet debut week",
                        },
                        {
                          value: "norsktoppenRank",
                          label: "Norsktoppen",
                        },
                        {
                          value: "norsktoppenDebut",
                          label: "Norsktoppen debut week",
                        },
                        { value: "trackRating", label: "Track rating" },
                        { value: "bitrate", label: "Bitrate" },
                        { value: "trackNumber", label: "Track number" },
                      ]
                    : [
                        { value: "random", label: "Random" },
                        { value: "album", label: "Album" },
                        { value: "artist", label: "Artist" },
                        { value: "year", label: "Year" },
                        { value: "originCountry", label: "Origin country" },
                        { value: "billboardRank", label: "Billboard" },
                        { value: "vgListaRank", label: "VG Lista" },
                        {
                          value: "vgListaDebut",
                          label: "VG Lista debut week",
                        },
                        {
                          value: "officialUkRank",
                          label: "Official UK",
                        },
                        {
                          value: "officialUkDebut",
                          label: "Official UK debut week",
                        },
                        { value: "genre", label: "Genre" },
                        { value: "totalMinutes", label: "Minutes" },
                        { value: "trackCount", label: "Tracks" },
                        { value: "bitrate", label: "Lowest bitrate" },
                        { value: "albumRating", label: "Rating" },
                        {
                          value: "ratingCompleteness",
                          label: "Completeness",
                        },
                        { value: "lovedTracks", label: "Loved" },
                        { value: "albumScore", label: "Score" },
                      ]
                }
              />
              <SelectField
                label="Direction"
                value={request.sort.direction}
                disabled={request.sort.field === "random"}
                onChange={(direction) =>
                  setRequest((previous) => ({
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
                value={request.limit}
                min={10}
                max={500}
                onChange={(value) =>
                  setRequest((previous) => ({
                    ...previous,
                    limit: value ?? 50,
                    offset: 0,
                  }))
                }
              />
            </div>
          </div>
        </SearchAdvancedFilters>

        <div className="chip-row" aria-label="Active filters">
          {chips.length === 0 ? (
            <span className="chip-empty">No active filters</span>
          ) : (
            chips.map((chip) => (
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
      </section>

      <section className="table-panel" aria-label="Search results">
        <div className="panel-heading compact">
          <div>
            <h2>{request.view === "albums" ? "Album table" : "Track table"}</h2>
            <p>
              {isSearching
                ? "Searching"
                : `${formatNumber(pageStart)}-${formatNumber(pageEnd)} of ${formatNumber(total)}`}
            </p>
          </div>
          <div className="pager">
            <button
              className="icon-button"
              type="button"
              aria-label="Previous page"
              disabled={request.offset === 0}
              onClick={() =>
                setRequest((previous) => ({
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
              aria-label="Next page"
              disabled={request.offset + request.limit >= total}
              onClick={() =>
                setRequest((previous) => ({
                  ...previous,
                  offset: previous.offset + previous.limit,
                }))
              }
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>

        {browseError ? <p className="error-message">{browseError}</p> : null}
        <ResultTable
          unbounded
          response={response}
          sort={request.sort}
          onSort={sortSearchBy}
          countryFlagDisplay={settings.countryFlagDisplay}
          visibleColumns={searchTableColumns}
          onOpenAlbum={openTimelineAlbum}
          onOpenArtist={openArtistFromMusicMap}
          onOpenGenre={openGenreFromBrowse}
        />
      </section>
    </SearchWorkspace>
  );
}
