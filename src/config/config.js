/**
 * config.js — Single source of truth for all environment variables.
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
  "ROLE_ID_MILEAGE_SUPPORT",
  "ROLE_ID_ANNOUNCE",
  "BOT_OWNER_ID",
  "ERROR_LOG_CHANNEL_ID",
];

const missing = REQUIRED.filter((k) => !process.env[k]);

export function assertConfigComplete() {
  if (missing.length === 0) return true;
  console.error("[config] FATAL: Missing required environment variables:");
  for (const k of missing) console.error(`  - ${k}`);
  console.error("\n[config] Copy .env.example to .env and fill in all values before starting.");
  process.exit(1);
}

export function isConfigComplete() {
  return missing.length === 0;
}

export { missing as MISSING_ENV_VARS };

function roleIds(key) {
  const v = process.env[key];
  if (!v) return [];
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

export const config = {
  token: process.env.DISCORD_BOT_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
  nodeEnv: process.env.NODE_ENV || "production",
  timerPollIntervalSeconds: parseInt(process.env.TIMER_POLL_INTERVAL_SECONDS, 10) || 30,
  discordInviteUrl: process.env.DISCORD_INVITE_URL || "",
  guildIdMain: process.env.GUILD_ID_MAIN,
  guildIdStaff: process.env.GUILD_ID_STAFF,
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY,
  roleBoardOfDirectors: process.env.ROLE_ID_BOARD_OF_DIRECTORS,
  roleManagementTeam: process.env.ROLE_ID_MANAGEMENT_TEAM,
  flightAnnounceChannelId: process.env.FLIGHT_ANNOUNCE_CHANNEL_ID,
  flightBriefingChannelId: process.env.FLIGHT_BRIEFING_CHANNEL_ID,
  flightLogChannelId: process.env.FLIGHT_LOG_CHANNEL_ID,
  flightPingRoleId1: process.env.FLIGHT_PING_ROLE_ID_1,
  flightPingRoleId2: process.env.FLIGHT_PING_ROLE_ID_2,
  flightBookingStaffChannelId: process.env.FLIGHT_BOOKING_STAFF_CHANNEL_ID,
  mileageSupportRoleId: process.env.ROLE_ID_MILEAGE_SUPPORT,
  announceRoleId: process.env.ROLE_ID_ANNOUNCE,
  botOwnerId: process.env.BOT_OWNER_ID,
  errorLogChannelId: process.env.ERROR_LOG_CHANNEL_ID,
  tierRoleIds: {
    frequentTraveler: process.env.ROLE_ID_FREQUENT_TRAVELLER || null,
    senator: process.env.ROLE_ID_SENATOR || null,
    honCircle: process.env.ROLE_ID_HON_CIRCLE || null,
  },
};

export default config;