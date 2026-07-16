import { useState, type FormEvent } from "react";
import { MessageCircleQuestion, Sparkles } from "lucide-react";

import { askCurrentView } from "../backend";
import type {
  AiCurrentViewAnswer,
  AiUsage,
  BrowseRequest,
} from "../types";

type CurrentViewQuestionPanelProps = {
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

export function CurrentViewQuestionPanel({
  request,
}: CurrentViewQuestionPanelProps) {
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiCurrentViewAnswer | null>(null);

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
    } catch (askError) {
      setError(askError instanceof Error ? askError.message : String(askError));
    } finally {
      setIsLoading(false);
    }
  }

  const noun = request.view === "tracks" ? "tracks" : "albums";
  const usage = result ? usageLabel(result.usage) : null;

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
        <div className="current-view-answer" role="status">
          <div>
            <strong>Luna</strong>
            <p>{result.answer}</p>
          </div>
          <small>{inspectionLabel(result)}</small>
          {usage ? <small>{usage}</small> : null}
        </div>
      ) : null}
    </section>
  );
}
