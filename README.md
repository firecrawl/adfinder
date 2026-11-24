# Ad Finder

Every ad, sponsorship and creator campaign behind any business, with an AI summary of what's working. Live at [adfinder.pandor.cc](https://adfinder.pandor.cc).

Type a brand and Ad Finder pulls its Meta and Google ads, podcast sponsorships, creator posts, search trends, web traffic and reviews through [Firecrawl Alexandria](https://www.firecrawl.dev), then writes a summary, the hook patterns it runs and how its ads answer customer complaints. Visitors sign in with their own Firecrawl account and pay for their own searches; the featured brands on the home page are free to browse.

It's also an MCP server (`/mcp`) and has an `llms.txt`, so agents can use it. See `/docs` on the site.

## Stack

- React 19 + Vite, served as static assets by a Cloudflare Worker
- The Worker (Hono) in `worker/`: the API, the MCP server, the cron that refreshes the featured brands
- Cloudflare KV for the cache, Durable Objects (`Research` runs each lookup once; `Budget` counts the daily AI budget), a rate limit binding, Workers Analytics Engine for usage events
- A language model through OpenRouter (or any OpenAI-compatible endpoint) for the analyses
- Bun for installs and scripts

## Run it

```sh
bun install
bun run dev        # needs .dev.vars, below
```

`.dev.vars` (secrets for the Worker; set the same ones with `wrangler secret put` in production):

| Name | What it's for |
|-|-|
| `COOKIE_SECRET` | Encrypts the session cookie that holds a visitor's Firecrawl key |
| `GLM_API_KEY` | The language model key for the analyses |
| `SEED_FIRECRAWL_API_KEY` | The house Firecrawl key: refreshes the featured brands and stale cache entries |

Optional: `GLM_BASE_URL` (defaults to OpenRouter), `GLM_MODEL`. `MODEL_DAILY_LIMIT` (in `wrangler.jsonc`) caps AI runs per day across the site.

`.env` (read by Vite at build time, optional): `VITE_POSTHOG_KEY` turns on PostHog analytics; without it nothing is sent.

## Data providers and caching

What each provider's terms allow decides how long its results are kept (`CACHE_POLICY` in `shared/channels.ts`):

| Channel | Provider | Cached |
|-|-|-|
| Meta ads | Upspring, or Meta's Ad Library when Upspring doesn't cover the brand | 3 days, shared |
| Google ads | Google Ads Transparency | 3 days, shared |
| Creators | Oriane (TikTok and Instagram) | 3 days, shared |
| Search trends | Firecrawl Trends | 3 days, shared |
| Reviews | Apple App Store and BBB | 3 days, shared |
| Podcasts | Particle | Never: fetched with the visitor's own key on each view |
| Web traffic | Similarweb | Never: fetched with the visitor's own key on each view |

Featured brands are kept 4 days and refreshed by the cron every 3. Empty results are kept 1 day. Past 2 days a cached result is still served and refreshed in the background. Analyses use only the shared channels.

## Checks and deploy

```sh
bun run typecheck
bunx oxlint --type-aware --deny-warnings .
bunx fallow dead-code && bunx fallow dupes --threshold 0.01
bun run deploy       # build, then wrangler deploy
```

Testing is mostly end to end in a browser at 390px and 1440px. `plan.md` holds the roadmap and what each phase measured.
