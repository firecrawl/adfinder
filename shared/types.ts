// country: ISO alpha-2, or "" for worldwide.
export type Brand = { name: string; domain: string; country?: string };

export type Channel = "google" | "meta" | "podcasts" | "ugc" | "trends" | "traffic";

export type Verdict = "winner" | "cut" | null;

export type GoogleAd = {
  id: string;
  format: string;
  image: string | null;
  url: string;
  firstShown: string | null;
  lastShown: string | null;
  days: number;
  active: boolean;
  verdict: Verdict;
};
export type GoogleData = {
  advertiser: { id: string; name: string; adCount: number } | null;
  totalLabel: string | null;
  ads: GoogleAd[];
};

export type Share = { label: string; share: number };
export type MetaAd = {
  id: string;
  oneLine: string;
  hook: string | null;
  mediaType: string;
  active: boolean;
  startedAt: string | null;
  strength: number | null;
  video: string | null;
  thumb: string | null;
  libraryUrl: string | null;
  dims: Record<string, string>;
  verdict: Verdict;
};
export type MetaData = {
  source: "upspring" | "library";
  advertiser: {
    id: string;
    name: string;
    domain: string;
    activeAds: number | null;
    spend: string | null;
    traffic: string | null;
  } | null;
  brief: {
    summary: string;
    hookThemes: { name: string; description: string; examples: string[] }[];
    hooks: Share[];
    personas: Share[];
    mechanisms: Share[];
    funnel: Share[];
    mediaMix: Share[];
    followers: { facebook: number | null; instagram: number | null };
  } | null;
  ads: MetaAd[];
};
export type MetaAdDetail = {
  offer: { text: string | null; cta: string | null; type: string | null } | null;
  landing: { url: string; oneLine: string | null; coherence: number | null } | null;
  transcript: string | null;
};

export type PodcastRead = {
  id: string;
  title: string;
  summary: string;
  show: string;
  showImage: string | null;
  episode: string;
  date: string;
  audio: string | null;
  url: string | null;
  hostRead: boolean;
  seconds: number;
};
export type PodcastData = {
  sponsor: {
    name: string;
    ads: number;
    shows: number;
    episodes: number;
    firstSeen: string | null;
    lastSeen: string | null;
  } | null;
  shows: {
    title: string;
    image: string | null;
    publisher: string | null;
    popularity: number | null;
    ads: number;
    episodes: number;
    lastSeen: string | null;
  }[];
  reads: PodcastRead[];
  monthly: Point[];
};

export type UgcPost = {
  id: string;
  platform: "tiktok" | "instagram";
  handle: string;
  name: string | null;
  caption: string;
  hook: string;
  transcript: string | null;
  thumb: string | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagement: number | null;
  followers: number;
  published: string;
  url: string;
  paid: boolean;
  own: boolean;
  language: string | null;
};
export type UgcData = { posts: UgcPost[]; totalViews: number; totalPosts: number };

export type Point = { month: string; value: number };
export type TrendsData = { points: Point[] };
export type TrafficData = { points: Point[] };

export type ChannelData = {
  google: GoogleData;
  meta: MetaData;
  podcasts: PodcastData;
  ugc: UgcData;
  trends: TrendsData;
  traffic: TrafficData;
};

export type Insight = { title: string; detail: string; channel: string };
export type Summary = {
  headline: string;
  verdict: string;
  worked: Insight[];
  didnt: Insight[];
  steal: Insight[];
  channels: { channel: string; score: number; note: string }[];
  industry: string;
  competitors: { name: string; domain: string }[];
  model: string;
};

export type HookPattern = {
  name: string;
  description: string;
  example: string;
  meta: { ads: number; winners: number };
  ugc: { posts: number; views: number };
};
export type HookPatterns = { patterns: HookPattern[]; model: string };
// Post id to the English hook and caption, for posts not already in English.
export type Translations = { posts: Record<string, { hook: string; caption: string }> };

export type Comparison = {
  headline: string;
  winner: "a" | "b" | "tie";
  rows: { dimension: string; a: string; b: string; edge: "a" | "b" | "tie" }[];
  aStrengths: string[];
  bStrengths: string[];
  takeaways: string[];
  model: string;
};

export type CompareEvent =
  | { type: "step"; text: string }
  | { type: "tool"; brand: string; channel: Channel }
  | { type: "result"; data: Comparison }
  | { type: "error"; error: string };
