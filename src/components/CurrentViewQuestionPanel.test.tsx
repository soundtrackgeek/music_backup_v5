import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createRequest } from "../app/requests";
import type { AiCurrentViewAnswer } from "../types";
import { CurrentViewQuestionPanel } from "./CurrentViewQuestionPanel";

const backend = vi.hoisted(() => ({
  askCurrentView: vi.fn(),
  deleteAiSnapshot: vi.fn(),
  exportAiMarkdown: vi.fn(),
  listAiSnapshots: vi.fn(),
  saveAiSnapshot: vi.fn(),
}));

vi.mock("../backend", () => backend);

describe("CurrentViewQuestionPanel", () => {
  beforeEach(() => {
    backend.askCurrentView.mockReset();
    backend.deleteAiSnapshot.mockReset();
    backend.exportAiMarkdown.mockReset();
    backend.listAiSnapshots.mockReset();
    backend.saveAiSnapshot.mockReset();
    backend.listAiSnapshots.mockResolvedValue([]);
  });

  it("sends the question with a snapshot of the active local request", async () => {
    const user = userEvent.setup();
    const request = createRequest("albums");
    request.filters.genres = ["AOR"];
    request.filters.yearFrom = 1984;
    request.filters.yearTo = 1984;
    const answer = {
      answer: "The view contains 14 albums, led by Journey with 3.",
      view: "albums",
      matchingRows: 14,
      analysisCount: 2,
      namedRowsShared: 0,
      model: "gpt-5.6-luna",
      usage: {
        inputTokens: 820,
        cachedInputTokens: 200,
        outputTokens: 75,
      },
    } satisfies AiCurrentViewAnswer;
    backend.askCurrentView.mockResolvedValueOnce(answer);
    backend.saveAiSnapshot.mockResolvedValueOnce({
      id: 15,
      title: "Which artists appear most often?",
      content: {
        kind: "searchAnswer",
        prompt: "Which artists appear most often?",
        request,
        result: answer,
      },
      libraryImportRunId: 8,
      libraryImportedAt: "2026-07-16T10:00:00Z",
      libraryAlbumCount: 73_128,
      libraryTrackCount: 1_111_666,
      createdAt: "2026-07-16T10:05:00Z",
    });

    render(<CurrentViewQuestionPanel context="search" request={request} />);
    const question = "Which artists appear most often?";
    await user.type(
      screen.getByRole("textbox", { name: "Question about the current view" }),
      question,
    );
    await user.click(screen.getByRole("button", { name: "Ask" }));

    expect(backend.askCurrentView).toHaveBeenCalledWith({ question, request });
    expect(screen.getByText(/led by Journey/)).toBeInTheDocument();
    expect(screen.getByText(/14 matching albums/)).toBeInTheDocument();
    expect(screen.getByText(/no names shared/)).toBeInTheDocument();
    expect(screen.getByText(/820 input, 200 cached/)).toBeInTheDocument();
    expect(backend.saveAiSnapshot).toHaveBeenCalledWith({
      title: question,
      content: {
        kind: "searchAnswer",
        prompt: question,
        request,
        result: answer,
      },
    });
    expect(screen.getByText("Luna · saved")).toBeInTheDocument();
  });

  it("reports failures without inventing an answer", async () => {
    const user = userEvent.setup();
    backend.askCurrentView.mockRejectedValueOnce(
      new Error("OpenAI request failed (429)."),
    );

    render(
      <CurrentViewQuestionPanel
        context="search"
        request={createRequest("tracks")}
      />,
    );
    await user.type(
      screen.getByRole("textbox", { name: "Question about the current view" }),
      "How many are unrated?",
    );
    await user.click(screen.getByRole("button", { name: "Ask" }));

    expect(await screen.findByText("OpenAI request failed (429).")).toBeInTheDocument();
    expect(screen.queryByText("Luna", { selector: "strong" })).not.toBeInTheDocument();
    expect(backend.saveAiSnapshot).not.toHaveBeenCalled();
  });

  it("reopens a saved current-view answer without another Luna request", async () => {
    const user = userEvent.setup();
    const request = createRequest("albums");
    const result = {
      answer: "The saved view contained 14 AOR albums.",
      view: "albums",
      matchingRows: 14,
      analysisCount: 1,
      namedRowsShared: 0,
      model: "gpt-5.6-luna",
      usage: { inputTokens: 400, cachedInputTokens: 0, outputTokens: 60 },
    } satisfies AiCurrentViewAnswer;
    backend.listAiSnapshots.mockResolvedValueOnce([
      {
        id: 22,
        title: "How many albums?",
        content: {
          kind: "searchAnswer",
          prompt: "How many albums?",
          request,
          result,
        },
        libraryImportRunId: 8,
        libraryImportedAt: "2026-07-16T10:00:00Z",
        libraryAlbumCount: 73_128,
        libraryTrackCount: 1_111_666,
        createdAt: "2026-07-16T10:05:00Z",
      },
    ]);

    render(<CurrentViewQuestionPanel context="search" request={request} />);
    const savedTitle = await screen.findByText("How many albums?", {
      selector: ".ai-snapshot-list strong",
    });
    await user.click(savedTitle.closest("button")!);

    expect(screen.getByText(/saved view contained 14 AOR albums/)).toBeInTheDocument();
    expect(screen.getByText("Luna · saved answer")).toBeInTheDocument();
    expect(backend.askCurrentView).not.toHaveBeenCalled();
  });
});
