import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Database,
  Eraser,
  ExternalLink,
  Globe2,
  History,
  Send,
  Sparkles,
  X,
} from "lucide-react";

import {
  deleteAiSnapshot,
  listAiSnapshots,
  openResearchSourceUrl,
  researchMusic,
  saveAiSnapshot,
} from "../backend";
import type {
  AiMusicResearchAnswer,
  AiMusicResearchContext,
  AiMusicResearchExchange,
  AiMusicResearchTurn,
  AiSnapshot,
  AiUsage,
} from "../types";
import { aiMarkdownTitle, musicResearchMarkdown } from "../aiMarkdownExport";
import { AiMarkdownExportButton } from "./AiMarkdownExportButton";
import { AiSnapshotHistory } from "./AiSnapshotHistory";

const MusicResearchMarkdown = lazy(() => import("./MusicResearchMarkdown"));

type ResearchExchange = AiMusicResearchExchange & {
  id: number;
};

type MusicResearchPanelProps = {
  isOpen: boolean;
  context: AiMusicResearchContext;
  onClose: () => void;
};

function usageLabel(usage: AiUsage) {
  if (usage.inputTokens == null && usage.outputTokens == null) return null;
  const cached = usage.cachedInputTokens
    ? ` · ${usage.cachedInputTokens.toLocaleString()} cached`
    : "";
  return `${(usage.inputTokens ?? 0).toLocaleString()} in${cached} · ${(usage.outputTokens ?? 0).toLocaleString()} out`;
}

function contextTitle(context: AiMusicResearchContext) {
  if (context.selectedLabel) return context.selectedLabel;
  return `${context.workspace} · General music research`;
}

function contextCaption(context: AiMusicResearchContext) {
  if (context.selectedEntityType && context.selectedSubtitle) {
    return `${context.selectedEntityType} · ${context.selectedSubtitle}`;
  }
  if (context.selectedEntityType) return context.selectedEntityType;
  return "No page filters or result rows attached";
}

function researchSnapshotTitle(question: string) {
  const normalized = question.trim().replace(/\s+/g, " ");
  return normalized.length <= 96 ? normalized : `${normalized.slice(0, 93)}...`;
}

function researchSnapshotCategory(snapshot: AiSnapshot) {
  if (snapshot.content.kind !== "musicResearch") return "Music research";
  const { context } = snapshot.content;
  if (context.selectedEntityType && context.selectedLabel) {
    const entity = `${context.selectedEntityType[0].toUpperCase()}${context.selectedEntityType.slice(1)}`;
    return `${entity} · ${context.selectedLabel}`;
  }
  return `${context.workspace} · General`;
}

export function musicResearchPrompts(context: AiMusicResearchContext) {
  switch (context.selectedEntityType) {
    case "album":
      return [
        "Why is this album significant?",
        "What shaped its sound and production?",
        "How was it received at the time?",
      ];
    case "artist":
      return [
        "Give me a concise career overview",
        "Which recordings best explain their influence?",
        "What should I explore next from this artist?",
      ];
    case "genre":
      return [
        "How did this genre develop?",
        "Which albums in my library are essential?",
        "What are its major scenes and turning points?",
      ];
    default:
      return [
        "Trace a genre or scene across one decade",
        "Compare two artists, albums, or movements",
        "Research the story behind a recording",
      ];
  }
}

export function MusicResearchPanel({
  isOpen,
  context,
  onClose,
}: MusicResearchPanelProps) {
  const [conversationContext, setConversationContext] = useState(context);
  const [question, setQuestion] = useState("");
  const [exchanges, setExchanges] = useState<ResearchExchange[]>([]);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<AiSnapshot[]>([]);
  const [activeSnapshotId, setActiveSnapshotId] = useState<number | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const nextIdRef = useRef(1);
  const prompts = useMemo(
    () => musicResearchPrompts(conversationContext),
    [conversationContext],
  );
  const contextKey = [
    context.workspace,
    context.selectedEntityType,
    context.selectedEntityId,
    context.selectedLabel,
    context.selectedSubtitle,
  ].join("|");
  const activeRequestRef = useRef(0);
  const incomingContextKeyRef = useRef(contextKey);
  if (incomingContextKeyRef.current !== contextKey) {
    incomingContextKeyRef.current = contextKey;
    activeRequestRef.current += 1;
  }

  useEffect(() => {
    setConversationContext(context);
    setQuestion("");
    setExchanges([]);
    setPendingQuestion(null);
    setError(null);
    setSnapshotError(null);
    setActiveSnapshotId(null);
    setIsHistoryOpen(false);
  }, [contextKey]);

  useEffect(() => {
    if (!isOpen) return;
    let disposed = false;
    void listAiSnapshots("musicResearch")
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
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = isHistoryOpen
      ? null
      : window.setTimeout(() => inputRef.current?.focus(), 40);
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      if (timer != null) window.clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isHistoryOpen, isOpen, onClose]);

  useEffect(() => {
    conversationRef.current?.scrollTo?.({
      top: conversationRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [exchanges, pendingQuestion]);

  if (!isOpen) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedQuestion = question.trim();
    if (!normalizedQuestion || pendingQuestion) return;

    const conversation = exchanges.flatMap<AiMusicResearchTurn>((exchange) => [
      { role: "user", content: exchange.question },
      { role: "assistant", content: exchange.result.answer },
    ]);
    const requestId = ++activeRequestRef.current;
    const requestContext = conversationContext;
    setQuestion("");
    setPendingQuestion(normalizedQuestion);
    setError(null);
    try {
      const result = await researchMusic({
        question: normalizedQuestion,
        context: requestContext,
        conversation,
      });
      if (activeRequestRef.current !== requestId) {
        return;
      }
      const storedExchanges: AiMusicResearchExchange[] = [
        ...exchanges.slice(-4).map((exchange) => ({
          question: exchange.question,
          result: exchange.result,
        })),
        { question: normalizedQuestion, result },
      ];
      setPendingQuestion(null);
      setExchanges((previous) => [
        ...previous.slice(-4),
        {
          id: nextIdRef.current++,
          question: normalizedQuestion,
          result,
        },
      ]);
      setActiveSnapshotId(null);
      try {
        const saved = await saveAiSnapshot({
          title: researchSnapshotTitle(normalizedQuestion),
          content: {
            kind: "musicResearch",
            prompt: normalizedQuestion,
            context: requestContext,
            exchanges: storedExchanges,
          },
        });
        setSnapshots((previous) => [
          saved,
          ...previous.filter((snapshot) => snapshot.id !== saved.id),
        ]);
        if (activeRequestRef.current === requestId) {
          setActiveSnapshotId(saved.id);
          setSnapshotError(null);
        }
      } catch (saveError) {
        if (activeRequestRef.current === requestId) {
          setSnapshotError(
            `The answer is visible, but its snapshot could not be saved: ${
              saveError instanceof Error ? saveError.message : String(saveError)
            }`,
          );
        }
      }
    } catch (researchError) {
      if (activeRequestRef.current !== requestId) {
        return;
      }
      setQuestion(normalizedQuestion);
      setError(
        researchError instanceof Error
          ? researchError.message
          : String(researchError),
      );
    } finally {
      if (activeRequestRef.current === requestId) {
        setPendingQuestion(null);
      }
    }
  }

  function clearConversation() {
    activeRequestRef.current += 1;
    setConversationContext(context);
    setExchanges([]);
    setQuestion("");
    setError(null);
    setSnapshotError(null);
    setActiveSnapshotId(null);
    setIsHistoryOpen(false);
    inputRef.current?.focus();
  }

  function openSnapshot(snapshot: AiSnapshot) {
    if (snapshot.content.kind !== "musicResearch") return;
    activeRequestRef.current += 1;
    setConversationContext(snapshot.content.context);
    setExchanges(
      snapshot.content.exchanges.map((exchange) => ({
        id: nextIdRef.current++,
        question: exchange.question,
        result: exchange.result,
      })),
    );
    setQuestion("");
    setPendingQuestion(null);
    setActiveSnapshotId(snapshot.id);
    setIsHistoryOpen(false);
    setError(null);
    setSnapshotError(null);
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

  async function openSource(url: string) {
    setError(null);
    try {
      await openResearchSourceUrl(url);
    } catch (sourceError) {
      setError(
        sourceError instanceof Error ? sourceError.message : String(sourceError),
      );
    }
  }

  const activeSnapshot =
    snapshots.find((snapshot) => snapshot.id === activeSnapshotId) ?? undefined;
  const exportExchanges = exchanges.map<AiMusicResearchExchange>((exchange) => ({
    question: exchange.question,
    result: exchange.result,
  }));

  return (
    <section
      className="music-research-panel"
      role="dialog"
      aria-modal="false"
      aria-label="Ask Luna music research"
    >
      <header className="music-research-header">
        <span className="music-research-mark" aria-hidden="true">
          <Sparkles size={19} />
        </span>
        <div>
          <span>Luna · Music research</span>
          <h2>Ask anything about music</h2>
        </div>
        <div className="music-research-header-actions">
          <button
            className="icon-button music-research-history-toggle"
            type="button"
            aria-label={isHistoryOpen ? "Hide saved research" : "Show saved research"}
            aria-pressed={isHistoryOpen}
            title="Saved research"
            disabled={pendingQuestion != null}
            onClick={() => setIsHistoryOpen((previous) => !previous)}
          >
            <History size={16} />
            {snapshots.length > 0 ? <span>{snapshots.length}</span> : null}
          </button>
          {exchanges.length > 0 ? (
            <button
              className="icon-button"
              type="button"
              aria-label="Clear research conversation"
              title="Clear conversation"
              disabled={pendingQuestion != null}
              onClick={clearConversation}
            >
              <Eraser size={16} />
            </button>
          ) : null}
          <button
            className="icon-button"
            type="button"
            aria-label="Close music research"
            title="Close"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>
      </header>

      <div className="music-research-context" data-context={conversationContext.selectedEntityType ?? "general"}>
        <span>{conversationContext.selectedEntityType ? <Database size={15} /> : <Globe2 size={15} />}</span>
        <div>
          <strong>{contextTitle(conversationContext)}</strong>
          <small>
            {activeSnapshotId != null ? "Saved snapshot · " : ""}
            {contextCaption(conversationContext)}
          </small>
        </div>
      </div>

      <div className="music-research-conversation" ref={conversationRef}>
        {!isHistoryOpen && exchanges.length > 0 ? (
          <div className="music-research-export-row">
            <AiMarkdownExportButton
              title={aiMarkdownTitle(
                "Luna music research",
                conversationContext.selectedLabel ?? exchanges[0].question,
              )}
              markdown={musicResearchMarkdown(
                conversationContext,
                exportExchanges,
                activeSnapshot,
              )}
            />
          </div>
        ) : null}
        {isHistoryOpen ? (
          <div className="music-research-history">
            <AiSnapshotHistory
              snapshots={snapshots}
              activeSnapshotId={activeSnapshotId}
              description="Exact conversations, citations, context, and usage are stored locally; reopening costs no tokens."
              emptyMessage="Your next completed research answer will be saved here automatically."
              getCategoryLabel={researchSnapshotCategory}
              onOpen={openSnapshot}
              onDelete={(snapshot) => void removeSnapshot(snapshot)}
            />
          </div>
        ) : null}
        {!isHistoryOpen && exchanges.length === 0 && !pendingQuestion ? (
          <div className="music-research-intro">
            <p>
              I can research the wider music world and, when useful, compare it
              with a small local slice of your current selection.
            </p>
            <div className="music-research-prompts">
              {prompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => {
                    setQuestion(prompt);
                    inputRef.current?.focus();
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {!isHistoryOpen ? exchanges.map((exchange) => {
          const usage = usageLabel(exchange.result.usage);
          return (
            <div className="music-research-exchange" key={exchange.id}>
              <div className="music-research-user-message">
                {exchange.question}
              </div>
              <article className="music-research-answer">
                <div className="music-research-markdown">
                  <Suspense fallback={<p>{exchange.result.answer}</p>}>
                    <MusicResearchMarkdown
                      markdown={exchange.result.answer}
                      onOpenUrl={(url) => void openSource(url)}
                    />
                  </Suspense>
                </div>
                {exchange.result.sources.length > 0 ? (
                  <div className="music-research-sources">
                    <span>Sources</span>
                    {exchange.result.sources.map((source) => (
                      <button
                        key={source.url}
                        type="button"
                        title={source.url}
                        onClick={() => void openSource(source.url)}
                      >
                        <span>{source.title}</span>
                        <ExternalLink size={13} />
                      </button>
                    ))}
                  </div>
                ) : null}
                <footer>
                  {exchange.result.usedWebSearch ? (
                    <span><Globe2 size={12} /> Web researched</span>
                  ) : null}
                  {exchange.result.localInspectionCount > 0 ? (
                    <span>
                      <Database size={12} /> {exchange.result.localInspectionCount} local items
                    </span>
                  ) : null}
                  {usage ? <span>{usage}</span> : null}
                </footer>
              </article>
            </div>
          );
        }) : null}

        {!isHistoryOpen && pendingQuestion ? (
          <div className="music-research-exchange" aria-live="polite">
            <div className="music-research-user-message">{pendingQuestion}</div>
            <div className="music-research-thinking">
              <Sparkles size={15} /> Researching and checking context…
            </div>
          </div>
        ) : null}
      </div>

      {error ? <p className="error-message music-research-error">{error}</p> : null}
      {snapshotError ? (
        <p className="error-message music-research-error">{snapshotError}</p>
      ) : null}

      {!isHistoryOpen ? <form className="music-research-form" onSubmit={submit}>
        <textarea
          ref={inputRef}
          value={question}
          rows={3}
          maxLength={4000}
          disabled={pendingQuestion != null}
          placeholder={
            conversationContext.selectedLabel
              ? `Ask something related to ${conversationContext.selectedLabel}…`
              : "Ask a music history, discography, influence, or comparison question…"
          }
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <div>
          <small>
            Selection labels may be sent to Luna. Local rows are shared only
            through a bounded tool.
          </small>
          <button
            className="primary-button"
            type="submit"
            disabled={pendingQuestion != null || question.trim().length === 0}
          >
            <Send size={15} />
            <span>Ask</span>
          </button>
        </div>
      </form> : null}
    </section>
  );
}
