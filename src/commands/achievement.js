/**
 * /achievement — Achievement management commands (staff)
 */
import { SlashCommandBuilder } from "discord.js";
import {
  SYSTEM_ACHIEVEMENTS, seedAchievements, checkAchievements,
  listAchievements, addCustomAchievement, editAchievement,
  removeAchievement, resetAchievements,
} from "../services/achievements.js";
import { isStaffAuthorized } from "../utils/permissions.js";
import config from "../config/config.js";
import { buildText } from "../utils/builders.js";

export const data = new SlashCommandBuilder()
  .setName("achievement")
  .setDescription("Manage achievements (admin)")
  .addSubcommand(s => s.setName("add").setDescription("Create a custom achievement")
    .addStringOption(o => o.setName("name").setDescription("Name").setRequired(true))
    .addStringOption(o => o.setName("description").setDescription("Description").setRequired(true))
    .addStringOption(o => o.setName("type").setDescription("Type").setRequired(true)
      .addChoices(
        { name: "Flight Count", value: "flight_count" },
        { name: "Lifetime Miles", value: "lifetime_miles" },
        { name: "Daily Streak", value: "daily_streak" },
        { name: "Tier Reached", value: "tier" }
      ))
    .addIntegerOption(o => o.setName("target").setDescription("Target value").setRequired(false))
    .addIntegerOption(o => o.setName("reward_miles").setDescription("Award Miles on unlock").setRequired(false))
    .addStringOption(o => o.setName("visibility").setDescription("Visibility").setRequired(false)
      .addChoices({ name: "Visible", value: "visible" }, { name: "Hidden", value: "hidden" })))
  .addSubcommand(s => s.setName("edit").setDescription("Edit an existing achievement")
    .addStringOption(o => o.setName("id").setDescription("Achievement ID").setRequired(true))
    .addStringOption(o => o.setName("name").setDescription("New name").setRequired(false))
    .addStringOption(o => o.setName("description").setDescription("New description").setRequired(false))
    .addIntegerOption(o => o.setName("target").setDescription("New target").setRequired(false))
    .addIntegerOption(o => o.setName("reward_miles").setDescription("New reward miles").setRequired(false))
    .addBooleanOption(o => o.setName("enabled").setDescription("Toggle enabled").setRequired(false))
    .addStringOption(o => o.setName("visibility").setDescription("New visibility").setRequired(false)))
  .addSubcommand(s => s.setName("remove").setDescription("Archive an achievement")
    .addStringOption(o => o.setName("id").setDescription("Achievement ID").setRequired(true)))
  .addSubcommand(s => s.setName("reset").setDescription("Reset custom achievements")
    .addBooleanOption(o => o.setName("confirm").setDescription("Confirm destructive action").setRequired(true)))
  .addSubcommand(s => s.setName("list").setDescription("List all achievements"))
  .addSubcommand(s => s.setName("seed").setDescription("Re-seed system achievements"));

export async function execute(interaction) {
  const staffRoles = [config.roleBoardOfDirectors, config.roleManagementTeam];
  if (!await isStaffAuthorized(interaction.client, interaction.user.id, staffRoles)) {
    return interaction.reply({ ...buildText("Unauthorized."), ephemeral: true });
  }
  const sub = interaction.options.getSubcommand();
  try {
    if (sub === "add") {
      const id = await addCustomAchievement({
        name: interaction.options.getString("name"),
        description: interaction.options.getString("description"),
        type: interaction.options.getString("type"),
        target: interaction.options.getInteger("target"),
        rewardMiles: interaction.options.getInteger("reward_miles") || 0,
        visibility: interaction.options.getString("visibility") || "visible",
        createdBy: interaction.user.id,
      });
      return interaction.reply({ ...buildText(`Custom achievement created with ID: ${id}`), ephemeral: true });
    }
    if (sub === "edit") {
      const updates = {};
      const name = interaction.options.getString("name");
      if (name) updates.name = name;
      const desc = interaction.options.getString("description");
      if (desc) updates.description = desc;
      const target = interaction.options.getInteger("target");
      if (target !== null) updates.target = target;
      const rewardMiles = interaction.options.getInteger("reward_miles");
      if (rewardMiles !== null) updates.rewardMiles = rewardMiles;
      const enabled = interaction.options.getBoolean("enabled");
      if (enabled !== null) updates.enabled = enabled;
      const visibility = interaction.options.getString("visibility");
      if (visibility) updates.visible = visibility !== "hidden";
      await editAchievement(interaction.options.getString("id"), updates);
      return interaction.reply({ ...buildText("Achievement updated."), ephemeral: true });
    }
    if (sub === "remove") {
      await removeAchievement(interaction.options.getString("id"));
      return interaction.reply({ ...buildText("Achievement archived."), ephemeral: true });
    }
    if (sub === "reset") {
      const confirm = interaction.options.getBoolean("confirm");
      const result = await resetAchievements(confirm);
      const msg = result.reset ? `Removed ${result.removed} custom achievements.` : "Confirmation required. Use --confirm true.";
      return interaction.reply({ ...buildText(msg), ephemeral: true });
    }
    if (sub === "list") {
      const sys = SYSTEM_ACHIEVEMENTS.map(a => `• [System] ${a.name}: ${a.description} (${a.type} → ${a.target || "—"})`).join("\n");
      return interaction.reply({ ...buildText(`**System Achievements (${SYSTEM_ACHIEVEMENTS.length})**\n\n${sys}`), ephemeral: true });
    }
    if (sub === "seed") {
      await seedAchievements();
      return interaction.reply({ ...buildText("System achievements seeded."), ephemeral: true });
    }
  } catch (e) {
    return interaction.reply({ ...buildText(`Error: ${e.message}`), ephemeral: true });
  }
}

export default { data, execute };
