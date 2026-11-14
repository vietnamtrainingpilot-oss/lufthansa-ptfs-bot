# Lufthansa PTFS Discord Bot

A ledger-authoritative loyalty bot for a PTFS (Roblox) virtual airline Discord server. Members sign up, claim flights, earn Award Miles, unlock achievements, redeem rewards and progress through status tiers. Every balance change is an exactly-once, auditable ledger transaction.

---

## Commands

**Member commands**

| Command | Purpose |
|---|---|
| `/signup` | Register for Miles & More |
| `/claim <code>` | Claim Award Miles with a flight code |
| `/miles` | View your balance, tier and progress |
| `/history` | View your transaction history |
| `/daily` | Daily check-in (streaks) |
| `/achievements` | View unlocked achievements |
| `/leaderboard` | View member rankings |
| `/redeem <reward>` | Redeem Award Miles for a reward |
| `/shop` | Browse the rewards catalogue |
| `/privacy delete` | Delete your account data |

**Staff / admin commands**

| Command | Purpose |
|---|---|
| `/flight create / add / remove / close / void / codes / info` | Manage flights and claims |
| `/adjust add / remove` | Adjust Award Miles (audited) |
| `/economy balance / shop / award / deduct / configure` | LH Credits virtual economy |
| `/rewards add / remove / list` | Manage the rewards catalogue |
| `/redemptions pending / fulfil / refund` | Manage reward redemptions |
| `/achievement add / edit / remove / reset / list / seed` | Manage achievements |
| `/tiers view / add / remove / rename / role / threshold / sync` | Manage status tiers |
| `/routes check / list / set / remove` | Manage flight routes |
| `/alliance create / join / leave / info / list / kick / rate / code` | Manage airline alliances |
| `/event start / stop / status` | Manage loyalty events |
| `/branding ...` | Configure branding |
| `/custombot setup / status / remove` | Manage custom bot integrations |
| `/setup` | Guided onboarding wizard |

Legacy aliases (`/createflight`, `/logflight`, `/flightupdate`, `/analytics`, `/ads purchase`) remain registered for backward compatibility.

---

## Architecture

- **Ledger-authoritative balances** — all points/miles/credits mutations go through `src/services/ledger.js` (`applyLedgerEntry`) inside a Firestore transaction with a deterministic idempotency key. Exactly-once is guaranteed under concurrent or retried requests.
- **Legacy mirror** — the `members` collection mirrors the authoritative balance for backward compatibility. `scripts/reconcile-balances.js` detects and repairs any drift.
- **Custom bot tokens** — stored AES-256-GCM encrypted (`CUSTOM_BOT_MASTER_KEY`); never stored or logged in plaintext.
- **Cross-guild permissions** — staff roles resolve against the Staff guild.

---

## Quick start

See **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)** for full setup.

```bash
npm install
cp .env.example .env   # fill in Discord + Firebase credentials
npm start
```

**Tests:** `npm test` (112 passing) · **Lint:** `npm run lint`