// Relationship metrics, all derived from the order history. Nothing here calls
// a model: churn risk and RFM are arithmetic, and arithmetic is testable.
import type { Customer, Dataset, Product } from "./types";
import { getCrm, type CrmData, type Rep } from "./crm";
import { parts } from "../lib/days";

export type Tier = "A" | "B" | "C";

export interface CustomerStats {
  customer: Customer;
  rep: Rep;
  orders: number;
  revenue365: number;
  revenue90: number;
  revenuePrev90: number;         // the same 90 days a year earlier
  trend: number;                 // year on year for that window
  profit365: number;
  margin: number;
  lastOrderDay: number | null;
  daysSince: number | null;
  /** Typical gap between orders for this customer, as a median. */
  cadence: number | null;
  /** daysSince / cadence — 1.0 means an order is due about now. */
  overdueRatio: number | null;
  atRisk: boolean;
  recency: number;               // 1..5
  frequency: number;             // 1..5
  monetary: number;              // 1..5
  tier: Tier;
  outstanding: number;
  openTasks: number;
  lastContactDay: number | null;
  monthly: number[];             // last 12 months of purchases, oldest first
}

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

/** Score into fifths, 5 = best. Ties share a score, which keeps it stable. */
function quintiles(values: number[], invert = false): Map<number, number> {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
  const cuts = [at(0.2), at(0.4), at(0.6), at(0.8)];
  const score = (v: number) => {
    let s = 1;
    for (const c of cuts) if (v > c) s++;
    return invert ? 6 - s : s;
  };
  return new Map(values.map((v) => [v, score(v)]));
}

export function customerStats(d: Dataset, crm: CrmData = getCrm(d)): CustomerStats[] {
  const now = d.today;
  const acc = new Map<string, {
    orders: number; r365: number; r90: number; rPrev90: number; profit: number;
    last: number | null; days: number[]; monthly: number[];
  }>();

  for (const c of d.customers)
    acc.set(c.id, { orders: 0, r365: 0, r90: 0, rPrev90: 0, profit: 0, last: null, days: [], monthly: Array(12).fill(0) });

  const thisMonth = parts(now).year * 12 + parts(now).month;
  for (const o of d.orders) {
    if (o.status === "cancelled") continue;
    const a = acc.get(o.customerId)!;
    const age = now - o.day;
    a.orders++;
    a.last = o.day;
    a.days.push(o.day);
    if (age < 365) { a.r365 += o.total; a.profit += o.total - o.cost; }
    if (age < 90) a.r90 += o.total;
    // the same window one year back, not the previous quarter: comparing the
    // rainy season against Songkran would make every account look like it is dying
    else if (age >= 365 && age < 455) a.rPrev90 += o.total;
    const idx = 11 - (thisMonth - (parts(o.day).year * 12 + parts(o.day).month));
    if (idx >= 0 && idx < 12) a.monthly[idx] = (a.monthly[idx] ?? 0) + o.total;
  }

  const unpaid = new Map<string, number>();
  for (const o of d.orders) {
    if (o.status === "cancelled" || o.paidDay !== null) continue;
    unpaid.set(o.customerId, (unpaid.get(o.customerId) ?? 0) + o.total);
  }

  const base = d.customers.map((customer) => {
    const a = acc.get(customer.id)!;
    const gaps: number[] = [];
    for (let i = 1; i < a.days.length; i++) gaps.push(a.days[i]! - a.days[i - 1]!);
    const cadence = median(gaps.slice(-20));
    const daysSince = a.last === null ? null : now - a.last;
    const overdueRatio = cadence && cadence > 0 && daysSince !== null ? daysSince / cadence : null;
    const contacts = crm.contactsByCustomer.get(customer.id) ?? [];
    return {
      customer,
      rep: crm.repById.get(crm.repForCustomer.get(customer.id)!)!,
      orders: a.orders,
      revenue365: a.r365,
      revenue90: a.r90,
      revenuePrev90: a.rPrev90,
      trend: a.rPrev90 ? (a.r90 - a.rPrev90) / a.rPrev90 : 0,
      profit365: a.profit,
      margin: a.r365 ? a.profit / a.r365 : 0,
      lastOrderDay: a.last,
      daysSince,
      cadence,
      overdueRatio,
      // quiet for more than twice their own normal gap, and they used to buy regularly
      atRisk: (overdueRatio ?? 0) > 2 && a.orders >= 5 && (daysSince ?? 0) > 14,
      outstanding: unpaid.get(customer.id) ?? 0,
      openTasks: (crm.tasksByCustomer.get(customer.id) ?? []).filter((t) => !t.done).length,
      lastContactDay: contacts[0]?.day ?? null,
      monthly: a.monthly
    };
  });

  // RFM is scored across active accounts only, so dormant ones do not drag the cuts
  const active = base.filter((b) => b.orders > 0);
  const rec = quintiles(active.map((b) => b.daysSince ?? 9999), true);
  const freq = quintiles(active.map((b) => b.orders));
  const mon = quintiles(active.map((b) => b.revenue365));

  return base.map((b) => {
    const recency = b.orders ? rec.get(b.daysSince ?? 9999) ?? 1 : 1;
    const frequency = b.orders ? freq.get(b.orders) ?? 1 : 1;
    const monetary = b.orders ? mon.get(b.revenue365) ?? 1 : 1;
    const total = recency + frequency + monetary;
    const tier: Tier = total >= 12 ? "A" : total >= 8 ? "B" : "C";
    return { ...b, recency, frequency, monetary, tier };
  });
}

/** Quiet accounts worth a phone call, biggest loss first. */
export function atRiskCustomers(stats: CustomerStats[], limit = 20): CustomerStats[] {
  return stats.filter((s) => s.atRisk).sort((a, b) => b.revenue365 - a.revenue365).slice(0, limit);
}

export function topProductsFor(d: Dataset, customerId: string, limit = 5):
  { product: Product; qty: number; revenue: number }[] {
  const acc = new Map<string, { qty: number; revenue: number }>();
  for (const o of d.orders) {
    if (o.customerId !== customerId || o.status === "cancelled" || o.day <= d.today - 365) continue;
    for (const l of o.lines) {
      const r = acc.get(l.sku) ?? { qty: 0, revenue: 0 };
      r.qty += l.qty;
      r.revenue += l.qty * l.price;
      acc.set(l.sku, r);
    }
  }
  return [...acc]
    .map(([sku, r]) => ({ product: d.productBySku.get(sku)!, ...r }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

/**
 * Lines this customer's peers buy regularly and this one barely touches.
 * "Never bought" is too strict for a wholesaler who has tried everything once,
 * so this compares how often peers buy a line against how often they do.
 */
export function suggestedLines(d: Dataset, customerId: string, stats: CustomerStats[], limit = 4) {
  const me = stats.find((s) => s.customer.id === customerId);
  if (!me) return [];
  const peers = new Set(
    stats.filter((s) => s.customer.channel === me.customer.channel && s.customer.id !== customerId && s.orders >= 5)
      .map((s) => s.customer.id)
  );

  const myOrders = { total: 0, bySku: new Map<string, number>() };
  const peerBuyers = new Map<string, Set<string>>();
  for (const o of d.orders) {
    if (o.status === "cancelled" || o.day <= d.today - 365) continue;
    if (o.customerId === customerId) {
      myOrders.total++;
      for (const l of new Set(o.lines.map((x) => x.sku)))
        myOrders.bySku.set(l, (myOrders.bySku.get(l) ?? 0) + 1);
      continue;
    }
    if (!peers.has(o.customerId)) continue;
    for (const l of o.lines) {
      const set = peerBuyers.get(l.sku) ?? new Set<string>();
      set.add(o.customerId);
      peerBuyers.set(l.sku, set);
    }
  }

  const peerTotal = peers.size || 1;
  return [...peerBuyers]
    .map(([sku, buyers]) => ({
      product: d.productBySku.get(sku)!,
      share: buyers.size / peerTotal,
      mine: myOrders.total ? (myOrders.bySku.get(sku) ?? 0) / myOrders.total : 0
    }))
    // peers reach for it often; this shop almost never does
    .filter((x) => x.share > 0.4 && x.mine < 0.08)
    .sort((a, b) => b.share - a.share - (b.mine - a.mine))
    .slice(0, limit);
}
