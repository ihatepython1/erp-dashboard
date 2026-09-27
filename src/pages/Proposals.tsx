import { useEffect, useMemo, useState } from "react";
import type { Dataset } from "../data/types";
import { allProposals, type Fact, type Proposal, type ProposalKind } from "../data/proposals";
import { customerStats, type CustomerStats } from "../data/crmSelectors";
import { useI18n, type Keys } from "../lib/i18n";
import {
  allowedLevels, applyAuto, autoApplicable, clampLevel, DEFAULT_SETTINGS, isLocked, loadLog, loadSettings,
  needsReview, record, rejectReasons, saveLog, saveSettings, statsByKind,
  type Action, type Level, type Log, type RejectReason, type Settings
} from "../lib/decisions";
import { DraftDialog } from "../components/DraftDialog";

const KINDS: ProposalKind[] = ["purchaseOrder", "winback", "creditHold", "followUp"];
const kindKey = (k: ProposalKind) => ("pr_kind_" + k) as Keys;

export function Proposals({ data }: { data: Dataset }) {
  const { t, f, lang } = useI18n();
  const stats = useMemo(() => customerStats(data), [data]);
  const proposals = useMemo(() => allProposals(data, stats), [data, stats]);

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [log, setLog] = useState<Log>({});
  const [showSettings, setShowSettings] = useState(false);
  const [rejecting, setRejecting] = useState<Proposal | null>(null);
  const [draftFor, setDraftFor] = useState<CustomerStats | null>(null);

  useEffect(() => { setSettings(loadSettings()); setLog(loadLog()); }, []);

  // anything the current settings allow is applied once, and never twice: a
  // proposal already in the log is left alone
  useEffect(() => {
    const next = applyAuto(proposals, settings, log);
    if (next !== log) { setLog(next); saveLog(next); }
  }, [proposals, settings, log]);

  const autoQueue = useMemo(() => new Set(autoApplicable(proposals, settings, log).map((p) => p.id)), [proposals, settings, log]);
  const open = proposals.filter((p) => !log[p.id] && settings[p.kind].level !== "off");
  const decided = proposals.filter((p) => log[p.id]);
  const kindStats = useMemo(() => statsByKind(log), [log]);
  const overall = kindStats.reduce((a, s) => ({ used: a.used + s.accepted + s.edited, total: a.total + s.total }), { used: 0, total: 0 });

  const decide = (p: Proposal, action: Action, reason?: string) => {
    const next = record(log, p, action, "person", reason);
    setLog(next);
    saveLog(next);
    setRejecting(null);
  };

  const undo = (p: Proposal) => {
    const next = { ...log };
    delete next[p.id];
    setLog(next);
    saveLog(next);
  };

  const setLevel = (kind: ProposalKind, level: Level) => {
    const next = { ...settings, [kind]: { ...settings[kind], level: clampLevel(kind, level) } };
    setSettings(next);
    saveSettings(next);
  };

  const setLimit = (kind: ProposalKind, limit: number) => {
    const next = { ...settings, [kind]: { ...settings[kind], limit: Math.max(0, limit) } };
    setSettings(next);
    saveSettings(next);
  };

  const factText = (fact: Fact) => {
    const key = ("f_" + fact.key) as Keys;
    if (fact.s !== undefined) return t(key, { s: fact.s });
    const n = fact.n ?? 0;
    const money = ["revenue365", "overdue90", "outstanding", "creditLimit"].includes(fact.key);
    const pct = fact.key === "trendYoY";
    return t(key, { n: money ? f.baht(n) : pct ? f.signedPct(n) : f.num(n) });
  };

  const subjectName = (p: Proposal) =>
    p.customerId ? data.customerById.get(p.customerId)?.name[lang] ?? p.subject : p.subject;

  return (
    <section>
      <p className="lead">{t("pr_intro")}</p>

      <div className="kpis kpis-3">
        <div className="kpi">
          <span className="kpi-label">{t("pr_open")}</span>
          <span className="kpi-value num">{f.num(open.length)}</span>
          <span className="kpi-note">{t("pr_decided", { n: f.num(Object.keys(log).length) })}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">{t("pr_atStake")}</span>
          <span className="kpi-value num">{f.baht(open.reduce((s, p) => s + p.amount, 0))}</span>
          <span className="kpi-note">{t("pr_window", { n: 365 })}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">{t("pr_useful")}</span>
          <span className="kpi-value num">{overall.total ? f.pct(overall.used / overall.total) : "—"}</span>
          <span className="kpi-note">{t("pr_decided", { n: f.num(overall.total) })}</span>
        </div>
      </div>

      <div className="toolbar">
        <button type="button" className="btn ghost" aria-expanded={showSettings}
          onClick={() => setShowSettings((v) => !v)}>
          {t("pr_settings")}
        </button>
        <span className="muted">{t("pr_settingsNote")}</span>
      </div>

      {showSettings && (
        <div className="panel settings">
          <table className="lines">
            <tbody>
              {KINDS.map((kind) => {
                const s = settings[kind];
                const review = needsReview(kindStats.find((x) => x.kind === kind)!);
                return (
                  <tr key={kind}>
                    <td>
                      <b>{t(kindKey(kind))}</b>
                      {isLocked(kind) && <small>{t("pr_lockedNote")}</small>}
                      {review && <small className="text-warn">{t("pr_review")}</small>}
                    </td>
                    <td>
                      <div className="segmented" role="group" aria-label={t(kindKey(kind))}>
                        {allowedLevels(kind).map((l) => (
                          <button key={l} type="button" aria-pressed={s.level === l} onClick={() => setLevel(kind, l)}>
                            {t(("lvl_" + l) as Keys)}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="end">
                      {s.level === "auto" && !isLocked(kind) && (
                        <label className="limit">
                          {t("pr_limit")}
                          <input type="number" className="field" min={0} step={1000} value={s.limit}
                            onChange={(e) => setLimit(kind, +e.target.value)} />
                        </label>
                      )}
                      {isLocked(kind) && <span className="chip">{t("pr_lockedBadge")}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {open.length === 0 ? (
        <p className="panel muted">{t("pr_none")}</p>
      ) : (
        <ul className="proposals">
          {open.map((p) => (
            <li key={p.id} className={`proposal sev-${p.urgency}`}>
              <div className="proposal-head">
                <div>
                  <span className="chip">{t(kindKey(p.kind))}</span>
                  <h3>{subjectName(p)}</h3>
                </div>
                <span className="num amount">{f.baht(p.amount)}</span>
              </div>

              <p className="why">{t("pr_why")}</p>
              <ul className="facts-list">
                {p.facts.map((fact, i) => <li key={i}>{factText(fact)}</li>)}
                {p.lines && <li>{t("pr_lines", { n: p.lines.length })}</li>}
              </ul>
              <p className="window">{t("pr_window", { n: p.windowDays })}</p>

              <div className="proposal-actions">
                {autoQueue.has(p.id) && <span className="chip auto">{t("pr_autoBadge")}</span>}
                {isLocked(p.kind) && <span className="chip locked">{t("pr_lockedBadge")}</span>}
                {p.kind === "followUp" && p.customerId && (
                  <button type="button" className="btn ghost"
                    onClick={() => setDraftFor(stats.find((s) => s.customer.id === p.customerId) ?? null)}>
                    {t("pr_draft")}
                  </button>
                )}
                <button type="button" className="btn ghost" onClick={() => decide(p, "edit")}>{t("pr_edit")}</button>
                <button type="button" className="btn ghost" onClick={() => setRejecting(p)}>{t("pr_reject")}</button>
                <button type="button" className="btn" onClick={() => decide(p, "accept")}>{t("pr_accept")}</button>
              </div>

              {rejecting?.id === p.id && (
                <div className="reasons">
                  <span>{t("pr_reason")}</span>
                  {rejectReasons.map((r: RejectReason) => (
                    <button key={r} type="button" className="btn ghost" onClick={() => decide(p, "reject", r)}>
                      {t(("rr_" + r) as Keys)}
                    </button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="panel logpanel">
        <header className="panel-head">
          <h2>{t("pr_log")}</h2>
          {Object.keys(log).length > 0 && (
            <button type="button" className="btn ghost" onClick={() => { setLog({}); saveLog({}); }}>
              {t("pr_clearLog")}
            </button>
          )}
        </header>

        <table className="lines">
          <tbody>
            {kindStats.filter((s) => s.total > 0).map((s) => (
              <tr key={s.kind}>
                <td>{t(kindKey(s.kind))}</td>
                <td className="num">{t("pr_rate", { p: f.pct(s.usefulRate) })}</td>
                <td className="num muted">{t("pr_decided", { n: s.total })}</td>
                <td className="num">{f.baht(s.valueAccepted)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {decided.length === 0 ? (
          <p className="muted">{t("pr_logEmpty")}</p>
        ) : (
          <ul className="decisions">
            {decided.slice(0, 10).map((p) => {
              const d = log[p.id]!;
              return (
                <li key={p.id}>
                  <span className={`chip act-${d.action}`}>{t(("pr_" + d.action) as Keys)}</span>
                  <span className="clip">{t(kindKey(p.kind))} · {subjectName(p)}</span>
                  <small>{t(("pr_decidedBy_" + d.by) as Keys)}{d.reason ? ` · ${t(("rr_" + d.reason) as Keys)}` : ""}</small>
                  <button type="button" className="btn ghost" onClick={() => undo(p)}>{t("pr_undo")}</button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <DraftDialog data={data} row={draftFor} onClose={() => setDraftFor(null)} />
    </section>
  );
}
