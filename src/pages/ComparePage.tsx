import { ArrowRight, Check, Crown, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { creatorSpend, podcastSpend, type Range } from "../../shared/spend";
import type { Brand, Channel, Comparison } from "../../shared/types";
import { streamCompare, useBrand, type BrandState, type Load } from "../api";
import { AdSkeletons, Card, Empty, Loaded } from "../components/ui";
import { compact, logo, usdRange } from "../format";
import { rememberCompare } from "../recent";
import { useSession } from "../session";
import { PostGrid } from "../tabs/CreatorsTab";
import { GoogleAdGrid } from "../tabs/GoogleTab";
import { MetaAdGrid } from "../tabs/MetaTab";
import type { Tab } from "./BrandPage";

type Line =
  | { kind: "step"; text: string }
  | { kind: "tools"; calls: { brand: string; channel: Channel }[] };
const CHANNEL_LABEL: Record<Channel, string> = {
  meta: "Meta ads",
  google: "Google ads",
  podcasts: "podcasts",
  ugc: "creators",
  trends: "search interest",
  traffic: "site traffic",
};

function Side({
  brand,
  side,
  crown,
  onOpen,
}: {
  brand: Brand;
  side: "a" | "b";
  crown: boolean;
  onOpen: () => void;
}) {
  return (
    <div className={`side ${side}`}>
      {brand.domain && <img src={logo(brand.domain)} alt="" />}
      <div>
        <h2>
          {brand.name} {crown && <Crown size={18} className="crown" />}
        </h2>
        <button className="linkish open-report" onClick={onOpen}>
          Full report <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}

export function ComparePage({
  a,
  b,
  onOpenBrand,
}: {
  a: Brand;
  b: Brand;
  onOpenBrand: (b: Brand, tab: Tab) => void;
}) {
  const { me, openSignIn } = useSession();
  const sa = useBrand(a, 0);
  const sb = useBrand(b, 0);
  useEffect(() => rememberCompare(a, b), [a, b]);
  const [lines, setLines] = useState<Line[]>([]);
  const [result, setResult] = useState<Comparison | null>(null);
  const [error, setError] = useState("");
  const ready = !!me?.connected;

  useEffect(() => {
    if (!ready) return;
    let live = true;
    void streamCompare(a, b, (e) => {
      if (!live) return;
      if (e.type === "step") setLines((ls) => [...ls, { kind: "step", text: e.text }]);
      else if (e.type === "tool")
        setLines((ls) => {
          const last = ls.at(-1);
          return last?.kind === "tools"
            ? [...ls.slice(0, -1), { kind: "tools", calls: [...last.calls, e] }]
            : [...ls, { kind: "tools", calls: [e] }];
        });
      else if (e.type === "result") setResult(e.data);
      else setError(e.error);
    });
    return () => {
      live = false;
    };
  }, [a, b, ready]);

  const logoFor = (name: string) => logo((name === a.name ? a : b).domain, 32);
  return (
    <main className="page">
      <div className="duel">
        <Side
          brand={a}
          side="a"
          crown={result?.winner === "a"}
          onOpen={() => onOpenBrand(a, "overview")}
        />
        <span className="vsb">VS</span>
        <Side
          brand={b}
          side="b"
          crown={result?.winner === "b"}
          onOpen={() => onOpenBrand(b, "overview")}
        />
      </div>
      {!ready && me && (
        <Empty
          title="Sign in to run a comparison"
          actions={
            <button className="btn fire" onClick={() => openSignIn()}>
              <img src="/firecrawl.svg" alt="" />
              Sign in with Firecrawl
            </button>
          }
        >
          Both brands are researched live.
        </Empty>
      )}
      {ready && !result && (
        <Card
          title={
            <>
              <Sparkles
                size={15}
                style={{ verticalAlign: -2, marginRight: 6, color: "var(--fire)" }}
              />
              Comparison agent
            </>
          }
          meta={error ? "" : "researching…"}
        >
          <div className="agent" style={{ padding: 0 }}>
            {lines.length === 0 && !error && (
              <div className="ln">
                <span className="spin" />
                Planning the research…
              </div>
            )}
            {lines.map((l, i) =>
              l.kind === "step" ? (
                <div className="ln" key={i}>
                  <Sparkles size={16} color="var(--fire)" />
                  {l.text}
                </div>
              ) : (
                <div className="tools" key={i}>
                  {l.calls.map((c) => (
                    <span key={`${c.brand}${c.channel}`}>
                      <img src={logoFor(c.brand)} alt="" />
                      {c.brand} · {CHANNEL_LABEL[c.channel]}
                      <Check size={13} color="var(--good)" />
                    </span>
                  ))}
                </div>
              ),
            )}
            {error && (
              <div className="ln" style={{ color: "var(--bad)" }}>
                {error}
              </div>
            )}
            {!error && lines.length > 0 && (
              <div className="ln">
                <span className="spin" />
                Thinking…
              </div>
            )}
          </div>
        </Card>
      )}
      {result && (
        <div style={{ display: "grid", gap: 22 }}>
          <section className="card ai">
            <div className="body" style={{ paddingTop: 20 }}>
              <span className="label">
                <Sparkles size={14} />
                Verdict
              </span>
              <h2>{result.headline}</h2>
            </div>
          </section>
          <section className="card" style={{ overflow: "hidden" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>{a.name}</th>
                  <th>{b.name}</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.dimension}>
                    <td>{r.dimension}</td>
                    <td className={r.edge === "a" ? "win" : ""}>{r.a}</td>
                    <td className={r.edge === "b" ? "win" : ""}>{r.b}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <div className="cols">
            <Card title={`Where ${a.name} wins`}>
              <ul className="bullets">
                {result.aStrengths.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </Card>
            <Card title={`Where ${b.name} wins`}>
              <ul className="bullets">
                {result.bStrengths.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </Card>
          </div>
          <Card title="What to take from both">
            <ul className="bullets">
              {result.takeaways.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </Card>
        </div>
      )}
      {ready && (
        <SideBySide a={a} b={b} sa={sa} sb={sb} onOpenBrand={onOpenBrand} />
      )}
    </main>
  );
}

type View = "numbers" | "meta" | "google" | "creators" | "hooks" | "podcasts";
const VIEWS: [View, string][] = [
  ["numbers", "Numbers"],
  ["meta", "Meta ads"],
  ["google", "Google ads"],
  ["creators", "Creators"],
  ["hooks", "Hooks"],
  ["podcasts", "Podcasts"],
];
const TAB_FOR: Record<View, Tab> = {
  numbers: "overview",
  meta: "meta",
  google: "google",
  creators: "creators",
  hooks: "overview",
  podcasts: "podcasts",
};
const ALL_ONLY: ["all", string][] = [["all", "All"]];

function SideBySide({
  a,
  b,
  sa,
  sb,
  onOpenBrand,
}: {
  a: Brand;
  b: Brand;
  sa: BrandState;
  sb: BrandState;
  onOpenBrand: (b: Brand, tab: Tab) => void;
}) {
  const [view, setView] = useState<View>("numbers");
  const column = (brand: Brand, s: BrandState, side: "a" | "b") => (
    <div className="vs-col" key={side}>
      <div className={`vs-head ${side}`}>
        <img src={logo(brand.domain, 64)} alt="" />
        <b>{brand.name}</b>
        <button className="linkish" onClick={() => onOpenBrand(brand, TAB_FOR[view])}>
          See all <ArrowRight size={13} />
        </button>
      </div>
      <ColumnView view={view} s={s} />
    </div>
  );
  return (
    <section className="side-by-side">
      <div className="sbs-head">
        <h2>Side by side</h2>
        <div className="seg" role="tablist">
          {VIEWS.map(([v, label]) => (
            <button
              key={v}
              role="tab"
              aria-selected={v === view}
              className={v === view ? "on" : ""}
              onClick={() => setView(v)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {view === "numbers" ? (
        <Numbers a={a} b={b} sa={sa} sb={sb} />
      ) : (
        <div className="vs-cols">
          {column(a, sa, "a")}
          {column(b, sb, "b")}
        </div>
      )}
    </section>
  );
}

function ColumnView({ view, s }: { view: View; s: BrandState }) {
  if (view === "meta")
    return (
      <Loaded load={s.meta} skeleton={<AdSkeletons />}>
        {(d) =>
          d.ads.length ? (
            <MetaAdGrid ads={d.ads} limit={6} filters={ALL_ONLY} />
          ) : (
            <p className="muted">No Meta ads found.</p>
          )
        }
      </Loaded>
    );
  if (view === "google")
    return (
      <Loaded load={s.google} skeleton={<AdSkeletons />}>
        {(d) =>
          d.ads.length ? (
            <GoogleAdGrid
              ads={[...d.ads].sort((x, y) => y.days - x.days)}
              limit={6}
              filters={ALL_ONLY}
            />
          ) : (
            <p className="muted">No Google ads found.</p>
          )
        }
      </Loaded>
    );
  if (view === "creators")
    return (
      <Loaded load={s.ugc} skeleton={<AdSkeletons />}>
        {(d) =>
          d.posts.length ? (
            <PostGrid posts={d.posts} limit={6} filters={ALL_ONLY} />
          ) : (
            <p className="muted">No creator posts found.</p>
          )
        }
      </Loaded>
    );
  if (view === "hooks")
    return (
      <Loaded load={s.hooks} skeleton={<div className="skeleton" style={{ height: 240 }} />}>
        {(h) =>
          h.patterns.length ? (
            <div className="vs-list">
              {h.patterns.map((p) => (
                <div className="vs-item" key={p.name}>
                  <b>{p.name}</b>
                  <q>{p.example}</q>
                  <small>
                    {p.meta.ads} Meta ads
                    {p.meta.winners > 0 && ` (${p.meta.winners} winners)`} ·{" "}
                    {p.ugc.posts ? `${compact(p.ugc.views)} creator views` : "no creator posts"}
                  </small>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">Not enough hooks to group.</p>
          )
        }
      </Loaded>
    );
  return (
    <Loaded load={s.podcasts}>
      {(d) =>
        d.sponsor ? (
          <div className="vs-list">
            <p className="faint">
              {compact(d.sponsor.ads)} reads on {compact(d.sponsor.shows)} shows · estimated{" "}
              {usdRange(podcastSpend(d))}
            </p>
            {d.shows.slice(0, 6).map((sh) => (
              <div className="vs-item row-ish" key={sh.title}>
                {sh.image ? <img src={sh.image} alt="" /> : <span className="art" />}
                <span>
                  <b>{sh.title}</b>
                  <small>{sh.publisher}</small>
                </span>
                <span className="n">{sh.ads} reads</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No podcast sponsorships found.</p>
        )
      }
    </Loaded>
  );
}

type Metric = {
  label: string;
  value: (s: BrandState) => number | null;
  show: (s: BrandState) => string;
};
const ok = <T,>(l: Load<T>) => (l.status === "ok" ? l.data : null);
const mid = ([lo, hi]: Range) => (lo + hi) / 2;
const METRICS: Metric[] = [
  {
    label: "Meta ads running",
    value: (s) => ok(s.meta)?.advertiser?.activeAds ?? null,
    show: (s) => compact(ok(s.meta)?.advertiser?.activeAds),
  },
  {
    label: "Google ads",
    value: (s) => ok(s.google)?.advertiser?.adCount ?? null,
    show: (s) => ok(s.google)?.totalLabel ?? compact(ok(s.google)?.advertiser?.adCount),
  },
  {
    label: "Longest-running Google ad (days)",
    value: (s) => Math.max(0, ...(ok(s.google)?.ads.map((x) => x.days) ?? [])) || null,
    show: (s) =>
      (Math.max(0, ...(ok(s.google)?.ads.map((x) => x.days) ?? [])) || null)?.toLocaleString(
        "en-US",
      ) ?? "—",
  },
  {
    label: "Podcast ad reads (3 years)",
    value: (s) => ok(s.podcasts)?.sponsor?.ads ?? null,
    show: (s) => compact(ok(s.podcasts)?.sponsor?.ads),
  },
  {
    label: "Estimated podcast spend",
    value: (s) => {
      const d = ok(s.podcasts);
      return d?.sponsor ? mid(podcastSpend(d)) : null;
    },
    show: (s) => {
      const d = ok(s.podcasts);
      return d?.sponsor ? usdRange(podcastSpend(d)) : "—";
    },
  },
  {
    label: "Creator post views",
    value: (s) => ok(s.ugc)?.totalViews ?? null,
    show: (s) => compact(ok(s.ugc)?.totalViews),
  },
  {
    label: "Estimated creator spend",
    value: (s) => {
      const d = ok(s.ugc);
      return d ? mid(creatorSpend(d.posts).range) : null;
    },
    show: (s) => {
      const d = ok(s.ugc);
      return d ? usdRange(creatorSpend(d.posts).range) : "—";
    },
  },
];

function Numbers({ a, b, sa, sb }: { a: Brand; b: Brand; sa: BrandState; sb: BrandState }) {
  return (
    <div className="card pairbars">
      <div className="legend">
        <span>
          <i style={{ background: "var(--side-a)" }} />
          {a.name}
        </span>
        <span>
          <i style={{ background: "var(--side-b)" }} />
          {b.name}
        </span>
      </div>
      {METRICS.map((m) => {
        const va = m.value(sa) ?? 0;
        const vb = m.value(sb) ?? 0;
        const max = Math.max(va, vb, 1);
        return (
          <div className="pb-row" key={m.label}>
            <span className="pb-label">{m.label}</span>
            <div className="pb-bars">
              {(
                [
                  ["a", va, m.show(sa), a.name],
                  ["b", vb, m.show(sb), b.name],
                ] as const
              ).map(([side, v, shown, name]) => (
                <div className="pb-line" key={side} title={`${name}: ${shown}`}>
                  <div className="pb-track">
                    <span
                      className={side}
                      style={{ width: `${v ? Math.max((v / max) * 100, 1.5) : 0}%` }}
                    />
                  </div>
                  <span className={`pb-val ${v > 0 && v === max ? "lead" : ""}`}>{shown}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
