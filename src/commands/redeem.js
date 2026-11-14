/**
 * /redeem — Redeem miles for rewards
 */
import { SlashCommandBuilder } from "discord.js";
import { readAccount } from "../services/ledger.js";
import { listRewards, getReward, redeem } from "../services/redemptions.js";
import { buildText } from "../utils/builders.js";

export const data = new SlashCommandBuilder()
  .setName("redeem")
  .setDescription("Redeem Award Miles for a reward")
  .addStringOption(o => o.setName("reward").setDescription("Reward name").setRequired(true));

export async function execute(interaction) {
  try {
    const rewardName = interaction.options.getString("reward");
    const rewards = await listRewards();
    const reward = rewards.find(r => r.name.toLowerCase() === rewardName.toLowerCase());
    if (!reward) return interaction.reply({ ...buildText(`Reward not found: ${rewardName}`), ephemeral: true });

    // Authoritative balance check via the ledger, matching the actual debit.
    const account = await readAccount(interaction.user.id);
    if (reward.price > account.balance) {
      return interaction.reply({
        ...buildText(`Insufficient miles. Need ${reward.price}, have ${account.balance}.`),
        ephemeral: true,
      });
    }

    const result = await redeem({ userId: interaction.user.id, rewardId: reward.id, client: interaction.client });
    return interaction.reply({ ...buildText(`Redemption submitted for **${reward.name}** (${reward.price.toLocaleString()} miles). Awaits staff fulfilment.`), ephemeral: true });
  } catch (e) {
    return interaction.reply({ ...buildText(`Error: ${e.message}`), ephemeral: true });
  }
}

export default { data, execute };