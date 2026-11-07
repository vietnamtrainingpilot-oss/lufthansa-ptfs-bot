/**
 * manifestRules.js — Pure passenger-eligibility rules. No imports, no I/O.
 *
 * Split from manifest.js so these rules are unit-testable without booting the
 * env-validating config module or connecting to Firestore.
 *
 * A passenger earns a flight reward only when ALL of these hold:
 *   - present in the manifest
 *   - not a test/placeholder booking
 *   - not staff-marked ineligible
 *   - bookingStatus === "confirmed"
 *   - presenceStatus === "present"
 * No-shows, cancelled flights, duplicates and staff-excluded entries earn nothing.
 */

export const PRESENCE = {
  UNMARKED: "unmarked",
  PRESENT: "present",
  NO_SHOW: "no_show",
  REMOVED: "removed",
};

export const BOOKING_STATUS = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  CANCELLED: "cancelled",
};

/** Bookings whose id looks like a test are never eligible. */
const TEST_MARKERS = ["test", "demo", "sample", "placeholder"];

export function looksLikeTestBooking(entry) {
  if (entry?.isTest === true) return true;
  const id = String(entry?.bookingId || "").toLowerCase();
  return TEST_MARKERS.some((m) => id.includes(m));
}

/** Single source of truth for eligibility, shared by preview and award paths. */
export function isPassengerEligible(p) {
  if (!p) return false;
  if (p.isTest === true) return false;
  if (TEST_MARKERS.some((m) => String(p.bookingId || "").toLowerCase().includes(m))) return false;
  if (p.eligible === false) return false;
  if (p.bookingStatus !== BOOKING_STATUS.CONFIRMED) return false;
  if (p.presenceStatus !== PRESENCE.PRESENT) return false;
  return true;
}

/**
 * Eligible passengers for a manifest, with exclusion reasons.
 * @param {{passengers:Array}|null} manifest
 * @param {object} config — loyalty config (reads eligibility block)
 */
export function summariseEligible(manifest, config) {
  const all = Array.isArray(manifest?.passengers) ? manifest.passengers : [];
  const eligible = all.filter(isPassengerEligible);

  const allowedClasses = new Set(
    config?.eligibility?.eligibleCabinClasses || ["economy", "premium", "business"]
  );
  const classOk = eligible.filter((p) => allowedClasses.has(String(p.cabinClass || "economy").toLowerCase()));

  const cap = Number(config?.eligibility?.maxRewardedPassengersPerFlight || 0);
  const limited = cap > 0 ? classOk.slice(0, cap) : classOk;
  const limitedIds = new Set(limited.map((p) => p.userId));

  return {
    totalPassengers: all.length,
    eligibleCount: limited.length,
    excludedCount: all.length - limited.length,
    eligiblePassengers: limited,
    excluded: all
      .filter((p) => !limitedIds.has(p.userId))
      .map((p) => ({
        userId: p.userId,
        displayName: p.displayName,
        presence: p.presenceStatus,
        bookingStatus: p.bookingStatus,
        eligible: p.eligible,
        cabinClass: p.cabinClass,
      })),
    capApplied: cap > 0 && classOk.length > cap,
  };
}

export default { PRESENCE, BOOKING_STATUS, isPassengerEligible, summariseEligible, looksLikeTestBooking };