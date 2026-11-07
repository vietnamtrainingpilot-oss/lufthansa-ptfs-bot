# VietJet PTFS Bot — Windows Setup & PM2 Guide

This guide covers initial setup, PM2 process management, and troubleshooting for the VietJet PTFS Discord bot on Windows.

## Prerequisites

- **Windows 10/11** (64-bit)
- **Node.js 20+** (LTS) — download from https://nodejs.org/
- **Discord account** with permissions to create applications and invite bots
- **Firebase project** set up with Firestore database

## Step 1: Install Dependencies

```powershell
cd D:\Vietjet
npm install
```

This installs all dependencies listed in `package.json`:
- `discord.js` v14.16+ (Components V2 support)
- `firebase-admin` (Firestore SDK)
- `express` (API server)
- `discord-html-transcripts` (ticket transcript generation)
- `dotenv` (env var loading)

## Step 2: Environment Configuration

```powershell
# Copy the example env file
copy .env.example .env

# Edit .env with a text editor (VS Code recommended):
notepad .env
```

**Required `.env` variables** (copy from `README.md` → Environment Setup section):

```
# Core
DISCORD_BOT_TOKEN=        # Your bot's token from Discord Dev Portal
DISCORD_CLIENT_ID=        # Bot's client ID from Discord Dev Portal
NODE_ENV=production
TIMER_POLL_INTERVAL_SECONDS=30

# Guilds
GUILD_ID_MAIN=            # Main Discord server ID
GUILD_ID_STAFF=           # Staff Discord server ID

# Firebase
FIREBASE_PROJECT_ID=      # Your Firebase project ID
FIREBASE_CLIENT_EMAIL=    # Service account client email
FIREBASE_PRIVATE_KEY=     # Service account private key (keep \n line breaks intact)

# Tickets
TICKETS_CATEGORY_ID=      # Category ID for ticket channels
TICKETS_LOG_CHANNEL_ID=   # Channel for transcripts + quota logs
ROLE_ID_BOARD_OF_DIRECTORS=   # BoD role ID (Staff guild)
ROLE_ID_MANAGEMENT_TEAM=    # Management role ID (Staff guild)
STAFF_PING_ROLE_ID=       # Role pinged in ticket starters (not @everyone)
ROLE_IDS_TICKET_VIEW=     # Comma-separated roles that can see tickets

# Careers
CAREER_SETUP_CHANNEL_ID=  # /careersetup channel
CAREER_REVIEW_CHANNEL_ID= # Review + Accept/Deny channel
CAREER_RESULTS_ANNOUNCE_CHANNEL_ID=  # Results announcement channel
SUPPORT_CONTACT_CHANNEL_ID=  # Support contact link

# Flight Ops
FLIGHT_ANNOUNCE_CHANNEL_ID=       # Flight preview posts here
FLIGHT_BRIEFING_CHANNEL_ID=       # Staff briefing + role-claim buttons
FLIGHT_LOG_CHANNEL_ID=            # /logflight output
ROLE_ID_FLIGHT_OPS_COMMANDS=      # /createflight, /logflight, /flightupdate
FLIGHT_PING_ROLE_ID_1=            # Preview ping roles
FLIGHT_PING_ROLE_ID_2=
FLIGHT_BOOKING_STAFF_CHANNEL_ID=  # Completed bookings visibility
BOOKING_WEBSITE_BASE_URL=         # Public website URL
BOOKING_WEBHOOK_SECRET=           # Shared secret for webhook
BOOKING_API_PORT=3001             # Local Express server port

# VietJet Rewards
REWARDS_LOG_CHANNEL_ID=           # Award/deduct audit log
ROLE_ID_REWARDS_LEVEL_1=
ROLE_ID_REWARDS_LEVEL_2=
ROLE_ID_REWARDS_LEVEL_3=

# Paid Ads
ADS_CHANNEL_ID=                   # Where ads appear
ADS_SALES_CONTACT_USER_ID=       # @iamadivineprogamer (reference)
ROLE_ID_VietJet_PARTNER=          # Partner discount eligibility

# Ops
BOT_OWNER_ID=                     # Your Discord user ID
ERROR_LOG_CHANNEL_ID=             # Error log channel
```

## Step 3: Initialize Firebase

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a project (or select existing)
3. Project Settings → Service accounts → "Generate new private key"
3. Save the JSON file — you need 3 values:
   - `project_id` → `FIREBASE_PROJECT_ID`
   - `client_email` → `FIREBASE_CLIENT_EMAIL`
   - `private_key` → `FIREBASE_PRIVATE_KEY` (**important**: this key contains `\n` escape sequences for newlines; keep them intact when pasting into `.env`)

4. Create Firestore database:
   - Start in **test mode** (switch to production mode after initial setup)
   - Create the collection groups listed in `README.md` → Firebase Setup

## Step 4: Start the Bot (PM2)

```powershell
# Start the bot process
pm2 start index.js --name vietjet-ptfs-bot

# Save the PM2 process list so it survives reboots
pm2 save

# Optional: Set up PM2 to auto-start on Windows boot
pm2-startup install
#   (or manually: pm2 startup powershell)
```

### PM2 Survival Notes

- **Sleep/Display-off**: PM2 survives display sleep/reboots as long as the PC is powered and logged in
- **Full shutdown**: PM2 does **not** survive the PC being completely powered off. For that, you'd need a Windows Service or scheduled task.
- **Check status**: `pm2 status`
- **View logs**: `pm2 logs vietjet-ptfs-bot`
- **Restart after crash**: `pm2 restart vietjet-ptfs-bot`
- **Auto-restart on PM2 startup**: `pm2 startup powershell` (registers as a Windows startup task)

## Step 5: Verify the Bot is Running

```powershell
pm2 status
# Should show: vietjet-ptfs-bot online

# Test the /ping command in Discord
# Type /ping in any channel the bot has access to
```

## Step 6: Website (Optional — See separate deployment guide)

If you want the flight-booking website running:

1. Deploy the `website/` folder to Vercel, Netlify, or your preferred static host
2. Set the `API_BASE_URL` environment variable on the host to point to your bot's public address
   - Example: `API_BASE_URL=https://your-bot-domain.com` (if using a public domain)
   - Or use `ngrok` for local tunneling: `ngrok http 3001` then set `API_BASE_URL=http://<ngrok-url>`
3. The website will call the bot's Express API endpoints:
   - `GET /api/flights/active` — for rendering available flights
   - `POST /webhook/booking` — for processing bookings

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Bot crashes on startup | Missing `.env` variables | Copy `.env.example` → `.env` and fill all values |
| `/ping` doesn't respond | Bot not logged in / wrong token | `pm2 restart vietjet-ptfs-bot`; verify token in `.env` |
| Timer not firing after restart | Timer poller not catching up | The poller runs an immediate catch-up on startup — ensure bot is online when timers are due |
| Ticket channel permissions wrong | `ROLE_IDS_TICKET_VIEW` not set correctly | Ensure role IDs are correct and roles exist in the Main guild |
| Website can't fetch flights | `API_BASE_URL` wrong or CORS | Verify `API_BASE_URL` matches bot's public address; ensure Express CORS allows your site's domain |
| `administrator` error on commands | Missing bot permissions | Add bot to both Main and Staff guilds; enable all privileged intents in Dev Portal |
| Rewards level-up not assigning roles | Role IDs not configured | Set `ROLE_ID_REWARDS_LEVEL_1/2/3` in `.env` and ensure roles exist in Main guild |
| Ads ticket not opening | `ADS_CHANNEL_ID` missing or partner role not found | Set `ADS_CHANNEL_ID` and ensure `ROLE_ID_VietJet_PARTNER` role exists |

## Development & Commands

```powershell
# Development mode (auto-restart on file changes)
npm run dev

# Lint check (basic)
npm run lint

# List all PM2 processes
pm2 list

# View live logs
pm2 logs vietjet-ptfs-bot --lines 50

# Delete a process from PM2 tracking (not recommended during active use)
pm2 delete vietjet-ptfs-bot
```

## Directory Overview

```
VietJet/
├── package.json          — npm manifest + scripts
├── .env.example         — Fill these in! (gitignored)
├── .env                — Local overrides (NOT committed)
├── index.js            — Bot entry point (PM2: pm2 start index.js)
├── pm2-startup         — Auto-start task (created by pm2-startup install)
├── README.md           — This documentation
├── tests/              — Test scripts
├── website/            — Flight-booking website (static + API integration)
│   ├── index.html
│   ├── css/main.css
│   └── js/main.js
└── src/                — Bot source code (ES modules)
    ├── commands/       — Slash command definitions
    ├── services/       — Firestore-backed business logic
    ├── interactions/   — Component interaction handlers
    ├── timers/         — Firestore timer system
    └── utils/          — Shared helpers (builders, permissions, logger)
```

## Need Help?

- Discuss setup issues in the VietJet PTFS Discord server
- Check the `pm2 logs vietjet-ptfs-bot` output for error details
- Verify all Discord intents are enabled in the Developer Portal
- Ensure Firestore is in test mode during initial setup (can switch to production after)