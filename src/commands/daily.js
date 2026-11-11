/**
 * /daily — Claim daily check-in
 */
import { SlashCommandBuilder } from "discord.js";
import { claimDaily } from "../services/dailyRewards.js";
import { buildText, buildMessage } from "../utils/builders.js";
import { ACCENT } from "../config/brand.js";

export const data = new SlashCommandBuilder()
  .setName("daily")
  .setDescription("Claim your daily check-in reward");

export async function execute(interaction) {
  try {
    const result = await claimDaily(interaction.user.id);
    return interaction.reply({
      ...buildMessage({
        accentColor: ACCENT.SUCCESS,
        text: [`Daily Check-in Complete!\n\nDay ${result.streak} streak.\nEarned ${result.totalMiles} Award Miles.\n\nKeep it up for bigger bonuses!`]
      }),
      ephemeral: true
    });
  } catch (e) {
    return interaction.reply({ ...buildText(`Error: ${e.message}`), ephemeral: true });
  }
}

export default { data, execute };