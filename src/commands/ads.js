/**
 * /ads — Paid advertisement management (staff)
 */
import { SlashCommandBuilder } from "discord.js";
import { isStaffAuthorized } from "../utils/permissions.js";
import { purchaseAd } from "../services/ads.js";
import config from "../config/config.js";
import { buildText } from "../utils/builders.js";

export const data = new SlashCommandBuilder()
  .setName("ads")
  .setDescription("Manage paid advertisements (staff)")
  .addSubcommand((s) =>
    s.setName("purchase").setDescription("Open an ad purchase ticket").addStringOption((o) =>
      o.setName("tier").setDescription("Ad tier").setRequired(true).addChoices(
        { name: "Basic (45 Robux, 1 day)", value: "basic" },
        { name: "Featured (125 Robux, 2 days)", value: "featured" },
        { name: "Premium (320 Robux, 4 days)", value: "premium" },
        { name: "Spotlight (600 Robux, 7 days)", value: "spotlight" }
      )
    )
  );

export async function execute(interaction, client) {
  const staffRoles = [config.roleBoardOfDirectors, config.roleManagementTeam];
  if (!(await isStaffAuthorized(client, interaction.user.id, staffRoles))) {
    return interaction.reply({ ...buildText("Staff only."), ephemeral: true });
  }

  const sub = interaction.options.getSubcommand();
  if (sub !== "purchase") {
    return interaction.reply({ ...buildText("Unknown subcommand."), ephemeral: true });
  }

  const tierId = interaction.options.getString("tier");

  try {
    await interaction.deferReply({ flags: 32768, ephemeral: true });
    const result = await purchaseAd(interaction.member, tierId, client);
    return interaction.editReply(buildText(
      `Order **${result.id}** created for tier **${tierId}**.\n` +
      `Ticket: <#${result.ticket.channelId}>\n` +
      (result.partnerDiscountEligible ? "Partner discount eligible — staff to confirm." : "")
    ));
  } catch (e) {
    return interaction.editReply({ ...buildText("Failed: " + e.message) });
  }
}

export default { data, execute };