import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AiMusicResearchAnswer,
  AiMusicResearchContext,
} from "../types";
import { MusicResearchPanel } from "./MusicResearchPanel";

const backend = vi.hoisted(() => ({
  openResearchSourceUrl: vi.fn(),
  researchMusic: vi.fn(),
}));

vi.mock("../backend", () => backend);

const albumContext = {
  workspace: "Albums",
  selectedEntityType: "album",
  selectedEntityId: "album:euphoria",
  selectedLabel: "Euphoria",
  selectedSubtitle: "Def Leppard · 1999",
} satisfies AiMusicResearchContext;

const answer = {
  answer:
    "Euphoria was a deliberate return to Def Leppard's melodic hard-rock vocabulary.",
  sources: [
    {
      title: "Def Leppard official discography",
      url: "https://www.defleppard.com/album/euphoria/",
    },
  ],
  model: "gpt-5.6-luna",
  usage: { inputTokens: 620, cachedInputTokens: 100, outputTokens: 180 },
  usedWebSearch: true,
  localInspectionCount: 13,
} satisfies AiMusicResearchAnswer;

describe("MusicResearchPanel", () => {
  beforeEach(() => {
    backend.openResearchSourceUrl.mockReset();
    backend.researchMusic.mockReset();
    backend.researchMusic.mockResolvedValue(answer);
  });

  it("sends the selected page entity and carries a bounded conversation", async () => {
    const user = userEvent.setup();
    render(
      <MusicResearchPanel
        isOpen
        context={albumContext}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Euphoria")).toBeInTheDocument();
    expect(screen.getByText("album · Def Leppard · 1999")).toBeInTheDocument();

    const textbox = screen.getByRole("textbox");
    await user.type(textbox, "Why did the band revisit this sound?");
    await user.click(screen.getByRole("button", { name: "Ask" }));

    expect(backend.researchMusic).toHaveBeenNthCalledWith(1, {
      question: "Why did the band revisit this sound?",
      context: albumContext,
      conversation: [],
    });
    expect(await screen.findByText(answer.answer)).toBeInTheDocument();
    expect(screen.getByText("Web researched")).toBeInTheDocument();
    expect(screen.getByText("13 local items")).toBeInTheDocument();
    expect(screen.getByText(/620 in · 100 cached · 180 out/)).toBeInTheDocument();

    await user.type(screen.getByRole("textbox"), "What should I compare it with?");
    await user.click(screen.getByRole("button", { name: "Ask" }));

    expect(backend.researchMusic).toHaveBeenNthCalledWith(2, {
      question: "What should I compare it with?",
      context: albumContext,
      conversation: [
        { role: "user", content: "Why did the band revisit this sound?" },
        { role: "assistant", content: answer.answer },
      ],
    });
  });

  it("uses general research on Search and resets when page context changes", async () => {
    const generalContext = {
      workspace: "Search",
      selectedEntityType: null,
      selectedEntityId: null,
      selectedLabel: null,
      selectedSubtitle: null,
    } satisfies AiMusicResearchContext;
    const { rerender } = render(
      <MusicResearchPanel
        isOpen
        context={albumContext}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Euphoria")).toBeInTheDocument();

    rerender(
      <MusicResearchPanel
        isOpen
        context={generalContext}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Search · General music research")).toBeInTheDocument();
    expect(screen.getByText("No page filters or result rows attached")).toBeInTheDocument();
    expect(screen.getByText("Trace a genre or scene across one decade")).toBeInTheDocument();
    expect(screen.queryByText("Euphoria")).not.toBeInTheDocument();
  });

  it("discards an answer that returns after the selected context changes", async () => {
    const user = userEvent.setup();
    let resolveResearch: ((value: AiMusicResearchAnswer) => void) | undefined;
    backend.researchMusic.mockReturnValueOnce(
      new Promise<AiMusicResearchAnswer>((resolve) => {
        resolveResearch = resolve;
      }),
    );
    const generalContext = {
      workspace: "Search",
      selectedEntityType: null,
      selectedEntityId: null,
      selectedLabel: null,
      selectedSubtitle: null,
    } satisfies AiMusicResearchContext;
    const { rerender } = render(
      <MusicResearchPanel
        isOpen
        context={albumContext}
        onClose={vi.fn()}
      />,
    );

    await user.type(screen.getByRole("textbox"), "Why did it sound this way?");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    rerender(
      <MusicResearchPanel
        isOpen
        context={generalContext}
        onClose={vi.fn()}
      />,
    );

    await act(async () => resolveResearch?.(answer));

    expect(screen.getByText("Search · General music research")).toBeInTheDocument();
    expect(screen.queryByText(answer.answer)).not.toBeInTheDocument();
    expect(screen.queryByText("Why did it sound this way?")).not.toBeInTheDocument();
  });
});
