import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createChartConfig, createRequest } from "../app/requests";
import type { AiCompiledQuery } from "../types";
import { NaturalLanguageQueryPanel } from "./NaturalLanguageQueryPanel";

const backend = vi.hoisted(() => ({
  askCurrentView: vi.fn(),
  compileNaturalLanguageQuery: vi.fn(),
  deleteAiSnapshot: vi.fn(),
  exportAiMarkdown: vi.fn(),
  listAiSnapshots: vi.fn(),
  saveAiSnapshot: vi.fn(),
}));

vi.mock("../backend", () => backend);

describe("NaturalLanguageQueryPanel", () => {
  beforeEach(() => {
    backend.askCurrentView.mockReset();
    backend.compileNaturalLanguageQuery.mockReset();
    backend.deleteAiSnapshot.mockReset();
    backend.exportAiMarkdown.mockReset();
    backend.listAiSnapshots.mockReset();
    backend.saveAiSnapshot.mockReset();
    backend.listAiSnapshots.mockResolvedValue([]);
  });

  it("sends only the prompt and query context, then applies the compiled request", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const request = createRequest("albums");
    request.filters.genres = ["AOR"];
    request.filters.yearFrom = 1984;
    request.filters.yearTo = 1984;
    request.filters.totalMinutesMax = 45;
    request.sort = { field: "albumScore", direction: "desc" };
    const compiled = {
      target: "search",
      queryIntent: "filter",
      summary: "AOR albums from 1984 under 45 minutes, ranked by Album Score.",
      request,
      chartConfig: null,
      model: "gpt-5.6-luna",
      usage: {
        inputTokens: 500,
        cachedInputTokens: 100,
        outputTokens: 90,
      },
    } satisfies AiCompiledQuery;
    backend.compileNaturalLanguageQuery.mockResolvedValueOnce(compiled);
    backend.saveAiSnapshot.mockResolvedValueOnce({
      id: 1,
      title: "Top AOR albums from 1984 under 45 minutes",
      content: {
        kind: "search",
        prompt: "Top AOR albums from 1984 under 45 minutes",
        result: compiled,
        answer: null,
      },
      libraryImportRunId: 8,
      libraryImportedAt: "2026-07-16T10:00:00Z",
      libraryAlbumCount: 73_128,
      libraryTrackCount: 1_111_666,
      createdAt: "2026-07-16T10:05:00Z",
    });

    render(
      <NaturalLanguageQueryPanel
        target="search"
        currentView="albums"
        onApply={onApply}
      />,
    );

    const prompt = "Top AOR albums from 1984 under 45 minutes";
    await user.type(
      screen.getByRole("textbox", { name: "Natural-language search request" }),
      prompt,
    );
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(backend.compileNaturalLanguageQuery).toHaveBeenCalledWith({
      prompt,
      target: "search",
      currentView: "albums",
    });
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ request, chartConfig: null }),
    );
    expect(
      screen.getByText(
        "AOR albums from 1984 under 45 minutes, ranked by Album Score.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/500 input, 100 cached/)).toBeInTheDocument();
    expect(backend.saveAiSnapshot).toHaveBeenCalledWith({
      title: prompt,
      content: {
        kind: "search",
        prompt,
        result: compiled,
        answer: null,
        exchanges: [{ prompt, result: compiled, answer: null }],
      },
    });
    expect(screen.getByText("Applied · saved")).toBeInTheDocument();
    expect(backend.askCurrentView).not.toHaveBeenCalled();
  });

  it("answers a multi-part local comparison immediately and saves it with the query", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const prompt =
      "How many Billboard nr. 1 albums have I rated with 100% completedness? and how many do I have left to rate?";
    const request = createRequest("albums");
    request.filters.billboardRankMin = 1;
    request.filters.billboardRankMax = 1;
    const compiled = {
      target: "search",
      queryIntent: "answer",
      summary: "Billboard No. 1 albums, split by rating completion.",
      request,
      chartConfig: null,
      model: "gpt-5.6-luna",
      usage: { inputTokens: 600, cachedInputTokens: 100, outputTokens: 100 },
    } satisfies AiCompiledQuery;
    const answer = {
      answer:
        "You have fully rated 6 of 15 Billboard No. 1 albums; 9 are left to finish.",
      view: "albums" as const,
      matchingRows: 15,
      analysisCount: 2,
      namedRowsShared: 0,
      model: "gpt-5.6-luna",
      usage: { inputTokens: 800, cachedInputTokens: 0, outputTokens: 80 },
    };
    backend.compileNaturalLanguageQuery.mockResolvedValueOnce(compiled);
    backend.askCurrentView.mockResolvedValueOnce(answer);
    backend.saveAiSnapshot.mockResolvedValueOnce({
      id: 9,
      title: prompt,
      content: { kind: "search", prompt, result: compiled, answer },
      libraryImportRunId: 8,
      libraryImportedAt: "2026-07-17T10:00:00Z",
      libraryAlbumCount: 73_167,
      libraryTrackCount: 1_112_503,
      createdAt: "2026-07-17T14:41:00Z",
    });

    render(
      <NaturalLanguageQueryPanel
        target="search"
        currentView="albums"
        onApply={onApply}
      />,
    );
    await user.type(
      screen.getByRole("textbox", { name: "Natural-language search request" }),
      prompt,
    );
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(onApply).toHaveBeenCalledWith(compiled);
    expect(request.filters.ratingCompletenessMin).toBeNull();
    expect(request.filters.ratingCompletenessMax).toBeNull();
    expect(backend.askCurrentView).toHaveBeenCalledWith({
      question: prompt,
      request,
    });
    expect(await screen.findByText(answer.answer)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Luna Search Answer" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Answered · saved")).toBeInTheDocument();
    expect(backend.saveAiSnapshot).toHaveBeenCalledWith({
      title: `${prompt.slice(0, 93)}...`,
      content: {
        kind: "search",
        prompt,
        result: compiled,
        answer,
        exchanges: [{ prompt, result: compiled, answer }],
      },
    });
    expect(
      screen.getByPlaceholderText("Ask a follow-up about this result…"),
    ).toHaveValue("");
  });

  it("inherits the bounded query scope for a follow-up and saves the conversation", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const firstPrompt =
      "How many Billboard nr. 1 albums have I rated with 100% completedness? and how many do I have left to rate?";
    const firstRequest = createRequest("albums");
    firstRequest.filters.billboardRankMin = 1;
    firstRequest.filters.billboardRankMax = 1;
    const firstResult = {
      target: "search",
      queryIntent: "answer",
      summary: "Compare fully rated and not-fully-rated Billboard No. 1 albums.",
      request: firstRequest,
      chartConfig: null,
      model: "gpt-5.6-luna",
      usage: { inputTokens: 600, cachedInputTokens: 100, outputTokens: 100 },
    } satisfies AiCompiledQuery;
    const firstAnswer = {
      answer:
        "You have 15 Billboard No. 1 albums fully rated and 21 left to rate.",
      view: "albums" as const,
      matchingRows: 36,
      analysisCount: 2,
      namedRowsShared: 0,
      model: "gpt-5.6-luna",
      usage: { inputTokens: 800, cachedInputTokens: 0, outputTokens: 80 },
    };
    const followUpPrompt = "Can you list the albums I haven't rated 100% yet?";
    const followUpRequest = createRequest("albums");
    followUpRequest.filters.billboardRankMin = 1;
    followUpRequest.filters.billboardRankMax = 1;
    followUpRequest.filters.notFullyRated = true;
    followUpRequest.sort = { field: "album", direction: "asc" };
    followUpRequest.limit = 50;
    const followUpResult = {
      target: "search",
      queryIntent: "answer",
      summary: "Billboard No. 1 albums that are not fully rated.",
      request: followUpRequest,
      chartConfig: null,
      model: "gpt-5.6-luna",
      usage: { inputTokens: 700, cachedInputTokens: 100, outputTokens: 110 },
    } satisfies AiCompiledQuery;
    const followUpAnswer = {
      answer: "The 21 albums include **Album One** and **Album Two**.",
      view: "albums" as const,
      matchingRows: 21,
      analysisCount: 1,
      namedRowsShared: 21,
      model: "gpt-5.6-luna",
      usage: { inputTokens: 900, cachedInputTokens: 0, outputTokens: 130 },
    };
    backend.compileNaturalLanguageQuery
      .mockResolvedValueOnce(firstResult)
      .mockResolvedValueOnce(followUpResult);
    backend.askCurrentView
      .mockResolvedValueOnce(firstAnswer)
      .mockResolvedValueOnce(followUpAnswer);
    backend.saveAiSnapshot
      .mockImplementationOnce(async ({ content }) => ({
        id: 1,
        title: firstPrompt,
        content,
        libraryImportRunId: 8,
        libraryImportedAt: "2026-07-17T10:00:00Z",
        libraryAlbumCount: 73_167,
        libraryTrackCount: 1_112_503,
        createdAt: "2026-07-17T14:41:00Z",
      }))
      .mockImplementationOnce(async ({ content }) => ({
        id: 2,
        title: followUpPrompt,
        content,
        libraryImportRunId: 8,
        libraryImportedAt: "2026-07-17T10:00:00Z",
        libraryAlbumCount: 73_167,
        libraryTrackCount: 1_112_503,
        createdAt: "2026-07-17T14:42:00Z",
      }));

    render(
      <NaturalLanguageQueryPanel
        target="search"
        currentView="albums"
        onApply={onApply}
      />,
    );
    const input = screen.getByRole("textbox", {
      name: "Natural-language search request",
    });
    await user.type(input, firstPrompt);
    await user.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByText(firstAnswer.answer);

    await user.type(input, followUpPrompt);
    await user.click(screen.getByRole("button", { name: "Ask follow-up" }));

    expect(backend.compileNaturalLanguageQuery).toHaveBeenNthCalledWith(2, {
      prompt: followUpPrompt,
      target: "search",
      currentView: "albums",
      followUp: {
        previousPrompt: firstPrompt,
        previousSummary: firstResult.summary,
        previousAnswer: firstAnswer.answer,
      },
    });
    expect(backend.askCurrentView).toHaveBeenNthCalledWith(2, {
      question: followUpPrompt,
      request: followUpRequest,
    });
    expect(onApply).toHaveBeenLastCalledWith(followUpResult);
    expect(await screen.findByText("Album One")).toBeInTheDocument();
    expect(screen.getByText(firstAnswer.answer)).toBeInTheDocument();
    expect(screen.getAllByText(firstPrompt).length).toBeGreaterThan(0);
    expect(screen.getAllByText(followUpPrompt).length).toBeGreaterThan(0);
    expect(backend.saveAiSnapshot).toHaveBeenLastCalledWith({
      title: followUpPrompt,
      content: {
        kind: "search",
        prompt: followUpPrompt,
        result: followUpResult,
        answer: followUpAnswer,
        exchanges: [
          { prompt: firstPrompt, result: firstResult, answer: firstAnswer },
          {
            prompt: followUpPrompt,
            result: followUpResult,
            answer: followUpAnswer,
          },
        ],
      },
    });
  });

  it("shows backend errors without applying a query", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    backend.compileNaturalLanguageQuery.mockRejectedValueOnce(
      new Error("No OpenAI API key is configured. Add one in Settings."),
    );

    render(
      <NaturalLanguageQueryPanel
        target="chart"
        currentView="albums"
        onApply={onApply}
      />,
    );
    await user.type(
      screen.getByRole("textbox", { name: "Natural-language chart request" }),
      "Best AOR albums",
    );
    await user.click(screen.getByRole("button", { name: "Build chart" }));

    expect(
      await screen.findByText("No OpenAI API key is configured. Add one in Settings."),
    ).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
    expect(backend.saveAiSnapshot).not.toHaveBeenCalled();
  });

  it("restores saved filters without calling Luna again", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const result = {
      target: "search",
      queryIntent: "filter",
      summary: "Saved 1984 AOR search.",
      request: createRequest("albums"),
      chartConfig: null,
      model: "gpt-5.6-luna",
      usage: { inputTokens: 300, cachedInputTokens: 0, outputTokens: 70 },
    } satisfies AiCompiledQuery;
    result.request.filters.genres = ["AOR"];
    result.request.filters.yearFrom = 1984;
    result.request.filters.yearTo = 1984;
    backend.listAiSnapshots.mockResolvedValueOnce([
      {
        id: 42,
        title: "1984 AOR",
        content: { kind: "search", prompt: "1984 AOR", result },
        libraryImportRunId: 8,
        libraryImportedAt: "2026-07-16T10:00:00Z",
        libraryAlbumCount: 73_128,
        libraryTrackCount: 1_111_666,
        createdAt: "2026-07-16T10:05:00Z",
      },
    ]);

    render(
      <NaturalLanguageQueryPanel
        target="search"
        currentView="albums"
        onApply={onApply}
      />,
    );
    const savedTitle = await screen.findByText("1984 AOR", {
      selector: ".ai-snapshot-list strong",
    });
    await user.click(savedTitle.closest("button")!);

    expect(onApply).toHaveBeenCalledWith(result);
    expect(backend.compileNaturalLanguageQuery).not.toHaveBeenCalled();
    expect(screen.getByText("Restored")).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Restored Luna Search" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Active local filters" })).toBeInTheDocument();
    expect(screen.getByText("AOR")).toBeInTheDocument();
    expect(screen.getAllByText("Saved 1984 AOR search.").length).toBe(2);
    expect(screen.getByText(/Library albums: 73,128/)).toBeInTheDocument();
  });

  it("restores a saved direct answer without another Luna call", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const request = createRequest("albums");
    request.filters.billboardRankMin = 1;
    request.filters.billboardRankMax = 1;
    const result = {
      target: "search",
      queryIntent: "answer",
      summary: "Billboard No. 1 albums, split by rating completion.",
      request,
      chartConfig: null,
      model: "gpt-5.6-luna",
      usage: { inputTokens: 600, cachedInputTokens: 100, outputTokens: 100 },
    } satisfies AiCompiledQuery;
    const answer = {
      answer:
        "You have fully rated 6 of 15 Billboard No. 1 albums; 9 are left to finish.",
      view: "albums" as const,
      matchingRows: 15,
      analysisCount: 2,
      namedRowsShared: 0,
      model: "gpt-5.6-luna",
      usage: { inputTokens: 800, cachedInputTokens: 0, outputTokens: 80 },
    };
    backend.listAiSnapshots.mockResolvedValueOnce([
      {
        id: 91,
        title: "Billboard rating progress",
        content: {
          kind: "search",
          prompt: "How many Billboard No. 1 albums are fully rated and how many are left?",
          result,
          answer,
        },
        libraryImportRunId: 10,
        libraryImportedAt: "2026-07-17T14:00:00Z",
        libraryAlbumCount: 73_167,
        libraryTrackCount: 1_112_503,
        createdAt: "2026-07-17T14:41:00Z",
      },
    ]);

    render(
      <NaturalLanguageQueryPanel
        target="search"
        currentView="albums"
        onApply={onApply}
      />,
    );
    await user.click(
      (await screen.findByText("Billboard rating progress", {
        selector: ".ai-snapshot-list strong",
      })).closest("button")!,
    );

    expect(onApply).toHaveBeenCalledWith(result);
    expect(backend.compileNaturalLanguageQuery).not.toHaveBeenCalled();
    expect(backend.askCurrentView).not.toHaveBeenCalled();
    expect(await screen.findByText(answer.answer)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Restored Luna Search Answer" }),
    ).toBeInTheDocument();
  });

  it("restores a saved follow-up conversation and leaves it ready for another turn", async () => {
    const user = userEvent.setup();
    const firstPrompt = "How many Billboard No. 1 albums are left to rate?";
    const firstRequest = createRequest("albums");
    firstRequest.filters.billboardRankMin = 1;
    firstRequest.filters.billboardRankMax = 1;
    const firstResult = {
      target: "search",
      queryIntent: "answer",
      summary: "Compare Billboard No. 1 albums by rating completion.",
      request: firstRequest,
      chartConfig: null,
      model: "gpt-5.6-luna",
      usage: { inputTokens: 600, cachedInputTokens: 0, outputTokens: 90 },
    } satisfies AiCompiledQuery;
    const firstAnswer = {
      answer: "There are 21 Billboard No. 1 albums left to rate.",
      view: "albums" as const,
      matchingRows: 36,
      analysisCount: 2,
      namedRowsShared: 0,
      model: "gpt-5.6-luna",
      usage: { inputTokens: 700, cachedInputTokens: 0, outputTokens: 60 },
    };
    const followUpPrompt = "Can you list them?";
    const followUpRequest = createRequest("albums");
    followUpRequest.filters.billboardRankMin = 1;
    followUpRequest.filters.billboardRankMax = 1;
    followUpRequest.filters.notFullyRated = true;
    const followUpResult = {
      ...firstResult,
      summary: "Billboard No. 1 albums that are not fully rated.",
      request: followUpRequest,
    } satisfies AiCompiledQuery;
    const followUpAnswer = {
      ...firstAnswer,
      answer: "The list begins with **Album One** and **Album Two**.",
      matchingRows: 21,
      analysisCount: 1,
      namedRowsShared: 21,
    };
    backend.listAiSnapshots.mockResolvedValueOnce([
      {
        id: 92,
        title: "Billboard follow-up conversation",
        content: {
          kind: "search",
          prompt: followUpPrompt,
          result: followUpResult,
          answer: followUpAnswer,
          exchanges: [
            { prompt: firstPrompt, result: firstResult, answer: firstAnswer },
            {
              prompt: followUpPrompt,
              result: followUpResult,
              answer: followUpAnswer,
            },
          ],
        },
        libraryImportRunId: 10,
        libraryImportedAt: "2026-07-17T14:00:00Z",
        libraryAlbumCount: 73_167,
        libraryTrackCount: 1_112_503,
        createdAt: "2026-07-17T15:00:00Z",
      },
    ]);

    render(
      <NaturalLanguageQueryPanel
        target="search"
        currentView="albums"
        onApply={vi.fn()}
      />,
    );
    await user.click(
      (await screen.findByText("Billboard follow-up conversation", {
        selector: ".ai-snapshot-list strong",
      })).closest("button")!,
    );

    expect(
      screen.getByRole("heading", {
        name: "Restored Luna Search Conversation",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(firstAnswer.answer)).toBeInTheDocument();
    expect(screen.getByText("Album One")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Ask a follow-up about this result…"),
    ).toHaveValue("");
    expect(backend.compileNaturalLanguageQuery).not.toHaveBeenCalled();
    expect(backend.askCurrentView).not.toHaveBeenCalled();
  });

  it("opens a saved chart as a readable in-app snapshot", async () => {
    const user = userEvent.setup();
    const request = createRequest("albums");
    request.filters.originCountryCodes = ["JP"];
    request.filters.ratingCompletenessMin = 100;
    request.filters.ratingCompletenessMax = 100;
    request.sort = { field: "albumScore", direction: "desc" };
    request.limit = 10;
    const chartConfig = createChartConfig();
    chartConfig.request = request;
    chartConfig.rankingMetric = "albumScore";
    chartConfig.resultLimit = 10;
    chartConfig.ratingCompletenessMin = 100;
    chartConfig.ratingCompletenessMax = 100;
    const result = {
      target: "chart",
      queryIntent: "filter",
      summary: "Top 10 Japanese albums by Album Score with 100% completeness.",
      request,
      chartConfig,
      model: "gpt-5.6-luna",
      usage: { inputTokens: 1454, cachedInputTokens: 0, outputTokens: 114 },
    } satisfies AiCompiledQuery;
    backend.listAiSnapshots.mockResolvedValueOnce([
      {
        id: 81,
        title: "Top 10 complete Japanese albums",
        content: {
          kind: "chart",
          prompt: "Top 10 albums from Japanese artists, only include albums with 100% completeness",
          result,
        },
        libraryImportRunId: 9,
        libraryImportedAt: "2026-07-16T17:00:00Z",
        libraryAlbumCount: 73_153,
        libraryTrackCount: 1_112_143,
        createdAt: "2026-07-16T17:47:00Z",
      },
    ]);

    render(
      <NaturalLanguageQueryPanel
        target="chart"
        currentView="albums"
        onApply={vi.fn()}
      />,
    );
    await user.click(
      (await screen.findByText("Top 10 complete Japanese albums", {
        selector: ".ai-snapshot-list strong",
      })).closest("button")!,
    );

    expect(
      await screen.findByRole("heading", { name: "Restored Luna Chart" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(
        "Top 10 Japanese albums by Album Score with 100% completeness.",
      ).length,
    ).toBe(2);
    expect(screen.getAllByText("Album Score").length).toBeGreaterThan(0);
    expect(screen.getByText(/100–100%/)).toBeInTheDocument();
    expect(screen.getByText(/JP/)).toBeInTheDocument();
  });
});
