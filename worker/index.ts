// adfinder's Worker. It keeps the viewer's Firecrawl key in an encrypted HttpOnly cookie (page scripts never
// see it), runs the Alexandria calls for each channel, and caches every result in KV so a brand that has
// been searched once loads instantly and for free.
import { DurableObject } from "cloudflare:workers";
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import { llmsTxt } from "../shared/docs";
import { FEATURED } from "../shared/featured";
import type { Brand, Channel, ChannelData } from "../shared/types";
import { ApiError, alexandriaFor, credits } from "./alexandria";
import { compare, digests, hookPatterns, summarize, translateHooks, type GlmEnv } from "./llm";
import { handleMcp } from "./mcp";
import { CHANNELS, metaAdDetail } from "./sources";

type Env = GlmEnv & {
  CACHE: KVNamespace;
  RESEARCH: DurableObjectNamespace<Research>;
  ASSETS: Fetcher;
  COOKIE_SECRET: string;
  // Only the cron job uses this, to refresh the featured brands; visitors always use their own key.
  SEED_FIRECRAWL_API_KEY?: string;
};
type C = Context<{ Bindings: Env }>;
const app = new Hono<{ Bindings: Env }>();

const COOKIE = "adf";
const MONTH = 60 * 60 * 24 * 30;

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
async function suggest(query: string): Promise<{ name: string; domain: string }[]> {
  const q = query.trim().slice(0, 60);
  if (!q) return [];
  const r = await fetch(
    `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(q)}`,
  );
  const rows: any[] = r.ok ? await r.json() : [];
  return rows.slice(0, 6).map((x) => ({ name: x.name, domain: x.domain }));
}

app.get("/api/suggest", async (c) => {
  c.header("cache-control", "public, max-age=86400");
  return c.json(await suggest(c.req.query("q") ?? ""));
});

// ---------- channels ----------
const slug = (b: Brand, perCountry = true) =>
  (b.domain || b.name)
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/[^a-z0-9.]/g, "") + (perCountry && b.country ? `@${b.country}` : "");
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
  summary: ["sum:v2", summarize],
  hooks: ["hooks:v1", hookPatterns],
  translate: ["tr:v1", translateHooks],
} as const;

// Particle and Similarweb have no country filter, so every country view shares one copy.
const GLOBAL: Channel[] = ["podcasts", "traffic"];

const keyOf = (job: Job) =>
  job.kind === "channel"
    ? `ch:v2:${job.ch}:${slug(job.brand, !GLOBAL.includes(job.ch))}`
    : job.kind === "analysis"
      ? `${ANALYSES[job.name][0]}:${slug(job.brand)}`
      : `ad:v1:${job.id}`;

const featured = (b: Brand) => !b.country && FEATURED.some((f) => f.domain === b.domain);

// 0 keeps the entry until it is overwritten. Ad Library media URLs are signed and expire after about
// four days, so those results are kept for three.
function ttlOf(job: Job, value: unknown) {
  if (job.kind !== "ad" && featured(job.brand)) return 0;
  if ((value as { source?: string } | null)?.source === "library") return 3 * 24 * 60 * 60;
  return MONTH;
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
};
const ctxOf = (c: C): Ctx => ({ env: c.env, key: () => apiKey(c) });

async function compute(env: Env, job: Job, key: string): Promise<unknown> {
  if (job.kind === "channel") return CHANNELS[job.ch](alexandriaFor(key), job.brand);
  if (job.kind === "ad") return metaAdDetail(alexandriaFor(key), job.id);
  const data = await everything({ env, key: async () => key }, job.brand);
  return ANALYSES[job.name][1](env, job.brand, data);
}

async function save(env: Env, job: Job, value: unknown) {
  const seconds = ttlOf(job, value);
  await env.CACHE.put(keyOf(job), JSON.stringify(value), seconds ? { expirationTtl: seconds } : {});
}

async function research<T>(ctx: Ctx, job: Job): Promise<T> {
  const cacheKey = keyOf(job);
  if (!ctx.refresh) {
    const hit = await ctx.env.CACHE.get(cacheKey, "json");
    if (hit) return hit as T;
  }
  const key = await ctx.key();
  if (!key) throw new ApiError(SIGN_IN[job.kind], 401);
  if (ctx.refresh) {
    const value = await compute(ctx.env, job, key);
    await save(ctx.env, job, value);
    return value as T;
  }
  const stub = ctx.env.RESEARCH.get(ctx.env.RESEARCH.idFromName(cacheKey));
  const out = (await stub.run(job, key)) as Outcome;
  if ("error" in out) throw new ApiError(out.error, out.status);
  return out.value as T;
}

export class Research extends DurableObject<Env> {
  private pending: Promise<Outcome> | undefined;

  run(job: Job, key: string): Promise<Outcome> {
    this.pending ??= this.work(job, key).finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  private async work(job: Job, key: string): Promise<Outcome> {
    const hit = await this.env.CACHE.get(keyOf(job), "json");
    if (hit) return { value: hit };
    console.log(`research ${keyOf(job)}`);
    try {
      const value = await compute(this.env, job, key);
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
  const ctx: Ctx = { env: c.env, key: async () => bearer };
  return handleMcp(c.req.raw, {
    suggest,
    channel: (brand, ch) => channel(ctx, brand, ch),
    metaAd: (id) => research(ctx, { kind: "ad", id }),
  });
});

// ---------- language model ----------
const ALL = Object.keys(CHANNELS) as Channel[];

async function everything(ctx: Ctx, brand: Brand): Promise<Partial<ChannelData>> {
  const settled = await Promise.allSettled(ALL.map((ch) => channel(ctx, brand, ch)));
  const data = Object.fromEntries(
    settled.flatMap((r, i) => (r.status === "fulfilled" ? [[ALL[i], r.value]] : [])),
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
  const key = `cmp:v1:${slug(a)}|${slug(b)}`;
  const ctx = ctxOf(c);
  return streamSSE(c, async (stream) => {
    const send = (e: unknown) => stream.writeSSE({ data: JSON.stringify(e) });
    try {
      const hit = await c.env.CACHE.get(key, "json");
      const data =
        hit ??
        (await compare(
          c.env,
          a,
          b,
          async (brand, ch) => digests[ch]((await channel(ctx, brand, ch)) as never),
          (e) => void send(e),
        ));
      if (!hit)
        c.executionCtx.waitUntil(
          c.env.CACHE.put(key, JSON.stringify(data), { expirationTtl: MONTH }),
        );
      await send({ type: "result", data });
    } catch (e) {
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
