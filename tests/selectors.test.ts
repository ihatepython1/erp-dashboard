import { describe, expect, test } from "vitest";
import { generate, getDataset } from "../src/data/generate";
import {
  aging, attention, BUCKETS, bucketFor, byChannel, kpis, revenueByMonth, stockRows, topProducts, yearToDate
} from "../src/data/selectors";
import { dayFromParts, parts, sameDayLastMonth, startOfMonth, TODAY } from "../src/lib/days";

const d = getDataset();

describe("day numbers", () => {
  test("round-trip through calendar parts", () => {
    const day = dayFromParts(2026, 2, 28);
    expect(parts(day)).toMatchObject({ year: 2026, month: 2, date: 28 });
  });

  test("same day last month clamps to a shorter month", () => {
    expect(parts(sameDayLastMonth(dayFromParts(2026, 3, 31)))).toMatchObject({ month: 2, date: 28 });
    expect(parts(sameDayLastMonth(dayFromParts(2026, 1, 15)))).toMatchObject({ year: 2025, month: 12, date: 15 });
  });

  test("start of month", () => {
    expect(parts(startOfMonth(TODAY))).toMatchObject({ year: 2026, month: 9, date: 1 });
  });
});

describe("generated data", () => {
  test("is deterministic for a seed", () => {
    const a = generate(7), b = generate(7);
    expect(a.orders.length).toBe(b.orders.length);
    expect(a.orders.at(-1)).toEqual(b.orders.at(-1));
    expect(generate(8).orders.length).not.toBe(a.orders.length);
  });

  test("orders are stored oldest first, which the order list relies on", () => {
    for (let i = 1; i < d.orders.length; i++) expect(d.orders[i]!.day).toBeGreaterThanOrEqual(d.orders[i - 1]!.day);
  });

  test("order totals equal the sum of their lines", () => {
    for (const o of d.orders.slice(-500)) {
      const sum = o.lines.reduce((s, l) => s + l.qty * l.price, 0);
      expect(o.total).toBeCloseTo(sum, 1);
    }
  });

  test("no order is paid before it was placed, and cancelled orders are never paid", () => {
    for (const o of d.orders) {
      if (o.paidDay !== null) expect(o.paidDay).toBeGreaterThanOrEqual(o.day);
      if (o.status === "cancelled") expect(o.paidDay).toBeNull();
    }
  });

  test("customer names are unique in both languages", () => {
    expect(new Set(d.customers.map((c) => c.name.en)).size).toBe(d.customers.length);
    expect(new Set(d.customers.map((c) => c.name.th)).size).toBe(d.customers.length);
  });

  test("today's orders are still being packed", () => {
    const todays = d.orders.filter((o) => o.day === d.today && o.status !== "cancelled");
    expect(todays.length).toBeGreaterThan(0);
    expect(todays.every((o) => o.status === "packing")).toBe(true);
  });
});

describe("receivables ageing", () => {
  test("bucket boundaries", () => {
    expect(bucketFor(0)).toBe("current");
    expect(bucketFor(-10)).toBe("current");
    expect(bucketFor(1)).toBe("d1_30");
    expect(bucketFor(30)).toBe("d1_30");
    expect(bucketFor(31)).toBe("d31_60");
    expect(bucketFor(90)).toBe("d61_90");
    expect(bucketFor(91)).toBe("d90");
  });

  test("buckets add up to the ledger total and to outstanding in the KPIs", () => {
    const a = aging(d);
    const sum = BUCKETS.reduce((s, b) => s + a.totals[b], 0);
    expect(sum).toBeCloseTo(a.total, 2);
    expect(a.total).toBeCloseTo(kpis(d).outstanding, 2);
  });

  test("each customer row adds up across its buckets", () => {
    for (const r of aging(d).rows) {
      expect(BUCKETS.reduce((s, b) => s + r.buckets[b], 0)).toBeCloseTo(r.total, 2);
    }
  });

  test("rows are ordered worst debt first", () => {
    const rows = aging(d).rows;
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1]!.buckets.d90).toBeGreaterThanOrEqual(rows[i]!.buckets.d90);
  });

  test("cash customers never appear as over their limit", () => {
    expect(aging(d).rows.some((r) => r.customer.termsDays === 0 && r.overLimit)).toBe(false);
  });
});

describe("KPIs and trends", () => {
  test("overdue can never exceed outstanding", () => {
    const k = kpis(d);
    expect(k.overdue).toBeLessThanOrEqual(k.outstanding);
    expect(k.overdue).toBeGreaterThan(0);
  });

  test("gross margin sits in a believable range for a distributor", () => {
    const k = kpis(d);
    expect(k.marginMtd).toBeGreaterThan(0.04);
    expect(k.marginMtd).toBeLessThan(0.25);
  });

  test("future months are empty rather than zero", () => {
    const m = revenueByMonth(d, 2026);
    expect(m[8]).toBeGreaterThan(0);     // September, in progress
    expect(m[9]).toBeNull();             // October, not happened yet
    expect(revenueByMonth(d, 2025).every((v) => v !== null && v > 0)).toBe(true);
  });

  test("year to date compares like with like", () => {
    const y = yearToDate(d);
    const janToAug2026 = revenueByMonth(d, 2026).slice(0, 8).reduce<number>((s, v) => s + (v ?? 0), 0);
    expect(y.now).toBeGreaterThan(janToAug2026);   // plus the September days so far
    expect(y.growth).toBeGreaterThan(-0.5);
  });

  test("channel shares sum to one", () => {
    expect(byChannel(d).reduce((s, c) => s + c.share, 0)).toBeCloseTo(1, 6);
  });

  test("top products are ordered by profit", () => {
    const top = topProducts(d, 30, 5);
    expect(top).toHaveLength(5);
    for (let i = 1; i < top.length; i++) expect(top[i - 1]!.profit).toBeGreaterThanOrEqual(top[i]!.profit);
  });
});

describe("stock rules", () => {
  const rows = stockRows(d);

  test("suggested orders are whole cases", () => {
    for (const r of rows) expect(r.suggested % r.product.casePack).toBe(0);
  });

  test("state follows on-hand against the reorder point", () => {
    for (const r of rows) {
      if (r.product.onHand === 0) expect(r.state).toBe("out");
      else if (r.product.onHand <= r.reorderPoint) expect(r.state).toBe("low");
      else expect(r.state).toBe("ok");
    }
  });

  test("healthy stock is never suggested for reorder", () => {
    expect(rows.filter((r) => r.state === "ok").every((r) => r.suggested === 0)).toBe(true);
  });

  test("an order suggestion covers lead time plus the target", () => {
    for (const r of rows.filter((x) => x.suggested > 0)) {
      expect(r.product.onHand + r.suggested).toBeGreaterThanOrEqual(r.perDay * (r.product.leadDays + 21) - 1e-9);
    }
  });
});

describe("attention queue", () => {
  test("every item links to a page that can show it", () => {
    for (const a of attention(d, "en")) expect(a.href).toMatch(/^#\/(inventory|receivables|orders)\?/);
  });

  test("high severity comes before medium and low", () => {
    const rank = { high: 0, medium: 1, low: 2 };
    const s = attention(d, "th").map((a) => rank[a.severity]);
    expect([...s].sort()).toEqual(s);
  });

  test("names follow the chosen language", () => {
    const th = attention(d, "th").find((a) => a.sample.length);
    const en = attention(d, "en").find((a) => a.sample.length);
    expect(th?.sample[0]).toMatch(/[\u0E01-\u0E3A]/);
    expect(en?.sample[0]).not.toMatch(/[\u0E01-\u0E3A]/);
  });
});
