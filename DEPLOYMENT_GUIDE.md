# Lufthansa PTFS Discord Bot — Deployment Guide

A Discord loyalty bot for a PTFS (Roblox) virtual airline. Members sign up, claim flights, earn Award Miles, unlock achievements, redeem rewards and progress through status tiers. All balances are ledger-backed (immutable, exactly-once).

---

## 1. Requirements

- **Node.js 20+** (tested on 26.x)
- A **Discord application** with a bot token
- A **Firebase project** (Cloud Firestore) + service-account JSON
- **npm**

---

## 2. Environment variables

Copy `.env.example` to `.env` and fill in real values. Only the variables below are required by the code — nothing else is read.

| Variable | Required | Purpose |
|----------|----------|---------|
| `DISCORD_BOT_TOKEN` | ✅ | Discord bot token |
| `DISCORD_CLIENT_ID` | ✅ | Discord application client ID |
| `GUILD_ID_MAIN` | ✅ | Main community guild ID |
| `GUILD_ID_STAFF` | ✅ | Staff guild ID (role checks resolve cross-guild) |
| `FIREBASE_PROJECT_ID` | ✅ | Firebase project id |
| `FIREBASE_CLIENT_EMAIL` | ✅ | Firebase service-account client email |
| `FIREBASE_PRIVATE_KEY` | ✅ | Firebase service-account private key (quoted) |
| `ROLE_ID_BOARD_OF_DIRECTORS` | ✅ | Board role in staff guild |
| `ROLE_ID_MANAGEMENT_TEAM` | ✅ | Management role in staff guild |
| `FLIGHT_ANNOUNCE_CHANNEL_ID` | ✅ | Flight announcement channel |
| `FLIGHT_BRIEFING_CHANNEL_ID` | ✅ | Flight briefing channel |
| `FLIGHT_LOG_CHANNEL_ID` | ✅ | Flight log channel |
| `FLIGHT_PING_ROLE_ID_1` | ✅ | Ping role 1 (flight announcements) |
| `FLIGHT_PING_ROLE_ID_2` | ✅ | Ping role 2 (flight announcements) |
| `FLIGHT_BOOKING_STAFF_CHANNEL_ID` | ✅ | Staff booking channel |
| `ROLE_ID_MILEAGE_SUPPORT` | ✅ | Mileage support role |
| `ROLE_ID_ANNOUNCE` | ✅ | Announce role |
| `BOT_OWNER_ID` | ✅ | Bot owner Discord user ID |
| `ERROR_LOG_CHANNEL_ID` | ✅ | Error log channel |

Optional (feature-gated):

| Variable | Purpose |
|----------|---------|
| `CUSTOM_BOT_MASTER_KEY` | 64-char hex key for `/custombot` AES-256-GCM token storage |
| `ROLE_ID_FREQUENT_TRAVELLER` | Frequent Traveller tier role (role sync) |
| `ROLE_ID_SENATOR` | Senator tier role (role sync) |
| `ROLE_ID_HON_CIRCLE` | HON Circle tier role (role sync) |
| `ROLE_ID_FLIGHT_OPS_COMMANDS` | Flight-ops command role (overrides staff-only) |
| `ROLE_ID_TICKET_VIEW` | Ticket-view role (comma-separated allowed) |
| `NODE_ENV` | `production` (default) suppresses verbose logging |
| `TIMER_POLL_INTERVAL_SECONDS` | Timer poll cadence (default 30) |
| `DISCORD_INVITE_URL` | Shown in `/help` |
| `PORT` / `BOOKING_API_PORT` | Web dev port (default 3001) |

> **Never commit `.env`.** It is git-ignored.

---

## 3. Install & run

```bash
npm install

# create your .env (see above), then:
npm start          # node src/index.js
```

For local development with auto-restart:

```bash
npm run dev
```

For production under PM2:

```bash
npm run pm2:start   # pm2 start src/index.js --name vietjet-ptfs-bot
npm run pm2:save
```

---

## 4. Firestore setup

1. Create a Cloud Firestore database in your Firebase project.
2. Generate a **service account** key and use its `client_email` + `private_key`.
3. Deploy the security rules (server-only bot — client writes are denied):

```bash
firebase deploy --only firestore:rules
```

The shipped `firestore.rules` denies all client access; the bot's admin SDK bypasses these rules. This is intentional — keep deny-all client rules to protect balances.

> **No composite indexes are required** for the core workflows. Some history queries use a fallback in-memory sort (see `src/services/ledger.js`) if an index is missing.

---

## 5. First-time setup

1. **Register slash commands.** On first startup the bot auto-registers its 31 commands via the Discord REST API.
2. **Run `/setup`** in the main guild to configure branding, earning rules, tier thresholds, channels and permissions through the wizard.
3. **Create a route** (`/routes set`) so flights can compute distances; otherwise the bot falls back to a default of 800 km.
4. **Seed the catalogue** — rewards are added via `/rewards add`; daily/achievements self-seed on startup.

---

## 6. Architecture notes

- **Ledger-authoritative balances**: Every Award Miles / Points / Credits change goes through `src/services/ledger.js` (`applyLedgerEntry`) inside a Firestore transaction, with a deterministic idempotency key. Exactly-once is guaranteed even under concurrent/retried requests.
- **Legacy mirror**: The `members` collection mirrors the authoritative balance for backward compatibility. The `scripts/reconcile-balances.js` tool detects any drift between the two and can reconcile.
- **Custom bot tokens**: Stored AES-256-GCM encrypted (requires `CUSTOM_BOT_MASTER_KEY`); never stored or logged in plaintext.
- **Cross-guild permissions**: Staff roles resolve against the Staff guild; flight-ops overrides resolve against Main.

---

## 7. Testing

```bash
npm test          # 112 tests, ledger + workflow coverage
npm run lint      # static check, 0 errors
node scripts/audit-registry.mjs   # command registry verification
```

---

## 8. Troubleshooting

- **`Missing required environment variables` on boot** — your `.env` is incomplete or missing; see §2.
- **Slash commands not appearing** — wait for the ready event, then re-invite the bot or re-register via `/setup`.
- **Flight distance showing a default** — add the route with `/routes set`.
- **Custom bot setup rejects the token** — set `CUSTOM_BOT_MASTER_KEY` (64-char hex) in `.env` and restart.