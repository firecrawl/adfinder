import { Calculator, ExternalLink, Languages } from "lucide-react";
import { useState } from "react";
import { creatorSpend, creatorTier, isSponsored, postCost } from "../../shared/spend";
import type { Brand, Translations, UgcData, UgcPost } from "../../shared/types";
import { useTranslations, type Load } from "../api";
import { AdBrowser } from "../components/AdCard";
import {
  Accordion,
  AdSkeletons,
  Card,
  Empty,
  Facts,
  Loaded,
  SectionTitle,
  Sheet,
  Stat,
} from "../components/ui";
import { compact, date, pct, usdRange } from "../format";

type Filter = "all" | "paid" | "own";
const FILTERS: [Filter, string][] = [
  ["all", "All"],
  ["paid", "Paid creators"],
  ["own", "Brand's own"],
];
const keep = (f: Filter) => (p: UgcPost) =>
  f === "all" || (f === "paid" ? p.paid && !p.own : p.own);

type English = Translations["posts"] | null;
const hookOf = (p: UgcPost, en: English) => en?.[p.id]?.hook ?? p.hook;

function PlatformLogo({ platform }: { platform: UgcPost["platform"] }) {
  const tiktok = platform === "tiktok";
  return (
    <span className="badge platform" title={tiktok ? "TikTok" : "Instagram"}>
      <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
        {tiktok ? (
          <path
            fill="currentColor"
            d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"
          />
        ) : (
          <g fill="none" stroke="currentColor" strokeWidth="2.2">
            <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
            <circle cx="12" cy="12" r="4.3" />
            <circle cx="17.6" cy="6.4" r="0.6" fill="currentColor" />
          </g>
        )}
      </svg>
    </span>
  );
}

function PostDetail({ post: p, en }: { post: UgcPost; en: English }) {
  const t = en?.[p.id];
  return (
    <>
      {p.thumb && <img className="big" src={p.thumb} alt="" />}
      <div>
        <h4>Hook</h4>
        <p className="quote">“{t?.hook ?? p.hook}”</p>
        {t && <p className="faint original">Original: “{p.hook}”</p>}
      </div>
      <Facts
        items={[
          ["Views", compact(p.views)],
          ["Likes", compact(p.likes)],
          ["Engagement", pct(p.engagement, 1)],
          ["Creator followers", `${compact(p.followers)} · ${creatorTier(p.followers)}`],
          ...(isSponsored(p)
            ? [["Estimated cost", usdRange(postCost(p))] as [string, string]]
            : []),
          ["Posted", date(p.published)],
          ["Type", p.own ? "Brand account" : p.paid ? "Paid creator" : "Organic mention"],
        ]}
      />
      <div>
        <h4>Caption{t ? " (English)" : ""}</h4>
        <p className="prose">{t?.caption ?? p.caption}</p>
      </div>
      {p.transcript && (
        <div>
          <h4>Transcript</h4>
          <p className="prose">{p.transcript}</p>
        </div>
      )}
      <a className="btn outline" href={p.url} target="_blank" rel="noreferrer">
        Open post <ExternalLink size={14} />
      </a>
    </>
  );
}
const sheetTitle = (p: UgcPost) =>
  `@${p.handle} on ${p.platform === "tiktok" ? "TikTok" : "Instagram"}`;

export function PostGrid({
  posts,
  en = null,
  limit,
  filters = FILTERS,
}: {
  posts: UgcPost[];
  en?: English;
  limit?: number;
  filters?: [Filter, string][];
}) {
  return (
    <AdBrowser
      items={posts}
      filters={filters}
      keep={keep}
      limit={limit}
      card={(p) => ({
        image: p.thumb,
        text: `“${hookOf(p, en)}”`,
        video: true,
        badges: (
          <>
            <PlatformLogo platform={p.platform} />
            {p.paid && <span className="badge">Paid</span>}
            {p.own && <span className="badge">Brand</span>}
          </>
        ),
        title: `“${hookOf(p, en)}”`,
        sub: `@${p.handle} · ${compact(p.followers)} followers`,
        foot: (
          <>
            <b style={{ color: "var(--text)" }}>{compact(p.views)} views</b>
            <span>{pct(p.engagement, 1)} eng.</span>
          </>
        ),
      })}
      sheet={(p) => ({ title: sheetTitle(p), body: <PostDetail post={p} en={en} /> })}
    />
  );
}

function EnglishToggle({
  on,
  load,
  onChange,
}: {
  on: boolean;
  load: Load<Translations> | null;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      className={`btn outline toggle ${on ? "on" : ""}`}
      aria-pressed={on}
      onClick={() => onChange(!on)}
    >
      {on && load?.status === "loading" ? <span className="spin" /> : <Languages size={15} />}
      {on ? "Showing English" : "Show in English"}
    </button>
  );
}

export function CreatorsTab({ load, brand }: { load: Load<UgcData>; brand: Brand }) {
  const [hook, setHook] = useState<UgcPost | null>(null);
  const [english, setEnglish] = useState(false);
  const tr = useTranslations(brand, english);
  const en: English = tr?.status === "ok" ? tr.data.posts : null;
  return (
    <Loaded load={load} skeleton={<AdSkeletons />}>
      {(d) =>
        !d.posts.length ? (
          <Empty title={`No creator posts found for ${brand.name}`}>
            Oriane's TikTok and Instagram index has no posts mentioning this brand.
          </Empty>
        ) : (
          <>
            <div className="stats">
              <Stat
                label="Views on top posts"
                value={compact(d.totalViews)}
                color="var(--series-ugc)"
              />
              <Stat label="Posts found" value={d.totalPosts} />
              <Stat
                label="Marked as ads"
                value={pct(d.posts.filter((p) => p.paid).length / d.posts.length)}
                sub="#ad, sponsored, Anzeige…"
              />
              <Stat
                label="Estimated creator spend"
                value={usdRange(creatorSpend(d.posts).range)}
                sub={`${creatorSpend(d.posts).posts} sponsored posts · 2026 rate cards`}
              />
            </div>
            <div className="card" style={{ marginBottom: 22 }}>
              <Accordion
                icon={
                  <span className="ico" style={{ background: "var(--surface-2)" }}>
                    <Calculator size={15} />
                  </span>
                }
                title="How the spend estimate works"
              >
                <SpendMethod />
              </Accordion>
            </div>
            <Card
              title="Hooks that worked"
              meta={
                d.posts.some((p) => p.language && p.language !== "en") ? (
                  <EnglishToggle on={english} load={tr} onChange={setEnglish} />
                ) : (
                  "opening lines of the most-viewed posts"
                )
              }
            >
              {tr?.status === "error" && <p className="err">{tr.error}</p>}
              <div className="list">
                {d.posts.slice(0, 6).map((p, i) => (
                  <button className="row" key={p.id} onClick={() => setHook(p)}>
                    <span className="rank">{i + 1}</span>
                    <div className="main">
                      <div className="t">“{hookOf(p, en)}”</div>
                      <div className="d">
                        @{p.handle} · {p.platform} · {date(p.published)}
                        {en?.[p.id] && ` · translated from ${p.language?.toUpperCase()}`}
                      </div>
                    </div>
                    <div className="num">
                      {compact(p.views)}
                      <small>views</small>
                    </div>
                  </button>
                ))}
              </div>
            </Card>
            <div style={{ height: 28 }} />
            <SectionTitle title="Creator & UGC posts" sub="Sorted by views" />
            <PostGrid posts={d.posts} en={en} />
            {hook && (
              <Sheet title={sheetTitle(hook)} onClose={() => setHook(null)}>
                <PostDetail post={hook} en={en} />
              </Sheet>
            )}
          </>
        )
      }
    </Loaded>
  );
}

function SpendMethod() {
  return (
    <div className="estimate">
      <p>
        Each post marked as an ad (#ad, sponsored, Anzeige…) from a creator who isn't the brand is
        priced at the 2026 rate card for its platform and the creator's follower tier. Brands don't
        publish what they pay, so treat this as a list-price range. Real deals often land lower, and
        bundles, usage rights and whitelisting change the total.
      </p>
      <table>
        <thead>
          <tr>
            <th>Tier</th>
            <th>Instagram</th>
            <th>TikTok</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Nano (under 10K)</td><td>$20–$200</td><td>$20–$500</td></tr>
          <tr><td>Micro (10K–50K)</td><td>$200–$2K</td><td>$500–$2K</td></tr>
          <tr><td>Mid-tier (50K–500K)</td><td>$2K–$5K</td><td>$2K–$5K</td></tr>
          <tr><td>Macro (500K–1M)</td><td>$5K–$15K</td><td>$5K–$20K</td></tr>
          <tr><td>Mega (1M+)</td><td>$15K–$50K</td><td>$20K–$50K</td></tr>
        </tbody>
      </table>
      <p>
        Sources: Hootsuite's 2026 influencer pricing benchmarks, with Talentir and Stan reporting
        similar ranges. OpenSponsorship's median across 1,527 real campaigns was $134 (nano) to
        $2,727 (mega) per deliverable.
      </p>
    </div>
  );
}
