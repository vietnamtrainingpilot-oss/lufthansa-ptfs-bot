/**
 * /miles — View Miles & More account summary
 */
import { SlashCommandBuilder } from "discord.js";
import { getMemberAccount, TIERS, getTierProgress } from "../services/members.js";
import { buildMessage, buildText } from "../utils/builders.js";
import { ACCENT } from "../config/brand.js";

export const data = new SlashCommandBuilder()
  .setName("miles")
  .setDescription("View your Miles & More account")
  .addUserOption(o => o.setName("user").setDescription("View another member's account"));

export async function execute(interaction) {
  const target = interaction.options.getUser("user") || interaction.user;
  try {
    const account = await getMemberAccount(target.id);
    const tier = account.membership?.tier || "Frequent Traveller";
    const progress = getTierProgress(tier);

    const lines = [
      `**Miles & More Account** — ${target.displayName}`,
      ``,
      `**Tier:** ${tier}`,
      `**Award Miles:** ${account.awards?.awardMiles?.balance?.toLocaleString() || 0}`,
      `**Lifetime Earned:** ${account.awards?.awardMiles?.lifetimeEarned?.toLocaleString() || 0}`,
      `**Lifetime Spent:** ${account.awards?.awardMiles?.lifetimeSpent?.toLocaleString() || 0}`,
      ``,
      `**Status Points:** ${account.membership?.statusPoints?.toLocaleString() || 0} / ${progress.target}`,
      `**Qualifying Points:** ${account.membership?.qualifyingPoints?.toLocaleString() || 0}`,
      `**HON Circle Points:** ${account.membership?.honPoints?.toLocaleString() || 0}`,
      ``,
      `**Total Flights:** ${account.history?.totalFlights || 0}`,
      `**Next Tier:** ${progress.nextTier || "Maximum"}`,
    ];

    return interaction.reply({
      ...buildMessage({ accentColor: ACCENT.BRAND_NAVY, text: [lines.join("\n")] }),
      ephemeral: true
    });
  } catch (e) {
    return interaction.reply({ ...buildText(`Account not found. Use /sign-up to register.`), ephemeral: true });
  }
}

export default { data, execute };