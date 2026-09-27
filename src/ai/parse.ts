// Turning a question into a filter — never into a number.
//
// The model (when one is reachable) only ever returns an Intent: which page,
// which filters. Every figure the user then sees is computed by the selectors
// in src/data, which are covered by tests. If the interpretation is wrong the
// filters on screen show it plainly, and the user can correct them by hand.
//
// This file is the offline half: a rule engine that reads the same questions
// without any network. It is what runs on GitHub Pages, it is the fallback when
// the API is down, and it is the baseline the model is measured against in
// tests/ai.test.ts.

export type Route = "/orders" | "/inventory" | "/receivables" | "/customers";

export interface Intent {
  route: Route;
  params: Record<string, string>;
  /** Which rules fired — shown to the user so the interpretation is inspectable. */
  matched: string[];
  confidence: number;
  source: "rules" | "model";
}

const PROVINCES: [string, string][] = [
  ["ลำปาง", "Lampang"], ["เชียงใหม่", "Chiang Mai"], ["ลำพูน", "Lamphun"], ["แพร่", "Phrae"],
  ["น่าน", "Nan"], ["พะเยา", "Phayao"], ["เชียงราย", "Chiang Rai"], ["แม่ฮ่องสอน", "Mae Hong Son"],
  ["อุตรดิตถ์", "Uttaradit"], ["ตาก", "Tak"]
];

interface Rule {
  id: string;
  /** Any of these phrases, matched case-insensitively against the raw question. */
  any: string[];
  route?: Route;
  params?: Record<string, string>;
  weight?: number;
}

// Order matters only for the route: the first rule with a route wins.
const RULES: Rule[] = [
  // --- pages -------------------------------------------------------------
  { id: "page.receivables", any: ["ลูกหนี้", "ค้างชำระ", "ค้างจ่าย", "หนี้", "receivable", "debt", "owe", "unpaid"], route: "/receivables" },
  { id: "page.inventory", any: ["สต็อก", "สต๊อก", "คงคลัง", "คงเหลือ", "สินค้าหมด", "ของหมด", "inventory", "stock"], route: "/inventory" },
  { id: "page.customers", any: ["ลูกค้า", "ร้านค้า", "customer", "account", "shop"], route: "/customers" },
  { id: "page.orders", any: ["ใบสั่งขาย", "ออเดอร์", "ออร์เดอร์", "คำสั่งซื้อ", "สั่งซื้อ", "สั่งของ", "บิล", "order", "sale"], route: "/orders" },

  // --- receivables filters ----------------------------------------------
  { id: "ar.overdue", any: ["เกินกำหนด", "เลยกำหนด", "ค้างเกิน", "overdue", "late", "past due"], route: "/receivables", params: { filter: "overdue" }, weight: 2 },
  { id: "ar.d90", any: ["เกิน 90", "เกิน90", "over 90", "90 วัน", "90 days", "90+"], route: "/receivables", params: { filter: "d90" }, weight: 2 },
  { id: "ar.overLimit", any: ["เกินวงเงิน", "เกินเครดิต", "over limit", "over their limit", "credit limit"], route: "/receivables", params: { filter: "overLimit" }, weight: 2 },

  // --- inventory filters -------------------------------------------------
  { id: "inv.out", any: ["ของหมด", "สินค้าหมด", "หมดสต็อก", "หมดสต๊อก", "out of stock", "stockout", "sold out"], route: "/inventory", params: { state: "out" }, weight: 2 },
  { id: "inv.low", any: ["ถึงจุดสั่งซื้อ", "ใกล้หมด", "เหลือน้อย", "ต้องสั่ง", "ควรสั่ง", "reorder", "running low", "low stock"], route: "/inventory", params: { state: "low" }, weight: 2 },

  // --- order filters -----------------------------------------------------
  { id: "ord.packing", any: ["รอแพ็ก", "รอแพ็ค", "ต้องส่งวันนี้", "packing", "to pack", "to ship today"], route: "/orders", params: { status: "packing" }, weight: 2 },
  { id: "ord.shipped", any: ["จัดส่งแล้ว", "ส่งแล้ว", "shipped"], route: "/orders", params: { status: "shipped" }, weight: 2 },
  { id: "ord.cancelled", any: ["ยกเลิก", "cancelled", "canceled"], route: "/orders", params: { status: "cancelled" }, weight: 2 },

  // --- channels ----------------------------------------------------------
  { id: "ch.line", any: ["ทางไลน์", "ผ่านไลน์", "ไลน์ oa", "line oa", "via line", "on line oa"], params: { channel: "line" }, weight: 2 },
  { id: "ch.wholesale", any: ["ค้าส่ง", "ยี่ปั๊ว", "wholesale"], params: { channel: "wholesale" }, weight: 2 },
  { id: "ch.shop", any: ["ร้านค้าปลีก", "ร้านโชห่วย", "retail shop", "retail"], params: { channel: "shop" }, weight: 2 },
  { id: "ch.online", any: ["ออนไลน์", "ช้อปปี้", "online", "shopee", "lazada"], params: { channel: "online" }, weight: 2 },

  // --- customer filters --------------------------------------------------
  { id: "cust.risk", any: ["เสี่ยงหาย", "กำลังจะหาย", "หายไป", "เงียบไป", "ไม่ได้สั่ง", "หยุดสั่ง", "at risk", "churn", "gone quiet", "stopped ordering"], route: "/customers", params: { risk: "1" }, weight: 3 },
  { id: "cust.tierA", any: ["เกรดเอ", "ชั้นเอ", "ลูกค้าชั้นดี", "ลูกค้ารายใหญ่", "tier a", "best customers", "top customers"], route: "/customers", params: { tier: "A" }, weight: 2 },
  { id: "cust.declining", any: ["ยอดตก", "ยอดลด", "ซื้อน้อยลง", "สั่งน้อยลง", "declining", "buying less", "shrinking"], route: "/customers", params: { trend: "down" }, weight: 2 },
  { id: "cust.tasks", any: ["ต้องตามงาน", "งานค้าง", "ต้องติดตาม", "follow up", "follow-up", "open tasks"], route: "/customers", params: { tasks: "open" }, weight: 2 },

  // --- time ranges (orders only) -----------------------------------------
  { id: "range.90", any: ["90 วัน", "90วัน", "สามเดือน", "3 เดือน", "90 days", "three months"], params: { range: "90" } },
  { id: "range.all", any: ["ทั้งหมด", "ทุกช่วง", "ย้อนหลังทั้งหมด", "all time", "ever", "all orders"], params: { range: "all" } }
];

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Which filters each page understands. Anything else is discarded. */
export const ALLOWED: Record<Route, string[]> = {
  "/orders": ["status", "channel", "range", "prov", "q", "open"],
  "/inventory": ["state", "q"],
  "/receivables": ["filter", "prov"],
  "/customers": ["risk", "tier", "trend", "tasks", "prov", "channel", "q", "customer"]
};

/**
 * Read a question and return the view that answers it, or null when nothing
 * recognisable is in it. Returning null is a feature: a wrong guess is worse
 * than "I did not understand that".
 */
export function parseQuestion(question: string): Intent | null {
  const q = norm(question);
  if (q.length < 3) return null;

  // an order number anywhere in the question opens that order directly
  const orderNo = question.match(/so\d{2}-\d{4,6}/i);
  if (orderNo) {
    return { route: "/orders", params: { open: orderNo[0].toUpperCase(), range: "all" },
             matched: ["order.id"], confidence: 0.95, source: "rules" };
  }

  const matched: string[] = [];
  const params: Record<string, string> = {};
  // score per candidate page rather than taking the first page word: a specific
  // filter ("เกินวงเงิน") should beat a generic noun ("ลูกค้า") in the same sentence
  const routeScore = new Map<Route, number>();
  const bump = (r: Route, n: number) => routeScore.set(r, (routeScore.get(r) ?? 0) + n);

  for (const rule of RULES) {
    if (!rule.any.some((phrase) => q.includes(norm(phrase)))) continue;
    matched.push(rule.id);
    if (rule.route) bump(rule.route, rule.weight ?? 1);
    if (rule.params) Object.assign(params, rule.params);
  }

  for (const [th, en] of PROVINCES) {
    if (q.includes(th) || q.includes(norm(en))) {
      params.prov = en;
      matched.push("province." + en);
      break;
    }
  }

  // with no page named at all, the filters themselves imply where to go
  if (routeScore.size === 0) {
    if (params.filter) bump("/receivables", 1);
    if (params.state) bump("/inventory", 1);
    if (params.status || params.range) bump("/orders", 1);
    if (params.risk || params.tier || params.trend || params.tasks) bump("/customers", 1);
    if (params.channel) bump("/orders", 1);
    if (params.prov) bump("/customers", 1);
  }
  if (routeScore.size === 0) return null;

  // each page also scores for the filters it can actually use
  let route: Route = [...routeScore.keys()][0]!;
  let best = -Infinity;
  for (const [candidate, ruleScore] of routeScore) {
    const usable = Object.keys(params).filter((k) => ALLOWED[candidate].includes(k)).length;
    const score = ruleScore + usable * 2;
    if (score > best) { best = score; route = candidate; }
  }

  // filters belonging to another page are dropped rather than sent along
  for (const key of Object.keys(params)) if (!ALLOWED[route].includes(key)) delete params[key];

  const score = best;
  const confidence = Math.min(0.95, 0.45 + score * 0.12);
  return { route, params, matched, confidence, source: "rules" };
}

/** Turn an intent into the URL the app already understands. */
export function intentToHref(intent: Intent): string {
  const q = new URLSearchParams(intent.params).toString();
  return `#${intent.route}${q ? "?" + q : ""}`;
}
