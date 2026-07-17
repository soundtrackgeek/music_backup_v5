import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AiMarkdownExportButton } from "./AiMarkdownExportButton";

const backend = vi.hoisted(() => ({
  exportAiMarkdown: vi.fn(),
}));

vi.mock("../backend", () => backend);

describe("AiMarkdownExportButton", () => {
  beforeEach(() => {
    backend.exportAiMarkdown.mockReset();
    backend.exportAiMarkdown.mockResolvedValue({
      path: "C:\\Music Library\\exports\\luna-answer.md",
      rowCount: 8,
    });
  });

  it("exports the complete Markdown and reports the destination", async () => {
    const user = userEvent.setup();
    const markdown = "# Luna answer\n\nA **saved** result.\n";
    render(
      <AiMarkdownExportButton
        title="Luna answer — Industrial Metal"
        markdown={markdown}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Export Markdown" }));

    expect(backend.exportAiMarkdown).toHaveBeenCalledWith({
      title: "Luna answer — Industrial Metal",
      markdown,
    });
    expect(screen.getByRole("button", { name: "Exported MD" })).toBeInTheDocument();
    expect(screen.getByText(/Saved to .*luna-answer\.md/)).toBeInTheDocument();
  });
});
