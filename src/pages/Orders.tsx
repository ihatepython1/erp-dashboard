import { useMemo } from "react";
import type { Channel, Dataset, Order, OrderStatus } from "../data/types";
import { useI18n } from "../lib/i18n";
import { downloadCsv, setParams, toCsv, type Route } from "../lib/util";
import { DataGrid, type Column } from "../components/DataGrid";
import { Drawer } from "../components/Overlays";
import { OrderDetail, PaymentCell, StatusChip, channelKey, paymentOf, statusKey } from "../components/Bits";

const STATUSES: OrderStatus[] = ["packing", "shipped", "delivered", "cancelled"];
const CHANNELS: Channel[] = ["wholesale", "shop", "online", "line"];
const RANGES = { "30": 30, "90": 90, all: Infinity } as const;
type RangeKey = keyof typeof RANGES;

export function Orders({ data, route }: { data: Dataset; route: Route }) {
  const { t, f, lang } = useI18n();
  const p = route.params;
  const q = p.get("q") ?? "";
  const status = (p.get("status") ?? "") as OrderStatus | "";
  const channel = (p.get("channel") ?? "") as Channel | "";
  const range = ((p.get("range") ?? "30") in RANGES ? p.get("range") ?? "30" : "30") as RangeKey;
  const openId = p.get("open");
  const set = (next: Record<string, string | null>) => setParams("/orders", next);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const since = data.today - RANGES[range];
    const out: Order[] = [];
    for (let i = data.orders.length - 1; i >= 0; i--) {
      const o = data.orders[i]!;
      if (o.day <= since) break;               // orders are stored oldest first
      if (status && o.status !== status) continue;
      if (channel && o.channel !== channel) continue;
      if (s) {
        const c = data.customerById.get(o.customerId)!;
        if (!o.id.toLowerCase().includes(s) && !c.name.th.toLowerCase().includes(s) && !c.name.en.toLowerCase().includes(s)) continue;
      }
      out.push(o);
    }
    return out;
  }, [data, q, status, channel, range]);

  const total = useMemo(() => rows.reduce((s, o) => s + (o.status === "cancelled" ? 0 : o.total), 0), [rows]);
  const open = openId ? data.orders.find((o) => o.id === openId) ?? null : null;

  const columns: Column<Order>[] = useMemo(() => [
    { id: "id", header: t("col_order"), width: "118px", sort: (o) => o.id, cell: (o) => <span className="num">{o.id}</span> },
    { id: "day", header: t("col_date"), width: "108px", sort: (o) => o.day, cell: (o) => f.date(o.day) },
    { id: "customer", header: t("col_customer"), width: "minmax(180px, 2fr)",
      sort: (o) => data.customerById.get(o.customerId)!.name[lang],
      cell: (o) => <span className="clip">{data.customerById.get(o.customerId)!.name[lang]}</span> },
    { id: "province", header: t("col_province"), width: "minmax(96px, 1fr)",
      sort: (o) => data.customerById.get(o.customerId)!.province[lang],
      cell: (o) => <span className="clip">{data.customerById.get(o.customerId)!.province[lang]}</span> },
    { id: "channel", header: t("col_channel"), width: "100px", sort: (o) => o.channel, cell: (o) => t(channelKey(o.channel)) },
    { id: "lines", header: t("col_items"), width: "52px", align: "end", sort: (o) => o.lines.length, cell: (o) => o.lines.length },
    { id: "total", header: t("col_total"), width: "104px", align: "end", sort: (o) => o.total,
      cell: (o) => <span className="num">{f.baht(o.total)}</span> },
    { id: "status", header: t("col_status"), width: "100px", sort: (o) => o.status, cell: (o) => <StatusChip status={o.status} /> },
    { id: "pay", header: t("col_payment"), width: "120px",
      sort: (o) => { const pm = paymentOf(o, data.today); return pm.kind === "overdue" ? 1000 + pm.days : pm.kind === "open" ? 1 : 0; },
      cell: (o) => <PaymentCell order={o} today={data.today} /> }
  ], [t, f, lang, data]);

  const exportCsv = () => {
    const header = ["order", "date", "customer_id", "customer", "province", "channel", "lines", "total", "status", "due", "paid"];
    const body = rows.map((o) => {
      const c = data.customerById.get(o.customerId)!;
      return [o.id, f.date(o.day), c.id, c.name[lang], c.province[lang], o.channel, o.lines.length,
              o.total.toFixed(2), o.status, f.date(o.dueDay), o.paidDay === null ? "" : f.date(o.paidDay)];
    });
    downloadCsv(`sales-orders-${range}.csv`, toCsv(header, body));
  };

  return (
    <section>
      <div className="toolbar">
        <input type="search" className="field grow" placeholder={t("orders_search")} aria-label={t("orders_search")}
          value={q} onChange={(e) => set({ q: e.target.value })} />
        <select className="field" aria-label={t("col_status")} value={status} onChange={(e) => set({ status: e.target.value })}>
          <option value="">{t("allStatuses")}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{t(statusKey(s))}</option>)}
        </select>
        <select className="field" aria-label={t("col_channel")} value={channel} onChange={(e) => set({ channel: e.target.value })}>
          <option value="">{t("allChannels")}</option>
          {CHANNELS.map((c) => <option key={c} value={c}>{t(channelKey(c))}</option>)}
        </select>
        <div className="segmented" role="group" aria-label={t("col_date")}>
          {(Object.keys(RANGES) as RangeKey[]).map((r) => (
            <button key={r} type="button" aria-pressed={range === r} onClick={() => set({ range: r })}>
              {t(`range_${r}` as "range_30")}
            </button>
          ))}
        </div>
        <button type="button" className="btn" onClick={exportCsv} disabled={!rows.length}>{t("exportCsv")}</button>
      </div>

      <p className="summary">
        <span>{t("rows", { n: f.num(rows.length) })}</span>
        <span>{t("totalValue", { v: f.baht(total) })}</span>
      </p>

      <DataGrid
        label={t("orders_title")}
        rows={rows}
        columns={columns}
        rowKey={(o) => o.id}
        initialSort={{ id: "day", dir: "desc" }}
        onOpen={(o) => set({ open: o.id })}
        rowTone={(o) => { const pm = paymentOf(o, data.today); return pm.kind === "overdue" && pm.days > 60 ? "danger" : undefined; }}
        minWidth={1080}
        empty={t("orders_empty")}
      />

      <Drawer open={!!open} title={open ? t("d_order", { id: open.id }) : ""} onClose={() => set({ open: null })}>
        {open && <OrderDetail order={open} data={data} />}
      </Drawer>
    </section>
  );
}
