import { useMemo, useState } from "react";
import type { Dataset } from "../data/types";
import { getCrm } from "../data/crm";
import { customerStats, suggestedLines, topProductsFor, type CustomerStats } from "../data/crmSelectors";
import { useI18n, type Keys } from "../lib/i18n";
import { downloadCsv, setParams, toCsv, type Route } from "../lib/util";
import { DataGrid, type Column } from "../components/DataGrid";
import { Drawer } from "../components/Overlays";
import { DraftDialog } from "../components/DraftDialog";
import { channelKey } from "../components/Bits";
import { riskReason } from "../ai/client";

const FILTERS = ["all", "risk", "tierA", "declining", "tasks"] as const;
type Filter = (typeof FILTERS)[number];
const FILTER_LABEL: Record<Filter, Keys> = {
  all: "cust_all", risk: "cust_risk", tierA: "cust_tierA", declining: "cust_declining", tasks: "cust_tasksOpen"
};

export function Customers({ data, route }: { data: Dataset; route: Route }) {
  const { t, f, lang } = useI18n();
  const p = route.params;
  const q = p.get("q") ?? "";
  const prov = p.get("prov") ?? "";
  const openId = p.get("customer");
  const [draftFor, setDraftFor] = useState<CustomerStats | null>(null);

  // the URL may carry either the segmented filter or the raw params an AI
  // intent produced (risk=1, tier=A, trend=down, tasks=open)
  const filter: Filter =
    p.get("risk") ? "risk" :
    p.get("tier") === "A" ? "tierA" :
    p.get("trend") === "down" ? "declining" :
    p.get("tasks") ? "tasks" : "all";

  const set = (next: Record<string, string | null>) => setParams("/customers", next);
  const setFilter = (next: Filter) =>
    set({ risk: next === "risk" ? "1" : null, tier: next === "tierA" ? "A" : null,
          trend: next === "declining" ? "down" : null, tasks: next === "tasks" ? "open" : null });

  const crm = useMemo(() => getCrm(data), [data]);
  const stats = useMemo(() => customerStats(data, crm), [data, crm]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return stats.filter((x) => {
      if (filter === "risk" && !x.atRisk) return false;
      if (filter === "tierA" && x.tier !== "A") return false;
      if (filter === "declining" && !(x.trend < -0.15 && x.orders >= 5)) return false;
      if (filter === "tasks" && x.openTasks === 0) return false;
      if (prov && x.customer.province.en !== prov) return false;
      if (!s) return true;
      const c = x.customer;
      return [c.name.th, c.name.en, c.id, c.province.th, c.province.en].some((v) => v.toLowerCase().includes(s));
    });
  }, [stats, filter, prov, q]);

  const open = openId ? stats.find((x) => x.customer.id === openId) ?? null : null;

  const columns: Column<CustomerStats>[] = useMemo(() => [
    { id: "name", header: t("col_customer"), width: "minmax(180px, 2fr)", sort: (r) => r.customer.name[lang],
      cell: (r) => (
        <span className="clip">
          {r.customer.name[lang]}
          {r.atRisk && <span className="chip st-risk">{t("atRiskChip")}</span>}
        </span>
      ) },
    { id: "prov", header: t("col_province"), width: "minmax(80px, 1fr)", sort: (r) => r.customer.province[lang],
      cell: (r) => <span className="clip">{r.customer.province[lang]}</span> },
    { id: "tier", header: t("col_tier"), width: "48px", sort: (r) => r.recency + r.frequency + r.monetary,
      cell: (r) => <span className={`tier tier-${r.tier}`}>{r.tier}</span> },
    { id: "last", header: t("col_lastOrder"), width: "100px", align: "end", sort: (r) => r.daysSince,
      cell: (r) => r.daysSince === null ? <span className="muted">{t("neverOrdered")}</span>
        : <span className={r.atRisk ? "text-danger num" : "num"}>{t("daysAgo", { n: f.num(r.daysSince) })}</span> },
    { id: "cadence", header: t("col_cadence"), width: "96px", align: "end", sort: (r) => r.cadence,
      cell: (r) => r.cadence ? <span className="num muted">{t("everyDays", { n: f.num(r.cadence) })}</span> : <span className="muted">—</span> },
    { id: "rev", header: t("col_rev365"), width: "116px", align: "end", sort: (r) => r.revenue365,
      cell: (r) => <span className="num">{f.baht(r.revenue365)}</span> },
    { id: "trend", header: t("col_trend"), width: "80px", align: "end", sort: (r) => r.trend,
      cell: (r) => r.revenuePrev90 ? (
        <span className={`num ${r.trend >= 0 ? "text-good" : "text-danger"}`}>{f.signedPct(r.trend)}</span>
      ) : <span className="muted">—</span> },
    { id: "out", header: t("col_outstanding"), width: "104px", align: "end", sort: (r) => r.outstanding,
      cell: (r) => r.outstanding ? <span className="num">{f.baht(r.outstanding)}</span> : <span className="muted">—</span> },
    { id: "rep", header: t("col_rep"), width: "minmax(110px, 1fr)", sort: (r) => r.rep.name[lang],
      cell: (r) => <span className="clip">{r.rep.name[lang]}</span> },
    { id: "tasks", header: t("col_openTasks"), width: "64px", align: "end", sort: (r) => r.openTasks,
      cell: (r) => r.openTasks ? <span className="num strong">{r.openTasks}</span> : <span className="muted">—</span> }
  ], [t, f, lang]);

  const exportCsv = () => {
    downloadCsv("customers.csv", toCsv(
      ["customer_id", "name", "province", "channel", "tier", "recency", "frequency", "monetary",
       "last_order_days", "cadence_days", "revenue_365", "trend_90d", "outstanding", "owner", "open_tasks"],
      rows.map((r) => [r.customer.id, r.customer.name[lang], r.customer.province[lang], r.customer.channel, r.tier,
        r.recency, r.frequency, r.monetary, r.daysSince ?? "", r.cadence ?? "", r.revenue365.toFixed(2),
        (r.trend * 100).toFixed(1), r.outstanding.toFixed(2), r.rep.name[lang], r.openTasks])
    ));
  };

  return (
    <section>
      <div className="toolbar">
        <input type="search" className="field grow" placeholder={t("cust_search")} aria-label={t("cust_search")}
          value={q} onChange={(e) => set({ q: e.target.value })} />
        <div className="segmented" role="group" aria-label={t("cust_all")}>
          {FILTERS.map((x) => (
            <button key={x} type="button" aria-pressed={filter === x} onClick={() => setFilter(x)}>
              {t(FILTER_LABEL[x])}
              {x === "risk" && <span className="count">{stats.filter((s) => s.atRisk).length}</span>}
            </button>
          ))}
        </div>
        {prov && (
          <button type="button" className="btn ghost" onClick={() => set({ prov: null })}>
            {prov} ✕
          </button>
        )}
        <button type="button" className="btn" onClick={exportCsv}>{t("exportCsv")}</button>
      </div>

      <p className="summary">
        <span>{t("rows", { n: f.num(rows.length) })}</span>
        <span>{t("totalValue", { v: f.baht(rows.reduce((s, r) => s + r.revenue365, 0)) })}</span>
      </p>

      <DataGrid
        label={t("cust_title")}
        rows={rows}
        columns={columns}
        rowKey={(r) => r.customer.id}
        initialSort={{ id: "rev", dir: "desc" }}
        onOpen={(r) => set({ customer: r.customer.id })}
        rowTone={(r) => (r.atRisk ? "danger" : r.trend < -0.25 && r.revenuePrev90 > 0 ? "warn" : undefined)}
        minWidth={1080}
        empty={t("cust_empty")}
      />

      <Drawer open={!!open} title={open ? open.customer.name[lang] : ""} onClose={() => set({ customer: null })}>
        {open && <CustomerDetail data={data} stats={stats} row={open} onDraft={() => setDraftFor(open)} />}
      </Drawer>

      <DraftDialog data={data} row={draftFor} onClose={() => setDraftFor(null)} />
    </section>
  );
}

function CustomerDetail({ data, stats, row, onDraft }: {
  data: Dataset; stats: CustomerStats[]; row: CustomerStats; onDraft: () => void;
}) {
  const { t, f, lang } = useI18n();
  const crm = getCrm(data);
  const contacts = (crm.contactsByCustomer.get(row.customer.id) ?? []).slice(0, 8);
  const tasks = (crm.tasksByCustomer.get(row.customer.id) ?? []).filter((x) => !x.done);
  const top = useMemo(() => topProductsFor(data, row.customer.id), [data, row]);
  const suggest = useMemo(() => suggestedLines(data, row.customer.id, stats), [data, row, stats]);
  const peak = Math.max(...row.monthly, 1);

  return (
    <div className="detail">
      <dl className="facts">
        <div><dt>{t("col_province")}</dt><dd>{row.customer.province[lang]} · {row.customer.id}</dd></div>
        <div><dt>{t("col_rep")}</dt><dd>{row.rep.name[lang]}</dd></div>
        <div><dt>{t("col_channel")}</dt><dd>{t(channelKey(row.customer.channel))}</dd></div>
        <div><dt>{t("col_terms")}</dt><dd>{row.customer.termsDays ? t("days", { n: row.customer.termsDays }) : t("cash")}</dd></div>
        <div><dt>{t("col_rev365")}</dt><dd className="num">{f.baht(row.revenue365)}<small>{t("margin")} {f.pct(row.margin)}</small></dd></div>
        <div><dt>{t("col_outstanding")}</dt><dd className="num">{row.outstanding ? f.baht(row.outstanding) : "—"}</dd></div>
      </dl>

      <div className="rfm">
        <span className={`tier tier-${row.tier}`}>{row.tier}</span>
        <div className="rfm-scores">
          {([["c_recency", row.recency], ["c_frequency", row.frequency], ["c_monetary", row.monetary]] as const).map(([k, v]) => (
            <div key={k}>
              <span>{t(k)}</span>
              <span className="pips" aria-label={`${v} / 5`}>
                {[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= v ? "on" : undefined} />)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {row.atRisk && (
        <div className="riskbox">
          <h3>{t("c_riskWhy")}</h3>
          <p>{riskReason(row, contacts[0], lang)}</p>
        </div>
      )}

      <h3>{t("c_purchases")}</h3>
      <div className="spark" role="img" aria-label={t("c_purchases")}>
        {row.monthly.map((v, i) => (
          <span key={i} title={f.baht(v)}>
            <i style={{ height: `${Math.max(2, (v / peak) * 100)}%` }} className={v === 0 ? "zero" : undefined} />
          </span>
        ))}
      </div>

      <div className="two-col">
        <div>
          <h3>{t("c_topProducts")}</h3>
          <ul className="plain">
            {top.map((x) => (
              <li key={x.product.sku}>
                <span className="clip">{x.product.name[lang]}</span>
                <span className="num muted">{f.baht(x.revenue)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>{t("c_suggest")}</h3>
          <p className="hint">{t("c_suggestNote")}</p>
          {suggest.length === 0 ? (
            <p className="muted">{t("c_suggestNone")}</p>
          ) : (
            <ul className="plain">
              {suggest.map((x) => (
                <li key={x.product.sku}>
                  <span className="clip">{x.product.name[lang]}</span>
                  <span className="num muted">{t("c_peerShare", { p: f.pct(x.share) })}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <h3>{t("c_tasks")}</h3>
      {tasks.length === 0 ? <p className="muted">{t("c_noTasks")}</p> : (
        <ul className="tasklist">
          {tasks.map((x) => {
            const due = x.dueDay - data.today;
            return (
              <li key={x.id}>
                <span className={`chip tk-${x.kind}`}>{t(("tk_" + x.kind) as Keys)}</span>
                <span className="clip">{crm.repById.get(x.repId)!.name[lang]}</span>
                <span className={due < 0 ? "text-danger" : "muted"}>
                  {due < 0 ? t("task_overdue", { n: -due }) : due === 0 ? t("task_dueToday") : t("task_inDays", { n: due })}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <h3>{t("c_history")}</h3>
      {contacts.length === 0 ? <p className="muted">{t("c_noHistory")}</p> : (
        <ul className="timeline">
          {contacts.map((x) => (
            <li key={x.id}>
              <time className="num">{f.date(x.day)}</time>
              <div>
                <span className={`chip ck-${x.kind}`}>{t(("ck_" + x.kind) as Keys)}</span>
                <p>{x.note[lang]}</p>
                <small>{crm.repById.get(x.repId)!.name[lang]}</small>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="drawer-actions">
        <a className="btn ghost" href={`#/orders?q=${encodeURIComponent(row.customer.name[lang])}&range=all`}>
          {t("c_openOrders")}
        </a>
        {row.outstanding > 0 && (
          <button type="button" className="btn" onClick={onDraft}>{t("ai_draft")}</button>
        )}
      </div>
    </div>
  );
}
