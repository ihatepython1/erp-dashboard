// Proposals are suggestions, never actions. Each one carries the figures it was
// derived from, so the person deciding can see the reasoning rather than a
// sentence describing it. Nothing here calls a model: every threshold is
// arithmetic over the ledger.
import type { Dataset } from "./types";
import { aging, stockRows } from "./selectors";
import type { CustomerStats } from "./crmSelectors";
import { getCrm } from "./crm";

export type ProposalKind = "purchaseOrder" | "winback" | "creditHold" | "followUp";
export type Urgency = "high" | "medium" | "low";

/** A single piece of evidence: a named number, formatted at render time. */
export interface Fact {
  key: FactKey;
  n?: number;
  s?: string;
}

export type FactKey =
  | "outOfStock" | "belowReorder" | "leadDays" | "lineCount" | "coverDays"
  | "daysQuiet" | "cadence" | "trendYoY" | "revenue365" | "lastContact"
  | "overdue90" | "outstanding" | "creditLimit" | "oldestDays" | "invoiceCount"
  | "promise";

export interface PoLine { sku: string; qty: number; cost: number }

export interface Proposal {
  /** Stable across reloads, so a decision stays attached to its proposal. */
  id: string;
  kind: ProposalKind;
  subject: string;          // supplier name, or a customer id
  customerId?: string;
  amount: number;           // money at stake: order cost, revenue at risk, debt
  urgency: Urgency;
  windowDays: number;       // how much history the figures came from
  facts: Fact[];
  lines?: PoLine[];
}

const HIGH_DEBT = 20_000;

/** Reorder suggestions, grouped into one order per supplier. */
export function purchaseOrderProposals(d: Dataset): Proposal[] {
  const rows = stockRows(d).filter((r) => r.suggested > 0);
  const bySupplier = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = bySupplier.get(r.product.supplier) ?? [];
    list.push(r);
    bySupplier.set(r.product.supplier, list);
  }

  return [...bySupplier].map(([supplier, list]) => {
    const outCount = list.filter((r) => r.state === "out").length;
    const amount = list.reduce((s, r) => s + r.suggested * r.product.cost, 0);
    return {
      id: `po:${supplier}`,
      kind: "purchaseOrder" as const,
      subject: supplier,
      amount,
      urgency: (outCount > 0 ? "high" : "medium") as Urgency,
      windowDays: 30,
      facts: [
        ...(outCount ? [{ key: "outOfStock" as const, n: outCount }] : []),
        ...(list.length - outCount > 0 ? [{ key: "belowReorder" as const, n: list.length - outCount }] : []),
        { key: "leadDays" as const, n: Math.max(...list.map((r) => r.product.leadDays)) }
      ],
      lines: list.map((r) => ({ sku: r.product.sku, qty: r.suggested, cost: r.product.cost }))
    };
  }).sort((a, b) => (a.urgency === b.urgency ? b.amount - a.amount : a.urgency === "high" ? -1 : 1));
}

/** Quiet accounts worth a phone call, with the numbers that flagged them. */
export function winbackProposals(d: Dataset, stats: CustomerStats[]): Proposal[] {
  const crm = getCrm(d);
  return stats
    .filter((s) => s.atRisk)
    .sort((a, b) => b.revenue365 - a.revenue365)
    .slice(0, 12)
    .map((s) => {
      const lastContact = crm.contactsByCustomer.get(s.customer.id)?.[0];
      return {
        id: `wb:${s.customer.id}`,
        kind: "winback" as const,
        subject: s.customer.id,
        customerId: s.customer.id,
        // a year of trade is what walks out of the door if nobody calls
        amount: s.revenue365,
        urgency: ((s.overdueRatio ?? 0) > 3 ? "high" : "medium") as Urgency,
        windowDays: 365,
        facts: [
          { key: "daysQuiet" as const, n: s.daysSince ?? 0 },
          { key: "cadence" as const, n: Math.round(s.cadence ?? 0) },
          { key: "revenue365" as const, n: s.revenue365 },
          ...(s.trend < -0.15 ? [{ key: "trendYoY" as const, n: s.trend }] : []),
          ...(lastContact ? [{ key: "lastContact" as const, n: d.today - lastContact.day }] : [])
        ]
      };
    });
}

/**
 * Accounts bad enough to consider holding credit on. This is the one that can
 * lose a customer outright, so it is only ever a proposal — see LOCKED in
 * src/lib/decisions.ts.
 */
export function creditHoldProposals(d: Dataset, stats: CustomerStats[]): Proposal[] {
  const ledger = aging(d);
  return ledger.rows
    .filter((r) => r.buckets.d90 > 0 && (r.overLimit || r.buckets.d90 >= HIGH_DEBT))
    .sort((a, b) => b.buckets.d90 - a.buckets.d90)
    .slice(0, 10)
    .map((r) => {
      const s = stats.find((x) => x.customer.id === r.customer.id);
      return {
        id: `ch:${r.customer.id}`,
        kind: "creditHold" as const,
        subject: r.customer.id,
        customerId: r.customer.id,
        amount: r.buckets.d90,
        urgency: (r.buckets.d90 >= HIGH_DEBT ? "high" : "medium") as Urgency,
        windowDays: 365,
        facts: [
          { key: "overdue90" as const, n: r.buckets.d90 },
          { key: "outstanding" as const, n: r.total },
          { key: "creditLimit" as const, n: r.customer.creditLimit },
          { key: "oldestDays" as const, n: r.oldestDays },
          ...(s ? [{ key: "revenue365" as const, n: s.revenue365 }] : [])
        ]
      };
    });
}

/** Debts young enough that a polite message is the right next step. */
export function followUpProposals(d: Dataset, stats: CustomerStats[]): Proposal[] {
  const ledger = aging(d);
  const crm = getCrm(d);
  return ledger.rows
    .filter((r) => r.oldestDays > 3 && r.oldestDays <= 60 && r.buckets.d90 === 0 && r.total > 2000)
    .sort((a, b) => b.total - a.total)
    .slice(0, 12)
    .map((r) => {
      const promise = crm.contactsByCustomer.get(r.customer.id)?.find((c) => c.kind === "promise");
      const s = stats.find((x) => x.customer.id === r.customer.id);
      return {
        id: `fu:${r.customer.id}`,
        kind: "followUp" as const,
        subject: r.customer.id,
        customerId: r.customer.id,
        amount: r.total,
        urgency: (r.oldestDays > 30 ? "medium" : "low") as Urgency,
        windowDays: 90,
        facts: [
          { key: "outstanding" as const, n: r.total },
          { key: "invoiceCount" as const, n: r.invoices.length },
          { key: "oldestDays" as const, n: r.oldestDays },
          ...(promise ? [{ key: "promise" as const, s: promise.note.en }] : []),
          ...(s && s.revenue365 ? [{ key: "revenue365" as const, n: s.revenue365 }] : [])
        ]
      };
    });
}

const RANK: Record<Urgency, number> = { high: 0, medium: 1, low: 2 };
// amounts mean different things per kind — a purchase order's cost against a
// customer's yearly trade — so they are only compared within a kind
const KIND_ORDER: Record<ProposalKind, number> = { purchaseOrder: 0, creditHold: 1, followUp: 2, winback: 3 };

export function allProposals(d: Dataset, stats: CustomerStats[]): Proposal[] {
  return [
    ...purchaseOrderProposals(d),
    ...winbackProposals(d, stats),
    ...creditHoldProposals(d, stats),
    ...followUpProposals(d, stats)
  ].sort((a, b) =>
    RANK[a.urgency] - RANK[b.urgency] ||
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
    b.amount - a.amount);
}
