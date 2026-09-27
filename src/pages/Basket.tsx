import { useMemo, useRef, useState } from "react";
import type { Dataset } from "../data/types";
import { basketPairs, simulateBundle } from "../data/basket";
import { useI18n } from "../lib/i18n";

export function Basket({ data }: { data: Dataset }) {
  const { lang, f } = useI18n();
  const s = (th: string, en: string) => lang === "th" ? th : en;
  const [days, setDays] = useState(90);
  const [minimum, setMinimum] = useState(5);
  const [query, setQuery] = useState("");
  const analysis = useMemo(() => basketPairs(data, days, minimum), [data, days, minimum]);
  const [selection, setSelection] = useState<[string, string] | null>(null);
  const [qtyA, setQtyA] = useState("1"), [qtyB, setQtyB] = useState("1");
  const [discount, setDiscount] = useState("5"), [sets, setSets] = useState("10");
  const simulator = useRef<HTMLElement>(null);
  const a = data.productBySku.get(selection?.[0] ?? "") ?? analysis.pairs[0]?.a;
  const b = data.productBySku.get(selection?.[1] ?? "") ?? analysis.pairs[0]?.b;
  const result = a && b && [qtyA, qtyB, discount, sets].every((v) => v.trim()) ? simulateBundle(a, b, Number(qtyA), Number(qtyB), Number(discount), Number(sets)) : null;
  const rows = analysis.pairs.filter((p) => [p.a.sku, p.b.sku, p.a.name.th, p.a.name.en, p.b.name.th, p.b.name.en].some((v) => v.toLowerCase().includes(query.trim().toLowerCase())));
  return <section>
    <p className="lead">{s("หาคู่สินค้าจากใบสั่งขาย แล้วทดลองกำไรของโปรชุด • ข้อมูลจำลอง", "Find product pairs in sales orders and test bundle profitability • Demo data")}</p>
    <div className="toolbar">
      <input className="field grow" type="search" aria-label={s("ค้นหาคู่สินค้า", "Search pairs")} placeholder={s("ชื่อหรือรหัสสินค้า", "Product name or SKU")} value={query} onChange={(e) => setQuery(e.target.value)} />
      <select className="field" aria-label={s("ช่วงวิเคราะห์", "Analysis period")} value={days} onChange={(e) => setDays(Number(e.target.value))}>{[30, 90, 365].map((n) => <option key={n} value={n}>{s(`${n} วันล่าสุด`, `Last ${n} days`)}</option>)}</select>
      <select className="field" aria-label={s("จำนวนบิลขั้นต่ำ", "Minimum pair bills")} value={minimum} onChange={(e) => setMinimum(Number(e.target.value))}>{[5, 10, 20].map((n) => <option key={n} value={n}>{s(`พบคู่ ≥${n} บิล`, `Pair in ≥${n} bills`)}</option>)}</select>
    </div>
    <p className="summary">{s(`วิเคราะห์ ${f.num(analysis.bills)} บิล · พบ ${f.num(rows.length)} คู่ตามตัวกรอง · เรียงตาม Lift`, `${f.num(analysis.bills)} bills analyzed · ${f.num(rows.length)} matching pairs · Sorted by lift`)}</p>
    <p className="lead">{s("นับแต่ละสินค้าไม่เกินหนึ่งครั้งต่อบิล รวมบิลสินค้าเดี่ยวในฐานคำนวณ ไม่รวมบิลยกเลิกหรืออนาคต • Lift มากกว่า 1 หมายถึงพบคู่มากกว่าที่คาดหากซื้ออย่างอิสระ ไม่ใช่หลักฐานว่าโปรโมชั่นจะเพิ่มยอดขาย", "Each product counts once per bill; single-product bills remain in the denominator. Cancelled and future orders are excluded. Lift above 1 means the pair appears more often than expected under independent purchasing, not proof that a promotion will increase sales.")}</p>
    <div className="basket-pairs">
      {rows.slice(0, 12).map((p) => <article className="panel" key={p.id}>
        <div className="panel-head"><span className="chip">Lift {f.num1(p.lift)}×</span><span className="muted">{f.num(p.count)} {s("บิลร่วม", "shared bills")}</span></div>
        <h2 className="basket-name">{p.a.name[lang]} <span className="muted">＋</span> {p.b.name[lang]}</h2>
        <p>{s("สัดส่วนบิลทั้งหมด", "Share of all bills")}: <b>{f.pct(p.support)}</b></p>
        <p className="muted">{s(`เมื่อซื้อ ${p.a.name[lang]} ซื้อ ${p.b.name[lang]} ด้วย ${f.pct(p.confidence)} (${p.count}/${p.aBills} บิล)`, `Buying ${p.a.name[lang]} → also buying ${p.b.name[lang]}: ${f.pct(p.confidence)} (${p.count}/${p.aBills} bills)`)}</p>
        <p className="muted">{s("สัดส่วนในทิศทางกลับกัน", "Reverse direction")}: {f.pct(p.reverseConfidence)} ({p.count}/{p.bBills})</p>
        <button className="btn" onClick={() => { setSelection([p.a.sku, p.b.sku]); setQtyA("1"); setQtyB("1"); simulator.current?.focus(); }}>{s("จำลองโปรคู่นี้", "Simulate this pair")}</button>
      </article>)}
    </div>
    {!rows.length && <p className="panel">{s("ไม่พบคู่ตามเกณฑ์ ลองขยายช่วงเวลา ลดจำนวนบิลขั้นต่ำ หรือล้างคำค้นหา", "No matching pairs. Extend the period, lower the minimum bill count, or clear the search.")}</p>}
    {rows.length > 12 && <p className="muted">{s("แสดง 12 คู่แรก ใช้คำค้นหาเพื่อดูสินค้าอื่น", "Showing the first 12 pairs. Search to explore other products.")}</p>}
    <section className="panel promo-panel" ref={simulator} tabIndex={-1} aria-labelledby="bundle-title">
      <header className="panel-head"><h2 id="bundle-title">{s("จำลองโปรโมชั่นแบบชุด", "Bundle promotion simulator")}</h2><span className="chip">{s("ทดลองเท่านั้น", "Simulation only")}</span></header>
      {a && b ? <>
        <p>{a.name[lang]} ＋ {b.name[lang]}</p>
        <p className="muted">{s("หน่วยเป็นหน่วยขายตามชื่อสินค้า เช่น 1 แพ็คหรือ 1 ลัง ใช้ราคาป้ายและต้นทุนปัจจุบัน ไม่รวมภาษี ค่าส่ง หรือค่าใช้จ่ายอื่น", "Quantities use each product’s selling unit, such as a pack or carton. Uses current list prices and costs; excludes tax, shipping and other expenses.")}</p>
        <div className="bundle-inputs">{[
          [s(`จำนวน ${a.name[lang]} ต่อชุด`, `${a.name[lang]} per bundle`), qtyA, setQtyA, "1", undefined],
          [s(`จำนวน ${b.name[lang]} ต่อชุด`, `${b.name[lang]} per bundle`), qtyB, setQtyB, "1", undefined],
          [s("ส่วนลดทั้งชุด (%)", "Bundle discount (%)"), discount, setDiscount, "0", "100"],
          [s("จำนวนชุดฐาน", "Baseline bundles"), sets, setSets, "1", undefined]
        ].map(([label, value, setter, min, max]) => <label key={label as string}>{label as string}<input className="field" type="number" min={min as string} max={max as string | undefined} step={max ? "0.1" : "1"} value={value as string} onChange={(e) => (setter as (v: string) => void)(e.target.value)} /></label>)}</div>
        <div aria-live="polite">{result ? <>
          <p className="summary">{s("ราคาป้ายรวม/ชุด", "Combined list price")}: {f.bahtExact(result.listPrice)} · {s("ทุน/ชุด", "Cost per bundle")}: {f.bahtExact(result.cost)} · {s("สต็อกจัดได้", "Stock supports")}: {f.num(result.availableSets)} {s("ชุด", "bundles")}</p>
          <div className="promo-results">{[
            [s("ราคาหลังลด/ชุด", "Promo price per bundle"), f.bahtExact(result.price)],
            [s("กำไร/ชุด", "Profit per bundle"), f.bahtExact(result.unitProfit)],
            [s("กำไรรวมหลังลด", "Total promo profit"), f.bahtExact(result.profit)],
            [s("กำไรรวมเดิม", "Original total profit"), f.bahtExact(result.baselineProfit)]
          ].map(([label, value]) => <div key={label}><span className="muted">{label}</span><strong>{value}</strong></div>)}</div>
          <p className={result.unitProfit <= 0 ? "promo-message text-danger" : "promo-message"}>{result.requiredUnits !== null ? s(`ต้องขาย ${f.num(result.requiredUnits)} ชุด (เพิ่ม ${f.num(result.requiredUnits - Number(sets))}) เพื่อให้ได้กำไรเท่ากับขายชุดฐานที่ราคาป้าย`, `Sell ${f.num(result.requiredUnits)} bundles (${f.num(result.requiredUnits - Number(sets))} extra) to match baseline profit at list price`) : s("ไม่มีเป้าหมายเปรียบเทียบกำไรบวก: ตรวจราคาขายและต้นทุนก่อนจัดโปร", "No positive profit comparison is available. Review price and cost before promoting.")}</p>
          {result.unitProfit <= 0 && <p className="text-danger">{s("ราคาหลังลดไม่เหลือกำไรต่อชุด", "Discounted price leaves no positive profit per bundle.")}</p>}
          {(Number(sets) > result.availableSets || (result.requiredUnits !== null && result.requiredUnits > result.availableSets)) && <p className="text-warn">{s("สต็อกไม่พอสำหรับจำนวนชุดฐานหรือเป้าหมายกำไรเดิม", "Insufficient stock for the baseline or profit-matching target.")}</p>}
        </> : <p className="text-danger">{s("กรอกจำนวนเป็นจำนวนเต็มตั้งแต่ 1 และส่วนลด 0–100%", "Enter whole-number quantities of at least 1 and a discount of 0–100%.")}</p>}</div>
        <p className="muted">{s("เป็นการเปรียบเทียบทางคณิตศาสตร์ ไม่ใช่การคาดการณ์ยอดขาย ยังไม่ปรับราคาหรือตัดสต็อกจริง", "Mathematical comparison, not a sales forecast. No prices or stock are changed.")}</p>
      </> : <p>{s("ต้องมีคู่สินค้าจากบิลก่อนจึงจะทดลองโปรชุดได้", "A product pair from sales history is needed to simulate a bundle.")}</p>}
    </section>
  </section>;
}
