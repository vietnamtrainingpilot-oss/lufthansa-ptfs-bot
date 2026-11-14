/**
 * permissions.js — cross-guild staff authorization helpers.
 *
 * CRITICAL: staff permission checks are cross-guild. A user's ability to
 * claim a ticket, review a career application, etc. is determined by their
 * roles in the Staff guild, not the Main guild — even though the ticket
 * channel itself lives in Main.
 */

import config from "../config/config.js";

/**
 * Check whether a Discord user is authorized for a set of required roles,
 * resolved against the Staff guild (cross-guild check).
 *
 * @param {import("discord.js").Client} client
 * @param {string} discordUserId
 * @param {string[]} requiredRoleIds
 * @returns {Promise<boolean>}
 */
export async function isStaffAuthorized(client, discordUserId, requiredRoleIds) {
  try {
    const staffGuild = await client.guilds.fetch(config.guildIdStaff);
    const member = await staffGuild.members.fetch(discordUserId).catch(() => null);
    if (!member) return false;
    return requiredRoleIds.some((id) => member.roles.cache.has(id));
  } catch (e) {
    console.error("[permissions] isStaffAuthorized error:", e.message);
    return false;
  }
}

/**
 * Flatten an env value into a deduped list of Discord role IDs. Handles both
 * single-role keys (e.g. ROLE_ID_*_COMMANDS) and multi-role comma lists.
 * Returns empty array when nothing is configured — callers must still
 * decide whether that means "deny" or "allow all".
 */
function resolveRoleIds(...keys) {
  const set = new Set();
  for (const key of keys) {
    const raw = process.env[key];
    if (!raw) continue;
    for (const id of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
      set.add(id);
    }
  }
  return Array.from(set);
}

/**
 * Flight-ops authorization: ROLE_ID_FLIGHT_OPS_COMMANDS in Main guild, OR
 * BoD/Management in Staff guild (admin override).
 */
export async function isFlightOpsAuthorized(client, discordUserId) {
  try {
    const flightOpsIds = resolveRoleIds("ROLE_ID_FLIGHT_OPS_COMMANDS");
    if (flightOpsIds.length > 0) {
      const mainGuild = await client.guilds.fetch(config.guildIdMain);
      const member = await mainGuild.members.fetch(discordUserId).catch(() => null);
      if (member && flightOpsIds.some((id) => member.roles.cache.has(id))) return true;
    }
    // Admin override: board or management roles in Staff guild
    return isStaffAuthorized(client, discordUserId, [
      config.roleBoardOfDirectors,
      config.roleManagementTeam,
    ]);
  } catch (e) {
    console.error("[permissions] isFlightOpsAuthorized error:", e.message);
    return false;
  }
}

/**
 * Check whether a user can interact with a ticket channel.
 * Opener and claimer always pass; otherwise must hold a ticket-view role.
 */
export function canViewTicket(member, openerId, claimerId) {
  if (member.id === openerId || member.id === claimerId) return true;
  const ticketViewIds = resolveRoleIds("ROLE_ID_TICKET_VIEW");
  if (!ticketViewIds.length) return false;
  return ticketViewIds.some((id) => member.roles.cache.has(id));
}

export default {
  isStaffAuthorized,
  isFlightOpsAuthorized,
  canViewTicket,
};