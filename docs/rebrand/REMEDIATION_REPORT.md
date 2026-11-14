# Remediation Report — Lufthansa Miles & More

**Date:** 2026-11-14

## Resolved defects (this round)

| # | Defect | Severity | Fix | Verified by |
|---|---|---|---|---|
| 1 | `redeem()` used `Date.now()` in the idempotency key, defeating exactly-once under retry | Critical | Deterministic key `redeem:user:reward` | `tests/ledgerConsistency.test.js` |
| 2 | Redemption stock check was non-atomic — two concurrent redemptions could both pass the last-stock check | Critical | Moved stock counter inside the ledger transaction via `extraWrites` | code trace + test |
| 3 | `/redeem` command checked the legacy `members` balance instead of the authoritative ledger balance | High | Switched to `readAccount(userId).balance` | code trace |
| 4 | `voidFlight` and `removePassenger` reversed only the legacy `members` doc + `mileageLedger`, never writing an authoritative `economyLedger` reversal | Critical | Now call `applyLedgerEntry` REVERSAL | code trace |
| 5 | `migrateExistingRewards` wrote a legacy balance without a matching ledger entry (unreconcilable) | Medium | Now writes a matching authoritative ledger entry | code trace |
| 6 | `/adjust` silently treated any unknown subcommand as "remove" (latent bug) | Medium | Explicit `sub !== "add" && sub !== "remove"` guard + reject unknown | `tests/commands.test.js` |
| 7 | `/ads purchase` never branched on its single subcommand | Low | Added `sub !== "purchase"` guard | `tests/commands.test.js` |
| 8 | `/custombot` stored tokens as SHA-256 only — irreversible, so the token could never be retrieved to operate the bot | High | AES-256-GCM encryption + `getBotToken()` | code trace |
| 9 | `/custombot setup` and `/status` could leak token characters | Medium | `maskedToken` is now generic dots; setup requires `CUSTOM_BOT_MASTER_KEY` | code trace |
| 10 | `tests/commands.test.js` was removed (Node 26 ESM issue) | Medium | Restored with meaningful structural checks | `tests/commands.test.js` |
| 11 | `/redeem` did not verify authoritative affordability before the ledger debit | High | Fixed authoritative balance check | code trace |

## Verification state

- **112/112 tests passing**, 0 skipped.
- **0 lint errors** (104 files).
- **31 commands**, 0 broken paths, 0 duplicate names.

## Unresolved / blocked

| Item | Reason |
|---|---|
| Web dashboard backend (`src/web/auth.js`, `src/web/server.js`) missing | Out of scope this pass; `src/web` cannot load |
| Live Discord/Firestore verification | No credentials |
| Live migration reconcile | No credentials |