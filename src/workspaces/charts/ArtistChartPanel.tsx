import type { ReactNode } from "react";
import { FileSearch, Search, Users } from "lucide-react";
import {
  albumChartSourceOptions,
  artistChartMetricLabel,
  artistChartMetricOptions,
  countArtistChartFilters,
  singleChartSourceOptions,
} from "../../app/artistChart";
import { artistGenderOptions, artistTypeOptions } from "../../app/config";
import { formatNumber } from "../../app/display";
import {
  CountryListCriterion,
  GenreListCriterion,
  NumberField,
  SelectField,
} from "../../components/catalog/SearchCriteria";
import { ChartAdvancedControls } from "../../components/SearchProgressiveDisclosure";
import { TransitionRegion } from "../../components/TransitionRegion";
import type {
  ArtistChartRequest,
  ArtistChartResponse,
  ArtistChartRow,
  BrowseFilters,
  CountryFlagDisplay,
  MusicBrainzOriginCountryOption,
} from "../../types";
import { TableEntityButton } from "../albums/AlbumPanels";

type Props = {
  request: ArtistChartRequest;
  response: ArtistChartResponse | null;
  error: string | null;
  isLoading: boolean;
  genreOptions: string[];
  onRequestGenreOptions: () => void;
  countryOptions: MusicBrainzOriginCountryOption[];
  countryFlagDisplay: CountryFlagDisplay;
  contentControl: ReactNode;
  onChange: (values: Partial<ArtistChartRequest>) => void;
  onChangeFilters: (values: Partial<BrowseFilters>) => void;
  onOpenArtist: (artistKey: string, artistName: string) => void;
};

const columns: {
  metric: string;
  label: string;
  value: (row: ArtistChartRow) => string;
}[] = [
  { metric: "albums", label: "Albums", value: (row) => formatNumber(row.albumCount) },
  { metric: "tracks", label: "Tracks", value: (row) => formatNumber(row.trackCount) },
  { metric: "fiveStarTracks", label: "5★ tracks", value: (row) => formatNumber(row.fiveStarTracks) },
  { metric: "lovedTracks", label: "Loved", value: (row) => formatNumber(row.lovedTracks) },
  { metric: "chartedAlbums", label: "Charted albums", value: (row) => formatNumber(row.chartedAlbums) },
  { metric: "chartedTracks", label: "Charted tracks", value: (row) => formatNumber(row.chartedTracks) },
  { metric: "completeAlbums", label: "100% rated", value: (row) => formatNumber(row.completeAlbums) },
  {
    metric: "averageAlbumScore",
    label: "Avg score",
    value: (row) =>
      row.averageAlbumScore == null ? "" : row.averageAlbumScore.toFixed(1),
  },
];

function toggleSource(selected: string[], source: string) {
  return selected.includes(source)
    ? selected.filter((item) => item !== source)
    : [...selected, source];
}

export function ArtistChartPanel({
  request,
  response,
  error,
  isLoading,
  genreOptions,
  onRequestGenreOptions,
  countryOptions,
  countryFlagDisplay,
  contentControl,
  onChange,
  onChangeFilters,
  onOpenArtist,
}: Props) {
  const filters = request.filters;
  const metric = request.metric;

  return (
    <>
      <section className="query-panel chart-builder artist-chart-builder">
        <div className="search-row">
          <div className="search-input">
            <Search size={18} />
            <input
              value={request.searchText}
              onChange={(event) => onChange({ searchText: event.target.value })}
              placeholder="Search within chart artists"
            />
          </div>
          {contentControl}
        </div>

        <div
          className="filter-grid chart-common-filter-grid"
          aria-label="Common artist chart controls"
        >
          <SelectField
            label="Ranking"
            value={metric}
            onChange={(value) => onChange({ metric: value })}
            options={artistChartMetricOptions}
          />
          <SelectField
            label="Direction"
            value={request.direction}
            onChange={(direction) =>
              onChange({ direction: direction as "asc" | "desc" })
            }
            options={[
              { value: "desc", label: "Descending" },
              { value: "asc", label: "Ascending" },
            ]}
          />
          <GenreListCriterion
            label="Genres"
            values={filters.genres}
            onChange={(genres) => onChangeFilters({ genres })}
            genreOptions={genreOptions}
            onRequestOptions={onRequestGenreOptions}
            placeholder="Synthpop, AOR"
          />
          <GenreListCriterion
            label="Exclude genres"
            values={filters.excludedGenres}
            onChange={(excludedGenres) => onChangeFilters({ excludedGenres })}
            genreOptions={genreOptions}
            onRequestOptions={onRequestGenreOptions}
          />
          <NumberField
            label="Year from"
            value={filters.yearFrom}
            onChange={(yearFrom) => onChangeFilters({ yearFrom })}
          />
          <NumberField
            label="Year to"
            value={filters.yearTo}
            onChange={(yearTo) => onChangeFilters({ yearTo })}
          />
          <NumberField
            label="Exclude years from"
            value={request.excludedYearFrom}
            onChange={(excludedYearFrom) => onChange({ excludedYearFrom })}
          />
          <NumberField
            label="Exclude years to"
            value={request.excludedYearTo}
            onChange={(excludedYearTo) => onChange({ excludedYearTo })}
          />
        </div>

        <ChartAdvancedControls
          activeControlCount={countArtistChartFilters(request)}
        >
          <div className="chart-advanced-section-heading">
            <div>
              <strong>What counts as charted</strong>
              <small>
                Albums and tracks count as charted when they have a rank in any
                ticked source.
              </small>
            </div>
          </div>
          <div className="artist-chart-sources">
            <fieldset className="missing-flags">
              <legend>Charted albums</legend>
              {albumChartSourceOptions.map((option) => (
                <label key={option.value}>
                  <input
                    type="checkbox"
                    checked={request.albumChartSources.includes(option.value)}
                    onChange={() =>
                      onChange({
                        albumChartSources: toggleSource(
                          request.albumChartSources,
                          option.value,
                        ),
                      })
                    }
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </fieldset>
            <fieldset className="missing-flags">
              <legend>Charted tracks</legend>
              {singleChartSourceOptions.map((option) => (
                <label key={option.value}>
                  <input
                    type="checkbox"
                    checked={request.singleChartSources.includes(option.value)}
                    onChange={() =>
                      onChange({
                        singleChartSources: toggleSource(
                          request.singleChartSources,
                          option.value,
                        ),
                      })
                    }
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </fieldset>
          </div>

          <div className="filter-grid chart-advanced-filter-grid">
            <NumberField
              label="Limit"
              value={request.limit}
              min={10}
              max={500}
              onChange={(value) => onChange({ limit: value ?? 100 })}
            />
            <NumberField
              label="Minimum albums"
              value={request.minAlbums}
              min={1}
              onChange={(minAlbums) => onChange({ minAlbums })}
            />
            <CountryListCriterion
              label="Origin countries"
              values={filters.originCountryCodes}
              onChange={(originCountryCodes) =>
                onChangeFilters({ originCountryCodes })
              }
              countryOptions={countryOptions}
              displayMode={countryFlagDisplay}
            />
            <CountryListCriterion
              label="Exclude origin countries"
              values={filters.excludedOriginCountryCodes}
              onChange={(excludedOriginCountryCodes) =>
                onChangeFilters({ excludedOriginCountryCodes })
              }
              countryOptions={countryOptions}
              displayMode={countryFlagDisplay}
            />
            <SelectField
              label="Artist type"
              value={filters.artistType}
              onChange={(artistType) => onChangeFilters({ artistType })}
              options={artistTypeOptions}
            />
            <SelectField
              label="Gender"
              value={filters.artistGender}
              onChange={(artistGender) => onChangeFilters({ artistGender })}
              options={artistGenderOptions}
            />
            <NumberField
              label="Born after"
              value={filters.artistBornYearFrom}
              onChange={(artistBornYearFrom) =>
                onChangeFilters({ artistBornYearFrom })
              }
            />
            <NumberField
              label="Born before"
              value={filters.artistBornYearTo}
              onChange={(artistBornYearTo) =>
                onChangeFilters({ artistBornYearTo })
              }
            />
            <NumberField
              label="Died after"
              value={filters.artistDiedYearFrom}
              onChange={(artistDiedYearFrom) =>
                onChangeFilters({ artistDiedYearFrom })
              }
            />
            <NumberField
              label="Died before"
              value={filters.artistDiedYearTo}
              onChange={(artistDiedYearTo) =>
                onChangeFilters({ artistDiedYearTo })
              }
            />
            <NumberField
              label="Founded after"
              value={filters.artistFoundedYearFrom}
              onChange={(artistFoundedYearFrom) =>
                onChangeFilters({ artistFoundedYearFrom })
              }
            />
            <NumberField
              label="Founded before"
              value={filters.artistFoundedYearTo}
              onChange={(artistFoundedYearTo) =>
                onChangeFilters({ artistFoundedYearTo })
              }
            />
            <NumberField
              label="Dissolved after"
              value={filters.artistDissolvedYearFrom}
              onChange={(artistDissolvedYearFrom) =>
                onChangeFilters({ artistDissolvedYearFrom })
              }
            />
            <NumberField
              label="Dissolved before"
              value={filters.artistDissolvedYearTo}
              onChange={(artistDissolvedYearTo) =>
                onChangeFilters({ artistDissolvedYearTo })
              }
            />
          </div>

          <div className="query-footer chart-options">
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={filters.artistDied}
                onChange={(event) =>
                  onChangeFilters({ artistDied: event.target.checked })
                }
              />
              <span>Dead artists</span>
            </label>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={filters.artistDissolved}
                onChange={(event) =>
                  onChangeFilters({ artistDissolved: event.target.checked })
                }
              />
              <span>Dissolved groups</span>
            </label>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={request.includeVariousArtists}
                onChange={(event) =>
                  onChange({ includeVariousArtists: event.target.checked })
                }
              />
              <span>Include Various Artists</span>
            </label>
          </div>
        </ChartAdvancedControls>
      </section>

      <TransitionRegion>
        <section className="table-panel" aria-label="Artist chart results">
          <div className="panel-heading compact">
            <div>
              <h2>{artistChartMetricLabel(metric)}</h2>
              <p>
                {isLoading || !response
                  ? "Ranking"
                  : `${formatNumber(response.rows.length)} shown from ${formatNumber(response.total)} artists`}
              </p>
            </div>
            <span className="run-status">Artist chart</span>
          </div>

          {error ? <p className="error-message">{error}</p> : null}
          {!response ? (
            <div className="empty-state large">
              <Users size={20} />
              <span>No chart loaded.</span>
            </div>
          ) : response.rows.length === 0 ? (
            <div className="empty-state large">
              <FileSearch size={20} />
              <span>No ranked artists.</span>
            </div>
          ) : (
            <div className="artist-chart-scroll">
              <table className="artist-chart-table">
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Artist</th>
                    {columns.map((column) => (
                      <th
                        scope="col"
                        key={column.metric}
                        className={column.metric === metric ? "active" : ""}
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {response.rows.map((row) => (
                    <tr key={row.artistKey}>
                      <td className="rank-number">{row.rank}</td>
                      <td>
                        <TableEntityButton
                          label={`Open artist ${row.artistName}`}
                          onClick={() =>
                            onOpenArtist(row.artistKey, row.artistName)
                          }
                        >
                          {row.artistName}
                        </TableEntityButton>
                      </td>
                      {columns.map((column) => (
                        <td
                          key={column.metric}
                          className={column.metric === metric ? "active" : ""}
                        >
                          {column.value(row)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </TransitionRegion>
    </>
  );
}
