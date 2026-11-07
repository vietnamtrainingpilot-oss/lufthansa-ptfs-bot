/**
 * /ads purchase — Select an ad tier and open a ticket.
 */
import { SlashCommandBuilder } from "discord.js";
import { isStaffAuthorized } from "../utils/permissions.js";
import { purchaseAd } from "../services/ads.js";
import config from "../config/config.js";
import { buildText } from "../utils/builders.js";

const TIERS = [
  { name: "VietJet Basic (45 Robux, 1 day)", value: "basic" },
  { name: "VietJet Featured (125 Robux, 2 days)", value: "featured" },
  { name: "VietJet Premium (320 Robux, 4 days)", value: "premium" },
  { name: "VietJet Spotlight (600 Robux, 7 days)", value: "spotlight" },
];

export const data = new SlashCommandBuilder()
  .setName("ads")
  .setDescription("Manage paid advertisements (staff)")
  .addSubcommand((s) =>
    s.setName("purchase").setDescription("Open an ad purchase ticket").addStringOption((o) =>
      o.setName("tier").setDescription("Ad tier").setRequired(true).addChoices(...TIERS)
    )
  );

export async function execute(interaction, client) {
  const staffRoles = [config.roleBoardOfDirectors, config.roleManagementTeam];
  if (!(await isStaffAuthorized(client, interaction.user.id, staffRoles))) {
    return interaction.reply({ ...buildText("Staff only."), ephemeral: true });
  }

  const tierId = interaction.options.getString("tier");
  await interaction.deferReply({ flags: 32768, ephemeral: true });

  try {
    const result = await purchaseAd(interaction.member, tierId, client);
    await interaction.editReply(buildText(`Order ${result.id} created for tier **${tierId}**. Ticket opened.`));
  } catch (e) {
    await interaction.editReply({ ...buildText("Failed: " + e.message) });
  }
}
