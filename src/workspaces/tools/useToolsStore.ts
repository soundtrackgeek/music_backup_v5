import {
  type MusicToolSummary,
  type MusicToolIssueRequest,
  type MusicToolIssueResponse,
  type MusicToolProgress,
  type ExportResult,
  type MusicToolFixSummary,
  type MusicToolFixHistoryEntry,
} from "../../types";
import { musicToolCatalog } from "../../app/config";
import { createMusicToolIssueRequest } from "../../app/requests";
import { useMemo } from "react";
import {
  createWorkspaceContext,
  createWorkspaceSetters,
  workspaceReducer,
} from "../../app/workspaceStore";
import { useReducer } from "react";
type ToolsState = {
  musicTools: MusicToolSummary[];
  toolsError: string | null;
  isToolsLoading: boolean;
  selectedToolId: string | null;
  toolIssueRequest: MusicToolIssueRequest;
  toolIssueResponse: MusicToolIssueResponse | null;
  toolIssueError: string | null;
  isToolIssuesLoading: boolean;
  toolProgress: MusicToolProgress | null;
  toolProgressStartedAt: number | null;
  toolExportResult: ExportResult | null;
  toolFixSummary: MusicToolFixSummary | null;
  toolFixIssueIds: string[];
  toolFixHistory: MusicToolFixHistoryEntry[];
  toolFixHistoryError: string | null;
  toolFixError: string | null;
  isToolFixing: boolean;
  undoingToolFixRunId: number | null;
};

function createInitialState(): ToolsState {
  const musicTools: MusicToolSummary[] = (() => musicToolCatalog)();
  const toolsError: string | null = null;
  const isToolsLoading: boolean = false;
  const selectedToolId: string | null = musicToolCatalog[0]?.id ?? null;
  const toolIssueRequest: MusicToolIssueRequest = (() =>
    createMusicToolIssueRequest())();
  const toolIssueResponse: MusicToolIssueResponse | null = null;
  const toolIssueError: string | null = null;
  const isToolIssuesLoading: boolean = false;
  const toolProgress: MusicToolProgress | null = null;
  const toolProgressStartedAt: number | null = null;
  const toolExportResult: ExportResult | null = null;
  const toolFixSummary: MusicToolFixSummary | null = null;
  const toolFixIssueIds: string[] = [];
  const toolFixHistory: MusicToolFixHistoryEntry[] = [];
  const toolFixHistoryError: string | null = null;
  const toolFixError: string | null = null;
  const isToolFixing: boolean = false;
  const undoingToolFixRunId: number | null = null;
  return {
    musicTools,
    toolsError,
    isToolsLoading,
    selectedToolId,
    toolIssueRequest,
    toolIssueResponse,
    toolIssueError,
    isToolIssuesLoading,
    toolProgress,
    toolProgressStartedAt,
    toolExportResult,
    toolFixSummary,
    toolFixIssueIds,
    toolFixHistory,
    toolFixHistoryError,
    toolFixError,
    isToolFixing,
    undoingToolFixRunId,
  };
}

function useToolsStoreValue() {
  const [state, dispatch] = useReducer(
    workspaceReducer<ToolsState>,
    undefined,
    createInitialState,
  );
  const {
    musicTools,
    toolsError,
    isToolsLoading,
    selectedToolId,
    toolIssueRequest,
    toolIssueResponse,
    toolIssueError,
    isToolIssuesLoading,
    toolProgress,
    toolProgressStartedAt,
    toolExportResult,
    toolFixSummary,
    toolFixIssueIds,
    toolFixHistory,
    toolFixHistoryError,
    toolFixError,
    isToolFixing,
    undoingToolFixRunId,
  } = state;
  const setters = useMemo(
    () =>
      createWorkspaceSetters<ToolsState>(dispatch, [
        "musicTools",
        "toolsError",
        "isToolsLoading",
        "selectedToolId",
        "toolIssueRequest",
        "toolIssueResponse",
        "toolIssueError",
        "isToolIssuesLoading",
        "toolProgress",
        "toolProgressStartedAt",
        "toolExportResult",
        "toolFixSummary",
        "toolFixIssueIds",
        "toolFixHistory",
        "toolFixHistoryError",
        "toolFixError",
        "isToolFixing",
        "undoingToolFixRunId",
      ]),
    [dispatch],
  );
  const {
    setMusicTools,
    setToolsError,
    setIsToolsLoading,
    setSelectedToolId,
    setToolIssueRequest,
    setToolIssueResponse,
    setToolIssueError,
    setIsToolIssuesLoading,
    setToolProgress,
    setToolProgressStartedAt,
    setToolExportResult,
    setToolFixSummary,
    setToolFixIssueIds,
    setToolFixHistory,
    setToolFixHistoryError,
    setToolFixError,
    setIsToolFixing,
    setUndoingToolFixRunId,
  } = setters;

  return {
    musicTools,
    setMusicTools,
    toolsError,
    setToolsError,
    isToolsLoading,
    setIsToolsLoading,
    selectedToolId,
    setSelectedToolId,
    toolIssueRequest,
    setToolIssueRequest,
    toolIssueResponse,
    setToolIssueResponse,
    toolIssueError,
    setToolIssueError,
    isToolIssuesLoading,
    setIsToolIssuesLoading,
    toolProgress,
    setToolProgress,
    toolProgressStartedAt,
    setToolProgressStartedAt,
    toolExportResult,
    setToolExportResult,
    toolFixSummary,
    setToolFixSummary,
    toolFixIssueIds,
    setToolFixIssueIds,
    toolFixHistory,
    setToolFixHistory,
    toolFixHistoryError,
    setToolFixHistoryError,
    toolFixError,
    setToolFixError,
    isToolFixing,
    setIsToolFixing,
    undoingToolFixRunId,
    setUndoingToolFixRunId,
  };
}

export const { Provider: ToolsStoreProvider, useStore: useToolsStore } =
  createWorkspaceContext(useToolsStoreValue, "tools");
