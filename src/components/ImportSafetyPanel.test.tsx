import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import type { ImportPreview, ImportProgress, ImportRun } from "../types";
import { ImportSafetyPanel } from "./ImportSafetyPanel";

const progress: ImportProgress = {
  status: "ready",
  sessionId: 7,
  processedRows: 1_136_420,
  processedBytes: 240_000_000,
  totalBytes: 240_000_000,
  albumCount: 77_104,
  message: "Delta ready. Review it before applying the atomic import.",
};

const preview: ImportPreview = {
  sessionId: 7,
  sourcePath: "library.tsv",
  sourceSizeBytes: 240_000_000,
  sourceModifiedMs: 1,
  status: "ready",
  processedRows: 1_136_420,
  processedBytes: 240_000_000,
  trackRows: 1_136_420,
  albumCount: 77_104,
  addedTracks: 6_128,
  changedTracks: 1_442,
  removedTracks: 590,
  addedAlbums: 418,
  changedAlbums: 236,
  removedAlbums: 103,
  suspiciousAlbumCount: 1,
  suspiciousAlbums: [
    {
      albumId: "album:1",
      album: "Low Season",
      albumArtistDisplay: "Glass Harbour",
      year: 2007,
      reason: "Track count falls from 14 to 8",
      previousTrackCount: 14,
      currentTrackCount: 8,
    },
  ],
  createdAt: "2026-07-24T10:00:00Z",
  updatedAt: "2026-07-24T10:03:20Z",
  completedAt: null,
  importRunId: null,
  errorMessage: null,
  canResume: false,
  sourceChanged: false,
};

const appliedRun: ImportRun = {
  id: 9,
  sourcePath: "library.tsv",
  sourceSizeBytes: 240_000_000,
  startedAt: "2026-07-24T10:04:00Z",
  completedAt: "2026-07-24T10:04:08Z",
  status: "completed",
  trackRows: 1_136_420,
  albumCount: 77_104,
  durationMs: 8_420,
  backupPath: "rollback.sqlite3",
  errorMessage: null,
  addedTracks: 6_128,
  changedTracks: 1_442,
  removedTracks: 590,
  addedAlbums: 418,
  changedAlbums: 236,
  removedAlbums: 103,
  ratingEventsCount: 24,
};

function renderPanel(
  overrides: Partial<ComponentProps<typeof ImportSafetyPanel>> = {},
) {
  const handlers = {
    onSourcePathChange: vi.fn(),
    onPrepare: vi.fn(),
    onCancel: vi.fn(),
    onApply: vi.fn(),
    onRollback: vi.fn(),
  };
  render(
    <ImportSafetyPanel
      sourcePath="library.tsv"
      preview={preview}
      progress={progress}
      latestAppliedRun={null}
      databasePath="music-library.sqlite3"
      error={null}
      isPreparing={false}
      isApplying={false}
      isCancelling={false}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

describe("ImportSafetyPanel", () => {
  it("shows the complete pre-import delta and suspicious album evidence", () => {
    const handlers = renderPanel();

    expect(screen.getByText("Pre-import delta")).toBeVisible();
    expect(screen.getByRole("region", { name: "Track delta" })).toHaveTextContent(
      "6,128",
    );
    expect(screen.getByRole("region", { name: "Album delta" })).toHaveTextContent(
      "103",
    );
    expect(screen.getByText("Low Season")).toBeVisible();
    expect(screen.getByText("Track count falls from 14 to 8")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Apply safely" }));
    expect(handlers.onApply).toHaveBeenCalledOnce();
  });

  it("offers cancellation while staging and resume after a checkpoint", () => {
    const handlers = renderPanel({
      preview: { ...preview, status: "cancelled", canResume: true },
      progress: {
        ...progress,
        status: "cancelled",
        processedRows: 500_000,
        processedBytes: 100_000_000,
        message: "Preparation stopped at a durable checkpoint.",
      },
      isPreparing: true,
    });

    expect(screen.getByRole("button", { name: "Resuming" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(handlers.onCancel).toHaveBeenCalledOnce();
  });

  it("exposes one-click rollback for the exact generated backup", () => {
    const handlers = renderPanel({ latestAppliedRun: appliedRun });

    expect(screen.getByText("rollback.sqlite3")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Roll back" }));
    expect(handlers.onRollback).toHaveBeenCalledWith(appliedRun);
  });
});
