import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  ArtistsTimelinePlaceholder,
  TimelinesWorkspace,
} from "./TimelinesWorkspace";

describe("TimelinesWorkspace", () => {
  it("renders the timeline tabs and reports view changes", async () => {
    const user = userEvent.setup();
    const onViewChange = vi.fn();

    render(
      <TimelinesWorkspace activeView="genres" onViewChange={onViewChange}>
        <p>Genre content</p>
      </TimelinesWorkspace>,
    );

    expect(screen.getByRole("heading", { name: "Timelines" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Genres" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("button", { name: "Artists, later" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Charts" }));
    expect(onViewChange).toHaveBeenCalledWith("charts");
  });

  it("labels the deferred Artists timeline honestly", () => {
    render(<ArtistsTimelinePlaceholder />);

    expect(screen.getByLabelText("Artists timeline")).toHaveTextContent(
      "Coming later",
    );
  });
});
