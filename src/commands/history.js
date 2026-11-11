/**
 * /history — View transaction history
 */
import { SlashCommandBuilder } from "discord.js";
import { getMemberAccount } from "../services/members.js";
import { getDb } from "../services/firestore.js";
import { buildText } from "../utils/builders.js";
import config from "../config/config.js";

export const data = new SlashCommandBuilder()
  .setName("history")
  .setDescription("View your mileage history")
  .addIntegerOption(o => o.setName("page").setDescription("Page number").setRequired(false));

export async function execute(interaction) {
  const page = interaction.options.getInteger("page") || 0;
  const userId = interaction.user.id;
  
  try {
    await getMemberAccount(userId);
    
    const db = getDb();
    const snapshots = await Promise.all([
      db.collection("mileageLedger").where("userId", "==", userId).orderBy("appliedAt", "DESC").limit(10).get(),
      db.collection("claims").where("member.userId", "==", userId).orderBy("claimedAt", "DESC").limit(10).get(),
    ]);
    
    const [ledgerSnap, claimSnap] = snapshots;
    const entries = [];
    
    ledgerSnap.docs.forEach(d => entries.push({ type: d.data().type, amount: d.data().amount, reason: d.data().reason }));
    claimSnap.docs.forEach(d => entries.push({ type: "flight", amount: d.data().statusPoints, reason: `Flight ${d.data().flightId}` }));
    
    entries.sort((a, b) => (b.amount || 0) - (a.amount || 0)).slice(0, 20);
    
    if (entries.length === 0) return interaction.reply({ ...buildText("No history yet."), ephemeral: true });
    
    const lines = ["**Transaction History**", "", ...entries.slice(0, 10).map(e => 
      `${e.type}: ${e.reason} (+${e.amount || 0})`
    )];
    
    return interaction.reply({ ...buildText(lines.join("\n")), ephemeral: true });
  } catch (e) {
    return interaction.reply({ ...buildText(`Error: ${e.message}`), ephemeral: true });
  }
}

export default { data, execute };