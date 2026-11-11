/**
 * mileageEngine.js — Lufthansa Miles & More Mileage Calculation
 *
 * Core earning rules:
 * - Award Miles based on route distance + cabin multiplier
 * - Status Points based on flight earnings
 * - Qualifying Points based on eligible flights
 * - HON Circle Points for elite members
 */

import config from "../config/config.js";

/**
 * Base Award Miles per 100 km by cabin class.
 */
const CASH_PER_100_KM = {
  economy: 3,
  premium: 4.5,
  business: 7,
  first: 9,
};

/**
 * Status Points per flight by cabin class.
 */
const STATUS_POINTS_PER_FLIGHT = {
  economy: 100,
  premium: 150,
  business: 200,
  first: 250,
  crew: 200, // Crew flying as staff
};

/**
 * Qualifying Points per status point.
 */
const QUALIFYING_RATIO = 2; // 2 Status Points per 1 Qualifying Point

/**
 * HON Circle Points earning rate (for qualifying members).
 */
const HON_POINTS_RATE = 0.25; // 25% of qualifying points

/**
 * Calculate award miles for a single flight.
 *
 * @param {number} distanceKm - Flight distance
 * @param {string} cabin - Travel class (economy, premium, business, first)
 * @param {string} membershipTie - Current tier
 * @param {boolean} crew - Is this a crew flight?
 * @returns {object} Earnings breakdown
 */
export function calculateFlightEarnings({ distanceKm, cabin, membershipTier, crew }) {
  if (!CASH_PER_100_KM[cabin]) cabin = "economy";
  if (!STATUS_POINTS_PER_FLIGHT[cabin]) cabin = "economy";

  // Base miles: distance × rate per 100km
  const rate = CASH_PER_100_KM[cabin];
  const baseMiles = (distanceKm / 100) * rate;

  // Status points
  const statusPoints = STATUS_POINTS_PER_FLIGHT[cabin];

  // Qualifying points
  const qualifyingPoints = Math.ceil(statusPoints / QUALIFYING_RATIO);

  // HON Circle points (for frequent flyers and above)
  const honPoints = membershipTier !== "Frequent Traveller" ? Math.floor(qualifyingPoints * HON_POINTS_RATE) : 0;

  return {
    baseMiles,
    roundedMiles: Math.round(baseMiles),
    statusPoints,
    qualifyingPoints,
    honPoints,
    distanceKm,
    cabin,
  };
}

/**
 * Calculate distance between two airports (simple lookup).
 * In production, use a full distance matrix.
 */
export function getDistance(routeKey) {
  // Simple distance lookup by route
  const DISTANCES = {
    "HAN-DAD": 1800,
    "HAN-VRN": 190,
    "HAN-MUC": 75,
    "HAN-FRA": 85,
    "MUC-FRA": 650,
  };

  return DISTANCES[routeKey] || DISTANCES["HAN-DAD"] || 800; // Default 800km
}

/**
 * Parse route key (e.g., "HAN-DAD") into distance.
 */
export function parseRouteKey(route) {
  if (!route) return 800; // Default fallback

  // Handle both "HAN-DAD" and "HAN→DAD" formats
  const cleaned = route.replace("→", "-");
  if (DISTANCES[cleaned] !== undefined) return DISTANCES[cleaned];

  // Calculate as sum of individual legs (if not found)
  const legs = cleaned.split("-");
  if (legs.length === 2) {
    return Math.abs(legs[0].charCodeAt(0) - legs[1].charCodeAt(0)) * 50; // Rough estimate
  }

  return 800;
}

/**
 * Calculate crew flight earnings (for flight operations support staff).
 */
export function calculateCrewEarnings(flight) {
  const distanceKm = getDistance(flight.route);
  const cabin = flight.cabin.toLowerCase() || "business";
  const isPilot = flight.role === "pilot";

  return {
    ...calculateFlightEarnings({
      distanceKm,
      cabin,
      membershipTier: isPilot ? "Senator" : "Senator",
      crew: true,
    }),
    crewBonus: isPilot ? 1000 : 500,
    totalMiles: Math.round(
      calculateFlightEarnings({
        distanceKm,
        cabin,
        membershipTier: isPilot ? "Senator" : "Senator",
        crew: true,
      }).roundedMiles + (isPilot ? 1000 : 500)
    ),
    flightId: flight.id,
  };
}

/**
 * Apply promotion multiplier.
 */
export function applyPromotion(baseEarnings, promotionalCode) {
  if (!promotionalCode) return { ...baseEarnings, multiplier: 1, promotionName: null };

  const PROMOTION_MULTIPLIERS = {
    "FLASH": 1.25,
    "SUMMER": 1.2,
    "HOLIDAY": 1.15,
    "NEWMEMBER": 1.5,
  };

  const multiplier = PROMOTION_MULTIPLIERS[promotionalCode.toUpperCase()] || 1;
  const bonusMiles = Math.round((baseEarnings.roundedMiles - Math.round(baseEarnings.roundedMiles * multiplier)) * multiplier);

  return {
    ...baseEarnings,
    multiplier,
    promotionName: promotionalCode,
    promotionMiles: bonusMiles,
  };
}

/**
 * Calculate total earnings with status bonus (if tier reached threshold).
 */
export function calculateTotalEarnings({
  baseMiles,
  statusPoints,
  milestone,
  tenure,
  membershipTier,
  promotionalCode,
}) {
  // Apply promotion
  let promotionResult = baseMiles;
  let promoMultiplier = 1;
  let promoName = promotionalCode;

  if (promotionalCode) {
    promotionResult = applyPromotion({ ...baseMiles, roundedMiles: baseMiles.roundedMiles * promoMultiplier }[0], promotionalCode);
    promoMultiplier = promotionResult.multiplier;
    promoName = promotionResult.promotionName;
    promotionResult.roundedMiles = Math.floor(promotionResult.baseMiles * promoMultiplier);
  }

  // Status points for this flight
  const flightStatusBonus = 100; // Static status bonus per flight

  // Milestone bonus (every 10 flights, 500 miles)
  const milestoneMiles = Math.floor(tenure / 10) > 0 ? Math.floor(tenure / 10) * 500 : 0;

  // Tier-specific annual status bonus (simulating Mile & More annual bonus)
  const tierBonus = {
    "Frequent Traveller": 1200,
    Senator: 2400,
    "HON Circle": 3600,
  }[membershipTier] || 0;

  // Lifetime progress multiplier
  const lifetimeMiles = Math.round(
    Math.floor(baseMiles.roundedMiles + promoName.flightPromotionMiles + milestoneMiles) + flightStatusBonus + tierBonus
  );

  return {
    baseMiles: Math.round(baseMiles.roundedMiles),
    promoMultiplier,
    flightPromotionMiles: Math.round(flightStatusBonus),
    statusPoints,
    qualifyingPoints: Math.floor(statusPoints / QUALIFYING_RATIO),
    honPoints: Math.floor(qualifyingPoints * HON_POINTS_RATE),
    milestoneMiles,
    tierBonus,
    totalEarnings: lifetimeMiles + flightStatusPoints + tierBonus,
    membershipAgeYears: tenure,
    promoMultiplier,
    promoName,
  };
}

export default {
  calculateFlightEarnings,
  calculateCrewEarnings,
  getDistance,
  parseRouteKey,
};