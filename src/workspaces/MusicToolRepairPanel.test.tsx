import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type {
  MusicToolFixHistoryEntry,
  MusicToolFixSummary,
  MusicToolIssueResponse,
  MusicToolSummary,
} from "../types";
import { MusicToolRepairPanel } from "./MusicToolRepairPanel";

const tool: MusicToolSummary = {
  id: "whitespace-anomalies",
  label: "Whitespace anomalies",
  description: "Track metadata with repeated internal spaces.",
  severity: "low",
  scope: "tracks",
  issueCount: 1,
  albumCount: 1,
  trackCount: 1,
};

const response: MusicToolIssueResponse = {
  tool,
  total: 1,
  limit: 50,
  offset: 0,
  rows: [
    {
      id: "whitespace-anomalies:2",
      toolId: tool.id,
      severity: "low",
      entityType: "tracks",
      albumId: "album:1",
      trackId: 2,
      album: "Actually",
      albumArtistDisplay: "Pet  Shop Boys",
      title: "What  Have I Done?",
      canonicalGenre: "Synthpop",
      year: 1987,
      detail: "Repeated internal whitespace",
      value: "Repeated spaces",
      filename: "02 What  Have I Done.mp3",
      filePath: "D:\\Music\\Pet  Shop Boys\\Actually",
    },
  ],
};

const preview: MusicToolFixSummary = {
  repairId: null,
  toolId: tool.id,
  action: "compact-whitespace",
  applied: false,
  confidence: "high",
  sourceWarning:
    "The app-local database changes, while MusicBee TSV rows remain unchanged.",
  requestedCount: 1,
  fixableCount: 1,
  affectedAlbumCount: 1,
  affectedTrackCount: 1,
  changedAlbumCount: 0,
  changedTrackCount: 0,
  skippedCount: 0,
  backupPath: null,
  message: "Preview found one exact affected-row diff.",
  diffs: [
    {
      id: "tracks:2",
      entityType: "tracks",
      entityId: "2",
      albumId: "album:1",
      trackId: 2,
      label: "What  Have I Done?",
      context: "Pet  Shop Boys / Actually",
      confidence: "high",
      sourceWarning: "Source unchanged.",
      changes: [
        {
          field: "title",
          label: "Track title",
          before: "What  Have I Done?",
          after: "What Have I Done?",
        },
      ],
    },
  ],
};

const historyEntry: MusicToolFixHistoryEntry = {
  id: 7,
  toolId: tool.id,
  toolLabel: tool.label,
  action: "compact-whitespace",
  status: "applied",
  confidence: "high",
  requestedCount: 1,
  fixableCount: 1,
  affectedAlbumCount: 1,
  affectedTrackCount: 1,
  changedAlbumCount: 1,
  changedTrackCount: 1,
  diffCount: 2,
  backupPath: "backup.sqlite3",
  undoBackupPath: null,
  sourceWarning: preview.sourceWarning,
  message: "Repair applied.",
  createdAt: "2026-07-24T10:00:00Z",
  undoneAt: null,
  canUndo: true,
};

function renderPanel(
  values: Partial<Parameters<typeof MusicToolRepairPanel>[0]> = {},
) {
  const props: Parameters<typeof MusicToolRepairPanel>[0] = {
    tool,
    response,
    isPending: false,
    fixSummary: null,
    fixHistory: [],
    fixError: null,
    historyError: null,
    undoingRunId: null,
    onPreview: vi.fn(async () => {}),
    onApply: vi.fn(async () => {}),
    onUndo: vi.fn(async () => {}),
    ...values,
  };
  render(<MusicToolRepairPanel {...props} />);
  return props;
}

describe("MusicToolRepairPanel", () => {
  it("requires an explicit preview before apply", async () => {
    const user = userEvent.setup();
    const props = renderPanel();

    expect(screen.getByText("Local repair, source unchanged")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Apply reviewed repair" }),
    ).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Preview repair" }));
    expect(props.onPreview).toHaveBeenCalledOnce();
  });

  it("shows exact before-and-after values with confidence", () => {
    renderPanel({ fixSummary: preview });

    const values = Array.from(
      screen.getByLabelText("Affected-row diffs").querySelectorAll("code"),
    ).map((element) => element.textContent);
    expect(values).toEqual(["What  Have I Done?", "What Have I Done?"]);
    expect(screen.getAllByText("High confidence").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Apply reviewed repair" }),
    ).toBeEnabled();
  });

  it("exposes undo only for an applied history entry", async () => {
    const user = userEvent.setup();
    const props = renderPanel({ fixHistory: [historyEntry] });

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(props.onUndo).toHaveBeenCalledWith(7);
  });
});
