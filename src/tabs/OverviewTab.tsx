import { Lightbulb, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import type { ReactNode } from "react";
import type {
  Brand,
  ChannelData,
  Complaints,
  HookPatterns,
  Insight,
  ReviewsData,
} from "../../shared/types";
import type { BrandState, Load } from "../api";
import { Accordion, Card, Loaded, ParticleCredit, SignInPrompt, Stat } from "../components/ui";
import { Timeline } from "../components/Timeline";
import { compact, logo } from "../format";

const okData = <T,>(l: Load<T>) => (l.status === "ok" ? l.data : undefined);

function Insights({ items }: { items: Insight[] }) {
  return (
    <ul>
      {items.map((i) => (
        <li key={i.title}>
          <b>{i.title}</b>
          <p>{i.detail}</p>
          <span className="tag">{i.channel}</span>
        </li>
      ))}
    </ul>
  );
}

const ICON = (bg: string, color: string, node: ReactNode) => (
  <span className="ico" style={{ background: bg, color }}>
    {node}
  </span>
);

export function OverviewTab({
  state,
  onCompareWith,
}: {
  state: BrandState;
  onCompareWith: (b: Brand) => void;
}) {
  const data: Partial<ChannelData> = {
    meta: okData(state.meta),
    google: okData(state.google),
    podcasts: okData(state.podcasts),
    ugc: okData(state.ugc),
    trends: okData(state.trends),
    traffic: okData(state.traffic),
    reviews: okData(state.reviews),
  };
  const busy = (k: keyof ChannelData) => state[k].status === "loading";
  // Part of a brand can be cached while the rest still needs a Firecrawl key.
  const locked = (k: keyof ChannelData) => {
    const l = state[k];
    return l.status === "error" && l.auth === "missing";
  };
  const LOCKED = "sign in to load";
  const anyLocked = (["meta", "google", "podcasts", "ugc"] as const).some(locked);
  const allLocked = (["meta", "google", "podcasts", "ugc"] as const).every(locked);
  if (allLocked) return <SignInPrompt />;
  return (
    <>
      {anyLocked && (
        <div className="locked-note">
          Some of this brand is cached. Sign in with Firecrawl to load the rest.
        </div>
      )}
      <div className="stats">
        <Stat
          label="Meta ads running"
          color="var(--series-meta)"
          loading={busy("meta")}
          value={data.meta?.advertiser ? compact(data.meta.advertiser.activeAds) : "—"}
          sub={
            locked("meta")
              ? LOCKED
              : !data.meta?.advertiser
                ? "none found"
                : data.meta.source === "library"
                  ? "active"
                  : `spend ${data.meta.advertiser.spend ?? "n/a"}`
          }
        />
        <Stat
          label="Google ads"
          color="var(--series-google)"
          loading={busy("google")}
          value={data.google?.totalLabel ?? compact(data.google?.ads.length)}
          sub={
            locked("google")
              ? LOCKED
              : `${data.google?.ads.filter((a) => a.verdict === "winner").length ?? 0} long runners`
          }
        />
        <Stat
          label="Podcast ad reads"
          color="var(--series-podcasts)"
          loading={busy("podcasts")}
          value={locked("podcasts") ? "—" : compact(data.podcasts?.sponsor?.ads ?? 0)}
          sub={
            locked("podcasts")
              ? LOCKED
              : data.podcasts?.sponsor
                ? `${compact(data.podcasts.sponsor.shows)} shows`
                : "none found"
          }
        />
        <Stat
          label="Creator post views"
          color="var(--series-ugc)"
          loading={busy("ugc")}
          value={locked("ugc") ? "—" : compact(data.ugc?.totalViews ?? 0)}
          sub={locked("ugc") ? LOCKED : `${data.ugc?.totalPosts ?? 0} posts`}
        />
      </div>

      <Card title="Activity timeline">
        <Timeline data={data} />
      </Card>
      {data.podcasts?.sponsor && <ParticleCredit />}
      <div style={{ height: 22 }} />
      <Loaded load={state.summary} skeleton={<SummarySkeleton />}>
        {(s) => (
          <section className="card ai split">
            <div className="body" style={{ paddingTop: 20 }}>
              <span className="label">
                <Sparkles size={14} />
                What's working
              </span>
              <h2>{s.headline}</h2>
              <p className="verdict">{s.verdict}</p>
              <div className="scores">
                {s.channels.map((c) => (
                  <div className="score" key={c.channel}>
                    <span>{c.channel}</span>
                    <div className="bar">
                      <i style={{ width: `${c.score * 10}%` }} />
                    </div>
                    <b>{c.score}</b>
                    <small>{c.note}</small>
                  </div>
                ))}
              </div>
              {s.competitors?.length > 0 && (
                <div className="compare-with">
                  Compare with
                  {s.competitors.map((c) => (
                    <button className="chip" key={c.domain} onClick={() => onCompareWith(c)}>
                      <img src={logo(c.domain, 64)} alt="" />
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ borderTop: "1px solid var(--line)" }}>
              <Accordion
                defaultOpen
                icon={ICON("var(--good-soft)", "var(--good)", <ThumbsUp size={15} />)}
                title="What worked"
                count={s.worked.length}
              >
                <Insights items={s.worked} />
              </Accordion>
              <Accordion
                icon={ICON("var(--bad-soft)", "var(--bad)", <ThumbsDown size={15} />)}
                title="What didn't"
                count={s.didnt.length}
              >
                <Insights items={s.didnt} />
              </Accordion>
              <Accordion
                icon={ICON("var(--fire-soft)", "var(--fire)", <Lightbulb size={15} />)}
                title="Steal this for your business"
                count={s.steal.length}
              >
                <Insights items={s.steal} />
              </Accordion>
            </div>
          </section>
        )}
      </Loaded>
      <div style={{ height: 22 }} />
      <Loaded load={state.hooks} skeleton={<div className="skeleton" style={{ height: 220 }} />}>
        {(h) => <Patterns data={h} />}
      </Loaded>
      {state.complaints.status !== "error" && (
        <>
          <div style={{ height: 22 }} />
          <Loaded
            load={state.complaints}
            skeleton={<div className="skeleton" style={{ height: 260 }} />}
          >
            {(c) => <ComplaintsCard data={c} reviews={data.reviews} />}
          </Loaded>
        </>
      )}
    </>
  );
}

function Patterns({ data }: { data: HookPatterns }) {
  if (!data.patterns.length) return null;
  return (
    <Card title="Hook patterns">
      <table className="patterns">
        <thead>
          <tr>
            <th>Pattern</th>
            <th className="hide-sm">Best example</th>
            <th className="num">Meta ads</th>
            <th className="num">Creator views</th>
          </tr>
        </thead>
        <tbody>
          {data.patterns.map((p) => (
            <tr key={p.name}>
              <td>
                <b>{p.name}</b>
                <p>{p.description}</p>
              </td>
              <td className="hide-sm">
                <q>{p.example}</q>
              </td>
              <td className="num">
                {p.meta.ads}
                {p.meta.winners > 0 && <small className="faint"> · {p.meta.winners} winners</small>}
              </td>
              <td className="num">
                {p.ugc.posts ? compact(p.ugc.views) : "—"}
                {p.ugc.posts > 0 && <small className="faint"> · {p.ugc.posts} posts</small>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

const STATUS = {
  addressed: ["winner", "Addressed"],
  contradicted: ["cut", "Contradicted"],
  ignored: ["opening", "Ignored"],
} as const;

function ComplaintsCard({ data, reviews }: { data: Complaints; reviews?: ReviewsData }) {
  if (!data.themes.length) return null;
  const sources = [
    reviews?.app &&
      `App Store ${reviews.app.rating?.toFixed(1) ?? "–"}★ from ${compact(reviews.app.ratings)}`,
    reviews?.bbb && `${compact(reviews.bbb.complaints)} BBB complaints`,
  ].filter(Boolean);
  return (
    <Card
      className="complaints"
      title="Complaints vs ads"
      meta={`${data.sample} critical reviews${sources.length ? ` · ${sources.join(" · ")}` : ""}`}
    >
      <ul>
        {data.themes.map((t) => {
          const [cls, label] = STATUS[t.status];
          return (
            <li key={t.name}>
              <div className="head">
                <b>{t.name}</b>
                <span className="faint">{t.mentions} mentions</span>
                <span className={`badge ${cls}`}>{label}</span>
              </div>
              <q>{t.quote}</q>
              {t.ad && (
                <p className="adline">
                  <b>{t.ad.channel} ad:</b> {t.ad.text}
                </p>
              )}
              {t.status !== "addressed" && t.note && (
                <p className="steal">
                  <Lightbulb size={13} /> {t.note}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function SummarySkeleton() {
  return (
    <section className="card ai">
      <div className="body" style={{ paddingTop: 20, display: "grid", gap: 12 }}>
        <span className="label">
          <span className="spin" style={{ width: 12, height: 12 }} />
          Analysing every channel…
        </span>
        <div className="skeleton" style={{ height: 28, width: "80%" }} />
        <div className="skeleton" style={{ height: 16 }} />
        <div className="skeleton" style={{ height: 16, width: "70%" }} />
        <div className="skeleton" style={{ height: 120, marginTop: 8 }} />
      </div>
    </section>
  );
}
