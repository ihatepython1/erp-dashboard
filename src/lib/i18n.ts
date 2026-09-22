// Thai and English strings. The `Keys` type is derived from the Thai table, so
// a key missing from English is a compile error rather than a blank label.
import { createContext, useContext } from "react";
import { toDate } from "./days";

const th = {
  appName: "กาดหลวง เทรดดิ้ง",
  appTag: "ค้าส่งสินค้าอุปโภคบริโภค ลำปาง",
  nav_overview: "ภาพรวม",
  nav_orders: "ใบสั่งขาย",
  nav_inventory: "สินค้าคงคลัง",
  nav_receivables: "ลูกหนี้",
  asOf: "ข้อมูล ณ",
  search: "ค้นหา",
  searchHint: "ค้นหาหน้า ลูกค้า ใบสั่งขาย หรือสินค้า",
  noResults: "ไม่พบรายการที่ตรงกัน ลองพิมพ์ชื่อหรือรหัสให้สั้นลง",
  theme: "สลับโหมดสี",
  language: "English",

  kpi_revenue: "ยอดขายเดือนนี้",
  kpi_margin: "กำไรขั้นต้น",
  kpi_orders: "จำนวนใบสั่งขาย",
  kpi_overdue: "ลูกหนี้เกินกำหนด",
  vsLastMonth: "เทียบช่วงเดียวกันเดือนก่อน",
  points: "จุด",
  customersLate: "ลูกค้า {n} ราย",

  chart_title: "ยอดขายรายเดือน",
  chart_ytd: "ตั้งแต่ต้นปี {v}",
  chart_growth: "{p} จากปีก่อนในช่วงเดียวกัน",

  att_title: "ต้องจัดการวันนี้",
  att_empty: "ไม่มีเรื่องค้าง ทุกอย่างอยู่ในเกณฑ์",
  att_stockout: "สินค้าหมด {n} รายการ",
  att_stockout_amt: "เสียยอดขายราว {v} ต่อวัน",
  att_overdue90: "ค้างชำระเกิน 90 วัน {n} ราย",
  att_overdue90_amt: "รวม {v}",
  att_overLimit: "เกินวงเงินเครดิต {n} ราย",
  att_overLimit_amt: "เกินรวม {v}",
  att_reorder: "ถึงจุดสั่งซื้อ {n} รายการ",
  att_reorder_amt: "ต้นทุนสั่งซื้อที่แนะนำ {v}",
  att_packing: "รอแพ็กส่งวันนี้ {n} ใบ",
  att_packing_amt: "มูลค่า {v}",
  att_open: "ดูรายการ",

  channel_title: "ยอดขายตามช่องทาง",
  province_title: "ยอดขายตามจังหวัด",
  products_title: "สินค้าทำกำไรสูงสุด",
  last30: "30 วันล่าสุด",
  profit: "กำไร",
  margin: "มาร์จิน",

  ch_wholesale: "ค้าส่ง",
  ch_shop: "ร้านค้าปลีก",
  ch_online: "ออนไลน์",
  ch_line: "LINE OA",

  st_packing: "กำลังแพ็ก",
  st_shipped: "จัดส่งแล้ว",
  st_delivered: "ส่งถึงแล้ว",
  st_cancelled: "ยกเลิก",

  col_order: "เลขที่",
  col_date: "วันที่",
  col_customer: "ลูกค้า",
  col_province: "จังหวัด",
  col_channel: "ช่องทาง",
  col_items: "รายการ",
  col_total: "ยอดรวม",
  col_status: "สถานะ",
  col_payment: "การชำระ",
  col_sku: "รหัส",
  col_product: "สินค้า",
  col_category: "หมวด",
  col_onHand: "คงเหลือ",
  col_perDay: "ขาย/วัน",
  col_cover: "พอขายได้",
  col_reorder: "จุดสั่งซื้อ",
  col_suggest: "ควรสั่ง",
  col_supplier: "ผู้ขาย",
  col_terms: "เครดิต",
  col_limit: "วงเงิน",
  col_outstanding: "ค้างชำระ",

  pay_paid: "ชำระแล้ว",
  pay_open: "รอชำระ",
  pay_overdue: "เกินกำหนด {n} วัน",

  all: "ทั้งหมด",
  allStatuses: "ทุกสถานะ",
  allChannels: "ทุกช่องทาง",
  allCategories: "ทุกหมวด",
  range_30: "30 วัน",
  range_90: "90 วัน",
  range_all: "ทั้งหมด",
  exportCsv: "ส่งออก CSV",
  rows: "{n} รายการ",
  totalValue: "รวม {v}",

  orders_title: "ใบสั่งขาย",
  orders_search: "เลขที่ใบสั่งขายหรือชื่อลูกค้า",
  orders_empty: "ไม่มีใบสั่งขายที่ตรงกับตัวกรองนี้ ลองขยายช่วงวันที่หรือล้างคำค้นหา",

  inv_title: "สินค้าคงคลัง",
  inv_search: "ชื่อสินค้า รหัส หรือผู้ขาย",
  inv_state_all: "ทุกสถานะสต็อก",
  inv_state_out: "หมดสต็อก",
  inv_state_low: "ถึงจุดสั่งซื้อ",
  inv_state_ok: "ปกติ",
  inv_value: "มูลค่าสต็อกตามทุน",
  inv_exportReorder: "ส่งออกรายการสั่งซื้อ",
  days: "{n} วัน",
  noSales: "ไม่มียอดขาย",
  inv_empty: "ไม่มีสินค้าที่ตรงกับตัวกรองนี้",

  ar_title: "ลูกหนี้การค้า",
  ar_total: "ค้างรับทั้งหมด",
  ar_only: "เฉพาะ",
  ar_all: "ลูกหนี้ทั้งหมด",
  ar_overdueOnly: "เกินกำหนด",
  ar_d90Only: "เกิน 90 วัน",
  ar_overLimitOnly: "เกินวงเงิน",
  ar_empty: "ไม่มีลูกหนี้ในกลุ่มนี้",
  cash: "เงินสด",
  overLimit: "เกินวงเงิน",
  b_current: "ยังไม่ถึงกำหนด",
  b_d1_30: "1–30 วัน",
  b_d31_60: "31–60 วัน",
  b_d61_90: "61–90 วัน",
  b_d90: "เกิน 90 วัน",

  d_order: "ใบสั่งขาย {id}",
  d_customer: "ลูกค้า",
  d_ordered: "วันที่สั่ง",
  d_due: "ครบกำหนดชำระ",
  d_qty: "จำนวน",
  d_price: "ราคา/หน่วย",
  d_amount: "จำนวนเงิน",
  d_cost: "ต้นทุน",
  d_profit: "กำไรขั้นต้น",
  d_invoices: "ใบแจ้งหนี้ที่ค้างชำระ",
  close: "ปิด",

  cmd_pages: "หน้า",
  cmd_customers: "ลูกค้า",
  cmd_orders: "ใบสั่งขาย",
  cmd_products: "สินค้า"
};

export type Keys = keyof typeof th;

const en: Record<Keys, string> = {
  appName: "Kad Luang Trading",
  appTag: "Consumer goods wholesale, Lampang",
  nav_overview: "Overview",
  nav_orders: "Sales orders",
  nav_inventory: "Inventory",
  nav_receivables: "Receivables",
  asOf: "As of",
  search: "Search",
  searchHint: "Search pages, customers, orders or products",
  noResults: "Nothing matches. Try a shorter name or code.",
  theme: "Switch colour mode",
  language: "ภาษาไทย",

  kpi_revenue: "Revenue this month",
  kpi_margin: "Gross margin",
  kpi_orders: "Sales orders",
  kpi_overdue: "Overdue receivables",
  vsLastMonth: "vs the same days last month",
  points: "pts",
  customersLate: "{n} customers",

  chart_title: "Revenue by month",
  chart_ytd: "{v} year to date",
  chart_growth: "{p} on the same period last year",

  att_title: "Needs attention today",
  att_empty: "Nothing outstanding. Everything is within limits.",
  att_stockout: "{n} products out of stock",
  att_stockout_amt: "about {v} of sales lost per day",
  att_overdue90: "{n} customers over 90 days late",
  att_overdue90_amt: "{v} in total",
  att_overLimit: "{n} customers over their credit limit",
  att_overLimit_amt: "{v} over in total",
  att_reorder: "{n} products at their reorder point",
  att_reorder_amt: "suggested orders cost {v}",
  att_packing: "{n} orders to pack and ship today",
  att_packing_amt: "worth {v}",
  att_open: "Open list",

  channel_title: "Revenue by channel",
  province_title: "Revenue by province",
  products_title: "Most profitable products",
  last30: "Last 30 days",
  profit: "Profit",
  margin: "Margin",

  ch_wholesale: "Wholesale",
  ch_shop: "Retail shops",
  ch_online: "Online",
  ch_line: "LINE OA",

  st_packing: "Packing",
  st_shipped: "Shipped",
  st_delivered: "Delivered",
  st_cancelled: "Cancelled",

  col_order: "Order",
  col_date: "Date",
  col_customer: "Customer",
  col_province: "Province",
  col_channel: "Channel",
  col_items: "Lines",
  col_total: "Total",
  col_status: "Status",
  col_payment: "Payment",
  col_sku: "SKU",
  col_product: "Product",
  col_category: "Category",
  col_onHand: "On hand",
  col_perDay: "Sold/day",
  col_cover: "Cover",
  col_reorder: "Reorder at",
  col_suggest: "Order",
  col_supplier: "Supplier",
  col_terms: "Terms",
  col_limit: "Limit",
  col_outstanding: "Outstanding",

  pay_paid: "Paid",
  pay_open: "Open",
  pay_overdue: "{n} days late",

  all: "All",
  allStatuses: "All statuses",
  allChannels: "All channels",
  allCategories: "All categories",
  range_30: "30 days",
  range_90: "90 days",
  range_all: "All time",
  exportCsv: "Export CSV",
  rows: "{n} rows",
  totalValue: "{v} total",

  orders_title: "Sales orders",
  orders_search: "Order number or customer",
  orders_empty: "No orders match these filters. Widen the date range or clear the search.",

  inv_title: "Inventory",
  inv_search: "Product, SKU or supplier",
  inv_state_all: "All stock levels",
  inv_state_out: "Out of stock",
  inv_state_low: "At reorder point",
  inv_state_ok: "Healthy",
  inv_value: "Stock value at cost",
  inv_exportReorder: "Export reorder list",
  days: "{n} days",
  noSales: "No sales",
  inv_empty: "No products match these filters.",

  ar_title: "Accounts receivable",
  ar_total: "Total outstanding",
  ar_only: "Show",
  ar_all: "All customers",
  ar_overdueOnly: "Overdue",
  ar_d90Only: "Over 90 days",
  ar_overLimitOnly: "Over limit",
  ar_empty: "No customers in this group.",
  cash: "Cash",
  overLimit: "Over limit",
  b_current: "Not yet due",
  b_d1_30: "1–30 days",
  b_d31_60: "31–60 days",
  b_d61_90: "61–90 days",
  b_d90: "Over 90 days",

  d_order: "Order {id}",
  d_customer: "Customer",
  d_ordered: "Ordered",
  d_due: "Payment due",
  d_qty: "Qty",
  d_price: "Unit price",
  d_amount: "Amount",
  d_cost: "Cost",
  d_profit: "Gross profit",
  d_invoices: "Open invoices",
  close: "Close",

  cmd_pages: "Pages",
  cmd_customers: "Customers",
  cmd_orders: "Sales orders",
  cmd_products: "Products"
};

export type Lang = "th" | "en";
export const TABLES: Record<Lang, Record<Keys, string>> = { th, en };

export function makeT(lang: Lang) {
  const table = TABLES[lang];
  return (key: Keys, vars?: Record<string, string | number>) => {
    let s = table[key];
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
    return s;
  };
}

export function makeFormat(lang: Lang) {
  const locale = lang === "th" ? "th-TH" : "en-GB";
  const baht0 = new Intl.NumberFormat(locale, { style: "currency", currency: "THB", currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 });
  const baht2 = new Intl.NumberFormat(locale, { style: "currency", currency: "THB", currencyDisplay: "narrowSymbol", minimumFractionDigits: 2 });
  const num = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const num1 = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const pct = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 });
  const signedPct = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" });
  const compact = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  // th-TH renders the Buddhist-era year (2569), which is what a Thai office expects
  const date = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const dateLong = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const month = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });

  return {
    baht: (v: number) => baht0.format(v),
    bahtExact: (v: number) => baht2.format(v),
    bahtCompact: (v: number) => "฿" + compact.format(v),
    num: (v: number) => num.format(v),
    num1: (v: number) => num1.format(v),
    pct: (v: number) => pct.format(v),
    signedPct: (v: number) => signedPct.format(v),
    date: (day: number) => date.format(toDate(day)),
    dateLong: (day: number) => dateLong.format(toDate(day)),
    month: (m: number) => month.format(new Date(Date.UTC(2025, m, 1)))
  };
}

export interface I18n {
  lang: Lang;
  t: ReturnType<typeof makeT>;
  f: ReturnType<typeof makeFormat>;
}

export const I18nContext = createContext<I18n>({ lang: "th", t: makeT("th"), f: makeFormat("th") });
export const useI18n = () => useContext(I18nContext);
