import { useMemo } from "react";
import type { Dataset } from "../data/types";
import { aging, BUCKETS, type AgingRow, type Bucket } from "../data/selectors";
import { useI18n, type Keys } from "../lib/i18n";
import { setParams, type Route } from "../lib/util";
import { DataGrid, type Column } from "../components/DataGrid";
import { AgingBar } from "../components/Charts";
import { Drawer } from "../components/Overlays";
import { PaymentCell } from "../components/Bits";

const FILTERS = ["all", "overdue", "d90", "overLimit"] as const;
type Filter = (typeof FILTERS)[number];
const FILTER_LABEL: Record<Filter, Keys> = { all: "ar_all", overdue: "ar_overdueOnly", d90: "ar_d90Only", overLimit: "ar_overLimitOnly" };
const bucketKey = (b: Bucket) => ("b_" + b) as Keys;

export function Receivables({ data, route }: { data: Dataset; route: Route }) {
  const { t, f, lang } = useI18n();
  const raw = route.params.get("filter") ?? "all";
  const filter: Filter = (FILTERS as readonly string[]).includes(raw) ? (raw as Filter) : "all";
  const openId = route.params.get("customer");
  const set = (next: Record<string, string | null>) => setParams("/receivables", next);

  const ledger = useMemo(() => aging(data), [data]);
  const rows = useMemo(() => ledger.rows.filter((r) =>
    filter === "overdue" ? r.oldestDays > 0 :
    filter === "d90" ? r.buckets.d90 > 0 :
    filter === "overLimit" ? r.overLimit : true
  ), [ledger, filter]);
  const open = openId ? ledger.rows.find((r) => r.customer.id === openId) ?? null : null;

  const columns: Column<AgingRow>[] = useMemo(() => [
    { id: "name", header: t("col_customer"), width: "minmax(200px, 2fr)", sort: (r) => r.customer.name[lang],
      cell: (r) => (
        <span className="clip">
          {r.customer.name[lang]}
          {r.overLimit && <span className="chip st-over">{t("overLimit")}</span>}
        </span>
      ) },
    { id: "prov", header: t("col_province"), width: "minmax(88px, 1fr)", sort: (r) => r.customer.province[lang],
      cell: (r) => <span className="clip">{r.customer.province[lang]}</span> },
    { id: "terms", header: t("col_terms"), width: "76px", align: "end", sort: (r) => r.customer.termsDays,
      cell: (r) => r.customer.termsDays ? t("days", { n: r.customer.termsDays }) : t("cash") },
    ...BUCKETS.map<Column<AgingRow>>((b, i) => ({
      id: b, header: t(bucketKey(b)), width: "100px", align: "end", sort: (r) => r.buckets[b],
      cell: (r) => r.buckets[b] ? <span className={`num age-text-${i}`}>{f.baht(r.buckets[b])}</span> : <span className="muted">—</span>
    })),
    { id: "total", header: t("col_outstanding"), width: "112px", align: "end", sort: (r) => r.total,
      cell: (r) => <span className="num strong">{f.baht(r.total)}</span> }
  ], [t, f, lang]);

  return (
    <section>
      <div className="panel ar-summary">
        <header className="panel-head">
          <h2>{t("ar_total")}</h2>
          <p className="num big">{f.baht(ledger.total)}</p>
        </header>
        <AgingBar total={ledger.total}
          parts={BUCKETS.map((b) => ({ key: b, label: t(bucketKey(b)), value: ledger.totals[b] }))} />
      </div>

      <div className="toolbar">
        <div className="segmented" role="group" aria-label={t("ar_only")}>
          {FILTERS.map((x) => (
            <button key={x} type="button" aria-pressed={filter === x} onClick={() => set({ filter: x === "all" ? null : x })}>
              {t(FILTER_LABEL[x])}
            </button>
          ))}
        </div>
      </div>

      <p className="summary">
        <span>{t("rows", { n: f.num(rows.length) })}</span>
        <span>{t("totalValue", { v: f.baht(rows.reduce((s, r) => s + r.total, 0)) })}</span>
      </p>

      <DataGrid
        label={t("ar_title")}
        rows={rows}
        columns={columns}
        rowKey={(r) => r.customer.id}
        initialSort={{ id: "d90", dir: "desc" }}
        onOpen={(r) => set({ customer: r.customer.id })}
        rowTone={(r) => (r.buckets.d90 > 0 ? "danger" : r.overLimit ? "warn" : undefined)}
        minWidth={1080}
        empty={t("ar_empty")}
      />

      <Drawer open={!!open} title={open ? open.customer.name[lang] : ""} onClose={() => set({ customer: null })}>
        {open && (
          <div className="detail">
            <dl className="facts">
              <div><dt>{t("col_province")}</dt><dd>{open.customer.province[lang]}</dd></div>
              <div><dt>{t("col_terms")}</dt><dd>{open.customer.termsDays ? t("days", { n: open.customer.termsDays }) : t("cash")}</dd></div>
              <div><dt>{t("col_limit")}</dt><dd className="num">{open.customer.creditLimit ? f.baht(open.customer.creditLimit) : "—"}</dd></div>
              <div><dt>{t("col_outstanding")}</dt><dd className={`num${open.overLimit ? " text-danger" : ""}`}>{f.baht(open.total)}</dd></div>
            </dl>
            <h3>{t("d_invoices")}</h3>
            <table className="lines">
              <thead>
                <tr><th>{t("col_order")}</th><th>{t("d_due")}</th><th className="end">{t("col_total")}</th><th>{t("col_payment")}</th></tr>
              </thead>
              <tbody>
                {[...open.invoices].sort((a, b) => a.dueDay - b.dueDay).map((o) => (
                  <tr key={o.id}>
                    <td><a className="num" href={`#/orders?open=${o.id}&range=all`}>{o.id}</a></td>
                    <td>{f.date(o.dueDay)}</td>
                    <td className="end num">{f.baht(o.total)}</td>
                    <td><PaymentCell order={o} today={data.today} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Drawer>
    </section>
  );
}
