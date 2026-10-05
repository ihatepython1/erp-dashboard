import { useState, type ReactNode } from "react";
import type { Dataset } from "../data/types";
import { campaignResults, moneyInput, profitBridge, scenario, type Campaign } from "../data/business";
import { comparisonPeriod, isoDay, monthPeriod, parseDay, salesDrivers, summarizeSales, type Dimension } from "../data/salesAnalysis";
import { parts } from "../lib/days";
import { useI18n } from "../lib/i18n";
import { SalesAnalysis } from "./SalesAnalysis";

function useBusinessText() {
  const i = useI18n();
  return { ...i, s: (th: string, en: string) => i.lang === "th" ? th : en };
}
function Field({ label, value, onChange, min = 0, max, step = "any" }: { label: string; value: string; onChange: (v: string) => void; min?: number; max?: number; step?: string }) {
  return <label className="business-field">{label}<input className="field" type="number" min={min} max={max} step={step} value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}
function Box({ label, children }: { label: string; children: ReactNode }) {
  return <div className="business-stat"><span className="muted">{label}</span><strong>{children}</strong></div>;
}

export function Business({ data }: { data: Dataset }) {
  const { s } = useBusinessText();
  const [tab, setTab] = useState(0);
  const tabs = [s("1. ยอดขาย", "1. Sales"), s("2. กำไร / ขาดทุน", "2. Profit / loss"), s("3. ทดลองโปร", "3. Compare offers"), s("4. ผลจริงของโปร", "4. Campaign results")];
  return <section className="business">
    <p className="lead">{s("จากดูยอด → เข้าใจกำไร → ทดลองทางเลือก → วัดผลจริง • ข้อมูลขายจำลอง ค่าใช้จ่ายและแผนที่กรอกเก็บในเบราว์เซอร์นี้", "Sales → profit → scenarios → actual results. Demo sales; entered costs and plans are stored in this browser.")}</p>
    <div className="business-tabs" role="tablist" aria-label={s("เปรียบเทียบธุรกิจ", "Business comparisons")}>{tabs.map((name, i) => <button key={i} role="tab" id={`business-tab-${i}`} aria-selected={tab === i} aria-controls={`business-panel-${i}`} tabIndex={tab === i ? 0 : -1} onClick={() => setTab(i)} onKeyDown={(e) => {
      const next = e.key === "ArrowRight" ? (i + 1) % tabs.length : e.key === "ArrowLeft" ? (i + tabs.length - 1) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
      if (next !== null) { e.preventDefault(); setTab(next); document.getElementById(`business-tab-${next}`)?.focus(); }
    }}>{name}</button>)}</div>
    <details className="panel business-help"><summary>{s("เริ่มจากคำถามที่อยากรู้", "Start with a question")}</summary><div className="toolbar">{[s("ยอดโตเพราะอะไร?", "Why did sales change?"), s("กำไรเหลือจริงเท่าไร?", "What profit remains?"), s("ลดราคาแล้วต้องขายเพิ่มเท่าไร?", "How much more must a discount sell?"), s("โปรที่ทำคุ้มหรือไม่?", "Was the campaign worthwhile?")].map((q, i) => <button className="btn" key={q} onClick={() => setTab(i)}>{q}</button>)}</div><p className="muted">{s("ผู้ช่วยนำทางและสรุปจากสูตรที่ตรวจสอบได้ ยังไม่ใช่แชต AI แบบอิสระ", "Guided questions and summaries use verifiable formulas; this is not a free-form AI chat.")}</p></details>
    {[<SalesAnalysis data={data} />, <Profit data={data} />, <Offers data={data} />, <Campaigns data={data} />].map((panel, i) => <div key={i} hidden={tab !== i} role="tabpanel" id={`business-panel-${i}`} aria-labelledby={`business-tab-${i}`}>{panel}</div>)}
  </section>;
}

function Profit({ data }: { data: Dataset }) {
  const { s, f, lang, t } = useBusinessText();
  const [month, setMonth] = useState(isoDay(data.today).slice(0, 7));
  const [comparison, setComparison] = useState<"previous" | "year">("previous");
  const [dimension, setDimension] = useState<Dimension>("product");
  const [entity, setEntity] = useState("");
  const [costs, setCosts] = useState<Record<string, string>>(() => {
    try { const v: unknown = JSON.parse(localStorage.getItem("erp.business.costs.v1") ?? "{}"); return v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([, n]) => typeof n === "string")) : {}; } catch { return {}; }
  });
  const [saved, setSaved] = useState("");
  const day = parseDay(`${month}-01`);
  if (day === null) return <section className="panel"><p>{s("เลือกเดือนให้ถูกต้อง", "Choose a valid month")}</p><input aria-label={s("เดือนกำไร", "Profit month")} type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></section>;
  const p = parts(day), current = monthPeriod(p.year, p.month, data.today), before = comparisonPeriod(current, comparison, data.today);
  const valid = current.from <= current.to;
  const n = summarizeSales(data, current), b = summarizeSales(data, before);
  const bridge = profitBridge(data, current, before);
  const rows = salesDrivers(data, current, before, dimension).sort((a, b) => b.profitNow - a.profitNow);
  const names = [s("ค่าธรรมเนียมขาย", "Selling fees"), s("ค่าส่งที่ร้านออก", "Shop-paid shipping"), s("ค่าโฆษณา", "Advertising"), s("ค่าเช่า / ค่าแรง / ค่าใช้จ่ายอื่น", "Rent / wages / other expenses")];
  const key = `${current.from}:${current.to}`;
  const values = names.map((_, i) => moneyInput(costs[`${key}:${i}`] ?? ""));
  const net = values.every((v) => v !== null) ? n.profit - values.reduce<number>((sum, v) => sum + v!, 0) : null;
  const contribution = values.slice(0, 3).every((v) => v !== null) ? n.profit - values.slice(0, 3).reduce<number>((sum, v) => sum + v!, 0) : null;
  const groupLabel = (r: typeof rows[number]) => dimension === "channel" ? t(`ch_${r.id}` as "ch_shop") : r.label[lang];
  const group = rows.find((r) => r.id === entity) ?? rows[0];
  const groupKey = `${key}:${before.from}:${before.to}:${dimension}:${group?.id}`;
  const directBefore = moneyInput(costs[`${groupKey}:before`] ?? ""), directNow = moneyInput(costs[`${groupKey}:now`] ?? "");
  return <div className="business-stack">
    <section className="panel"><h2>{s("กำไรเหลือเท่าไร และเปลี่ยนเพราะอะไร", "What profit remains, and why it changed")}</h2><div className="toolbar"><label>{s("เดือนกำไร", "Profit month")} <input className="field" type="month" max={isoDay(data.today).slice(0, 7)} value={month} onChange={(e) => setMonth(e.target.value)} /></label><select className="field" aria-label={s("เทียบกำไรกับ", "Profit comparison")} value={comparison} onChange={(e) => setComparison(e.target.value as "previous" | "year")}><option value="previous">{s("เดือนก่อน", "Previous month")}</option><option value="year">{s("เดือนเดียวกันปีก่อน", "Same month last year")}</option></select></div>
      {!valid ? <p role="alert">{s("ยังไม่มีข้อมูลเดือนอนาคต", "Future month is unavailable")}</p> : <><p>{f.date(current.from)} – {f.date(current.to)} · {s("เทียบ", "vs")} {f.date(before.from)} – {f.date(before.to)}</p>
      {(before.from < data.orders.reduce((min,o) => Math.min(min,o.day),data.today)) && <p className="text-warn">{s("ช่วงเทียบเริ่มก่อนข้อมูลที่มี จึงไม่ควรตีความยอดที่หายไปเป็นศูนย์จริง", "The comparison starts before recorded history; missing sales are not known zeros.")}</p>}
      <div className="business-stats"><Box label={s("รายได้จากรายการขาย", "Sales revenue")}>{f.baht(n.revenue)}</Box><Box label={s("ต้นทุนสินค้าที่ขาย", "Cost of goods sold")}>{f.baht(n.cost)}</Box><Box label={s("กำไรขั้นต้น", "Gross profit")}>{f.baht(n.profit)}</Box></div>
      <p className="muted">{s("ราคาขายในบิลรวมส่วนลดแล้ว ข้อมูลนี้ยังไม่มีรายการคืนสินค้าแยก จึงไม่ใช่งบการเงินหรือกำไรสุทธิทางบัญชี", "Recorded prices already include discounts. Separate returns are not available; this is not a financial statement or accounting net profit.")}</p>
      <h3>{s("กรอกค่าใช้จ่ายของช่วงหลักนี้", "Enter costs for the current period")}</h3><p>{s("ช่องว่าง = ยังไม่ทราบ • กรอก 0 เฉพาะเมื่อยืนยันว่าไม่มีค่าใช้จ่ายนั้น", "Blank = unknown. Enter 0 only when you confirm no such expense.")}</p>
      <div className="business-inputs">{names.map((name, i) => <Field key={i} label={name} value={costs[`${key}:${i}`] ?? ""} onChange={(v) => { setCosts({ ...costs, [`${key}:${i}`]: v }); setSaved(""); }} />)}</div>
      <button className="btn" onClick={() => { try { localStorage.setItem("erp.business.costs.v1", JSON.stringify(costs)); setSaved(s("บันทึกค่าใช้จ่ายแล้ว", "Costs saved")); } catch { setSaved(s("บันทึกไม่ได้ ข้อมูลยังอยู่เฉพาะหน้านี้", "Could not save; values remain in this view only")); } }}>{s("บันทึกค่าใช้จ่าย", "Save costs")}</button><span role="status"> {saved}</span>
      <div className="business-stats"><Box label={s("หลังค่าธรรมเนียม ส่งของ และโฆษณา", "After selling costs")}>{contribution === null ? s("ข้อมูลยังไม่ครบ", "Incomplete costs") : f.baht(contribution)}</Box><Box label={s("ผลหลังค่าใช้จ่ายที่กรอก", "Result after entered expenses")}>{net === null ? s("ข้อมูลยังไม่ครบ", "Incomplete costs") : <span className={net < 0 ? "text-danger" : "text-good"}>{net < 0 ? s("ขาดทุน ", "Loss ") : s("กำไร ", "Profit ")}{f.baht(Math.abs(net))}</span>}</Box></div>
      </>}
    </section>
    {valid && <><section className="panel"><h2>{s("สะพานกำไร: จากช่วงเดิมมาสู่ช่วงใหม่", "Profit bridge: previous to current")}</h2><p>{s("กำไรเดิม", "Previous gross profit")} {f.baht(b.profit)} → {s("กำไรใหม่", "Current gross profit")} {f.baht(n.profit)}</p>
      {([ [s("จำนวนขาย / สัดส่วนสินค้า", "Quantity / product mix"), bridge.volume], [s("ราคาขายเฉลี่ย / ส่วนลด / ช่องทาง", "Average prices / discounts / channel mix"), bridge.price], [s("ต้นทุนต่อหน่วย", "Unit cost"), bridge.cost], [s("สินค้าที่มีขายเพียงช่วงเดียว", "Products sold in only one period"), bridge.assortment] ] as [string, number][]).map(([name, value]) => <div className="business-bridge" key={name}><span>{name}</span><span className={value < 0 ? "text-danger" : "text-good"}>{value >= 0 ? "+" : ""}{f.baht(value)}</span><div className="business-track"><i style={{ width: `${Math.max(1, Math.abs(value) / Math.max(1, ...Object.values(bridge).map(Math.abs)) * 100)}%`, background: value < 0 ? "var(--danger)" : "var(--good)" }} /></div></div>)}
      <details><summary>{s("วิธีคำนวณและข้อจำกัด", "Method and limits")}</summary><p>{s("แยกทีละ SKU: ผลจำนวน = จำนวนที่เปลี่ยน × กำไรต่อหน่วยเดิม; ผลราคา = ราคาเฉลี่ยที่เปลี่ยน × จำนวนใหม่; ผลต้นทุน = ต้นทุนเดิมลบใหม่ × จำนวนใหม่ ผลทั้งสี่รวมเท่ากับกำไรขั้นต้นที่เปลี่ยน ไม่รวมค่าใช้จ่ายร้านและยังแยกส่วนลดออกจากช่องทางขายไม่ได้", "Per SKU: quantity effect uses old unit profit; price effect uses new quantity; cost effect uses old minus new cost times new quantity. The four effects reconcile to gross profit change. Store expenses are excluded; discounts cannot be isolated from channel mix.")}</p></details>
    </section><section className="panel"><h2>{s("ใครสร้างยอด ใครสร้างกำไร", "Revenue versus profit")}</h2><select className="field" aria-label={s("มุมกำไร", "Profit dimension")} value={dimension} onChange={(e) => setDimension(e.target.value as Dimension)}><option value="product">{s("สินค้า", "Products")}</option><option value="channel">{s("ช่องทาง", "Channels")}</option><option value="customer">{s("ลูกค้า", "Customers")}</option></select><p className="muted">{s("แสดงกำไรขั้นต้น ยังไม่ปันค่าโฆษณา ค่าส่ง หรือค่าเช่าให้รายสินค้า/ลูกค้า หากไม่มีข้อมูลระบุเจ้าของค่าใช้จ่าย", "Gross profit only. Shared costs are not allocated to products or customers without attribution data.")}</p><div className="analysis-scroll"><table className="lines"><thead><tr>{[s("รายการ", "Item"),s("ยอดขาย", "Revenue"),s("กำไรขั้นต้น", "Gross profit"),s("มาร์จิน", "Margin"),s("กำไรเปลี่ยน", "Profit change")].map((x) => <th key={x}>{x}</th>)}</tr></thead><tbody>{rows.map((r) => <tr key={r.id}><td>{groupLabel(r)}</td><td>{f.baht(r.now)}</td><td className={r.profitNow < 0 ? "text-danger" : ""}>{f.baht(r.profitNow)}</td><td>{r.now > 0 ? f.pct(r.profitNow / r.now) : "—"}</td><td>{f.baht(r.profitNow-r.profitBefore)}</td></tr>)}</tbody></table></div></section></>}
    {valid && group && <section className="panel"><h2>{s("เปรียบเทียบหลังต้นทุนขายที่ระบุได้", "Compare after attributable selling costs")}</h2><label className="business-field">{s("เลือกรายการจากมุมกำไรด้านบน", "Choose an item from the profit dimension above")}<select className="field" value={group.id} onChange={(e) => setEntity(e.target.value)}>{rows.map((r) => <option key={r.id} value={r.id}>{groupLabel(r)}</option>)}</select></label><p>{s("รวมเฉพาะค่าธรรมเนียม ค่าส่ง โฆษณา และต้นทุนบริการที่ผูกกับรายการนี้ได้ ไม่รวมส่วนลดซ้ำหรือปันค่าเช่าโดยไม่มีหลักเกณฑ์", "Include only fees, shipping, ads and service costs attributable to this item. Do not deduct recorded discounts again or arbitrarily allocate rent.")}</p><div className="business-inputs"><Field label={s("ต้นทุนขายเพิ่มเติมช่วงเดิม", "Previous attributable costs")} value={costs[`${groupKey}:before`] ?? ""} onChange={(v) => setCosts({ ...costs,[`${groupKey}:before`]:v })} /><Field label={s("ต้นทุนขายเพิ่มเติมช่วงใหม่", "Current attributable costs")} value={costs[`${groupKey}:now`] ?? ""} onChange={(v) => setCosts({ ...costs,[`${groupKey}:now`]:v })} /></div><div className="business-stats"><Box label={s("ผลหลังต้นทุนขายเดิม", "Previous contribution")}>{directBefore === null ? "—" : f.baht(group.profitBefore-directBefore)}</Box><Box label={s("ผลหลังต้นทุนขายใหม่", "Current contribution")}>{directNow === null ? "—" : f.baht(group.profitNow-directNow)}</Box><Box label={s("ผลต่าง", "Change")}>{directBefore === null || directNow === null ? s("รอข้อมูล", "Awaiting costs") : f.baht(group.profitNow-directNow-group.profitBefore+directBefore)}</Box></div><button className="btn" onClick={() => { try { localStorage.setItem("erp.business.costs.v1",JSON.stringify(costs)); setSaved(s("บันทึกแล้ว", "Saved")); } catch { setSaved(s("บันทึกไม่สำเร็จ", "Save failed")); } }}>{s("บันทึกต้นทุนรายรายการ", "Save attributable costs")}</button><span role="status"> {saved}</span><p className="muted">{s("ข้อมูลนี้ใช้เปรียบเทียบรายการที่เลือก ไม่บวกหักซ้ำกับค่าใช้จ่ายรวมด้านบน", "These costs compare the selected item and are not deducted again from the overall expense calculation.")}</p></section>}
  </div>;
}

function Offers({ data }: { data: Dataset }) {
  const { s, f, lang } = useBusinessText();
  const [sku, setSku] = useState(data.products[0]?.sku ?? ""), [second, setSecond] = useState(data.products[1]?.sku ?? "");
  const a = data.productBySku.get(sku)!, b = data.productBySku.get(second)!;
  const [units, setUnits] = useState("100"), [discount, setDiscount] = useState("10"), [fee, setFee] = useState("0"), [shipping, setShipping] = useState("0"), [ads, setAds] = useState("0"), [priceDelta, setPriceDelta] = useState("2");
  const [counts, setCounts] = useState(["100", "150", "50", "100", "95"]);
  if (!a || !b) return <p>{s("ยังไม่มีสินค้า", "No products available")}</p>;
  const baseUnits = moneyInput(units), pct = moneyInput(discount), fees = moneyInput(fee), ship = moneyInput(shipping), ad = moneyInput(ads), delta = priceDelta.trim() ? Number(priceDelta) : NaN;
  const commonValid = baseUnits !== null && Number.isSafeInteger(baseUnits) && baseUnits > 0 && pct !== null && pct <= 100 && fees !== null && fees <= 100 && ship !== null && ad !== null && Number.isFinite(delta);
  const labels = [s("ราคาเดิม", "Regular price"),s("ลดราคา", "Discount"),s("ซื้อ 1 แถม 1", "Buy 1 get 1"),s("ชุด A + B", "A + B bundle"),s("ปรับราคา", "Price change")];
  const simulations = labels.map((label, i) => {
    const sold = moneyInput(counts[i] ?? "");
    const price = i === 3 ? a.price + b.price : i === 4 ? a.price + delta : a.price;
    const cost = i === 3 ? a.cost + b.cost : a.cost;
    const result = commonValid && sold !== null && (i !== 3 || a.sku !== b.sku) ? scenario({ price, cost, units: sold, discount: i === 1 || i === 3 ? pct! : 0, free: i === 2, fee: fees!, shipping: ship!, ads: i === 0 ? 0 : ad! }) : null;
    const baseline = commonValid ? scenario({ price: i === 3 ? a.price + b.price : a.price, cost, units: baseUnits!, discount: 0, free: false, fee: fees!, shipping: ship!, ads: 0 }) : null;
    const target = result && baseline && result.contributionPerSale > 0 && baseline.profit > 0 ? Math.ceil((baseline.profit + (i === 0 ? 0 : ad!)) / result.contributionPerSale) : null;
    const stock = i === 3 ? Math.min(a.onHand, b.onHand) : i === 2 ? Math.floor(a.onHand / 2) : a.onHand;
    return { label, result, baseline, target, stock, sold };
  });
  return <div className="business-stack"><section className="panel"><h2>{s("ทดลองหลายโปรบนสมมุติฐานเดียวกัน", "Compare offers with explicit assumptions")}</h2><p>{s("ยอดขายทุกทางเลือกเป็นตัวเลขที่คุณตั้ง ไม่ใช่ AI พยากรณ์ • หน่วยขายตามสินค้า เช่น แพ็คหรือลัง", "Sales quantities are your assumptions, not AI forecasts. Units follow the product, such as packs or cartons.")}</p><div className="business-inputs">
    <label className="business-field">{s("สินค้า A", "Product A")}<select className="field" value={sku} onChange={(e) => setSku(e.target.value)}>{data.products.map((p) => <option key={p.sku} value={p.sku}>{p.name[lang]}</option>)}</select></label><label className="business-field">{s("สินค้า B สำหรับโปรชุด", "Product B for bundle")}<select className="field" value={second} onChange={(e) => setSecond(e.target.value)}>{data.products.map((p) => <option key={p.sku} value={p.sku}>{p.name[lang]}</option>)}</select></label>
    <Field label={s("ยอดขายฐานที่ราคาเดิม", "Baseline regular-price units")} value={units} onChange={setUnits} min={1} step="1" /><Field label={s("ส่วนลด (%)", "Discount (%)")} value={discount} onChange={setDiscount} max={100} />
    <Field label={s("ค่าธรรมเนียมรายได้ (%)", "Revenue fee (%)")} value={fee} onChange={setFee} max={100} /><Field label={s("ค่าส่งต่อหน่วยที่จ่ายเงิน / ต่อชุด", "Shipping per paid unit / bundle")} value={shipping} onChange={setShipping} />
    <Field label={s("งบโฆษณาต่อทางเลือกโปร", "Advertising per offer")} value={ads} onChange={setAds} /><Field label={s("ปรับราคา A เพิ่ม/ลด (บาท)", "Change A price by (THB)")} value={priceDelta} onChange={setPriceDelta} min={-a.price} />
    </div><p className="muted">A: {f.bahtExact(a.price)} / {s("ทุน", "cost")} {f.bahtExact(a.cost)} · B: {f.bahtExact(b.price)} / {s("ทุน", "cost")} {f.bahtExact(b.cost)}</p></section>
    <div className="offer-grid">{simulations.map((v, i) => <article className="panel" key={v.label}><h3>{v.label}</h3><Field label={s(`ยอดคาด ${v.label} (${i === 2 || i === 3 ? "ชุด" : "หน่วย"})`, `Expected ${v.label} (${i === 2 || i === 3 ? "bundles" : "units"})`)} value={counts[i]!} onChange={(x) => setCounts(counts.map((c, j) => j === i ? x : c))} min={1} step="1" />{v.result && v.baseline ? <><dl className="offer-facts"><div><dt>{s("รายได้", "Revenue")}</dt><dd>{f.baht(v.result.revenue)}</dd></div><div><dt>{s("กำไรขั้นต้น", "Gross profit")}</dt><dd>{f.baht(v.result.gross)}</dd></div><div><dt>{s("หลังค่าขายและโฆษณา", "After selling costs and ads")}</dt><dd className={v.result.profit < 0 ? "text-danger" : "text-good"}>{f.baht(v.result.profit)}</dd></div><div><dt>{s("ต่างจากฐาน", "Versus baseline")}</dt><dd>{f.baht(v.result.profit - v.baseline.profit)}</dd></div></dl><p>{s("ต้องขายเพื่อได้กำไรเท่าฐาน", "Sales needed to match baseline")}: <b>{v.target === null ? "—" : f.num(v.target)}</b></p><p className="muted">{s("ฐานกำไร", "Baseline profit")}: {f.baht(v.baseline.profit)}{i === 3 ? s(" (ขาย A+B อย่างละหนึ่ง ไม่ลดราคา)", " (one A + one B at full price)") : ""}</p>{i === 2 && <p>{s("ส่งมอบสินค้า", "Delivered units")}: {f.num(v.result.delivered)}</p>}{(v.sold! > v.stock || (v.target !== null && v.target > v.stock)) && <p className="text-warn">{s("สต็อกไม่พอต่อยอดคาดหรือเป้ากำไร", "Stock is insufficient for expected sales or the profit target")}</p>}{v.result.contributionPerSale <= 0 && <p className="text-danger">{s("ขายเพิ่มไม่ช่วยชดเชย เพราะกำไรต่อการขายไม่เป็นบวก", "More sales cannot recover costs: unit contribution is not positive.")}</p>}</> : <p role="alert" className="text-danger">{s("ตรวจตัวเลข: จำนวนเต็มบวก ราคา > 0 ส่วนลด/ค่าธรรมเนียม 0–100 และเลือก A/B ต่างกัน", "Check inputs: positive whole units, positive price, percentages 0–100, and different A/B products.")}</p>}</article>)}</div>
    <p className="panel">{s("โปรชุดใช้สินค้าสองตัว จึงเทียบกับฐาน A+B ของตัวเอง ไม่จัดอันดับผู้ชนะจากยอดกำไรดิบข้ามฐาน และยังไม่รวมค่าใช้จ่ายประจำร้าน", "Bundles have their own A+B baseline. Raw profits across different baselines are not ranked as a winner. Fixed store expenses are excluded.")}</p>
  </div>;
}

function Campaigns({ data }: { data: Dataset }) {
  const { s, f, lang } = useBusinessText();
  const [records, setRecords] = useState<Campaign[]>(() => {
    try { const v: unknown = JSON.parse(localStorage.getItem("erp.business.campaigns.v1") ?? "[]"); return Array.isArray(v) ? v.filter((c): c is Campaign => c && typeof c.id === "string" && typeof c.name === "string" && typeof c.sku === "string" && typeof c.note === "string" && [c.from,c.to,c.budget,c.target].every(Number.isFinite) && c.budget >= 0 && c.target >= 0) : []; } catch { return []; }
  });
  const [name, setName] = useState(""), [sku, setSku] = useState(data.products[0]?.sku ?? ""), [from, setFrom] = useState(isoDay(data.today - 27)), [to, setTo] = useState(isoDay(data.today - 14)), [budget, setBudget] = useState(""), [target, setTarget] = useState(""), [note, setNote] = useState(""), [message, setMessage] = useState("");
  const [selected, setSelected] = useState("");
  const c = records.find((r) => r.id === selected) ?? records.at(-1);
  const result = c ? campaignResults(data, c) : null;
  function save() {
    const start = parseDay(from), end = parseDay(to), cost = moneyInput(budget), goal = moneyInput(target);
    if (!name.trim() || start === null || end === null || start > end || end > data.today || end-start >= 366 || cost === null || goal === null) { setMessage(s("กรอกชื่อ ช่วงวันที่จบแล้วไม่เกิน 366 วัน งบ และเป้ากำไรให้ครบ (0 ได้)", "Enter a name, a completed period up to 366 days, cost and profit target (0 is allowed).")); return; }
    const entry: Campaign = { id: crypto.randomUUID(), name: name.trim(), sku, from: start, to: end, budget: cost, target: goal, note };
    const next = [...records, entry];
    try { localStorage.setItem("erp.business.campaigns.v1", JSON.stringify(next)); setRecords(next); setSelected(entry.id); setMessage(s("บันทึกและคำนวณผลจากบิลแล้ว", "Saved and calculated from sales history")); } catch { setMessage(s("บันทึกไม่สำเร็จ พื้นที่จัดเก็บอาจเต็ม", "Save failed; browser storage may be full")); }
  }
  return <div className="business-stack"><section className="panel"><h2>{s("บันทึกโปรที่จบแล้วและตรวจผล", "Record a completed campaign and review results")}</h2><p>{s("ผลจริงในหน้านี้มาจากบิลจำลองของเว็บ การบันทึกแผนไม่สร้างยอดขายใหม่และไม่แก้บิลย้อนหลัง", "Results use this app’s demo sales. Saving a campaign does not create sales or modify historical bills.")}</p><div className="business-inputs"><label className="business-field">{s("ชื่อโปร", "Campaign name")}<input className="field" value={name} onChange={(e) => setName(e.target.value)} /></label><label className="business-field">{s("สินค้าที่ติดตาม", "Tracked product")}<select className="field" value={sku} onChange={(e) => setSku(e.target.value)}>{data.products.map((p) => <option value={p.sku} key={p.sku}>{p.name[lang]}</option>)}</select></label><label className="business-field">{s("เริ่มโปร", "Campaign start")}<input className="field" type="date" max={isoDay(data.today)} value={from} onChange={(e) => setFrom(e.target.value)} /></label><label className="business-field">{s("จบโปร", "Campaign end")}<input className="field" type="date" max={isoDay(data.today)} value={to} onChange={(e) => setTo(e.target.value)} /></label><Field label={s("ค่าโปรเพิ่มเติมรวม (ไม่รวมส่วนลดในบิล)", "Additional campaign costs (exclude discounts in bills)")} value={budget} onChange={setBudget} /><Field label={s("เป้ากำไรหลังค่าโปร", "Target profit after campaign cost")} value={target} onChange={setTarget} /><label className="business-field">{s("รูปแบบโปร เงื่อนไข และเหตุการณ์ประกอบ", "Offer terms and context")}<textarea className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder={s("เช่น ลด 10%, มีสินค้าขาด 2 วัน", "e.g. 10% discount; stockout for two days")} /></label></div><button className="btn" onClick={save}>{s("บันทึกและดูผล", "Save and review")}</button><p role="status">{message}</p></section>
    <section className="panel"><h2>{s("ก่อน → ระหว่าง → หลังโปร", "Before → during → after")}</h2>{!records.length ? <p>{s("ยังไม่มีโปรที่บันทึก กรอกแผนด้านบนเพื่อเริ่มเปรียบเทียบ", "No recorded campaigns. Complete the form above to begin.")}</p> : <><label>{s("เลือกโปร", "Select campaign")} <select className="field" value={c?.id ?? ""} onChange={(e) => setSelected(e.target.value)}>{records.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>{c && <p>{c.note}</p>}{result && c ? <><div className="business-stats">{result.map((r, i) => <Box key={i} label={[s("ก่อนโปร", "Before"),s("ระหว่างโปร", "During"),s("หลังโปร", "After")][i]!}>{!r.available ? s("ยังไม่มีข้อมูล", "Unavailable") : <><span>{f.baht(r.product.profit)}</span><small>{s("กำไรขั้นต้นสินค้า", "Product gross profit")}</small><small>{f.date(r.period.from)} – {f.date(r.period.to)}</small><small>{r.complete ? s("ครบช่วง", "Complete") : s("ข้อมูลไม่ครบช่วง", "Partial period")}</small></>}</Box>)}</div>
      <div className="analysis-scroll"><table className="lines"><thead><tr><th>{s("ตัวชี้วัด", "Metric")}</th>{[s("ก่อน", "Before"),s("ระหว่าง", "During"),s("หลัง", "After")].map((v) => <th key={v}>{v}</th>)}</tr></thead><tbody>{([
        [s("ยอดขายสินค้า/วัน", "Product revenue/day"), (r: NonNullable<typeof result>[number]) => r.product.revenue / Math.max(1,r.days)],
        [s("กำไรสินค้า/วัน", "Product gross profit/day"), (r: NonNullable<typeof result>[number]) => r.product.profit / Math.max(1,r.days)],
        [s("กำไรสินค้าอื่นในหมวด/วัน", "Other products in category: profit/day"), (r: NonNullable<typeof result>[number]) => r.peers.profit / Math.max(1,r.days)],
        [s("กำไรทั้งร้าน/วัน", "Whole-store gross profit/day"), (r: NonNullable<typeof result>[number]) => r.shop.profit / Math.max(1,r.days)]
      ] as [string, (r: NonNullable<typeof result>[number]) => number][]).map(([title, get]) => <tr key={title}><th>{title}</th>{result.map((r, i) => <td key={i}>{r.available ? f.baht(get(r)) : "—"}</td>)}</tr>)}</tbody></table></div>
      <p>{s("กำไรสินค้าช่วงโปรหักค่าโปร", "Campaign product profit minus campaign cost")}: <b>{f.baht(result[1]!.product.profit-c.budget)}</b> · {s("เป้าหมาย", "Target")}: {f.baht(c.target)} · {s("ต่างจากเป้า", "Variance")}: {f.baht(result[1]!.product.profit-c.budget-c.target)}</p>
      {result.every((r) => r.complete) ? <div className="promo-message"><p>{s("ส่วนต่างกำไรสินค้าระหว่างโปรเทียบก่อนโปร หลังหักค่าโปร", "Product profit change during vs before, after campaign cost")}: {f.baht(result[1]!.product.profit-result[0]!.product.profit-c.budget)}</p>{result[1]!.peers.profit < result[0]!.peers.profit && <p>{s("กำไรสินค้าอื่นในหมวดลดลง ควรตรวจว่ามีการย้ายยอดหรือปัจจัยอื่น", "Other products in the category lost profit; check substitution and other factors.")}</p>}{result[2]!.product.profit < result[0]!.product.profit && <p>{s("กำไรหลังโปรต่ำกว่าก่อนโปร ควรตรวจการซื้อตุนหรือความต้องการที่เปลี่ยน", "Post-campaign profit is below the baseline; investigate stockpiling or demand changes.")}</p>}</div> : <p className="text-warn">{s("ยังมีช่วงข้อมูลไม่ครบ จึงยังไม่สรุปความคุ้มของโปร", "Some periods are incomplete; no campaign verdict yet.")}</p>}
      <p className="muted">{s("ใช้ช่วงยาวเท่ากันติดกัน ไม่ใช่กลุ่มควบคุม วันในสัปดาห์ เทศกาล และของขาดอาจต่างกัน ตัวเลขเป็นความเปลี่ยนแปลง ไม่ใช่ผลจากโปรที่พิสูจน์แล้ว และกำไรยังไม่หักค่าใช้จ่ายร้านทั้งหมด", "Adjacent equal-length windows are not a control group. Weekdays, holidays and stockouts may differ. Changes are not proven causal effects; full store expenses are excluded.")}</p>
      </> : <p>{s("ไม่สามารถคำนวณรายการนี้กับข้อมูลปัจจุบัน", "This record cannot be evaluated against current data")}</p>}</>}
    </section>
  </div>;
}

