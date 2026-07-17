import { useEffect, useState, type FormEvent } from "react";
import { BrainCircuit, ChevronRight, Sparkles } from "lucide-react";

import {
  analyzeLibrary,
  deleteAiSnapshot,
  listAiSnapshots,
  saveAiSnapshot,
} from "../backend";
import type {
  AiLibraryAnalysis,
  AiLibraryLens,
  AiSnapshot,
  AiUsage,
} from "../types";
import { aiMarkdownTitle, libraryAnalysisMarkdown } from "../aiMarkdownExport";
import { AiMarkdownExportButton } from "./AiMarkdownExportButton";
import { AiSnapshotHistory } from "./AiSnapshotHistory";

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

function analystSnapshotTitle(headline: string) {
  const normalized = headline.trim().replace(/\s+/g, " ");
  return normalized.length <= 120 ? normalized : `${normalized.slice(0, 117)}...`;
}

function analystSnapshotCategory(snapshot: AiSnapshot) {
  if (snapshot.content.kind !== "libraryAnalysis") return "Analysis";
  const snapshotLens = snapshot.content.result.lens;
  return (
    lensOptions.find((option) => option.value === snapshotLens)?.label ??
    "Analysis"
  );
}

export function LibraryAnalystPanel({
  isAvailable,
}: LibraryAnalystPanelProps) {
  const [lens, setLens] = useState<AiLibraryLens>("overview");
  const [focus, setFocus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AiLibraryAnalysis | null>(null);
  const [resultPrompt, setResultPrompt] = useState("");
  const [snapshots, setSnapshots] = useState<AiSnapshot[]>([]);
  const [activeSnapshotId, setActiveSnapshotId] = useState<number | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [resultSource, setResultSource] = useState<"live" | "snapshot">("live");

  useEffect(() => {
    let disposed = false;
    void listAiSnapshots("libraryAnalysis")
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
  }, []);

  const selectedLens =
    lensOptions.find((option) => option.value === lens) ?? lensOptions[0];

  async function runAnalysis(focusQuestion: string) {
    if (!isAvailable || isLoading) return;
    const normalizedFocus = focusQuestion.trim();
    setFocus("");
    setIsLoading(true);
    setError(null);
    try {
      const analysis = await analyzeLibrary({
        lens,
        focus: normalizedFocus,
      });
      setResult(analysis);
      setResultPrompt(normalizedFocus);
      setResultSource("live");
      setActiveSnapshotId(null);
      try {
        const saved = await saveAiSnapshot({
          title: analystSnapshotTitle(analysis.headline),
          content: {
            kind: "libraryAnalysis",
            prompt: normalizedFocus,
            result: analysis,
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
          `The report is visible, but its snapshot could not be saved: ${
            saveError instanceof Error ? saveError.message : String(saveError)
          }`,
        );
      }
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

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runAnalysis(focus);
  }

  function askNextQuestion(question: string) {
    void runAnalysis(question);
  }

  function chooseLens(nextLens: AiLibraryLens) {
    setLens(nextLens);
    setResult(null);
    setResultPrompt("");
    setActiveSnapshotId(null);
    setError(null);
  }

  function openSnapshot(snapshot: AiSnapshot) {
    if (snapshot.content.kind !== "libraryAnalysis") return;
    setLens(snapshot.content.result.lens);
    setFocus(snapshot.content.prompt);
    setResult(snapshot.content.result);
    setResultPrompt(snapshot.content.prompt);
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

  const usage = result ? usageLabel(result.usage) : null;
  const activeSnapshot =
    snapshots.find((snapshot) => snapshot.id === activeSnapshotId) ?? undefined;

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

      <form className="library-analyst-form" onSubmit={submit}>
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
      {snapshotError ? (
        <p className="error-message library-analyst-note">{snapshotError}</p>
      ) : null}

      <AiSnapshotHistory
        tone="dark"
        snapshots={snapshots}
        activeSnapshotId={activeSnapshotId}
        description="Exact reports are stored locally and reopen without token cost."
        emptyMessage="Your next analyst report will be saved here automatically."
        getCategoryLabel={analystSnapshotCategory}
        onOpen={openSnapshot}
        onDelete={(snapshot) => void removeSnapshot(snapshot)}
      />

      {result ? (
        <article className="library-analysis" aria-live="polite">
          <header>
            <span>
              {lensOptions.find((option) => option.value === result.lens)?.label}
              {resultSource === "snapshot"
                ? " · saved snapshot"
                : activeSnapshotId != null
                  ? " · saved automatically"
                  : " · current report"}
            </span>
            <h3>{result.headline}</h3>
            <p>{result.summary}</p>
          </header>

          <AiMarkdownExportButton
            title={aiMarkdownTitle("Luna library analysis", result.headline)}
            markdown={libraryAnalysisMarkdown(
              resultPrompt,
              result,
              activeSnapshot,
            )}
          />

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
                  disabled={isLoading || !isAvailable}
                  onClick={() => askNextQuestion(question)}
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
