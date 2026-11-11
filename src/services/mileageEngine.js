/**
 * mileageEngine.js — Lufthansa Miles & More Earning Engine
 *
 * Supports two earning modes:
 * - Distance mode: miles = (distance_km / 100) * rate_per_100km
 * - Flat mode: fixed base miles per flight + cabin multiplier
 */

const DEFAULT_EARNING_RULES = {
  mode: "distance",
  flatMiles: 1500,
  cabinMultipliers: {
    economy: 1.0,
    premium_economy: 1.5,
    business: 2.5,
    first: 4.0,
  },
  creditPerHour: 1,
  minCreditsPerFlight: 1,
  maxCreditsPerFlight: 10,
};

const AWARD_MILES_PER_100KM = {
  economy: 3,
  premium_economy: 4.5,
  business: 7,
  first: 9,
};

const STATUS_POINTS_PER_FLIGHT = {
  economy: 100,
  premium_economy: 150,
  business: 200,
  first: 250,
  crew: 200,
};

const QUALIFYING_RATIO = 2;
const HON_CIRCLE_RATE = 0.25;

export async function getEarningRules() {
  try {
    const db = await import("./firestore.js").then(m => m.getDb());
    const snap = await db.collection("config").doc("earningRules").get();
    if (snap.exists) return { ...DEFAULT_EARNING_RULES, ...snap.data() };
  } catch {}
  return DEFAULT_EARNING_RULES;
}

export function calculateDistanceEarnings({ distanceKm, cabin, membershipTier, crew }) {
  const rules = DEFAULT_EARNING_RULES;
  const c = (cabin || "economy").toLowerCase().replace(/\s+/g, "_");

  if (!AWARD_MILES_PER_100KM[c]) throw new Error(`Unknown cabin class: ${cabin}`);

  const baseMiles = Math.round((distanceKm / 100) * AWARD_MILES_PER_100KM[c]);
  const multiplier = rules.cabinMultipliers[c] || 1.0;
  const awardMiles = Math.round(baseMiles * multiplier);

  const statusPoints = STATUS_POINTS_PER_FLIGHT[c] || STATUS_POINTS_PER_FLIGHT.economy;
  const qualifyingPoints = Math.ceil(statusPoints / QUALIFYING_RATIO);
  const honPoints = membershipTier !== "Frequent Traveller" ? Math.floor(qualifyingPoints * HON_CIRCLE_RATE) : 0;

  return {
    distanceKm,
    cabin: c,
    baseMiles,
    multiplier,
    awardMiles,
    statusPoints,
    qualifyingPoints,
    honPoints,
    mode: "distance",
  };
}

export function calculateFlatEarnings({ cabin, membershipTier }) {
  const rules = DEFAULT_EARNING_RULES;
  const c = (cabin || "economy").toLowerCase().replace(/\s+/g, "_");
  const multiplier = rules.cabinMultipliers[c] || 1.0;
  const awardMiles = Math.round(rules.flatMiles * multiplier);

  const statusPoints = STATUS_POINTS_PER_FLIGHT[c] || STATUS_POINTS_PER_FLIGHT.economy;
  const qualifyingPoints = Math.ceil(statusPoints / QUALIFYING_RATIO);
  const honPoints = membershipTier !== "Frequent Traveller" ? Math.floor(qualifyingPoints * HON_CIRCLE_RATE) : 0;

  return {
    cabin: c,
    flatBase: rules.flatMiles,
    multiplier,
    awardMiles,
    statusPoints,
    qualifyingPoints,
    honPoints,
    mode: "flat",
  };
}

export function calculateEarnings({ distanceKm, cabin, membershipTier, crew, mode }) {
  if (mode === "flat") {
    return calculateFlatEarnings({ cabin, membershipTier });
  }
  if (!distanceKm) throw new Error("Distance required for distance mode");
  return calculateDistanceEarnings({ distanceKm, cabin, membershipTier, crew });
}

export function applyPromotionCode(earnings, code) {
  if (!code) return { ...earnings, promotion: null };
  const PROMOS = { FLASH: 1.25, SUMMER: 1.2, HOLIDAY: 1.15, NEWMEMBER: 1.5 };
  const mult = PROMOS[code.toUpperCase()] || 0;
  if (mult <= 0) return { ...earnings, promotion: null };
  const bonusMiles = Math.round(earnings.awardMiles * (mult - 1));
  return { ...earnings, promotion: code, promoMultiplier: mult, promotionMiles: bonusMiles, awardMiles: earnings.awardMiles + bonusMiles };
}

export function breakdownText(earnings, memberId) {
  const lines = [
    `**Earnings Breakdown**`,
    ``,
    `**Mode:** ${earnings.mode === "flat" ? "Flat Rate" : "Distance"}${earnings.distanceKm ? ` (${earnings.distanceKm} km)` : ""}`,
    `**Cabin:** ${earnings.cabin?.replace(/_/g, " ").toUpperCase() || "ECONOMY"}`,
    ``,
  ];
  if (earnings.mode === "distance") {
    lines.push(`Base: ${Math.round(earnings.distanceKm / 100 * (AWARD_MILES_PER_100KM[earnings.cabin] || 3))} miles`);
    if (earnings.multiplier && earnings.multiplier > 1) lines.push(`x${earnings.multiplier} cabin multiplier`);
  } else {
    lines.push(`Base: ${earnings.flatBase} miles`);
    if (earnings.multiplier && earnings.multiplier > 1) lines.push(`x${earnings.multiplier} cabin multiplier`);
  }
  lines.push(`Award Miles: +${earnings.awardMiles}`);
  lines.push(`Status Points: +${earnings.statusPoints}`);
  lines.push(`Qualifying Points: +${earnings.qualifyingPoints}`);
  if (earnings.honPoints) lines.push(`HON Circle Points: +${earnings.honPoints}`);
  if (earnings.promotion) lines.push(`Promotion "${earnings.promotion}": +${earnings.promotionMiles} bonus miles`);
  return lines.join("\n");
}

export default {
  getEarningRules,
  calculateDistanceEarnings,
  calculateFlatEarnings,
  calculateEarnings,
  applyPromotionCode,
  breakdownText,
  AWARD_MILES_PER_100KM,
  STATUS_POINTS_PER_FLIGHT,
};