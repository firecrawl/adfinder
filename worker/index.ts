// adfinder's Worker. It keeps the viewer's Firecrawl key in an encrypted HttpOnly cookie (page scripts never
// see it), runs the Alexandria calls for each channel, and caches the results each provider's terms allow
// in KV, so a brand that has been searched once loads quickly and mostly for free.
import { DurableObject } from "cloudflare:workers";
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import { CACHE_POLICY, SHARED_CHANNELS } from "../shared/channels";
import { llmsTxt } from "../shared/docs";
import { FEATURED } from "../shared/featured";
import type { Brand, Channel, ChannelData } from "../shared/types";
import { ApiError, alexandriaFor, credits, webSearch, type Meter } from "./alexandria";
import {
  compare,
  complaintsVsAds,
  digests,
  hookPatterns,
  summarize,
  translateHooks,
  type GlmEnv,
} from "./llm";
import { handleMcp } from "./mcp";
import { CHANNELS, metaAdDetail } from "./sources";

type Env = GlmEnv & {
  CACHE: KVNamespace;
  RESEARCH: DurableObjectNamespace<Research>;
  BUDGET: DurableObjectNamespace<Budget>;
  MODEL_LIMIT: RateLimit;
  MODEL_DAILY_LIMIT?: string;
  EVENTS?: AnalyticsEngineDataset;
  ASSETS: Fetcher;
  COOKIE_SECRET: string;
  // Only the cron job uses this, to refresh the featured brands; visitors always use their own key.
  SEED_FIRECRAWL_API_KEY?: string;
};
type C = Context<{ Bindings: Env }>;
const app = new Hono<{ Bindings: Env }>();

const COOKIE = "adf";
const DAY = 60 * 60 * 24;
const MONTH = DAY * 30;

// ---------- session cookie (AES-GCM, key derived from COOKIE_SECRET) ----------
const enc = new TextEncoder();
const b64 = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const unb64 = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (ch) => ch.charCodeAt(0));
async function aesKey(secret: string) {
  if (!secret || secret.length < 32)
    throw new Error("COOKIE_SECRET must be set to at least 32 characters");
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}
type Session = { key: string; team: string };
async function seal(secret: string, s: Session) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await aesKey(secret),
      enc.encode(JSON.stringify(s)),
    ),
  );
  return b64(new Uint8Array([...iv, ...ct]));
}
async function session(c: C): Promise<Session | null> {
  const value = getCookie(c, COOKIE);
  if (!value) return null;
  try {
    const raw = unb64(value);
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: raw.slice(0, 12) },
      await aesKey(c.env.COOKIE_SECRET),
      raw.slice(12),
    );
    return JSON.parse(new TextDecoder().decode(pt));
  } catch {
    return null;
  }
}
async function signIn(c: C, s: Session, remember: boolean) {
  setCookie(c, COOKIE, await seal(c.env.COOKIE_SECRET, s), {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/api",
    ...(remember ? { maxAge: MONTH } : {}),
  });
}
const apiKey = async (c: C) => (await session(c))?.key ?? null;

app.use("/api/*", async (c, next) => {
  if (c.req.method !== "GET") {
    const origin = c.req.header("origin");
    if (origin && new URL(origin).host !== new URL(c.req.url).host)
      return c.json({ error: "Cross-origin request refused" }, 403);
  }
  await next();
});

app.onError((e, c) => {
  if (e instanceof ApiError) {
    const auth =
      e.status === 401 ? { auth: "missing" } : e.status === 402 ? { auth: "credits" } : {};
    return c.json({ error: e.message, ...auth }, e.status as 401);
  }
  console.error(e);
  return c.json({ error: e.message || "Something went wrong." }, 500);
});

// ---------- account ----------
app.get("/api/me", async (c) => {
  const s = await session(c);
  if (!s) return c.json({ connected: false });
  const u = await credits(s.key);
  if (!u) {
    deleteCookie(c, COOKIE, { path: "/api" });
    return c.json({ connected: false, rejected: true });
  }
  return c.json({ connected: true, teamName: s.team, ...u });
});

// Firecrawl's browser sign-in (the flow its CLI uses): the page opens firecrawl.dev/cli-auth with a PKCE
// challenge and polls here. On completion the key goes straight into the cookie and never to the page.
app.post("/api/auth/poll", async (c) => {
  const { session_id, code_verifier, remember = true } = await c.req.json();
  const r = await fetch("https://www.firecrawl.dev/api/auth/cli/status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ session_id, code_verifier }),
  });
  const j: any = await r.json().catch(() => ({}));
  if (j.status === "complete" && j.apiKey) {
    await signIn(c, { key: j.apiKey, team: j.teamName || "Firecrawl" }, remember);
    return c.json({ status: "complete", teamName: j.teamName || "Firecrawl" });
  }
  return c.json({ status: j.status ?? "pending" });
});

app.post("/api/auth/key", async (c) => {
  const { apiKey: key, remember = true } = await c.req.json();
  if (!/^fc-[A-Za-z0-9]+$/.test(key ?? ""))
    return c.json({ error: "That doesn't look like a Firecrawl API key." }, 400);
  if (!(await credits(key)))
    return c.json({ error: "Firecrawl rejected this API key.", auth: "rejected" }, 401);
  await signIn(c, { key, team: "API key" }, remember);
  return c.json({ ok: true });
});

app.post("/api/auth/logout", (c) => {
  deleteCookie(c, COOKIE, { path: "/api" });
  return c.json({ ok: true });
});

// ---------- brand autocomplete (free: Clearbit's public company suggest) ----------
type Suggestion = { name: string; domain: string };
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const GUESS_TLDS = ["com", "ai", "io", "dev", "co"];

// A candidate domain only counts if its home page title names the brand, which drops parked domains
// and same-name companies (exa.com is a Dassault product; Exa is exa.ai).
async function siteNamed(candidate: string, q: string): Promise<Suggestion | null> {
  try {
    const r = await fetch(`https://${candidate}`, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; adfinder/1.0)" },
      signal: AbortSignal.timeout(1500),
    });
    if (!r.ok) return null;
    const title =
      (await r.text())
        .slice(0, 100_000)
        .match(/<title[^>]*>([^<]*)</i)?.[1]
        ?.trim() ?? "";
    const host = new URL(r.url).hostname.replace(/^www\./, "");
    if (!squash(title).includes(squash(q)) || title.toLowerCase().includes(host)) return null;
    const name = title.split(/\s[|\-–—:·]\s/)[0]!.trim();
    return {
      name: squash(name).includes(squash(q)) && name.length <= 40 ? name : q,
      domain: host,
    };
  } catch {
    return null;
  }
}

// Clearbit's free lookup doesn't know many newer companies (Firecrawl, Tavily), so unless it already
// has the name at its own domain, the name's likely domains are tried too.
async function suggest(query: string): Promise<Suggestion[]> {
  const q = query.trim().slice(0, 60);
  if (!q) return [];
  const r = await fetch(
    `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(q)}`,
  );
  const rows: any[] = r.ok ? await r.json() : [];
  const known: Suggestion[] = rows.map((x) => ({ name: x.name, domain: x.domain }));
  const exact = (b: Suggestion) => squash(b.name) === squash(q);
  const label = squash(q.split(".")[0]!);
  let guessed: Suggestion[] = [];
  const looksLikeDomain = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(q);
  const settled = known.some((b) => exact(b) && b.domain.startsWith(`${label}.`));
  if (!settled && (looksLikeDomain || /^[a-z0-9 -]{3,30}$/i.test(q))) {
    const hosts = looksLikeDomain ? [q.toLowerCase()] : GUESS_TLDS.map((t) => `${label}.${t}`);
    const found = await Promise.all(hosts.map((h) => siteNamed(h, label)));
    guessed = found.filter((b): b is Suggestion => !!b);
  }
  const seen = new Set<string>();
  return [...guessed, ...known]
    .filter((b) => b.domain && !seen.has(b.domain) && seen.add(b.domain))
    .sort((a, b) => Number(exact(b)) - Number(exact(a)))
    .slice(0, 6);
}

// Profiles and directories that rank for a company's name but aren't its own site.
const NOT_OWN_SITE =
  /(^|\.)(wikipedia\.org|linkedin\.com|crunchbase\.com|x\.com|twitter\.com|facebook\.com|instagram\.com|youtube\.com|github\.com|reddit\.com|medium\.com|ycombinator\.com|g2\.com|producthunt\.com|pitchbook\.com|bloomberg\.com|glassdoor\.com|tiktok\.com|apple\.com|play\.google\.com)$/;

const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, "");
// The registrable label: "graza" for www.graza.co, "huel-usa" for huel-usa.com.
const labelOf = (host: string) => squash(host.split(".").slice(-2)[0] ?? "");

// For a name nothing else recognised: a Firecrawl web search for its official site. A result whose
// domain is the name ("graza.co" for "Graza olive oil") beats one whose title merely mentions it,
// which is how articles and reviews rank.
async function officialSite(
  key: string,
  name: string,
  meter: Meter,
): Promise<Suggestion & { description?: string }> {
  const want = squash(name);
  const results = (await webSearch(key, `${name} official website`, meter)).filter(
    (r) => !NOT_OWN_SITE.test(hostOf(r.url)),
  );
  const byDomain = results.find((r) => {
    const label = labelOf(hostOf(r.url));
    return label.length >= 3 && (want.startsWith(label) || label.startsWith(want));
  });
  const own = byDomain ?? results.find((r) => squash(r.title ?? "").startsWith(want));
  return own
    ? { name, domain: hostOf(own.url), description: own.description }
    : { name, domain: "" };
}

app.post("/api/resolve", async (c) => {
  const { name } = brandFrom(await c.req.json());
  const cacheKey = `res:v2:${squash(name)}`;
  const event = { kind: "resolve", name: "resolve", brand: squash(name) };
  const started = Date.now();
  const hit = await c.env.CACHE.get(cacheKey, "json");
  if (hit) {
    track(c.env, event, "hit", started);
    return c.json(hit);
  }
  const key = await apiKey(c);
  if (!key) throw new ApiError(SIGN_IN.channel, 401);
  const meter = { credits: 0 };
  const found = await officialSite(key, name, meter).catch((e: unknown) => {
    track(c.env, event, "error", started, meter);
    throw e;
  });
  track(c.env, event, "miss", started, meter);
  await c.env.CACHE.put(cacheKey, JSON.stringify(found), {
    expirationTtl: found.domain ? SHARED_TTL : EMPTY_TTL,
  });
  return c.json(found);
});

app.get("/api/suggest", async (c) => {
  const cache = caches.default;
  const hit = await cache.match(c.req.raw);
  if (hit) return hit;
  const res = c.json(await suggest(c.req.query("q") ?? ""), 200, {
    "cache-control": "public, max-age=86400",
  });
  c.executionCtx.waitUntil(cache.put(c.req.raw, res.clone()));
  return res;
});

// ---------- channels ----------
const slug = (b: Brand) =>
  (b.domain || b.name)
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/[^a-z0-9.]/g, "") + (b.country ? `@${b.country}` : "");
function brandFrom(body: any): Brand {
  const name = String(body?.name ?? "")
    .trim()
    .slice(0, 80);
  if (!name) throw new ApiError("Type a business name.", 400);
  return {
    name,
    domain: String(body?.domain ?? "")
      .trim()
      .toLowerCase()
      .slice(0, 100),
    country: /^[A-Z]{2}$/.test(body?.country ?? "") ? body.country : "",
  };
}

// Every cached result is a job. A cache miss is handed to the Research Durable Object named after the
// job's cache key, so one copy runs at a time: a second visitor, or the same one after a page refresh,
// joins the run already in progress instead of paying for it again, and a run outlives the tab that
// started it.
type Analysis = keyof typeof ANALYSES;
type Job =
  | { kind: "channel"; ch: Channel; brand: Brand }
  | { kind: "analysis"; name: Analysis; brand: Brand }
  | { kind: "ad"; id: string };
type Outcome = { value: unknown } | { error: string; status: number };

const ANALYSES = {
  summary: ["sum:v4", summarize],
  hooks: ["hooks:v2", hookPatterns],
  translate: ["tr:v2", translateHooks],
  complaints: ["gap:v2", complaintsVsAds],
} as const;

const keyOf = (job: Job) =>
  job.kind === "channel"
    ? `ch:v3:${job.ch}:${slug(job.brand)}`
    : job.kind === "analysis"
      ? `${ANALYSES[job.name][0]}:${slug(job.brand)}`
      : `ad:v2:${job.id}`;

const featured = (b: Brand) => !b.country && FEATURED.some((f) => f.domain === b.domain);

const SHARED_TTL = 3 * DAY;
const EMPTY_TTL = DAY;
// Featured brands outlive the cron's gap (at most 3 days, from "0 6 */3 * *") so they never go cold.
const FEATURED_TTL = 4 * DAY;
// Past this age a hit is still served, and refreshed in the background.
const STALE_AFTER = 2 * DAY * 1000;

// A result whose lists and maps are all empty: likely a brand the provider doesn't cover yet, so it's
// checked again sooner.
const isEmpty = (value: unknown) => {
  const parts = Object.values(value ?? {}).filter((v) => typeof v === "object" && v !== null);
  return parts.length > 0 && parts.every((v) => !Object.keys(v).length);
};

// Featured brands come first: an empty result expiring before the cron would lock anonymous visitors
// out. Ad Library media URLs are signed and expire after about four days, which the TTLs stay under.
function ttlOf(job: Job, value: unknown) {
  if (job.kind !== "ad" && featured(job.brand)) return FEATURED_TTL;
  if (isEmpty(value)) return EMPTY_TTL;
  return SHARED_TTL;
}

const SIGN_IN = {
  channel: "Sign in with Firecrawl to research a new brand.",
  analysis: "Sign in with Firecrawl to research a new brand.",
  ad: "Sign in with Firecrawl to open this ad.",
};

// What a job needs, from a request, the Durable Object or the cron job.
type Ctx = {
  env: Env;
  key: () => Promise<string | null>;
  // The cron job re-runs everything here, without the cache or the Durable Object.
  refresh?: boolean;
  // Present on requests, for refreshing a stale hit after the response.
  waitUntil?: (p: Promise<unknown>) => void;
  // An analysis being refreshed waits for its stale inputs to refresh first, or it would be rebuilt
  // from old data and then look fresh for another two days.
  refreshStale?: boolean;
};
const ctxOf = (c: C): Ctx => ({
  env: c.env,
  key: () => apiKey(c),
  waitUntil: (p) => c.executionCtx.waitUntil(p),
});

async function run(
  env: Env,
  job: Job,
  key: string,
  meter: Meter,
  refresh: boolean,
): Promise<unknown> {
  if (job.kind === "channel") return CHANNELS[job.ch](alexandriaFor(key, meter), job.brand);
  if (job.kind === "ad") return metaAdDetail(alexandriaFor(key, meter), job.id);
  const data = await everything({ env, key: async () => key, refreshStale: refresh }, job.brand);
  return ANALYSES[job.name][1](env, job.brand, data);
}

async function compute(env: Env, job: Job, key: string, refresh = false): Promise<unknown> {
  const started = Date.now();
  const meter = { credits: 0 };
  try {
    const value = await run(env, job, key, meter, refresh);
    track(env, eventOf(job), "miss", started, meter);
    return value;
  } catch (e) {
    track(env, eventOf(job), "error", started, meter);
    throw e;
  }
}

// One Analytics Engine row per lookup: blobs are kind, name, outcome and brand; doubles are milliseconds
// and Firecrawl credits. Analyses report 0 credits because their channel lookups are counted separately.
type Event = { kind: string; name: string; brand: string };
const eventOf = (job: Job): Event =>
  job.kind === "channel"
    ? { kind: "channel", name: job.ch, brand: slug(job.brand) }
    : job.kind === "analysis"
      ? { kind: "analysis", name: job.name, brand: slug(job.brand) }
      : { kind: "ad", name: "ad", brand: job.id };
function track(
  env: Env,
  e: Event,
  outcome: "hit" | "miss" | "error",
  started: number,
  meter?: Meter,
) {
  env.EVENTS?.writeDataPoint({
    indexes: [e.name],
    blobs: [e.kind, e.name, outcome, e.brand],
    doubles: [Date.now() - started, meter?.credits ?? 0],
  });
}

const hashOf = async (s: string) =>
  b64(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)))).slice(0, 22);

// Every language-model run spends the site's own model key, so each visitor gets a per-minute limit
// and the whole site a daily one. Only runs that call the model count; cached results are free.
async function allowModelRun(env: Env, key: string) {
  if (!(await env.MODEL_LIMIT.limit({ key: await hashOf(key) })).success)
    throw new ApiError("Too many AI requests at once. Try again in a minute.", 429);
  const today = env.BUDGET.get(env.BUDGET.idFromName(new Date().toISOString().slice(0, 10)));
  if (!(await today.take(Number(env.MODEL_DAILY_LIMIT ?? 500))))
    throw new ApiError("Ad Finder has used today's AI budget. Try again tomorrow.", 429);
}

export class Budget extends DurableObject<Env> {
  async take(limit: number) {
    const used = (await this.ctx.storage.get<number>("used")) ?? 0;
    if (used >= limit) return false;
    await this.ctx.storage.put("used", used + 1);
    return true;
  }
}

type Meta = { fetchedAt: number };
const isStale = (meta: Meta | null) => !meta || Date.now() - meta.fetchedAt > STALE_AFTER;

async function save(env: Env, job: Job, value: unknown) {
  await env.CACHE.put(keyOf(job), JSON.stringify(value), {
    expirationTtl: ttlOf(job, value),
    metadata: { fetchedAt: Date.now() } satisfies Meta,
  });
}

const live = (job: Job) => job.kind === "channel" && CACHE_POLICY[job.ch] === "none";

async function research<T>(ctx: Ctx, job: Job): Promise<T> {
  const cacheKey = keyOf(job);
  // Fetched with the viewer's own key and never stored, so no one else is ever shown it.
  if (live(job)) {
    const key = await ctx.key();
    if (!key) throw new ApiError(SIGN_IN[job.kind], 401);
    return (await compute(ctx.env, job, key)) as T;
  }
  if (!ctx.refresh) {
    const started = Date.now();
    const { value: hit, metadata } = await ctx.env.CACHE.getWithMetadata<unknown, Meta>(
      cacheKey,
      "json",
    );
    if (hit) {
      track(ctx.env, eventOf(job), "hit", started);
      if (!isStale(metadata)) return hit as T;
      if (ctx.refreshStale) {
        const key = await ctx.key();
        const out = key
          ? ((await researcher(ctx.env, cacheKey).run(job, key, true)) as Outcome)
          : null;
        return (out && "value" in out ? out.value : hit) as T;
      }
      // Refreshed on the house key: the viewer's would spend their credits on data they've already seen.
      const seed = ctx.env.SEED_FIRECRAWL_API_KEY;
      if (ctx.waitUntil && seed) ctx.waitUntil(researcher(ctx.env, cacheKey).run(job, seed, true));
      return hit as T;
    }
  }
  const key = await ctx.key();
  if (!key) throw new ApiError(SIGN_IN[job.kind], 401);
  if (ctx.refresh) {
    const value = await compute(ctx.env, job, key);
    await save(ctx.env, job, value);
    return value as T;
  }
  const out = (await researcher(ctx.env, cacheKey).run(job, key)) as Outcome;
  if ("error" in out) throw new ApiError(out.error, out.status);
  return out.value as T;
}

const researcher = (env: Env, cacheKey: string) =>
  env.RESEARCH.get(env.RESEARCH.idFromName(cacheKey));

export class Research extends DurableObject<Env> {
  private pending: Promise<Outcome> | undefined;

  // `refresh` re-runs a stale entry. Visitors who see it stale at the same moment share one refresh.
  run(job: Job, key: string, refresh = false): Promise<Outcome> {
    this.pending ??= this.work(job, key, refresh).finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  private async work(job: Job, key: string, refresh: boolean): Promise<Outcome> {
    const { value: hit, metadata } = await this.env.CACHE.getWithMetadata<unknown, Meta>(
      keyOf(job),
      "json",
    );
    if (hit && !(refresh && isStale(metadata))) return { value: hit };
    console.log(`research ${keyOf(job)}`);
    try {
      // Charged here rather than per request, so visitors who join a run already in progress aren't, and
      // only on the first model call, since some analyses return early without one.
      let admitted: Promise<void> | undefined;
      const env =
        job.kind === "analysis"
          ? { ...this.env, admit: () => (admitted ??= allowModelRun(this.env, key)) }
          : this.env;
      const value = await compute(env, job, key, refresh);
      await save(this.env, job, value);
      return { value };
    } catch (e) {
      // Errors cross the RPC boundary as plain messages, so the status travels alongside.
      return {
        error: (e as Error).message || "Something went wrong.",
        status: e instanceof ApiError ? e.status : 500,
      };
    }
  }
}

const channel = <K extends Channel>(ctx: Ctx, brand: Brand, ch: K) =>
  research<ChannelData[K]>(ctx, { kind: "channel", ch, brand });

app.post("/api/channel/:channel", async (c) => {
  const ch = c.req.param("channel") as Channel;
  if (!(ch in CHANNELS)) return c.json({ error: "Unknown channel" }, 404);
  return c.json(await channel(ctxOf(c), brandFrom(await c.req.json()), ch));
});

app.post("/api/meta-ad/:id", async (c) => {
  const id = c.req.param("id");
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(id)) return c.json({ error: "Bad ad id" }, 400);
  return c.json(await research(ctxOf(c), { kind: "ad", id }));
});

// ---------- MCP ----------
// Agents pass their own Firecrawl key as a bearer token. The session cookie is never read here, and no
// tool calls the language model.
app.get("/llms.txt", (c) => {
  c.header("cache-control", "public, max-age=3600");
  return c.text(llmsTxt());
});

app.all("/mcp", (c) => {
  // Someone opening the endpoint in a browser gets the setup page instead of a protocol error.
  const accept = c.req.header("accept") ?? "";
  if (
    c.req.method === "GET" &&
    accept.includes("text/html") &&
    !accept.includes("text/event-stream")
  )
    return c.redirect("/docs");
  const bearer = c.req.header("authorization")?.match(/^Bearer\s+(fc-[A-Za-z0-9]+)$/)?.[1] ?? null;
  const ctx: Ctx = {
    env: c.env,
    key: async () => bearer,
    waitUntil: (p) => c.executionCtx.waitUntil(p),
  };
  return handleMcp(c.req.raw, {
    suggest,
    channel: (brand, ch) => channel(ctx, brand, ch),
    metaAd: (id) => research(ctx, { kind: "ad", id }),
  });
});

// ---------- language model ----------
// Analyses are cached and shared, so they're built only from channels that may be shared.
async function everything(ctx: Ctx, brand: Brand): Promise<Partial<ChannelData>> {
  const settled = await Promise.allSettled(SHARED_CHANNELS.map((ch) => channel(ctx, brand, ch)));
  const data = Object.fromEntries(
    settled.flatMap((r, i) => (r.status === "fulfilled" ? [[SHARED_CHANNELS[i], r.value]] : [])),
  );
  if (!Object.keys(data).length) throw (settled[0] as PromiseRejectedResult).reason;
  return data;
}

for (const name of Object.keys(ANALYSES) as Analysis[]) {
  app.post(`/api/${name}`, async (c) => {
    if (!c.env.GLM_API_KEY)
      return c.json({ error: "No language model is set up (GLM_API_KEY)." }, 503);
    const brand = brandFrom(await c.req.json());
    return c.json(await research(ctxOf(c), { kind: "analysis", name, brand }));
  });
}

app.post("/api/compare", async (c) => {
  if (!c.env.GLM_API_KEY)
    return c.json({ error: "No language model is set up (GLM_API_KEY)." }, 503);
  const body = await c.req.json();
  const a = brandFrom(body.a);
  const b = brandFrom(body.b);
  const key = `cmp:v2:${slug(a)}|${slug(b)}`;
  const ctx = ctxOf(c);
  const event = { kind: "analysis", name: "compare", brand: `${slug(a)}|${slug(b)}` };
  const started = Date.now();
  const hit = await c.env.CACHE.get(key, "json");
  if (hit) track(c.env, event, "hit", started);
  else {
    const visitor = await ctx.key();
    if (!visitor) throw new ApiError(SIGN_IN.analysis, 401);
    await allowModelRun(c.env, visitor);
  }
  return streamSSE(c, async (stream) => {
    const send = (e: unknown) => stream.writeSSE({ data: JSON.stringify(e) });
    try {
      const data =
        hit ??
        (await compare(
          c.env,
          a,
          b,
          async (brand, ch) => digests[ch]((await channel(ctx, brand, ch)) as never),
          (e) => void send(e),
        ));
      if (!hit) {
        track(c.env, event, "miss", started);
        c.executionCtx.waitUntil(
          c.env.CACHE.put(key, JSON.stringify(data), { expirationTtl: SHARED_TTL }),
        );
      }
      await send({ type: "result", data });
    } catch (e) {
      track(c.env, event, "error", started);
      await send({ type: "error", error: (e as Error).message });
    }
  });
});

// Re-fetches every featured brand. A channel that fails keeps its previous copy.
async function seedFeatured(env: Env) {
  const seedKey = env.SEED_FIRECRAWL_API_KEY;
  if (!seedKey)
    return console.warn("SEED_FIRECRAWL_API_KEY is not set; featured brands not refreshed");
  for (const brand of FEATURED) {
    const ctx: Ctx = { env, key: async () => seedKey, refresh: true };
    try {
      const data = await everything(ctx, brand);
      if (env.GLM_API_KEY)
        await Promise.allSettled(
          (Object.keys(ANALYSES) as Analysis[]).map(async (name) => {
            const job: Job = { kind: "analysis", name, brand };
            await save(env, job, await ANALYSES[name][1](env, brand, data));
          }),
        );
      console.log(`seeded ${brand.name}: ${Object.keys(data).join(", ")}`);
    } catch (e) {
      console.error(`seeding ${brand.name} failed`, e);
    }
  }
}

export default {
  fetch: app.fetch,
  scheduled: (_event: ScheduledController, env: Env, ctx: ExecutionContext) =>
    ctx.waitUntil(seedFeatured(env)),
} satisfies ExportedHandler<Env>;
