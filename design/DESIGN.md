# Ad Finder design directions (Phase 4a)

Open `design/compare.html` to compare the three directions side by side: landing page or dashboard, light or dark, 1440px or 390px. The live mockups are in `design/mockups/` (open `index.html?dir=a&page=landing&theme=light`; `dir` is a, b or c, `page` is landing or dashboard).

## Brief

- **Audience:** performance marketers, founders and agency strategists checking what a competitor (or their own brand) runs, and whether it works
- **Primary action:** search a brand. Signed in, the next action is to track it
- **Pages mocked:** the signed-out landing page (hero, a live product shot, the data-source strip, one feature row, "Top ads this week") and the signed-in dashboard (digest line, a card per tracked brand with your own pinned first, a dated feed of changes)
- **Constraint:** Ad Finder is built on Firecrawl Alexandria and says "Powered by Firecrawl", so Firecrawl's orange stays the one accent in every direction

## How the directions were made

All three share one structure (`app.js`, `base.css`) and the same real data: the five featured brands' cached Meta ads, Google totals, creator posts, trends, summaries and hook patterns from the live site on 24 Nov 2026. Only the tokens and finish differ (`a.css`, `b.css`, `c.css`), so the comparison is of design, not content. The dashboard's change figures and feed are illustrative; they need Phase 4's snapshots.

## References

From `docs/design-research.md`:

| Reference | Section | Observed | Used in |
|-|-|-|-|
| firecrawl.dev | Brand (scraped with Firecrawl's branding format) | `#FF4C00` primary, `#F9F9F9` background, `#262626` ink, Suisse with Geist Mono, 10px buttons with an inset orange glow, a grid motif | A's whole palette and button; the orange in B and C |
| tryatria.com | Hero | The tool itself in the hero, with example chips under it | All: the search box is the hero's one action, with the free featured brands as chips |
| motionapp.com | Product shot | KPI row and ad cards with metrics, directly under the hero | All: the AG1 scorecard and ad strip under the hero |
| foreplay.co, foreplay.co/spyder | Hero, tracking timeline | Near-black with a dot grid; ads grouped by launch date with days running | B's dot grid and dark default; the days-running label on every thumbnail |
| motionapp.com/trending | Whole page | Free "Top ads this week" grid | All: the Top ads section |
| panoramata.co | Overview dashboard | KPIs with the change from last period, a feed of changes | All dashboards: deltas on every KPI, the "What changed" feed |
| Crayon, Klue, Visualping | Positioning | An AI line on what changed and why it matters | The digest line under "Your brands" |

## Type

Six pairings rendered side by side (`design/pairings.png`, from `mockups/pairings.html`) with the real headline, body and a big number:

1. **Geist / Geist, Geist Mono for labels:** the closest open face to Firecrawl's Suisse. Chosen for **A**. Geist Mono set "1 , 821" with awkward comma spacing, so big numbers stay in Geist and the mono is for labels and dates only
2. **Inter Tight / Inter:** dense and neutral, reads as a tool. Chosen for **B**
3. **Instrument Serif / Geist:** reads like a market report; the serif numerals give KPIs weight. Chosen for **C**
4. Bricolage Grotesque / Inter: rejected, its quirks read consumer and playful, not analytical
5. Space Grotesk / IBM Plex Sans: rejected, dated (it was everywhere in 2020–22 startup sites) and its "1" is distracting in numbers
6. Fraunces / Public Sans: rejected, the soft serif suits food and lifestyle brands, not data

Body copy is 18px on the landing page and 21px for the lede. The dashboard's data labels are 13–16px: a deliberate exception to the 18px default, because the dashboard is scanned, not read, and 18px labels would push each brand card past one screen.

## The three directions

### A · Firecrawl family
- **Palette (light):** background `#F9F9F9` about 70%, white surfaces about 20%, ink `#262626`, accent `#FF4C00` under 5% (primary button, scores, live badges, the wordmark's dot). Dark: `#0D0D0D`, surfaces `#151515`, the same orange
- **Type:** Geist 600 headlines at 76px (46px on phones), tracked tight; Geist body; Geist Mono for labels
- **Finish:** a 64px hairline grid behind the hero, 10px buttons with Firecrawl's inset glow, 14px cards, soft shadows
- **Why:** it looks like part of Firecrawl, which is true, and lends Firecrawl's credibility to a product that runs on Firecrawl accounts. The calmest and most readable of the three

### B · Signal
- **Palette:** dark-first, background `#09090B` with a 22px dot grid; surfaces `#121216` at 88% opacity over the dots; accent `#FF5A1F` for actions; **green `#22C55E` only for live ads**. Light: `#FBFBFC` with faint dots
- **Type:** Inter Tight 700 headlines at 80px, tracked very tight; Inter body
- **Finish:** pill buttons and search, an orange glow under the primary button, 18px cards, a left-aligned hero
- **Why:** the category's own convention (Foreplay, Atria); feels like a pro tool. Risk: closest to the competitors, so the least distinctive

### C · Report
- **Palette:** white paper `#FFFFFF`, ink `#171717` for text and 1.5px rules, accent `#FF4C00` as the highlighter (buttons, score bars, the rule beside the hook patterns). Live badges are ink, not colour. Dark: `#121211` paper, `#EFEFED` ink
- **Type:** Instrument Serif headlines at 96px (54px on phones) and for big numbers; Geist body; quotes from ads in the serif
- **Finish:** square 2–4px corners, ruled sections instead of cards with shadows, KPIs over a top rule like a newspaper table
- **Why:** nothing else in the category looks like this. It matches what Ad Finder produces (a written read on a brand) and sets up Phase 5's printable report. Risk: the serif is less "tool-like" on the dashboard

## Recommendation

**A for the product, with C's report styling kept in reserve for Phase 5's printable report.** A is the clearest at both widths, reads as Firecrawl's (the honest framing for a showcase that also became a product), and is the cheapest to carry to the existing pages: it keeps today's light-first, orange-accent structure while replacing the Google greys, the type and the flat background. B is the safe category look but makes Ad Finder look like Foreplay. C is the most memorable, and if the report becomes the product's centre, C is the one to choose.

## Checked

- All 24 combinations (3 directions × 2 pages × 2 themes × 2 widths) render with no sideways scroll at 390px
- Text contrast follows Phase 3's tokens: faint text at 4.5:1 or above; accent text uses a darker orange in light mode. White on `#FF4C00` buttons is 3.2:1, so button labels are 19px bold (WCAG's large-text threshold)

## Not yet done

- Motion: none mocked. Plan: reveal the hero's product shot and the feed items as they arrive; nothing on the ad images
- Interaction states (hover, focus, open menus) and the brand page, compare page and docs in the chosen direction
- Real Firecrawl font: Suisse is a licensed font, so Geist stands in. Ask Firecrawl whether Ad Finder may use Suisse
