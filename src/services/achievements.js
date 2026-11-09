/**
 * achievements.js — System 11.5: Configurable Achievements.
 *
 * Provides:
 *  - Automatic achievements earned from flight counts, qualifying miles,
 *    streaks, and mission claims.
 *  - Manual staff-granted achievements.
 *  - Hidden/secret achievements.
 *  - Immutable unlock ledger + optional points/credits rewards.
 *  - One-time unlock per achievement per member (transactionally enforced).
 */

import admin from "firebase-admin";
import { getDb } from "./firestore.js";
import { CURRENCY } from "../config/loyaltyConfig.js";
import { TX_TYPE, applyLedgerEntry, readAccount } from "./ledger.js";

const ACHIEVEMENTS = "achievements";
const UNLOCKS = "achievementUnlocks";

export const CATEGORY = {
  FLIGHTS: "flights",
  MILES: "miles",
  STREAKS: "streaks",
  SPECIAL: "special",
  STAFF: "staff",
};

/** Pre-populated default achievements catalog. Staff can edit or add via service. */
export const SYSTEM_ACHIEVEMENTS = [
  {
    id: "first_flight",
    title: "First Wings",
    description: "Complete your first verified flight.",
    category: CATEGORY.FLIGHTS,
    icon: "plane",
    hidden: false,
    condition: { type: "qualifyingFlightCount", threshold: 1 },
    rewardCurrency: CURRENCY.POINTS,
    rewardAmount: 100,
  },
  {
    id: "frequent_flyer_10",
    title: "Frequent Flyer",
    description: "Complete 10 verified flights.",
    category: CATEGORY.FLIGHTS,
    icon: "award",
    hidden: false,
    condition: { type: "qualifyingFlightCount", threshold: 10 },
    rewardCurrency: CURRENCY.POINTS,
    rewardAmount: 500,
  },
  {
    id: "mileage_master_10k",
    title: "10k Mileage Club",
    description: "Earn 10,000 qualifying Miles.",
    category: CATEGORY.MILES,
    icon: "star",
    hidden: false,
    condition: { type: "qualifyingPoints", threshold: 10000 },
    rewardCurrency: CURRENCY.CREDITS,
    rewardAmount: 200,
  },
  {
    id: "streak_3",
    title: "On Fire",
    description: "Maintain a 3-day check-in streak.",
    category: CATEGORY.STREAKS,
    icon: "flame",
    hidden: false,
    condition: { type: "streakDays", threshold: 3 },
    rewardCurrency: CURRENCY.POINTS,
    rewardAmount: 250,
  },
  {
    id: "secret_night_owl",
    title: "Night Owl",
    description: "Complete a flight between 00:00 and 04:00 UTC.",
    category: CATEGORY.SPECIAL,
    icon: "moon",
    hidden: true,
    condition: { type: "nightFlight" },
    rewardCurrency: CURRENCY.CREDITS,
    rewardAmount: 150,
  },
];

function unlockId(achievementId, userId) {
  return `${achievementId}_${userId}`;
}

/** Ensure system default achievements are saved to Firestore on first run. */
export async function seedAchievements() {
  const db = getDb();
  for (const ach of SYSTEM_ACHIEVEMENTS) {
    const ref = db.collection(ACHIEVEMENTS).doc(ach.id);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({
        ...ach,
        enabled: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }
}

export async function upsertAchievement(ach, staffId) {
  const db = getDb();
  const id = ach.id || db.collection(ACHIEVEMENTS).doc().id;
  const doc = {
    id,
    title: String(ach.title || "").slice(0, 100),
    description: String(ach.description || "").slice(0, 300),
    category: ach.category || CATEGORY.SPECIAL,
    icon: ach.icon || "star",
    hidden: !!ach.hidden,
    condition: ach.condition || { type: "manual" },
    rewardCurrency: ach.rewardCurrency === CURRENCY.CREDITS ? CURRENCY.CREDITS : CURRENCY.POINTS,
    rewardAmount: Math.max(0, Math.floor(Number(ach.rewardAmount) || 0)),
    enabled: ach.enabled !== false,
    updatedBy: staffId,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (!doc.title) throw new Error("Title is required");
  await db.collection(ACHIEVEMENTS).doc(id).set(doc, { merge: true });
  return doc;
}

export async function listAchievements({ includeHidden = true, activeOnly = true } = {}) {
  const db = getDb();
  const snap = await db.collection(ACHIEVEMENTS).get();
  let items = snap.docs.map((d) => d.data());
  if (items.length === 0) {
    await seedAchievements();
    items = SYSTEM_ACHIEVEMENTS.map((a) => ({ ...a, enabled: true }));
  }
  if (activeOnly) items = items.filter((a) => a.enabled !== false);
  if (!includeHidden) items = items.map((a) => (a.hidden ? { ...a, description: "??? Secret achievement ???" } : a));
  return items;
}

/**
 * Check and unlock any eligible automatic achievements for a member after an event.
 *
 * @param {string} userId
 * @param {object} context — { qualifyingFlightCount, qualifyingPoints, streakDays, flightTimeUtcHour }
 */
export async function evaluateAutomaticAchievements(userId, context = {}) {
  const achievements = await listAchievements();
  const account = await readAccount(userId);
  const flightCount = context.qualifyingFlightCount ?? account.qualifyingFlightCount ?? 0;
  const points = context.qualifyingPoints ?? account.qualifyingPoints ?? 0;
  const streak = context.streakDays ?? 0;
  const hour = context.flightTimeUtcHour ?? -1;

  const unlockedNow = [];

  for (const ach of achievements) {
    if (!ach.enabled) continue;
    const cond = ach.condition || {};
    let met = false;

    switch (cond.type) {
      case "qualifyingFlightCount":
        met = flightCount >= cond.threshold;
        break;
      case "qualifyingPoints":
        met = points >= cond.threshold;
        break;
      case "streakDays":
        met = streak >= cond.threshold;
        break;
      case "nightFlight":
        met = hour >= 0 && hour <= 4;
        break;
      case "manual":
      default:
        met = false;
    }

    if (met) {
      const res = await unlockAchievement({ userId, achievementId: ach.id, actorId: "system" });
      if (res.unlocked && !res.duplicate) unlockedNow.push(ach);
    }
  }

  return unlockedNow;
}

/**
 * Unlock an achievement for a member. Transactional and idempotent.
 */
export async function unlockAchievement({ userId, achievementId, actorId = "system" }) {
  const db = getDb();
  const achRef = db.collection(ACHIEVEMENTS).doc(achievementId);
  const achSnap = await achRef.get();
  const ach = achSnap.exists ? achSnap.data() : SYSTEM_ACHIEVEMENTS.find((a) => a.id === achievementId);
  if (!ach) throw Object.assign(new Error("Achievement not found"), { code: "NOT_FOUND" });

  const uRef = db.collection(UNLOCKS).doc(unlockId(achievementId, userId));
  const existing = await uRef.get();
  if (existing.exists) {
    return { unlocked: true, duplicate: true, achievement: ach };
  }

  // If there's a reward, apply it via ledger atomically with the unlock doc.
  if (ach.rewardAmount > 0) {
    await applyLedgerEntry({
      userId,
      currency: ach.rewardCurrency,
      amount: ach.rewardAmount,
      type: TX_TYPE.STAFF_AWARD,
      reason: `Achievement: ${ach.title}`,
      idempotencyKey: `ach:${achievementId}:${userId}`,
      actorId,
      referenceType: "achievement",
      referenceId: achievementId,
      extraWrites: async (tx) => {
        tx.create(uRef, {
          userId: String(userId),
          achievementId,
          achievementTitle: ach.title,
          rewardCurrency: ach.rewardCurrency,
          rewardAmount: ach.rewardAmount,
          unlockedAt: admin.firestore.FieldValue.serverTimestamp(),
          unlockedById: actorId,
        });
      },
    });
  } else {
    await uRef.set({
      userId: String(userId),
      achievementId,
      achievementTitle: ach.title,
      rewardCurrency: null,
      rewardAmount: 0,
      unlockedAt: admin.firestore.FieldValue.serverTimestamp(),
      unlockedById: actorId,
    });
  }

  return { unlocked: true, duplicate: false, achievement: ach };
}

/**
 * Read member's full achievement list with unlocked state.
 */
export async function getMemberAchievements(userId) {
  const db = getDb();
  const achievements = await listAchievements();
  const unlocksSnap = await db.collection(UNLOCKS).where("userId", "==", String(userId)).get();
  const unlockedSet = new Set(unlocksSnap.docs.map((d) => d.data().achievementId));

  return achievements.map((a) => {
    const isUnlocked = unlockedSet.has(a.id);
    return {
      id: a.id,
      title: isUnlocked || !a.hidden ? a.title : "???",
      description: isUnlocked || !a.hidden ? a.description : "Secret achievement. Keep flying to discover it.",
      category: a.category,
      icon: a.icon,
      hidden: a.hidden,
      rewardCurrency: a.rewardCurrency,
      rewardAmount: a.rewardAmount,
      unlocked: isUnlocked,
    };
  });
}

export default {
  CATEGORY,
  SYSTEM_ACHIEVEMENTS,
  upsertAchievement,
  listAchievements,
  evaluateAutomaticAchievements,
  unlockAchievement,
  getMemberAchievements,
};