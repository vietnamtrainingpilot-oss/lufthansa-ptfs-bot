/**
 * rewardsInteractions.js — VietJet Rewards interaction handlers.
 */

import rewardsService from "../services/rewards.js";
import { buildText } from "../utils/builders.js";

/**
 * Handle the rewards leaderboard select menu.
 *
 * The leaderboard service returns { rank, userId, value, tierName } — reading
 * a.id / a.balance / a.level here would render "<@!undefined> - undefined",
 * so the row shape must match the service exactly.
 */
export async function handleRewardsInteraction(interaction, client) {
  if (interaction.customId !== "rewards_leaderboard") return;

  const leaderboard = await rewardsService.getLeaderboard(10);

  const lines = leaderboard
    .map((row) => `**${row.rank}.** <@!${row.userId}> — ${row.value} (${row.tierName})`)
    .join("\n");

  return interaction.reply({
    ...buildText(`## VietJet Rewards Leaderboard\n\n${lines || "No entries yet."}`),
    ephemeral: true,
  });
}

export default { handleRewardsInteraction };