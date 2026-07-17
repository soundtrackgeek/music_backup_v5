import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ExportResultStatus } from "./ExportResultStatus";

const backend = vi.hoisted(() => ({
  copyTextToClipboard: vi.fn(),
}));

vi.mock("../backend", () => backend);

const result = {
  path: "C:\\Users\\listener\\AppData\\Roaming\\com.local.musiclibrary\\exports\\complete-library-export.xlsx",
  format: "xlsx",
  rowCount: 73_153,
  pathCopied: true,
};

describe("ExportResultStatus", () => {
  beforeEach(() => {
    backend.copyTextToClipboard.mockReset();
    backend.copyTextToClipboard.mockResolvedValue(true);
  });

  it("shows a compact filename and confirms the automatic clipboard copy", async () => {
    const user = userEvent.setup();
    render(<ExportResultStatus result={result} itemLabel="row" />);

    expect(screen.getByText("73,153 rows exported")).toBeInTheDocument();
    expect(screen.getByText("complete-library-export.xlsx")).toBeInTheDocument();
    expect(screen.queryByText(result.path)).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Copy exported file path again" }),
    );
    expect(backend.copyTextToClipboard).toHaveBeenCalledWith(result.path);
  });

  it("offers a retry when the automatic clipboard copy was unavailable", async () => {
    const user = userEvent.setup();
    render(
      <ExportResultStatus
        result={{ ...result, pathCopied: false }}
        itemLabel="row"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Copy exported file path" }));
    expect(await screen.findByText("Path copied")).toBeInTheDocument();
  });
});
