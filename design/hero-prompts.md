# Hero photo prompts

Generated on 24 Nov 2026 with Higgsfield, model `nano_banana_pro`, 16:9, 2k (2 credits each). The full-size PNGs are on Higgsfield's CDN under the job ids below; `design/mockups/hero/` holds 1600px JPEGs.

Shared style, appended to each prompt:

> Photorealistic editorial photograph, shot on a 35mm lens, shallow depth of field. Dark, modern room at night lit mostly by the screen, near-black background with a warm orange (#FF5A1F) rim light from one side and a soft cool fill. The monitor shows an abstract dark-mode dashboard: a grid of colourful social media ad thumbnails (product shots, people holding drinks and supplements, food boxes), thin horizontal timeline bars, small green 'live' dots. No readable text, no logos, no brand names anywhere. Natural skin, real proportions, no AI gloss. Wide 16:9 composition with empty dark space on the left for a headline.

| File | Prompt | Job |
|-|-|-|
| `work-focused` | A focused marketing strategist in their early 30s leaning toward a large monitor, chin resting on one hand, scrolling through a wall of competitor ads, notebook and coffee beside the keyboard, seen from a three-quarter angle behind the shoulder. | e2f7fd07-ef75-4110-9a6d-02bfe8b7d4d8 |
| `work-overshoulder` | Over-the-shoulder shot of a person at a desk with two monitors, one hand on a mouse, the screens filled with a grid of ad thumbnails and a timeline of when each ad started; the person is out of focus in the foreground, the screens are sharp. | 87a9c50e-cfeb-40ef-9bb4-107fc2a21799 |
| `happy-leanback` | A cheerful founder in their late 20s leaning back in a desk chair, smiling at a monitor showing a grid of ad thumbnails and an upward trend line, laptop open, relaxed and pleased, as if they just found exactly what their competitor is doing. | 197a4174-4a39-4fb6-bed1-1a88d61a7370 |
| `happy-pair` | Two colleagues at a desk, one pointing at an ad thumbnail on a large monitor and laughing, the other smiling with arms crossed, a small agency studio at night, plants and a whiteboard softly out of focus. | 01661597-6377-436f-92e4-97d010d8618a |

These are generated people, not customers or real users, so the page must not present them as testimonials.

## Round 2: the Ad Finder dashboard on screen

Model `nano_banana_2_1`, 5:4, 2k, thinking `high` (1.5 credits each), with one image reference: a 1440×900 screenshot of the direction-B dashboard mockup (dark). Style appended to each prompt:

> The computer screen shows the attached screenshot exactly: the Ad Finder dashboard titled 'Your brands' with brand cards, ad thumbnails and a 'What changed' list on the right. Reproduce that screen faithfully and keep it legible, as a real screen photographed at an angle with a slight glare. Candid documentary photo taken on a full-frame camera with a 35mm lens at f/2, natural light falloff, a little sensor grain, real skin texture with pores and slight asymmetry, ordinary clothes, a lived-in desk with cables and a mug. Evening, the room lit by a warm desk lamp and the screen's glow, with a hint of orange (#FF5A1F) light. Not cinematic, not stock-photo, no perfect symmetry, no extra text or logos anywhere except what is on the screen.

| File | Prompt | Job | Screen |
|-|-|-|-|
| `r2-closeup` | Over-the-shoulder view of someone working at a large monitor, their shoulder and the back of their head soft in the foreground, hands on the keyboard, the monitor filling most of the frame and sharp. | 2dfabbb4-08b9-4584-a7da-d9ecfc024ad4 | Nearly all text correct; small slips ("affers"); an LG logo on the bezel |
| `r2-happy` | A founder in his late 20s at his desk, turned toward a large monitor, smiling and laughing at what he sees on it, one hand raised mid-gesture, seen from the side and slightly behind so the screen is clearly visible. | ebb30883-8e75-4c34-8f04-025e0a5c615d | Layout right, small text garbled |
| `r2-pair` | Two colleagues at one desk looking at a large monitor together, one pointing at a brand card on the screen and grinning, the other leaning in with a coffee, a small agency office, seen from behind and to the side so the screen is clearly visible. | 3168d747-0b4f-41ad-9d00-82f6f6e73cd8 | Layout right, small text garbled |
| `r2-focused` | A marketing strategist in her early 30s sitting at a desk, leaning in toward a large monitor and reading it closely, one hand on the mouse, seen from slightly behind and to the side so both her face in profile and the whole screen are visible. | d13e0c9d-6a56-495b-8ca6-5c2aa5a46f2f | Most garbled; an Apple logo on the monitor |

The screen shows real brands' ads and logos (AG1, Factor, HelloFresh), as the live product does. Before this goes on the public homepage, either composite the real screenshot onto the chosen photo's screen (crisp text, no model slips) or regenerate the screen from a dashboard with neutral demo brands, so no brand appears to endorse Ad Finder.

## Chosen: `r2-pair`, with the real screen composited (`design/mockups/hero/r2-pair-final.jpg`)

Two Nano Banana 2.1 edits that swapped the screen for the reference still garbled the small text ("Vow brand · coexted", "Meta ols"), so the screen was composited by hand with `design/hero-composite.py`:

1. Warp `design/hero-screen.png` (the 1440×900 dashboard) onto the monitor. The corners were read off a 1200px preview by matching the logo, "Track a brand", the avatar and "Your brands" between the photo and the screenshot (about 0.4 scale, nearly square-on)
2. Make it look photographed: a 0.7px blur, 92% contrast, 90% brightness, a slightly warmer cast and a faint diagonal glare
3. Put the people back on top using Higgsfield's `image_background_remover` cutout of the original (job 1c1486ae-8f48-4e08-acc1-e7504b47b28b). Over the right part of the screen, neutral or bluish pixels are dropped (scraps of the old screen and its glow), small islands are removed, and the edge is trimmed 2px to lose the blue halo

Re-run: `uv run --with pillow --with numpy --with scipy python -I design/hero-composite.py <dir with pair.png, cutout.png, dashboard-ref.png>`. To swap the screen (for example to a dashboard of neutral demo brands), replace the screenshot and run it again.

**Before launch:** the screen still shows real brands (AG1, Factor, HelloFresh, Liquid Death, Hungryroot) and their ads. Decide whether that's acceptable on a marketing image, or re-run with a demo-brand screen.
