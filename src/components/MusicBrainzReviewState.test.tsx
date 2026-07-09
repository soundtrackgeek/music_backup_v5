import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MusicBrainzReviewState } from "./MusicBrainzReviewState";

describe("MusicBrainz review-state rendering", () => {
  it.each([
    ["imported", "Imported"],
    ["needs_attention", "Needs Attention"],
    ["manual", "Manual"],
    ["unresolved", "Unresolved"],
  ])("renders %s as a readable status", (state, label) => {
    render(<MusicBrainzReviewState state={state} />);

    const status = screen.getByText(label);
    expect(status).toHaveAttribute("data-review-state", state);
    expect(status).toHaveClass(`run-status-${state.replace("_", "-")}`);
  });

  it("renders the unavailable state with the requested fallback", () => {
    render(<MusicBrainzReviewState state={null} fallback="Not imported" />);

    expect(screen.getByText("Not imported")).toHaveClass(
      "run-status-unavailable",
    );
  });
});
