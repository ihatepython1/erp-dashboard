import { useMemo, useState, useSyncExternalStore } from "react";

/* ------------------------------ hash router ------------------------------ */
// Hash routes work on GitHub Pages with no server rewrites: #/orders?status=packing
export interface Route { path: string; params: URLSearchParams }

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, "") || "/";
  const [path = "/", query = ""] = raw.split("?");
  return { path, params: new URLSearchParams(query) };
}

const readRoute = () => parseHash(window.location.hash);

const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => "");
  return useMemo(() => parseHash(hash), [hash]);
}

export function navigate(to: string) {
  window.location.hash = to.startsWith("#") ? to : "#" + to;
}

/** Replace query params on the current route without adding history entries. */
export function setParams(path: string, next: Record<string, string | null>) {
  const { params } = readRoute();
  for (const [k, v] of Object.entries(next)) {
    if (v === null || v === "") params.delete(k);
    else params.set(k, v);
  }
  const q = params.toString();
  window.history.replaceState(null, "", `#${path}${q ? "?" + q : ""}`);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

/* ------------------------------ virtual window ------------------------------ */
/**
 * Which rows to render for a scroll position. Pure, so it is unit tested
 * separately from the grid component that uses it.
 */
export function visibleRange(
  scrollTop: number, viewport: number, rowHeight: number, count: number, overscan = 6
): { start: number; end: number } {
  if (count === 0 || viewport <= 0) return { start: 0, end: 0 };
  const first = Math.floor(Math.max(0, scrollTop) / rowHeight);
  const visible = Math.ceil(viewport / rowHeight) + 1;
  const start = Math.max(0, first - overscan);
  const end = Math.min(count, first + visible + overscan);
  return { start, end };
}

/** New scrollTop that brings a row fully into view, or the old one if it already is. */
export function scrollToReveal(
  index: number, scrollTop: number, viewport: number, rowHeight: number
): number {
  const top = index * rowHeight;
  const bottom = top + rowHeight;
  if (top < scrollTop) return top;
  if (bottom > scrollTop + viewport) return bottom - viewport;
  return scrollTop;
}

/* --------------------------------- sorting --------------------------------- */
export type SortDir = "asc" | "desc";
export type SortValue = string | number | null;

const collator = new Intl.Collator(["th", "en"], { numeric: true, sensitivity: "base" });

/** Stable sort; empty values always go last whichever way the column is sorted. */
export function sortRows<T>(rows: T[], value: (r: T) => SortValue, dir: SortDir): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return rows
    .map((row, i) => ({ row, i, v: value(row) }))
    .sort((a, b) => {
      if (a.v === null && b.v === null) return a.i - b.i;
      if (a.v === null) return 1;
      if (b.v === null) return -1;
      const c = typeof a.v === "number" && typeof b.v === "number"
        ? a.v - b.v
        : collator.compare(String(a.v), String(b.v));
      return c !== 0 ? c * sign : a.i - b.i;
    })
    .map((x) => x.row);
}

/* ----------------------------------- CSV ----------------------------------- */
export function toCsv(header: string[], rows: (string | number)[][]): string {
  const cell = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\n");
}

export function downloadCsv(name: string, csv: string) {
  // the BOM makes Excel read Thai text as UTF-8 instead of mangling it
  const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------- preferences ------------------------------- */
export function usePreference<T extends string>(key: string, fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try { return (localStorage.getItem(key) as T | null) ?? fallback; } catch { return fallback; }
  });
  const set = (v: T) => {
    setValue(v);
    try { localStorage.setItem(key, v); } catch { /* private mode: keep it in memory */ }
  };
  return [value, set];
}
