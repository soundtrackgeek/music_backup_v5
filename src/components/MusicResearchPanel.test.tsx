import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AiMusicResearchAnswer,
  AiMusicResearchContext,
  AiSnapshot,
  SaveAiSnapshotRequest,
} from "../types";
import { MusicResearchPanel } from "./MusicResearchPanel";

const backend = vi.hoisted(() => ({
  copyTextToClipboard: vi.fn(),
  deleteAiSnapshot: vi.fn(),
  exportAiMarkdown: vi.fn(),
  listAiSnapshots: vi.fn(),
  openResearchSourceUrl: vi.fn(),
  researchMusic: vi.fn(),
  saveAiSnapshot: vi.fn(),
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

function savedSnapshot(
  input: SaveAiSnapshotRequest,
  id = 41,
): AiSnapshot {
  return {
    id,
    title: input.title,
    content: input.content,
    libraryImportRunId: 8,
    libraryImportedAt: "2026-07-17T10:00:00Z",
    libraryAlbumCount: 73_128,
    libraryTrackCount: 1_111_666,
    createdAt: "2026-07-17T12:00:00Z",
  };
}

describe("MusicResearchPanel", () => {
  beforeEach(() => {
    backend.deleteAiSnapshot.mockReset();
    backend.deleteAiSnapshot.mockResolvedValue(undefined);
    backend.exportAiMarkdown.mockReset();
    backend.exportAiMarkdown.mockResolvedValue({
      path: "C:\\Music Library\\exports\\luna-research.md",
      format: "md",
      rowCount: 12,
      pathCopied: true,
    });
    backend.listAiSnapshots.mockReset();
    backend.listAiSnapshots.mockResolvedValue([]);
    backend.openResearchSourceUrl.mockReset();
    backend.researchMusic.mockReset();
    backend.researchMusic.mockResolvedValue(answer);
    backend.saveAiSnapshot.mockReset();
    backend.saveAiSnapshot.mockImplementation(
      async (input: SaveAiSnapshotRequest) => savedSnapshot(input),
    );
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
    expect(backend.saveAiSnapshot).toHaveBeenNthCalledWith(1, {
      title: "Why did the band revisit this sound?",
      content: {
        kind: "musicResearch",
        prompt: "Why did the band revisit this sound?",
        context: albumContext,
        exchanges: [
          {
            question: "Why did the band revisit this sound?",
            result: answer,
          },
        ],
      },
    });

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
    expect(backend.saveAiSnapshot).toHaveBeenNthCalledWith(2, {
      title: "What should I compare it with?",
      content: {
        kind: "musicResearch",
        prompt: "What should I compare it with?",
        context: albumContext,
        exchanges: [
          {
            question: "Why did the band revisit this sound?",
            result: answer,
          },
          {
            question: "What should I compare it with?",
            result: answer,
          },
        ],
      },
    });
  });

  it("renders safe Markdown and opens only the rendered HTTPS link through the backend", async () => {
    const user = userEvent.setup();
    const markdownAnswer = {
      ...answer,
      answer: [
        "## The turning point",
        "**Euphoria** returned to a melodic approach with [official context](https://www.defleppard.com/album/euphoria/).",
        "- Layered guitars",
        "- Close vocal harmonies",
        "<script>window.bad = true</script>",
      ].join("\n\n"),
    } satisfies AiMusicResearchAnswer;
    backend.researchMusic.mockResolvedValueOnce(markdownAnswer);
    const { container } = render(
      <MusicResearchPanel isOpen context={albumContext} onClose={vi.fn()} />,
    );

    await user.type(screen.getByRole("textbox"), "What defined the sound?");
    await user.click(screen.getByRole("button", { name: "Ask" }));

    expect(
      await screen.findByRole("heading", { name: "The turning point" }),
    ).toBeInTheDocument();
    expect(
      container.querySelector(".music-research-markdown strong"),
    ).toHaveTextContent("Euphoria");
    expect(
      Array.from(container.querySelectorAll(".music-research-markdown li")).some(
        (item) => item.textContent?.includes("Layered guitars"),
      ),
    ).toBe(true);
    expect(container.querySelector("script")).toBeNull();

    await user.click(screen.getByRole("link", { name: "official context" }));
    expect(backend.openResearchSourceUrl).toHaveBeenCalledWith(
      "https://www.defleppard.com/album/euphoria/",
    );
  });

  it("reopens and deletes an exact saved research conversation without calling Luna", async () => {
    const user = userEvent.setup();
    const stored = savedSnapshot({
      title: "Why Euphoria mattered",
      content: {
        kind: "musicResearch",
        prompt: "Why did it matter?",
        context: albumContext,
        exchanges: [
          {
            question: "Why did it matter?",
            result: {
              ...answer,
              answer: "### Saved finding\n\nThe exact **saved answer**.",
            },
          },
        ],
      },
    });
    backend.listAiSnapshots.mockResolvedValueOnce([stored]);
    render(
      <MusicResearchPanel isOpen context={albumContext} onClose={vi.fn()} />,
    );

    await user.click(await screen.findByRole("button", { name: "Show saved research" }));
    await user.click(
      screen
        .getByText("Why Euphoria mattered", { selector: "strong" })
        .closest("button")!,
    );

    expect(await screen.findByRole("heading", { name: "Saved finding" })).toBeInTheDocument();
    expect(screen.getByText("saved answer", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText(/Saved snapshot/)).toBeInTheDocument();
    expect(backend.researchMusic).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Export Markdown" }));
    expect(backend.exportAiMarkdown).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Luna music research — Euphoria",
        markdown: expect.stringContaining("The exact **saved answer**."),
      }),
    );
    expect(screen.getByText("luna-research.md")).toBeInTheDocument();
    expect(screen.getByText("Path copied")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show saved research" }));
    await user.click(
      screen.getByRole("button", { name: "Delete snapshot Why Euphoria mattered" }),
    );
    expect(backend.deleteAiSnapshot).toHaveBeenCalledWith(stored.id);
    expect(screen.queryByText("Why Euphoria mattered")).not.toBeInTheDocument();
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
    expect(backend.saveAiSnapshot).not.toHaveBeenCalled();
  });
});
