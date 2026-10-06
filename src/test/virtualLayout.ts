import { fireEvent } from "@testing-library/react";
import { vi } from "vitest";

// jsdom has no layout. Model a real scroll viewport and measured row heights;
// keep the actual TanStack observers, range calculation and scroll events.
export function mockVirtualLayout(rowHeight = 64, viewportHeight = 600) {
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains("result-table-head")) return 36;
    return this.classList.contains("virtual-list-item") ? rowHeight : viewportHeight;
  });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(1000);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const height = this.offsetHeight;
    return { x: 0, y: 0, top: 0, left: 0, right: 1000, bottom: height, width: 1000, height, toJSON() {} };
  });
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(400_000);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(viewportHeight);
  Object.defineProperty(HTMLElement.prototype, "scrollTo", { configurable: true, value: vi.fn(function (this: HTMLElement, options: ScrollToOptions) {
    this.scrollTop = options.top ?? this.scrollTop;
    this.scrollLeft = options.left ?? this.scrollLeft;
    queueMicrotask(() => fireEvent.scroll(this));
  }) });
  return () => { delete (HTMLElement.prototype as Partial<HTMLElement>).scrollTo; };
}
