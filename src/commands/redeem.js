/**
 * /redeem — Redeem miles for rewards
 */
import { SlashCommandBuilder } from "discord.js";
import { getMemberAccount } from "../services/members.js";
import { getDb } from "../services/firestore.js";
import { buildText } from "../utils/builders.js";
import config from "../config/config.js";

export const data = new SlashCommandBuilder()
  .setName("redeem")
  .setDescription("Redeem Award Miles for a reward")
  .addStringOption(o => o.setName("reward").setDescription("Reward name").setRequired(true))
  .addIntegerOption(o => o.setName("amount").setDescription("Amount of miles to spend").setRequired(false));

export async function execute(interaction) {
  try {
    const account = await getMemberAccount(interaction.user.id);
    const rewardName = interaction.options.getString("reward");
    const amount = interaction.options.getInteger("amount");
    
    const db = getDb();
    const snap = await db.collection("rewardsCatalog").where("name", "==", rewardName).limit(1).get();
    
    if (snap.empty) return interaction.reply({ ...buildText("Reward not found."), ephemeral: true });
    
    const reward = snap.docs[0].data();
    const price = amount || reward.price;
    const balance = account.awards?.awardMiles?.balance || 0;
    
    if (price > balance) {
      return interaction.reply({ ...buildText(`Insufficient miles. Need ${price}, have ${balance}.`), ephemeral: true });
    }
    
    // Create redemption record
    const redemId = db.collection("redemptions").doc().id;
    await db.collection("redemptions").doc(redemId).set({
      userId: interaction.user.id,
      itemId: snap.docs[0].id,
      status: "pending",
      reward: { name: reward.name, price },
      createdAt: new Date(),
    });
    
    // Deduct miles (in real system, this would be transactional)
    await db.collection("members").doc(interaction.user.id).update({
      "awards.awardMiles.balance": balance - price,
      "awards.awardMiles.lifetimeSpent": (account.awards?.awardMiles?.lifetimeSpent || 0) + price
    });
    
    return interaction.reply({
      ...buildText(`Redemption submitted for **${reward.name}** (${price.toLocaleString()} miles). Awaits staff fulfilment.`),
      ephemeral: true
    });
  } catch (e) {
    return interaction.reply({ ...buildText(`Error: ${e.message}`), ephemeral: true });
  }
}

export default { data, execute };