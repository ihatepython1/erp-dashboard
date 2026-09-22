// Every number on screen comes from a pure function in this file. The pages
// only lay results out, which keeps the maths testable without rendering.
import type { Channel, Customer, Dataset, Order, Product } from "./types";
import { parts, sameDayLastMonth, startOfMonth } from "../lib/days";

const live = (o: Order) => o.status !== "cancelled";

function sumRange(orders: Order[], from: number, to: number) {
  let revenue = 0, cost = 0, count = 0;
  for (const o of orders) {
    if (o.day < from || o.day > to || !live(o)) continue;
    revenue += o.total; cost += o.cost; count++;
  }
  return { revenue, cost, count, margin: revenue ? (revenue - cost) / revenue : 0 };
}

/* ---------------------------------- KPIs ---------------------------------- */
export interface Kpis {
  revenueMtd: number;
  revenuePrev: number;       // same span of days last month
  marginMtd: number;
  marginPrev: number;
  ordersMtd: number;
  ordersPrev: number;
  outstanding: number;
  overdue: number;
  overdueCustomers: number;
}

export function kpis(d: Dataset): Kpis {
  const from = startOfMonth(d.today);
  const prevTo = sameDayLastMonth(d.today);
  const prevFrom = startOfMonth(prevTo);
  const now = sumRange(d.orders, from, d.today);
  const prev = sumRange(d.orders, prevFrom, prevTo);

  let outstanding = 0, overdue = 0;
  const late = new Set<string>();
  for (const o of d.orders) {
    if (!live(o) || o.paidDay !== null) continue;
    outstanding += o.total;
    if (o.dueDay < d.today) { overdue += o.total; late.add(o.customerId); }
  }
  return {
    revenueMtd: now.revenue, revenuePrev: prev.revenue,
    marginMtd: now.margin, marginPrev: prev.margin,
    ordersMtd: now.count, ordersPrev: prev.count,
    outstanding, overdue, overdueCustomers: late.size
  };
}

export const change = (now: number, before: number) => (before ? (now - before) / before : 0);

/* ----------------------------- revenue by month ----------------------------- */
/** Twelve monthly totals for a calendar year; months after `today` are null. */
export function revenueByMonth(d: Dataset, year: number): (number | null)[] {
  const out: (number | null)[] = Array(12).fill(0);
  const t = parts(d.today);
  for (const o of d.orders) {
    if (!live(o)) continue;
    const p = parts(o.day);
    if (p.year === year) out[p.month - 1] = (out[p.month - 1] ?? 0) + o.total;
  }
  if (year === t.year) for (let m = t.month; m < 12; m++) out[m] = null;
  return out;
}

/** Year to date against the same calendar span a year earlier. */
export function yearToDate(d: Dataset) {
  const t = parts(d.today);
  let now = 0, prev = 0;
  for (const o of d.orders) {
    if (!live(o)) continue;
    const p = parts(o.day);
    const inSpan = p.month < t.month || (p.month === t.month && p.date <= t.date);
    if (!inSpan) continue;
    if (p.year === t.year) now += o.total;
    else if (p.year === t.year - 1) prev += o.total;
  }
  return { now, prev, growth: change(now, prev) };
}

/* ------------------------------ breakdowns ------------------------------ */
export function byChannel(d: Dataset, days = 30): { channel: Channel; revenue: number; share: number }[] {
  const acc = new Map<Channel, number>();
  let total = 0;
  for (const o of d.orders) {
    if (!live(o) || o.day <= d.today - days) continue;
    acc.set(o.channel, (acc.get(o.channel) ?? 0) + o.total);
    total += o.total;
  }
  return [...acc].map(([channel, revenue]) => ({ channel, revenue, share: total ? revenue / total : 0 }))
    .sort((a, b) => b.revenue - a.revenue);
}

export function byProvince(d: Dataset, days = 30) {
  const acc = new Map<string, { th: string; en: string; revenue: number }>();
  let total = 0;
  for (const o of d.orders) {
    if (!live(o) || o.day <= d.today - days) continue;
    const c = d.customerById.get(o.customerId)!;
    const row = acc.get(c.province.en) ?? { ...c.province, revenue: 0 };
    row.revenue += o.total;
    acc.set(c.province.en, row);
    total += o.total;
  }
  return [...acc.values()].map((r) => ({ ...r, share: total ? r.revenue / total : 0 }))
    .sort((a, b) => b.revenue - a.revenue);
}

export function topProducts(d: Dataset, days = 30, limit = 5) {
  const acc = new Map<string, { revenue: number; profit: number; qty: number }>();
  for (const o of d.orders) {
    if (!live(o) || o.day <= d.today - days) continue;
    for (const l of o.lines) {
      const r = acc.get(l.sku) ?? { revenue: 0, profit: 0, qty: 0 };
      r.revenue += l.qty * l.price;
      r.profit += l.qty * (l.price - l.cost);
      r.qty += l.qty;
      acc.set(l.sku, r);
    }
  }
  return [...acc].map(([sku, r]) => ({ product: d.productBySku.get(sku)!, ...r, margin: r.revenue ? r.profit / r.revenue : 0 }))
    .sort((a, b) => b.profit - a.profit)
    .slice(0, limit);
}

/* ------------------------------- inventory ------------------------------- */
export type StockState = "out" | "low" | "ok";

export interface StockRow {
  product: Product;
  perDay: number;            // average units sold per day, last 30 days
  cover: number | null;      // days until empty at that rate; null if it does not sell
  reorderPoint: number;
  suggested: number;         // units to order, rounded up to whole cases
  state: StockState;
  value: number;             // on hand at cost
}

const SAFETY_DAYS = 5;
const TARGET_DAYS = 21;

export function stockRows(d: Dataset): StockRow[] {
  const sold = new Map<string, number>();
  for (const o of d.orders) {
    if (!live(o) || o.day <= d.today - 30) continue;
    for (const l of o.lines) sold.set(l.sku, (sold.get(l.sku) ?? 0) + l.qty);
  }
  return d.products.map((p) => {
    const perDay = (sold.get(p.sku) ?? 0) / 30;
    const reorderPoint = Math.ceil(perDay * (p.leadDays + SAFETY_DAYS));
    const want = perDay * (p.leadDays + TARGET_DAYS) - p.onHand;
    const suggested = p.onHand <= reorderPoint && want > 0 ? Math.ceil(want / p.casePack) * p.casePack : 0;
    const state: StockState = p.onHand === 0 ? "out" : p.onHand <= reorderPoint ? "low" : "ok";
    return {
      product: p, perDay,
      cover: perDay > 0 ? p.onHand / perDay : null,
      reorderPoint, suggested, state,
      value: p.onHand * p.cost
    };
  });
}

/* ------------------------------ receivables ------------------------------ */
export const BUCKETS = ["current", "d1_30", "d31_60", "d61_90", "d90"] as const;
export type Bucket = (typeof BUCKETS)[number];

export function bucketFor(daysPastDue: number): Bucket {
  if (daysPastDue <= 0) return "current";
  if (daysPastDue <= 30) return "d1_30";
  if (daysPastDue <= 60) return "d31_60";
  if (daysPastDue <= 90) return "d61_90";
  return "d90";
}

export interface AgingRow {
  customer: Customer;
  buckets: Record<Bucket, number>;
  total: number;
  overLimit: boolean;
  oldestDays: number;
  invoices: Order[];
}

export function aging(d: Dataset): { rows: AgingRow[]; totals: Record<Bucket, number>; total: number } {
  const byCustomer = new Map<string, AgingRow>();
  const totals = Object.fromEntries(BUCKETS.map((b) => [b, 0])) as Record<Bucket, number>;
  let total = 0;

  for (const o of d.orders) {
    if (!live(o) || o.paidDay !== null) continue;
    const customer = d.customerById.get(o.customerId)!;
    let row = byCustomer.get(customer.id);
    if (!row) {
      row = { customer, buckets: Object.fromEntries(BUCKETS.map((b) => [b, 0])) as Record<Bucket, number>,
              total: 0, overLimit: false, oldestDays: 0, invoices: [] };
      byCustomer.set(customer.id, row);
    }
    const past = d.today - o.dueDay;
    const b = bucketFor(past);
    row.buckets[b] += o.total;
    row.total += o.total;
    row.oldestDays = Math.max(row.oldestDays, past);
    row.invoices.push(o);
    totals[b] += o.total;
    total += o.total;
  }
  for (const row of byCustomer.values())
    row.overLimit = row.customer.creditLimit > 0 && row.total > row.customer.creditLimit;

  const rows = [...byCustomer.values()].sort(
    (a, b) => b.buckets.d90 - a.buckets.d90 || b.total - a.total
  );
  return { rows, totals, total };
}

/* ---------------------------- attention queue ---------------------------- */
export type Severity = "high" | "medium" | "low";
export type AttentionKind = "stockout" | "reorder" | "overLimit" | "overdue90" | "packing";

export interface Attention {
  kind: AttentionKind;
  severity: Severity;
  count: number;
  amount: number;
  sample: string[];   // a few names to make the item concrete
  href: string;
}

export function attention(d: Dataset, lang: "th" | "en" = "th"): Attention[] {
  const stock = stockRows(d);
  const out = stock.filter((s) => s.state === "out" && s.perDay > 0);
  const low = stock.filter((s) => s.state === "low");
  const ag = aging(d);
  const overLimit = ag.rows.filter((r) => r.overLimit);
  const old = ag.rows.filter((r) => r.buckets.d90 > 0);
  const packing = d.orders.filter((o) => o.status === "packing");

  const items: Attention[] = [];
  if (out.length) items.push({
    kind: "stockout", severity: "high", count: out.length,
    amount: out.reduce((s, r) => s + r.perDay * r.product.price, 0),   // sales lost per day
    sample: out.slice(0, 3).map((r) => r.product.name[lang]), href: "#/inventory?state=out"
  });
  if (old.length) items.push({
    kind: "overdue90", severity: "high", count: old.length,
    amount: old.reduce((s, r) => s + r.buckets.d90, 0),
    sample: old.slice(0, 3).map((r) => r.customer.name[lang]), href: "#/receivables?filter=d90"
  });
  if (overLimit.length) items.push({
    kind: "overLimit", severity: "medium", count: overLimit.length,
    amount: overLimit.reduce((s, r) => s + (r.total - r.customer.creditLimit), 0),
    sample: overLimit.slice(0, 3).map((r) => r.customer.name[lang]), href: "#/receivables?filter=overLimit"
  });
  if (low.length) items.push({
    kind: "reorder", severity: "medium", count: low.length,
    amount: low.reduce((s, r) => s + r.suggested * r.product.cost, 0),
    sample: low.slice(0, 3).map((r) => r.product.name[lang]), href: "#/inventory?state=low"
  });
  if (packing.length) items.push({
    kind: "packing", severity: "low", count: packing.length,
    amount: packing.reduce((s, o) => s + o.total, 0),
    sample: [], href: "#/orders?status=packing"
  });
  return items;
}
