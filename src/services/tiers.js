/**
 * tiers.js — Status tier service (DB-backed + Discord role sync).
 *
 * Pure tier maths lives in tierRules.js (dependency-free, unit-tested).
 * This module adds the parts that need Firestore and Discord.
 */

import { readAccount } from "./ledger.js";
import { computeTier, tierProgress } from "./tierRules.js";

export { computeTier, tierProgress, qualifyingMetricLabel } from "./tierRules.js";

/**
 * Role map is read from env lazily so this module stays importable in tests.
 */
function roleMap() {
  return {
    rewardsLevel1RoleId: process.env.ROLE_ID_REWARDS_LEVEL_1 || null,
    rewardsLevel2RoleId: process.env.ROLE_ID_REWARDS_LEVEL_2 || null,
    rewardsLevel3RoleId: process.env.ROLE_ID_REWARDS_LEVEL_3 || null,
  };
}

/** Resolve a member's current tier key (used by the flight reward formula). */
export async function resolveTier(userId, loyaltyConfig) {
  const account = await readAccount(userId);
  return computeTier(account, loyaltyConfig).key;
}

/**
 * Persist the member's tier key and legacy numeric level, then best-effort
 * sync Discord tier roles. Idempotent. Missing role configuration must never
 * crash the bot.
 *
 * @param {string} userId
 * @param {object} loyaltyConfig
 * @param {import('discord.js').Client} [client]
 * @param {{guildIdMain?:string}} [options]
 */
export async function syncTier(userId, loyaltyConfig, client = null, options = {}) {
  let tier = null;
  try {
    const account = await readAccount(userId);
    tier = computeTier(account, loyaltyConfig);

    const tiers = loyaltyConfig?.tiers?.list || [];
    const tierIndex = Math.max(0, tiers.findIndex((t) => t.key === tier.key));

    const [{ getDb }, admin] = await Promise.all([
      import("./firestore.js"),
      import("firebase-admin").then((m) => m.default),
    ]);
    await getDb().collection("rewardsAccounts").doc(String(userId)).set(
      {
        tierKey: tier.key,
        level: tierIndex + 1,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    if (!client) return { tier, rolesSynced: false, reason: "no client supplied" };

    const roles = roleMap();
    const desiredRoleId = roles[tier.roleEnvKey];
    if (!desiredRoleId) return { tier, rolesSynced: false, reason: "tier role not configured" };

    const guildId = options.guildIdMain || process.env.GUILD_ID_MAIN;
    if (!guildId) return { tier, rolesSynced: false, reason: "main guild not configured" };

    const guild = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return { tier, rolesSynced: false, reason: "member not found" };

    // Remove every other configured tier role.
    for (const [key, roleId] of Object.entries(roles)) {
      if (!roleId || roleId === desiredRoleId) continue;
      if (member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId).catch(() => {});
      }
    }
    // Add the current tier role if missing.
    if (!member.roles.cache.has(desiredRoleId)) {
      await member.roles.add(desiredRoleId).catch(() => {});
    }
    return { tier, rolesSynced: true };
  } catch (e) {
    console.error("[tiers] syncTier error:", e.message);
    return { tier, rolesSynced: false, reason: e.message };
  }
}

export default { computeTier, tierProgress, resolveTier, syncTier };