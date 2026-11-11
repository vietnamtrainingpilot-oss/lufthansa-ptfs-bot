/**
 * /premium — View tier benefits and status
 */
import { SlashCommandBuilder } from "discord.js";
import { getMemberAccount, TIERS, getTierProgress } from "../services/members.js";
import { buildMessage, buildText } from "../utils/builders.js";
import { ACCENT } from "../config/brand.js";

export const data = new SlashCommandBuilder()
  .setName("premium")
  .setDescription("View your membership tier and benefits");

export async function execute(interaction) {
  try {
    const account = await getMemberAccount(interaction.user.id);
    const tier = account.membership?.tier || "Frequent Traveller";
    const progress = getTierProgress(tier);
    const lines = [
      `**Miles & More Membership**`,
      ``,
      `**Current Tier:** ${tier}`,
      `**Status Points:** ${account.membership?.statusPoints || 0} / ${progress.target}`,
      ``,
      `**Benefits:**`,
      ...(TIERS[tier]?.benefits || []).map(b => `- ${b}`),
      ``,
      `**Next Tier Progress:**`,
      `${progress.nextTier || "Maximum"}: ${Math.max(0, progress.target - (account.membership?.statusPoints || 0))} points needed`
    ];
    return interaction.reply({
      ...buildMessage({ accentColor: ACCENT.BRAND_NAVY, text: [lines.join("\n")] }),
      ephemeral: true
    });
  } catch (e) {
    return interaction.reply({ ...buildText(`Not registered. Use /sign-up first.`), ephemeral: true });
  }
}

export default { data, execute };