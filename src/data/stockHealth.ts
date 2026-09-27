import type { Dataset, Product } from "./types";

export function stockHealth(d: Dataset) {
  const history = new Map<string, { last: number; sold: number }>();
  for (const o of d.orders) {
    if (o.status === "cancelled" || o.day > d.today) continue;
    for (const l of o.lines) {
      if (l.qty <= 0) continue;
      const h = history.get(l.sku) ?? { last: o.day, sold: 0 };
      h.last = Math.max(h.last, o.day);
      if (o.day > d.today - 30) h.sold += l.qty;
      history.set(l.sku, h);
    }
  }
  return d.products.filter((p) => p.onHand > 0).map((product) => {
    const h = history.get(product.sku);
    const sold30 = h?.sold ?? 0;
    const idleDays = h ? d.today - h.last : null;
    const cover = sold30 ? product.onHand / (sold30 / 30) : null;
    // No recorded sale is unknown history, not proof of an old stock lot.
    const state = idleDays === null ? "unknown" : idleDays >= 30 ? "idle" : cover !== null && cover > 90 ? "excess" : "normal";
    return { product, sold30, idleDays, cover, state, value: product.onHand * product.cost };
  }).sort((a, b) => b.value - a.value);
}

export function simulatePromo(product: Pick<Product, "price" | "cost">, discount: number, units: number) {
  if (![discount, units, product.price, product.cost].every(Number.isFinite) || discount < 0 || discount > 100 || units < 1 || !Number.isInteger(units) || product.price <= 0 || product.cost < 0) return null;
  const price = Math.round(product.price * (1 - discount / 100) * 100) / 100;
  const unitProfit = Math.round((price - product.cost) * 100) / 100;
  const baselineProfit = Math.round((product.price - product.cost) * units * 100) / 100;
  const requiredUnits = baselineProfit > 0 && unitProfit > 0 ? Math.ceil(baselineProfit / unitProfit) : null;
  return { price, unitProfit, baselineProfit, revenue: price * units, profit: unitProfit * units,
    margin: price > 0 ? unitProfit / price : null, requiredUnits };
}
