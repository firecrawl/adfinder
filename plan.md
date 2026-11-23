# Ad Finder plan

The goal is to make Ad Finder the showcase for Firecrawl Alexandria: every ad behind any business, plus a report on where the brand is heading and what to fix. Work through the phases in order. Each phase ships on its own.

Status key: `[ ]` todo, `[~]` in progress, `[x]` done.

## How each phase is checked and rolled back
- End-to-end in Agent Browser at 390px and 1440px (CLAUDE.md: few tests, mostly end-to-end). Unit tests only for logic a browser can't reach, such as cache-policy selection
- Cache changes are checked on the KV store itself: `wrangler kv key list --binding CACHE --prefix <prefix>`
- Before/after numbers come from the analytics in Phase 0
- Roll back a bad deploy with `wrangler rollback`. D1 migrations (Phase 6) don't roll back, so make them additive only

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
  - Query it with the Analytics Engine SQL API, e.g. `SELECT blob2 AS channel, avg(double1) AS ms, sum(double2) AS credits FROM adfinder_events WHERE blob3 = 'miss' GROUP BY channel`
- [x] **Terms and Privacy page** at `/terms` (`src/pages/TermsPage.tsx`), linked from the footer and the sign-in dialog. It binds visitors to the provider terms (Similarweb's in particular) and says what's stored. Update it in Phase 6 when emails are stored
- [ ] **Ask Firecrawl** (it decides Phase 1's design):
  1. Can data fetched with visitor A's key be shown to visitor B, through the site and through `/mcp`?
  2. Can analyses built from Particle or Similarweb data (summary, compare) be cached and shared?

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
- Confirm events arrive in Analytics Engine: run the query above in the Cloudflare dashboard, or with an API token that has Account Analytics read
- Get Firecrawl's answers to the two questions above

---

## Phase 1: Cache within provider terms [~]

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

To do after deploying:
- Delete the old podcast and traffic keys. The featured brands' `ch:v2:podcasts:*` and `ch:v2:traffic:*` were written with no expiry, so they'd stay in KV forever: `wrangler kv key list --binding CACHE --prefix ch:v2:podcasts` (and `ch:v2:traffic`, `ch:v1:`), then `wrangler kv bulk delete`
- The new key versions start empty, so featured brands need signing in until the next cron run (up to 3 days). Deploy the evening before a cron day (the 1st, 4th, 7th… at 06:00 UTC), or add a way to trigger the seed by hand

**Done when:** `wrangler kv key list` shows no traffic or podcast keys, no shared entry is older than 3 days (4 for featured brands), and podcasts still load for a signed-in visitor.

---

## Phase 2: Speed up the first search

A cached brand loads in about 0.1–0.4s per channel. A brand nobody has searched yet is slow. Measure a cold search before and after with Phase 0's analytics, and write the numbers here.

- [ ] **Start the analyses without waiting for every channel.** Two changes:
  - Client: `useBrand` (`src/api.ts`) waits for every shared channel before asking for analyses (Phase 1 stopped it waiting on podcasts and traffic); ask straight away
  - Server: give `everything()` a deadline (about 25s) and analyse what has arrived
  - Cache partial analyses for a short time only, or key them by the set of channels they used, so a partial summary isn't kept for 3 days
- [ ] **Meta Ad Library fallback:** try 2 scrolls instead of 4 (`worker/alexandria.ts` `html`), and cap retries. 4 retries × 90s can take about 6 minutes
- [ ] **Calls that run one after another:** Meta (search → brief → browse) and podcasts (sponsors → shows, segments, timeseries). Run in parallel what doesn't need an earlier result
- [ ] **Pre-warm popular brands:**
  - Count searches in Analytics Engine, not a KV read-modify-write, which races
  - Refresh the top 50 through Cloudflare Queues, one brand per message, shared-cache channels only. A single cron run can't fit 50 brands
- [ ] **Loading checklist:** "Meta ✓ · Google ✓ · Podcasts…", naming the Alexandria provider for each
- [ ] **Credit estimate before a cold search:** "about N credits, from your Firecrawl account"
- [ ] Dropped: starting channels in parallel with `/api/resolve`. Cache keys use `domain || name`, so a name-only run and the later domain run would pay twice, and podcasts and UGC match on the domain. Resolve also only runs for free-typed names

**Done when:** a new brand shows its first channel in under 5s and the summary in under 30s.

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

## Phase 4: The report

A page built to share, print and save as PDF, saying where the brand is heading and what to improve. Built from analyses that already exist: `summarize`, `hookPatterns` and `complaintsVsAds`.

### 4a. Report page and print
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

### 4b. Share images and server-side meta tags
- [ ] Run the Worker in front of `/` and `/report` (`run_worker_first` in `wrangler.jsonc` today covers only `/api/*`, `/mcp` and `/llms.txt`). Rewrite `og:title`, `og:description` and `og:image` with HTMLRewriter over `env.ASSETS`
- [ ] `/og/report.png?d=…` rendered with satori and resvg-wasm, with bundled fonts and cached in KV or the edge cache. Check the CPU limits on the Workers plan first
- [ ] Use the `branding` provider (from Phase 5, pulled forward) for a sharp logo and the brand's colours. Logos come from Google's favicon service today, which is too low-res
- [ ] With no cached summary yet, fall back to `/og.png`

### 4c. My brand vs competitors (opt-in)
- [ ] Enter your brand and up to 3 rivals, get a gap report: where they spend and you don't, and hooks they run that you don't
- [ ] It's 3 extra cold searches plus model calls, so show the credit estimate first. The 3 competitors from `Summary.competitors` are guessed by the model, so let the visitor confirm or edit them

### 4d. MCP
- [ ] A `get_report` tool that returns the channel data plus whatever analyses are already cached, and says which are missing. MCP never calls the model

### Deferred to after Phase 6
"Channels they dropped" and "changed since last time" need history, which only exists once snapshots are stored.

**Done when:** a featured brand's report prints cleanly to PDF, and a shared link shows that brand's scorecard as its preview.

---

## Phase 5: More channels from Alexandria

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
  - The cache-policy table in Phase 1

---

## Phase 6: Accounts, following and alerts

- [ ] **Sign-in:** keep Firecrawl sign-in for searching (each sign-in is a Firecrawl signup, and visitors pay for their own searches). Add Google sign-in for these saved features only
- [ ] **Decide who pays for alert runs.** Visitors' keys live only in their cookie today. Either store their keys encrypted with explicit consent, or run alerts on a house key with a cap on followed brands
- [ ] **User store (D1), additive migrations only:** users, followed brands, saved ads, saved reports
- [ ] **Follow a brand:** a weekly email of new ads, ads stopped and new creator posts. The cron compares with the last stored snapshot of shared-cache channels only; Particle's terms rule out keeping podcast snapshots. Competitors charge $149+/month for this
- [ ] **Email:** pick a provider (Resend or Postmark). Every email needs an unsubscribe link
- [ ] **Privacy:** delete-my-account removes the user, their follows and their stored key. Update the Privacy page from Phase 0
- [ ] **Boards / swipe file:** save ads from any channel into named boards, share a board by link. Meta media links expire after about 4 days, so store thumbnails (R2) for saved ads
- [ ] **Saved reports:** a saved report regenerates when opened, with a "changed since last time" section (the item deferred from Phase 4)

---

## Phase 7: Showcase extras

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
