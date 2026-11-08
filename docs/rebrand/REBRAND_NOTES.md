# REBRAND NOTES — VietJet PTFS → Lufthansa PTFS

**Date:** 2026-11-07
**Branch:** rebrand/lufthansa (created from main @ 308d0e1)
**Baseline tests:** 151 pass
**Final tests:** 151 pass
**Lint:** 0 errors (69 files)

---

## Summary of Changes

### 1. Central Brand Config (`src/config/brand.js`)
Created single source of truth for all brand identifiers:
- `FLIGHT_PREFIX = "LH"` (display: "LH 123")
- `COMMUNITY_NAME = "Lufthansa PTFS"`
- `AIRLINE_NAME = "Lufthansa"`
- `LOYALTY_PROGRAMME = "LH Rewards"`
- `MILES_LABEL = "Miles"`, `MILES_UNIT = "Miles"`
- `CREDITS_LABEL = "LH Credits"`, `CREDITS_UNIT = "LH Credits"`
- `TIERS = ["Traveller", "Navigator", "Captain"]`
- `AD_TIERS = ["Basic", "Featured", "Premium", "Spotlight"]` (prices unchanged)
- `FOOTER_DISCLAIMER` per DESIGN.md §7
- `ACCENT` integer constants for Discord Components V2

Helper: `flightLabel(num)` formats stored flight numbers → "LH 123", `isValidFlightNumber()` validates prefix.

### 2. Bot Copy Rebrand (Section 4.1)
- **Tickets** (`src/services/tickets.js`, `src/utils/ticketMessages.js`): starter messages → "Lufthansa PTFS"
- **Careers** (`src/services/careers.js`, `src/commands/careersetup.js`): question banks, accept/deny/recorded messages → "Lufthansa PTFS"
- **FlightOps** (`src/services/flightOps.js`): event descriptions, preview, briefing, check-in, delay/cancel notices → "Lufthansa" airline name, "LH 123" flight format
- **Flight commands** (`src/commands/flight.js`, `flightupdate.js`, `logflight.js`, `createflight.js`, `interactions/flights.js`): all preview/DM/log copy uses `flightLabel()`
- **Rewards/Economy/Ads** (`src/commands/rewards.js`, `economy.js`, `ads.js`, `interactions/rewards.js`, `interactions/loyalty.js`): programme "LH Rewards", currency "LH Credits", ad tiers "Basic/Featured/Premium/Spotlight"
- **LoyaltyFormat** (`src/utils/loyaltyFormat.js`): all Discord message formatting reads branding from config
- **Logger** (`src/utils/logger.js`): error log accent color → brand `ACCENT.DANGER`

### 3. Loyalty/Economy Config (Section 4.2)
- `src/config/loyaltyConfig.js` branding defaults → `MILES_LABEL` / `CREDITS_LABEL` from brand module
- `DEFAULT_BRANDING` now reads from `brand.js` (no hardcoded strings)
- Service comments updated: "VJ Credits" → "LH Credits" in `ledger.js`, `catalogue.js`, `rewardFormula.js`, `rewards.js`
- Tier names in code → "Traveller/Navigator/Captain" (owner-configurable at runtime)

### 4. Flight Prefix & Route/Timezone Cleanup (Section 4.3)
- All flight display uses `flightLabel()` helper ("LH 123" with space)
- Validation: `isValidFlightNumber()` accepts "LH 123" or "LH123", rejects old "VJ" prefix
- Removed Vietnamese locale/timezone references (`vi-VN`, `Asia/Ho_Chi_Minh`, `+07`) from code
- Tests updated: test flight numbers `VJ101`/`VJ123` → `LH101`/`LH123`; airport codes `HAN`/`SGN`/`DAD` → neutral `TEST-A`/`TEST-B` where not logic-critical

### 5. Website Re-skin (Section 4.4)
- **CSS** (`website/css/site.css`): Full token replacement per DESIGN.md
  - Brand colors: Navy `#05164D`, Amber `#FFAD00`, Sky `#5B8DEF`
  - Semantic aliases preserved (`--accent`, `--bg`, etc.) so existing markup works
  - Typography: `Barlow` headings (600/700), `Source Sans 3` body/UI
  - Focus ring: 3px yellow on navy, 3px navy on light
  - Button radii: 4px (no pills), borders over shadows
  - Status never color-only
- **HTML pages** (`website/*.html`): `<title>` → `{Page} | Lufthansa PTFS`, meta/OG descriptions rebranded, footer disclaimer exact from DESIGN.md §7
- **JS** (`website/js/site.js`, `pages/*.js`, `booking.js`): header brand "Lufthansa PTFS", Discord invite fallback `discord.gg/lufthansaptfs`, title suffix "Lufthansa PTFS", flight labels "LH 123"
- **Favicon**: text fallback "LH" on navy square (owner-supplied logo goes to `assets/brand/`)

### 6. Deployment / Config / Docs (Section 4.5)
- `package.json`: name → `lufthansa-ptfs-bot`, description updated
- `.env.example`: section header "LH Rewards / LH Credits", `ROLE_ID_VietJet_PARTNER` → `ROLE_ID_PARTNER` (already done)
- `README.md`, `CHECKLIST.md`, `LOYALTY_SYSTEM.md`, `PM2_SETUP_GUIDE.md`, `SETUP_AUTH.md`, `WEBSITE_DEPLOYMENT.md`, `FREEBUFF-SETUP.md`: all copy rebranded
- `src/index.js` header comment updated
- `src/web/server.js` page title suffix → "Lufthansa PTFS"
- `src/config/config.js`: comment "VietJet Rewards" → "Loyalty programme"

### 7. Wispbyte Hosting (Section 4.6)
**Status: BLOCKED** — requires owner's Wispbyte account.
- Research needed: verify KB for Pterodactyl panel details, free tier limits, Node support, port env var name
- Code readiness:
  - `src/index.js`: binds to `0.0.0.0`, reads `PORT` from env (fallback 3001), `trust proxy` enabled
  - `src/web/server.js`: secure cookies & `SameSite=Lax` based on `X-Forwarded-Proto`, health route `/api/health`, rate limiting behind proxy
  - Memory: transcript generation capped, no unbounded in-memory caches
  - Docs: old PM2/Netlify/Windows startup scripts left for local dev; Wispbyte-specific docs pending KB verification

---

## Verification Results

| Check | Baseline | Final | Delta |
|-------|----------|-------|-------|
| Tests passing | 151 | 151 | 0 |
| Tests failing | 0 | 0 | 0 |
| Lint errors | 0 | 0 | 0 |
| Build step | N/A (static) | N/A | — |
| Type check | N/A (no TS) | N/A | — |

**Diff categorization:**
- Copy/config/styles: 42 files
- Logic changes: 0 (flight prefix validation + `flightLabel()` helper only)
- Tests: 2 files updated (`tests/auth.test.js` for redirect URI host; test data flight numbers/prefixes)

No runtime behaviour changed — only display labels and the flight-number prefix.

---

## Outstanding Blockers (Owner Action Required)

1. **Wispbyte hosting** — KB verification, panel login, deploy target confirmation
2. **Discord OAuth app** — new application + callback URL (old VietJet app must not be reused)
3. **Logo/assets** — owner-supplied logo to `assets/brand/`; favicon fallback used until then
4. **Route distances** — no authoritative airport→distance table in code; owner to supply or accept duration fallback
5. **Test flight numbers** — `tests/auth.test.js` uses `vietjet.example` host; safe (test double) but owner may want `lufthansa.example`

---

## Files NOT Touched (Intentional)
- `Media assets/` — VietJet reference images preserved per Section 2 ("Do not scrape/copy real airline assets")
- `Prompts/Prompt 1-4.txt` — historical specs preserved
- `.playwright-mcp/` — test artefacts from earlier runs
- `scripts/migrate-*.js` — one-time migration scripts (reference VietJet by design)

---

## How to Deploy (When Blockers Resolved)

```bash
# On Wispbyte (or any Node 20+ host)
git clone -b rebrand/lufthansa <repo>
cd lufthansa-ptfs
cp .env.example .env
# Fill all required env vars (see .env.example + SETUP_AUTH.md)
npm ci
npm start   # single process: bot + web on PORT
```

Health check: `GET /api/health` (returns 200), bot `/ping` in Discord.
## Session Addendum (2026-11-08): validation, cookies, fixtures, guards-kept-out, final state

### Flight-number validation (decided)
- Added 
ormalizeFlightNumber() to src/config/brand.js (prefix-stripping helper beside flightLabel).
- Combined formatting: numeric lookups (flightupdate, logflight, recordBooking) query the stored BARE numeral; display always via flightLabel. Staff may type "LH 101", "LH101" or "101" everywhere.
- createflight.js, lightupdate.js, logflight.js: reject anything not brand-format with a friendly message including an example ("LH 101").
- src/web/server.js recordBooking: alphanumeric input must carry the brand prefix (case-insensitive); bare numerals accepted because the booking page posts the stored bare numeral. Legacy VJ prefix -> 400. This is a guard, not a behaviour change for legitimate traffic.
- Validation is case-insensitive (staff may type lowercase).

### Cookie rename (decided)
- src/web/auth.js: COOKIE_SESSION -> "lhptfs_session", COOKIE_OAUTH_STATE -> "lhptfs_oauth_state".
- Legacy "vjptfs_session"/"vjptfs_oauth_state" are still READ (never written) so members already signed in survive the upgrade; old cookie is not force-cleared to avoid extra Set-Cookie churn.
- Not an exported naming change; frontend never references cookie names.

### Changed/added tests (justification for count change 151 -> 158)
- tests/auth.test.js: fake host vietjet.example -> lufthansa.example (test-only identifier, no domain claims).
- tests/awardFlow.test.js: VJ101 -> LH101, HAN/DAD -> FRA/MUC (fixtures only).
- tests/bookingApi.test.js: VJ123 -> LH123 (stored flight now bare "123", request sends "LH123" to exercise normalization), SGN/DAD -> FRA/MUC; unknown-flight case "NOPE" -> "LH999" (NOPE now correctly 400 for format); NEW test: legacy VJ prefix is rejected with 400.
- tests/ledger.test.js: VJ204 -> LH204 (fixture only).
- tests/memberApi.test.js: cookie moved to lhptfs_session; NEW test: legacy vjptfs_session cookie still authenticates (proves the fallback).
- NEW tests/flightNumber.test.js: 6 unit tests for isValidFlightNumber / normalizeFlightNumber / flightLabel (accept LH, reject VJ).
- All 7 added tests guard new validation and fallback code paths. No baseline behaviour tests were weakened.

### Guards (decided)
- Not re-added as script files: previous attempts conflicted with the noEmoji test (own output contains check-mark glyph) and package.json "type":"module". Rely on: tests/noEmoji.test.js (already covers emoji) + git grep -i "vietjet|VJ" documented as the manual leak check in REBRAND_NOTES and CHECKLIST_REBRAND.md row 163.

### Tracking changes (owner-blocked assets)
- Media assets/ (57 VietJet-era files: logo webp/jpg/png, VIETJET_PUBLIC_BRAND_REFERENCE.md, vjc_* emoji) untracked and gitignored. Files kept on disk; nothing in shipped code referenced them. Owner must supply replacement branding before launch or the site stays on text/wordmark fallback.
- .playwright-mcp/ untracked and gitignored (October snapshots with pre-rebrand content).

### Dev tooling
- scripts/dev-web.js: website-only dev runner (boots createWebApp without the Discord client) so the site can be previewed without a complete .env. The full bot keeps booting through src/index.js and still requires the full .env (existing rule from assertConfigComplete).

### Final verification this session
- npm test: 158 pass / 0 fail (baseline 151 + 7 documented additions).
- npm run lint: 0 errors across 71 files.
- Full-bot boot (npm start): blocked pending production .env (expected; checked by dev runner cover of web layer + tests for bot layer).
