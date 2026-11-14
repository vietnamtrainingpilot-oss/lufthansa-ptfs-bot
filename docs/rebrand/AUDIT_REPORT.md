# Audit Report — Lufthansa Miles & More

**Date:** 2026-11-14
**Scope:** Independent forensic audit of the ledger-authoritative loyalty bot.

## 1. Ledger-authoritative verification

Every operation that changes Award Miles, Points, Qualifying Points, HON Circle Points, inventory or redemption status was traced from its Discord handler to its service and database writes.

**All balance mutations now route through `src/services/ledger.js` `applyLedgerEntry`:**

| Entry point | Handler | Service | Ledger write | Verified |
|---|---|---|---|---|
| `/signup` | `signup.js` | `members.js` + `ledger.js` | `ensureAccount` | ✅ |
| `/claim` | `claim.js` | `mileageSystem.claimFlight` | `applyLedgerEntry` FLIGHT_EARN | ✅ |
| `/flight add` | `flight.js` | `mileageSystem.addPassengerManually` | `applyLedgerEntry` FLIGHT_EARN | ✅ |
| `/flight remove` | `flight.js` | `mileageSystem.removePassenger` | `applyLedgerEntry` REVERSAL | ✅ |
| `/flight void` | `flight.js` | `mileageSystem.voidFlight` | `applyLedgerEntry` REVERSAL | ✅ |
| `/daily` | `daily.js` | `dailyRewards.claimDaily` | `applyLedgerEntry` MISSION_EARN | ✅ |
| `/achievement` | `achievements.js` | `achievements.unlockAchievement` | `applyLedgerEntry` MISSION_EARN | ✅ |
| `/adjust` | `adjust.js` | `ledger.applyLedgerEntry` | `applyLedgerEntry` STAFF_AWARD/DEDUCT | ✅ |
| `/redeem` | `redeem.js` | `redemptions.redeem` | `applyLedgerEntry` REDEMPTION | ✅ |
| `/redemptions refund` | `redemptions.js` | `redemptions.refundRedemption` | `applyLedgerEntry` REFUND | ✅ |
| `flightRewards.awardFlightRewards` | (timer/workflow) | `flightRewards.js` | `applyLedgerEntry` FLIGHT_EARN ×2 | ✅ |
| `catalogue.transactItem` | (web/member) | `catalogue.js` | `applyLedgerEntry` | ✅ |

## 2. Remaining direct legacy writes

Four locations still write the legacy `members` collection directly. All are **legacy syncs paired with an authoritative ledger write**, not standalone mutations:

- `mileageSystem.js` claimFlight (line ~126) — sync after ledger
- `mileageSystem.js` addPassengerManually (line ~176) — sync after ledger
- `mileageSystem.js` migrateExistingRewards (line ~375) — migration, now writes matching ledger entry
- `adjust.js` (line ~63) — sync after ledger

No balance mutation bypasses the ledger.

## 3. Security

- **Custom bot tokens**: AES-256-GCM encrypted, no plaintext storage/logging.
- **Permissions**: cross-guild staff authorization, deny-all client Firestore rules.
- **Env safety**: permission helpers resolve role IDs safely when unset.

## 4. Known gaps

- **Web dashboard backend missing** (`src/web/auth.js`, `src/web/server.js`) — `memberRoutes.js` and `dev-web.js` cannot load. BLOCKED.
- **No live verification** — no Discord/Firebase credentials.
- **Dead code**: `mileageSystem.migrateExistingRewards` exported but never called (kept, now ledger-consistent).