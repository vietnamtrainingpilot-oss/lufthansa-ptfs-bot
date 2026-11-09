/**
 * /daily — Daily check-in & streak rewards (AeroNexus 11.2).
 */
import { SlashCommandBuilder } from "discord.js";
import * as streaks from "../services/streaks.js";
import { buildText, buildMessage } from "../utils/builders.js";
import { ACCENT } from "../config/brand.js";

export const data = new SlashCommandBuilder()
  .setName("daily")
  .setDescription("Claim your daily check-in reward");

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const result = await streaks.claimDailyReward(interaction.user.id);
    if (!result.ok) {
      return interaction.editReply({ ...buildText(result.reason), ephemeral: true });
    }
    return interaction.editReply({
      ...buildMessage({
        accentColor: ACCENT.SUCCESS,
        text: [
          `Daily Check-in Complete!\n\n` +
          `Day ${result.streakDays} streak.\n` +
          `Earned ${result.pointsAwarded} Miles and ${result.creditsAwarded} Credits.\n\n` +
          `Keep it up for bigger bonuses!`
        ]
      }),
      ephemeral: true,
    });
  } catch (e) {
    return interaction.editReply({ ...buildText(`Error: ${e.message}`), ephemeral: true });
  }
}

export default { data, execute };