import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clock3,
  Database,
  FileSearch,
  History,
  RotateCcw,
  ShieldCheck,
  Wrench,
} from "lucide-react";

import type {
  MusicToolFixHistoryEntry,
  MusicToolFixSummary,
  MusicToolIssueResponse,
  MusicToolSummary,
} from "../types";

const MAX_VISIBLE_REPAIR_DIFFS = 40;

function formatRepairDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

function confidenceLabel(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)} confidence`;
}

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function MusicToolRepairPanel({
  tool,
  response,
  isPending,
  fixSummary,
  fixHistory,
  fixError,
  historyError,
  undoingRunId,
  onPreview,
  onApply,
  onUndo,
}: {
  tool: MusicToolSummary | null;
  response: MusicToolIssueResponse | null;
  isPending: boolean;
  fixSummary: MusicToolFixSummary | null;
  fixHistory: MusicToolFixHistoryEntry[];
  fixError: string | null;
  historyError: string | null;
  undoingRunId: number | null;
  onPreview: () => Promise<void>;
  onApply: () => Promise<void>;
  onUndo: (runId: number) => Promise<void>;
}) {
  if (!tool) {
    return null;
  }

  const canFix = tool.id === "whitespace-anomalies";
  const rowCount = response?.rows.length ?? 0;
  const matchingSummary =
    fixSummary?.toolId === tool.id ? fixSummary : null;
  const preview =
    matchingSummary && !matchingSummary.applied ? matchingSummary : null;
  const completion =
    matchingSummary?.applied === true ? matchingSummary : null;
  const visibleDiffs = matchingSummary?.diffs.slice(
    0,
    MAX_VISIBLE_REPAIR_DIFFS,
  );
  const hiddenDiffCount = Math.max(
    0,
    (matchingSummary?.diffs.length ?? 0) - MAX_VISIBLE_REPAIR_DIFFS,
  );

  return (
    <section
      className={`music-tool-repair-panel${canFix ? "" : " report-only"}`}
      aria-label="Guided repair"
    >
      <header className="music-tool-repair-heading">
        <div>
          <span className="eyebrow">
            {canFix ? "Guided repair" : "Repair guidance"}
          </span>
          <h3>
            {canFix
              ? "Review exact changes before touching the library"
              : "This validator remains review-only"}
          </h3>
          <p>
            {canFix
              ? "Preview produces an affected-row diff. Apply creates a database backup and a reversible history entry."
              : "A safe automatic repair cannot infer your source-library intent. Review the report, correct MusicBee or the audio tags, then re-import."}
          </p>
        </div>
        <span
          className={`repair-confidence ${canFix ? "high" : "manual"}`}
        >
          {canFix ? (
            <>
              <ShieldCheck size={15} />
              High confidence
            </>
          ) : (
            <>
              <FileSearch size={15} />
              Source review
            </>
          )}
        </span>
      </header>

      {canFix ? (
        <>
          <div className="repair-steps" aria-label="Repair steps">
            <div className="complete">
              <span>1</span>
              <div>
                <strong>Choose affected rows</strong>
                <small>
                  {countLabel(rowCount, "visible row", "visible rows")} selected
                  by this report
                </small>
              </div>
            </div>
            <ArrowRight size={16} />
            <div className={preview || completion ? "complete" : ""}>
              <span>2</span>
              <div>
                <strong>Preview exact changes</strong>
                <small>Nothing is written during preview</small>
              </div>
            </div>
            <ArrowRight size={16} />
            <div className={completion ? "complete" : ""}>
              <span>3</span>
              <div>
                <strong>Apply with backup</strong>
                <small>History records the fields needed for undo</small>
              </div>
            </div>
          </div>

          <div className="repair-source-warning" role="note">
            <AlertTriangle size={18} />
            <div>
              <strong>Local repair, source unchanged</strong>
              <span>
                {matchingSummary?.sourceWarning ??
                  "This cleanup changes only the app-local SQLite library. MusicBee TSV rows and audio tags remain unchanged, so re-importing the same source can restore the original spacing."}
              </span>
            </div>
          </div>

          <div className="repair-actions">
            <button
              type="button"
              disabled={isPending || rowCount === 0}
              onClick={() => void onPreview()}
            >
              <FileSearch size={16} />
              <span>{preview ? "Refresh preview" : "Preview repair"}</span>
            </button>
            <button
              className="primary"
              type="button"
              disabled={
                isPending ||
                !preview ||
                preview.fixableCount === 0 ||
                preview.diffs.length === 0
              }
              onClick={() => void onApply()}
            >
              <Database size={16} />
              <span>Apply reviewed repair</span>
            </button>
          </div>

          {matchingSummary ? (
            <div
              className={`repair-summary${completion ? " applied" : ""}`}
              aria-live="polite"
            >
              {completion ? <Check size={18} /> : <Wrench size={18} />}
              <div>
                <strong>
                  {completion
                    ? `Repair #${completion.repairId ?? "complete"} applied`
                    : `${matchingSummary.diffs.length} affected-row diffs ready`}
                </strong>
                <span>{matchingSummary.message}</span>
                {matchingSummary.backupPath ? (
                  <small>{matchingSummary.backupPath}</small>
                ) : null}
              </div>
              <span className="repair-confidence high">
                {confidenceLabel(matchingSummary.confidence)}
              </span>
            </div>
          ) : null}

          {visibleDiffs && visibleDiffs.length > 0 ? (
            <div className="repair-diff-list" aria-label="Affected-row diffs">
              {visibleDiffs.map((diff) => (
                <article key={diff.id}>
                  <header>
                    <div>
                      <strong>{diff.label}</strong>
                      <span>
                        {diff.entityType === "tracks" ? "Track" : "Album"}
                        {diff.context ? ` / ${diff.context}` : ""}
                      </span>
                    </div>
                    <span className="repair-confidence high">
                      {confidenceLabel(diff.confidence)}
                    </span>
                  </header>
                  <div className="repair-field-diffs">
                    {diff.changes.map((change) => (
                      <div key={`${diff.id}:${change.field}`}>
                        <span>{change.label}</span>
                        <code>{change.before ?? "empty"}</code>
                        <ArrowRight size={14} />
                        <code>{change.after ?? "empty"}</code>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
              {hiddenDiffCount > 0 ? (
                <p className="repair-diff-limit">
                  {hiddenDiffCount} more affected rows are included in this
                  repair.
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {fixError ? (
        <p className="error-message music-tool-repair-error">{fixError}</p>
      ) : null}

      <section className="repair-history" aria-label="Repair history">
        <div className="repair-history-heading">
          <div>
            <History size={17} />
            <div>
              <strong>Fix history</strong>
              <span>Recent Music Tools changes and undo state</span>
            </div>
          </div>
          <span>{countLabel(fixHistory.length, "run", "runs")}</span>
        </div>
        {historyError ? (
          <p className="error-message">{historyError}</p>
        ) : fixHistory.length === 0 ? (
          <div className="repair-history-empty">
            <Clock3 size={17} />
            <span>No repairs have been applied yet.</span>
          </div>
        ) : (
          <div className="repair-history-list">
            {fixHistory.slice(0, 8).map((entry) => (
              <article key={entry.id}>
                <div>
                  <strong>
                    #{entry.id} {entry.toolLabel}
                  </strong>
                  <span>
                    {entry.status === "undone" ? "Undone" : "Applied"} /{" "}
                    {formatRepairDate(entry.createdAt)}
                  </span>
                  <small>
                    {countLabel(entry.changedTrackCount, "track", "tracks")} /{" "}
                    {countLabel(entry.changedAlbumCount, "album", "albums")} /{" "}
                    {countLabel(entry.diffCount, "diff", "diffs")}
                  </small>
                </div>
                <span
                  className={`repair-history-status ${entry.status}`}
                >
                  {entry.status}
                </span>
                <button
                  type="button"
                  disabled={!entry.canUndo || undoingRunId != null}
                  onClick={() => void onUndo(entry.id)}
                >
                  <RotateCcw size={14} />
                  <span>
                    {undoingRunId === entry.id
                      ? "Undoing…"
                      : entry.canUndo
                        ? "Undo"
                        : "Undone"}
                  </span>
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
