import { expect, test } from "vitest";
import { campaignResults, moneyInput, profitBridge, scenario } from "../src/data/business";
import { getDataset } from "../src/data/generate";
import { comparisonPeriod, monthPeriod, summarizeSales } from "../src/data/salesAnalysis";
const base = { price: 100, cost: 70, units: 100, discount: 0, free: false, fee: 0, shipping: 0, ads: 0 };
test("offer examples reconcile paid and delivered units", () => {
  expect(scenario(base)).toMatchObject({ revenue: 10000, gross: 3000, profit: 3000 });
  expect(scenario({ ...base, discount: 10, units: 150 })).toMatchObject({ revenue: 13500, gross: 3000 });
  expect(scenario({ ...base, free: true, units: 50 })).toMatchObject({ revenue: 5000, delivered: 100, profit: -2000 });
  expect(scenario({ ...base, fee: 10, shipping: 2, ads: 500 })?.profit).toBe(1300);
  expect(scenario({ ...base, units: 1.5 })).toBeNull();
  expect(scenario({ ...base, discount: 101 })).toBeNull();
  expect(moneyInput("")).toBeNull();
  expect(moneyInput("0")).toBe(0);
  expect(moneyInput("-1")).toBeNull();
});
test("profit bridge reconciles with the ledger", () => {
  const d = getDataset(), now = monthPeriod(2026, 9, d.today), before = comparisonPeriod(now, "previous", d.today);
  const bridge = profitBridge(d, now, before);
  expect(Object.values(bridge).reduce((a,b) => a+b,0)).toBeCloseTo(summarizeSales(d, now).profit-summarizeSales(d, before).profit,5);
});
test("campaign periods are equal and future after-period remains unavailable", () => {
  const d = getDataset(), c = { id:"test", name:"test", sku:d.products[0]!.sku, from:d.today-6, to:d.today, budget:100, target:500, note:"" };
  const r = campaignResults(d,c)!;
  expect(r[0]!.period).toEqual({ from:d.today-13,to:d.today-7 });
  expect(r[1]!.product).toEqual(summarizeSales(d,{from:c.from,to:c.to},c.sku));
  expect(r[2]).toMatchObject({available:false,complete:false,days:0});
  expect(campaignResults(d,{...c,to:c.from-1})).toBeNull();
});
