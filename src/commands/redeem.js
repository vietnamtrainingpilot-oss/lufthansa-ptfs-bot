/**
 * /redeem — Redeem miles for rewards
 */
import { SlashCommandBuilder } from "discord.js";
import { getMemberAccount } from "../services/members.js";
import { listRewards, getReward, redeem } from "../services/redemptions.js";
import { buildText } from "../utils/builders.js";

export const data = new SlashCommandBuilder()
  .setName("redeem")
  .setDescription("Redeem Award Miles for a reward")
  .addStringOption(o => o.setName("reward").setDescription("Reward name").setRequired(true));

export async function execute(interaction) {
  try {
    const account = await getMemberAccount(interaction.user.id);
    const rewardName = interaction.options.getString("reward");
    const rewards = await listRewards();
    const reward = rewards.find(r => r.name.toLowerCase() === rewardName.toLowerCase());
    if (!reward) return interaction.reply({ ...buildText(`Reward not found: ${rewardName}`), ephemeral: true });
    const balance = account.awards?.awardMiles?.balance || 0;
    if (reward.price > balance) return interaction.reply({ ...buildText(`Insufficient miles. Need ${reward.price}, have ${balance}.`), ephemeral: true });
    const result = await redeem({ userId: interaction.user.id, rewardId: reward.id, client: interaction.client });
    return interaction.reply({ ...buildText(`Redemption submitted for **${reward.name}** (${reward.price.toLocaleString()} miles). Awaits staff fulfilment.`), ephemeral: true });
  } catch (e) {
    return interaction.reply({ ...buildText(`Error: ${e.message}`), ephemeral: true });
  }
}

export default { data, execute };