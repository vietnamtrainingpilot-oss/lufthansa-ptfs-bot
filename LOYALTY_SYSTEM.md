# Lufthansa PTFS — Loyalty and Economy System

This document covers the loyalty programme and virtual economy added on top of the
existing Discord bot. It is an extension, not a replacement: the original `/rewards`
commands, the `rewardsAccounts` collection and all existing behaviour continue to work.

**No emojis are used anywhere in this system.** All copy is plain text.

---

## 1. The two balances

The system deliberately keeps two separate balances. They are never merged and never
interchangeable.

| | Loyalty points | LH Credits |
|---|---|---|
| Purpose | Loyalty programme recognition | Closed virtual economy |
| Earned from | Verified completed flights, missions, staff awards | Verified flights, staff awards |
| Spent on | Loyalty catalogue | LH Credits shop |
| Purchasable | Never | Never |
| Transferable | No | No |
| Cash value | None | None |
| Convertible to Robux | No | No |

Neither balance is presented as real-world currency. LH Credits are a fictional
community currency with no monetary value.

Display names are configuration, not code. Staff can rename both via
`/rewards configure pointsLabel ...` and `/economy configure creditsLabel ...`
without touching source or environment variables. The default labels are
"LH Rewards" and "LH Credits". The LH Rewards-inspired naming has **not** been
applied — it is off by default (`branding.LH RewardsBrandingApproved = false`) pending
owner approval.

---

## 2. Verified flight rewards (the core feature)

Rewards are never granted for merely booking a seat, for joining the server, or for
being a member. The workflow is:

1. A flight is created with `/createflight`.
2. A passenger books. Website bookings are recorded automatically into the flight
   manifest by the booking webhook (`POST /webhook/booking` or `POST /api/bookings`),
   with `presenceStatus = unmarked`.
3. Staff mark each passenger present, no-show or removed using
   `/flight manifest presence ...`.
4. Staff confirm the manifest with `/flight manifest finalize`.
5. Staff run `/logflight` to mark the flight completed, then
   `/flight rewards-preview` to review exactly who would be rewarded and how much.
6. Staff run `/flight rewards-finalize` to apply the awards.
7. The system writes a ledger entry per currency per passenger, updates lifetime and
   qualifying metrics, advances missions, syncs status-tier roles, DMs each passenger a
   plain-language explanation, and posts a summary to the flight log channel.

### Eligibility rules

A passenger is rewarded only when **all** of these hold:

- the flight has a valid record and status `completed`
- the completion action was performed by an authorised staff member
- the passenger appears on the flight manifest
- `bookingStatus === "confirmed"`
- `presenceStatus === "present"`
- `eligible !== false`
- the entry is not a test/demo/placeholder booking
- the cabin class is in the configured eligible list

No-shows, cancelled flights, unmarked presence, removed passengers, cancelled bookings,
test bookings and staff-excluded entries earn nothing.

A delayed flight still earns once it is eventually completed.

### Exactly-once guarantees

A passenger can never earn twice for the same flight. Three independent guards:

1. **Idempotency key per (flight, user, currency)** — `flight:{flightId}:{userId}:points`.
   The ledger document ID *is* this key, so a retried webhook, a re-run command or a
   bot restart cannot double-award.
2. **Manifest-level `rewardsApplied` flag** — a second guard set transactionally.
3. **Ledger uniqueness** — the Firestore transaction aborts if the key already exists.

### Corrections

Staff never silently erase history. `/flight rewards-reconcile` writes **compensating**
(negative) ledger entries plus an audit record. The original transaction is retained.

### Missing flight data

If neither route distance nor flight duration is available, the award is **skipped**
and the passenger is reported as needing a staff correction. Distance is never
invented. Staff should set `routeDistanceKm` on the flight record, or the duration
fallback applies.

---

## 3. Reward formula

All rates live in Firestore at `config/loyalty` and are editable by staff. The values
below are **starting placeholders**.

### Loyalty points

```
basis = routeDistanceKm (preferred)
      | flightTimeMinutes (fallback, when distance is unavailable)

basePoints = distance ? round(pointsPer100km * km / 100)
                      : round(pointsPerMinuteFallback * minutes * fallbackFlatMultiplier)

basePoints = clamp(basePoints, minPointsPerFlight, maxPointsPerFlight)

points = round(basePoints * classMultiplier[cabin]) + min(tierBonus[tier], maxTierBonusPerFlight)
points = clamp(points, minPointsPerFlight, maxPointsPerFlight)
points = min(points, hardCapPointsPerFlight)
```

### LH Credits

```
hours     = flightTimeMinutes / 60
credits   = round(hours * creditsPerHour * creditsMultiplier[cabin])
credits   = clamp(credits, minCreditsPerFlight, maxCreditsPerFlight)
credits   = min(credits, hardCapCreditsPerFlight)
```

### Initial rates (all configurable)

| Setting | Default | Notes |
|---|---|---|
| `formula.pointsPer100km` | 10 | base points per 100 km |
| `formula.pointsPerMinuteFallback` | 1.5 | used when distance is unknown |
| `formula.fallbackKmPerMinute` | 6 | synthesises a distance for display only |
| `formula.minPointsPerFlight` | 25 | floor |
| `formula.maxPointsPerFlight` | 1500 | cap |
| `formula.hardCapPointsPerFlight` | 15000 | absolute ceiling; cannot be exceeded |
| `formula.classMultipliers.economy` | 1.0 | |
| `formula.classMultipliers.premium` | 1.25 | |
| `formula.classMultipliers.business` | 1.5 | |
| `formula.tierBonus.explorer` | 0 | |
| `formula.tierBonus.adventurer` | 25 | |
| `formula.tierBonus.elite` | 75 | |
| `formula.maxTierBonusPerFlight` | 75 | caps any tier bonus |
| `creditsFormula.creditsPerHour` | 20 | |
| `creditsFormula.creditsMultiplier.economy` | 1.0 | separate from points |
| `creditsFormula.creditsMultiplier.premium` | 1.15 | |
| `creditsFormula.creditsMultiplier.business` | 1.35 | |
| `creditsFormula.minCreditsPerFlight` | 10 | |
| `creditsFormula.maxCreditsPerFlight` | 400 | |
| `creditsFormula.hardCapCreditsPerFlight` | 2000 | |

The class multiplier applies to **loyalty points** by default; credits use their own
multiplier, as specified.

Configuration is validated before it is stored: non-negative rates, whole-number
caps, `min <= max`, `max <= hardCap`, tier bonuses within the cap, tier list ordered
and starting at 0. Every change writes an audit record with actor, timestamp, old
value, new value and reason.

---

## 4. Status tiers

| Tier | Threshold (lifetime qualifying points) |
|---|---|
| Explorer | 0 (automatic) |
| Adventurer | 3,000 |
| Elite | 10,000 |

**Qualifying metric:** `lifetimeQualifyingPoints` by default. This counts only points
from **verified eligible flights**. Spending points does **not** reduce qualifying
points, so status can never be lost by redeeming. The metric is switchable to
`qualifyingFlightCount` in configuration if the owner prefers.

Tier names and thresholds are configurable. Discord tier roles are assigned
idempotently and stale tier roles are removed when a member changes tier. Missing role
configuration logs a message and is never fatal.

Members always keep both `lifetimePointsEarned` (all sources) and
`qualifyingPoints` (verified flights only) separately.

---

## 5. Missions

Missions are optional, staff-configured objectives. Progress advances **only** from
verified flight events — never from a button press or user-submitted text. Claims are
one-time and enforced transactionally.

Objective types supported:

- `flightsInPeriod` — complete N eligible flights within a daily/weekly/monthly window
- `firstTimeRoute` — fly a configured route for the first time
- `flightsInClass` — complete N flights in a given cabin class
- `flightsToDestinations` — complete flights to a set of destinations
- `staffConfirmedEvent` — advanced only by explicit staff confirmation

---

## 6. Catalogues and shop

One collection, `catalogueItems`, with an explicit `currency` discriminator
(`points` or `credits`). Each item supports: id, display name, plain-text
description, currency, price, active flag, optional stock, eligibility rules,
fulfilment type, and timestamps/audit metadata.

Fulfilment types:
- `instant` — granted immediately
- `staff_queue` — creates a pending request; the member is told it awaits review.
  The reward is **not** described as delivered until staff confirm.

Purchases are atomic: idempotency check, active check, stock check, eligibility
check, balance check, then balance deduction + stock decrement + purchase record all
in one Firestore transaction. Out-of-stock items cannot be purchased, and double-clicks
or retries cannot duplicate a purchase.

Refunds (`refundRedemption`) create a compensating ledger entry and return stock.
They never delete the original transaction.

No real-world goods, cash-equivalent value, or Robux are sold.

---

## 7. Commands

### Member

| Command | Purpose |
|---|---|
| `/rewards profile [user]` | balances, tier, progress, lifetime metrics, recent activity |
| `/rewards history [user]` | paginated transactions (own full view; others are staff-gated in practice) |
| `/rewards leaderboard [metric]` | top 10 by points / lifetime / flights / credits |
| `/rewards catalogue` | loyalty redemption catalogue |
| `/rewards missions` | missions with progress and claim state |
| `/economy balance [user]` | LH Credits balance |
| `/economy shop` | LH Credits shop |

### Staff

| Command | Purpose |
|---|---|
| `/rewards award / deduct` | points, audited |
| `/economy award / deduct` | credits, audited |
| `/rewards configure` | rates, caps, tiers, branding, multipliers (validated + audited) |
| `/rewards catalogue-manage` | add / enable / disable catalogue items |
| `/rewards mission-manage` | create / enable / disable missions |
| `/economy configure` | credit rates and branding |
| `/flight manifest` | add passenger, set presence, finalize, view |
| `/flight rewards-preview` | who would be rewarded, and for how much |
| `/flight rewards-finalize` | apply the rewards (exactly once) |
| `/flight rewards-reconcile` | audited correction with compensating entries |

All staff actions use the existing cross-guild `isStaffAuthorized` / flight-ops
helpers. No Discord IDs are hardcoded.

---

## 8. Firestore schema

New and extended collections:

```
config/loyalty                        # rates, caps, tiers, branding, eligibility

rewardsAccounts/{discordUserId}       # EXTENDED (existing collection)
  balance          points, spendable            (unchanged meaning)
  credits          LH Credits, spendable        (new)
  lifetimePointsEarned                        (new)
  qualifyingPoints                            (new)
  qualifyingFlightCount                       (new)
  tierKey, level                             (tierKey new; level kept in sync)
  lastTransactionAtMs                         (new)

economyLedger/{idempotencyKey}         # every balance change
  userId, currency, amount, type, reason,
  balanceBefore, balanceAfter, actorId,
  referenceType, referenceId, idempotencyKey,
  lifetimePointsDelta, qualifyingPointsDelta, qualifyingFlightDelta,
  metadata (display-safe only), at

flightManifests/{flightId}             # keyed by existing flight id
  passengers[{ userId, cabinClass, seat, bookingId,
               bookingStatus, presenceStatus, eligible, isTest }]
  finalized, finalizedById, finalizedAt,
  rewardsApplied, rewardsAppliedAt

catalogueItems/{itemId}                # points and credits catalogues
redemptions/{idempotencyKey}           # redemptions + purchases
missions/{missionId}
missionProgress/{missionId}_{userId}
rewardAuditLog/{autoId}                # staff/admin actions
```

### Required Firestore composite indexes

```
Collection: rewardsAccounts
  Fields: balance DESC              (leaderboard: points)          [single field]
  Fields: credits DESC              (leaderboard: credits)          [single field]
  Fields: lifetimePointsEarned DESC  (leaderboard: lifetime points) [single field]
  Fields: qualifyingFlightCount DESC (leaderboard: flights)         [single field]

Collection: flights
  Fields: status ASC, scheduledUnixTime ASC   (active flights for booking site)

Collection: economyLedger
  Fields: userId ASC, at DESC        (member history)

Collection: economyLedger
  Fields: userId ASC, currency ASC, at DESC   (currency-filtered history)

Collection: missionProgress
  Fields: missionId ASC, userId ASC           (idempotent progress doc)
```

The single-field indexes on `rewardsAccounts` and the composite on `economyLedger`
are the ones Firestore will require. Create them in the Firebase console under
Firestore > Indexes, or via `firebase deploy --only firestore:indexes`.

### Migration

The original build had a single `balance` and a `level` field plus a `history` array.
The extension keeps both fields working and adds the new ones alongside.

```powershell
# 1. Dry run (default, no writes)
node scripts/migrate-rewards.js --dry-run --backup backup\rewards-before.json

# 2. Apply
node scripts/migrate-rewards.js --apply
```

The migration is idempotent, never decreases a balance, and writes an opening
`economyLedger` entry per member so the new ledger is self-consistent. The legacy
`history` array is preserved untouched.

Note: legacy `qualifyingPoints` is intentionally seeded to **0**, because pre-ledger
history cannot be proven to come from verified flights. Staff can seed qualifying
points manually if they want to grandfather status.

---

## 9. Security posture

- No secret ever reaches the browser. The booking site calls same-origin endpoints
  (`/api/flights/active`, `/api/bookings`, `/api/loyalty/public`) that the bot serves.
- Every balance mutation is validated server-side. The browser never supplies a price,
  balance, tier, or flight eligibility that is trusted.
- The Express server binds to `127.0.0.1`, so it is not exposed to the network. To
  reach it from a public website, terminate TLS with a reverse proxy (nginx/Caddy) or
  a tunnel (Cloudflare Tunnel, ngrok) rather than opening inbound ports.
- Booking payloads are validated (flight number, Discord snowflake format, cabin class).
- The shared secret is compared with a constant-time comparison.
- Error responses never include stack traces, private Discord data, or database internals.
- Staff-only actions are gated by the cross-guild authorization helpers.

### Deployment note

The bot runs locally on the owner's Windows PC. The public website is deployed
separately (Vercel/Netlify). The secure path between them is a reverse proxy or
tunnel in front of `127.0.0.1:3001`. Do **not** open the port directly to the
internet.

---

## 10. Known limitations and out of scope

- Member authentication on the website is a documented placeholder: private member
  routes are served under the shared API secret, not behind real user login. No login
  flow is invented or claimed.
- Points and credits are non-transferable by design. Transfers are not implemented.
- No gambling, loot boxes, random paid rewards, real-money payments, or Robux
  purchases.
- Missions support a small set of rule-based objectives, not an open quest engine.
- Priority booking windows and cabin upgrades are only offered where the booking
  system can actually enforce them; items requiring staff action use the staff queue.
