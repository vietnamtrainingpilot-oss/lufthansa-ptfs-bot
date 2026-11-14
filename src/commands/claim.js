/**
 * /claim — Claim flight miles with code
 */
import { SlashCommandBuilder } from "discord.js";
import { claimFlight } from "../services/mileageSystem.js";
import { getOrCreateAccount } from "../services/members.js";
import { buildMessage, buildText } from "../utils/builders.js";
import { ACCENT } from "../config/brand.js";
import { breakdownText } from "../services/mileageEngine.js";

export const data = new SlashCommandBuilder()
  .setName("claim")
  .setDescription("Claim flight miles with your code")
  .addStringOption(o => o.setName("code").setDescription("Flight claim code").setRequired(true))
  .addStringOption(o => o.setName("cabin").setDescription("Cabin class").setRequired(false)
    .addChoices(
      { name: "Economy", value: "economy" },
      { name: "Premium Economy", value: "premium_economy" },
      { name: "Business", value: "business" },
      { name: "First", value: "first" }
    ));

export async function execute(interaction) {
  const code = interaction.options.getString("code");
  const cabin = interaction.options.getString("cabin") || "economy";
  try {
    // Ensure both legacy member doc and ledger account exist
    await getOrCreateAccount(interaction.user.id);
    const result = await claimFlight({ code, cabin, memberId: interaction.user.id });
    const breakdown = breakdownText(result, interaction.user.id);
    return interaction.reply({
      ...buildMessage({
        accentColor: ACCENT.SUCCESS,
        text: [`Flight claimed successfully!\n\n${breakdown}`]
      }),
      ephemeral: true
    });
  } catch (e) {
    return interaction.reply({ ...buildText(`Failed: ${e.message}`), ephemeral: true });
  }
}

export default { data, execute };