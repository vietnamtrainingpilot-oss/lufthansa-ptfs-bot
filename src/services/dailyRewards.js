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

  await db.collection("dailyClaims").add({ userId, date: today, streak, milesAwarded: totalMiles, baseMiles: DAILY_MILES, bonusMiles, claimedAt: new Date() });
  await db.collection("members").doc(userId).update({
    "awards.awardMiles.balance": (account.awards?.awardMiles?.balance || 0) + totalMiles,
    "awards.awardMiles.lifetimeEarned": (account.awards?.awardMiles?.lifetimeEarned || 0) + totalMiles,
  });

  await db.collection("mileageLedger").add({
    userId, type: "earning", transactionType: "daily", amount: totalMiles,
    reason: `Daily check-in (streak ${streak})`, appliedAt: new Date(),
  });

  return { streak, baseMiles: DAILY_Miles, bonusMiles, totalMiles };
}

export default { claimDaily };