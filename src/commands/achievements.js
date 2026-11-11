/**
 * /achievements — View member achievements
 */
import { SlashCommandBuilder } from "discord.js";
import { getMemberAccount } from "../services/members.js";
import { listAchievements, checkAchievements } from "../services/achievements.js";
import { buildMessage, buildText } from "../utils/builders.js";
import { ACCENT } from "../config/brand.js";

export const data = new SlashCommandBuilder()
  .setName("achievements")
  .setDescription("View your achievements")
  .addUserOption(o => o.setName("user").setDescription("Another member"));

export async function execute(interaction) {
  const target = interaction.options.getUser("user") || interaction.user;
  try {
    const account = await getMemberAccount(target.id);
    await checkAchievements(target.id, account);
    const achievements = await listAchievements(target.id);
    const lines = [
      `**Achievements — ${target.displayName}**`,
      "",
      `Unlocked: ${achievements.length}`,
      "",
      ...achievements.slice(0, 15).map(a => `* ${a.name} — ${a.description}`)
    ];
    return interaction.reply({
      ...buildMessage({ accentColor: ACCENT.BRAND_NAVY, text: [lines.join("\n")] }),
      ephemeral: true
    });
  } catch (e) {
    return interaction.reply({ ...buildText(`Not registered. Use /sign-up first.`), ephemeral: true });
  }
}

export default { data, execute };