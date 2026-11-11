/**
 * /adjust — Staff mileage adjustments
 */
import { SlashCommandBuilder } from "discord.js";
import { getDb } from "../services/firestore.js";
import { isStaffAuthorized } from "../utils/permissions.js";
import config from "../config/config.js";
import { buildText } from "../utils/builders.js";

export const data = new SlashCommandBuilder()
  .setName("adjust")
  .setDescription("Adjust member miles (staff)")
  .addSubcommand(s => s.setName("add").setDescription("Add miles to a member")
    .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
    .addIntegerOption(o => o.setName("amount").setDescription("Amount to add").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true)))
  .addSubcommand(s => s.setName("remove").setDescription("Remove miles from a member")
    .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
    .addIntegerOption(o => o.setName("amount").setDescription("Amount to remove").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true)));

export async function execute(interaction) {
  const staffRoles = [config.roleBoardOfDirectors, config.roleManagementTeam];
  if (!await isStaffAuthorized(interaction.client, interaction.user.id, staffRoles)) {
    return interaction.reply({ ...buildText("Unauthorized."), ephemeral: true });
  }
  
  const sub = interaction.options.getSubcommand();
  const user = interaction.options.getUser("user");
  const amount = interaction.options.getInteger("amount");
  const reason = interaction.options.getString("reason");
  
  try {
    const db = getDb();
    const memberRef = db.collection("members").doc(user.id);
    const doc = await memberRef.get();
    
    if (!doc.exists) {
      return interaction.reply({ ...buildText(`Account not found for ${user.tag}.`), ephemeral: true });
    }
    
    const current = doc.data()?.awards?.awardMiles?.balance || 0;
    const newData = sub === "add" ? current + amount : Math.max(0, current - amount);
    
    await memberRef.update({
      "awards.awardMiles.balance": newData,
    });
    
    // Record transaction
    await db.collection("mileageLedger").add({
      userId: user.id,
      type: sub === "add" ? "earning" : "spending",
      transactionType: "adjustment",
      amount: sub === "add" ? amount : -amount,
      reason,
      adjustedBy: interaction.user.id,
      appliedAt: new Date(),
    });
    
    return interaction.reply({
      ...buildText(`${sub === "add" ? "Added" : "Removed"} ${amount.toLocaleString()} miles from ${user.tag}.\nNew balance: ${newData.toLocaleString()}`),
      ephemeral: true
    });
  } catch (e) {
    return interaction.reply({ ...buildText(`Failed: ${e.message}`), ephemeral: true });
  }
}

export default { data, execute };
