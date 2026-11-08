/**
 * brand.js — Single source of truth for the Lufthansa PTFS brand.
 *
 * Everything user-facing (bot messages, website copy, Discord accent
 * colours, page titles, the flight-number prefix) reads from this module.
 * Nothing here is a behaviour change: every value below replaces a
 * VietJet-era literal that already existed in the codebase.
 *
 * The backend currency identifiers stay `points` and `credits` — those are
 * ledger keys, not brand labels, and renaming them would silently break
 * the economy. Only the DISPLAY labels come from here.
 */

/** Flight-number prefix. Display format is `${prefix} ${number}` with a space. */
export const FLIGHT_PREFIX = "LH";

/**
 * Format a stored flight number for display: "LH 204".
 *
 * The stored value in Firestore is the bare number, as it was before the
 * rebrand. Only the presentation changes. Every user-facing flight number
 * must go through this helper so the prefix stays configurable in one place.
 *
 * @param {string|number} flightNumber
 * @returns {string}
 */
export function flightLabel(flightNumber) {
  const bare = String(flightNumber ?? "")
    .trim()
    // Strip any legacy two-letter prefix (LH or VJ) so a stored "VJ101" or a
    // staff-entered "LH101" both render as "LH 101" for the current brand.
    .replace(/^[A-Z]{2}\s*/i, "");
  return `${FLIGHT_PREFIX} ${bare}`;
}

/**
 * Pattern a staff-entered flight number must match: the brand prefix, an
 * optional space, then three or four digits. Used by validation so the
 * accepted prefix always follows the brand config instead of a hardcoding.
 */
export const FLIGHT_NUMBER_PATTERN = `^${FLIGHT_PREFIX}\\s?\\d{3,4}$`;

/** True when `value` is a valid flight number for the current brand prefix. */
export function isValidFlightNumber(value) {
  return new RegExp(FLIGHT_NUMBER_PATTERN, "i").test(String(value ?? "").trim());
}

/**
 * Reduce a staff-entered flight number to its bare numeral for storage and
 * lookups ("LH 101", "LH101" and "101" all become "101"). Storage stays
 * prefix-free; every display goes through flightLabel.
 *
 * @param {string|number} value
 * @returns {string}
 */
export function normalizeFlightNumber(value) {
  return String(value ?? "")
    .trim()
    .replace(/^[A-Za-z]{2}\s*/, "");
}

/** Community name used in page titles, bot name, footer, and support copy. */
export const COMMUNITY_NAME = "Lufthansa PTFS";

/** Airline name used in passenger-facing flight copy only. */
export const AIRLINE_NAME = "Lufthansa";

/** Loyalty programme display name. */
export const LOYALTY_PROGRAMME = "LH Rewards";

/** Display label for the loyalty currency. The backend key stays "points". */
export const MILES_LABEL = "Miles";

/** Display unit for loyalty currency. */
export const MILES_UNIT = "Miles";

/** Display label for the spendable economy currency. */
export const CREDITS_LABEL = "LH Credits";

/** Display unit for the spendable economy currency. */
export const CREDITS_UNIT = "LH Credits";

/** Starter status tiers. Do not use real-airline tier names. */
export const TIERS = ["Traveller", "Navigator", "Captain"];

/** Ad tier display names. Prices and durations are unchanged. */
export const AD_TIERS = ["Basic", "Featured", "Premium", "Spotlight"];

/** Footer disclaimer text, verbatim from DESIGN.md section 7. */
export const FOOTER_DISCLAIMER =
  "Lufthansa PTFS is an unofficial Roblox virtual airline community. It is not affiliated with, endorsed by, or operated by Deutsche Lufthansa AG or any real-world loyalty programme. All in-game balances are fictional and hold no cash value.";

/** Canonical page-title suffix: `{Page} | Lufthansa PTFS`. */
export const TITLE_SUFFIX = `| ${COMMUNITY_NAME}`;

/** Default locale and timezone for the old VietJet build. */
export const DEFAULT_LOCALE = "en-US";
export const DEFAULT_TIMEZONE = "UTC";

/** Discord Components V2 accent colours, integer form.
 *  Defined once here so message builders never contain raw integers. */
export const ACCENT = {
  DEFAULT: 16755968,     // #FFAD00 yellow — tickets, flights, rewards, ads
  TICKET: 7392244,       // blue — ticket main menu and ticket flows
  CAREERS: 6000111,      // #5B8DEF sky  — careers and informational
  SUCCESS: 1802059,      // #1B7F4B      — accepted, completed
  DANGER: 11740702,      // #B3261E      — denied, cancelled, error
  BRAND_NAVY: 333389,    // #05164D      — only where a light bg is guaranteed
};

export default {
  FLIGHT_PREFIX,
  COMMUNITY_NAME,
  AIRLINE_NAME,
  LOYALTY_PROGRAMME,
  MILES_LABEL,
  MILES_UNIT,
  CREDITS_LABEL,
  CREDITS_UNIT,
  TIERS,
  AD_TIERS,
  FOOTER_DISCLAIMER,
  TITLE_SUFFIX,
  DEFAULT_LOCALE,
  DEFAULT_TIMEZONE,
  ACCENT,
};