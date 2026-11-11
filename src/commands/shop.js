/**
 * /shop — Browse and redeem rewards
 */
import { SlashCommandBuilder } from "discord.js";
import { getMemberAccount } from "../services/members.js";
import { buildMessage, buildText } from "../utils/builders.js";
import { ACCENT } from "../config/brand.js";
import { getDb } from "../services/firestore.js";

export const data = new SlashCommandBuilder()
  .setName("shop")
  .setDescription("Browse Miles & More rewards");

export async function execute(interaction) {
  try {
    await getMemberAccount(interaction.user.id);
    
    const db = getDb();
    const snap = await db.collection("rewardsCatalog").get();
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    
    if (items.length === 0) return interaction.reply({ ...buildText("No rewards available."), ephemeral: true });
    
    const lines = ["**Miles & More Rewards Shop**", "", ...items.slice(0, 8).map(r => 
      `* ${r.name} — ${r.price.toLocaleString()} miles`
    )];
    
    return interaction.reply({
      ...buildMessage({ accentColor: ACCENT.DEFAULT, text: [lines.join("\n")] }),
      ephemeral: true
    });
  } catch (e) {
    return interaction.reply({ ...buildText(`Not registered. Use /sign-up first.`), ephemeral: true });
  }
}

export default { data, execute };