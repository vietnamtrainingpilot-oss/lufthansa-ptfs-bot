/**
 * /history — View transaction history
 */
import { SlashCommandBuilder } from "discord.js";
import { getMemberAccount } from "../services/members.js";
import { getDb } from "../services/firestore.js";
import { buildText } from "../utils/builders.js";

export const data = new SlashCommandBuilder()
  .setName("history")
  .setDescription("View your mileage history")
  .addIntegerOption(o => o.setName("page").setDescription("Page number").setRequired(false));

export async function execute(interaction) {
  const page = interaction.options.getInteger("page") || 0;
  try {
    const account = await getMemberAccount(interaction.user.id);
    const db = getDb();
    const ledgerSnap = await db.collection("mileageLedger").where("userId", "==", interaction.user.id).orderBy("appliedAt", "desc").limit(20).get();
    const entries = ledgerSnap.docs.map(d => d.data());
    if (entries.length === 0) return interaction.reply({ ...buildText("No history yet."), ephemeral: true });
    const lines = ["**Transaction History**", "", ...entries.slice(0, 10).map(e =>
      `${e.type === "earning" ? "+" : "-"}${e.amount?.toLocaleString() || 0} — ${e.reason}`
    )];
    return interaction.reply({ ...buildText(lines.join("\n")), ephemeral: true });
  } catch (e) {
    return interaction.reply({ ...buildText(`Error: ${e.message}`), ephemeral: true });
  }
}

export default { data, execute };