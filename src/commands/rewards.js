/**
 * /rewards — Reward management commands (staff)
 */
import { SlashCommandBuilder } from "discord.js";
import { addReward, removeReward, listRewards } from "../services/redemptions.js";
import { isStaffAuthorized } from "../utils/permissions.js";
import config from "../config/config.js";
import { buildText } from "../utils/builders.js";

export const data = new SlashCommandBuilder()
  .setName("rewards")
  .setDescription("Manage rewards catalog (staff)")
  .addSubcommand(s => s.setName("add").setDescription("Add a new reward")
    .addStringOption(o => o.setName("name").setDescription("Reward name").setRequired(true))
    .addStringOption(o => o.setName("description").setDescription("Description").setRequired(false))
    .addIntegerOption(o => o.setName("cost").setDescription("Cost in Award Miles").setRequired(true))
    .addIntegerOption(o => o.setName("stock").setDescription("Stock (0 for unlimited)").setRequired(false))
    .addStringOption(o => o.setName("category").setDescription("Category").setRequired(false)))
  .addSubcommand(s => s.setName("remove").setDescription("Remove a reward")
    .addStringOption(o => o.setName("reward_id").setDescription("Reward ID").setRequired(true)))
  .addSubcommand(s => s.setName("list").setDescription("List all rewards"));

export async function execute(interaction) {
  const staffRoles = [config.roleBoardOfDirectors, config.roleManagementTeam];
  if (!await isStaffAuthorized(interaction.client, interaction.user.id, staffRoles)) {
    return interaction.reply({ ...buildText("Unauthorized."), ephemeral: true });
  }
  const sub = interaction.options.getSubcommand();
  try {
    if (sub === "add") {
      await addReward({
        name: interaction.options.getString("name"),
        description: interaction.options.getString("description"),
        price: interaction.options.getInteger("cost"),
        category: interaction.options.getString("category") || "General",
        stock: interaction.options.getInteger("stock"),
      });
      return interaction.reply({ ...buildText("Reward added to the catalog."), ephemeral: true });
    }
    if (sub === "remove") {
      await removeReward(interaction.options.getString("reward_id"));
      return interaction.reply({ ...buildText("Reward removed from the catalog."), ephemeral: true });
    }
    if (sub === "list") {
      const rewards = await listRewards();
      if (rewards.length === 0) return interaction.reply({ ...buildText("No rewards in the catalog."), ephemeral: true });
      const lines = ["**Rewards Catalog**", "", ...rewards.map(r =>
        `• ${r.name} — ${r.price.toLocaleString()} miles${r.stock !== null ? ` (stock: ${r.stock})` : ""}`
      )];
      return interaction.reply({ ...buildText(lines.join("\n")), ephemeral: true });
    }
  } catch (e) {
    return interaction.reply({ ...buildText(`Error: ${e.message}`), ephemeral: true });
  }
}

export default { data, execute };
