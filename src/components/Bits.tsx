import type { Channel, Dataset, Order, OrderStatus } from "../data/types";
import { useI18n, type Keys } from "../lib/i18n";

export const channelKey = (c: Channel) => ("ch_" + c) as Keys;
export const statusKey = (s: OrderStatus) => ("st_" + s) as Keys;

export function StatusChip({ status }: { status: OrderStatus }) {
  const { t } = useI18n();
  return <span className={`chip st-${status}`}>{t(statusKey(status))}</span>;
}

export type Payment = { kind: "paid" } | { kind: "open" } | { kind: "overdue"; days: number } | { kind: "none" };

export function paymentOf(o: Order, today: number): Payment {
  if (o.status === "cancelled") return { kind: "none" };
  if (o.paidDay !== null) return { kind: "paid" };
  return o.dueDay < today ? { kind: "overdue", days: today - o.dueDay } : { kind: "open" };
}

export function PaymentCell({ order, today }: { order: Order; today: number }) {
  const { t } = useI18n();
  const p = paymentOf(order, today);
  if (p.kind === "none") return <span className="muted">—</span>;
  if (p.kind === "paid") return <span className="muted">{t("pay_paid")}</span>;
  if (p.kind === "open") return <span>{t("pay_open")}</span>;
  return <span className={p.days > 60 ? "text-danger" : "text-warn"}>{t("pay_overdue", { n: p.days })}</span>;
}

export function OrderDetail({ order, data }: { order: Order; data: Dataset }) {
  const { t, f, lang } = useI18n();
  const c = data.customerById.get(order.customerId)!;
  const profit = order.total - order.cost;
  return (
    <div className="detail">
      <dl className="facts">
        <div><dt>{t("d_customer")}</dt><dd>{c.name[lang]}<small>{c.province[lang]} · {c.id}</small></dd></div>
        <div><dt>{t("d_ordered")}</dt><dd>{f.dateLong(order.day)}</dd></div>
        <div><dt>{t("col_channel")}</dt><dd>{t(channelKey(order.channel))}</dd></div>
        <div><dt>{t("col_status")}</dt><dd><StatusChip status={order.status} /></dd></div>
        <div><dt>{t("d_due")}</dt><dd>{f.dateLong(order.dueDay)}</dd></div>
        <div><dt>{t("col_payment")}</dt><dd><PaymentCell order={order} today={data.today} /></dd></div>
      </dl>

      <table className="lines">
        <thead>
          <tr>
            <th>{t("col_product")}</th>
            <th className="end">{t("d_qty")}</th>
            <th className="end">{t("d_price")}</th>
            <th className="end">{t("d_amount")}</th>
          </tr>
        </thead>
        <tbody>
          {order.lines.map((l) => {
            const p = data.productBySku.get(l.sku)!;
            return (
              <tr key={l.sku}>
                <td>{p.name[lang]}<small>{p.sku}</small></td>
                <td className="end num">{f.num(l.qty)}</td>
                <td className="end num">{f.bahtExact(l.price)}</td>
                <td className="end num">{f.bahtExact(l.qty * l.price)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr><th colSpan={3}>{t("col_total")}</th><td className="end num strong">{f.bahtExact(order.total)}</td></tr>
          <tr><th colSpan={3}>{t("d_cost")}</th><td className="end num">{f.bahtExact(order.cost)}</td></tr>
          <tr>
            <th colSpan={3}>{t("d_profit")}</th>
            <td className="end num">{f.bahtExact(profit)} <small>{order.total ? f.pct(profit / order.total) : ""}</small></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
