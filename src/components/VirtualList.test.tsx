import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { VirtualList } from "./VirtualList";
import { mockVirtualLayout } from "../test/virtualLayout";

const items = Array.from({ length: 5_000 }, (_, id) => ({ id, title: `Candidate ${id}` }));
const key = (item: typeof items[number]) => item.id;
function Fixture({ rows = items, filter = "all", scrollToKey = null }: {
  rows?: typeof items; filter?: string; scrollToKey?: number | null;
}) {
  return <VirtualList aria-label="Candidates" items={rows} getKey={key} resetKey={filter}
    scrollToKey={scrollToKey} renderItem={(item) => <button>{item.title}</button>} />;
}

describe("VirtualList", () => {
  let restore: () => void;
  beforeEach(() => { restore = mockVirtualLayout(); });
  afterEach(() => restore());

  it("bounds mounted rows while reaching the end and retaining logical list positions", async () => {
    render(<Fixture />);
    expect(screen.getAllByRole("listitem").length).toBeLessThan(30);
    const viewport = screen.getByRole("list", { name: "Candidates" });
    fireEvent.scroll(viewport, { target: { scrollTop: 4_990 * 64 } });
    expect(await screen.findByRole("button", { name: "Candidate 4999" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Candidate 0" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem").length).toBeLessThan(30);
    expect(screen.getByRole("button", { name: "Candidate 4999" }).parentElement).toHaveAttribute("aria-posinset", "5000");
    expect(screen.getAllByRole("listitem")[0]).toHaveAttribute("aria-setsize", "5000");
  });

  it("resets a filtered viewport and can reveal a selected row that was never mounted", async () => {
    const view = render(<Fixture />);
    view.rerender(<Fixture scrollToKey={4000} />);
    expect(await screen.findByRole("button", { name: "Candidate 4000" })).toBeInTheDocument();
    view.rerender(<Fixture filter="filtered" rows={items.slice(0, 100)} />);
    expect(await screen.findByRole("button", { name: "Candidate 0" })).toBeInTheDocument();
    expect(screen.getByRole("list")).toHaveProperty("scrollTop", 0);
    view.rerender(<Fixture filter="one" rows={items.slice(0, 1)} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("keeps keyboard focus mounted and tabs across a virtual boundary in both directions", async () => {
    render(<Fixture />);
    const viewport = screen.getByRole("list");
    const first = screen.getByRole("button", { name: "Candidate 0" });
    act(() => first.focus());
    fireEvent.scroll(viewport, { target: { scrollTop: 1_000 * 64 } });
    expect(first).toHaveFocus();
    expect(first).toBeInTheDocument();
    fireEvent.keyDown(first, { key: "Tab" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Candidate 1" })).toHaveFocus());
    fireEvent.keyDown(screen.getByRole("button", { name: "Candidate 1" }), { key: "Tab", shiftKey: true });
    await waitFor(() => expect(screen.getByRole("button", { name: "Candidate 0" })).toHaveFocus());
    expect(screen.getAllByRole("listitem").length).toBeLessThan(30);
  });

  it("uses stable keys when a measured row is reordered or removed", () => {
    const view = render(<Fixture />);
    const first = screen.getByRole("button", { name: "Candidate 0" });
    const reordered = [items[1], items[0], ...items.slice(2)];
    view.rerender(<Fixture rows={reordered} />);
    expect(screen.getByRole("button", { name: "Candidate 0" })).toBe(first);
    expect(first.parentElement).toHaveAttribute("aria-posinset", "2");
    view.rerender(<Fixture rows={reordered.filter((item) => item.id !== 0)} />);
    expect(screen.queryByRole("button", { name: "Candidate 0" })).not.toBeInTheDocument();
  });

  it("skips noninteractive group headings during keyboard traversal", async () => {
    render(<VirtualList items={items} getKey={key} renderItem={(item) => item.id === 1
      ? <div>Group heading</div> : <button>{item.title}</button>} />);
    const first = screen.getByRole("button", { name: "Candidate 0" });
    act(() => first.focus());
    fireEvent.keyDown(first, { key: "Tab" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Candidate 2" })).toHaveFocus());
    fireEvent.keyDown(screen.getByRole("button", { name: "Candidate 2" }), { key: "Tab", shiftKey: true });
    await waitFor(() => expect(first).toHaveFocus());
  });
});
