/**
 * /history — View transaction history
 */
import { SlashCommandBuilder } from "discord.js";
import { getMemberHistory } from "../services/rewards.js";
import { buildText } from "../utils/builders.js";

export const data = new SlashCommandBuilder()
  .setName("history")
  .setDescription("View your mileage history")
  .addIntegerOption(o => o.setName("page").setDescription("Page number (0-indexed)").setRequired(false));

export async function execute(interaction) {
  const page = interaction.options.getInteger("page") || 0;
  try {
    const history = await getMemberHistory(interaction.user.id, { limit: 20 });
    if (!history || history.length === 0) return interaction.reply({ ...buildText("No history yet."), ephemeral: true });
    const entries = history.slice(0, 10);
    const lines = ["**Transaction History**", "", ...entries.map(e =>
      `${e.amount >= 0 ? "+" : ""}${e.amount?.toLocaleString() || 0} ${e.currency === 'credits' ? 'Credits' : 'Miles'} — ${e.reason}`
    )];
    return interaction.reply({ ...buildText(lines.join("\n")), ephemeral: true });
  } catch (e) {
    return interaction.reply({ ...buildText(`Error: ${e.message}`), ephemeral: true });
  }
}

export default { data, execute };