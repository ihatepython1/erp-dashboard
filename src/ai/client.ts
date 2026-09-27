// Where the model is actually called, and what happens when it is not there.
//
// The app never holds an API key: a small backend endpoint (/api/ask, /api/draft)
// would hold it. On GitHub Pages there is no backend, so both functions fall
// back to the deterministic versions and the UI says which one answered.

import { parseQuestion, type Intent, type Route } from "./parse";
import type { CustomerStats } from "../data/crmSelectors";
import type { Contact } from "../data/crm";
import type { Lang } from "../lib/i18n";

const TIMEOUT = 4000;

export type AiMode = "rules" | "model";

let backend: boolean | null = null;

/** Is an AI backend reachable on this origin? Checked once, then remembered. */
export async function hasBackend(): Promise<boolean> {
  if (backend !== null) return backend;
  try {
    const r = await fetch("/api/ai/health", { signal: AbortSignal.timeout(1500) });
    backend = r.ok;
  } catch {
    backend = false;
  }
  return backend;
}

/**
 * Ask a question in Thai or English and get back a view of the data.
 * The model is asked for an Intent and nothing else — no figures, no prose
 * about the business — so a hallucinated number cannot reach the screen.
 */
export async function askForIntent(question: string): Promise<Intent | null> {
  if (await hasBackend()) {
    try {
      const r = await fetch("/api/ai/intent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question }),
        signal: AbortSignal.timeout(TIMEOUT)
      });
      if (r.ok) {
        const data = (await r.json()) as { intent: Intent | null };
        // whatever comes back is validated against the same rules the app uses
        if (data.intent && isValidIntent(data.intent)) return { ...data.intent, source: "model" };
      }
    } catch {
      /* fall through to the rules */
    }
  }
  return parseQuestion(question);
}

const ROUTES: Route[] = ["/orders", "/inventory", "/receivables", "/customers"];

/** Never trust a route or a parameter name that came from a model. */
export function isValidIntent(x: unknown): x is Intent {
  if (!x || typeof x !== "object") return false;
  const i = x as Intent;
  if (!ROUTES.includes(i.route)) return false;
  if (typeof i.params !== "object" || i.params === null) return false;
  return Object.entries(i.params).every(
    ([k, v]) => /^[a-z]{1,10}$/.test(k) && typeof v === "string" && v.length <= 40
  );
}

/* ------------------------------ drafting ------------------------------ */

export type Tone = "polite" | "firm" | "final";

export interface DraftFacts {
  customerName: string;
  invoiceCount: number;
  total: string;          // already formatted, so the model never handles raw figures
  oldestDays: number;
  oldestInvoice: string;
  promise?: string;       // what they last promised, from the contact log
}

/**
 * A follow-up message for LINE. The facts are computed and formatted first;
 * the model, if present, only rewrites the wording. Offline it is a template,
 * which for this job is nearly as good and always correct.
 */
export async function draftFollowUp(facts: DraftFacts, tone: Tone, lang: Lang): Promise<{ text: string; mode: AiMode }> {
  if (await hasBackend()) {
    try {
      const r = await fetch("/api/ai/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ facts, tone, lang }),
        signal: AbortSignal.timeout(TIMEOUT)
      });
      if (r.ok) {
        const data = (await r.json()) as { text?: string };
        if (typeof data.text === "string" && data.text.trim()) return { text: data.text.trim(), mode: "model" };
      }
    } catch {
      /* fall through to the template */
    }
  }
  return { text: templateFollowUp(facts, tone, lang), mode: "rules" };
}

export function templateFollowUp(f: DraftFacts, tone: Tone, lang: Lang): string {
  if (lang === "th") {
    const head = `เรียน คุณลูกค้า ${f.customerName}`;
    const body = `ทางกาดหลวง เทรดดิ้ง ขอแจ้งยอดค้างชำระ ${f.invoiceCount} ใบ รวม ${f.total} โดยใบที่เก่าที่สุดคือ ${f.oldestInvoice} เกินกำหนดมาแล้ว ${f.oldestDays} วัน`;
    const promise = f.promise ? `\n\nจากที่คุยกันไว้ล่าสุด ${f.promise}` : "";
    const close =
      tone === "polite"
        ? "\n\nรบกวนช่วยตรวจสอบและแจ้งกำหนดชำระให้ทราบด้วยนะครับ หากชำระแล้วขออภัยมา ณ ที่นี้ด้วยครับ"
        : tone === "firm"
        ? "\n\nรบกวนโอนชำระภายในสัปดาห์นี้ด้วยนะครับ หากมีปัญหาเรื่องกำหนดชำระ แจ้งเข้ามาได้เลย ทางเรายินดีหาทางออกร่วมกันครับ"
        : "\n\nยอดนี้เกินกำหนดมานานพอสมควรแล้ว ขอความกรุณาชำระภายใน 7 วันนับจากวันที่ได้รับข้อความนี้ มิฉะนั้นทางเราจำเป็นต้องระงับเครดิตในรอบสั่งซื้อถัดไปครับ";
    return `${head}\n\n${body}${promise}${close}\n\nขอบคุณครับ\nฝ่ายบัญชี กาดหลวง เทรดดิ้ง`;
  }

  const head = `Dear ${f.customerName},`;
  const body = `Our records show ${f.invoiceCount} unpaid invoice${f.invoiceCount === 1 ? "" : "s"} totalling ${f.total}. The oldest, ${f.oldestInvoice}, is ${f.oldestDays} days past due.`;
  const promise = f.promise ? `\n\nWhen we last spoke: ${f.promise}` : "";
  const close =
    tone === "polite"
      ? "\n\nCould you check this and let us know when payment is likely? If you have already paid, please ignore this message."
      : tone === "firm"
      ? "\n\nPlease arrange payment this week. If the timing is difficult, tell us and we will work something out."
      : "\n\nThis balance is now well past due. Please settle it within 7 days of this message, otherwise we will have to hold credit on your next order.";
  return `${head}\n\n${body}${promise}${close}\n\nThank you,\nAccounts, Kad Luang Trading`;
}

/* --------------------------- at-risk briefing --------------------------- */

/**
 * One line explaining why an account is flagged. Deterministic: it reads the
 * numbers that produced the flag rather than inventing a story about them.
 */
export function riskReason(s: CustomerStats, lastContact: Contact | undefined, lang: Lang): string {
  const cadence = Math.round(s.cadence ?? 0);
  const since = s.daysSince ?? 0;
  const times = (s.overdueRatio ?? 0).toFixed(1);
  if (lang === "th") {
    const base = `เคยสั่งทุก ${cadence} วัน แต่เงียบมา ${since} วันแล้ว (${times} เท่าของรอบปกติ)`;
    const trend = s.trend < -0.15 ? ` ยอด 90 วันล่าสุดลดลง ${Math.round(Math.abs(s.trend) * 100)}%` : "";
    const touch = lastContact ? ` ติดต่อล่าสุด: ${lastContact.note.th}` : " ยังไม่มีบันทึกการติดต่อล่าสุด";
    return base + trend + touch;
  }
  const base = `Used to order every ${cadence} days, quiet for ${since} (${times}× their normal gap).`;
  const trend = s.trend < -0.15 ? ` Last 90 days down ${Math.round(Math.abs(s.trend) * 100)}%.` : "";
  const touch = lastContact ? ` Last contact: ${lastContact.note.en}` : " No recent contact on record.";
  return base + trend + touch;
}
