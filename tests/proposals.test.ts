import { beforeEach, describe, expect, test } from "vitest";
import { getDataset } from "../src/data/generate";
import { customerStats } from "../src/data/crmSelectors";
import { aging, stockRows } from "../src/data/selectors";
import {
  allProposals, creditHoldProposals, followUpProposals, purchaseOrderProposals, winbackProposals, type Proposal
} from "../src/data/proposals";
import {
  allowedLevels, applyAuto, autoApplicable, clampLevel, clampSettings, DEFAULT_SETTINGS, isLocked, LOCKED,
  loadSettings, needsReview, record, saveSettings, statsByKind, type Log, type Settings
} from "../src/lib/decisions";

const d = getDataset();
const stats = customerStats(d);
const proposals = allProposals(d, stats);

describe("what gets proposed", () => {
  test("a purchase order is raised per supplier and only for lines that need ordering", () => {
    const pos = purchaseOrderProposals(d);
    expect(pos.length).toBeGreaterThan(0);
    const needing = stockRows(d).filter((r) => r.suggested > 0);
    expect(pos.reduce((n, p) => n + (p.lines?.length ?? 0), 0)).toBe(needing.length);
    expect(new Set(pos.map((p) => p.subject)).size).toBe(pos.length);
  });

  test("a purchase order's amount is exactly its lines at cost", () => {
    for (const p of purchaseOrderProposals(d)) {
      const sum = p.lines!.reduce((s, l) => s + l.qty * l.cost, 0);
      expect(p.amount).toBeCloseTo(sum, 6);
    }
  });

  test("suppliers with something already out of stock are urgent and come first", () => {
    const pos = purchaseOrderProposals(d);
    const firstMedium = pos.findIndex((p) => p.urgency !== "high");
    if (firstMedium > -1) {
      expect(pos.slice(firstMedium).every((p) => p.urgency !== "high")).toBe(true);
    }
  });

  test("win-back calls are only raised for accounts the CRM already flags", () => {
    const flagged = new Set(stats.filter((s) => s.atRisk).map((s) => s.customer.id));
    for (const p of winbackProposals(d, stats)) expect(flagged.has(p.customerId!)).toBe(true);
  });

  test("credit holds are only raised against genuinely bad debt", () => {
    const ledger = aging(d);
    for (const p of creditHoldProposals(d, stats)) {
      const row = ledger.rows.find((r) => r.customer.id === p.customerId)!;
      expect(row.buckets.d90).toBeGreaterThan(0);
      expect(row.overLimit || row.buckets.d90 >= 20_000).toBe(true);
    }
  });

  test("chasing and holding credit never target the same account at once", () => {
    const holds = new Set(creditHoldProposals(d, stats).map((p) => p.customerId));
    for (const p of followUpProposals(d, stats)) expect(holds.has(p.customerId)).toBe(false);
  });

  test("every proposal carries evidence and a stated data window", () => {
    for (const p of proposals) {
      expect(p.facts.length, p.id).toBeGreaterThan(0);
      expect(p.windowDays).toBeGreaterThan(0);
      expect(p.amount).toBeGreaterThanOrEqual(0);
    }
  });

  test("ids are stable, so a decision stays attached to its proposal", () => {
    const again = allProposals(d, customerStats(d));
    expect(again.map((p) => p.id)).toEqual(proposals.map((p) => p.id));
    expect(new Set(proposals.map((p) => p.id)).size).toBe(proposals.length);
  });
});

describe("actions that may never be automated", () => {
  test("holding credit and messaging customers are locked", () => {
    expect(LOCKED).toContain("creditHold");
    expect(LOCKED).toContain("followUp");
  });

  test("the UI is never offered an automatic option for them", () => {
    for (const kind of LOCKED) expect(allowedLevels(kind)).not.toContain("auto");
    expect(allowedLevels("purchaseOrder")).toContain("auto");
  });

  test("asking for automatic anyway is clamped back to suggest", () => {
    for (const kind of LOCKED) expect(clampLevel(kind, "auto")).toBe("suggest");
    expect(clampLevel("purchaseOrder", "auto")).toBe("auto");
  });

  test("settings edited by hand in storage cannot unlock them", () => {
    const tampered = {
      ...DEFAULT_SETTINGS,
      creditHold: { level: "auto", limit: 1e9 },
      followUp: { level: "auto", limit: 1e9 }
    } as Settings;
    const clean = clampSettings(tampered);
    expect(clean.creditHold.level).toBe("suggest");
    expect(clean.followUp.level).toBe("suggest");
  });

  test("even with a tampered setting, nothing locked is ever applied", () => {
    const tampered = {
      ...DEFAULT_SETTINGS,
      creditHold: { level: "auto", limit: 1e9 },
      followUp: { level: "auto", limit: 1e9 }
    } as Settings;
    const applied = autoApplicable(proposals, tampered, {});
    expect(applied.every((p) => !isLocked(p.kind))).toBe(true);
  });
});

describe("acting alone, within limits", () => {
  const auto = (limit: number): Settings => ({
    ...DEFAULT_SETTINGS,
    purchaseOrder: { level: "auto", limit }
  });

  test("only proposals under the limit qualify", () => {
    const limit = 5000;
    const applied = autoApplicable(proposals, auto(limit), {});
    expect(applied.every((p) => p.amount <= limit && p.kind === "purchaseOrder")).toBe(true);
    const skipped = proposals.filter((p) => p.kind === "purchaseOrder" && p.amount > limit);
    expect(applied.some((p) => skipped.includes(p))).toBe(false);
  });

  test("suggest-only settings apply nothing at all", () => {
    expect(autoApplicable(proposals, DEFAULT_SETTINGS, {})).toEqual([]);
  });

  test("applying is idempotent: a second pass changes nothing", () => {
    const once = applyAuto(proposals, auto(1e9), {}, 1000);
    const twice = applyAuto(proposals, auto(1e9), once, 2000);
    expect(Object.keys(twice).length).toBe(Object.keys(once).length);
    expect(twice).toEqual(once);
  });

  test("a decision a person already made is never overwritten", () => {
    const p = proposals.find((x) => x.kind === "purchaseOrder")!;
    const log = record({}, p, "reject", "person", "disagree");
    const after = applyAuto(proposals, auto(1e9), log);
    expect(after[p.id]!.action).toBe("reject");
    expect(after[p.id]!.by).toBe("person");
  });

  test("automatic decisions are recorded as automatic, not as the person's", () => {
    const log = applyAuto(proposals, auto(1e9), {});
    expect(Object.values(log).every((x) => x.by === "auto" && x.action === "accept")).toBe(true);
  });
});

describe("measuring whether the proposals were any good", () => {
  const mk = (kind: Proposal["kind"], id: string, amount = 100): Proposal =>
    ({ id, kind, subject: id, amount, urgency: "low", windowDays: 30, facts: [{ key: "lineCount", n: 1 }] });

  test("counts accepted, edited and rejected separately", () => {
    let log: Log = {};
    log = record(log, mk("purchaseOrder", "a"), "accept", "person");
    log = record(log, mk("purchaseOrder", "b"), "edit", "person");
    log = record(log, mk("purchaseOrder", "c"), "reject", "person", "notNow");
    const s = statsByKind(log).find((x) => x.kind === "purchaseOrder")!;
    expect(s).toMatchObject({ accepted: 1, edited: 1, rejected: 1, total: 3 });
    expect(s.acceptanceRate).toBeCloseTo(1 / 3, 6);
    // edited still means the suggestion was worth having
    expect(s.usefulRate).toBeCloseTo(2 / 3, 6);
  });

  test("rejected proposals contribute no value", () => {
    let log: Log = {};
    log = record(log, mk("winback", "a", 500), "accept", "person");
    log = record(log, mk("winback", "b", 900), "reject", "person", "handledAlready");
    expect(statsByKind(log).find((x) => x.kind === "winback")!.valueAccepted).toBe(500);
  });

  test("a rule rejected most of the time is flagged for review, not for rewording", () => {
    let log: Log = {};
    for (let i = 0; i < 10; i++) log = record(log, mk("winback", "r" + i), "reject", "person", "wrongNumbers");
    const s = statsByKind(log).find((x) => x.kind === "winback")!;
    expect(needsReview(s)).toBe(true);
  });

  test("a rule is not judged before there is enough evidence", () => {
    let log: Log = {};
    for (let i = 0; i < 3; i++) log = record(log, mk("winback", "r" + i), "reject", "person");
    expect(needsReview(statsByKind(log).find((x) => x.kind === "winback")!)).toBe(false);
  });

  test("an empty log reports nothing rather than dividing by zero", () => {
    for (const s of statsByKind({})) {
      expect(s.acceptanceRate).toBe(0);
      expect(s.usefulRate).toBe(0);
      expect(Number.isFinite(s.valueAccepted)).toBe(true);
    }
  });
});

describe("settings persistence", () => {
  beforeEach(() => localStorage.clear());

  test("round-trips through storage", () => {
    const next: Settings = { ...DEFAULT_SETTINGS, purchaseOrder: { level: "auto", limit: 12_000 } };
    saveSettings(next);
    expect(loadSettings().purchaseOrder).toEqual({ level: "auto", limit: 12_000 });
  });

  test("storage holding an illegal level is repaired on read", () => {
    localStorage.setItem("erp.autonomy", JSON.stringify({ ...DEFAULT_SETTINGS, creditHold: { level: "auto", limit: 999 } }));
    expect(loadSettings().creditHold.level).toBe("suggest");
  });

  test("unreadable storage falls back to the safe defaults", () => {
    localStorage.setItem("erp.autonomy", "{not json");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
