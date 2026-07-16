import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { createRequest } from "../app/requests";
import type { AiCurrentViewAnswer } from "../types";
import { CurrentViewQuestionPanel } from "./CurrentViewQuestionPanel";

const askCurrentView = vi.hoisted(() => vi.fn());

vi.mock("../backend", () => ({ askCurrentView }));

describe("CurrentViewQuestionPanel", () => {
  it("sends the question with a snapshot of the active local request", async () => {
    const user = userEvent.setup();
    const request = createRequest("albums");
    request.filters.genres = ["AOR"];
    request.filters.yearFrom = 1984;
    request.filters.yearTo = 1984;
    askCurrentView.mockResolvedValueOnce({
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
    } satisfies AiCurrentViewAnswer);

    render(<CurrentViewQuestionPanel request={request} />);
    const question = "Which artists appear most often?";
    await user.type(
      screen.getByRole("textbox", { name: "Question about the current view" }),
      question,
    );
    await user.click(screen.getByRole("button", { name: "Ask" }));

    expect(askCurrentView).toHaveBeenCalledWith({ question, request });
    expect(screen.getByText(/led by Journey/)).toBeInTheDocument();
    expect(screen.getByText(/14 matching albums/)).toBeInTheDocument();
    expect(screen.getByText(/no names shared/)).toBeInTheDocument();
    expect(screen.getByText(/820 input, 200 cached/)).toBeInTheDocument();
  });

  it("reports failures without inventing an answer", async () => {
    const user = userEvent.setup();
    askCurrentView.mockRejectedValueOnce(new Error("OpenAI request failed (429)."));

    render(<CurrentViewQuestionPanel request={createRequest("tracks")} />);
    await user.type(
      screen.getByRole("textbox", { name: "Question about the current view" }),
      "How many are unrated?",
    );
    await user.click(screen.getByRole("button", { name: "Ask" }));

    expect(await screen.findByText("OpenAI request failed (429).")).toBeInTheDocument();
    expect(screen.queryByText("Luna", { selector: "strong" })).not.toBeInTheDocument();
  });
});
