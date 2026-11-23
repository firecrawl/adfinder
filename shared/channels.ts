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
export const SHARED_CHANNELS = CHANNEL_LIST.filter((ch) => CACHE_POLICY[ch] === "shared");

// Particle's terms require its data to be credited wherever it's shown.
export const PARTICLE_ATTRIBUTION = "Podcast data from Particle, via Firecrawl Alexandria.";
