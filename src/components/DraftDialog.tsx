import { useEffect, useMemo, useRef, useState } from "react";
import type { Dataset } from "../data/types";
import type { CustomerStats } from "../data/crmSelectors";
import { getCrm } from "../data/crm";
import { useI18n, type Lang } from "../lib/i18n";
import { draftFollowUp, type AiMode, type DraftFacts, type Tone } from "../ai/client";

const TONES: Tone[] = ["polite", "firm", "final"];

/**
 * The facts are assembled here, from the ledger, and formatted here. Whatever
 * writes the message — a template offline, a model when a backend exists —
 * only ever receives finished strings, so no figure can be invented.
 */
export function buildFacts(
  data: Dataset, row: CustomerStats, lang: Lang, baht: (v: number) => string
): DraftFacts {
  const unpaid = data.orders
    .filter((o) => o.customerId === row.customer.id && o.status !== "cancelled" && o.paidDay === null)
    .sort((a, b) => a.dueDay - b.dueDay);
  const oldest = unpaid[0];
  const promise = (getCrm(data).contactsByCustomer.get(row.customer.id) ?? []).find((c) => c.kind === "promise");
  return {
    customerName: row.customer.name[lang],
    invoiceCount: unpaid.length,
    total: baht(unpaid.reduce((s, o) => s + o.total, 0)),
    oldestDays: oldest ? Math.max(0, data.today - oldest.dueDay) : 0,
    oldestInvoice: oldest?.id ?? "—",
    ...(promise ? { promise: promise.note[lang] } : {})
  };
}

export function DraftDialog({ data, row, onClose }: { data: Dataset; row: CustomerStats | null; onClose: () => void }) {
  const { t, f, lang } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const [tone, setTone] = useState<Tone>("polite");
  const [text, setText] = useState("");
  const [mode, setMode] = useState<AiMode>("rules");
  const [copied, setCopied] = useState(false);

  const facts = useMemo(() => (row ? buildFacts(data, row, lang, f.baht) : null), [data, row, lang, f]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (row && !d.open) d.showModal?.();
    if (!row && d.open) d.close();
  }, [row]);

  useEffect(() => {
    if (!facts) return;
    let live = true;
    setCopied(false);
    draftFollowUp(facts, tone, lang).then((r) => {
      if (!live) return;
      setText(r.text);
      setMode(r.mode);
    });
    return () => { live = false; };
  }, [facts, tone, lang]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <dialog ref={ref} className="draft" onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="drawer-inner">
        <header className="drawer-head">
          <h2>{t("ai_draftTitle", { name: row?.customer.name[lang] ?? "" })}</h2>
          <button type="button" className="btn ghost" onClick={onClose}>{t("close")}</button>
        </header>

        <div className="segmented" role="group" aria-label={t("ai_tone")}>
          {TONES.map((x) => (
            <button key={x} type="button" aria-pressed={tone === x} onClick={() => setTone(x)}>
              {t(`ai_tone_${x}` as "ai_tone_polite")}
            </button>
          ))}
        </div>

        <textarea className="draft-text" value={text} onChange={(e) => setText(e.target.value)} rows={14}
          aria-label={t("ai_draft")} />

        <p className="hint">
          <span className="chip">{mode === "model" ? t("ai_byModel") : t("ai_byRules")}</span> {t("ai_draftNote")}
        </p>

        <div className="drawer-actions">
          <button type="button" className="btn" onClick={copy}>{copied ? t("ai_copied") : t("ai_copy")}</button>
        </div>
      </div>
    </dialog>
  );
}
