// adfinder as an MCP server: it only finds ads. It returns the data and leaves any summarising or
// comparing to the caller's own model, so it never touches adfinder's language-model key. Lookups go
// through the same cache as the site, so a brand anyone has searched comes back instantly and for free.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import {
  creatorTier,
  isSponsored,
  podcastBand,
  podcastSpend,
  postCost,
  creatorSpend,
} from "../shared/spend";
import { ENDPOINT, KEYS_URL, SITE } from "../shared/docs";
import type { Brand, Channel, ChannelData, MetaAdDetail, Verdict } from "../shared/types";
import { ApiError } from "./alexandria";

export type Lookups = {
  suggest: (q: string) => Promise<{ name: string; domain: string }[]>;
  channel: <K extends Channel>(brand: Brand, ch: K) => Promise<ChannelData[K]>;
  metaAd: (id: string) => Promise<MetaAdDetail>;
};

const DAY = 86_400_000;
const days = (from: string | null, to?: string | null) =>
  from
    ? Math.max(0, Math.round(((to ? Date.parse(to) : Date.now()) - Date.parse(from)) / DAY))
    : null;
const clip = (s: string | null | undefined, n: number) =>
  !s ? null : s.length > n ? `${s.slice(0, n - 1)}…` : s;
const status = (v: Verdict, active: boolean) =>
  v === "winner" ? "long runner" : v === "cut" ? "cut fast" : active ? "running" : "stopped";

const FILTERS = {
  all: () => true,
  running: (a: { active: boolean }) => a.active,
  long_runners: (a: { verdict: Verdict }) => a.verdict === "winner",
  cut_fast: (a: { verdict: Verdict }) => a.verdict === "cut",
};
type Filter = keyof typeof FILTERS;

const PLATFORMS = {
  meta: "meta",
  google: "google",
  podcasts: "podcasts",
  creators: "ugc",
} as const satisfies Record<string, Channel>;
type Platform = keyof typeof PLATFORMS;

function shape(platform: Platform, d: ChannelData[Channel], filter: Filter, limit: number) {
  const keep = FILTERS[filter];
  if (platform === "google") {
    const g = d as ChannelData["google"];
    const ads = [...g.ads].sort((a, b) => b.days - a.days).filter(keep);
    return {
      advertiser: g.advertiser,
      total_in_transparency_center: g.totalLabel ?? g.ads.length,
      sorted_by: "days shown, longest first",
      ads: ads.slice(0, limit).map((a) => ({
        id: a.id,
        format: a.format.toLowerCase(),
        status: status(a.verdict, a.active),
        days_shown: a.days,
        first_shown: a.firstShown,
        last_shown: a.lastShown,
        image: a.image,
        url: a.url,
      })),
    };
  }
  if (platform === "meta") {
    const m = d as ChannelData["meta"];
    const ads = m.ads.filter(keep);
    return {
      source:
        m.source === "upspring"
          ? "Upspring (hooks, personas and Meta's 1-5 delivery strength)"
          : "Meta Ad Library (keyword results; no hook analysis or strength)",
      advertiser: m.advertiser,
      creative_brief: m.brief && {
        summary: m.brief.summary,
        hook_themes: m.brief.hookThemes,
        hooks: m.brief.hooks,
        personas: m.brief.personas,
        mechanisms: m.brief.mechanisms,
        funnel: m.brief.funnel,
        media_mix: m.brief.mediaMix,
      },
      ads: ads.slice(0, limit).map((a) => ({
        id: a.id,
        hook: a.hook,
        copy: clip(a.oneLine, 400),
        media: a.mediaType,
        status: status(a.verdict, a.active),
        started: a.startedAt,
        days_running: days(a.startedAt),
        delivery_strength: a.strength,
        image: a.thumb,
        video: a.video,
        ad_library_url: a.libraryUrl,
        tags: a.dims,
      })),
    };
  }
  if (platform === "podcasts") {
    const p = d as ChannelData["podcasts"];
    return {
      sponsor: p.sponsor,
      estimated_spend_usd: podcastSpend(p),
      spend_method:
        "Each read priced at $25-50 CPM on an audience estimated from the show's popularity score. A list-price range, not reported spend.",
      reads_per_month: p.monthly,
      top_shows: p.shows.slice(0, 15).map((s) => ({
        title: s.title,
        publisher: s.publisher,
        ad_reads: s.ads,
        episodes: s.episodes,
        last_seen: s.lastSeen,
        audience_estimate: podcastBand(s.popularity)[1],
      })),
      reads: p.reads.slice(0, limit).map((r) => ({
        show: r.show,
        episode: r.episode,
        date: r.date,
        title: r.title,
        summary: clip(r.summary, 400),
        host_read: r.hostRead,
        seconds: r.seconds,
        audio: r.audio,
        url: r.url,
      })),
    };
  }
  const u = d as ChannelData["ugc"];
  const spend = creatorSpend(u.posts);
  return {
    total_posts: u.totalPosts,
    views_on_top_posts: u.totalViews,
    estimated_creator_spend_usd: spend.range,
    sponsored_posts: spend.posts,
    spend_method:
      "Posts marked as ads by creators other than the brand, priced at 2026 rate cards by platform and follower tier.",
    sorted_by: "views",
    posts: u.posts.slice(0, limit).map((p) => ({
      platform: p.platform,
      handle: p.handle,
      followers: p.followers,
      tier: creatorTier(p.followers),
      type: p.own ? "brand account" : p.paid ? "paid creator" : "organic mention",
      hook: p.hook,
      caption: clip(p.caption, 400),
      language: p.language,
      views: p.views,
      likes: p.likes,
      comments: p.comments,
      shares: p.shares,
      engagement: p.engagement,
      estimated_cost_usd: isSponsored(p) ? postCost(p) : null,
      posted: p.published,
      thumbnail: p.thumb,
      url: p.url,
    })),
  };
}

const json = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
});

const NO_KEY = `This brand hasn't been researched yet, so it needs a Firecrawl API key (about 100-200 credits, once; after that it's cached for everyone). Add one with:
claude mcp add --transport http adfinder ${ENDPOINT} --header "Authorization: Bearer fc-YOUR-KEY"
Get a key at ${KEYS_URL}. Other clients: ${SITE}/llms.txt`;

async function run(fn: () => Promise<unknown>) {
  try {
    return json(await fn());
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 500;
    if (!(e instanceof ApiError)) console.error(e);
    const text =
      status === 401
        ? NO_KEY
        : status === 402
          ? "The Firecrawl account behind this API key is out of credits."
          : (e as Error).message || "Something went wrong.";
    return { content: [{ type: "text" as const, text }], isError: true };
  }
}

const brandInput = {
  name: z.string().min(1).max(80).describe("Business name, e.g. HelloFresh"),
  domain: z
    .string()
    .max(100)
    .describe("Its website domain, e.g. hellofresh.com. Use find_advertiser if you don't know it."),
  country: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional()
    .describe("ISO country code such as US or GB. Leave out for worldwide."),
};

function server(look: Lookups) {
  const mcp = new McpServer({ name: "adfinder", version: "1.0.0" });

  mcp.registerTool(
    "find_advertiser",
    {
      title: "Find advertiser",
      description:
        "Look up a business by name and get its website domain, which get_ads needs. Free.",
      inputSchema: { query: z.string().min(1).max(60) },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ query }) => run(() => look.suggest(query)),
  );

  mcp.registerTool(
    "get_ads",
    {
      title: "Get ads",
      description: `Get a business's ads on one platform:
- meta: Facebook and Instagram ads with hooks, copy, images or video, run time and status
- google: Google Ads Transparency Center ads, longest-running first
- podcasts: sponsored podcast reads with shows, dates, audio and a spend estimate
- creators: TikTok and Instagram creator posts (paid, organic and the brand's own) by views, with cost estimates
Status: "long runner" ran 90+ days (advertisers keep ads that pay off), "cut fast" was stopped within about two weeks.
Cached brands are free; a new brand costs Firecrawl credits on the caller's key and can take a minute or two.`,
      inputSchema: {
        ...brandInput,
        platform: z.enum(Object.keys(PLATFORMS) as [Platform, ...Platform[]]),
        filter: z
          .enum(Object.keys(FILTERS) as [Filter, ...Filter[]])
          .default("all")
          .describe("meta and google only"),
        limit: z.number().int().min(1).max(50).default(20),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ platform, filter, limit, ...b }) =>
      run(async () => {
        const brand: Brand = {
          name: b.name.trim(),
          domain: b.domain.trim().toLowerCase(),
          country: b.country ?? "",
        };
        if (filter !== "all" && platform !== "meta" && platform !== "google")
          throw new ApiError(`The "${filter}" filter only applies to meta and google.`, 400);
        const data = await look.channel(brand, PLATFORMS[platform]);
        const params = new URLSearchParams({
          q: brand.name,
          d: brand.domain,
          ...(brand.country ? { c: brand.country } : {}),
        });
        return {
          brand,
          platform,
          ...shape(platform, data, filter, limit),
          report: `${SITE}/?${params.toString()}`,
        };
      }),
  );

  mcp.registerTool(
    "get_meta_ad",
    {
      title: "Get Meta ad details",
      description:
        "For one Meta ad from get_ads (Upspring source only): its offer, call to action, landing page and video transcript.",
      inputSchema: { id: z.string().regex(/^[A-Za-z0-9_-]{4,64}$/) },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ id }) => run(() => look.metaAd(id)),
  );

  return mcp;
}

// Stateless: every request gets a fresh server, so nothing is kept between calls.
export async function handleMcp(req: Request, look: Lookups) {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server(look).connect(transport);
  return transport.handleRequest(req);
}
