/**
 * interactions.js — Central interaction router
 */
import * as flightHandlers from "./flights.js";
import * as bookingHandlers from "./booking.js";
import * as rewardHandlers from "./rewards.js";
import * as adHandlers from "./ads.js";
import * as loyaltyHandlers from "./loyalty.js";

export async function handleInteraction(interaction, client) {
  if (!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;
  const customId = interaction.customId || "";

  if (customId.startsWith("flight_claim_")) return flightHandlers.handleFlightClaim(interaction, client);
  if (customId.startsWith("flight_staff_click_")) return flightHandlers.handleFlightStaffClick(interaction, client);
  if (customId.startsWith("book_flight_") && !customId.startsWith("book_flight_modal_")) return bookingHandlers.handleBookFlightButton(interaction);
  if (customId.startsWith("book_flight_modal_")) return bookingHandlers.handleBookFlightModal(interaction, client);
  if (customId === "rewards_profile" || customId === "rewards_leaderboard") return rewardHandlers.handleRewardsInteraction(interaction, client);
  if (customId.startsWith("redeem_") || customId.startsWith("buy_") || customId.startsWith("mission_claim") ||
      customId.startsWith("missions_show") || customId.startsWith("fulfil_") || customId.startsWith("refund_")) {
    return loyaltyHandlers.handleLoyaltyInteraction(interaction, client);
  }
  if (customId.startsWith("ads_tier_")) return adHandlers.handleAdsTierSelect(interaction, client);
}

export default { handleInteraction };