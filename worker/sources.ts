import type {
  Brand,
  Channel,
  ChannelData,
  GoogleAd,
  GoogleData,
  MetaAd,
  MetaAdDetail,
  MetaData,
  PodcastData,
  Review,
  ReviewsData,
  Point,
  Share,
  TrafficData,
  TrendsData,
  UgcData,
  UgcPost,
} from "../shared/types";
import type { Alexandria } from "./alexandria";

const DAY = 86_400_000;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const root = (d: string) =>
  d
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0] ?? "";
const month = (iso: string) => iso.slice(0, 7);
const ageDays = (iso: string | null) => (iso ? (Date.now() - Date.parse(iso)) / DAY : 0);
const sameBrand = (brand: Brand, name: string, domain?: string | null) =>
  (!!domain && root(domain) === root(brand.domain)) ||
  norm(name) === norm(brand.name) ||
  norm(name).startsWith(norm(brand.name));

async function google(alex: Alexandria, brand: Brand): Promise<GoogleData> {
  const list = (opts: Record<string, unknown>) =>
    alex("adstransparency-google-com", "ad-transparency/list_ads", {
      region: brand.country || "anywhere",
      limit: 40,
      ...opts,
    });
  let res = brand.domain ? await list({ domain: root(brand.domain) }) : null;
  if (!res?.ads?.length) {
    const s = await alex("adstransparency-google-com", "ad-transparency/suggest", {
      query: brand.name,
      limit: 10,
    });
    const best = (s.advertisers ?? [])
      .filter((a: any) => sameBrand(brand, a.name))
      .sort((a: any, b: any) => (b.ad_count_high ?? 0) - (a.ad_count_high ?? 0))[0];
    if (!best) return { advertiser: null, totalLabel: null, ads: [] };
    res = await list({ advertiser_id: best.advertiser_id });
  }
  const ads: GoogleAd[] = (res.ads ?? []).map((a: any) => {
    const active = ageDays(a.last_shown_at) < 3;
    const days = a.days_shown ?? 0;
    return {
      id: a.creative_id,
      format: a.format ?? "AD",
      image: a.preview?.image_url ?? null,
      url: a.url,
      firstShown: a.first_shown_at,
      lastShown: a.last_shown_at,
      days,
      active,
      verdict: active && days >= 90 ? "winner" : !active && days <= 14 ? "cut" : null,
    };
  });
  const first = res.ads?.[0];
  return {
    advertiser: first
      ? {
          id: first.advertiser_id,
          name: first.advertiser_name,
          adCount: res.total_high ?? ads.length,
        }
      : null,
    totalLabel: res.total_low ? `${res.total_low.toLocaleString("en-US")}+` : null,
    ads,
  };
}

const shares = (xs: any[] | undefined): Share[] =>
  (xs ?? []).map((x) => ({ label: x.label, share: x.share }));
const grade = (g: any) => (g?.grade ? `${g.grade} (${g.floor})` : null);

async function meta(alex: Alexandria, brand: Brand): Promise<MetaData> {
  // Upspring tracks US Meta delivery, so other countries go straight to that country's Ad Library.
  if (brand.country && brand.country !== "US") return metaLibrary(alex, brand);
  const search = (opts: Record<string, unknown>) =>
    alex("upspring", "advertisers/search", { limit: 10, ...opts }).then((r) => r.data ?? []);
  const found = (
    await Promise.all([
      brand.domain ? search({ domain: root(brand.domain) }) : [],
      search({ name: brand.name }),
    ])
  ).flat();
  const adv = found.find((a: any) => sameBrand(brand, a.name, a.domain));
  if (!adv) return metaLibrary(alex, brand);

  const getBrief = async () => {
    let b = (await alex("upspring", "advertisers/brief", { id: adv.id })).data;
    if (b?.status === "pending") {
      await new Promise((r) => setTimeout(r, Math.min(b.refetch_after ?? 5, 8) * 1000));
      b = (await alex("upspring", "advertisers/brief", { id: adv.id })).data;
    }
    return b?.status === "unavailable" ? null : b;
  };
  const [b, browse] = await Promise.all([
    getBrief(),
    alex("upspring", "ads/browse", {
      advertiser_id: [adv.id],
      order_by: "best",
      limit: 30,
      include: "media",
    }),
  ]);
  const ads: MetaAd[] = (browse.data ?? []).map((a: any) => {
    const strength = a.strength?.impressions ?? null;
    const age = ageDays(a.started_at);
    return {
      id: a.id,
      oneLine: a.one_line ?? "",
      hook: a.hook_text ?? null,
      mediaType: a.media_type ?? "ad",
      active: !!a.is_active,
      startedAt: a.started_at ?? null,
      strength,
      video: a.media?.video_url ?? null,
      thumb: a.media?.thumbnail_url ?? a.media?.image_url ?? null,
      libraryUrl: a.ad_library_url ?? null,
      dims: Object.fromEntries(
        Object.entries(a.dimensions ?? {}).map(([k, v]: [string, any]) => [k, v.label]),
      ),
      verdict:
        a.is_active && (strength ?? 0) >= 4 && age >= 30
          ? "winner"
          : !a.is_active && (strength ?? 5) <= 2
            ? "cut"
            : null,
    };
  });
  return {
    source: "upspring",
    advertiser: {
      id: adv.id,
      name: adv.name,
      domain: adv.domain,
      activeAds: adv.active_ads ?? null,
      spend: grade(adv.enrichment?.spend),
      traffic: grade(adv.enrichment?.traffic),
    },
    brief: b
      ? {
          summary: b.summary?.short_summary ?? b.summary?.one_line ?? "",
          hookThemes: (b.hook_themes ?? []).map((t: any) => ({
            name: t.name,
            description: t.description,
            examples: t.example_hooks ?? [],
          })),
          hooks: shares(b.signals?.hooks),
          personas: shares(b.signals?.personas),
          mechanisms: shares(b.signals?.mechanisms),
          funnel: shares(b.signals?.funnel),
          mediaMix: shares(b.signals?.media_mix),
          followers: {
            facebook: b.social?.fb_followers ?? null,
            instagram: b.social?.ig_followers ?? null,
          },
        }
      : null,
    ads,
  };
}

// The Ad Library page embeds its first page of results as JSON; read it with a string-aware brace match.
function embeddedJson(html: string, marker: string): any {
  const start = html.indexOf(marker);
  if (start < 0) return null;
  const from = start + marker.length;
  let depth = 0;
  let inString = false;
  for (let i = from; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return JSON.parse(html.slice(from, i + 1));
  }
  return null;
}

// Upspring only indexes DTC brands, so for anyone else read Meta's public Ad Library (sorted by impressions).
async function metaLibrary(alex: Alexandria, brand: Brand): Promise<MetaData> {
  const params = new URLSearchParams({
    active_status: "active",
    ad_type: "all",
    country: brand.country || "ALL",
    media_type: "all",
    q: brand.name,
    search_type: "keyword_exact_phrase",
    "sort_data[mode]": "total_impressions",
    "sort_data[direction]": "desc",
  });
  const page = await alex.html(`https://www.facebook.com/ads/library/?${params.toString()}`);
  const results = embeddedJson(page, '"search_results_connection":');
  const slug = norm(brand.name);
  const all: any[] = (results?.edges ?? [])
    .flatMap((e: any) => e.node?.collated_results ?? [])
    .filter((a: any) => {
      const s = a.snapshot ?? {};
      return norm(`${s.page_name} ${s.body?.text} ${s.caption} ${s.link_url}`).includes(slug);
    });
  const own = all.filter((a) => sameBrand(brand, a.snapshot?.page_name ?? ""));
  const rows = own.length >= 4 ? own : all;
  const ads: MetaAd[] = rows.map((a) => {
    const s = a.snapshot ?? {};
    const card = s.cards?.[0] ?? {};
    const image = s.images?.[0] ?? {};
    const video = s.videos?.[0] ?? {};
    const startedAt = a.start_date ? new Date(a.start_date * 1000).toISOString() : null;
    const active = a.is_active !== false;
    const body = String(card.body ?? s.body?.text ?? "").trim();
    const domain = s.caption ? root(s.caption) : "";
    return {
      id: `lib_${a.ad_archive_id}`,
      oneLine: [s.page_name, card.title ?? s.title, domain].filter(Boolean).join(" · "),
      hook: firstSentence(body) || null,
      mediaType: video.video_sd_url || card.video_sd_url ? "video" : "image",
      active,
      startedAt,
      strength: null,
      video:
        video.video_hd_url ?? video.video_sd_url ?? card.video_hd_url ?? card.video_sd_url ?? null,
      thumb:
        image.resized_image_url ??
        image.original_image_url ??
        video.video_preview_image_url ??
        card.resized_image_url ??
        card.original_image_url ??
        card.video_preview_image_url ??
        null,
      libraryUrl: `https://www.facebook.com/ads/library/?id=${a.ad_archive_id}`,
      dims: { advertiser: s.page_name ?? "", ...(domain ? { landing: domain } : {}) },
      verdict: active && ageDays(startedAt) >= 60 ? "winner" : null,
    };
  });
  if (!ads.length) return { source: "library", advertiser: null, brief: null, ads: [] };
  return {
    source: "library",
    advertiser: {
      id: "library",
      name: own.length >= 4 ? own[0].snapshot.page_name : brand.name,
      domain: brand.domain,
      activeAds: results?.count ?? null,
      spend: null,
      traffic: null,
    },
    brief: null,
    ads,
  };
}

export async function metaAdDetail(alex: Alexandria, id: string): Promise<MetaAdDetail> {
  const d = (await alex("upspring", "ads/detail", { id, include: "transcript" })).data ?? {};
  const t = d.transcript;
  return {
    offer: d.offer
      ? {
          text: d.offer.text ?? null,
          cta: d.offer.cta_label ?? null,
          type: d.offer.offer_type?.label ?? d.offer.offer_type ?? null,
        }
      : null,
    landing: d.landing_page
      ? {
          url: d.landing_page.url,
          oneLine: d.landing_page.one_line ?? null,
          coherence: d.landing_page.coherence?.overall ?? null,
        }
      : null,
    transcript:
      typeof t === "string"
        ? t
        : Array.isArray(t)
          ? t.map((x: any) => x.text ?? "").join(" ")
          : (t?.text ?? null),
  };
}

async function podcasts(alex: Alexandria, brand: Brand): Promise<PodcastData> {
  const s =
    (await alex("particle", "advertising/sponsors", { q: brand.name, limit: 10 })).data ?? [];
  const sponsor =
    s.find((x: any) => sameBrand(brand, x.company?.name ?? x.name, x.company?.domain)) ??
    s.find((x: any) => sameBrand(brand, x.name));
  if (!sponsor) return { sponsor: null, shows: [], reads: [], monthly: [] };
  const id = sponsor.company?.domain ?? sponsor.id;
  const since = new Date(Date.now() - 3 * 365 * DAY).toISOString().slice(0, 10);
  const [shows, segs, ts] = await Promise.all([
    alex("particle", "advertising/sponsor/shows", { id, limit: 12 }),
    alex("particle", "advertising/sponsor/segments", { id, limit: 20 }),
    alex("particle", "advertising/timeseries", {
      company_id: sponsor.company?.domain ? id : undefined,
      sponsor_id: sponsor.company?.domain ? undefined : id,
      interval: "month",
      published_after: since,
    }),
  ]);
  return {
    sponsor: {
      name: sponsor.company?.name ?? sponsor.name,
      ads: ts.total_ads ?? sponsor.ad_count,
      shows: ts.distinct_podcasts ?? sponsor.podcast_reach,
      episodes: ts.distinct_episodes ?? sponsor.episode_reach,
      firstSeen: sponsor.first_seen_at ?? null,
      lastSeen: sponsor.last_seen_at ?? null,
    },
    shows: (shows.data ?? []).map((x: any) => ({
      title: x.podcast?.title,
      image: x.podcast?.image_url ?? null,
      publisher: x.podcast?.publisher?.name ?? null,
      popularity: x.podcast?.popularity ?? null,
      ads: x.ad_count,
      episodes: x.episode_count,
      lastSeen: x.last_seen_at ?? null,
    })),
    reads: (segs.data ?? []).map((x: any) => ({
      id: x.id,
      title: x.title,
      summary: x.summary ?? x.description ?? "",
      show: x.episode?.podcast?.title ?? "",
      showImage: x.episode?.podcast?.image_url ?? null,
      episode: x.episode?.title ?? "",
      date: x.episode?.published_at ?? "",
      audio: x.audio_url ?? null,
      url: x.url ?? null,
      hostRead: x.read_type === "HOST_READ",
      seconds: Math.round(x.duration_seconds ?? 0),
    })),
    monthly: (ts.buckets ?? []).map((b: any) => ({ month: month(b.start), value: b.count })),
  };
}

const PAID =
  /#ad\b|#sponsored|#anzeige|\banzeige\b|paid partnership|#partner\b|\bsponsored\b|#werbung/i;
function firstSentence(s: string) {
  const line =
    s
      .replace(/[#@]\S+/g, "")
      .replace(/^\s*(anzeige|werbung|ad)\b\s*[|:-]?\s*/i, "")
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 3) ?? "";
  return (
    line.match(/^.{8,160}?[.!?…](?=\s|$|\p{Extended_Pictographic})/u)?.[0] ?? line.slice(0, 140)
  ).trim();
}

// Oriane can't filter by country, so a country view keeps posts in its main languages.
const LANGUAGES: Record<string, string[]> = {
  US: ["en", "es"],
  GB: ["en"],
  CA: ["en", "fr"],
  AU: ["en"],
  DE: ["de"],
  FR: ["fr"],
  NL: ["nl"],
  ES: ["es"],
  IT: ["it"],
};

async function ugc(alex: Alexandria, brand: Brand): Promise<UgcData> {
  const langs = brand.country ? LANGUAGES[brand.country] : undefined;
  // Price is per call, not per result, so a country view fetches more to filter from.
  const opts = {
    caption: brand.name,
    limit: langs ? 60 : 20,
    sort: "viewsCount:desc",
    projection: "full",
  };
  const [tt, ig] = await Promise.allSettled([
    alex("oriane", "tiktok/posts-search", opts),
    alex("oriane", "instagram/posts-search", opts),
  ]);
  const slug = norm(brand.name);
  const rows = [tt, ig].flatMap((r) =>
    r.status === "fulfilled" ? (r.value.data?.results ?? []) : [],
  );
  if (tt.status === "rejected" && ig.status === "rejected") throw tt.reason;
  const posts: UgcPost[] = rows.map((p: any) => {
    const platform = p.platform === "instagram" ? "instagram" : "tiktok";
    const caption = p.caption ?? "";
    return {
      id: p.id,
      platform,
      handle: p.profileHandle,
      name: p.profileDisplayName ?? null,
      caption,
      hook: firstSentence(p.transcript || caption),
      transcript: p.transcript ?? null,
      thumb: p.thumbnailMediaUrl ?? null,
      views: p.viewsCount ?? 0,
      likes: p.likesCount ?? 0,
      comments: p.commentsCount ?? 0,
      shares: p.sharesCount ?? 0,
      // Oriane's own rate is sometimes far above 100%, so recompute it from the counts.
      engagement: p.viewsCount
        ? ((p.likesCount ?? 0) + (p.commentsCount ?? 0) + (p.sharesCount ?? 0)) / p.viewsCount
        : null,
      followers: p.profileFollowersCount ?? 0,
      published: p.publishedAt,
      url:
        p.postUrl ??
        (platform === "tiktok" && p.platformId
          ? `https://www.tiktok.com/@${p.profileHandle}/video/${p.platformId}`
          : p.profileUrl),
      paid: PAID.test(caption),
      own: norm(p.profileHandle ?? "").startsWith(slug),
      language:
        (p.captionLanguage ?? p.transcriptLanguage ?? null)?.slice(0, 2).toLowerCase() ?? null,
    };
  });
  // A caption search for a common word ("Factor") matches unrelated posts, so keep only ones that tag the brand.
  const stem = root(brand.domain).split(".")[0] ?? "";
  const tagged = posts.filter((p) => {
    const c = p.caption.toLowerCase();
    if (langs && !(p.language && langs.includes(p.language))) return false;
    return (
      p.own ||
      c.includes(`#${slug}`) ||
      c.includes(`@${slug}`) ||
      (stem.length > 3 && c.includes(stem))
    );
  });
  tagged.sort((a, b) => b.views - a.views);
  return {
    posts: tagged,
    totalViews: tagged.reduce((n, p) => n + p.views, 0),
    totalPosts: tagged.length,
  };
}

function byMonth(rows: { time: string; value: number }[]): Point[] {
  const m = new Map<string, number[]>();
  for (const r of rows) m.set(month(r.time), [...(m.get(month(r.time)) ?? []), r.value]);
  return [...m].map(([k, v]) => ({
    month: k,
    value: Math.round(v.reduce((a, b) => a + b, 0) / v.length),
  }));
}

async function trends(alex: Alexandria, brand: Brand): Promise<TrendsData> {
  const r = await alex("firecrawl-trends", "trends/interest_over_time", {
    keywords: [brand.name],
    time: "today 5-y",
    geo: brand.country ?? "",
  });
  return {
    points: byMonth(
      (r.points ?? []).map((p: any) => ({ time: p.time, value: p.values?.[0] ?? 0 })),
    ),
  };
}

async function traffic(alex: Alexandria, brand: Brand): Promise<TrafficData> {
  if (!brand.domain) return { points: [] };
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - 1 - i);
    return d.toISOString().slice(0, 7);
  }).reverse();
  const res = await Promise.allSettled(
    months.map((m) =>
      alex("similarweb", "web/traffic", {
        domain: root(brand.domain),
        start_date: m,
        end_date: m,
        metrics: "visits",
        granularity: "monthly",
      }),
    ),
  );
  const points = res.flatMap((r, i) => {
    if (r.status !== "fulfilled") return [];
    const rec = (r.value.data ?? [])[0];
    const v = Number(rec?.visits ?? rec?.value ?? NaN);
    return Number.isFinite(v) ? [{ month: months[i] ?? "", value: Math.round(v) }] : [];
  });
  return { points };
}

async function appReviews(alex: Alexandria, brand: Brand) {
  const country = (brand.country || "us").toLowerCase();
  const found = await alex("apps-apple-com", "apps/search", {
    term: brand.name,
    country,
    limit: 5,
  });
  const app = (found.apps ?? []).find(
    (a: any) => sameBrand(brand, a.name) || sameBrand(brand, a.developer?.name ?? ""),
  );
  if (!app) return null;
  const pages = await Promise.allSettled(
    [0, 10, 20].map((offset) =>
      alex("apps-apple-com", "apps/reviews", {
        app_id: app.app_id,
        country,
        sort: "most_critical",
        limit: 10,
        offset,
      }),
    ),
  );
  const items: Review[] = pages.flatMap((p) =>
    p.status === "fulfilled"
      ? (p.value.reviews ?? []).map((r: any) => ({
          source: "app" as const,
          rating: r.rating ?? null,
          title: r.title ?? null,
          text: String(r.body ?? ""),
          date: String(r.date ?? ""),
          type: null,
        }))
      : [],
  );
  return {
    app: {
      name: String(app.name),
      rating: app.rating?.average ?? null,
      ratings: app.rating?.count ?? 0,
      url: String(app.url),
    },
    items,
  };
}

const BBB = "bbb-business-profiles-ratings-complaint";
const typeLabel = (slug: string) =>
  ({
    productissues: "Product",
    serviceorrepair: "Service",
    delivery: "Delivery",
    billingissues: "Billing",
    salesadvertising: "Sales & advertising",
    customerservice: "Customer service",
    order: "Order",
  })[slug] ?? slug;

// BBB covers only the US and Canada.
async function bbbReviews(alex: Alexandria, brand: Brand) {
  if (brand.country && brand.country !== "US" && brand.country !== "CA") return null;
  const country = brand.country === "CA" ? "ca" : "us";
  const found = await alex(BBB, "businesses/search", { query: brand.name, country });
  // Names collide ("Factor Property Management"), so the profile's website has to be the brand's.
  const candidates = (found.results ?? []).filter((r: any) => sameBrand(brand, r.name)).slice(0, 2);
  const profiles = await Promise.all(
    candidates.map((r: any) =>
      alex(BBB, "businesses/profile", {
        bbb_id: r.bbb_id,
        business_id: r.business_id,
        country,
      }).catch(() => null),
    ),
  );
  const hit = candidates.find((_: any, i: number) =>
    [profiles[i]?.website, ...(profiles[i]?.additional_websites ?? [])]
      .filter(Boolean)
      .some((w: string) => root(w) === root(brand.domain)),
  );
  if (!hit) return null;
  const id = { bbb_id: hit.bbb_id, business_id: hit.business_id, country };
  const [first, reviews] = await Promise.all([
    alex(BBB, "businesses/complaints", id),
    alex(BBB, "businesses/reviews", id).catch(() => null),
  ]);
  const types: { slug: string; count: number }[] = first.filters?.type ?? [];
  // Paging repeats the first page, so the top complaint types are read one filter at a time instead.
  const more = await Promise.allSettled(
    types
      .slice(0, 3)
      .map((t) => alex(BBB, "businesses/complaints", { ...id, complaint_type: t.slug })),
  );
  const seen = new Set<string>();
  const complaints = [first, ...more.flatMap((m) => (m.status === "fulfilled" ? [m.value] : []))]
    .flatMap((page) => page.complaints ?? [])
    .filter((c: any) => !seen.has(c.id) && !!seen.add(c.id));
  const items: Review[] = [
    ...complaints.map((c: any) => ({
      source: "bbb" as const,
      rating: null,
      title: null,
      text: String(c.text ?? ""),
      date: String(c.date ?? ""),
      type: c.type ?? null,
    })),
    ...(reviews?.reviews ?? []).map((r: any) => ({
      source: "bbb" as const,
      rating: r.star_rating ?? null,
      title: null,
      text: String(r.text ?? ""),
      date: String(r.date ?? ""),
      type: null,
    })),
  ];
  return {
    bbb: {
      name: String(hit.name),
      url: String(hit.profile_url),
      grade: hit.rating ?? null,
      complaints: first.complaints_summary?.total ?? 0,
      byType: types.map((t) => ({ label: typeLabel(t.slug), count: t.count })),
      reviewAverage: reviews?.reviews_summary?.average_star_rating ?? null,
      reviews: reviews?.reviews_summary?.total ?? 0,
    },
    items,
  };
}

async function reviews(alex: Alexandria, brand: Brand): Promise<ReviewsData> {
  const [app, bbb] = await Promise.allSettled([appReviews(alex, brand), bbbReviews(alex, brand)]);
  const a = app.status === "fulfilled" ? app.value : null;
  const b = bbb.status === "fulfilled" ? bbb.value : null;
  if (!a && !b && app.status === "rejected") throw app.reason;
  return {
    app: a?.app ?? null,
    bbb: b?.bbb ?? null,
    items: [...(a?.items ?? []), ...(b?.items ?? [])].filter((r) => r.text.trim()),
  };
}

export const CHANNELS: {
  [K in Channel]: (alex: Alexandria, brand: Brand) => Promise<ChannelData[K]>;
} = {
  google,
  meta,
  podcasts,
  ugc,
  trends,
  traffic,
  reviews,
};
