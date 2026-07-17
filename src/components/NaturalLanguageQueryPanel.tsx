import { useEffect, useState, type FormEvent } from "react";
import { Sparkles } from "lucide-react";

import {
  compileNaturalLanguageQuery,
  deleteAiSnapshot,
  listAiSnapshots,
  saveAiSnapshot,
} from "../backend";
import type {
  AiCompiledQuery,
  AiQueryTarget,
  AiSnapshot,
  AiUsage,
  BrowseView,
} from "../types";
import {
  aiMarkdownTitle,
  compiledQueryMarkdown,
  compiledQueryReadableMarkdown,
} from "../aiMarkdownExport";
import { AiSnapshotHistory } from "./AiSnapshotHistory";
import { AiMarkdownExportButton } from "./AiMarkdownExportButton";
import { AiSnapshotReadablePreview } from "./AiSnapshotReadablePreview";

type NaturalLanguageQueryPanelProps = {
  target: AiQueryTarget;
  currentView: BrowseView;
  onApply: (compiled: AiCompiledQuery) => void;
};

function usageLabel(usage: AiUsage) {
  if (usage.inputTokens == null && usage.outputTokens == null) return null;
  const cached = usage.cachedInputTokens
    ? `, ${usage.cachedInputTokens.toLocaleString()} cached`
    : "";
  return `${(usage.inputTokens ?? 0).toLocaleString()} input${cached} / ${(usage.outputTokens ?? 0).toLocaleString()} output tokens`;
}

function snapshotTitle(prompt: string) {
  const normalized = prompt.trim().replace(/\s+/g, " ");
  return normalized.length <= 96 ? normalized : `${normalized.slice(0, 93)}...`;
}

function querySnapshotCategory(snapshot: AiSnapshot) {
  return snapshot.content.kind === "chart" ? "Chart" : "Search";
}

export function NaturalLanguageQueryPanel({
  target,
  currentView,
  onApply,
}: NaturalLanguageQueryPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compiled, setCompiled] = useState<AiCompiledQuery | null>(null);
  const [snapshots, setSnapshots] = useState<AiSnapshot[]>([]);
  const [activeSnapshotId, setActiveSnapshotId] = useState<number | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [resultSource, setResultSource] = useState<"live" | "snapshot">("live");
  const [resultPrompt, setResultPrompt] = useState("");

  useEffect(() => {
    let disposed = false;
    void listAiSnapshots(target)
      .then((saved) => {
        if (!disposed) setSnapshots(saved);
      })
      .catch((historyError) => {
        if (!disposed) {
          setSnapshotError(
            historyError instanceof Error
              ? historyError.message
              : String(historyError),
          );
        }
      });
    return () => {
      disposed = true;
    };
  }, [target]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!prompt.trim() || isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await compileNaturalLanguageQuery({
        prompt: prompt.trim(),
        target,
        currentView,
      });
      setCompiled(result);
      setResultPrompt(prompt.trim());
      setResultSource("live");
      setActiveSnapshotId(null);
      onApply(result);
      try {
        const saved = await saveAiSnapshot({
          title: snapshotTitle(prompt),
          content:
            target === "chart"
              ? { kind: "chart", prompt: prompt.trim(), result }
              : { kind: "search", prompt: prompt.trim(), result },
        });
        setSnapshots((previous) => [
          saved,
          ...previous.filter((snapshot) => snapshot.id !== saved.id),
        ]);
        setActiveSnapshotId(saved.id);
        setSnapshotError(null);
      } catch (saveError) {
        setSnapshotError(
          `The query was applied, but its snapshot could not be saved: ${
            saveError instanceof Error ? saveError.message : String(saveError)
          }`,
        );
      }
    } catch (compileError) {
      setError(
        compileError instanceof Error
          ? compileError.message
          : String(compileError),
      );
    } finally {
      setIsLoading(false);
    }
  }

  const example =
    target === "chart"
      ? "Top 25 AOR albums from 1984 under 45 minutes"
      : "Top AOR albums from 1984 under 45 minutes";
  const usage = compiled ? usageLabel(compiled.usage) : null;
  const activeSnapshot =
    snapshots.find((snapshot) => snapshot.id === activeSnapshotId) ?? undefined;

  function openSnapshot(snapshot: AiSnapshot) {
    if (snapshot.content.kind !== target) return;
    setPrompt(snapshot.content.prompt);
    setResultPrompt(snapshot.content.prompt);
    setCompiled(snapshot.content.result);
    setResultSource("snapshot");
    setActiveSnapshotId(snapshot.id);
    setError(null);
    setSnapshotError(null);
    onApply(snapshot.content.result);
  }

  async function removeSnapshot(snapshot: AiSnapshot) {
    try {
      await deleteAiSnapshot(snapshot.id);
      setSnapshots((previous) =>
        previous.filter((saved) => saved.id !== snapshot.id),
      );
      if (activeSnapshotId === snapshot.id) setActiveSnapshotId(null);
      setSnapshotError(null);
    } catch (deleteError) {
      setSnapshotError(
        deleteError instanceof Error
          ? deleteError.message
          : String(deleteError),
      );
    }
  }

  return (
    <section className="natural-query-panel" aria-label="Ask Luna">
      <div className="natural-query-heading">
        <div className="natural-query-icon" aria-hidden="true">
          <Sparkles size={18} />
        </div>
        <div>
          <h2>Ask Luna</h2>
          <p>
            Luna creates filters; the app searches your SQLite library locally.
            No library rows are sent.
          </p>
        </div>
      </div>

      <form className="natural-query-form" onSubmit={(event) => void submit(event)}>
        <input
          value={prompt}
          maxLength={2000}
          disabled={isLoading}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={example}
          aria-label={`Natural-language ${target} request`}
        />
        <button
          className="primary-button"
          type="submit"
          disabled={isLoading || !prompt.trim()}
        >
          <Sparkles size={16} />
          <span>{isLoading ? "Translating" : target === "chart" ? "Build chart" : "Search"}</span>
        </button>
      </form>

      {error ? <p className="error-message natural-query-message">{error}</p> : null}
      {compiled ? (
        <>
          <div className="natural-query-result" role="status">
            <strong>
              {resultSource === "snapshot"
                ? "Restored"
                : activeSnapshotId != null
                  ? "Applied · saved"
                  : "Applied"}
            </strong>
            <span>{compiled.summary}</span>
            {usage ? <small>{usage}</small> : null}
          </div>
          <AiMarkdownExportButton
            title={aiMarkdownTitle(
              target === "chart" ? "Luna chart" : "Luna search",
              resultPrompt,
            )}
            markdown={compiledQueryMarkdown(
              resultPrompt,
              compiled,
              activeSnapshot,
            )}
          />
          {resultSource === "snapshot" ? (
            <AiSnapshotReadablePreview
              markdown={compiledQueryReadableMarkdown(
                resultPrompt,
                compiled,
                activeSnapshot,
              )}
            />
          ) : null}
        </>
      ) : null}
      {snapshotError ? (
        <p className="error-message natural-query-message">{snapshotError}</p>
      ) : null}
      <AiSnapshotHistory
        snapshots={snapshots}
        activeSnapshotId={activeSnapshotId}
        description="Reopen compiled filters without another Luna call. Results use your current library."
        emptyMessage="Your next Luna query will be saved here automatically."
        getCategoryLabel={querySnapshotCategory}
        onOpen={openSnapshot}
        onDelete={(snapshot) => void removeSnapshot(snapshot)}
      />
    </section>
  );
}
