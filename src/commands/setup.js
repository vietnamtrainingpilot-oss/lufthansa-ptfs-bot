/**
 * /setup — Configure earning rules, daily rewards, log channels
 */
import { SlashCommandBuilder } from "discord.js";
import { getDb } from "../services/firestore.js";
import { isStaffAuthorized } from "../utils/permissions.js";
import config from "../config/config.js";
import { buildText } from "../utils/builders.js";

export const data = new SlashCommandBuilder()
  .setName("setup")
  .setDescription("Configure system settings (admin)")
  .addSubcommand(s => s.setName("earning").setDescription("Configure earning rules")
    .addStringOption(o => o.setName("mode").setDescription("Earning mode").setRequired(true)
      .addChoices({ name: "Distance", value: "distance" }, { name: "Flat", value: "flat" }))
    .addIntegerOption(o => o.setName("flat_miles").setDescription("Flat base miles").setRequired(false))
    .addStringOption(o => o.setName("economy").setDescription("Economy multiplier").setRequired(false))
    .addStringOption(o => o.setName("business").setDescription("Business multiplier").setRequired(false))
    .addStringOption(o => o.setName("first").setDescription("First class multiplier").setRequired(false)))
  .addSubcommand(s => s.setName("daily").setDescription("Configure daily rewards")
    .addIntegerOption(o => o.setName("miles").setDescription("Daily miles").setRequired(false))
    .addIntegerOption(o => o.setName("streak_bonus").setDescription("Streak bonus per day").setRequired(false)))
  .addSubcommand(s => s.setName("log-channel").setDescription("Set log channel")
    .addChannelOption(o => o.setName("channel").setDescription("Log channel").setRequired(true)))
  .addSubcommand(s => s.setName("staff-role").setDescription("Set staff role")
    .addRoleOption(o => o.setName("role").setDescription("Staff role").setRequired(true)))
  .addSubcommand(s => s.setName("view").setDescription("View current configuration"));

export async function execute(interaction) {
  const staffRoles = [config.roleBoardOfDirectors, config.roleManagementTeam];
  if (!await isStaffAuthorized(interaction.client, interaction.user.id, staffRoles)) {
    return interaction.reply({ ...buildText("Unauthorized."), ephemeral: true });
  }
  const sub = interaction.options.getSubcommand();
  try {
    const db = getDb();
    if (sub === "earning") {
      const mode = interaction.options.getString("mode");
      const flatMiles = interaction.options.getInteger("flat_miles");
      const updates = { mode, lastUpdated: new Date() };
      if (flatMiles !== null) updates.flatMiles = flatMiles;
      await db.collection("config").doc("earningRules").set(updates, true);
      return interaction.reply({ ...buildText(`Earning rules updated: mode=${mode}`), ephemeral: true });
    }
    if (sub === "daily") {
      const miles = interaction.options.getInteger("miles");
      const streakBonus = interaction.options.getInteger("streak_bonus");
      const updates = { lastUpdated: new Date() };
      if (miles !== null) updates.dailyMiles = miles;
      if (streakBonus !== null) updates.streakBonus = streakBonus;
      await db.collection("config").doc("dailyRewards").set(updates, true);
      return interaction.reply({ ...buildText("Daily rewards updated."), ephemeral: true });
    }
    if (sub === "log-channel") {
      const channel = interaction.options.getChannel("channel");
      await db.collection("config").doc("logChannels").set({ mileageLog: channel.id, lastUpdated: new Date() }, true);
      return interaction.reply({ ...buildText(`Log channel set to ${channel.name}.`), ephemeral: true });
    }
    if (sub === "staff-role") {
      const role = interaction.options.getRole("role");
      await db.collection("config").doc("staffRoles").set({ mileageStaff: role.id, lastUpdated: new Date() }, true);
      return interaction.reply({ ...buildText(`Staff role set to ${role.name}.`), ephemeral: true });
    }
    if (sub === "view") {
      const earning = (await db.collection("config").doc("earningRules").get()).data();
      const daily = (await db.collection("config").doc("dailyRewards").get()).data();
      const lines = [
        "**Configuration**",
        "",
        `**Earning Mode:** ${earning?.mode || "distance"}`,
        `**Flat Miles:** ${earning?.flatMiles || "N/A"}`,
        `**Daily Miles:** ${daily?.dailyMiles || "N/A"}`,
        `**Streak Bonus:** ${daily?.streakBonus || "N/A"}`,
      ];
      return interaction.reply({ ...buildText(lines.join("\n")), ephemeral: true });
    }
  } catch (e) {
    return interaction.reply({ ...buildText(`Failed: ${e.message}`), ephemeral: true });
  }
}

export default { data, execute };