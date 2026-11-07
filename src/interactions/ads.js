/**
 * adsInteractions.js — Paid ads interaction handlers.
 */

import { isStaffAuthorized } from "../utils/permissions.js";
import adsService from "../services/ads.js";
import config from "../config/config.js";
import { buildText } from "../utils/builders.js";

/**
 * Handle tier selection from ads purchase menu.
 */
export async function handleAdsTierSelect(interaction, client) {
  // Parse: ads_tier_<tierId>
  const tierId = interaction.customId.replace("ads_tier_", "");
  const tier = adsService.TIERS.find((t) => t.id === tierId);

  if (!tier) {
    return interaction.reply({ ...buildText("Invalid tier."), ephemeral: true });
  }

  const staffRoles = [config.roleBoardOfDirectors, config.roleManagementTeam];
  if (!(await isStaffAuthorized(client, interaction.user.id, staffRoles))) {
    return interaction.reply({ ...buildText("Staff only."), ephemeral: true });
  }

  try {
    const result = await adsService.purchaseAd(interaction.member, tierId, client);
    await interaction.reply({
      ...buildText(`Order ${result.id} created for ${tier.name}. Ticket opened.`),
      ephemeral: true,
    });
  } catch (e) {
    console.error("[ads] purchaseAd failed:", e.message);
    await interaction.reply({
      ...buildText("Failed to create order: " + e.message),
      ephemeral: true,
    });
  }
}

export default { handleAdsTierSelect };
