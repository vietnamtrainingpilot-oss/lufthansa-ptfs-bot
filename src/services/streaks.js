/**
 * streaks.js — System 11.2: Daily Check-in & Streaks.
 *
 * Provides daily rewards + streak tracking.
 * - Claims once per 24-hour UTC window.
 * - Streak increments if claimed on consecutive days; resets if missed.
 * - Milestone bonuses at 3, 7, 14, 30 days.
 */

import admin from "firebase-admin";
import { getDb } from "./firestore.js";
import { CURRENCY } from "../config/loyaltyConfig.js";
import { TX_TYPE, applyLedgerEntry } from "./ledger.js";

const STREAKS = "memberStreaks";

function dateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function yesterdayKey(date = new Date()) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export async function claimDailyReward(userId, now = new Date()) {
  const db = getDb();
  const today = dateKey(now);
  const yesterday = yesterdayKey(now);
  const ref = db.collection(STREAKS).doc(String(userId));

  const snap = await ref.get();
  const current = snap.exists ? snap.data() : { streakDays: 0, lastClaimDate: null };

  if (current.lastClaimDate === today) {
    return { ok: false, reason: "Daily reward already claimed today. Check back tomorrow!" };
  }

  const isConsecutive = current.lastClaimDate === yesterday;
  const newStreak = isConsecutive ? current.streakDays + 1 : 1;

  // Base daily reward: 50 Miles + 10 Credits
  let basePoints = 50;
  let baseCredits = 10;

  // Milestone bonuses
  if (newStreak === 3) { basePoints += 100; baseCredits += 25; }
  else if (newStreak === 7) { basePoints += 250; baseCredits += 50; }
  else if (newStreak === 14) { basePoints += 500; baseCredits += 100; }
  else if (newStreak === 30) { basePoints += 1500; baseCredits += 300; }

  const idempotencyKey = `daily:${userId}:${today}`;

  await applyLedgerEntry({
    userId,
    currency: CURRENCY.POINTS,
    amount: basePoints,
    type: TX_TYPE.STAFF_AWARD,
    reason: `Daily Check-in (Day ${newStreak})`,
    idempotencyKey: `${idempotencyKey}:pts`,
    extraWrites: async (tx) => {
      tx.set(ref, {
        userId: String(userId),
        streakDays: newStreak,
        lastClaimDate: today,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    },
  });

  if (baseCredits > 0) {
    await applyLedgerEntry({
      userId,
      currency: CURRENCY.CREDITS,
      amount: baseCredits,
      type: TX_TYPE.STAFF_AWARD,
      reason: `Daily Check-in Bonus (Day ${newStreak})`,
      idempotencyKey: `${idempotencyKey}:cre`,
    });
  }

  // Trigger automatic achievement evaluation asynchronously
  try {
    const { evaluateAutomaticAchievements } = await import("./achievements.js");
    evaluateAutomaticAchievements(userId, { streakDays: newStreak }).catch(() => {});
  } catch {}

  return {
    ok: true,
    streakDays: newStreak,
    pointsAwarded: basePoints,
    creditsAwarded: baseCredits,
    message: `Claimed! Day ${newStreak} streak. Earned ${basePoints} Miles and ${baseCredits} Credits.`,
  };
}

export async function getStreakStatus(userId, now = new Date()) {
  const db = getDb();
  const snap = await db.collection(STREAKS).doc(String(userId)).get();
  if (!snap.exists) return { streakDays: 0, claimedToday: false };
  const d = snap.data();
  return {
    streakDays: d.streakDays || 0,
    claimedToday: d.lastClaimDate === dateKey(now),
    lastClaimDate: d.lastClaimDate,
  };
}

export default { claimDailyReward, getStreakStatus };
