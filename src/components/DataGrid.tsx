import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { scrollToReveal, sortRows, visibleRange, type SortDir, type SortValue } from "../lib/util";

export interface Column<T> {
  id: string;
  header: string;
  /** CSS grid track, e.g. "96px" or "minmax(220px, 2fr)" */
  width: string;
  align?: "start" | "end";
  sort?: (row: T) => SortValue;
  cell: (row: T) => ReactNode;
}

interface Props<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  label: string;
  onOpen?: (row: T) => void;
  rowTone?: (row: T) => "danger" | "warn" | undefined;
  initialSort?: { id: string; dir: SortDir };
  rowHeight?: number;
  height?: number;
  minWidth?: number;
  empty?: ReactNode;
}

/**
 * A grid that stays smooth with tens of thousands of rows: only the rows in
 * view (plus a small overscan) are in the DOM. Keyboard support follows the
 * ARIA grid pattern — focus stays on the grid, the active row is announced
 * through aria-activedescendant.
 */
export function DataGrid<T>({
  rows, columns, rowKey, label, onOpen, rowTone, initialSort,
  rowHeight = 44, height = 560, minWidth = 760, empty
}: Props<T>) {
  const id = useId();
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(height);
  const [sort, setSort] = useState(initialSort ?? null);
  const [active, setActive] = useState(0);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.id === sort.id);
    return col?.sort ? sortRows(rows, col.sort, sort.dir) : rows;
  }, [rows, columns, sort]);

  // keep the active row inside the list when filters shrink it
  useEffect(() => { setActive((a) => Math.min(a, Math.max(0, sorted.length - 1))); }, [sorted.length]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => entry && setViewport(entry.contentRect.height || height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [height]);

  const { start, end } = visibleRange(scrollTop, viewport, rowHeight, sorted.length);
  const template = columns.map((c) => c.width).join(" ");

  const moveTo = (index: number) => {
    const next = Math.max(0, Math.min(sorted.length - 1, index));
    setActive(next);
    const el = scroller.current;
    if (!el) return;
    const top = scrollToReveal(next, el.scrollTop, viewport, rowHeight);
    if (top !== el.scrollTop) { el.scrollTop = top; setScrollTop(top); }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const page = Math.max(1, Math.floor(viewport / rowHeight) - 1);
    const keys: Record<string, () => void> = {
      ArrowDown: () => moveTo(active + 1),
      ArrowUp: () => moveTo(active - 1),
      PageDown: () => moveTo(active + page),
      PageUp: () => moveTo(active - page),
      Home: () => moveTo(0),
      End: () => moveTo(sorted.length - 1),
      Enter: () => { const r = sorted[active]; if (r && onOpen) onOpen(r); }
    };
    const fn = keys[e.key];
    if (fn) { e.preventDefault(); fn(); }
  };

  const toggleSort = (col: Column<T>) => {
    if (!col.sort) return;
    setSort((s) => s?.id === col.id
      ? { id: col.id, dir: s.dir === "asc" ? "desc" : "asc" }
      : { id: col.id, dir: col.align === "end" ? "desc" : "asc" }); // numbers: biggest first
  };

  const rowId = (i: number) => `${id}-r${i}`;

  return (
    <div className="grid-shell">
      <div className="grid-x">
        <div
          className="grid"
          role="grid"
          aria-label={label}
          aria-rowcount={sorted.length + 1}
          aria-colcount={columns.length}
          style={{ minWidth }}
        >
          <div className="grid-row grid-head" role="row" aria-rowindex={1} style={{ gridTemplateColumns: template }}>
            {columns.map((c, ci) => {
              const dir = sort?.id === c.id ? sort.dir : null;
              return (
                <div
                  key={c.id}
                  role="columnheader"
                  aria-colindex={ci + 1}
                  aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : c.sort ? "none" : undefined}
                  className={c.align === "end" ? "end" : undefined}
                >
                  {c.sort ? (
                    <button type="button" onClick={() => toggleSort(c)}>
                      {c.header}
                      <span className="sort-mark" aria-hidden="true">{dir === "asc" ? "▲" : dir === "desc" ? "▼" : ""}</span>
                    </button>
                  ) : c.header}
                </div>
              );
            })}
          </div>

          {sorted.length === 0 ? (
            <div className="grid-empty" role="row"><div role="gridcell">{empty}</div></div>
          ) : (
            <div
              ref={scroller}
              className="grid-body"
              style={{ height: Math.min(height, sorted.length * rowHeight + 2) }}
              tabIndex={0}
              aria-activedescendant={rowId(active)}
              onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
              onKeyDown={onKeyDown}
            >
              <div style={{ height: sorted.length * rowHeight, position: "relative" }}>
                {sorted.slice(start, end).map((row, k) => {
                  const i = start + k;
                  const tone = rowTone?.(row);
                  return (
                    <div
                      key={rowKey(row)}
                      id={rowId(i)}
                      role="row"
                      aria-rowindex={i + 2}
                      aria-selected={i === active}
                      className={`grid-row${i === active ? " active" : ""}${tone ? " tone-" + tone : ""}${onOpen ? " openable" : ""}`}
                      style={{ gridTemplateColumns: template, height: rowHeight, transform: `translateY(${i * rowHeight}px)` }}
                      onClick={() => { setActive(i); onOpen?.(row); }}
                    >
                      {columns.map((c, ci) => (
                        <div key={c.id} role="gridcell" aria-colindex={ci + 1} className={c.align === "end" ? "end" : undefined}>
                          {c.cell(row)}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
