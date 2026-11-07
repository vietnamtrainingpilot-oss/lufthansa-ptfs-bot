/**
 * migrate-manifests.js — Backfill the `passengerIds` mirror on flight manifests.
 *
 * WHY
 *   A manifest stores its passengers as an array of objects:
 *     passengers: [{ userId, presenceStatus, cabinClass, ... }, ...]
 *
 *   Firestore cannot match a nested field inside an array of objects with
 *   `array-contains`. The member dashboard needs to find "every manifest I am
 *   on", so the canonical manifest module now maintains a flat, queryable
 *   mirror alongside `passengers`:
 *     passengerIds: ["<discordId>", ...]
 *
 *   The mirror is derived state and is recomputed inside the same transaction
 *   that mutates `passengers`, so it cannot drift going forward. This script
 *   exists purely to populate it for manifests written before the mirror was
 *   introduced.
 *
 * USAGE
 *   node scripts/migrate-manifests.js --dry-run    # report only (default)
 *   node scripts/migrate-manifests.js --apply      # perform the backfill
 *
 * SAFETY
 *   - Dry run unless --apply is passed.
 *   - Idempotent: a manifest whose `passengerIds` already matches its
 *     passengers is skipped, so re-running is harmless.
 *   - Derived field only. Never modifies `passengers`, balances, or the ledger.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { initFirestore, getDb } from "../src/services/firestore.js";

const DRY_RUN = !process.argv.slice(2).includes("--apply");

/**
 * Mirrors the helper in src/services/manifest.js. Kept local so the script
 * has no side-effect import on the live manifest module.
 */
function syncPassengerIds(passengers) {
  const ids = new Set();
  for (const p of passengers) {
    if (p && p.userId) ids.add(String(p.userId));
  }
  return [...ids].sort();
}

function sameIds(a, b) {
  if (!Array.isArray(a) || a.length !== b.length) return false;
  const sortedExisting = [...a].map(String).sort();
  return sortedExisting.every((v, i) => v === b[i]);
}

async function main() {
  console.log(DRY_RUN ? "[migrate] DRY RUN — no writes will be performed." : "[migrate] APPLYING backfill.");
  if (DRY_RUN) console.log("[migrate] Pass --apply to write.");

  initFirestore();
  const db = getDb();

  const snap = await db.collection("flightManifests").get();
  console.log(`[migrate] Found ${snap.docs.length} manifest(s).`);

  if (snap.docs.length === 0) {
    console.log("[migrate] Nothing to migrate.");
    return;
  }

  let changed = 0;
  for (const doc of snap.docs) {
    const passengers = Array.isArray(doc.data().passengers) ? doc.data().passengers : [];
    const expected = syncPassengerIds(passengers);
    const current = doc.data().passengerIds;

    if (sameIds(current, expected)) continue;

    changed++;
    if (DRY_RUN) {
      console.log(`[migrate] would set ${doc.id}: passengerIds=${JSON.stringify(expected)} (current=${JSON.stringify(current ?? null)})`);
      continue;
    }

    await doc.ref.set({ passengerIds: expected }, { merge: true });
    console.log(`[migrate] ${doc.id}: passengerIds set to ${expected.length} id(s).`);
  }

  console.log(`[migrate] ${DRY_RUN ? "Would update" : "Updated"} ${changed} manifest(s).`);
}

main().catch((e) => {
  console.error("[migrate] Failed:", e.message);
  process.exit(1);
});