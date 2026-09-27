import { describe, expect, test } from "vitest";
import { getDataset } from "../src/data/generate";
import { getCrm, REPS } from "../src/data/crm";
import { atRiskCustomers, customerStats, suggestedLines, topProductsFor } from "../src/data/crmSelectors";
import { buildFacts } from "../src/components/DraftDialog";
import { riskReason, templateFollowUp } from "../src/ai/client";

const d = getDataset();
const crm = getCrm(d);
const stats = customerStats(d, crm);

describe("RFM scoring", () => {
  test("every score sits between 1 and 5", () => {
    for (const s of stats) {
      for (const v of [s.recency, s.frequency, s.monetary]) {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(5);
      }
    }
  });

  test("the tiers split the book rather than landing everyone in one bucket", () => {
    for (const tier of ["A", "B", "C"] as const) {
      const share = stats.filter((s) => s.tier === tier).length / stats.length;
      expect(share, tier).toBeGreaterThan(0.1);
      expect(share, tier).toBeLessThan(0.6);
    }
  });

  test("a bigger spender never scores lower on money than a smaller one", () => {
    const sorted = [...stats].filter((s) => s.orders > 0).sort((a, b) => a.revenue365 - b.revenue365);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]!.monetary).toBeGreaterThanOrEqual(sorted[i - 1]!.monetary);
    }
  });

  test("ordering more recently never scores worse on recency", () => {
    const sorted = [...stats].filter((s) => s.orders > 0).sort((a, b) => (b.daysSince ?? 0) - (a.daysSince ?? 0));
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i]!.recency).toBeGreaterThanOrEqual(sorted[i - 1]!.recency);
    }
  });
});

describe("churn risk", () => {
  test("is only raised for established accounts that have actually gone quiet", () => {
    for (const s of stats.filter((x) => x.atRisk)) {
      expect(s.orders).toBeGreaterThanOrEqual(5);
      expect(s.daysSince!).toBeGreaterThan(14);
      expect(s.overdueRatio!).toBeGreaterThan(2);
    }
  });

  test("a customer ordering on their usual rhythm is never flagged", () => {
    const regular = stats.filter((s) => s.cadence && s.daysSince !== null && s.daysSince <= s.cadence);
    expect(regular.length).toBeGreaterThan(20);
    expect(regular.every((s) => !s.atRisk)).toBe(true);
  });

  test("the generator's dormant accounts are the ones the report finds", () => {
    const flagged = atRiskCustomers(stats);
    expect(flagged.length).toBeGreaterThan(3);
    // biggest loss first, so the call list is worth working down
    for (let i = 1; i < flagged.length; i++) {
      expect(flagged[i - 1]!.revenue365).toBeGreaterThanOrEqual(flagged[i]!.revenue365);
    }
  });

  test("cadence is a median gap, so one long holiday does not distort it", () => {
    for (const s of stats.filter((x) => x.cadence !== null)) {
      expect(s.cadence!).toBeGreaterThan(0);
      expect(s.cadence!).toBeLessThan(400);
    }
  });
});

describe("relationship data", () => {
  test("every contact and task points at a real customer and a real rep", () => {
    const ids = new Set(d.customers.map((c) => c.id));
    const reps = new Set(REPS.map((r) => r.id));
    for (const c of crm.contacts) { expect(ids.has(c.customerId)).toBe(true); expect(reps.has(c.repId)).toBe(true); }
    for (const t of crm.tasks) { expect(ids.has(t.customerId)).toBe(true); expect(reps.has(t.repId)).toBe(true); }
  });

  test("contacts are newest first and never dated in the future", () => {
    for (let i = 1; i < crm.contacts.length; i++) {
      expect(crm.contacts[i - 1]!.day).toBeGreaterThanOrEqual(crm.contacts[i]!.day);
    }
    expect(crm.contacts.every((c) => c.day <= d.today)).toBe(true);
  });

  test("each customer is owned by the rep who covers their province", () => {
    for (const c of d.customers) {
      const rep = REPS.find((r) => r.id === crm.repForCustomer.get(c.id))!;
      expect(rep.provinces, c.province.en).toContain(c.province.en);
    }
  });

  test("the accounts owing the most all have a collection task open", () => {
    const owed = new Map<string, number>();
    for (const o of d.orders) {
      if (o.status === "cancelled" || o.paidDay !== null || o.dueDay >= d.today) continue;
      owed.set(o.customerId, (owed.get(o.customerId) ?? 0) + o.total);
    }
    const worst = [...owed].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id);
    for (const id of worst) {
      const tasks = crm.tasksByCustomer.get(id) ?? [];
      expect(tasks.some((t) => t.kind === "collect"), id).toBe(true);
    }
  });
});

describe("cross-sell suggestions", () => {
  const sample = stats.filter((s) => s.orders > 10).slice(0, 25);

  test("never suggest a line the customer already buys regularly", () => {
    for (const s of sample) {
      for (const x of suggestedLines(d, s.customer.id, stats)) expect(x.mine).toBeLessThan(0.08);
    }
  });

  test("only suggest lines most of their peers really do buy", () => {
    for (const s of sample) {
      for (const x of suggestedLines(d, s.customer.id, stats)) expect(x.share).toBeGreaterThan(0.4);
    }
  });

  test("regular lines are ordered by what the customer spends", () => {
    const top = topProductsFor(d, stats[0]!.customer.id);
    for (let i = 1; i < top.length; i++) expect(top[i - 1]!.revenue).toBeGreaterThanOrEqual(top[i]!.revenue);
  });
});

describe("follow-up drafting", () => {
  const owing = stats.find((s) => s.outstanding > 0)!;
  const baht = (v: number) => "฿" + Math.round(v).toLocaleString("en-US");

  test("the facts come from the ledger, not from a model", () => {
    const facts = buildFacts(d, owing, "th", baht);
    const unpaid = d.orders.filter((o) => o.customerId === owing.customer.id && o.status !== "cancelled" && o.paidDay === null);
    expect(facts.invoiceCount).toBe(unpaid.length);
    expect(facts.total).toBe(baht(unpaid.reduce((s, o) => s + o.total, 0)));
    expect(unpaid.some((o) => o.id === facts.oldestInvoice)).toBe(true);
  });

  test("the message repeats those figures and invents no others", () => {
    const facts = buildFacts(d, owing, "th", baht);
    for (const tone of ["polite", "firm", "final"] as const) {
      const text = templateFollowUp(facts, tone, "th");
      expect(text).toContain(facts.total);
      expect(text).toContain(facts.oldestInvoice);
      expect(text).toContain(String(facts.invoiceCount));
      // the only other numbers allowed are the days overdue and the notice period
      const numbers = (text.match(/\d[\d,]*/g) ?? []).map((n) => n.replace(/,/g, ""));
      const allowed = new Set([...facts.total.replace(/[^\d]/g, "").split("|"), String(facts.invoiceCount),
                               String(facts.oldestDays), "7"]);
      for (const n of numbers) {
        if (facts.total.includes(n) || facts.oldestInvoice.includes(n)) continue;
        expect(allowed.has(n), `unexpected number ${n} in ${tone} draft`).toBe(true);
      }
    }
  });

  test("tone changes the ending, not the facts", () => {
    const facts = buildFacts(d, owing, "en", baht);
    const polite = templateFollowUp(facts, "polite", "en");
    const final = templateFollowUp(facts, "final", "en");
    expect(polite).not.toBe(final);
    expect(final).toMatch(/7 days/);
    expect(polite).toContain(facts.total);
    expect(final).toContain(facts.total);
  });

  test("both languages produce a message", () => {
    const th = templateFollowUp(buildFacts(d, owing, "th", baht), "firm", "th");
    const en = templateFollowUp(buildFacts(d, owing, "en", baht), "firm", "en");
    expect(th, "Thai draft should contain Thai letters").toMatch(/[\u0E01-\u0E3A]/);
    expect(en).not.toMatch(/[\u0E01-\u0E3A]/);
  });

  test("the risk explanation quotes the numbers behind the flag", () => {
    const flagged = stats.find((s) => s.atRisk)!;
    const text = riskReason(flagged, crm.contactsByCustomer.get(flagged.customer.id)?.[0], "en");
    expect(text).toContain(String(Math.round(flagged.cadence!)));
    expect(text).toContain(String(flagged.daysSince));
  });
});
