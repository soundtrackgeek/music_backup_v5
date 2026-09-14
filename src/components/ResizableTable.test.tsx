import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResizableColumnHeader, ResizableTable } from "./ResizableTable";

const storageKey = "music-library.table-widths.v1.albums";
const columns = { album: "minmax(220px, 2fr)", artist: "minmax(140px, 1fr)", year: "64px" };
function Fixture({ tableId = "albums", fields = columns, onSort = () => {} }) {
  return (
    <ResizableTable tableId={tableId} columns={fields} className="result-table">
      <div className="result-table-head" role="row">
        {Object.keys(fields).map((id) => (
          <ResizableColumnHeader key={id} columnId={id} label={id} aria-sort="none">
            <button onClick={onSort}>Sort {id}</button>
          </ResizableColumnHeader>
        ))}
      </div>
      <div className="result-table-row" role="row">
        {Object.keys(fields).map((id) => <span role="cell" key={id}>{id}</span>)}
      </div>
    </ResizableTable>
  );
}
function handle(id = "album") {
  return screen.getByRole("separator", { name: `Resize ${id} column` });
}
function dragBy(delta: number, end: "pointerUp" | "pointerCancel" = "pointerUp") {
  fireEvent.pointerDown(handle(), { button: 0, clientX: 300, pointerId: 1 });
  fireEvent.pointerMove(handle(), { clientX: 300 + delta, pointerId: 1 });
  fireEvent[end](handle(), { pointerId: 1 });
}

describe("ResizableTable", () => {
  beforeEach(() => {
    localStorage.clear();
    class TestPointerEvent extends MouseEvent {
      pointerId: number;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
      }
    }
    vi.stubGlobal("PointerEvent", TestPointerEvent);
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);
    HTMLElement.prototype.releasePointerCapture = vi.fn();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const width = { album: 300, artist: 180, year: 64 }[this.dataset.columnId ?? ""] ?? 0;
      return { x: 0, y: 0, top: 0, left: 0, right: width, bottom: 36, width, height: 36, toJSON() {} };
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
    delete (HTMLElement.prototype as Partial<HTMLElement>).hasPointerCapture;
    delete (HTMLElement.prototype as Partial<HTMLElement>).releasePointerCapture;
  });

  it("grows the chosen column, preserves neighbor widths, saves on release, and retains sorting", () => {
    const onSort = vi.fn();
    render(<Fixture onSort={onSort} />);
    fireEvent.pointerDown(handle(), { button: 0, clientX: 300, pointerId: 1 });
    fireEvent.pointerMove(handle(), { clientX: 480, pointerId: 1 });
    expect(screen.getByRole("table").style.getPropertyValue("--result-table-columns")).toBe("480px 180px 64px");
    expect(localStorage.getItem(storageKey)).toBeNull();
    fireEvent.pointerUp(handle(), { pointerId: 1 });
    fireEvent.click(handle());
    expect(onSort).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual({ album: 480, artist: 180, year: 64 });
    expect(screen.getByRole("table")).not.toHaveClass("is-resizing");
    fireEvent.click(screen.getByRole("button", { name: "Sort album" }));
    expect(onSort).toHaveBeenCalledOnce();
  });

  it("clamps shrinking and growing, supports keys and resets only the chosen column", () => {
    render(<Fixture />);
    dragBy(-900);
    expect(handle()).toHaveAttribute("aria-valuenow", "220");
    dragBy(9000);
    expect(handle()).toHaveAttribute("aria-valuenow", "2400");
    fireEvent.keyDown(handle("artist"), { key: "ArrowRight", shiftKey: true });
    expect(handle("artist")).toHaveAttribute("aria-valuenow", "220");
    fireEvent.doubleClick(handle());
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual({ artist: 220, year: 64 });
    fireEvent.keyDown(handle("artist"), { key: "Home" });
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual({ year: 64 });
  });

  it.each(["pointerCancel", "lostPointerCapture", "Escape"])("restores the prior layout when a drag ends with %s", (ending) => {
    localStorage.setItem(storageKey, JSON.stringify({ album: 410 }));
    render(<Fixture />);
    fireEvent.pointerDown(handle(), { button: 0, clientX: 300, pointerId: 1 });
    fireEvent.pointerMove(handle(), { clientX: 500, pointerId: 1 });
    if (ending === "Escape") fireEvent.keyDown(handle(), { key: "Escape" });
    else fireEvent[ending as "pointerCancel" | "lostPointerCapture"](handle(), { pointerId: 1 });
    fireEvent.pointerUp(handle(), { pointerId: 1 });
    expect(handle()).toHaveAttribute("aria-valuenow", "410");
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual({ album: 410 });
    expect(screen.getByRole("table")).not.toHaveClass("is-resizing");
  });

  it("restores widths by identity across hidden/reordered columns, remounts, and separate table modes", () => {
    const view = render(<Fixture />);
    dragBy(125);
    view.rerender(<Fixture fields={{ year: columns.year, album: columns.album } as typeof columns} />);
    expect(screen.getByRole("table").style.getPropertyValue("--result-table-columns")).toBe("64px 425px");
    view.rerender(<Fixture tableId="tracks" />);
    expect(handle()).not.toHaveAttribute("aria-valuenow");
    view.rerender(<Fixture />);
    expect(handle()).toHaveAttribute("aria-valuenow", "425");
    expect(handle("artist")).toHaveAttribute("aria-valuenow", "180");
    view.unmount();
    render(<Fixture />);
    expect(handle()).toHaveAttribute("aria-valuenow", "425");
  });

  it("ignores secondary buttons, other pointers, and clicks without movement", () => {
    render(<Fixture />);
    fireEvent.pointerDown(handle(), { button: 2, clientX: 300, pointerId: 1 });
    expect(screen.getByRole("table")).not.toHaveClass("is-resizing");
    fireEvent.pointerDown(handle(), { button: 0, clientX: 300, pointerId: 1 });
    fireEvent.pointerMove(handle(), { clientX: 800, pointerId: 2 });
    fireEvent.pointerUp(handle(), { pointerId: 2 });
    expect(screen.getByRole("table")).toHaveClass("is-resizing");
    fireEvent.pointerUp(handle(), { pointerId: 1 });
    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it("rejects invalid saved widths and still resizes when storage is unavailable", () => {
    localStorage.setItem(storageKey, JSON.stringify({ album: -1, artist: "400", year: 90000 }));
    const view = render(<Fixture />);
    expect(handle()).not.toHaveAttribute("aria-valuenow");
    view.unmount();
    localStorage.setItem(storageKey, "not json");
    render(<Fixture />);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage unavailable"); });
    dragBy(80);
    expect(handle()).toHaveAttribute("aria-valuenow", "380");
  });
});
