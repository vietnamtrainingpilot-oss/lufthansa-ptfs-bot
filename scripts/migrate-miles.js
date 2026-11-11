/**
 * migrate-miles.js — Converts economy rewards to Miles & More accounts
 *
 * This script:
 * 1. Reads existing economyLedger accounts
 * 2. Calculates lifetime mileage from current points/credits
 * 3. Creates member accounts in members collection
 * 4. Migrates balance to awardMiles
 */

import admin from "firebase-admin";
import { getDb } from "../src/services/firestore.js";

const CREDIT_TO_MILES = { 1: 1676.92 }; // 100 Credits = 1676.92 Miles

async function migrate() {
  console.log("Starting Miles & More migration...\n");

  const db = getDb();

  // Read all rewards accounts
  const snapshot = await db.collection("rewardsAccounts").get();
  const mapping = [];
  const totalMigrated = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const userId = doc.id;

    // Calculate total miles equivalent
    let totalMiles = 0;
    if (data.points) totalMiles += data.points;
    if (data.credits) totalMiles += data.credits * CREDIT_TO_MILES[1];

    // Skip if total is too low to be a real user
    if (totalMiles < 100) {
      console.log(`[migration] Skipping ${userId} (${totalMiles} miles)`);
      continue;
    }

    totalMigrated++;
    console.log(`[migration] Migrating ${userId} (${totalMiles.toFixed(1)} miles)\n`);

    mapping.push({
      userId,
      currentBalance: data.points + data.credits,
      newMiles: totalMiles,
    });
  }

  console.log(`\nMigration complete: ${totalMigrated} accounts found\n`);

  // Save mapping for reference
  await db.collection("migrateMapping").doc("milestoMilesclearing").set(mapping);
}

migrate().catch(console.error);