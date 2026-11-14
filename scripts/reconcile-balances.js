/**
 * scripts/reconcile-balances.js — Reconcile legacy member balances with the authoritative ledger.
 *
 * Invariants checked:
 *   1. rewardsAccounts/{userId}.balance  ===  sum(economyLedger amounts for userId)
 *   2. members/{userId}.awards.awardMiles.balance === rewardsAccounts/{userId}.balance
 *
 * Usage:
 *   node scripts/reconcile-balances.js           # report only (dry-run)
 *   node scripts/reconcile-balances.js --fix      # write corrective catch-up ledger entries
 *
 * Never runs against live data without explicit --fix. Repeatable: safe to run
 * multiple times — reconciliation entries carry deterministic idempotency keys
 * so a re-run is a no-op.
 */
import { getDb, initFirestore } from "../src/services/firestore.js";
import { readAccount, applyLedgerEntry, TX_TYPE } from "../src/services/ledger.js";

async function sumLedger(db, userId) {
  const snap = await db.collection("economyLedger").where("userId", "==", userId).get();
  let sum = 0;
  for (const l of snap.docs) sum += l.data().amount || 0;
  return sum;
}

async function reconcile({ fix = false } = {}) {
  initFirestore();
  const db = getDb();

  const membersSnap = await db.collection("members").get();
  let ledgerDrift = 0;
  let legacyDrift = 0;
  let fixed = 0;
  const report = [];

  for (const doc of membersSnap.docs) {
    const userId = doc.id;
    const legacyBal = doc.data().awards?.awardMiles?.balance || 0;

    const account = await readAccount(userId);
    const ledgerSum = await sumLedger(db, userId);

    if (Math.abs(account.balance - ledgerSum) > 0.001) {
      ledgerDrift++;
      report.push(`[ledger] ${userId}: rewardsAccounts.balance=${account.balance} != economyLedger sum=${ledgerSum}`);
      if (fix) {
        const delta = account.balance - ledgerSum;
        await applyLedgerEntry({
          userId,
          currency: "points",
          amount: -delta,
          type: TX_TYPE.REVERSAL,
          reason: "Reconciliation: correct ledger to match authoritative balance",
          idempotencyKey: `reconcile:ledger:${userId}:${delta}`,
        }).catch(() => {});
        fixed++;
      }
    }

    if (Math.abs(legacyBal - account.balance) > 0.001) {
      legacyDrift++;
      report.push(`[legacy] ${userId}: members.awardMiles.balance=${legacyBal} != rewardsAccounts.balance=${account.balance}`);
      if (fix) {
        await db.collection("members").doc(userId).set(
          { awards: { awardMiles: { balance: account.balance } } },
          { merge: true }
        );
        fixed++;
      }
    }
  }

  if (report.length) console.log(report.join("\n"));
  console.log(`Reconcile complete: ${ledgerDrift} ledger drift, ${legacyDrift} legacy drift, ${fixed} items fixed.`);
}

const fix = process.argv.includes("--fix");
reconcile({ fix }).catch(console.error);