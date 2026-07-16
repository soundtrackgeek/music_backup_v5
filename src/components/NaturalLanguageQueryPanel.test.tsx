import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { createRequest } from "../app/requests";
import type { AiCompiledQuery } from "../types";
import { NaturalLanguageQueryPanel } from "./NaturalLanguageQueryPanel";

const compileNaturalLanguageQuery = vi.hoisted(() => vi.fn());

vi.mock("../backend", () => ({ compileNaturalLanguageQuery }));

describe("NaturalLanguageQueryPanel", () => {
  it("sends only the prompt and query context, then applies the compiled request", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const request = createRequest("albums");
    request.filters.genres = ["AOR"];
    request.filters.yearFrom = 1984;
    request.filters.yearTo = 1984;
    request.filters.totalMinutesMax = 45;
    request.sort = { field: "albumScore", direction: "desc" };
    compileNaturalLanguageQuery.mockResolvedValueOnce({
      target: "search",
      summary: "AOR albums from 1984 under 45 minutes, ranked by Album Score.",
      request,
      chartConfig: null,
      model: "gpt-5.6-luna",
      usage: {
        inputTokens: 500,
        cachedInputTokens: 100,
        outputTokens: 90,
      },
    } satisfies AiCompiledQuery);

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

    expect(compileNaturalLanguageQuery).toHaveBeenCalledWith({
      prompt,
      target: "search",
      currentView: "albums",
    });
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ request, chartConfig: null }),
    );
    expect(screen.getByText(/AOR albums from 1984/)).toBeInTheDocument();
    expect(screen.getByText(/500 input, 100 cached/)).toBeInTheDocument();
  });

  it("shows backend errors without applying a query", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    compileNaturalLanguageQuery.mockRejectedValueOnce(
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
  });
});
