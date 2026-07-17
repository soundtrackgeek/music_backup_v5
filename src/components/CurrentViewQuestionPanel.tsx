import { useEffect, useState, type FormEvent } from "react";
import { MessageCircleQuestion, Sparkles } from "lucide-react";

import {
  askCurrentView,
  deleteAiSnapshot,
  listAiSnapshots,
  saveAiSnapshot,
} from "../backend";
import type {
  AiCurrentViewAnswer,
  AiQueryTarget,
  AiSnapshot,
  AiUsage,
  BrowseRequest,
} from "../types";
import {
  aiMarkdownTitle,
  currentViewAnswerMarkdown,
} from "../aiMarkdownExport";
import { AiMarkdownExportButton } from "./AiMarkdownExportButton";
import { AiSnapshotHistory } from "./AiSnapshotHistory";

type CurrentViewQuestionPanelProps = {
  context: AiQueryTarget;
  request: BrowseRequest;
};

function usageLabel(usage: AiUsage) {
  if (usage.inputTokens == null && usage.outputTokens == null) return null;
  const cached = usage.cachedInputTokens
    ? `, ${usage.cachedInputTokens.toLocaleString()} cached`
    : "";
  return `${(usage.inputTokens ?? 0).toLocaleString()} input${cached} / ${(usage.outputTokens ?? 0).toLocaleString()} output tokens`;
}

function inspectionLabel(result: AiCurrentViewAnswer) {
  const names = result.namedRowsShared
    ? ` • ${result.namedRowsShared.toLocaleString()} names shared`
    : " • no names shared";
  return `${result.matchingRows.toLocaleString()} matching ${result.view} • ${result.analysisCount} local ${result.analysisCount === 1 ? "analysis" : "analyses"}${names}`;
}

function answerSnapshotTitle(question: string) {
  const normalized = question.trim().replace(/\s+/g, " ");
  return normalized.length <= 96 ? normalized : `${normalized.slice(0, 93)}...`;
}

function answerSnapshotCategory(snapshot: AiSnapshot) {
  return snapshot.content.kind === "chartAnswer"
    ? "Chart answer"
    : "Search answer";
}

export function CurrentViewQuestionPanel({
  context,
  request,
}: CurrentViewQuestionPanelProps) {
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiCurrentViewAnswer | null>(null);
  const [snapshots, setSnapshots] = useState<AiSnapshot[]>([]);
  const [activeSnapshotId, setActiveSnapshotId] = useState<number | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [resultSource, setResultSource] = useState<"live" | "snapshot">("live");
  const [resultQuestion, setResultQuestion] = useState("");
  const snapshotKind = context === "chart" ? "chartAnswer" : "searchAnswer";

  useEffect(() => {
    let disposed = false;
    void listAiSnapshots(snapshotKind)
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
  }, [snapshotKind]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!question.trim() || isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      const answer = await askCurrentView({
        question: question.trim(),
        request,
      });
      setResult(answer);
      setResultQuestion(question.trim());
      setResultSource("live");
      setActiveSnapshotId(null);
      try {
        const saved = await saveAiSnapshot({
          title: answerSnapshotTitle(question),
          content:
            context === "chart"
              ? {
                  kind: "chartAnswer",
                  prompt: question.trim(),
                  request,
                  result: answer,
                }
              : {
                  kind: "searchAnswer",
                  prompt: question.trim(),
                  request,
                  result: answer,
                },
        });
        setSnapshots((previous) => [
          saved,
          ...previous.filter((snapshot) => snapshot.id !== saved.id),
        ]);
        setActiveSnapshotId(saved.id);
        setSnapshotError(null);
      } catch (saveError) {
        setSnapshotError(
          `The answer is visible, but its snapshot could not be saved: ${
            saveError instanceof Error ? saveError.message : String(saveError)
          }`,
        );
      }
    } catch (askError) {
      setError(askError instanceof Error ? askError.message : String(askError));
    } finally {
      setIsLoading(false);
    }
  }

  const noun = request.view === "tracks" ? "tracks" : "albums";
  const usage = result ? usageLabel(result.usage) : null;
  const activeSnapshot =
    snapshots.find((snapshot) => snapshot.id === activeSnapshotId) ?? undefined;
  const exportRequest =
    activeSnapshot?.content.kind === "searchAnswer" ||
    activeSnapshot?.content.kind === "chartAnswer"
      ? activeSnapshot.content.request
      : request;

  function openSnapshot(snapshot: AiSnapshot) {
    if (
      snapshot.content.kind !== "searchAnswer" &&
      snapshot.content.kind !== "chartAnswer"
    ) {
      return;
    }
    setQuestion(snapshot.content.prompt);
    setResultQuestion(snapshot.content.prompt);
    setResult(snapshot.content.result);
    setResultSource("snapshot");
    setActiveSnapshotId(snapshot.id);
    setError(null);
    setSnapshotError(null);
  }

  async function removeSnapshot(snapshot: AiSnapshot) {
    try {
      await deleteAiSnapshot(snapshot.id);
      setSnapshots((previous) =>
        previous.filter((saved) => saved.id !== snapshot.id),
      );
      if (activeSnapshotId === snapshot.id) {
        setActiveSnapshotId(null);
        setResultSource("live");
      }
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
    <section
      className="natural-query-panel current-view-question-panel"
      aria-label="Ask about this view"
    >
      <div className="natural-query-heading">
        <div className="natural-query-icon" aria-hidden="true">
          <MessageCircleQuestion size={18} />
        </div>
        <div>
          <h2>Ask about this view</h2>
          <p>
            Luna can request exact local summaries, groups, or up to 20 names
            from these filtered {noun}. Only that compact context is sent;
            paths and the rest of your library stay local.
          </p>
        </div>
      </div>

      <form
        className="natural-query-form"
        onSubmit={(event) => void submit(event)}
      >
        <input
          value={question}
          maxLength={2000}
          disabled={isLoading}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={
            request.view === "tracks"
              ? "Which artists appear most often in these tracks?"
              : "What stands out about these albums?"
          }
          aria-label="Question about the current view"
        />
        <button
          className="primary-button"
          type="submit"
          disabled={isLoading || !question.trim()}
        >
          <Sparkles size={16} />
          <span>{isLoading ? "Inspecting" : "Ask"}</span>
        </button>
      </form>

      {error ? (
        <p className="error-message natural-query-message">{error}</p>
      ) : null}
      {result ? (
        <>
          <div className="current-view-answer" role="status">
            <div>
              <strong>
                {resultSource === "snapshot"
                  ? "Luna · saved answer"
                  : activeSnapshotId != null
                    ? "Luna · saved"
                    : "Luna"}
              </strong>
              <p>{result.answer}</p>
            </div>
            <small>{inspectionLabel(result)}</small>
            {usage ? <small>{usage}</small> : null}
          </div>
          <AiMarkdownExportButton
            title={aiMarkdownTitle("Luna current-view answer", resultQuestion)}
            markdown={currentViewAnswerMarkdown(
              resultQuestion,
              exportRequest,
              result,
              activeSnapshot,
            )}
          />
        </>
      ) : null}
      {snapshotError ? (
        <p className="error-message natural-query-message">{snapshotError}</p>
      ) : null}
      <AiSnapshotHistory
        snapshots={snapshots}
        activeSnapshotId={activeSnapshotId}
        description="Exact answers and their filtered-view request are stored locally; reopening costs no tokens."
        emptyMessage="Your next current-view answer will be saved here automatically."
        getCategoryLabel={answerSnapshotCategory}
        onOpen={openSnapshot}
        onDelete={(snapshot) => void removeSnapshot(snapshot)}
      />
    </section>
  );
}
