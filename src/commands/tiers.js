/**
 * /tiers — Manage membership tiers (admin)
 */
import { SlashCommandBuilder } from "discord.js";
import { getDb } from "../services/firestore.js";
import { isStaffAuthorized } from "../utils/permissions.js";
import config from "../config/config.js";
import { TIERS } from "../services/members.js";
import { buildText } from "../utils/builders.js";

export const data = new SlashCommandBuilder()
  .setName("tiers")
  .setDescription("Manage membership tiers (admin)")
  .addSubcommand(s => s.setName("view").setDescription("View current tier configuration"))
  .addSubcommand(s => s.setName("set-points").setDescription("Set status points threshold")
    .addStringOption(o => o.setName("tier").setDescription("Tier name").setRequired(true)
      .addChoices(
        { name: "Frequent Traveller", value: "frequent_traveler" },
        { name: "Senator", value: "senator" },
        { name: "HON Circle", value: "hon_circle" }
      ))
    .addIntegerOption(o => o.setName("points").setDescription("Status points threshold").setRequired(true)));

export async function execute(interaction) {
  const staffRoles = [config.roleBoardOfDirectors, config.roleManagementTeam];
  if (!await isStaffAuthorized(interaction.client, interaction.user.id, staffRoles)) {
    return interaction.reply({ ...buildText("Unauthorized."), ephemeral: true });
  }
  const sub = interaction.options.getSubcommand();
  try {
    if (sub === "view") {
      const lines = ["**Membership Tiers**", "", ...Object.entries(TIERS).map(([t, c]) =>
        `• ${c.label}: ${c.statusPoints} status points`
      )];
      return interaction.reply({ ...buildText(lines.join("\n")), ephemeral: true });
    }
    if (sub === "set-points") {
      const tier = interaction.options.getString("tier");
      const points = interaction.options.getInteger("points");
      const db = getDb();
      await db.collection("config").doc("mileageTiers").update({ [tier]: { statusPoints: points, label: tier.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) } });
      return interaction.reply({ ...buildText(`Updated ${tier} threshold to ${points} status points.`), ephemeral: true });
    }
  } catch (e) {
    return interaction.reply({ ...buildText(`Failed: ${e.message}`), ephemeral: true });
  }
}

export default { data, execute };