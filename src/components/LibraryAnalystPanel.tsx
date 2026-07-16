import { useState, type FormEvent } from "react";
import { BrainCircuit, ChevronRight, Sparkles } from "lucide-react";

import { analyzeLibrary } from "../backend";
import type {
  AiLibraryAnalysis,
  AiLibraryLens,
  AiUsage,
} from "../types";

type LibraryAnalystPanelProps = {
  isAvailable: boolean;
};

const lensOptions: Array<{
  value: AiLibraryLens;
  label: string;
  description: string;
  placeholder: string;
}> = [
  {
    value: "overview",
    label: "Overview",
    description: "Size, health, and center of gravity",
    placeholder: "Optional focus, e.g. What deserves attention first?",
  },
  {
    value: "ratingBacklog",
    label: "Rating backlog",
    description: "Open work by genre and decade",
    placeholder: "Optional focus, e.g. Where can I make the fastest progress?",
  },
  {
    value: "tasteProfile",
    label: "Taste profile",
    description: "Loved density and score patterns",
    placeholder: "Optional focus, e.g. Which patterns look like real preferences?",
  },
  {
    value: "catalogBalance",
    label: "Catalog balance",
    description: "Time, genre, and concentration",
    placeholder: "Optional focus, e.g. Where is the collection most concentrated?",
  },
  {
    value: "metadataHealth",
    label: "Metadata health",
    description: "Coverage gaps and priorities",
    placeholder: "Optional focus, e.g. Which missing fields have the biggest impact?",
  },
];

function usageLabel(usage: AiUsage) {
  if (usage.inputTokens == null && usage.outputTokens == null) return null;
  const cached = usage.cachedInputTokens
    ? `, ${usage.cachedInputTokens.toLocaleString()} cached`
    : "";
  return `${(usage.inputTokens ?? 0).toLocaleString()} input${cached} / ${(usage.outputTokens ?? 0).toLocaleString()} output tokens`;
}

export function LibraryAnalystPanel({
  isAvailable,
}: LibraryAnalystPanelProps) {
  const [lens, setLens] = useState<AiLibraryLens>("overview");
  const [focus, setFocus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiLibraryAnalysis | null>(null);

  const selectedLens =
    lensOptions.find((option) => option.value === lens) ?? lensOptions[0];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAvailable || isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      setResult(
        await analyzeLibrary({
          lens,
          focus: focus.trim(),
        }),
      );
    } catch (analysisError) {
      setError(
        analysisError instanceof Error
          ? analysisError.message
          : String(analysisError),
      );
    } finally {
      setIsLoading(false);
    }
  }

  function chooseLens(nextLens: AiLibraryLens) {
    setLens(nextLens);
    setResult(null);
    setError(null);
  }

  const usage = result ? usageLabel(result.usage) : null;

  return (
    <section className="library-analyst-panel" aria-label="Library analyst">
      <div className="library-analyst-heading">
        <div className="library-analyst-title">
          <span className="library-analyst-icon" aria-hidden="true">
            <BrainCircuit size={20} />
          </span>
          <div>
            <span className="library-analyst-kicker">Luna · Library analyst</span>
            <h2>Find the signal in your collection</h2>
            <p>
              Luna chooses up to four compact aggregate profiles calculated by
              SQLite. Genre and decade group labels may be shared; album,
              track, artist, path, and filename rows stay local.
            </p>
          </div>
        </div>
        <span className="library-analyst-boundary">Aggregate-only context</span>
      </div>

      <div
        className="library-analyst-lenses"
        role="group"
        aria-label="Analysis lens"
      >
        {lensOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={option.value === lens ? "active" : ""}
            aria-pressed={option.value === lens}
            disabled={isLoading}
            onClick={() => chooseLens(option.value)}
          >
            <strong>{option.label}</strong>
            <span>{option.description}</span>
          </button>
        ))}
      </div>

      <form className="library-analyst-form" onSubmit={(event) => void submit(event)}>
        <label>
          <span>Focus question</span>
          <input
            value={focus}
            maxLength={2000}
            disabled={isLoading || !isAvailable}
            onChange={(event) => setFocus(event.target.value)}
            placeholder={selectedLens.placeholder}
          />
        </label>
        <button
          className="primary-button"
          type="submit"
          disabled={isLoading || !isAvailable}
        >
          <Sparkles size={16} />
          <span>{isLoading ? "Analyzing" : "Analyze library"}</span>
        </button>
      </form>

      {!isAvailable ? (
        <p className="library-analyst-note">Import a library before running an analysis.</p>
      ) : null}
      {error ? <p className="error-message library-analyst-note">{error}</p> : null}

      {result ? (
        <article className="library-analysis" aria-live="polite">
          <header>
            <span>{lensOptions.find((option) => option.value === result.lens)?.label}</span>
            <h3>{result.headline}</h3>
            <p>{result.summary}</p>
          </header>

          <div className="library-analysis-findings">
            {result.findings.map((finding, index) => (
              <section key={`${finding.title}-${index}`}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h4>{finding.title}</h4>
                  <strong>{finding.evidence}</strong>
                  <p>{finding.interpretation}</p>
                </div>
              </section>
            ))}
          </div>

          <aside className="library-analysis-next">
            <span>Useful next questions</span>
            <div>
              {result.nextQuestions.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => setFocus(question)}
                >
                  <ChevronRight size={14} />
                  <span>{question}</span>
                </button>
              ))}
            </div>
          </aside>

          <footer>
            <span>
              {result.profileSections.length.toLocaleString()} profile sections
              {" · "}
              {result.aggregatePointsShared.toLocaleString()} aggregate points
              {" · no album, track, or artist names"}
            </span>
            {usage ? <span>{usage}</span> : null}
          </footer>
        </article>
      ) : null}
    </section>
  );
}
