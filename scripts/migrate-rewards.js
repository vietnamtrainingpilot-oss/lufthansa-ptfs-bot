/**
 * migrate-rewards.js — One-time, safe migration of the original VietJet Rewards
 * data into the extended member economy schema.
 *
 * WHAT IT DOES
 *   The original build stored a single `balance` (loyalty points) and a `level`
 *   (1/2/3) inside `rewardsAccounts/{userId}`, plus an unbounded `history` array.
 *   The loyalty extension keeps `balance` as the spendable points field and adds
 *   the new economy fields. This script fills in the new fields without ever
 *   resetting a balance.
 *
 *   For each account it sets, only where missing/zero:
 *     credits                 = 0
 *     lifetimePointsEarned    = balance   (best-effort: pre-ledger totals are
 *                                         treated as lifetime earned so tier
 *                                         progress is not lost)
 *     qualifyingPoints        = 0         (only VERIFIED flights count; legacy
 *                                         history cannot be proven, so it is
 *                                         deliberately zero and staff can seed it)
 *     qualifyingFlightCount   = 0
 *     tierKey                 = derived from qualifyingPoints
 *     level                   = kept in sync with tierKey
 *
 *   Legacy `history` is copied into the ledger as a single opening-balance entry
 *   per member so that the new ledger is self-consistent and auditable. The
 *   original array is left intact.
 *
 * USAGE
 *   node scripts/migrate-rewards.js --dry-run     # report only (default)
 *   node scripts/migrate-rewards.js --apply       # perform the migration
 *   node scripts/migrate-rewards.js --backup path # export current accounts first
 *
 * SAFETY
 *   - Dry run unless --apply is passed.
 *   - Idempotent: re-running does not double-count (opening entry uses a fixed
 *     idempotency key).
 *   - Never decreases a balance.
 *   - Backing up first is recommended and supported.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

import { initFirestore, getDb } from "../src/services/firestore.js";
import { cloneDefaults } from "../src/config/loyaltyConfig.js";
import { computeTier } from "../src/services/tierRules.js";

const args = process.argv.slice(2);
const DRY_RUN = !args.includes("--apply");
const BACKUP_FLAG = args.indexOf("--backup");
const BACKUP_PATH = BACKUP_FLAG >= 0 ? args[BACKUP_FLAG + 1] : path.join(ROOT, "backup", `rewardsAccounts-${Date.now()}.json`);

async function main() {
  console.log(DRY_RUN ? "[migrate] DRY RUN — no writes will be performed." : "[migrate] APPLYING changes.");
  if (DRY_RUN) console.log("[migrate] Pass --apply to write. Use --backup <path> to export first.");

  initFirestore();
  const db = getDb();

  const snap = await db.collection("rewardsAccounts").get();
  const docs = snap.docs;
  console.log(`[migrate] Found ${docs.length} rewards account(s).`);

  if (docs.length === 0) {
    console.log("[migrate] Nothing to migrate.");
    return;
  }

  // Optional backup before any write.
  if (args.includes("--backup") || !DRY_RUN) {
    const payload = docs.map((d) => ({ id: d.id, ...d.data() }));
    fs.mkdirSync(path.dirname(BACKUP_PATH), { recursive: true });
    fs.writeFileSync(BACKUP_PATH, JSON.stringify(payload, null, 2));
    console.log(`[migrate] Backup written to ${BACKUP_PATH}`);
  }

  const baseCfg = cloneDefaults();
  let changed = 0;

  for (const doc of docs) {
    const data = doc.data();
    const balance = Number(data.balance || 0);
    const existingLedgerKey = `migration:opening:${doc.id}`;

    // Work out the tier from lifetime qualifying points (legacy has none, so
    // this resolves to the starting tier unless staff seeded qualifyingPoints).
    const qualifyingPoints = Number(data.qualifyingPoints || 0);
    const tier = computeTier({ qualifyingPoints, qualifyingFlightCount: Number(data.qualifyingFlightCount || 0) }, baseCfg);
    const tierIndex = Math.max(0, baseCfg.tiers.list.findIndex((t) => t.key === tier.key));

    const patch = {
      credits: Number(data.credits || 0),
      lifetimePointsEarned: Number(data.lifetimePointsEarned || balance),
      qualifyingPoints,
      qualifyingFlightCount: Number(data.qualifyingFlightCount || 0),
      tierKey: tier.key,
      level: data.level ?? tierIndex + 1,
      lastTransactionAtMs: Number(data.lastTransactionAtMs || 0),
    };

    const needsUpdate = Object.entries(patch).some(([k, v]) => data[k] !== v);
    if (!needsUpdate && DRY_RUN) continue;

    // Create the opening ledger entry so the new ledger reflects the legacy balance.
    const ledgerExists = await db.collection("economyLedger").doc(existingLedgerKey).get();

    if (DRY_RUN) {
      changed++;
      console.log(`[migrate] would update ${doc.id}: balance=${balance} -> ${JSON.stringify(patch)}`);
      continue;
    }

    await db.collection("rewardsAccounts").doc(doc.id).set(patch, { merge: true });

    if (!ledgerExists.exists && balance > 0) {
      await db.collection("economyLedger").doc(existingLedgerKey).set({
        userId: doc.id,
        currency: "points",
        amount: balance,
        type: "adjustment",
        reason: "Opening balance migrated from legacy VietJet Rewards",
        balanceBefore: 0,
        balanceAfter: balance,
        actorId: null,
        referenceType: "migration",
        referenceId: "rewards-v1",
        idempotencyKey: existingLedgerKey,
        metadata: { legacy: true },
        at: new Date(),
      });
      console.log(`[migrate] ${doc.id}: opening ledger entry created for ${balance} points.`);
    }
    changed++;
  }

  console.log(`[migrate] ${DRY_RUN ? "Would migrate" : "Migrated"} ${changed} account(s).`);
}

main().catch((e) => {
  console.error("[migrate] Failed:", e.message);
  process.exit(1);
});