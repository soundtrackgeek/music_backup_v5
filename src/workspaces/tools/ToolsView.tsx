import {
  RotateCcw,
  Database,
  Wrench,
  FileSearch,
  ListMusic,
  ShieldCheck,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Metric } from "../../components/catalog/CatalogValues";
import {
  formatNumber,
  formatToolCount,
  severityLabel,
} from "../../app/display";
import { renewMusicToolIssueRequest } from "../../app/requests";
import {
  SelectField,
  NumberField,
} from "../../components/catalog/SearchCriteria";
import {
  MusicToolIndexTable,
  MusicToolExportControls,
  MusicToolIssueTable,
} from "./MusicToolPanels";
import { MusicToolRepairPanel } from "../MusicToolRepairPanel";
import type { AppModel } from "../../app/useAppController";
export function ToolsView({
  model,
}: {
  model: Pick<
    AppModel,
    | "clearToolQuery"
    | "refreshMusicTools"
    | "musicTools"
    | "totalToolIssues"
    | "selectedToolIssueValue"
    | "selectedTool"
    | "toolIssueRequest"
    | "setToolIssueRequest"
    | "isToolsLoading"
    | "toolsError"
    | "selectedToolId"
    | "activeToolProgress"
    | "toolProgressStartedAt"
    | "selectMusicTool"
    | "toolIssuePanelCaption"
    | "isToolRunPending"
    | "toolExportResult"
    | "runToolExport"
    | "toolIssueTotal"
    | "currentToolIssueResponse"
    | "toolFixSummary"
    | "toolFixHistory"
    | "toolFixError"
    | "toolFixHistoryError"
    | "undoingToolFixRunId"
    | "runToolFix"
    | "runToolUndo"
    | "toolIssueError"
    | "isToolProgressActive"
  >;
}) {
  const {
    clearToolQuery,
    refreshMusicTools,
    musicTools,
    totalToolIssues,
    selectedToolIssueValue,
    selectedTool,
    toolIssueRequest,
    setToolIssueRequest,
    isToolsLoading,
    toolsError,
    selectedToolId,
    activeToolProgress,
    toolProgressStartedAt,
    selectMusicTool,
    toolIssuePanelCaption,
    isToolRunPending,
    toolExportResult,
    runToolExport,
    toolIssueTotal,
    currentToolIssueResponse,
    toolFixSummary,
    toolFixHistory,
    toolFixError,
    toolFixHistoryError,
    undoingToolFixRunId,
    runToolFix,
    runToolUndo,
    toolIssueError,
    isToolProgressActive,
  } = model;
  return (
    <section className="workspace tools-workspace">
      <header className="topbar">
        <div>
          <h1>Tools</h1>
          <p>
            Validate the library, review exact repair diffs, and undo app-local
            fixes safely.
          </p>
        </div>
        <div className="topbar-actions">
          <button
            className="icon-button"
            type="button"
            aria-label="Clear tool filters"
            onClick={clearToolQuery}
          >
            <RotateCcw size={18} />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="Refresh tools"
            onClick={() => void refreshMusicTools()}
          >
            <Database size={18} />
          </button>
        </div>
      </header>

      <section className="metric-grid" aria-label="Tools summary">
        <Metric
          label="Validators"
          value={formatNumber(musicTools.length)}
          tone="teal"
          icon={Wrench}
        />
        <Metric
          label="Issue rows"
          value={formatToolCount(totalToolIssues)}
          tone="amber"
          icon={FileSearch}
        />
        <Metric
          label="Selected"
          value={selectedToolIssueValue}
          icon={ListMusic}
        />
        <Metric
          label="Severity"
          value={severityLabel(selectedTool?.severity) || "Select"}
          icon={ShieldCheck}
        />
      </section>

      <section className="query-panel tool-query-panel">
        <div className="search-row tool-search-row">
          <div className="search-input">
            <Search size={18} />
            <input
              value={toolIssueRequest.searchText}
              onChange={(event) =>
                setToolIssueRequest((previous) =>
                  renewMusicToolIssueRequest(previous, {
                    searchText: event.target.value,
                    offset: 0,
                  }),
                )
              }
              placeholder="Filter affected albums, tracks, files, and issue values"
            />
          </div>
          <SelectField
            label="Sort"
            value={toolIssueRequest.sort.field}
            onChange={(field) =>
              setToolIssueRequest((previous) =>
                renewMusicToolIssueRequest(previous, {
                  sort: { ...previous.sort, field },
                  offset: 0,
                }),
              )
            }
            options={[
              { value: "album", label: "Album" },
              { value: "artist", label: "Artist" },
              { value: "year", label: "Year" },
              { value: "title", label: "Track" },
              { value: "detail", label: "Issue" },
              { value: "value", label: "Value" },
              { value: "filename", label: "Filename" },
              { value: "severity", label: "Severity" },
            ]}
          />
        </div>

        <div className="query-footer">
          <div className="chip-row inline" aria-label="Active tool filters">
            {toolIssueRequest.searchText.trim() ? (
              <button
                className="filter-chip"
                type="button"
                onClick={() =>
                  setToolIssueRequest((previous) =>
                    renewMusicToolIssueRequest(previous, {
                      searchText: "",
                      offset: 0,
                    }),
                  )
                }
              >
                <span>Filter "{toolIssueRequest.searchText.trim()}"</span>
                <X size={14} />
              </button>
            ) : (
              <span className="chip-empty">No active filters</span>
            )}
          </div>

          <div className="sort-controls">
            <SelectField
              label="Direction"
              value={toolIssueRequest.sort.direction}
              onChange={(direction) =>
                setToolIssueRequest((previous) =>
                  renewMusicToolIssueRequest(previous, {
                    sort: {
                      ...previous.sort,
                      direction: direction as "asc" | "desc",
                    },
                    offset: 0,
                  }),
                )
              }
              options={[
                { value: "asc", label: "Ascending" },
                { value: "desc", label: "Descending" },
              ]}
            />
            <NumberField
              label="Rows"
              value={toolIssueRequest.limit}
              min={10}
              max={500}
              onChange={(value) =>
                setToolIssueRequest((previous) =>
                  renewMusicToolIssueRequest(previous, {
                    limit: value ?? 50,
                    offset: 0,
                  }),
                )
              }
            />
          </div>
        </div>
      </section>

      <section className="table-panel" aria-label="Validation tool index">
        <div className="panel-heading compact">
          <div>
            <h2>Validation &amp; repair suite</h2>
            <p>
              {isToolsLoading
                ? "Loading tools"
                : `${formatNumber(musicTools.length)} tools`}
            </p>
          </div>
          <span className="run-status">
            {totalToolIssues == null
              ? "Counts on select"
              : `${formatNumber(totalToolIssues)} issues`}
          </span>
        </div>

        {toolsError ? <p className="error-message">{toolsError}</p> : null}
        <MusicToolIndexTable
          tools={musicTools}
          selectedToolId={selectedToolId}
          progress={activeToolProgress}
          progressStartedAt={toolProgressStartedAt}
          onSelect={selectMusicTool}
        />
      </section>

      <section className="table-panel" aria-label="Validation issues">
        <div className="panel-heading compact">
          <div>
            <h2>{selectedTool?.label ?? "Issue list"}</h2>
            <p>{toolIssuePanelCaption}</p>
          </div>
          <div className="panel-actions">
            <MusicToolExportControls
              tool={selectedTool}
              isPending={isToolRunPending}
              exportResult={toolExportResult}
              onExport={runToolExport}
            />
            <div className="pager">
              <button
                className="icon-button"
                type="button"
                aria-label="Previous issue page"
                disabled={toolIssueRequest.offset === 0}
                onClick={() =>
                  setToolIssueRequest((previous) =>
                    renewMusicToolIssueRequest(previous, {
                      offset: Math.max(0, previous.offset - previous.limit),
                    }),
                  )
                }
              >
                <ChevronLeft size={17} />
              </button>
              <button
                className="icon-button"
                type="button"
                aria-label="Next issue page"
                disabled={
                  toolIssueRequest.offset + toolIssueRequest.limit >=
                  toolIssueTotal
                }
                onClick={() =>
                  setToolIssueRequest((previous) =>
                    renewMusicToolIssueRequest(previous, {
                      offset: previous.offset + previous.limit,
                    }),
                  )
                }
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </div>
        </div>

        <MusicToolRepairPanel
          tool={selectedTool}
          response={currentToolIssueResponse}
          isPending={isToolRunPending}
          fixSummary={toolFixSummary}
          fixHistory={toolFixHistory}
          fixError={toolFixError}
          historyError={toolFixHistoryError}
          undoingRunId={undoingToolFixRunId}
          onPreview={() => runToolFix(false)}
          onApply={() => runToolFix(true)}
          onUndo={runToolUndo}
        />

        {toolIssueError ? (
          <p className="error-message">{toolIssueError}</p>
        ) : null}
        <MusicToolIssueTable
          response={isToolProgressActive ? null : currentToolIssueResponse}
          progress={activeToolProgress}
          progressStartedAt={toolProgressStartedAt}
        />
      </section>
    </section>
  );
}
