import { creatorSpend, podcastSpend } from "../shared/spend";
import type {
  Brand,
  Channel,
  ChannelData,
  CompareEvent,
  Comparison,
  ComplaintTheme,
  Complaints,
  HookPattern,
  HookPatterns,
  Summary,
  Translations,
} from "../shared/types";

export type GlmEnv = {
  GLM_API_KEY?: string;
  GLM_BASE_URL?: string;
  GLM_MODEL?: string;
  // Admits a run against the model limits, before its first model call.
  admit?: () => Promise<void>;
};
type Message = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};
type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

const DEFAULT_MODEL = "z-ai/glm-5.3-flash";

// Through OpenRouter: Z.ai's own API sits behind a firewall that answers Workers with a 405 page.
async function chat(
  env: GlmEnv,
  messages: Message[],
  opts: { tools?: unknown[]; json?: boolean; timeout?: number } = {},
) {
  if (!env.GLM_API_KEY) throw new Error("GLM_API_KEY is not set");
  await env.admit?.();
  const r = await fetch(`${env.GLM_BASE_URL || "https://openrouter.ai/api/v1"}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.GLM_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: env.GLM_MODEL || DEFAULT_MODEL,
      messages,
      ...(opts.tools ? { tools: opts.tools } : {}),
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      // GLM always reasons, at max effort by default, which pushes long answers past the timeout.
      reasoning: { effort: "low", exclude: true },
      provider: { sort: "throughput" },
      temperature: 0.4,
    }),
    signal: AbortSignal.timeout(opts.timeout ?? 90_000),
  });
  if (!r.ok) throw new Error(`GLM error ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j: any = await r.json();
  return {
    message: j.choices?.[0]?.message as Message,
    model: String(j.model || env.GLM_MODEL || DEFAULT_MODEL),
  };
}

function parseJson(content: string | null) {
  const s = String(content ?? "").replace(/^```(?:json)?\s*|\s*```$/g, "");
  return JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1));
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const top = <T>(xs: T[], n: number) => xs.slice(0, n);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

// Compact, model-sized views of each channel: the raw responses are far too big to send whole.
export const digests: { [K in Channel]: (d: ChannelData[K]) => unknown } = {
  google: (d) =>
    !d.advertiser
      ? "No Google ads found."
      : {
          advertiser: d.advertiser.name,
          totalAds: d.totalLabel,
          sampled: d.ads.length,
          longestRunning: top(
            [...d.ads].sort((a, b) => b.days - a.days),
            8,
          ).map((a) => ({
            format: a.format,
            days: a.days,
            active: a.active,
            firstShown: a.firstShown?.slice(0, 10),
          })),
          formats: Object.entries(
            d.ads.reduce<Record<string, number>>(
              (m, a) => ({ ...m, [a.format]: (m[a.format] ?? 0) + 1 }),
              {},
            ),
          ),
          cutWithin2Weeks: d.ads.filter((a) => a.verdict === "cut").length,
        },
  meta: (d) =>
    !d.advertiser
      ? "No Meta ads found."
      : {
          source:
            d.source === "library"
              ? "Meta Ad Library keyword search, sorted by impressions (no delivery scores)"
              : "Upspring creative analysis",
          advertiser: d.advertiser,
          summary: d.brief?.summary,
          hookThemes: d.brief?.hookThemes.map((t) => ({ name: t.name, example: t.examples[0] })),
          hookTypes: d.brief?.hooks.map((h) => `${h.label} ${pct(h.share)}`),
          personas: d.brief?.personas.map((h) => `${h.label} ${pct(h.share)}`),
          mechanisms: d.brief?.mechanisms.map((h) => `${h.label} ${pct(h.share)}`),
          funnel: d.brief?.funnel.map((h) => `${h.label} ${pct(h.share)}`),
          followers: d.brief?.followers,
          topAds: top(d.ads, 12).map((a) => ({
            hook: a.hook,
            about: a.oneLine,
            strength: a.strength,
            active: a.active,
            started: a.startedAt?.slice(0, 10),
            offer: a.dims["offer_type"],
          })),
        },
  podcasts: (d) =>
    !d.sponsor
      ? "No podcast sponsorships found."
      : {
          totals: d.sponsor,
          estimatedSpendUsd: `${podcastSpend(d).join("-")} (rough: from show popularity and host-read CPMs)`,
          topShows: top(d.shows, 6).map((s) => `${s.title} (${s.ads} ads)`),
          recentReads: top(d.reads, 6).map((r) => ({
            show: r.show,
            date: r.date.slice(0, 10),
            hostRead: r.hostRead,
            summary: r.summary.slice(0, 300),
          })),
          adsPerMonth: d.monthly.slice(-18),
        },
  ugc: (d) =>
    !d.posts.length
      ? "No creator or UGC posts found."
      : {
          totalViews: d.totalViews,
          posts: d.totalPosts,
          paidShare: pct(d.posts.filter((p) => p.paid).length / d.posts.length),
          estimatedCreatorSpendUsd: `${creatorSpend(d.posts).range.join("-")} across ${creatorSpend(d.posts).posts} sponsored posts (2026 rate cards by follower tier)`,
          top: top(d.posts, 10).map((p) => ({
            platform: p.platform,
            creator: p.handle,
            followers: p.followers,
            views: p.views,
            engagement: p.engagement && pct(p.engagement),
            paid: p.paid,
            own: p.own,
            hook: p.hook,
            date: p.published.slice(0, 10),
          })),
        },
  trends: (d) => ({ searchInterestByMonth: d.points.slice(-24) }),
  traffic: (d) => (d.points.length ? { visitsByMonth: d.points } : "Website traffic unavailable."),
  reviews: (d) =>
    !d.items.length
      ? "No App Store or BBB reviews found."
      : {
          note: "The most critical reviews and newest complaints, not overall sentiment",
          appStore: d.app && { rating: d.app.rating, ratings: d.app.ratings },
          bbb: d.bbb && {
            complaints: d.bbb.complaints,
            byType: d.bbb.byType,
            reviewAverage: d.bbb.reviewAverage,
          },
          sample: top(d.items, 12).map((r) => r.text.slice(0, 200)),
        },
};

const INSIGHT =
  '{"title": string, "detail": string (one sentence, max 20 words, cite one number), "channel": "Meta"|"Google"|"Podcasts"|"UGC"|"Search"}';

export async function summarize(
  env: GlmEnv,
  brand: Brand,
  data: Partial<ChannelData>,
): Promise<Summary> {
  const research = Object.entries(data)
    .map(([k, v]) => `## ${k}\n${JSON.stringify(digests[k as Channel](v as never))}`)
    .join("\n\n");
  const where = brand.country ? ` in ${brand.country} (podcasts and traffic are global)` : "";
  const prompt = `You are a performance-marketing strategist. Below is public research on ${brand.name} (${brand.domain})${where}: its Meta and Google ads, podcast sponsorships, creator/UGC posts, search interest and site traffic.

Work out what has worked for them, what hasn't, and what a smaller business could copy. Evidence rules:
- A Google or Meta ad that has run for months is a winner (advertisers kill losers fast); one stopped within two weeks is a loser.
- Meta "strength" is Meta's 1-5 delivery indicator.
- Podcast ad volume rising month after month means it's working for them; a stop means it isn't.
- Compare spikes in search interest with months of heavy ad, podcast or UGC activity, but call it a correlation, never proof.
- Spend figures are estimates; say "an estimated" when you use them.
- Only use numbers that appear in the research. Skip a channel with no data rather than guessing.

Return JSON only:
{"industry": string (2-4 words, e.g. "Meal-kit delivery"), "competitors": [{"name": string, "domain": string}] (3 direct competitors you are confident exist), "headline": string (max 10 words), "verdict": string (one sentence, max 25 words), "worked": [${INSIGHT}] (3), "didnt": [${INSIGHT}] (2-3), "steal": [${INSIGHT}] (3 tactics another business could copy, concrete), "channels": [{"channel": string, "score": 0-10, "note": string (max 6 words)}] (one per channel with data)}

# Research
${research}`;
  const { message, model } = await chat(env, [{ role: "user", content: prompt }], { json: true });
  return { ...parseJson(message.content), model };
}

const RESEARCH_TOOL = {
  type: "function",
  function: {
    name: "research",
    description:
      "Look up one marketing channel for one of the two brands. Channels: meta (Meta ads, hooks, personas), google (Google ads and how long they ran), podcasts (podcast sponsorships and ad reads), ugc (creator posts on TikTok and Instagram), trends (search interest by month), traffic (website visits by month).",
    parameters: {
      type: "object",
      properties: {
        brand: { type: "string", enum: ["a", "b"] },
        channel: {
          type: "string",
          enum: ["meta", "google", "podcasts", "ugc", "trends", "traffic", "reviews"],
        },
      },
      required: ["brand", "channel"],
    },
  },
};

export async function compare(
  env: GlmEnv,
  a: Brand,
  b: Brand,
  lookup: (brand: Brand, channel: Channel) => Promise<unknown>,
  emit: (e: CompareEvent) => void,
): Promise<Comparison> {
  const messages: Message[] = [
    {
      role: "system",
      content: `You compare the marketing of two brands with the research tool. Brand a is ${a.name} (${a.domain}); brand b is ${b.name} (${b.domain}).
Research every channel for both brands (call the tool for several at once), then compare where each spends, which hooks and formats keep running, and who is winning attention.
Long-running ads are winners; ads stopped within two weeks are losers. Only cite numbers the tool returned. Before each batch of tool calls, write one short sentence saying what you're checking and why.
When done, reply with JSON only:
{"headline": string (max 14 words), "winner": "a"|"b"|"tie", "rows": [{"dimension": string, "a": string (max 12 words), "b": string (max 12 words), "edge": "a"|"b"|"tie"}] (5-8 rows: e.g. Meta ads, Google ads, Podcasts, UGC, Hooks, Search interest), "aStrengths": [string] (2-4), "bStrengths": [string] (2-4), "takeaways": [string] (3-4 lessons for a business competing with both)}`,
    },
    { role: "user", content: `Compare ${a.name} and ${b.name}.` },
  ];
  let model = env.GLM_MODEL || DEFAULT_MODEL;
  for (let turn = 0; turn < 8; turn++) {
    const r = await chat(env, messages, { tools: [RESEARCH_TOOL] });
    model = r.model;
    const msg = r.message;
    messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: msg.tool_calls });
    if (!msg.tool_calls?.length) {
      try {
        return { ...parseJson(msg.content), model };
      } catch {
        break;
      }
    }
    if (msg.content?.trim()) emit({ type: "step", text: msg.content.trim() });
    const results = await Promise.all(
      msg.tool_calls.map(async (call) => {
        let content: string;
        try {
          const args = JSON.parse(call.function.arguments || "{}");
          const brand = args.brand === "b" ? b : a;
          const channel = args.channel as Channel;
          if (!(channel in digests)) throw new Error(`Unknown channel ${channel}`);
          emit({ type: "tool", brand: brand.name, channel });
          content = JSON.stringify(await lookup(brand, channel));
        } catch (e) {
          content = `Error: ${(e as Error).message}`;
        }
        return { role: "tool" as const, tool_call_id: call.id, content };
      }),
    );
    messages.push(...results);
  }
  emit({ type: "step", text: "Writing the comparison…" });
  messages.push({
    role: "user",
    content: "Stop researching. Reply now with the comparison JSON only.",
  });
  const { message } = await chat(env, messages, { json: true });
  return { ...parseJson(message.content), model };
}

// Groups the opening lines of Meta ads and creator posts into patterns; the counts are computed here, not by the model.
export async function hookPatterns(
  env: GlmEnv,
  brand: Brand,
  data: Partial<ChannelData>,
): Promise<HookPatterns> {
  const items = [
    ...(data.meta?.ads ?? []).flatMap((a) =>
      a.hook ? [{ id: `m${a.id}`, text: a.hook, meta: a }] : [],
    ),
    ...(data.ugc?.posts ?? []).flatMap((p) =>
      p.hook ? [{ id: `u${p.id}`, text: p.hook, ugc: p }] : [],
    ),
  ];
  if (items.length < 4) return { patterns: [], model: "" };
  const list = items.map((x, i) => `${i}: ${x.text.slice(0, 160)}`).join("\n");
  const prompt = `These are the opening lines (hooks) of ${brand.name}'s Meta ads and of creator posts about it. Group them into 3-6 hook patterns, the reusable formula behind each line (e.g. "Price vs takeout", "Confession", "Busy-day relief"). Every line belongs to exactly one pattern.

Return JSON only: {"patterns": [{"name": string (2-4 words), "description": string (one sentence a marketer could reuse), "lines": number[] (indexes)}]}

${list}`;
  const { message, model } = await chat(env, [{ role: "user", content: prompt }], { json: true });
  const raw: { name: string; description: string; lines: number[] }[] =
    parseJson(message.content).patterns ?? [];
  const patterns: HookPattern[] = raw.flatMap((p) => {
    const members = (p.lines ?? []).flatMap((i) => (items[i] ? [items[i]] : []));
    if (!members.length) return [];
    const ads = members.flatMap((m) => ("meta" in m && m.meta ? [m.meta] : []));
    const posts = members.flatMap((m) => ("ugc" in m && m.ugc ? [m.ugc] : []));
    const best = [...posts].sort((a, b) => b.views - a.views)[0];
    return [
      {
        name: p.name,
        description: p.description,
        example: best?.hook ?? ads.find((a) => a.verdict === "winner")?.hook ?? members[0]!.text,
        meta: { ads: ads.length, winners: ads.filter((a) => a.verdict === "winner").length },
        ugc: { posts: posts.length, views: posts.reduce((n, x) => n + x.views, 0) },
      },
    ];
  });
  patterns.sort((a, b) => b.ugc.views - a.ugc.views || b.meta.ads - a.meta.ads);
  return { patterns, model };
}

export async function translateHooks(
  env: GlmEnv,
  _brand: Brand,
  data: Partial<ChannelData>,
): Promise<Translations> {
  const foreign = (data.ugc?.posts ?? []).filter((p) => p.language && p.language !== "en");
  if (!foreign.length) return { posts: {} };
  const list = foreign.map((p, i) => ({ i, hook: p.hook, caption: p.caption.slice(0, 400) }));
  const prompt = `Translate each social post's hook and caption into natural English. Keep emoji, @handles and #hashtags as they are.

Return JSON only: {"items": [{"i": number, "hook": string, "caption": string}]}

${JSON.stringify(list)}`;
  const { message } = await chat(env, [{ role: "user", content: prompt }], { json: true });
  const items: { i: number; hook: string; caption: string }[] = parseJson(message.content).items ?? [];
  return {
    posts: Object.fromEntries(
      items.flatMap((t) => {
        const p = foreign[t.i];
        return p ? [[p.id, { hook: t.hook, caption: t.caption }]] : [];
      }),
    ),
  };
}

// Groups complaints into themes and checks each against the ad copy. Mention counts and the ad text come
// from the indexes the model returns, so neither can be invented.
export async function complaintsVsAds(
  env: GlmEnv,
  brand: Brand,
  data: Partial<ChannelData>,
): Promise<Complaints> {
  const reviews = (data.reviews?.items ?? []).slice(0, 80);
  if (reviews.length < 5) return { themes: [], sample: reviews.length, model: "" };
  const ads = [
    ...(data.meta?.ads ?? []).flatMap((a) => {
      const text = [a.hook, a.oneLine].filter(Boolean).join(" | ");
      return text ? [{ text, channel: "Meta" as const }] : [];
    }),
    ...(data.podcasts?.reads ?? []).slice(0, 30).map((r) => ({
      text: r.summary.replace(/\s+/g, " "),
      channel: "Podcasts" as const,
    })),
  ];
  const seen = new Set<string>();
  const uniqueAds = ads.filter((a) => !seen.has(a.text) && !!seen.add(a.text)).slice(0, 60);
  const prompt = `Below are the most critical customer reviews and complaints about ${brand.name}, then the copy of its ads (Meta ads and podcast ad reads).

Group the complaints into 3-6 themes, biggest first. For each theme decide how the ads treat it:
- "addressed": an ad speaks to it directly (e.g. a quality complaint answered by an ad about better ingredients)
- "contradicted": an ad promises the opposite of what reviewers report
- "ignored": no ad touches it
Be strict: a generic discount doesn't address a complaint. Ads may be in other languages.

Return JSON only: {"themes": [{"name": string (2-4 words), "description": string (one sentence, max 18 words), "reviews": number[] (indexes of the reviews in this theme), "quote": number (index of the clearest review), "status": "addressed"|"ignored"|"contradicted", "ad": number|null (index of the ad that addresses or contradicts it), "note": string (one sentence, max 20 words: for ignored themes, the ad a competitor could run)}]}

# Reviews
${reviews.map((r, i) => `${i}: ${(r.title ? `${r.title}: ` : "") + r.text.slice(0, 300).replace(/\s+/g, " ")}`).join("\n")}

# Ads
${uniqueAds.length ? uniqueAds.map((a, i) => `${i} (${a.channel}): ${a.text.slice(0, 220)}`).join("\n") : "No ad copy available."}`;
  const { message, model } = await chat(env, [{ role: "user", content: prompt }], { json: true });
  const raw: {
    name: string;
    description: string;
    reviews: number[];
    quote: number;
    status: ComplaintTheme["status"];
    ad: number | null;
    note: string;
  }[] = parseJson(message.content).themes ?? [];
  const themes: ComplaintTheme[] = raw.flatMap((t) => {
    const members = [...new Set(t.reviews ?? [])].filter((i) => reviews[i]);
    if (!members.length) return [];
    const quote = reviews[members.includes(t.quote) ? t.quote : members[0]!]!;
    const ad = t.ad != null && t.status !== "ignored" ? uniqueAds[t.ad] : undefined;
    return [
      {
        name: t.name,
        description: t.description,
        mentions: members.length,
        quote: clip((quote.title ? `${quote.title}: ` : "") + quote.text, 220),
        status: ad ? t.status : "ignored",
        ad: ad ? { text: clip(ad.text, 220), channel: ad.channel } : null,
        note: t.note,
      },
    ];
  });
  themes.sort((a, b) => b.mentions - a.mentions);
  return { themes, sample: reviews.length, model };
}
