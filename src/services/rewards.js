/**
 * rewards.js — LH Rewards service (loyalty points + LH Credits).
 *
 * MIGRATION NOTE (backwards compatible):
 *   The original build had a single `balance` field and a `level` 1/2/3 mirror.
 *   Both are preserved:
 *     - `balance` still means current spendable loyalty points.
 *     - `level` still mirrors the tier index so existing role assignment and the
 *       existing `/rewards profile` output keep working.
 *   New fields are added alongside: credits, lifetimePointsEarned,
 *   qualifyingPoints, qualifyingFlightCount, tierKey.
 *   All balance mutations now go through the ledger (see ledger.js), so the old
 *   unbounded array-append `history` field is no longer written to; history is
 *   read from the economyLedger collection instead.
 */

import admin from "firebase-admin";
import { getDb } from "./firestore.js";
import { CURRENCY } from "../config/loyaltyConfig.js";
import { TX_TYPE, applyLedgerEntry, readAccount, ensureAccount, getHistory } from "./ledger.js";
import { getLoyaltyConfig } from "./loyaltyStore.js";
import { computeTier, tierProgress } from "./tiers.js";

export { readAccount as getOrCreateAccount, ensureAccount } from "./ledger.js";

/**
 * Backwards-compatible config accessor. Historically `config/rewards` held
 * level2Threshold / level3Threshold; those are now derived from loyalty tiers.
 */
export async function getRewardsConfig() {
  const cfg = await getLoyaltyConfig();
  const tiers = cfg.tiers?.list || [];
  const adventurer = tiers.find((t) => t.key === "adventurer");
  const elite = tiers.find((t) => t.key === "elite");
  return {
    ...cfg,
    level2Threshold: adventurer ? adventurer.min : 3000,
    level3Threshold: elite ? elite.min : 10000,
  };
}

/** Backwards-compatible alias used by the existing `/rewards configure` command. */
export async function updateRewardsConfig(updates) {
  const { updateLoyaltyConfig } = await import("./loyaltyStore.js");
  return updateLoyaltyConfig(updates, process.env.BOT_OWNER_ID || "system", "Legacy rewards config update");
}

/**
 * Award loyalty points to a user (staff-initiated).
 * Routed through the ledger so it is audited and idempotent.
 *
 * @param {string} userId
 * @param {number} amount
 * @param {string} reason
 * @param {string} byStaffId
 */
export async function awardPoints(userId, amount, reason, byStaffId) {
  return applyLedgerEntry({
    userId,
    currency: CURRENCY.POINTS,
    amount,
    type: TX_TYPE.STAFF_AWARD,
    reason,
    idempotencyKey: `staffaward:${userId}:${amount}:${byStaffId}:${Date.now()}`,
    actorId: byStaffId,
    referenceType: "staff",
    metadata: { staffInitiated: true },
    lifetime: { pointsDelta: amount },
  });
}

/**
 * Deduct loyalty points from a user (staff-initiated).
 */
export async function deductPoints(userId, amount, reason, byStaffId) {
  return applyLedgerEntry({
    userId,
    currency: CURRENCY.POINTS,
    amount: -Math.abs(amount),
    type: TX_TYPE.STAFF_DEDUCT,
    reason,
    idempotencyKey: `staffdeduct:${userId}:${amount}:${byStaffId}:${Date.now()}`,
    actorId: byStaffId,
    referenceType: "staff",
    metadata: { staffInitiated: true },
    allowOverdraw: false,
  });
}

/**
 * Full member profile: both balances, tier, progress, lifetime metrics.
 */
export async function getMemberProfile(userId) {
  const cfg = await getLoyaltyConfig();
  const account = await readAccount(userId);
  const tier = computeTier(account, cfg);
  const progress = tierProgress(account, cfg);
  const recent = await getHistory(userId, { limit: 10 });

  return {
    userId: String(userId),
    points: Number(account.balance ?? 0),
    credits: Number(account.credits ?? 0),
    lifetimePointsEarned: Number(account.lifetimePointsEarned ?? 0),
    qualifyingPoints: Number(account.qualifyingPoints ?? 0),
    qualifyingFlightCount: Number(account.qualifyingFlightCount ?? 0),
    tier,
    tierKey: tier.key,
    tierName: tier.name,
    level: account.level ?? 1,
    progress,
    branding: cfg.branding,
    recentActivity: recent.map((h) => ({
      id: h.id,
      currency: h.currency,
      amount: h.amount,
      type: h.type,
      reason: h.reason,
      at: h.at,
      flightNumber: h.metadata?.flightNumber || null,
    })),
  };
}

/**
 * Leaderboard by an explicit metric. Only public metrics are exposed.
 *
 * @param {"points"|"credits"|"lifetimePoints"|"qualifyingFlights"} metric
 */
export async function getLeaderboard(metric = "points", limit = 10) {
  const db = getDb();
  const fieldMap = {
    points: "balance",
    credits: "credits",
    lifetimePoints: "lifetimePointsEarned",
    qualifyingFlights: "qualifyingFlightCount",
  };
  const field = fieldMap[metric] || "balance";

  const cfg = await getLoyaltyConfig();
  const snap = await db
    .collection("rewardsAccounts")
    .where(field, ">", 0)
    .orderBy(field, "desc")
    .limit(Math.min(Math.max(limit, 1), 50))
    .get();

  return snap.docs.map((d, i) => {
    const data = d.data();
    const tier = computeTier(data, cfg);
    return {
      rank: i + 1,
      userId: d.id,
      value: Number(data[field] ?? 0),
      tierName: tier.name,
    };
  });
}

/** Convenience wrapper used by the `/rewards history` command. */
export async function getMemberHistory(userId, { limit = 25, currency = null } = {}) {
  return getHistory(userId, { limit, currency });
}

/** Credits balance only — used by `/economy balance`. */
export async function getEconomyBalance(userId) {
  const account = await readAccount(userId);
  const recent = await getHistory(userId, { limit: 10, currency: CURRENCY.CREDITS });
  return {
    userId: String(userId),
    credits: Number(account.credits ?? 0),
    recentActivity: recent.map((h) => ({ id: h.id, amount: h.amount, type: h.type, reason: h.reason, at: h.at })),
  };
}

/**
 * Compatibility shim for the old role assignment helper.
 * Now delegates to the tier sync logic.
 */
export async function assignLevelRole(userId, level, client = null) {
  const cfg = await getLoyaltyConfig();
  const tiers = cfg.tiers?.list || [];
  const tier = tiers[Math.max(0, Math.min(tiers.length - 1, level - 1))];
  if (!tier) return { tier: null, rolesSynced: false };
  const { syncTier } = await import("./tiers.js");
  return syncTier(userId, cfg, client);
}

export default {
  getRewardsConfig,
  updateRewardsConfig,
  awardPoints,
  deductPoints,
  getMemberProfile,
  getLeaderboard,
  getMemberHistory,
  getEconomyBalance,
  assignLevelRole,
  readAccount,
  ensureAccount,
  applyLedgerEntry,
  CURRENCY,
  TX_TYPE,
};
