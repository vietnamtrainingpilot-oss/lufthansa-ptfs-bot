/**
 * loyaltyStore.js — Firestore-backed loyalty configuration.
 *
 * Stored at `config/loyalty`. Seeded from DEFAULT_LOYALTY_CONFIG on first read,
 * so the bot works out of the box and staff can then tune every rate.
 */

import admin from "firebase-admin";
import { getDb } from "./firestore.js";
import { cloneDefaults, validateConfigPatch } from "../config/loyaltyConfig.js";

const CONFIG_COLLECTION = "config";
// Doc id only — the collection is applied by db.collection(), so the full
// document path is config/loyalty (not config/config/loyalty).
const CONFIG_DOC = "loyalty";

let cache = null;
let cachedAt = 0;
const CACHE_TTL_MS = 30000;

/** Read the loyalty config, seeding defaults if absent. Cached briefly. */
export async function getLoyaltyConfig({ force = false } = {}) {
  if (!force && cache && Date.now() - cachedAt < CACHE_TTL_MS) return cache;

  const db = getDb();
  const snap = await db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC).get();
  let data;
  if (!snap.exists) {
    data = cloneDefaults();
    await db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC).set({
      ...data,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: "system-seed",
    });
  } else {
    // Merge over defaults so new config keys introduced by upgrades get defaults.
    data = { ...cloneDefaults(), ...snap.data() };
  }
  cache = data;
  cachedAt = Date.now();
  return data;
}

/**
 * Update the config with validation and an audit record.
 * @param {object} patch — partial config
 * @param {string} staffId
 * @param {string} reason
 */
export async function updateLoyaltyConfig(patch, staffId, reason) {
  const db = getDb();
  const current = await getLoyaltyConfig({ force: true });
  const { ok, errors, config: next } = validateConfigPatch(patch, current);
  if (!ok) {
    const err = new Error(`Invalid configuration: ${errors.join("; ")}`);
    err.code = "INVALID_CONFIG";
    err.errors = errors;
    throw err;
  }

  await db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC).set(
    {
      ...next,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: staffId,
    },
    { merge: true }
  );

  cache = null; // invalidate

  const { writeAudit } = await import("./ledger.js");
  await writeAudit({
    actorId: staffId,
    action: "updateLoyaltyConfig",
    reason,
    before: current,
    after: next,
  });

  return next;
}

export function invalidateConfigCache() {
  cache = null;
  cachedAt = 0;
}

export default { getLoyaltyConfig, updateLoyaltyConfig, invalidateConfigCache };
