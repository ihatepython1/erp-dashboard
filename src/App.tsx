import { useEffect, useMemo, useState } from "react";
import { getDataset } from "./data/generate";
import { I18nContext, makeFormat, makeT, type Keys, type Lang } from "./lib/i18n";
import { usePreference, useRoute } from "./lib/util";
import { CommandPalette } from "./components/Overlays";
import { Overview } from "./pages/Overview";
import { Orders } from "./pages/Orders";
import { Inventory } from "./pages/Inventory";
import { StockHealth } from "./pages/StockHealth";
import { Basket } from "./pages/Basket";
import { SalesAnalysis } from "./pages/SalesAnalysis";
import { Business } from "./pages/Business";
import { Receivables } from "./pages/Receivables";
import { Customers } from "./pages/Customers";
import { Proposals } from "./pages/Proposals";

const NAV: { path: string; key: Keys }[] = [
  { path: "/", key: "nav_overview" },
  { path: "/sales-analysis", key: "nav_salesAnalysis" },
  { path: "/business", key: "nav_business" },
  { path: "/orders", key: "nav_orders" },
  { path: "/inventory", key: "nav_inventory" },
  { path: "/stock-health", key: "nav_stockHealth" },
  { path: "/basket", key: "nav_basket" },
  { path: "/receivables", key: "nav_receivables" },
  { path: "/customers", key: "nav_customers" },
  { path: "/proposals", key: "nav_proposals" }
];

type Theme = "light" | "dark";
const systemTheme = (): Theme =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

export default function App() {
  const data = useMemo(getDataset, []);
  const route = useRoute();
  const [lang, setLang] = usePreference<Lang>("erp.lang", "th");
  const [theme, setTheme] = usePreference<Theme>("erp.theme", systemTheme());
  const [palette, setPalette] = useState(false);

  const i18n = useMemo(() => ({ lang, t: makeT(lang), f: makeFormat(lang) }), [lang]);
  const { t, f } = i18n;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = lang;
  }, [theme, lang]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /input|select|textarea/i.test((e.target as HTMLElement).tagName);
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setPalette(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const current = NAV.find((n) => n.path === route.path) ?? NAV[0]!;
  useEffect(() => { document.title = `${t(current.key)} — ${t("appName")}`; }, [current, t]);

  const page =
    route.path === "/business" ? <Business data={data} /> :
    route.path === "/sales-analysis" ? <SalesAnalysis data={data} /> :
    route.path === "/orders" ? <Orders data={data} route={route} /> :
    route.path === "/inventory" ? <Inventory data={data} route={route} /> :
    route.path === "/stock-health" ? <StockHealth data={data} /> :
    route.path === "/basket" ? <Basket data={data} /> :
    route.path === "/receivables" ? <Receivables data={data} route={route} /> :
    route.path === "/customers" ? <Customers data={data} route={route} /> :
    route.path === "/proposals" ? <Proposals data={data} /> :
    <Overview data={data} />;

  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <I18nContext.Provider value={i18n}>
      <div className="shell">
        <aside className="side">
          <a className="brand" href="#/">
            <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
              <rect width="32" height="32" rx="6" className="brand-mark" />
              <path d="M8 22V10h4v5l5-5h5l-6 6 6 6h-5l-5-5v5z" fill="#fff" />
            </svg>
            <span>
              <b>{t("appName")}</b>
              <small>{t("appTag")}</small>
            </span>
          </a>
          <nav aria-label="Main">
            {NAV.map((n) => (
              <a key={n.path} href={"#" + n.path} aria-current={current.path === n.path ? "page" : undefined}>
                {t(n.key)}
              </a>
            ))}
          </nav>
          <div className="side-foot">
            <button type="button" className="btn ghost" onClick={() => setLang(lang === "th" ? "en" : "th")}>
              {t("language")}
            </button>
            <button type="button" className="btn ghost icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label={t("theme")} title={t("theme")}>
              {theme === "dark" ? "☀" : "☾"}
            </button>
          </div>
        </aside>

        <main className="main">
          <header className="top">
            <div>
              <h1>{t(current.key)}</h1>
              <p className="asof">{t("asOf")} {f.dateLong(data.today)}</p>
            </div>
            <button type="button" className="searchbtn" onClick={() => setPalette(true)}>
              <span>{t("searchHint")}</span>
              <kbd>{isMac ? "⌘" : "Ctrl"} K</kbd>
            </button>
          </header>
          {page}
        </main>
      </div>
      <CommandPalette data={data} open={palette} onClose={() => setPalette(false)} />
    </I18nContext.Provider>
  );
}
