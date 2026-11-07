# DESIGN.md - Lufthansa PTFS Brand and Interface Standard

This file is the single source of truth for the visual and verbal identity of the Lufthansa PTFS website and Discord bot. When any other instruction conflicts with this file on look, tone, color, or typography, this file wins. When this file conflicts with the "no emojis" rule or the "unofficial project" rule, those rules win.

Lufthansa PTFS is an unofficial Roblox virtual airline community. It is not affiliated with, endorsed by, or operated by Deutsche Lufthansa AG or any of its programmes. The design borrows the general feel of a European full-service carrier: calm, precise, and confident. It does not copy the real airline's logo, imagery, wording, or page layouts.

---

## 1. Brand essence

- Name: Lufthansa PTFS (community), Lufthansa (passenger-facing flight copy only).
- Flight number prefix: LH. Display format: `LH 123` with a space.
- Personality: precise, composed, reliable, quietly premium. Think timetable and cockpit checklist, not billboard.
- Compared with the old VietJet build: slower, calmer, more restrained. Less exclamation, less hype, more structure.
- One idea per screen. Navy carries the page. Yellow is used sparingly to point at the one thing that matters.

## 2. Voice and copy rules

- English only. Do not add machine-translated German. A German word is allowed only if the owner supplies it.
- Short, declarative sentences. Active voice. Say what happened, then what to do next.
- Address the member as "you". Address the community as "we".
- No exclamation marks except in a literal welcome line, and then one at most.
- No emojis anywhere: UI, bot messages, docs, comments, test data, logs, commit messages.
- No marketing superlatives ("best", "world-class", "amazing"). No slogans taken from the real airline.
- Never write "official". Where the airline is named in passenger copy, use: "Thank you for choosing Lufthansa for this flight."
- Numbers: use the existing locale helper. Thousands separator and 24-hour time. Prefer Discord timestamp tags (`<t:...>`) in the bot so every member sees local time.
- Error copy: say what failed and what the member can do. Never show stack traces, IDs, or internal names.

Examples of the target tone (placeholders only, never real balances):

- Flight completed: "Flight LH 204 is complete. You earned {points} Miles and {credits} LH Credits."
- Tier progress: "You are {percent} percent of the way to {nextTier}. {remaining} more qualifying Miles to go."
- Redemption: "Request received. Your balance has been updated. Staff will confirm delivery."

## 3. Naming

| Concept | Display name | Notes |
|---|---|---|
| Community | Lufthansa PTFS | Page titles, bot name, footer |
| Airline in flight copy | Lufthansa | Passenger-facing only |
| Flight prefix | LH | Configurable in the brand config |
| Loyalty programme | LH Rewards | Do not use "Miles & More" or "HON Circle" |
| Loyalty currency (display label) | Miles | Label only. The backend currency stays "points" |
| Spendable economy currency | LH Credits | Separate balance, separate ledger |
| Tiers (starter, configurable) | Traveller, Navigator, Captain | Do not use real-airline tier names |
| Ad tiers | Basic, Featured, Premium, Spotlight | Prices unchanged from the existing config |

All names above live in one brand config module. UI and bot copy read from it.

## 4. Color

Source colors are from the real airline's public brand palette: deep navy `#05164D`, white, and amber-yellow `#FFAD00`. Everything else below is derived for UI use and is not an official palette.

### 4.1 Tokens

```css
:root {
  /* Brand */
  --lh-navy-900: #030D2E;   /* derived: footers, deepest bands */
  --lh-navy-700: #05164D;   /* brand: primary surface, headings on light */
  --lh-navy-500: #1B2F73;   /* derived: hover on navy, secondary buttons on navy */
  --lh-yellow-500: #FFAD00; /* brand: accent, primary CTA fill, focus ring on navy */
  --lh-yellow-600: #E09700; /* derived: CTA hover */
  --lh-sky-500: #5B8DEF;    /* derived: info, links on navy, chart secondary */

  /* Neutrals (derived) */
  --lh-white: #FFFFFF;
  --lh-grey-50: #F4F6FA;    /* page background */
  --lh-grey-100: #E8ECF4;   /* panels, table stripes */
  --lh-grey-200: #D5DBE8;   /* borders, dividers */
  --lh-grey-500: #5A6482;   /* muted text on white */
  --lh-grey-700: #2B3350;   /* body text on white */

  /* Status (derived) */
  --lh-success: #1B7F4B;
  --lh-warning: #FFAD00;
  --lh-danger: #B3261E;
  --lh-info: #1F5FBF;
}
```

### 4.2 Usage rules

- Default page: `--lh-grey-50` background, `--lh-grey-700` body text, `--lh-navy-700` headings.
- Hero, header, footer, and dashboard summary bands: `--lh-navy-700` or `--lh-navy-900` with white text.
- Primary CTA: yellow fill, navy text. One primary CTA per viewport section.
- Secondary CTA: navy outline on light, white outline on navy.
- Yellow is never used as text on white or light grey. Contrast is about 1.9 to 1 and fails WCAG. Yellow text is allowed only on navy.
- Do not use gradients as decoration. A single flat navy-to-darker-navy overlay on photography for text legibility is allowed.
- Do not use more than one accent color per component.
- Status is never conveyed by color alone. Pair with a text label.

### 4.3 Contrast checks required before sign-off

| Pair | Minimum | Expected |
|---|---|---|
| White text on `--lh-navy-700` | 4.5 to 1 | well above |
| Navy text on `--lh-yellow-500` | 4.5 to 1 | about 9 to 1 |
| `--lh-grey-500` on white | 4.5 to 1 | about 5.7 to 1 |
| Yellow text on navy | 4.5 to 1 | well above |

The implementer must verify these with a script or tool and report actual numbers. Do not copy the "expected" column into the report.

### 4.4 Discord Components V2 accent mapping

Discord renders the accent stripe on a dark background. Navy is nearly invisible there, so the default stripe is yellow, not navy.

| Use | Hex | Integer |
|---|---|---|
| Default (tickets, flights, rewards, ads) | `#FFAD00` | 16755968 |
| Careers and informational | `#5B8DEF` | 6000111 |
| Success (accepted, completed) | `#1B7F4B` | 1802059 |
| Danger (denied, cancelled, error) | `#B3261E` | 11740702 |
| Brand navy, only where a light background is guaranteed | `#05164D` | 333389 |

Define these once as named constants in the brand config. No raw integers in message builders.

## 5. Typography

The real airline uses proprietary typefaces (Lufthansa Head and Lufthansa Text). Do not attempt to obtain or imitate them. Use open fonts with a similar plain, humanist, engineered feel.

- Headings: Barlow, weights 600 and 700.
- Body and UI: Source Sans 3, weights 400, 500, 600.
- Numerals in tables, balances, and flight numbers: enable tabular figures (`font-variant-numeric: tabular-nums`).
- Self-host via `@fontsource` packages. Do not load fonts from a third-party CDN at runtime.
- Fallback stack: `system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`.

Scale (rem, base 16px):

| Role | Size | Line height | Weight |
|---|---|---|---|
| Display (hero only) | 3.25 | 1.05 | 700 |
| H1 | 2.5 | 1.1 | 700 |
| H2 | 1.875 | 1.2 | 600 |
| H3 | 1.375 | 1.3 | 600 |
| Body | 1.0 | 1.6 | 400 |
| Small and captions | 0.875 | 1.5 | 400 |
| Overline labels | 0.75 | 1.3 | 600, uppercase, 0.08em tracking |

Mobile: Display 2.25, H1 1.875. Minimum body size 16px. No text below 12px.

## 6. Layout, spacing, shape

- 8px spacing grid. Allowed steps: 4, 8, 12, 16, 24, 32, 48, 64, 96.
- Max content width 1200px. Reading width for long text 68ch.
- Corner radius: 4px for inputs and buttons, 8px for cards and panels. No pill-shaped buttons. No radius above 12px anywhere.
- Shadows: one subtle elevation only (`0 1px 2px rgba(3,13,46,0.08)`). No glow, no glass blur.
- Borders over shadows. Use 1px `--lh-grey-200` borders to separate content.
- Grid: 12 columns desktop, 8 tablet, 4 mobile. Cards align to the grid, not floated at random widths.
- Tables convert to stacked rows below 640px. No horizontal page scroll at any width from 320px up.

## 7. Components

### Header
Navy bar. Text wordmark "LUFTHANSA PTFS" in Barlow 700, uppercase, white, with a thin yellow underline rule under the brand block. If the owner supplies a logo file under `assets/brand/`, use that instead. Do not recreate the crane mark in SVG or CSS. Nav items white, 16px, yellow underline on active. Sign in button is yellow fill. Signed-in state replaces it with an account menu showing the Discord display name and a Sign out action.

### Hero
Navy surface, optional full-bleed photograph with a flat navy overlay at 60 to 75 percent. Left-aligned headline, one-sentence subline, one primary CTA, one secondary CTA. No carousel. No auto-playing video.

### Flight card
White card, 1px border. Top row: flight number (`LH 123`, tabular figures) and status chip. Middle row: departure, arrival, and aircraft in a clear two-column route layout with a thin horizontal rule between airports. Bottom row: scheduled time and the Book action. Status chips use text plus color: Scheduled (grey), Check-in (yellow on navy), Delayed (warning text on light), Completed (success), Cancelled (danger).

### Buttons
- Primary: yellow fill, navy text, 4px radius, 44px minimum height, 600 weight.
- Secondary: transparent, 1px navy border, navy text. On navy: white border and text.
- Disabled: grey-200 fill, grey-500 text, no hover. Explain why it is disabled nearby.
- Focus ring: 3px `--lh-yellow-500` on navy surfaces, 3px `--lh-navy-700` on light surfaces, 2px offset. Never remove outlines without a replacement.

### Dashboard
- Top band (navy): primary balance labelled "Miles" with the configurable label, tier name, and a flat progress bar to the next tier (yellow fill on navy track).
- Second row: LH Credits balance as a separate card with a visibly different heading. Never visually merge it with Miles.
- Then: missions, recent flights, transaction history.
- Maximum four summary cards visible without scrolling on desktop and two on mobile.
- Tables: zebra with `--lh-grey-100`, sticky header on desktop, stacked rows on mobile.

### Forms
Visible labels above fields. Helper text below. Error text in `--lh-danger` with an icon-free text prefix such as "Error:". Required fields marked with the word "Required", not an asterisk alone.

### Empty, loading, error states
- Empty: one sentence of explanation plus one action. No illustrations of fake data.
- Loading: skeleton blocks in `--lh-grey-100`. Never show placeholder numbers.
- Error: plain sentence, retry action, no technical detail.

### Footer
Navy-900 background. Columns: Flights, Careers, Affiliates, Rewards, Support and Policies. Then the disclaimer, always visible:

"Lufthansa PTFS is an unofficial Roblox virtual airline community. It is not affiliated with, endorsed by, or operated by Deutsche Lufthansa AG or any real-world loyalty programme. All in-game balances are fictional and hold no cash value."

## 8. Imagery

- Do not scrape, hotlink, or copy photographs, logos, or illustrations from lufthansa.com or any airline site.
- Use only images the owner supplies, images already in the repo that are not VietJet livery, or original in-game Roblox screenshots the owner provides.
- Remove every asset that shows VietJet branding, livery, or Vietnamese landmarks.
- Where no image exists, use a flat navy surface with a subtle route-line pattern drawn in CSS or SVG (thin lines, 8 percent opacity). Do not use stock-photo placeholders.
- All images need meaningful `alt` text or `alt=""` if decorative. Serve modern formats with explicit width and height.
- Favicon: owner-supplied. Fallback: a navy square with the letters "LH" in yellow, Barlow 700.
- Open Graph image: navy background, wordmark, tagline "Roblox virtual airline community". Include the unofficial notice in small text.

## 9. Motion

- Durations 150 to 250ms, ease-out. Opacity and small translate only.
- No parallax, no scroll-jacking, no looping animation, no auto-advancing carousels.
- Respect `prefers-reduced-motion: reduce` by disabling all non-essential transitions.

## 10. Accessibility floor

- WCAG 2.2 AA minimum.
- Semantic landmarks, one H1 per page, logical heading order.
- Every interactive element reachable by keyboard with a visible focus state.
- Touch targets at least 44 by 44px.
- Do not rely on color alone for status, tier, or error.
- Document titles follow: `{Page} | Lufthansa PTFS`.

## 11. Bot message structure

- Components V2 only. No classic embeds.
- Message shape: one container, accent stripe from section 4.4, a level-2 heading, a short quoted body, a divider, then actions.
- Headings are plain text: `## Helpdesk`, `## Flight LH 204`, `## Application Recorded`. No emoji prefixes.
- Keep every message readable on a phone without scrolling horizontally. Prefer short lines.
- Banner images are optional and owner-supplied. If a banner URL is unset, omit the media block entirely.

## 12. Anti-patterns (reject on review)

- Any emoji.
- Any VietJet name, color, asset, route, currency, locale, or timezone remaining.
- Copying the real airline's crane logo, slogans, page layouts, or photography.
- Yellow text on a light background.
- Pill buttons, glassmorphism, neon glows, large soft shadows, decorative gradients.
- More than one primary CTA in a view.
- Fake balances, fake flights, or placeholder numbers shown as real data.
- Merging Miles and LH Credits visually or in code.
- Claiming or implying official status.
