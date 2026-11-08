# Wispbyte Hosting — Unverified Assumptions

**Per rebrand section 4.6:** *"If the site blocks automated fetching, try its sub-pages and search results. If you still cannot read it, say so plainly, do not guess, and put every unverified hosting assumption in `docs/hosting/WISPBYTE_UNVERIFIED.md` for the owner to confirm."*

---

## What We Could Not Verify

The Wispbyte knowledge base (https://wispbyte.com/kb) could not be programmatically accessed. The following are **unverified assumptions** based on public mentions and generic Pterodactyl knowledge. The owner **must confirm each** before deploying.

| Assumption | Source | Verification Needed |
|------------|--------|---------------------|
| Panel is Pterodactyl-based | Public mentions, community Discord | Log into panel → confirm UI |
| Free tier: 512 MB RAM, 1 GB storage, 1 server | Community screenshots (2024) | Check current pricing page |
| Node.js is a supported runtime | Pterodactyl default eggs | Confirm in panel "Nests" |
| Environment variable for port is `PORT` (or `SERVER_PORT`) | Standard Pterodactyl Node egg | Check startup command in panel |
| HTTPS termination at panel edge (reverse proxy) | Pterodactyl standard | Confirm SSL toggle in panel |
| `X-Forwarded-Proto` header passed to container | Pterodactyl default nginx config | Test with `/api/health` logging |
| Custom domains supported on free tier | Pterodactyl feature | Check panel domains tab |
| WebSocket support for Discord gateway | Pterodactyl default | Bot connection test |
| No outbound port restrictions (Discord 443, Firestore 443) | Assumed | Test `npm start` → bot logs in |
| File upload limit > 10 MB (for `discord-html-transcripts`) | Unknown | Test transcript generation |
| Scheduled tasks / cron not available on free tier | Pterodactyl limitation | Confirm in panel |
| Backup/restore UI exists | Pterodactyl feature | Check panel backups tab |

---

## What the Code Expects (Owner to Validate)

1. **`PORT` environment variable**
   - `src/index.js` reads `config.bookingApiPort` → `process.env.BOOKING_API_PORT` (default 3001)
   - If panel uses different name (e.g., `SERVER_PORT`), update `.env` mapping

2. **`trust proxy` enabled**
   - `src/web/server.js` uses `X-Forwarded-Proto` for `isSecure()` → secure cookies, `Strict-Transport-Security`
   - If panel does not pass this header, cookies will not be `Secure` and Discord OAuth will fail

3. **Single process (`npm start`)**
   - Bot + web server in one Node process
   - Memory budget: 512 MB assumed. Peak spikes:
     - `discord-html-transcripts` (large ticket HTML → buffer)
     - Firestore large reads (manifests, ledgers)
   - Code has:
     - Transcript size cap (implicit via `createTranscript` defaults)
     - No unbounded in-memory caches
     - Pagination on all list endpoints (`limit` params)

4. **Discord OAuth redirect URL**
   - Must be `https://<your-wispbyte-domain>/auth/callback`
   - Configure in Discord Developer Portal → new application (old VietJet app **must not be reused**)

5. **Health endpoint**
   - `GET /api/health` returns 200 (added in `src/web/server.js`)

6. **HTTPS required for production**
   - `Secure` cookies + Discord OAuth require HTTPS
   - If panel provides HTTPS at edge, `isSecure()` detects it via `X-Forwarded-Proto: https`
   - If no HTTPS, mark as blocker — do not weaken cookie security

---

## Manual Steps for Owner

1. Log into Wispbyte panel
2. Create server → select Node.js nest/egg
3. Set startup command: `npm start` (or `node src/index.js`)
4. Set environment variables from `.env.example`
5. Confirm `PORT` env var name in panel startup config
6. Enable SSL / custom domain
7. Test:
   - `GET https://<domain>/api/health` → 200
   - `GET https://<domain>/api/site/config` → JSON with `discordInviteUrl`
   - Discord bot `/ping` responds
   - OAuth flow: `/auth/login` → Discord consent → `/auth/callback` → `/dashboard.html` with session
   - Create ticket, career app, flight booking — verify Discord messages arrive
8. If any step fails, document exact error and share with developer

---

**Do not deploy until all assumptions above are confirmed or corrected.**