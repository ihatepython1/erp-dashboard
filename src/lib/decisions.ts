// How much the system is allowed to do on its own, what it may never do, and a
// record of every decision a person made about its suggestions.
//
// The record is the point. Anyone can ship a feature that proposes things; the
// question a year later is whether the proposals were any good, and the only
// honest answer comes from counting how many were accepted.

import type { Proposal, ProposalKind } from "../data/proposals";

export type Level = "off" | "suggest" | "auto";
export type Action = "accept" | "edit" | "reject";

/**
 * Actions that stay under human control whatever the settings say.
 * Holding a customer's credit or sending them a message can lose the account
 * outright, and neither is worth automating to save a click.
 */
export const LOCKED: ProposalKind[] = ["creditHold", "followUp"];
export const isLocked = (kind: ProposalKind) => LOCKED.includes(kind);

export interface Autonomy {
  level: Level;
  /** Only relevant at "auto": the value below which it may act unattended. */
  limit: number;
}

export type Settings = Record<ProposalKind, Autonomy>;

export const DEFAULT_SETTINGS: Settings = {
  purchaseOrder: { level: "suggest", limit: 5000 },
  winback: { level: "suggest", limit: 0 },
  creditHold: { level: "suggest", limit: 0 },
  followUp: { level: "suggest", limit: 0 }
};

/** Levels the UI may offer. Locked kinds never get "auto". */
export function allowedLevels(kind: ProposalKind): Level[] {
  return isLocked(kind) ? ["off", "suggest"] : ["off", "suggest", "auto"];
}

/** Clamp anything stored or requested down to what the kind permits. */
export function clampLevel(kind: ProposalKind, level: Level): Level {
  return level === "auto" && isLocked(kind) ? "suggest" : level;
}

export function clampSettings(settings: Settings): Settings {
  const out = {} as Settings;
  for (const kind of Object.keys(settings) as ProposalKind[]) {
    const s = settings[kind];
    out[kind] = { level: clampLevel(kind, s.level), limit: Math.max(0, s.limit) };
  }
  return out;
}

export interface Decision {
  proposalId: string;
  kind: ProposalKind;
  action: Action;
  /** "person" or "auto": who decided. */
  by: "person" | "auto";
  reason?: string;
  amount: number;
  at: number;
}

export type Log = Record<string, Decision>;   // keyed by proposalId

/* ------------------------------ persistence ------------------------------ */
const KEY_LOG = "erp.decisions";
const KEY_SETTINGS = "erp.autonomy";

export function loadLog(): Log {
  try {
    const raw = localStorage.getItem(KEY_LOG);
    return raw ? (JSON.parse(raw) as Log) : {};
  } catch {
    return {};
  }
}

export function saveLog(log: Log) {
  try { localStorage.setItem(KEY_LOG, JSON.stringify(log)); } catch { /* private mode */ }
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY_SETTINGS);
    // settings are clamped on the way in as well as on the way out, so a value
    // edited by hand in storage cannot unlock a locked action
    return raw ? clampSettings({ ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Settings) }) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings) {
  try { localStorage.setItem(KEY_SETTINGS, JSON.stringify(clampSettings(s))); } catch { /* private mode */ }
}

/* -------------------------------- deciding -------------------------------- */
export function record(log: Log, proposal: Proposal, action: Action, by: "person" | "auto", reason?: string): Log {
  return {
    ...log,
    [proposal.id]: {
      proposalId: proposal.id,
      kind: proposal.kind,
      action,
      by,
      ...(reason ? { reason } : {}),
      amount: proposal.amount,
      at: Date.now()
    }
  };
}

/**
 * Which proposals a given configuration would act on unattended: the level must
 * be "auto", the kind must not be locked, the amount must be under the limit,
 * and nobody may have decided it already.
 */
export function autoApplicable(proposals: Proposal[], settings: Settings, log: Log): Proposal[] {
  return proposals.filter((p) => {
    if (log[p.id]) return false;
    if (isLocked(p.kind)) return false;
    const s = settings[p.kind];
    return s.level === "auto" && p.amount <= s.limit;
  });
}

export function applyAuto(proposals: Proposal[], settings: Settings, log: Log, now = Date.now()): Log {
  let next = log;
  for (const p of autoApplicable(proposals, settings, log)) {
    next = { ...next, [p.id]: { proposalId: p.id, kind: p.kind, action: "accept", by: "auto", amount: p.amount, at: now } };
  }
  return next;
}

/* -------------------------------- measuring -------------------------------- */
export interface KindStats {
  kind: ProposalKind;
  accepted: number;
  edited: number;
  rejected: number;
  total: number;
  /** Accepted as offered, out of everything decided. */
  acceptanceRate: number;
  /** Accepted or accepted-after-editing: the suggestion was useful either way. */
  usefulRate: number;
  valueAccepted: number;
}

export function statsByKind(log: Log): KindStats[] {
  const kinds: ProposalKind[] = ["purchaseOrder", "winback", "creditHold", "followUp"];
  return kinds.map((kind) => {
    const rows = Object.values(log).filter((d) => d.kind === kind);
    const accepted = rows.filter((d) => d.action === "accept").length;
    const edited = rows.filter((d) => d.action === "edit").length;
    const rejected = rows.filter((d) => d.action === "reject").length;
    const total = rows.length;
    return {
      kind, accepted, edited, rejected, total,
      acceptanceRate: total ? accepted / total : 0,
      usefulRate: total ? (accepted + edited) / total : 0,
      valueAccepted: rows.filter((d) => d.action !== "reject").reduce((s, d) => s + d.amount, 0)
    };
  });
}

/**
 * A rule that keeps being rejected is a wrong threshold, not a wording problem.
 * Flag it once there is enough evidence to say so.
 */
export function needsReview(stats: KindStats, minDecisions = 8, floor = 0.4): boolean {
  return stats.total >= minDecisions && stats.usefulRate < floor;
}

export const rejectReasons = ["notNow", "wrongNumbers", "handledAlready", "disagree"] as const;
export type RejectReason = (typeof rejectReasons)[number];
