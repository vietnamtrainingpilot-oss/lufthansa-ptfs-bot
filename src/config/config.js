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
  "TICKETS_CATEGORY_ID",
  "TICKETS_LOG_CHANNEL_ID",
  "ROLE_ID_BOARD_OF_DIRECTORS",
  "ROLE_ID_MANAGEMENT_TEAM",
  "STAFF_PING_ROLE_ID",
  "CAREER_SETUP_CHANNEL_ID",
  "CAREER_REVIEW_CHANNEL_ID",
  "CAREER_RESULTS_ANNOUNCE_CHANNEL_ID",
  "SUPPORT_CONTACT_CHANNEL_ID",
  "ROLE_ID_FLIGHT_DECK",
  "ROLE_ID_CABIN_CREW",
  "ROLE_ID_GROUND_CREW",
  "ROLE_ID_FLIGHT_OPERATOR",
  "ROLE_ID_HUMAN_RESOURCES",
  "ROLE_ID_PUBLIC_RELATIONS",
  "FLIGHT_ANNOUNCE_CHANNEL_ID",
  "FLIGHT_BRIEFING_CHANNEL_ID",
  "FLIGHT_LOG_CHANNEL_ID",
  "ROLE_ID_FLIGHT_OPS_COMMANDS",
  "FLIGHT_PING_ROLE_ID_1",
  "FLIGHT_PING_ROLE_ID_2",
  "FLIGHT_BOOKING_STAFF_CHANNEL_ID",
  "BOOKING_WEBSITE_BASE_URL",
  "BOOKING_WEBHOOK_SECRET",
  "BOOKING_API_PORT",
  "REWARDS_LOG_CHANNEL_ID",
  "ROLE_ID_REWARDS_LEVEL_1",
  "ROLE_ID_REWARDS_LEVEL_2",
  "ROLE_ID_REWARDS_LEVEL_3",
  "ADS_CHANNEL_ID",
  "ADS_SALES_CONTACT_USER_ID",
  "ROLE_ID_PARTNER",
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
  guildIdMain: process.env.GUILD_ID_MAIN,
  // Public Discord invite shown by the website's "Join Discord" calls to
  // action. Served from /api/site/config so the site never hardcodes it.
  discordInviteUrl: process.env.DISCORD_INVITE_URL || "",
  guildIdStaff: process.env.GUILD_ID_STAFF,

  // Firebase
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY,

  // Tickets
  ticketsCategoryId: process.env.TICKETS_CATEGORY_ID,
  ticketsLogChannelId: process.env.TICKETS_LOG_CHANNEL_ID,
  roleBoardOfDirectors: process.env.ROLE_ID_BOARD_OF_DIRECTORS,
  roleManagementTeam: process.env.ROLE_ID_MANAGEMENT_TEAM,
  staffPingRoleId: process.env.STAFF_PING_ROLE_ID,
  ticketViewRoleIds: roleIds("ROLE_IDS_TICKET_VIEW"),
  // Optional banner images shown in the ticket Main Menu. Left empty, the
  // matching media gallery is simply omitted.
  ticketBannerTopUrl: process.env.TICKET_BANNER_TOP_URL || null,
  ticketBannerBottomUrl: process.env.TICKET_BANNER_BOTTOM_URL || null,
  // Roles explicitly denied access to ticket channels. Re-applied every time
  // ticket permissions are rebuilt.
  ticketBlockedRoleIds: roleIds("ROLE_IDS_TICKET_BLOCKED"),

  // Careers
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

  // Website / Booking API
  websiteBaseUrl: process.env.WEBSITE_BASE_URL,
  websiteSessionSecret: process.env.WEBSITE_SESSION_SECRET,
  discordOAuthClientSecret: process.env.DISCORD_OAUTH_CLIENT_SECRET,

  // Flight Operations
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

  // Loyalty programme (display labels come from src/config/brand.js)
  rewardsLogChannelId: process.env.REWARDS_LOG_CHANNEL_ID,
  rewardsLevel1RoleId: process.env.ROLE_ID_REWARDS_LEVEL_1,
  rewardsLevel2RoleId: process.env.ROLE_ID_REWARDS_LEVEL_2,
  rewardsLevel3RoleId: process.env.ROLE_ID_REWARDS_LEVEL_3,

  // Paid Ads
  adsChannelId: process.env.ADS_CHANNEL_ID,
  adsSalesContactUserId: process.env.ADS_SALES_CONTACT_USER_ID,
  adsPartnerRoleId: process.env.ROLE_ID_PARTNER,

  // Ops
  botOwnerId: process.env.BOT_OWNER_ID,
  errorLogChannelId: process.env.ERROR_LOG_CHANNEL_ID,
};

export default config;
