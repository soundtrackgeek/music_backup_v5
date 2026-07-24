import { useEffect, useState, type FormEvent } from "react";
import { Sparkles } from "lucide-react";

import {
  askCurrentView,
  compileNaturalLanguageQuery,
  deleteAiSnapshot,
  listAiSnapshots,
  saveAiSnapshot,
} from "../backend";
import type {
  AiCompiledQuery,
  AiCurrentViewAnswer,
  AiQueryExchange,
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
  showSnapshotHistory?: boolean;
  snapshotToOpen?: AiSnapshot | null;
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
  showSnapshotHistory = true,
  snapshotToOpen = null,
}: NaturalLanguageQueryPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isAnswering, setIsAnswering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compiled, setCompiled] = useState<AiCompiledQuery | null>(null);
  const [answer, setAnswer] = useState<AiCurrentViewAnswer | null>(null);
  const [exchanges, setExchanges] = useState<AiQueryExchange[]>([]);
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

  useEffect(() => {
    if (!snapshotToOpen || snapshotToOpen.content.kind !== target) return;
    setSnapshots((previous) =>
      previous.some((snapshot) => snapshot.id === snapshotToOpen.id)
        ? previous
        : [snapshotToOpen, ...previous],
    );
    openSnapshot(snapshotToOpen);
  }, [snapshotToOpen?.id, target]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!prompt.trim() || isLoading) return;
    const submittedPrompt = prompt.trim();
    const previousExchanges = exchanges;
    const previousExchange = previousExchanges[previousExchanges.length - 1];
    const isFollowUp = Boolean(previousExchange?.answer && answer);
    setIsLoading(true);
    setIsAnswering(false);
    setError(null);
    if (!isFollowUp) setAnswer(null);
    try {
      const result = await compileNaturalLanguageQuery({
        prompt: submittedPrompt,
        target,
        currentView,
        ...(isFollowUp && previousExchange?.answer
          ? {
              followUp: {
                previousPrompt: previousExchange.prompt,
                previousSummary: previousExchange.result.summary,
                previousAnswer: previousExchange.answer.answer,
              },
            }
          : {}),
      });
      setCompiled(result);
      if (isFollowUp) setAnswer(null);
      setResultPrompt(submittedPrompt);
      setResultSource("live");
      setActiveSnapshotId(null);
      onApply(result);

      let localAnswer: AiCurrentViewAnswer | null = null;
      if (result.queryIntent === "answer") {
        setIsAnswering(true);
        try {
          localAnswer = await askCurrentView({
            question: submittedPrompt,
            request: result.request,
          });
          setAnswer(localAnswer);
          setPrompt("");
        } catch (askError) {
          setError(
            `The local filters were applied, but Luna could not finish the answer: ${
              askError instanceof Error ? askError.message : String(askError)
            }`,
          );
        } finally {
          setIsAnswering(false);
        }
      }

      const nextExchanges = [
        ...(isFollowUp ? previousExchanges : []),
        { prompt: submittedPrompt, result, answer: localAnswer },
      ].slice(-5);
      setExchanges(nextExchanges);

      try {
        const saved = await saveAiSnapshot({
          title: snapshotTitle(submittedPrompt),
          content:
            target === "chart"
              ? {
                  kind: "chart",
                  prompt: submittedPrompt,
                  result,
                  answer: localAnswer,
                  exchanges: nextExchanges,
                }
              : {
                  kind: "search",
                  prompt: submittedPrompt,
                  result,
                  answer: localAnswer,
                  exchanges: nextExchanges,
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
      setIsAnswering(false);
    }
  }

  const example =
    target === "chart"
      ? "Top 25 AOR albums from 1984 under 45 minutes"
      : "Top AOR albums from 1984 under 45 minutes";
  const usage = compiled ? usageLabel(compiled.usage) : null;
  const activeSnapshot =
    snapshots.find((snapshot) => snapshot.id === activeSnapshotId) ?? undefined;
  const canFollowUp = Boolean(exchanges[exchanges.length - 1]?.answer && answer);

  function openSnapshot(snapshot: AiSnapshot) {
    if (snapshot.content.kind !== target) return;
    const restoredExchanges = snapshot.content.exchanges?.length
      ? snapshot.content.exchanges
      : [
          {
            prompt: snapshot.content.prompt,
            result: snapshot.content.result,
            answer: snapshot.content.answer ?? null,
          },
        ];
    setPrompt(snapshot.content.answer ? "" : snapshot.content.prompt);
    setResultPrompt(snapshot.content.prompt);
    setCompiled(snapshot.content.result);
    setAnswer(snapshot.content.answer ?? null);
    setExchanges(restoredExchanges);
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
            Luna creates local filters and answers from bounded SQLite
            summaries. Names leave the device only when your question asks for
            them; paths and the database stay local.
          </p>
        </div>
      </div>

      <form className="natural-query-form" onSubmit={(event) => void submit(event)}>
        <input
          value={prompt}
          maxLength={2000}
          disabled={isLoading}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={
            canFollowUp
              ? "Ask a follow-up about this result…"
              : example
          }
          aria-label={`Natural-language ${target} request`}
        />
        <button
          className="primary-button"
          type="submit"
          disabled={isLoading || !prompt.trim()}
        >
          <Sparkles size={16} />
          <span>
            {isAnswering
              ? "Answering"
              : isLoading
                ? "Translating"
                : canFollowUp
                  ? "Ask follow-up"
                  : target === "chart"
                    ? "Build chart"
                    : "Search"}
          </span>
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
                  ? answer
                    ? "Answered · saved"
                    : "Applied · saved"
                  : answer
                    ? "Answered"
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
              answer,
              exchanges,
            )}
          />
          {answer || exchanges.length > 0 || resultSource === "snapshot" ? (
            <AiSnapshotReadablePreview
              markdown={compiledQueryReadableMarkdown(
                resultPrompt,
                compiled,
                activeSnapshot,
                answer,
                resultSource === "snapshot",
                exchanges,
              )}
            />
          ) : null}
        </>
      ) : null}
      {snapshotError ? (
        <p className="error-message natural-query-message">{snapshotError}</p>
      ) : null}
      {showSnapshotHistory ? (
        <AiSnapshotHistory
          snapshots={snapshots}
          activeSnapshotId={activeSnapshotId}
          description="Reopen exact answers and compiled filters without another Luna call. Filters still use your current library."
          emptyMessage="Your next Luna query will be saved here automatically."
          getCategoryLabel={querySnapshotCategory}
          onOpen={openSnapshot}
          onDelete={(snapshot) => void removeSnapshot(snapshot)}
        />
      ) : null}
    </section>
  );
}
