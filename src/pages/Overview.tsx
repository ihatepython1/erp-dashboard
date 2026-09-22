import { useMemo } from "react";
import type { Dataset } from "../data/types";
import { attention, byChannel, byProvince, change, kpis, revenueByMonth, topProducts, yearToDate, type Attention } from "../data/selectors";
import { useI18n, type Keys } from "../lib/i18n";
import { parts } from "../lib/days";
import { BarList, YearLineChart } from "../components/Charts";
import { channelKey } from "../components/Bits";

export function Overview({ data }: { data: Dataset }) {
  const { t, f, lang } = useI18n();
  const year = parts(data.today).year;

  const k = useMemo(() => kpis(data), [data]);
  const now = useMemo(() => revenueByMonth(data, year), [data, year]);
  const before = useMemo(() => revenueByMonth(data, year - 1), [data, year]);
  const ytd = useMemo(() => yearToDate(data), [data]);
  const channels = useMemo(() => byChannel(data), [data]);
  const provinces = useMemo(() => byProvince(data).slice(0, 6), [data]);
  const top = useMemo(() => topProducts(data), [data]);
  const queue = useMemo(() => attention(data, lang), [data, lang]);

  // the calendar year shown is Buddhist-era in Thai, as on every Thai invoice
  const yearLabel = (y: number) => (lang === "th" ? String(y + 543) : String(y));

  return (
    <div className="overview">
      <section className="kpis" aria-label={t("nav_overview")}>
        <Kpi label={t("kpi_revenue")} value={f.baht(k.revenueMtd)}
             delta={f.signedPct(change(k.revenueMtd, k.revenuePrev))} good={k.revenueMtd >= k.revenuePrev}
             note={t("vsLastMonth")} />
        <Kpi label={t("kpi_margin")} value={f.pct(k.marginMtd)}
             delta={`${k.marginMtd >= k.marginPrev ? "+" : "−"}${f.num1(Math.abs(k.marginMtd - k.marginPrev) * 100)} ${t("points")}`}
             good={k.marginMtd >= k.marginPrev} note={t("vsLastMonth")} />
        <Kpi label={t("kpi_orders")} value={f.num(k.ordersMtd)}
             delta={f.signedPct(change(k.ordersMtd, k.ordersPrev))} good={k.ordersMtd >= k.ordersPrev}
             note={t("vsLastMonth")} />
        <Kpi label={t("kpi_overdue")} value={f.baht(k.overdue)} tone="danger"
             note={t("customersLate", { n: k.overdueCustomers })} />
      </section>

      <div className="split">
        <section className="panel chart-panel">
          <header className="panel-head">
            <h2>{t("chart_title")}</h2>
            <p>
              {t("chart_ytd", { v: f.baht(ytd.now) })}
              <span className={ytd.growth >= 0 ? "text-good" : "text-danger"}>
                {" "}{t("chart_growth", { p: f.signedPct(ytd.growth) })}
              </span>
            </p>
          </header>
          <YearLineChart current={now} previous={before} currentLabel={yearLabel(year)} previousLabel={yearLabel(year - 1)} />
        </section>

        <AttentionQueue items={queue} />
      </div>

      <div className="thirds">
        <section className="panel">
          <header className="panel-head"><h2>{t("channel_title")}</h2><p>{t("last30")}</p></header>
          <BarList format={f.baht}
            items={channels.map((c) => ({ key: c.channel, label: t(channelKey(c.channel)), value: c.revenue, share: c.share }))} />
        </section>
        <section className="panel">
          <header className="panel-head"><h2>{t("province_title")}</h2><p>{t("last30")}</p></header>
          <BarList format={f.baht}
            items={provinces.map((p) => ({ key: p.en, label: p[lang], value: p.revenue, share: p.share }))} />
        </section>
        <section className="panel">
          <header className="panel-head"><h2>{t("products_title")}</h2><p>{t("last30")}</p></header>
          <ol className="toplist">
            {top.map((p) => (
              <li key={p.product.sku}>
                <a href={`#/inventory?q=${p.product.sku}`}>{p.product.name[lang]}</a>
                <span className="num">{f.baht(p.profit)}</span>
                <small>{t("margin")} {f.pct(p.margin)}</small>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value, delta, good, note, tone }: {
  label: string; value: string; delta?: string; good?: boolean; note: string; tone?: "danger";
}) {
  return (
    <div className={`kpi${tone ? " kpi-" + tone : ""}`}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value num">{value}</span>
      <span className="kpi-note">
        {delta && <b className={good ? "text-good" : "text-danger"}>{delta}</b>} {note}
      </span>
    </div>
  );
}

function AttentionQueue({ items }: { items: Attention[] }) {
  const { t, f } = useI18n();
  return (
    <section className="attention" aria-labelledby="att-title">
      <h2 id="att-title">{t("att_title")}</h2>
      {items.length === 0 ? (
        <p className="att-empty">{t("att_empty")}</p>
      ) : (
        <ul>
          {items.map((it) => (
            <li key={it.kind} className={`sev-${it.severity}`}>
              <a href={it.href}>
                <span className="att-what">{t(("att_" + it.kind) as Keys, { n: it.count })}</span>
                <span className="att-amount">{t(("att_" + it.kind + "_amt") as Keys, { v: f.baht(it.amount) })}</span>
                {it.sample.length > 0 && <span className="att-sample">{it.sample.join(", ")}</span>}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
