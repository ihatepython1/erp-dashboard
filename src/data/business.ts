import type { Dataset } from "./types";
import { summarizeSales, type Period } from "./salesAnalysis";

export function moneyInput(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1e12 ? n : null;
}
export type Scenario = { price: number; cost: number; units: number; discount: number; free: boolean; fee: number; shipping: number; ads: number };
export function scenario(x: Scenario) {
  if (!Object.values(x).every((v) => typeof v === "boolean" || Number.isFinite(v)) || x.price <= 0 || x.cost < 0 || x.units < 1 || !Number.isSafeInteger(x.units) || x.discount < 0 || x.discount > 100 || x.fee < 0 || x.fee > 100 || x.shipping < 0 || x.ads < 0) return null;
  const delivered = x.units * (x.free ? 2 : 1);
  const price = Math.round(x.price * (1 - x.discount / 100) * 100) / 100;
  const revenue = price * x.units, cost = x.cost * delivered;
  const contributionPerSale = price * (1 - x.fee / 100) - x.cost * (x.free ? 2 : 1) - x.shipping;
  return { revenue, cost, delivered, gross: revenue - cost, contributionPerSale, profit: contributionPerSale * x.units - x.ads };
}
export function profitBridge(d: Dataset, current: Period, previous: Period) {
  const aggregate = (p: Period) => {
    const m = new Map<string, { qty: number; revenue: number; cost: number }>();
    for (const o of d.orders) {
      if (o.status === "cancelled" || o.day > d.today || o.day < p.from || o.day > p.to) continue;
      for (const l of o.lines) { const r = m.get(l.sku) ?? { qty: 0, revenue: 0, cost: 0 }; r.qty += l.qty; r.revenue += l.qty * l.price; r.cost += l.qty * l.cost; m.set(l.sku, r); }
    }
    return m;
  };
  const a = aggregate(current), b = aggregate(previous);
  let volume = 0, price = 0, cost = 0, assortment = 0;
  for (const sku of new Set([...a.keys(), ...b.keys()])) {
    const n = a.get(sku), p = b.get(sku);
    if (n && p && n.qty > 0 && p.qty > 0) {
      volume += (n.qty - p.qty) * (p.revenue - p.cost) / p.qty;
      price += (n.revenue / n.qty - p.revenue / p.qty) * n.qty;
      cost += (p.cost / p.qty - n.cost / n.qty) * n.qty;
    } else assortment += (n ? n.revenue - n.cost : 0) - (p ? p.revenue - p.cost : 0);
  }
  return { volume, price, cost, assortment };
}
export type Campaign = { id: string; name: string; sku: string; from: number; to: number; budget: number; target: number; note: string };
export function campaignResults(d: Dataset, c: Campaign) {
  const length = c.to - c.from + 1;
  if (!Number.isSafeInteger(length) || length < 1 || length > 366 || c.to > d.today || !d.productBySku.has(c.sku) || !Number.isFinite(c.budget) || c.budget < 0) return null;
  const periods = [{ from: c.from - length, to: c.from - 1 }, { from: c.from, to: c.to }, { from: c.to + 1, to: c.to + length }];
  const first = d.orders.reduce((min, o) => Math.min(min, o.day), d.today);
  return periods.map((period) => {
    const actual = { ...period, to: Math.min(period.to, d.today) };
    const available = period.from <= d.today && period.to >= first;
    const product = summarizeSales(d, actual, c.sku), shop = summarizeSales(d, actual);
    const category = d.productBySku.get(c.sku)!.category.en;
    const peers = summarizeSales({ ...d, orders: d.orders.map((o) => ({ ...o, lines: o.lines.filter((l) => l.sku !== c.sku && d.productBySku.get(l.sku)?.category.en === category) })) }, actual);
    return { period, available, complete: period.to <= d.today && period.from >= first, days: Math.max(0, actual.to - Math.max(actual.from, first) + 1), product, shop, peers };
  });
}
