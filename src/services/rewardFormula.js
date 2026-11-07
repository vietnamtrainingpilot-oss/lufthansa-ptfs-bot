/**
 * rewardFormula.js — Pure, deterministic reward calculation.
 *
 * No Firestore, no Discord, no side effects. Everything here is unit-testable
 * and reads entirely from a passed-in config object.
 *
 * Documented rules:
 *  1. Basis selection
 *     - If route distance is known (flight.routeDistanceKm, or synthesised from a
 *       configured airport-distance table), use it.
 *     - Otherwise fall back to recorded flight duration using
 *       pointsPerMinuteFallback. The chosen basis is reported so the member
 *       notification can state it in plain language. Nothing is ever invented
 *       silently: if neither distance nor duration exists, this returns an
 *       error requiring staff correction.
 *  2. Loyalty points
 *     base = distanceBasis ? round(pointsPer100km * km / 100)
 *                          : round(pointsPerMinuteFallback * minutes)
 *     base = clamp(base, minPointsPerFlight, maxPointsPerFlight)
 *     points = round(base * classMultiplier)
 *     points += min(tierBonus[tier], maxTierBonusPerFlight)
 *     points = clamp(points, minPointsPerFlight, maxPointsPerFlight)
 *     points = min(points, hardCapPointsPerFlight)   // absolute ceiling
 *  3. VJ Credits
 *     hours = minutes / 60
 *     credits = round(hours * creditsPerHour * creditsMultiplier[class])
 *     credits = clamp(credits, minCreditsPerFlight, maxCreditsPerFlight)
 *     credits = min(credits, hardCapCreditsPerFlight)
 */

import { CURRENCY } from "../config/loyaltyConfig.js";

export const CABIN_CLASSES = ["economy", "premium", "business"];

/** Normalise free-text cabin class from a booking/site into a canonical key. */
export function normaliseCabinClass(raw, defaultClass = "economy") {
  if (!raw) return defaultClass;
  const v = String(raw).trim().toLowerCase();
  if (CABIN_CLASSES.includes(v)) return v;
  if (v === "premium_economy" || v === "premium economy" || v === "premiumeco") return "premium";
  if (v === "business_class" || v === "businessclass" || v === "biz") return "business";
  if (v === "economy_class" || v === "econ" || v === "coach") return "economy";
  return defaultClass;
}

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Determine the reward basis for a flight.
 * @returns {{basis:"distance"|"duration", km?:number, minutes?:number}}
 * @throws when neither distance nor duration is usable
 */
export function resolveBasis(flight, config) {
  const km = Number(flight.routeDistanceKm);
  if (Number.isFinite(km) && km > 0) {
    return { basis: "distance", km };
  }
  const minutes = Number(flight.flightTimeMinutes);
  if (Number.isFinite(minutes) && minutes > 0) {
    // Optionally surface a synthesised distance for display only.
    const synthKm = Math.round(minutes * config.formula.fallbackKmPerMinute);
    return { basis: "duration", minutes, syntheticKm: synthKm };
  }
  const err = new Error(
    "Flight has neither a usable route distance nor a recorded flight duration. Staff must correct the flight record before rewards can be calculated."
  );
  err.code = "MISSING_FLIGHT_BASIS";
  throw err;
}

/**
 * Calculate the reward award for one eligible passenger on one completed flight.
 *
 * @param {object} params
 * @param {object} params.flight — flight record (needs routeDistanceKm or flightTimeMinutes)
 * @param {string} params.cabinClass
 * @param {string} params.tierKey — current member status tier key
 * @param {object} params.config — loyalty config (see loyaltyConfig.js)
 * @returns {{
 *   points:number, credits:number,
 *   breakdown:{ basis:string, basisValue:number, basePoints:number, cabinClass:string,
 *              pointsMultiplier:number, tierBonus:number, pointsCapApplied:boolean,
 *              hours:number, baseCredits:number, creditsMultiplier:number, creditsCapApplied:boolean },
 *   explanation:string
 * }}
 */
export function calculateFlightReward({ flight, cabinClass, tierKey, config }) {
  const f = config.formula;
  const cf = config.creditsFormula;
  const cabin = normaliseCabinClass(cabinClass, f.defaultCabinClass);
  const { basis, km, minutes, syntheticKm } = resolveBasis(flight, config);

  // ── Loyalty points ────────────────────────────────────────────────────────
  let basePoints;
  let basisValue;
  if (basis === "distance") {
    basisValue = km;
    basePoints = Math.round((f.pointsPer100km * km) / 100);
  } else {
    basisValue = minutes;
    basePoints = Math.round(f.pointsPerMinuteFallback * minutes * f.fallbackFlatMultiplier);
  }
  basePoints = clamp(basePoints, f.minPointsPerFlight, f.maxPointsPerFlight);

  const pointsMultiplier = f.classMultipliers[cabin] ?? 1;
  let points = Math.round(basePoints * pointsMultiplier);

  const rawTierBonus = f.tierBonus[tierKey] ?? 0;
  const tierBonus = Math.min(rawTierBonus, f.maxTierBonusPerFlight);
  points += tierBonus;

  const preCap = points;
  points = clamp(points, f.minPointsPerFlight, f.maxPointsPerFlight);
  points = Math.min(points, f.hardCapPointsPerFlight);
  const pointsCapApplied = points < preCap;

  // ── VJ Credits ────────────────────────────────────────────────────────────
  const effectiveMinutes = basis === "duration" ? minutes : (flight.flightTimeMinutes > 0 ? Number(flight.flightTimeMinutes) : 0);
  const hours = Math.round((effectiveMinutes / 60) * 100) / 100; // 2dp
  const creditsMultiplier = cf.creditsMultiplier[cabin] ?? 1;
  let baseCredits = Math.round(hours * cf.creditsPerHour * creditsMultiplier);
  baseCredits = clamp(baseCredits, cf.minCreditsPerFlight, cf.maxCreditsPerFlight);
  let credits = baseCredits;
  const creditsCapApplied = credits < Math.round(hours * cf.creditsPerHour * creditsMultiplier);
  credits = Math.min(credits, cf.hardCapCreditsPerFlight);

  const breakdown = {
    basis,
    basisValue,
    syntheticKm: syntheticKm ?? null,
    basePoints,
    cabinClass: cabin,
    pointsMultiplier,
    tierBonus,
    pointsCapApplied,
    hours,
    baseCredits,
    creditsMultiplier,
    creditsCapApplied,
  };

  const explanation = buildExplanation({ breakdown, tierKey, config });

  return { points, credits, breakdown, explanation };
}

/**
 * Plain-language, member-safe explanation. No staff notes, no internal flags.
 */
function buildExplanation({ breakdown, tierKey, config, flightNumber = null } = {}) {
  const b = config.branding;
  const cabin = breakdown.cabinClass;
  const cabinLabel = cabin.charAt(0).toUpperCase() + cabin.slice(1);

  const parts = [];
  if (breakdown.basis === "distance") {
    parts.push(`${breakdown.basisValue} km route`);
  } else {
    parts.push(`${breakdown.basisValue} min flight time`);
  }
  parts.push(`${cabinLabel} cabin (x${breakdown.pointsMultiplier})`);
  if (breakdown.tierBonus > 0) parts.push(`${tierKey} status bonus +${breakdown.tierBonus}`);

  return {
    summary: parts.join(", "),
    detail: `Route basis: ${breakdown.basis}. Cabin: ${cabinLabel}. ` +
      `Base points ${breakdown.basePoints}, class multiplier x${breakdown.pointsMultiplier}` +
      (breakdown.tierBonus ? `, status bonus +${breakdown.tierBonus}` : "") + `. ` +
      `Credits based on ${breakdown.hours} h at ${config.creditsFormula.creditsPerHour}/h` +
      (breakdown.creditsMultiplier !== 1 ? ` (x${breakdown.creditsMultiplier} credits)` : "") + ".",
    pointsUnit: b.pointsUnit,
    creditsUnit: b.creditsUnit,
    flightNumber,
  };
}

export default { calculateFlightReward, resolveBasis, normaliseCabinClass, CABIN_CLASSES, CURRENCY };