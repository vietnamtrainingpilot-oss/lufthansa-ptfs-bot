/**
 * dailyRewards.js — Daily check-in with streaks
 */
import { getDb } from "./firestore.js";
import { getMemberAccount } from "./members.js";

const DAILY_MILES = 100;
const STREAK_BONUS = 50;

export async function claimDaily(userId) {
  const db = getDb();
  const account = await getMemberAccount(userId);
  const today = new Date().toISOString().split("T")[0];

  const existing = await db.collection("dailyClaims").where("userId", "==", userId).where("date", "==", today).limit(1).get();
  if (!existing.empty) throw new Error("Already claimed today. Come back tomorrow.");

  let streak = 1;
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const yesterdaySnap = await db.collection("dailyClaims").where("userId", "==", userId).where("date", "==", yesterday).limit(1).get();
  if (!yesterdaySnap.empty) {
    streak = (yesterdaySnap.docs[0].data().streak || 0) + 1;
  }

  const bonusMiles = Math.floor(streak * STREAK_BONUS);
  const totalMiles = DAILY_MILES + bonusMiles;

  const { applyLedgerEntry, TX_TYPE } = await import("./ledger.js");
  
  // Use ledger for the balance update atomically
  await applyLedgerEntry({
    userId,
    currency: "points",
    amount: totalMiles,
    type: TX_TYPE.MISSION_EARN,
    reason: `Daily check-in (streak ${streak})`,
    idempotencyKey: `daily:${userId}:${today}`,
    referenceType: "daily",
    referenceId: today,
  });

  await db.collection("dailyClaims").add({ userId, date: today, streak, milesAwarded: totalMiles, baseMiles: DAILY_MILES, bonusMiles, claimedAt: new Date() });

  return { streak, baseMiles: DAILY_MILES, bonusMiles, totalMiles };
}

export default { claimDaily };