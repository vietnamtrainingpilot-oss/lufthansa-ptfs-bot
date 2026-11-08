# Lufthansa PTFS Discord Bot & Website

A complete digital system for the Lufthansa PTFS Roblox virtual airline community, consisting of:

- A Node.js Discord bot (v14.16+) with Components V2 messaging
- A responsive flight-booking website
- A loyalty programme and virtual economy (`VietJet Rewards` points + `LH Credits`)
- Integration through Firebase Firestore

See `LOYALTY_SYSTEM.md` for the full loyalty and economy documentation.

## Command Reference

**Member commands**

| Command | Purpose |
|---|---|
| `/ping` | Health check |
| `/rewards profile [user]` | Balances, status tier, progress, lifetime metrics |
| `/rewards history [user]` | Paginated transaction history |
| `/rewards leaderboard [metric]` | Top 10 by points, lifetime points, flights or credits |
| `/rewards catalogue` | Loyalty redemption catalogue |
| `/rewards missions` | Missions with progress and claim state |
| `/economy balance [user]` | LH Credits balance |
| `/economy shop` | LH Credits shop |

**Staff commands**

| Command | Purpose |
|---|---|
| `/ticketsetup`, `/careersetup`, `/careeredit` | Post support / careers menus |
| `/createflight`, `/logflight`, `/flightupdate` | Flight lifecycle |
| `/flight manifest` | Add passenger, set presence, finalize, or view a manifest |
| `/flight rewards-preview` | Preview eligible passengers and proposed awards |
| `/flight rewards-finalize` | Apply verified flight rewards (exactly once) |
| `/flight rewards-reconcile` | Audited correction using compensating ledger entries |
| `/rewards award`, `/rewards deduct` | Adjust loyalty points (audited) |
| `/rewards configure` | Rates, caps, tiers, multipliers, branding (validated and audited) |
| `/rewards catalogue-manage`, `/rewards mission-manage` | Manage catalogue items and missions |
| `/economy award`, `/economy deduct`, `/economy configure` | Manage LH Credits (audited) |
| `/ads purchase` | Open a paid-ad purchase ticket |

**The verified flight reward workflow**

1. Staff create a flight with `/createflight`.
2. Passengers book. Website bookings are written to the flight manifest automatically
   with presence `unmarked`.
3. Staff mark attendance with `/flight manifest presence`.
4. Staff finalize the manifest with `/flight manifest finalize`.
5. Staff complete the flight with `/logflight`.
6. Staff review the awards with `/flight rewards-preview`.
7. Staff apply them with `/flight rewards-finalize`.

Only passengers confirmed present on a finalized, completed flight earn rewards, and each
is rewarded exactly once. Corrections use `/flight rewards-reconcile`, which writes
compensating entries rather than erasing history.

## Quick Start (Windows)

```powershell
# 1. Install dependencies
npm install

# 2. Copy environment file and fill values
copy .env.example .env
# Edit .env with your Discord token, Firebase config, channel IDs, role IDs, etc.

# 3. Install PM2 globally (if not already)
npm install pm2 -g

# 4. Start the bot
pm2 start src/index.js --name lufthansa-ptfs-bot
pm2 save
```

To run it in the foreground instead (useful while developing):

```powershell
npm start
```

### Verify the install

```powershell
npm run lint   # syntax-checks every JS file
npm test       # runs the full test suite
```

Both should report zero errors before you connect a real Discord token.

### First-time Firestore setup

The bot talks to Firestore through the Admin SDK, which bypasses client rules.
You still need to lock the project down so no website visitor can read balances
directly:

```powershell
npm install -g firebase-tools
firebase login
firebase use --add            # pick the same project as FIREBASE_PROJECT_ID
firebase deploy --only firestore:rules,firestore:indexes
```

`firestore.rules` denies **all** direct client access. Do not relax it.

### Safe migrations

Both migration scripts are dry-run by default and never decrease a balance:

```powershell
npm run migrate:rewards      # legacy single-balance accounts -> current schema
npm run migrate:manifests    # backfill the passengerIds mirror
```

Add `--apply` to the raw command only once the dry-run output looks correct:

```powershell
node scripts/migrate-rewards.js --apply --backup backup/accounts.json
```

## Loyalty and Economy at a glance

Two separate balances, both earned by flying **verified completed flights**:

| | Loyalty points | LH Credits |
|---|---|---|
| Earned from | Verified flights, missions, staff awards | Verified flights, staff awards |
| Spent on | `/rewards catalogue` | `/economy shop` |
| Purchasable / transferable | Never | Never |
| Cash value | None | None |

A reward is granted only after staff complete a flight with `/logflight` and confirm each
passenger's attendance via `/flight manifest`. Booking a seat alone earns nothing. Awards are
enforced **exactly once** per passenger per flight via a Firestore-transactional ledger with
idempotency keys, so re-running a command, a bot restart, or a duplicated webhook cannot
double-award.

All rates, caps, tier thresholds, multipliers and display names are staff-configurable at
runtime (stored in Firestore at `config/loyalty`) — no code or env changes required.

## Architecture

The system follows a **modular, service-oriented architecture** with these layers:

- **config** — Single source of truth for all environment variables with boot-time validation
- **services** — Firestore-backed business logic: tickets, careers, flight ops, rewards, ads
- **utils** — Shared helpers: builders (Components V2), permissions (cross-guild), logger, timer system
- **interactions** — Component interaction handlers (buttons, selects)
- **commands** — Slash command definitions and executors
- **timers** — Firestore-backed timer poller (catches up on startup)
- **index.js** — Bot entry point, command registration, Express API server

All timed actions are **Firestore-backed**, never bare `setTimeout`/`setInterval`. A poller runs every 30s (configurable via `TIMER_POLL_INTERVAL_SECONDS`) that queries `fired == false AND dueAt <= now`, executes, and marks fired. On startup, it also runs an immediate catch-up poll.

## Discord Bot Setup

### 1. Create a Discord Application
- Go to the [Discord Developer Portal](https://discord.com/developers/applications)
- Create a new application named "Lufthansa PTFS Bot"
- Bot → Add Bot → Reset Token → Copy the token
- Bot → Privileged Gateway Intents → Enable Message Content Intent, Server Members Intent
- Bot → Bot Permissions → Select all needed permissions:
  - Send Messages, Read Messages, Send TTS Messages, Manage Messages
  - Embed Links, Attach Files, Read Message History, Use External Emojis
  - Manage Channels, Manage Roles, Manage Events, Connect, Speak
  - Use Voice Activity, Change Voice Member, Manage Webhooks, Read Message References

### 2. Invite the Bot
- Use the OAuth2 URL: `https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&scope=bot+applications.commands&permissions=YOUR_PERMISSIONS`
- Add the bot to both your Main guild and Staff guild

### 3. Required Channel/Role Setup in Discord
Create these channels and roles (IDs go in `.env`):

**Main Guild:**
- `TICKETS_CATEGORY_ID` — Category where ticket channels are created
- `TICKETS_LOG_CHANNEL_ID` — Channel where ticket transcripts + quota logs land
- `ROLE_ID_BOARD_OF_DIRECTORS` — Staff guild role (checked cross-guild)
- `ROLE_ID_MANAGEMENT_TEAM` — Staff guild role (checked cross-guild)
- `STAFF_PING_ROLE_ID` — Role pinged in ticket starter messages (instead of @everyone)
- `ROLE_IDS_TICKET_VIEW` — Comma-separated role IDs that can see ticket channels
- `FLIGHT_OPS_COMMANDS` — Role required for /createflight, /logflight, /flightupdate
- `FLIGHT_PING_ROLE_ID_1`, `FLIGHT_PING_ROLE_ID_2` — Roles pinged at bottom of flight previews
- `REWARDS_LEVEL_1`, `REWARDS_LEVEL_2`, `REWARDS_LEVEL_3` — Roles auto-assigned at loyalty thresholds
- `ROLE_ID_PARTNER` — Role auto-detects partner discount eligibility
- `ADS_CHANNEL_ID` — Channel where posted ads appear
- `CAREER_SETUP_CHANNEL_ID` — Where /careersetup posts the department select
- `CAREER_REVIEW_CHANNEL_ID` — Where career reviews + Accept/Deny buttons land
- `CAREER_RESULTS_ANNOUNCE_CHANNEL_ID` — Where results are publicly announced
- `SUPPORT_CONTACT_CHANNEL_ID` — Linked in accept/deny messages
- `ADS_SALES_CONTACT_USER_ID` — Contact user for ad purchases

**Staff Guild:**
- `GUILD_ID_STAFF` — The staff server's guild ID
- `ROLE_ID_BOARD_OF_DIRECTORS` — Same as Main guild equivalent (or different if needed)
- `ROLE_ID_MANAGEMENT_TEAM` — Same as Main guild equivalent

### 4. Firebase Setup
- Go to the [Firebase Console](https://console.firebase.google.com/)
- Add a new project named "Lufthansa PTFS"
- Project Settings → Service accounts → "Generate new private key"
- Save the JSON file contents as environment variables:
  - `FIREBASE_PROJECT_ID`
  - `FIREBASE_CLIENT_EMAIL`
  - `FIREBASE_PRIVATE_KEY` — the private key from the JSON (keep the `\\n` line breaks intact)
- Create the Firestore database in **test mode** initially (switch to production mode after setup)
- Create these collection groups with sample docs:
  - `tickets` (doc structure: type, openerId, claimerId, status, channelId, createdAt, closedAt, closedById, transcriptMessageId, staffMessageAuthorIds)
  - `careerApplications` (doc structure: userId, department, status, answers, reviewerId, reason, createdAt, decidedAt, departmentEnabled)
  - `flights` (doc structure: flightNumber, hostId, departureAirport, arrivalAirport, aircraft, classes, privateServerLink, spawnLocation, gateNumber, flightTimeMinutes, scheduledUnixTime, discordEventId, discordEventLink, status, staffClaims, createdAt)
  - `timers` (doc structure: type, dueAt, guildId, payload, fired, createdAt)
  - `rewardsAccounts` (doc structure: discordUserId, balance, level, history)
  - `adsOrders` (doc structure: userId, tier, status, ticketChannelId, createdAt)
  - `config/rewards` (doc structure: level2Threshold, level3Threshold)
  - `config/careerDepartments` (optional, per-department enable state)

### 5. Run the Bot
```powershell
npm install          # Install dependencies (already done)
pm2 start src/index.js --name lufthansa-ptfs-bot
pm2 save             # Survives reboots (survives sleep/display-off, not full shutdown)
```

## Website Deployment

The booking website is a static HTML/CSS/JS application that integrates with the bot's Express API.

### Deployment Options

1. **Vercel/Netlify** (recommended for static sites)
   - Connect your Git repo
   - Set environment variable: `API_BASE_URL=https://your-bot-domain.com`
   - The site will call the bot's `/api/flights/active` and `/webhook/booking` endpoints

2. **Shared hosting** (cPanel, etc.)
   - Upload the `website/` folder contents
   - Configure a subdomain pointing to the bot's Express server
   - Set `API_BASE_URL` to your bot's public address

### Required Environment (on the bot PC, also accessible to the website)

| Variable | Description |
|---|---|
| `BOOKING_WEBHOOK_SECRET` | Shared secret; must match between bot and website |
| `BOOKING_API_PORT` | Port the bot's Express server listens on (default 3001) |
| `WEBSITE_BASE_URL` | Public URL of the website |
| `DISCORD_OAUTH_CLIENT_SECRET` | Required for member sign-in on the dashboard. See `SETUP_AUTH.md` |

### Website API Integration

The website is served by the bot process itself, so these are same-origin.

**Public (no auth):**

- **GET `/api/flights/active`** — scheduled and check-in flights, for the booking form.
- **GET `/api/loyalty/public`** — public rates and branding. Never returns a secret.
- **POST `/api/bookings`** (body `{ flightNumber, discordUserId, class, seat }`) — records the
  seat on the flight manifest, DMs the member a confirmation, and posts to
  `FLIGHT_BOOKING_STAFF_CHANNEL_ID`.

**Member (requires a signed session cookie):**

- **GET `/api/member/overview`** — balances, tier, and progress for the signed-in member.
- **GET `/api/member/history`** — that member's ledger entries.
- **GET `/api/member/flights`** — that member's flight history and what they earned.
- **GET `/api/member/missions`** — mission progress and completion.
- **GET `/api/member/catalogue`** — catalogue with server-computed affordability and eligibility.
- **POST `/api/member/redeem`** — redeem an item. Price, stock, and eligibility are read
  server-side inside the transaction; the browser never supplies them.
- **POST `/api/member/mission-claim`** — claim a completed mission.

Member identity is taken from the session cookie only. There is no route that
accepts a client-supplied member ID for reading or spending a balance.

**Server-to-server:**

- **POST `/webhook/booking`** (header `x-webhook-secret` matching `BOOKING_WEBHOOK_SECRET`) —
  the original booking contract, kept so an externally hosted or legacy booking
  page keeps working. Fails closed with 503 if the secret is unset.

### Website Build & Customization

The website uses:
- **Tailwind CSS v4** for utility-first styling
- **Geist** font family (Google Fonts, loaded via `next/font` pattern)
- **Vanilla JS** for interactivity (no framework dependency)
- **Responsive design** from mobile-small to 1400px desktop max
- **Reduced-motion aware** — all animations honor `prefers-reduced-motion`
- **WCAG AA contrast** — color palette verified against both light and dark mode

To customize:
- Edit `website/css/site.css` for colors, spacing, and typography
- Edit `website/js/site.js` for shared navigation, session handling, and API calls
- The design follows Lufthansa PTFS branding: energetic red (#E61E2D) with white and restrained yellow accents (#FFC72C)

## Lufthansa PTFS Branding Guidelines

- **Primary brand**: "Lufthansa PTFS" for the virtual airline community
- **Airline name**: "Lufthansa" only where needed in passenger-facing flight copy
- **Voice**: Clean, energetic, aviation-focused
- **No emojis** in bot messages, website, documentation, or code comments (owner may add manually later)
- **Not official airline-operated**: This is for a Roblox virtual airline community
- **Where decisions are marked `[OPENCODE DECISION]`**: Choices made during implementation; revisit after owner review
- **Where items are `[ASSUMPTION]`**: Assumptions made during build; confirm after

## Feature Checklist (Acceptance Criteria)

- [ ] Bot boots and validates all required env vars, crashes with clear message if any are missing
- [ ] `/ping` responds
- [ ] Full ticket lifecycle: create → claim → unclaim → close → transcript uploaded → DM sent
- [ ] A member holding only `ROLE_IDS_TICKET_BLOCKED` (no BoD/Management) cannot view any ticket channel at any stage
- [ ] Full career lifecycle: select department → agree → answer questions (including 10-min timeout test) → review posts correctly → accept assigns role → deny sends reason
- [ ] `/createflight` produces a real Discord Scheduled Event, correct preview + briefing posts, check-in fires automatically at scheduled time
- [ ] `/logflight` and `/flightupdate` both work
- [ ] Bot survives a hard restart mid-timer (kill process while 10-min timer pending, restart, confirm catch-up)
- [ ] User without `ROLE_ID_FLIGHT_OPS_COMMANDS`, BoD, Management, or flight-host status is rejected by flight commands
- [ ] `/rewards` full loop: award → level-up role assigned → leaderboard reflects it
- [ ] `/ads purchase` opens a ticket with the right pre-fill

## Known Limitations (Phase 2 Items)

- Real VietJet Rewards level thresholds (currently placeholders; editable via `/rewards configure`)
- Whether Unbelievaboat is already running in the VietJet server (changes Rewards architecture)
- Fresh banner image URLs for the ticket Main Menu (placeholders currently)
- Whether "Spin the Globe" / "Pack Your Bags" mini-games get built later
- Automated Robux payment verification (manual confirmation required)

## File Tree

```
```
VietJet/
|-- package.json            - Node.js project manifest + scripts
|-- .env.example            - Every environment variable, with placeholders
|-- .env                    - Your real values (gitignored, never commit it)
|-- .gitignore              - Excludes .env, node_modules, screenshots, logs
|-- firebase.json           - Firestore rules + index deployment config
|-- firestore.rules         - Denies ALL direct client access (bot-only)
|-- firestore.indexes.json  - Composite indexes the bot's queries require
|-- SETUP_AUTH.md           - Discord OAuth / sign-in setup walkthrough
|-- LOYALTY_SYSTEM.md       - Points, LH Credits, tiers, missions, catalogue
|-- PM2_SETUP_GUIDE.md      - Running the bot as a service on Windows
|-- WEBSITE_DEPLOYMENT.md   - Hosting the website
|-- CHECKLIST.md            - Specification acceptance checklist
|
|-- src/
|   |-- index.js            - Bot entry point: loads commands, starts timers and web server
|   |-- commands/           - Slash command definitions + executors
|   |   |-- index.js        - Registry: auto-imports every command module
|   |   |-- ping.js, tickets.js, ticketsetup.js
|   |   |-- careers.js, careersetup.js, careeredit.js
|   |   |-- createflight.js, logflight.js, flightupdate.js, flight.js
|   |   |-- rewards.js, economy.js, ads.js
|   |-- interactions/       - Button / select-menu / modal handlers
|   |   |-- interactions.js, tickets.js, careers.js, flights.js
|   |   |-- rewards.js, loyalty.js, ads.js
|   |-- services/           - Firestore-backed business logic
|   |   |-- firestore.js            - Firebase Admin init + db getter + test seam
|   |   |-- tickets.js              - Ticket channels, permissions, transcripts
|   |   |-- careers.js              - Career applications and Q&A
|   |   |-- flightOps.js            - Flights, check-in, log, delay, cancel
|   |   |-- ads.js                  - Ad orders and partner eligibility
|   |   |-- ledger.js               - The ONLY way a balance may change
|   |   |-- rewards.js              - Account reads and leaderboard
|   |   |-- manifest.js             - Passenger manifest + verified gate
|   |   |-- manifestRules.js        - Presence / eligibility rules
|   |   |-- flightRewards.js        - Verified flight reward orchestration
|   |   |-- rewardFormula.js        - Distance and duration reward maths
|   |   |-- loyaltyStore.js         - Firestore-backed loyalty config
|   |   |-- tiers.js, tierRules.js  - Tier computation and role sync
|   |   |-- missions.js             - Mission progress and claims
|   |   |-- catalogue.js            - Redemption catalogue (atomic, idempotent)
|   |-- timers/
|   |   |-- timers.js               - Firestore timer poller + handlers
|   |-- utils/
|   |   |-- builders.js             - Components V2 message builders
|   |   |-- permissions.js          - Cross-guild staff authorization
|   |   |-- ticketMessages.js       - Ticket starter/close messages
|   |   |-- loyaltyFormat.js        - Shared reward formatting
|   |   |-- logger.js               - Structured console logger
|   |-- config/
|   |   |-- config.js               - Environment validation
|   |   |-- loyaltyConfig.js        - Loyalty defaults and validation
|   |-- web/
|   |   |-- server.js               - Express: static site, API, security headers
|   |   |-- auth.js                 - Discord OAuth, PKCE, session cookies
|   |   |-- memberRoutes.js         - Session-gated member endpoints
|
|-- website/               - Static site served by the bot
|   |-- index.html, flights.html, rewards.html, careers.html
|   |-- affiliates.html, support.html, dashboard.html, favicon.svg
|   |-- css/site.css       - Design tokens, components, responsive, reduced-motion
|   |-- js/site.js         - Nav, session client, config, toasts
|   |-- js/booking.js, js/flightCard.js
|   |-- js/pages/          - One module per page
|
|-- scripts/
|   |-- lint.js                    - Syntax-checks every JS file
|   |-- migrate-rewards.js         - Legacy balances -> new schema (dry run)
|   |-- migrate-manifests.js       - Backfills the passengerIds mirror
|   |-- overflow-check.mjs         - Reports horizontal overflow at a width
|
|-- tests/                - node:test suites (run: npm test)
`-- README.md           - This file
```
## Known limitations

These are real gaps, not oversights. Each needs the owner (or live credentials)
to close.

**Needs owner configuration**

- `DISCORD_INVITE_URL` is unconfirmed. The site falls back to a hardcoded value;
  set the real invite in `.env` or every "Join Discord" button is wrong.
- End-to-end Discord OAuth has never been run against real credentials. The flow
  is unit-tested (state, PKCE, endpoint, error paths) but not live.
- Firestore composite indexes (`firestore.indexes.json`) are written but not
  deployed. Until `firebase deploy --only firestore:indexes` runs, several
  queries fail with `FAILED_PRECONDITION`.
- `ROLE_IDS_TICKET_BLOCKED` is empty by default, so the blocked-role deny does
  nothing until you populate it.

**Not implemented**

- The ticket join-link auto-delete timer is a stub; no join-link feature exists.
- Staff "interference" tracking records an empty list, because no guild-channel
  `messageCreate` handler populates it. The quota log shows `None`.
- `/ads purchase` is staff-only and its ticket is not pre-filled with the tier.
- Mission "fly in a cabin class" objectives always read `economy`, because
  cabin class is stored per passenger on the manifest, not on the flight.
- Restart-survival of pending timers is implemented (startup catch-up query)
  but untested against live Firestore.

**Security posture to be aware of**

- Sessions are stateless and expire after 12 hours. There is no server-side
  revocation list, so a stolen cookie is valid until it expires. Rotate
  `WEBSITE_SESSION_SECRET` to invalidate every outstanding session at once.
- Guest booking is allowed by design (the site asks for a Discord user ID). It
  is rate limited and hard-codes `presenceStatus: "unmarked"`, so a booking can
  never grant a reward on its own: staff must mark the passenger present.
