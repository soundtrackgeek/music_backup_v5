import {
  severityLabel,
  formatToolProgress,
  formatDuration,
  isMusicToolProgressActive,
  formatToolCount,
} from "../../app/display";
import {
  type MusicToolScope,
  type MusicToolSummary,
  type MusicToolProgress,
  type MusicToolIssueResponse,
  type ExportResult,
} from "../../types";
import { useState, useEffect } from "react";
import { Wrench, FileSearch, ShieldCheck, Download } from "lucide-react";
import { EXPORT_FORMATS } from "../../app/config";
import { ExportResultStatus } from "../../components/ExportResultStatus";

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={`tool-severity tool-severity-${severity}`}>
      {severityLabel(severity)}
    </span>
  );
}

export function musicToolScopeLabel(scope: MusicToolScope) {
  switch (scope) {
    case "artists":
      return "Artists";
    case "tracks":
      return "Tracks";
    default:
      return "Albums";
  }
}

export function musicToolAffectedLabel(scope: MusicToolScope) {
  switch (scope) {
    case "artists":
      return "Affected artists";
    case "tracks":
      return "Affected tracks";
    default:
      return "Affected albums";
  }
}

export function musicToolAffectedCount(tool: MusicToolSummary) {
  return tool.scope === "tracks" ? tool.trackCount : tool.albumCount;
}

export function useMusicToolElapsedMs(
  startedAt: number | null,
  isActive: boolean,
) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isActive || startedAt == null) {
      return;
    }

    const updateNow = () => setNow(Date.now());
    updateNow();
    const timer = window.setInterval(updateNow, 1_000);
    return () => window.clearInterval(timer);
  }, [isActive, startedAt]);

  return isActive && startedAt != null ? Math.max(0, now - startedAt) : 0;
}

export function MusicToolCompactProgress({
  progress,
  startedAt,
}: {
  progress: MusicToolProgress;
  startedAt: number | null;
}) {
  const elapsedMs = useMusicToolElapsedMs(startedAt, true);
  const progressText = formatToolProgress(progress);
  const elapsedText = formatDuration(elapsedMs);

  return (
    <span
      className="tool-compact-progress"
      aria-label={`${progress.message} ${progressText}. Active ${elapsedText}.`}
      title={progress.message}
    >
      <span className="tool-activity-dot" aria-hidden="true" />
      <strong>{progressText}</strong>
      <small>{elapsedText}</small>
    </span>
  );
}

export function MusicToolLoadingState({
  progress,
  startedAt,
}: {
  progress: MusicToolProgress;
  startedAt: number | null;
}) {
  const elapsedMs = useMusicToolElapsedMs(startedAt, true);
  const progressText = formatToolProgress(progress);

  return (
    <div className="tool-loading-state" role="status" aria-live="polite">
      <div className="tool-loading-heading">
        <span className="tool-activity-orbit" aria-hidden="true">
          <span />
        </span>
        <div>
          <strong>{progress.message}</strong>
          <span>
            {progressText} complete · Active {formatDuration(elapsedMs)}
          </span>
        </div>
      </div>
      <div className="progress-track" aria-hidden="true">
        <div
          className="progress-fill tool-progress-fill-active"
          style={{
            width: `${Math.min(100, Math.max(0, progress.percent))}%`,
          }}
        />
      </div>
      <p>
        The comparison is still running. Large libraries and MusicBrainz caches
        can take a few minutes.
      </p>
    </div>
  );
}

export function MusicToolProgressBlock({
  progress,
  startedAt,
}: {
  progress: MusicToolProgress;
  startedAt: number | null;
}) {
  const isActive = isMusicToolProgressActive(progress);
  const elapsedMs = useMusicToolElapsedMs(startedAt, isActive);
  const progressText = formatToolProgress(progress);

  return (
    <section className="progress-block tool-progress-block" aria-live="polite">
      <div className="progress-row">
        <span className="tool-progress-message">
          {isActive ? (
            <span className="tool-activity-dot" aria-hidden="true" />
          ) : null}
          {progress.message}
        </span>
        <strong>{progressText}</strong>
      </div>
      <div className="progress-track">
        <div
          className={`progress-fill${isActive ? " tool-progress-fill-active" : ""}`}
          style={{
            width: `${Math.min(100, Math.max(0, progress.percent))}%`,
          }}
        />
      </div>
      <div className="progress-meta">
        <span>
          {isActive ? `Active ${formatDuration(elapsedMs)}` : progress.status}
        </span>
        <span>Stage: {progress.status}</span>
      </div>
    </section>
  );
}

export function MusicToolIndexTable({
  tools,
  selectedToolId,
  progress,
  progressStartedAt,
  onSelect,
}: {
  tools: MusicToolSummary[];
  selectedToolId: string | null;
  progress: MusicToolProgress | null;
  progressStartedAt: number | null;
  onSelect: (toolId: string) => void;
}) {
  if (tools.length === 0) {
    return (
      <div className="empty-state large">
        <Wrench size={20} />
        <span>No validation tools loaded.</span>
      </div>
    );
  }

  return (
    <div className="result-table tool-index-results" role="table">
      <div className="result-table-head" role="row">
        <span role="columnheader">Tool</span>
        <span role="columnheader">Scope</span>
        <span role="columnheader">Severity</span>
        <span role="columnheader">Issues</span>
        <span role="columnheader">Affected</span>
      </div>
      {tools.map((tool) => {
        const isSelected = tool.id === selectedToolId;
        const selectedProgress =
          isSelected && isMusicToolProgressActive(progress) ? progress : null;
        return (
          <div
            className={`result-table-row selectable${isSelected ? " selected" : ""}`}
            role="row"
            aria-selected={isSelected}
            tabIndex={0}
            key={tool.id}
            onClick={() => onSelect(tool.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(tool.id);
              }
            }}
          >
            <span role="cell">
              <strong>{tool.label}</strong>
              <small>{tool.description}</small>
            </span>
            <span role="cell">{musicToolScopeLabel(tool.scope)}</span>
            <span role="cell">
              <SeverityBadge severity={tool.severity} />
            </span>
            <span
              className={selectedProgress ? "tool-count-progress" : undefined}
              role="cell"
            >
              {selectedProgress ? (
                <MusicToolCompactProgress
                  progress={selectedProgress}
                  startedAt={progressStartedAt}
                />
              ) : (
                formatToolCount(tool.issueCount)
              )}
            </span>
            <span role="cell">
              {formatToolCount(musicToolAffectedCount(tool))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function MusicToolIssueTable({
  response,
  progress,
  progressStartedAt,
}: {
  response: MusicToolIssueResponse | null;
  progress: MusicToolProgress | null;
  progressStartedAt: number | null;
}) {
  if (!response) {
    if (isMusicToolProgressActive(progress)) {
      return progress ? (
        <MusicToolLoadingState
          progress={progress}
          startedAt={progressStartedAt}
        />
      ) : null;
    }

    return (
      <div className="empty-state large">
        <FileSearch size={20} />
        <span>Select a validation tool.</span>
      </div>
    );
  }

  if (response.rows.length === 0) {
    let emptyMessage = "No matching issues.";
    if (response.tool.id === "missing-chart-albums") {
      emptyMessage =
        "No missing chart albums. If you expected rows, import the Billboard, Official UK, or VG Lista album CSV folders once.";
    } else if (response.tool.id === "missing-chart-singles") {
      emptyMessage =
        "No missing chart singles. If you expected rows, import the Billboard, Official UK, VG Lista, Ti i Skuddet, or Norsktoppen CSV folders once.";
    } else if (response.tool.id === "artists-without-musicbrainz-data") {
      emptyMessage =
        "Every library artist has a usable MusicBrainz cache or verified overlay match.";
    } else if (
      response.tool.id === "high-confidence-missing-musicbrainz-albums"
    ) {
      emptyMessage = "No high-confidence missing MusicBrainz albums found.";
    } else if (
      response.tool.id === "albums-not-on-musicbrainz-official-list" &&
      response.tool.issueCount === 0
    ) {
      emptyMessage =
        "Every comparable local album appears on its artist's pure official MusicBrainz album list.";
    } else if (
      response.tool.id === "owned-musicbrainz-special-releases" &&
      response.tool.issueCount === 0
    ) {
      emptyMessage =
        "No owned albums matched the selected MusicBrainz compilation, live, interview, or EP types outside the pure album list.";
    }

    return (
      <div className="empty-state large">
        <ShieldCheck size={20} />
        <span>{emptyMessage}</span>
      </div>
    );
  }

  const isMissingChartSingles = response.tool.id === "missing-chart-singles";
  const isMissingChartTool =
    response.tool.id === "missing-chart-albums" || isMissingChartSingles;
  const primaryHeader = isMissingChartSingles
    ? "Artist"
    : response.tool.scope === "artists"
      ? "Artist"
      : "Album";
  const secondaryHeader = isMissingChartSingles
    ? "Single"
    : response.tool.scope === "artists"
      ? "Sample album"
      : "Track";
  const valueHeader = isMissingChartTool
    ? "Charts"
    : response.tool.id === "owned-musicbrainz-special-releases"
      ? "MusicBrainz type"
      : "Value";

  return (
    <div className="result-table tool-issue-results" role="table">
      <div className="result-table-head" role="row">
        <span role="columnheader">Issue</span>
        <span role="columnheader">{primaryHeader}</span>
        <span role="columnheader">{secondaryHeader}</span>
        <span role="columnheader">{valueHeader}</span>
        <span role="columnheader">File</span>
      </div>
      {response.rows.map((issue) => (
        <div className="result-table-row" role="row" key={issue.id}>
          <span role="cell">
            <strong>{issue.detail}</strong>
            <small>
              {severityLabel(issue.severity)} / {issue.entityType}
            </small>
          </span>
          <span role="cell">
            {isMissingChartSingles ? (
              <>
                <strong>{issue.albumArtistDisplay ?? "Unknown artist"}</strong>
                <small>{issue.year ?? ""}</small>
              </>
            ) : (
              <>
                <strong>{issue.album ?? "Untitled"}</strong>
                <small>
                  {[issue.albumArtistDisplay, issue.year]
                    .filter(Boolean)
                    .join(" / ")}
                </small>
              </>
            )}
          </span>
          <span role="cell">
            <strong>
              {issue.title ??
                (issue.entityType === "albums"
                  ? "Album-level"
                  : issue.entityType === "artists"
                    ? "Artist-level"
                    : "Untitled")}
            </strong>
            <small>{issue.canonicalGenre ?? ""}</small>
          </span>
          <span role="cell">{issue.value ?? ""}</span>
          <span role="cell" title={issue.filePath ?? ""}>
            {issue.filename ?? ""}
          </span>
        </div>
      ))}
    </div>
  );
}

export function MusicToolExportControls({
  tool,
  isPending,
  exportResult,
  onExport,
}: {
  tool: MusicToolSummary | null;
  isPending: boolean;
  exportResult: ExportResult | null;
  onExport: (format: string) => Promise<void>;
}) {
  const isDisabled = !tool || isPending;

  return (
    <div className="tool-export-controls" aria-label="Export validation issues">
      <div className="export-strip">
        {EXPORT_FORMATS.map((format) => (
          <button
            type="button"
            key={format}
            disabled={isDisabled}
            aria-label={`Export ${tool?.label ?? "validation issues"} as ${format.toUpperCase()}`}
            onClick={() => void onExport(format)}
          >
            <Download size={15} />
            <span>{format.toUpperCase()}</span>
          </button>
        ))}
      </div>
      {exportResult ? (
        <ExportResultStatus result={exportResult} itemLabel="issue" />
      ) : null}
    </div>
  );
}

export function MusicToolDetailPanel({
  tool,
  progress,
  progressStartedAt,
  exportResult,
  onExport,
}: {
  tool: MusicToolSummary | null;
  progress: MusicToolProgress | null;
  progressStartedAt: number | null;
  exportResult: ExportResult | null;
  onExport: (format: string) => Promise<void>;
}) {
  if (!tool) {
    return (
      <aside
        className="detail-panel tools-detail"
        aria-label="Music tools details"
      >
        <div className="detail-header">
          <Wrench size={20} />
          <div>
            <h2>Music Tools</h2>
            <p>Select a validation tool</p>
          </div>
        </div>
        <div className="empty-state">
          <FileSearch size={20} />
          <span>No tool selected.</span>
        </div>
      </aside>
    );
  }

  const progressText = formatToolProgress(progress);
  const isProgressActive = isMusicToolProgressActive(progress);
  const affectedLabel = musicToolAffectedLabel(tool.scope);
  const affectedCount = musicToolAffectedCount(tool);

  return (
    <aside
      className="detail-panel tools-detail"
      aria-label="Music tools details"
    >
      <div className="detail-header">
        <Wrench size={20} />
        <div>
          <h2>{tool.label}</h2>
          <p>
            {severityLabel(tool.severity)} / {musicToolScopeLabel(tool.scope)}
          </p>
        </div>
      </div>

      <dl className="run-details tool-detail-stats">
        <div>
          <dt>Issue rows</dt>
          <dd>
            {isProgressActive && progressText
              ? progressText
              : formatToolCount(tool.issueCount)}
          </dd>
        </div>
        <div>
          <dt>{affectedLabel}</dt>
          <dd>{formatToolCount(affectedCount)}</dd>
        </div>
        <div>
          <dt>Severity</dt>
          <dd>{severityLabel(tool.severity)}</dd>
        </div>
      </dl>

      {progress ? (
        <MusicToolProgressBlock
          progress={progress}
          startedAt={progressStartedAt}
        />
      ) : null}

      <section className="calculation-list tools-signals">
        <div>
          <FileSearch size={17} />
          <span>{tool.description}</span>
        </div>
        <div>
          <ShieldCheck size={17} />
          <span>
            {tool.id === "whitespace-anomalies"
              ? "Guided repair includes exact diffs, backup, history, and undo"
              : "Issue rows are read-only"}
          </span>
        </div>
      </section>

      <section className="export-box">
        <div className="export-grid">
          {EXPORT_FORMATS.map((format) => (
            <button
              type="button"
              key={format}
              onClick={() => void onExport(format)}
            >
              <Download size={16} />
              <span>{format.toUpperCase()}</span>
            </button>
          ))}
        </div>
        {exportResult ? (
          <ExportResultStatus result={exportResult} itemLabel="issue" />
        ) : null}
      </section>
    </aside>
  );
}
