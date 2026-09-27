import { expect, test } from "vitest";
import { basketPairs, simulateBundle } from "../src/data/basket";
import { getDataset } from "../src/data/generate";

test("basket metrics use unique products and include single-product bills", () => {
  const d = getDataset(), a = d.products[0]!, b = d.products[1]!;
  const order = d.orders[0]!;
  const make = (skus: string[], day = d.today) => ({ ...order, day, status: "delivered" as const, lines: skus.map((sku) => ({ sku, qty: 1, cost: 1, price: 2 })) });
  const result = basketPairs({ ...d, orders: [make([a.sku, a.sku, b.sku]), make([b.sku, a.sku]), make([a.sku]), make([b.sku]), { ...make([a.sku, b.sku]), status: "cancelled" }, make([a.sku, b.sku], d.today + 1), make([a.sku, b.sku], d.today - 90)] }, 90, 2);
  expect(result.bills).toBe(4);
  expect(result.pairs).toHaveLength(1);
  expect(result.pairs[0]).toMatchObject({ count: 2, aBills: 3, bBills: 3, support: .5, confidence: 2 / 3, reverseConfidence: 2 / 3, lift: 8 / 9 });
});

test("empty history and insufficient evidence do not produce pair recommendations", () => {
  const d = getDataset();
  expect(basketPairs({ ...d, orders: [] })).toEqual({ bills: 0, pairs: [] });
  expect(basketPairs(d, 90, d.orders.length + 1).pairs).toEqual([]);
});

test("bundle quantities determine cost, baseline profit and limiting stock", () => {
  const d = getDataset();
  const a = { ...d.products[0]!, price: 100, cost: 60, onHand: 21 };
  const b = { ...d.products[1]!, price: 50, cost: 30, onHand: 7 };
  expect(simulateBundle(a, b, 2, 1, 10, 5)).toMatchObject({ listPrice: 250, cost: 150, price: 225, unitProfit: 75, baselineProfit: 500, profit: 375, requiredUnits: 7, availableSets: 7 });
  expect(simulateBundle(a, b, 2, 1, 100, 5)).toMatchObject({ profit: -750, requiredUnits: null });
  expect(simulateBundle(a, b, 0, 1, 10, 5)).toBeNull();
  expect(simulateBundle(a, b, 1.5, 1, 10, 5)).toBeNull();
  expect(simulateBundle(a, a, 1, 1, 10, 5)).toBeNull();
});
