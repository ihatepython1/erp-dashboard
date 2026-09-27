import { expect, test } from "vitest";
import { getDataset } from "../src/data/generate";
import { dayFromParts } from "../src/lib/days";
import { comparisonPeriod, monthPeriod, monthlyProducts, parseDay, salesDrivers, summarizeSales } from "../src/data/salesAnalysis";

test("incomplete months compare matching dates and completed months compare in full", () => {
  const today = dayFromParts(2026, 9, 22);
  const now = monthPeriod(2026, 9, today);
  expect(comparisonPeriod(now, "previous", today)).toEqual({ from: dayFromParts(2026, 8, 1), to: dayFromParts(2026, 8, 22) });
  expect(comparisonPeriod(now, "year", today)).toEqual({ from: dayFromParts(2025, 9, 1), to: dayFromParts(2025, 9, 22) });
  expect(comparisonPeriod(monthPeriod(2026, 3, today), "previous", today).to).toBe(dayFromParts(2026, 2, 28));
  expect(comparisonPeriod(monthPeriod(2026, 1, today), "previous", today).from).toBe(dayFromParts(2025, 12, 1));
  const leap = dayFromParts(2024, 2, 29);
  expect(monthPeriod(2024, 2, leap).to).toBe(leap);
  expect(parseDay("2026-02-30")).toBeNull();
  expect(parseDay("")).toBeNull();
});

test("all driver dimensions reconcile to revenue and profit changes", () => {
  const d = getDataset(), now = monthPeriod(2026, 9, d.today), before = comparisonPeriod(now, "previous", d.today);
  const n = summarizeSales(d, now), b = summarizeSales(d, before);
  for (const dimension of ["product", "category", "channel", "customerGroup", "customer"] as const) {
    const rows = salesDrivers(d, now, before, dimension);
    expect(rows.reduce((sum, r) => sum + r.delta, 0)).toBeCloseTo(n.revenue - b.revenue, 5);
    expect(rows.reduce((sum, r) => sum + r.profitNow - r.profitBefore, 0)).toBeCloseTo(n.profit - b.profit, 5);
  }
  for (const r of salesDrivers(d, now, before, "product")) if (r.volumeEffect !== null) expect(r.volumeEffect + r.priceEffect!).toBeCloseTo(r.delta, 6);
});

test("summaries exclude cancelled/future orders, count each bill once and handle an empty range", () => {
  const d = getDataset(), source = d.orders[0]!;
  const order = { ...source, status: "delivered" as const, day: d.today, lines: [{ sku: d.products[0]!.sku, qty: 2, price: 100, cost: 60 }] };
  const sample = { ...d, orders: [order, { ...order, status: "cancelled" as const }, { ...order, day: d.today + 1 }] };
  expect(summarizeSales(sample, { from: d.today, to: d.today + 2 })).toMatchObject({ revenue: 200, profit: 80, qty: 2, count: 1, averagePrice: 100, averageBill: 200 });
  expect(summarizeSales(sample, { from: 0, to: 1 })).toMatchObject({ revenue: 0, count: 0, averagePrice: null, averageBill: null });
});

test("monthly calendar marks partial and future months and reconciles product totals", () => {
  const d = getDataset(), heat = monthlyProducts(d, 2026);
  expect(heat.months[8]).toMatchObject({ available: true, complete: false });
  expect(heat.months[9]).toMatchObject({ available: false, complete: false });
  for (let i = 0; i < 9; i++) {
    const totals = summarizeSales(d, monthPeriod(2026, i + 1, d.today));
    expect(heat.rows.reduce((sum, r) => sum + r.values[i]!.revenue, 0)).toBeCloseTo(totals.revenue, 5);
  }
});
