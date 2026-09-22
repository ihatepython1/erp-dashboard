import { useMemo } from "react";
import type { Dataset } from "../data/types";
import { stockRows, type StockRow, type StockState } from "../data/selectors";
import { useI18n } from "../lib/i18n";
import { downloadCsv, setParams, toCsv, type Route } from "../lib/util";
import { DataGrid, type Column } from "../components/DataGrid";

const STATES: StockState[] = ["out", "low", "ok"];
const COVER_SCALE = 45; // days that fill the cover bar

export function Inventory({ data, route }: { data: Dataset; route: Route }) {
  const { t, f, lang } = useI18n();
  const q = route.params.get("q") ?? "";
  const state = (route.params.get("state") ?? "") as StockState | "";
  const category = route.params.get("cat") ?? "";
  const set = (next: Record<string, string | null>) => setParams("/inventory", next);

  const all = useMemo(() => stockRows(data), [data]);
  const categories = useMemo(
    () => [...new Map(data.products.map((p) => [p.category.en, p.category])).values()],
    [data]
  );

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return all.filter((r) => {
      if (state && r.state !== state) return false;
      if (category && r.product.category.en !== category) return false;
      if (!s) return true;
      const p = r.product;
      return [p.sku, p.name.th, p.name.en, p.supplier].some((x) => x.toLowerCase().includes(s));
    });
  }, [all, q, state, category]);

  const value = rows.reduce((s, r) => s + r.value, 0);
  const counts = useMemo(() => ({
    out: all.filter((r) => r.state === "out").length,
    low: all.filter((r) => r.state === "low").length
  }), [all]);

  const columns: Column<StockRow>[] = useMemo(() => [
    { id: "sku", header: t("col_sku"), width: "84px", sort: (r) => r.product.sku, cell: (r) => <span className="num">{r.product.sku}</span> },
    { id: "name", header: t("col_product"), width: "minmax(220px, 2.4fr)", sort: (r) => r.product.name[lang],
      cell: (r) => <span className="clip">{r.product.name[lang]}</span> },
    { id: "cat", header: t("col_category"), width: "minmax(100px, 1fr)", sort: (r) => r.product.category[lang],
      cell: (r) => <span className="clip">{r.product.category[lang]}</span> },
    { id: "onHand", header: t("col_onHand"), width: "76px", align: "end", sort: (r) => r.product.onHand,
      cell: (r) => <span className="num">{f.num(r.product.onHand)}</span> },
    { id: "perDay", header: t("col_perDay"), width: "72px", align: "end", sort: (r) => r.perDay,
      cell: (r) => <span className="num">{f.num1(r.perDay)}</span> },
    { id: "cover", header: t("col_cover"), width: "150px", sort: (r) => r.cover,
      cell: (r) => <Cover row={r} /> },
    { id: "reorder", header: t("col_reorder"), width: "84px", align: "end", sort: (r) => r.reorderPoint,
      cell: (r) => <span className="num muted">{f.num(r.reorderPoint)}</span> },
    { id: "suggest", header: t("col_suggest"), width: "72px", align: "end", sort: (r) => r.suggested,
      cell: (r) => r.suggested ? <span className="num strong">{f.num(r.suggested)}</span> : <span className="muted">—</span> },
    { id: "supplier", header: t("col_supplier"), width: "minmax(110px, 1fr)", sort: (r) => r.product.supplier,
      cell: (r) => <span className="clip">{r.product.supplier}</span> }
  ], [t, f, lang]);

  const exportReorder = () => {
    const list = all.filter((r) => r.suggested > 0).sort((a, b) => a.product.supplier.localeCompare(b.product.supplier));
    downloadCsv("reorder-list.csv", toCsv(
      ["supplier", "sku", "product", "on_hand", "sold_per_day", "reorder_point", "order_qty", "case_pack", "cost_each", "line_cost"],
      list.map((r) => [r.product.supplier, r.product.sku, r.product.name[lang], r.product.onHand, r.perDay.toFixed(1),
                       r.reorderPoint, r.suggested, r.product.casePack, r.product.cost, (r.suggested * r.product.cost).toFixed(2)])
    ));
  };

  return (
    <section>
      <div className="toolbar">
        <input type="search" className="field grow" placeholder={t("inv_search")} aria-label={t("inv_search")}
          value={q} onChange={(e) => set({ q: e.target.value })} />
        <select className="field" aria-label={t("col_category")} value={category} onChange={(e) => set({ cat: e.target.value })}>
          <option value="">{t("allCategories")}</option>
          {categories.map((c) => <option key={c.en} value={c.en}>{c[lang]}</option>)}
        </select>
        <div className="segmented" role="group" aria-label={t("inv_state_all")}>
          <button type="button" aria-pressed={!state} onClick={() => set({ state: null })}>{t("all")}</button>
          {STATES.map((s) => (
            <button key={s} type="button" aria-pressed={state === s} onClick={() => set({ state: s })}>
              {t(`inv_state_${s}` as "inv_state_out")}
              {s !== "ok" && <span className="count">{counts[s]}</span>}
            </button>
          ))}
        </div>
        <button type="button" className="btn" onClick={exportReorder}>{t("inv_exportReorder")}</button>
      </div>

      <p className="summary">
        <span>{t("rows", { n: f.num(rows.length) })}</span>
        <span>{t("inv_value")} {f.baht(value)}</span>
      </p>

      <DataGrid
        label={t("inv_title")}
        rows={rows}
        columns={columns}
        rowKey={(r) => r.product.sku}
        initialSort={{ id: "cover", dir: "asc" }}
        rowTone={(r) => (r.state === "out" ? "danger" : r.state === "low" ? "warn" : undefined)}
        minWidth={1080}
        empty={t("inv_empty")}
      />
    </section>
  );
}

function Cover({ row }: { row: StockRow }) {
  const { t, f } = useI18n();
  if (row.cover === null) return <span className="muted">{t("noSales")}</span>;
  const lead = row.product.leadDays;
  return (
    <span className="cover">
      <span className="cover-track" aria-hidden="true">
        <span className={`cover-fill st-${row.state}`} style={{ width: `${Math.min(100, (row.cover / COVER_SCALE) * 100)}%` }} />
        {/* the tick marks the supplier lead time: stock that ends before it arrives is a stockout */}
        <span className="cover-lead" style={{ left: `${Math.min(100, (lead / COVER_SCALE) * 100)}%` }} />
      </span>
      <span className="num">{t("days", { n: f.num(row.cover) })}</span>
    </span>
  );
}
