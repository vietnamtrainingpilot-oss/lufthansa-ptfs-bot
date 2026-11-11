/**
 * config.js — single source of truth for all environment variables.
 * Validates required vars on boot and crashes loudly if any are missing.
 */

import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const REQUIRED = [
  "DISCORD_BOT_TOKEN",
  "DISCORD_CLIENT_ID",
  "GUILD_ID_MAIN",
  "GUILD_ID_STAFF",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "ROLE_ID_BOARD_OF_DIRECTORS",
  "ROLE_ID_MANAGEMENT_TEAM",
  "FLIGHT_ANNOUNCE_CHANNEL_ID",
  "FLIGHT_BRIEFING_CHANNEL_ID",
  "FLIGHT_LOG_CHANNEL_ID",
  "FLIGHT_PING_ROLE_ID_1",
  "FLIGHT_PING_ROLE_ID_2",
  "FLIGHT_BOOKING_STAFF_CHANNEL_ID",
  "COUPON_LOG_CHANNEL_ID",
  "ROLE_ID_MILEAGE_SUPPORT",
  "ROLE_ID_ANNOUNCE",
  "BOT_OWNER_ID",
  "ERROR_LOG_CHANNEL_ID",
];

const missing = REQUIRED.filter((k) => !process.env[k]);

/**
 * Enforce env completeness. Called explicitly by the bot entry point at boot so
 * the module stays importable by unit tests that do not need credentials.
 * Crashes loudly (non-zero exit) rather than silently degrading.
 */
export function assertConfigComplete() {
  if (missing.length === 0) return true;
  console.error("[config] FATAL: Missing required environment variables:");
  for (const k of missing) {
    console.error(`  - ${k}`);
  }
  console.error(
    "\n[config] Copy .env.example to .env and fill in all values before starting."
  );
  process.exit(1);
}

/** True when every required variable is present. */
export function isConfigComplete() {
  return missing.length === 0;
}

export { missing as MISSING_ENV_VARS };

// Helper: parse comma-separated role IDs into an array.
function roleIds(key) {
  const v = process.env[key];
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const config = {
  // Core
  token: process.env.DISCORD_BOT_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
  nodeEnv: process.env.NODE_ENV || "production",
  timerPollIntervalSeconds: parseInt(process.env.TIMER_POLL_INTERVAL_SECONDS, 10) || 30,

  // Guilds
  discordInviteUrl: process.env.DISCORD_INVITE_URL || "",
  guildIdMain: process.env.GUILD_ID_MAIN,
  guildIdStaff: process.env.GUILD_ID_STAFF,

  // Firebase
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY,

  // Ticket
  ticketsCategoryId: process.env.TICKETS_CATEGORY_ID,
  ticketsLogChannelId: process.env.TICKETS_LOG_CHANNEL_ID,
  roleBoardOfDirectors: process.env.ROLE_ID_BOARD_OF_DIRECTORS,
  roleManagementTeam: process.env.ROLE_ID_MANAGEMENT_TEAM,
  staffPingRoleId: process.env.STAFF_PING_ROLE_ID,
  ticketViewRoleIds: roleIds("ROLE_IDS_TICKET_VIEW"),
  ticketBlockedRoleIds: roleIds("ROLE_IDS_TICKET_BLOCKED"),
  ticketBannerTopUrl: process.env.TICKET_BANNER_TOP_URL || null,
  ticketBannerBottomUrl: process.env.TICKET_BANNER_BOTTOM_URL || null,

  // Flight Ops
  careerSetupChannelId: process.env.CAREER_SETUP_CHANNEL_ID,
  careerReviewChannelId: process.env.CAREER_REVIEW_CHANNEL_ID,
  careerResultsAnnounceChannelId: process.env.CAREER_RESULTS_ANNOUNCE_CHANNEL_ID,
  supportContactChannelId: process.env.SUPPORT_CONTACT_CHANNEL_ID,
  roleFlightDeck: process.env.ROLE_ID_FLIGHT_DECK,
  roleCabinCrew: process.env.ROLE_ID_CABIN_CREW,
  roleGroundCrew: process.env.ROLE_ID_GROUND_CREW,
  roleFlightOperator: process.env.ROLE_ID_FLIGHT_OPERATOR,
  roleHumanResources: process.env.ROLE_ID_HUMAN_RESOURCES,
  rolePublicRelations: process.env.ROLE_ID_PUBLIC_RELATIONS,

  // Flight Ops
  flightAnnounceChannelId: process.env.FLIGHT_ANNOUNCE_CHANNEL_ID,
  flightBriefingChannelId: process.env.FLIGHT_BRIEFING_CHANNEL_ID,
  flightLogChannelId: process.env.FLIGHT_LOG_CHANNEL_ID,
  flightOpsCommandsRoleId: process.env.ROLE_ID_FLIGHT_OPS_COMMANDS,
  flightPingRoleId1: process.env.FLIGHT_PING_ROLE_ID_1,
  flightPingRoleId2: process.env.FLIGHT_PING_ROLE_ID_2,
  flightBookingStaffChannelId: process.env.FLIGHT_BOOKING_STAFF_CHANNEL_ID,
  bookingWebsiteBaseUrl: process.env.BOOKING_WEBSITE_BASE_URL,
  bookingWebhookSecret: process.env.BOOKING_WEBHOOK_SECRET,
  bookingApiPort: parseInt(process.env.BOOKING_API_PORT, 10) || 3001,

  // Mileage & More
  mileageSupportRoleId: process.env.ROLE_ID_MILEAGE_SUPPORT,
  tierRoleIds: {
    frequentTraveler: process.env.ROLE_ID_FREQUENT_TRAVELLER || null,
    senator: process.env.ROLE_ID_SENATOR || null,
    honCircle: process.env.ROLE_ID_HON_circle || null,
  },
  airports: {
    HAN: { name: "Hanz", iata: "HAN", timezone: "Asia/Hanoi", offsetsFromUTC: 7 },
    MUC: { name: "Munich", iata: "MUC", timezone: "Europe/Berlin", offsetsFromUTC: 1 },
    FRA: { name: "Frankfurt", iata: "FRA", timezone: "Europe/Berlin", offsetsFromUTC: 1 },
    VRN: { name: "Vienna", iata: "VRN", timezone: "Europe/Vienna", offsetsFromUTC: 1 },
    SIF: { name: "Simeulue", iata: "SIF", timezone: "Asia/Jakarta", offsetsFromUTC: 7 },
  },

  // Loyalty programme (display labels come from src/config/brand.js)
  rewardsLogChannelId: process.env.REWARDS_LOG_CHANNEL_ID,
  rewardsLevel1RoleId: process.env.ROLE_ID_REWARDS_LEVEL_1,
  rewardsLevel2RoleId: process.env.ROLE_ID_REWARDS_LEVEL_2,
  rewardsLevel3RoleId: process.env.ROLE_ID_REWARDS_LEVEL_3,

  // Paid Ads
  adsChannelId: process.env.ADS_CHANNEL_ID,
  adsSalesContactUserId: process.env.ADS_SALES_CONTACT_USER_ID,
  adsPartnerRoleId: process.env.ROLE_ID_PARTNER,
};

export default config;
