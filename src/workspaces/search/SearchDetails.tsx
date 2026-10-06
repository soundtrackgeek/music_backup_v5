import {
  SlidersHorizontal,
  Save,
  FileSearch,
  Trash2,
  ListMusic,
  Download,
} from "lucide-react";
import { normalizeBrowseRequestForClient } from "../../app/requests";
import { formatNumber } from "../../app/display";
import { ExportResultStatus } from "../../components/ExportResultStatus";
import type { AppModel } from "../../app/useAppController";
export function SearchDetails({
  model,
}: {
  model: Pick<
    AppModel,
    | "saveName"
    | "setSaveName"
    | "saveCurrentSearch"
    | "savedSearches"
    | "setRequest"
    | "setActiveSection"
    | "removeSavedSearch"
    | "request"
    | "total"
    | "isSearching"
    | "isCreatingSearchPlaylist"
    | "createPlaylistFromCurrentSearch"
    | "searchPlaylistError"
    | "includeCalculated"
    | "setIncludeCalculated"
    | "setExportResult"
    | "availableSearchExportColumns"
    | "searchExportColumns"
    | "toggleSearchExportColumn"
    | "runExport"
    | "exportResult"
  >;
}) {
  const {
    saveName,
    setSaveName,
    saveCurrentSearch,
    savedSearches,
    setRequest,
    setActiveSection,
    removeSavedSearch,
    request,
    total,
    isSearching,
    isCreatingSearchPlaylist,
    createPlaylistFromCurrentSearch,
    searchPlaylistError,
    includeCalculated,
    setIncludeCalculated,
    setExportResult,
    availableSearchExportColumns,
    searchExportColumns,
    toggleSearchExportColumn,
    runExport,
    exportResult,
  } = model;
  return (
    <aside className="detail-panel search-detail" aria-label="Search actions">
      <div className="detail-header">
        <SlidersHorizontal size={20} />
        <div>
          <h2>Views</h2>
          <p>Saved searches, playlists, and exports</p>
        </div>
      </div>

      <section className="save-search-box">
        <label className="source-input">
          <span>Name</span>
          <input
            value={saveName}
            onChange={(event) => setSaveName(event.target.value)}
          />
        </label>
        <button
          className="primary-button"
          type="button"
          onClick={() => void saveCurrentSearch()}
        >
          <Save size={17} />
          <span>Save search</span>
        </button>
      </section>

      <section className="saved-list" aria-label="Saved searches">
        {savedSearches.length === 0 ? (
          <div className="empty-state">
            <FileSearch size={20} />
            <span>No saved searches.</span>
          </div>
        ) : (
          savedSearches.map((search) => (
            <div className="saved-search" key={search.id}>
              <button
                type="button"
                onClick={() => {
                  setRequest(normalizeBrowseRequestForClient(search.request));
                  setActiveSection("Search");
                }}
              >
                <strong>{search.name}</strong>
                <span>{search.view}</span>
              </button>
              <button
                className="icon-button"
                type="button"
                aria-label={`Delete ${search.name}`}
                onClick={() => void removeSavedSearch(search.id)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </section>

      <section
        className="search-playlist-box"
        aria-label="Make a playlist from this search"
      >
        <div>
          <strong>Turn this search into music</strong>
          <span>
            {request.view === "tracks"
              ? `Create all ${formatNumber(total)} matching tracks locally in Search order.`
              : `Create a local draft from every matching track on ${formatNumber(total)} matching albums.`}{" "}
            No Luna request.
          </span>
        </div>
        <button
          className="primary-button"
          type="button"
          disabled={isSearching || isCreatingSearchPlaylist || total === 0}
          onClick={() => void createPlaylistFromCurrentSearch()}
        >
          <ListMusic size={17} />
          <span>
            {isCreatingSearchPlaylist ? "Creating playlist" : "Make a Playlist"}
          </span>
        </button>
        {searchPlaylistError ? (
          <p className="error-message">{searchPlaylistError}</p>
        ) : null}
      </section>

      <section className="export-box">
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={includeCalculated}
            onChange={(event) => {
              setIncludeCalculated(event.target.checked);
              setExportResult(null);
            }}
          />
          <span>Calculated columns</span>
        </label>
        {availableSearchExportColumns.length > 0 ? (
          <div
            className="missing-flags"
            aria-label="Optional Search export columns"
          >
            {availableSearchExportColumns.map((option) => (
              <label key={option.value}>
                <input
                  type="checkbox"
                  checked={searchExportColumns.includes(option.value)}
                  onChange={() => toggleSearchExportColumn(option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        ) : null}
        <div className="export-grid">
          {["csv", "tsv", "xlsx", "json", "txt"].map((format) => (
            <button
              type="button"
              key={format}
              onClick={() => void runExport(format)}
            >
              <Download size={16} />
              <span>{format.toUpperCase()}</span>
            </button>
          ))}
        </div>
        {exportResult ? (
          <ExportResultStatus result={exportResult} itemLabel="row" />
        ) : null}
      </section>
    </aside>
  );
}
