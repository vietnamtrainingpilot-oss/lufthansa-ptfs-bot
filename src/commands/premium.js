/**
 * /premium — View premium member benefits and status
 */
import { SlashCommandBuilder } from "discord.js";
import { getMemberAccount, TIERS } from "../services/members.js";
import { buildMessage, buildText } from "../utils/builders.js";
import { ACCENT } from "../config/brand.js";

export const data = new SlashCommandBuilder()
  .setName("premium")
  .setDescription("View your membership tier and benefits");

export async function execute(interaction) {
  try {
    const account = await getMemberAccount(interaction.user.id);
    const tier = account.membership?.tier || "Frequent Traveller";
    const tierConfig = TIERS[tier] || TIERS["Frequent Traveller"];
    
    const lines = [
      `**Miles & More Membership**`,
      ``,
      `**Current Tier:** ${tier}`,
      `**Status Points:** ${account.membership?.statusPoints || 0} / ${tierConfig.statusPoints}`,
      ``,
      `**Benefits:**`,
      ...tierConfig.benefits.map(b => `- ${b}`),
      ``,
      `**Next Tier Progress:**`,
      `${getNextTier(tier)}: ${Math.max(0, getNextThreshold(tier) - (account.membership?.statusPoints || 0))} points needed`
    ];
    
    return interaction.reply({
      ...buildMessage({ accentColor: ACCENT.BRAND_NAVY, text: [lines.join("\n")] }),
      ephemeral: true
    });
  } catch (e) {
    return interaction.reply({ ...buildText(`Not registered. Use /sign-up first.`), ephemeral: true });
  }
}

function getNextTier(current) {
  if (current === "Frequent Traveller") return "Senator";
  if (current === "Senator") return "HON Circle";
  return "Maximum Tier";
}

function getNextThreshold(current) {
  if (current === "Frequent Traveller") return TIERS.Senator.statusPoints;
  if (current === "Senator") return TIERS["HON Circle"].statusPoints;
  return Infinity;
}

export default { data, execute };