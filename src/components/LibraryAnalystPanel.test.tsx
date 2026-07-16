import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AiLibraryAnalysis } from "../types";
import { LibraryAnalystPanel } from "./LibraryAnalystPanel";

const backend = vi.hoisted(() => ({
  analyzeLibrary: vi.fn(),
  deleteAiSnapshot: vi.fn(),
  listAiSnapshots: vi.fn(),
  saveAiSnapshot: vi.fn(),
}));

vi.mock("../backend", () => backend);

describe("LibraryAnalystPanel", () => {
  beforeEach(() => {
    backend.analyzeLibrary.mockReset();
    backend.deleteAiSnapshot.mockReset();
    backend.listAiSnapshots.mockReset();
    backend.saveAiSnapshot.mockReset();
    backend.listAiSnapshots.mockResolvedValue([]);
  });

  it("sends the selected lens and renders a typed aggregate-only report", async () => {
    const user = userEvent.setup();
    const analysis = {
      lens: "ratingBacklog",
      headline: "The 1980s hold the clearest rating opportunity",
      summary: "The open work is concentrated enough to tackle deliberately.",
      findings: [
        {
          title: "One decade leads the backlog",
          evidence: "The 1980s contain 120 unrated albums.",
          interpretation: "A decade-focused pass would reduce the largest block.",
        },
      ],
      nextQuestions: ["Which genres contain the largest unrated backlog?"],
      profileSections: ["overview", "ratingProgress"],
      aggregatePointsShared: 17,
      model: "gpt-5.6-luna",
      usage: {
        inputTokens: 940,
        cachedInputTokens: 210,
        outputTokens: 180,
      },
    } satisfies AiLibraryAnalysis;
    backend.analyzeLibrary.mockResolvedValueOnce(analysis);
    backend.saveAiSnapshot.mockResolvedValueOnce({
      id: 7,
      title: analysis.headline,
      content: {
        kind: "libraryAnalysis",
        prompt: "Where should I start?",
        result: analysis,
      },
      libraryImportRunId: 8,
      libraryImportedAt: "2026-07-16T10:00:00Z",
      libraryAlbumCount: 73_128,
      libraryTrackCount: 1_111_666,
      createdAt: "2026-07-16T10:05:00Z",
    });

    render(<LibraryAnalystPanel isAvailable />);
    await user.click(screen.getByRole("button", { name: /Rating backlog/ }));
    await user.type(
      screen.getByRole("textbox", { name: "Focus question" }),
      "Where should I start?",
    );
    await user.click(screen.getByRole("button", { name: "Analyze library" }));

    expect(backend.analyzeLibrary).toHaveBeenCalledWith({
      lens: "ratingBacklog",
      focus: "Where should I start?",
    });
    expect(
      screen.getByRole("textbox", { name: "Focus question" }),
    ).toHaveValue("");
    expect(
      await screen.findByRole("heading", {
        level: 3,
        name: "The 1980s hold the clearest rating opportunity",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/17 aggregate points/)).toBeInTheDocument();
    expect(screen.getByText(/no album, track, or artist names/)).toBeInTheDocument();
    expect(screen.getByText(/940 input, 210 cached/)).toBeInTheDocument();
    expect(backend.saveAiSnapshot).toHaveBeenCalledWith({
      title: analysis.headline,
      content: {
        kind: "libraryAnalysis",
        prompt: "Where should I start?",
        result: analysis,
      },
    });
    expect(screen.getByText(/saved automatically/)).toBeInTheDocument();
  });

  it("keeps analysis disabled until a library is available", () => {
    render(<LibraryAnalystPanel isAvailable={false} />);

    expect(
      screen.getByRole("button", { name: "Analyze library" }),
    ).toBeDisabled();
    expect(
      screen.getByText("Import a library before running an analysis."),
    ).toBeInTheDocument();
  });

  it("analyzes a useful next question immediately when clicked", async () => {
    const user = userEvent.setup();
    const firstAnalysis = {
      lens: "overview",
      headline: "Collection overview",
      summary: "A broad first pass.",
      findings: [],
      nextQuestions: ["Which decade has the largest rating backlog?"],
      profileSections: ["overview"],
      aggregatePointsShared: 8,
      model: "gpt-5.6-luna",
      usage: { inputTokens: 800, cachedInputTokens: 0, outputTokens: 150 },
    } satisfies AiLibraryAnalysis;
    const followUpAnalysis = {
      ...firstAnalysis,
      headline: "The 1980s have the largest rating backlog",
      summary: "The follow-up ran automatically.",
      nextQuestions: [],
    } satisfies AiLibraryAnalysis;
    backend.analyzeLibrary
      .mockResolvedValueOnce(firstAnalysis)
      .mockResolvedValueOnce(followUpAnalysis);
    backend.saveAiSnapshot
      .mockResolvedValueOnce({
        id: 21,
        title: firstAnalysis.headline,
        content: {
          kind: "libraryAnalysis",
          prompt: "",
          result: firstAnalysis,
        },
        libraryImportRunId: 8,
        libraryImportedAt: "2026-07-16T10:00:00Z",
        libraryAlbumCount: 73_128,
        libraryTrackCount: 1_111_666,
        createdAt: "2026-07-16T10:05:00Z",
      })
      .mockResolvedValueOnce({
        id: 22,
        title: followUpAnalysis.headline,
        content: {
          kind: "libraryAnalysis",
          prompt: "Which decade has the largest rating backlog?",
          result: followUpAnalysis,
        },
        libraryImportRunId: 8,
        libraryImportedAt: "2026-07-16T10:00:00Z",
        libraryAlbumCount: 73_128,
        libraryTrackCount: 1_111_666,
        createdAt: "2026-07-16T10:06:00Z",
      });

    render(<LibraryAnalystPanel isAvailable />);
    await user.click(screen.getByRole("button", { name: "Analyze library" }));
    await user.click(
      await screen.findByRole("button", {
        name: "Which decade has the largest rating backlog?",
      }),
    );

    expect(backend.analyzeLibrary).toHaveBeenNthCalledWith(2, {
      lens: "overview",
      focus: "Which decade has the largest rating backlog?",
    });
    expect(
      screen.getByRole("textbox", { name: "Focus question" }),
    ).toHaveValue("");
    expect(
      await screen.findByRole("heading", {
        level: 3,
        name: "The 1980s have the largest rating backlog",
      }),
    ).toBeInTheDocument();
    expect(backend.saveAiSnapshot).toHaveBeenLastCalledWith({
      title: followUpAnalysis.headline,
      content: {
        kind: "libraryAnalysis",
        prompt: "Which decade has the largest rating backlog?",
        result: followUpAnalysis,
      },
    });
  });

  it("reopens an exact analyst snapshot without another API call", async () => {
    const user = userEvent.setup();
    const analysis = {
      lens: "overview",
      headline: "Saved collection overview",
      summary: "The saved summary.",
      findings: [
        {
          title: "Saved finding",
          evidence: "73,128 albums.",
          interpretation: "This is the exact saved interpretation.",
        },
      ],
      nextQuestions: ["What changed?"],
      profileSections: ["overview"],
      aggregatePointsShared: 8,
      model: "gpt-5.6-luna",
      usage: { inputTokens: 800, cachedInputTokens: 0, outputTokens: 150 },
    } satisfies AiLibraryAnalysis;
    backend.listAiSnapshots.mockResolvedValueOnce([
      {
        id: 11,
        title: analysis.headline,
        content: { kind: "libraryAnalysis", prompt: "", result: analysis },
        libraryImportRunId: 8,
        libraryImportedAt: "2026-07-16T10:00:00Z",
        libraryAlbumCount: 73_128,
        libraryTrackCount: 1_111_666,
        createdAt: "2026-07-16T10:05:00Z",
      },
    ]);

    render(<LibraryAnalystPanel isAvailable />);
    const savedTitle = await screen.findByText("Saved collection overview", {
      selector: ".ai-snapshot-list strong",
    });
    await user.click(savedTitle.closest("button")!);

    expect(
      screen.getByRole("heading", {
        level: 3,
        name: "Saved collection overview",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/saved snapshot/)).toBeInTheDocument();
    expect(backend.analyzeLibrary).not.toHaveBeenCalled();
  });
});
