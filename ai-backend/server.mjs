// Reference AI backend for the dashboard. Zero npm dependencies: node: builtins only.
//
//   ANTHROPIC_API_KEY=sk-... node ai-backend/server.mjs
//   npm run dev        # in another terminal; Vite proxies /api to this server
//
// The browser never holds the key. This process does, and it is the only thing
// that talks to the model. Three endpoints:
//
//   GET  /api/ai/health   is a model reachable?
//   POST /api/ai/intent   question -> { route, params }  (never figures)
//   POST /api/ai/draft    computed facts -> a rewritten message
//
// Both model endpoints degrade to the browser's own offline logic if this
// server is absent, so the app works either way.

import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

const PORT = +(process.env.PORT || 8787);
const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.MODEL || "claude-sonnet-4-6";
const MAX_BODY = 64 * 1024;

/* ----------------------------- the contract ----------------------------- */
// The model is given the whole filter vocabulary and told to answer with JSON
// only. It is never given business figures, and it is never asked for any.
const ROUTES = {
  "/orders": ["status", "channel", "range", "prov", "q", "open"],
  "/inventory": ["state", "q"],
  "/receivables": ["filter", "prov"],
  "/customers": ["risk", "tier", "trend", "tasks", "prov", "channel", "q"]
};

const VALUES = {
  status: ["packing", "shipped", "delivered", "cancelled"],
  channel: ["wholesale", "shop", "online", "line"],
  range: ["30", "90", "all"],
  state: ["out", "low", "ok"],
  filter: ["overdue", "d90", "overLimit"],
  risk: ["1"],
  tier: ["A"],
  trend: ["down"],
  tasks: ["open"],
  prov: ["Lampang", "Chiang Mai", "Lamphun", "Phrae", "Nan", "Phayao", "Chiang Rai", "Mae Hong Son", "Uttaradit", "Tak"]
};

const INTENT_PROMPT = `You turn a question about a Thai wholesale distributor's dashboard into a view of it.

Answer with JSON only, no prose, no code fences:
{"route": "<route>", "params": {...}, "confidence": <0-1>}

Routes and the params each accepts:
${Object.entries(ROUTES).map(([r, p]) => `  ${r}: ${p.join(", ")}`).join("\n")}

Allowed values:
${Object.entries(VALUES).map(([k, v]) => `  ${k}: ${v.join(" | ")}`).join("\n")}
  q: free text, a customer or product name
  open: an order number like SO26-010726

Rules:
- Questions may be Thai or English.
- Use only params the chosen route accepts. Drop anything else.
- If the question is not about this data at all, answer {"route": null}.
- Never answer the question itself. Never return numbers from the business.
  You choose the view; the application computes every figure.`;

const DRAFT_PROMPT = `You write short, courteous payment follow-up messages for a Thai wholesaler to send on LINE.

You are given facts that are already computed and formatted. Use them exactly as written.
Never change a figure, never add a figure, never invent an invoice number or a date.
Write only the message body, no preamble, no subject line, no markdown.
Thai messages should be polite business Thai with ครับ endings.`;

/* ------------------------------- helpers ------------------------------- */
const json = (res, status, obj) => {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": body.length,
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type"
  });
  res.end(body);
};

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw Object.assign(new Error("payload too large"), { status: 413 });
    chunks.push(c);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

async function callModel(system, user, maxTokens = 600) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }),
    signal: AbortSignal.timeout(15000)
  });
  if (!r.ok) throw new Error(`model returned ${r.status}`);
  const data = await r.json();
  return (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
}

/** The same validation the browser applies, applied again here. Defence in depth. */
export function cleanIntent(raw) {
  if (!raw || typeof raw !== "object") return null;
  const route = raw.route;
  if (!Object.hasOwn(ROUTES, route)) return null;
  const params = {};
  for (const [k, v] of Object.entries(raw.params ?? {})) {
    if (!ROUTES[route].includes(k)) continue;            // wrong page for this filter
    if (typeof v !== "string" || v.length > 40) continue;
    if (VALUES[k] && !VALUES[k].includes(v)) continue;   // value outside the vocabulary
    params[k] = v;
  }
  const confidence = typeof raw.confidence === "number" ? Math.min(1, Math.max(0, raw.confidence)) : 0.7;
  return { route, params, matched: ["model"], confidence, source: "model" };
}

/* -------------------------------- routes -------------------------------- */
const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET,POST,OPTIONS"
    });
    return res.end();
  }

  try {
    if (req.url === "/api/ai/health") {
      return json(res, KEY ? 200 : 503, { ok: !!KEY, model: KEY ? MODEL : null });
    }

    if (req.url === "/api/ai/intent" && req.method === "POST") {
      if (!KEY) return json(res, 503, { error: "no API key configured" });
      const { question } = await readJson(req);
      if (typeof question !== "string" || question.length > 300) {
        return json(res, 400, { error: "question must be a string under 300 characters" });
      }
      const text = await callModel(INTENT_PROMPT, question, 200);
      let parsed = null;
      try {
        parsed = JSON.parse(text.replace(/^```(?:json)?|```$/g, "").trim());
      } catch {
        return json(res, 200, { intent: null });   // unparseable answer: let the rules take over
      }
      return json(res, 200, { intent: cleanIntent(parsed) });
    }

    if (req.url === "/api/ai/draft" && req.method === "POST") {
      if (!KEY) return json(res, 503, { error: "no API key configured" });
      const { facts, tone, lang } = await readJson(req);
      if (!facts || typeof facts !== "object") return json(res, 400, { error: "facts are required" });

      // only these fields reach the model, and all of them are already strings
      const safe = {
        customerName: String(facts.customerName ?? "").slice(0, 120),
        invoiceCount: Number(facts.invoiceCount) || 0,
        total: String(facts.total ?? "").slice(0, 40),
        oldestDays: Number(facts.oldestDays) || 0,
        oldestInvoice: String(facts.oldestInvoice ?? "").slice(0, 40),
        promise: facts.promise ? String(facts.promise).slice(0, 200) : undefined
      };
      const toneWord = { polite: "gentle reminder", firm: "firm but friendly", final: "final notice before credit is held" }[tone] ?? "polite";
      const user =
        `Language: ${lang === "th" ? "Thai" : "English"}\nTone: ${toneWord}\n` +
        `Facts:\n${JSON.stringify(safe, null, 2)}\n\nWrite the message.`;

      const text = await callModel(DRAFT_PROMPT, user, 700);

      // a drafted message that dropped the figures is worse than the template
      if (!text.includes(safe.total) || !text.includes(safe.oldestInvoice)) {
        return json(res, 200, { text: null, reason: "figures missing from the draft" });
      }
      return json(res, 200, { text });
    }

    return json(res, 404, { error: "no such endpoint" });
  } catch (err) {
    return json(res, err.status || 500, { error: err.message });
  }
});

// only listen when run directly, so the validation above can be imported by tests
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  server.listen(PORT, () => {
    console.log(`AI backend on http://localhost:${PORT}`);
    console.log(KEY ? `model: ${MODEL}` : "no ANTHROPIC_API_KEY set — endpoints will return 503");
  });
}

export { server, ROUTES, VALUES };
