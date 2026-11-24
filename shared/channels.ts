import type { Channel } from "./types";

// How long each provider's terms let a result be kept. `shared`: cached and served to every visitor.
// `none`: fetched live with the viewer's own key and never stored or shared; Similarweb and Particle
// don't allow reuse beyond the query that fetched it.
export type CachePolicy = "shared" | "none";

export const CACHE_POLICY = {
  meta: "shared",
  google: "shared",
  podcasts: "none",
  ugc: "shared",
  trends: "shared",
  traffic: "none",
  reviews: "shared",
} as const satisfies Record<Channel, CachePolicy>;

export const CHANNEL_LIST = Object.keys(CACHE_POLICY) as Channel[];

// The Alexandria provider behind each channel, and roughly what one uncached lookup costs in Firecrawl
// credits (catalogue prices, checked against Analytics Engine on 24 Nov 2026). Meta is 250 when the
// brand is on Upspring and about 2 on the Ad Library fallback; traffic is 45 per month for 6 months.
export const CHANNEL_INFO = {
  meta: { label: "Meta", provider: "Upspring", credits: 250 },
  google: { label: "Google", provider: "Google Ads Transparency", credits: 5 },
  podcasts: { label: "Podcasts", provider: "Particle", credits: 100 },
  ugc: { label: "Creators", provider: "Oriane", credits: 130 },
  trends: { label: "Trends", provider: "Firecrawl Trends", credits: 5 },
  traffic: { label: "Traffic", provider: "Similarweb", credits: 270 },
  reviews: { label: "Reviews", provider: "App Store and BBB", credits: 20 },
} as const satisfies Record<Channel, { label: string; provider: string; credits: number }>;
export const SHARED_CHANNELS = CHANNEL_LIST.filter((ch) => CACHE_POLICY[ch] === "shared");

// Particle's terms require its data to be credited wherever it's shown.
export const PARTICLE_ATTRIBUTION = "Podcast data from Particle, via Firecrawl Alexandria.";
