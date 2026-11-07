/**
 * interactions.js — Central interaction router.
 * Routes all component interactions to their handlers.
 */

import * as ticketHandlers from "./tickets.js";
import * as careerHandlers from "./careers.js";
import * as flightHandlers from "./flights.js";
import * as rewardHandlers from "./rewards.js";
import * as adHandlers from "./ads.js";
import * as loyaltyHandlers from "./loyalty.js";

import config from "../config/config.js";

/**
 * Handle any interaction (button, select menu, modal submit).
 *
 * @param {import('discord.js').Interaction} interaction
 * @param {import('discord.js').Client} client
 */
export async function handleInteraction(interaction, client) {
  if (!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;

  const customId = interaction.customId || "";

  // ── Tickets ──
  if (customId === "ticket_type_select") {
    return ticketHandlers.handleTicketTypeSelect(interaction, client);
  }
  if (customId === "ticket_claim") {
    return ticketHandlers.handleTicketClaim(interaction, client);
  }
  if (customId === "ticket_unclaim") {
    return ticketHandlers.handleTicketUnclaim(interaction, client);
  }
  if (customId === "ticket_close") {
    return ticketHandlers.handleTicketClose(interaction, client);
  }
  if (customId === "ticket_close_confirm") {
    return ticketHandlers.handleTicketCloseConfirm(interaction, client);
  }
  if (customId === "ticket_close_cancel") {
    return ticketHandlers.handleTicketCloseCancel(interaction, client);
  }

  // ── Careers ──
  if (customId === "career_department_select") {
    return careerHandlers.handleCareerDepartmentSelect(interaction, client);
  }
  if (customId.startsWith("career_agree_")) {
    return careerHandlers.handleCareerAgree(interaction, client);
  }
  if (customId.startsWith("career_disagree_")) {
    return careerHandlers.handleCareerDisagree(interaction, client);
  }
  if (customId.startsWith("career_accept_")) {
    return careerHandlers.handleCareerAccept(interaction, client);
  }
  if (customId.startsWith("career_deny_")) {
    return careerHandlers.handleCareerDeny(interaction, client);
  }

  // ── Flight Ops ──
  if (customId.startsWith("flight_claim_")) {
    return flightHandlers.handleFlightClaim(interaction, client);
  }
  if (customId.startsWith("flight_staff_click_")) {
    return flightHandlers.handleFlightStaffClick(interaction, client);
  }

  // ── Rewards ──
  if (customId === "rewards_profile" || customId === "rewards_leaderboard") {
    return rewardHandlers.handleRewardsInteraction(interaction, client);
  }

  // ── Loyalty economy: redeem / buy / missions ──
  if (
    customId.startsWith("redeem_") ||
    customId.startsWith("buy_") ||
    customId.startsWith("mission_claim") ||
    customId.startsWith("missions_show") ||
    customId.startsWith("fulfil_") ||
    customId.startsWith("refund_")
  ) {
    return loyaltyHandlers.handleLoyaltyInteraction(interaction, client);
  }

  // ── Ads ──
  if (customId.startsWith("ads_tier_")) {
    return adHandlers.handleAdsTierSelect(interaction, client);
  }
}

export default { handleInteraction };
