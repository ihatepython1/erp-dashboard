import { useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { useI18n } from "../lib/i18n";

function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => e && setWidth(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** A tidy upper bound for the y axis: 1, 2, 2.5 or 5 times a power of ten. */
export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

interface LineProps {
  current: (number | null)[];
  previous: (number | null)[];
  currentLabel: string;
  previousLabel: string;
}

/** This year against last year, month by month. */
export function YearLineChart({ current, previous, currentLabel, previousLabel }: LineProps) {
  const { f } = useI18n();
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const height = 260;
  const pad = { l: 56, r: 16, t: 16, b: 28 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const max = niceMax(Math.max(...current.map((v) => v ?? 0), ...previous.map((v) => v ?? 0)));
  const x = (i: number) => pad.l + (i / 11) * w;
  const y = (v: number) => pad.t + h - (v / max) * h;

  const path = (series: (number | null)[]) =>
    series.reduce<string>((d, v, i) => (v === null ? d : d + `${d ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`), "");

  const lastIdx = current.reduce<number>((a, v, i) => (v !== null ? i : a), 0);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - pad.l) / w) * 11);
    setHover(i >= 0 && i <= 11 ? i : null);
  };

  const hv = hover ?? lastIdx;
  const cur = current[hv] ?? null;
  const prev = previous[hv] ?? null;

  return (
    <div ref={ref} className="linechart">
      <div className="legend" aria-hidden="true">
        <span><i className="swatch now" />{currentLabel}</span>
        <span><i className="swatch before" />{previousLabel}</span>
      </div>
      <svg
        width={width} height={height} role="img"
        aria-label={`${currentLabel} / ${previousLabel}`}
        onPointerMove={onMove} onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line className="rule" x1={pad.l} x2={pad.l + w} y1={y(t)} y2={y(t)} />
            <text className="axis" x={pad.l - 8} y={y(t) + 4} textAnchor="end">{t ? f.bahtCompact(t) : "0"}</text>
          </g>
        ))}
        {Array.from({ length: 12 }, (_, i) => (w / 11 < 44 && i % 2 === 1 ? null : (
          <text key={i} className="axis" x={x(i)} y={height - 8} textAnchor="middle">{f.month(i)}</text>
        )))}
        <line className="cursor" x1={x(hv)} x2={x(hv)} y1={pad.t} y2={pad.t + h} />
        <path className="line before" d={path(previous)} />
        <path className="line now" d={path(current)} />
        {prev !== null && <circle className="dot before" cx={x(hv)} cy={y(prev)} r={3.5} />}
        {cur !== null && <circle className="dot now" cx={x(hv)} cy={y(cur)} r={4.5} />}
      </svg>
      <p className="readout" aria-live="polite">
        <b>{f.month(hv)}</b>
        <span>{currentLabel}: {cur === null ? "—" : f.baht(cur)}</span>
        <span>{previousLabel}: {prev === null ? "—" : f.baht(prev)}</span>
      </p>
    </div>
  );
}

interface BarItem { key: string; label: string; value: number; share: number }

export function BarList({ items, format }: { items: BarItem[]; format: (v: number) => string }) {
  const { f } = useI18n();
  const top = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="barlist">
      {items.map((it) => (
        <li key={it.key}>
          <div className="barlist-top">
            <span>{it.label}</span>
            <span className="num">{format(it.value)} <small>{f.pct(it.share)}</small></span>
          </div>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${(it.value / top) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

interface AgingProps { parts: { key: string; label: string; value: number }[]; total: number }

/** One stacked bar for the whole ledger, darkening as debt gets older. */
export function AgingBar({ parts, total }: AgingProps) {
  const { f } = useI18n();
  return (
    <div className="aging">
      <div className="aging-bar" role="img" aria-label={parts.map((p) => `${p.label} ${f.baht(p.value)}`).join(", ")}>
        {parts.map((p, i) => p.value > 0 && (
          <div key={p.key} className={`aging-seg age-${i}`} style={{ flexGrow: p.value }} title={`${p.label}: ${f.baht(p.value)}`} />
        ))}
      </div>
      <dl className="aging-legend">
        {parts.map((p, i) => (
          <div key={p.key}>
            <dt><i className={`swatch age-${i}`} />{p.label}</dt>
            <dd className="num">{f.baht(p.value)}<small>{total ? f.pct(p.value / total) : ""}</small></dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
