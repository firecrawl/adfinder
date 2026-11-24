import { Check, ChevronDown, Globe, GitCompareArrows, Lock, RefreshCw, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CACHE_POLICY, CHANNEL_INFO, CHANNEL_LIST } from "../../shared/channels";
import type { Brand, Channel } from "../../shared/types";
import { track } from "../analytics";
import { api, useBrand, type BrandState } from "../api";
import { Empty, SignInPrompt } from "../components/ui";
import { NextSteps } from "../nextSteps";
import { COUNTRIES, logo } from "../format";
import { remember } from "../recent";
import { useSession } from "../session";
import { CreatorsTab } from "../tabs/CreatorsTab";
import { GoogleTab } from "../tabs/GoogleTab";
import { MetaTab } from "../tabs/MetaTab";
import { OverviewTab } from "../tabs/OverviewTab";
import { PodcastsTab } from "../tabs/PodcastsTab";

export type Tab = "overview" | "meta" | "google" | "podcasts" | "creators";

const count = (s: BrandState, ch: Channel): number | null => {
  const l = s[ch];
  if (l.status !== "ok") return null;
  const d = l.data;
  return "ads" in d
    ? d.ads.length
    : "posts" in d
      ? d.posts.length
      : "reads" in d
        ? (d.sponsor?.ads ?? 0)
        : null;
};

type BrandPageProps = {
  brand: Brand;
  tab: Tab;
  epoch: number;
  onTab: (t: Tab) => void;
  onCompare: () => void;
  onCompareWith: (b: Brand) => void;
  onCountry: (country: string) => void;
  onRefresh: () => void;
  onResolve: (b: Brand) => void;
};

// A brand typed without a website gets one looked up first, so the ad sources can match on the
// domain instead of the name alone.
export function BrandPage(props: BrandPageProps) {
  const { brand, onResolve } = props;
  const [nameOnly, setNameOnly] = useState<string | null>(null);
  if (!brand.domain && nameOnly !== brand.name)
    return (
      <FindSite
        key={brand.name}
        name={brand.name}
        onFound={(domain) => (domain ? onResolve({ ...brand, domain }) : setNameOnly(brand.name))}
      />
    );
  return <BrandView {...props} />;
}

function FindSite({ name, onFound }: { name: string; onFound: (domain: string) => void }) {
  const [signIn, setSignIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const found = useEffectEvent(onFound);
  useEffect(() => {
    api<{ domain: string }>("/api/resolve", { name }).then(
      (r) => found(r.domain),
      (e: Error & { auth?: string }) => (e.auth ? setSignIn(true) : setError(e.message)),
    );
  }, [name]);
  return (
    <main className="page">
      {signIn ? (
        <SignInPrompt />
      ) : error ? (
        <Empty title={`Couldn't look up ${name}`}>{error}</Empty>
      ) : (
        <div className="finding">
          <span className="spin" />
          Finding {name}'s website with Firecrawl…
        </div>
      )}
    </main>
  );
}

function BrandView({
  brand,
  tab,
  epoch,
  onTab,
  onCompare,
  onCompareWith,
  onCountry,
  onRefresh,
}: BrandPageProps) {
  const state = useBrand(brand, epoch);
  const next = useMemo(
    () => ({ retry: onRefresh, worldwide: brand.country ? () => onCountry("") : null }),
    [onRefresh, onCountry, brand.country],
  );
  useEffect(() => {
    remember(brand);
    track("brand_viewed", { brand: brand.domain || brand.name, country: brand.country ?? "" });
  }, [brand]);
  const tabs: [Tab, string, Channel | null][] = [
    ["overview", "Overview", null],
    ["meta", "Meta ads", "meta"],
    ["google", "Google ads", "google"],
    ["podcasts", "Podcasts", "podcasts"],
    ["creators", "Creators & UGC", "ugc"],
  ];
  const body: Record<Tab, () => ReactNode> = {
    overview: () => <OverviewTab state={state} onCompareWith={onCompareWith} />,
    meta: () => <MetaTab load={state.meta} hooks={state.hooks} brandName={brand.name} />,
    google: () => <GoogleTab load={state.google} brandName={brand.name} />,
    podcasts: () => (
      <PodcastsTab load={state.podcasts} brandName={brand.name} global={!!brand.country} />
    ),
    creators: () => <CreatorsTab load={state.ugc} brand={brand} />,
  };
  return (
    <main className="page">
      <div className="hero">
        {brand.domain && <img className="mark" src={logo(brand.domain)} alt="" />}
        <div>
          <h1>{brand.name}</h1>
          <div className="sub">
            {brand.domain && (
              <a href={`https://${brand.domain}`} target="_blank" rel="noreferrer">
                {brand.domain}
              </a>
            )}
            {state.summary.status === "ok" && state.summary.data.industry ? (
              <span className="industry">{state.summary.data.industry}</span>
            ) : (
              <span>Ads, sponsorships & creators</span>
            )}
          </div>
        </div>
        <div className="acts">
          <label className="country">
            <Globe size={15} aria-hidden="true" />
            <select
              aria-label="Country"
              value={brand.country ?? ""}
              onChange={(e) => onCountry(e.target.value)}
            >
              {COUNTRIES.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
            <ChevronDown size={15} className="caret" aria-hidden="true" />
          </label>
          <button className="btn outline" onClick={onRefresh} title="Re-run from cache">
            <RefreshCw size={15} />
          </button>
          <button className="btn outline" onClick={onCompare}>
            <GitCompareArrows size={16} />
            Compare
          </button>
        </div>
      </div>
      <Tabs ids={tabs.map(([id]) => id)} tab={tab} onTab={onTab}>
        {tabs.map(([id, label, ch]) => {
          const n = ch ? count(state, ch) : null;
          return (
            <button
              key={id}
              id={`tab-${id}`}
              role="tab"
              aria-selected={tab === id}
              aria-controls="tabpanel"
              tabIndex={tab === id ? 0 : -1}
              className={`tab ${tab === id ? "on" : ""}`}
              onClick={() => onTab(id)}
            >
              {label}
              {ch && state[ch].status === "loading" ? (
                <span className="spin" />
              ) : (
                n != null && <span className="n">{n}</span>
              )}
            </button>
          );
        })}
      </Tabs>
      <Progress state={state} />
      <div id="tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        <NextSteps.Provider value={next}>{body[tab]()}</NextSteps.Provider>
      </div>
    </main>
  );
}

const KEYS: Record<string, (i: number, n: number) => number> = {
  ArrowRight: (i, n) => (i + 1) % n,
  ArrowLeft: (i, n) => (i - 1 + n) % n,
  Home: () => 0,
  End: (_, n) => n - 1,
};

// The tab row scrolls sideways on narrow screens: it fades at whichever edge has more tabs, keeps the
// open tab in view, and moves between tabs with the arrow keys.
function Tabs({
  ids,
  tab,
  onTab,
  children,
}: {
  ids: Tab[];
  tab: Tab;
  onTab: (t: Tab) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState("");
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setEdges(`${left ? "fade-left" : ""} ${right ? "fade-right" : ""}`);
  }, []);
  useEffect(() => {
    ref.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    measure();
  }, [tab, measure]);
  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);
  return (
    <div
      ref={ref}
      className={`tabs ${edges}`}
      role="tablist"
      aria-label="Channels"
      tabIndex={-1}
      onScroll={measure}
      onKeyDown={(e) => {
        const move = KEYS[e.key];
        if (!move) return;
        e.preventDefault();
        const next = ids[move(ids.indexOf(tab), ids.length)]!;
        onTab(next);
        document.getElementById(`tab-${next}`)?.focus();
      }}
    >
      {children}
    </div>
  );
}

// Each channel's provider and progress while a brand loads, and what an uncached search costs.
function Progress({ state }: { state: BrandState }) {
  const { me } = useSession();
  if (!CHANNEL_LIST.some((ch) => state[ch].status === "loading")) return null;
  const uncached = state.cached ? CHANNEL_LIST.filter((ch) => !state.cached!.includes(ch)) : [];
  const credits = uncached.reduce((n, ch) => n + CHANNEL_INFO[ch].credits, 0);
  const firstSearch = uncached.some((ch) => CACHE_POLICY[ch] === "shared");
  return (
    <div className="progress" aria-live="polite">
      <ul>
        {CHANNEL_LIST.map((ch) => {
          const l = state[ch];
          return (
            <li key={ch} className={l.status}>
              {l.status === "loading" ? (
                <span className="spin" />
              ) : l.status === "ok" ? (
                <Check size={14} aria-label="loaded" />
              ) : l.auth === "missing" ? (
                <Lock size={14} aria-label="needs sign-in" />
              ) : (
                <X size={14} aria-label="failed" />
              )}
              {CHANNEL_INFO[ch].label}
              <small>{CHANNEL_INFO[ch].provider}</small>
            </li>
          );
        })}
      </ul>
      {me?.connected && credits > 0 && (
        <p>
          {firstSearch
            ? `Nobody has searched this brand yet. About ${credits.toLocaleString()} credits from your Firecrawl account.`
            : `Podcasts and traffic load fresh on every visit: about ${credits.toLocaleString()} credits from your Firecrawl account.`}
        </p>
      )}
    </div>
  );
}
