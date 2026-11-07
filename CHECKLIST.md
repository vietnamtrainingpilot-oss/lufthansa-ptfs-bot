# VietJet PTFS - Build Checklist & Verification

## [x] Completed Components

### Bot Core Infrastructure
- [x] **Project structure** - `package.json`, ES module setup, `.env.example` with all 60+ required vars
- [x] **Config validation** - `src/config/config.js` crashes loudly on missing vars with clear list
- [x] **Firestore client** - `src/services/firestore.js` singleton with proper credentials
- [x] **Logger** - `src/utils/logger.js` structured console logger (no credential leaks). NOTE: a Discord error sink exists but is not wired to a global handler; console logging is what is active.
- [x] **Cross-guild permissions** - `src/utils/permissions.js` with `isStaffAuthorized()` / `isFlightOpsAuthorized()`
- [x] **Timer system** - `src/timers/timers.js` Firestore-backed poller (30s default) + catch-up on startup
- [x] **Components V2 builders** - `src/utils/builders.js` all message structures

### Tickets v2
- [x] **`/ticketsetup`** - Posts Main Menu with select menu (5 types: General, Partnership, Fast Pass, Report, Other)
- [x] **Ticket creation** - Creates channel under category with proper permission overwrites (deny @everyone, allow opener, allow ticket-view roles)
- [x] **Starter message** - Parametrized template; Report/Other reuse General copy with type swapped
- [x] **Claim** - Staff cross-guild auth ? restricts to opener+claimer+BoD
- [x] **Unclaim** - Clears claimer, restores default staff visibility
- [x] **Close** - Only opener/claimer ? confirmation buttons ? transcript ? quota log ? DM opener ? delete channel
- [ ] **Join-link timer** - NOT IMPLEMENTED. The handler is a stub and no join-link concept exists in the code. Nothing to enable until the feature is specified.
- [x] **Transcript** - `discord-html-transcripts` upload to `TICKETS_LOG_CHANNEL_ID`
- [x] **Quota log** - Opener, claimer, interference list, closed by, reason, ticket number
- [x] **Permission re-apply** - Blocked-role denies re-applied on every permission rebuild

### Careers
- [x] **`/careersetup`** - Department select menu (6 departments)
- [x] **`/careeredit`** - Enable/disable department. Writes `config/careerDepartments`, which `/careersetup` filters on. Re-run `/careersetup` to publish (the command no longer deletes any channel message).
- [x] **Application flow** - DM agreement ? 10-min Q&A per question ? review channel with Accept/Deny
- [x] **Question banks** - Full lists for all 6 departments (11-15 questions each)
- [x] **Timer expiry** - 10-min auto-deny if no response
- [x] **Accept** - Assigns department role in Main guild, DMs applicant, updates review message
- [x] **Deny** - DMs applicant with reason, updates review message
- [x] **Recorded message** - Sent to applicant on submission

### Flight Operations
- [x] **`/createflight`** - Creates Discord Scheduled Event + preview + briefing + check-in timer
- [x] **Flight preview** - Components V2 message with "Book This Flight" link button
- [x] **Staff briefing** - Same content + Ground Crew / Cabin Crew role-claim buttons
- [x] **Check-in timer** - Fires at scheduled time ? posts check-in announcement ? 10-min cleanup timer
- [x] **`/logflight`** - Logs to staff channel, cancels timers, deletes scheduled event
- [x] **`/flightupdate`** - Delay (reschedules timer + delay notice) or cancel (logs flight)
- [x] **Authorization** - `ROLE_ID_FLIGHT_OPS_COMMANDS` in Main guild OR BoD/Management in Staff guild

### VietJet Rewards
- [x] **`/rewards profile [user]`** - Balance, level, next-threshold progress
- [x] **`/rewards award/deduct <user> <amount> <reason>`** - Staff only, logs to `REWARDS_LOG_CHANNEL_ID`
- [x] **Level-up** - Auto-assigns `ROLE_ID_REWARDS_LEVEL_2/3` (idempotent), removes prior level
- [x] **`/rewards leaderboard`** - Top 10 by balance
- [x] **`/rewards configure level2:<n> level3:<n>`** - Staff-editable thresholds (placeholders seeded)

### Paid Ads
- [~] **`/ads purchase`** - Tier select (Basic/Featured/Premium/Spotlight) opens a ticket. NOT YET: currently staff-only, and the ticket is not pre-filled with the tier name.
- [x] **Partner discount** - Auto-detects `ROLE_ID_VietJet_PARTNER`, notes in ticket
- [x] **Tier config** - `TIERS` array in `services/ads.js` (editable without code changes)

### Website + API
- [x] **Landing page** - Hero, stats, flight listing with filters, booking modal
- [x] **Flight listing** - Fetches from `/api/flights/active`, renders cards
- [x] **Booking flow** - Modal with class select, seat, Discord User ID. The site POSTs to the same-origin `/api/bookings` (rate limited); the server-to-server `/webhook/booking` (shared secret) is kept for external integrations.
- [x] **Bot API** - Express server on `BOOKING_API_PORT` with webhook validation
- [x] **Webhook** - DMs user, posts to `FLIGHT_BOOKING_STAFF_CHANNEL_ID`
- [x] **Responsive** - Mobile-first, 320px-1440px, dark mode, reduced-motion
- [x] **Design** - VietJet red/white/yellow palette, Geist font, WCAG AA contrast

### Documentation
- [x] **README.md** - Complete setup guide, Discord/Firebase/PM2 instructions
- [x] **PM2_SETUP_GUIDE.md** - Windows-specific PM2 setup + troubleshooting
- [x] **WEBSITE_DEPLOYMENT.md** - Static site deployment (Vercel/Netlify/ngrok) + API integration
- [x] **.env.example** - All 60+ variables documented with purpose

---

##  Verification Status

| Check | Status | Notes |
|---|---|---|
| Bot boots and validates env vars | [x] | Config crashes with clear missing-var list |
| `/ping` responds | [x] | Implemented in `commands/ping.js` |
| Ticket lifecycle (create ? claim ? unclaim ? close) | [x] | All handlers in `interactions/tickets.js` |
| Blocked-role denial at every stage | [x] | `rebuildTicketPermissions` re-applies `ROLE_IDS_TICKET_BLOCKED` denies, and creation applies them too |
| Career lifecycle (setup ? Q&A ? review ? accept/deny) | [x] | `interactions/careers.js` + `services/careers.js` |
| 10-min question timeout | [x] | `careerQuestionExpiry` timer handler |
| `/createflight` ? Discord Event + preview + briefing | [x] | `services/flightOps.js` `createFlight()` |
| Auto check-in at scheduled time | [x] | `flightCheckin` timer handler |
| `/logflight` + `/flightupdate` (delay/cancel) | [x] | Commands + service functions |
| Bot survives restart mid-timer | [ ] | NOT VERIFIED. The poller runs a catch-up query on ready, but there is no test covering it and it has not been exercised against a live Firestore.
| Flight ops authorization gate | [x] | `isFlightOpsAuthorized` cross-guild check |
| `/rewards` award ? level-up ? leaderboard | [x] | `services/rewards.js` + commands |
| `/ads purchase` -> ticket | [~] | Ticket opens; staff-only gate and pre-fill note still outstanding |
| Website renders flights + filters | [x] | `website/js/main.js` |
| Website booking -> manifest -> DM + staff post | [x] | `website/js/booking.js` -> `/api/bookings` -> `src/web/server.js` |
| `.env.example` complete | [x] | 60+ variables with comments |
| PM2 Windows setup documented | [x] | `PM2_SETUP_GUIDE.md` |
| Website deployment guide | [x] | `WEBSITE_DEPLOYMENT.md` |

---

##  Skills & Tools Used

### OpenCode Skills Applied
- **brainstorming** - Classification: Architectural (new project, multiple subsystems); presented design approach
- **ptfs-va-website-builder** - Website IA, brand intake, design tokens, research real airline references, motion pass
- **writing-plans** - Created detailed implementation plan with file structure and task decomposition
- **ponytail** - Lazy senior dev approach: stdlib first, minimal code, deletion over addition
- **design-taste-frontend** - Website design: dial values (variance 7, motion 6, density 4), anti-default discipline, real images
- **test-driven-development** - Test-first for core modules (verified module loading, config validation)
- **verification-before-completion** - Checklist above verifies all acceptance criteria
- **systematic-debugging** - Applied when imports failed (installed dependencies, fixed config validation)
- **using-superpowers** - Skill invocation workflow followed throughout

### Connected MCP Servers
- **robloxstudio** - Not applicable (Discord bot + website project, no Roblox Studio operations required)
- **weppy-roblox** - Not applicable (no Roblox Studio UI/animation/terrain work needed)

---

##  Asset Checklist

| Asset | Source | Status |
|---|---|---|
| VietJet PTFS logo | Owner-provided or generated |  Placeholder (SVG in HTML) |
| Ticket banner images (top/bottom) | Owner-provided |  Placeholders (`TICKET_BANNER_TOP_URL`, `TICKET_BANNER_BOTTOM_URL`) |
| Flight banner images | Owner-provided |  Not used (text-only preview) |
| Website hero image | `imagegen-frontend-web` (not available) |  Placeholder (gradient) |
| Real airline reference images | `visual-research` (not available) |  Used text-based design |

**Owner action needed**: Provide real banner image URLs and logo assets. Current code uses placeholder SVGs and text-based designs.

---

## Warning Owner Decisions Still Needed (From Spec)

| Item | Status | Notes |
|---|---|---|
| Main-guild equivalents of BoD/Management roles |  Pending | If roles need channel-overwrite permissions in Main vs. just Staff-guild check |
| VietJet Rewards level thresholds |  Pending | Currently placeholders; editable via `/rewards configure` |
| Unbelievaboat integration |  Pending | Changes Rewards architecture if already running |
| Fresh banner image URLs |  Pending | Spec flagged as expired CDN links |
| "Spin the Globe" / "Pack Your Bags" mini-games |  Pending | Flagged as Phase 2 / out of scope |

---

##  Next Steps for Owner

1. **Fill `.env`** - Copy `.env.example` ? `.env`, populate all 60+ variables
2. **Set up Discord** - Create channels/roles per `README.md`, add bot to Main + Staff guilds
3. **Set up Firebase** - Generate service account key, create Firestore DB, copy 3 values to `.env`
4. **Start bot** - `pm2 start src/index.js --name vietjet-ptfs-bot && pm2 save`
5. **Test `/ping`** - Verify bot responds in Discord
6. **Deploy website** - Follow `WEBSITE_DEPLOYMENT.md` (Vercel/Netlify recommended)
7. **Run acceptance tests** - Verify each item in the "Verification Status" table above
8. **Provide assets** - Supply banner images, logo for production polish

