# CHECKLIST_REBRAND.md — Lufthansa PTFS 200-point pre-launch checklist

Fill this out row by row when configuring and verifying the rebranded build.
Rows marked **[R]** are required before launch; **[O]** rows are recommended.

> Note: this list was regenerated from the current codebase (config.js,
> command modules, message builders, website pages and API routes). It
> replaces the earlier chat-only version and is row-numbered so failures can
> be reported as "row NN failed".

## A. Infrastructure and runtime (1–10)

| Row | Item | Status |
|-----|------|--------|
| 1 | [R] Bot runs and logs in on the production host (Wispbyte) with the new `.env` | ☐ |
| 2 | [R] `npm start` boots `src/index.js`; log shows "Web server and API listening on 0.0.0.0:<port>" | ☐ |
| 3 | [R] Web process binds `0.0.0.0` and honours `PORT` / `BOOKING_API_PORT` for the platform router | ☐ |
| 4 | [R] `trust proxy` active so `x-forwarded-proto` is honoured behind the platform proxy | ☐ |
| 5 | [R] SQLite-era artifacts absent: no sqlite files/imports remain (Firestore is the only store) | ☐ |
| 6 | [R] No Netlify / Cloudflare-tunnel / PC-tunnel scripts or docs present or linked from README | ☐ |
| 7 | [O] `PM2_SETUP_GUIDE.md` reviewed: Wispbyte expects platform process management, adapt or mark N/A | ☐ |
| 8 | [O] Memory footprint measured on the public host (expected well under 512 MB) | ☐ |
| 9 | [O] Git HEAD tagged/released after final rebrand verification | ☐ |
| 10 | [O] Rollback plan: previous commit hash recorded in case of launch problems | ☐ |

## B. Environment variables (11–56)

Copy exactly what `src/config/config.js` and `.env.example` declare. Every
[C] var below must be a real Discord ID/name for the Lufthansa PTFS server,
and every name must avoid implying affiliation with the real airline.

| Row | Var | Kind | Status |
|-----|-----|------|--------|
| 11 | DISCORD_BOT_TOKEN | [R] secret | ☐ |
| 12 | DISCORD_CLIENT_ID | [R] | ☐ |
| 13 | GUILD_ID_MAIN | [R] | ☐ |
| 14 | GUILD_ID_STAFF | [R] | ☐ |
| 15 | FIREBASE_PROJECT_ID | [R] secret | ☐ |
| 16 | FIREBASE_CLIENT_EMAIL | [R] secret | ☐ |
| 17 | FIREBASE_PRIVATE_KEY | [R] secret | ☐ |
| 18 | NODE_ENV | [R] | ☐ |
| 19 | TIMER_POLL_INTERVAL_SECONDS | [O] | ☐ |
| 20 | TICKETS_CATEGORY_ID | [R] | ☐ |
| 21 | TICKETS_LOG_CHANNEL_ID | [R] | ☐ |
| 22 | ROLE_ID_BOARD_OF_DIRECTORS | [R] | ☐ |
| 23 | ROLE_ID_MANAGEMENT_TEAM | [R] | ☐ |
| 24 | STAFF_PING_ROLE_ID | [R] | ☐ |
| 25 | ROLE_IDS_TICKET_VIEW | [O] | ☐ |
| 26 | ROLE_IDS_TICKET_BLOCKED | [O] | ☐ |
| 27 | CAREER_SETUP_CHANNEL_ID | [R] | ☐ |
| 28 | CAREER_REVIEW_CHANNEL_ID | [R] | ☐ |
| 29 | CAREER_RESULTS_ANNOUNCE_CHANNEL_ID | [R] | ☐ |
| 30 | SUPPORT_CONTACT_CHANNEL_ID | [R] | ☐ |
| 31 | ROLE_ID_FLIGHT_DECK | [R] | ☐ |
| 32 | ROLE_ID_CABIN_CREW | [R] | ☐ |
| 33 | ROLE_ID_GROUND_CREW | [R] | ☐ |
| 34 | ROLE_ID_FLIGHT_OPERATOR | [R] | ☐ |
| 35 | ROLE_ID_HUMAN_RESOURCES | [R] | ☐ |
| 36 | ROLE_ID_PUBLIC_RELATIONS | [R] | ☐ |
| 37 | ROLE_ID_PARTNER | [R] (renamed from ROLE_ID_VietJet_PARTNER) | ☐ |
| 38 | FLIGHT_ANNOUNCE_CHANNEL_ID | [R] | ☐ |
| 39 | FLIGHT_BRIEFING_CHANNEL_ID | [R] | ☐ |
| 40 | FLIGHT_LOG_CHANNEL_ID | [R] | ☐ |
| 41 | ROLE_ID_FLIGHT_OPS_COMMANDS | [R] | ☐ |
| 42 | FLIGHT_PING_ROLE_ID_1 | [R] | ☐ |
| 43 | FLIGHT_PING_ROLE_ID_2 | [R] | ☐ |
| 44 | FLIGHT_BOOKING_STAFF_CHANNEL_ID | [R] | ☐ |
| 45 | BOOKING_WEBSITE_BASE_URL | [R] | ☐ |
| 46 | BOOKING_WEBHOOK_SECRET | [R] secret | ☐ |
| 47 | BOOKING_API_PORT | [R] | ☐ |
| 48 | REWARDS_LOG_CHANNEL_ID | [R] | ☐ |
| 49 | ROLE_ID_REWARDS_LEVEL_1 | [R] | ☐ |
| 50 | ROLE_ID_REWARDS_LEVEL_2 | [R] | ☐ |
| 51 | ROLE_ID_REWARDS_LEVEL_3 | [R] | ☐ |
| 52 | ADS_CHANNEL_ID | [R] | ☐ |
| 53 | ADS_SALES_CONTACT_USER_ID | [R] | ☐ |
| 54 | BOT_OWNER_ID | [R] | ☐ |
| 55 | ERROR_LOG_CHANNEL_ID | [R] | ☐ |
| 56 | DISCORD_INVITE_URL, WEBSITE_BASE_URL, WEBSITE_SESSION_SECRET, DISCORD_OAUTH_CLIENT_SECRET (sign-in block) | [R] secret | ☐ |

## C. Slash commands (57–76)

One slot per registered command plus global registration.

| Row | Command | Status |
|-----|---------|--------|
| 57 | /ping works | ☐ |
| 58 | /tickets opens ticket menu (blue accent) | ☐ |
| 59 | /ticketsetup posts configurator (staff only) | ☐ |
| 60 | /careers opens application flow | ☐ |
| 61 | /careersetup posts configurator (staff only) | ☐ |
| 62 | /careeredit (HP staff only) | ☐ |
| 63 | /flight shows flight info, "LH 123" display with space | ☐ |
| 64 | /createflight (flight ops only) validates prefix, stores bare numeral | ☐ |
| 65 | /createflight rejects e.g. "VJ101" with a friendly brand-format error | ☐ |
| 66 | /flightupdate (flight ops only) accepts "LH 101" or bare "101" | ☐ |
| 67 | /flightupdate rejects invalid/legacy prefixes | ☐ |
| 68 | /logflight (staff or host) accepts brand format | ☐ |
| 69 | /logflight rejects invalid/legacy prefixes | ☐ |
| 70 | /rewards shows LH Rewards overview | ☐ |
| 71 | /economy economy actions work | ☐ |
| 72 | /ads sales flow works | ☐ |
| 73 | All commands registered on the guild (single sync at boot) | ☐ |
| 74 | Permission gate: non-flight-ops user blocked from /createflight, /flightupdate | ☐ |
| 75 | Permission gate: non-HR user blocked from /careers moderation helpers | ☐ |
| 76 | Error paths reply with DANGER accent, never crash | ☐ |

## D. Message templates (77–100)

All sizes from `src/utils/builders.js`, accents from `src/config/brand.js`
ACCENT. Verify the seven message families render as containers.

| Row | Template | Accent | Status |
|-----|----------|--------|--------|
| 77 | Ticket main menu | TICKET (blue) | ☐ |
| 78 | Ticket created confirmation | TICKET | ☐ |
| 79 | Ticket claimed notice | SUCCESS | ☐ |
| 80 | Ticket closed notice | DANGER | ☐ |
| 81 | Careers intro pack | CAREERS (sky) | ☐ |
| 82 | Careers question prompt (DM) | CAREERS | ☐ |
| 83 | Careers review embed submitted | DEFAULT yellow | ☐ |
| 84 | Careers result accepted | SUCCESS | ☐ |
| 85 | Careers result denied | DANGER | ☐ |
| 86 | Flight created preview | DEFAULT | ☐ |
| 87 | Flight booking card (url button to site, LH prefix with space) | DEFAULT | ☐ |
| 88 | Flight staff briefing | DEFAULT | ☐ |
| 89 | Check-in announcement | DEFAULT | ☐ |
| 90 | Boarding position log entry | DEFAULT | ☐ |
| 91 | Completion announcement | SUCCESS | ☐ |
| 92 | Delay notice | DANGER | ☐ |
| 93 | Cancellation notice | DANGER | ☐ |
| 94 | Booking confirmation DM (web booking) | text | ☐ |
| 95 | Booking staff-channel log (web booking) | text | ☐ |
| 96 | Rewards overview (brand: LH Rewards, Miles, LH Credits) | DEFAULT | ☐ |
| 97 | Redemption confirmation | SUCCESS | ☐ |
| 98 | Redemption failure | DANGER | ☐ |
| 99 | Ads sales menu | DEFAULT | ☐ |
| 100 | Ads tier list verbatim from AD_TIERS | DEFAULT | ☐ |

## E. Website pages (101–130)

Each page: brand tokens (navy #05164D, amber #FFAD00, sky #5B8DEF), Barlow /
Source Sans 3, footer disclaimer, title suffix "| Lufthansa PTFS".

| Row | Page / aspect | Status |
|-----|---------------|--------|
| 101 | index.html — hero, join CTA, disclaimer present | ☐ |
| 102 | index.html — no real-airline imagery or slogans | ☐ |
| 103 | flights.html — flight list renders via /api/flights/active with LH labels | ☐ |
| 104 | flights.html — booking dialog posts LA-formatted flight numbers | ☐ |
| 105 | dashboard.html requires sign-in; shows LH Rewards balances | ☐ |
| 106 | dashboard.html — history/missions/catalogue tabs render | ☐ |
| 107 | rewards.html — loyalty programme page (tiers Traveller/Navigator/Captain) | ☐ |
| 108 | careers.html — job listings, application CTA | ☐ |
| 109 | affiliates.html — ad product page with reinvented tiers | ☐ |
| 110 | support.html — support contact flows | ☐ |
| 111 | css/site.css — design tokens only from brand.js/DESIGN.md pallette | ☐ |
| 112 | css/site.css — buttons, cards, tables restyled and consistent | ☐ |
| 113 | js/site.js — header/footer injection with new brand and title suffix | ☐ |
| 114 | js/booking.js — booking form submission verified | ☐ |
| 115 | js/flightCard.js — flight labels use LH prefix with space | ☐ |
| 116 | js/pages/home.js renders | ☐ |
| 117 | js/pages/flights.js renders | ☐ |
| 118 | js/pages/dashboard.js renders with LH Credits labels | ☐ |
| 119 | js/pages/rewards.js renders with Miles label | ☐ |
| 120 | js/pages/careers.js renders | ☐ |
| 121 | favicon.svg renders (neutral mark, no real-airline art) | ☐ |
| 122 | OG/meta tags updated on every page | ☐ |
| 123 | manifest / theme-color updated | ☐ |
| 124 | Contrast passes AA on navy/amber pairs | ☐ |
| 125 | Mobile viewport verified (375px) | ☐ |
| 126 | Tablet viewport verified (768px) | ☐ |
| 127 | Desktop viewport verified (1440px) | ☐ |
| 128 | Network tab shows no hosts other than self / Discord CDN / Google Fonts | ☐ |
| 129 | No hotlinked VietJet assets in any request | ☐ |
| 130 | 404 and "not configured" fallback pages styled with brand tokens | ☐ |

## F. API endpoints (131–148)

Verified from `src/web/server.js`.

| Row | Endpoint | Status |
|-----|----------|--------|
| 131 | GET /api/health returns 200 | ☐ |
| 132 | GET /api/site/config returns invite | ☐ |
| 133 | GET /api/flights/active returns only scheduled/checkin flights | ☐ |
| 134 | GET /api/loyalty/public returns tiers, catalogue, rates | ☐ |
| 135 | POST /api/bookings accepts bare or LH-formatted number | ☐ |
| 136 | POST /api/bookings rejects invalid and VJ-prefixed numbers (400) | ☐ |
| 137 | POST /api/bookings rate limited (5/min/IP) | ☐ |
| 138 | POST /webhook/booking rejects without secret (503/401) | ☐ |
| 139 | GET /auth/login → Discord (503 when not configured) | ☐ |
| 140 | GET /auth/callback issues session and redirects to /dashboard.html | ☐ |
| 141 | GET /api/session reflects the cookie | ☐ |
| 142 | POST /api/signout clears lhptfs_session | ☐ |
| 143 | GET /api/member/overview gated 401 when unauthenticated | ☐ |
| 144 | GET /api/member/history gated | ☐ |
| 145 | GET /api/member/flights gated | ☐ |
| 146 | GET /api/member/missions gated | ☐ |
| 147 | GET /api/member/catalogue gated | ☐ |
| 148 | POST /api/member/redeem and /api/member/mission-claim gated | ☐ |

## G. Loyalty and economy logic (149–162)

Rules: formulas, thresholds and names (points/credits) unchanged; display
labels only.

| Row | Item | Status |
|-----|------|--------|
| 149 | Points accrual formula unchanged from baseline | ☐ |
| 150 | Class multipliers unchanged | ☐ |
| 151 | credits-per-hour formula unchanged | ☐ |
| 152 | Tier thresholds unchanged; names Traveller/Navigator/Captain displayed | ☐ |
| 153 | Ledger writes idempotent (idempotencyKey) still enforced | ☐ |
| 154 | Mission claims still idempotent | ☐ |
| 155 | Catalogue currencies still points/credits backend keys | ☐ |
| 156 | Redeem requires sufficient balance and tier | ☐ |
| 157 | Legacy VJ flight numbers in DB still render as "LH ###" (flightLabel strips prefix) | ☐ |
| 158 | migrate-rewards.js script untouched; historical comments intentional | ☐ |
| 159 | Balance display shows Miles with 1-row decimals consistent | ☐ |
| 160 | Redeemed-sum and grants still computed from the ledger only | ☐ |
| 161 | LH Credits awarded with flight rewards; no cash value language present | ☐ |
| 162 | No real-airline loyalty programme names anywhere in copy | ☐ |

## H. Brand sweeps (163–182)

| Row | Item | Status |
|-----|------|--------|
| 163 | `git grep -i "vietjet"` across src/ website/ scripts/ returns only allowed: migrate-rewards historical comments, auth legacy cookie names, VJ rejection tests | ☐ |
| 164 | No emoji in source (test noEmoji passes) | ☐ |
| 165 | All Discord accents defined as named ACCENT constants, zero raw integers | ☐ |
| 166 | All flight number displays go through flightLabel | ☐ |
| 167 | Every portal entry point (createflight/flightupdate/logflight/recordBooking) validates via isValidFlightNumber or brand-format-or-bare rules | ☐ |
| 168 | Package name lufthansa-ptfs-bot | ☐ |
| 169 | README updated | ☐ |
| 170 | CHECKLIST.md updated | ☐ |
| 171 | LOYALTY_SYSTEM.md updated ("Miles" display; backend `points`) | ☐ |
| 172 | SETUP_AUTH.md updated (cookie names) | ☐ |
| 173 | WEBSITE_DEPLOYMENT.md updated | ☐ |
| 174 | FREEBUFF-SETUP.md reviewed/adapted | ☐ |
| 175 | PC-CONTROL-SETUP.md removed or clearly marked not-for-Wispbyte | ☐ |
| 176 | .env.example matches config.js exactly | ☐ |
| 177 | firebase.json / firestore.rules / firestore.indexes.json rebranded or brand-neutral | ☐ |
| 178 | .playwright-mcp untracked (recorded snapshots, not shipped) | ☐ |
| 179 | Media assets folder excluded from tracked output; owner-supplied replacements pending | ☐ |
| 180 | docs/hosting/WISPBYTE.md complete; unverified assumptions segregated in WISPBYTE_UNVERIFIED.md | ☐ |
| 181 | docs/rebrand/REBRAND_NOTES.md documents all decisions and changed tests | ☐ |
| 182 | docs/rebrand/inventory.md classification table final | ☐ |

## I. Security and final verification (183–200)

| Row | Item | Status |
|-----|------|--------|
| 183 | Session cookie: HttpOnly, SameSite Lax, Secure when HTTPS | ☐ |
| 184 | Sign-out invalidates cookie client-side; token signed with HMAC secret | ☐ |
| 185 | No session accept via query parameters | ☐ |
| 186 | CSP tight: 'self' scripts, style inline only for progress bars, trusted fonts and avatar CDN only | ☐ |
| 187 | Rate limiting on /auth/login, /auth/callback, /api/bookings | ☐ |
| 188 | Open-redirect safe: auth callback redirects to fixed /dashboard.html | ☐ |
| 189 | Webhook secret uses timing-safe compare and fails closed | ☐ |
| 190 | Web booking cannot self-mark attendance (presenceStatus always "unmarked", staff required) | ☐ |
| 191 | No user input flows into Firestore query without validation or parameterised where | ☐ |
| 192 | Booking payload length limits enforced | ☐ |
| 193 | Token forgery test still passes (garbled signature rejected) | ☐ |
| 194 | Tests: full suite green, count ≥ baseline 151 (now 158 with documented additions) | ☐ |
| 195 | Lint: 0 errors | ☐ |
| 196 | Docs/baseline comparison recorded in docs/rebrand/baseline.txt | ☐ |
| 197 | Screenshots: index, flights, dashboard, rewards at 375/768/1440 px verified | ☐ |
| 198 | Network inspection on all rendered pages: zero off-brand hosts | ☐ |
| 199 | Final boot log clean: bot login, web listening, no repeated errors | ☐ |
| 200 | Owner sign-off recorded (blockers documented if any remain) | ☐ |
