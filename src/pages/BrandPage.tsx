import { ChevronDown, Globe, GitCompareArrows, RefreshCw } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import type { Brand, Channel } from "../../shared/types";
import { useBrand, type BrandState } from "../api";
import { COUNTRIES, logo } from "../format";
import { remember } from "../recent";
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

export function BrandPage({
  brand,
  tab,
  epoch,
  onTab,
  onCompare,
  onCompareWith,
  onCountry,
  onRefresh,
}: {
  brand: Brand;
  tab: Tab;
  epoch: number;
  onTab: (t: Tab) => void;
  onCompare: () => void;
  onCompareWith: (b: Brand) => void;
  onCountry: (country: string) => void;
  onRefresh: () => void;
}) {
  const state = useBrand(brand, epoch);
  useEffect(() => remember(brand), [brand]);
  const tabs: [Tab, string, Channel | null][] = [
    ["overview", "Overview", null],
    ["meta", "Meta ads", "meta"],
    ["google", "Google ads", "google"],
    ["podcasts", "Podcasts", "podcasts"],
    ["creators", "Creators & UGC", "ugc"],
  ];
  const body: Record<Tab, () => ReactNode> = {
    overview: () => <OverviewTab state={state} onCompareWith={onCompareWith} />,
    meta: () => <MetaTab load={state.meta} brandName={brand.name} />,
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
            {state.summary?.status === "ok" && state.summary.data.industry ? (
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
      <div className="tabs" role="tablist">
        {tabs.map(([id, label, ch]) => {
          const n = ch ? count(state, ch) : null;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
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
      </div>
      {body[tab]()}
    </main>
  );
}
