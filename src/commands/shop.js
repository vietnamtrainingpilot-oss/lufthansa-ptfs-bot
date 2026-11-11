/**
 * /shop — Browse rewards catalog
 */
import { SlashCommandBuilder } from "discord.js";
import { listRewards } from "../services/redemptions.js";
import { buildMessage, buildText } from "../utils/builders.js";
import { ACCENT } from "../config/brand.js";

export const data = new SlashCommandBuilder()
  .setName("shop")
  .setDescription("Browse Miles & More rewards");

export async function execute(interaction) {
  try {
    const rewards = await listRewards();
    if (rewards.length === 0) return interaction.reply({ ...buildText("No rewards available."), ephemeral: true });
    const lines = ["**Miles & More Rewards Shop**", "", ...rewards.slice(0, 15).map(r =>
      `* ${r.name} — ${r.price.toLocaleString()} miles`
    )];
    return interaction.reply({
      ...buildMessage({ accentColor: ACCENT.DEFAULT, text: [lines.join("\n")] }),
      ephemeral: true
    });
  } catch (e) {
    return interaction.reply({ ...buildText(`Error: ${e.message}`), ephemeral: true });
  }
}

export default { data, execute };