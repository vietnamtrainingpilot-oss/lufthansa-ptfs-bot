/**
 * tiers.js — Lufthansa Miles & More tier management service.
 *
 * Re-exports pure functions from tierRules.js so callers can import from
 * either module. Also provides Discord role-sync helpers.
 */
import { getDb } from "./firestore.js";
import config from "../config/config.js";
export { computeTier, tierProgress, qualifyingMetricLabel } from "./tierRules.js";

/** Resolve a tier key from raw status points (for the Miles & More path). */
export function resolveTier(statusPoints) {
  if (statusPoints >= 6000) return "HON Circle";
  if (statusPoints >= 2000) return "Senator";
  return "Frequent Traveller";
}

/**
 * Sync a member's Discord role to match their current tier.
 * Reads role IDs from env config; skips silently when not configured.
 */
export async function syncTier(userId, client = null) {
  const db = getDb();
  const doc = await db.collection("members").doc(userId).get();
  if (!doc.exists) return false;
  const data = doc.data();
  const tier = data.membership?.tier || "Frequent Traveller";

  if (!client) return true;

  try {
    const guild = await client.guilds.fetch(config.guildIdMain);
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return true;

    const roleIdMap = {
      "Frequent Traveller": config.tierRoleIds?.frequentTraveler,
      Senator: config.tierRoleIds?.senator,
      "HON Circle": config.tierRoleIds?.honCircle,
    };

    const requiredRoleId = roleIdMap[tier];
    const currentRoles = member.roles.cache.map((r) => r.id);

    // Remove old tier roles
    for (const [t, rid] of Object.entries(roleIdMap)) {
      if (rid && !currentRoles.includes(rid) && currentRoles.includes(rid)) {
        // skip — we handle below
      }
    }

    // Remove ALL legacy tier roles first
    for (const rid of [roleIdMap["Frequent Traveller"], roleIdMap["Senator"], roleIdMap["HON Circle"]]) {
      if (rid && currentRoles.includes(rid) && rid !== requiredRoleId) {
        try { await member.roles.remove(rid); } catch {}
      }
    }

    // Add the correct role
    if (requiredRoleId && !currentRoles.includes(requiredRoleId)) {
      try { await member.roles.add(requiredRoleId); } catch {}
    }

    return true;
  } catch (e) {
    console.error("[tiers] syncTier error:", e.message);
    return false;
  }
}

/** Compute tier display information for embeds. */
export async function getTierDisplay() {
  const db = getDb();
  const snap = await db.collection("config").doc("mileageTiers").get();
  const custom = snap.exists ? snap.data() : {};
  return {
    frequent_traveler: { ...{ statusPoints: 0, label: "Frequent Traveller", minQualifyingPoints: 0 }, ...(custom.frequent_traveler || {}) },
    senator: { ...{ statusPoints: 2000, label: "Senator", minQualifyingPoints: 1000 }, ...(custom.senator || {}) },
    hon_circle: { ...{ statusPoints: 6000, label: "HON Circle", minHonPoints: 6000 }, ...(custom.hon_circle || {}) },
  };
}

/** Check and advance tiers for all members (called by timer poller). */
export async function checkAndAdvanceTiers(client) {
  const db = getDb();
  const snap = await db.collection("members").get();
  let updated = 0;
  for (const doc of snap.docs) {
    const m = doc.data();
    const sp = m.membership?.statusPoints || 0;
    const qp = m.membership?.qualifyingPoints || 0;
    const hp = m.membership?.honPoints || 0;

    // Determine new tier using config thresholds, not hardcoded numbers
    const thresholds = await getTierDisplay();
    const ftThreshold = thresholds.frequent_traveler.statusPoints || 0;
    const senatorThreshold = thresholds.senator.statusPoints || 2000;
    const honCircleThreshold = thresholds.hon_circle.statusPoints || 6000;

    // Senator requires BOTH status points AND qualifying points
    let newTier = "Frequent Traveller";
    if (hp >= honCircleThreshold * 0.5) newTier = "HON Circle"; // fallback: Hon Circle path
    else if (sp >= senatorThreshold && qp >= (thresholds.senator.minQualifyingPoints || 1000)) newTier = "Senator";

    if (newTier !== m.membership?.tier) {
      await db.collection("members").doc(doc.id).update({
        "membership.tier": newTier,
        "membership.tierHistory": [...(m.membership?.tierHistory || []), {
          from: m.membership?.tier,
          to: newTier,
          at: new Date().toISOString(),
          statusPoints: sp,
          qualifyingPoints: qp,
          honPoints: hp,
        }].slice(-20),
      });
      updated++;
      try { await syncTier(doc.id, client); } catch {}
    }
  }
  return updated;
}

/** Get progress toward next tier. */
export function getTierProgress(tier) {
  const thresholds = {
    "Frequent Traveller": { target: 650, nextTier: "Senator" },
    Senator: { target: 2000, nextTier: "HON Circle" },
    "HON Circle": { target: 6000, nextTier: null },
  };
  const t = thresholds[tier] || thresholds["Frequent Traveller"];
  return t;
}

export default {
  resolveTier, syncTier, getTierDisplay, checkAndAdvanceTiers, getTierProgress,
  computeTier: null, // re-exported above
  tierProgress: null, // re-exported above
};