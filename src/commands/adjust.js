/**
 * /adjust — Staff mileage adjustments
 */
import { SlashCommandBuilder } from "discord.js";
import { getDb } from "../services/firestore.js";
import { isStaffAuthorized } from "../utils/permissions.js";
import config from "../config/config.js";
import { buildText } from "../utils/builders.js";
import { applyLedgerEntry, TX_TYPE, readAccount } from "../services/ledger.js";

export const data = new SlashCommandBuilder()
  .setName("adjust")
  .setDescription("Adjust member miles (staff)")
  .addSubcommand(s => s.setName("add").setDescription("Add miles")
    .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
    .addIntegerOption(o => o.setName("amount").setDescription("Amount").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason").setRequired(true)))
  .addSubcommand(s => s.setName("remove").setDescription("Remove miles")
    .addUserOption(o => o.setName("user").setDescription("Member").setRequired(true))
    .addIntegerOption(o => o.setName("amount").setDescription("Amount").setRequired(true))
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

  if (!Number.isInteger(amount) || amount <= 0) {
    return interaction.reply({ ...buildText("Amount must be a positive whole number."), ephemeral: true });
  }

  try {
    if (sub !== "add" && sub !== "remove") {
      return interaction.reply({ ...buildText("Unknown subcommand."), ephemeral: true });
    }
    // Authoritative ledger update first
    const signedAmount = sub === "add" ? amount : -amount;
    const result = await applyLedgerEntry({
      userId: user.id,
      currency: "points",
      amount: signedAmount,
      type: sub === "add" ? TX_TYPE.STAFF_AWARD : TX_TYPE.STAFF_DEDUCT,
      reason: `Staff adjustment: ${reason}`,
      idempotencyKey: `adjust_${sub}_${user.id}_${amount}_${interaction.user.id}`,
      actorId: interaction.user.id,
      referenceType: "staff",
      metadata: { staffInitiated: true },
      lifetime: { pointsDelta: sub === "add" ? amount : 0 },
    });

    if (result.duplicate) {
      return interaction.reply({ ...buildText("This adjustment was already processed."), ephemeral: true });
    }

    // Sync legacy member record for backward compatibility
    const db = getDb();
    const memberDoc = await db.collection("members").doc(user.id).get();
    const currentBalance = memberDoc.exists ? (memberDoc.data()?.awards?.awardMiles?.balance || 0) : 0;
    const newBalance = sub === "add" ? currentBalance + amount : Math.max(0, currentBalance - amount);

    await db.collection("members").doc(user.id).set({
      userId: user.id,
      awards: {
        awardMiles: {
          balance: newBalance,
          lifetimeEarned: (memberDoc.data()?.awards?.awardMiles?.lifetimeEarned || 0) + (sub === "add" ? amount : 0),
          lifetimeSpent: (memberDoc.data()?.awards?.awardMiles?.lifetimeSpent || 0) + (sub === "add" ? 0 : amount),
        }
      },
    }, { merge: true });

    return interaction.reply({ ...buildText(`${sub === "add" ? "Added" : "Removed"} ${amount.toLocaleString()} miles. New balance: ${newBalance.toLocaleString()}`), ephemeral: true });
  } catch (e) {
    return interaction.reply({ ...buildText(`Failed: ${e.message}`), ephemeral: true });
  }
}

export default { data, execute };