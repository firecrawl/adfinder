import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import type { HookPatterns, MetaAd, MetaAdDetail, MetaData } from "../../shared/types";
import { api, type Load } from "../api";
import { AdBrowser } from "../components/AdCard";
import { Longevity } from "../components/Longevity";
import { Patterns } from "../components/Patterns";
import {
  AdSkeletons,
  Card,
  NoResults,
  Facts,
  Loaded,
  Mix,
  SectionTitle,
  Strength,
  VerdictBadge,
} from "../components/ui";
import { compact, date, pct, statusLabel } from "../format";

type Filter = "all" | "winner" | "live" | "video" | "image";
const FILTERS: [Filter, string][] = [
  ["all", "All"],
  ["winner", "Winners"],
  ["live", "Running now"],
  ["video", "Video"],
  ["image", "Image"],
];
const keep = (f: Filter) => (a: MetaAd) =>
  f === "all" ||
  (f === "winner" ? a.verdict === "winner" : f === "live" ? a.active : a.mediaType === f);

export function MetaTab({
  load,
  hooks,
  brandName,
}: {
  load: Load<MetaData>;
  hooks: Load<HookPatterns>;
  brandName: string;
}) {
  return (
    <Loaded load={load} skeleton={<AdSkeletons />}>
      {(d) =>
        !d.advertiser ? (
          <NoResults title={`No Meta ads found for ${brandName}`}>
            Neither Upspring nor Meta's Ad Library returned ads for this brand.
          </NoResults>
        ) : (
          <>
            {/* Ours first: Upspring's themes are generic ("Service promotion"). */}
            {hooks.status === "ok" && hooks.data.patterns.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <Patterns data={hooks.data} />
              </div>
            )}
            {d.brief && (
              <div className="grid2" style={{ marginBottom: 28 }}>
                <Card
                  title="Upspring's hook themes"
                  meta={`${compact(d.advertiser.activeAds)} active ads`}
                >
                  <div className="themes">
                    {d.brief.hookThemes.map((t) => (
                      <div className="theme" key={t.name}>
                        <h4>{t.name}</h4>
                        <p>{t.description}</p>
                        {t.examples[0] && <q>{t.examples[0]}</q>}
                      </div>
                    ))}
                  </div>
                </Card>
                <Card title="Creative fingerprint">
                  <div style={{ display: "grid", gap: 18 }}>
                    <Mix title="Hook types" rows={d.brief.hooks} color="var(--series-meta)" />
                    <Mix
                      title="Who they target"
                      rows={d.brief.personas}
                      color="var(--series-search)"
                    />
                    <Mix
                      title="Funnel stage"
                      rows={d.brief.funnel}
                      color="var(--series-podcasts)"
                    />
                  </div>
                </Card>
              </div>
            )}
            <Card title="How long each ad has run" meta="longest 15">
              <Longevity
                runs={d.ads.map((a) => ({
                  id: a.id,
                  label: a.hook ?? a.oneLine,
                  start: a.startedAt,
                  end: null,
                  verdict: a.verdict,
                  active: a.active,
                }))}
              />
            </Card>
            <div style={{ height: 28 }} />
            <SectionTitle
              title="Best-performing Meta ads"
              sub={
                d.source === "library"
                  ? `${compact(d.advertiser.activeAds)} in Meta's Ad Library`
                  : "Ranked by delivery"
              }
            />
            <MetaAdGrid
              ads={d.ads}
              note={d.source === "library" ? "Winner: 60+ days" : "Winner: 30+ days, high delivery"}
            />
          </>
        )
      }
    </Loaded>
  );
}

export function MetaAdGrid({
  ads,
  note,
  limit,
  filters = FILTERS,
}: {
  ads: MetaAd[];
  note?: string;
  limit?: number;
  filters?: [Filter, string][];
}) {
  return (
    <AdBrowser
      items={ads}
      filters={filters}
      keep={keep}
      note={note}
      limit={limit}
      card={(a) => ({
        image: a.thumb,
        text: a.hook ? `“${a.hook}”` : a.oneLine,
        video: a.mediaType === "video",
        badges: <VerdictBadge verdict={a.verdict} active={a.active} />,
        title: a.hook ? `“${a.hook}”` : a.oneLine,
        sub: a.hook ? a.oneLine : undefined,
        foot: (
          <>
            <Strength value={a.strength} />
            <span>{date(a.startedAt)}</span>
          </>
        ),
      })}
      sheet={(a) => ({ title: "Meta ad", body: <MetaDetail ad={a} /> })}
    />
  );
}

function MetaDetail({ ad }: { ad: MetaAd }) {
  const [detail, setDetail] = useState<{ id: string; load: Load<MetaAdDetail> } | null>(null);
  const deep = !ad.id.startsWith("lib_");
  useEffect(() => {
    if (!deep) return;
    api<MetaAdDetail>(`/api/meta-ad/${ad.id}`, {}).then(
      (data) => setDetail({ id: ad.id, load: { status: "ok", data } }),
      (e: Error & { auth?: string }) =>
        setDetail({ id: ad.id, load: { status: "error", error: e.message, auth: e.auth } }),
    );
  }, [ad.id, deep]);
  const dims = Object.entries(ad.dims);
  return (
    <>
      {ad.video ? (
        <video src={ad.video} poster={ad.thumb ?? undefined} controls autoPlay muted playsInline>
          <track kind="captions" />
        </video>
      ) : (
        ad.thumb && <img className="big" src={ad.thumb} alt={`Meta ad: ${ad.hook ?? ad.oneLine}`} />
      )}
      {ad.hook && (
        <div>
          <h4>Hook</h4>
          <p className="quote">“{ad.hook}”</p>
        </div>
      )}
      <p className="prose">{ad.oneLine}</p>
      <Facts
        items={[
          ["Status", statusLabel(ad.verdict, ad.active)],
          ["Delivery", <Strength key="s" value={ad.strength} />],
          ["First seen", date(ad.startedAt)],
          ["Format", ad.mediaType],
        ]}
      />
      {dims.length > 0 && (
        <div>
          <h4>Creative breakdown</h4>
          <div className="dims">
            {dims.map(([k, v]) => (
              <span key={k}>
                <b>{k.replace(/_/g, " ")}</b>
                {v}
              </span>
            ))}
          </div>
        </div>
      )}
      {deep && (
        <Loaded
          load={detail?.id === ad.id ? detail.load : null}
          skeleton={<div className="skeleton" style={{ height: 120 }} />}
        >
          {(d) => (
            <>
              {d.offer?.text && (
                <div>
                  <h4>Offer</h4>
                  <p className="prose">
                    {d.offer.text}
                    {d.offer.cta ? ` · ${d.offer.cta}` : ""}
                  </p>
                </div>
              )}
              {d.landing && (
                <div>
                  <h4>Landing page</h4>
                  <p className="prose">{d.landing.oneLine}</p>
                  <p className="faint" style={{ marginTop: 6 }}>
                    <a href={d.landing.url} target="_blank" rel="noreferrer">
                      {d.landing.url}
                    </a>
                    {d.landing.coherence != null &&
                      ` · ad-to-page match ${pct(d.landing.coherence > 1 ? d.landing.coherence / 100 : d.landing.coherence)}`}
                  </p>
                </div>
              )}
              {d.transcript && (
                <div>
                  <h4>Transcript</h4>
                  <p className="prose">{d.transcript}</p>
                </div>
              )}
            </>
          )}
        </Loaded>
      )}
      {ad.libraryUrl && (
        <a className="btn outline" href={ad.libraryUrl} target="_blank" rel="noreferrer">
          Open in Meta Ad Library <ExternalLink size={14} />
        </a>
      )}
    </>
  );
}
