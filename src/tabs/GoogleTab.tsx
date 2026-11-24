import { ExternalLink } from "lucide-react";
import type { GoogleAd, GoogleData } from "../../shared/types";
import type { Load } from "../api";
import { AdBrowser } from "../components/AdCard";
import { Longevity } from "../components/Longevity";
import {
  AdSkeletons,
  Card,
  Empty,
  NoResults,
  Facts,
  Loaded,
  SectionTitle,
  VerdictBadge,
} from "../components/ui";
import { date, daysLabel, statusLabel } from "../format";

type Filter = "all" | "winner" | "live" | "cut";
const FILTERS: [Filter, string][] = [
  ["all", "All"],
  ["winner", "Long runners"],
  ["live", "Running now"],
  ["cut", "Cut fast"],
];
const keep = (f: Filter) => (a: GoogleAd) =>
  f === "all" || (f === "live" ? a.active : a.verdict === f);

export function GoogleTab({ load, brandName }: { load: Load<GoogleData>; brandName: string }) {
  return (
    <Loaded load={load} skeleton={<AdSkeletons />}>
      {(d) =>
        !d.advertiser ? (
          <NoResults title={`No Google ads found for ${brandName}`}>
            Google's Ads Transparency Center has no ads for this advertiser or domain.
          </NoResults>
        ) : (
          <>
            <Card title="How long each ad ran" meta="longest 15">
              <Longevity
                runs={d.ads.map((a) => ({
                  id: a.id,
                  label: `${a.format.toLowerCase()} ad · ${date(a.firstShown)}`,
                  start: a.firstShown,
                  end: a.lastShown,
                  verdict: a.verdict,
                  active: a.active,
                }))}
              />
            </Card>
            <div style={{ height: 28 }} />
            <SectionTitle
              title="Google ads"
              sub={`${d.advertiser.name} · ${d.totalLabel ?? d.ads.length} ads`}
            />
            <GoogleAdGrid
              ads={[...d.ads].sort((a, b) => b.days - a.days)}
              note="Winner: 90+ days"
            />
          </>
        )
      }
    </Loaded>
  );
}

export function GoogleAdGrid({
  ads,
  note,
  limit,
  filters = FILTERS,
}: {
  ads: GoogleAd[];
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
        image: a.image,
        wide: true,
        video: a.format === "VIDEO",
        badges: <VerdictBadge verdict={a.verdict} active={a.active} />,
        title: `Ran ${daysLabel(a.days)}`,
        sub: `${a.format.toLowerCase()} ad · since ${date(a.firstShown)}`,
        foot: a.active ? "Still running" : `Last seen ${date(a.lastShown)}`,
      })}
      sheet={(a) => ({
        title: "Google ad",
        body: (
          <>
            {a.image ? (
              <img className="big" src={a.image} alt="Ad creative" referrerPolicy="no-referrer" />
            ) : (
              <Empty title="Video or rendered ad">
                Open it in the Transparency Center to watch it.
              </Empty>
            )}
            <Facts
              items={[
                ["Status", statusLabel(a.verdict, a.active)],
                ["Days shown", daysLabel(a.days)],
                ["First shown", date(a.firstShown)],
                ["Last shown", date(a.lastShown)],
              ]}
            />
            <a className="btn outline" href={a.url} target="_blank" rel="noreferrer">
              Open in Ads Transparency Center <ExternalLink size={14} />
            </a>
          </>
        ),
      })}
    />
  );
}
