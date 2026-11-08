/**
 * loyaltyConfig.js — Default configuration for LH Rewards + LH Credits.
 *
 * All rates are STARTING PLACEHOLDERS that staff can change at runtime via
 * `/rewards configure` and `/economy configure`. Nothing here is hardcoded into
 * business logic: every formula reads from this shape, persisted in Firestore
 * at `config/loyalty`.
 *
 * Two separate currencies:
 *   points  — loyalty points. Earned from verified flights + missions. Redeemed
 *             from the loyalty catalogue. Never purchasable, never transferable.
 *             Display label is "Miles"; the backend key stays "points".
 *   credits — LH Credits. Fictional closed virtual economy. Earned from verified
 *             flights + approved activities. Spent in the LH Credits shop.
 */

import { MILES_LABEL, MILES_UNIT, CREDITS_LABEL, CREDITS_UNIT } from "./brand.js";

export const CURRENCY = {
  POINTS: "points",
  CREDITS: "credits",
};

/** Display names are configurable so the owner can rename without code changes.
 *  Defaults are read from the brand config module; staff can override the
 *  display labels at runtime via `/rewards configure branding.pointsLabel`
 *  without touching any ledger key. */
export const DEFAULT_BRANDING = {
  pointsLabel: MILES_LABEL,
  pointsUnit: MILES_UNIT,
  creditsLabel: CREDITS_LABEL,
  creditsUnit: CREDITS_UNIT,
};

export const DEFAULT_LOYALTY_CONFIG = {
  branding: { ...DEFAULT_BRANDING },

  /**
   * Qualification metric drives status tiers. Chosen rule: lifetime QUALIFYING
   * points (points earned from verified eligible flights), so spending points
   * can never demote a member.
   */
  qualifyingMetric: "lifetimeQualifyingPoints", // enum: lifetimeQualifyingPoints | qualifyingFlightCount
  enabled: true,

  // ─── Loyalty points formula ───────────────────────────────────────────────
  formula: {
    /** Preferred basis when a real route distance is known. */
    pointsPer100km: 10,
    /** Fallback basis when distance is unavailable: per minute of recorded flight time. */
    pointsPerMinuteFallback: 1.5,
    /** Fallback rate used to synthesise a distance estimate from duration. */
    fallbackKmPerMinute: 6,
    /** Applied after the fallback synthesises a distance from duration. */
    fallbackFlatMultiplier: 1.0,

    minPointsPerFlight: 25,
    maxPointsPerFlight: 1500,

    /** Absolute ceiling any single flight can ever award, whatever the config says. */
    hardCapPointsPerFlight: 15000,

    /** Class multipliers applied to loyalty points. */
    classMultipliers: {
      economy: 1.0,
      premium: 1.25,
      business: 1.5,
    },
    /** Unknown/blank cabin class falls back to economy. */
    defaultCabinClass: "economy",

    /** Flat status-tier bonus added AFTER the class multiplier, itself capped. */
    tierBonus: { explorer: 0, adventurer: 25, elite: 75 },
    maxTierBonusPerFlight: 75,
  },

  // ─── LH Credits formula ───────────────────────────────────────────────────
  creditsFormula: {
    creditsPerHour: 20,
    creditsMultiplier: {
      economy: 1.0,
      premium: 1.15,
      business: 1.35,
    },
    minCreditsPerFlight: 10,
    maxCreditsPerFlight: 400,
    hardCapCreditsPerFlight: 2000,
  },

  // ─── Status tiers ─────────────────────────────────────────────────────────
  tiers: {
    enabled: true,
    list: [
      { key: "explorer", name: "Explorer", min: 0, roleEnvKey: "rewardsLevel1RoleId" },
      { key: "adventurer", name: "Adventurer", min: 3000, roleEnvKey: "rewardsLevel2RoleId" },
      { key: "elite", name: "Elite", min: 10000, roleEnvKey: "rewardsLevel3RoleId" },
    ],
  },

  // ─── Missions ─────────────────────────────────────────────────────────────
  missions: {
    enabled: true,
    /** Hard ceiling on how many missions may be active at once. */
    maxActiveMissions: 25,
  },

  // ─── Catalogue / shop ──────────────────────────────────────────────────────
  catalogue: {
    /** Global per-day cap on member-initiated redemptions/purchases. */
    maxTransactionsPerUserPerDay: 20,
    /** Global cooldown between member transactions, in ms. */
    transactionCooldownMs: 1500,
  },

  // ─── Flight reward eligibility ────────────────────────────────────────────
  eligibility: {
    /** Flight statuses that can earn rewards. cancelled must never be here. */
    rewardedFlightStatuses: ["completed"],
    /** Cabin classes considered eligible by default. */
    eligibleCabinClasses: ["economy", "premium", "business"],
    /** Max rewarded passengers per flight; 0 = unlimited. Staff cannot exceed this silently. */
    maxRewardedPassengersPerFlight: 0,
  },

  updatedAt: null,
  updatedBy: null,
};

/** Deep-clone helper so callers can never mutate the shared default object. */
export function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_LOYALTY_CONFIG));
}

function isPositiveInt(value) {
  return Number.isInteger(value) && value > 0;
}

function isNonNegativeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Validate a partial config patch. Returns { ok, errors }.
 * Staff configuration must never be able to store a nonsensical economy.
 */
export function validateConfigPatch(patch, current) {
  const errors = [];
  const next = { ...current, ...patch };
  const f = { ...current.formula, ...(patch.formula || {}) };
  const cf = { ...current.creditsFormula, ...(patch.creditsFormula || {}) };

  if (!isNonNegativeNumber(f.pointsPer100km)) errors.push("formula.pointsPer100km must be a non-negative number");
  if (!isNonNegativeNumber(f.pointsPerMinuteFallback)) errors.push("formula.pointsPerMinuteFallback must be a non-negative number");
  if (!isNonNegativeNumber(f.fallbackKmPerMinute)) errors.push("formula.fallbackKmPerMinute must be a non-negative number");
  if (!isPositiveInt(f.minPointsPerFlight)) errors.push("formula.minPointsPerFlight must be a positive whole number");
  if (!isPositiveInt(f.maxPointsPerFlight)) errors.push("formula.maxPointsPerFlight must be a positive whole number");
  if (f.minPointsPerFlight > f.maxPointsPerFlight) errors.push("formula.minPointsPerFlight cannot exceed maxPointsPerFlight");
  if (!isPositiveInt(f.hardCapPointsPerFlight)) errors.push("formula.hardCapPointsPerFlight must be a positive whole number");
  if (f.maxPointsPerFlight > f.hardCapPointsPerFlight) errors.push("formula.maxPointsPerFlight cannot exceed hardCapPointsPerFlight");
  if (!isPositiveInt(f.maxTierBonusPerFlight)) errors.push("formula.maxTierBonusPerFlight must be a positive whole number");

  const classM = { ...f.classMultipliers, ...((patch.formula || {}).classMultipliers || {}) };
  for (const [cabin, mult] of Object.entries(classM)) {
    if (!isNonNegativeNumber(mult)) errors.push(`formula.classMultipliers.${cabin} must be a non-negative number`);
  }
  if (f.defaultCabinClass && !(f.defaultCabinClass in classM)) {
    errors.push(`formula.defaultCabinClass "${f.defaultCabinClass}" is not present in classMultipliers`);
  }

  const tierBonus = { ...f.tierBonus, ...((patch.formula || {}).tierBonus || {}) };
  for (const [tier, bonus] of Object.entries(tierBonus)) {
    if (!isNonNegativeNumber(bonus)) errors.push(`formula.tierBonus.${tier} must be a non-negative number`);
    if (bonus > f.maxTierBonusPerFlight) {
      errors.push(`formula.tierBonus.${tier} exceeds maxTierBonusPerFlight`);
    }
  }

  if (!isNonNegativeNumber(cf.creditsPerHour)) errors.push("creditsFormula.creditsPerHour must be a non-negative number");
  if (!isPositiveInt(cf.minCreditsPerFlight)) errors.push("creditsFormula.minCreditsPerFlight must be a positive whole number");
  if (!isPositiveInt(cf.maxCreditsPerFlight)) errors.push("creditsFormula.maxCreditsPerFlight must be a positive whole number");
  if (cf.minCreditsPerFlight > cf.maxCreditsPerFlight) errors.push("creditsFormula.minCreditsPerFlight cannot exceed maxCreditsPerFlight");
  if (!isPositiveInt(cf.hardCapCreditsPerFlight)) errors.push("creditsFormula.hardCapCreditsPerFlight must be a positive whole number");
  if (cf.maxCreditsPerFlight > cf.hardCapCreditsPerFlight) errors.push("creditsFormula.maxCreditsPerFlight cannot exceed hardCapCreditsPerFlight");

  const credMult = { ...cf.creditsMultiplier, ...((patch.creditsFormula || {}).creditsMultiplier || {}) };
  for (const [cabin, mult] of Object.entries(credMult)) {
    if (!isNonNegativeNumber(mult)) errors.push(`creditsFormula.creditsMultiplier.${cabin} must be a non-negative number`);
  }

  const tiers = patch.tiers ? { ...current.tiers, ...patch.tiers } : current.tiers;
  if (Array.isArray(tiers.list)) {
    if (tiers.list.length === 0) {
      errors.push("tiers.list must contain at least one tier");
    } else {
      let prevMin = -1;
      for (const tier of tiers.list) {
        if (!tier.key || !tier.name) errors.push("each tier requires key and name");
        if (!isNonNegativeNumber(tier.min)) errors.push(`tier "${tier.key}" min must be a non-negative number`);
        if (tier.min <= prevMin) errors.push("tiers.list must be ordered by strictly increasing min");
        prevMin = tier.min;
      }
      if (tiers.list[0].min !== 0) errors.push("the first tier must have min 0 so every member has a starting tier");
    }
  }

  const qualMetric = patch.qualifyingMetric || current.qualifyingMetric;
  if (!["lifetimeQualifyingPoints", "qualifyingFlightCount"].includes(qualMetric)) {
    errors.push("qualifyingMetric must be lifetimeQualifyingPoints or qualifyingFlightCount");
  }

  if (patch.branding) {
    const b = { ...current.branding, ...patch.branding };
    if (typeof b.pointsLabel !== "string" || !b.pointsLabel.trim()) errors.push("branding.pointsLabel must be a non-empty string");
    if (typeof b.creditsLabel !== "string" || !b.creditsLabel.trim()) errors.push("branding.creditsLabel must be a non-empty string");
    if (typeof b.pointsUnit !== "string" || !b.pointsUnit.trim()) errors.push("branding.pointsUnit must be a non-empty string");
    if (typeof b.creditsUnit !== "string" || !b.creditsUnit.trim()) errors.push("branding.creditsUnit must be a non-empty string");
  }

  const cat = patch.catalogue ? { ...current.catalogue, ...patch.catalogue } : current.catalogue;
  if (!isPositiveInt(cat.maxTransactionsPerUserPerDay)) errors.push("catalogue.maxTransactionsPerUserPerDay must be a positive whole number");
  if (!isNonNegativeNumber(cat.transactionCooldownMs)) errors.push("catalogue.transactionCooldownMs must be a non-negative number");

  return { ok: errors.length === 0, errors, config: next };
}

export default {
  CURRENCY,
  DEFAULT_BRANDING,
  DEFAULT_LOYALTY_CONFIG,
  cloneDefaults,
  validateConfigPatch,
};
