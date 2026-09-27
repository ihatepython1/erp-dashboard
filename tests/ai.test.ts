// An evaluation set for the question reader, not just unit tests.
//
// Each case is a question someone might actually type, in Thai or English,
// labelled with the view that answers it. The suite reports accuracy, and
// separately checks the cases where the right behaviour is to refuse: a
// confident wrong filter is worse than an honest "I did not understand".
//
// The same cases can be run against a model-backed parser by swapping `read`,
// which is how the two would be compared before trusting one in production.

import { describe, expect, test } from "vitest";
import { ALLOWED, intentToHref, parseQuestion, type Intent } from "../src/ai/parse";
import { isValidIntent } from "../src/ai/client";

interface Case {
  q: string;
  /** null = the parser is expected to decline */
  want: { route: string; params: Record<string, string> } | null;
}

const CASES: Case[] = [
  // --- Thai, receivables -------------------------------------------------
  { q: "ลูกค้าที่ค้างชำระเกิน 90 วัน", want: { route: "/receivables", params: { filter: "d90" } } },
  { q: "ใครค้างจ่ายเกินกำหนดบ้าง", want: { route: "/receivables", params: { filter: "overdue" } } },
  { q: "ลูกค้าที่ใช้เครดิตเกินวงเงิน", want: { route: "/receivables", params: { filter: "overLimit" } } },
  { q: "ลูกหนี้เชียงใหม่", want: { route: "/receivables", params: { prov: "Chiang Mai" } } },
  { q: "หนี้เกิน 90 วันของลูกค้าลำปาง", want: { route: "/receivables", params: { filter: "d90", prov: "Lampang" } } },

  // --- Thai, inventory ---------------------------------------------------
  { q: "สินค้าหมดสต็อกตอนนี้", want: { route: "/inventory", params: { state: "out" } } },
  { q: "ของอะไรใกล้หมดบ้าง", want: { route: "/inventory", params: { state: "low" } } },
  { q: "รายการที่ถึงจุดสั่งซื้อแล้ว", want: { route: "/inventory", params: { state: "low" } } },
  { q: "ดูสต๊อกทั้งหมด", want: { route: "/inventory", params: {} } },

  // --- Thai, orders ------------------------------------------------------
  { q: "ออเดอร์ที่รอแพ็กวันนี้", want: { route: "/orders", params: { status: "packing" } } },
  { q: "ใบสั่งขายที่ยกเลิก", want: { route: "/orders", params: { status: "cancelled" } } },
  { q: "ออเดอร์ที่สั่งผ่านไลน์", want: { route: "/orders", params: { channel: "line" } } },
  { q: "ยอดสั่งซื้อจากลูกค้าค้าส่ง 90 วัน", want: { route: "/orders", params: { channel: "wholesale", range: "90" } } },
  { q: "เปิดบิล SO26-010726", want: { route: "/orders", params: { open: "SO26-010726", range: "all" } } },

  // --- Thai, customers ---------------------------------------------------
  { q: "ลูกค้าที่กำลังจะหาย", want: { route: "/customers", params: { risk: "1" } } },
  { q: "ร้านไหนหยุดสั่งของไปแล้วบ้าง", want: { route: "/customers", params: { risk: "1" } } },
  { q: "ลูกค้าชั้นดีของเรา", want: { route: "/customers", params: { tier: "A" } } },
  { q: "ร้านที่ซื้อน้อยลง", want: { route: "/customers", params: { trend: "down" } } },
  { q: "ลูกค้าที่ต้องติดตามงาน", want: { route: "/customers", params: { tasks: "open" } } },
  { q: "ลูกค้าที่เชียงรายเสี่ยงหาย", want: { route: "/customers", params: { risk: "1", prov: "Chiang Rai" } } },

  // --- English -----------------------------------------------------------
  { q: "customers over 90 days late", want: { route: "/receivables", params: { filter: "d90" } } },
  { q: "who is over their credit limit", want: { route: "/receivables", params: { filter: "overLimit" } } },
  { q: "what is out of stock", want: { route: "/inventory", params: { state: "out" } } },
  { q: "products that need reorder", want: { route: "/inventory", params: { state: "low" } } },
  { q: "orders to pack today", want: { route: "/orders", params: { status: "packing" } } },
  { q: "wholesale orders in the last 90 days", want: { route: "/orders", params: { channel: "wholesale", range: "90" } } },
  { q: "customers at risk of churn", want: { route: "/customers", params: { risk: "1" } } },
  { q: "best customers in Lampang", want: { route: "/customers", params: { tier: "A", prov: "Lampang" } } },
  { q: "accounts buying less than before", want: { route: "/customers", params: { trend: "down" } } },
  { q: "shops in Phrae that have gone quiet", want: { route: "/customers", params: { risk: "1", prov: "Phrae" } } },

  // --- must decline rather than guess ------------------------------------
  { q: "สวัสดีครับ", want: null },
  { q: "พรุ่งนี้ฝนจะตกไหม", want: null },
  { q: "ช่วยคำนวณภาษีให้หน่อย", want: null },
  { q: "hello", want: null },
  { q: "what is the meaning of life", want: null },
  { q: "delete all the data", want: null }
];

const read = parseQuestion;

const matches = (got: Intent | null, want: Case["want"]) => {
  if (want === null) return got === null;
  if (!got || got.route !== want.route) return false;
  const keys = new Set([...Object.keys(want.params), ...Object.keys(got.params)]);
  return [...keys].every((k) => got.params[k] === want.params[k]);
};

describe("question reader", () => {
  test("reads the labelled set accurately enough to trust", () => {
    const wrong = CASES.filter((c) => !matches(read(c.q), c.want));
    const accuracy = (CASES.length - wrong.length) / CASES.length;
    if (wrong.length) {
      console.log("misread:", wrong.map((c) => `${c.q} -> ${JSON.stringify(read(c.q)?.params ?? null)}`));
    }
    expect(accuracy).toBeGreaterThanOrEqual(0.9);
  });

  test("declines every question it has no business answering", () => {
    for (const c of CASES.filter((x) => x.want === null)) {
      expect(read(c.q), c.q).toBeNull();
    }
  });

  test("a question it does answer is never low confidence", () => {
    for (const c of CASES.filter((x) => x.want !== null)) {
      const got = read(c.q);
      expect(got?.confidence ?? 0, c.q).toBeGreaterThan(0.5);
    }
  });

  test("it says which rules fired, so a wrong reading can be explained", () => {
    const got = read("ลูกค้าที่เชียงรายเสี่ยงหาย");
    expect(got?.matched).toContain("cust.risk");
    expect(got?.matched).toContain("province.Chiang Rai");
  });

  test("no reading ever carries a filter its page cannot use", () => {
    // mixed sentences are the risk: "ลูกหนี้ที่สั่งของหมดสต็อก" names two pages at once
    const probes = [...CASES.map((c) => c.q), "ลูกหนี้ที่สั่งของหมดสต็อก", "ลูกค้าค้าส่งที่ของหมด"];
    for (const q of probes) {
      const got = read(q);
      if (!got) continue;
      for (const key of Object.keys(got.params)) {
        expect(ALLOWED[got.route], `${q} -> ${got.route}.${key}`).toContain(key);
      }
    }
  });

  test("a specific filter beats a generic page word in the same sentence", () => {
    // "ลูกค้า" says customers, "เกินวงเงิน" says receivables — the filter should win
    expect(read("ลูกค้าที่ใช้เครดิตเกินวงเงิน")?.route).toBe("/receivables");
    expect(read("customers over 90 days late")?.route).toBe("/receivables");
  });

  test("intents become URLs the app already understands", () => {
    expect(intentToHref({ route: "/customers", params: { risk: "1", prov: "Lampang" }, matched: [], confidence: 1, source: "rules" }))
      .toBe("#/customers?risk=1&prov=Lampang");
    expect(intentToHref({ route: "/inventory", params: {}, matched: [], confidence: 1, source: "rules" }))
      .toBe("#/inventory");
  });
});

describe("intents from a model are never trusted blindly", () => {
  test("a valid intent passes", () => {
    expect(isValidIntent({ route: "/orders", params: { status: "packing" }, matched: [], confidence: 0.8, source: "model" })).toBe(true);
  });

  test("an unknown route is rejected", () => {
    expect(isValidIntent({ route: "/admin", params: {}, matched: [], confidence: 1, source: "model" })).toBe(false);
  });

  test("odd parameter names and oversized values are rejected", () => {
    const bad = [
      { route: "/orders", params: { "<script>": "x" } },
      { route: "/orders", params: { status: "x".repeat(60) } },
      { route: "/orders", params: { STATUS: "packing" } },
      { route: "/orders", params: null },
      null,
      "not an object"
    ];
    for (const x of bad) expect(isValidIntent(x)).toBe(false);
  });
});

// The backend validates model output again, independently of the browser.
// Anything a model returns is untrusted input at both ends.
describe("the backend sanitises whatever the model returns", () => {
  test("keeps a well-formed intent", async () => {
    const { cleanIntent } = await import("../ai-backend/server.mjs");
    const got = cleanIntent({ route: "/customers", params: { risk: "1", prov: "Chiang Rai" }, confidence: 0.8 });
    expect(got).toMatchObject({ route: "/customers", params: { risk: "1", prov: "Chiang Rai" }, source: "model" });
  });

  test("drops filters that belong to another page", async () => {
    const { cleanIntent } = await import("../ai-backend/server.mjs");
    const got = cleanIntent({ route: "/inventory", params: { state: "out", filter: "d90" } });
    expect(got!.params).toEqual({ state: "out" });
  });

  test("drops values outside the vocabulary", async () => {
    const { cleanIntent } = await import("../ai-backend/server.mjs");
    const got = cleanIntent({ route: "/orders", params: { status: "exploded", channel: "line" } });
    expect(got!.params).toEqual({ channel: "line" });
  });

  test("rejects an unknown route entirely", async () => {
    const { cleanIntent } = await import("../ai-backend/server.mjs");
    expect(cleanIntent({ route: "/etc/passwd", params: {} })).toBeNull();
    expect(cleanIntent({ route: "__proto__", params: {} })).toBeNull();
    expect(cleanIntent(null)).toBeNull();
    expect(cleanIntent("{}")).toBeNull();
  });

  test("clamps a confidence a model made up", async () => {
    const { cleanIntent } = await import("../ai-backend/server.mjs");
    expect(cleanIntent({ route: "/orders", params: {}, confidence: 44 })!.confidence).toBe(1);
    expect(cleanIntent({ route: "/orders", params: {}, confidence: -3 })!.confidence).toBe(0);
  });
});
