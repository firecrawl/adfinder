import { useCallback, useEffect, useMemo, useState } from "react";
import type { Brand } from "../shared/types";
import { clearMemo, useMe } from "./api";
import { AccountButton, SignInModal } from "./components/Account";
import { SearchBox } from "./components/SearchBox";
import { ThemeToggle } from "./components/ThemeToggle";
import { Wordmark } from "./components/ui";
import { brandParams } from "./format";
import { BrandPage, type Tab } from "./pages/BrandPage";
import { ComparePage } from "./pages/ComparePage";
import { DocsPage } from "./pages/DocsPage";
import { HomePage } from "./pages/HomePage";
import { TermsPage } from "./pages/TermsPage";
import { SessionContext } from "./session";

type Route =
  | { page: "home"; compare: boolean }
  | { page: "brand"; brand: Brand; tab: Tab }
  | { page: "compare"; a: Brand; b: Brand }
  | { page: "docs" }
  | { page: "terms" };

const TABS: Tab[] = ["overview", "meta", "google", "podcasts", "creators"];
const pair = (s: string | null): Brand | null => {
  if (!s) return null;
  const [name = "", domain = ""] = s.split("|");
  return name ? { name, domain } : null;
};

function parse(): Route {
  if (location.pathname === "/docs") return { page: "docs" };
  if (location.pathname === "/terms") return { page: "terms" };
  const p = new URLSearchParams(location.search);
  const a = pair(p.get("a"));
  const b = pair(p.get("b"));
  if (a && b) return { page: "compare", a, b };
  const q = p.get("q");
  if (q) {
    const tab = p.get("tab") as Tab;
    return {
      page: "brand",
      brand: { name: q, domain: p.get("d") ?? "", country: p.get("c") ?? "" },
      tab: TABS.includes(tab) ? tab : "overview",
    };
  }
  return { page: "home", compare: p.has("compare") };
}

function url(r: Route) {
  if (r.page === "home") return r.compare ? "/?compare" : "/";
  if (r.page === "docs") return "/docs";
  if (r.page === "terms") return "/terms";
  if (r.page === "compare")
    return `/?${new URLSearchParams({ a: `${r.a.name}|${r.a.domain}`, b: `${r.b.name}|${r.b.domain}` })}`;
  const p = brandParams(r.brand);
  if (r.tab !== "overview") p.set("tab", r.tab);
  return `/?${p}`;
}

export default function App() {
  const [route, setRoute] = useState<Route>(parse);
  const [epoch, setEpoch] = useState(0);
  const [me, refresh] = useMe();
  const [signIn, setSignIn] = useState<"signin" | "key" | null>(null);

  useEffect(() => {
    const pop = () => setRoute(parse());
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);

  const go = useCallback((r: Route, replace = false) => {
    history[replace ? "replaceState" : "pushState"](null, "", url(r));
    setRoute(r);
    window.scrollTo({ top: 0 });
  }, []);

  // Signing in or out changes what the server can fetch, so the open brand reloads with it.
  const reload = useCallback(async () => {
    clearMemo();
    await refresh();
    setEpoch((e) => e + 1);
  }, [refresh]);
  const session = useMemo(
    () => ({ me, refresh: reload, openSignIn: (m: "signin" | "key" = "signin") => setSignIn(m) }),
    [me, reload],
  );
  const closeSignIn = useCallback(() => setSignIn(null), []);

  const search = (b: Brand) => go({ page: "brand", brand: b, tab: "overview" });
  const home = route.page === "home";

  return (
    <SessionContext.Provider value={session}>
      <header className={`topbar ${home ? "" : "bordered"}`}>
        {!home && <Wordmark onClick={() => go({ page: "home", compare: false })} />}
        {route.page === "brand" && (
          <SearchBox
            key={`${route.brand.name}|${route.brand.domain}`}
            compact
            value={route.brand}
            onPick={search}
          />
        )}
        <span className="spacer" />
        <a
          href="/docs"
          className="navlink"
          aria-current={route.page === "docs" ? "page" : undefined}
          onClick={(e) => {
            e.preventDefault();
            go({ page: "docs" });
          }}
        >
          MCP
        </a>
        <ThemeToggle />
        <AccountButton
          onOpen={(v) =>
            v.kind === "brand" ? search(v.brand) : go({ page: "compare", a: v.a, b: v.b })
          }
        />
      </header>
      {route.page === "home" && (
        <HomePage
          key={String(route.compare)}
          startCompare={route.compare}
          onSearch={search}
          onCompare={(a, b) => go({ page: "compare", a, b })}
        />
      )}
      {route.page === "brand" && (
        <BrandPage
          brand={route.brand}
          tab={route.tab}
          epoch={epoch}
          onTab={(tab) => go({ ...route, tab }, true)}
          onCompare={() => go({ page: "home", compare: true })}
          onCompareWith={(b) =>
            go({ page: "compare", a: { name: route.brand.name, domain: route.brand.domain }, b })
          }
          onCountry={(country) => go({ ...route, brand: { ...route.brand, country } }, true)}
          onRefresh={() => {
            clearMemo();
            setEpoch((e) => e + 1);
          }}
          onResolve={(brand) => go({ ...route, brand }, true)}
        />
      )}
      {route.page === "compare" && (
        <ComparePage
          key={url(route)}
          a={route.a}
          b={route.b}
          onOpenBrand={(brand, tab) => go({ page: "brand", brand, tab })}
        />
      )}
      {route.page === "docs" && <DocsPage />}
      {route.page === "terms" && <TermsPage />}
      <footer className="footer">
        <a href="https://www.firecrawl.dev" target="_blank" rel="noreferrer">
          <img src="/firecrawl.svg" alt="" />
          Powered by Firecrawl
        </a>
        <a
          href="/terms"
          onClick={(e) => {
            e.preventDefault();
            go({ page: "terms" });
          }}
        >
          Terms & privacy
        </a>
      </footer>
      {signIn && <SignInModal mode={signIn} onClose={closeSignIn} />}
    </SessionContext.Provider>
  );
}
