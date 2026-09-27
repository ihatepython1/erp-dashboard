import type { Dataset } from "./types";
import { dayFromParts, parts, toDate } from "../lib/days";

export type Period = { from: number; to: number };
export type Dimension = "product" | "category" | "channel" | "customerGroup" | "customer";
export type Metric = "revenue" | "profit" | "qty";
export const isoDay = (day: number) => toDate(day).toISOString().slice(0, 10);
export function parseDay(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const day = dayFromParts(y!, m!, d!);
  return isoDay(day) === value ? day : null;
}
export function monthPeriod(year: number, month: number, today: number): Period {
  return { from: dayFromParts(year, month, 1), to: Math.min(today, dayFromParts(year, month + 1, 1) - 1) };
}
export function comparisonPeriod(current: Period, mode: "previous" | "year", today: number): Period {
  const p = parts(current.from);
  const target = parts(dayFromParts(p.year - (mode === "year" ? 1 : 0), p.month - (mode === "previous" ? 1 : 0), 1));
  const full = monthPeriod(target.year, target.month, today);
  const currentMonthEnd = dayFromParts(p.year, p.month + 1, 1) - 1;
  // Completed months compare in full; incomplete months compare matching dates.
  return { from: full.from, to: current.to < currentMonthEnd ? Math.min(full.to, full.from + current.to - current.from) : full.to };
}
export function summarizeSales(d: Dataset, period: Period, sku?: string) {
  let revenue = 0, cost = 0, qty = 0, count = 0;
  for (const o of d.orders) {
    if (o.status === "cancelled" || o.day > d.today || o.day < period.from || o.day > period.to) continue;
    const lines = o.lines.filter((l) => !sku || l.sku === sku);
    if (!lines.length) continue;
    count++;
    for (const l of lines) { revenue += l.price * l.qty; cost += l.cost * l.qty; qty += l.qty; }
  }
  return { revenue, cost, profit: revenue - cost, qty, count, averageBill: count ? revenue / count : null, averagePrice: qty ? revenue / qty : null, margin: revenue ? (revenue - cost) / revenue : null };
}
export function salesDrivers(d: Dataset, current: Period, previous: Period, dimension: Dimension) {
  const groups = new Map<string, { id: string; label: { th: string; en: string }; now: number; before: number; qtyNow: number; qtyBefore: number; profitNow: number; profitBefore: number }>();
  for (const o of d.orders) {
    if (o.status === "cancelled" || o.day > d.today) continue;
    const now = o.day >= current.from && o.day <= current.to;
    const before = o.day >= previous.from && o.day <= previous.to;
    if (!now && !before) continue;
    for (const l of o.lines) {
      const p = d.productBySku.get(l.sku), c = d.customerById.get(o.customerId);
      const id = dimension === "product" ? l.sku : dimension === "category" ? p?.category.en ?? "Unknown" : dimension === "channel" ? o.channel : dimension === "customerGroup" ? c?.channel ?? "Unknown" : o.customerId;
      const label = dimension === "product" ? p?.name : dimension === "category" ? p?.category : dimension === "customer" ? c?.name : undefined;
      const row = groups.get(id) ?? { id, label: label ?? { th: id, en: id }, now: 0, before: 0, qtyNow: 0, qtyBefore: 0, profitNow: 0, profitBefore: 0 };
      if (now) { row.now += l.price * l.qty; row.qtyNow += l.qty; row.profitNow += (l.price - l.cost) * l.qty; }
      if (before) { row.before += l.price * l.qty; row.qtyBefore += l.qty; row.profitBefore += (l.price - l.cost) * l.qty; }
      groups.set(id, row);
    }
  }
  return [...groups.values()].map((r) => {
    const priceNow = r.qtyNow ? r.now / r.qtyNow : null, priceBefore = r.qtyBefore ? r.before / r.qtyBefore : null;
    // Exact sequential decomposition for a SKU; price effect also includes discounts/channel mix.
    const volumeEffect = r.qtyNow > 0 && r.qtyBefore > 0 ? (r.qtyNow - r.qtyBefore) * priceBefore! : null;
    const priceEffect = volumeEffect !== null ? (priceNow! - priceBefore!) * r.qtyNow : null;
    return { ...r, delta: r.now - r.before, priceNow, priceBefore, volumeEffect, priceEffect };
  }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.id.localeCompare(b.id));
}
export function monthlyProducts(d: Dataset, year: number) {
  const firstDay = d.orders.length ? Math.min(...d.orders.map((o) => o.day)) : d.today;
  const months = Array.from({ length: 12 }, (_, i) => {
    const from = dayFromParts(year, i + 1, 1), end = dayFromParts(year, i + 2, 1) - 1;
    return { from, to: Math.min(end, d.today), available: from <= d.today && end >= firstDay, complete: from >= firstDay && end <= d.today };
  });
  const values = new Map(d.products.map((p) => [p.sku, Array.from({ length: 12 }, () => ({ revenue: 0, profit: 0, qty: 0 }))]));
  for (const o of d.orders) {
    const date = parts(o.day);
    if (o.status === "cancelled" || o.day > d.today || date.year !== year) continue;
    for (const l of o.lines) {
      const v = values.get(l.sku)?.[date.month - 1];
      if (v) { v.revenue += l.qty * l.price; v.profit += l.qty * (l.price - l.cost); v.qty += l.qty; }
    }
  }
  return { months, rows: d.products.map((product) => ({ product, values: values.get(product.sku)! })) };
}
