import {
  createContext,
  useContext,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type PointerEvent,
  type ReactNode,
} from "react";
import "./ResizableTable.css";

type Widths = Record<string, number>;
type Columns = Record<string, string>;
const storagePrefix = "music-library.table-widths.v1.";
const maxWidth = 2400;

function minimumWidth(template: string) {
  return Number(template.match(/\d+(?:\.\d+)?/)?.[0] ?? 64);
}

function readWidths(tableId: string): Widths {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(storagePrefix + tableId) ?? "{}");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
    return Object.fromEntries(Object.entries(saved).filter(([, width]) =>
      typeof width === "number" && Number.isFinite(width) && width >= 32 && width <= maxWidth,
    ));
  } catch {
    return {};
  }
}

type ResizeContext = {
  columns: Columns;
  widths: Widths;
  activeColumn: string | null;
  start: (id: string, event: PointerEvent<HTMLSpanElement>) => void;
  move: (event: PointerEvent<HTMLSpanElement>) => void;
  finish: (event: PointerEvent<HTMLSpanElement>, cancel?: boolean) => void;
  cancel: () => void;
  step: (id: string, delta: number) => void;
  reset: (id: string) => void;
};
const ResizeContext = createContext<ResizeContext | null>(null);

export function ResizableTable(props: {
  tableId: string;
  columns: Columns;
  className: string;
  children: ReactNode;
}) {
  // A new layout gets its own saved widths even when React reuses this position.
  return <TableLayout key={props.tableId} {...props} />;
}

function TableLayout({ tableId, columns, className, children }: Parameters<typeof ResizableTable>[0]) {
  const tableRef = useRef<HTMLDivElement>(null);
  const [widths, setWidths] = useState<Widths>(() => readWidths(tableId));
  const [activeColumn, setActiveColumn] = useState<string | null>(null);
  const drag = useRef<{
    id: string;
    pointerId: number;
    startX: number;
    before: Widths;
    measured: Widths;
    latest: Widths;
  } | null>(null);

  function clamp(id: string, width: number) {
    return Math.round(Math.max(minimumWidth(columns[id]), Math.min(maxWidth, width)));
  }

  function save(next: Widths) {
    setWidths(next);
    try {
      localStorage.setItem(storagePrefix + tableId, JSON.stringify(next));
    } catch {
      // Resizing still works for this visit if browser storage is unavailable.
    }
  }

  function measure(): Widths {
    const measured = { ...widths };
    tableRef.current?.querySelectorAll<HTMLElement>(".result-table-head > [data-column-id]").forEach((header) => {
      const id = header.dataset.columnId!;
      if (id in columns) measured[id] = clamp(id, header.getBoundingClientRect().width);
    });
    return measured;
  }

  function cancel() {
    if (!drag.current) return;
    setWidths(drag.current.before);
    drag.current = null;
    setActiveColumn(null);
  }

  const context: ResizeContext = {
    columns,
    widths,
    activeColumn,
    start(id, event) {
      if (event.button !== 0 || drag.current) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      const measured = measure();
      drag.current = { id, pointerId: event.pointerId, startX: event.clientX, before: widths, measured, latest: widths };
      setActiveColumn(id);
    },
    move(event) {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      const delta = event.clientX - current.startX;
      if (Math.abs(delta) < 1 && current.latest === current.before) return;
      const next = { ...current.measured, [current.id]: clamp(current.id, current.measured[current.id] + delta) };
      current.latest = next;
      setWidths(next);
    },
    finish(event, cancelled = false) {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) return;
      if (cancelled) cancel();
      else {
        if (current.latest !== current.before) save(current.latest);
        drag.current = null;
        setActiveColumn(null);
      }
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    },
    cancel,
    step(id, delta) {
      const measured = measure();
      save({ ...measured, [id]: clamp(id, measured[id] + delta) });
    },
    reset(id) {
      const next = { ...widths };
      delete next[id];
      save(next);
    },
  };
  const templates = Object.entries(columns).map(([id, template]) =>
    widths[id] == null ? template : `${clamp(id, widths[id])}px`,
  );
  const minWidth = Object.entries(columns).reduce((total, [id, template]) =>
    total + (widths[id] == null ? minimumWidth(template) : clamp(id, widths[id])), 24,
  );

  return (
    <ResizeContext.Provider value={context}>
      <div
        ref={tableRef}
        className={`${className} resizable-table${activeColumn ? " is-resizing" : ""}`}
        role="table"
        style={{
          "--result-table-columns": templates.join(" "),
          "--result-table-min-width": `${minWidth}px`,
        } as CSSProperties}
      >
        {children}
      </div>
    </ResizeContext.Provider>
  );
}

export function ResizableColumnHeader({
  columnId,
  label,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { columnId: string; label: string }) {
  const resize = useContext(ResizeContext);
  const template = resize?.columns[columnId];
  return (
    <span {...props} role="columnheader" data-column-id={columnId}>
      {children ?? label}
      {resize && template ? (
        <span
          className={`column-resize-handle${resize.activeColumn === columnId ? " active" : ""}`}
          role="separator"
          tabIndex={0}
          aria-label={`Resize ${label} column`}
          aria-orientation="vertical"
          aria-valuemin={minimumWidth(template)}
          aria-valuemax={maxWidth}
          aria-valuenow={resize.widths[columnId]}
          title="Drag to resize. Double-click to reset. Arrow keys resize; Home resets; Escape cancels."
          onPointerDown={(event) => resize.start(columnId, event)}
          onPointerMove={resize.move}
          onPointerUp={(event) => resize.finish(event)}
          onPointerCancel={(event) => resize.finish(event, true)}
          onLostPointerCapture={resize.cancel}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => { event.stopPropagation(); resize.reset(columnId); }}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "Escape"].includes(event.key)) return;
            event.preventDefault();
            event.stopPropagation();
            if (event.key === "Escape") resize.cancel();
            else if (event.key === "Home") resize.reset(columnId);
            else resize.step(columnId, (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 40 : 10));
          }}
        />
      ) : null}
    </span>
  );
}
