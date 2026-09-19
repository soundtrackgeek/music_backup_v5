import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, it } from "vitest";
import { TransitionRegion } from "./TransitionRegion";

it("keeps detail state, focus and scroll when new content arrives", async () => {
  function Details({ title }: { title: string }) {
    const [expanded, setExpanded] = useState(false);
    return <section aria-label="Details">
      <h2>{title}</h2>
      <button onClick={() => setExpanded(!expanded)}>Toggle details</button>
      {expanded && <p>Expanded details</p>}
    </section>;
  }
  const { rerender } = render(<TransitionRegion><Details title="First" /></TransitionRegion>);
  const region = screen.getByRole("region");
  const button = screen.getByRole("button");
  fireEvent.click(button);
  button.focus();
  region.scrollTop = 140;
  rerender(<TransitionRegion><Details title="Second" /></TransitionRegion>);
  expect(await screen.findByRole("heading", { name: "Second" })).toBeVisible();
  expect(screen.getByText("Expanded details")).toBeVisible();
  expect(screen.getByRole("region")).toBe(region);
  expect(region.scrollTop).toBe(140);
  expect(button).toHaveFocus();
});
