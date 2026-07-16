import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { AiLibraryAnalysis } from "../types";
import { LibraryAnalystPanel } from "./LibraryAnalystPanel";

const analyzeLibrary = vi.hoisted(() => vi.fn());

vi.mock("../backend", () => ({ analyzeLibrary }));

describe("LibraryAnalystPanel", () => {
  it("sends the selected lens and renders a typed aggregate-only report", async () => {
    const user = userEvent.setup();
    analyzeLibrary.mockResolvedValueOnce({
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
    } satisfies AiLibraryAnalysis);

    render(<LibraryAnalystPanel isAvailable />);
    await user.click(screen.getByRole("button", { name: /Rating backlog/ }));
    await user.type(
      screen.getByRole("textbox", { name: "Focus question" }),
      "Where should I start?",
    );
    await user.click(screen.getByRole("button", { name: "Analyze library" }));

    expect(analyzeLibrary).toHaveBeenCalledWith({
      lens: "ratingBacklog",
      focus: "Where should I start?",
    });
    expect(
      await screen.findByText("The 1980s hold the clearest rating opportunity"),
    ).toBeInTheDocument();
    expect(screen.getByText(/17 aggregate points/)).toBeInTheDocument();
    expect(screen.getByText(/no album, track, or artist names/)).toBeInTheDocument();
    expect(screen.getByText(/940 input, 210 cached/)).toBeInTheDocument();
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
});
