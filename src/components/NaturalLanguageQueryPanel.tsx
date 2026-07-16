import { useState, type FormEvent } from "react";
import { Sparkles } from "lucide-react";

import { compileNaturalLanguageQuery } from "../backend";
import type {
  AiCompiledQuery,
  AiQueryTarget,
  AiUsage,
  BrowseView,
} from "../types";

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

export function NaturalLanguageQueryPanel({
  target,
  currentView,
  onApply,
}: NaturalLanguageQueryPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compiled, setCompiled] = useState<AiCompiledQuery | null>(null);

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
      onApply(result);
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
        <div className="natural-query-result" role="status">
          <strong>Applied</strong>
          <span>{compiled.summary}</span>
          {usage ? <small>{usage}</small> : null}
        </div>
      ) : null}
    </section>
  );
}
