# Ad Finder plan

Ad Finder is becoming a product, not only a showcase for Firecrawl Alexandria: every ad behind any business, a dashboard of the brands you track (your own included), and a report on where each brand is heading and what to fix. Alexandria stays the data source and is credited throughout. Work through the phases in order. Each phase ships on its own.

Status key: `[ ]` todo, `[~]` in progress, `[x]` done.

## How each phase is checked and rolled back
- End-to-end in Agent Browser at 390px and 1440px (CLAUDE.md: few tests, mostly end-to-end). Unit tests only for logic a browser can't reach, such as cache-policy selection
- Cache changes are checked on the KV store itself: `wrangler kv key list --binding CACHE --prefix <prefix>`
- Before/after numbers come from the analytics in Phase 0
- Roll back a bad deploy with `wrangler rollback`. D1 migrations (Phase 4) don't roll back, so make them additive only

---

## Phase 0: Guardrails (first, small) [~]

Anyone can spend the site's language-model key today.

- [x] **Compare needs sign-in.** `/api/compare` never checked for a session, so an anonymous visitor could run up to 8 model turns for two cached brands. A cached comparison is still served to anyone; a new one now needs sign-in and passes the model limits below
  - Not done: in-flight dedupe through the `Research` Durable Object. Compare streams its steps, which a Durable Object call doesn't pass through easily. The per-visitor limit caps the cost instead
- [x] **Rate limit the model endpoints** (`/api/summary`, `hooks`, `translate`, `complaints`, `compare`): `allowModelRun` in `worker/index.ts`. A run is charged once, at its first model call, inside the `Research` Durable Object. So cache hits, visitors joining a run in progress, and analyses that return early without calling the model are all free
  - Per visitor: 10 runs a minute (`MODEL_LIMIT` rate-limit binding, keyed by a hash of their Firecrawl key)
  - Site-wide: `MODEL_DAILY_LIMIT` runs a day (500, a var in `wrangler.jsonc`), counted in the `Budget` Durable Object
  - The featured-brands cron isn't limited
- [x] **Analytics:** one Workers Analytics Engine row (dataset `adfinder_events`) per channel, analysis, ad, resolve and compare lookup
  - blobs: kind, name, outcome (`hit`/`miss`/`error`), brand
  - doubles: milliseconds, Firecrawl credits
  - Credits come from `data.creditsCost` on each Firecrawl response, added up by a `Meter` in `worker/alexandria.ts`
  - double3 (from Phase 2): milliseconds spent waiting out rate limits, summed across a lookup's parallel calls
  - Query it with the Analytics Engine SQL API (`wrangler auth token` works as the bearer token), e.g. `SELECT blob2 AS channel, avg(double1) AS ms, sum(double2) AS credits, avg(double3) AS waited FROM adfinder_events WHERE blob3 = 'miss' GROUP BY channel`
- [x] **Terms and Privacy page** at `/terms` (`src/pages/TermsPage.tsx`), linked from the footer and the sign-in dialog. It binds visitors to the provider terms (Similarweb's in particular) and says what's stored. Update it in Phase 4 when accounts and emails are stored
- [ ] **Ask Firecrawl** (Phase 1 shipped assuming "no" to both; a "yes" to question 1 would allow per-user podcast caching):
  1. Can data fetched with visitor A's key be shown to visitor B, through the site and through `/mcp`?
  2. Can analyses built from Particle or Similarweb data (summary, compare) be cached and shared?
  3. What are Upspring's rate limits on `ads/browse` and the reviews providers? Phase 2 saw waits of a minute or more even with a minute between brands

  Write the answers here.

**Done when:** an anonymous request to `/api/compare` gets 401, a burst of model requests gets 429, and the analytics show hit/miss and credits per channel.

Checked locally:
- An anonymous compare or summary of an uncached brand gets 401
- With the daily budget at 0: the budget's 429 first, then the per-visitor 429 after 10 requests in a minute

Shipped in PR #1 and deployed on 23 Nov 2026 (version `779099f4`). On the live site:
- `/terms` loads
- An anonymous compare of an uncached pair gets 401
- Cached brands still load in about 0.2s

Still to do:
- [x] Events arrive in Analytics Engine (checked 24 Nov with `wrangler auth token` and the SQL API; numbers in Phase 2)
- Get Firecrawl's answers to the two questions above

---

## Phase 1: Cache within provider terms [x]

Before this phase, every result was cached in KV for 30 days and shared between all visitors. Built in PR #2.

| Provider | Channel | What its terms say | Policy |
|-|-|-|-|
| Similarweb | `traffic` | No caching or reuse beyond the query that fetched it, in that session | `none` |
| Particle | `podcasts` | No reuse of stored data for a later or different query. Transcripts only cached briefly for display. Attribution required | `none` (or per-user, if Firecrawl says yes) |
| Upspring | `meta` | Keep and use for any lawful purpose, no standalone resale | `shared` |
| Google Ads Transparency, Apple, BBB, Oriane, Firecrawl Trends | `google`, `reviews`, `ugc`, `trends` | General terms only | `shared` |

- [x] **A cache policy per channel**, `CACHE_POLICY` in `shared/channels.ts`, which is now the single list of channels (`CHANNEL_LIST`) for the worker and the client. Only `shared` and `none` exist so far
  - Not done: `per-user`. Add it only if Firecrawl allows per-user caching (Phase 0, question 1)
- [x] **`none` has its own path:** `research` calls `compute` directly, with no KV and no `Research` Durable Object
- [x] **Traffic and podcasts in other paths:**
  - `everything()` only uses `SHARED_CHANNELS`, so the seeding cron and every shared analysis (summary, hooks, translate, complaints) leave them out. The summary and complaints prompts no longer mention podcasts or traffic
  - Compare's research tool only offers the shared channels
  - The client starts the analyses once the shared channels have loaded, without waiting on the live ones
- [x] **Podcasts:** fetched live on each view, with the browser's `memo` as the only cache. Anonymous visitors get "sign in to load". Particle's attribution ("Podcast data from Particle, via Firecrawl Alexandria.", `ParticleCredit` in `src/components/ui.tsx`) is shown wherever podcast data is: the Podcasts tab, Overview, Compare and the MCP output
  - Particle's exact attribution wording isn't in the Alexandria catalogue; confirm it with Firecrawl alongside Phase 0's questions
  - If Firecrawl allows per-user caching, key it on an HMAC of the API key: the cookie can't be hashed because `seal` uses a random IV
- [x] **TTLs:** shared 3 days, empty results 1 day, featured brands 4 days even when empty (the `0 6 */3 * *` cron's longest gap is 3 days). A result counts as empty when all its lists and maps are empty
- [x] **Every cache key family bumped:** `ch:v3`, `ad:v2`, `res:v2`, `sum:v4`, `hooks:v2`, `tr:v2`, `gap:v2`, `cmp:v2`. `res` and `cmp` now use the 3-day TTL too
- [x] **Stale-while-revalidate:** `save` writes `fetchedAt` as KV metadata. A hit older than 2 days is served, then refreshed in the background through the `Research` Durable Object (so simultaneous visitors share one refresh) on `SEED_FIRECRAWL_API_KEY`. Analysis refreshes pass the model limits on the seed key, and wait for their stale channels to refresh first. `res` and `cmp` don't refresh; they just expire

Checked locally:
- Anonymous podcasts and traffic get 401; signed in, they load and nothing is written to KV
- A shared channel is written as `ch:v3:…` with `fetchedAt` and the right TTL (4 days for a featured brand, 1 day for an empty result)
- A backdated entry is served at once and refreshed in the background; a backdated analysis refreshes its backdated channel first
- Podcasts tab at 390px (sign-in prompt) and 1440px (data plus attribution), Overview at 1440px (attribution), no console errors

Shipped in PR #2 and deployed on 23 Nov 2026 (version `4e69654d`):
- Deleted all 73 podcast and traffic keys from production KV
- On the live site, anonymous podcasts and traffic get 401
- Later the same day, deleted the remaining 447 old-version keys (`ch:v2`, `sum:v3`, `hooks:v1` and the rest), so KV holds nothing older than this deploy. A `wrangler rollback` would now start with an empty cache
- Filled the featured brands by hand with the seed key: KV now holds 25 `ch:v3` channel entries and 5 each of `sum:v4`, `hooks:v2`, `tr:v2` and `gap:v2`, and no podcast or traffic keys
- Signed out on the live site, a featured brand's Meta, reviews and summary return 200; podcasts and traffic return 401. Signed in, podcasts return 200

Still open, with Firecrawl (tracked in Phase 0): Particle's exact attribution wording, and whether per-user caching is allowed

**Done when:** `wrangler kv key list` shows no traffic or podcast keys, no shared entry is older than 3 days (4 for featured brands), and podcasts still load for a signed-in visitor.

---

## Phase 2: Speed up the first search [x]

A cached brand loads in about 0.1–0.4s per channel. A brand nobody has searched yet is slow. Measure a cold search before and after with Phase 0's analytics and PostHog, and write the numbers here. This comes before the dashboard because every dashboard refresh is a cold search.

Before, from the 5 featured brands filled cold on 23 Nov (Analytics Engine, misses only):

| Lookup | Average | Median | Slowest | Credits per brand |
|-|-|-|-|-|
| Meta | 45.2s | 26.7s | 87.0s | 240 |
| Reviews | 32.8s | 22.8s | 87.0s | 17 |
| UGC | 10.5s | 1.8s | 25.5s | 130 |
| Trends | 10.1s | 1.6s | 24.3s | 5 |
| Google | 0.8s | 0.9s | 0.9s | 5 |
| Podcasts (2 live loads) | 4.0s | | 4.2s | 100 |
| Summary, once channels are cached | 3.6s | 3.4s | 5.3s | model only |

So a cold brand shows Google in under a second, but its summary waits for the slowest channel, usually Meta or reviews: about 30–90s.

- [x] **Find where cold time goes.** Timed each call on 24 Nov. The providers answer in about 1–4s each; the long waits are Upspring rate-limiting `ads/browse` (one call waited 42 of its 44s when browse ran again within about a minute). Other lookups that run alongside Meta finished in under a second. The limit isn't documented in the catalogue
  - Each lookup now records its rate-limit wait (`Meter.waitedMs`, Analytics Engine double3), to see how often this happens in production
  - `advertisers/by-domain` (one call for the advertiser and its brief) doesn't help: for AG1 it waited 20s and still answered `pending` with no advertiser id
- [x] **Meta Ad Library fallback:** no scrolling and no `waitFor`. Results are read from JSON embedded in the first response, so scrolling never added ads (29 either way for Gymshark) and cost 11s; a fresh search now takes about 14s instead of 27s
- [x] **Calls that run one after another:** Meta's domain and name searches now run together (both always ran), and BBB's two candidate profiles are checked together. Podcasts already run shows, segments and timeseries in parallel after the sponsor lookup
- [x] **Start the analyses without waiting for every channel:**
  - Client: `useBrand` asks for the analyses as the page opens
  - Server: `everything()` stops waiting after 20s (`ANALYSIS_DEADLINE`; 25s at first, lowered after the live test below) and analyses what has arrived, unless nothing has. Slow channels carry on in their own `Research` objects and are cached when done. The cron and stale refreshes still wait for everything
  - An analysis made that way is marked `partial`, returned but never cached. Once every channel has arrived the page asks again and gets the full one, which is cached as usual
  - Checked locally with the deadline at 3s: a partial summary in 5.7s while reviews took 12.9s, nothing cached; the next request built and cached the full one
- [x] **Space out the house key's browse calls:** the featured-brands cron waits 60s between brands (about 4 more minutes per run, well inside the 15-minute cron limit)
- [x] **Loading checklist** under the tabs while anything loads: each channel with its Alexandria provider and a tick, spinner, lock (sign in) or cross. Providers and credit costs live in `CHANNEL_INFO` (`shared/channels.ts`)
- [x] **Credit estimate:** signed-in visitors see what the load costs from their Firecrawl account, using `/api/cached` (which shared channels are already cached) and catalogue prices. A first search for a brand is about 780 credits; a cached brand still costs about 370, because podcasts (100) and traffic (6 months × 45) are fetched fresh on every visit
  - Shown as the search starts rather than as a confirmation before it: a confirm step would add a click to every search. Revisit if PostHog shows people leaving on cold searches
- [x] **PostHog** (`src/analytics.ts`), loaded after the page and only when `VITE_POSTHOG_KEY` is set at build time:
  - EU host, memory persistence (no cookies or local storage), no person profiles, no click autocapture, no session recording. Page views and web vitals
  - Events: `search`, `brand_viewed`, `tab_opened`, `compare_started`, `sign_in_started` / `sign_in_completed`, `channel_loaded` (ms, cached, ok), `analysis_loaded` (ms, partial, ok). Never a key, a cookie or sign-in form input
  - The Privacy page names PostHog and what it records

Dropped:
- **Show Meta's brief before its ads.** The browse rate limit mostly hits when one account looks up several brands within a minute (the cron, a comparison). The analysis deadline already stops it holding up the summary, and splitting the channel would change its cache entry, the MCP output and the Meta tab. Revisit if double3 shows visitors waiting often
- **Pre-warm the 50 most searched brands.** Since Phase 1, any brand opened at least every 3 days stays warm through stale-while-revalidate, which is exactly the popular ones. A queue would mostly refresh brands nobody is looking at, at about 400 credits each on the house key
- **Start channels in parallel with `/api/resolve`.** Cache keys use `domain || name`, so a name-only run and the later domain run would pay twice, and podcasts and UGC match on the domain. Resolve also only runs for free-typed names

**Done when:** a new brand shows its first channel in under 5s and the summary in under 30s.

After, on the live site on 24 Nov (version `8fab4952`), three brands nobody had searched, timed in Analytics Engine with the 5 cacheable channels and the summary started together:

| Brand | First channel | Summary | Meta | Reviews |
|-|-|-|-|-|
| Olipop | Google 0.7s | 8.3s | 5.4s | 0.9s |
| Bombas | Google 0.5s | 27.7s | 62.7s, 116s of rate-limit waits | 1.2s |
| Ridge | Google 1.4s | 29.7s | 63.4s, 114s of waits | 62.1s, 181s of waits |

- Both targets met: the first channel in 0.5–1.4s, the summary in 8–30s (30–90s before)
- Ridge's 29.7s left no margin, so the deadline went from 25s to 20s. Every channel that wasn't rate-limited arrived within 4s, so the shorter deadline loses nothing the longer one would have caught
- Rate limits hit 2 of 3 brands despite a minute between them (waits are summed across parallel calls, so they exceed the wall time). The seed key had been used heavily that day; visitors on their own keys may see fewer. Asked about in Phase 0, question 3. If double3 keeps showing this for visitors, reconsider showing Meta's brief before its ads (dropped above)

---

## Phase 3: Layout, mobile and accessibility

From screenshots of the live site at 390px wide. This comes before the report, so the report reuses fixed components.

- [ ] **Tabs:** on mobile they run off the screen, hiding Podcasts and Creators. Make them scroll with a fade at the edge, or wrap them
- [ ] **Hook patterns:** the table is unreadable on mobile (the description wraps one word per line). Use stacked cards under about 640px
- [ ] **Overview:**
  - Mobile: about 5,000px tall. Put the summary first and collapse the sections below
  - Make it one `Scorecard` component (headline, a 0–10 score per channel, 3 key numbers), so the report can reuse it
  - Desktop: a sticky section list down the side
- [ ] **Meta tab:** lead with our own hook patterns; Upspring's hook themes are generic ("Service promotion")
- [ ] **Empty states:** say why a channel is empty (no ads found, no data for this country, or sign in to load) and offer the next step
- [ ] **Accessibility:** tab keyboard behaviour, contrast in both themes, alt text on ad images, focus states
- [ ] **README:** replace the Vite template with what Ad Finder is, how to run it, the env vars, and the providers it uses and their cache policies

---

## Phase 4: Accounts, homepage and dashboard

Signed out, the home page is a landing page that shows what Ad Finder does. Signed in, it's a dashboard of the brands you track. Today the home page is a wordmark, one tagline, a search box and five "Try" chips, and a Firecrawl sign-in lives only in a cookie, so nothing can be saved.

**Decide first: who pays for dashboard refreshes.** Tracked brands are refreshed without the user there, and each refresh spends Firecrawl credits. Either:
- store each user's Firecrawl key encrypted (with consent) and refresh on their account, or
- refresh on a house key with a cap on tracked brands per user (a free tier, with a paid tier later)

### 4a. Accounts
- [ ] **Sign in with Google or an email link.** Use a library that runs on Workers with D1 (e.g. Better Auth). Email links need an email provider (Resend or Postmark), which 4d's alerts reuse
- [ ] **Connect Firecrawl** from settings, with the existing Firecrawl sign-in or a pasted key. Searching still runs on the user's own Firecrawl account. Anonymous visitors can still browse the featured brands
- [ ] **User store (D1), additive migrations only:** users, connected Firecrawl key (encrypted, if 4a's decision needs it), tracked brands, snapshots
- [ ] **Privacy:** delete-my-account removes the user, their tracked brands, snapshots and stored key. Update the Privacy page, and switch PostHog from cookieless to identified users with consent
- [ ] **Turn PostHog on** (moved from Phase 2; the code shipped there and stays silent without a key):
  - Create an EU project and put its key in `.env` as `VITE_POSTHOG_KEY` before `bun run deploy`
  - Turn on "Discard client IP data" in the project settings
  - Build the funnel (home → search → brand viewed → sign in started → sign in completed, then account created) and a dashboard of `channel_loaded` and `analysis_loaded` ms, cached vs not
- [ ] Move existing signed-in visitors over: a Firecrawl cookie with no account keeps working until it expires

### 4b. Landing page (signed out)
- [ ] **Hero:** the search box stays at the top. A sharper tagline and one line on what's free (the featured brands) and what needs an account
- [ ] **Feature sections, each shown with real data** from a featured brand's shared cache (never podcasts or traffic, which can't be shown to anonymous visitors):
  - Every ad on Meta and Google, with how long each has run
  - Creator posts (UGC), search trends and reviews
  - The AI summary, hook patterns, and complaints matched against ads
  - Compare two businesses
  - The dashboard and weekly email (4c, 4d)
  - The MCP server and `llms.txt`, for using it from an agent
- [ ] **Data from Firecrawl Alexandria:** the provider behind each channel, linking to the Docs page
- [ ] **Featured brands as cards** (logo, ad counts, one line from the summary) instead of bare chips. Fall back to the chips when the cache is cold
- [ ] **Meta tags and share image** for `/`: title, description and an `og:image` (Phase 5b covers per-report images)

### 4c. Dashboard (signed in)
- [ ] **Track a brand** from its page or the dashboard. Mark one as **your brand**; it's pinned first and the comparisons below are against it
- [ ] **A card per tracked brand:** logo, active ads per channel, ads started and stopped since the last snapshot, newest creator posts, and the summary's headline
- [ ] **Snapshots:** the refresh stores each tracked brand's shared-cache channels in D1 so changes can be shown. Podcasts and traffic are never stored (provider terms); they load live when the brand is opened
- [ ] **Thumbnails in R2** for ads in snapshots: Meta's media links expire after about 4 days
- [ ] **Refresh:** through Cloudflare Queues, one brand per message, on 4a's chosen key, spaced out so Upspring's `ads/browse` limit isn't hit (Phase 2)
- [ ] Recently viewed moves here from the home page

### 4d. Weekly email
- [ ] For each user, what changed for their tracked brands: new ads, ads stopped, new creator posts. Every email has an unsubscribe link

### Not doing
- Posting or managing ads from Ad Finder. That needs Meta and Google ads API access and app review, ad account connections and billing: a different product
- Saving ads Ad Finder can't find (a pasted link or screenshot) waits for Phase 7's boards

Check every part at 390px and 1440px, in both themes.

**Done when:** a new user can sign in with Google or email, connect Firecrawl, track their own brand and two competitors, see what changed on the dashboard after the next refresh, and get the weekly email. Signed out, the home page shows what Ad Finder does without a search.

---

## Phase 5: The report

A page built to share, print and save as PDF, saying where the brand is heading and what to improve. Built from analyses that already exist: `summarize`, `hookPatterns` and `complaintsVsAds`.

### 5a. Report page and print
Route `/report?q=<name>&d=<domain>`, opened from a "Report" button on the brand page.

Sections:
1. [ ] **Scorecard:** the Phase 3 component, plus an overall grade
2. [ ] **Where they're heading:**
   - Ads started in the last 30 days
   - Search interest
   - Podcast reads per month, when loaded live for a signed-in visitor

   Each marked rising, steady or falling
3. [ ] **What's working:** the longest-running Google and Meta ads with thumbnails, and the top creator posts
4. [ ] **What isn't:** ads stopped within two weeks
5. [ ] **Hook patterns**
6. [ ] **Complaints vs ads:** "ignored" and "contradicted" themes, as ads to run
7. [ ] **30-day action plan:** a new analysis (`plan:v1`) that turns the "steal this" list and the ignored complaints into 3–5 ad briefs (hook, format, channel, why)
8. [ ] **Sources:** the Alexandria providers behind each section, with the attribution they require

Print:
- [ ] A4/Letter, page breaks between sections, light theme forced, a "Save as PDF" button (`window.print()`)
- [ ] Load images eagerly in the report: `loading="lazy"` (e.g. `PodcastsTab.tsx` 97) can print as blanks

### 5b. Share images and server-side meta tags
- [ ] Run the Worker in front of `/` and `/report` (`run_worker_first` in `wrangler.jsonc` today covers only `/api/*`, `/mcp` and `/llms.txt`). Rewrite `og:title`, `og:description` and `og:image` with HTMLRewriter over `env.ASSETS`
- [ ] `/og/report.png?d=…` rendered with satori and resvg-wasm, with bundled fonts and cached in KV or the edge cache. Check the CPU limits on the Workers plan first
- [ ] Use the `branding` provider (from Phase 6, pulled forward) for a sharp logo and the brand's colours. Logos come from Google's favicon service today, which is too low-res
- [ ] With no cached summary yet, fall back to `/og.png`

### 5c. My brand vs competitors (opt-in)
- [ ] Enter your brand and up to 3 rivals, get a gap report: where they spend and you don't, and hooks they run that you don't
- [ ] Signed in, default to the dashboard's "your brand" and tracked competitors (Phase 4c)
- [ ] It's 3 extra cold searches plus model calls, so show the credit estimate first. The 3 competitors from `Summary.competitors` are guessed by the model, so let the visitor confirm or edit them

### 5d. MCP
- [ ] A `get_report` tool that returns the channel data plus whatever analyses are already cached, and says which are missing. MCP never calls the model

### History
- [ ] "Channels they dropped" and "changed since last time", for tracked brands only: they need Phase 4's snapshots

**Done when:** a featured brand's report prints cleanly to PDF, and a shared link shows that brand's scorecard as its preview.

---

## Phase 6: More channels from Alexandria

All of these are in the catalogue and unused. Before choosing each one's cache policy, read its terms on the Third-Party Data Terms page (firecrawl.dev/terms/third-party-data). Each new channel adds cold-search time and credits, so re-measure against Phase 2's targets, or load them only on their own tab.

- [ ] **LinkedIn ads:** `adyntel` `linkedin/company-ads` (9 credits per page with ads)
- [ ] **TikTok ads:** `adyntel` `tiktok-ads/*`
- [ ] **Bing ads:**
  - `microsoft-ad-library` `ads/search` + `ads/get`: EU ads, with impressions
  - `searchapi` `bing/ads`: live US results
- [ ] **X promoted posts:** `anysite` `x-ads/search` (EU only, with impressions and reach)
- [ ] **Paid vs organic keywords:** `adyntel` `google/keywords` (budget and CPC), shown on the Google tab
- [ ] **Similar creators:** `influencers-club`. It has its own terms
- [ ] **Per new channel:**
  - Code: a type in `shared/types.ts`, a fetcher in `worker/sources.ts`, a digest in `worker/llm.ts`, a tab or overview section
  - Interfaces: the MCP `platform` enum and the docs in `shared/docs.ts`
  - Its entry in `CACHE_POLICY` (`shared/channels.ts`) and a row in the cache-policy table in Phase 1

---

## Phase 7: Boards and saved reports

Builds on Phase 4's accounts.

- [ ] **Boards / swipe file:** save ads from any channel into named boards, share a board by link. Saved ads' thumbnails go in R2, like Phase 4's snapshots
- [ ] **Add ads Ad Finder can't find:** a pasted link or an uploaded screenshot, into a board
- [ ] **Saved reports:** a saved report regenerates when opened, with a "changed since last time" section from Phase 4's snapshots (the item deferred from Phase 5)

---

## Phase 8: Extras

- [ ] **"How this was built" panel** on each section: the Alexandria provider and capability, the credits used (from Phase 0's analytics), and a copyable `alexandria_library_read` / SDK snippet
- [ ] **Landing pages:** scrape each ad's destination URL with Firecrawl (screenshot and offer), and track when the offer changes
- [ ] **AI tags for each ad:** hook, angle, persona, format and call to action, with filters on the Meta and Google tabs
- [ ] **Transcripts** for every video ad. Upspring `ads/detail` with `include: transcript` already does this for one ad
- [ ] **Brief generator:** "make an ad like this for my brand" from any saved ad
- [ ] **Category leaderboards**, e.g. "Top Meta advertisers in meal kits":
  - Built only from shared-cache channels; podcasts and traffic are out
  - Search engines need real HTML, so prerender the pages in the Worker and add a sitemap
  - Large enough to be its own sub-phase
- [ ] **Chrome extension (later):** save an ad from Meta's Ad Library into a board
