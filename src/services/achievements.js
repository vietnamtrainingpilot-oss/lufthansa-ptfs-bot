/**
 * achievements.js — Lufthansa Miles & More achievement system.
 */
import { getDb } from "./firestore.js";
import { DB_COLLECTIONS } from "./members.js";

export const SYSTEM_ACHIEVEMENTS = [
  { id: "first_flight", name: "First Flight", description: "Claim your first flight", category: "Mileage", type: "flight_count", target: 1, rewardMiles: 100, visible: true },
  { id: "veteran_traveler", name: "Veteran Traveler", description: "Claim 10 flights", category: "Mileage", type: "flight_count", target: 10, rewardMiles: 500, visible: true },
  { id: "frequent_flyer", name: "Frequent Flyer", description: "Claim 50 flights", category: "Mileage", type: "flight_count", target: 50, rewardMiles: 2000, visible: true },
  { id: "first_redemption", name: "First Redemption", description: "Redeem your first reward", category: "Mileage", type: "redemption_count", target: 1, rewardMiles: 200, visible: true },
  { id: "mile_mile", name: "Mile Mile", description: "Earn 1,000 Award Miles", category: "Mileage", type: "lifetime_miles", target: 1000, rewardMiles: 300, visible: true },
  { id: "century", name: "Century", description: "Earn 10,000 Award Miles", category: "Mileage", type: "lifetime_miles", target: 10000, rewardMiles: 1000, visible: true },
  { id: "ten_thousand", name: "Ten Thousand Club", description: "Earn 100,000 Award Miles", category: "Mileage", type: "lifetime_miles", target: 100000, rewardMiles: 5000, visible: true },
  { id: "frequent_traveller", name: "Frequent Traveller", description: "Reach Frequent Traveller tier", category: "Members", type: "tier", targetTier: "Frequent Traveller", rewardMiles: 500, visible: true },
  { id: "senator", name: "Senator", description: "Reach Senator tier", category: "Members", type: "tier", targetTier: "Senator", rewardMiles: 2000, visible: true },
  { id: "hon_circle", name: "HON Circle", description: "Reach HON Circle tier", category: "Members", type: "tier", targetTier: "HON Circle", rewardMiles: 5000, visible: true },
];

const ACHIEVEMENTS_COLL = "achievements";
const MEMBER_ACHIV_COLL = "memberAchievements";

export async function seedAchievements() {
  const db = getDb();
  for (const a of SYSTEM_ACHIEVEMENTS) {
    await db.collection(ACHIEVEMENTS_COLL).doc(a.id).set({
      ...a, source: "system", createdAt: new Date(), enabled: true,
    }, { merge: true });
  }
  return true;
}

export async function checkAchievements(userId, account) {
  const db = getDb();
  const result = [];
  const metrics = {
    lifetimeMiles: account?.awards?.awardMiles?.lifetimeEarned || 0,
    totalFlights: account?.membership?.totalFlights || 0,
    tier: account?.membership?.tier || "Frequent Traveller",
  };

  for (const ach of SYSTEM_ACHIEVEMENTS) {
    if (!ach.enabled && ach.source === "custom") continue;
    let unlocked = false;
    switch (ach.type) {
      case "flight_count": unlocked = metrics.totalFlights >= ach.target; break;
      case "lifetime_miles": unlocked = metrics.lifetimeMiles >= ach.target; break;
      case "redemption_count": unlocked = (account?.awards?.awardMiles?.lifetimeSpent || 0) >= ach.target; break;
      case "tier": unlocked = metrics.tier === ach.targetTier; break;
      default: break;
    }
    if (unlocked) result.push(ach);
  }

  // Also check custom achievements
  const customSnap = await db.collection(ACHIEVEMENTS_COLL).where("enabled", "==", true).get();
  for (const doc of customSnap.docs) {
    const ach = doc.data();
    if (ach.source !== "custom") continue;
    let unlocked = false;
    switch (ach.type) {
      case "flight_count": unlocked = metrics.totalFlights >= ach.target; break;
      case "lifetime_miles": unlocked = metrics.lifetimeMiles >= ach.target; break;
      case "redemption_count": unlocked = (account?.awards?.awardMiles?.lifetimeSpent || 0) >= ach.target; break;
      case "daily_streak": unlocked = (account?.membership?.bestDailyStreak || 0) >= ach.target; break;
      default: break;
    }
    if (unlocked) result.push({ ...ach, id: doc.id });
  }

  return result;
}

export async function listAchievements(userId) {
  const db = getDb();
  // Get member's unlocked achievements
  const memberSnap = await db.collection(MEMBER_ACHIV_COLL).where("userId", "==", userId).where("unlocked", "==", true).get();
  const unlockedIds = new Set(memberSnap.docs.map(d => d.id));

  // Get all system + custom achievements
  const allSnap = await db.collection(ACHIEVEMENTS_COLL).get();
  const all = allSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Merge with unlock info
  return all.map(a => ({
    ...a,
    unlocked: unlockedIds.has(a.id),
    unlockedAt: unlockedIds.has(a.id) ? (memberSnap.docs.find(d => d.id === a.id)?.data()?.unlockedAt || null) : null,
  }));
}

export async function evaluateAutomaticAchievements(userId, metrics) {
  const db = getDb();
  const now = new Date();
  const unlocks = [];

  const checks = [
    { id: "first_flight", cond: () => (metrics.qualifyingFlightCount || 0) >= 1 },
    { id: "veteran_traveler", cond: () => (metrics.qualifyingFlightCount || 0) >= 10 },
    { id: "frequent_flyer", cond: () => (metrics.qualifyingFlightCount || 0) >= 50 },
    { id: "mile_mile", cond: () => (metrics.qualifyingPoints || 0) >= 1000 },
    { id: "century", cond: () => (metrics.qualifyingPoints || 0) >= 10000 },
  ];

  for (const check of checks) {
    const snap = await db.collection(MEMBER_ACHIV_COLL).doc(check.id).get();
    if (!snap.exists && check.cond()) {
      await db.collection(MEMBER_ACHIV_COLL).doc(check.id).set({
        userId, achievementId: check.id, unlocked: true, unlockedAt: now,
      });
      unlocks.push(check.id);
    }
  }

  return unlocks;
}

export async function unlockAchievement(userId, achievementId, rewardMiles = 0) {
  const db = getDb();
  const docRef = db.collection(MEMBER_ACHIV_COLL).doc(`${userId}:${achievementId}`);
  const snap = await docRef.get();
  if (snap.exists && snap.data().unlocked) return { unlocked: true, duplicate: true };

  const achSnap = await db.collection(ACHIEVEMENTS_COLL).doc(achievementId).get();
  if (!achSnap.exists) return { unlocked: false, error: "Achievement not found" };

  await docRef.set({
    userId, achievementId, unlocked: true, unlockedAt: new Date(),
    rewardMiles,
  });

  if (rewardMiles > 0) {
    const { applyLedgerEntry, TX_TYPE } = await import("./ledger.js");
    await applyLedgerEntry({
      userId,
      currency: "points",
      amount: rewardMiles,
      type: TX_TYPE.MISSION_EARN,
      reason: `Achievement: ${achievementId}`,
      idempotencyKey: `achieve:${userId}:${achievementId}`,
      referenceType: "achievement",
      referenceId: achievementId,
    });
  }

  return { unlocked: true, duplicate: false };
}

export async function getMemberAchievements(userId) {
  const db = getDb();
  const snap = await db.collection(MEMBER_ACHIV_COLL).where("userId", "==", userId).where("unlocked", "==", true).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function addCustomAchievement({ name, description, type, target, targetTier, rewardMiles, visibility, createdBy }) {
  const db = getDb();
  const achId = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await db.collection(ACHIEVEMENTS_COLL).doc(achId).set({
    id: achId, name, description, type, target, targetTier: targetTier || null,
    rewardMiles: rewardMiles || 0, visible: visibility !== "hidden",
    source: "custom", enabled: true, createdBy, createdAt: new Date(),
  });
  return achId;
}

export async function editAchievement(achievementId, updates) {
  const db = getDb();
  await db.collection(ACHIEVEMENTS_COLL).doc(achievementId).update({ ...updates, updatedAt: new Date() });
}

export async function removeAchievement(achievementId) {
  const db = getDb();
  // Just disable, don't delete - preserve history
  await db.collection(ACHIEVEMENTS_COLL).doc(achievementId).update({ enabled: false });
}

export async function resetAchievements(requireConfirm = false) {
  if (requireConfirm) return { reset: false, message: "Confirmation required" };
  // Archive custom achievements but keep system ones
  const db = getDb();
  const snap = await db.collection(ACHIEVEMENTS_COLL).where("source", "==", "custom").get();
  for (const doc of snap.docs) {
    await doc.ref.update({ enabled: false, archivedAt: new Date() });
  }
  return { reset: true, removed: snap.size };
}

export default {
  SYSTEM_ACHIEVEMENTS, seedAchievements, checkAchievements, listAchievements,
  evaluateAutomaticAchievements, unlockAchievement, getMemberAchievements,
  addCustomAchievement, editAchievement, removeAchievement, resetAchievements,
};
