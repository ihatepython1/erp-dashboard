import type { Dataset, Product } from "./types";
import { simulatePromo } from "./stockHealth";

export function basketPairs(d: Dataset, days = 90, minBills = 5) {
  const counts = new Map<string, number>();
  const pairs = new Map<string, { a: string; b: string; count: number }>();
  let bills = 0;
  for (const o of d.orders) {
    if (o.status === "cancelled" || o.day > d.today || o.day <= d.today - days) continue;
    const skus = [...new Set(o.lines.filter((l) => l.qty > 0 && d.productBySku.has(l.sku)).map((l) => l.sku))].sort();
    if (!skus.length) continue;
    bills++;
    for (const sku of skus) counts.set(sku, (counts.get(sku) ?? 0) + 1);
    for (let i = 0; i < skus.length; i++) for (let j = i + 1; j < skus.length; j++) {
      const a = skus[i]!, b = skus[j]!, key = JSON.stringify([a, b]);
      const pair = pairs.get(key) ?? { a, b, count: 0 };
      pair.count++;
      pairs.set(key, pair);
    }
  }
  return { bills, pairs: [...pairs.entries()].filter(([, p]) => p.count >= minBills).map(([id, p]) => {
    const aBills = counts.get(p.a)!, bBills = counts.get(p.b)!;
    return { id, a: d.productBySku.get(p.a)!, b: d.productBySku.get(p.b)!, count: p.count,
      aBills, bBills, support: p.count / bills, confidence: p.count / aBills,
      reverseConfidence: p.count / bBills, lift: p.count * bills / (aBills * bBills) };
  }).sort((a, b) => b.lift - a.lift || b.count - a.count || a.id.localeCompare(b.id)) };
}

export function simulateBundle(a: Product, b: Product, qtyA: number, qtyB: number, discount: number, sets: number) {
  if (a.sku === b.sku || ![qtyA, qtyB].every((q) => Number.isSafeInteger(q) && q > 0)) return null;
  const price = a.price * qtyA + b.price * qtyB;
  const cost = a.cost * qtyA + b.cost * qtyB;
  const result = simulatePromo({ price, cost }, discount, sets);
  return result ? { ...result, listPrice: price, cost, availableSets: Math.max(0, Math.min(Math.floor(a.onHand / qtyA), Math.floor(b.onHand / qtyB))) } : null;
}
