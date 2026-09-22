import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useI18n } from "../lib/i18n";
import { navigate } from "../lib/util";
import type { Dataset } from "../data/types";

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
    { id: "p-r", group: t("cmd_pages"), label: t("nav_receivables"), detail: "", href: "#/receivables" }
  ], [t]);

  const hits = useMemo<Hit[]>(() => {
    const s = q.trim().toLowerCase();
    if (!s) return pages;
    const has = (...xs: string[]) => xs.some((x) => x.toLowerCase().includes(s));
    const out: Hit[] = pages.filter((p) => has(p.label));
    for (const c of data.customers) {
      if (out.length > 14) break;
      if (has(c.name.th, c.name.en, c.id))
        out.push({ id: "c-" + c.id, group: t("cmd_customers"), label: c.name[lang], detail: c.province[lang],
                   href: `#/orders?q=${encodeURIComponent(c.name[lang])}&range=all` });
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
  }, [q, data, pages, t, lang]);

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
      <ul id={listId} role="listbox" className="palette-list">
        {hits.length === 0 && <li className="palette-empty">{t("noResults")}</li>}
        {hits.map((h, i) => (
          <li
            key={h.id}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            className={i === active ? "active" : undefined}
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
