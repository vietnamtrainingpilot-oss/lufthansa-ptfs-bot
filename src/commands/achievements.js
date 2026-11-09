/**
 * /achievements — Milestone & badge system (AeroNexus 11.5).
 *
 * Subcommands:
 *  - profile: view your unlocked achievements
 *  - list: view the achievement catalogue
 *  - grant: staff-only manual grant
 */
import { SlashCommandBuilder } from "discord.js";
import { isStaffAuthorized } from "../utils/permissions.js";
import * as achievements from "../services/achievements.js";
import { buildText, buildMessage } from "../utils/builders.js";
import { ACCENT } from "../config/brand.js";

export const data = new SlashCommandBuilder()
  .setName("achievements")
  .setDescription("View and manage achievements")
  .addSubcommand((s) =>
    s
      .setName("profile")
      .setDescription("View your unlocked achievements")
      .addUserOption((o) => o.setName("user").setDescription("Member to look up (defaults to you)"))
  )
  .addSubcommand((s) =>
    s
      .setName("list")
      .setDescription("View the achievement catalogue")
  )
  .addSubcommand((s) =>
    s
      .setName("grant")
      .setDescription("Manually grant an achievement (staff only)")
      .addUserOption((o) => o.setName("user").setDescription("Member to grant to").setRequired(true))
      .addStringOption((o) => o.setName("achievement").setDescription("Achievement ID").setRequired(true))
  );

export async function execute(interaction, client) {
  const sub = interaction.options.getSubcommand();

  if (sub === "profile") {
    const user = interaction.options.getUser("user") || interaction.user;
    const list = await achievements.getMemberAchievements(user.id);
    const unlocked = list.filter((a) => a.unlocked);
    const locked = list.filter((a) => !a.unlocked);

    const lines = [
      `**${user.username}** — ${unlocked.length}/${list.length} achievements unlocked`,
      "",
      "Unlocked:",
      ...unlocked.slice(0, 8).map((a) => `  - ${a.title}`),
      "",
      "Remaining:",
      ...locked.slice(0, 8).map((a) => `  · ${a.title}`),
    ];

    return interaction.reply({
      ...buildMessage({ accentColor: ACCENT.DEFAULT, text: [lines.join("\n")] }),
    });
  }

  if (sub === "list") {
    const list = await achievements.listAchievements();
    const lines = list.map((a) => `${a.title} — ${a.description}`).join("\n");
    return interaction.reply({
      ...buildMessage({ accentColor: ACCENT.DEFAULT, text: [`Achievement Catalogue (${list.length} total)\n\n${lines}`] }),
    });
  }

  if (sub === "grant") {
    if (!(await isStaffAuthorized(client, interaction.user.id))) {
      return interaction.reply({ ...buildText("You do not have permission to grant achievements."), ephemeral: true });
    }
    const user = interaction.options.getUser("user");
    const achId = interaction.options.getString("achievement");
    try {
      const result = await achievements.unlockAchievement({
        userId: user.id,
        achievementId: achId,
        actorId: interaction.user.id,
      });
      return interaction.reply(buildText(`Granted ${result.achievement.title} to ${user.username}.`));
    } catch (e) {
      return interaction.reply({ ...buildText(`Failed: ${e.message}`), ephemeral: true });
    }
  }
}

export default { data, execute };