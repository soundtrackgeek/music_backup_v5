import {
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
  Send,
  Sparkles,
  X,
} from "lucide-react";

import {
  openResearchSourceUrl,
  researchMusic,
} from "../backend";
import type {
  AiMusicResearchAnswer,
  AiMusicResearchContext,
  AiMusicResearchTurn,
  AiUsage,
} from "../types";

type ResearchExchange = {
  id: number;
  question: string;
  result: AiMusicResearchAnswer;
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
  const [question, setQuestion] = useState("");
  const [exchanges, setExchanges] = useState<ResearchExchange[]>([]);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const nextIdRef = useRef(1);
  const prompts = useMemo(() => musicResearchPrompts(context), [context]);
  const contextKey = [
    context.workspace,
    context.selectedEntityType,
    context.selectedEntityId,
    context.selectedLabel,
    context.selectedSubtitle,
  ].join("|");
  const activeRequestRef = useRef(0);
  const activeContextKeyRef = useRef(contextKey);
  if (activeContextKeyRef.current !== contextKey) {
    activeContextKeyRef.current = contextKey;
    activeRequestRef.current += 1;
  }

  useEffect(() => {
    setQuestion("");
    setExchanges([]);
    setPendingQuestion(null);
    setError(null);
  }, [contextKey]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

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
    const requestContextKey = contextKey;
    setQuestion("");
    setPendingQuestion(normalizedQuestion);
    setError(null);
    try {
      const result = await researchMusic({
        question: normalizedQuestion,
        context,
        conversation,
      });
      if (
        activeRequestRef.current !== requestId ||
        activeContextKeyRef.current !== requestContextKey
      ) {
        return;
      }
      setExchanges((previous) => [
        ...previous.slice(-4),
        {
          id: nextIdRef.current++,
          question: normalizedQuestion,
          result,
        },
      ]);
    } catch (researchError) {
      if (
        activeRequestRef.current !== requestId ||
        activeContextKeyRef.current !== requestContextKey
      ) {
        return;
      }
      setQuestion(normalizedQuestion);
      setError(
        researchError instanceof Error
          ? researchError.message
          : String(researchError),
      );
    } finally {
      if (
        activeRequestRef.current === requestId &&
        activeContextKeyRef.current === requestContextKey
      ) {
        setPendingQuestion(null);
      }
    }
  }

  function clearConversation() {
    setExchanges([]);
    setQuestion("");
    setError(null);
    inputRef.current?.focus();
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

      <div className="music-research-context" data-context={context.selectedEntityType ?? "general"}>
        <span>{context.selectedEntityType ? <Database size={15} /> : <Globe2 size={15} />}</span>
        <div>
          <strong>{contextTitle(context)}</strong>
          <small>{contextCaption(context)}</small>
        </div>
      </div>

      <div className="music-research-conversation" ref={conversationRef}>
        {exchanges.length === 0 && !pendingQuestion ? (
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

        {exchanges.map((exchange) => {
          const usage = usageLabel(exchange.result.usage);
          return (
            <div className="music-research-exchange" key={exchange.id}>
              <div className="music-research-user-message">
                {exchange.question}
              </div>
              <article className="music-research-answer">
                <p>{exchange.result.answer}</p>
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
        })}

        {pendingQuestion ? (
          <div className="music-research-exchange" aria-live="polite">
            <div className="music-research-user-message">{pendingQuestion}</div>
            <div className="music-research-thinking">
              <Sparkles size={15} /> Researching and checking context…
            </div>
          </div>
        ) : null}
      </div>

      {error ? <p className="error-message music-research-error">{error}</p> : null}

      <form className="music-research-form" onSubmit={submit}>
        <textarea
          ref={inputRef}
          value={question}
          rows={3}
          maxLength={4000}
          disabled={pendingQuestion != null}
          placeholder={
            context.selectedLabel
              ? `Ask something related to ${context.selectedLabel}…`
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
      </form>
    </section>
  );
}
