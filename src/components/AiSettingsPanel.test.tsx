import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as backend from "../backend";
import { AiSettingsPanel } from "./AiSettingsPanel";

describe("Jev credentials in settings", () => {
  it("routes save, test and removal through OpenRouter, clears the entry, and preserves the OpenAI boundary", async () => {
    vi.spyOn(backend, "isTauriRuntime").mockReturnValue(true);
    const status = { configured: true, source: "windowsCredentialManager" as const, model: "typesafe/jev-1.13" };
    vi.spyOn(backend, "getJevKeyStatus").mockResolvedValue({ ...status, source: "environment" });
    const save = vi.spyOn(backend, "saveOpenRouterApiKey").mockResolvedValue(status);
    const remove = vi.spyOn(backend, "deleteOpenRouterApiKey").mockResolvedValue({ ...status, source: "environment" });
    const test = vi.spyOn(backend, "testJevConnection").mockResolvedValue({ model: status.model, message: "Jev responded.", usage: { inputTokens: 100, outputTokens: 0, cachedInputTokens: null } });
    const openAi = vi.spyOn(backend, "saveOpenAiApiKey");
    render(<AiSettingsPanel provider="OpenRouter" />);
    expect(await screen.findByText(/OPENROUTER_API_KEY fallback/)).toBeVisible();
    fireEvent.change(screen.getByLabelText("OpenRouter API key"), { target: { value: "non-secret-test-placeholder-key" } });
    fireEvent.click(screen.getByRole("button", { name: "Save securely" }));
    await waitFor(() => expect(screen.getByLabelText("OpenRouter API key")).toHaveValue(""));
    expect(save).toHaveBeenCalledWith("non-secret-test-placeholder-key"); expect(openAi).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    expect(await screen.findByText(/Jev responded/)).toBeVisible(); expect(test).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Remove stored key" }));
    expect(await screen.findByText(/Stored key removed; the development environment fallback/)).toBeVisible(); expect(remove).toHaveBeenCalledOnce();
  });
});
