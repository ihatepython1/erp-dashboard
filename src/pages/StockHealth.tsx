import { useMemo, useState } from "react";
import type { Dataset } from "../data/types";
import { simulatePromo, stockHealth } from "../data/stockHealth";
import { useI18n } from "../lib/i18n";
import { DataGrid, type Column } from "../components/DataGrid";
import { downloadCsv, toCsv } from "../lib/util";

export function StockHealth({ data }: { data: Dataset }) {
  const { lang, f } = useI18n();
  const s = (th: string, en: string) => lang === "th" ? th : en;
  const all = useMemo(() => stockHealth(data), [data]);
  const [filter, setFilter] = useState(() => all.some((r) => r.state === "idle" || r.state === "excess") ? "risk" : "all");
  const [q, setQ] = useState("");
  const [sku, setSku] = useState("");
  const [discount, setDiscount] = useState("10");
  const [units, setUnits] = useState("10");
  const risk = all.filter((r) => r.state === "idle" || r.state === "excess");
  const product = data.productBySku.get(sku) ?? risk[0]?.product ?? all[0]?.product ?? data.products[0];
  const result = product && discount.trim() && units.trim() ? simulatePromo(product, Number(discount), Number(units)) : null;
  const rows = all.filter((r) => {
    const matches = filter === "all" || (filter === "risk" ? r.state === "idle" || r.state === "excess" : filter === "unknown" ? r.state === "unknown" : r.idleDays !== null && r.idleDays >= Number(filter));
    return matches && [r.product.sku, r.product.name.th, r.product.name.en].some((v) => v.toLowerCase().includes(q.trim().toLowerCase()));
  });
  const stateLabel = (state: string) => state === "idle" ? s("ไม่มีขาย ≥30 วัน", "No sale for ≥30 days") : state === "excess" ? s("สต็อกเกิน 90 วัน", "Over 90 days of cover") : state === "unknown" ? s("ไม่มีประวัติขาย", "No sales history") : s("ปกติ", "Normal");
  type Row = ReturnType<typeof stockHealth>[number];
  const columns: Column<Row>[] = [
    { id: "name", header: s("สินค้า", "Product"), width: "minmax(210px, 2fr)", sort: (r) => r.product.name[lang], cell: (r) => <span className="clip">{r.product.name[lang]}</span> },
    { id: "state", header: s("สถานะ", "Status"), width: "180px", cell: (r) => <span className={r.state === "idle" ? "text-danger" : "muted"}>{stateLabel(r.state)}</span> },
    { id: "idle", header: s("วันตั้งแต่ขายล่าสุด", "Days since last sale"), width: "150px", sort: (r) => r.idleDays, cell: (r) => r.idleDays === null ? "—" : f.num(r.idleDays) },
    { id: "sold", header: s("ขาย 30 วัน", "Sold in 30 days"), width: "110px", sort: (r) => r.sold30, cell: (r) => f.num(r.sold30) },
    { id: "stock", header: s("คงเหลือ", "On hand"), width: "90px", sort: (r) => r.product.onHand, cell: (r) => f.num(r.product.onHand) },
    { id: "value", header: s("ทุนคงเหลือ", "Stock at cost"), width: "125px", sort: (r) => r.value, cell: (r) => f.baht(r.value) },
    { id: "action", header: s("ทดลอง", "Simulate"), width: "120px", cell: (r) => <button className="btn" onClick={(e) => { e.stopPropagation(); setSku(r.product.sku); document.getElementById("promo-product")?.focus(); }}>{s("จำลองโปร", "Try promo")}</button> }
  ];
  return <section className="stock-health">
    <p className="lead">{s("ตรวจสินค้าที่ควรทบทวนการสั่งซื้อ แล้วทดลองส่วนลดก่อนตัดสินใจ • ข้อมูลจำลอง", "Review stock before reordering and test discounts before deciding • Demo data")}</p>
    <div className="kpis kpis-3">
      {[
        [s("ทุนในรายการที่ควรทบทวน", "Capital in flagged products"), f.baht(risk.reduce((sum, r) => sum + r.value, 0))],
        [s("ไม่มีขายอย่างน้อย 30 วัน", "No sale for at least 30 days"), f.num(all.filter((r) => r.state === "idle").length)],
        [s("สต็อกพอขายเกิน 90 วัน", "Over 90 days of stock cover"), f.num(all.filter((r) => r.state === "excess").length)]
      ].map(([label, value]) => <div className="kpi" key={label}><span className="kpi-label">{label}</span><strong className="kpi-value num">{value}</strong></div>)}
    </div>
    <p className="summary">{s("ทุนคงเหลือไม่ใช่มูลค่าขาดทุน • ใช้ยอดขายที่ไม่ยกเลิก • วันตั้งแต่ขายล่าสุดไม่ใช่อายุสินค้าในคลัง • สต็อกครอบคลุมคำนวณจากยอดขาย 30 วัน", "Stock value is not a loss • Excludes cancelled orders • Days since last sale is not inventory age • Cover uses the last 30 days of sales")}</p>
    <div className="toolbar">
      <input className="field grow" type="search" aria-label={s("ค้นหาสินค้า", "Search products")} placeholder={s("ค้นหาชื่อหรือรหัสสินค้า", "Search product or SKU")} value={q} onChange={(e) => setQ(e.target.value)} />
      <select className="field" aria-label={s("กรองสต็อก", "Stock filter")} value={filter} onChange={(e) => setFilter(e.target.value)}>
        <option value="risk">{s("ควรทบทวน", "Needs review")}</option>
        {[30, 60, 90].map((n) => <option key={n} value={n}>{s(`ไม่มีขาย ≥${n} วัน`, `No sale for ≥${n} days`)}</option>)}
        <option value="unknown">{s("ไม่มีประวัติขาย", "No sales history")}</option><option value="all">{s("สินค้าที่มีสต็อกทั้งหมด", "All stocked products")}</option>
      </select>
      <button className="btn" onClick={() => downloadCsv("stock-review.csv", toCsv(["sku", "product", "status", "days_since_sale", "sold_30d", "on_hand", "value_at_cost"], rows.map((r) => [r.product.sku, r.product.name[lang], stateLabel(r.state), r.idleDays ?? "", r.sold30, r.product.onHand, r.value])))}>{s("ส่งออก CSV", "Export CSV")}</button>
    </div>
    <DataGrid label={s("เงินจมในสต็อก", "Stock health")} rows={rows} columns={columns} rowKey={(r) => r.product.sku} minWidth={1100} height={310} initialSort={{ id: "value", dir: "desc" }} empty={s("ไม่พบสินค้าในเกณฑ์นี้ ลองเลือกสินค้าที่มีสต็อกทั้งหมดเพื่อจำลองโปรโมชั่น", "No products match. Choose all stocked products to try a promotion.")} />
    <section className="panel promo-panel" aria-labelledby="promo-title">
      <p><a href="#/basket">{s("ดูสินค้าซื้อคู่และจำลองโปรชุด →", "Explore product pairs and bundle promotions →")}</a></p>
      <header className="panel-head"><h2 id="promo-title">{s("จำลองโปรโมชั่น", "Promotion simulator")}</h2><span className="chip">{s("ทดลองเท่านั้น", "Simulation only")}</span></header>
      <p className="lead">{s("เปรียบเทียบกับการขายจำนวนเดียวกันที่ราคาป้าย คำนวณเฉพาะกำไรขั้นต้น ไม่รวมภาษี ค่าส่ง และค่าใช้จ่ายอื่น", "Compared with the same quantity at list price. Gross profit only; excludes tax, shipping and other expenses.")}</p>
      <div className="promo-inputs">
        <label>{s("สินค้า", "Product")}<select id="promo-product" className="field" value={product?.sku ?? ""} onChange={(e) => setSku(e.target.value)}>{data.products.map((p) => <option key={p.sku} value={p.sku}>{p.name[lang]}</option>)}</select></label>
        <label>{s("ส่วนลด (%)", "Discount (%)")}<input className="field" type="number" min="0" max="100" step="0.1" value={discount} onChange={(e) => setDiscount(e.target.value)} /></label>
        <label>{s("จำนวนขายฐาน (หน่วย)", "Baseline units")}<input className="field" type="number" min="1" step="1" value={units} onChange={(e) => setUnits(e.target.value)} /></label>
      </div>
      {product && <p className="summary">{s("ราคาป้าย", "List price")} {f.bahtExact(product.price)} · {s("ทุน/หน่วย", "Unit cost")} {f.bahtExact(product.cost)} · {s("สต็อก", "On hand")} {f.num(product.onHand)}</p>}
      <div aria-live="polite">
        {result ? <>
          <div className="promo-results">{[
            [s("ราคาหลังลด", "Discounted price"), f.bahtExact(result.price)],
            [s("กำไร/หน่วย", "Profit per unit"), f.bahtExact(result.unitProfit)],
            [s("กำไรรวมหลังลด", "Total promo profit"), f.bahtExact(result.profit)],
            [s("กำไรรวมเดิม", "Original total profit"), f.bahtExact(result.baselineProfit)]
          ].map(([label, value]) => <div key={label}><span className="muted">{label}</span><strong className="num">{value}</strong></div>)}</div>
          <p className={result.unitProfit <= 0 ? "promo-message text-danger" : "promo-message"}>{result.requiredUnits !== null
            ? s(`ต้องขาย ${f.num(result.requiredUnits)} หน่วย (เพิ่ม ${f.num(result.requiredUnits - Number(units))}) เพื่อให้ได้กำไรขั้นต้นเท่าเดิม`, `Sell ${f.num(result.requiredUnits)} units (${f.num(result.requiredUnits - Number(units))} extra) to match the original gross profit`)
            : result.unitProfit <= 0 ? s("ราคานี้ไม่เหลือกำไรต่อหน่วย การเพิ่มจำนวนขายไม่ช่วยให้ถึงเป้ากำไรเดิม", "This price leaves no positive unit profit; more units cannot recover a positive profit target.") : s("ราคาป้ายเดิมไม่มีกำไร จึงไม่มีเป้ากำไรบวกให้เปรียบเทียบ", "The list price has no positive profit target to match.")}</p>
          {product && (Number(units) > product.onHand || (result.requiredUnits !== null && result.requiredUnits > product.onHand)) && <p className="text-warn">{s("สต็อกปัจจุบันไม่พอสำหรับจำนวนขายฐานหรือเป้าหมายที่คำนวณได้", "Current stock cannot cover the baseline or calculated target quantity.")}</p>}
          <p className="muted">{s("นี่คือจุดเปรียบเทียบทางคณิตศาสตร์ ไม่ใช่การคาดการณ์ยอดขาย และยังไม่เปลี่ยนราคาขายจริง", "This is a mathematical comparison, not a sales forecast. Actual prices are unchanged.")}</p>
        </> : <p className="text-danger">{s("กรอกส่วนลด 0–100 และจำนวนขายเป็นจำนวนเต็มตั้งแต่ 1 ขึ้นไป", "Enter a discount from 0–100 and a whole-number quantity of at least 1.")}</p>}
      </div>
    </section>
  </section>;
}
