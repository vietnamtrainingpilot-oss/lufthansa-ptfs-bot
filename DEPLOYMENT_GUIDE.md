# DEPLOYMENT_GUIDE.md — Lufthansa PTFS Bot

**Complete end-to-end deployment guide from code to production.**
Hosted on **Wispbyte / Pterodactyl** · Data on **Firebase Firestore**

---

## Table of Contents

0. [GitHub Repository Setup (Start Here)](#0-github-repository-setup-start-here)
1. [Prerequisites](#1-prerequisites)
2. [Discord Developer Portal Setup](#2-discord-developer-portal-setup)
3. [Firebase / Firestore Setup (Complete Beginner Guide)](#3-firebase--firestore-setup-complete-beginner-guide)
4. [Repository Setup](#4-repository-setup)
5. [Environment Configuration (.env)](#5-environment-configuration-env)
6. [Local Development & Testing](#6-local-development--testing)
7. [Wispbyte / Pterodactyl Deployment](#7-wispbyte--pterodactyl-deployment)
8. [Post-Deploy Verification](#8-post-deploy-verification)
9. [Bot Commands Reference](#9-bot-commands-reference)
10. [Troubleshooting](#10-troubleshooting)
11. [Maintenance & Updates](#11-maintenance--updates)

---

---

## 0. GitHub Repository Setup (Start Here)

**Is this codebase on GitHub yet?** No — it currently exists only on your local machine. You need to create a GitHub repository and push the code there so that Wispbyte (and you) can access it.

### 0.1 Create a GitHub Account (if you don't have one)
1. Go to https://github.com
2. Click **Sign up** → enter your email, create a password, choose a username
3. Verify your email address

### 0.2 Create a New Repository
1. Log in to GitHub → click the **+** icon (top right) → **New repository**
2. Fill in:
   - **Repository name**: `lufthansa-ptfs-bot` (or any name you like)
   - **Description**: "Lufthansa PTFS Discord Bot — AeroNexus-aligned architecture"
   - **Visibility**: Choose **Private** (recommended, since your code contains server/channel IDs) or **Public**
   - ✅ Check **"Add a README file"** (optional, you can skip this)
   - **Do NOT** initialize with .gitignore or license (we already have these)
3. Click **Create repository**

### 0.3 Push Your Code to GitHub
Open PowerShell or Terminal on your computer:

```bash
# Navigate to your project folder
cd D:\Vietjet

# Check current git status (should show "nothing to commit, working tree clean")
git status

# Add GitHub as the remote origin (replace YOUR_USERNAME and YOUR_REPO_NAME)
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# Verify the remote was added
git remote -v
# Should show:
#   origin  https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git (fetch)
#   origin  https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git (push)

# Push all commits to GitHub
git push -u origin rebrand/lufthansa

# If GitHub asks for authentication:
#   - Use a Personal Access Token (PAT) instead of your password
#   - Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
#   - Click "Generate new token (classic)" → select "repo" scope → Generate
#   - Copy the token and use it as your password when prompted
```

### 0.4 Verify on GitHub
1. Go to `https://github.com/YOUR_USERNAME/YOUR_REPO_NAME`
2. You should see all your files: `src/`, `website/`, `tests/`, `docs/`, etc.
3. The branch should show `rebrand/lufthansa`

### 0.5 (Optional) Merge to Main Branch
If you want `main` to be the default branch:
```bash
# Switch to main
git checkout main

# Merge your rebrand branch
git merge rebrand/lufthansa

# Push to GitHub
git push origin main

# (Optional) Delete the old branch
git branch -d rebrand/lufthansa
git push origin --delete rebrand/lufthansa
```

### 0.6 Clone on Wispbyte (Later)
When deploying to Wispbyte, you'll clone from GitHub:
```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git .
```

---

## 1. Prerequisites

### 1.1 Software (install on your local machine)
| Tool | Version | Install |
|---|---|---|
| Node.js | ≥ 20.0.0 (tested on v26.5.1) | https://nodejs.org/ |
| npm | ≥ 11.0.0 | Bundled with Node.js |
| Git | ≥ 2.50 | https://git-scm.com/ |
| Firebase CLI | Latest | `npm install -g firebase-tools` |
| PM2 (optional, for self-hosting) | Latest | `npm install -g pm2` |

### 1.2 Accounts you need
- **Discord account** with a server where you have Administrator permissions
- **Firebase account** (Google account) at https://console.firebase.google.com
- **Wispbyte / Pterodactyl hosting account** (or any Node.js host)

### 1.3 Discord Server Preparation
Before starting, create the following in your Discord server:
- **2 Guilds**: Main server + Staff server (or use one server for both)
- **Channels**: Create channels for tickets, careers, flights, rewards, ads, support, errors (you'll get their IDs later)
- **Roles**: Create roles for Board of Directors, Management Team, Flight Deck, Cabin Crew, Ground Crew, Flight Operator, Human Resources, Public Relations, and Rewards Level 1/2/3

---

## 2. Discord Developer Portal Setup

### 2.1 Create Application
1. Go to https://discord.com/developers/applications
2. Click **New Application** → name it (e.g., "Lufthansa PTFS")
3. Go to **Bot** tab → click **Add Bot** → confirm
4. Under **Privileged Gateway Intents**, enable:
   - ✅ Server Members Intent
   - ✅ Message Content Intent
5. Copy the **Bot Token** → save as `DISCORD_BOT_TOKEN`

### 2.2 Get Application ID
1. Go to **General Information** tab
2. Copy the **Application ID** → save as `DISCORD_CLIENT_ID`

### 2.3 OAuth2 Setup (for web sign-in)
1. Go to **OAuth2** tab
2. Under **Redirects**, add: `https://your-domain.com/auth/callback`
   - Replace `your-domain.com` with your actual Wispbyte domain
3. Under **Client Secret**, click **Reset Secret** → copy → save as `DISCORD_OAUTH_CLIENT_SECRET`

### 2.4 Invite Bot to Server
1. Go to **OAuth2** → **URL Generator**
2. Select scopes: `bot`, `applications.commands`
3. Select permissions: `Administrator` (or minimum: Send Messages, Manage Channels, Manage Roles, Embed Links, Attach Files, Read Message History, Use Slash Commands, Manage Events)
4. Copy the generated URL → open in browser → select your server → Authorize

### 2.5 Get Discord IDs
Enable **Developer Mode** in Discord (Settings → Advanced → Developer Mode), then right-click any channel/role/user → **Copy ID**.

You'll need IDs for:
- Guild (server) IDs: right-click server name → Copy Server ID
- Channel IDs: right-click each channel → Copy Channel ID
- Role IDs: right-click each role → Copy Role ID
- Your user ID: right-click your profile → Copy User ID

---

## 3. Firebase / Firestore Setup (Complete Beginner Guide)

**What is Firestore?** Firestore is a cloud database (like a big spreadsheet in the cloud). Your bot stores all data there: flight records, passenger manifests, loyalty balances, achievements, tickets, career applications, etc. You don't need to install any database software — it's all managed by Google.

### 3.1 Create a Google Account (if you don't have one)
1. Go to https://accounts.google.com
2. Click **Create account** → **For my personal use** (or "For work or business")
3. Fill in your name, email, password → follow the verification steps
4. You now have a Google account

### 3.2 Create a Firebase Project
1. Go to https://console.firebase.google.com
2. Sign in with your Google account
3. Click **"Add project"** (or **"Create a project"**)
4. **Project name**: Type a name like `lufthansa-ptfs` (or anything you like)
   - Firebase will auto-generate a Project ID (e.g., `lufthansa-ptfs-a1b2c`)
   - You can click "Edit" to change it if you want, but the auto-generated one is fine
5. **Google Analytics**: Toggle OFF (you don't need it) → click **Continue**
6. Click **Create project** → wait for it to finish (takes ~30 seconds)
7. Click **Continue** when it says "Your new project is ready"

### 3.3 Enable Cloud Firestore (The Database)
1. In the Firebase Console, look at the left sidebar
2. Click **Build** → **Firestore Database**
3. Click **Create database**
4. **Security rules**: Select **"Start in production mode"** → click **Next**
   - (Production mode means only authenticated users can read/write. The bot authenticates via the service account, so this is safe.)
5. **Location**: Choose a region close to your users:
   - For US users: `us-central` or `us-east1`
   - For EU users: `europe-west1` or `europe-west3`
   - For Asia: `asia-southeast1`
   - Click **Enable**
6. Wait for Firestore to initialize (takes ~1 minute)
7. You'll see an empty database with a message like "Start collection"

**That's it — your database is ready!** The bot will automatically create collections (flights, rewardsAccounts, etc.) when it first runs. You don't need to create them manually.

### 3.4 Generate Service Account Key (Bot's "Password" to Access Firestore)
The bot needs a "service account key" to authenticate with Firebase. Think of it as the bot's login credentials for the database.

1. In Firebase Console, click the **gear icon** (⚙️) next to "Project Overview" → **Project settings**
2. Go to the **Service accounts** tab
3. Under "Firebase Admin SDK", click **Generate new private key**
4. A dialog will appear → click **Generate key**
5. A JSON file will download to your computer (e.g., `lufthansa-ptfs-firebase-adminsdk-xxxxx.json`)
6. **Open this JSON file** in Notepad or any text editor

You'll see something like this:
```json
{
  "type": "service_account",
  "project_id": "lufthansa-ptfs-a1b2c",
  "private_key_id": "abc123...",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@lufthansa-ptfs-a1b2c.iam.gserviceaccount.com",
  "client_id": "123456789...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token"
}
```

### 3.5 Extract Values for .env
From the JSON file above, copy these three values into your `.env` file:

| JSON Field | .env Variable | Example |
|---|---|---|
| `project_id` | `FIREBASE_PROJECT_ID` | `lufthansa-ptfs-a1b2c` |
| `client_email` | `FIREBASE_CLIENT_EMAIL` | `firebase-adminsdk-xxxxx@lufthansa-ptfs-a1b2c.iam.gserviceaccount.com` |
| `private_key` | `FIREBASE_PRIVATE_KEY` | `"-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg...\n-----END PRIVATE KEY-----\n"` |

**IMPORTANT for `FIREBASE_PRIVATE_KEY`:**
- Copy the **entire** value including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`
- The `\n` in the JSON are **literal backslash-n characters** (two characters: `\` and `n`), NOT actual newlines
- In your `.env` file, wrap the value in **double quotes**: `FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"`
- Do NOT remove the `\n` characters — the bot needs them to parse the key correctly

### 3.6 Deploy Firestore Security Rules (Optional but Recommended)
The repo includes a `firestore.rules` file that restricts database access.

**Option A: Via Firebase CLI (recommended)**
```bash
# Install Firebase CLI (one-time)
npm install -g firebase-tools

# Login to Firebase
firebase login
# This opens a browser — sign in with the same Google account

# Initialize Firebase in your project folder
cd D:\Vietjet
firebase init firestore
# When prompted:
#   - Select your Firebase project
#   - Use existing firestore.rules file (press Enter)
#   - Use existing firestore.indexes.json (press Enter)

# Deploy the rules
firebase deploy --only firestore:rules
# Expected output: "Deploy complete!"

# Deploy indexes (if needed)
firebase deploy --only firestore:indexes
```

**Option B: Via Firebase Console (manual)**
1. Go to Firebase Console → Firestore Database → **Rules** tab
2. Copy the contents of `firestore.rules` from the repo
3. Paste into the rules editor → click **Publish**

### 3.7 What Collections Will Be Created?
When the bot first runs, it will automatically create these Firestore collections:

| Collection | Purpose |
|---|---|
| `flights` | Flight records (number, route, status, etc.) |
| `flightManifests` | Passenger manifests per flight |
| `rewardsAccounts` | Member loyalty balances (points + credits) |
| `economyLedger` | Immutable transaction ledger |
| `rewardAuditLog` | Audit trail for staff actions |
| `missions` | Mission definitions |
| `missionProgress` | Per-member mission progress |
| `catalogueItems` | Redemption catalogue items |
| `redemptions` | Redemption/purchase records |
| `achievements` | Achievement definitions |
| `achievementUnlocks` | Per-member achievement unlocks |
| `memberStreaks` | Daily check-in streaks |
| `partners` | Partner communities |
| `partnerApplications` | Partner applications |
| `automationRules` | Automation workflow rules |
| `automationJobs` | Automation execution jobs |
| `adsOrders` | Ad/promotion orders |
| `tickets` | Support ticket records |
| `careerApplications` | Career application records |
| `config/loyalty` | Loyalty configuration (rates, tiers, branding) |

You don't need to create any of these manually. The bot creates them on first use.

### 3.8 Verify Firestore Connection
After deploying and starting the bot, check the Wispbyte console:
```
[bot] Logged in as YourBot#1234
[bot] Web server and API listening on 0.0.0.0:3001
```

If you see Firestore errors, verify:
- `FIREBASE_PROJECT_ID` matches your Firebase project
- `FIREBASE_CLIENT_EMAIL` matches the service account email
- `FIREBASE_PRIVATE_KEY` has `\n` (literal) not actual newlines
- The service account has "Cloud Datastore User" or "Editor" role in Firebase Console → IAM & Admin

---

## 4. Repository Setup

### 4.1 Clone the Repository
```bash
git clone -b rebrand/lufthansa <your-repo-url>
cd lufthansa-ptfs-bot
```

### 4.2 Install Dependencies
```bash
npm ci
```

### 4.3 Verify Installation
```bash
npm test
# Expected: 160 pass, 0 fail

npm run lint
# Expected: 0 errors
```

---

## 5. Environment Configuration (.env)

### 5.1 Create .env File
```bash
cp .env.example .env
```

### 5.2 Fill All Required Variables
Open `.env` and fill in all 45 required variables. Here's a quick reference:

```env
# --- Core ---
DISCORD_BOT_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_application_id_here
NODE_ENV=production
TIMER_POLL_INTERVAL_SECONDS=30

# --- Guilds ---
GUILD_ID_MAIN=your_main_server_id
GUILD_ID_STAFF=your_staff_server_id  # can be same as main

# --- Firebase ---
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_CLIENT_EMAIL=your_service_account_email
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# --- Tickets ---
TICKETS_CATEGORY_ID=your_tickets_category_id
TICKETS_LOG_CHANNEL_ID=your_tickets_log_channel_id
ROLE_ID_BOARD_OF_DIRECTORS=role_id
ROLE_ID_MANAGEMENT_TEAM=role_id
STAFF_PING_ROLE_ID=role_id
ROLE_IDS_TICKET_VIEW=role_id1,role_id2  # comma-separated, or leave empty
ROLE_IDS_TICKET_BLOCKED=  # comma-separated, or leave empty

# --- Careers ---
CAREER_SETUP_CHANNEL_ID=channel_id
CAREER_REVIEW_CHANNEL_ID=channel_id
CAREER_RESULTS_ANNOUNCE_CHANNEL_ID=channel_id
SUPPORT_CONTACT_CHANNEL_ID=channel_id
ROLE_ID_FLIGHT_DECK=role_id
ROLE_ID_CABIN_CREW=role_id
ROLE_ID_GROUND_CREW=role_id
ROLE_ID_FLIGHT_OPERATOR=role_id
ROLE_ID_HUMAN_RESOURCES=role_id
ROLE_ID_PUBLIC_RELATIONS=role_id

# --- Website / Booking API ---
DISCORD_INVITE_URL=https://discord.gg/your_invite_code
WEBSITE_BASE_URL=https://your-domain.com
WEBSITE_SESSION_SECRET=generate_a_random_32_char_string_here
DISCORD_OAUTH_CLIENT_SECRET=your_discord_oauth_client_secret

# --- Flight Operations ---
FLIGHT_ANNOUNCE_CHANNEL_ID=channel_id
FLIGHT_BRIEFING_CHANNEL_ID=channel_id
FLIGHT_LOG_CHANNEL_ID=channel_id
ROLE_ID_FLIGHT_OPS_COMMANDS=role_id
FLIGHT_PING_ROLE_ID_1=role_id
FLIGHT_PING_ROLE_ID_2=role_id
FLIGHT_BOOKING_STAFF_CHANNEL_ID=channel_id
BOOKING_WEBSITE_BASE_URL=https://your-domain.com
BOOKING_WEBHOOK_SECRET=generate_a_random_secret_here
BOOKING_API_PORT=3001

# --- LH Rewards / LH Credits ---
REWARDS_LOG_CHANNEL_ID=channel_id
ROLE_ID_REWARDS_LEVEL_1=role_id
ROLE_ID_REWARDS_LEVEL_2=role_id
ROLE_ID_REWARDS_LEVEL_3=role_id

# --- Paid Ads ---
ADS_CHANNEL_ID=channel_id
ADS_SALES_CONTACT_USER_ID=your_discord_user_id
ROLE_ID_PARTNER=role_id

# --- Ops ---
BOT_OWNER_ID=your_discord_user_id
ERROR_LOG_CHANNEL_ID=channel_id
```

### 5.3 Generate Secrets
```bash
# For WEBSITE_SESSION_SECRET and BOOKING_WEBHOOK_SECRET:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 5.4 Important Notes
- **`FIREBASE_PRIVATE_KEY`**: Must be wrapped in double quotes in `.env`. The `\n` characters must be literal (not actual newlines). The bot's `dotenv` config will parse them correctly.
- **`ROLE_IDS_TICKET_VIEW`** and **`ROLE_IDS_TICKET_BLOCKED`**: Leave empty if not needed. Comma-separated role IDs.
- **No loyalty/economy env vars needed**: All rates, caps, tier thresholds, multipliers, and branding are stored in Firestore at `config/loyalty` and edited at runtime by staff via `/rewards configure` and `/economy configure`.

---

## 6. Local Development & Testing

### 6.1 Start the Bot (Full)
```bash
# Requires a complete .env file
npm start
# or with auto-reload:
npm run dev
```

### 6.2 Start Website Only (No Discord Bot)
```bash
# For previewing the website without a full .env
node scripts/dev-web.js
# Visit: http://localhost:3001
```

### 6.3 Run Tests
```bash
npm test
# Expected: 160 pass, 0 fail
```

### 6.4 Run Lint
```bash
npm run lint
# Expected: 0 errors
```

### 6.5 Verify Bot Login
When the bot starts successfully, you should see:
```
[bot] Logged in as YourBot#1234
[bot] Loaded 18 slash command(s).
[bot] Slash commands registered
[bot] Web server and API listening on 0.0.0.0:3001
```

### 6.6 Verify Slash Commands
In Discord, type `/` in your server. You should see all commands:
- `/ping`, `/tickets`, `/ticketsetup`, `/careers`, `/careersetup`, `/careeredit`
- `/flight`, `/createflight`, `/flightupdate`, `/logflight`
- `/rewards`, `/economy`, `/ads`
- `/achievements`, `/daily`, `/analytics`

---

## 7. Wispbyte / Pterodactyl Deployment

### 7.1 Create Server
1. Log in to your Wispbyte/Pterodactyl panel
2. Create a new server → select **Node.js** egg
3. Set the **Startup Command** to: `npm start`
4. Set **Port** to `3001` (or whatever `BOOKING_API_PORT` is set to)

### 7.2 Upload Code
**Option A: Git (recommended)**
```bash
# In the server's file manager or via SSH:
git clone -b rebrand/lufthansa <your-repo-url> .
npm ci
```

**Option B: File upload**
- Upload all files except `node_modules/` and `.env`
- Run `npm ci` in the server console

### 7.2.1 Updating Code (After Initial Deploy)
When you push new changes to GitHub, update the server:
```bash
# In the server console or via SSH:
git pull origin rebrand/lufthansa
npm ci
pm2 restart lufthansa-ptfs-bot
```

Or in Wispbyte panel: **File Manager** → **Pull from Git** → **Restart**

### 7.3 Set Environment Variables
In the Wispbyte panel:
1. Go to **Startup** tab
2. Add each env var from your `.env` file as a separate environment variable
3. Or upload `.env` to the server root directory

### 7.4 Deploy Firestore Rules & Indexes (CRITICAL)
**You MUST deploy the Firestore indexes, or the bot will crash on startup** with:
```
[timers] pollTimers error: FAILED_PRECONDITION: The query requires an index.
```

From your local machine:
```bash
# Login to Firebase (one-time)
firebase login

# Deploy rules AND indexes together
firebase deploy --only firestore:rules,firestore:indexes

# Or deploy them separately:
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

**Alternative: Click the link in the console error.** When the bot starts and shows the FAILED_PRECONDITION error, it includes a URL like:
```
https://console.firebase.google.com/v1/r/project/YOUR-PROJECT/firestore/indexes?create_composite=...
```
Click that link → it opens the Firebase Console with a pre-filled index creation form → click **Create** → wait 1-2 minutes for the index to build.

**Verify indexes are deployed:**
1. Go to Firebase Console → Firestore Database → **Indexes** tab
2. You should see composite indexes for: `economyLedger`, `flights`, `rewardsAccounts`, `timers`
3. All should show status **"Enabled"** (not "Building")

### 7.5 Start the Server
1. In Wispbyte panel → **Console** tab
2. Click **Start**
3. Watch the console output for:
   ```
   [bot] Logged in as YourBot#1234
   [bot] Web server and API listening on 0.0.0.0:3001
   ```

### 7.6 Set Up Auto-Restart (PM2)
If your host supports PM2:
```bash
pm2 start src/index.js --name lufthansa-ptfs-bot
pm2 save
pm2 startup
```

### 7.7 Domain & Reverse Proxy
1. Point your domain (e.g., `lufthansa-ptfs.com`) to the Wispbyte server IP
2. Wispbyte's reverse proxy will handle HTTPS termination
3. The bot binds to `0.0.0.0:3001` and trusts the proxy's `X-Forwarded-Proto` header
4. Update `WEBSITE_BASE_URL` and `BOOKING_WEBSITE_BASE_URL` in `.env` to `https://your-domain.com`

### 7.8 Update Discord OAuth2 Redirect
In the Discord Developer Portal → OAuth2 → Redirects:
- Add: `https://your-domain.com/auth/callback`
- Remove any `http://localhost` redirects

---

## 8. Post-Deploy Verification

### 8.1 Health Check
```bash
curl https://your-domain.com/api/health
# Expected: {"ok":true,"service":"lufthansa-ptfs"}
```

### 8.2 Bot Login
Check the Wispbyte console for:
```
[bot] Logged in as YourBot#1234
[bot] Slash commands registered
[bot] Web server and API listening on 0.0.0.0:3001
```

### 8.3 Slash Commands
In Discord, type `/` in your server. Verify all commands appear.

### 8.4 Test Flight Flow
1. Run `/createflight` with valid parameters
2. Verify the flight announce message appears in the announce channel
3. Verify the "Book This Flight" button is on the message
4. Click the button → modal should open
5. Fill in cabin class + seat → submit
6. Verify booking confirmation DM is received
7. Verify staff channel receives the booking notification

### 8.5 Test Rewards Flow
1. Run `/logflight` on a completed flight
2. Verify rewards are awarded to passengers
3. Run `/rewards profile` to check balances
4. Run `/daily` to claim daily reward
5. Verify streak increments

### 8.6 Test Achievements
1. After completing a flight, run `/achievements profile`
2. Verify "First Wings" achievement is unlocked
3. Verify 100 Miles bonus was awarded

### 8.7 Test Analytics
1. Run `/analytics`
2. Verify community statistics display correctly

### 8.8 Verify No Old Brand References
```bash
# From the project root:
grep -ri "vietjet" src/ website/ --include="*.js" --include="*.html" --include="*.css"
# Should only return: migrate-rewards.js (historical comments) and auth legacy cookie names
```

### 8.9 Verify No Emojis
```bash
npm test
# The noEmoji test should pass (160 tests, 0 failures)
```

---

## 9. Bot Commands Reference

### Member Commands
| Command | Description |
|---|---|
| `/ping` | Health check |
| `/flight` | View flight info |
| `/rewards profile` | View your loyalty profile |
| `/rewards history` | View transaction history |
| `/rewards leaderboard` | View leaderboard |
| `/rewards catalogue` | View redemption catalogue |
| `/rewards redeem` | Redeem an item |
| `/rewards missions` | View your missions |
| `/economy balance` | View LH Credits balance |
| `/achievements profile` | View your achievements |
| `/achievements list` | View achievement catalogue |
| `/daily` | Claim daily check-in reward |
| `/analytics` | View community statistics |
| `/ads` | View ad packages |

### Staff Commands
| Command | Description | Permission |
|---|---|---|
| `/ticketsetup` | Post ticket configurator | Management |
| `/tickets` | Ticket management | Staff |
| `/careersetup` | Post career configurator | HR |
| `/careers` | Career management | HR |
| `/careeredit` | Edit career application | HR |
| `/createflight` | Create a new flight | Flight Ops |
| `/flightupdate` | Update flight (delay/cancel) | Flight Ops |
| `/logflight` | Log flight as completed | Flight Ops/Host |
| `/rewards award` | Award points to a member | Staff |
| `/rewards deduct` | Deduct points from a member | Staff |
| `/rewards configure` | Configure loyalty rates | Staff |
| `/economy configure` | Configure economy rates | Staff |
| `/achievements grant` | Grant an achievement | Staff |

---

## 10. Troubleshooting

### Bot Won't Start
| Symptom | Cause | Fix |
|---|---|---|
| `Missing environment variables` | `.env` incomplete | Fill all required vars from `.env.example` |
| `Login failed` | Invalid bot token | Regenerate token in Discord Developer Portal |
| `Firestore not initialized` | Firebase credentials wrong | Verify `FIREBASE_PRIVATE_KEY` has `\n` (not actual newlines) |
| `EADDRINUSE` | Port already in use | Kill the process or change `BOOKING_API_PORT` |

### Slash Commands Not Appearing
- Wait 1-2 minutes after bot starts (Discord caches commands)
- Ensure bot has `applications.commands` scope
- Check console for "Slash commands registered" log
- If you see "Invalid Form Body" errors, pull the latest code: `git pull origin rebrand/lufthansa && npm ci && pm2 restart lufthansa-ptfs-bot`
- Discord requires **required options to come before non-required options** in each command. The latest code fixes this for `createflight` and `rewards mission-manage`.

### Firestore Index Error (FAILED_PRECONDITION)
- The bot needs composite indexes on the `timers` collection
- Click the link in the console error to create the index automatically
- Or run: `firebase deploy --only firestore:indexes`
- Wait 1-2 minutes for the index to build (status changes from "Building" to "Enabled")
- The bot will retry automatically on the next poll cycle

### Booking Modal Not Opening
- Ensure the flight is in `scheduled` or `checkin` status
- Check that the "Book This Flight" button customId starts with `book_flight_`
- Verify the interaction router in `src/interactions/interactions.js` has the booking handler

### Firestore Errors
- `PERMISSION_DENIED`: Check Firestore security rules are deployed
- `NOT_FOUND`: The document doesn't exist — ensure the flight/manifest was created first
- `FAILED_PRECONDITION`: Missing composite index — deploy indexes via `firebase deploy --only firestore:indexes`

### Discord OAuth2 Fails
- Ensure `WEBSITE_BASE_URL` matches the redirect URL in Discord Developer Portal exactly
- Check that `DISCORD_OAUTH_CLIENT_SECRET` is correct
- Verify the redirect URL uses HTTPS in production

---

## 11. Maintenance & Updates

### Updating the Bot
```bash
# Pull latest changes
git pull origin rebrand/lufthansa
npm ci
npm test
npm run lint

# Restart
pm2 restart lufthansa-ptfs-bot
```

### Database Backups
- Firestore has automatic daily backups (configure in Firebase Console → Firestore → Backups)
- For manual export: `gcloud firestore export gs://your-bucket/backups`

### Monitoring
- Check Wispbyte console for errors
- Monitor `/api/health` endpoint (should return 200)
- Check `ERROR_LOG_CHANNEL_ID` Discord channel for runtime errors
- PM2 logs: `pm2 logs lufthansa-ptfs-bot`

### Scaling
- The bot runs as a single Node.js process
- Firestore handles scaling automatically
- For high-traffic communities, consider:
  - Increasing `TIMER_POLL_INTERVAL_SECONDS` (default 30s)
  - Enabling Firestore caching (`CACHE_TTL_MS` in `loyaltyStore.js`)
  - Using PM2 cluster mode (requires sticky sessions for Discord)

---

## Quick Reference

| Item | Value |
|---|---|
| **Entry point** | `src/index.js` |
| **Web server** | `src/web/server.js` (Express, port 3001) |
| **Health check** | `GET /api/health` |
| **Database** | Firestore (`config/loyalty`, `flights`, `flightManifests`, `rewardsAccounts`, `economyLedger`, etc.) |
| **Test command** | `npm test` (160 tests) |
| **Lint command** | `npm run lint` |
| **Start command** | `npm start` |
| **Dev server** | `node scripts/dev-web.js` (website only) |
| **Node version** | ≥ 20.0.0 |
| **Package name** | `lufthansa-ptfs-bot` |

---

*Generated for Lufthansa PTFS Bot — AeroNexus-aligned architecture*
*Last updated: November 2026*
