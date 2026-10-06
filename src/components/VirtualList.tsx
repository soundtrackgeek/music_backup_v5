import { defaultRangeExtractor, useVirtualizer, type Range } from "@tanstack/react-virtual";
import {
  useCallback, useLayoutEffect, useRef, useState,
  type HTMLAttributes, type Key, type ReactNode, type RefObject,
} from "react";
import "./VirtualList.css";

export const virtualizationThreshold = 40;
const focusableSelector = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';

// Shared by the table and standalone lists. Measurements allow wrapped text,
// responsive layouts and resized columns without clipping or overlapping rows.
export function VirtualRows<T>({
  items, getKey, renderItem, scrollRef, estimateSize = 64, gap = 0,
  scrollMargin = 0, resetKey, scrollToKey, scrollRequestKey,
  itemRole = "presentation", unbounded = false,
}: {
  items: readonly T[];
  getKey: (item: T, index: number) => Key;
  renderItem: (item: T, index: number) => ReactNode;
  scrollRef: RefObject<HTMLDivElement | null>;
  estimateSize?: number;
  gap?: number;
  scrollMargin?: number;
  resetKey?: Key;
  scrollToKey?: Key | null;
  scrollRequestKey?: Key;
  itemRole?: "listitem" | "presentation";
  // Render every row in normal flow so the page, not this list, scrolls.
  unbounded?: boolean;
}) {
  const virtualized = !unbounded && items.length > virtualizationThreshold;
  // This child commits before its parent's viewport ref. Start observing on
  // the following layout pass, once that ref exists (including initial loads).
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => setReady(true), []);
  const enabled = virtualized && ready;
  const [focusedKey, setFocusedKey] = useState<Key | null>(null);
  const pendingFocus = useRef<{ key: Key; last: boolean } | null>(null);
  const getItemKey = useCallback((index: number) => getKey(items[index], index), [items, getKey]);
  const focusedIndex = focusedKey == null ? -1 : items.findIndex((item, index) => getKey(item, index) === focusedKey);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    getItemKey,
    estimateSize: () => estimateSize,
    overscan: 6,
    gap,
    scrollMargin,
    scrollPaddingStart: scrollMargin,
    // Wrapped rows can resize again when their measurements change the range.
    // Defer those updates until after the current ResizeObserver delivery.
    useAnimationFrameWithResizeObserver: true,
    enabled,
    initialRect: { width: 800, height: 600 },
    rangeExtractor: useCallback((range: Range) => {
      const indexes = defaultRangeExtractor(range);
      if (focusedIndex >= 0 && !indexes.includes(focusedIndex)) indexes.push(focusedIndex);
      return indexes.sort((a, b) => a - b);
    }, [focusedIndex]),
  });

  useLayoutEffect(() => {
    if (enabled) virtualizer.scrollToOffset(0);
    else if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [resetKey, ready]);

  useLayoutEffect(() => {
    if (scrollToKey == null) return;
    const index = items.findIndex((item, i) => getKey(item, i) === scrollToKey);
    if (index < 0) return;
    if (enabled) virtualizer.scrollToIndex(index, { align: "auto" });
    else scrollRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [scrollToKey, scrollRequestKey, enabled, resetKey]);

  const rows = virtualizer.getVirtualItems();
  useLayoutEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    const index = items.findIndex((item, i) => getKey(item, i) === pending.key);
    const row = scrollRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    const controls = row?.querySelectorAll<HTMLElement>(focusableSelector);
    if (controls?.length) {
      controls[pending.last ? controls.length - 1 : 0].focus({ preventScroll: true });
      pendingFocus.current = null;
    } else if (row) {
      // Group headings and informational rows have no tab stops. Continue to
      // the next interactive row, or leave the list at its logical boundary.
      const next = index + (pending.last ? -1 : 1);
      if (next >= 0 && next < items.length) {
        const key = getItemKey(next);
        pendingFocus.current = { key, last: pending.last };
        setFocusedKey(key);
        virtualizer.scrollToIndex(next, { align: "auto" });
      } else {
        pendingFocus.current = null;
        const viewport = scrollRef.current!;
        const outside = [...document.querySelectorAll<HTMLElement>(focusableSelector)].filter((control) =>
          !viewport.contains(control) && Boolean(viewport.compareDocumentPosition(control) & (pending.last ? Node.DOCUMENT_POSITION_PRECEDING : Node.DOCUMENT_POSITION_FOLLOWING)),
        );
        outside[pending.last ? outside.length - 1 : 0]?.focus();
      }
    }
  });

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element || !enabled) return;
    function focus(event: FocusEvent) {
      const row = (event.target as HTMLElement).closest<HTMLElement>("[data-virtual-item]");
      if (row && element!.contains(row)) setFocusedKey(getItemKey(Number(row.dataset.index)));
    }
    function blur() {
      // Keep a focused row mounted even when it leaves the viewport.
      queueMicrotask(() => {
        if (!element!.contains(document.activeElement)) setFocusedKey(null);
      });
    }
    function keydown(event: KeyboardEvent) {
      if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement;
      const row = target.closest<HTMLElement>("[data-virtual-item]");
      if (!row || !element!.contains(row)) return;
      const controls = [...row.querySelectorAll<HTMLElement>(focusableSelector)];
      const edge = controls[event.shiftKey ? 0 : controls.length - 1];
      if (target !== edge) return;
      const next = Number(row.dataset.index) + (event.shiftKey ? -1 : 1);
      if (next < 0 || next >= items.length) return;
      event.preventDefault();
      const key = getItemKey(next);
      pendingFocus.current = { key, last: event.shiftKey };
      setFocusedKey(key);
      virtualizer.scrollToIndex(next, { align: "auto" });
    }
    element.addEventListener("focusin", focus);
    element.addEventListener("focusout", blur);
    element.addEventListener("keydown", keydown);
    return () => {
      element.removeEventListener("focusin", focus);
      element.removeEventListener("focusout", blur);
      element.removeEventListener("keydown", keydown);
    };
  }, [enabled, items, getItemKey, virtualizer, scrollRef]);

  const semantics = (index: number) => itemRole === "listitem"
    ? { role: itemRole, "aria-setsize": items.length, "aria-posinset": index + 1 }
    : { role: itemRole };
  if (!virtualized) return <>{items.map((item, index) => <div key={getKey(item, index)}
    className="virtual-list-item" data-index={index} {...semantics(index)}>{renderItem(item, index)}</div>)}</>;
  let end = scrollMargin;
  const content: ReactNode[] = [];
  for (const row of rows) {
    const space = row.start - end;
    if (space > 0) content.push(<div key={`space-${row.key}`} className="virtual-list-spacer" aria-hidden="true" style={{ height: space }} />);
    content.push(
      <div key={row.key} className="virtual-list-item" data-virtual-item="" data-index={row.index}
        {...semantics(row.index)}
        ref={virtualizer.measureElement} style={{ marginBottom: row.index < items.length - 1 ? gap : 0 }}>
        {renderItem(items[row.index], row.index)}
      </div>,
    );
    end = row.end + (row.index < items.length - 1 ? gap : 0);
  }
  const remaining = virtualizer.getTotalSize() + scrollMargin - end;
  if (remaining > 0) content.push(<div key="space-end" className="virtual-list-spacer" aria-hidden="true" style={{ height: remaining }} />);
  return <>{content}</>;
}

export function VirtualList<T>({
  items, getKey, renderItem, estimateSize, resetKey, scrollToKey, scrollRequestKey, viewportRef, unbounded = false, className = "", children, ...props
}: Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  items: readonly T[];
  getKey: (item: T, index: number) => Key;
  renderItem: (item: T, index: number) => ReactNode;
  estimateSize?: number;
  resetKey?: Key;
  scrollToKey?: Key | null;
  scrollRequestKey?: Key;
  viewportRef?: RefObject<HTMLDivElement | null>;
  unbounded?: boolean;
  children?: ReactNode;
}) {
  const internalRef = useRef<HTMLDivElement>(null);
  const scrollRef = viewportRef ?? internalRef;
  return <div role="list" {...props} ref={scrollRef} className={`${className} virtual-list${!unbounded && items.length > virtualizationThreshold ? " is-virtualized" : ""}`} data-item-count={items.length}>
    <VirtualRows items={items} getKey={getKey} renderItem={renderItem} scrollRef={scrollRef}
      estimateSize={estimateSize} resetKey={resetKey} scrollToKey={scrollToKey} scrollRequestKey={scrollRequestKey} itemRole="listitem" unbounded={unbounded} />
    {children}
  </div>;
}
