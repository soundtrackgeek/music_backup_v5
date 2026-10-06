import { useEffect } from "react";
import {
  listenToMusicToolProgress,
  listMusicTools,
  listMusicToolFixHistory,
  listMusicToolIssues,
  exportMusicToolIssues,
  fixMusicToolIssues,
  undoMusicToolFix,
} from "../../backend";
import {
  formatToolProgress,
  isMusicToolProgressActive,
  formatToolCount,
  formatNumber,
} from "../../app/display";
import {
  createMusicToolIssueRequest,
  renewMusicToolIssueRequest,
} from "../../app/requests";
import type { WorkspaceStores } from "../../app/WorkspaceStoresProvider";

type Inputs = Pick<
  WorkspaceStores,
  | "activeSection"
  | "selectedToolId"
  | "setToolProgress"
  | "toolIssueRequest"
  | "musicTools"
  | "toolIssueResponse"
  | "toolProgress"
  | "isToolIssuesLoading"
  | "isToolFixing"
  | "setIsToolsLoading"
  | "setToolsError"
  | "setMusicTools"
  | "setToolFixHistoryError"
  | "setToolFixHistory"
  | "setSelectedToolId"
  | "setToolIssueResponse"
  | "setToolIssueRequest"
  | "setToolProgressStartedAt"
  | "setIsToolIssuesLoading"
  | "setToolIssueError"
  | "setToolExportResult"
  | "setToolFixSummary"
  | "setToolFixIssueIds"
  | "setToolFixError"
  | "toolFixIssueIds"
  | "toolFixSummary"
  | "setIsToolFixing"
  | "undoingToolFixRunId"
  | "setUndoingToolFixRunId"
>;

export function useToolsWorkspace({
  activeSection,
  selectedToolId,
  setToolProgress,
  toolIssueRequest,
  musicTools,
  toolIssueResponse,
  toolProgress,
  isToolIssuesLoading,
  isToolFixing,
  setIsToolsLoading,
  setToolsError,
  setMusicTools,
  setToolFixHistoryError,
  setToolFixHistory,
  setSelectedToolId,
  setToolIssueResponse,
  setToolIssueRequest,
  setToolProgressStartedAt,
  setIsToolIssuesLoading,
  setToolIssueError,
  setToolExportResult,
  setToolFixSummary,
  setToolFixIssueIds,
  setToolFixError,
  toolFixIssueIds,
  toolFixSummary,
  setIsToolFixing,
  undoingToolFixRunId,
  setUndoingToolFixRunId,
}: Inputs) {
  useEffect(() => {
    if (activeSection !== "Tools" || !selectedToolId) {
      return;
    }

    let unlisten: (() => void) | null = null;
    void listenToMusicToolProgress((nextProgress) => {
      setToolProgress((previous) =>
        nextProgress.toolId === selectedToolId &&
        nextProgress.requestId === toolIssueRequest.requestId
          ? nextProgress
          : previous,
      );
    }).then((nextUnlisten) => {
      unlisten = nextUnlisten;
    });

    return () => {
      unlisten?.();
    };
  }, [activeSection, selectedToolId, toolIssueRequest.requestId]);

  const selectedCatalogTool =
    musicTools.find((tool) => tool.id === selectedToolId) ?? null;

  const currentToolIssueResponse =
    toolIssueResponse?.tool.id === selectedToolId ? toolIssueResponse : null;

  const selectedTool = currentToolIssueResponse?.tool ?? selectedCatalogTool;

  const activeToolProgress =
    toolProgress?.toolId === selectedToolId &&
    toolProgress.requestId === toolIssueRequest.requestId
      ? toolProgress
      : null;

  const activeToolProgressText = formatToolProgress(activeToolProgress);

  const isToolProgressActive = isMusicToolProgressActive(activeToolProgress);

  const isToolRunPending =
    isToolIssuesLoading || isToolProgressActive || isToolFixing;

  useEffect(() => {
    if (activeSection !== "Tools") {
      return;
    }

    let cancelled = false;
    setIsToolsLoading(true);
    setToolsError(null);
    void listMusicTools()
      .then((nextTools) => {
        if (!cancelled) {
          setMusicTools((previous) =>
            nextTools.length === 0
              ? previous
              : nextTools.map((nextTool) => {
                  const previousTool = previous.find(
                    (tool) => tool.id === nextTool.id,
                  );
                  return previousTool && previousTool.issueCount >= 0
                    ? {
                        ...nextTool,
                        issueCount: previousTool.issueCount,
                        albumCount: previousTool.albumCount,
                        trackCount: previousTool.trackCount,
                      }
                    : nextTool;
                }),
          );
        }
      })
      .catch((searchError) => {
        if (!cancelled) {
          setToolsError(
            searchError instanceof Error
              ? searchError.message
              : String(searchError),
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsToolsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection]);

  useEffect(() => {
    if (activeSection !== "Tools") {
      return;
    }

    let cancelled = false;
    setToolFixHistoryError(null);
    void listMusicToolFixHistory()
      .then((history) => {
        if (!cancelled) {
          setToolFixHistory(history);
        }
      })
      .catch((historyError) => {
        if (!cancelled) {
          setToolFixHistoryError(
            historyError instanceof Error
              ? historyError.message
              : String(historyError),
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection]);

  useEffect(() => {
    if (activeSection !== "Tools") {
      return;
    }

    if (musicTools.length === 0) {
      setSelectedToolId(null);
      setToolIssueResponse(null);
      return;
    }

    setSelectedToolId((previous) =>
      previous && musicTools.some((tool) => tool.id === previous)
        ? previous
        : musicTools[0].id,
    );
  }, [activeSection, musicTools]);

  useEffect(() => {
    if (activeSection !== "Tools" || !selectedToolId) {
      return;
    }

    setToolIssueRequest((previous) =>
      previous.toolId === selectedToolId
        ? previous
        : {
            ...createMusicToolIssueRequest(selectedToolId),
            limit: previous.limit,
          },
    );
  }, [activeSection, selectedToolId]);

  useEffect(() => {
    if (
      activeSection !== "Tools" ||
      !selectedToolId ||
      toolIssueRequest.toolId !== selectedToolId
    ) {
      return;
    }

    let cancelled = false;
    setToolProgressStartedAt(Date.now());
    setToolProgress({
      toolId: toolIssueRequest.toolId,
      requestId: toolIssueRequest.requestId,
      status: "starting",
      percent: 5,
      message: "Starting validation count.",
    });
    const timer = window.setTimeout(() => {
      setIsToolIssuesLoading(true);
      setToolIssueError(null);
      void listMusicToolIssues(toolIssueRequest)
        .then((nextResponse) => {
          if (!cancelled) {
            setToolIssueResponse(nextResponse);
            setToolProgress({
              toolId: toolIssueRequest.toolId,
              requestId: toolIssueRequest.requestId,
              status: "completed",
              percent: 100,
              message: "Validation count complete.",
            });
          }
        })
        .catch((searchError) => {
          if (!cancelled) {
            setToolIssueError(
              searchError instanceof Error
                ? searchError.message
                : String(searchError),
            );
            setToolIssueResponse(null);
            setToolProgress({
              toolId: toolIssueRequest.toolId,
              requestId: toolIssueRequest.requestId,
              status: "failed",
              percent: 100,
              message: "Validation count failed.",
            });
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsToolIssuesLoading(false);
          }
        });
    }, 160);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeSection, selectedToolId, toolIssueRequest]);

  useEffect(() => {
    if (!toolIssueResponse) {
      return;
    }

    setMusicTools((previous) =>
      previous.map((tool) =>
        tool.id === toolIssueResponse.tool.id ? toolIssueResponse.tool : tool,
      ),
    );
  }, [toolIssueResponse]);

  useEffect(() => {
    setToolExportResult(null);
    setToolFixSummary((previous) => (previous?.applied ? previous : null));
    setToolFixIssueIds([]);
    setToolFixError(null);
  }, [
    toolIssueRequest.toolId,
    toolIssueRequest.searchText,
    toolIssueRequest.sort.field,
    toolIssueRequest.sort.direction,
    toolIssueRequest.limit,
    toolIssueRequest.offset,
  ]);

  function clearToolQuery() {
    setToolIssueRequest((previous) => ({
      ...createMusicToolIssueRequest(previous.toolId),
      limit: previous.limit,
    }));
    setToolExportResult(null);
    setToolFixSummary(null);
    setToolFixError(null);
  }

  function selectMusicTool(toolId: string) {
    setSelectedToolId(toolId);
    setToolIssueRequest((previous) => ({
      ...createMusicToolIssueRequest(toolId),
      limit: previous.limit,
    }));
    setToolExportResult(null);
    setToolFixSummary(null);
    setToolFixError(null);
  }

  async function refreshMusicTools() {
    setIsToolsLoading(true);
    setToolsError(null);
    try {
      const nextTools = await listMusicTools();
      setMusicTools(nextTools);
    } catch (error) {
      setToolsError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsToolsLoading(false);
    }
  }

  async function runToolExport(format: string) {
    if (!selectedTool) {
      return;
    }
    const result = await exportMusicToolIssues(
      {
        ...toolIssueRequest,
        toolId: selectedTool.id,
      },
      format,
    );
    setToolExportResult(result);
  }

  async function refreshToolFixHistory() {
    setToolFixHistoryError(null);
    try {
      setToolFixHistory(await listMusicToolFixHistory());
    } catch (error) {
      setToolFixHistoryError(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async function runToolFix(apply: boolean) {
    if (!selectedTool || !currentToolIssueResponse) {
      return;
    }

    const issueIds = apply
      ? toolFixIssueIds
      : currentToolIssueResponse.rows.map((row) => row.id);
    if (issueIds.length === 0) {
      return;
    }

    if (
      apply &&
      (!toolFixSummary ||
        toolFixSummary.toolId !== selectedTool.id ||
        toolFixSummary.applied)
    ) {
      setToolFixError("Preview this repair again before applying it.");
      return;
    }

    setIsToolFixing(true);
    setToolFixError(null);
    try {
      const summary = await fixMusicToolIssues({
        toolId: selectedTool.id,
        issueIds,
        apply,
      });
      setToolFixSummary(summary);
      setToolFixIssueIds(apply ? [] : issueIds);
      if (apply) {
        setToolExportResult(null);
        await refreshToolFixHistory();
        setToolIssueRequest((previous) =>
          renewMusicToolIssueRequest(previous, {
            offset: 0,
          }),
        );
      }
    } catch (error) {
      setToolFixError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsToolFixing(false);
    }
  }

  async function runToolUndo(runId: number) {
    if (undoingToolFixRunId != null) {
      return;
    }

    setUndoingToolFixRunId(runId);
    setToolFixError(null);
    try {
      await undoMusicToolFix(runId);
      setToolFixSummary(null);
      setToolFixIssueIds([]);
      setToolExportResult(null);
      await refreshToolFixHistory();
      setToolIssueRequest((previous) =>
        renewMusicToolIssueRequest(previous, {
          offset: 0,
        }),
      );
    } catch (error) {
      setToolFixError(error instanceof Error ? error.message : String(error));
    } finally {
      setUndoingToolFixRunId(null);
    }
  }

  const toolIssueTotal = currentToolIssueResponse?.total ?? 0;

  const toolIssuePageStart =
    toolIssueTotal === 0 ? 0 : toolIssueRequest.offset + 1;

  const toolIssuePageEnd = Math.min(
    toolIssueTotal,
    toolIssueRequest.offset + toolIssueRequest.limit,
  );

  const totalToolIssues = musicTools.every((tool) => tool.issueCount >= 0)
    ? musicTools.reduce((sum, tool) => sum + tool.issueCount, 0)
    : null;

  const selectedToolIssueCount = selectedTool?.issueCount ?? toolIssueTotal;

  const selectedToolIssueValue =
    isToolProgressActive && activeToolProgressText
      ? activeToolProgressText
      : formatToolCount(selectedToolIssueCount);

  const toolIssuePanelCaption =
    isToolRunPending && activeToolProgress && activeToolProgressText
      ? `${activeToolProgress.message} ${activeToolProgressText}`
      : `${formatNumber(toolIssuePageStart)}-${formatNumber(toolIssuePageEnd)} of ${formatNumber(toolIssueTotal)}`;
  return {
    selectedCatalogTool,
    currentToolIssueResponse,
    selectedTool,
    activeToolProgress,
    activeToolProgressText,
    isToolProgressActive,
    isToolRunPending,
    clearToolQuery,
    selectMusicTool,
    refreshMusicTools,
    runToolExport,
    refreshToolFixHistory,
    runToolFix,
    runToolUndo,
    toolIssueTotal,
    toolIssuePageStart,
    toolIssuePageEnd,
    totalToolIssues,
    selectedToolIssueCount,
    selectedToolIssueValue,
    toolIssuePanelCaption,
  };
}
