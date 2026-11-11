/**
 * /claim — Claim flight mileage with code
 */
import { SlashCommandBuilder } from "discord.js";
import { claimFlight } from "../services/mileageSystem.js";
import { getOrCreateAccount } from "../services/members.js";
import { buildText, buildMessage } from "../utils/builders.js";
import { ACCENT } from "../config/brand.js";

export const data = new SlashCommandBuilder()
  .setName("claim")
  .setDescription("Claim flight miles with your code")
  .addStringOption(o => o.setName("code").setDescription("Flight claim code").setRequired(true))
  .addStringOption(o => o.setName("cabin").setDescription("Cabin class").setRequired(false)
    .addChoices(
      { name: "Economy", value: "economy" },
      { name: "Premium Economy", value: "premium" },
      { name: "Business", value: "business" }
    ));

export async function execute(interaction) {
  const code = interaction.options.getString("code");
  const cabin = interaction.options.getString("cabin") || "economy";
  
  try {
    await getOrCreateAccount(interaction.user.id);
    const result = await claimFlight({ 
      claimCode: code, 
      code, 
      cabin,
      claimedAt: new Date(),
      member: interaction.user,
      client: interaction.client
    });
    
    return interaction.reply({
      ...buildMessage({
        accentColor: ACCENT.SUCCESS,
        text: [`Flight claimed! Code: ${code}`]
      }),
      ephemeral: true
    });
  } catch (e) {
    return interaction.reply({
      ...buildText(`Failed: ${e.message}`),
      ephemeral: true
    });
  }
}

export default { data, execute };