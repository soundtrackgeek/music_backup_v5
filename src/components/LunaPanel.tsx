import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BarChart3,
  BrainCircuit,
  Clock3,
  Globe2,
  History,
  ListMusic,
  MessageCircleQuestion,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import {
  deleteAiSnapshot,
  deleteSavedExternalDiscovery,
  deleteSavedPlaylist,
  listAiSnapshots,
  listSavedExternalDiscoveries,
  listSavedPlaylists,
} from "../backend";
import type {
  AiMusicResearchContext,
  AiSnapshot,
  BrowseView,
  SavedExternalDiscovery,
  SavedPlaylist,
} from "../types";

export type LunaMode =
  | "plan"
  | "ask"
  | "analyze"
  | "playlist"
  | "discover"
  | "research";

export type LunaHistorySelection =
  | { source: "ai"; item: AiSnapshot }
  | { source: "playlist"; item: SavedPlaylist }
  | { source: "discovery"; item: SavedExternalDiscovery };

type LunaPanelProps = {
  isOpen: boolean;
  activeSection: string;
  currentView: BrowseView;
  currentResultCount: number;
  chartResultCount: number;
  albumCount: number;
  trackCount: number;
  researchContext: AiMusicResearchContext;
  researchPanel: (openSnapshot: AiSnapshot | null) => ReactNode;
  onClose: () => void;
  onOpenMode: (mode: Exclude<LunaMode, "research">) => void;
  onOpenHistory: (selection: LunaHistorySelection) => void;
};

type LunaHistoryItem = {
  key: string;
  mode: LunaMode;
  title: string;
  category: string;
  detail: string;
  createdAt: string;
  selection: LunaHistorySelection;
};

const modeIcons: Record<LunaMode, typeof Sparkles> = {
  plan: Search,
  ask: MessageCircleQuestion,
  analyze: BrainCircuit,
  playlist: ListMusic,
  discover: Globe2,
  research: Sparkles,
};

function defaultMode(activeSection: string): LunaMode {
  if (activeSection === "Statistics") return "analyze";
  if (activeSection === "Playlists") return "playlist";
  if (activeSection === "Discovery") return "discover";
  if (activeSection === "Search" || activeSection === "Charts") return "plan";
  return "research";
}

function aiSnapshotMode(snapshot: AiSnapshot): LunaMode {
  switch (snapshot.content.kind) {
    case "search":
    case "chart":
      return "plan";
    case "searchAnswer":
    case "chartAnswer":
      return "ask";
    case "libraryAnalysis":
      return "analyze";
    case "musicResearch":
      return "research";
  }
}

function aiSnapshotCategory(snapshot: AiSnapshot) {
  switch (snapshot.content.kind) {
    case "search":
      return "Search plan";
    case "chart":
      return "Chart plan";
    case "searchAnswer":
      return "Search answer";
    case "chartAnswer":
      return "Chart answer";
    case "libraryAnalysis":
      return "Library analysis";
    case "musicResearch":
      return "Music research";
  }
}

function aiSnapshotDetail(snapshot: AiSnapshot) {
  if (snapshot.content.kind === "musicResearch") {
    return snapshot.content.context.selectedLabel
      ? `${snapshot.content.context.selectedEntityType ?? "Context"} · ${snapshot.content.context.selectedLabel}`
      : `${snapshot.content.context.workspace} · general context`;
  }
  if (
    snapshot.content.kind === "searchAnswer" ||
    snapshot.content.kind === "chartAnswer"
  ) {
    return `${snapshot.content.result.matchingRows.toLocaleString()} matching ${snapshot.content.result.view}`;
  }
  if (snapshot.content.kind === "libraryAnalysis") {
    return snapshot.content.result.headline;
  }
  return snapshot.content.result.summary;
}

function formatHistoryDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function LunaPanel({
  isOpen,
  activeSection,
  currentView,
  currentResultCount,
  chartResultCount,
  albumCount,
  trackCount,
  researchContext,
  researchPanel,
  onClose,
  onOpenMode,
  onOpenHistory,
}: LunaPanelProps) {
  const [activeTab, setActiveTab] = useState<"modes" | "history">("modes");
  const [mode, setMode] = useState<LunaMode>(() => defaultMode(activeSection));
  const [aiSnapshots, setAiSnapshots] = useState<AiSnapshot[]>([]);
  const [savedPlaylists, setSavedPlaylists] = useState<SavedPlaylist[]>([]);
  const [savedDiscoveries, setSavedDiscoveries] = useState<
    SavedExternalDiscovery[]
  >([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [researchSnapshot, setResearchSnapshot] = useState<AiSnapshot | null>(
    null,
  );

  useEffect(() => {
    if (!isOpen) return;
    setMode(defaultMode(activeSection));
    setActiveTab("modes");
  }, [activeSection, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let disposed = false;
    void Promise.allSettled([
      listAiSnapshots(),
      listSavedPlaylists(),
      listSavedExternalDiscoveries(),
    ]).then(([snapshotResult, playlistResult, discoveryResult]) => {
      if (disposed) return;
      const failures: string[] = [];
      if (snapshotResult.status === "fulfilled") {
        setAiSnapshots(snapshotResult.value);
      } else {
        failures.push(String(snapshotResult.reason));
      }
      if (playlistResult.status === "fulfilled") {
        setSavedPlaylists(playlistResult.value);
      } else {
        failures.push(String(playlistResult.reason));
      }
      if (discoveryResult.status === "fulfilled") {
        setSavedDiscoveries(discoveryResult.value);
      } else {
        failures.push(String(discoveryResult.reason));
      }
      setHistoryError(
        failures.length > 0
          ? `Some Luna history could not be loaded: ${failures.join(" · ")}`
          : null,
      );
    });
    return () => {
      disposed = true;
    };
  }, [activeTab, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const historyItems = useMemo<LunaHistoryItem[]>(
    () =>
      [
        ...aiSnapshots.map((snapshot) => ({
          key: `ai-${snapshot.id}`,
          mode: aiSnapshotMode(snapshot),
          title: snapshot.title,
          category: aiSnapshotCategory(snapshot),
          detail: aiSnapshotDetail(snapshot),
          createdAt: snapshot.createdAt,
          selection: { source: "ai", item: snapshot } as const,
        })),
        ...savedPlaylists.map((playlist) => ({
          key: `playlist-${playlist.id}`,
          mode: "playlist" as const,
          title: playlist.name,
          category: "Saved playlist",
          detail: `${playlist.playlist.tracks.length.toLocaleString()} tracks · exact local order`,
          createdAt: playlist.updatedAt || playlist.createdAt,
          selection: { source: "playlist", item: playlist } as const,
        })),
        ...savedDiscoveries.map((discovery) => ({
          key: `discovery-${discovery.id}`,
          mode: "discover" as const,
          title: discovery.name,
          category: "Saved discovery",
          detail: `${discovery.response.items.length.toLocaleString()} verified ${discovery.response.plan.entity} results`,
          createdAt: discovery.updatedAt || discovery.createdAt,
          selection: { source: "discovery", item: discovery } as const,
        })),
      ].sort(
        (left, right) =>
          new Date(right.createdAt).getTime() -
          new Date(left.createdAt).getTime(),
      ),
    [aiSnapshots, savedDiscoveries, savedPlaylists],
  );

  if (!isOpen) return null;

  const isChartContext = activeSection === "Charts";
  const modeDefinitions: Array<{
    id: LunaMode;
    label: string;
    description: string;
    action: string;
    context: string;
    privacy: string;
  }> = [
    {
      id: "plan",
      label: "Plan & filter",
      description: isChartContext
        ? "Turn a request into a chart configuration."
        : "Turn a request into local search filters.",
      action: isChartContext ? "Open Chart planner" : "Open Search planner",
      context: isChartContext
        ? `Charts · ${chartResultCount.toLocaleString()} ranked rows`
        : `Search · ${currentView} · ${currentResultCount.toLocaleString()} matches`,
      privacy: "Luna returns a typed plan; SQLite runs it locally.",
    },
    {
      id: "ask",
      label: "Ask this view",
      description: "Question the results already on screen.",
      action: isChartContext ? "Ask this chart" : "Ask Search results",
      context: isChartContext
        ? `Current chart · ${chartResultCount.toLocaleString()} rows`
        : `Current Search · ${currentResultCount.toLocaleString()} ${currentView}`,
      privacy: "Only requested summaries and up to 50 names can be shared.",
    },
    {
      id: "analyze",
      label: "Analyze library",
      description: "Run overview, taste, backlog, balance, or metadata lenses.",
      action: "Open Library Analyst",
      context: `${albumCount.toLocaleString()} albums · ${trackCount.toLocaleString()} tracks`,
      privacy: "Aggregate profiles are built in SQLite before Luna answers.",
    },
    {
      id: "playlist",
      label: "Build playlist",
      description: "Describe a moment, then review a local track sequence.",
      action: "Open Playlist Builder",
      context: `Local library · ${trackCount.toLocaleString()} tracks`,
      privacy: "Luna plans the recipe; track names and paths stay local.",
    },
    {
      id: "discover",
      label: "Discover outside",
      description: "Find verified music missing from your collection.",
      action: "Open Discovery",
      context: `MusicBrainz catalog · checked against ${albumCount.toLocaleString()} local albums`,
      privacy: "Ownership matching stays local; MusicBrainz verifies candidates.",
    },
    {
      id: "research",
      label: "Research music",
      description: "Explore an artist, album, genre, scene, or recording.",
      action: "Start research",
      context: researchContext.selectedLabel
        ? `${researchContext.selectedEntityType ?? "Selection"} · ${researchContext.selectedLabel}`
        : `${activeSection} · general music context`,
      privacy: researchContext.selectedLabel
        ? "The visible selection is attached; paths and the database stay local."
        : "No filters or result rows are attached unless you request them.",
    },
  ];
  const activeMode =
    modeDefinitions.find((definition) => definition.id === mode) ??
    modeDefinitions[0];
  const ActiveModeIcon = modeIcons[activeMode.id];

  async function removeHistoryItem(item: LunaHistoryItem) {
    setHistoryError(null);
    try {
      if (item.selection.source === "ai") {
        await deleteAiSnapshot(item.selection.item.id);
        setAiSnapshots((previous) =>
          previous.filter((snapshot) => snapshot.id !== item.selection.item.id),
        );
        if (researchSnapshot?.id === item.selection.item.id) {
          setResearchSnapshot(null);
        }
      } else if (item.selection.source === "playlist") {
        await deleteSavedPlaylist(item.selection.item.id);
        setSavedPlaylists((previous) =>
          previous.filter((saved) => saved.id !== item.selection.item.id),
        );
      } else {
        await deleteSavedExternalDiscovery(item.selection.item.id);
        setSavedDiscoveries((previous) =>
          previous.filter((saved) => saved.id !== item.selection.item.id),
        );
      }
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : String(error));
    }
  }

  function openHistoryItem(item: LunaHistoryItem) {
    if (
      item.selection.source === "ai" &&
      item.selection.item.content.kind === "musicResearch"
    ) {
      setResearchSnapshot(item.selection.item);
      setMode("research");
      setActiveTab("modes");
      return;
    }
    onOpenHistory(item.selection);
  }

  return (
    <aside className="luna-panel" role="dialog" aria-modal="false" aria-label="Luna">
      <header className="luna-panel-header">
        <div className="luna-panel-title">
          <span aria-hidden="true">
            <Sparkles size={18} />
          </span>
          <div>
            <strong>Luna</strong>
            <small>One assistant · six explicit modes</small>
          </div>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="Close Luna"
          title="Close Luna"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </header>

      <div className="luna-panel-tabs" role="tablist" aria-label="Luna panel">
        <button
          className={activeTab === "modes" ? "active" : ""}
          type="button"
          role="tab"
          aria-selected={activeTab === "modes"}
          onClick={() => setActiveTab("modes")}
        >
          <Sparkles size={15} />
          Modes
        </button>
        <button
          className={activeTab === "history" ? "active" : ""}
          type="button"
          role="tab"
          aria-selected={activeTab === "history"}
          onClick={() => setActiveTab("history")}
        >
          <History size={15} />
          History
          {historyItems.length > 0 ? <span>{historyItems.length}</span> : null}
        </button>
      </div>

      {activeTab === "modes" ? (
        <div className="luna-modes">
          <div className="luna-mode-strip" role="tablist" aria-label="Luna mode">
            {modeDefinitions.map((definition) => {
              const ModeIcon = modeIcons[definition.id];
              return (
                <button
                  key={definition.id}
                  className={mode === definition.id ? "active" : ""}
                  type="button"
                  role="tab"
                  aria-selected={mode === definition.id}
                  aria-label={definition.label}
                  title={definition.label}
                  onClick={() => setMode(definition.id)}
                >
                  <ModeIcon size={16} />
                  <span>{definition.label}</span>
                </button>
              );
            })}
          </div>

          <div className="luna-context-badge">
            <span aria-hidden="true">
              <ActiveModeIcon size={16} />
            </span>
            <div>
              <small>Attached context</small>
              <strong>{activeMode.context}</strong>
            </div>
          </div>

          {mode === "research" ? (
            <div className="luna-research-host">
              {researchPanel(researchSnapshot)}
            </div>
          ) : (
            <section className="luna-mode-detail" aria-live="polite">
              <div className="luna-mode-detail-heading">
                <span aria-hidden="true">
                  <ActiveModeIcon size={20} />
                </span>
                <div>
                  <h2>{activeMode.label}</h2>
                  <p>{activeMode.description}</p>
                </div>
              </div>
              <div className="luna-privacy-boundary">
                <ShieldCheck size={16} aria-hidden="true" />
                <div>
                  <strong>Privacy boundary</strong>
                  <span>{activeMode.privacy}</span>
                </div>
              </div>
              <button
                className="primary-button luna-mode-action"
                type="button"
                onClick={() =>
                  onOpenMode(mode as Exclude<LunaMode, "research">)
                }
              >
                {mode === "plan" && isChartContext ? (
                  <BarChart3 size={16} />
                ) : (
                  <ActiveModeIcon size={16} />
                )}
                <span>{activeMode.action}</span>
              </button>
            </section>
          )}
        </div>
      ) : (
        <section className="luna-history" aria-label="Luna snapshot history">
          <header>
            <div>
              <h2>Snapshot history</h2>
              <p>
                Automatic Luna answers and explicitly saved playlists and
                discoveries, in one local timeline.
              </p>
            </div>
            <span>
              <Clock3 size={14} />
              Local
            </span>
          </header>
          {historyError ? <p className="error-message">{historyError}</p> : null}
          <div className="luna-history-list">
            {historyItems.length === 0 ? (
              <div className="luna-history-empty">
                <History size={22} />
                <strong>No Luna history yet.</strong>
                <span>Completed answers save automatically; playlist and discovery saves stay explicit.</span>
              </div>
            ) : (
              historyItems.map((item) => {
                const ItemIcon = modeIcons[item.mode];
                return (
                  <article key={item.key}>
                    <button type="button" onClick={() => openHistoryItem(item)}>
                      <span className="luna-history-icon" aria-hidden="true">
                        <ItemIcon size={16} />
                      </span>
                      <span>
                        <small>{item.category}</small>
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                        <time dateTime={item.createdAt}>
                          {formatHistoryDate(item.createdAt)}
                        </time>
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${item.title}`}
                      title="Delete snapshot"
                      onClick={() => void removeHistoryItem(item)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </article>
                );
              })
            )}
          </div>
        </section>
      )}
    </aside>
  );
}
