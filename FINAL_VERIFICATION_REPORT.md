# Final Verification Report — Lufthansa Miles & More

**Date:** 2026-11-14
**Scope:** Independent verification of the ledger-authoritative loyalty bot, comparing the previous audit findings against the current implementation.

---

## 1. Test results

| Metric | Result |
|---|---|
| Total tests | 112 |
| Passing | 112 |
| Failing | 0 |
| Skipped | 0 |
| Duration | ~11.9s |
| Lint | 0 errors (104 files) |
| Command registry | 31 commands, 0 broken, 0 duplicate names |

Tests added this round:
- `tests/commands.test.js` (3 tests) — restored with meaningful structural checks (exports, name↔filename dispatch key, subcommand reachability).
- `tests/ledgerConsistency.test.js` (4 tests) — concurrent exactly-once, overdraw rejection, duplicate-refund prevention, duplicate-fulfil prevention.

---

## 2. Comparison with previous audit findings

### 2.1 Ledger-authoritative architecture

**Previous finding:** Redemptions, daily rewards and achievement rewards wrote balances directly to the legacy `members` collection, bypassing the authoritative ledger — allowing balance drift.

**Current state:** All balance-changing operations now route through `src/services/ledger.js` `applyLedgerEntry`:

| Operation | Ledger-routed | Legacy sync | Verified by |
|---|---|---|---|
| Flight claim (`/claim`) | ✅ | ✅ | `tests/awardFlow.test.js` |
| Manual flight add | ✅ | ✅ | code trace |
| Flight void reversal | ✅ | ✅ | code trace |
| Passenger removal | ✅ | ✅ | code trace |
| Daily reward (`/daily`) | ✅ | ✅ | `tests/ledgerConsistency.test.js` |
| Achievement reward | ✅ | n/a | `tests/achievements.test.js` |
| Staff adjust (`/adjust`) | ✅ | ✅ | code trace |
| Reward redeem (`/redeem`) | ✅ | n/a (ledger account) | `tests/ledgerConsistency.test.js` |
| Refund (`/redemptions refund`) | ✅ | n/a | `tests/ledgerConsistency.test.js` |

**Key fixes this round:**
- `redeem()` now uses a **deterministic idempotency key** (`redeem:${userId}:${rewardId}`) instead of `Date.now()`, so the exactly-once guard survives retries. Stock handling moved inside the ledger transaction via `extraWrites` (atomic), closing the concurrent-last-stock race.
- `redeem()` command now checks the **authoritative** ledger balance (`readAccount`) instead of the legacy mirror, eliminating a double-source-of-truth.
- `voidFlight()` and `removePassenger()` now write an authoritative `economyLedger` reversal via `applyLedgerEntry` (previously only the legacy `members`/`mileageLedger` were touched).
- `migrateExistingRewards()` now writes a matching authoritative ledger entry, so migration is reconcilable.

### 2.2 Transaction integrity

Tested: concurrent identical claims (exactly-once), overdraw rejection (no ledger entry left), duplicate refund prevention (status guard + single refund entry), duplicate fulfilment prevention (status guard).

| Scenario | Outcome |
|---|---|
| Duplicate/concurrent identical claims | Exactly 1 applies, rest deduped/rejected, balance credited once |
| Insufficient balance | Rejected, no ledger entry, balance unchanged |
| Duplicate refund | Rejected (status already refunded), single refund ledger entry |
| Duplicate fulfil | Rejected (status already fulfilled) |
| Concurrent redemptions | Atomic via in-transaction stock counter (0 overdraw) |

### 2.3 Previously incomplete commands

| Command | Status |
|---|---|
| `/ads purchase` | ✅ Now guards `sub !== "purchase"` and completes the purchase→ticket flow |
| `/adjust add` / `/adjust remove` | ✅ Now guards unknown subcommands and routes both through the ledger |
| `/redeem` | ✅ Authoritative balance check + atomic ledger debit |
| `/daily` | ✅ Ledger-routed, idempotent per day |
| `/redemptions pending/fulfil/refund` | ✅ fulfil/refund now enforce status transitions |
| All 31 commands | ✅ Registry audit: 0 broken paths |

### 2.4 Migration script

`scripts/reconcile-balances.js` rewritten to check two invariants:
1. `rewardsAccounts/{id}.balance === sum(economyLedger amounts)`
2. `members/{id}.awards.awardMiles.balance === rewardsAccounts/{id}.balance`

Runs in **dry-run by default**; `--fix` writes corrective, deterministic-idempotency-keyed entries (repeatable, no-op on re-run). No live run performed (no credentials) — **BLOCKED for live execution**.

### 2.5 Custom Bot encryption

`src/services/customBot.js` now uses **AES-256-GCM**:
- Token encrypted at rest with a per-storage random 12-byte IV; auth tag stored.
- Master key from `CUSTOM_BOT_MASTER_KEY` (64-char hex), enforced.
- Token deletable (`removeCustomBot` nulls the ciphertext).
- `getBotToken()` decrypts server-side only for operating the bot.
- `/custombot setup` now requires the master key and does not reveal token characters.
- Invalid ciphertext / wrong key → controlled error, no token leakage.

### 2.6 Permissions and data isolation

- Cross-guild staff authorization preserved (`isStaffAuthorized` resolves against Staff guild).
- `isFlightOpsAuthorized` / `canViewTicket` now resolve role IDs from env safely (no crash on unset vars).
- Firestore rules remain **deny-all for clients** (server-only admin SDK) — not weakened.

### 2.7 Dashboard / website

**BLOCKED / INCOMPLETE:** `src/web/memberRoutes.js` imports `./auth.js`, and `scripts/dev-web.js` imports `src/web/server.js` — **neither file exists**. The web dashboard backend is not runnable. This is a pre-existing gap (not introduced by this work). Building a full OAuth server is out of scope for this pass; documented as a blocker rather than falsely marked complete.

---

## 3. Resolved issues (this round)

| Issue | Resolution |
|---|---|
| `redeem()` non-idempotent key (`Date.now()`) | Deterministic `redeem:user:reward` key |
| Redemption stock race | In-transaction `extraWrites` stock counter |
| `/redeem` stale legacy balance check | Use authoritative `readAccount` |
| `voidFlight` / `removePassenger` no authoritative reversal | Now write `economyLedger` reversal |
| `migrateExistingRewards` no ledger entry | Now writes matching ledger entry |
| `/ads purchase` unguarded subcommand | Explicit `sub !== "purchase"` guard |
| `/adjust` unknown-subcommand silent-else bug | Explicit add/remove guard + reject unknown |
| `/custombot` plaintext/hash-only token | AES-256-GCM encryption, no token char exposure |
| `tests/commands.test.js` removed | Restored with meaningful structural checks |

## 4. Unresolved issues

| Issue | Severity | Notes |
|---|---|---|
| Web dashboard backend missing (`auth.js`, `server.js`) | High | `src/web` not runnable; out of scope this pass |
| Live Firestore/Discord verification | High | No credentials; cannot claim LIVE VERIFIED |
| Live `reconcile-balances.js` run | Medium | Dry-run only; needs credentials |
| `migrateExistingRewards` is dead code (exported, never called) | Low | Kept for compatibility, now ledger-consistent |

## 5. External dependencies

- `discord.js` ^14.16.0
- `firebase-admin` ^12.0.0
- `express` ^4.19.0
- `dotenv` ^16.4.0
- `discord-html-transcripts` ^3.1.3
- `body-parser` ^1.20.0

---

## 6. Final verdict

**FUNCTIONALLY COMPLETE — PARTIALLY VERIFIED.**

Core loyalty workflows (signup, flight claims, daily, achievements, adjustments, redemptions, tiers, alliances, events, branding, custom bot) have working implementations with integration test evidence (112 tests). The ledger-authoritative architecture is now consistent: every balance mutation traces to `applyLedgerEntry`.

Not **PRODUCTION READY** because:
1. No live runtime verification (no Discord/Firebase credentials).
2. The web dashboard backend is incomplete (`src/web` cannot load).
3. Live migration reconcile not executed.

Deployment is fully documented in `DEPLOYMENT_GUIDE.md`. Once `.env` is populated and the web backend is completed, re-verify live.