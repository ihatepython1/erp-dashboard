import { useMemo, useState } from "react";
import type { Dataset } from "../data/types";
import { comparisonPeriod, isoDay, monthPeriod, monthlyProducts, parseDay, salesDrivers, summarizeSales, type Dimension, type Metric, type Period } from "../data/salesAnalysis";
import { dayFromParts, parts } from "../lib/days";
import { useI18n, type Keys } from "../lib/i18n";
import { Drawer } from "../components/Overlays";
import { downloadCsv, toCsv } from "../lib/util";

export function SalesAnalysis({ data }: { data: Dataset }) {
  const { lang, f, t } = useI18n();
  const s = (th: string, en: string) => lang === "th" ? th : en;
  const today = parts(data.today);
  const [month, setMonth] = useState(isoDay(data.today).slice(0, 7));
  const [mode, setMode] = useState("previous");
  const [custom, setCustom] = useState(() => {
    const current = monthPeriod(today.year, today.month, data.today), previous = comparisonPeriod(current, "previous", data.today);
    return [isoDay(current.from), isoDay(current.to), isoDay(previous.from), isoDay(previous.to)];
  });
  const [dimension, setDimension] = useState<Dimension>("product");
  const [direction, setDirection] = useState("all");
  const [year, setYear] = useState(today.year);
  const [metric, setMetric] = useState<Metric>("revenue");
  const [relative, setRelative] = useState(false);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<{ sku: string; month: number } | null>(null);
  const firstDay = useMemo(() => data.orders.length ? Math.min(...data.orders.map((o) => o.day)) : data.today, [data]);
  const years = Array.from({ length: today.year - parts(firstDay).year + 1 }, (_, i) => today.year - i);
  const selectedStart = parseDay(`${month}-01`);
  const selectedParts = selectedStart === null ? today : parts(selectedStart);
  const automatic = monthPeriod(selectedParts.year, selectedParts.month, data.today);
  const automaticBefore = comparisonPeriod(automatic, mode === "year" ? "year" : "previous", data.today);
  const parsed = custom.map(parseDay);
  const current: Period = mode === "custom" ? { from: parsed[0] ?? NaN, to: parsed[1] ?? NaN } : automatic;
  const previous: Period = mode === "custom" ? { from: parsed[2] ?? NaN, to: parsed[3] ?? NaN } : automaticBefore;
  const valid = (mode === "custom" || selectedStart !== null) && [current, previous].every((p) => Number.isFinite(p.from) && Number.isFinite(p.to) && p.from <= p.to && p.to <= data.today);
  const totals = useMemo(() => valid ? { now: summarizeSales(data, current), before: summarizeSales(data, previous) } : null, [data, valid, current.from, current.to, previous.from, previous.to]);
  const drivers = useMemo(() => valid ? salesDrivers(data, current, previous, dimension) : [], [data, valid, current.from, current.to, previous.from, previous.to, dimension]);
  const productDrivers = useMemo(() => valid ? salesDrivers(data, current, previous, "product") : [], [data, valid, current.from, current.to, previous.from, previous.to]);
  const heat = useMemo(() => monthlyProducts(data, year), [data, year]);
  const heatRows = heat.rows.filter((r) => [r.product.sku, r.product.name.th, r.product.name.en].some((v) => v.toLowerCase().includes(search.trim().toLowerCase()))).sort((a, b) => b.values.reduce((sum, v) => sum + v[metric], 0) - a.values.reduce((sum, v) => sum + v[metric], 0));
  const maximum = Math.max(1, ...heat.rows.flatMap((r) => r.values.map((v) => Math.abs(v[metric]))));
  const baseline = (values: typeof heat.rows[number]["values"]) => {
    const complete = values.filter((_, i) => heat.months[i]!.complete);
    return complete.length ? complete.reduce((sum, v) => sum + v[metric], 0) / complete.length : 0;
  };
  const deltaText = (now: number, before: number) => before > 0 ? f.signedPct((now - before) / before) : s("ไม่มีฐานบวกสำหรับ %", "No positive base for %");
  const range = (p: Period) => `${f.date(p.from)} – ${f.date(p.to)}`;
  const label = (r: typeof drivers[number]) => dimension === "channel" || dimension === "customerGroup" ? (["wholesale", "shop", "online", "line"].includes(r.id) ? t(`ch_${r.id}` as Keys) : r.label[lang]) : r.label[lang];
  const shownDrivers = drivers.filter((r) => direction === "all" || (direction === "up" ? r.delta > 0 : r.delta < 0));
  const up = productDrivers.filter((r) => r.delta > 0).sort((a, b) => b.delta - a.delta)[0];
  const down = productDrivers.filter((r) => r.delta < 0).sort((a, b) => a.delta - b.delta)[0];
  const selectedProduct = detail ? data.productBySku.get(detail.sku) : undefined;
  const detailPeriod = detail ? monthPeriod(year, detail.month, data.today) : null;
  const detailTotal = detailPeriod && detail ? summarizeSales(data, detailPeriod, detail.sku) : null;
  const detailTrend = detail ? Array.from({ length: 12 }, (_, i) => {
    const p = parts(dayFromParts(year, detail.month - 11 + i, 1));
    const period = monthPeriod(p.year, p.month, data.today);
    return { period, missing: period.from < firstDay, totals: summarizeSales(data, period, detail.sku) };
  }) : [];
  return <section className="sales-analysis">
    <p className="lead">{s("เปรียบเทียบยอดขาย ดูตัวที่ดันยอดขึ้นหรือลง และค้นหาช่วงที่สินค้าแต่ละตัวขายเด่น • ข้อมูลจำลอง", "Compare sales, identify contributors and explore when each product performs best • Demo data")}</p>
    <div className="toolbar">
      <label>{s("เดือนที่วิเคราะห์", "Analysis month")} <input className="field" type="month" value={month} max={isoDay(data.today).slice(0, 7)} disabled={mode === "custom"} onChange={(e) => setMonth(e.target.value)} /></label>
      <label>{s("เปรียบเทียบกับ", "Compare with")} <select className="field" value={mode} onChange={(e) => setMode(e.target.value)}>
        <option value="previous">{s("เดือนก่อน", "Previous month")}</option><option value="year">{s("เดือนเดียวกันปีก่อน", "Same month last year")}</option><option value="custom">{s("กำหนดสองช่วงเอง", "Two custom periods")}</option>
      </select></label>
    </div>
    {mode === "custom" && <div className="analysis-dates">{[s("ช่วงหลัก: เริ่ม", "Current: start"), s("ช่วงหลัก: สิ้นสุด", "Current: end"), s("ช่วงเทียบ: เริ่ม", "Comparison: start"), s("ช่วงเทียบ: สิ้นสุด", "Comparison: end")].map((name, i) => <label key={name}>{name}<input className="field" type="date" max={isoDay(data.today)} value={custom[i]} onChange={(e) => setCustom((v) => v.map((x, j) => j === i ? e.target.value : x))} /></label>)}</div>}
    {!valid ? <p className="text-danger" role="alert">{s("เลือกวันที่ให้ครบ เริ่มก่อนสิ้นสุด และไม่เกินวันที่ข้อมูลล่าสุด", "Choose valid date ranges, with starts before ends and no dates after the data cutoff.")}</p> : totals && <>
      <p className="summary">{range(current)} {s("เทียบ", "vs")} {range(previous)}</p>
      <p className="muted">{s("เดือนที่ยังไม่จบเทียบวันลำดับเดียวกัน เดือนที่จบแล้วเทียบเต็มเดือน • คำนวณจากรายการขายที่ไม่ยกเลิกและไม่เกินวันที่ข้อมูลล่าสุด", "Incomplete months compare matching day numbers; completed months compare in full. Uses non-cancelled sales lines through the data cutoff.")}</p>
      {(current.from < firstDay || previous.from < firstDay) && <p className="text-warn">{s("บางช่วงเริ่มก่อนประวัติที่มี การไม่มีข้อมูลไม่ใช่หลักฐานว่ายอดขายเป็นศูนย์", "A period starts before recorded history. Missing history is not evidence of zero sales.")}</p>}
      {current.to - current.from !== previous.to - previous.from && <p className="text-warn">{s("สองช่วงมีจำนวนวันไม่เท่ากัน โปรดดูยอดเฉลี่ยต่อวันประกอบ", "The periods have different lengths; compare daily averages as well.")}</p>}
      <div className="kpis">{[
        [s("ยอดขาย", "Revenue"), totals.now.revenue, totals.before.revenue, false],
        [s("กำไรขั้นต้น", "Gross profit"), totals.now.profit, totals.before.profit, false],
        [s("จำนวนบิล", "Bills"), totals.now.count, totals.before.count, true],
        [s("ยอดเฉลี่ยต่อบิล", "Average bill"), totals.now.averageBill, totals.before.averageBill, false]
      ].map(([name, n, b, integer]) => <div className="kpi" key={name as string}><span className="kpi-label">{name as string}</span><strong className="kpi-value">{n === null ? "—" : integer ? f.num(n as number) : f.baht(n as number)}</strong><span className="kpi-note">{s("เดิม", "Before")} {b === null ? "—" : integer ? f.num(b as number) : f.baht(b as number)} · {n === null || b === null ? "—" : deltaText(n as number, b as number)}</span></div>)}</div>
      <p className="summary">{s("ยอดขายเฉลี่ย/วัน", "Daily revenue")}: {f.baht(totals.now.revenue / (current.to - current.from + 1))} / {f.baht(totals.before.revenue / (previous.to - previous.from + 1))} · {s("มาร์จินหลัก / ช่วงเทียบ", "Current / comparison margin")}: {totals.now.margin === null ? "—" : f.pct(totals.now.margin)} / {totals.before.margin === null ? "—" : f.pct(totals.before.margin)}</p>
      <section className="panel analysis-summary">
        <header className="panel-head"><h2>{s("สรุปจากตัวเลข", "Evidence-based summary")}</h2><span className="chip">{s("คำนวณตามกฎ ไม่ใช้โมเดล", "Rule-based, no model")}</span></header>
        <p>{s("ยอดขายเปลี่ยน", "Revenue change")}: {f.baht(totals.now.revenue - totals.before.revenue)} · {s("กำไรขั้นต้นเปลี่ยน", "Gross profit change")}: {f.baht(totals.now.profit - totals.before.profit)}</p>
        {up && <p>{s("สินค้าที่เพิ่มยอดมากที่สุด", "Largest positive contributor")}: <b>{up.label[lang]}</b> (+{f.baht(up.delta)})</p>}
        {down && <p>{s("สินค้าที่ฉุดยอดมากที่สุด", "Largest negative contributor")}: <b>{down.label[lang]}</b> ({f.baht(down.delta)})</p>}
        {totals.now.revenue > totals.before.revenue && totals.now.profit < totals.before.profit && <p className="text-warn">{s("ยอดขายเพิ่มแต่กำไรลด ควรตรวจส่วนลด ต้นทุน และสัดส่วนสินค้าที่ขาย", "Revenue rose while profit fell. Review discounts, costs and the mix of products sold.")}</p>}
        {!totals.now.count && <p>{s("ไม่พบบิลในช่วงหลัก จึงยังอธิบายแนวโน้มไม่ได้", "No bills in the current period; a trend cannot be established.")}</p>}
        <p className="muted">{s("ผลต่างบอกว่าส่วนใดเปลี่ยน แต่ยังยืนยันสาเหตุจากอากาศ โปรโมชั่น หรือของขาดไม่ได้ ต้องมีข้อมูลประกอบ", "Contributions show what changed, not whether weather, promotions or stockouts caused it. Additional evidence is needed.")}</p>
      </section>
      <section className="panel">
        <header className="panel-head"><h2>{s("อะไรทำให้ยอดเปลี่ยน", "What contributed to the change")}</h2>
          <button className="btn" onClick={() => downloadCsv("sales-comparison.csv", toCsv(["dimension", "name", "current_from", "current_to", "previous_from", "previous_to", "revenue_current", "revenue_before", "change", "units_current", "units_before", "profit_current", "profit_before"], shownDrivers.map((r) => [dimension, label(r), isoDay(current.from), isoDay(current.to), isoDay(previous.from), isoDay(previous.to), r.now, r.before, r.delta, r.qtyNow, r.qtyBefore, r.profitNow, r.profitBefore])))}>{s("ส่งออก CSV", "Export CSV")}</button>
        </header>
        <div className="toolbar"><select className="field" aria-label={s("แยกตาม", "Group by")} value={dimension} onChange={(e) => setDimension(e.target.value as Dimension)}>{(["product", "category", "channel", "customerGroup", "customer"] as const).map((v, i) => <option key={v} value={v}>{[s("สินค้า", "Product"), s("หมวดสินค้า", "Category"), s("ช่องทางขาย", "Sales channel"), s("กลุ่มลูกค้า (ช่องทางประจำ)", "Customer group (usual channel)"), s("ลูกค้า", "Customer")][i]}</option>)}</select>
          <select className="field" aria-label={s("ทิศทางยอดขาย", "Change direction")} value={direction} onChange={(e) => setDirection(e.target.value)}><option value="all">{s("ทั้งหมด", "All")}</option><option value="up">{s("ยอดเพิ่ม", "Increases")}</option><option value="down">{s("ยอดลด", "Decreases")}</option></select>
        </div>
        <p className="muted">{s("เรียงตามขนาดผลต่างยอดขาย จำนวนขายเป็นหน่วยตามสินค้า ราคาขายเฉลี่ยรวมส่วนลดและสัดส่วนช่องทาง จึงไม่ใช่การเปลี่ยนราคาป้ายอย่างเดียว", "Ranked by absolute revenue change. Quantities use product selling units; average prices include discounts and channel mix, not just list-price changes.")}</p>
        <div className="analysis-scroll"><table className="lines analysis-table"><thead><tr>{[s("รายการ", "Item"), s("ยอดเดิม → ใหม่", "Revenue before → now"), s("ผลต่าง", "Change"), s("จำนวนเดิม → ใหม่", "Units before → now"), s("ราคาเฉลี่ยเดิม → ใหม่", "Avg price before → now"), s("กำไรเดิม → ใหม่", "Profit before → now")].map((v) => <th key={v}>{v}</th>)}</tr></thead><tbody>{shownDrivers.map((r) => <tr key={r.id}><td>{label(r)}</td><td>{f.baht(r.before)} → {f.baht(r.now)}</td><td className={r.delta < 0 ? "text-danger" : "text-good"}>{r.delta > 0 ? "+" : ""}{f.baht(r.delta)}<small>{deltaText(r.now, r.before)}</small>{dimension === "product" && r.volumeEffect !== null && <small>{s("ปริมาณ", "Volume")}: {f.baht(r.volumeEffect)} · {s("ราคา/ส่วนผสม", "Price/mix")}: {f.baht(r.priceEffect!)}</small>}</td><td>{f.num(r.qtyBefore)} → {f.num(r.qtyNow)}</td><td>{r.priceBefore === null ? "—" : f.bahtExact(r.priceBefore)} → {r.priceNow === null ? "—" : f.bahtExact(r.priceNow)}</td><td>{f.baht(r.profitBefore)} → {f.baht(r.profitNow)}</td></tr>)}</tbody></table></div>
        {!shownDrivers.length && <p>{s("ไม่มีรายการตามเกณฑ์", "No matching rows")}</p>}
        <p className="muted">{s("ผลจากปริมาณ = จำนวนที่เปลี่ยน × ราคาเฉลี่ยเดิม; ผลจากราคา/ส่วนผสม = ราคาเฉลี่ยที่เปลี่ยน × จำนวนใหม่ คำนวณเฉพาะสินค้าที่ขายทั้งสองช่วง", "Volume effect = quantity change × old average price; price/mix effect = average price change × new quantity. Calculated only for products sold in both periods.")}</p>
      </section>
    </>}
    <section className="panel analysis-heat">
      <header className="panel-head"><h2>{s("ปฏิทินสินค้าขายดี", "Product sales calendar")}</h2></header>
      <div className="toolbar"><select className="field" aria-label={s("ปีของตาราง", "Calendar year")} value={year} onChange={(e) => { setYear(Number(e.target.value)); setDetail(null); }}>{years.map((y) => <option key={y} value={y}>{lang === "th" ? y + 543 : y}</option>)}</select>
        <select className="field" aria-label={s("ตัวชี้วัด", "Calendar metric")} value={metric} onChange={(e) => setMetric(e.target.value as Metric)}><option value="revenue">{s("ยอดขาย", "Revenue")}</option><option value="qty">{s("จำนวนขาย", "Units sold")}</option><option value="profit">{s("กำไรขั้นต้น", "Gross profit")}</option></select>
        <select className="field" aria-label={s("รูปแบบสี", "Color scale")} value={relative ? "relative" : "absolute"} onChange={(e) => setRelative(e.target.value === "relative")}><option value="absolute">{s("ยอดจริง", "Actual totals")}</option><option value="relative">{s("เทียบค่าเฉลี่ยของสินค้านั้น", "Relative to own average")}</option></select>
        <input className="field grow" type="search" aria-label={s("ค้นหาในปฏิทิน", "Search calendar")} placeholder={s("ชื่อหรือรหัสสินค้า", "Name or SKU")} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <p className="muted">{relative ? s("สีเทียบกับค่าเฉลี่ยเดือนที่ครบในปีที่เลือก: 1× = ปกติ, 2× = สองเท่า สีเข้มสุดตั้งแต่ 2× • หากค่าเฉลี่ยไม่เป็นบวกจะแสดง —", "Relative to the product’s average across complete months in this year: 1× = average, 2× = double; darkest at 2×. No positive average is shown as —.") : s("สีเข้ม = ค่าสูงเมื่อเทียบกับทุกสินค้าในปีนี้ สีแดง = กำไรติดลบ หน่วยขายต่างกันตามสินค้า", "Darker = higher value across all products in this year. Red = negative profit. Selling units differ by product.")}</p>
      <p className="muted">{s("* เดือนที่ข้อมูลยังไม่ครบ · — ไม่มีประวัติครอบคลุมหรือเป็นอนาคต · กดช่องเพื่อดูรายละเอียด รูปแบบที่พบยังไม่ยืนยันฤดูกาลที่เกิดซ้ำ", "* Incomplete month · — Outside recorded history or future · Select a cell for details. Observed patterns do not establish recurring seasonality.")}</p>
      <div className="analysis-scroll"><table className="heat-table"><thead><tr><th>{s("สินค้า", "Product")}</th>{heat.months.map((m, i) => <th key={i}>{f.month(i)}{m.available && !m.complete ? "*" : ""}</th>)}</tr></thead><tbody>{heatRows.map((r) => { const average = baseline(r.values); return <tr key={r.product.sku}><th>{r.product.name[lang]}</th>{r.values.map((v, i) => {
        const available = heat.months[i]!.available, ratio = relative ? average > 0 ? v[metric] / average : null : v[metric];
        const intensity = ratio === null ? 0 : Math.min(1, Math.abs(ratio) / (relative ? 2 : maximum));
        const text = !available || ratio === null ? "—" : relative ? `${f.num1(ratio)}×` : metric === "qty" ? f.num(v.qty) : f.bahtCompact(v[metric]);
        return <td key={i}><button disabled={!available} title={`${r.product.name[lang]} · ${f.month(i)} · ${metric === "qty" ? f.num(v.qty) : f.bahtExact(v[metric])}`} aria-label={`${r.product.name[lang]}, ${f.month(i)}: ${text}`} onClick={() => setDetail({ sku: r.product.sku, month: i + 1 })} style={{ background: `color-mix(in srgb, var(${v[metric] < 0 ? "--danger" : "--accent"}) ${Math.round(intensity * 32)}%, var(--surface))` }}>{text}</button></td>;
      })}</tr>; })}</tbody></table></div>
      {!heatRows.length && <p>{s("ไม่พบสินค้า", "No matching products")}</p>}
    </section>
    <Drawer open={!!detail} title={selectedProduct?.name[lang] ?? ""} onClose={() => setDetail(null)}>
      {detailTotal && detailPeriod && <><p>{range(detailPeriod)}</p><dl className="facts"><div><dt>{s("ยอดขาย", "Revenue")}</dt><dd>{f.bahtExact(detailTotal.revenue)}</dd></div><div><dt>{s("กำไรขั้นต้น", "Gross profit")}</dt><dd>{f.bahtExact(detailTotal.profit)}</dd></div><div><dt>{s("จำนวนขาย", "Units sold")}</dt><dd>{f.num(detailTotal.qty)}</dd></div><div><dt>{s("บิลที่มีสินค้านี้", "Bills containing this product")}</dt><dd>{f.num(detailTotal.count)}</dd></div></dl>
        <h3>{s("แนวโน้มย้อนหลัง 12 เดือนถึงเดือนที่เลือก", "12-month history ending in the selected month")}</h3>
        <table className="lines"><thead><tr><th>{s("เดือน", "Month")}</th><th>{s("ยอดขาย", "Revenue")}</th><th>{s("กำไร", "Profit")}</th><th>{s("จำนวน", "Units")}</th></tr></thead><tbody>{detailTrend.map((r) => <tr key={r.period.from}><td>{f.date(r.period.from)}{r.period.to === data.today ? "*" : ""}</td><td>{r.missing ? "—" : f.baht(r.totals.revenue)}</td><td>{r.missing ? "—" : f.baht(r.totals.profit)}</td><td>{r.missing ? "—" : f.num(r.totals.qty)}</td></tr>)}</tbody></table>
        <p className="muted">{s("* ข้อมูลถึงวันล่าสุดในระบบ ไม่ใช่ยอดเต็มเดือน • ไม่มีข้อมูลสต็อกย้อนหลังเพียงพอที่จะสรุปว่าขายน้อยเพราะของขาด", "* Through the data cutoff, not necessarily a full month. Historical stock data is insufficient to attribute low sales to stockouts.")}</p></>}
    </Drawer>
  </section>;
}
