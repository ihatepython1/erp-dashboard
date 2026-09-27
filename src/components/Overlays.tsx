import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useI18n, type Keys } from "../lib/i18n";
import { navigate } from "../lib/util";
import type { Dataset } from "../data/types";
import { askForIntent } from "../ai/client";
import { intentToHref, parseQuestion, type Intent } from "../ai/parse";

/* --------------------------------- Drawer --------------------------------- */
// The native <dialog> gives focus trapping, Escape to close and inert
// background for free, which is most of what makes a drawer accessible.
export function Drawer({ open, title, onClose, children }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useI18n();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal?.();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="drawer"
      aria-label={title}
      onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="drawer-inner">
        <header className="drawer-head">
          <h2>{title}</h2>
          <button type="button" className="btn ghost" onClick={onClose}>{t("close")}</button>
        </header>
        {open && children}
      </div>
    </dialog>
  );
}

/* ----------------------------- Command palette ----------------------------- */
interface Hit { id: string; group: string; label: string; detail: string; href: string }

export function CommandPalette({ data, open, onClose }: { data: Dataset; open: boolean; onClose: () => void }) {
  const { t, lang } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) { setQ(""); setActive(0); d.showModal?.(); input.current?.focus(); }
    if (!open && d.open) d.close();
  }, [open]);

  const pages: Hit[] = useMemo(() => [
    { id: "p-o", group: t("cmd_pages"), label: t("nav_overview"), detail: "", href: "#/" },
    { id: "p-s", group: t("cmd_pages"), label: t("nav_orders"), detail: "", href: "#/orders" },
    { id: "p-i", group: t("cmd_pages"), label: t("nav_inventory"), detail: "", href: "#/inventory" },
    { id: "p-h", group: t("cmd_pages"), label: t("nav_stockHealth"), detail: "", href: "#/stock-health" },
    { id: "p-b", group: t("cmd_pages"), label: t("nav_basket"), detail: "", href: "#/basket" },
    { id: "p-a", group: t("cmd_pages"), label: t("nav_salesAnalysis"), detail: "", href: "#/sales-analysis" },
    { id: "p-r", group: t("cmd_pages"), label: t("nav_receivables"), detail: "", href: "#/receivables" },
    { id: "p-c", group: t("cmd_pages"), label: t("nav_customers"), detail: "", href: "#/customers" }
  ], [t]);

  // A typed question is read into a filter intent. The rules run instantly on
  // every keystroke; if an AI backend exists it is asked too, and its answer
  // replaces the local one when it arrives.
  const [intent, setIntent] = useState<Intent | null>(null);
  useEffect(() => {
    const words = q.trim();
    if (words.length < 6) { setIntent(null); return; }
    setIntent(parseQuestion(words));
    let live = true;
    const id = setTimeout(() => {
      askForIntent(words).then((i) => { if (live) setIntent(i); });
    }, 350);
    return () => { live = false; clearTimeout(id); };
  }, [q]);



  // the reading is shown in the same words the filters use, so a wrong
  // interpretation is obvious at a glance rather than hidden behind param names
  const describe = (i: Intent) => {
    const page = { "/orders": t("nav_orders"), "/inventory": t("nav_inventory"),
                   "/receivables": t("nav_receivables"), "/customers": t("nav_customers") }[i.route];
    const LABEL: Record<string, Keys> = {
      "filter:d90": "ar_d90Only", "filter:overdue": "ar_overdueOnly", "filter:overLimit": "ar_overLimitOnly",
      "state:out": "inv_state_out", "state:low": "inv_state_low", "state:ok": "inv_state_ok",
      "status:packing": "st_packing", "status:shipped": "st_shipped", "status:delivered": "st_delivered",
      "status:cancelled": "st_cancelled",
      "channel:line": "ch_line", "channel:wholesale": "ch_wholesale", "channel:shop": "ch_shop", "channel:online": "ch_online",
      "risk:1": "cust_risk", "tier:A": "cust_tierA", "trend:down": "cust_declining", "tasks:open": "cust_tasksOpen",
      "range:90": "range_90", "range:all": "range_all", "range:30": "range_30"
    };
    const province = (en: string) => data.customers.find((c) => c.province.en === en)?.province[lang] ?? en;
    const bits = Object.entries(i.params).map(([k, v]) => {
      const key = LABEL[`${k}:${v}`];
      if (key) return t(key);
      if (k === "prov") return province(v);
      if (k === "open") return v;
      return `${k}=${v}`;
    });
    return bits.length ? `${page} · ${bits.join(" · ")}` : page;
  };

  const hits = useMemo<Hit[]>(() => {
    const s = q.trim().toLowerCase();
    if (!s) return pages;
    const has = (...xs: string[]) => xs.some((x) => x.toLowerCase().includes(s));
    const out: Hit[] = [];
    if (intent) {
      out.push({
        id: "ai", group: t("ai_ask"), label: `${t("ai_understood")}: ${describe(intent)}`,
        detail: `${intent.source === "model" ? t("ai_byModel") : t("ai_byRules")} · ${Math.round(intent.confidence * 100)}%`,
        href: intentToHref(intent)
      });
    }
    out.push(...pages.filter((p) => has(p.label)));
    for (const c of data.customers) {
      if (out.length > 14) break;
      if (has(c.name.th, c.name.en, c.id))
        out.push({ id: "c-" + c.id, group: t("cmd_customers"), label: c.name[lang], detail: c.province[lang],
                   href: `#/customers?customer=${c.id}` });
    }
    for (const p of data.products) {
      if (out.length > 20) break;
      if (has(p.name.th, p.name.en, p.sku))
        out.push({ id: "s-" + p.sku, group: t("cmd_products"), label: p.name[lang], detail: p.sku,
                   href: `#/inventory?q=${encodeURIComponent(p.sku)}` });
    }
    if (/^so|\d{3,}/i.test(s)) {
      for (let i = data.orders.length - 1; i >= 0 && out.length < 26; i--) {
        const o = data.orders[i]!;
        if (o.id.toLowerCase().includes(s))
          out.push({ id: "o-" + o.id, group: t("cmd_orders"), label: o.id, detail: data.customerById.get(o.customerId)!.name[lang],
                     href: `#/orders?open=${o.id}&range=all` });
      }
    }
    return out;
  }, [q, data, pages, t, lang, intent]);

  useEffect(() => setActive(0), [q]);

  const go = (h: Hit | undefined) => { if (!h) return; onClose(); navigate(h.href); };

  return (
    <dialog ref={ref} className="palette" aria-label={t("search")} onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <input
        ref={input}
        className="palette-input"
        role="combobox"
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={hits[active] ? `${listId}-${active}` : undefined}
        placeholder={t("searchHint")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(hits.length - 1, a + 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          if (e.key === "Enter") { e.preventDefault(); go(hits[active]); }
        }}
      />
      {q.trim().length >= 6 && !intent && (
        <div className="palette-ai"><p className="palette-empty">{t("ai_cant")}</p></div>
      )}
      <ul id={listId} role="listbox" className="palette-list">
        {hits.length === 0 && <li className="palette-empty">{t("noResults")}</li>}
        {hits.map((h, i) => (
          <li
            key={h.id}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            className={`${h.id === "ai" ? "ai-hit " : ""}${i === active ? "active" : ""}`.trim() || undefined}
            onPointerMove={() => setActive(i)}
            onClick={() => go(h)}
          >
            <span className="palette-group">{h.group}</span>
            <span className="palette-label">{h.label}</span>
            {h.detail && <span className="palette-detail">{h.detail}</span>}
          </li>
        ))}
      </ul>
    </dialog>
  );
}
