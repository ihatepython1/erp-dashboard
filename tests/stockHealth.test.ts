import { describe, expect, test } from "vitest";
import { getDataset } from "../src/data/generate";
import { simulatePromo, stockHealth } from "../src/data/stockHealth";

describe("promotion arithmetic", () => {
  test("calculates required whole units to recover the original profit", () => {
    expect(simulatePromo({ price: 100, cost: 60 }, 10, 10)).toMatchObject({ price: 90, unitProfit: 30, profit: 300, baselineProfit: 400, requiredUnits: 14 });
  });
  test("handles no discount, break-even and loss without infinite targets", () => {
    expect(simulatePromo({ price: 100, cost: 60 }, 0, 10)?.requiredUnits).toBe(10);
    expect(simulatePromo({ price: 100, cost: 60 }, 40, 10)?.requiredUnits).toBeNull();
    expect(simulatePromo({ price: 100, cost: 60 }, 100, 10)).toMatchObject({ profit: -600, margin: null, requiredUnits: null });
  });
  test("rejects invalid inputs and rounds prices to satang", () => {
    for (const [discount, units] of [[NaN, 10], [-1, 10], [101, 10], [5, 0], [5, 1.5], [5, Infinity]]) expect(simulatePromo({ price: 100, cost: 60 }, discount!, units!)).toBeNull();
    expect(simulatePromo({ price: 19.99, cost: 10 }, 15, 1)?.price).toBe(16.99);
  });
});

describe("stock review", () => {
  test("distinguishes unknown history and exact idle boundaries, ignores future/cancelled sales", () => {
    const d = getDataset();
    const p = { ...d.products[0]!, onHand: 20 };
    const order = { ...d.orders[0]!, status: "delivered" as const, lines: [{ sku: p.sku, qty: 1, price: p.price, cost: p.cost }] };
    const base = { ...d, products: [p], orders: [] };
    expect(stockHealth(base)[0]).toMatchObject({ state: "unknown", idleDays: null });
    for (const days of [30, 60, 90]) expect(stockHealth({ ...base, orders: [{ ...order, day: d.today - days }, { ...order, day: d.today, status: "cancelled" }, { ...order, day: d.today + 1 }] })[0]).toMatchObject({ state: "idle", idleDays: days, sold30: 0 });
    expect(stockHealth({ ...base, products: [{ ...p, onHand: 0 }] })).toEqual([]);
  });
  test("separates excess cover from inactivity and counts only the 30-day window", () => {
    const d = getDataset();
    const p = { ...d.products[0]!, onHand: 100 };
    const order = { ...d.orders[0]!, status: "delivered" as const, lines: [{ sku: p.sku, qty: 10, price: p.price, cost: p.cost }] };
    expect(stockHealth({ ...d, products: [p], orders: [{ ...order, day: d.today }, { ...order, day: d.today - 30 }] })[0]).toMatchObject({ state: "excess", sold30: 10, cover: 300, value: p.cost * 100 });
  });
});
