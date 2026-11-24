# Design research: homepage and dashboard

Done on 24 Nov 2026 for Phase 4. Screenshots at 1440px of each site's homepage, the first two screens of scroll, Motion's public "Trending" page and Foreplay's Spyder page, plus published comparisons of ad-intelligence and competitor-monitoring tools.

## Where Ad Finder stands

The site looks like a tidy search engine: Google-style neutral greys, a wordmark, one tagline, a search box and five chips, then cards with an orange accent. That suits one quick search. It doesn't say what you get before you search, it has no product shot or proof, and nothing about it is recognisably Ad Finder's own. Every product below commits to a distinct look.

## What the category does

| Product | What it sells | Hero | Look |
|-|-|-|-|
| Foreplay (foreplay.co) | Swipe file, competitor tracking (Spyder), briefs | Outcome headline, one CTA, customer logo wall, then a large framed product shot | Near-black with a faint dot grid, white type, white-pill CTA |
| Atria (tryatria.com) | AI ad maker plus competitor research | The tool itself in the hero: a prompt box with "Try an example" chips and a CTA. Trust badges above (Meta partner, G2 rating, SOC 2), testimonial cards below | Dark, ad thumbnails blurred behind, pink gradient accents |
| Motion (motionapp.com) | Creative analytics on your own ad accounts | Big two-line headline, two CTAs, then a dashboard shot: KPI row with deltas, ad cards with metrics and AI tags | Light grey to lavender gradient, purple CTA |
| Runneth / Motion Trending | Free public "Top ads this week" | "Trending · updated weekly" label, big headline, industry tiles, a grid of real ads | Warm off-white, tight display type, pastel icon tiles |
| Panoramata | Tracks competitors' ads, emails, SMS, sites | Headline, email capture, "See it in action" video beside an overview dashboard | Light, purple |
| Pathmatics (Sensor Tower) | Spend and share-of-voice estimates | Name and one line left, laptop mock with charts right | Corporate light, purple |

Patterns that repeat:
1. **One outcome headline, one action, then proof.** The action is a trial button for most; Atria puts the tool in the hero, which is closest to Ad Finder's search box.
2. **Real product with real data** directly under the hero, never an illustration. Motion's ad cards (thumbnail, spend, scores, AI tags) and Foreplay's launch timeline (ads grouped by date, a bar for days running) are the two strongest.
3. **Proof strip** straight after: customer logos (Foreplay, Motion), badges and ratings (Atria), quotes (Panoramata). Ad Finder has no customers to show yet; its honest equivalent is the data sources (Upspring, Google, Particle, Similarweb…) and the brands you can open for free.
4. **A free public page as a hook:** Motion's Trending page ranks real ads by industry with no sign-in. Ad Finder's featured brands are the same idea, hidden behind five chips.
5. **A committed visual identity:** dark with texture (Foreplay, Atria) or a light page with one strong brand gradient (Motion, Panoramata, Pathmatics). None uses plain greys.

## What tracking dashboards do

- **Foreplay Spyder**, per tracked brand: breadcrumb "Competitors / Dr. Squatch", "Updated 16h ago", "Data since April 23, 2024", tabs (Ad Library, Creative Tests, Landing Pages, Hooks, Timeline), a date range, then ads grouped by launch date ("Jun 21, 2024 · 2/7 ads running") with a bar for days running, green while live.
- **Panoramata overview:** KPI tiles with the change from last period ("New ads published 266, from 401"), leaderboards across tracked brands ("Most ads published: Nike 114"), a breakdown by channel, and a feed tab.
- **Motion:** a KPI row with deltas ("Your total spend this week $556,534 +25.45%"), then creative cards each with metrics and coloured AI tags.
- **Competitive-intelligence tools (Crayon, Klue, Visualping):** the selling point is an AI summary of *what changed and why it matters*, with low-noise alerts and a dated record of every change. Weekly is an accepted cadence ("weekly by design").

Patterns: freshness is always shown; changes are dated and kept; KPIs come with a delta, not just a number; one AI line says what matters; the same per-brand tabs appear inside the tracker.

## Recommendations for Phase 4

1. **A visual identity of Ad Finder's own** before building new pages. Keep the Firecrawl orange as the one accent and replace the Google greys with warm neutrals, a display face for headlines and the dot or grid texture the category uses. Design it in both themes and at 390px first.
2. **Landing page, top to bottom:**
   - Hero: an outcome headline, the search box as the one action (as Atria does with its prompt box), example brands as chips under it, and one line on what's free and what needs an account
   - Straight under it, a live product shot built from a featured brand's cached data: the scorecard, a strip of real ad thumbnails with days running, the hook patterns
   - A proof strip of the data sources, with the providers' logos where their terms allow
   - Three feature rows with real data: every ad across channels; what's working (summary, hooks, complaints vs ads); track competitors and get a weekly email (the dashboard)
   - A free "Top ads this week" section from the featured and most-viewed cached brands, like Motion's Trending page
   - For agents: the MCP server and `llms.txt`
3. **Dashboard (signed in):**
   - A header line: "Since last week: 14 new ads, 6 stopped, 2 brands changed strategy", written by the model from the snapshots
   - A card per tracked brand, your own pinned first: logo, active ads per channel with the change since the last snapshot, the newest ad thumbnails, the summary headline, and "updated 2 days ago"
   - A dated feed of changes across all tracked brands (new ads, stopped ads, new creator posts, a jump in search interest), filterable by brand and channel
   - Each brand opens into the existing brand page, with a launch timeline like Spyder's (ads grouped by start date, a bar for days running)
4. **Make two or three directions as static mockups** (landing hero plus a dashboard screen, both themes, 390px and 1440px), pick one, then build. The `site-design` skill covers this reference-led process.

## Sources

- Homepages: foreplay.co, foreplay.co/spyder, tryatria.com, motionapp.com, motionapp.com/trending (now Runneth), panoramata.co, sensortower.com/pathmatics. similarweb.com refused automated loads
- Comparisons: marxx.ai/best/best-ad-intelligence-platforms, hawky.ai/blog/best-competitor-ad-analysis-tools, exposure.com.au/blog/best-ad-creative-research-tools, alison.ai competitor comparison, roverlead.com and outsales.ai competitor-monitoring roundups, meertrack.com CI comparison, crayon.co/blog/webpage-summaries
